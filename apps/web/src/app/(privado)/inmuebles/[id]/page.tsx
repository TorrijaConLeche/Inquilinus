import { hoyEnMadrid, mesEnMadrid } from "@inquilinus/api";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "../../../../componentes/Aviso";
import formulario from "../../../../componentes/formulario.module.css";
import { detalleDe, usuarioActual } from "../../../../servidor/api";
import estilos from "../../privado.module.css";
import { ArchivarInmueble } from "./ArchivarInmueble";
import { DatosInmueble } from "./DatosInmueble";
import { Habitaciones } from "./Habitaciones";
import { Inquilinos } from "./Inquilinos";
import { TiposGasto } from "./TiposGasto";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioActual();
  const detalle = usuario ? await detalleDe(usuario, (await params).id) : null;
  const t = await getTranslations("Inmuebles");
  return { title: detalle?.inmueble.nombre ?? t("titulo") };
}

/** Detalle del inmueble con sus formularios de edición (spec 007). Lo ajeno o inexistente, 404. */
export default async function DetalleInmueble({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const t = await getTranslations("Detalle");
  const usuario = await usuarioActual();
  const detalle = usuario ? await detalleDe(usuario, (await params).id) : null;
  if (!detalle) notFound();
  const { inmueble, inquilinos, tiposGasto } = detalle;
  const { creado } = await searchParams;

  return (
    <>
      <p>
        <Link href="/inmuebles" className={formulario.enlace}>
          ← {t("volver")}
        </Link>
      </p>
      <div className={formulario.fila}>
        <h1 className={estilos.titulo}>{inmueble.nombre}</h1>
        <Link href={`/inmuebles/${inmueble.id}/cobros`} className={formulario.boton}>
          {t("verCobros")}
        </Link>
      </div>
      {creado === "1" && <Aviso tipo="exito">{t("creado")}</Aviso>}
      {inmueble.archivado && <Aviso tipo="info">{t("archivadoAviso")}</Aviso>}
      <DatosInmueble inmueble={inmueble} />
      <Habitaciones inmuebleId={inmueble.id} habitaciones={inmueble.habitaciones} mesActual={mesEnMadrid()} />
      <Inquilinos inmuebleId={inmueble.id} inquilinos={inquilinos} habitaciones={inmueble.habitaciones} hoy={hoyEnMadrid()} />
      <TiposGasto inmuebleId={inmueble.id} tiposGasto={tiposGasto} />
      <ArchivarInmueble id={inmueble.id} nombre={inmueble.nombre} archivado={inmueble.archivado} />
    </>
  );
}
