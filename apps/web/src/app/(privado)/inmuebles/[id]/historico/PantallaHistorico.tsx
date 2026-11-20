"use client";
import type { DatosTimeline, FiltrosHistorico, GrupoActividad, Historico } from "@inquilinus/contracts";
import { GRUPOS_ACTIVIDAD } from "@inquilinus/domain";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Campo } from "../../../../../componentes/Campo";
import { NombreGasto } from "../../../../../componentes/ColorGasto";
import formulario from "../../../../../componentes/formulario.module.css";
import { formatoEuros } from "../../../../../lib/dinero";
import { formatoFecha } from "../../../../../lib/fechas";
import privado from "../../../privado.module.css";
import propias from "../detalle.module.css";
import { VentanaAbierta, type Abierta } from "../Ventanas";
import estilos from "./historico.module.css";
import { ListaActividades } from "./ListaActividades";

/** Los filtros, como parámetros de la URL (los de lista, repetidos). */
function aUrl(f: FiltrosHistorico): string {
  const p = new URLSearchParams();
  for (const v of f.inquilino ?? []) p.append("inquilino", v);
  for (const v of f.gasto ?? []) p.append("gasto", v);
  for (const v of f.grupo ?? []) p.append("grupo", v);
  if (f.estado) p.set("estado", f.estado);
  if (f.desde) p.set("desde", f.desde);
  if (f.hasta) p.set("hasta", f.hasta);
  const texto = p.toString();
  return texto ? `?${texto}` : "";
}

const alternar = <T,>(lista: readonly T[] | undefined, valor: T): T[] | undefined => {
  const nueva = lista?.includes(valor) ? lista.filter((v) => v !== valor) : [...(lista ?? []), valor];
  return nueva.length > 0 ? nueva : undefined;
};

/**
 * Spec 012, R5–R8: filtros combinables (en la URL), los activos siempre a la
 * vista y quitables con un toque, el resumen de lo filtrado y las actividades
 * por mes, que abren su ventana de detalle.
 */
