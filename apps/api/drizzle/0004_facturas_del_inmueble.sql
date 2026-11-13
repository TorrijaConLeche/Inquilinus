ALTER TABLE "factura" ALTER COLUMN "tipo_gasto_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "factura" ADD COLUMN "inmueble_id" uuid;--> statement-breakpoint
-- Las facturas que ya existieran toman el inmueble de su tipo de gasto.
UPDATE "factura" SET "inmueble_id" = "tipo_gasto"."inmueble_id" FROM "tipo_gasto" WHERE "tipo_gasto"."id" = "factura"."tipo_gasto_id";--> statement-breakpoint
ALTER TABLE "factura" ALTER COLUMN "inmueble_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "factura" ADD CONSTRAINT "factura_inmueble_id_inmueble_id_fk" FOREIGN KEY ("inmueble_id") REFERENCES "public"."inmueble"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "factura_inmueble_id_index" ON "factura" USING btree ("inmueble_id");