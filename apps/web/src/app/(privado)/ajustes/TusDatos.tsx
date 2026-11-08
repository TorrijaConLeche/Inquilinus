"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../componentes/Aviso";
import { Campo } from "../../../componentes/Campo";
import formulario from "../../../componentes/formulario.module.css";
import estilos from "../privado.module.css";

/** Exportar todos los datos y borrar la cuenta (spec 008, R14). */
export function TusDatos({ email }: { email: string }) {
  const t = useTranslations("Ajustes.datos");
  const te = useTranslations("Errores");
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [escrito, setEscrito] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<"emailNoCoincide" | "generico" | null>(null);

  const coincide = escrito.trim().toLowerCase() === email.trim().toLowerCase();

  const borrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!coincide) return;
    setBorrando(true);
    setError(null);
    const respuesta = await fetch("/api/cuenta/borrar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: escrito }),
    }).catch(() => null);
    setBorrando(false);
    if (respuesta?.status === 204) {
      router.replace("/?cuenta=borrada");
      router.refresh();
      return;
    }
    setError(respuesta?.status === 400 ? "emailNoCoincide" : "generico");
  };

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-datos">
      <h2 id="titulo-datos">{t("titulo")}</h2>

      <p className={estilos.suave}>{t("explicacionExportar")}</p>
      <div>
        <a href="/api/cuenta/exportacion" download className={formulario.botonSecundario}>
          {t("descargar")}
        </a>
      </div>

      <hr className={estilos.separador} />

      <p className={estilos.suave}>{t("explicacionBorrar")}</p>
      {!confirmando ? (
        <div>
          <button type="button" className={formulario.botonPeligro} onClick={() => setConfirmando(true)}>
            {t("borrar")}
          </button>
        </div>
      ) : (
        <form className={formulario.formulario} onSubmit={borrar} noValidate>
          <Aviso tipo="error">{t("aviso")}</Aviso>
          {error && <Aviso tipo="error">{te(error)}</Aviso>}
          <Campo
            etiqueta={t("confirmarEmail", { email })}
            type="email"
            autoComplete="off"
            autoFocus
            value={escrito}
            onChange={(e) => setEscrito(e.target.value)}
          />
          <div className={formulario.fila}>
            <button
              type="button"
              className={formulario.botonSecundario}
              onClick={() => {
                setConfirmando(false);
                setEscrito("");
                setError(null);
              }}
            >
              {t("cancelar")}
            </button>
            <button type="submit" className={formulario.botonPeligro} disabled={!coincide || borrando}>
              {borrando ? t("borrando") : t("confirmar")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
