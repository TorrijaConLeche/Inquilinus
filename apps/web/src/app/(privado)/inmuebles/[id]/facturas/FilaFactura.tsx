"use client";
import type { Factura, TipoGasto } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Aviso } from "../../../../../componentes/Aviso";
import formulario from "../../../../../componentes/formulario.module.css";
import { formatoEuros } from "../../../../../lib/dinero";
import { formatoFecha } from "../../../../../lib/fechas";
import { useAccion } from "../../../../../lib/use-accion";
import propias from "../detalle.module.css";

/** Una factura por revisar (spec 003, R13): lo que hay de ella, ver el PDF y descartarla (R16). */
export function FilaFactura({ inmuebleId, factura, tiposGasto }: { inmuebleId: string; factura: Factura; tiposGasto: TipoGasto[] }) {
  const t = useTranslations("Facturas");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const { enviando, error, ejecutar } = useAccion();
  const [descartando, setDescartando] = useState(false);
  const ruta = `/inmuebles/${inmuebleId}/facturas/${factura.id}`;
  const tipo = tiposGasto.find((tg) => tg.id === factura.tipoGastoId)?.nombre;

  const datos = [
    tipo,
    factura.periodoInicio && factura.periodoFin
      ? t("periodo", { inicio: formatoFecha(factura.periodoInicio, idioma), fin: formatoFecha(factura.periodoFin, idioma) })
      : null,
    factura.importeTotal !== null ? formatoEuros(factura.importeTotal, idioma) : null,
  ].filter(Boolean);

  return (
    <li className={propias.elemento}>
      <div className={propias.fila}>
        <a href={`/api${ruta}/pdf`} target="_blank" rel="noopener noreferrer" className={formulario.enlace}>
          {factura.nombreFichero}
        </a>
        <span className={propias.etiquetaColor}>{t(`estados.${factura.estado}`)}</span>
      </div>
      <span className={propias.suave}>{datos.length > 0 ? datos.join(" · ") : t("sinDatos")}</span>
      {error && <Aviso tipo="error">{te(error)}</Aviso>}
      {descartando ? (
        <div className={propias.confirmacion}>
          <span>{t("descartarConfirmacion")}</span>
          <div className={propias.botones}>
            <button type="button" className={formulario.botonSecundario} onClick={() => setDescartando(false)}>
              {t("cancelar")}
            </button>
            <button
              type="button"
              className={formulario.botonPeligro}
              disabled={enviando}
              onClick={() => void ejecutar(ruta, { metodo: "DELETE" })}
            >
              {t("descartar")}
            </button>
          </div>
        </div>
      ) : (
        <div className={propias.acciones}>
          <button type="button" className={formulario.botonEnlace} onClick={() => setDescartando(true)}>
            {t("descartar")}
          </button>
        </div>
      )}
    </li>
  );
}
