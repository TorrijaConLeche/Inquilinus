"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../componentes/Aviso";
import { Campo } from "../../../componentes/Campo";
import estilos from "../../../componentes/formulario.module.css";
import { clienteAuth } from "../../../lib/cliente-auth";

export function FormularioRecuperar() {
  const t = useTranslations("Recuperar");
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const pedir = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    await clienteAuth.requestPasswordReset({ email, redirectTo: "/restablecer" });
    setEnviando(false);
    // R6: el mismo mensaje exista o no una cuenta con ese email.
    setEnviado(true);
  };

  if (enviado) {
    return (
      <div className={estilos.formulario}>
        <Aviso tipo="exito">{t("enviado", { email })}</Aviso>
        <p className={estilos.ayuda}>{t("caduca")}</p>
        <p className={estilos.pie}>
          <Link href="/acceso" className={estilos.enlace}>
            {t("volver")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <form className={estilos.formulario} onSubmit={pedir} noValidate>
        <Campo
          etiqueta={t("email")}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className={estilos.boton} disabled={!email || enviando}>
          {t("enviar")}
        </button>
      </form>
      <p className={estilos.pie}>
        <Link href="/acceso" className={estilos.enlace}>
          {t("volver")}
        </Link>
      </p>
    </>
  );
}
