"use client";
import type { Inmueble } from "@inquilinus/contracts";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import { Campo } from "../../../../componentes/Campo";
import formulario from "../../../../componentes/formulario.module.css";
import { useAccion } from "../../../../lib/use-accion";
import estilos from "../../privado.module.css";
import propias from "./detalle.module.css";

/** Datos del inmueble: todo se puede cambiar menos la modalidad (spec 007, R2). */
export function DatosInmueble({ inmueble }: { inmueble: Inmueble }) {
  const t = useTranslations("Detalle");
  const ta = useTranslations("Asistente");
  const te = useTranslations("Errores");
  const { enviando, error, ejecutar, limpiarError } = useAccion();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(inmueble.nombre);
  const [direccion, setDireccion] = useState(inmueble.direccion ?? "");
  const [mesesParciales, setMesesParciales] = useState(inmueble.mesesParciales);
  const [diaCobro, setDiaCobro] = useState(inmueble.diaCobro);

  const abrir = () => {
    setNombre(inmueble.nombre);
    setDireccion(inmueble.direccion ?? "");
    setMesesParciales(inmueble.mesesParciales);
    setDiaCobro(inmueble.diaCobro);
    limpiarError();
    setEditando(true);
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    await ejecutar(
      `/inmuebles/${inmueble.id}`,
      { metodo: "PATCH", cuerpo: { nombre, direccion: direccion.trim() || null, mesesParciales, diaCobro } },
      () => setEditando(false),
    );
  };

  return (
    <section className={estilos.seccion} aria-labelledby="titulo-datos">
      <div className={propias.cabecera}>
        <h2 id="titulo-datos">{t("datos")}</h2>
        {!editando && (
          <button type="button" className={formulario.botonEnlace} onClick={abrir}>
            {t("editar")}
          </button>
        )}
      </div>

      {!editando ? (
        <dl className={propias.datos}>
          <dt>{t("direccion")}</dt>
          <dd>{inmueble.direccion ?? "—"}</dd>
          <dt>{t("modalidad")}</dt>
          <dd>{ta(`modalidades.${inmueble.modalidad}.titulo`)}</dd>
          <dt>{t("mesesParciales")}</dt>
          <dd>{ta(`parciales.${inmueble.mesesParciales}.titulo`)}</dd>
          <dt>{t("diaCobro")}</dt>
          <dd>{t("diaN", { dia: inmueble.diaCobro })}</dd>
        </dl>
      ) : (
        <form className={formulario.formulario} onSubmit={guardar} noValidate>
          {error && <Aviso tipo="error">{te(error)}</Aviso>}
          <Campo etiqueta={ta("nombre")} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Campo etiqueta={ta("direccion")} marca={ta("opcional")} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          <p className={propias.suave}>
            {t("modalidad")}: {ta(`modalidades.${inmueble.modalidad}.titulo`)}. {ta("modalidadFija")}
          </p>
          <div className={formulario.campo}>
            <label htmlFor="meses-parciales" className={formulario.etiqueta}>
              {t("mesesParciales")}
            </label>
            <select
              id="meses-parciales"
              className={propias.selector}
              value={mesesParciales}
              onChange={(e) => setMesesParciales(e.target.value as typeof mesesParciales)}
            >
              <option value="mes_completo">{ta("parciales.mes_completo.titulo")}</option>
              <option value="prorrateo">{ta("parciales.prorrateo.titulo")}</option>
            </select>
          </div>
          <div className={formulario.campo}>
            <label htmlFor="dia-cobro-edicion" className={formulario.etiqueta}>
              {t("diaCobro")}
            </label>
            <select
              id="dia-cobro-edicion"
              className={propias.selector}
              value={diaCobro}
              onChange={(e) => setDiaCobro(Number(e.target.value))}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className={propias.botones}>
            <button type="button" className={formulario.botonSecundario} onClick={() => setEditando(false)}>
              {t("cancelar")}
            </button>
            <button type="submit" className={formulario.boton} disabled={enviando || !nombre.trim()}>
              {t("guardar")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
