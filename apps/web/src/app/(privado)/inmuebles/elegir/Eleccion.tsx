"use client";
import type { EstadoPlan } from "@inquilinus/contracts";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import formulario from "../../../../componentes/formulario.module.css";
import { pedirApi } from "../../../../lib/api-cliente";
import type { ClaveError } from "../../../../lib/errores";
import estilos from "../../privado.module.css";

/**
 * Casillas con los inmuebles; empiezan marcados los activos ahora (la selección provisional
 * de R10). Solo se puede confirmar con tantos como admite el plan.
 */
export function Eleccion({
  inmuebles,
  activos,
  limite,
}: {
  inmuebles: { id: string; nombre: string }[];
  activos: string[];
  limite: number;
}) {
  const t = useTranslations("Elegir");
  const te = useTranslations("Errores");
  const router = useRouter();
  const [elegidos, setElegidos] = useState<string[]>(activos);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<ClaveError | null>(null);

  const cambiar = (id: string, marcado: boolean) =>
    setElegidos((actuales) => (marcado ? [...actuales, id] : actuales.filter((e) => e !== id)));

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    const r = await pedirApi<EstadoPlan>("/cuenta/inmuebles-activos", { cuerpo: { inmuebles: elegidos } });
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    router.push("/inmuebles?elegidos=1");
    router.refresh();
  };

  const completos = elegidos.length === limite;
  return (
    <form onSubmit={confirmar} className={formulario.formulario}>
      <fieldset className={estilos.opciones}>
        <legend className={formulario.etiqueta}>{t("inmuebles")}</legend>
        {inmuebles.map((i) => {
          const marcado = elegidos.includes(i.id);
          return (
            <label key={i.id} className={estilos.opcion}>
              {/* Con un solo hueco, se elige como una opción (marcar otro cambia la elección). */}
              <input
                type={limite === 1 ? "radio" : "checkbox"}
                name="inmueble"
                checked={marcado}
                disabled={limite > 1 && !marcado && completos}
                onChange={(e) => (limite === 1 ? setElegidos([i.id]) : cambiar(i.id, e.target.checked))}
              />
              {i.nombre}
            </label>
          );
        })}
      </fieldset>
      <p className={estilos.suave} aria-live="polite">
        {t("contador", { n: elegidos.length, limite })}
      </p>
      {error && <Aviso tipo="error">{te(error)}</Aviso>}
      <div>
        <button type="submit" className={formulario.boton} disabled={!completos || guardando}>
          {guardando ? t("guardando") : t("confirmar")}
        </button>
      </div>
    </form>
  );
}
