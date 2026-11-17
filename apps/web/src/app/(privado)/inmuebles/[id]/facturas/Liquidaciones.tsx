"use client";
import type { EdicionLiquidacion, Inquilino, Liquidacion, TipoGasto } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Aviso } from "../../../../../componentes/Aviso";
import { Campo } from "../../../../../componentes/Campo";
import { PuntoColor } from "../../../../../componentes/ColorGasto";
import formulario from "../../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../../lib/api-cliente";
import { formatoEuros } from "../../../../../lib/dinero";
import type { ClaveError } from "../../../../../lib/errores";
import { formatoFecha } from "../../../../../lib/fechas";
import cobros from "../cobros/cobros.module.css";
import propias from "../detalle.module.css";
import { LineaLiquidacion } from "../LineaLiquidacion";
import estilos from "./facturas.module.css";

/** Una factura del inmueble como se elige o se lista en una liquidación. */
interface FacturaElegible {
  id: string;
  tipoGastoId: string | null;
  periodoInicio: string | null;
  periodoFin: string | null;
  importeTotal: number | null;
}

function useEtiquetaFactura(tiposGasto: TipoGasto[]) {
  const t = useTranslations("Facturas");
  const idioma = useLocale();
  return (f: FacturaElegible) => {
    const tipo = tiposGasto.find((tg) => tg.id === f.tipoGastoId)?.nombre ?? "—";
    const periodo =
      f.periodoInicio && f.periodoFin
        ? t("periodo", {
            inicio: formatoFecha(f.periodoInicio, idioma),
            fin: formatoFecha(f.periodoFin, idioma),
          })
        : "";
    return `${tipo} ${periodo}`.trim();
  };
}

const CLAVE_DESCARTE = (lote: string) => `inquilinus:propuesta-liquidacion-descartada:${lote}`;

function descartada(lote: string): boolean {
  try {
    return window.localStorage.getItem(CLAVE_DESCARTE(lote)) === "1";
  } catch {
    return false;
  }
}

function recordarDescarte(lote: string) {
  try {
    window.localStorage.setItem(CLAVE_DESCARTE(lote), "1");
  } catch {
    // Sin almacenamiento, la propuesta vuelve a salir la próxima vez.
  }
}

