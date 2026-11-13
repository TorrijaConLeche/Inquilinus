import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import es from "../messages/es.json";
import { claveDeError } from "../src/lib/errores";

describe("claveDeError", () => {
  it("traduce los códigos de la API a textos propios", () => {
    expect(claveDeError("INVALID_EMAIL_OR_PASSWORD")).toBe("credenciales");
    expect(claveDeError("DEMASIADOS_INTENTOS")).toBe("demasiadosIntentos");
    expect(claveDeError("TERMINOS_NO_ACEPTADOS")).toBe("terminos");
  });

  it("acepta los códigos en minúsculas que llegan en la URL tras Google", () => {
    expect(claveDeError("account_not_linked")).toBe("cuentaNoVinculada");
  });

  it("cualquier otro código o ninguno da el mensaje genérico", () => {
    expect(claveDeError("ALGO_RARO")).toBe("generico");
    expect(claveDeError(undefined)).toBe("generico");
    expect(claveDeError("")).toBe("generico");
  });

  it("todas las claves posibles tienen texto en es y en", () => {
    const codigos = [
      "INVALID_EMAIL_OR_PASSWORD",
      "EMAIL_NOT_VERIFIED",
      "DEMASIADOS_INTENTOS",
      "PASSWORD_TOO_SHORT",
      "PASSWORD_TOO_LONG",
      "INVALID_PASSWORD",
      "TERMINOS_NO_ACEPTADOS",
      "INVALID_TOKEN",
      "INVALID_CODE",
      "OTP_HAS_EXPIRED",
      "INVALID_TWO_FACTOR_COOKIE",
      "ACCOUNT_NOT_LINKED",
      "NOMBRE_OBLIGATORIO",
      "SIN_HABITACIONES",
      "IMPORTE_INVALIDO",
      "DIA_COBRO_INVALIDO",
      "PRECIO_INICIAL_FUTURO",
      "FECHA_INVALIDA",
      "OCUPACION_INVALIDA",
      "SOLAPE_OCUPACIONES",
      "DATOS_INVALIDOS",
      "SIN_ESTANCIA_ABIERTA",
      "MISMA_HABITACION",
      "CAMBIO_ANTES_DE_LA_ENTRADA",
      "FICHERO_INVALIDO",
      "SUBIDA_NO_ENCONTRADA",
      "almacen-no-configurado",
      "DEVOLUCION_INCOMPLETA",
      "DEVOLUCION_MAYOR_QUE_FIANZA",
      "DEVOLUCION_ANTES_DE_RECEPCION",
      "NOTAS_DEMASIADO_LARGAS",
      "ALGUIEN_VIVIENDO",
      "ULTIMA_HABITACION",
      "HABITACION_CON_ESTANCIAS",
      "TIPO_GASTO_CON_FACTURAS",
      "INQUILINO_VIVIENDO",
      "INQUILINO_ANONIMIZADO",
      "CONFIRMACION_INCORRECTA",
      "CONFIRMACION_NECESARIA",
      "SIN_ESTANCIA_EN_EL_MES",
      "MES_FUTURO",
      "PAGO_FUTURO",
      "RENTA_OBLIGATORIA",
      "COBRO_EXISTENTE",
      "SIN_PRECIO",
      "DEMASIADAS_FACTURAS",
      "FACTURA_CONFIRMADA",
      "OTRO",
    ];
    for (const codigo of codigos) {
      const clave = claveDeError(codigo);
      expect(es.Errores[clave]).toBeTruthy();
      expect(en.Errores[clave]).toBeTruthy();
    }
  });
});
