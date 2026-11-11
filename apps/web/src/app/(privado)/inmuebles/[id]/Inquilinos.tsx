"use client";
import type { Habitacion, Inquilino, Ocupacion } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import { Campo } from "../../../../componentes/Campo";
import formulario from "../../../../componentes/formulario.module.css";
import { formatoFecha } from "../../../../lib/fechas";
import { useAccion } from "../../../../lib/use-accion";
import estilos from "../../privado.module.css";
import propias from "./detalle.module.css";

/** Qué formulario está abierto: uno cada vez en toda la sección. */
type Abierto =
  | { tipo: "renombrar" | "salida" | "cambio" | "estancia"; inquilinoId: string }
  | { tipo: "corregir"; inquilinoId: string; ocupacion: Ocupacion }
  | { tipo: "nuevo" }
  | null;

/** Inquilinos y sus estancias (spec 007, R6–R9). */
export function Inquilinos({
  inmuebleId,
  inquilinos,
  habitaciones,
  hoy,
}: {
  inmuebleId: string;
  inquilinos: Inquilino[];
  habitaciones: Habitacion[];
  hoy: string;
}) {
  const t = useTranslations("Detalle");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const { enviando, error, ejecutar, limpiarError } = useAccion();
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [nombre, setNombre] = useState("");
  const [habitacionId, setHabitacionId] = useState("");
  const [entrada, setEntrada] = useState(hoy);
  const [salida, setSalida] = useState(hoy);
  const [sigue, setSigue] = useState(true);

  const nombreHabitacion = (id: string) => habitaciones.find((h) => h.id === id)?.nombre ?? "—";
  const base = `/inmuebles/${inmuebleId}`;
  const cerrar = () => setAbierto(null);

  const abrir = (siguiente: Abierto, valores: Partial<{ nombre: string; habitacionId: string; entrada: string; salida: string | null }> = {}) => {
    limpiarError();
    setNombre(valores.nombre ?? "");
    setHabitacionId(valores.habitacionId ?? habitaciones[0]?.id ?? "");
    setEntrada(valores.entrada ?? hoy);
    setSalida(valores.salida ?? hoy);
    setSigue(valores.salida === null || valores.salida === undefined);
    setAbierto(siguiente);
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!abierto) return;
    switch (abierto.tipo) {
      case "nuevo":
        return ejecutar(
          `${base}/inquilinos`,
          { cuerpo: { nombre, ...(habitacionId && { ocupacion: { habitacionId, entrada } }) } },
          cerrar,
        );
      case "renombrar":
        return ejecutar(`${base}/inquilinos/${abierto.inquilinoId}`, { metodo: "PATCH", cuerpo: { nombre } }, cerrar);
      case "salida": {
        const abierta = inquilinos.find((q) => q.id === abierto.inquilinoId)?.ocupaciones.find((o) => o.salida === null);
        if (!abierta) return;
        return ejecutar(`${base}/ocupaciones/${abierta.id}`, { metodo: "PATCH", cuerpo: { salida } }, cerrar);
      }
      case "cambio":
        return ejecutar(`${base}/inquilinos/${abierto.inquilinoId}/cambio-habitacion`, { cuerpo: { habitacionId, fecha: entrada } }, cerrar);
      case "estancia":
        return ejecutar(`${base}/inquilinos/${abierto.inquilinoId}/ocupaciones`, { cuerpo: { habitacionId, entrada } }, cerrar);
      case "corregir":
        return ejecutar(
          `${base}/ocupaciones/${abierto.ocupacion.id}`,
          { metodo: "PATCH", cuerpo: { entrada, salida: sigue ? null : salida } },
          cerrar,
        );
    }
  };

  const selectorHabitacion = (opciones: Habitacion[], conVacia = false) => (
    <div className={formulario.campo}>
      <label htmlFor="habitacion-inquilino" className={formulario.etiqueta}>
        {t("habitacion")}
      </label>
      <select
        id="habitacion-inquilino"
        className={propias.selector}
        value={habitacionId}
        onChange={(e) => setHabitacionId(e.target.value)}
      >
        {conVacia && <option value="">{t("sinHabitacion")}</option>}
        {opciones.map((h) => (
          <option key={h.id} value={h.id}>
            {h.nombre}
          </option>
        ))}
      </select>
    </div>
  );

  const botones = (texto: string, deshabilitado = false) => (
    <div className={propias.botones}>
      <button type="button" className={formulario.botonSecundario} onClick={cerrar}>
        {t("cancelar")}
      </button>
      <button type="submit" className={formulario.boton} disabled={enviando || deshabilitado}>
        {texto}
      </button>
    </div>
  );

  const formularioDe = (q: Inquilino) => {
    if (!abierto || abierto.tipo === "nuevo" || abierto.inquilinoId !== q.id) return null;
    const abierta = q.ocupaciones.find((o) => o.salida === null);
    return (
      <form className={propias.enLinea} onSubmit={enviar} noValidate>
        {error && <Aviso tipo="error">{te(error)}</Aviso>}
        {abierto.tipo === "renombrar" && (
          <>
            <Campo etiqueta={t("nombreInquilino")} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
            {botones(t("guardar"), !nombre.trim())}
          </>
        )}
        {abierto.tipo === "salida" && (
          <>
            <Campo etiqueta={t("fechaSalida")} type="date" autoFocus value={salida} onChange={(e) => setSalida(e.target.value)} />
            <p className={propias.suave}>{t("salidaExplicacion")}</p>
            {botones(t("registrarSalida"))}
          </>
        )}
        {abierto.tipo === "cambio" && (
          <>
            <div className={propias.dosColumnas}>
              {selectorHabitacion(habitaciones.filter((h) => h.id !== abierta?.habitacionId && !h.archivada))}
              <Campo etiqueta={t("fechaCambio")} type="date" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
            </div>
            <p className={propias.suave}>{t("cambioExplicacion")}</p>
            {botones(t("cambiarHabitacion"), !habitacionId)}
          </>
        )}
        {abierto.tipo === "estancia" && (
          <>
            <div className={propias.dosColumnas}>
              {selectorHabitacion(habitaciones.filter((h) => !h.archivada))}
              <Campo etiqueta={t("fechaEntrada")} type="date" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
            </div>
            {botones(t("anadirEstancia"))}
          </>
        )}
        {abierto.tipo === "corregir" && (
          <>
            <p className={propias.suave}>{nombreHabitacion(abierto.ocupacion.habitacionId)}</p>
            <div className={propias.dosColumnas}>
              <Campo etiqueta={t("fechaEntrada")} type="date" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
              {!sigue && (
                <Campo etiqueta={t("fechaSalida")} type="date" value={salida} onChange={(e) => setSalida(e.target.value)} />
              )}
            </div>
            <label className={formulario.casilla}>
              <input type="checkbox" checked={sigue} onChange={(e) => setSigue(e.target.checked)} />
              <span>{t("sigueViviendo")}</span>
            </label>
            {botones(t("guardar"))}
          </>
        )}
      </form>
    );
  };

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-inquilinos">
      <h2 id="titulo-inquilinos">{t("inquilinos")}</h2>
      {inquilinos.length === 0 && <p className={propias.suave}>{t("sinInquilinos")}</p>}
      <ul className={propias.lista}>
        {inquilinos.map((q) => {
          const abierta = q.ocupaciones.find((o) => o.salida === null);
          return (
            <li key={q.id} className={propias.elemento}>
              <span className={propias.nombre}>{q.nombre}</span>
              {q.ocupaciones.length === 0 ? (
                <p className={propias.suave}>{t("sinEstancias")}</p>
              ) : (
                <ul className={propias.estancias}>
                  {q.ocupaciones.map((o) => (
                    <li key={o.id} className={propias.fila}>
                      <span className={propias.suave}>
                        {nombreHabitacion(o.habitacionId)} ·{" "}
                        {o.salida === null
                          ? t("desdeFecha", { fecha: formatoFecha(o.entrada, idioma) })
                          : t("entreFechas", { entrada: formatoFecha(o.entrada, idioma), salida: formatoFecha(o.salida, idioma) })}
                      </span>
                      <button
                        type="button"
                        className={formulario.botonEnlace}
                        onClick={() =>
                          abrir({ tipo: "corregir", inquilinoId: q.id, ocupacion: o }, { entrada: o.entrada, salida: o.salida })
                        }
                      >
                        {t("corregirFechas")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {formularioDe(q) ?? (
                <div className={propias.acciones}>
                  {abierta ? (
                    <>
                      <button type="button" className={formulario.botonEnlace} onClick={() => abrir({ tipo: "salida", inquilinoId: q.id })}>
                        {t("registrarSalida")}
                      </button>
                      <button
                        type="button"
                        className={formulario.botonEnlace}
                        onClick={() =>
                          abrir(
                            { tipo: "cambio", inquilinoId: q.id },
                            { habitacionId: habitaciones.find((h) => h.id !== abierta.habitacionId && !h.archivada)?.id ?? "" },
                          )
                        }
                      >
                        {t("cambiarHabitacion")}
                      </button>
                    </>
                  ) : (
                    <button type="button" className={formulario.botonEnlace} onClick={() => abrir({ tipo: "estancia", inquilinoId: q.id })}>
                      {t("anadirEstancia")}
                    </button>
                  )}
                  <button
                    type="button"
                    className={formulario.botonEnlace}
                    onClick={() => abrir({ tipo: "renombrar", inquilinoId: q.id }, { nombre: q.nombre })}
                  >
                    {t("renombrar")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {abierto?.tipo === "nuevo" ? (
        <form className={propias.enLinea} onSubmit={enviar} noValidate>
          {error && <Aviso tipo="error">{te(error)}</Aviso>}
          <Campo etiqueta={t("nombreInquilino")} autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <div className={propias.dosColumnas}>
            {selectorHabitacion(habitaciones.filter((h) => !h.archivada), true)}
            {habitacionId && (
              <Campo etiqueta={t("fechaEntrada")} type="date" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
            )}
          </div>
          <p className={propias.suave}>{t("soloNombre")}</p>
          {botones(t("anadirInquilino"), !nombre.trim())}
        </form>
      ) : (
        <div>
          <button type="button" className={formulario.botonSecundario} onClick={() => abrir({ tipo: "nuevo" })}>
            {t("anadirInquilino")}
          </button>
        </div>
      )}
    </section>
  );
}
