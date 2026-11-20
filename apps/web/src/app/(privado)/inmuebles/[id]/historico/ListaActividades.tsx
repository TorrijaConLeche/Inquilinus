"use client";
import type { Actividad, DatosTimeline } from "@inquilinus/contracts";
import { agruparPorMes } from "@inquilinus/domain";
import { useLocale, useTranslations } from "next-intl";
import { PuntoColor } from "../../../../../componentes/ColorGasto";
import { formatoEuros } from "../../../../../lib/dinero";
import { formatoFecha, formatoMes } from "../../../../../lib/fechas";
import cobros from "../cobros/cobros.module.css";
import propias from "../detalle.module.css";
import type { Abierta } from "../Ventanas";
import estilos from "./historico.module.css";

/**
 * Actividades del histórico (spec 012): cada una con su fecha, su texto (con
 * el antes y el después, R4) y su estado de pago de hoy. Las de un cobro, una
 * factura o una liquidación abren su ventana (R8). Con `porMes`, agrupadas (R5).
 */
export function ListaActividades({
  actividades,
  datos,
  habitaciones,
  alAbrir,
  porMes = false,
}: {
  actividades: Actividad[];
  datos: DatosTimeline;
  habitaciones: { id: string; nombre: string }[];
  alAbrir: (a: Abierta) => void;
  porMes?: boolean;
}) {
  const idioma = useLocale();
  const texto = useTextoActividad(datos, habitaciones);
  const t = useTranslations("Historico");

  // R8: qué ventana abre cada una (si lo que nombra sigue existiendo).
  const ventanaDe = (a: Actividad): Abierta | null => {
    const d = a.detalle;
    if (d.liquidacionId && datos.liquidaciones.some((l) => l.id === d.liquidacionId)) {
      return { tipo: "liquidacion", liquidacionId: d.liquidacionId };
    }
    if (d.facturaId && datos.facturas.some((f) => f.id === d.facturaId)) return { tipo: "factura", facturaId: d.facturaId };
    if (d.cobroId) {
      const cobro = datos.cobros.find((c) => c.id === d.cobroId);
      if (cobro) {
        return {
          tipo: "alquiler",
          fecha: cobro.fechaCobro,
          cobroIds: datos.cobros.filter((c) => c.fechaCobro === cobro.fechaCobro).map((c) => c.id),
        };
      }
    }
    return null;
  };

  const linea = (a: Actividad) => {
    const ventana = ventanaDe(a);
    const contenido = (
      <>
        <span className={propias.suave}>{formatoFecha(a.fecha, idioma)}</span>
        <span className={estilos.texto}>
          <span>{texto(a)}</span>
          {a.estadoPago && (
            <span className={a.estadoPago === "pagado" ? cobros.pagado : cobros.pendiente}>{t(`estados.${a.estadoPago}`)}</span>
          )}
        </span>
      </>
    );
    return (
      <li key={a.id}>
        {ventana ? (
          <button type="button" className={propias.movimiento} onClick={() => alAbrir(ventana)}>
            {contenido}
          </button>
        ) : (
          <div className={propias.movimiento}>{contenido}</div>
        )}
      </li>
    );
  };

  if (!porMes) return <ul className={propias.listaMovimientos}>{actividades.map(linea)}</ul>;
  return (
    <div className={estilos.meses}>
      {agruparPorMes(actividades).map((g) => (
        <section key={g.mes} aria-labelledby={`mes-${g.mes}`} className={estilos.mes}>
          <h3 id={`mes-${g.mes}`} className={propias.subtitulo}>
            {formatoMes(g.mes, idioma)}
          </h3>
          <ul className={propias.listaMovimientos}>{g.actividades.map(linea)}</ul>
        </section>
      ))}
    </div>
  );
}

/** El texto de una actividad, con los nombres de hoy (R10: «Inquilino N» si se borró). */
function useTextoActividad(datos: DatosTimeline, habitaciones: { id: string; nombre: string }[]) {
  const t = useTranslations("Historico");
  const idioma = useLocale();
  const euros = (c: number | undefined) => (c === undefined ? "—" : formatoEuros(c, idioma));
  const fecha = (f: string | undefined) => (f ? formatoFecha(f, idioma) : "—");
  const mes = (m: string | undefined) => (m ? formatoMes(m, idioma) : "—");

  return (a: Actividad) => {
    const d = a.detalle;
    const inquilino = (a.inquilinoId && datos.inquilinos.find((q) => q.id === a.inquilinoId)?.nombre) || t("inquilinoBorrado");
    const tipo = datos.tiposGasto.find((tg) => tg.id === a.tipoGastoId);
    const gasto = tipo?.nombre ?? d.nombre ?? t("gasto");
    const habitacion = (id: string | undefined) => (id && habitaciones.find((h) => h.id === id)?.nombre) || d.nombre || "—";
    const valores = {
      inquilino,
      gasto,
      mes: mes(d.mes),
      importe: euros(d.importe),
      antes: euros(d.antes),
      despues: euros(d.despues),
      fecha: fecha(d.fecha),
      fechaAntes: fecha(d.fechaAntes),
      fechaDespues: fecha(d.fechaDespues),
      inicio: fecha(d.periodoInicio),
      fin: fecha(d.periodoFin),
      nombre: d.nombre ?? "—",
      nombreAntes: d.nombreAntes ?? "—",
      habitacion: habitacion(d.habitacionId),
      habitacionAntes: habitacion(d.habitacionAntesId),
      desdeMes: mes(d.desdeMes),
      n: d.cantidad ?? d.facturaIds?.length ?? 0,
      campo: d.campo ? t(`campos.${d.campo}`) : "—",
    };
    switch (a.tipo) {
      case "cobro_generado":
        return t(d.origen === "auto" ? "tipos.cobro_generado_auto" : "tipos.cobro_generado", valores);
      case "dia_cobro_cambiado":
        return t("tipos.dia_cobro_cambiado", { antes: String(d.antes ?? "—"), despues: String(d.despues ?? "—") });
      case "opciones_cambiadas":
        return t("tipos.opciones_cambiadas", {
          antes: d.nombreAntes ? t(`meses.${d.nombreAntes}`) : "—",
          despues: d.nombre ? t(`meses.${d.nombre}`) : "—",
        });
      case "precio_cambiado":
        return t(d.antes === undefined ? "tipos.precio_inicial" : "tipos.precio_cambiado", valores);
      case "factura_subida":
      case "factura_repartida":
      case "reparto_recalculado":
      case "reparto_deshecho":
      case "parte_pagada":
      case "parte_desmarcada":
        return (
          <>
            {tipo && <PuntoColor color={tipo.color} />} {t(`tipos.${a.tipo}`, valores)}
          </>
        );
      default:
        return t(`tipos.${a.tipo}`, valores);
    }
  };
}
