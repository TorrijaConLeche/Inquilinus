# App de gestión de alquileres — Documento de arranque

Nov 5, 2026 · @Moni · Última actualización: Nov 5, 2026

## La idea

Una plataforma web (y más adelante app móvil) donde una propietaria o una gestoría gestiona uno o varios inmuebles en alquiler desde un único sitio: inquilinos, contratos, documentos, cobros de alquiler y suministros.

El diferencial es una función con IA que lee las facturas de suministros y calcula automáticamente el periodo, el total y lo que corresponde a cada inquilino.

**Problema que resuelve:**

- La información de cada inmueble está dispersa entre carpetas, correos, Excel y el banco.
- Repartir suministros entre inquilinos es tedioso, sobre todo cuando entran o salen a mitad de una factura.
- El reparto genera desconfianza: los inquilinos sospechan del cálculo cuando reciben una cifra sin facturas ni desglose.

**Primera usuaria:** yo misma, como propietaria. El proyecto se construye primero para uso propio y después se valida con otros propietarios. El producto se diseña de forma genérica, no a medida de mis inmuebles.

## Funcionalidades

El núcleo es estándar en el mercado; el reparto inteligente de suministros es lo que diferencia la app.

**Núcleo (necesario, pero no diferencial):**

- Varios inmuebles por usuaria, y varias habitaciones por inmueble, cada una con su precio.
- Modalidad de alquiler por inmueble (entero o por habitaciones), elegida al crearlo.
- Suministros configurables por inmueble: de cero a N, del tipo que se quiera. Sin suministros = incluidos en el alquiler.
- Ficha de cada inquilino (pertenece al inmueble); ocupaciones de habitación con fecha de entrada y de salida.
- Documentos por inquilino y año: contratos firmados, DNI, nóminas.
- Fianza por inquilino: importe, si se ha devuelto (y cuánto) y documento opcional.
- Cobros de alquiler generados automáticamente cada mes (o a mano), con estado pagado o pendiente.
- Seguimiento de qué inquilinos han pagado su parte de cada factura y cuándo, y un timeline por inmueble.

**Diferencial: reparto de suministros con IA**

1. La usuaria sube la factura (luz, agua, gas, internet…) en foto o PDF.
2. La IA extrae compañía, periodo, importe total y consumo.
3. La usuaria revisa y confirma los datos extraídos.
4. La app prorratea por días según quién vivía allí durante ese periodo, incluidas entradas y salidas a mitad de factura.
5. Se genera un desglose para cada inquilino.
6. Se sigue quién ha pagado su parte y quién no.

**Enlace de solo lectura para el inquilino:** uno por estancia. La propietaria comparte un enlace web (sin cuenta) con un timeline del desglose: facturas, su parte, cuándo se pagó. La descarga de facturas solo está disponible si la propietaria la habilita. Si el inquilino pide una factura concreta, también se le puede enviar por otros medios (p. ej. WhatsApp).

**Posibles ampliaciones (a validar):**

- Resumen anual por inmueble de ingresos y gastos para la declaración de la renta, exportable para la gestoría. Requiere revisar los detalles fiscales con un asesor.
- Recordatorios de vencimientos: fin de contrato, actualización de renta, seguros.
- App móvil (Expo) centrada en uso rápido: foto de factura, revisión del reparto, marcar cobros.

## Reglas de negocio

**Días de ocupación**

- Los días de entrada y de salida cuentan para el inquilino (ambos inclusive).
- Excepción: si en la misma habitación un inquilino sale y otro entra el mismo día, ese día lo paga solo quien entra.

**Reparto de suministros (igual en ambas modalidades)**

- Prorrateo por días: el importe diario se divide entre los inquilinos presentes ese día.
- Las habitaciones vacías no generan coste para la propietaria: su parte se reparte entre los presentes.
- Si un día no hay ningún inquilino, esa parte la asume la propietaria y aparece como "sin ocupar".

**Alquiler y habitaciones vacías**

