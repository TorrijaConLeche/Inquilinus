"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import formulario from "../../../componentes/formulario.module.css";
import { clienteAuth } from "../../../lib/cliente-auth";
import estilos from "../privado.module.css";

/** Cerrar la sesión en todos los dispositivos (spec 008, R10). */
export function Sesiones() {
  const t = useTranslations("Ajustes.sesiones");
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);

  const cerrarTodas = async () => {
    await clienteAuth.revokeSessions();
    router.replace("/acceso");
    router.refresh();
  };

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-sesiones">
      <h2 id="titulo-sesiones">{t("titulo")}</h2>
      <p className={estilos.suave}>{t("explicacion")}</p>
      <div className={formulario.fila}>
        {confirmando ? (
          <>
            <button type="button" className={formulario.botonSecundario} onClick={() => setConfirmando(false)}>
              {t("cancelar")}
            </button>
            <button type="button" className={formulario.botonPeligro} onClick={cerrarTodas}>
              {t("confirmar")}
            </button>
          </>
        ) : (
          <button type="button" className={formulario.botonSecundario} onClick={() => setConfirmando(true)}>
            {t("cerrarTodas")}
          </button>
        )}
      </div>
    </section>
  );
}
