"use client";
import { TIPOS_DOCUMENTO, type Documento, type Inquilino, type PermisoSubida, type TipoDocumento } from "@inquilinus/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import { Campo } from "../../../../componentes/Campo";
import formulario from "../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../lib/api-cliente";
import { eurosACentimos, formatoEuros } from "../../../../lib/dinero";
import type { ClaveError } from "../../../../lib/errores";
import { formatoFecha } from "../../../../lib/fechas";
import { formatoTamano, subirAlBucket } from "../../../../lib/ficheros";
import { useAccion } from "../../../../lib/use-accion";
import propias from "./detalle.module.css";

const TAMANO_MAXIMO = 10 * 1024 * 1024;

/** Contrato, justificante y fianza de un inquilino (spec 007, R6b–R6e). */
export function DocumentosInquilino({ inmuebleId, inquilino }: { inmuebleId: string; inquilino: Inquilino }) {
  const t = useTranslations("Detalle");
  const base = `/inmuebles/${inmuebleId}/inquilinos/${inquilino.id}`;
  return (
    <div className={propias.bloque}>
      <span className={propias.subtitulo}>{t("documentosYFianza")}</span>
      <span className={propias.ayudaPequena}>{t("documentoAyuda")}</span>
      <ul className={propias.estancias}>
        {TIPOS_DOCUMENTO.map((tipo) => (
          <FilaDocumento
            key={tipo}
            base={base}
            tipo={tipo}
            documento={inquilino.documentos.find((d) => d.tipo === tipo) ?? null}
          />
        ))}
        <FilaFianza base={base} fianza={inquilino.fianza} />
      </ul>
    </div>
  );
}

function FilaDocumento({ base, tipo, documento }: { base: string; tipo: TipoDocumento; documento: Documento | null }) {
  const t = useTranslations("Detalle");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const router = useRouter();
  const selector = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);
  const borrado = useAccion();
  const nombreTipo = t(`tiposDocumento.${tipo}`);

  const elegir = () => {
    setError(null);
    setConfirmando(false);
    selector.current?.click();
  };

  // R6c: permiso firmado → subida directa al bucket → confirmación (la API comprueba que es un PDF).
  const subir = async (e: ChangeEvent<HTMLInputElement>) => {
    const fichero = e.target.files?.[0];
    e.target.value = "";
    if (!fichero) return;
    if (fichero.size > TAMANO_MAXIMO || (fichero.type && fichero.type !== "application/pdf")) {
      setError("ficheroInvalido");
      return;
    }
    setSubiendo(true);
    setError(null);
    const permiso = await pedirApi<PermisoSubida>(`${base}/subidas`, { metodo: "POST" });
    if (!permiso.ok) {
      setSubiendo(false);
      setError(permiso.error);
      return;
    }
    if (!(await subirAlBucket(permiso.datos, fichero))) {
      setSubiendo(false);
      setError("subidaFallida");
      return;
    }
    const guardado = await pedirApi(`${base}/documentos/${tipo}`, {
      metodo: "PUT",
      cuerpo: { subidaId: permiso.datos.subidaId, nombre: fichero.name },
    });
    setSubiendo(false);
    if (!guardado.ok) {
      setError(guardado.error);
      return;
    }
    router.refresh();
  };

  const errorVisible = error ?? borrado.error;

  return (
    <li className={propias.documento}>
      <div className={propias.fila}>
        <span>
          {nombreTipo}
          {": "}
          {documento ? (
            <a href={`/api${base}/documentos/${tipo}`} target="_blank" rel="noopener noreferrer" className={formulario.enlace}>
              {documento.nombre}
            </a>
          ) : (
            <span className={propias.suave}>{t("sinDocumento")}</span>
          )}
          {documento && <span className={propias.suave}> · {formatoTamano(documento.tamanoBytes, idioma)}</span>}
        </span>
        <span className={propias.acciones}>
          <input ref={selector} type="file" accept="application/pdf,.pdf" hidden onChange={subir} />
          {subiendo ? (
            <span className={propias.suave} role="status">
              {t("subiendo")}
            </span>
          ) : (
            <>
              <button type="button" className={formulario.botonEnlace} onClick={elegir}>
                {documento ? t("reemplazar") : t("subir")}
              </button>
              {documento && !confirmando && (
                <button type="button" className={formulario.botonEnlace} onClick={() => setConfirmando(true)}>
                  {t("borrar")}
                </button>
              )}
            </>
          )}
        </span>
      </div>
      {confirmando && (
        <div className={propias.confirmacion}>
          <span>{t("confirmarBorrar", { que: nombreTipo.toLowerCase() })}</span>
          <div className={propias.botones}>
            <button type="button" className={formulario.botonSecundario} onClick={() => setConfirmando(false)}>
              {t("cancelar")}
            </button>
            <button
              type="button"
              className={formulario.botonPeligro}
              disabled={borrado.enviando}
              onClick={() => borrado.ejecutar(`${base}/documentos/${tipo}`, { metodo: "DELETE" }, () => setConfirmando(false))}
            >
              {t("siBorrar")}
            </button>
          </div>
        </div>
      )}

      {errorVisible && <Aviso tipo="error">{te(errorVisible)}</Aviso>}
    </li>
  );
}

