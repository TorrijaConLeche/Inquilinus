"use client";
// Asistente de alta del inmueble (spec 007, R1), en 5 pasos:
// 1) nombre y dirección; 2) modalidad, meses parciales y día de cobro;
// 3) habitaciones con su precio → aquí se crea el inmueble, todo o nada;
// 4) tipos de gasto y 5) inquilinos, opcionales: cada uno se guarda al momento.
import type { Inmueble, Inquilino, TipoGasto } from "@inquilinus/contracts";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import { Campo } from "../../../../componentes/Campo";
import formulario from "../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../lib/api-cliente";
import { eurosACentimos } from "../../../../lib/dinero";
import type { ClaveError } from "../../../../lib/errores";
import estilos from "../../privado.module.css";
import propias from "../inmuebles.module.css";

type Paso = 1 | 2 | 3 | 4 | 5;
type Modalidad = "habitaciones" | "entero";
type MesesParciales = "mes_completo" | "prorrateo";

interface FilaHabitacion {
  clave: number;
  nombre: string;
  precio: string;
}
interface FilaInquilino {
  clave: number;
  nombre: string;
  habitacionId: string;
  entrada: string;
}

/** Tipos de gasto habituales que se ofrecen con un toque. */
const SUGERENCIAS = ["luz", "agua", "gas", "internet", "comunidad"] as const;

let siguienteClave = 1;
const clave = () => siguienteClave++;

