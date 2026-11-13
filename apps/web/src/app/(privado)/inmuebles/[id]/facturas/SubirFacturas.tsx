"use client";
import type { PermisosSubida, ResultadoSubidaFacturas } from "@inquilinus/contracts";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import { Aviso } from "../../../../../componentes/Aviso";
import formulario from "../../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../../lib/api-cliente";
import type { ClaveError } from "../../../../../lib/errores";
import { subirAlBucket } from "../../../../../lib/ficheros";
import propias from "../detalle.module.css";

const TAMANO_MAXIMO = 10 * 1024 * 1024;
const MAXIMO_POR_LOTE = 20;

/**
 * Spec 003, R1, R12 y R16: hasta 20 PDF de una vez. Cada uno va directo al
 * bucket con su permiso firmado; después se registran todos juntos (un lote).
 */
export function SubirFacturas({ inmuebleId }: { inmuebleId: string }) {
  const t = useTranslations("Facturas");
  const te = useTranslations("Errores");
  const router = useRouter();
  const selector = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);
  const [resultado, setResultado] = useState<{ subidas: number; rechazadas: string[] } | null>(null);
  const base = `/inmuebles/${inmuebleId}/facturas`;

  const subir = async (e: ChangeEvent<HTMLInputElement>) => {
    const elegidos = [...(e.target.files ?? [])];
    e.target.value = "";
    if (elegidos.length === 0) return;
    setError(null);
    setResultado(null);
    if (elegidos.length > MAXIMO_POR_LOTE) return setError("demasiadasFacturas");

    // R1: lo que claramente no es un PDF de hasta 10 MB ni se sube; la API lo vuelve a comprobar.
    const validos = elegidos.filter((f) => f.size > 0 && f.size <= TAMANO_MAXIMO && (!f.type || f.type === "application/pdf"));
    const descartados = elegidos.filter((f) => !validos.includes(f)).map((f) => f.name);
    if (validos.length === 0) return setResultado({ subidas: 0, rechazadas: descartados });

    setSubiendo(true);
    const permisos = await pedirApi<PermisosSubida>(`${base}/subidas`, { cuerpo: { cantidad: validos.length } });
    if (!permisos.ok) {
      setSubiendo(false);
      return setError(permisos.error);
    }
    const subidos = await Promise.all(validos.map((f, n) => subirAlBucket(permisos.datos.permisos[n]!, f)));
    const fallidos = validos.filter((_, n) => !subidos[n]).map((f) => f.name);
    const subidas = validos
      .map((f, n) => ({ subidaId: permisos.datos.permisos[n]!.subidaId, nombre: f.name, subido: subidos[n] }))
      .filter((s) => s.subido)
      .map(({ subidaId, nombre }) => ({ subidaId, nombre }));
    if (subidas.length === 0) {
      setSubiendo(false);
      return setError("subidaFallida");
    }

    const registro = await pedirApi<ResultadoSubidaFacturas>(base, { cuerpo: { subidas } });
    setSubiendo(false);
    if (!registro.ok) return setError(registro.error);
    setResultado({
      subidas: registro.datos.facturas.length,
      rechazadas: [...descartados, ...fallidos, ...registro.datos.rechazadas.map((r) => r.nombre)],
    });
    router.refresh();
  };

  return (
    <div className={propias.enLinea}>
      <input ref={selector} type="file" accept="application/pdf,.pdf" multiple hidden onChange={subir} />
      <div className={propias.fila}>
        <span className={propias.suave}>{t("subirAyuda")}</span>
        <button type="button" className={formulario.boton} disabled={subiendo} onClick={() => selector.current?.click()}>
          {subiendo ? t("subiendo") : t("subir")}
        </button>
      </div>
      {error && <Aviso tipo="error">{te(error)}</Aviso>}
      {resultado && resultado.subidas > 0 && <Aviso tipo="exito">{t("subidas", { n: resultado.subidas })}</Aviso>}
      {resultado && resultado.rechazadas.length > 0 && (
        <Aviso tipo="error">{t("rechazadas", { n: resultado.rechazadas.length, nombres: resultado.rechazadas.join(", ") })}</Aviso>
      )}
    </div>
  );
}
