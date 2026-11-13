import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import formulario from "../../../../../componentes/formulario.module.css";
import { facturasDe, usuarioActual } from "../../../../../servidor/api";
import privado from "../../../privado.module.css";
import propias from "../detalle.module.css";
import { FilaFactura } from "./FilaFactura";
import { SubirFacturas } from "./SubirFacturas";

export async function generateMetadata() {
  const t = await getTranslations("Facturas");
  return { title: t("titulo") };
}

/** Facturas del inmueble (spec 003): subir varios PDF y la lista por revisar. */
export default async function FacturasInmueble({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("Facturas");
  const usuario = await usuarioActual();
  const datos = usuario ? await facturasDe(usuario, (await params).id) : null;
  if (!datos) notFound();
  const { inmueble, facturas, tiposGasto } = datos;

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
        {facturas.length === 0 ? (
          <p className={propias.suave}>{t("nadaPorRevisar")}</p>
        ) : (
          <ul className={propias.lista}>
            {facturas.map((f) => (
              <FilaFactura key={f.id} inmuebleId={inmueble.id} factura={f} tiposGasto={tiposGasto} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
