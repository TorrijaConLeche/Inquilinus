"use client";
import type { DatosTimeline, Historico } from "@inquilinus/contracts";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import formulario from "../../../../componentes/formulario.module.css";
import { Timeline } from "../../../../componentes/timeline/Timeline";
import propias from "./detalle.module.css";
import { ListaActividades } from "./historico/ListaActividades";
import { VentanaAbierta, type Abierta } from "./Ventanas";

/**
 * El timeline en la ficha del inmueble (spec 006) con lo que solo ve la
 * propietaria: las ventanas de detalle al pulsar (R11, R12; spec 011, R14) y,
 * debajo, las últimas actividades del histórico con el enlace a todo él
 * (spec 012, R1 y R1b).
 */
export function TimelinePropietario({
  inmuebleId,
  datos,
  habitaciones,
  ultimas,
  hoy,
}: {
  inmuebleId: string;
  datos: DatosTimeline;
  habitaciones: { id: string; nombre: string }[];
  ultimas: Historico["actividades"];
  hoy: string;
}) {
  const t = useTranslations("Historico");
  const [abierta, setAbierta] = useState<Abierta | null>(null);

  return (
    <>
      <Timeline datos={datos} hoy={hoy} alPulsar={setAbierta} />
      <section className={propias.movimientos} aria-labelledby="titulo-ultimas">
        <div className={propias.fila}>
          <h2 id="titulo-ultimas">{t("ultimas")}</h2>
          <Link href={`/inmuebles/${inmuebleId}/historico`} className={formulario.enlace}>
            {t("verTodo")}
          </Link>
        </div>
        {ultimas.length === 0 ? (
          <p className={propias.suave}>{t("vacio")}</p>
        ) : (
          <ListaActividades actividades={ultimas} datos={datos} habitaciones={habitaciones} alAbrir={setAbierta} />
        )}
      </section>
      <VentanaAbierta
        abierta={abierta}
        inmuebleId={inmuebleId}
        datos={datos}
        habitaciones={habitaciones}
        hoy={hoy}
        alCambiar={setAbierta}
      />
    </>
  );
}
