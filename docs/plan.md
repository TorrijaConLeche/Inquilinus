# Plan de desarrollo

Última actualización: 8 de noviembre de 2026

Cada fase termina con algo que la usuaria puede probar. Las tareas remiten a las specs, que tienen el detalle. Responsable: **Tú** (la usuaria) o **Claude**.

## Estado

| Fase | Resultado | Estado |
| --- | --- | --- |
| 0 · Definición y dominio | Specs 001-011, documentación y lógica de negocio probada | ✅ Hecha |
| 1 · Infraestructura | La app desplegada en Vercel, conectada a la base de datos | ✅ Hecha |
| 2 · Cuenta e inicio de sesión | Registro y acceso con email o Google | ⏳ Siguiente |
| 3 · Inmuebles e inquilinos | Tus pisos dados de alta | Pendiente |
| 4 · Cobros y panel | Un mes de cobros gestionado con la app | Pendiente |
| 5 · Facturas con IA y reparto | Una factura real leída y repartida | Pendiente |
| 6 · Timeline y enlace del inquilino | MVP para uso propio: `v0.1.0` | Pendiente |
| 7 · Uso real y validación | Beta gratuita con otras propietarias | Pendiente |
| 8 · Planes y pagos | Primera suscripción real | Pendiente |

## Ramas y pull requests

- **Una rama y una PR por tarea**, con el prefijo del flujo (`docs/flujo-git.md`) y la spec: por ejemplo `feat/008-login-google`. Si una tarea es grande, se divide en varias PR pequeñas.
- Las tareas de **Tú** no llevan rama; cuando generan configuración (claves, dominios), Claude la recoge en una PR `chore/`.
- Claude integra cada PR con la CI en verde y la previsualización de Vercel funcionando, y avisa con un resumen.
- Al cerrar una tarea se marca aquí y en su spec. Al cerrar una fase, se prueba en la previsualización y se actualiza la tabla de estado.

## Fase 0 · Definición y dominio ✅

- [x] Specs 001-011 aprobadas; modelo de datos, RGPD, estilo, flujo de Git
- [x] Monorepo y CI (GitHub Actions)
- [x] Lógica de dominio de las specs 001-005, 007, 009 y 010 con sus tests

## Fase 1 · Infraestructura ✅

Depende de: nada. **Hecho cuando** la previsualización de Vercel muestra la app vacía con su estilo y un chequeo de salud que consulta la base de datos.

- [x] **1.1 · Tú** — Comprobar la marca Inquilinus (OEPM, EUIPO): se queda Inquilinus. Los dominios pasan a la tarea 6.9
- [x] **1.2 · Tú** — Crear las cuentas de Vercel, Neon (región Frankfurt) y AWS (región Estocolmo, con doble factor y alerta de gasto), con la guía de Claude
- [x] **1.3 · Tú** — En GitHub: proteger `main`, activar el borrado automático de ramas y, si quieres, renombrar el repositorio
- [x] **1.4 · Claude** — Esqueleto de `apps/api` (Hono, chequeo de salud, tests) · `chore/api-esqueleto`
- [x] **1.5 · Claude** — Esqueleto de `apps/web` (Next.js, tokens Salvia, Figtree, modo oscuro, traducciones es/en) · `chore/web-esqueleto`
- [x] **1.6 · Claude** — `packages/contracts` con Zod y generación de OpenAPI · `chore/contracts`
- [x] **1.7 · Claude** — Esquema de base de datos con Drizzle según `docs/modelo-datos.md` y primera migración · `feat/bd-esquema`
- [x] **1.8 · Claude + Tú** — Proyecto en Vercel conectado a GitHub, funciones en Frankfurt, variables de entorno y previsualizaciones por PR · `chore/vercel`
- [x] **1.9 · Claude** — Registro de errores sin datos personales (RGPD) · `chore/logs`

## Fase 2 · Cuenta e inicio de sesión (spec 008)

Depende de: fase 1. **Hecho cuando** te registras con email y con Google en la previsualización.

