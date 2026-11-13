"use client";
import type { ParteReparto } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { Aviso } from "../../../../componentes/Aviso";
import formulario from "../../../../componentes/formulario.module.css";
import { formatoEuros } from "../../../../lib/dinero";
import { formatoFecha } from "../../../../lib/fechas";
import { useAccion } from "../../../../lib/use-accion";
import estilos from "./cobros/cobros.module.css";
import propias from "./detalle.module.css";

/**
 * La parte de un inquilino en una factura (spec 001, R11): pendiente o
 * cobrada con su fecha, y un toque para marcarla hoy o deshacerlo (spec 009, R9).
 */
export function FilaParte({
  inmuebleId,
  parte,
  etiqueta,
  detalle,
  hoy,
}: {
  inmuebleId: string;
  parte: ParteReparto;
  etiqueta: string;
  detalle?: string;
  hoy: string;
}) {
  const t = useTranslations("Cobros");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const { enviando, error, ejecutar } = useAccion();
  const marcar = (pagadoEn: string | null) =>
    void ejecutar(`/inmuebles/${inmuebleId}/partes/${parte.id}`, { metodo: "PATCH", cuerpo: { pagadoEn } });

  return (
    <li className={estilos.cobro}>
      <div className={estilos.lineaCobro}>
        <div className={estilos.concepto}>
          <span>{etiqueta}</span>
          <span className={estilos.marcas}>
            {parte.pagadoEn ? (
              <span className={estilos.pagado}>{t("pagadoEl", { fecha: formatoFecha(parte.pagadoEn, idioma) })}</span>
            ) : (
              <span className={estilos.pendiente}>{t("pendiente")}</span>
            )}
          </span>
          {detalle && <span className={propias.suave}>{detalle}</span>}
        </div>
        <div className={estilos.ladoDerecho}>
          <span className={propias.importe}>{formatoEuros(parte.importe, idioma)}</span>
          {parte.pagadoEn ? (
            <button type="button" className={formulario.botonSecundario} disabled={enviando} onClick={() => marcar(null)}>
              {t("deshacer")}
            </button>
          ) : (
            <button type="button" className={formulario.boton} disabled={enviando} onClick={() => marcar(hoy)}>
              {t("cobrado")}
            </button>
          )}
        </div>
      </div>
      {error && <Aviso tipo="error">{te(error)}</Aviso>}
    </li>
  );
}
