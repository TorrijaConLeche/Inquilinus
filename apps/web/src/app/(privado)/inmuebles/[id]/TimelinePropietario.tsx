"use client";
import type { DatosTimeline, DesgloseAlquiler, Liquidacion, ListaLiquidaciones, RepartoFactura } from "@inquilinus/contracts";
import { chinchetasAlquiler, estadoPagoGrupo } from "@inquilinus/domain";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import { NombreGasto, PuntoColor } from "../../../../componentes/ColorGasto";
import formulario from "../../../../componentes/formulario.module.css";
import { Timeline, type SeleccionTimeline } from "../../../../componentes/timeline/Timeline";
import { Ventana } from "../../../../componentes/Ventana";
import { pedirApi } from "../../../../lib/api-cliente";
import { formatoEuros } from "../../../../lib/dinero";
import type { ClaveError } from "../../../../lib/errores";
import { formatoFecha, formatoMes } from "../../../../lib/fechas";
import cobros from "./cobros/cobros.module.css";
import propias from "./detalle.module.css";
import { LineaLiquidacion } from "./LineaLiquidacion";

type Abierta = SeleccionTimeline | { tipo: "liquidacion"; liquidacionId: string };

const POR_PAGINA = 8;

/**
 * El timeline en la ficha del inmueble (spec 006) con lo que solo ve la
 * propietaria: las ventanas de detalle del alquiler (R11), de la factura (R12)
 * y de la liquidación (spec 011, R14), y la lista de movimientos (R13).
 */
