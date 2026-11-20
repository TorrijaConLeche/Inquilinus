"use client";
import type { DatosTimeline, DesgloseAlquiler, Liquidacion, ListaLiquidaciones, RepartoFactura } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import { NombreGasto } from "../../../../componentes/ColorGasto";
import formulario from "../../../../componentes/formulario.module.css";
import { Ventana } from "../../../../componentes/Ventana";
import { pedirApi } from "../../../../lib/api-cliente";
import { formatoEuros } from "../../../../lib/dinero";
import type { ClaveError } from "../../../../lib/errores";
import { formatoFecha, formatoMes } from "../../../../lib/fechas";
import cobros from "./cobros/cobros.module.css";
import propias from "./detalle.module.css";
import { LineaLiquidacion } from "./LineaLiquidacion";

/** Lo que se abre en una ventana de detalle (spec 006, R11 y R12; spec 011, R14; spec 012, R8). */
export type Abierta =
  | { tipo: "alquiler"; fecha: string; cobroIds: string[] }
  | { tipo: "factura"; facturaId: string }
  | { tipo: "liquidacion"; liquidacionId: string };

/** La ventana de lo abierto, o nada. */
export function VentanaAbierta({
  abierta,
  inmuebleId,
  datos,
  habitaciones,
  hoy,
  alCambiar,
}: {
  abierta: Abierta | null;
  inmuebleId: string;
  datos: DatosTimeline;
  habitaciones: { id: string; nombre: string }[];
  hoy: string;
  alCambiar: (a: Abierta | null) => void;
}) {
  const cerrar = () => alCambiar(null);
  if (abierta?.tipo === "alquiler") {
    return (
      <VentanaAlquiler
        key={abierta.fecha}
        inmuebleId={inmuebleId}
        datos={datos}
        habitaciones={habitaciones}
        fecha={abierta.fecha}
        cobroIds={abierta.cobroIds}
        hoy={hoy}
        alCerrar={cerrar}
      />
    );
  }
  if (abierta?.tipo === "factura") {
    return (
      <VentanaFactura
        key={abierta.facturaId}
        inmuebleId={inmuebleId}
        datos={datos}
        facturaId={abierta.facturaId}
        hoy={hoy}
        alCerrar={cerrar}
        alAbrirLiquidacion={(liquidacionId) => alCambiar({ tipo: "liquidacion", liquidacionId })}
      />
    );
  }
  if (abierta?.tipo === "liquidacion") {
    return (
      <VentanaLiquidacion
        key={abierta.liquidacionId}
        inmuebleId={inmuebleId}
        datos={datos}
        liquidacionId={abierta.liquidacionId}
        hoy={hoy}
        alCerrar={cerrar}
      />
    );
  }
  return null;
}

/** Pide algo a la API al abrir y otra vez cada vez que cambian los datos de la página (tras pagar, por ejemplo). */
function useCarga<T>(ruta: string, datos: DatosTimeline) {
  const [resultado, setResultado] = useState<{ datos: T } | { error: ClaveError } | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let vigente = true;
    void pedirApi<T>(ruta).then((r) => {
      if (vigente) setResultado(r.ok ? { datos: r.datos } : { error: r.error });
    });
    return () => {
      vigente = false;
    };
  }, [ruta, datos, version]);
  return { resultado, recargar: () => setVersion((v) => v + 1) };
}

/** Marca un cobro o una parte como pagado hoy, o pendiente, y recarga la ventana y la página. */
function usePago(recargar: () => void) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);
  const pagar = async (ruta: string, pagadoEn: string | null) => {
    setEnviando(true);
    setError(null);
    const r = await pedirApi(ruta, { metodo: "PATCH", cuerpo: { pagadoEn } });
    setEnviando(false);
    if (!r.ok) return setError(r.error);
    recargar();
    router.refresh();
  };
  return { enviando, error, pagar };
}

/** Pagado (con fecha) o pendiente, con el botón para cambiarlo. */
function EstadoPago({
  pagadoEn,
  enviando,
  alPagar,
  alDeshacer,
}: {
  pagadoEn: string | null;
  enviando: boolean;
  alPagar: () => void;
  alDeshacer: () => void;
}) {
  const t = useTranslations("Detalles");
  const idioma = useLocale();
  return (
    <span className={cobros.ladoDerecho}>
      {pagadoEn ? (
        <>
          <span className={cobros.pagado}>{t("pagadoEl", { fecha: formatoFecha(pagadoEn, idioma) })}</span>
          <button type="button" className={formulario.botonSecundario} disabled={enviando} onClick={alDeshacer}>
            {t("deshacer")}
          </button>
        </>
      ) : (
        <>
          <span className={cobros.pendiente}>{t("pendiente")}</span>
          <button type="button" className={formulario.boton} disabled={enviando} onClick={alPagar}>
            {t("cobrado")}
          </button>
        </>
      )}
    </span>
  );
}

