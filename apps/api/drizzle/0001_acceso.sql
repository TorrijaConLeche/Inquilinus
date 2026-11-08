CREATE TABLE "metodo_acceso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"proveedor" text NOT NULL,
	"id_en_proveedor" text NOT NULL,
	"contrasena_hash" text,
	"token_acceso" text,
	"token_refresco" text,
	"token_id" text,
	"token_acceso_expira_en" timestamp with time zone,
	"token_refresco_expira_en" timestamp with time zone,
	"alcance" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"ip" text,
	"agente_usuario" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sesion_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verificacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identificador" text NOT NULL,
	"valor" text NOT NULL,
	"expira_en" timestamp with time zone NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuario" ALTER COLUMN "nombre" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "email_verificado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "imagen" text;--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "terminos_version" text;--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "terminos_aceptados_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "metodo_acceso" ADD CONSTRAINT "metodo_acceso_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "metodo_acceso_usuario_id_index" ON "metodo_acceso" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sesion_usuario_id_index" ON "sesion" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "verificacion_identificador_index" ON "verificacion" USING btree ("identificador");