- **Inmueble entero:** la renta de una habitación vacía se reparte a partes iguales entre los inquilinos presentes, durante los días que esté vacía.
- **Por habitaciones:** la renta de una habitación vacía la asume la propietaria.
- En la v1 la modalidad no se puede cambiar tras crear el inmueble. Si hiciera falta en el futuro, se hará con fecha de efecto, nunca de forma retroactiva.
- **Meses parciales** (entradas y salidas a mitad de mes): la propietaria elige por inmueble entre prorrateo por días o mes completo. Con mes completo, el mes de un relevo en una habitación se prorratea (en el futuro, la propietaria podría elegir).
- **Renta total:** es la suma de los precios de las habitaciones y es solo informativa para la propietaria.
- **Piso entero con un único inquilino:** se modela como un inmueble con una sola habitación, que representa la vivienda completa.

## Arquitectura y stack

Web primero, API-first, con el dominio en un paquete compartido para que la app móvil se añada después sin rehacer nada.

| Pieza | Decisión |
| --- | --- |
| Repositorio | Monorepo con pnpm y Turborepo |
| Dominio | `packages/domain`: TypeScript puro (motor de prorrateo), tests con Vitest |
| Contratos | `packages/contracts`: esquemas Zod, OpenAPI generado |
| API | `apps/api`: Hono sobre Node |
| Web | `apps/web`: Next.js (panel de la propietaria + enlace público del inquilino) |
| Móvil | `apps/mobile`: Expo, **fuera del MVP** |
| Base de datos | PostgreSQL en Neon (región UE), Drizzle ORM |
| Autenticación | Better Auth (usuarios en nuestra propia base de datos) |
| Enlace del inquilino | Token aleatorio, revocable, con caducidad opcional; sin cuenta |
| Ficheros | AWS S3 en región UE, bucket privado, URLs firmadas de corta duración |
| IA | Claude Haiku 5.5 vía AWS Bedrock, perfil de inferencia EU, detrás de la interfaz `InvoiceExtractor` |
| Hosting | Vercel para web y API, con funciones en Frankfurt. Plan gratuito en uso propio; plan de pago al haber clientes |

**Proveedores:** no hace falta que sean europeos; se exige que los datos estén en la UE y que cada proveedor tenga contrato de encargo (DPA). Criterio: calidad, coste y sencillez. Coste estimado en la fase 2: prácticamente 0 €/mes más céntimos de IA y almacenamiento. Postgres, S3 y Next.js son estándar, así que cambiar de proveedor no requiere tocar el código.

**RGPD desde el inicio:** medidas técnicas y organizativas en `docs/rgpd.md`. Datos en la UE, ficheros privados y cifrados, mínimo acceso, plazos de conservación y borrado de datos de inquilinos; los documentos de inquilinos (DNI, nóminas) nunca pasan por la IA. La cláusula informativa para inquilinos y el registro de actividades van en la fase 2; la documentación para otros propietarios, en la fase 3. Todo lo legal se valida con un asesor.

## Competencia y posicionamiento

La gestión básica de alquileres está cubierta por varias herramientas; el hueco está en el reparto de suministros transparente y automático.

