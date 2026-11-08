"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import estilos from "../../componentes/formulario.module.css";
import { clienteAuth } from "../../lib/cliente-auth";

export function BotonCerrarSesion() {
  const t = useTranslations("Privado");
  const router = useRouter();
  const salir = async () => {
    await clienteAuth.signOut();
    router.replace("/acceso");
    router.refresh();
  };
  return (
    <button type="button" className={estilos.botonEnlace} onClick={salir}>
      {t("salir")}
    </button>
  );
}