function Cargando({ resultado }: { resultado: { error: ClaveError } | null }) {
  const t = useTranslations("Detalles");
  const te = useTranslations("Errores");
  return resultado ? <Aviso tipo="error">{te(resultado.error)}</Aviso> : <p className={propias.suave}>{t("cargando")}</p>;
}

/**
 * R11: el desglose del mes de la chincheta. Por inquilino, su habitación,
 * renta, recargo por vacíos con su explicación, importe y si está pagado; lo
 * que asume la propietaria y el total.
 */
export function VentanaAlquiler({
  inmuebleId,
  datos,
  habitaciones,
  fecha,
  cobroIds,
  hoy,
  alCerrar,
}: {
  inmuebleId: string;
  datos: DatosTimeline;
  habitaciones: { id: string; nombre: string }[];
  fecha: string;
  cobroIds: string[];
  hoy: string;
  alCerrar: () => void;
}) {
  const t = useTranslations("Detalles");
  const idioma = useLocale();
  const meses = [...new Set(datos.cobros.filter((c) => cobroIds.includes(c.id)).map((c) => c.mes))].sort();
  return (
    <Ventana titulo={t("alquilerTitulo", { fecha: formatoFecha(fecha, idioma) })} alCerrar={alCerrar}>
      {meses.map((mes) => (
        <DesgloseMes key={mes} inmuebleId={inmuebleId} datos={datos} habitaciones={habitaciones} mes={mes} varios={meses.length > 1} hoy={hoy} />
      ))}
    </Ventana>
  );
}

