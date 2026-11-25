// Spec 003 · Evaluación de la IA con PDF reales (tarea 5.6 del plan).
//
//   pnpm --filter @inquilinus/api evaluar:lectura <carpeta> [modelo] [--lote]
//
// Sin --lote, lee las facturas una a una y, si Bedrock frena por cuota, espera 20 s y
// reintenta: mide solo la calidad de la lectura. Con --lote, las lee todas como un solo
// lote, igual que la app (R12: 3 a la vez, reintentos dentro de los 60 s y tope de
// 2 minutos), y además mide el tiempo del lote.
//
// La carpeta (fuera del repositorio) tiene los PDF y `esperado.csv`, separado por
// punto y coma: fichero;inicio;fin;importe;tipo. Fechas DD/MM/AAAA o AAAA-MM-DD;
// importe en euros como en la factura (87,45). Los tipos de gasto que se dan a la
// IA son los que aparecen en la columna `tipo`, como los de un inmueble.
//
// Cada PDF se lee igual que en producción: Claude en Amazon Bedrock, en la UE
// (R10b), con el límite de 60 s y la misma normalización. Por pantalla solo sale
// si acierta o no y el tipo de fallo, nunca lo que dice la factura (docs/rgpd.md).
// El detalle, con los valores, queda en `resultado.csv` dentro de la misma carpeta.
import { normalizarLectura, type LecturaFactura } from "@inquilinus/domain";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { crearExtractorBedrockAws } from "../src/extractor-bedrock.ts";
import { AJUSTES_LECTURA, leerConLimite, leerConReintentos, leerEnTandas } from "../src/extractor.ts";

const MODELO_POR_DEFECTO = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";
/** Spec 003: periodo e importe bien en al menos el 90 % de las facturas. */
const OBJETIVO = 0.9;

interface Esperado {
  fichero: string;
  inicio: string;
  fin: string;
  importe: number | null;
  tipo: string;
}

/** DD/MM/AAAA o AAAA-MM-DD → AAAA-MM-DD. */
function fecha(texto: string, fila: number): string {
  const limpio = texto.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpio);
  if (iso) return limpio;
  const es = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(limpio);
  if (es) return `${es[3]}-${es[2]!.padStart(2, "0")}-${es[1]!.padStart(2, "0")}`;
  throw new Error(`Fila ${fila}: fecha no válida`);
}

/**
 * "1.234,56 €", "87,45" o "87.45" → céntimos. Un 0 es una factura que sale a 0 €: la app
 * no admite importes de 0 (spec 003), así que lo correcto es que la IA lo deje vacío (null).
 */
function centimos(texto: string, fila: number): number | null {
  let limpio = texto.replace(/[€\s]/g, "");
  if (limpio.includes(",")) limpio = limpio.replace(/\./g, "").replace(",", ".");
  const valor = Math.round(Number(limpio) * 100);
  if (!Number.isSafeInteger(valor) || valor < 0) throw new Error(`Fila ${fila}: importe no válido`);
  return valor === 0 ? null : valor;
}

function leerEsperado(csv: string): Esperado[] {
  const lineas = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  return lineas.slice(1).map((linea, n) => {
    const [fichero = "", inicio = "", fin = "", importe = "", tipo = ""] = linea.split(";");
    const fila = n + 2;
    if (!fichero.trim() || !tipo.trim()) throw new Error(`Fila ${fila}: faltan datos`);
    return {
      fichero: fichero.trim(),
      inicio: fecha(inicio, fila),
      fin: fecha(fin, fila),
      importe: centimos(importe, fila),
      tipo: tipo.trim(),
    };
  });
}

const dias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** Qué ha fallado, sin dar los valores. */
function fallos(esperado: Esperado, leido: { inicio: string | null; fin: string | null; importe: number | null; tipo: string | null }) {
  const lista: string[] = [];
  if (!leido.inicio || !leido.fin) lista.push("periodo vacío");
  else {
    if (leido.inicio !== esperado.inicio) lista.push(`inicio ${dias(leido.inicio, esperado.inicio)} d`);
    if (leido.fin !== esperado.fin) lista.push(`fin ${dias(leido.fin, esperado.fin)} d`);
  }
  if (esperado.importe === null) {
    if (leido.importe !== null) lista.push("importe leído en una factura de 0 €");
  } else if (leido.importe === null) lista.push("importe vacío");
  else if (leido.importe !== esperado.importe) {
    lista.push(`importe ${(((leido.importe - esperado.importe) / esperado.importe) * 100).toFixed(1)} %`);
  }
  if (leido.tipo?.toLocaleLowerCase("es") !== esperado.tipo.toLocaleLowerCase("es")) {
    lista.push(leido.tipo ? "tipo distinto" : "tipo vacío");
  }
  return lista;
}

const argumentos = process.argv.slice(2);
const comoLote = argumentos.includes("--lote");
const [carpetaIndicada, modelo = MODELO_POR_DEFECTO] = argumentos.filter((a) => a !== "--lote");
if (!carpetaIndicada) throw new Error("Uso: evaluar:lectura <carpeta> [modelo] [--lote]");
const carpeta: string = carpetaIndicada;
const entorno = process.env;
const extractor = crearExtractorBedrockAws({
  region: entorno["APP_BEDROCK_REGION"] ?? entorno["APP_AWS_REGION"] ?? "",
  modelo,
  idClave: entorno["APP_AWS_ACCESS_KEY_ID"] ?? "",
  claveSecreta: entorno["APP_AWS_SECRET_ACCESS_KEY"] ?? "",
});

