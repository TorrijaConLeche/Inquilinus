CREATE TABLE "doble_factor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"secreto" text NOT NULL,
	"codigos_recuperacion" text NOT NULL,
	"verificado" boolean DEFAULT true NOT NULL,
	"fallos_seguidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intento_acceso" (
	"clave" text PRIMARY KEY NOT NULL,
	"fallos" integer DEFAULT 0 NOT NULL,
	"primer_fallo_en" timestamp with time zone NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "doble_factor_activo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "doble_factor" ADD CONSTRAINT "doble_factor_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doble_factor_usuario_id_index" ON "doble_factor" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "doble_factor_secreto_index" ON "doble_factor" USING btree ("secreto");