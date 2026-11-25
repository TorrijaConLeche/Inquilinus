import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import formulario from "../../componentes/formulario.module.css";
import { preciosDePlanes } from "../../lib/precios";
import { usuarioActual } from "../../servidor/api";
import estilos from "./precios.module.css";

export async function generateMetadata() {
  const t = await getTranslations("Precios");
  return { title: t("titulo"), description: t("lema") };
}

const PREGUNTAS = ["limite", "cancelar", "factura", "donde"] as const;

/** Spec 010, R16–R16d: página pública de precios, con o sin sesión. */
export default async function Precios() {
  const t = await getTranslations("Precios");
  const tp = await getTranslations("Plan");
  const idioma = await getLocale();
  const usuario = await usuarioActual();
  const planes = preciosDePlanes(idioma);

  return (
    <main className={estilos.pagina}>
      <div className={estilos.contenedor}>
        <Link href="/" className={estilos.marca}>
          {t("marca")}
        </Link>
        <h1 className={estilos.titulo}>{t("titulo")}</h1>
        <p className={estilos.lema}>{t("lema")}</p>

        <ul className={estilos.planes}>
          {planes.map((p) => (
            <li key={p.plan} className={p.plan === "plus" ? estilos.planDestacado : estilos.plan}>
              <h2 className={estilos.nombre}>{tp(`nombres.${p.plan}`)}</h2>
              <p className={estilos.para}>{t(`para.${p.plan}`)}</p>
              <p className={estilos.precio}>
                {p.mensual ? (
                  <>
                    <span className={estilos.cifra}>{p.mensual}</span> {t("alMes")}
                  </>
                ) : (
                  <span className={estilos.cifra}>{tp("gratis")}</span>
                )}
              </p>
              <p className={estilos.anual}>
                {p.anual ? t("anual", { anual: p.anual, meses: p.mesesGratis ?? 0 }) : t("siempreGratis")}
              </p>
              <ul className={estilos.incluye}>
                <li>{tp("limiteInmuebles", { n: p.inmuebles })}</li>
                <li>{p.plan === "starter" ? tp("iaStarter", { n: p.facturasIaAlMes }) : tp("iaSinLimite")}</li>
                <li>{t("todoLoDemas")}</li>
              </ul>
              <div className={estilos.accion}>
                {p.plan === "starter" ? (
                  <Link href={usuario ? "/panel" : "/registro"} className={formulario.boton}>
                    {usuario ? t("irPanel") : t("empezarGratis")}
                  </Link>
                ) : (
                  <button type="button" className={formulario.botonSecundario} disabled>
                    {t("muyPronto")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className={estilos.nota}>{t("iva")}</p>

        <section className={estilos.preguntas} aria-labelledby="titulo-preguntas">
          <h2 id="titulo-preguntas">{t("preguntasTitulo")}</h2>
          {PREGUNTAS.map((clave) => (
            <div key={clave} className={estilos.pregunta}>
              <h3>{t(`preguntas.${clave}.pregunta`)}</h3>
              <p>{t(`preguntas.${clave}.respuesta`)}</p>
            </div>
          ))}
        </section>

        <p className={estilos.pie}>
          <Link href="/terminos" className={formulario.enlace}>
            {t("terminos")}
          </Link>
          <span aria-hidden="true"> · </span>
          <Link href="/privacidad" className={formulario.enlace}>
            {t("privacidad")}
          </Link>
        </p>
      </div>
    </main>
  );
}
