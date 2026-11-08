import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Aviso } from "../componentes/Aviso";
import formulario from "../componentes/formulario.module.css";
import { usuarioActual } from "../servidor/api";
import estilos from "./page.module.css";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }) {
  const t = await getTranslations("Inicio");
  const usuario = await usuarioActual();
  const { cuenta } = await searchParams;
  return (
    <main className={estilos.principal}>
      <section className={estilos.tarjeta}>
        {cuenta === "borrada" && !usuario && (
          <div className={estilos.aviso}>
            <Aviso tipo="exito">{t("cuentaBorrada")}</Aviso>
          </div>
        )}
        <h1 className={estilos.titulo}>{t("titulo")}</h1>
        <p className={estilos.lema}>{t("lema")}</p>
        <div className={estilos.acciones}>
          {usuario ? (
            <Link href="/panel" className={formulario.boton}>
              {t("irPanel")}
            </Link>
          ) : (
            <>
              <Link href="/acceso" className={formulario.boton}>
                {t("entrar")}
              </Link>
              <Link href="/registro" className={formulario.botonSecundario}>
                {t("crearCuenta")}
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
