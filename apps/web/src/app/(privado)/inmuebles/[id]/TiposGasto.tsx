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
 * el selector de color y su paleta llegan con la tarea 6.1. Con facturas se
 * archivan; sin ellas, se borran (R11).
 */
export function TiposGasto({ inmuebleId, tiposGasto }: { inmuebleId: string; tiposGasto: TipoGasto[] }) {
  const t = useTranslations("Detalle");
  const te = useTranslations("Errores");
  const { enviando, error, ejecutar, limpiarError } = useAccion();
  const [abierto, setAbierto] = useState<string | "nuevo" | null>(null);
  const [nombre, setNombre] = useState("");
  const [borrando, setBorrando] = useState<string | null>(null);

  const abrir = (cual: string, valor = "") => {
    limpiarError();
    setBorrando(null);
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
  const archivados = tiposGasto.filter((tg) => tg.archivado);

  const archivar = (id: string, archivado: boolean) => {
    setAbierto(null);
    setBorrando(null);
    void ejecutar(`/inmuebles/${inmuebleId}/tipos-gasto/${id}`, { metodo: "PATCH", cuerpo: { archivado } });
  };

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-gastos">
      <h2 id="titulo-gastos">{t("gastos")}</h2>
      {error && !abierto && !borrando && <Aviso tipo="error">{te(error)}</Aviso>}
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
            ) : borrando === tg.id ? (
              <div className={propias.confirmacion}>
                {error && <Aviso tipo="error">{te(error)}</Aviso>}
                <span>{t("confirmarBorrar", { que: tg.nombre })}</span>
                <div className={propias.botones}>
                  <button type="button" className={formulario.botonSecundario} onClick={() => setBorrando(null)}>
                    {t("cancelar")}
                  </button>
                  <button
                    type="button"
                    className={formulario.botonPeligro}
                    disabled={enviando}
                    onClick={() =>
                      ejecutar(`/inmuebles/${inmuebleId}/tipos-gasto/${tg.id}`, { metodo: "DELETE" }, () => setBorrando(null))
                    }
                  >
                    {t("siBorrar")}
                  </button>
                </div>
              </div>
            ) : (
              <div className={propias.acciones}>
                <button type="button" className={formulario.botonEnlace} onClick={() => abrir(tg.id, tg.nombre)}>
                  {t("renombrar")}
                </button>
                {/* R11: con facturas se archiva; sin ellas, se borra. */}
                {tg.conFacturas ? (
                  <button type="button" className={formulario.botonEnlace} disabled={enviando} onClick={() => archivar(tg.id, true)}>
                    {t("archivar")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={formulario.botonEnlace}
                    onClick={() => {
                      limpiarError();
                      setAbierto(null);
                      setBorrando(tg.id);
                    }}
                  >
                    {t("borrar")}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {archivados.length > 0 && (
        <details className={propias.archivadas}>
          <summary>{t("gastosArchivados", { n: archivados.length })}</summary>
          <ul className={propias.estancias}>
            {archivados.map((tg) => (
              <li key={tg.id} className={propias.fila}>
                <span>{tg.nombre}</span>
                <button type="button" className={formulario.botonEnlace} disabled={enviando} onClick={() => archivar(tg.id, false)}>
                  {t("restaurar")}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
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
