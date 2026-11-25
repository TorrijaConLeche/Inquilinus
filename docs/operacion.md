# Operación y costes

Qué cuesta tener Inquilinus en producción, qué límites tiene cada servicio y qué señales indican que hay que actuar. Revisado el 25-11-2026 (tarea 8.7 del plan). Los precios cambian: se comprueban en la web de cada proveedor antes de decidir nada.

## Lo que cuesta

### Cada factura leída con IA

Medido con las 16 facturas reales de la evaluación (tarea 5.6), con Claude Haiku 4.5 en Bedrock y el perfil de la UE:

| | Media | Mínimo | Máximo |
| --- | --- | --- | --- |
| Tokens de entrada (PDF e instrucciones) | 9.600 | 3.600 | 13.300 |
| Tokens de salida | 36 | | |

Con el perfil de la UE (1,10 $ por millón de entrada y 5,50 $ por millón de salida, un 10 % más que el global), **cada factura cuesta alrededor de 1 céntimo**. Por cuenta y mes:

| Uso | Facturas | IA al mes |
| --- | --- | --- |
| Starter (límite) | 5 | ~5 céntimos |
| Propietaria típica con 3 inmuebles | ~5 | ~5 céntimos |
| Plus o Advanced (uso razonable, spec 008 R12) | 100 | ~1 € |

En la factura de AWS, Claude aparece como compra de AWS Marketplace a nombre de Anthropic, no dentro de «Bedrock». Al pasar a Claude Haiku 5.5, se repite la medida con `evaluar:lectura` y se comprueba su precio.

### Lo demás, por cuenta

Céntimos al año: los PDF en S3 ocupan entre 0,15 y 1,1 MB cada uno; los correos de SES cuestan 0,10 $ cada 1.000; los datos de la base de datos son pequeños.

### Costes fijos

| | Durante la beta (sin cobros) | Con cobros |
| --- | --- | --- |
| Vercel | Hobby, gratis | **Pro, 20 $/mes** (incluye 20 $ de uso). Hobby no admite uso comercial |
| Neon | Gratis | Gratis mientras quepa; después, pago por uso sin mínimo |
| AWS (S3, SES y Bedrock) | Céntimos | Céntimos más la IA de cada factura |
| ImprovMX (soporte@) | Gratis | Gratis; 50 $/año si hay que responder como soporte@ |
| Dominio inquilinus.es | Renovación anual en DonDominio | Igual |
| Paddle | — | 5 % + 0,50 $ por cobro, ya descontado en el margen |

### Margen y cuándo se cubren los costes

Margen por suscripción tras el IVA y la comisión de Paddle (`docs/documento-arranque.md`): Plus, 3,37 € al mes o 38 € al año; Advanced, 7,26 € al mes o 77 € al año. A eso se le resta la IA, de 5 céntimos a 1 € al mes según el uso.

Con Vercel Pro (unos 18-19 € al mes) como único coste fijo relevante, se cubre con **unas 6 suscripciones Plus mensuales o 3 Advanced**. Esto no incluye la cuota de autónomos ni el gestor (tarea 8.1), que son con diferencia lo más caro.

## Qué vigilar

