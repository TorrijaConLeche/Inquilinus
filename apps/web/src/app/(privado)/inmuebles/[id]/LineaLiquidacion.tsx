"use client";
import type { InquilinoEnLiquidacion, Liquidacion, ResultadoPagoLiquidacion, TipoGasto } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import formulario from "../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../lib/api-cliente";
import { formatoEuros } from "../../../../lib/dinero";
import type { ClaveError } from "../../../../lib/errores";
import { formatoFecha } from "../../../../lib/fechas";
import estilos from "./cobros/cobros.module.css";
import propias from "./detalle.module.css";
import { FormularioFechaPago } from "./FechaPago";
import { FilaParte } from "./FilaParte";

/**
 * Spec 011, R9, R10 y R13: una liquidación para un inquilino en una sola línea
 * (su estado y lo que le falta) que se despliega en sus partes, con «Marcar
 * pagada» (hoy o «En otra fecha») y deshacerlo.
 */
export function LineaLiquidacion({
  inmuebleId,
  liquidacion,
  inquilino,
  etiqueta,
  tiposGasto,
  hoy,
}: {
  inmuebleId: string;
  liquidacion: Liquidacion;
  inquilino: InquilinoEnLiquidacion;
  etiqueta: string;
  tiposGasto: TipoGasto[];
  hoy: string;
}) {
  const t = useTranslations("Liquidaciones");
  const tc = useTranslations("Cobros");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [eligiendoFecha, setEligiendoFecha] = useState(false);

  /** R10: sin fecha, la API usa la de hoy. */
  const marcarPagada = async (fecha?: string) => {
    setEnviando(true);
    setError(null);
    const r = await pedirApi<ResultadoPagoLiquidacion>(`/inmuebles/${inmuebleId}/liquidaciones/${liquidacion.id}/pagar`, {
      cuerpo: { inquilinoId: inquilino.inquilinoId, ...(fecha ? { fecha } : {}) },
    });
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    setMarcadas(r.datos.partes.map((p) => p.id));
    setEligiendoFecha(false);
    router.refresh();
  };

  const deshacer = async () => {
    setEnviando(true);
    await Promise.all(
      marcadas.map((id) => pedirApi(`/inmuebles/${inmuebleId}/partes/${id}`, { metodo: "PATCH", cuerpo: { pagadoEn: null } })),
    );
    setEnviando(false);
    setMarcadas([]);
    router.refresh();
  };

  const nombreTipo = (id: string | null) => tiposGasto.find((tg) => tg.id === id)?.nombre ?? "—";
  const colorTipo = (id: string | null) => tiposGasto.find((tg) => tg.id === id)?.color ?? null;

  return (
    <li className={estilos.cobro}>
      <div className={estilos.lineaCobro}>
        <div className={estilos.concepto}>
          <span>{etiqueta}</span>
          <span className={estilos.marcas}>
            <span
              className={
                inquilino.estado === "pagada"
                  ? estilos.pagado
                  : inquilino.estado === "parcial"
                    ? estilos.desactualizado
                    : estilos.pendiente
              }
            >
              {t(`estados.${inquilino.estado}`)}
            </span>
            {inquilino.estado === "parcial" && (
              <span className={propias.suave}>{t("falta", { importe: formatoEuros(inquilino.pendiente, idioma) })}</span>
            )}
          </span>
        </div>
        <div className={estilos.ladoDerecho}>
          <span className={propias.importe}>{formatoEuros(inquilino.total, idioma)}</span>
          {inquilino.pendiente > 0 ? (
            <button type="button" className={formulario.boton} disabled={enviando} onClick={() => void marcarPagada()}>
              {t("marcarPagada")}
            </button>
          ) : marcadas.length > 0 ? (
            <button type="button" className={formulario.botonSecundario} disabled={enviando} onClick={() => void deshacer()}>
              {t("deshacer")}
            </button>
          ) : null}
        </div>
      </div>
      {error && !eligiendoFecha && <Aviso tipo="error">{te(error)}</Aviso>}
      {inquilino.pendiente > 0 &&
        (eligiendoFecha ? (
          <FormularioFechaPago
            inicial={hoy}
            hoy={hoy}
            textoBoton={t("marcarPagada")}
            enviando={enviando}
            error={error}
            alGuardar={(fecha) => void marcarPagada(fecha)}
            alCancelar={() => setEligiendoFecha(false)}
          />
        ) : (
          <div className={propias.acciones}>
            <button
              type="button"
              className={formulario.botonEnlace}
              onClick={() => {
                setError(null);
                setEligiendoFecha(true);
              }}
            >
              {tc("enOtraFecha")}
            </button>
          </div>
        ))}
      <details className={propias.archivadas}>
        <summary>{t("verFacturas", { n: inquilino.partes.length })}</summary>
        <ul className={estilos.cobros}>
          {inquilino.partes.map((p) => (
            <FilaParte
              key={p.id}
              inmuebleId={inmuebleId}
              parte={p}
              color={colorTipo(p.tipoGastoId)}
              etiqueta={`${nombreTipo(p.tipoGastoId)} (${formatoFecha(p.periodoInicio, idioma)} – ${formatoFecha(p.periodoFin, idioma)})`}
              detalle={t("dias", { n: p.dias })}
              hoy={hoy}
            />
          ))}
        </ul>
      </details>
    </li>
  );
}
