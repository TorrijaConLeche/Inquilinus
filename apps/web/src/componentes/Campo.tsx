"use client";
import { useTranslations } from "next-intl";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useId, useState } from "react";
import estilos from "./formulario.module.css";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  etiqueta: string;
  /** Texto pequeño junto a la etiqueta, por ejemplo "opcional". */
  marca?: string;
  ayuda?: ReactNode;
  error?: string | null;
}

/**
 * Campo con etiqueta, ayuda y error asociados para lectores de pantalla.
 * Los de contraseña llevan un botón para mostrarla u ocultarla.
 */
export function Campo({ etiqueta, marca, ayuda, error, type, ...entrada }: Props) {
  const t = useTranslations("Comun");
  const id = useId();
  const [visible, setVisible] = useState(false);
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describe = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ");
  const esContrasena = type === "password";

  const campo = (
    <input
      id={id}
      className={estilos.entrada}
      type={esContrasena && visible ? "text" : type}
      aria-invalid={error ? true : undefined}
      aria-describedby={describe || undefined}
      {...(esContrasena ? { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } : {})}
      {...entrada}
    />
  );

  return (
    <div className={estilos.campo}>
      <label htmlFor={id} className={estilos.etiqueta}>
        {etiqueta} {marca && <span className={estilos.opcional}>({marca})</span>}
      </label>
      {esContrasena ? (
        <div className={estilos.conBoton}>
          {campo}
          <button
            type="button"
            className={estilos.botonOjo}
            onClick={() => setVisible(!visible)}
            aria-controls={id}
            aria-pressed={visible}
            aria-label={visible ? t("ocultarContrasena") : t("mostrarContrasena")}
            title={visible ? t("ocultarContrasena") : t("mostrarContrasena")}
          >
            {visible ? <OjoTachado /> : <Ojo />}
          </button>
        </div>
      ) : (
        campo
      )}
      {ayuda && (
        <span id={idAyuda} className={estilos.ayuda}>
          {ayuda}
        </span>
      )}
      {error && (
        <span id={idError} className={estilos.textoError}>
          {error}
        </span>
      )}
    </div>
  );
}

const Ojo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const OjoTachado = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="M3 3l18 18" />
  </svg>
);
