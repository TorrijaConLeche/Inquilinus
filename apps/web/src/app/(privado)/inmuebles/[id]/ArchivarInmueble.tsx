"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import { Campo } from "../../../../componentes/Campo";
import formulario from "../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../lib/api-cliente";
import type { ClaveError } from "../../../../lib/errores";
import { useAccion } from "../../../../lib/use-accion";
import estilos from "../../privado.module.css";
import propias from "./detalle.module.css";

/** Archivar o restaurar el inmueble (R11c) y borrarlo escribiendo su nombre (R13). */
export function ArchivarInmueble({ id, nombre, archivado }: { id: string; nombre: string; archivado: boolean }) {
  const t = useTranslations("Detalle");
  const te = useTranslations("Errores");
  const router = useRouter();
  const { enviando, error, ejecutar, limpiarError } = useAccion();
  const [borrando, setBorrando] = useState(false);
  const [escrito, setEscrito] = useState("");
  const [enviandoBorrado, setEnviandoBorrado] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<ClaveError | null>(null);
  const coincide = escrito.trim() !== "" && escrito.trim() === nombre.trim();

  const borrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!coincide) return;
    setEnviandoBorrado(true);
    setErrorBorrado(null);
    // Sin recargar esta página (ya no existiría): se va directamente a la lista.
    const resultado = await pedirApi(`/inmuebles/${id}`, { metodo: "DELETE", cuerpo: { nombre: escrito } });
    if (!resultado.ok) {
      setEnviandoBorrado(false);
      setErrorBorrado(resultado.error);
      return;
    }
    router.push("/inmuebles");
    router.refresh();
  };

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-archivar">
      <h2 id="titulo-archivar">{t("archivarYBorrar")}</h2>
      {error && <Aviso tipo="error">{te(error)}</Aviso>}

      <div className={propias.opcionPeligro}>
        <p className={propias.suave}>{archivado ? t("restaurarExplicacion") : t("archivarExplicacion")}</p>
        <div>
          <button
            type="button"
            className={formulario.botonSecundario}
            disabled={enviando}
            onClick={() => void ejecutar(`/inmuebles/${id}`, { metodo: "PATCH", cuerpo: { archivado: !archivado } })}
          >
            {archivado ? t("restaurarInmueble") : t("archivarInmueble")}
          </button>
        </div>
      </div>

      <div className={propias.opcionPeligro}>
        <p className={propias.suave}>{t("borrarInmuebleExplicacion")}</p>
        {borrando ? (
          <form className={propias.confirmacion} onSubmit={borrar} noValidate>
            {errorBorrado && <Aviso tipo="error">{te(errorBorrado)}</Aviso>}
            <Campo
              etiqueta={t("escribeNombre", { nombre })}
              autoFocus
              autoComplete="off"
              value={escrito}
              onChange={(e) => setEscrito(e.target.value)}
            />
            <div className={propias.botones}>
              <button type="button" className={formulario.botonSecundario} onClick={() => setBorrando(false)}>
                {t("cancelar")}
              </button>
              <button type="submit" className={formulario.botonPeligro} disabled={enviandoBorrado || !coincide}>
                {t("borrarInmuebleDefinitivo")}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <button
              type="button"
              className={formulario.botonPeligro}
              onClick={() => {
                limpiarError();
                setErrorBorrado(null);
                setEscrito("");
                setBorrando(true);
              }}
            >
              {t("borrarInmueble")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
