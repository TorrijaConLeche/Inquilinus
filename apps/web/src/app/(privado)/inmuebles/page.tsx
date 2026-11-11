import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Aviso } from "../../../componentes/Aviso";
import formulario from "../../../componentes/formulario.module.css";
import { inmueblesDe, usuarioActual } from "../../../servidor/api";
import estilos from "../privado.module.css";
import propias from "./inmuebles.module.css";

export async function generateMetadata() {
  const t = await getTranslations("Inmuebles");
  return { title: t("titulo") };
}

/** Lista de los inmuebles de la cuenta (spec 007). El detalle llega en la tarea 3.5. */
export default async function Inmuebles({ searchParams }: { searchParams: Promise<{ creado?: string }> }) {
  const t = await getTranslations("Inmuebles");
  const usuario = await usuarioActual();
  const inmuebles = usuario ? await inmueblesDe(usuario) : [];
  const { creado } = await searchParams;
  const nuevo = inmuebles.find((i) => i.id === creado);

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

      {inmuebles.length === 0 ? (
        <section className={estilos.seccion}>
          <h2>{t("vacioTitulo")}</h2>
          <p className={estilos.suave}>{t("vacioTexto")}</p>
          <div>
            <Link href="/inmuebles/nuevo" className={formulario.boton}>
              {t("anadirPrimero")}
            </Link>
          </div>
        </section>
      ) : (
        <ul className={propias.lista}>
          {inmuebles.map((i) => (
            <li key={i.id} className={estilos.seccion}>
              <h2>
                <Link href={`/inmuebles/${i.id}`} className={propias.enlaceInmueble}>
                  {i.nombre}
                </Link>
              </h2>
              {i.direccion && <p className={estilos.suave}>{i.direccion}</p>}
              <p className={propias.datos}>
                <span>{t(`modalidad.${i.modalidad}`)}</span>
                <span aria-hidden="true">·</span>
                <span>{t("habitaciones", { n: i.numeroHabitaciones })}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
