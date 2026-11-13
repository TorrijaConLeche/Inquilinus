"use client";
import type { ResultadoConfirmacionTodas } from "@inquilinus/contracts";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso } from "../../../../../componentes/Aviso";
import formulario from "../../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../../lib/api-cliente";
import type { ClaveError } from "../../../../../lib/errores";

/** Spec 003, R13 y R14b: confirma las completas y sin solapes; las demás siguen por revisar. */
export function ConfirmarTodas({ inmuebleId }: { inmuebleId: string }) {
  const t = useTranslations("Facturas");
  const te = useTranslations("Errores");
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);
  const [resultado, setResultado] = useState<ResultadoConfirmacionTodas | null>(null);

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    const r = await pedirApi<ResultadoConfirmacionTodas>(`/inmuebles/${inmuebleId}/facturas/confirmar-todas`, { cuerpo: {} });
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    setResultado(r.datos);
    router.refresh();
  };

  const incompletas = resultado?.pendientes.filter((p) => p.motivo === "incompleta").length ?? 0;
  const conSolape = resultado?.pendientes.filter((p) => p.motivo === "solape").length ?? 0;

  return (
    <>
      <div>
        <button type="button" className={formulario.boton} disabled={enviando} onClick={() => void confirmar()}>
          {t("confirmarTodas")}
        </button>
      </div>
      {error && <Aviso tipo="error">{te(error)}</Aviso>}
      {resultado && (
        <Aviso tipo={resultado.pendientes.length === 0 ? "exito" : "info"}>
          {[
            t("confirmadas", { n: resultado.confirmadas.length }),
            incompletas > 0 ? t("quedanIncompletas", { n: incompletas }) : null,
            conSolape > 0 ? t("quedanConSolape", { n: conSolape }) : null,
          ]
            .filter(Boolean)
            .join(" ")}
        </Aviso>
      )}
    </>
  );
}
