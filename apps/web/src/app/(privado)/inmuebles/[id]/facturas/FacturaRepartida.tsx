"use client";
import type { Factura, Inquilino } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso } from "../../../../../componentes/Aviso";
import formulario from "../../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../../lib/api-cliente";
import { formatoEuros } from "../../../../../lib/dinero";
import type { ClaveError } from "../../../../../lib/errores";
import { formatoFecha } from "../../../../../lib/fechas";
import cobros from "../cobros/cobros.module.css";
import propias from "../detalle.module.css";
import { FilaParte } from "../FilaParte";
import estilos from "./facturas.module.css";

/**
 * Una factura repartida (spec 001, R10–R14): su reparto por inquilino con el
 * pago de cada parte, lo sin ocupar, recalcular si está desactualizado y deshacer.
 */
export function FacturaRepartida({
  inmuebleId,
  factura,
  tipo,
  inquilinos,
  hoy,
}: {
  inmuebleId: string;
  factura: Factura;
  tipo: string;
  inquilinos: Inquilino[];
  hoy: string;
}) {
  const t = useTranslations("Facturas");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);
  const [confirmando, setConfirmando] = useState<"recalcular" | "deshacer" | null>(null);
  const ruta = `/inmuebles/${inmuebleId}/facturas/${factura.id}`;
  const reparto = factura.reparto!;
  const hayPagos = reparto.partes.some((p) => p.pagadoEn);
  const nombre = (id: string) => inquilinos.find((q) => q.id === id)?.nombre ?? "—";

  const accion = async (cual: "recalcular" | "deshacer", confirmar: boolean) => {
    setEnviando(true);
    setError(null);
    const r = await pedirApi(`${ruta}/${cual}`, { cuerpo: confirmar ? { confirmar: true } : {} });
    setEnviando(false);
    if (!r.ok) {
      // R13: con partes pagadas hay que confirmar.
      if (r.error === "confirmacionNecesaria") return setConfirmando(cual);
      return setError(r.error);
    }
    setConfirmando(null);
    router.refresh();
  };

  return (
    <li className={propias.elemento}>
      <div className={propias.fila}>
        <span>
          <strong>{tipo}</strong>{" "}
          <span className={propias.suave}>
            {factura.periodoInicio && factura.periodoFin
              ? t("periodo", { inicio: formatoFecha(factura.periodoInicio, idioma), fin: formatoFecha(factura.periodoFin, idioma) })
              : ""}
          </span>
        </span>
        <span className={propias.acciones}>
          <span className={estilos.importe}>{factura.importeTotal === null ? "—" : formatoEuros(factura.importeTotal, idioma)}</span>
          <a href={`/api${ruta}/pdf`} target="_blank" rel="noopener noreferrer" className={formulario.enlace}>
            {t("verPdf")}
          </a>
        </span>
      </div>

      {reparto.desactualizado && (
        <Aviso tipo="info">
          <span className={cobros.desactualizado}>{t("repartoDesactualizado")}</span> {t("repartoDesactualizadoExplicacion")}
        </Aviso>
      )}

      <ul className={cobros.cobros}>
        {reparto.partes.map((p) => (
          <FilaParte
            key={p.id}
            inmuebleId={inmuebleId}
            parte={p}
            etiqueta={nombre(p.inquilinoId)}
            detalle={t("dias", { n: p.dias })}
            hoy={hoy}
          />
        ))}
      </ul>
      {reparto.sinOcupar.importe > 0 && (
        <span className={propias.suave}>
          {t("sinOcupar", { importe: formatoEuros(reparto.sinOcupar.importe, idioma), n: reparto.sinOcupar.dias })}
        </span>
      )}

      {error && <Aviso tipo="error">{te(error)}</Aviso>}
      {confirmando ? (
        <div className={propias.confirmacion}>
          <span>{confirmando === "recalcular" ? t("recalcularConPagos") : hayPagos ? t("deshacerConPagos") : t("deshacerSinPagos")}</span>
          <div className={propias.botones}>
            <button type="button" className={formulario.botonSecundario} onClick={() => setConfirmando(null)}>
              {t("cancelar")}
            </button>
            <button
              type="button"
              className={confirmando === "deshacer" ? formulario.botonPeligro : formulario.boton}
              disabled={enviando}
              onClick={() => void accion(confirmando, true)}
            >
              {confirmando === "recalcular" ? t("recalcular") : t("deshacer")}
            </button>
          </div>
        </div>
      ) : (
        <div className={propias.acciones}>
          {reparto.desactualizado && (
            <button type="button" className={formulario.botonEnlace} disabled={enviando} onClick={() => void accion("recalcular", false)}>
              {t("recalcular")}
            </button>
          )}
          {/* R14: deshacer siempre pide confirmación; con pagos, avisa de que se pierden. */}
          <button type="button" className={formulario.botonEnlace} onClick={() => setConfirmando("deshacer")}>
            {t("deshacer")}
          </button>
        </div>
      )}
    </li>
  );
}
