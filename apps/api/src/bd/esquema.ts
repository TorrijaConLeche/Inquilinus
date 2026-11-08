// Esquema de la base de datos (docs/modelo-datos.md).
// Nombres en camelCase aquí y en snake_case en PostgreSQL (`casing: "snake_case"`).
// - Importes: céntimos enteros (`integer`).
// - Fechas de negocio: `date` como texto `YYYY-MM-DD`. Meses: texto `YYYY-MM`.
// - Momentos (cuándo pasó algo): `timestamptz`.
// - Todo cuelga de un usuario a través del inmueble; al borrar el usuario o el
//   inmueble se borra en cascada lo que cuelga de él. Las demás referencias no
//   borran en cascada.
import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const id = () => uuid().primaryKey().defaultRandom();
const momento = () => timestamp({ withTimezone: true });
const dia = () => date({ mode: "string" });
const mes = () => text();
const importe = () => integer();

const marcas = {
  creadoEn: momento().notNull().defaultNow(),
  actualizadoEn: momento()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const formatoMes = (columna: AnyPgColumn): SQL =>
  sql`${columna} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`;

// Enumerados ---------------------------------------------------------------

export const modalidad = pgEnum("modalidad", ["entero", "habitaciones"]);
export const mesesParciales = pgEnum("meses_parciales", ["prorrateo", "mes_completo"]);
export const estadoFactura = pgEnum("estado_factura", [
  "subida",
  "propuesta",
  "error_extraccion",
  "confirmada",
  "repartida",
]);
export const origenCobro = pgEnum("origen_cobro", ["auto", "manual"]);
export const plan = pgEnum("plan", ["starter", "advanced"]);
export const periodicidad = pgEnum("periodicidad", ["mensual", "anual"]);
export const tipoDocumento = pgEnum("tipo_documento", ["contrato", "justificante_fianza"]);

// Usuario y ficheros -------------------------------------------------------

/** Las columnas de sesión y verificación las añade Better Auth (fase 2). */
export const usuario = pgTable("usuario", {
  id: id(),
  email: text().notNull().unique(),
  nombre: text().notNull(),
  ...marcas,
});

export const fichero = pgTable("fichero", {
  id: id(),
  usuarioId: uuid()
    .notNull()
    .references(() => usuario.id, { onDelete: "cascade" }),
  claveS3: text().notNull().unique(),
  nombreOriginal: text().notNull(),
  mime: text().notNull(),
  tamanoBytes: integer().notNull(),
  sha256: text().notNull(),
  ...marcas,
});

// Inmueble -----------------------------------------------------------------

export const inmueble = pgTable(
  "inmueble",
  {
    id: id(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuario.id, { onDelete: "cascade" }),
    nombre: text().notNull(),
    direccion: text(),
    modalidad: modalidad().notNull(),
    mesesParciales: mesesParciales().notNull().default("mes_completo"),
    diaCobro: integer().notNull().default(1),
    ultimoNumeroLiquidacion: integer().notNull().default(0),
    archivado: boolean().notNull().default(false),
    bloqueado: boolean().notNull().default(false),
    ...marcas,
  },
  (t) => [
    index().on(t.usuarioId),
    check("inmueble_dia_cobro", sql`${t.diaCobro} between 1 and 28`),
  ],
);

export const habitacion = pgTable(
  "habitacion",
  {
    id: id(),
    inmuebleId: uuid()
      .notNull()
      .references(() => inmueble.id, { onDelete: "cascade" }),
    nombre: text().notNull(),
    archivada: boolean().notNull().default(false),
    ...marcas,
  },
  // Permite a `ocupacion` exigir que habitación e inquilino sean del mismo inmueble.
  (t) => [unique("habitacion_id_inmueble").on(t.id, t.inmuebleId)],
);

export const precioHabitacion = pgTable(
  "precio_habitacion",
  {
    id: id(),
    habitacionId: uuid()
      .notNull()
      .references(() => habitacion.id, { onDelete: "cascade" }),
    desdeMes: mes().notNull(),
    precioMensual: importe().notNull(),
    ...marcas,
  },
  (t) => [
    unique().on(t.habitacionId, t.desdeMes),
    check("precio_habitacion_desde_mes", formatoMes(t.desdeMes)),
    check("precio_habitacion_precio", sql`${t.precioMensual} >= 0`),
  ],
);

export const inquilino = pgTable(
  "inquilino",
  {
    id: id(),
    inmuebleId: uuid()
      .notNull()
      .references(() => inmueble.id, { onDelete: "cascade" }),
    nombre: text().notNull(),
    anonimizado: boolean().notNull().default(false),
    ...marcas,
  },
  (t) => [unique("inquilino_id_inmueble").on(t.id, t.inmuebleId)],
);

export const ocupacion = pgTable(
  "ocupacion",
  {
    id: id(),
    inmuebleId: uuid().notNull(),
    habitacionId: uuid().notNull(),
    inquilinoId: uuid().notNull(),
    entrada: dia().notNull(),
    salida: dia(),
    ...marcas,
  },
  (t) => [
    foreignKey({
      columns: [t.habitacionId, t.inmuebleId],
      foreignColumns: [habitacion.id, habitacion.inmuebleId],
      name: "ocupacion_habitacion_mismo_inmueble",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.inquilinoId, t.inmuebleId],
      foreignColumns: [inquilino.id, inquilino.inmuebleId],
      name: "ocupacion_inquilino_mismo_inmueble",
    }).onDelete("cascade"),
    index().on(t.habitacionId),
    index().on(t.inquilinoId),
    check("ocupacion_fechas", sql`${t.salida} is null or ${t.salida} >= ${t.entrada}`),
  ],
);