| Herramienta | Qué ofrece (según su web o ficha) |
| --- | --- |
| [Homming](https://homming.com/en?p=9411) | Gestión de alquiler por habitaciones para gestores y propietarios |
| [Ublo](https://www.assurly.com/es/?p=6622) | Gestión de alquileres con precio según número de viviendas |
| [RentPackage](https://www.capterra.es/software/1081321/RentPackage) | Gratuito, habitaciones ilimitadas, contrato electrónico |
| [Rentila](https://apps.apple.com/mx/app/rentila/id403695251) | Plantillas de contrato y seguimiento de incidencias |

También hay apps más nuevas como ToRoomy y Hoozzee.

**Señal del problema:** en foros de alquiler son frecuentes los conflictos por el reparto de suministros, como inquilinos que reciben un Excel sin facturas o un cargo único sin desglose ([ejemplo 1](https://enalquiler.com/comunidad-alquiler/inquilinos/facturas-suministro-servicios-pisos-alquiler_6946.html), [ejemplo 2](https://enalquiler.com/comunidad-alquiler/inquilinos/casera-unico-cargo-cual-incluye-alquiler-agua-luz-gas-como-pedirle-haga-cargos-independientes_8651.html)).

**Posicionamiento propuesto:** la app más sencilla para propietarios pequeños, centrada en que el reparto de suministros sea automático y transparente para ambas partes.

Pendiente: probar a fondo Homming y RentPackage para ver hasta dónde llega su gestión de suministros.

## Viabilidad

Técnicamente es muy viable y barata; como negocio es moderada y depende de destacar en el nicho.

| Aspecto | Valoración | Motivo |
| --- | --- | --- |
| Técnica | Alta | Las facturas de suministros son documentos estructurados; los modelos de visión actuales extraen bien periodo, importe y consumo |
| Coste de IA | Muy bajo | Céntimos o fracciones de céntimo por factura con un modelo ligero (a confirmar con los precios de Bedrock) |
| Uso propio | Excelente | Resuelve un problema real de la primera usuaria |
| Negocio | Moderado | Mercado competido; disposición a pagar estimada de 5-15 €/mes por propietario pequeño |

**Riesgos principales:**

- Diferenciarse frente a herramientas gratuitas o ya establecidas.
- Protección de datos: se manejan documentos personales de inquilinos (DNI, nóminas).
- Errores de lectura de la IA: la usuaria revisa siempre antes de generar el desglose.

## Estrategia y fases

Primero una versión mínima para uso propio; solo cuando funcione en el día a día se enseña a otros propietarios.

1. **Definir** ✅ — requisitos y alcance, modelo de datos, pantallas clave, stack. Cerrada el 5 de noviembre de 2026.
2. **MVP para mí (web)** — inmuebles, habitaciones, inquilinos y ocupaciones, lectura de facturas, reparto por días, desglose y enlace del inquilino. *Paso siguiente cuando:* lleve unos meses de uso real.
3. **Validar con otros** — propietarios cercanos, grupos de caseros, recoger molestias, medir uso real; parte legal del RGPD. *Paso siguiente cuando:* alguien pida usarla o pagarla.
4. **Producto** — app móvil, resumen anual para la renta, recordatorios, suscripción. *Objetivo:* primeros clientes de pago.

## Pantallas del MVP

1. Lista de inmuebles: ocupación, cobros pendientes, facturas sin repartir.
2. Detalle del inmueble: habitaciones, inquilinos y ocupaciones en una línea de tiempo.
3. Ficha del inquilino: datos, documentos, fianza, cobros y enlace.
4. Subir factura → revisar lo leído por la IA → ver el reparto y confirmar.
5. Cobros del mes: quién ha pagado alquiler y suministros.
6. Vista pública del inquilino (el enlace).

## Metodología

Spec-driven development con un formato propio y ligero: una carpeta `specs/` con un único fichero por funcionalidad (objetivo, reglas, casos de prueba, fuera de alcance, tareas). Convenciones en `specs/README.md`. El modelo de datos está en `docs/modelo-datos.md`.

## Preguntas abiertas

Ninguna por ahora.

## Contexto para Claude

Este documento es la base del proyecto en Claude y, más adelante, del repositorio en Claude Code.

- **Mercado:** España. Idioma de la app: español.
- **Prioridad:** el reparto de suministros con IA es el diferencial; el resto debe ser simple.
- **Enfoque:** primero uso propio, después validación con otros propietarios. Evitar funcionalidades que no resuelvan un problema real observado.
- **Restricciones:** RGPD por diseño (datos en la UE); la IA propone y la usuaria revisa antes de que se genere ningún desglose.
- **Specs:** cortas y concretas; las reglas se escriben con casos de prueba numéricos.
- **Mantenimiento:** actualizar este documento cuando se tome una decisión o se responda una pregunta abierta.
