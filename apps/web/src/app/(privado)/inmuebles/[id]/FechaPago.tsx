"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Aviso } from "../../../../componentes/Aviso";
import { Campo } from "../../../../componentes/Campo";
import formulario from "../../../../componentes/formulario.module.css";
import type { ClaveError } from "../../../../lib/errores";
import propias from "./detalle.module.css";

/**
 * Spec 009, R9 y R10: elegir la fecha de un pago, nunca posterior a hoy. Sirve
 * para cambiar la de algo ya pagado y para marcar pagado «En otra fecha».
 */
export function FormularioFechaPago({
  inicial,
  hoy,
  textoBoton,
  enviando,
  error,
  alGuardar,
  alCancelar,
}: {
  inicial: string;
  hoy: string;
  textoBoton: string;
  enviando: boolean;
  error: ClaveError | null;
  alGuardar: (fecha: string) => void;
  alCancelar: () => void;
}) {
  const t = useTranslations("Cobros");
  const te = useTranslations("Errores");
  const [fecha, setFecha] = useState(inicial);
  // Las fechas `YYYY-MM-DD` se comparan bien como texto.
  const valida = fecha !== "" && fecha <= hoy;
  return (
    <form
      className={propias.enLinea}
      onSubmit={(e) => {
        e.preventDefault();
        if (valida) alGuardar(fecha);
      }}
      noValidate
    >
      {error && <Aviso tipo="error">{te(error)}</Aviso>}
      <Campo
        etiqueta={t("fechaPago")}
        type="date"
        max={hoy}
        autoFocus
        value={fecha}
        error={fecha > hoy ? te("pagoFuturo") : null}
        onChange={(e) => setFecha(e.target.value)}
      />
      <div className={propias.botones}>
        <button type="button" className={formulario.botonSecundario} onClick={alCancelar}>
          {t("cancelar")}
        </button>
        <button type="submit" className={formulario.boton} disabled={enviando || !valida}>
          {textoBoton}
        </button>
      </div>
    </form>
  );
}
