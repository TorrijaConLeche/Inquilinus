"use client";
import type { DatosTimeline, TipoGasto } from "@inquilinus/contracts";
import {
  DIAS_VISIBLES,
  aDia,
  desdeDia,
  carriles,
  chinchetasAlquiler,
  diaEnEje,
  ejeTimeline,
  estadoPagoGrupo,
  filasTimeline,
  marcasTimeline,
  tramoEnEje,
  type EjeTimeline,
  type EstadoPagoGrupo,
  type ZoomTimeline,
} from "@inquilinus/domain";
import { useLocale, useTranslations } from "next-intl";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatoEuros } from "../../lib/dinero";
import { formatoDiaMes, formatoMesCorto } from "../../lib/fechas";
import { NombreGasto, PuntoColor } from "../ColorGasto";
import colores from "../colores.module.css";
import estilos from "./timeline.module.css";

const ZOOMS: ZoomTimeline[] = ["mes", "trimestre", "anio"];

/** Variables de posición: día de inicio y número de días (en unidades de `--dia`). */
const posicion = (desde: number, dias = 1, extra: CSSProperties = {}): CSSProperties =>
  ({ "--desde": desde, "--largo": dias, ...extra }) as CSSProperties;

/** Lo que se pulsa en el timeline (R11 y R12): una chincheta de alquiler o una factura. */
export type SeleccionTimeline = { tipo: "alquiler"; fecha: string; cobroIds: string[] } | { tipo: "factura"; facturaId: string };

/**
 * Timeline del inmueble (spec 006, R1–R10): un eje de días con el alquiler,
 * cada tipo de gasto y la estancia de cada inquilino. El mismo componente sirve
 * a la propietaria y, más adelante, al enlace del inquilino (spec 004). Con
 * `alPulsar`, chinchetas y barras son botones que abren su detalle.
 */