export const tipoGasto = pgTable(
  "tipo_gasto",
  {
    id: id(),
    inmuebleId: uuid()
      .notNull()
      .references(() => inmueble.id, { onDelete: "cascade" }),
    nombre: text().notNull(),
    color: text().notNull(),
    archivado: boolean().notNull().default(false),
    ...marcas,
  },
  (t) => [index().on(t.inmuebleId)],
);

// Facturas y repartos ------------------------------------------------------

export const liquidacion = pgTable(
  "liquidacion",
  {
    id: id(),
    inmuebleId: uuid()
      .notNull()
      .references(() => inmueble.id, { onDelete: "cascade" }),
    numero: integer().notNull(),
    nombre: text().notNull(),
    mes: mes().notNull(),
    ...marcas,
  },
  (t) => [
    unique().on(t.inmuebleId, t.numero),
    check("liquidacion_mes", formatoMes(t.mes)),
  ],
);

export const factura = pgTable(
  "factura",
  {
    id: id(),
    tipoGastoId: uuid()
      .notNull()
      .references(() => tipoGasto.id, { onDelete: "cascade" }),
    ficheroId: uuid()
      .notNull()
      .references(() => fichero.id),
    /** Agrupa las facturas subidas juntas (spec 003). */
    lote: uuid().notNull(),
    liquidacionId: uuid().references(() => liquidacion.id, { onDelete: "set null" }),
    periodoInicio: dia(),
    periodoFin: dia(),
    importeTotal: importe(),
    estado: estadoFactura().notNull().default("subida"),
    /** Lo que propuso la IA, incluido el tipo de gasto sugerido. */
    propuestaIa: jsonb(),
    ...marcas,
  },
  (t) => [
    index().on(t.tipoGastoId),
    index().on(t.lote),
    check(
      "factura_periodo",
      sql`${t.periodoFin} is null or ${t.periodoInicio} is null or ${t.periodoFin} >= ${t.periodoInicio}`,
    ),
  ],
);

/** Foto fija del reparto (spec 001). Recalcular lo sustituye. */
export const reparto = pgTable("reparto", {
  id: id(),
  facturaId: uuid()
    .notNull()
    .unique()
    .references(() => factura.id, { onDelete: "cascade" }),
  calculadoEn: momento().notNull().defaultNow(),
  /** Tramos de días con los presentes, para la vista del inquilino (spec 004). */
  detalle: jsonb().notNull(),
  ...marcas,
});

export const repartoLinea = pgTable(
  "reparto_linea",
  {
    id: id(),
    repartoId: uuid()
      .notNull()
      .references(() => reparto.id, { onDelete: "cascade" }),
    /** Vacío = días sin ocupar. */
    inquilinoId: uuid().references(() => inquilino.id),
    dias: integer().notNull(),
    importe: importe().notNull(),
    pagadoEn: dia(),
    ...marcas,
  },
  (t) => [index().on(t.repartoId), index().on(t.inquilinoId)],
);

// Cobros de alquiler -------------------------------------------------------

export const cobroAlquiler = pgTable(
  "cobro_alquiler",
  {
    id: id(),
    inquilinoId: uuid()
      .notNull()
      .references(() => inquilino.id, { onDelete: "cascade" }),
    mes: mes().notNull(),
    renta: importe().notNull(),
    recargoVacios: importe().notNull().default(0),
    importe: importe().notNull(),
    fechaCobro: dia().notNull(),
    origen: origenCobro().notNull(),
    editado: boolean().notNull().default(false),
    desactualizado: boolean().notNull().default(false),
    quitadoEn: momento(),
    pagadoEn: dia(),
    ...marcas,
  },
  (t) => [
    // Único también con los quitados, para que el proceso diario no los recree (spec 005).
    unique().on(t.inquilinoId, t.mes),
    check("cobro_alquiler_mes", formatoMes(t.mes)),
  ],
);

