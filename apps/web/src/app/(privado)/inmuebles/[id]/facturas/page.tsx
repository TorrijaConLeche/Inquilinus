import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import formulario from "../../../../../componentes/formulario.module.css";
import { formatoEuros } from "../../../../../lib/dinero";
import { formatoFecha } from "../../../../../lib/fechas";
import { facturasDe, usuarioActual } from "../../../../../servidor/api";
import privado from "../../../privado.module.css";
import propias from "../detalle.module.css";
import { ConfirmarTodas } from "./ConfirmarTodas";
import estilos from "./facturas.module.css";
import { FilaFactura } from "./FilaFactura";
import { SubirFacturas } from "./SubirFacturas";

export async function generateMetadata() {
  const t = await getTranslations("Facturas");
  return { title: t("titulo") };
}

const POR_REVISAR = ["subida", "propuesta", "error_extraccion"];

/** Facturas del inmueble (spec 003): subir PDF, revisar y confirmar, y las ya confirmadas. */
export default async function FacturasInmueble({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("Facturas");
  const idioma = await getLocale();
  const usuario = await usuarioActual();
  const datos = usuario ? await facturasDe(usuario, (await params).id) : null;
  if (!datos) notFound();
  const { inmueble, facturas, tiposGasto } = datos;
  const porRevisar = facturas.filter((f) => POR_REVISAR.includes(f.estado));
  // Las confirmadas, de la más reciente a la más antigua por periodo.
  const confirmadas = facturas
    .filter((f) => !POR_REVISAR.includes(f.estado))
    .sort((a, b) => (b.periodoInicio ?? "").localeCompare(a.periodoInicio ?? ""));
  const nombreTipo = (id: string | null) => tiposGasto.find((tg) => tg.id === id)?.nombre ?? "—";

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

      {confirmadas.length > 0 && (
        <section className={privado.seccion} aria-labelledby="titulo-confirmadas">
          <h2 id="titulo-confirmadas">{t("confirmadasTitulo")}</h2>
          <ul className={propias.estancias}>
            {confirmadas.map((f) => (
              <li key={f.id} className={estilos.confirmada}>
                <span>
                  <strong>{nombreTipo(f.tipoGastoId)}</strong>{" "}
                  <span className={propias.suave}>
                    {f.periodoInicio && f.periodoFin
                      ? t("periodo", { inicio: formatoFecha(f.periodoInicio, idioma), fin: formatoFecha(f.periodoFin, idioma) })
                      : ""}
                  </span>
                </span>
                <span className={propias.acciones}>
                  <span className={estilos.importe}>{f.importeTotal === null ? "—" : formatoEuros(f.importeTotal, idioma)}</span>
                  <a href={`/api/inmuebles/${inmueble.id}/facturas/${f.id}/pdf`} target="_blank" rel="noopener noreferrer" className={formulario.enlace}>
                    {t("verPdf")}
                  </a>
                </span>
              </li>
            ))}
          </ul>
          <p className={propias.ayudaPequena}>{t("repartoPronto")}</p>
        </section>
      )}
    </>
  );
}
