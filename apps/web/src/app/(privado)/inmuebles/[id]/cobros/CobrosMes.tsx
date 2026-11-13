"use client";
import type { Cobro, CobrosDelMes, Inquilino, ParteGasto, ResultadoPagoTodo, TipoGasto } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../../../componentes/Aviso";
import { Campo } from "../../../../../componentes/Campo";
import formulario from "../../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../../lib/api-cliente";
import { eurosACentimos, formatoEuros } from "../../../../../lib/dinero";
import type { ClaveError } from "../../../../../lib/errores";
import { formatoFecha, formatoMes } from "../../../../../lib/fechas";
import { useAccion } from "../../../../../lib/use-accion";
import privado from "../../../privado.module.css";
import propias from "../detalle.module.css";
import { FilaParte } from "../FilaParte";
import estilos from "./cobros.module.css";
import { FilaCobro } from "./FilaCobro";

const suma = (conceptos: readonly { importe: number }[]) => conceptos.reduce((s, c) => s + c.importe, 0);

/** Cobros de un mes del inmueble (spec 009, R7–R13). */
export function CobrosMes({
  inmuebleId,
  datos,
  inquilinos,
  tiposGasto,
  mesActual,
  hoy,
}: {
  inmuebleId: string;
  datos: CobrosDelMes;
  inquilinos: Inquilino[];
  tiposGasto: TipoGasto[];
  mesActual: string;
  hoy: string;
}) {
  const t = useTranslations("Cobros");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const router = useRouter();
  const base = `/inmuebles/${inmuebleId}/cobros`;
  const restauracion = useAccion();
  const [mensaje, setMensaje] = useState<string | null>(null);
  // R10: lo último que se marcó con «Todo pagado», para poder deshacerlo.
  const [ultimoPagoTodo, setUltimoPagoTodo] = useState<{ inquilinoId: string; cobros: string[]; partes: string[] } | null>(null);
  const [errorPago, setErrorPago] = useState<ClaveError | null>(null);

  const nombre = (id: string) => inquilinos.find((q) => q.id === id)?.nombre ?? "—";
  const etiqueta = (c: Cobro) => t("alquilerDe", { mes: formatoMes(c.mes, idioma) });
  // Spec 009, R8: «Luz (1 sept – 30 sept)».
  const etiquetaGasto = (p: ParteGasto) =>
    t("gastoDe", {
      tipo: tiposGasto.find((tg) => tg.id === p.tipoGastoId)?.nombre ?? "—",
      inicio: formatoFecha(p.periodoInicio, idioma),
      fin: formatoFecha(p.periodoFin, idioma),
    });

  // Por inquilino, en el orden de la ficha del inmueble.
  const grupos = inquilinos
    .map((q) => ({
      inquilino: q,
      cobros: datos.cobros.filter((c) => c.inquilinoId === q.id),
      gastos: datos.gastos.filter((g) => g.inquilinoId === q.id),
    }))
    .filter((g) => g.cobros.length > 0 || g.gastos.length > 0);

  const generar = async () => {
    setMensaje(null);
    const resultado = await pedirApi<{ creados: Cobro[] }>(`${base}/generar`, { cuerpo: { mes: datos.mes } });
    if (!resultado.ok) {
      setErrorPago(resultado.error);
      return;
    }
    setErrorPago(null);
    setMensaje(resultado.datos.creados.length === 0 ? t("nadaQueGenerar") : t("generados", { n: resultado.datos.creados.length }));
    router.refresh();
  };

  const pagarTodo = async (inquilinoId: string) => {
    setErrorPago(null);
    const resultado = await pedirApi<ResultadoPagoTodo>(`${base}/pagar-todo`, { cuerpo: { inquilinoId, mes: datos.mes } });
    if (!resultado.ok) return setErrorPago(resultado.error);
    setUltimoPagoTodo({
      inquilinoId,
      cobros: resultado.datos.marcados.map((c) => c.id),
      partes: resultado.datos.partes.map((p) => p.id),
    });
    router.refresh();
  };

  const deshacerPagoTodo = async () => {
    if (!ultimoPagoTodo) return;
    await Promise.all([
      ...ultimoPagoTodo.cobros.map((id) => pedirApi(`${base}/${id}`, { metodo: "PATCH", cuerpo: { pagadoEn: null } })),
      ...ultimoPagoTodo.partes.map((id) =>
        pedirApi(`/inmuebles/${inmuebleId}/partes/${id}`, { metodo: "PATCH", cuerpo: { pagadoEn: null } }),
      ),
    ]);
    setUltimoPagoTodo(null);
    router.refresh();
  };

  const delMes = [...datos.cobros, ...datos.gastos];
  const cobrado = suma(delMes.filter((c) => c.pagadoEn));
  const pendiente = suma(delMes.filter((c) => !c.pagadoEn));
  const atrasados = suma([...datos.atrasados, ...datos.gastosAtrasados]);
  // R11: vacíos del alquiler y días sin ocupar de las facturas del mes.
  const asumes =
    datos.asumePropietario === null && datos.asumePropietarioGastos === 0
      ? null
      : (datos.asumePropietario ?? 0) + datos.asumePropietarioGastos;

  return (
    <>
      {datos.atrasados.length + datos.gastosAtrasados.length > 0 && (
        <section className={`${privado.seccion} ${estilos.atrasados}`} aria-labelledby="titulo-atrasados">
          <h2 id="titulo-atrasados">{t("atrasados")}</h2>
          <p className={propias.suave}>{t("atrasadosExplicacion", { total: formatoEuros(atrasados, idioma) })}</p>
          <ul className={estilos.cobros}>
            {datos.atrasados.map((c) => (
              <FilaCobro key={c.id} base={base} cobro={c} etiqueta={`${nombre(c.inquilinoId)} · ${etiqueta(c)}`} hoy={hoy} />
            ))}
            {datos.gastosAtrasados.map((p) => (
              <FilaParte
                key={p.id}
                inmuebleId={inmuebleId}
                parte={p}
                etiqueta={`${nombre(p.inquilinoId)} · ${etiquetaGasto(p)}`}
                detalle={t("repartidaEn", { mes: formatoMes(p.mes, idioma) })}
                hoy={hoy}
              />
            ))}
          </ul>
        </section>
      )}

      <section className={privado.seccion} aria-labelledby="titulo-mes">
        <h2 id="titulo-mes">{t("alquileresDe", { mes: formatoMes(datos.mes, idioma) })}</h2>
        {mensaje && <Aviso tipo="exito">{mensaje}</Aviso>}
        {errorPago && <Aviso tipo="error">{te(errorPago)}</Aviso>}
        {grupos.length === 0 && <p className={propias.suave}>{t("sinCobros")}</p>}

        {grupos.map(({ inquilino, cobros, gastos }) => {
          const pendientes = [...cobros, ...gastos].filter((c) => !c.pagadoEn);
          const recienPagado =
            ultimoPagoTodo?.inquilinoId === inquilino.id && ultimoPagoTodo.cobros.length + ultimoPagoTodo.partes.length > 0;
          return (
            <div key={inquilino.id} className={propias.elemento}>
              <div className={propias.fila}>
                <span className={propias.nombre}>{inquilino.nombre}</span>
                {pendientes.length > 0 ? (
                  <button type="button" className={formulario.botonEnlace} onClick={() => void pagarTodo(inquilino.id)}>
                    {t("todoPagado")}
                  </button>
                ) : recienPagado ? (
                  <button type="button" className={formulario.botonEnlace} onClick={() => void deshacerPagoTodo()}>
                    {t("deshacerTodoPagado")}
                  </button>
                ) : null}
              </div>
              <ul className={estilos.cobros}>
                {cobros.map((c) => (
                  <FilaCobro key={c.id} base={base} cobro={c} etiqueta={etiqueta(c)} hoy={hoy} />
                ))}
                {gastos.map((p) => (
                  <FilaParte key={p.id} inmuebleId={inmuebleId} parte={p} etiqueta={etiquetaGasto(p)} hoy={hoy} />
                ))}
              </ul>
            </div>
          );
        })}

        {datos.mes <= mesActual && (
          <div className={estilos.accionesMes}>
            <button type="button" className={formulario.botonSecundario} onClick={() => void generar()}>
              {t("generar")}
            </button>
            <span className={propias.suave}>{t("generarExplicacion")}</span>
          </div>
        )}

        <AnadirCobro base={base} mes={datos.mes} inquilinos={inquilinos.filter((q) => !q.anonimizado)} />
      </section>

      <section className={privado.seccion} aria-labelledby="titulo-totales">
        <h2 id="titulo-totales">{t("totales")}</h2>
        <dl className={propias.datos}>
          <dt>{t("cobradoMes")}</dt>
          <dd className={propias.importe}>{formatoEuros(cobrado, idioma)}</dd>
          <dt>{t("pendienteMes")}</dt>
          <dd className={propias.importe}>{formatoEuros(pendiente, idioma)}</dd>
          <dt>{t("asumesTu")}</dt>
          <dd className={propias.importe}>{asumes === null ? "—" : formatoEuros(asumes, idioma)}</dd>
        </dl>
        <p className={propias.suave}>{t("asumesTuExplicacion")}</p>
      </section>

      {datos.quitados.length > 0 && (
        <details className={propias.archivadas}>
          <summary>{t("quitados", { n: datos.quitados.length })}</summary>
          {restauracion.error && <Aviso tipo="error">{te(restauracion.error)}</Aviso>}
          <ul className={propias.estancias}>
            {datos.quitados.map((c) => (
              <li key={c.id} className={propias.fila}>
                <span>
                  {nombre(c.inquilinoId)} · {etiqueta(c)} · {formatoEuros(c.importe, idioma)}
                </span>
                <button
                  type="button"
                  className={formulario.botonEnlace}
                  disabled={restauracion.enviando}
                  onClick={() => void restauracion.ejecutar(`${base}/${c.id}`, { metodo: "PATCH", cuerpo: { quitado: false } })}
                >
                  {t("restaurar")}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** Spec 005, R10b: un cobro a mano. Sin renta, la calculada si vivió allí ese mes. */
function AnadirCobro({ base, mes, inquilinos }: { base: string; mes: string; inquilinos: Inquilino[] }) {
  const t = useTranslations("Cobros");
  const te = useTranslations("Errores");
  const { enviando, error, ejecutar, limpiarError } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const [inquilinoId, setInquilinoId] = useState("");
  const [renta, setRenta] = useState("");
  const [revisado, setRevisado] = useState(false);
  const centimos = renta.trim() === "" ? undefined : eurosACentimos(renta);

  if (inquilinos.length === 0) return null;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setRevisado(true);
    if (centimos === null || !inquilinoId) return;
    void ejecutar(base, { cuerpo: { inquilinoId, mes, ...(centimos !== undefined && { renta: centimos }) } }, () => setAbierto(false));
  };

  if (!abierto) {
    return (
      <div>
        <button
          type="button"
          className={formulario.botonEnlace}
          onClick={() => {
            limpiarError();
            setRevisado(false);
            setRenta("");
            setInquilinoId(inquilinos[0]!.id);
            setAbierto(true);
          }}
        >
          {t("anadirCobro")}
        </button>
      </div>
    );
  }

  return (
    <form className={propias.enLinea} onSubmit={enviar} noValidate>
      {error && <Aviso tipo="error">{te(error)}</Aviso>}
      <div className={propias.dosColumnas}>
        <div className={formulario.campo}>
          <label htmlFor="inquilino-cobro" className={formulario.etiqueta}>
            {t("inquilino")}
          </label>
          <select id="inquilino-cobro" className={propias.selector} value={inquilinoId} onChange={(e) => setInquilinoId(e.target.value)}>
            {inquilinos.map((q) => (
              <option key={q.id} value={q.id}>
                {q.nombre}
              </option>
            ))}
          </select>
        </div>
        <Campo
          etiqueta={t("renta")}
          marca={t("opcional")}
          inputMode="decimal"
          value={renta}
          error={revisado && centimos === null ? te("importeInvalido") : null}
          onChange={(e) => setRenta(e.target.value)}
        />
      </div>
      <p className={propias.suave}>{t("anadirExplicacion")}</p>
      <div className={propias.botones}>
        <button type="button" className={formulario.botonSecundario} onClick={() => setAbierto(false)}>
          {t("cancelar")}
        </button>
        <button type="submit" className={formulario.boton} disabled={enviando}>
          {t("anadirCobro")}
        </button>
      </div>
    </form>
  );
}