// Inquilino: fianza, documentos y enlace ------------------------------------

export const fianza = pgTable(
  "fianza",
  {
    id: id(),
    inquilinoId: uuid()
      .notNull()
      .references(() => inquilino.id, { onDelete: "cascade" }),
    importe: importe().notNull(),
    recibidaEn: dia(),
    devueltaEn: dia(),
    importeDevuelto: importe(),
    ficheroId: uuid().references(() => fichero.id, { onDelete: "set null" }),
    notas: text(),
    ...marcas,
  },
  (t) => [
    index().on(t.inquilinoId),
    check("fianza_importes", sql`${t.importe} >= 0 and coalesce(${t.importeDevuelto}, 0) >= 0`),
  ],
);

/** Solo contrato y justificante de fianza. Nunca se envía a la IA. */
export const documento = pgTable(
  "documento",
  {
    id: id(),
    inquilinoId: uuid()
      .notNull()
      .references(() => inquilino.id, { onDelete: "cascade" }),
    tipo: tipoDocumento().notNull(),
    ficheroId: uuid()
      .notNull()
      .references(() => fichero.id, { onDelete: "cascade" }),
    ...marcas,
  },
  (t) => [index().on(t.inquilinoId)],
);

/** Se guarda el hash del token, nunca el token. */
export const enlaceInquilino = pgTable(
  "enlace_inquilino",
  {
    id: id(),
    inquilinoId: uuid()
      .notNull()
      .references(() => inquilino.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    permiteDescarga: boolean().notNull().default(true),
    caducaEn: momento(),
    revocadoEn: momento(),
    ...marcas,
  },
  // Un solo enlace vigente por estancia; los revocados se conservan.
  (t) => [
    uniqueIndex("enlace_inquilino_vigente")
      .on(t.inquilinoId)
      .where(sql`${t.revocadoEn} is null`),
  ],
);

// Histórico ----------------------------------------------------------------

/** Histórico del inmueble (spec 012). Solo se añade; nunca se edita. */
export const actividad = pgTable(
  "actividad",
  {
    id: id(),
    inmuebleId: uuid()
      .notNull()
      .references(() => inmueble.id, { onDelete: "cascade" }),
    inquilinoId: uuid().references(() => inquilino.id, { onDelete: "set null" }),
    tipoGastoId: uuid().references(() => tipoGasto.id, { onDelete: "set null" }),
    /** Tipos de la spec 012 (R2); se definen en el dominio al implementarla. */
    tipo: text().notNull(),
    /** Valores antes y después. */
    detalle: jsonb().notNull(),
    ocurridaEn: momento().notNull().defaultNow(),
    ...marcas,
  },
  (t) => [index().on(t.inmuebleId, t.ocurridaEn)],
);

// Planes y pagos -----------------------------------------------------------

/** Solo cambia por webhooks de Paddle (spec 010). */
export const suscripcion = pgTable("suscripcion", {
  id: id(),
  usuarioId: uuid()
    .notNull()
    .unique()
    .references(() => usuario.id, { onDelete: "cascade" }),
  plan: plan().notNull(),
  periodicidad: periodicidad().notNull(),
  /** Estado tal como lo envía Paddle. */
  estado: text().notNull(),
  paddleClienteId: text(),
  paddleSuscripcionId: text().unique(),
  periodoFin: momento(),
  cancelaAlFinal: boolean().notNull().default(false),
  inmuebleActivoId: uuid().references(() => inmueble.id, { onDelete: "set null" }),
  /** Vacío = aún no elegido; la elección es única mientras siga en Starter. */
  activoElegidoEn: momento(),
  ...marcas,
});

/** Cada webhook de Paddle se procesa una sola vez. */
export const eventoPago = pgTable("evento_pago", {
  id: text().primaryKey(),
  tipo: text().notNull(),
  procesadoEn: momento().notNull().defaultNow(),
  ...marcas,
});

export const usoIa = pgTable(
  "uso_ia",
  {
    id: id(),
    usuarioId: uuid()
      .notNull()
      .references(() => usuario.id, { onDelete: "cascade" }),
    mes: mes().notNull(),
    facturasLeidas: integer().notNull().default(0),
    ...marcas,
  },
  (t) => [unique().on(t.usuarioId, t.mes), check("uso_ia_mes", formatoMes(t.mes))],
);
