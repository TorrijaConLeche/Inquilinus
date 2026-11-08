"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../componentes/Aviso";
import { BotonGoogle } from "../../../componentes/BotonGoogle";
import { Campo } from "../../../componentes/Campo";
import estilos from "../../../componentes/formulario.module.css";
import { clienteAuth } from "../../../lib/cliente-auth";
import { claveDeError, type ClaveError } from "../../../lib/errores";

type Paso = "credenciales" | "codigo";

export function FormularioAcceso({
  google,
  errorInicial,
  avisoInicial,
}: {
  google: boolean;
  errorInicial: ClaveError | null;
  avisoInicial: "contrasenaCambiada" | null;
}) {
  const t = useTranslations("Acceso");
  const te = useTranslations("Errores");
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("credenciales");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [recordar, setRecordar] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [conRecuperacion, setConRecuperacion] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(errorInicial);
  const [reenviado, setReenviado] = useState(false);

  const alPanel = () => {
    router.replace("/panel");
    router.refresh();
  };

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setReenviado(false);
    const { data, error } = await clienteAuth.signIn.email({
      email,
      password: contrasena,
      // R8: sin marcar, la sesión termina al cerrar el navegador.
      rememberMe: recordar,
    });
    setEnviando(false);
    if (error) return setError(claveDeError(error.code));
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setContrasena("");
      return setPaso("codigo");
    }
    alPanel();
  };

  const verificar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const limpio = codigo.trim();
    const { error } = conRecuperacion
      ? await clienteAuth.twoFactor.verifyBackupCode({ code: limpio })
      : await clienteAuth.twoFactor.verifyTotp({ code: limpio.replace(/\s/g, "") });
    setEnviando(false);
    if (error) return setError(claveDeError(error.code));
    alPanel();
  };

  const reenviar = async () => {
    await clienteAuth.sendVerificationEmail({ email, callbackURL: "/acceso" });
    setError(null);
    setReenviado(true);
  };

  if (paso === "codigo") {
    return (
      <form className={estilos.formulario} onSubmit={verificar} noValidate>
        <p className={estilos.ayuda}>{conRecuperacion ? t("codigoRecuperacionAyuda") : t("codigoAyuda")}</p>
        {error && <Aviso tipo="error">{te(error)}</Aviso>}
        <Campo
          etiqueta={conRecuperacion ? t("codigoRecuperacion") : t("codigo")}
          inputMode={conRecuperacion ? "text" : "numeric"}
          autoComplete="one-time-code"
          autoFocus
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
        <button type="submit" className={estilos.boton} disabled={!codigo.trim() || enviando}>
          {t("verificar")}
        </button>
        <button
          type="button"
          className={estilos.botonEnlace}
          onClick={() => {
            setConRecuperacion(!conRecuperacion);
            setCodigo("");
            setError(null);
          }}
        >
          {conRecuperacion ? t("usarApp") : t("usarRecuperacion")}
        </button>
      </form>
    );
  }

  return (
    <>
      <form className={estilos.formulario} onSubmit={entrar} noValidate>
        {avisoInicial && !error && <Aviso tipo="exito">{t(avisoInicial)}</Aviso>}
        {reenviado && <Aviso tipo="exito">{t("verificacionReenviada", { email })}</Aviso>}
        {error && (
          <Aviso tipo="error">
            {te(error)}{" "}
            {error === "emailSinVerificar" && email && (
              <button type="button" className={estilos.botonEnlace} onClick={reenviar}>
                {t("reenviarVerificacion")}
              </button>
            )}
            {error === "terminos" && (
              <Link href="/registro" className={estilos.enlace}>
                {t("irRegistro")}
              </Link>
            )}
          </Aviso>
        )}
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
          autoComplete="current-password"
          required
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
        />
        <div className={estilos.fila}>
          <label className={estilos.casilla}>
            <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
            <span>{t("recordar")}</span>
          </label>
          <Link href="/recuperar" className={estilos.enlace}>
            {t("olvidada")}
          </Link>
        </div>
        <button type="submit" className={estilos.boton} disabled={!email || !contrasena || enviando}>
          {enviando ? t("entrando") : t("entrar")}
        </button>
      </form>

      {google && (
        <>
          <p className={estilos.separador}>{t("o")}</p>
          <BotonGoogle desdeRegistro={false} />
        </>
      )}

      <p className={estilos.pie}>
        {t("sinCuenta")}{" "}
        <Link href="/registro" className={estilos.enlace}>
          {t("crearCuenta")}
        </Link>
      </p>
    </>
  );
}