- [x] **2.1 · Tú** — Verificar tu email en Amazon SES (modo de pruebas, sin dominio) para enviar los emails de la cuenta. Hasta tener dominio (6.9) pueden llegar a spam
- [x] **2.2 · Tú** — Crear las credenciales de inicio de sesión con Google en Google Cloud, en modo de pruebas con tu cuenta como usuaria de prueba
- [x] **2.3 · Claude** — Better Auth con email y contraseña y verificación por email · `feat/008-email`
- [x] **2.4 · Claude** — Inicio de sesión con Google y vinculación de cuentas · `feat/008-google`
- [x] **2.5 · Claude** — Límite de intentos, sesión de 30 días y doble factor · `feat/008-seguridad`
- [x] **2.6 · Claude** — Pantallas de registro, acceso, recuperación y ajustes de cuenta · `feat/008-pantallas`
- [x] **2.6b · Claude** — Doble factor también por código al email y botón para mostrar la contraseña · `feat/008-mejoras-acceso`
- [x] **2.7 · Claude** — Exportar y borrar la cuenta · `feat/008-exportar-borrar`
- [x] **2.8 · Claude** — Borrador de política de privacidad y términos · `docs/textos-legales`
- [ ] **2.9 · Tú** — Revisar los textos legales con un asesor (antes de difundir la app)

## Fase 3 · Inmuebles e inquilinos (spec 007)

Depende de: fase 2. **Hecho cuando** tienes tus pisos reales dados de alta con sus inquilinos.

- [ ] **3.0 · Tú + Claude** — Rama de Neon solo para las previsualizaciones de Vercel, para que las pruebas no toquen los datos reales
- [ ] **3.1 · Tú** — Pasar la cuenta de AWS al plan de pago (el gratuito limita regiones y caduca) y crear el bucket privado de S3 (Estocolmo) con permisos para el usuario `inquilinus-app`, con la guía de Claude
- [ ] **3.2 · Claude** — API de inmuebles, habitaciones e historial de precios, con tests de aislamiento · `feat/007-api-inmuebles`
- [ ] **3.3 · Claude** — API de inquilinos, ocupaciones y tipos de gasto · `feat/007-api-inquilinos`
- [ ] **3.4 · Claude** — Asistente de alta del inmueble · `feat/007-asistente`
- [ ] **3.5 · Claude** — Detalle del inmueble y formularios de edición · `feat/007-detalle`
- [ ] **3.6 · Claude** — Documentos (contrato y justificante de fianza) y fianza · `feat/007-documentos`
- [ ] **3.7 · Claude** — Archivar, borrar y anonimizar · `feat/007-archivar-borrar`

## Fase 4 · Cobros y panel (specs 005 y 009)

Depende de: fase 3. **Hecho cuando** gestionas un mes completo de cobros con la app.

- [ ] **4.1 · Claude** — API de cobros: generar a mano, editar, mover, quitar, restaurar y marcar pagado · `feat/005-api-cobros`
- [ ] **4.2 · Claude** — Proceso diario de generación (cron de Vercel) · `feat/005-proceso-diario`
- [ ] **4.3 · Claude** — Marcar cobros desactualizados al cambiar ocupaciones o precios · `feat/005-desactualizados`
- [ ] **4.4 · Claude** — Pantalla de cobros del inmueble · `feat/009-cobros-inmueble`
- [ ] **4.5 · Claude** — Panel principal · `feat/009-panel`

## Fase 5 · Facturas con IA y reparto (specs 003 y 001)

Depende de: fase 4. **Hecho cuando** subes una factura real, la revisas y se reparte.

- [ ] **5.1 · Tú** — Activar Claude Haiku 5.5 en Amazon Bedrock con el perfil de inferencia EU
- [ ] **5.2 · Claude** — Subida múltiple (hasta 20 PDF) a S3 y extractor con Bedrock (`InvoiceExtractor`) que propone periodo, importe y tipo de gasto · `feat/003-extractor`
- [ ] **5.3 · Claude** — Lista por revisar, confirmación una a una o "Confirmar todas", y aviso de solapes también dentro del lote · `feat/003-revision`
- [ ] **5.4 · Claude** — Reparto guardado como foto fija con su detalle por tramos, y pagos de cada parte · `feat/001-reparto-guardado`
- [ ] **5.5 · Claude** — Liquidaciones: dominio, API, propuesta al confirmar un lote y vista agrupada en el panel y en los cobros del inmueble (spec 011) · `feat/011-liquidaciones`
- [ ] **5.6 · Tú + Claude** — Evaluación con 15-20 PDF reales: al menos un 90 % de aciertos · `test/003-evaluacion`