/** Excel en español puede guardar el CSV en Windows-1252 en lugar de UTF-8. */
function texto(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const esperados = leerEsperado(texto(await readFile(join(carpeta, "esperado.csv"))));
const tipos = [...new Set(esperados.map((e) => e.tipo))];
const tiposConId = tipos.map((nombre, i) => ({ id: String(i), nombre }));
console.log(
  `Modelo: ${modelo} · ${esperados.length} facturas · tipos: ${tipos.join(", ")}` +
    (comoLote ? ` · como un lote (${AJUSTES_LECTURA.aLaVez} a la vez)` : "") +
    "\n",
);

interface Resultado {
  leido: { inicio: string | null; fin: string | null; importe: number | null; tipo: string | null };
  error: string | null;
  segundos: number;
}
const vacio = { inicio: null, fin: null, importe: null, tipo: null };
let reintentosScript = 0;

/** Una lectura uno a uno: si Bedrock frena, espera 20 s y reintenta (hasta 5 veces). */
async function leerUnaAUna(pdf: Uint8Array): Promise<LecturaFactura> {
  for (let intento = 1; ; intento++) {
    try {
      return await leerConLimite(extractor, pdf, tipos);
    } catch (e) {
      if ((e as { codigo?: string }).codigo !== "HTTP_429" || intento >= 6) throw e;
      reintentosScript++;
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }
}

async function evaluar(esperado: Esperado): Promise<Resultado> {
  const inicioMs = performance.now();
  try {
    const pdf = await readFile(join(carpeta, esperado.fichero));
    const lectura = comoLote ? await leerConReintentos(extractor, pdf, tipos) : await leerUnaAUna(pdf);
    const propuesta = normalizarLectura(lectura, tiposConId);
    return {
      leido: {
        inicio: propuesta.inicio,
        fin: propuesta.fin,
        importe: propuesta.importe,
        tipo: propuesta.tipoGastoId === null ? null : tipos[Number(propuesta.tipoGastoId)]!,
      },
      error: null,
      segundos: (performance.now() - inicioMs) / 1000,
    };
  } catch (e) {
    // Solo el código o el tipo del error: el mensaje podría llevar texto de la factura.
    const error = (e as { codigo?: string }).codigo ?? (e instanceof Error ? (e.message === "LECTURA_LENTA" ? e.message : e.name) : "DESCONOCIDO");
    return { leido: vacio, error, segundos: (performance.now() - inicioMs) / 1000 };
  }
}

const resultados = new Map<Esperado, Resultado>();
const inicioLote = performance.now();
let sinEmpezar: Esperado[] = [];
if (comoLote) {
  sinEmpezar = await leerEnTandas(esperados, async (e) => void resultados.set(e, await evaluar(e)), AJUSTES_LECTURA);
} else {
  for (const e of esperados) resultados.set(e, await evaluar(e));
}
const segundosLote = (performance.now() - inicioLote) / 1000;

const filas: string[] = ["fichero;ok_periodo;ok_importe;ok_tipo;inicio_leido;fin_leido;importe_leido;tipo_leido;fallos"];
let periodoBien = 0;
let importeBien = 0;
let ambosBien = 0;
let tipoBien = 0;
let errores = 0;
for (const esperado of esperados) {
  const r = resultados.get(esperado) ?? { leido: vacio, error: "sin empezar: tope del lote", segundos: 0 };
  const { leido, error } = r;
  const okPeriodo = leido.inicio === esperado.inicio && leido.fin === esperado.fin;
  const okImporte = leido.importe === esperado.importe;
  const okTipo = leido.tipo?.toLocaleLowerCase("es") === esperado.tipo.toLocaleLowerCase("es");
  periodoBien += Number(okPeriodo);
  importeBien += Number(okImporte);
  ambosBien += Number(okPeriodo && okImporte);
  tipoBien += Number(okTipo);
  errores += Number(error !== null);
  const problemas = error ? [`error de lectura (${error})`] : fallos(esperado, leido);
  const marca = (ok: boolean) => (ok ? "✓" : "✗");
  console.log(
    `${esperado.fichero.padEnd(14)} periodo ${marca(okPeriodo)}  importe ${marca(okImporte)}  tipo ${marca(okTipo)}  ${r.segundos.toFixed(1)} s` +
      (problemas.length ? `  · ${problemas.join(", ")}` : ""),
  );
  filas.push(
    [esperado.fichero, okPeriodo, okImporte, okTipo, leido.inicio ?? "", leido.fin ?? "", leido.importe ?? "", leido.tipo ?? "", problemas.join(" / ")].join(";"),
  );
}

const total = esperados.length;
const pct = (n: number) => `${n}/${total} (${Math.round((n / total) * 100)} %)`;
if (reintentosScript > 0) console.log(`\nBedrock frenó por cuota ${reintentosScript} veces (HTTP 429); se reintentó tras 20 s.`);
if (comoLote) {
  console.log(`\nLote: ${segundosLote.toFixed(1)} s en total · errores de lectura: ${errores} · sin empezar por el tope: ${sinEmpezar.length}`);
}
console.log(`\nPeriodo: ${pct(periodoBien)} · Importe: ${pct(importeBien)} · Tipo: ${pct(tipoBien)}`);
console.log(`Periodo e importe a la vez: ${pct(ambosBien)} → ${ambosBien / total >= OBJETIVO ? "SUPERA" : "NO LLEGA A"} el 90 % de la spec 003`);
await writeFile(join(carpeta, "resultado.csv"), filas.join("\r\n") + "\r\n", "utf8");
console.log(`Detalle con los valores leídos: resultado.csv (en la carpeta de las facturas)`);
