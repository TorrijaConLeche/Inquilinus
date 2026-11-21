"use client";
import type { VistaInquilino } from "@inquilinus/contracts";
import { COOKIE_IDIOMA, IDIOMAS } from "@inquilinus/contracts/idiomas";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Aviso } from "../../../componentes/Aviso";
import { NombreGasto, PuntoColor } from "../../../componentes/ColorGasto";
import formulario from "../../../componentes/formulario.module.css";
import { Timeline, type SeleccionTimeline } from "../../../componentes/timeline/Timeline";
import { Ventana } from "../../../componentes/Ventana";
import { formatoEuros } from "../../../lib/dinero";
import { formatoFecha, formatoMes } from "../../../lib/fechas";
import { guardarPreferencia } from "../../../lib/preferencias";
import estilos from "./vista.module.css";

type Cobro = VistaInquilino["cobros"][number];
type Gasto = VistaInquilino["gastos"][number];

/**
 * Vista del inquilino (spec 004, R5–R12): lo que le falta por pagar, su
 * timeline (con su fila resaltada y solo su dinero), y su histórico con
 * filtros: cobros, gastos con el cálculo por tramos, liquidaciones y fianza.
 * Nunca lo de los demás (R7b).
 */
export function VistaPublica({ vista, token, hoy }: { vista: VistaInquilino; token: string; hoy: string }) {
  const t = useTranslations("Vista");
  const idioma = useLocale();
  const router = useRouter();
  const [abierta, setAbierta] = useState<SeleccionTimeline | null>(null);
  const [tipo, setTipo] = useState<string>("todo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const euros = (c: number) => formatoEuros(c, idioma);
  const tipoDe = (id: string | null) => vista.timeline.tiposGasto.find((tg) => tg.id === id);

  // R12: el idioma del navegador, o el elegido aquí (se recuerda en este navegador).
  const cambiarIdioma = (nuevo: string) => {
    guardarPreferencia(COOKIE_IDIOMA, nuevo);
    router.refresh();
  };

  // R6 y R6b: su histórico, lo más reciente primero, con filtros por tipo y fechas.
  const elementos: { clave: string; fecha: string; tipo: string; contenido: ReactNode }[] = [
    ...vista.cobros.map((c) => ({ clave: `c-${c.id}`, fecha: c.fechaCobro, tipo: "alquiler", contenido: <ElementoCobro cobro={c} /> })),
    ...vista.gastos.map((g) => ({
      clave: `g-${g.parteId}`,
      fecha: g.periodoFin,
      tipo: g.tipoGastoId ?? "",
      contenido: <ElementoGasto gasto={g} vista={vista} token={token} />,
    })),
    ...vista.liquidaciones.map((l) => ({
      clave: `l-${l.id}`,
      fecha: `${l.mes}-28`,
      tipo: "liquidaciones",
      contenido: (
        <Plegable
          titulo={l.nombre}
          importe={euros(l.total)}
          estado={
            l.estado === "pagada" ? (
              <span className={estilos.pagado}>{t("estados.pagada")}</span>
            ) : (
              <span className={estilos.pendiente}>
                {t(`estados.${l.estado}`)}
                {l.estado === "parcial" && ` · ${t("falta", { importe: euros(l.pendiente) })}`}
              </span>
            )
          }
        >
          <ul className={estilos.lineas}>
            {vista.gastos
              .filter((g) => g.liquidacionId === l.id)
              .map((g) => (
                <li key={g.parteId}>
                  <NombreGasto nombre={tipoDe(g.tipoGastoId)?.nombre ?? t("gasto")} color={tipoDe(g.tipoGastoId)?.color} />{" "}
                  {t("periodo", { desde: formatoFecha(g.periodoInicio, idioma), hasta: formatoFecha(g.periodoFin, idioma) })}:{" "}
                  <strong>{euros(g.importe)}</strong>
                </li>
              ))}
          </ul>
        </Plegable>
      ),
    })),
    ...(vista.fianza
      ? [
          {
            clave: "fianza",
            fecha: vista.fianza.devueltaEn ?? vista.fianza.recibidaEn ?? "0000-00-00",
            tipo: "fianza",
            contenido: (
              <Plegable titulo={t("fianza")} importe={euros(vista.fianza.importe)} estado={null}>
                <ul className={estilos.lineas}>
                  {vista.fianza.recibidaEn && <li>{t("fianzaRecibida", { fecha: formatoFecha(vista.fianza.recibidaEn, idioma) })}</li>}
                  {vista.fianza.devueltaEn && (
                    <li>
                      {t("fianzaDevuelta", {
                        fecha: formatoFecha(vista.fianza.devueltaEn, idioma),
                        importe: euros(vista.fianza.importeDevuelto ?? 0),
                      })}
                    </li>
                  )}
                </ul>
              </Plegable>
            ),
          },
        ]
      : []),
  ]
    .filter((e) => (tipo === "todo" ? true : e.tipo === tipo))
    .filter((e) => (!desde || e.fecha >= desde) && (!hasta || e.fecha <= hasta))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

  const tiposConGasto = vista.timeline.tiposGasto.filter((tg) => vista.gastos.some((g) => g.tipoGastoId === tg.id));
  const cobroAbierto = abierta?.tipo === "alquiler" ? vista.cobros.find((c) => abierta.cobroIds.includes(c.id)) : undefined;
  const gastoAbierto = abierta?.tipo === "factura" ? vista.gastos.find((g) => g.facturaId === abierta.facturaId) : undefined;

  return (
    <main className={estilos.pagina}>
      <div className={estilos.barra}>
        <span className={estilos.marca}>Inquilinus</span>
        <div className={estilos.idiomas} role="group" aria-label={t("idioma")}>
          {IDIOMAS.map((i) => (
            <button key={i} type="button" aria-pressed={idioma === i} onClick={() => cambiarIdioma(i)}>
              {i.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <header className={estilos.cabecera}>
        <h1 className={estilos.titulo}>{t("hola", { nombre: vista.inquilino.nombre })}</h1>
        <p className={estilos.suave}>{t("intro", { inmueble: vista.inmueble.nombre })}</p>
      </header>

      {/* R11b */}
      {vista.inmueble.bloqueado && <Aviso tipo="info">{t("bloqueado")}</Aviso>}

      {/* R5 */}
      <section className={estilos.pendienteTarjeta} aria-labelledby="titulo-pendiente">
        <h2 id="titulo-pendiente" className={estilos.suave}>
          {t("pendiente")}
        </h2>
        <strong className={estilos.cifra}>{euros(vista.pendiente)}</strong>
        {vista.pendiente === 0 && <span className={estilos.pagado}>{t("alDia")}</span>}
      </section>

      <Timeline datos={vista.timeline} hoy={hoy} alPulsar={setAbierta} resaltado={vista.inquilino.id} />

      <section className={estilos.tarjeta} aria-labelledby="titulo-historico">
        <h2 id="titulo-historico">{t("historico")}</h2>
        <div className={estilos.filtros}>
          <label className={formulario.campo}>
            <span className={formulario.etiqueta}>{t("filtroTipo")}</span>
            <select className={formulario.entrada} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="todo">{t("todo")}</option>
              <option value="alquiler">{t("alquiler")}</option>
              {tiposConGasto.map((tg) => (
                <option key={tg.id} value={tg.id}>
                  {tg.nombre}
                </option>
              ))}
              {vista.liquidaciones.length > 0 && <option value="liquidaciones">{t("liquidaciones")}</option>}
              {vista.fianza && <option value="fianza">{t("fianza")}</option>}
            </select>
          </label>
          <label className={formulario.campo}>
            <span className={formulario.etiqueta}>{t("desde")}</span>
            <input type="date" className={formulario.entrada} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className={formulario.campo}>
            <span className={formulario.etiqueta}>{t("hasta")}</span>
            <input type="date" className={formulario.entrada} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
        {elementos.length === 0 ? (
          <p className={estilos.suave}>{t("nada")}</p>
        ) : (
          <ul className={estilos.lista}>
            {elementos.map((e) => (
              <li key={e.clave}>{e.contenido}</li>
            ))}
          </ul>
        )}
      </section>

      <p className={estilos.pie}>{t("pie")}</p>

      {/* Spec 006, R11 y R12 para el inquilino: solo lo suyo. */}
      {cobroAbierto && (
        <Ventana titulo={t("alquilerDe", { mes: formatoMes(cobroAbierto.mes, idioma) })} alCerrar={() => setAbierta(null)}>
          <DetalleCobro cobro={cobroAbierto} />
        </Ventana>
      )}
      {gastoAbierto && (
        <Ventana
          titulo={
            <NombreGasto nombre={tipoDe(gastoAbierto.tipoGastoId)?.nombre ?? t("gasto")} color={tipoDe(gastoAbierto.tipoGastoId)?.color} />
          }
          alCerrar={() => setAbierta(null)}
        >
          <DetalleGasto gasto={gastoAbierto} vista={vista} token={token} />
        </Ventana>
      )}
    </main>
  );
}

/** Una línea del histórico que se despliega en su detalle. */
function Plegable({ titulo, importe, estado, children }: { titulo: ReactNode; importe: string; estado: ReactNode; children: ReactNode }) {
  return (
    <details className={estilos.elemento}>
      <summary className={estilos.resumen}>
        <span className={estilos.concepto}>{titulo}</span>
        <span className={estilos.derecha}>
          <strong className={estilos.importe}>{importe}</strong>
          {estado}
        </span>
      </summary>
      <div className={estilos.detalle}>{children}</div>
    </details>
  );
}

function EstadoPago({ pagadoEn }: { pagadoEn: string | null }) {
  const t = useTranslations("Vista");
  const idioma = useLocale();
  return pagadoEn ? (
    <span className={estilos.pagado}>{t("pagadoEl", { fecha: formatoFecha(pagadoEn, idioma) })}</span>
  ) : (
    <span className={estilos.pendiente}>{t("estados.pendiente")}</span>
  );
}

function ElementoCobro({ cobro }: { cobro: Cobro }) {
  const t = useTranslations("Vista");
  const idioma = useLocale();
  return (
    <Plegable
      titulo={
        <>
          <PuntoColor color="alquiler" /> {t("alquilerDe", { mes: formatoMes(cobro.mes, idioma) })}
        </>
      }
      importe={formatoEuros(cobro.importe, idioma)}
      estado={<EstadoPago pagadoEn={cobro.pagadoEn} />}
    >
      <DetalleCobro cobro={cobro} />
    </Plegable>
  );
}

/** R6 y spec 006, R11: renta, recargo con su explicación, importe y si está pagado. */
function DetalleCobro({ cobro }: { cobro: Cobro }) {
  const t = useTranslations("Vista");
  const idioma = useLocale();
  const euros = (c: number) => formatoEuros(c, idioma);
  return (
    <ul className={estilos.lineas}>
      <li>{t("renta", { importe: euros(cobro.renta) })}</li>
      {cobro.recargoVacios > 0 && <li>{t("recargo", { importe: euros(cobro.recargoVacios) })}</li>}
      {cobro.vacios.map((v) => (
        <li key={`${v.habitacion}-${v.desde}`} className={estilos.suave}>
          {t("vacia", { habitacion: v.habitacion, desde: formatoFecha(v.desde, idioma), hasta: formatoFecha(v.hasta, idioma), n: v.entre })}
        </li>
      ))}
      <li>
        <strong>{t("total", { importe: euros(cobro.importe) })}</strong> · <EstadoPago pagadoEn={cobro.pagadoEn} />
      </li>
    </ul>
  );
}

function ElementoGasto({ gasto, vista, token }: { gasto: Gasto; vista: VistaInquilino; token: string }) {
  const t = useTranslations("Vista");
  const idioma = useLocale();
  const tipo = vista.timeline.tiposGasto.find((tg) => tg.id === gasto.tipoGastoId);
  return (
    <Plegable
      titulo={
        <>
          <NombreGasto nombre={tipo?.nombre ?? t("gasto")} color={tipo?.color} />{" "}
          <span className={estilos.suave}>
            {t("periodo", { desde: formatoFecha(gasto.periodoInicio, idioma), hasta: formatoFecha(gasto.periodoFin, idioma) })}
          </span>
        </>
      }
      importe={formatoEuros(gasto.importe, idioma)}
      estado={<EstadoPago pagadoEn={gasto.pagadoEn} />}
    >
      <DetalleGasto gasto={gasto} vista={vista} token={token} />
    </Plegable>
  );
}

/** R6, R7 y R8: total de la factura, su parte, sus días, el cálculo por tramos y el PDF si se puede. */
function DetalleGasto({ gasto, vista, token }: { gasto: Gasto; vista: VistaInquilino; token: string }) {
  const t = useTranslations("Vista");
  const idioma = useLocale();
  const euros = (c: number) => formatoEuros(c, idioma);
  const liquidacion = vista.liquidaciones.find((l) => l.id === gasto.liquidacionId);
  const dia = (f: string) => formatoFecha(f, idioma);
  return (
    <ul className={estilos.lineas}>
      <li>{t("totalFactura", { importe: euros(gasto.importeFactura) })}</li>
      {gasto.tramos.map((tr) => (
        <li key={tr.desde}>
          {t(tr.conQuien.length === 0 ? "tramoSolo" : "tramo", {
            desde: dia(tr.desde),
            hasta: dia(tr.hasta),
            // «tú, Bruno y Carla».
            con: new Intl.ListFormat(idioma === "en" ? "en-GB" : "es-ES", { type: "conjunction" }).format([t("tu"), ...tr.conQuien]),
            importe: euros(tr.importe),
          })}
        </li>
      ))}
      <li>
        <strong>{t("tuParte", { importe: euros(gasto.importe), n: gasto.dias })}</strong> · <EstadoPago pagadoEn={gasto.pagadoEn} />
      </li>
      {liquidacion && <li className={estilos.suave}>{t("enLiquidacion", { nombre: liquidacion.nombre })}</li>}
      {/* R8: el botón solo si la descarga está permitida. */}
      {vista.permiteDescarga && (
        <li>
          <a
            href={`/api/publico/${token}/facturas/${gasto.facturaId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className={formulario.botonSecundario}
          >
            {t("descargarPdf")}
          </a>
        </li>
      )}
    </ul>
  );
}
