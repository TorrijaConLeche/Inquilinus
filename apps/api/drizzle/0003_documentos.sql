ALTER TABLE "fianza" DROP CONSTRAINT "fianza_fichero_id_fichero_id_fk";
--> statement-breakpoint
DROP INDEX "documento_inquilino_id_index";--> statement-breakpoint
DROP INDEX "fianza_inquilino_id_index";--> statement-breakpoint
ALTER TABLE "fianza" DROP COLUMN "fichero_id";--> statement-breakpoint
ALTER TABLE "documento" ADD CONSTRAINT "documento_inquilinoId_tipo_unique" UNIQUE("inquilino_id","tipo");--> statement-breakpoint
ALTER TABLE "fianza" ADD CONSTRAINT "fianza_inquilinoId_unique" UNIQUE("inquilino_id");