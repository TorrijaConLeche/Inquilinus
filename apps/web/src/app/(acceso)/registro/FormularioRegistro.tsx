"use client";
import { LONGITUD_MINIMA_CONTRASENA, VERSION_TERMINOS } from "@inquilinus/contracts";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../componentes/Aviso";
import { BotonGoogle } from "../../../componentes/BotonGoogle";
import { Campo } from "../../../componentes/Campo";
import estilos from "../../../componentes/formulario.module.css";
import { clienteAuth } from "../../../lib/cliente-auth";
import { claveDeError, type ClaveError } from "../../../lib/errores";

export function FormularioRegistro({
  google,
  errorInicial,
}: {
  google: boolean;
  errorInicial: ClaveError | null;
}) {
  const t = useTranslations("Registro");
  const te = useTranslations("Errores");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [nombre, setNombre] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(errorInicial);
  const [enviadoA, setEnviadoA] = useState<string | null>(null);

  const corta = contrasena.length > 0 && contrasena.length < LONGITUD_MINIMA_CONTRASENA;

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!acepta || corta) return;
    setEnviando(true);
    setError(null);
    const { error } = await clienteAuth.signUp.email({
      email,
      password: contrasena,
      name: nombre.trim(),
      terminosVersion: VERSION_TERMINOS,
      // Tras pulsar el enlace del email se entra y /acceso lleva al panel.
      callbackURL: "/acceso",
    });
    setEnviando(false);
    if (error) setError(claveDeError(error.code));
    else setEnviadoA(email);
  };

  if (enviadoA) {
    return (
      <div className={estilos.formulario}>
        <Aviso tipo="exito">{t("revisaEmail", { email: enviadoA })}</Aviso>
        <p className={estilos.ayuda}>{t("revisaSpam")}</p>
        <p className={estilos.pie}>
          <Link href="/acceso" className={estilos.enlace}>
            {t("irAcceso")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <form className={estilos.formulario} onSubmit={registrar} noValidate>
        {error && <Aviso tipo="error">{te(error)}</Aviso>}
        <Campo
          etiqueta={t("email")}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          etiqueta={t("contrasena")}
          type="password"
          autoComplete="new-password"
          required
          minLength={LONGITUD_MINIMA_CONTRASENA}
          ayuda={t("contrasenaAyuda", { minimo: LONGITUD_MINIMA_CONTRASENA })}
          error={corta ? te("contrasenaCorta") : null}
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
        />
        <Campo
          etiqueta={t("nombre")}
          marca={t("opcional")}
          autoComplete="name"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <label className={estilos.casilla}>
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} required />
          <span>
            {t.rich("aceptoTerminos", {
              privacidad: (texto) => (
                <Link href="/privacidad" target="_blank" className={estilos.enlace}>
                  {texto}
                </Link>
              ),
              terminos: (texto) => (
                <Link href="/terminos" target="_blank" className={estilos.enlace}>
                  {texto}
                </Link>
              ),
            })}
          </span>
        </label>
        <button type="submit" className={estilos.boton} disabled={!acepta || corta || enviando}>
          {enviando ? t("creando") : t("crear")}
        </button>
      </form>

      {google && (
        <>
          <p className={estilos.separador}>{t("o")}</p>
          <BotonGoogle desdeRegistro deshabilitado={!acepta} />
          {!acepta && <p className={estilos.ayuda}>{t("googleAcepta")}</p>}
        </>
      )}

      <p className={estilos.pie}>
        {t("yaTienes")}{" "}
        <Link href="/acceso" className={estilos.enlace}>
          {t("entrar")}
        </Link>
      </p>
    </>
  );
}