export function PantallaHistorico({
  inmuebleId,
  datos,
  habitaciones,
  historico,
  filtros,
  hoy,
}: {
  inmuebleId: string;
  datos: DatosTimeline;
  habitaciones: { id: string; nombre: string }[];
  historico: Historico;
  filtros: FiltrosHistorico;
  hoy: string;
}) {
  const t = useTranslations("Historico");
  const idioma = useLocale();
  const router = useRouter();
  const ruta = usePathname();
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  const aplicar = (f: FiltrosHistorico) => router.push(`${ruta}${aUrl(f)}`, { scroll: false });

  const nombreInquilino = (id: string) => datos.inquilinos.find((q) => q.id === id)?.nombre ?? t("inquilinoBorrado");
  const nombreGasto = (id: string) => (id === "alquiler" ? t("alquiler") : (datos.tiposGasto.find((tg) => tg.id === id)?.nombre ?? t("gasto")));

  // R6: cada filtro activo, con lo que hay que quitar para deshacerlo.
  const activos: { clave: string; texto: string; sin: FiltrosHistorico }[] = [
    ...(filtros.inquilino ?? []).map((id) => ({ clave: `i-${id}`, texto: nombreInquilino(id), sin: { ...filtros, inquilino: alternar(filtros.inquilino, id) } })),
    ...(filtros.gasto ?? []).map((id) => ({ clave: `g-${id}`, texto: nombreGasto(id), sin: { ...filtros, gasto: alternar(filtros.gasto, id) } })),
    ...(filtros.grupo ?? []).map((g) => ({ clave: `t-${g}`, texto: t(`grupos.${g}`), sin: { ...filtros, grupo: alternar(filtros.grupo, g) } })),
    ...(filtros.estado ? [{ clave: "estado", texto: t(`estados.${filtros.estado}`), sin: { ...filtros, estado: undefined } }] : []),
    ...(filtros.desde ? [{ clave: "desde", texto: t("desdeEl", { fecha: formatoFecha(filtros.desde, idioma) }), sin: { ...filtros, desde: undefined } }] : []),
    ...(filtros.hasta ? [{ clave: "hasta", texto: t("hastaEl", { fecha: formatoFecha(filtros.hasta, idioma) }), sin: { ...filtros, hasta: undefined } }] : []),
  ];

  const casilla = (id: string, marcada: boolean, etiqueta: React.ReactNode, alCambiar: () => void) => (
    <label key={id} className={formulario.casilla}>
      <input type="checkbox" checked={marcada} onChange={alCambiar} />
      <span>{etiqueta}</span>
    </label>
  );

  return (
    <>
      <section className={privado.seccion} aria-labelledby="titulo-filtros">
        <h2 id="titulo-filtros">{t("filtros")}</h2>
        {activos.length > 0 && (
          <ul className={estilos.activos} aria-label={t("filtrosActivos")}>
            {activos.map((a) => (
              <li key={a.clave}>
                <button type="button" className={estilos.chip} onClick={() => aplicar(a.sin)} aria-label={t("quitarFiltro", { filtro: a.texto })}>
                  {a.texto} <span aria-hidden="true">✕</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" className={formulario.botonEnlace} onClick={() => aplicar({})}>
                {t("quitarTodos")}
              </button>
            </li>
          </ul>
        )}
        <details className={propias.archivadas}>
          <summary>{t("elegirFiltros")}</summary>
          <div className={estilos.filtros}>
            {datos.inquilinos.length > 0 && (
              <fieldset className={estilos.grupoFiltro}>
                <legend className={formulario.etiqueta}>{t("inquilinos")}</legend>
                {datos.inquilinos.map((q) =>
                  casilla(q.id, Boolean(filtros.inquilino?.includes(q.id)), q.nombre, () =>
                    aplicar({ ...filtros, inquilino: alternar(filtros.inquilino, q.id) }),
                  ),
                )}
              </fieldset>
            )}
            <fieldset className={estilos.grupoFiltro}>
              <legend className={formulario.etiqueta}>{t("gastos")}</legend>
              {casilla("alquiler", Boolean(filtros.gasto?.includes("alquiler")), t("alquiler"), () =>
                aplicar({ ...filtros, gasto: alternar(filtros.gasto, "alquiler") }),
              )}
              {datos.tiposGasto.map((tg) =>
                casilla(tg.id, Boolean(filtros.gasto?.includes(tg.id)), <NombreGasto nombre={tg.nombre} color={tg.color} />, () =>
                  aplicar({ ...filtros, gasto: alternar(filtros.gasto, tg.id) }),
                ),
              )}
            </fieldset>
            <fieldset className={estilos.grupoFiltro}>
              <legend className={formulario.etiqueta}>{t("tipoActividad")}</legend>
              {GRUPOS_ACTIVIDAD.filter((g) => g !== "enlaces").map((g) =>
                casilla(g, Boolean(filtros.grupo?.includes(g as GrupoActividad)), t(`grupos.${g}`), () =>
                  aplicar({ ...filtros, grupo: alternar(filtros.grupo, g as GrupoActividad) }),
                ),
              )}
            </fieldset>
            <fieldset className={estilos.grupoFiltro}>
              <legend className={formulario.etiqueta}>{t("estadoPago")}</legend>
              {(["todos", "pagado", "pendiente"] as const).map((e) => (
                <label key={e} className={formulario.casilla}>
                  <input
                    type="radio"
                    name="estado"
                    checked={(filtros.estado ?? "todos") === e}
                    onChange={() => aplicar({ ...filtros, estado: e === "todos" ? undefined : e })}
                  />
                  <span>{t(`estados.${e}`)}</span>
                </label>
              ))}
            </fieldset>
            <div className={estilos.fechas}>
              <Campo
                etiqueta={t("desde")}
                type="date"
                value={filtros.desde ?? ""}
                onChange={(e) => aplicar({ ...filtros, desde: e.target.value || undefined })}
              />
              <Campo
                etiqueta={t("hasta")}
                type="date"
                value={filtros.hasta ?? ""}
                onChange={(e) => aplicar({ ...filtros, hasta: e.target.value || undefined })}
              />
            </div>
          </div>
        </details>

        {/* R7: con filtros, lo cobrado y lo pendiente de lo filtrado. */}
        {historico.resumen && (
          <div className={estilos.resumen} aria-live="polite">
            <span className={estilos.cifra}>
              <span className={propias.suave}>{t("cobrado")}</span>
              <strong>{formatoEuros(historico.resumen.pagado, idioma)}</strong>
            </span>
            <span className={estilos.cifra}>
              <span className={propias.suave}>{t("pendiente")}</span>
              <strong>{formatoEuros(historico.resumen.pendiente, idioma)}</strong>
            </span>
          </div>
        )}
      </section>

      <section className={privado.seccion} aria-labelledby="titulo-actividades">
        <h2 id="titulo-actividades">{t("actividades", { n: historico.actividades.length })}</h2>
        {historico.actividades.length === 0 ? (
          <p className={propias.suave}>{activos.length > 0 ? t("nadaConFiltros") : t("vacio")}</p>
        ) : (
          <ListaActividades actividades={historico.actividades} datos={datos} habitaciones={habitaciones} alAbrir={setAbierta} porMes />
        )}
      </section>

      <VentanaAbierta
        abierta={abierta}
        inmuebleId={inmuebleId}
        datos={datos}
        habitaciones={habitaciones}
        hoy={hoy}
        alCambiar={setAbierta}
      />
    </>
  );
}
