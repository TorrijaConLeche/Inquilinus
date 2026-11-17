"use client";
import { COLORES_GASTO, type ColorGasto, type TipoGasto } from "@inquilinus/contracts";
import { useTranslations } from "next-intl";
import estilos from "./colores.module.css";
import formulario from "./formulario.module.css";

/** Un punto del color de un tipo de gasto (spec 006, R8). Decorativo: el nombre va al lado (R9). */
export function PuntoColor({ color }: { color: ColorGasto | "alquiler" | null | undefined }) {
  return <span aria-hidden="true" className={`${estilos.punto} ${color ? estilos[color] : estilos.alquiler}`} />;
}

/** El nombre de un tipo de gasto con su color delante, igual en todas partes (R8). */
export function NombreGasto({ nombre, color }: { nombre: string; color: ColorGasto | null | undefined }) {
  return (
    <span className={estilos.nombre}>
      <PuntoColor color={color} />
      {nombre}
    </span>
  );
}

/**
 * Selector de color (spec 006, R7 y R7b): los ocho de la paleta, con su nombre;
 * los que ya usa otro tipo de gasto activo se pueden elegir y dicen quién los usa.
 * El gris del alquiler no se ofrece.
 */
export function SelectorColor({
  valor,
  onCambio,
  otros,
  nombreGrupo,
}: {
  valor: ColorGasto;
  onCambio: (color: ColorGasto) => void;
  /** Los demás tipos de gasto activos del inmueble. */
  otros: Pick<TipoGasto, "nombre" | "color">[];
  /** Nombre del grupo de radios (único en la página). */
  nombreGrupo: string;
}) {
  const t = useTranslations("Detalle");
  return (
    <fieldset className={estilos.selector}>
      <legend className={formulario.etiqueta}>{t("color")}</legend>
      {COLORES_GASTO.map((color) => {
        const usan = otros.filter((o) => o.color === color).map((o) => o.nombre);
        return (
          <label key={color} className={`${estilos.opcion} ${estilos[color]}`}>
            <input type="radio" name={nombreGrupo} value={color} checked={valor === color} onChange={() => onCambio(color)} />
            <span className={estilos.punto} aria-hidden="true" />
            <span className={estilos.textos}>
              <span>{t(`colores.${color}`)}</span>
              {usan.length > 0 && <span className={estilos.usado}>{t("colorUsado", { nombres: usan.join(", ") })}</span>}
            </span>
            {valor === color && (
              <span className={estilos.marca} aria-hidden="true">
                ✓
              </span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
