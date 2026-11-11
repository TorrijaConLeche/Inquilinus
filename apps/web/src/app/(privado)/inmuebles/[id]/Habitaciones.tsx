"use client";
import type { Habitacion } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import { Campo } from "../../../../componentes/Campo";
import formulario from "../../../../componentes/formulario.module.css";
import { eurosACentimos, formatoEuros } from "../../../../lib/dinero";
import { formatoMes } from "../../../../lib/fechas";
import { useAccion } from "../../../../lib/use-accion";
import estilos from "../../privado.module.css";
import propias from "./detalle.module.css";

/** Qué formulario está abierto: uno cada vez. */
type Abierto = { tipo: "renombrar" | "precio"; id: string } | { tipo: "nueva" } | null;

/** Habitaciones con su precio actual e historial (spec 007, R3 y R4). */
export function Habitaciones({
  inmuebleId,
  habitaciones,
  mesActual,
}: {
  inmuebleId: string;
  habitaciones: Habitacion[];
  mesActual: string;
}) {
  const t = useTranslations("Detalle");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const { enviando, error, ejecutar, limpiarError } = useAccion();
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [desdeMes, setDesdeMes] = useState(mesActual);
  const [revisado, setRevisado] = useState(false);

  const abrir = (siguiente: Abierto, valores: { nombre?: string } = {}) => {
    limpiarError();
    setRevisado(false);
    setNombre(valores.nombre ?? "");
    setPrecio("");
    setDesdeMes(mesActual);
    setAbierto(siguiente);
  };
  const cerrar = () => setAbierto(null);
  const centimos = eurosACentimos(precio);

  const renombrar = async (e: FormEvent, id: string) => {
    e.preventDefault();
    await ejecutar(`/inmuebles/${inmuebleId}/habitaciones/${id}`, { metodo: "PATCH", cuerpo: { nombre } }, cerrar);
  };

  const cambiarPrecio = async (e: FormEvent, id: string) => {
    e.preventDefault();
    setRevisado(true);
    if (centimos === null) return;
    await ejecutar(`/inmuebles/${inmuebleId}/habitaciones/${id}/precios`, { cuerpo: { desdeMes, precioMensual: centimos } }, cerrar);
  };

  const anadir = async (e: FormEvent) => {
    e.preventDefault();
    setRevisado(true);
    if (centimos === null || !nombre.trim()) return;
    await ejecutar(
      `/inmuebles/${inmuebleId}/habitaciones`,
      { cuerpo: { nombre, precioMensual: centimos, ...(desdeMes !== mesActual && { desdeMes }) } },
      cerrar,
    );
  };

  const campoPrecio = (
    <Campo
      etiqueta={t("precioMensual")}
      inputMode="decimal"
      placeholder="450"
      value={precio}
      error={revisado && centimos === null ? te("importeInvalido") : null}
      onChange={(e) => setPrecio(e.target.value)}
    />
  );

  const botones = (textoGuardar: string) => (
    <div className={propias.botones}>
      <button type="button" className={formulario.botonSecundario} onClick={cerrar}>
        {t("cancelar")}
      </button>
      <button type="submit" className={formulario.boton} disabled={enviando}>
        {textoGuardar}
      </button>
    </div>
  );

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-habitaciones">
      <h2 id="titulo-habitaciones">{t("habitaciones")}</h2>
      <ul className={propias.lista}>
        {habitaciones.map((h) => (
          <li key={h.id} className={propias.elemento}>
            <div className={propias.fila}>
              <span className={propias.nombre}>{h.nombre}</span>
              <span className={propias.importe}>
                {h.precioActual === null ? t("sinPrecio") : t("alMes", { precio: formatoEuros(h.precioActual, idioma) })}
              </span>
            </div>
            {h.historialPrecios.length > 0 && (
              <details className={propias.historial}>
                <summary>{t("historial")}</summary>
                <ul>
                  {[...h.historialPrecios].reverse().map((p) => (
                    <li key={p.desdeMes}>
                      {t("desde", { mes: formatoMes(p.desdeMes, idioma), precio: formatoEuros(p.precioMensual, idioma) })}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {abierto && abierto.tipo === "renombrar" && abierto.id === h.id ? (
              <form className={propias.enLinea} onSubmit={(e) => renombrar(e, h.id)} noValidate>
                {error && <Aviso tipo="error">{te(error)}</Aviso>}
                <Campo etiqueta={t("nombreHabitacion")} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
                {botones(t("guardar"))}
              </form>
            ) : abierto && abierto.tipo === "precio" && abierto.id === h.id ? (
              <form className={propias.enLinea} onSubmit={(e) => cambiarPrecio(e, h.id)} noValidate>
                {error && <Aviso tipo="error">{te(error)}</Aviso>}
                <div className={propias.dosColumnas}>
                  {campoPrecio}
                  <Campo
                    etiqueta={t("desdeMes")}
                    type="month"
                    value={desdeMes}
                    onChange={(e) => setDesdeMes(e.target.value)}
                  />
                </div>
                <p className={propias.suave}>{t("precioExplicacion")}</p>
                {botones(t("guardarPrecio"))}
              </form>
            ) : (
              <div className={propias.acciones}>
                <button type="button" className={formulario.botonEnlace} onClick={() => abrir({ tipo: "precio", id: h.id })}>
                  {t("cambiarPrecio")}
                </button>
                <button
                  type="button"
                  className={formulario.botonEnlace}
                  onClick={() => abrir({ tipo: "renombrar", id: h.id }, { nombre: h.nombre })}
                >
                  {t("renombrar")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {abierto?.tipo === "nueva" ? (
        <form className={propias.enLinea} onSubmit={anadir} noValidate>
          {error && <Aviso tipo="error">{te(error)}</Aviso>}
          <div className={propias.dosColumnas}>
            <Campo
              etiqueta={t("nombreHabitacion")}
              autoFocus
              value={nombre}
              error={revisado && !nombre.trim() ? te("nombreObligatorio") : null}
              onChange={(e) => setNombre(e.target.value)}
            />
            {campoPrecio}
          </div>
          <Campo etiqueta={t("desdeMes")} type="month" max={mesActual} value={desdeMes} onChange={(e) => setDesdeMes(e.target.value)} />
          {botones(t("anadirHabitacion"))}
        </form>
      ) : (
        <div>
          <button type="button" className={formulario.botonSecundario} onClick={() => abrir({ tipo: "nueva" })}>
            {t("anadirHabitacion")}
          </button>
        </div>
      )}
    </section>
  );
}
