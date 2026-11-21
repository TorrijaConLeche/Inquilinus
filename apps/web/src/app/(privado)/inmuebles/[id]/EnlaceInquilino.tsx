"use client";
import type { EnlaceGenerado, Inquilino } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import formulario from "../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../lib/api-cliente";
import type { ClaveError } from "../../../../lib/errores";
import { formatoFecha } from "../../../../lib/fechas";
import propias from "./detalle.module.css";

/**
 * El enlace del inquilino (spec 004, R1–R3b). Como solo se guarda su hash, se
 * copia o se envía por WhatsApp al generarlo o regenerarlo (R2c); después se
 * ve que existe, hasta cuándo funciona y si permite descargar las facturas.
 */
export function EnlaceInquilino({ inmuebleId, nombreInmueble, inquilino }: { inmuebleId: string; nombreInmueble: string; inquilino: Inquilino }) {
  const t = useTranslations("Enlace");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const router = useRouter();
  const ruta = `/inmuebles/${inmuebleId}/inquilinos/${inquilino.id}/enlace`;
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);
  // R2c: el enlace recién generado; al recargar la página ya no se puede volver a ver.
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState<"regenerar" | "revocar" | null>(null);
  const enlace = inquilino.enlace;

  const pedir = async (camino: string, opciones: { metodo?: string; cuerpo?: unknown }) => {
    setEnviando(true);
    setError(null);
    const r = await pedirApi<EnlaceGenerado>(camino, opciones);
    setEnviando(false);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    setConfirmando(null);
    router.refresh();
    return r.datos;
  };

  const generar = async (regenerar: boolean) => {
    const datos = await pedir(regenerar ? `${ruta}/regenerar` : ruta, { cuerpo: {} });
    if (datos) {
      setCopiado(false);
      setNuevo(`${window.location.origin}/i/${datos.token}`);
    }
  };

  const copiar = async () => {
    if (!nuevo) return;
    try {
      await navigator.clipboard.writeText(nuevo);
      setCopiado(true);
    } catch {
      // Sin portapapeles, el enlace sigue a la vista para copiarlo a mano.
      setCopiado(false);
    }
  };

  // R2d: WhatsApp con el mensaje y el enlace, sin número; la propietaria elige el contacto.
  const whatsapp = nuevo
    ? `https://wa.me/?text=${encodeURIComponent(t("mensaje", { nombre: inquilino.nombre, inmueble: nombreInmueble, enlace: nuevo }))}`
    : null;

  return (
    <div className={propias.bloque}>
      <span className={propias.subtitulo}>{t("titulo")}</span>
      {error && <Aviso tipo="error">{te(error)}</Aviso>}

      {nuevo && (
        <div className={propias.enLinea}>
          <label className={formulario.etiqueta} htmlFor={`enlace-${inquilino.id}`}>
            {t("nuevo")}
          </label>
          <input
            id={`enlace-${inquilino.id}`}
            className={formulario.entrada}
            readOnly
            value={nuevo}
            onFocus={(e) => e.currentTarget.select()}
          />
          <span className={propias.suave}>{t("soloAhora")}</span>
          <div className={propias.botones}>
            <button type="button" className={formulario.botonSecundario} onClick={() => setNuevo(null)}>
              {t("hecho")}
            </button>
            <button type="button" className={formulario.botonSecundario} onClick={() => void copiar()}>
              {copiado ? t("copiado") : t("copiar")}
            </button>
            <a href={whatsapp!} target="_blank" rel="noopener noreferrer" className={formulario.boton}>
              {t("whatsapp")}
            </a>
          </div>
        </div>
      )}

      {!enlace ? (
        !nuevo && (
          <>
            <span className={propias.suave}>{t("explicacion")}</span>
            <div>
              <button type="button" className={formulario.botonSecundario} disabled={enviando} onClick={() => void generar(false)}>
                {t("generar")}
              </button>
            </div>
          </>
        )
      ) : (
        <>
          <span className={propias.suave}>
            {t("creado", { fecha: formatoFecha(enlace.creadoEn.slice(0, 10), idioma) })}{" "}
            {enlace.caducaEl === null
              ? t("mientrasViva")
              : enlace.disponible
                ? t("hasta", { fecha: formatoFecha(enlace.caducaEl, idioma) })
                : t("caducado", { fecha: formatoFecha(enlace.caducaEl, idioma) })}
          </span>
          {/* R2b: por defecto, habilitada. */}
          <label className={formulario.casilla}>
            <input
              type="checkbox"
              checked={enlace.permiteDescarga}
              disabled={enviando}
              onChange={(e) => void pedir(ruta, { metodo: "PATCH", cuerpo: { permiteDescarga: e.target.checked } })}
            />
            <span>{t("permiteDescarga")}</span>
          </label>
          {confirmando ? (
            <div className={propias.confirmacion}>
              <span>{confirmando === "regenerar" ? t("regenerarAviso") : t("revocarAviso")}</span>
              <div className={propias.botones}>
                <button type="button" className={formulario.botonSecundario} onClick={() => setConfirmando(null)}>
                  {t("cancelar")}
                </button>
                <button
                  type="button"
                  className={confirmando === "revocar" ? formulario.botonPeligro : formulario.boton}
                  disabled={enviando}
                  onClick={() => void (confirmando === "regenerar" ? generar(true) : pedir(ruta, { metodo: "DELETE" }))}
                >
                  {confirmando === "regenerar" ? t("regenerar") : t("revocar")}
                </button>
              </div>
            </div>
          ) : (
            <div className={propias.acciones}>
              <button type="button" className={formulario.botonEnlace} onClick={() => setConfirmando("regenerar")}>
                {t("regenerar")}
              </button>
              <button type="button" className={formulario.botonEnlace} onClick={() => setConfirmando("revocar")}>
                {t("revocar")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