/** Elegir facturas sueltas (y, al crear, el nombre). */
function ElegirFacturas({
  sueltas,
  inicial,
  tiposGasto,
  conNombre,
  textoBoton,
  enviando,
  onEnviar,
  onCancelar,
}: {
  sueltas: FacturaElegible[];
  inicial: string[];
  tiposGasto: TipoGasto[];
  conNombre: boolean;
  textoBoton: string;
  enviando: boolean;
  onEnviar: (facturaIds: string[], nombre: string) => void;
  onCancelar: () => void;
}) {
  const t = useTranslations("Liquidaciones");
  const idioma = useLocale();
  const etiqueta = useEtiquetaFactura(tiposGasto);
  const [elegidas, setElegidas] = useState<string[]>(inicial);
  const [nombre, setNombre] = useState("");

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (elegidas.length > 0) onEnviar(elegidas, nombre);
  };

  return (
    <form className={propias.enLinea} onSubmit={enviar} noValidate>
      <fieldset className={estilos.eleccion}>
        <legend className={formulario.etiqueta}>{t("elegirFacturas")}</legend>
        {sueltas.map((f) => (
          <label key={f.id} className={formulario.casilla}>
            <input
              type="checkbox"
              checked={elegidas.includes(f.id)}
              onChange={(e) => setElegidas(e.target.checked ? [...elegidas, f.id] : elegidas.filter((id) => id !== f.id))}
            />
            <span>
              <PuntoColor color={tiposGasto.find((tg) => tg.id === f.tipoGastoId)?.color ?? null} /> {etiqueta(f)} · <span className={estilos.importe}>{formatoEuros(f.importeTotal ?? 0, idioma)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {conNombre && (
        <Campo
          etiqueta={t("nombre")}
          marca={t("opcional")}
          ayuda={t("nombreAyuda")}
          value={nombre}
          maxLength={200}
          onChange={(e) => setNombre(e.target.value)}
        />
      )}
      <div className={propias.botones}>
        <button type="button" className={formulario.botonSecundario} onClick={onCancelar}>
          {t("cancelar")}
        </button>
        <button type="submit" className={formulario.boton} disabled={enviando || elegidas.length === 0}>
          {textoBoton}
        </button>
      </div>
    </form>
  );
}

/**
 * Spec 011, R4 y R4b: tras confirmar un lote con al menos dos facturas
 * repartidas sueltas, se propone agruparlas. Descartarla se recuerda en este
 * dispositivo. Se propone el lote más reciente que no se haya descartado.
 */
export function PropuestaLiquidacion({
  inmuebleId,
  propuestas,
  sueltas,
  tiposGasto,
}: {
  inmuebleId: string;
  /** Lotes candidatos, del más reciente al más antiguo. */
  propuestas: { lote: string; facturaIds: string[] }[];
  sueltas: FacturaElegible[];
  tiposGasto: TipoGasto[];
}) {
  const t = useTranslations("Liquidaciones");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const router = useRouter();
  // Hasta montar no se sabe qué se descartó (está en el navegador).
  const [descartados, setDescartados] = useState<string[] | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);

  useEffect(() => {
    setDescartados(propuestas.filter((p) => descartada(p.lote)).map((p) => p.lote));
  }, [propuestas]);

  const propuesta = descartados === null ? undefined : propuestas.find((p) => !descartados.includes(p.lote));
  if (!propuesta) return null;

  const descartar = () => {
    recordarDescarte(propuesta.lote);
    setDescartados([...(descartados ?? []), propuesta.lote]);
    setEligiendo(false);
  };

  const crear = async (facturaIds: string[], nombre: string) => {
    setEnviando(true);
    setError(null);
    const r = await pedirApi<Liquidacion>(`/inmuebles/${inmuebleId}/liquidaciones`, {
      cuerpo: {
        facturaIds,
        idioma,
        ...(nombre.trim() && { nombre: nombre.trim() }),
      },
    });
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    setEligiendo(false);
    router.refresh();
  };

  return (
    <div className={`${formulario.avisoInfo} ${estilos.formulario}`} role="status">
      <span>{t("propuesta", { n: propuesta.facturaIds.length })}</span>
      {error && <Aviso tipo="error">{te(error)}</Aviso>}
      {eligiendo ? (
        <ElegirFacturas
          sueltas={sueltas}
          inicial={propuesta.facturaIds}
          tiposGasto={tiposGasto}
          conNombre
          textoBoton={t("crear")}
          enviando={enviando}
          onEnviar={(ids, nombre) => void crear(ids, nombre)}
          onCancelar={() => setEligiendo(false)}
        />
      ) : (
        <div className={propias.botones}>
          <button type="button" className={formulario.botonSecundario} onClick={descartar}>
            {t("noGracias")}
          </button>
          <button type="button" className={formulario.botonSecundario} onClick={() => setEligiendo(true)}>
            {t("elegirOtras")}
          </button>
          <button
            type="button"
            className={formulario.boton}
            disabled={enviando}
            onClick={() => void crear(propuesta.facturaIds, "")}
          >
            {t("crear")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Spec 011, R5: crear una liquidación a mano con facturas sueltas. */
export function NuevaLiquidacion({
  inmuebleId,
  sueltas,
  tiposGasto,
}: {
  inmuebleId: string;
  sueltas: FacturaElegible[];
  tiposGasto: TipoGasto[];
}) {
  const t = useTranslations("Liquidaciones");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);

  if (sueltas.length === 0) return null;

  const crear = async (facturaIds: string[], nombre: string) => {
    setEnviando(true);
    setError(null);
    const r = await pedirApi<Liquidacion>(`/inmuebles/${inmuebleId}/liquidaciones`, {
      cuerpo: {
        facturaIds,
        idioma,
        ...(nombre.trim() && { nombre: nombre.trim() }),
      },
    });
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    setAbierto(false);
    router.refresh();
  };

  return (
    <>
      {error && <Aviso tipo="error">{te(error)}</Aviso>}
      {abierto ? (
        <ElegirFacturas
          sueltas={sueltas}
          inicial={[]}
          tiposGasto={tiposGasto}
          conNombre
          textoBoton={t("crear")}
          enviando={enviando}
          onEnviar={(ids, nombre) => void crear(ids, nombre)}
          onCancelar={() => setAbierto(false)}
        />
      ) : (
        <div>
          <button
            type="button"
            className={formulario.botonEnlace}
            onClick={() => {
              setError(null);
              setAbierto(true);
            }}
          >
            {t("nueva")}
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Una liquidación (spec 011, R2 y R6–R10): nombre, facturas, total, lo que
 * asume la propietaria y lo de cada inquilino; renombrar, añadir o quitar
 * facturas (con confirmación si hay pagos) y borrarla.
 */
export function TarjetaLiquidacion({
  inmuebleId,
  liquidacion,
  sueltas,
  tiposGasto,
  inquilinos,
  hoy,
}: {
  inmuebleId: string;
  liquidacion: Liquidacion;
  sueltas: FacturaElegible[];
  tiposGasto: TipoGasto[];
  inquilinos: Inquilino[];
  hoy: string;
}) {
  const t = useTranslations("Liquidaciones");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const router = useRouter();
  const etiqueta = useEtiquetaFactura(tiposGasto);
  const ruta = `/inmuebles/${inmuebleId}/liquidaciones/${liquidacion.id}`;
  const [modo, setModo] = useState<"nada" | "renombrar" | "anadir" | "borrar">("nada");
  const [nombre, setNombre] = useState(liquidacion.nombre);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);
  // R6: cambiar las facturas con partes pagadas pide confirmación.
  const [porConfirmar, setPorConfirmar] = useState<EdicionLiquidacion | null>(null);
  const nombreInquilino = (id: string) => inquilinos.find((q) => q.id === id)?.nombre ?? "—";
  const posicion = (id: string) => inquilinos.findIndex((q) => q.id === id);
  const deCadaInquilino = [...liquidacion.inquilinos].sort((a, b) => posicion(a.inquilinoId) - posicion(b.inquilinoId));

  const editar = async (edicion: EdicionLiquidacion) => {
    setEnviando(true);
    setError(null);
    const r = await pedirApi<Liquidacion>(ruta, {
      metodo: "PATCH",
      cuerpo: edicion,
    });
    setEnviando(false);
    if (!r.ok) {
      if (r.error === "confirmacionNecesaria") return setPorConfirmar(edicion);
      return setError(r.error);
    }
    setPorConfirmar(null);
    setModo("nada");
    router.refresh();
  };

  const borrar = async () => {
    setEnviando(true);
    setError(null);
    const r = await pedirApi(ruta, { metodo: "DELETE" });
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  };

  const renombrar = (e: FormEvent) => {
    e.preventDefault();
    void editar({ nombre });
  };

  return (
    <li className={propias.elemento} id={`liquidacion-${liquidacion.id}`}>
      <div className={propias.fila}>
        <strong>{liquidacion.nombre}</strong>
        <span className={estilos.importe}>{formatoEuros(liquidacion.total, idioma)}</span>
      </div>

      <ul className={estilos.facturasLiquidacion}>
        {liquidacion.facturas.map((f) => (
          <li key={f.facturaId} className={propias.fila}>
            <span>
              <PuntoColor color={tiposGasto.find((tg) => tg.id === f.tipoGastoId)?.color ?? null} />{" "}
              {etiqueta({ id: f.facturaId, ...f })} ·{" "}
              <span className={estilos.importe}>{formatoEuros(f.importeTotal, idioma)}</span>
            </span>
            {/* R6b: no se puede quedar sin facturas; para eso se borra. */}
            {liquidacion.facturas.length > 1 && (
              <button
                type="button"
                className={formulario.botonEnlace}
                disabled={enviando}
                onClick={() => void editar({ quitar: [f.facturaId] })}
              >
                {t("quitar")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {liquidacion.sinOcupar > 0 && (
        <span className={propias.suave}>
          {t("sinOcupar", {
            importe: formatoEuros(liquidacion.sinOcupar, idioma),
          })}
        </span>
      )}

      {deCadaInquilino.length > 0 && (
        <ul className={cobros.cobros}>
          {deCadaInquilino.map((q) => (
            <LineaLiquidacion
              key={q.inquilinoId}
              inmuebleId={inmuebleId}
              liquidacion={liquidacion}
              inquilino={q}
              etiqueta={nombreInquilino(q.inquilinoId)}
              tiposGasto={tiposGasto}
              hoy={hoy}
            />
          ))}
        </ul>
      )}

      {error && <Aviso tipo="error">{te(error)}</Aviso>}

      {porConfirmar ? (
        <div className={propias.confirmacion}>
          <span>{t("cambiarConPagos")}</span>
          <div className={propias.botones}>
            <button type="button" className={formulario.botonSecundario} onClick={() => setPorConfirmar(null)}>
              {t("cancelar")}
            </button>
            <button
              type="button"
              className={formulario.boton}
              disabled={enviando}
              onClick={() => void editar({ ...porConfirmar, confirmar: true })}
            >
              {t("seguir")}
            </button>
          </div>
        </div>
      ) : modo === "renombrar" ? (
        <form className={propias.enLinea} onSubmit={renombrar} noValidate>
          <Campo etiqueta={t("nombre")} value={nombre} maxLength={200} onChange={(e) => setNombre(e.target.value)} />
          <div className={propias.botones}>
            <button type="button" className={formulario.botonSecundario} onClick={() => setModo("nada")}>
              {t("cancelar")}
            </button>
            <button type="submit" className={formulario.boton} disabled={enviando}>
              {t("guardar")}
            </button>
          </div>
        </form>
      ) : modo === "anadir" ? (
        <ElegirFacturas
          sueltas={sueltas}
          inicial={[]}
          tiposGasto={tiposGasto}
          conNombre={false}
          textoBoton={t("anadir")}
          enviando={enviando}
          onEnviar={(ids) => void editar({ anadir: ids })}
          onCancelar={() => setModo("nada")}
        />
      ) : modo === "borrar" ? (
        <div className={propias.confirmacion}>
          <span>{t("borrarAviso")}</span>
          <div className={propias.botones}>
            <button type="button" className={formulario.botonSecundario} onClick={() => setModo("nada")}>
              {t("cancelar")}
            </button>
            <button type="button" className={formulario.botonPeligro} disabled={enviando} onClick={() => void borrar()}>
              {t("borrar")}
            </button>
          </div>
        </div>
      ) : (
        <div className={propias.acciones}>
          <button
            type="button"
            className={formulario.botonEnlace}
            onClick={() => {
              setNombre(liquidacion.nombre);
              setError(null);
              setModo("renombrar");
            }}
          >
            {t("renombrar")}
          </button>
          {sueltas.length > 0 && (
            <button
              type="button"
              className={formulario.botonEnlace}
              onClick={() => {
                setError(null);
                setModo("anadir");
              }}
            >
              {t("anadirFacturas")}
            </button>
          )}
          <button
            type="button"
            className={formulario.botonEnlace}
            onClick={() => {
              setError(null);
              setModo("borrar");
            }}
          >
            {t("borrar")}
          </button>
        </div>
      )}
    </li>
  );
}
