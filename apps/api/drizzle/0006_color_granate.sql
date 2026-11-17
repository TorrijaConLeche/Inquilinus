-- Spec 006, R7: «pizarra» sale de la paleta de gasto (se confundía con el gris del alquiler) y entra «granate».
UPDATE "tipo_gasto" SET "color" = 'granate' WHERE "color" = 'pizarra';
