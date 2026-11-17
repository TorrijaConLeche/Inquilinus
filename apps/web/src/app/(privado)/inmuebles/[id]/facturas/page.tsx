import { hoyEnMadrid } from "@inquilinus/api";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import formulario from "../../../../../componentes/formulario.module.css";
import { facturasDe, usuarioActual } from "../../../../../servidor/api";
import privado from "../../../privado.module.css";
import propias from "../detalle.module.css";
import { ConfirmarTodas } from "./ConfirmarTodas";
import { FacturaRepartida } from "./FacturaRepartida";
import { FilaFactura } from "./FilaFactura";
import { NuevaLiquidacion, PropuestaLiquidacion, TarjetaLiquidacion } from "./Liquidaciones";
import { SubirFacturas } from "./SubirFacturas";

export async function generateMetadata() {
  const t = await getTranslations("Facturas");
  return { title: t("titulo") };
}

const POR_REVISAR = ["subida", "propuesta", "error_extraccion"];

/** Facturas del inmueble (spec 003): subir PDF, revisar y confirmar, y las ya confirmadas. */
export default async function FacturasInmueble({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("Facturas");
  const tl = await getTranslations("Liquidaciones");
  const usuario = await usuarioActual();
  const datos = usuario ? await facturasDe(usuario, (await params).id) : null;
  if (!datos) notFound();
  const { inmueble, facturas, tiposGasto, inquilinos, liquidaciones } = datos;
  const hoy = hoyEnMadrid();
  const porRevisar = facturas.filter((f) => POR_REVISAR.includes(f.estado));
  // Las confirmadas, de la más reciente a la más antigua por periodo.
  const confirmadas = facturas
    .filter((f) => !POR_REVISAR.includes(f.estado))
    .sort((a, b) => (b.periodoInicio ?? "").localeCompare(a.periodoInicio ?? ""));
  const nombreTipo = (id: string | null) => tiposGasto.find((tg) => tg.id === id)?.nombre ?? "—";
  // Spec 011: las repartidas fuera de toda liquidación, de la más antigua a la más reciente.
  const sueltas = facturas
    .filter((f) => f.estado === "repartida" && f.liquidacionId === null)
    .sort((a, b) => (a.periodoInicio ?? "").localeCompare(b.periodoInicio ?? ""));
  // R4b: lotes sin nada por revisar y con al menos dos repartidas sueltas, del más reciente al más antiguo.
  const lotes = [...new Set(facturas.map((f) => f.lote))];
  const subidaDe = (lote: string) =>
    facturas.filter((f) => f.lote === lote).reduce((max, f) => (f.subidaEn > max ? f.subidaEn : max), "");
  const propuestas = lotes
    .filter((lote) => !porRevisar.some((f) => f.lote === lote))
    .map((lote) => ({ lote, facturaIds: sueltas.filter((f) => f.lote === lote).map((f) => f.id) }))
    .filter((p) => p.facturaIds.length >= 2)
    .sort((a, b) => subidaDe(b.lote).localeCompare(subidaDe(a.lote)));
  const nombreLiquidacion = (id: string | null) => liquidaciones.find((l) => l.id === id)?.nombre ?? null;

  return (
    <>
      <p>
        <Link href={`/inmuebles/${inmueble.id}`} className={formulario.enlace}>
          ← {inmueble.nombre}
        </Link>
      </p>
      <h1 className={privado.titulo}>{t("titulo")}</h1>

      <section className={privado.seccion} aria-labelledby="titulo-subir">
        <h2 id="titulo-subir">{t("subirTitulo")}</h2>
        <p className={propias.suave}>{t("subirExplicacion")}</p>
        <SubirFacturas inmuebleId={inmueble.id} />
      </section>

      <section className={privado.seccion} aria-labelledby="titulo-revisar">
        <h2 id="titulo-revisar">{t("porRevisar")}</h2>
        {porRevisar.length === 0 ? (
          <p className={propias.suave}>{t("nadaPorRevisar")}</p>
        ) : (
          <>
            <p className={propias.suave}>{t("revisarExplicacion")}</p>
            {porRevisar.length > 1 && <ConfirmarTodas inmuebleId={inmueble.id} />}
            <ul className={propias.lista}>
              {porRevisar.map((f) => (
                <FilaFactura key={f.id} inmuebleId={inmueble.id} factura={f} tiposGasto={tiposGasto} />
              ))}
            </ul>
          </>
        )}
      </section>

      {(liquidaciones.length > 0 || sueltas.length > 0) && (
        <section className={privado.seccion} aria-labelledby="titulo-liquidaciones">
          <h2 id="titulo-liquidaciones">{tl("titulo")}</h2>
          <p className={propias.suave}>{tl("explicacion")}</p>
          <PropuestaLiquidacion inmuebleId={inmueble.id} propuestas={propuestas} sueltas={sueltas} tiposGasto={tiposGasto} />
          {liquidaciones.length > 0 && (
            <ul className={propias.lista}>
              {[...liquidaciones].reverse().map((l) => (
                <TarjetaLiquidacion
                  key={l.id}
                  inmuebleId={inmueble.id}
                  liquidacion={l}
                  sueltas={sueltas}
                  tiposGasto={tiposGasto}
                  inquilinos={inquilinos}
                  hoy={hoy}
                />
              ))}
            </ul>
          )}
          <NuevaLiquidacion inmuebleId={inmueble.id} sueltas={sueltas} tiposGasto={tiposGasto} />
        </section>
      )}

      {confirmadas.length > 0 && (
        <section className={privado.seccion} aria-labelledby="titulo-confirmadas">
          <h2 id="titulo-confirmadas">{t("confirmadasTitulo")}</h2>
          <p className={propias.suave}>{t("confirmadasExplicacion")}</p>
          <ul className={propias.lista}>
            {confirmadas.map((f) =>
              f.reparto ? (
                <FacturaRepartida
                  key={f.id}
                  inmuebleId={inmueble.id}
                  factura={f}
                  tipo={nombreTipo(f.tipoGastoId)}
                  color={tiposGasto.find((tg) => tg.id === f.tipoGastoId)?.color ?? null}
                  inquilinos={inquilinos}
                  liquidacion={nombreLiquidacion(f.liquidacionId)}
                  hoy={hoy}
                />
              ) : null,
            )}
          </ul>
        </section>
      )}
    </>
  );
}
