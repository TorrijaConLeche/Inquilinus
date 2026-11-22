"use client";
import type { ColorGasto, ParteReparto } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import { PuntoColor } from "../../../../componentes/ColorGasto";
import formulario from "../../../../componentes/formulario.module.css";
import { formatoEuros } from "../../../../lib/dinero";
import { formatoFecha } from "../../../../lib/fechas";
import { useAccion } from "../../../../lib/use-accion";
import estilos from "./cobros/cobros.module.css";
import propias from "./detalle.module.css";
import { FormularioFechaPago } from "./FechaPago";

/**
 * La parte de un inquilino en una factura (spec 001, R11): pendiente o
 * cobrada con su fecha, un toque para marcarla hoy, cambiar esa fecha o deshacerlo
 * (spec 009, R9).
 */
export function FilaParte({
  inmuebleId,
  parte,
  etiqueta,
  color,
  detalle,
  hoy,
}: {
  inmuebleId: string;
  parte: ParteReparto;
  etiqueta: string;
  /** Spec 006, R8: el color de su tipo de gasto, si la etiqueta lo nombra. */
  color?: ColorGasto | null;
  detalle?: string;
  hoy: string;
}) {
  const t = useTranslations("Cobros");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const { enviando, error, ejecutar, limpiarError } = useAccion();
  const [cambiandoFecha, setCambiandoFecha] = useState(false);
  const marcar = (pagadoEn: string | null, alTerminar?: () => void) =>
    void ejecutar(`/inmuebles/${inmuebleId}/partes/${parte.id}`, { metodo: "PATCH", cuerpo: { pagadoEn } }, alTerminar);

  return (
    <li className={estilos.cobro}>
      <div className={estilos.lineaCobro}>
        <div className={estilos.concepto}>
          <span className={estilos.etiquetaParte}>
            {color !== undefined && <PuntoColor color={color} />}
            {etiqueta}
          </span>
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
      {error && !cambiandoFecha && <Aviso tipo="error">{te(error)}</Aviso>}
      {parte.pagadoEn &&
        (cambiandoFecha ? (
          <FormularioFechaPago
            inicial={parte.pagadoEn}
            hoy={hoy}
            textoBoton={t("guardar")}
            enviando={enviando}
            error={error}
            alGuardar={(fecha) => marcar(fecha, () => setCambiandoFecha(false))}
            alCancelar={() => setCambiandoFecha(false)}
          />
        ) : (
          <div className={propias.acciones}>
            <button
              type="button"
              className={formulario.botonEnlace}
              onClick={() => {
                limpiarError();
                setCambiandoFecha(true);
              }}
            >
              {t("cambiarFechaPago")}
            </button>
          </div>
        ))}
    </li>
  );
}