function FilaFianza({ base, fianza }: { base: string; fianza: Inquilino["fianza"] }) {
  const t = useTranslations("Detalle");
  const te = useTranslations("Errores");
  const idioma = useLocale();
  const idNotas = useId();
  const { enviando, error, ejecutar, limpiarError } = useAccion();
  const [abierto, setAbierto] = useState<"editar" | "borrar" | null>(null);
  const [importe, setImporte] = useState("");
  const [recibidaEn, setRecibidaEn] = useState("");
  const [devuelta, setDevuelta] = useState(false);
  const [devueltaEn, setDevueltaEn] = useState("");
  const [importeDevuelto, setImporteDevuelto] = useState("");
  const [notas, setNotas] = useState("");
  const [revisado, setRevisado] = useState(false);

  const aTexto = (centimos: number | null | undefined) => (centimos == null ? "" : String(centimos / 100).replace(".", ","));

  const editar = () => {
    limpiarError();
    setRevisado(false);
    setImporte(aTexto(fianza?.importe));
    setRecibidaEn(fianza?.recibidaEn ?? "");
    setDevuelta(fianza?.devueltaEn != null);
    setDevueltaEn(fianza?.devueltaEn ?? "");
    setImporteDevuelto(aTexto(fianza?.importeDevuelto));
    setNotas(fianza?.notas ?? "");
    setAbierto("editar");
  };
  const cerrar = () => setAbierto(null);

  const centimos = eurosACentimos(importe);
  const centimosDevueltos = devuelta ? eurosACentimos(importeDevuelto) : null;

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setRevisado(true);
    if (centimos === null || (devuelta && centimosDevueltos === null)) return;
    await ejecutar(
      `${base}/fianza`,
      {
        metodo: "PUT",
        cuerpo: {
          importe: centimos,
          recibidaEn: recibidaEn || null,
          devueltaEn: devuelta ? devueltaEn || null : null,
          importeDevuelto: devuelta ? centimosDevueltos : null,
          notas: notas.trim() || null,
        },
      },
      cerrar,
    );
  };

  const resumen = fianza && (
    <span>
      {formatoEuros(fianza.importe, idioma)}
      {fianza.recibidaEn && <span className={propias.suave}> · {t("recibidaEl", { fecha: formatoFecha(fianza.recibidaEn, idioma) })}</span>}
      {fianza.devueltaEn && fianza.importeDevuelto !== null && (
        <span className={propias.suave}>
          {" · "}
          {t("devueltaEl", { importe: formatoEuros(fianza.importeDevuelto, idioma), fecha: formatoFecha(fianza.devueltaEn, idioma) })}
        </span>
      )}
    </span>
  );

  return (
    <li className={propias.documento}>
      <div className={propias.fila}>
        <span>
          {t("fianza")}
          {": "}
          {resumen ?? <span className={propias.suave}>{t("sinFianza")}</span>}
        </span>
        {abierto === null && (
          <span className={propias.acciones}>
            <button type="button" className={formulario.botonEnlace} onClick={editar}>
              {fianza ? t("editar") : t("anadirFianza")}
            </button>
            {fianza && (
              <button
                type="button"
                className={formulario.botonEnlace}
                onClick={() => {
                  limpiarError();
                  setAbierto("borrar");
                }}
              >
                {t("borrar")}
              </button>
            )}
          </span>
        )}
      </div>
      {fianza?.notas && abierto !== "editar" && <span className={propias.suave}>{fianza.notas}</span>}

      {abierto === "borrar" && (
        <div className={propias.confirmacion}>
          {error && <Aviso tipo="error">{te(error)}</Aviso>}
          <span>{t("confirmarBorrar", { que: t("fianza").toLowerCase() })}</span>
          <div className={propias.botones}>
            <button type="button" className={formulario.botonSecundario} onClick={cerrar}>
              {t("cancelar")}
            </button>
            <button
              type="button"
              className={formulario.botonPeligro}
              disabled={enviando}
              onClick={() => ejecutar(`${base}/fianza`, { metodo: "DELETE" }, cerrar)}
            >
              {t("siBorrar")}
            </button>
          </div>
        </div>
      )}

      {abierto === "editar" && (
        <form className={propias.enLinea} onSubmit={guardar} noValidate>
          {error && <Aviso tipo="error">{te(error)}</Aviso>}
          <div className={propias.dosColumnas}>
            <Campo
              etiqueta={t("importeFianza")}
              inputMode="decimal"
              placeholder="800"
              autoFocus
              value={importe}
              error={revisado && centimos === null ? te("importeInvalido") : null}
              onChange={(e) => setImporte(e.target.value)}
            />
            <Campo
              etiqueta={t("fechaRecepcion")}
              marca={t("opcional")}
              type="date"
              value={recibidaEn}
              onChange={(e) => setRecibidaEn(e.target.value)}
            />
          </div>
          <label className={formulario.casilla}>
            <input type="checkbox" checked={devuelta} onChange={(e) => setDevuelta(e.target.checked)} />
            <span>{t("yaDevuelta")}</span>
          </label>
          {devuelta && (
            <div className={propias.dosColumnas}>
              <Campo
                etiqueta={t("importeDevuelto")}
                inputMode="decimal"
                value={importeDevuelto}
                error={revisado && centimosDevueltos === null ? te("importeInvalido") : null}
                onChange={(e) => setImporteDevuelto(e.target.value)}
              />
              <Campo etiqueta={t("fechaDevolucion")} type="date" value={devueltaEn} onChange={(e) => setDevueltaEn(e.target.value)} />
            </div>
          )}
          <div className={formulario.campo}>
            <label htmlFor={idNotas} className={formulario.etiqueta}>
              {t("notasFianza")} <span className={formulario.opcional}>({t("opcional")})</span>
            </label>
            <textarea
              id={idNotas}
              className={propias.notas}
              rows={2}
              maxLength={300}
              value={notas}
              aria-describedby={`${idNotas}-ayuda`}
              onChange={(e) => setNotas(e.target.value)}
            />
            <span id={`${idNotas}-ayuda`} className={formulario.ayuda}>
              {t("notasAyuda")}
            </span>
          </div>
          <div className={propias.botones}>
            <button type="button" className={formulario.botonSecundario} onClick={cerrar}>
              {t("cancelar")}
            </button>
            <button type="submit" className={formulario.boton} disabled={enviando}>
              {t("guardar")}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