## Fase 6 · Timeline y enlace del inquilino (specs 006 y 004) → `v0.1.0`

Depende de: fase 5. **Hecho cuando** tus inquilinos reciben su enlace y ven su timeline.

- [ ] **6.1 · Claude** — Paleta de colores de los tipos de gasto y selector de color · `feat/006-colores`
- [ ] **6.2 · Claude** — Componente de timeline con zoom · `feat/006-timeline`
- [ ] **6.3 · Claude** — Ventanas de detalle del alquiler y de la factura · `feat/006-detalles`
- [ ] **6.4b · Claude** — Histórico del inmueble con filtros y resumen (spec 012). El registro de actividad se añade desde la fase 3 en cada acción · `feat/012-historico`
- [ ] **6.4 · Claude** — Enlaces: generar, revocar, regenerar, WhatsApp y permiso de descarga · `feat/004-enlaces`
- [ ] **6.5 · Claude** — Vista pública del inquilino con cabeceras de seguridad e idioma, incluidas sus liquidaciones · `feat/004-vista-publica`
- [ ] **6.6 · Claude** — Repaso de `docs/rgpd.md` y borrador de la cláusula informativa para inquilinos · `docs/rgpd-revision`
- [ ] **6.7 · Tú** — Revisar la cláusula informativa y entregarla a tus inquilinos
- [ ] **6.8 · Claude** — Etiqueta `v0.1.0`
- [ ] **6.9 · Tú** — Registrar el dominio (`inquilinus.es`; `inquilinus.com` está ocupado: decidir alternativa), verificarlo en Amazon SES (SPF, DKIM, DMARC), pedir salir del modo de pruebas de SES y pasar el inicio de sesión con Google a producción. Necesario antes de la beta con otras propietarias (7.3)
- [ ] **6.10 · Claude** — Dominio en Vercel, remitente de los emails y direcciones de Google con el dominio nuevo · `chore/dominio`

## Fase 7 · Uso real y validación

Depende de: fase 6.

- [ ] **7.1 · Tú** — Usar la app unos meses con tus inmuebles y anotar lo que molesta
- [ ] **7.2 · Claude** — Corregir y mejorar a partir de lo anotado (specs nuevas o actualizadas)
- [ ] **7.3 · Tú** — Beta gratuita con propietarias cercanas (plan Advanced sin coste)
- [ ] **7.4 · Claude** — Preparar el contrato de encargo (DPA) para otras propietarias, para revisión del asesor

## Fase 8 · Planes y pagos (spec 010)

Depende de: fase 7 y de tener resuelta la parte fiscal. **Hecho cuando** llega la primera suscripción real.

- [ ] **8.1 · Tú** — Consultar con un gestor el alta (autónoma o sociedad) y la facturación a Paddle
- [ ] **8.2 · Tú** — Textos legales definitivos con el asesor
- [ ] **8.3 · Claude** — Página pública de precios · `feat/010-precios`
- [ ] **8.4 · Tú** — Crear la cuenta de Paddle y superar su revisión
- [ ] **8.5 · Claude** — Checkout, portal de cliente y webhooks de Paddle · `feat/010-paddle`
- [ ] **8.6 · Claude** — Límites del plan en la app, bajada de plan y bloqueo de inmuebles · `feat/010-limites`
- [ ] **8.7 · Claude** — Vercel Pro (uso comercial) y revisión de costes · `chore/vercel-pro`

## Después del MVP

App móvil con Expo, resumen anual para la renta, recordatorios, meses sin alquiler, plan para carteras grandes y migración a Stripe cuando compense.
