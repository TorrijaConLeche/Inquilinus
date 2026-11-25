import type { ResumenInmueble } from "@inquilinus/contracts";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Aviso } from "../../../componentes/Aviso";
import formulario from "../../../componentes/formulario.module.css";
import { inmueblesDe, planDe, usuarioActual } from "../../../servidor/api";
import estilos from "../privado.module.css";
import propias from "./inmuebles.module.css";

/** Candado de los inmuebles bloqueados; el texto va al lado. */
function IconoCandado() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export async function generateMetadata() {
  const t = await getTranslations("Inmuebles");
  return { title: t("titulo") };
}

/**
 * Lista de los inmuebles de la cuenta (spec 007). Los archivados, aparte y solo si se piden (R11c).
 * Los bloqueados por el plan, con el candado y sin enlace (spec 010, R10b).
 */
export default async function Inmuebles({
  searchParams,
}: {
  searchParams: Promise<{ creado?: string; archivados?: string; bloqueado?: string; elegidos?: string }>;
}) {
  const t = await getTranslations("Inmuebles");
  const tp = await getTranslations("Plan");
  const usuario = await usuarioActual();
  const [todos, plan] = usuario ? await Promise.all([inmueblesDe(usuario, { archivados: true }), planDe(usuario)]) : [[], null];
  const inmuebles = todos.filter((i) => !i.archivado);
  const archivados = todos.filter((i) => i.archivado);
  const bloqueados = inmuebles.filter((i) => i.bloqueado).length;
  const { creado, archivados: verArchivados, bloqueado, elegidos } = await searchParams;
  const nuevo = inmuebles.find((i) => i.id === creado);
  const mostrarArchivados = verArchivados === "1" && archivados.length > 0;

  const tarjeta = (i: ResumenInmueble) => (
    <li key={i.id} className={i.bloqueado ? propias.bloqueado : estilos.seccion}>
      <h2 className={propias.tituloTarjeta}>
        {i.bloqueado ? (
          i.nombre
        ) : (
          <Link href={`/inmuebles/${i.id}`} className={propias.enlaceInmueble}>
            {i.nombre}
          </Link>
        )}
        {i.bloqueado && (
          <span className={propias.candado}>
            <IconoCandado />
            {t("bloqueado")}
          </span>
        )}
      </h2>
      {i.direccion && <p className={estilos.suave}>{i.direccion}</p>}
      <p className={propias.datos}>
        <span>{t(`modalidad.${i.modalidad}`)}</span>
        <span aria-hidden="true">·</span>
        <span>{t("habitaciones", { n: i.numeroHabitaciones })}</span>
      </p>
    </li>
  );

  return (
    <>
      <div className={formulario.fila}>
        <h1 className={estilos.titulo}>{t("titulo")}</h1>
        {inmuebles.length > 0 && (
          <Link href="/inmuebles/nuevo" className={formulario.boton}>
            {t("anadir")}
          </Link>
        )}
      </div>

      {nuevo && <Aviso tipo="exito">{t("creado", { nombre: nuevo.nombre })}</Aviso>}
      {elegidos === "1" && <Aviso tipo="exito">{t("eleccionGuardada")}</Aviso>}
      {bloqueado === "1" && bloqueados > 0 && <Aviso tipo="error">{t("entradaBloqueada")}</Aviso>}

      {/* Spec 010, R10b y R10c */}
      {bloqueados > 0 && (
        <section className={estilos.seccion} aria-label={t("bloqueado")}>
          <p>{t("avisoBloqueados", { n: bloqueados })}</p>
          <div className={formulario.fila}>
            {plan?.puedeElegir && (
              <Link href="/inmuebles/elegir" className={formulario.boton}>
                {t("puedesElegir")}
              </Link>
            )}
            <Link href="/ajustes#plan" className={formulario.enlace}>
              {tp("verPlanes")}
            </Link>
          </div>
        </section>
      )}

      {inmuebles.length === 0 ? (
        <section className={estilos.seccion}>
          <h2>{archivados.length > 0 ? t("vacioConArchivados") : t("vacioTitulo")}</h2>
          <p className={estilos.suave}>{t("vacioTexto")}</p>
          <div>
            <Link href="/inmuebles/nuevo" className={formulario.boton}>
              {t("anadirPrimero")}
            </Link>
          </div>
        </section>
      ) : (
        <ul className={propias.lista}>{inmuebles.map(tarjeta)}</ul>
      )}

      {archivados.length > 0 && (
        <p>
          <Link href={mostrarArchivados ? "/inmuebles" : "/inmuebles?archivados=1"} className={formulario.enlace}>
            {mostrarArchivados ? t("ocultarArchivados") : t("verArchivados", { n: archivados.length })}
          </Link>
        </p>
      )}
      {mostrarArchivados && (
        <section aria-labelledby="titulo-archivados" className={propias.archivados}>
          <h2 id="titulo-archivados" className={propias.tituloArchivados}>
            {t("archivados")}
          </h2>
          <ul className={propias.lista}>{archivados.map(tarjeta)}</ul>
        </section>
      )}
    </>
  );
}
