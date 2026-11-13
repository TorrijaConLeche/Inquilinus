import { hoyEnMadrid, mesEnMadrid } from "@inquilinus/api";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import formulario from "../../../../../componentes/formulario.module.css";
import { esMes, formatoMes, mesVecino } from "../../../../../lib/fechas";
import { cobrosDe, usuarioActual } from "../../../../../servidor/api";
import privado from "../../../privado.module.css";
import estilos from "./cobros.module.css";
import { CobrosMes } from "./CobrosMes";

export async function generateMetadata() {
  const t = await getTranslations("Cobros");
  return { title: t("titulo") };
}

/** Cobros del inmueble por mes (spec 009, R6–R13). Por defecto, el mes en curso. */
export default async function CobrosInmueble({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const t = await getTranslations("Cobros");
  const idioma = await getLocale();
  const mesActual = mesEnMadrid();
  const pedido = (await searchParams).mes;
  const mes = esMes(pedido) ? pedido : mesActual;
  const usuario = await usuarioActual();
  const datos = usuario ? await cobrosDe(usuario, (await params).id, mes) : null;
  if (!datos) notFound();
  const { inmueble, inquilinos, cobros, tiposGasto } = datos;
  const enlaceMes = (m: string) => `/inmuebles/${inmueble.id}/cobros${m === mesActual ? "" : `?mes=${m}`}`;

  return (
    <>
      <p>
        <Link href={`/inmuebles/${inmueble.id}`} className={formulario.enlace}>
          ← {inmueble.nombre}
        </Link>
      </p>
      <h1 className={privado.titulo}>{t("titulo")}</h1>

      <nav className={estilos.selectorMes} aria-label={t("selectorMes")}>
        <Link href={enlaceMes(mesVecino(mes, -1))} className={formulario.botonSecundario} aria-label={t("mesAnterior")}>
          ←
        </Link>
        <span className={estilos.mesElegido} aria-live="polite">
          {formatoMes(mes, idioma)}
        </span>
        <Link href={enlaceMes(mesVecino(mes, 1))} className={formulario.botonSecundario} aria-label={t("mesSiguiente")}>
          →
        </Link>
        {mes !== mesActual && (
          <Link href={enlaceMes(mesActual)} className={formulario.enlace}>
            {t("mesEnCurso")}
          </Link>
        )}
      </nav>

      <CobrosMes
        inmuebleId={inmueble.id}
        datos={cobros}
        inquilinos={inquilinos}
        tiposGasto={tiposGasto}
        mesActual={mesActual}
        hoy={hoyEnMadrid()}
      />
    </>
  );
}
