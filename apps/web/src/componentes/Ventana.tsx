"use client";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type ReactNode } from "react";
import estilos from "./ventana.module.css";

/**
 * Ventana modal (spec 006, R11 y R12): un `<dialog>` nativo, que atrapa el foco,
 * se cierra con Escape, con la ✕ o pulsando fuera, y devuelve el foco al cerrar.
 */
export function Ventana({ titulo, alCerrar, children }: { titulo: ReactNode; alCerrar: () => void; children: ReactNode }) {
  const t = useTranslations("Comun");
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const ventana = ref.current;
    if (ventana && !ventana.open) ventana.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={estilos.ventana}
      aria-labelledby={idTitulo}
      onClose={alCerrar}
      onClick={(e) => {
        // Pulsar fuera del contenido (en el fondo) la cierra.
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className={estilos.contenido}>
        <div className={estilos.cabecera}>
          <h2 id={idTitulo}>{titulo}</h2>
          <button type="button" className={estilos.cerrar} onClick={() => ref.current?.close()} aria-label={t("cerrar")}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
