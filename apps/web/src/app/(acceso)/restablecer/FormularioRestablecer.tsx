"use client";
import { LONGITUD_MINIMA_CONTRASENA } from "@inquilinus/contracts";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../componentes/Aviso";
import { Campo } from "../../../componentes/Campo";
import estilos from "../../../componentes/formulario.module.css";
import { clienteAuth } from "../../../lib/cliente-auth";
import { claveDeError, type ClaveError } from "../../../lib/errores";

export function FormularioRestablecer({ token }: { token: string }) {
  const t = useTranslations("Restablecer");
  const te = useTranslations("Errores");
  const router = useRouter();
  const [contrasena, setContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);

  const corta = contrasena.length > 0 && contrasena.length < LONGITUD_MINIMA_CONTRASENA;

  const cambiar = async (e: FormEvent) => {
    e.preventDefault();
    if (corta) return;
    setEnviando(true);
    setError(null);
    const { error } = await clienteAuth.resetPassword({ newPassword: contrasena, token });
    setEnviando(false);
    if (error) return setError(claveDeError(error.code));
    // Las sesiones abiertas se han cerrado (R6): se entra con la nueva.
    router.replace("/acceso?contrasena=cambiada");
  };

  return (
    <form className={estilos.formulario} onSubmit={cambiar} noValidate>
      {error && (
        <Aviso tipo="error">
          {te(error)}{" "}
          {error === "enlaceNoValido" && (
            <Link href="/recuperar" className={estilos.enlace}>
              {t("pedirOtro")}
            </Link>
          )}
        </Aviso>
      )}
      <Campo
        etiqueta={t("nueva")}
        type="password"
        autoComplete="new-password"
        required
        minLength={LONGITUD_MINIMA_CONTRASENA}
        ayuda={t("ayuda", { minimo: LONGITUD_MINIMA_CONTRASENA })}
        error={corta ? te("contrasenaCorta") : null}
        value={contrasena}
        onChange={(e) => setContrasena(e.target.value)}
      />
      <button type="submit" className={estilos.boton} disabled={!contrasena || corta || enviando}>
        {t("guardar")}
      </button>
    </form>
  );
}