export function Asistente({ mesActual, hoy }: { mesActual: string; hoy: string }) {
  const t = useTranslations("Asistente");
  const te = useTranslations("Errores");
  const router = useRouter();
  const idLeyenda = useId();

  const [paso, setPaso] = useState<Paso>(1);
  const [error, setError] = useState<ClaveError | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Pasos 1 y 2
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [modalidad, setModalidad] = useState<Modalidad>("habitaciones");
  const [mesesParciales, setMesesParciales] = useState<MesesParciales>("mes_completo");
  const [diaCobro, setDiaCobro] = useState(1);

  // Paso 3
  const [habitaciones, setHabitaciones] = useState<FilaHabitacion[]>([{ clave: clave(), nombre: "", precio: "" }]);
  const [desdeAntes, setDesdeAntes] = useState(false);
  const [desdeMes, setDesdeMes] = useState(mesActual);
  const [revisado, setRevisado] = useState(false);

  // Inmueble ya creado (tras el paso 3)
  const [inmueble, setInmueble] = useState<Inmueble | null>(null);

  // Paso 4
  const [sugeridos, setSugeridos] = useState<string[]>([]);
  const [otroGasto, setOtroGasto] = useState("");
  const [otrosGastos, setOtrosGastos] = useState<string[]>([]);

  // Paso 5
  const [inquilinos, setInquilinos] = useState<FilaInquilino[]>([]);

  const irA = (siguiente: Paso) => {
    setError(null);
    setPaso(siguiente);
    // El foco vuelve al principio para que el lector de pantalla anuncie el paso.
    requestAnimationFrame(() => document.getElementById(idLeyenda)?.focus());
  };

  // --- Paso 3: validar y crear el inmueble ----------------------------------

  const precioDe = (fila: FilaHabitacion) => eurosACentimos(fila.precio);
  const filaValida = (fila: FilaHabitacion) => fila.nombre.trim() !== "" && precioDe(fila) !== null;

  const crearInmueble = async (e: FormEvent) => {
    e.preventDefault();
    setRevisado(true);
    if (habitaciones.length === 0 || !habitaciones.every(filaValida)) return;
    setEnviando(true);
    setError(null);
    const resultado = await pedirApi<Inmueble>("/inmuebles", {
      cuerpo: {
        nombre,
        direccion: direccion.trim() || null,
        modalidad,
        mesesParciales,
        diaCobro,
        habitaciones: habitaciones.map((h) => ({
          nombre: h.nombre,
          precioMensual: precioDe(h)!,
          ...(desdeAntes && { desdeMes }),
        })),
      },
    });
    setEnviando(false);
    if (!resultado.ok) return setError(resultado.error);
    setInmueble(resultado.datos);
    const primera = resultado.datos.habitaciones[0]?.id ?? "";
    setInquilinos([{ clave: clave(), nombre: "", habitacionId: primera, entrada: hoy }]);
    irA(4);
  };

  // --- Paso 4: tipos de gasto -----------------------------------------------

  const guardarGastos = async (e: FormEvent) => {
    e.preventDefault();
    if (!inmueble) return;
    const nombres = [...sugeridos.map((s) => t(`sugerencias.${s}`)), ...otrosGastos];
    setEnviando(true);
    setError(null);
    for (const nombreGasto of nombres) {
      const r = await pedirApi<TipoGasto>(`/inmuebles/${inmueble.id}/tipos-gasto`, { cuerpo: { nombre: nombreGasto } });
      if (!r.ok) {
        setEnviando(false);
        return setError(r.error);
      }
    }
    setEnviando(false);
    // Lo guardado no se repite si vuelve atrás y adelante.
    setSugeridos([]);
    setOtrosGastos([]);
    irA(5);
  };

  // --- Paso 5: inquilinos ---------------------------------------------------

  const terminar = async (e: FormEvent) => {
    e.preventDefault();
    if (!inmueble) return;
    const conNombre = inquilinos.filter((q) => q.nombre.trim() !== "");
    setEnviando(true);
    setError(null);
    const guardados: number[] = [];
    for (const q of conNombre) {
      const r = await pedirApi<Inquilino>(`/inmuebles/${inmueble.id}/inquilinos`, {
        cuerpo: { nombre: q.nombre, ocupacion: { habitacionId: q.habitacionId, entrada: q.entrada } },
      });
      if (!r.ok) {
        setEnviando(false);
        // Los anteriores ya están guardados: se quitan de la lista para no repetirlos.
        setInquilinos((actuales) => actuales.filter((a) => !guardados.includes(a.clave)));
        return setError(r.error);
      }
      guardados.push(q.clave);
    }
    router.push(`/inmuebles/${inmueble.id}?creado=1`);
    router.refresh();
  };

  // --- Pantalla ---------------------------------------------------------------

  const NOMBRES_PASOS = [t("pasos.datos"), t("pasos.opciones"), t("pasos.habitaciones"), t("pasos.gastos"), t("pasos.inquilinos")];

  return (
    <section className={estilos.seccion} aria-labelledby={idLeyenda}>
      <ol className={propias.pasos} aria-hidden="true">
        {NOMBRES_PASOS.map((n, i) => (
          <li key={n} className={i < paso ? propias.pasoHecho : propias.paso} />
        ))}
      </ol>
      <p className={propias.contadorPaso}>{t("contador", { paso, total: 5 })}</p>
      <h2 id={idLeyenda} tabIndex={-1}>
        {NOMBRES_PASOS[paso - 1]}
      </h2>

      {error && <Aviso tipo="error">{te(error)}</Aviso>}

      {paso === 1 && (
        <form
          className={formulario.formulario}
          onSubmit={(e) => {
            e.preventDefault();
            if (nombre.trim()) irA(2);
          }}
          noValidate
        >
          <Campo
            etiqueta={t("nombre")}
            ayuda={t("nombreAyuda")}
            required
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <Campo
            etiqueta={t("direccion")}
            marca={t("opcional")}
            autoComplete="street-address"
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
          />
          <div className={propias.acciones}>
            <span />
            <button type="submit" className={formulario.boton} disabled={!nombre.trim()}>
              {t("siguiente")}
            </button>
          </div>
        </form>
      )}

      {paso === 2 && (
        <form
          className={formulario.formulario}
          onSubmit={(e) => {
            e.preventDefault();
            irA(3);
          }}
          noValidate
        >
          <fieldset className={propias.tarjetas}>
            <legend className={propias.leyenda}>{t("modalidad")}</legend>
            {(["habitaciones", "entero"] as const).map((m) => (
              <label key={m} className={propias.tarjetaOpcion}>
                <input type="radio" name="modalidad" checked={modalidad === m} onChange={() => setModalidad(m)} />
                <strong>{t(`modalidades.${m}.titulo`)}</strong>
                <span>{t(`modalidades.${m}.explicacion`)}</span>
              </label>
            ))}
          </fieldset>
          <p className={estilos.suave}>{t("modalidadFija")}</p>

          <fieldset className={propias.tarjetas}>
            <legend className={propias.leyenda}>{t("mesesParciales")}</legend>
            {(["mes_completo", "prorrateo"] as const).map((m) => (
              <label key={m} className={propias.tarjetaOpcion}>
                <input type="radio" name="meses" checked={mesesParciales === m} onChange={() => setMesesParciales(m)} />
                <strong>{t(`parciales.${m}.titulo`)}</strong>
                <span>{t(`parciales.${m}.explicacion`)}</span>
              </label>
            ))}
          </fieldset>

          <div className={formulario.campo}>
            <label htmlFor="dia-cobro" className={formulario.etiqueta}>
              {t("diaCobro")}
            </label>
            <select
              id="dia-cobro"
              className={propias.selector}
              value={diaCobro}
              onChange={(e) => setDiaCobro(Number(e.target.value))}
              aria-describedby="dia-cobro-ayuda"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span id="dia-cobro-ayuda" className={formulario.ayuda}>
              {t("diaCobroAyuda")}
            </span>
          </div>

          <div className={propias.acciones}>
            <button type="button" className={formulario.botonSecundario} onClick={() => irA(1)}>
              {t("atras")}
            </button>
            <button type="submit" className={formulario.boton}>
              {t("siguiente")}
            </button>
          </div>
        </form>
      )}

      {paso === 3 && (
        <form className={formulario.formulario} onSubmit={crearInmueble} noValidate>
          <p className={estilos.suave}>{modalidad === "entero" ? t("habitacionesAyudaEntero") : t("habitacionesAyuda")}</p>
          {habitaciones.map((h, i) => (
            <div key={h.clave} className={propias.filaHabitacion}>
              <Campo
                etiqueta={t("habitacionNombre", { n: i + 1 })}
                placeholder={modalidad === "entero" && habitaciones.length === 1 ? t("vivienda") : t("habitacionEjemplo", { n: i + 1 })}
                value={h.nombre}
                error={revisado && !h.nombre.trim() ? te("nombreObligatorio") : null}
                onChange={(e) => setHabitaciones(habitaciones.map((x) => (x.clave === h.clave ? { ...x, nombre: e.target.value } : x)))}
              />
              <Campo
                etiqueta={t("precio")}
                inputMode="decimal"
                placeholder="450"
                value={h.precio}
                error={revisado && precioDe(h) === null ? te("importeInvalido") : null}
                onChange={(e) => setHabitaciones(habitaciones.map((x) => (x.clave === h.clave ? { ...x, precio: e.target.value } : x)))}
              />
              {habitaciones.length > 1 && (
                <button
                  type="button"
                  className={`${formulario.botonSecundario} ${propias.quitar}`}
                  onClick={() => setHabitaciones(habitaciones.filter((x) => x.clave !== h.clave))}
                  aria-label={t("quitarHabitacion", { n: i + 1 })}
                >
                  {t("quitar")}
                </button>
              )}
            </div>
          ))}
          <div>
            <button
              type="button"
              className={formulario.botonSecundario}
              onClick={() => setHabitaciones([...habitaciones, { clave: clave(), nombre: "", precio: "" }])}
            >
              {t("anadirHabitacion")}
            </button>
          </div>

          <label className={formulario.casilla}>
            <input type="checkbox" checked={desdeAntes} onChange={(e) => setDesdeAntes(e.target.checked)} />
            <span>{t("desdeAntes")}</span>
          </label>
          {desdeAntes && (
            <Campo
              etiqueta={t("desdeMes")}
              type="month"
              max={mesActual}
              value={desdeMes}
              ayuda={t("desdeMesAyuda")}
              onChange={(e) => setDesdeMes(e.target.value)}
            />
          )}

          <div className={propias.acciones}>
            <button type="button" className={formulario.botonSecundario} onClick={() => irA(2)}>
              {t("atras")}
            </button>
            <button type="submit" className={formulario.boton} disabled={enviando}>
              {enviando ? t("creando") : t("crear")}
            </button>
          </div>
        </form>
      )}

      {paso === 4 && inmueble && (
        <form className={formulario.formulario} onSubmit={guardarGastos} noValidate>
          <Aviso tipo="exito">{t("inmuebleCreado", { nombre: inmueble.nombre })}</Aviso>
          <p className={estilos.suave}>{t("gastosAyuda")}</p>
          <fieldset className={propias.chips}>
            <legend className="sr-only">{t("pasos.gastos")}</legend>
            {SUGERENCIAS.map((s) => (
              <label key={s} className={propias.chip}>
                <input
                  type="checkbox"
                  checked={sugeridos.includes(s)}
                  onChange={(e) => setSugeridos(e.target.checked ? [...sugeridos, s] : sugeridos.filter((x) => x !== s))}
                />
                {t(`sugerencias.${s}`)}
              </label>
            ))}
            {otrosGastos.map((g) => (
              <label key={g} className={propias.chip}>
                <input type="checkbox" checked onChange={() => setOtrosGastos(otrosGastos.filter((x) => x !== g))} />
                {g}
              </label>
            ))}
          </fieldset>
          <div className={propias.filaHabitacion}>
            <Campo etiqueta={t("otroGasto")} value={otroGasto} onChange={(e) => setOtroGasto(e.target.value)} />
            <span />
            <button
              type="button"
              className={`${formulario.botonSecundario} ${propias.quitar}`}
              disabled={!otroGasto.trim()}
              onClick={() => {
                const limpio = otroGasto.trim();
                if (limpio && !otrosGastos.includes(limpio)) setOtrosGastos([...otrosGastos, limpio]);
                setOtroGasto("");
              }}
            >
              {t("anadir")}
            </button>
          </div>
          <p className={estilos.suave}>{t("gastosColor")}</p>
          <div className={propias.acciones}>
            <button type="button" className={formulario.botonSecundario} onClick={() => irA(5)}>
              {t("saltar")}
            </button>
            <button
              type="submit"
              className={formulario.boton}
              disabled={enviando || sugeridos.length + otrosGastos.length === 0}
            >
              {t("guardarSeguir")}
            </button>
          </div>
        </form>
      )}

      {paso === 5 && inmueble && (
        <form className={formulario.formulario} onSubmit={terminar} noValidate>
          <p className={estilos.suave}>{t("inquilinosAyuda")}</p>
          {inquilinos.map((q, i) => (
            <div key={q.clave} className={propias.filaInquilino}>
              <Campo
                etiqueta={t("inquilinoNombre", { n: i + 1 })}
                value={q.nombre}
                onChange={(e) => setInquilinos(inquilinos.map((x) => (x.clave === q.clave ? { ...x, nombre: e.target.value } : x)))}
              />
              <div className={formulario.campo}>
                <label htmlFor={`habitacion-${q.clave}`} className={formulario.etiqueta}>
                  {t("habitacion")}
                </label>
                <select
                  id={`habitacion-${q.clave}`}
                  className={propias.selector}
                  value={q.habitacionId}
                  onChange={(e) => setInquilinos(inquilinos.map((x) => (x.clave === q.clave ? { ...x, habitacionId: e.target.value } : x)))}
                >
                  {inmueble.habitaciones.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <Campo
                etiqueta={t("entrada")}
                type="date"
                value={q.entrada}
                onChange={(e) => setInquilinos(inquilinos.map((x) => (x.clave === q.clave ? { ...x, entrada: e.target.value } : x)))}
              />
              <button
                type="button"
                className={`${formulario.botonSecundario} ${propias.quitar}`}
                onClick={() => setInquilinos(inquilinos.filter((x) => x.clave !== q.clave))}
                aria-label={t("quitarInquilino", { n: i + 1 })}
              >
                {t("quitar")}
              </button>
            </div>
          ))}
          <div>
            <button
              type="button"
              className={formulario.botonSecundario}
              onClick={() =>
                setInquilinos([
                  ...inquilinos,
                  { clave: clave(), nombre: "", habitacionId: inmueble.habitaciones[0]?.id ?? "", entrada: hoy },
                ])
              }
            >
              {t("anadirInquilino")}
            </button>
          </div>
          <p className={estilos.suave}>{t("soloNombre")}</p>
          <div className={propias.acciones}>
            <button
              type="button"
              className={formulario.botonSecundario}
              onClick={() => {
                router.push(`/inmuebles/${inmueble.id}?creado=1`);
                router.refresh();
              }}
            >
              {t("saltarTerminar")}
            </button>
            <button type="submit" className={formulario.boton} disabled={enviando}>
              {enviando ? t("guardando") : t("terminar")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
