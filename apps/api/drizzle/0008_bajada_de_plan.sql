ALTER TYPE "public"."plan" ADD VALUE 'plus' BEFORE 'advanced';--> statement-breakpoint
CREATE TABLE "eleccion_inmuebles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"plan" "plan" NOT NULL,
	"elegido_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eleccion_inmuebles_usuarioId_unique" UNIQUE("usuario_id")
);
--> statement-breakpoint
ALTER TABLE "suscripcion" DROP CONSTRAINT "suscripcion_inmueble_activo_id_inmueble_id_fk";
--> statement-breakpoint
ALTER TABLE "eleccion_inmuebles" ADD CONSTRAINT "eleccion_inmuebles_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripcion" DROP COLUMN "inmueble_activo_id";--> statement-breakpoint
ALTER TABLE "suscripcion" DROP COLUMN "activo_elegido_en";