export function TimelinePropietario({
  inmuebleId,
  datos,
  habitaciones,
  hoy,
}: {
  inmuebleId: string;
  datos: DatosTimeline;
  habitaciones: { id: string; nombre: string }[];
  hoy: string;
}) {
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const cerrar = () => setAbierta(null);

  return (
    <>
      <Timeline datos={datos} hoy={hoy} alPulsar={setAbierta} />
      <Movimientos datos={datos} alAbrir={setAbierta} />
      {abierta?.tipo === "alquiler" && (
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
      )}
      {abierta?.tipo === "factura" && (
        <VentanaFactura
          key={abierta.facturaId}
          inmuebleId={inmuebleId}
          datos={datos}
          facturaId={abierta.facturaId}
          hoy={hoy}
          alCerrar={cerrar}
          alAbrirLiquidacion={(liquidacionId) => setAbierta({ tipo: "liquidacion", liquidacionId })}
        />
      )}
      {abierta?.tipo === "liquidacion" && (
        <VentanaLiquidacion
          key={abierta.liquidacionId}
          inmuebleId={inmuebleId}
          datos={datos}
          liquidacionId={abierta.liquidacionId}
          hoy={hoy}
          alCerrar={cerrar}
        />
      )}
    </>
  );
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
function VentanaAlquiler({
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
function VentanaFactura({
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
function VentanaLiquidacion({
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

interface Movimiento {
  clave: string;
  /** Para ordenar: lo más reciente primero. */
  orden: string;
  fecha: string;
  etiqueta: ReactNode;
  detalle: string;
  alPulsar?: () => void;
}

/**
 * R13: los mismos movimientos del timeline en una lista, lo más reciente
 * primero: alquiler, facturas, liquidaciones (spec 011, R14), entradas y
 * salidas. Al pulsar uno se abre su ventana.
 */
function Movimientos({ datos, alAbrir }: { datos: DatosTimeline; alAbrir: (a: Abierta) => void }) {
  const t = useTranslations("Detalles");
  const tt = useTranslations("Timeline");
  const idioma = useLocale();
  const [cuantos, setCuantos] = useState(POR_PAGINA);
  const euros = (c: number) => formatoEuros(c, idioma);
  const pago = (pagados: boolean[]) => {
    const e = estadoPagoGrupo(pagados);
    return e.completo ? tt("todoPagado") : tt("pagados", { pagados: e.pagados, total: e.total });
  };

  const movimientos: Movimiento[] = [
    ...chinchetasAlquiler(
      datos.cobros.map((c) => ({ id: c.id, fechaCobro: c.fechaCobro, importe: c.importe, pagado: c.pagadoEn !== null })),
    ).map((ch) => ({
      clave: `alquiler-${ch.fecha}`,
      orden: ch.fecha,
      fecha: formatoFecha(ch.fecha, idioma),
      etiqueta: (
        <span className={propias.nombre}>
          <PuntoColor color="alquiler" /> {tt("alquiler")}
        </span>
      ),
      detalle: `${euros(ch.importe)} · ${ch.estado.completo ? tt("todoPagado") : tt("pagados", { pagados: ch.estado.pagados, total: ch.estado.total })}`,
      alPulsar: () => alAbrir({ tipo: "alquiler", fecha: ch.fecha, cobroIds: ch.ids }),
    })),
    ...datos.facturas.map((f) => {
      const tipo = datos.tiposGasto.find((tg) => tg.id === f.tipoGastoId);
      const liquidacion = datos.liquidaciones.find((l) => l.id === f.liquidacionId);
      return {
        clave: `factura-${f.id}`,
        orden: f.periodoFin,
        fecha: t("delAl", { desde: formatoFecha(f.periodoInicio, idioma), hasta: formatoFecha(f.periodoFin, idioma) }),
        etiqueta: <NombreGasto nombre={tipo?.nombre ?? t("gasto")} color={tipo?.color} />,
        detalle: [euros(f.importeTotal), pago(f.partes.map((p) => p.pagadoEn !== null)), liquidacion?.nombre].filter(Boolean).join(" · "),
        alPulsar: () => alAbrir({ tipo: "factura", facturaId: f.id }),
      };
    }),
    ...datos.liquidaciones.map((l) => ({
      clave: `liquidacion-${l.id}`,
      // Arriba de todo lo de su mes.
      orden: `${l.mes}-32`,
      fecha: formatoMes(l.mes, idioma),
      etiqueta: <span className={propias.nombre}>{l.nombre}</span>,
      detalle: euros(l.total),
      alPulsar: () => alAbrir({ tipo: "liquidacion", liquidacionId: l.id }),
    })),
    ...datos.inquilinos.flatMap((q) =>
      q.ocupaciones.flatMap((o) => [
        { clave: `entra-${q.id}-${o.entrada}`, orden: o.entrada, fecha: formatoFecha(o.entrada, idioma), etiqueta: q.nombre, detalle: t("entra") },
        ...(o.salida
          ? [{ clave: `sale-${q.id}-${o.salida}`, orden: o.salida, fecha: formatoFecha(o.salida, idioma), etiqueta: q.nombre, detalle: t("sale") }]
          : []),
      ]),
    ),
  ].sort((a, b) => (a.orden === b.orden ? a.clave.localeCompare(b.clave) : a.orden < b.orden ? 1 : -1));

  if (movimientos.length === 0) return null;

  return (
    <section className={propias.movimientos} aria-labelledby="titulo-movimientos">
      <h2 id="titulo-movimientos">{t("movimientos")}</h2>
      <ul className={propias.listaMovimientos}>
        {movimientos.slice(0, cuantos).map((m) => {
          const contenido = (
            <>
              <span className={propias.suave}>{m.fecha}</span>
              <span className={propias.fila}>
                <span>{m.etiqueta}</span>
                <span className={propias.importe}>{m.detalle}</span>
              </span>
            </>
          );
          return (
            <li key={m.clave}>
              {m.alPulsar ? (
                <button type="button" className={propias.movimiento} onClick={m.alPulsar}>
                  {contenido}
                </button>
              ) : (
                <div className={propias.movimiento}>{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>
      {movimientos.length > cuantos && (
        <div>
          <button type="button" className={formulario.botonEnlace} onClick={() => setCuantos(cuantos + POR_PAGINA)}>
            {t("verMas")}
          </button>
        </div>
      )}
    </section>
  );
}
