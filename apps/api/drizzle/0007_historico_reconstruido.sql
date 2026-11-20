-- Spec 012, R3b: reconstruye una vez el histórico con lo que ya hay guardado.
-- Cada actividad, con su fecha; las de un día sin hora, a mediodía de Madrid.
-- Las ediciones de antes (importe antes y después) no se conocen y no aparecen.
-- Solo en inmuebles que aún no tienen actividad propia (sin «reconstruida»).

-- Cobros generados, pagados y quitados.
INSERT INTO "actividad" ("inmueble_id", "inquilino_id", "tipo", "detalle", "ocurrida_en")
SELECT q."inmueble_id", c."inquilino_id", 'cobro_generado',
  jsonb_build_object('cobroId', c."id", 'mes', c."mes", 'importe', c."importe", 'origen', c."origen", 'reconstruida', true,
    'conceptos', jsonb_build_array(jsonb_build_object('tipo', 'cobro', 'id', c."id", 'inquilinoId', c."inquilino_id", 'importe', c."importe"))),
  c."creado_en"
FROM "cobro_alquiler" c JOIN "inquilino" q ON q."id" = c."inquilino_id"
WHERE NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = q."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
--> statement-breakpoint
INSERT INTO "actividad" ("inmueble_id", "inquilino_id", "tipo", "detalle", "ocurrida_en")
SELECT q."inmueble_id", c."inquilino_id", 'cobro_pagado',
  jsonb_build_object('cobroId', c."id", 'mes', c."mes", 'importe', c."importe", 'fecha', c."pagado_en", 'reconstruida', true,
    'conceptos', jsonb_build_array(jsonb_build_object('tipo', 'cobro', 'id', c."id", 'inquilinoId', c."inquilino_id", 'importe', c."importe"))),
  (c."pagado_en"::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Madrid'
FROM "cobro_alquiler" c JOIN "inquilino" q ON q."id" = c."inquilino_id"
WHERE c."pagado_en" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = q."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
--> statement-breakpoint
INSERT INTO "actividad" ("inmueble_id", "inquilino_id", "tipo", "detalle", "ocurrida_en")
SELECT q."inmueble_id", c."inquilino_id", 'cobro_quitado',
  jsonb_build_object('cobroId', c."id", 'mes', c."mes", 'importe', c."importe", 'reconstruida', true),
  c."quitado_en"
FROM "cobro_alquiler" c JOIN "inquilino" q ON q."id" = c."inquilino_id"
WHERE c."quitado_en" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = q."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
--> statement-breakpoint

-- Facturas subidas (una por lote) y repartidas, con la parte de cada inquilino.
INSERT INTO "actividad" ("inmueble_id", "tipo", "detalle", "ocurrida_en")
SELECT f."inmueble_id", 'factura_subida',
  jsonb_build_object('facturaIds', jsonb_agg(f."id" ORDER BY f."creado_en"), 'cantidad', count(*), 'reconstruida', true),
  min(f."creado_en")
FROM "factura" f
WHERE NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = f."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL)
GROUP BY f."inmueble_id", f."lote";
--> statement-breakpoint
INSERT INTO "actividad" ("inmueble_id", "tipo_gasto_id", "tipo", "detalle", "ocurrida_en")
SELECT f."inmueble_id", f."tipo_gasto_id", 'factura_repartida',
  jsonb_build_object('facturaId', f."id", 'importe', f."importe_total", 'periodoInicio', f."periodo_inicio", 'periodoFin', f."periodo_fin",
    'reconstruida', true,
    'conceptos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('tipo', 'parte', 'id', l."id", 'inquilinoId', l."inquilino_id", 'importe', l."importe"))
      FROM "reparto_linea" l WHERE l."reparto_id" = r."id" AND l."inquilino_id" IS NOT NULL
    ), '[]'::jsonb)),
  r."creado_en"