export function Timeline({
  datos,
  hoy,
  alPulsar,
  resaltado,
}: {
  datos: DatosTimeline;
  hoy: string;
  alPulsar?: ((seleccion: SeleccionTimeline) => void) | undefined;
  /**
   * Spec 004, R6c: en el enlace del inquilino, su fila resaltada. Entonces el
   * estado es solo el suyo (spec 006, R10): «✓» o «pendiente».
   */
  resaltado?: string | undefined;
}) {
  const t = useTranslations("Timeline");
  const idioma = useLocale();
  const [zoom, setZoom] = useState<ZoomTimeline>("mes");
  const desplazable = useRef<HTMLDivElement>(null);
  // El día que había en el centro antes de cambiar de zoom (el eje cambia con él).
  const centro = useRef<string | null>(null);

  const eje = useMemo(
    () =>
      ejeTimeline(
        [
          ...datos.cobros.map((c) => c.fechaCobro),
          ...datos.facturas.flatMap((f) => [f.periodoInicio, f.periodoFin]),
          ...datos.inquilinos.flatMap((q) => q.ocupaciones.flatMap((o) => (o.salida ? [o.entrada, o.salida] : [o.entrada]))),
        ],
        hoy,
        DIAS_VISIBLES[zoom],
      ),
    [datos, hoy, zoom],
  );
  const marcas = useMemo(() => marcasTimeline(eje, zoom), [eje, zoom]);
  // El año va en las etiquetas de enero; si no hay ninguna, en la primera.
  const hayEnero = marcas.some((m) => m.etiqueta === "mes" && m.fecha.slice(5, 7) === "01");
  const filas = filasTimeline({
    tiposGasto: datos.tiposGasto,
    conFacturas: new Set(datos.facturas.flatMap((f) => (f.tipoGastoId ? [f.tipoGastoId] : []))),
    inquilinos: datos.inquilinos.map((q) => ({ id: q.id, estancias: q.ocupaciones.length })),
  });

  // R6: al abrir, el mes anterior al actual en el borde izquierdo; al cambiar
  // de zoom, se conserva el día que había en el centro.
  useLayoutEffect(() => {
    const caja = desplazable.current;
    if (!caja) return;
    const anchoDia = caja.scrollWidth > 0 ? anchoDeDia(caja) : 0;
    if (anchoDia === 0) return;
    const etiquetas = anchoEtiquetas(caja);
    if (centro.current === null) {
      caja.scrollLeft = diaEnEje(eje, primerDiaMesAnterior(hoy)) * anchoDia;
    } else {
      caja.scrollLeft = (diaEnEje(eje, centro.current) + 0.5) * anchoDia - (caja.clientWidth - etiquetas) / 2;
    }
  }, [zoom, eje, hoy]);

  const cambiarZoom = (nuevo: ZoomTimeline) => {
    const caja = desplazable.current;
    if (caja) {
      const anchoDia = anchoDeDia(caja);
      if (anchoDia > 0) {
        const dia = Math.floor((caja.scrollLeft + (caja.clientWidth - anchoEtiquetas(caja)) / 2) / anchoDia);
        centro.current = desdeDia(aDia(eje.desde) + Math.min(Math.max(dia, 0), eje.dias - 1));
      }
    }
    setZoom(nuevo);
  };

  const textoPago = (estado: EstadoPagoGrupo) =>
    estado.completo ? t("todoPagado") : resaltado ? t("pendiente") : t("pagados", { pagados: estado.pagados, total: estado.total });
  // R6b: con trimestre y año, en corto («1/3»); el texto entero, para lectores de pantalla.
  const compacto = zoom !== "mes";
  const marcaPago = (estado: EstadoPagoGrupo) =>
    estado.completo ? (
      <>
        <span aria-hidden="true">✓</span>
        <span className="sr-only">{t("todoPagado")}</span>
      </>
    ) : resaltado ? (
      t("pendiente")
    ) : compacto ? (
      <>
        <span aria-hidden="true">{t("pagadosCorto", { pagados: estado.pagados, total: estado.total })}</span>
        <span className="sr-only">{t("pagados", { pagados: estado.pagados, total: estado.total })}</span>
      </>
    ) : (
      t("pagados", { pagados: estado.pagados, total: estado.total })
    );
  const hoyEnEje = diaEnEje(eje, hoy);

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-timeline">
      <div className={estilos.cabecera}>
        <h2 id="titulo-timeline">{t("titulo")}</h2>
        {/* R6: zoom mes, trimestre y año. */}
        <div className={estilos.zoom} role="group" aria-label={t("zoom")}>
          {ZOOMS.map((z) => (
            <button key={z} type="button" aria-pressed={zoom === z} onClick={() => cambiarZoom(z)}>
              {t(`zooms.${z}`)}
            </button>
          ))}
        </div>
      </div>

      <div className={estilos.marco} style={{ "--dias": eje.dias, "--dias-visibles": DIAS_VISIBLES[zoom] } as CSSProperties}>
        <div ref={desplazable} className={estilos.desplazable} tabIndex={0} role="region" aria-label={t("desplazar")}>
          <div className={estilos.lienzo}>
            {filas.map((fila) => {
              if (fila.tipo === "alquiler") {
                const chinchetas = chinchetasAlquiler(
                  datos.cobros.map((c) => ({ id: c.id, fechaCobro: c.fechaCobro, importe: c.importe, pagado: c.pagadoEn !== null })),
                );
                return (
                  <Fila
                    key="alquiler"
                    etiqueta={
                      <span className={estilos.nombreFila}>
                        <PuntoColor color="alquiler" />
                        {t("alquiler")}
                      </span>
                    }
                    clase={`${estilos.filaAlquiler} ${compacto ? estilos.compacta : ""}`}
                    hoy={hoyEnEje}
                    eje={eje}
                  >
                    {chinchetas.map((ch) => {
                      const dia = diaEnEje(eje, ch.fecha);
                      if (dia < 0 || dia >= eje.dias) return null;
                      const texto = `${formatoDiaMes(ch.fecha, idioma)}: ${formatoEuros(ch.importe, idioma)}, ${textoPago(ch.estado)}`;
                      // R3 y R3b: una chincheta por fecha de cobro con su importe y su estado (R10).
                      return (
                        <li key={ch.fecha} className={`${estilos.chincheta} ${colores.alquiler}`} style={posicion(dia)} title={texto}>
                          <Pulsable
                            clase={estilos.importeChincheta}
                            alPulsar={alPulsar && (() => alPulsar({ tipo: "alquiler", fecha: ch.fecha, cobroIds: ch.ids }))}
                          >
                            <span className="sr-only">{t("alquilerDel", { fecha: formatoDiaMes(ch.fecha, idioma) })}</span>
                            {formatoEuros(ch.importe, idioma)} <span className={estilos.estado}>{marcaPago(ch.estado)}</span>
                          </Pulsable>
                        </li>
                      );
                    })}
                  </Fila>
                );
              }

              if (fila.tipo === "gasto") {
                const tipo = datos.tiposGasto.find((tg) => tg.id === fila.tipoGastoId)!;
                return (
                  <FilaGasto
                    key={tipo.id}
                    tipo={tipo}
                    datos={datos}
                    eje={eje}
                    hoy={hoyEnEje}
                    textoPago={textoPago}
                    marcaPago={marcaPago}
                    alPulsar={alPulsar}
                  />
                );
              }

              const inquilino = datos.inquilinos.find((q) => q.id === fila.inquilinoId)!;
              return (
                <Fila
                  key={inquilino.id}
                  etiqueta={<span className={estilos.nombreFila}>{inquilino.nombre}</span>}
                  clase={`${estilos.filaInquilino} ${inquilino.id === resaltado ? estilos.resaltada : ""}`}
                  hoy={hoyEnEje}
                  eje={eje}
                >
                  {inquilino.ocupaciones.map((o) => {
                    const tramo = tramoEnEje(eje, o.entrada, o.salida);
                    if (!tramo) return null;
                    const entraVisible = diaEnEje(eje, o.entrada) === tramo.desde;
                    const saleVisible = o.salida !== null && diaEnEje(eje, o.salida) === tramo.hasta;
                    // R5: línea de la entrada a la salida; sin salida, hasta el borde derecho.
                    return (
                      <li
                        key={`${o.habitacionId}-${o.entrada}`}
                        className={`${estilos.estancia} ${o.salida === null ? estilos.sinSalida : ""}`}
                        style={posicion(tramo.desde, tramo.hasta - tramo.desde + 1)}
                      >
                        {entraVisible && (
                          <span className={estilos.entrada}>
                            <span className={estilos.textoPunto}>{t("entra", { fecha: formatoDiaMes(o.entrada, idioma) })}</span>
                          </span>
                        )}
                        {saleVisible && (
                          <span className={estilos.salida}>
                            <span className={estilos.textoPunto}>{t("sale", { fecha: formatoDiaMes(o.salida!, idioma) })}</span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </Fila>
              );
            })}

            {/* R1: el eje de días, abajo. */}
            <div className={estilos.fila} aria-hidden="true">
              <div className={estilos.etiqueta} />
              <div className={estilos.eje}>
                {marcas.map((m) => (
                  <span
                    key={m.dia}
                    className={`${m.larga ? estilos.marcaLarga : estilos.marca} ${m.dia === 0 ? estilos.primera : ""}`}
                    style={posicion(m.dia)}
                  >
                    {m.etiqueta === "dia" && <span className={estilos.textoMarca}>{formatoDiaMes(m.fecha, idioma)}</span>}
                    {m.etiqueta === "mes" && (
                      <span className={estilos.textoMarca}>
                        {formatoMesCorto(m.fecha, idioma)}
                        {(m.fecha.slice(5, 7) === "01" || (m.dia === 0 && !hayEnero)) && (
                          <span className={estilos.anioMarca}>{m.fecha.slice(0, 4)}</span>
                        )}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Una fila: su nombre fijo a la izquierda (R2) y su pista con lo que lleva. */
function Fila({
  etiqueta,
  clase,
  alto,
  hoy,
  eje,
  children,
}: {
  etiqueta: React.ReactNode;
  clase?: string | undefined;
  alto?: number;
  hoy: number;
  eje: EjeTimeline;
  children: React.ReactNode;
}) {
  return (
    <div className={`${estilos.fila} ${clase ?? ""}`} style={alto ? ({ "--carriles": alto } as CSSProperties) : undefined}>
      <div className={estilos.etiqueta}>{etiqueta}</div>
      <div className={estilos.pista}>
        {hoy >= 0 && hoy < eje.dias && <span className={estilos.hoy} style={posicion(hoy)} aria-hidden="true" />}
        <ul className={estilos.elementos}>{children}</ul>
      </div>
    </div>
  );
}

/** R4 y R4b: una barra por factura repartida, con su importe y su estado; las solapadas, en carriles. */
function FilaGasto({
  tipo,
  datos,
  eje,
  hoy,
  textoPago,
  marcaPago,
  alPulsar,
}: {
  tipo: TipoGasto;
  datos: DatosTimeline;
  eje: EjeTimeline;
  hoy: number;
  textoPago: (e: EstadoPagoGrupo) => string;
  marcaPago: (e: EstadoPagoGrupo) => React.ReactNode;
  alPulsar?: ((seleccion: SeleccionTimeline) => void) | undefined;
}) {
  const idioma = useLocale();
  const t = useTranslations("Timeline");
  const facturas = datos.facturas.filter((f) => f.tipoGastoId === tipo.id);
  const carril = carriles(facturas.map((f) => ({ inicio: f.periodoInicio, fin: f.periodoFin })));
  const totalCarriles = Math.max(1, ...carril.map((c) => c + 1));
  return (
    <Fila
      etiqueta={
        <span className={estilos.nombreFila}>
          <NombreGasto nombre={tipo.nombre} color={tipo.color} />
        </span>
      }
      clase={estilos.filaGasto}
      alto={totalCarriles}
      hoy={hoy}
      eje={eje}
    >
      {facturas.map((f, i) => {
        const tramo = tramoEnEje(eje, f.periodoInicio, f.periodoFin);
        if (!tramo) return null;
        const estado = estadoPagoGrupo(f.partes.map((p) => p.pagadoEn !== null));
        const periodo = t("periodo", { inicio: formatoDiaMes(f.periodoInicio, idioma), fin: formatoDiaMes(f.periodoFin, idioma) });
        return (
          <li
            key={f.id}
            className={`${estilos.barra} ${colores[tipo.color]}`}
            style={posicion(tramo.desde, tramo.hasta - tramo.desde + 1, { "--carril": carril[i] } as CSSProperties)}
            title={`${tipo.nombre}, ${periodo}: ${formatoEuros(f.importeTotal, idioma)}, ${textoPago(estado)}`}
          >
            <Pulsable clase={estilos.botonBarra} alPulsar={alPulsar && (() => alPulsar({ tipo: "factura", facturaId: f.id }))}>
              <span className="sr-only">
                {tipo.nombre}, {periodo}:
              </span>
              <span className={estilos.textoBarra}>
                {formatoEuros(f.importeTotal, idioma)} <span className={estilos.estado}>{marcaPago(estado)}</span>
              </span>
            </Pulsable>
          </li>
        );
      })}
    </Fila>
  );
}

/** Un botón si se puede pulsar (R11, R12); si no, un simple contenedor. */
function Pulsable({ clase, alPulsar, children }: { clase: string | undefined; alPulsar?: (() => void) | undefined; children: React.ReactNode }) {
  return alPulsar ? (
    <button type="button" className={`${clase} ${estilos.pulsable}`} onClick={alPulsar}>
      {children}
    </button>
  ) : (
    <span className={clase}>{children}</span>
  );
}

const primerDiaMesAnterior = (hoy: string) => {
  const [anio, mes] = hoy.split("-").map(Number);
  const total = anio! * 12 + (mes! - 1) - 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
};

/** Ancho de la columna de nombres, que tapa lo que se desliza por debajo. */
const anchoEtiquetas = (caja: HTMLElement) => caja.querySelector<HTMLElement>(`.${estilos.etiqueta}`)?.offsetWidth ?? 0;

/** Píxeles por día con el zoom actual (la pista mide `--dias` días). */
function anchoDeDia(caja: HTMLElement): number {
  const pista = caja.querySelector<HTMLElement>(`.${estilos.eje}`);
  const dias = Number(getComputedStyle(caja.parentElement!).getPropertyValue("--dias"));
  return pista && dias > 0 ? pista.getBoundingClientRect().width / dias : 0;
}
