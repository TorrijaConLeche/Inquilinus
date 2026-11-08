# Specs

Una spec por funcionalidad, en un único fichero: `NNN-nombre.md`.

## Estructura de cada spec

1. **Objetivo** — qué resuelve, en 2-3 líneas.
2. **Reglas** — numeradas (R1, R2…), en formato *Cuando / Si … el sistema deberá …*.
3. **Casos de prueba** — tabla con datos concretos y resultado esperado. Se convierten en tests.
4. **Fuera de alcance** — lo que esta spec no cubre.
5. **Tareas** — checklist de implementación.

## Estados

`borrador` → `aprobada` → `implementada`

Solo se implementa una spec `aprobada`. Si al implementar cambia una regla, se actualiza la spec primero.

## Convenciones

- Importes en céntimos (enteros); fechas como días naturales (`YYYY-MM-DD`), sin horas.
- Máximo una página por spec. Si crece, se divide.

## Índice

| Spec | Estado |
| --- | --- |
| [001 · Reparto de suministros](001-reparto-suministros.md) | implementada |
| [002 · Cálculo del alquiler mensual](002-calculo-alquiler.md) | implementada |
| [003 · Lectura de facturas con IA](003-lectura-facturas.md) | aprobada |
| [004 · Enlace y vista del inquilino](004-enlace-inquilino.md) | aprobada |
| [005 · Generación de cobros de alquiler](005-generacion-cobros.md) | aprobada |
| [006 · Timeline del inmueble](006-timeline.md) | aprobada |
| [007 · Gestión de inmuebles, habitaciones, inquilinos y ocupaciones](007-gestion-inmuebles.md) | aprobada |
| [008 · Cuenta e inicio de sesión](008-cuenta-sesion.md) | aprobada |
| [009 · Panel principal y cobros del inmueble](009-panel-cobros.md) | aprobada |
| [010 · Planes y suscripciones](010-planes-suscripciones.md) | aprobada |
| [011 · Liquidaciones](011-liquidaciones.md) | aprobada |
| [012 · Histórico del inmueble](012-historico.md) | aprobada |
