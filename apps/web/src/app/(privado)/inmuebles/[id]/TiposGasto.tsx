"use client";
import type { TipoGasto } from "@inquilinus/contracts";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import { Campo } from "../../../../componentes/Campo";
import formulario from "../../../../componentes/formulario.module.css";
import { useAccion } from "../../../../lib/use-accion";
import estilos from "../../privado.module.css";
import propias from "./detalle.module.css";

/**
 * Tipos de gasto (spec 007, R10). El color se asigna solo (el primero libre);
 * el selector de color y su paleta llegan con la tarea 6.1.
 */
export function TiposGasto({ inmuebleId, tiposGasto }: { inmuebleId: string; tiposGasto: TipoGasto[] }) {
  const t = useTranslations("Detalle");
  const te = useTranslations("Errores");
  const { enviando, error, ejecutar, limpiarError } = useAccion();
  const [abierto, setAbierto] = useState<string | "nuevo" | null>(null);
  const [nombre, setNombre] = useState("");

  const abrir = (cual: string, valor = "") => {
    limpiarError();
    setNombre(valor);
    setAbierto(cual);
  };
  const cerrar = () => setAbierto(null);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (abierto === "nuevo") await ejecutar(`/inmuebles/${inmuebleId}/tipos-gasto`, { cuerpo: { nombre } }, cerrar);
    else if (abierto) await ejecutar(`/inmuebles/${inmuebleId}/tipos-gasto/${abierto}`, { metodo: "PATCH", cuerpo: { nombre } }, cerrar);
  };

  const formularioNombre = (
    <form className={propias.enLinea} onSubmit={guardar} noValidate>
      {error && <Aviso tipo="error">{te(error)}</Aviso>}
      <Campo etiqueta={t("nombreGasto")} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <div className={propias.botones}>
        <button type="button" className={formulario.botonSecundario} onClick={cerrar}>
          {t("cancelar")}
        </button>
        <button type="submit" className={formulario.boton} disabled={enviando || !nombre.trim()}>
          {abierto === "nuevo" ? t("anadirGasto") : t("guardar")}
        </button>
      </div>
    </form>
  );

  const activos = tiposGasto.filter((tg) => !tg.archivado);

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-gastos">
      <h2 id="titulo-gastos">{t("gastos")}</h2>
      {activos.length === 0 && <p className={propias.suave}>{t("sinGastos")}</p>}
      <ul className={propias.lista}>
        {activos.map((tg) => (
          <li key={tg.id} className={propias.elemento}>
            <div className={propias.fila}>
              <span className={propias.nombre}>{tg.nombre}</span>
              <span className={propias.etiquetaColor}>{t(`colores.${tg.color}`)}</span>
            </div>
            {abierto === tg.id ? (
              formularioNombre
            ) : (
              <div className={propias.acciones}>
                <button type="button" className={formulario.botonEnlace} onClick={() => abrir(tg.id, tg.nombre)}>
                  {t("renombrar")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {abierto === "nuevo" ? (
        formularioNombre
      ) : (
        <div>
          <button type="button" className={formulario.botonSecundario} onClick={() => abrir("nuevo")}>
            {t("anadirGasto")}
          </button>
        </div>
      )}
    </section>
  );
}