function DesgloseMes({
  inmuebleId,
  datos,
  habitaciones,
  mes,
  varios,
  hoy,
}: {
  inmuebleId: string;
  datos: DatosTimeline;
  habitaciones: { id: string; nombre: string }[];
  mes: string;
  varios: boolean;
  hoy: string;
}) {
  const t = useTranslations("Detalles");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const { resultado, recargar } = useCarga<DesgloseAlquiler>(`/inmuebles/${inmuebleId}/alquiler/${mes}`, datos);
  const { enviando, error, pagar } = usePago(recargar);
  if (!resultado || "error" in resultado) return <Cargando resultado={resultado} />;
  const d = resultado.datos;
  const euros = (c: number) => formatoEuros(c, idioma);
  const nombreHabitacion = (id: string) => d.habitaciones.find((h) => h.id === id)?.nombre ?? habitaciones.find((h) => h.id === id)?.nombre ?? "—";
  const nombreInquilino = (id: string) => datos.inquilinos.find((q) => q.id === id)?.nombre ?? "—";
  const explicacion = (v: DesgloseAlquiler["vacios"][number]) =>
    t(v.entre.length > 0 ? "vaciaRepartida" : "vaciaAsumes", {
      habitacion: nombreHabitacion(v.habitacionId),
      desde: formatoFecha(v.desde, idioma),
      hasta: formatoFecha(v.hasta, idioma),
      n: v.entre.length,
    });
  const total = d.lineas.reduce((s, l) => s + (l.cobro?.importe ?? l.calculado?.importe ?? 0), 0);
  const asumidos = d.vacios.filter((v) => v.entre.length === 0);

  return (
    <div className={propias.bloque}>
      {varios && <h3 className={propias.subtitulo}>{formatoMes(mes, idioma)}</h3>}
      {!varios && <p className={propias.suave}>{t("delMes", { mes: formatoMes(mes, idioma) })}</p>}
      {error && <Aviso tipo="error">{te(error)}</Aviso>}
      <ul className={cobros.cobros}>
        {d.lineas.map((l) => {
          const importes = l.cobro ?? l.calculado;
          const vacios = d.vacios.filter((v) => v.entre.includes(l.inquilinoId));
          return (
            <li key={l.inquilinoId} className={cobros.cobro}>
              <div className={cobros.lineaCobro}>
                <div className={cobros.concepto}>
                  <strong>{nombreInquilino(l.inquilinoId)}</strong>
                  <span className={propias.suave}>{l.habitacionIds.map(nombreHabitacion).join(", ")}</span>
                  {importes && (
                    <span>
                      {importes.recargoVacios > 0
                        ? t("rentaYRecargo", { renta: euros(importes.renta), recargo: euros(importes.recargoVacios), importe: euros(importes.importe) })
                        : t("soloRenta", { renta: euros(importes.renta) })}
                    </span>
                  )}
                  {importes && importes.recargoVacios > 0 && vacios.map((v) => (
                    <span key={`${v.habitacionId}-${v.desde}`} className={propias.suave}>
                      {explicacion(v)}
                    </span>
                  ))}
                  {l.cobro?.editado && <span className={propias.suave}>{t("editado")}</span>}
                  {l.cobro?.desactualizado && <span className={cobros.desactualizado}>{t("desactualizado")}</span>}
                </div>
                {l.cobro ? (
                  <EstadoPago
                    pagadoEn={l.cobro.pagadoEn}
                    enviando={enviando}
                    alPagar={() => void pagar(`/inmuebles/${inmuebleId}/cobros/${l.cobro!.id}`, hoy)}
                    alDeshacer={() => void pagar(`/inmuebles/${inmuebleId}/cobros/${l.cobro!.id}`, null)}
                  />
                ) : (
                  <span className={propias.suave}>{t("sinCobro")}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <dl className={propias.datos}>
        {d.propietario !== null && d.propietario > 0 && (
          <>
            <dt>{t("asumesTu")}</dt>
            <dd className={propias.importe}>{euros(d.propietario)}</dd>
          </>
        )}
        <dt>{t("total")}</dt>
        <dd className={propias.importe}>{euros(total)}</dd>
      </dl>
      {d.propietario !== null && d.propietario > 0 && asumidos.length > 0 && (
        <ul className={propias.estancias}>
          {asumidos.map((v) => (
            <li key={`${v.habitacionId}-${v.desde}`} className={propias.suave}>
              {explicacion(v)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * R12: la factura con su tipo, periodo, importe, el cálculo por tramos y la
 * parte de cada inquilino con su pago; el PDF siempre. Spec 011, R14: a qué
 * liquidación pertenece.
 */
export function VentanaFactura({
  inmuebleId,
  datos,
  facturaId,
  hoy,
  alCerrar,
  alAbrirLiquidacion,
}: {
  inmuebleId: string;
  datos: DatosTimeline;
  facturaId: string;
  hoy: string;
  alCerrar: () => void;
  alAbrirLiquidacion: (id: string) => void;
}) {
  const t = useTranslations("Detalles");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const ruta = `/inmuebles/${inmuebleId}/facturas/${facturaId}`;
  const { resultado, recargar } = useCarga<RepartoFactura>(`${ruta}/reparto`, datos);
  const { enviando, error, pagar } = usePago(recargar);
  const factura = datos.facturas.find((f) => f.id === facturaId);
  const tipo = datos.tiposGasto.find((tg) => tg.id === factura?.tipoGastoId);
  const liquidacion = datos.liquidaciones.find((l) => l.id === factura?.liquidacionId);
  const nombreInquilino = (id: string) => datos.inquilinos.find((q) => q.id === id)?.nombre ?? "—";
  const euros = (c: number) => formatoEuros(c, idioma);
  if (!factura) return null;

  return (
    <Ventana titulo={<NombreGasto nombre={tipo?.nombre ?? t("gasto")} color={tipo?.color} />} alCerrar={alCerrar}>
      <dl className={propias.datos}>
        <dt>{t("periodo")}</dt>
        <dd>{t("delAl", { desde: formatoFecha(factura.periodoInicio, idioma), hasta: formatoFecha(factura.periodoFin, idioma) })}</dd>
        <dt>{t("importeTotal")}</dt>
        <dd className={propias.importe}>{euros(factura.importeTotal)}</dd>
        {liquidacion && (
          <>
            <dt>{t("liquidacion")}</dt>
            <dd>
              <button type="button" className={formulario.botonEnlace} onClick={() => alAbrirLiquidacion(liquidacion.id)}>
                {liquidacion.nombre}
              </button>
            </dd>
          </>
        )}
      </dl>

      {!resultado || "error" in resultado ? (
        <Cargando resultado={resultado} />
      ) : (
        <>
          <div className={propias.bloque}>
            <h3 className={propias.subtitulo}>{t("calculo")}</h3>
            <ul className={propias.estancias}>
              {resultado.datos.tramos.map((tr) => (
                <li key={tr.desde}>
                  {t("tramo", {
                    desde: formatoFecha(tr.desde, idioma),
                    hasta: formatoFecha(tr.hasta, idioma),
                    n: tr.dias,
                  })}
                  {": "}
                  {tr.partes.length === 0
                    ? t("tramoVacio")
                    : tr.partes.map((p) => `${nombreInquilino(p.inquilinoId)} ${euros(p.importe)}`).join(", ")}
                </li>
              ))}
            </ul>
          </div>
          <div className={propias.bloque}>
            <h3 className={propias.subtitulo}>{t("reparto")}</h3>
            {error && <Aviso tipo="error">{te(error)}</Aviso>}
            <ul className={cobros.cobros}>
              {resultado.datos.partes.map((p) => (
                <li key={p.id} className={cobros.cobro}>
                  <div className={cobros.lineaCobro}>
                    <div className={cobros.concepto}>
                      <strong>{nombreInquilino(p.inquilinoId)}</strong>
                      <span>
                        {euros(p.importe)} · {t("dias", { n: p.dias })}
                      </span>
                    </div>
                    <EstadoPago
                      pagadoEn={p.pagadoEn}
                      enviando={enviando}
                      alPagar={() => void pagar(`/inmuebles/${inmuebleId}/partes/${p.id}`, hoy)}
                      alDeshacer={() => void pagar(`/inmuebles/${inmuebleId}/partes/${p.id}`, null)}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {resultado.datos.sinOcupar.importe > 0 && (
              <span className={propias.suave}>
                {t("sinOcupar", { importe: euros(resultado.datos.sinOcupar.importe), n: resultado.datos.sinOcupar.dias })}
              </span>
            )}
          </div>
        </>
      )}
      <div>
        <a href={`/api${ruta}/pdf`} target="_blank" rel="noopener noreferrer" className={formulario.botonSecundario}>
          {t("descargarPdf")}
        </a>
      </div>
    </Ventana>
  );
}

/** Spec 011, R14: la liquidación con sus facturas, su total y lo de cada inquilino («Marcar pagada»). */
export function VentanaLiquidacion({
  inmuebleId,
  datos,
  liquidacionId,
  hoy,
  alCerrar,
}: {
  inmuebleId: string;
  datos: DatosTimeline;
  liquidacionId: string;
  hoy: string;
  alCerrar: () => void;
}) {
  const t = useTranslations("Detalles");
  const idioma = useLocale();
  const { resultado } = useCarga<ListaLiquidaciones>(`/inmuebles/${inmuebleId}/liquidaciones`, datos);
  const resumen = datos.liquidaciones.find((l) => l.id === liquidacionId);
  const liquidacion: Liquidacion | undefined =
    resultado && "datos" in resultado ? resultado.datos.liquidaciones.find((l) => l.id === liquidacionId) : undefined;
  const nombreInquilino = (id: string) => datos.inquilinos.find((q) => q.id === id)?.nombre ?? "—";
  const euros = (c: number) => formatoEuros(c, idioma);

  return (
    <Ventana titulo={resumen?.nombre ?? t("liquidacion")} alCerrar={alCerrar}>
      {!liquidacion ? (
        <Cargando resultado={resultado && "error" in resultado ? resultado : null} />
      ) : (
        <>
          <ul className={propias.estancias}>
            {liquidacion.facturas.map((f) => {
              const tipo = datos.tiposGasto.find((tg) => tg.id === f.tipoGastoId);
              return (
                <li key={f.facturaId} className={propias.fila}>
                  <span>
                    <NombreGasto nombre={tipo?.nombre ?? t("gasto")} color={tipo?.color} />{" "}
                    <span className={propias.suave}>
                      {t("delAl", { desde: formatoFecha(f.periodoInicio, idioma), hasta: formatoFecha(f.periodoFin, idioma) })}
                    </span>
                  </span>
                  <span className={propias.importe}>{euros(f.importeTotal)}</span>
                </li>
              );
            })}
          </ul>
          <dl className={propias.datos}>
            <dt>{t("total")}</dt>
            <dd className={propias.importe}>{euros(liquidacion.total)}</dd>
            {liquidacion.sinOcupar > 0 && (
              <>
                <dt>{t("asumesTu")}</dt>
                <dd className={propias.importe}>{euros(liquidacion.sinOcupar)}</dd>
              </>
            )}
          </dl>
          <ul className={cobros.cobros}>
            {liquidacion.inquilinos.map((q) => (
              <LineaLiquidacion
                key={q.inquilinoId}
                inmuebleId={inmuebleId}
                liquidacion={liquidacion}
                inquilino={q}
                etiqueta={nombreInquilino(q.inquilinoId)}
                tiposGasto={datos.tiposGasto}
                hoy={hoy}
              />
            ))}
          </ul>
        </>
      )}
    </Ventana>
  );
}
