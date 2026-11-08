CREATE TYPE "public"."estado_factura" AS ENUM('subida', 'propuesta', 'error_extraccion', 'confirmada', 'repartida');--> statement-breakpoint
CREATE TYPE "public"."meses_parciales" AS ENUM('prorrateo', 'mes_completo');--> statement-breakpoint
CREATE TYPE "public"."modalidad" AS ENUM('entero', 'habitaciones');--> statement-breakpoint
CREATE TYPE "public"."origen_cobro" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."periodicidad" AS ENUM('mensual', 'anual');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('starter', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."tipo_documento" AS ENUM('contrato', 'justificante_fianza');--> statement-breakpoint
CREATE TABLE "actividad" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inmueble_id" uuid NOT NULL,
	"inquilino_id" uuid,
	"tipo_gasto_id" uuid,
	"tipo" text NOT NULL,
	"detalle" jsonb NOT NULL,
	"ocurrida_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cobro_alquiler" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquilino_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"renta" integer NOT NULL,
	"recargo_vacios" integer DEFAULT 0 NOT NULL,
	"importe" integer NOT NULL,
	"fecha_cobro" date NOT NULL,
	"origen" "origen_cobro" NOT NULL,
	"editado" boolean DEFAULT false NOT NULL,
	"desactualizado" boolean DEFAULT false NOT NULL,
	"quitado_en" timestamp with time zone,
	"pagado_en" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cobro_alquiler_inquilinoId_mes_unique" UNIQUE("inquilino_id","mes"),
	CONSTRAINT "cobro_alquiler_mes" CHECK ("cobro_alquiler"."mes" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "documento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquilino_id" uuid NOT NULL,
	"tipo" "tipo_documento" NOT NULL,
	"fichero_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enlace_inquilino" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquilino_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"permite_descarga" boolean DEFAULT true NOT NULL,
	"caduca_en" timestamp with time zone,
	"revocado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enlace_inquilino_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "evento_pago" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"procesado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factura" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo_gasto_id" uuid NOT NULL,
	"fichero_id" uuid NOT NULL,
	"lote" uuid NOT NULL,
	"liquidacion_id" uuid,
	"periodo_inicio" date,
	"periodo_fin" date,
	"importe_total" integer,
	"estado" "estado_factura" DEFAULT 'subida' NOT NULL,
	"propuesta_ia" jsonb,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "factura_periodo" CHECK ("factura"."periodo_fin" is null or "factura"."periodo_inicio" is null or "factura"."periodo_fin" >= "factura"."periodo_inicio")
);
--> statement-breakpoint
CREATE TABLE "fianza" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquilino_id" uuid NOT NULL,
	"importe" integer NOT NULL,
	"recibida_en" date,
	"devuelta_en" date,
	"importe_devuelto" integer,
	"fichero_id" uuid,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fianza_importes" CHECK ("fianza"."importe" >= 0 and coalesce("fianza"."importe_devuelto", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "fichero" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuaria_id" uuid NOT NULL,
	"clave_s_3" text NOT NULL,
	"nombre_original" text NOT NULL,
	"mime" text NOT NULL,
	"tamano_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fichero_claveS3_unique" UNIQUE("clave_s_3")
);
--> statement-breakpoint
CREATE TABLE "habitacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inmueble_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"archivada" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habitacion_id_inmueble" UNIQUE("id","inmueble_id")
);
--> statement-breakpoint
CREATE TABLE "inmueble" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuaria_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text,
	"modalidad" "modalidad" NOT NULL,
	"meses_parciales" "meses_parciales" DEFAULT 'mes_completo' NOT NULL,
	"dia_cobro" integer DEFAULT 1 NOT NULL,
	"ultimo_numero_liquidacion" integer DEFAULT 0 NOT NULL,
	"archivado" boolean DEFAULT false NOT NULL,
	"bloqueado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inmueble_dia_cobro" CHECK ("inmueble"."dia_cobro" between 1 and 28)
);
--> statement-breakpoint
CREATE TABLE "inquilino" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inmueble_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"anonimizado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquilino_id_inmueble" UNIQUE("id","inmueble_id")
);
--> statement-breakpoint
CREATE TABLE "liquidacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inmueble_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"nombre" text NOT NULL,
	"mes" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "liquidacion_inmuebleId_numero_unique" UNIQUE("inmueble_id","numero"),
	CONSTRAINT "liquidacion_mes" CHECK ("liquidacion"."mes" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "ocupacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inmueble_id" uuid NOT NULL,
	"habitacion_id" uuid NOT NULL,
	"inquilino_id" uuid NOT NULL,
	"entrada" date NOT NULL,
	"salida" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ocupacion_fechas" CHECK ("ocupacion"."salida" is null or "ocupacion"."salida" >= "ocupacion"."entrada")
);
--> statement-breakpoint
CREATE TABLE "precio_habitacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habitacion_id" uuid NOT NULL,
	"desde_mes" text NOT NULL,
	"precio_mensual" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "precio_habitacion_habitacionId_desdeMes_unique" UNIQUE("habitacion_id","desde_mes"),
	CONSTRAINT "precio_habitacion_desde_mes" CHECK ("precio_habitacion"."desde_mes" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "precio_habitacion_precio" CHECK ("precio_habitacion"."precio_mensual" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reparto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factura_id" uuid NOT NULL,
	"calculado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"detalle" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reparto_facturaId_unique" UNIQUE("factura_id")
);
--> statement-breakpoint
CREATE TABLE "reparto_linea" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reparto_id" uuid NOT NULL,
	"inquilino_id" uuid,
	"dias" integer NOT NULL,
	"importe" integer NOT NULL,
	"pagado_en" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suscripcion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuaria_id" uuid NOT NULL,
	"plan" "plan" NOT NULL,
	"periodicidad" "periodicidad" NOT NULL,
	"estado" text NOT NULL,
	"paddle_cliente_id" text,
	"paddle_suscripcion_id" text,
	"periodo_fin" timestamp with time zone,
	"cancela_al_final" boolean DEFAULT false NOT NULL,
	"inmueble_activo_id" uuid,
	"activo_elegido_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suscripcion_usuariaId_unique" UNIQUE("usuaria_id"),
	CONSTRAINT "suscripcion_paddleSuscripcionId_unique" UNIQUE("paddle_suscripcion_id")
);
--> statement-breakpoint
CREATE TABLE "tipo_gasto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inmueble_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"color" text NOT NULL,
	"archivado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uso_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuaria_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"facturas_leidas" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uso_ia_usuariaId_mes_unique" UNIQUE("usuaria_id","mes"),
	CONSTRAINT "uso_ia_mes" CHECK ("uso_ia"."mes" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "usuaria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuaria_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_inmueble_id_inmueble_id_fk" FOREIGN KEY ("inmueble_id") REFERENCES "public"."inmueble"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_inquilino_id_inquilino_id_fk" FOREIGN KEY ("inquilino_id") REFERENCES "public"."inquilino"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_tipo_gasto_id_tipo_gasto_id_fk" FOREIGN KEY ("tipo_gasto_id") REFERENCES "public"."tipo_gasto"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobro_alquiler" ADD CONSTRAINT "cobro_alquiler_inquilino_id_inquilino_id_fk" FOREIGN KEY ("inquilino_id") REFERENCES "public"."inquilino"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_inquilino_id_inquilino_id_fk" FOREIGN KEY ("inquilino_id") REFERENCES "public"."inquilino"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_fichero_id_fichero_id_fk" FOREIGN KEY ("fichero_id") REFERENCES "public"."fichero"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enlace_inquilino" ADD CONSTRAINT "enlace_inquilino_inquilino_id_inquilino_id_fk" FOREIGN KEY ("inquilino_id") REFERENCES "public"."inquilino"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura" ADD CONSTRAINT "factura_tipo_gasto_id_tipo_gasto_id_fk" FOREIGN KEY ("tipo_gasto_id") REFERENCES "public"."tipo_gasto"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura" ADD CONSTRAINT "factura_fichero_id_fichero_id_fk" FOREIGN KEY ("fichero_id") REFERENCES "public"."fichero"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factura" ADD CONSTRAINT "factura_liquidacion_id_liquidacion_id_fk" FOREIGN KEY ("liquidacion_id") REFERENCES "public"."liquidacion"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fianza" ADD CONSTRAINT "fianza_inquilino_id_inquilino_id_fk" FOREIGN KEY ("inquilino_id") REFERENCES "public"."inquilino"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fianza" ADD CONSTRAINT "fianza_fichero_id_fichero_id_fk" FOREIGN KEY ("fichero_id") REFERENCES "public"."fichero"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichero" ADD CONSTRAINT "fichero_usuaria_id_usuaria_id_fk" FOREIGN KEY ("usuaria_id") REFERENCES "public"."usuaria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habitacion" ADD CONSTRAINT "habitacion_inmueble_id_inmueble_id_fk" FOREIGN KEY ("inmueble_id") REFERENCES "public"."inmueble"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inmueble" ADD CONSTRAINT "inmueble_usuaria_id_usuaria_id_fk" FOREIGN KEY ("usuaria_id") REFERENCES "public"."usuaria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquilino" ADD CONSTRAINT "inquilino_inmueble_id_inmueble_id_fk" FOREIGN KEY ("inmueble_id") REFERENCES "public"."inmueble"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liquidacion" ADD CONSTRAINT "liquidacion_inmueble_id_inmueble_id_fk" FOREIGN KEY ("inmueble_id") REFERENCES "public"."inmueble"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocupacion" ADD CONSTRAINT "ocupacion_habitacion_mismo_inmueble" FOREIGN KEY ("habitacion_id","inmueble_id") REFERENCES "public"."habitacion"("id","inmueble_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocupacion" ADD CONSTRAINT "ocupacion_inquilino_mismo_inmueble" FOREIGN KEY ("inquilino_id","inmueble_id") REFERENCES "public"."inquilino"("id","inmueble_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precio_habitacion" ADD CONSTRAINT "precio_habitacion_habitacion_id_habitacion_id_fk" FOREIGN KEY ("habitacion_id") REFERENCES "public"."habitacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reparto" ADD CONSTRAINT "reparto_factura_id_factura_id_fk" FOREIGN KEY ("factura_id") REFERENCES "public"."factura"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reparto_linea" ADD CONSTRAINT "reparto_linea_reparto_id_reparto_id_fk" FOREIGN KEY ("reparto_id") REFERENCES "public"."reparto"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reparto_linea" ADD CONSTRAINT "reparto_linea_inquilino_id_inquilino_id_fk" FOREIGN KEY ("inquilino_id") REFERENCES "public"."inquilino"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripcion" ADD CONSTRAINT "suscripcion_usuaria_id_usuaria_id_fk" FOREIGN KEY ("usuaria_id") REFERENCES "public"."usuaria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripcion" ADD CONSTRAINT "suscripcion_inmueble_activo_id_inmueble_id_fk" FOREIGN KEY ("inmueble_activo_id") REFERENCES "public"."inmueble"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tipo_gasto" ADD CONSTRAINT "tipo_gasto_inmueble_id_inmueble_id_fk" FOREIGN KEY ("inmueble_id") REFERENCES "public"."inmueble"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uso_ia" ADD CONSTRAINT "uso_ia_usuaria_id_usuaria_id_fk" FOREIGN KEY ("usuaria_id") REFERENCES "public"."usuaria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actividad_inmueble_id_ocurrida_en_index" ON "actividad" USING btree ("inmueble_id","ocurrida_en");--> statement-breakpoint
CREATE INDEX "documento_inquilino_id_index" ON "documento" USING btree ("inquilino_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enlace_inquilino_vigente" ON "enlace_inquilino" USING btree ("inquilino_id") WHERE "enlace_inquilino"."revocado_en" is null;--> statement-breakpoint
CREATE INDEX "factura_tipo_gasto_id_index" ON "factura" USING btree ("tipo_gasto_id");--> statement-breakpoint
CREATE INDEX "factura_lote_index" ON "factura" USING btree ("lote");--> statement-breakpoint
CREATE INDEX "fianza_inquilino_id_index" ON "fianza" USING btree ("inquilino_id");--> statement-breakpoint
CREATE INDEX "inmueble_usuaria_id_index" ON "inmueble" USING btree ("usuaria_id");--> statement-breakpoint
CREATE INDEX "ocupacion_habitacion_id_index" ON "ocupacion" USING btree ("habitacion_id");--> statement-breakpoint
CREATE INDEX "ocupacion_inquilino_id_index" ON "ocupacion" USING btree ("inquilino_id");--> statement-breakpoint
CREATE INDEX "reparto_linea_reparto_id_index" ON "reparto_linea" USING btree ("reparto_id");--> statement-breakpoint
CREATE INDEX "reparto_linea_inquilino_id_index" ON "reparto_linea" USING btree ("inquilino_id");--> statement-breakpoint
CREATE INDEX "tipo_gasto_inmueble_id_index" ON "tipo_gasto" USING btree ("inmueble_id");