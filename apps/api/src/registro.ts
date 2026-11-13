// Registro de la API sin datos personales (docs/rgpd.md).
//
// Cada línea es un JSON con una lista cerrada de campos: no hay forma de
// registrar un nombre, un email, el contenido de una factura ni el mensaje de
// un error (que puede llevar cualquiera de ellos) sin cambiar este fichero.
// - Rutas: el patrón (`/inmuebles/:id`), nunca la URL real, que puede llevar
//   tokens (enlace del inquilino) o parámetros de búsqueda.
// - Errores: tipo, código y pila sin la primera línea (que lleva el mensaje).

export type Nivel = "info" | "aviso" | "error";

export interface Campos {
  idPeticion?: string;
  metodo?: string;
  ruta?: string;
  estado?: number;
  duracionMs?: number;
  /** Nombre de la clase del error (`TypeError`, `ErrorValidacion`…). */
  tipoError?: string;
  /** Código de dominio (`FECHA_INVALIDA`) o SQLSTATE de PostgreSQL (`28P01`). */
  codigo?: string;
  /** Tipo del error original cuando uno envuelve a otro. */
  tipoCausa?: string;
  /** Solo las líneas `at …` de la pila. */
  pila?: string;
  /** Recuentos de un proceso por lotes (spec 005, R8b). */
  inmuebles?: number;
  creados?: number;
  fallidos?: number;
}

export interface Registro {
  info(evento: string, campos?: Campos): void;
  aviso(evento: string, campos?: Campos): void;
  error(evento: string, campos?: Campos): void;
}

type Escribir = (nivel: Nivel, linea: string) => void;

const escribirEnConsola: Escribir = (nivel, linea) => {
  if (nivel === "error") console.error(linea);
  else if (nivel === "aviso") console.warn(linea);
  else console.log(linea);
};

const CAMPOS: ReadonlyArray<keyof Campos> = [
  "idPeticion",
  "metodo",
  "ruta",
  "estado",
  "duracionMs",
  "tipoError",
  "codigo",
  "tipoCausa",
  "pila",
  "inmuebles",
  "creados",
  "fallidos",
];

/** Los eventos son identificadores fijos en código, no texto libre. */
const FORMATO_EVENTO = /^[a-z][a-z0-9_]*$/;

export function crearRegistro(escribir: Escribir = escribirEnConsola): Registro {
  const registrar = (nivel: Nivel, evento: string, campos: Campos = {}) => {
    const linea: Record<string, unknown> = {
      momento: new Date().toISOString(),
      nivel,
      evento: FORMATO_EVENTO.test(evento) ? evento : "evento_no_valido",
    };
    // Solo los campos de la lista, aunque llegue un objeto con más propiedades.
    for (const clave of CAMPOS) {
      const valor = campos[clave];
      if (valor !== undefined) linea[clave] = valor;
    }
    escribir(nivel, JSON.stringify(linea));
  };
  return {
    info: (evento, campos) => registrar("info", evento, campos),
    aviso: (evento, campos) => registrar("aviso", evento, campos),
    error: (evento, campos) => registrar("error", evento, campos),
  };
}

const CODIGO_DOMINIO = /^[A-Z][A-Z0-9_]*$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;

function codigoDe(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { codigo, code } = error as { codigo?: unknown; code?: unknown };
  if (typeof codigo === "string" && CODIGO_DOMINIO.test(codigo)) return codigo;
  if (typeof code === "string" && SQLSTATE.test(code)) return code;
  return undefined;
}

function tipoDe(error: unknown): string {
  if (error instanceof Error) return error.name;
  return typeof error;
}

/** Lo que se puede registrar de un error: nunca el mensaje. */
export function describirError(error: unknown): Campos {
  const causa = error instanceof Error ? error.cause : undefined;
  const campos: Campos = { tipoError: tipoDe(error) };
  const codigo = codigoDe(error) ?? codigoDe(causa);
  if (codigo) campos.codigo = codigo;
  if (causa !== undefined) campos.tipoCausa = tipoDe(causa);
  if (error instanceof Error && error.stack) {
    const marcos = error.stack
      .split("\n")
      .filter((l) => /^\s+at /.test(l))
      .slice(0, 10)
      .map((l) => l.trim());
    if (marcos.length > 0) campos.pila = marcos.join("\n");
  }
  return campos;
}