FROM "reparto" r JOIN "factura" f ON f."id" = r."factura_id"
WHERE NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = f."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
--> statement-breakpoint
INSERT INTO "actividad" ("inmueble_id", "inquilino_id", "tipo_gasto_id", "tipo", "detalle", "ocurrida_en")
SELECT f."inmueble_id", l."inquilino_id", f."tipo_gasto_id", 'parte_pagada',
  jsonb_build_object('facturaId', f."id", 'importe', l."importe", 'fecha', l."pagado_en", 'reconstruida', true,
    'conceptos', jsonb_build_array(jsonb_build_object('tipo', 'parte', 'id', l."id", 'inquilinoId', l."inquilino_id", 'importe', l."importe"))),
  (l."pagado_en"::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Madrid'
FROM "reparto_linea" l JOIN "reparto" r ON r."id" = l."reparto_id" JOIN "factura" f ON f."id" = r."factura_id"
WHERE l."pagado_en" IS NOT NULL AND l."inquilino_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = f."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
--> statement-breakpoint

-- Liquidaciones creadas.
INSERT INTO "actividad" ("inmueble_id", "tipo", "detalle", "ocurrida_en")
SELECT l."inmueble_id", 'liquidacion_creada',
  jsonb_build_object('liquidacionId', l."id", 'nombre', l."nombre", 'reconstruida', true,
    'facturaIds', coalesce((SELECT jsonb_agg(f."id") FROM "factura" f WHERE f."liquidacion_id" = l."id"), '[]'::jsonb)),
  l."creado_en"
FROM "liquidacion" l
WHERE NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = l."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
--> statement-breakpoint

-- Altas, entradas y salidas ya ocurridas.
INSERT INTO "actividad" ("inmueble_id", "inquilino_id", "tipo", "detalle", "ocurrida_en")
SELECT q."inmueble_id", q."id", 'inquilino_alta', jsonb_build_object('reconstruida', true), q."creado_en"
FROM "inquilino" q
WHERE NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = q."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
--> statement-breakpoint
INSERT INTO "actividad" ("inmueble_id", "inquilino_id", "tipo", "detalle", "ocurrida_en")
SELECT o."inmueble_id", o."inquilino_id", 'entrada',
  jsonb_build_object('fecha', o."entrada", 'habitacionId', o."habitacion_id", 'reconstruida', true),
  (o."entrada"::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Madrid'
FROM "ocupacion" o
WHERE o."entrada" <= current_date AND NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = o."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
--> statement-breakpoint
INSERT INTO "actividad" ("inmueble_id", "inquilino_id", "tipo", "detalle", "ocurrida_en")
SELECT o."inmueble_id", o."inquilino_id", 'salida',
  jsonb_build_object('fecha', o."salida", 'habitacionId', o."habitacion_id", 'reconstruida', true),
  (o."salida"::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Madrid'
FROM "ocupacion" o
WHERE o."salida" IS NOT NULL AND o."salida" <= current_date AND NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = o."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
--> statement-breakpoint

-- Fianzas recibidas y devueltas.
INSERT INTO "actividad" ("inmueble_id", "inquilino_id", "tipo", "detalle", "ocurrida_en")
SELECT q."inmueble_id", z."inquilino_id", 'fianza_recibida',
  jsonb_strip_nulls(jsonb_build_object('importe', z."importe", 'fecha', z."recibida_en", 'reconstruida', true)),
  coalesce((z."recibida_en"::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Madrid', z."creado_en")
FROM "fianza" z JOIN "inquilino" q ON q."id" = z."inquilino_id"
WHERE NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = q."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
--> statement-breakpoint
INSERT INTO "actividad" ("inmueble_id", "inquilino_id", "tipo", "detalle", "ocurrida_en")
SELECT q."inmueble_id", z."inquilino_id", 'fianza_devuelta',
  jsonb_build_object('importe', coalesce(z."importe_devuelto", 0), 'fecha', z."devuelta_en", 'reconstruida', true),
  (z."devuelta_en"::timestamp + interval '12 hours') AT TIME ZONE 'Europe/Madrid'
FROM "fianza" z JOIN "inquilino" q ON q."id" = z."inquilino_id"
WHERE z."devuelta_en" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = q."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
--> statement-breakpoint

-- Habitaciones y tipos de gasto creados.
INSERT INTO "actividad" ("inmueble_id", "tipo", "detalle", "ocurrida_en")
SELECT h."inmueble_id", 'habitacion_creada',
  jsonb_build_object('habitacionId', h."id", 'nombre', h."nombre", 'reconstruida', true),
  h."creado_en"
FROM "habitacion" h
WHERE NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = h."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
--> statement-breakpoint
INSERT INTO "actividad" ("inmueble_id", "tipo_gasto_id", "tipo", "detalle", "ocurrida_en")
SELECT g."inmueble_id", g."id", 'tipo_gasto_creado',
  jsonb_build_object('nombre', g."nombre", 'reconstruida', true),
  g."creado_en"
FROM "tipo_gasto" g
WHERE NOT EXISTS (SELECT 1 FROM "actividad" a WHERE a."inmueble_id" = g."inmueble_id" AND a."detalle" ->> 'reconstruida' IS NULL);
