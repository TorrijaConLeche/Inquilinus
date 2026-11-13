"use client";
import type { Factura, TipoGasto } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../../../componentes/Aviso";
import { Campo } from "../../../../../componentes/Campo";
import formulario from "../../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../../lib/api-cliente";
import { eurosACentimos, formatoEuros } from "../../../../../lib/dinero";
import { claveDeError, type ClaveError } from "../../../../../lib/errores";
import { formatoFecha } from "../../../../../lib/fechas";
import propias from "../detalle.module.css";
import estilos from "./facturas.module.css";

const NUEVO = "__nuevo__";
const aTexto = (centimos: number | null) => (centimos === null ? "" : String(centimos / 100).replace(".", ","));

/**
 * Una factura por revisar (spec 003): rellenar o corregir tipo, periodo e
 * importe (R5), crear un tipo de gasto al momento (R3), confirmarla con el
 * aviso de solapes (R6, R14) y descartarla (R16).
 */
export function FilaFactura({ inmuebleId, factura, tiposGasto }: { inmuebleId: string; factura: Factura; tiposGasto: TipoGasto[] }) {
  const t = useTranslations("Facturas");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const router = useRouter();
  const ruta = `/inmuebles/${inmuebleId}/facturas/${factura.id}`;
  const [tipoGastoId, setTipoGastoId] = useState(factura.tipoGastoId ?? "");
  const [nombreTipo, setNombreTipo] = useState("");
  const [inicio, setInicio] = useState(factura.periodoInicio ?? "");
  const [fin, setFin] = useState(factura.periodoFin ?? "");
  const [importe, setImporte] = useState(aTexto(factura.importeTotal));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [solapadas, setSolapadas] = useState<Factura[] | null>(null);
  const [descartando, setDescartando] = useState(false);

  const activos = tiposGasto.filter((tg) => !tg.archivado);
  const nombreDe = (id: string | null) => tiposGasto.find((tg) => tg.id === id)?.nombre ?? "—";
  const centimos = importe.trim() === "" ? null : eurosACentimos(importe);
  const importeMal = importe.trim() !== "" && centimos === null;

  /** R5: guarda lo que hay en el formulario (lo vacío, vacío). */
  const guardar = async (): Promise<boolean> => {
    if (importeMal) {
      setError("importeInvalido");
      return false;
    }
    const r = await pedirApi(ruta, {
      metodo: "PATCH",
      cuerpo: {
        tipoGastoId: tipoGastoId && tipoGastoId !== NUEVO ? tipoGastoId : null,
        periodoInicio: inicio || null,
        periodoFin: fin || null,
        importeTotal: centimos,
      },
    });
    if (!r.ok) setError(r.error);
    return r.ok;
  };

  const alGuardar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setGuardado(false);
    const ok = await guardar();
    setEnviando(false);
    if (ok) {
      setGuardado(true);
      router.refresh();
    }
  };

  /** R6 y R14: si se solapa, se enseñan las otras y la usuaria decide. */
  const confirmar = async (continuarConSolapes: boolean) => {
    setEnviando(true);
    setError(null);
    setGuardado(false);
    if (!continuarConSolapes && !(await guardar())) return setEnviando(false);
    const respuesta = await fetch(`/api${ruta}/confirmar`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ continuarConSolapes }),
    }).catch(() => null);
    setEnviando(false);
    if (!respuesta) return setError("generico");
    const datos = (await respuesta.json().catch(() => null)) as { error?: string; solapadas?: Factura[] } | null;
    if (respuesta.status === 409 && datos?.solapadas) return setSolapadas(datos.solapadas);
    if (!respuesta.ok) return setError(claveDeError(datos?.error));
    setSolapadas(null);
    router.refresh();
  };

  /** R3: un tipo de gasto nuevo al momento. */
  const crearTipo = async () => {
    if (!nombreTipo.trim()) return;
    setEnviando(true);
    const r = await pedirApi<TipoGasto>(`/inmuebles/${inmuebleId}/tipos-gasto`, { cuerpo: { nombre: nombreTipo } });
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    setTipoGastoId(r.datos.id);
    setNombreTipo("");
    router.refresh();
  };

  const propuesta = factura.propuestaIa;

  return (
    <li className={propias.elemento}>
      <div className={propias.fila}>
        <a href={`/api${ruta}/pdf`} target="_blank" rel="noopener noreferrer" className={formulario.enlace}>
          {factura.nombreFichero}
        </a>
        <span className={propias.etiquetaColor}>{t(`estados.${factura.estado}`)}</span>
      </div>
      {propuesta && (
        <span className={propias.ayudaPequena}>
          {t("propuestaIa", {
            tipo: nombreDe(propuesta.tipoGastoId),
            periodo:
              propuesta.inicio && propuesta.fin
                ? t("periodo", { inicio: formatoFecha(propuesta.inicio, idioma), fin: formatoFecha(propuesta.fin, idioma) })
                : "—",
            importe: propuesta.importe === null ? "—" : formatoEuros(propuesta.importe, idioma),
          })}
        </span>
      )}

      <form className={estilos.formulario} onSubmit={alGuardar} noValidate>
        <div className={formulario.campo}>
          <label htmlFor={`tipo-${factura.id}`} className={formulario.etiqueta}>
            {t("tipoGasto")}
          </label>
          <select
            id={`tipo-${factura.id}`}
            className={propias.selector}
            value={tipoGastoId}
            onChange={(e) => setTipoGastoId(e.target.value)}
          >
            <option value="">{t("eligeTipo")}</option>
            {activos.map((tg) => (
              <option key={tg.id} value={tg.id}>
                {tg.nombre}
              </option>
            ))}
            <option value={NUEVO}>{t("nuevoTipo")}</option>
          </select>
        </div>
        {tipoGastoId === NUEVO && (
          <div className={estilos.nuevoTipo}>
            <Campo etiqueta={t("nombreTipo")} autoFocus value={nombreTipo} onChange={(e) => setNombreTipo(e.target.value)} />
            <button type="button" className={formulario.botonSecundario} disabled={enviando || !nombreTipo.trim()} onClick={() => void crearTipo()}>
              {t("crearTipo")}
            </button>
          </div>
        )}
        <div className={propias.dosColumnas}>
          <Campo etiqueta={t("inicio")} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          <Campo etiqueta={t("fin")} type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
        </div>
        <Campo
          etiqueta={t("importe")}
          inputMode="decimal"
          placeholder="87,45"
          value={importe}
          error={importeMal ? te("importeInvalido") : null}
          onChange={(e) => setImporte(e.target.value)}
        />

        {error && <Aviso tipo="error">{te(error)}</Aviso>}
        {guardado && <Aviso tipo="exito">{t("guardada")}</Aviso>}

        {solapadas ? (
          <div className={propias.confirmacion}>
            <span>{t("solape")}</span>
            <ul className={estilos.solapadas}>
              {solapadas.map((s) => (
                <li key={s.id}>
                  {t("solapada", {
                    nombre: s.nombreFichero,
                    tipo: nombreDe(s.tipoGastoId),
                    periodo:
                      s.periodoInicio && s.periodoFin
                        ? t("periodo", { inicio: formatoFecha(s.periodoInicio, idioma), fin: formatoFecha(s.periodoFin, idioma) })
                        : "—",
                    importe: s.importeTotal === null ? "—" : formatoEuros(s.importeTotal, idioma),
                    estado: t(`estados.${s.estado}`),
                  })}
                </li>
              ))}
            </ul>
            <div className={propias.botones}>
              <button type="button" className={formulario.botonSecundario} onClick={() => setSolapadas(null)}>
                {t("cancelar")}
              </button>
              <button type="button" className={formulario.boton} disabled={enviando} onClick={() => void confirmar(true)}>
                {t("confirmarIgualmente")}
              </button>
            </div>
          </div>
        ) : descartando ? (
          <div className={propias.confirmacion}>
            <span>{t("descartarConfirmacion")}</span>
            <div className={propias.botones}>
              <button type="button" className={formulario.botonSecundario} onClick={() => setDescartando(false)}>
                {t("cancelar")}
              </button>
              <button
                type="button"
                className={formulario.botonPeligro}
                disabled={enviando}
                onClick={async () => {
                  setEnviando(true);
                  const r = await pedirApi(ruta, { metodo: "DELETE" });
                  setEnviando(false);
                  if (!r.ok) return setError(r.error);
                  router.refresh();
                }}
              >
                {t("descartar")}
              </button>
            </div>
          </div>
        ) : (
          <div className={estilos.acciones}>
            <button type="button" className={formulario.botonEnlace} onClick={() => setDescartando(true)}>
              {t("descartar")}
            </button>
            <span className={propias.botones}>
              <button type="submit" className={formulario.botonSecundario} disabled={enviando}>
                {t("guardar")}
              </button>
              <button type="button" className={formulario.boton} disabled={enviando} onClick={() => void confirmar(false)}>
                {t("confirmar")}
              </button>
            </span>
          </div>
        )}
      </form>
    </li>
  );
}
