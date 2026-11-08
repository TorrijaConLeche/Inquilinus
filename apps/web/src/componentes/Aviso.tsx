import type { ReactNode } from "react";
import estilos from "./formulario.module.css";

const CLASES = { error: estilos.avisoError, exito: estilos.avisoExito, info: estilos.avisoInfo };

/** Mensaje que los lectores de pantalla anuncian al aparecer. */
export function Aviso({ tipo, children }: { tipo: keyof typeof CLASES; children: ReactNode }) {
  return (
    <p className={CLASES[tipo]} role={tipo === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
