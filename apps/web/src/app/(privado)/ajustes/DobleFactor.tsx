"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../componentes/Aviso";
import { Campo } from "../../../componentes/Campo";
import formulario from "../../../componentes/formulario.module.css";
import { clienteAuth } from "../../../lib/cliente-auth";
import { claveDeError, type ClaveError } from "../../../lib/errores";
import estilos from "../privado.module.css";

type Estado =
  | { paso: "inicio" }
  | { paso: "contrasena"; accion: "activar" | "desactivar" }
  | { paso: "escanear"; qr: string; secreto: string; codigos: string[] }
  | { paso: "codigos"; codigos: string[] };

/** Doble factor opcional con app de autenticación (spec 008, R7). */
export function DobleFactor({ activo, conContrasena }: { activo: boolean; conContrasena: boolean }) {
  const t = useTranslations("Ajustes.dobleFactor");
  const te = useTranslations("Errores");
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ paso: "inicio" });
  const [contrasena, setContrasena] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<ClaveError | null>(null);
  const [enviando, setEnviando] = useState(false);

  const reiniciar = () => {
    setEstado({ paso: "inicio" });
    setContrasena("");
    setCodigo("");
    setError(null);
  };

  const confirmarContrasena = async (e: FormEvent) => {
    e.preventDefault();
    if (estado.paso !== "contrasena") return;
    setEnviando(true);
    setError(null);
    if (estado.accion === "activar") {
      const { data, error } = await clienteAuth.twoFactor.enable({ password: contrasena });
      setEnviando(false);
      // Solo usamos la app de autenticación (TOTP), no códigos por email.
      if (error || !data || data.method !== "totp") return setError(claveDeError(error?.code));
      const secreto = new URL(data.totpURI).searchParams.get("secret") ?? "";
      const qr = await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 });
      setContrasena("");
      setEstado({ paso: "escanear", qr, secreto, codigos: data.backupCodes });
    } else {
      const { error } = await clienteAuth.twoFactor.disable({ password: contrasena });
      setEnviando(false);
      if (error) return setError(claveDeError(error.code));
      reiniciar();
      router.refresh();
    }
  };

  const confirmarCodigo = async (e: FormEvent) => {
    e.preventDefault();
    if (estado.paso !== "escanear") return;
    setEnviando(true);
    setError(null);
    const { error } = await clienteAuth.twoFactor.verifyTotp({ code: codigo.replace(/\s/g, "") });
    setEnviando(false);
    if (error) return setError(claveDeError(error.code));
    setEstado({ paso: "codigos", codigos: estado.codigos });
  };

  const descargarCodigos = (codigos: string[]) => {
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([`${t("archivoCodigos")}\n\n${codigos.join("\n")}\n`], { type: "text/plain" }));
    enlace.download = "inquilinus-codigos-recuperacion.txt";
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-2fa">
      <div className={formulario.fila}>
        <h2 id="titulo-2fa">{t("titulo")}</h2>
        {activo && estado.paso === "inicio" && <span className={estilos.etiquetaEstado}>{t("activo")}</span>}
      </div>

      {!conContrasena && <p className={estilos.suave}>{t("soloGoogle")}</p>}

      {conContrasena && estado.paso === "inicio" && (
        <>
          <p className={estilos.suave}>{activo ? t("explicacionActivo") : t("explicacion")}</p>
          <div>
            <button
              type="button"
              className={activo ? formulario.botonPeligro : formulario.boton}
              onClick={() => setEstado({ paso: "contrasena", accion: activo ? "desactivar" : "activar" })}
            >
              {activo ? t("desactivar") : t("activar")}
            </button>
          </div>
        </>
      )}

      {estado.paso === "contrasena" && (
        <form className={formulario.formulario} onSubmit={confirmarContrasena} noValidate>
          <p className={estilos.suave}>{t("pedirContrasena")}</p>
          {error && <Aviso tipo="error">{te(error)}</Aviso>}
          <Campo
            etiqueta={t("contrasena")}
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
          <div className={formulario.fila}>
            <button type="button" className={formulario.botonSecundario} onClick={reiniciar}>
              {t("cancelar")}
            </button>
            <button type="submit" className={formulario.boton} disabled={!contrasena || enviando}>
              {t("continuar")}
            </button>
          </div>
        </form>
      )}

      {estado.paso === "escanear" && (
        <form className={formulario.formulario} onSubmit={confirmarCodigo} noValidate>
          <p>{t("escanear")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen generada en el navegador */}
          <img src={estado.qr} alt={t("qrAlt")} className={estilos.qr} />
          <p className={estilos.suave}>
            {t("sinCamara")} <span className={estilos.secreto}>{estado.secreto}</span>
          </p>
          {error && <Aviso tipo="error">{te(error)}</Aviso>}
          <Campo
            etiqueta={t("codigo")}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
          <div className={formulario.fila}>
            <button type="button" className={formulario.botonSecundario} onClick={reiniciar}>
              {t("cancelar")}
            </button>
            <button type="submit" className={formulario.boton} disabled={!codigo.trim() || enviando}>
              {t("confirmar")}
            </button>
          </div>
        </form>
      )}

      {estado.paso === "codigos" && (
        <>
          <Aviso tipo="exito">{t("activado")}</Aviso>
          <p>{t("guardaCodigos")}</p>
          <ul className={estilos.codigos}>
            {estado.codigos.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className={formulario.fila}>
            <button type="button" className={formulario.botonSecundario} onClick={() => descargarCodigos(estado.codigos)}>
              {t("descargar")}
            </button>
            <button
              type="button"
              className={formulario.boton}
              onClick={() => {
                reiniciar();
                router.refresh();
              }}
            >
              {t("hecho")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
