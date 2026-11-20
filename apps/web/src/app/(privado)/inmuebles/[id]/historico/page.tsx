import { hoyEnMadrid } from "@inquilinus/api";
import { FiltrosHistorico } from "@inquilinus/contracts";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import formulario from "../../../../../componentes/formulario.module.css";
import { detalleDe, historicoDe, timelineDe, usuarioActual } from "../../../../../servidor/api";
import privado from "../../../privado.module.css";
import { PantallaHistorico } from "./PantallaHistorico";

export async function generateMetadata() {
  const t = await getTranslations("Historico");
  return { title: t("titulo") };
}

const lista = (v: string | string[] | undefined) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Histórico del inmueble (spec 012): filtros en la URL, resumen y actividades por mes. */
export default async function HistoricoInmueble({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("Historico");
  const id = (await params).id;
  const q = await searchParams;
  // Filtros que no se entienden, como si no estuvieran.
  const leidos = FiltrosHistorico.safeParse({
    inquilino: lista(q.inquilino),
    gasto: lista(q.gasto),
    grupo: lista(q.grupo),
    estado: uno(q.estado),
    desde: uno(q.desde),
    hasta: uno(q.hasta),
  });
  const filtros = leidos.success ? leidos.data : {};
  const usuario = await usuarioActual();
  const [detalle, datos, historico] = usuario
    ? await Promise.all([detalleDe(usuario, id), timelineDe(usuario, id), historicoDe(usuario, id, filtros)])
    : [null, null, null];
  if (!detalle || !datos || !historico) notFound();

  return (
    <>
      <p>
        <Link href={`/inmuebles/${id}`} className={formulario.enlace}>
          ← {detalle.inmueble.nombre}
        </Link>
      </p>
      <h1 className={privado.titulo}>{t("titulo")}</h1>
      <PantallaHistorico
        inmuebleId={id}
        datos={datos}
        habitaciones={detalle.inmueble.habitaciones.map((h) => ({ id: h.id, nombre: h.nombre }))}
        historico={historico}
        filtros={filtros}
        hoy={hoyEnMadrid()}
      />
    </>
  );
}
