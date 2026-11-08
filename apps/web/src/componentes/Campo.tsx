import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import estilos from "./formulario.module.css";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  etiqueta: string;
  /** Texto pequeño junto a la etiqueta, por ejemplo "opcional". */
  marca?: string;
  ayuda?: ReactNode;
  error?: string | null;
}

/** Campo con etiqueta, ayuda y error asociados para lectores de pantalla. */
export function Campo({ etiqueta, marca, ayuda, error, ...entrada }: Props) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describe = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ");
  return (
    <div className={estilos.campo}>
      <label htmlFor={id} className={estilos.etiqueta}>
        {etiqueta} {marca && <span className={estilos.opcional}>({marca})</span>}
      </label>
      <input
        id={id}
        className={estilos.entrada}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe || undefined}
        {...entrada}
      />
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
