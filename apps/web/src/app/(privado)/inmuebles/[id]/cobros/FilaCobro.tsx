"use client";
import type { Cobro } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../../../componentes/Aviso";
import { Campo } from "../../../../../componentes/Campo";
import formulario from "../../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../../lib/api-cliente";
import { eurosACentimos, formatoEuros } from "../../../../../lib/dinero";
import type { ClaveError } from "../../../../../lib/errores";
import { formatoFecha } from "../../../../../lib/fechas";
import { useAccion } from "../../../../../lib/use-accion";
import propias from "../detalle.module.css";
import estilos from "./cobros.module.css";

type Abierto = "fechaPago" | "importe" | "mover" | "quitar" | "recalcular" | "sinEstancia" | null;

const aTexto = (centimos: number) => String(centimos / 100).replace(".", ",");

/**
 * Un cobro de alquiler (spec 009, R9) con lo demás de la spec 005: un toque para
 * marcarlo pagado hoy, cambiar la fecha de pago o deshacerlo, cambiar el importe,
 * moverlo, quitarlo y recalcularlo si está desactualizado.
 */
export function FilaCobro({ base, cobro, etiqueta, hoy }: { base: string; cobro: Cobro; etiqueta: string; hoy: string }) {
  const t = useTranslations("Cobros");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const router = useRouter();
  const { enviando, error, ejecutar, limpiarError } = useAccion();
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [fecha, setFecha] = useState(hoy);
  const [renta, setRenta] = useState("");
  const [recargo, setRecargo] = useState("");
  const [revisado, setRevisado] = useState(false);
  const [errorRecalculo, setErrorRecalculo] = useState<ClaveError | null>(null);

  const ruta = `${base}/${cobro.id}`;
  const cerrar = () => setAbierto(null);
  const abrir = (cual: Abierto) => {
    limpiarError();
    setErrorRecalculo(null);
    setRevisado(false);
    setFecha(cual === "mover" ? cobro.fechaCobro : (cobro.pagadoEn ?? hoy));
    setRenta(aTexto(cobro.renta));
    setRecargo(aTexto(cobro.recargoVacios));
    setAbierto(cual);
  };
  const editar = (cuerpo: object) => ejecutar(ruta, { metodo: "PATCH", cuerpo }, cerrar);

  const centimosRenta = eurosACentimos(renta);
  const centimosRecargo = recargo.trim() === "" ? 0 : eurosACentimos(recargo);

  const guardarImporte = (e: FormEvent) => {
    e.preventDefault();
    setRevisado(true);
    if (centimosRenta === null || centimosRecargo === null) return;
    void editar({ renta: centimosRenta, recargoVacios: centimosRecargo });
  };

  /** Spec 005, R6b: si está pagado o editado pide confirmar; si ya no vivió allí, propone quitarlo. */
  const recalcular = async (confirmar: boolean) => {
    setErrorRecalculo(null);
    const resultado = await pedirApi(`${ruta}/recalcular`, { cuerpo: confirmar ? { confirmar: true } : {} });
    if (resultado.ok) {
      setAbierto(null);
      router.refresh();
      return;
    }
    if (resultado.error === "confirmacionNecesaria") setAbierto("recalcular");
    else if (resultado.error === "sinEstanciaEnElMes") setAbierto("sinEstancia");
    else setErrorRecalculo(resultado.error);
  };

  const botones = (texto: string, deshabilitado = false, peligro = false) => (
    <div className={propias.botones}>
      <button type="button" className={formulario.botonSecundario} onClick={cerrar}>
        {t("cancelar")}
      </button>
      <button type="submit" className={peligro ? formulario.botonPeligro : formulario.boton} disabled={enviando || deshabilitado}>
        {texto}
      </button>
    </div>
  );

  const errorVisible = error ?? errorRecalculo;

  return (
    <li className={estilos.cobro}>
      <div className={estilos.lineaCobro}>
        <div className={estilos.concepto}>
          <span>{etiqueta}</span>
          <span className={estilos.marcas}>
            {cobro.pagadoEn ? (
              <span className={estilos.pagado}>{t("pagadoEl", { fecha: formatoFecha(cobro.pagadoEn, idioma) })}</span>
            ) : (
              <span className={estilos.pendiente}>{t("pendiente")}</span>
            )}
            {cobro.desactualizado && <span className={estilos.desactualizado}>{t("desactualizado")}</span>}
            {cobro.editado && <span className={propias.suave}>{t("editado")}</span>}
          </span>
          <span className={propias.suave}>{t("fechaCobro", { fecha: formatoFecha(cobro.fechaCobro, idioma) })}</span>
        </div>
        <div className={estilos.ladoDerecho}>
          <span className={propias.importe}>{formatoEuros(cobro.importe, idioma)}</span>
          {cobro.pagadoEn ? (
            <button type="button" className={formulario.botonSecundario} disabled={enviando} onClick={() => void editar({ pagadoEn: null })}>
              {t("deshacer")}
            </button>
          ) : (
            <button type="button" className={formulario.boton} disabled={enviando} onClick={() => void editar({ pagadoEn: hoy })}>
              {t("cobrado")}
            </button>
          )}
        </div>
      </div>

      {errorVisible && abierto === null && <Aviso tipo="error">{te(errorVisible)}</Aviso>}

      {abierto === null && (
        <div className={propias.acciones}>
          {cobro.desactualizado && (
            <button type="button" className={formulario.botonEnlace} disabled={enviando} onClick={() => void recalcular(false)}>
              {t("recalcular")}
            </button>
          )}
          {cobro.pagadoEn && (
            <button type="button" className={formulario.botonEnlace} onClick={() => abrir("fechaPago")}>
              {t("cambiarFechaPago")}
            </button>
          )}
          <button type="button" className={formulario.botonEnlace} onClick={() => abrir("importe")}>
            {t("cambiarImporte")}
          </button>
          <button type="button" className={formulario.botonEnlace} onClick={() => abrir("mover")}>
            {t("mover")}
          </button>
          <button type="button" className={formulario.botonEnlace} onClick={() => abrir("quitar")}>
            {t("quitar")}
          </button>
        </div>
      )}

      {abierto === "fechaPago" && (
        <form
          className={propias.enLinea}
          onSubmit={(e) => {
            e.preventDefault();
            void editar({ pagadoEn: fecha });
          }}
          noValidate
        >
          {error && <Aviso tipo="error">{te(error)}</Aviso>}
          <Campo etiqueta={t("fechaPago")} type="date" max={hoy} autoFocus value={fecha} onChange={(e) => setFecha(e.target.value)} />
          {botones(t("guardar"), !fecha)}
        </form>
      )}

      {abierto === "importe" && (
        <form className={propias.enLinea} onSubmit={guardarImporte} noValidate>
          {error && <Aviso tipo="error">{te(error)}</Aviso>}
          <div className={propias.dosColumnas}>
            <Campo
              etiqueta={t("renta")}
              inputMode="decimal"
              autoFocus
              value={renta}
              error={revisado && centimosRenta === null ? te("importeInvalido") : null}
              onChange={(e) => setRenta(e.target.value)}
            />
            <Campo
              etiqueta={t("recargo")}
              inputMode="decimal"
              value={recargo}
              error={revisado && centimosRecargo === null ? te("importeInvalido") : null}
              onChange={(e) => setRecargo(e.target.value)}
            />
          </div>
          <p className={propias.suave}>{t("importeExplicacion")}</p>
          {botones(t("guardar"))}
        </form>
      )}

      {abierto === "mover" && (
        <form
          className={propias.enLinea}
          onSubmit={(e) => {
            e.preventDefault();
            void editar({ fechaCobro: fecha });
          }}
          noValidate
        >
          {error && <Aviso tipo="error">{te(error)}</Aviso>}
          <Campo etiqueta={t("nuevaFechaCobro")} type="date" autoFocus value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <p className={propias.suave}>{t("moverExplicacion")}</p>
          {botones(t("mover"), !fecha)}
        </form>
      )}

      {abierto === "quitar" && (
        <form
          className={propias.confirmacion}
          onSubmit={(e) => {
            e.preventDefault();
            void editar({ quitado: true });
          }}
        >
          {error && <Aviso tipo="error">{te(error)}</Aviso>}
          <span>{t("quitarConfirmacion")}</span>
          {botones(t("quitar"), false, true)}
        </form>
      )}

      {abierto === "recalcular" && (
        <form
          className={propias.confirmacion}
          onSubmit={(e) => {
            e.preventDefault();
            void recalcular(true);
          }}
        >
          {errorRecalculo && <Aviso tipo="error">{te(errorRecalculo)}</Aviso>}
          <span>{cobro.pagadoEn ? t("recalcularPagado") : t("recalcularEditado")}</span>
          {botones(t("recalcular"))}
        </form>
      )}

      {abierto === "sinEstancia" && (
        <form
          className={propias.confirmacion}
          onSubmit={(e) => {
            e.preventDefault();
            void editar({ quitado: true });
          }}
        >
          <span>{t("sinEstancia")}</span>
          {botones(t("quitar"), false, true)}
        </form>
      )}
    </li>
  );
}