| Servicio | Límite actual | Señal | Qué hacer |
| --- | --- | --- | --- |
| **Bedrock** | Cuota por minuto de la cuenta, compartida por todas las usuarias | Avisos `lectura_ia_fallida` con `HTTP_429` en los registros de Vercel; subidas de facturas lentas | Pedir más cuota: Service Quotas, eu-north-1, «Cross-region model inference» de Haiku (tokens y peticiones por minuto). No cuesta dinero; tarda unos días |
| **Bedrock (coste)** | Pago por uso | Lo que marque Cost Explorer en Marketplace (Anthropic) | Alerta de AWS Budgets, por ejemplo de 5 € al mes |
| **Vercel** | Hobby: topes fijos de uso (por ejemplo, 1 millón de invocaciones y 4 h de CPU activa al mes); al pasarlos, se para hasta el mes siguiente | Pestaña Usage; avisos de Vercel por email | Pasar a Pro. Obligatorio antes del primer cobro (uso comercial) |
| **Neon** | Gratis: 1 GB de datos y 100 h de cómputo al mes por proyecto. Al pasarlos se para la base de datos o fallan las escrituras | Consola de Neon: almacenamiento y horas de cómputo | Pasar al plan de pago por uso antes de llegar al 80 % |
| **Amazon SES** | En modo de pruebas (*sandbox*) solo envía a direcciones verificadas, hasta 200 al día | Account dashboard de SES; tasa de rebotes (por encima del 5 %, AWS avisa) y de quejas (0,1 %) | Pedir acceso de producción **antes de la beta**; si suben los rebotes, revisar qué emails fallan |
| **S3** | Sin límite práctico | Tamaño de los buckets en la factura de AWS | Nada hasta muchos miles de PDF |
| **ImprovMX** | Gratis: 500 correos reenviados al día y no permite responder como soporte@ | Panel de ImprovMX | Plan Light (50 $/año) o un buzón propio (Zoho, DonDominio) |
| **Cortesías** | `PLAN_CORTESIA` en Vercel | Fechas de fin; la app avisa a cada propietaria 14 días antes | Renovar la fecha o avisar de que pasa a un plan de pago o a Starter |
| **Errores de la app** | — | En los registros de Vercel: `error_no_controlado`, `cobro_diario_fallido`, `bloqueo_fallido`, `plan_cortesia_erronea` | Mirar el código del error y arreglarlo |
| **Dominio** | Renovación anual | Fecha de caducidad en DonDominio | Renovar (mejor con renovación automática) |

## Revisión mensual (10 minutos)

1. **Vercel → Logs**: buscar `lectura_ia_fallida`, `error_no_controlado` y `cobro_diario_fallido` del último mes. Unos pocos `HTTP_429` sueltos no importan; si son frecuentes, pedir cuota.
2. **Vercel → Usage**: que nada pase del 80 % del plan.
3. **Neon → Usage**: almacenamiento y horas de cómputo por debajo del 80 %.
4. **AWS → Billing**: el gasto del mes (Bedrock aparece como Marketplace) y que la alerta de Budgets siga activa.
5. **SES → Account dashboard**: rebotes y quejas bajos.
6. **`PLAN_CORTESIA`**: cortesías que acaban el mes que viene.
7. **ImprovMX y DonDominio**: nada raro; fecha de renovación del dominio.

## Antes de abrir la beta a otras propietarias (7.4)

- [ ] **SES con acceso de producción**: en modo de pruebas, los emails de verificación a direcciones no verificadas no llegan y no podrían crear la cuenta.
- [ ] Alerta de **AWS Budgets**.
- [ ] Sus emails en `REGISTRO_INVITADOS` y en `PLAN_CORTESIA` (Production).
- [ ] Pedir más cuota de Bedrock si se espera que varias suban muchas facturas a la vez.

## Antes del primer cobro (8.5)

- [ ] **Vercel Pro**: Hobby no admite uso comercial.
- [ ] Revisar con la tabla de arriba que Neon y SES aguantan el número de cuentas previsto.

## Fuentes (consultadas el 25-11-2026)

- [Bedrock · Claude Haiku 4.5](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html) y [precios por región (AWS Japón)](https://aws.amazon.com/jp/blogs/news/amazon-bedrock-now-supports-japan-cross-region-inference)
- [Vercel · Precios](https://vercel.com/pricing), [plan Hobby](https://vercel.com/docs/plans/hobby) y [uso razonable](https://vercel.com/docs/limits/fair-use-guidelines)
- [Neon · Límites del plan gratuito](https://neon.com/faqs/free-plan-limits-and-quotas) y [planes](https://neon.com/docs/introduction/plans)
- [Amazon SES · Precios](https://aws.amazon.com/ses/pricing/) y [cuotas](https://docs.aws.amazon.com/general/latest/gr/ses.html)
- [Amazon S3 · Precios](https://aws.amazon.com/s3/pricing/)
- [Paddle · Precios](https://www.paddle.com/pricing)
- [ImprovMX · Precios](https://improvmx.com/pricing/)
