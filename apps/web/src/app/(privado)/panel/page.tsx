import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import formulario from "../../../componentes/formulario.module.css";
import { formatoEuros } from "../../../lib/dinero";
import { formatoMes } from "../../../lib/fechas";
import { panelDe, usuarioActual } from "../../../servidor/api";
import estilos from "../privado.module.css";
import propias from "./panel.module.css";

export async function generateMetadata() {
  const t = await getTranslations("Panel");
  return { title: t("titulo") };
}

/**
 * Panel principal (spec 009, R1–R5b): qué hay pendiente de cobro, en qué casa
 * y de quién. Al tocar un inquilino se abren los cobros de su inmueble.
 */
export default async function PanelPrincipal() {
  const t = await getTranslations("Panel");
  const idioma = await getLocale();
  const usuario = await usuarioActual();
  const panel = usuario ? await panelDe(usuario) : null;
  const euros = (centimos: number) => formatoEuros(centimos, idioma);
  const saludo = usuario?.nombre ? t("saludoNombre", { nombre: usuario.nombre }) : t("saludo");

  if (!panel || (panel.inmuebles.length === 0 && panel.avisos.bloqueados === 0)) {
    return (
      <>
        <h1 className={estilos.titulo}>{saludo}</h1>
        <section className={estilos.seccion}>
          <h2>{t("vacioTitulo")}</h2>
          <p className={estilos.suave}>{t("vacioTexto")}</p>
          <div>
            <Link href="/inmuebles/nuevo" className={formulario.boton}>
              {t("anadirInmueble")}
            </Link>
          </div>
        </section>
      </>
    );
  }

  const { avisos } = panel;
  const hayAvisos = avisos.desactualizados.length > 0 || avisos.porRevisar.length > 0 || avisos.bloqueados > 0;

  return (
    <>
      <h1 className={estilos.titulo}>{saludo}</h1>

      {/* R1 */}
      <section className={propias.resumen} aria-label={t("resumen")}>
        <div className={propias.cifra}>
          <span className={propias.etiquetaCifra}>{t("pendiente")}</span>
          <span className={propias.valor}>{euros(panel.totalPendiente)}</span>
        </div>
        <div className={propias.cifra}>
          <span className={propias.etiquetaCifra}>{t("cobradoEsteMes")}</span>
          <span className={propias.valor}>{euros(panel.cobradoEsteMes)}</span>
        </div>
      </section>

      {/* R4 y R5b */}
      {hayAvisos && (
        <section className={`${estilos.seccion} ${propias.avisos}`} aria-labelledby="titulo-avisos">
          <h2 id="titulo-avisos">{t("avisos")}</h2>
          <ul className={propias.lista}>
            {avisos.porRevisar.map((a) => (
              <li key={`revisar-${a.inmuebleId}`}>
                <Link href={`/inmuebles/${a.inmuebleId}/facturas`} className={formulario.enlace}>
                  {t("avisoPorRevisar", { n: a.facturas, inmueble: a.nombre })}
                </Link>
              </li>
            ))}
            {avisos.desactualizados.map((a) => (
              <li key={a.inmuebleId}>
                <Link href={`/inmuebles/${a.inmuebleId}/cobros`} className={formulario.enlace}>
                  {t("avisoDesactualizados", { n: a.cobros, inmueble: a.nombre })}
                </Link>
              </li>
            ))}
            {avisos.bloqueados > 0 && <li>{t("avisoBloqueados", { n: avisos.bloqueados })}</li>}
          </ul>
        </section>
      )}

      {/* R2 y R3 */}
      <section className={estilos.seccion} aria-labelledby="titulo-pendientes">
        <h2 id="titulo-pendientes">{t("pendientes")}</h2>
        {panel.pendientes.length === 0 ? (
          <p className={estilos.suave}>{t("sinPendientes")}</p>
        ) : (
          panel.pendientes.map((inmueble) => (
            <div key={inmueble.inmuebleId} className={propias.bloque}>
              <div className={propias.fila}>
                <span className={propias.nombreInmueble}>{inmueble.nombre}</span>
                <span className={propias.importe}>{euros(inmueble.total)}</span>
              </div>
              <ul className={propias.lista}>
                {inmueble.inquilinos.map((q) => (
                  <li key={q.inquilinoId} className={propias.inquilino}>
                    {/* R5: el inquilino lleva a los cobros de su inmueble. */}
                    <Link href={`/inmuebles/${inmueble.inmuebleId}/cobros`} className={propias.enlaceInquilino}>
                      <span className={propias.fila}>
                        <span className={propias.nombre}>{q.nombre}</span>
                        <span className={propias.importe}>{euros(q.total)}</span>
                      </span>
                      <span className={propias.conceptos}>
                        {q.conceptos.map((c) => (
                          <span key={c.id} className={c.atrasado ? propias.atrasado : propias.concepto}>
                            {c.tipo === "alquiler"
                              ? t("conceptoAlquiler", { mes: formatoMes(c.mes, idioma), importe: euros(c.importe) })
                              : t("conceptoGasto", {
                                  gasto: c.nombreGasto ?? t("gasto"),
                                  mes: formatoMes(c.mes, idioma),
                                  importe: euros(c.importe),
                                })}
                          </span>
                        ))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* R5 */}
      <section aria-labelledby="titulo-inmuebles" className={propias.inmuebles}>
        <h2 id="titulo-inmuebles" className={propias.tituloInmuebles}>
          {t("tusInmuebles")}
        </h2>
        <ul className={propias.tarjetas}>
          {panel.inmuebles.map((i) => (
            <li key={i.id}>
              <Link href={`/inmuebles/${i.id}`} className={propias.tarjeta}>
                <span className={propias.nombreInmueble}>{i.nombre}</span>
                <span className={i.pendiente > 0 ? propias.importe : estilos.suave}>
                  {i.pendiente > 0 ? t("tarjetaPendiente", { importe: euros(i.pendiente) }) : t("alDia")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
