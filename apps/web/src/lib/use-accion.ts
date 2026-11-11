"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { pedirApi } from "./api-cliente";
import type { ClaveError } from "./errores";

/**
 * Una acción de edición contra la API: si va bien, recarga los datos de la
 * página (componentes del servidor) y llama a `alTerminar`; si no, deja el error.
 */
export function useAccion() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);

  const ejecutar = async (ruta: string, opciones: { metodo?: string; cuerpo?: unknown }, alTerminar?: () => void) => {
    setEnviando(true);
    setError(null);
    const resultado = await pedirApi(ruta, opciones);
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return false;
    }
    router.refresh();
    alTerminar?.();
    return true;
  };

  return { enviando, error, ejecutar, limpiarError: () => setError(null) };
}
