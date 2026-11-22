# Estilo visual e idiomas

Estado: aprobado

## Nombre

**Inquilinus** (del latín, "inquilino"). Marca comprobada en OEPM y EUIPO (tarea 1.1). Dominio: `inquilinus.es` (registrado en DonDominio); la dirección de la app es `https://www.inquilinus.es` y `inquilinus.es` redirige a ella. En textos y en el logo la marca se escribe «inquilinus.es». `inquilinus.com` está ocupado y la alternativa se decide en la tarea 6.9.

## Tono

Amable, serio y moderno. La app habla claro y sin tecnicismos, transmite calma con el dinero y nunca culpa a nadie ("Pendiente", no "Impagado").

## Paleta: Salvia

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `primario` | `#2F7D6B` | `#5CC0A6` | Botones, enlaces, elementos activos |
| `primario-suave` | `#E6F2EE` | `#24433B` | Fondos de etiquetas y avisos suaves |
| `primario-texto` | `#1E5447` | `#BFEBDD` | Texto sobre `primario-suave` |
| `acento` | `#E9B872` | `#E9B872` | Detalles puntuales, nunca texto |
| `fondo` | `#F7F6F2` | `#141A18` | Fondo de página |
| `superficie` | `#FFFFFF` | `#1C2421` | Tarjetas y ventanas |
| `texto` | `#1F2A27` | `#EEF3F1` | Texto principal |
| `texto-suave` | `#5E6B67` | `#9DAEA8` | Texto secundario |
| `borde-fuerte` | `texto` al 28 % | `texto` al 28 % | Bordes de campos y botones secundarios |
| `sobre-primario` | = `superficie` | = `superficie` | Texto sobre `primario` |
| `error` | `#B3403A` | `#F2A49C` | Textos y bordes de error |
| `error-suave` | `#FBECEB` | `#3A2422` | Fondo de los avisos de error |

- El texto sobre `primario` es `superficie` (blanco en claro). El contraste cumple WCAG AA.
- Los colores de los tipos de gasto (spec 006, R7) son una paleta aparte, distinta de `primario` y del color reservado al alquiler. Ver «Colores de gasto».
- Estados: éxito, aviso y error con sus propios tokens, siempre acompañados de texto o icono (spec 006, R9).

## Colores de gasto

Cada color tiene dos tokens: `gasto-<color>` (puntos, bordes y marcas) y `gasto-<color>-suave` (relleno de barras y etiquetas, con `texto` encima). El alquiler usa `alquiler` y `alquiler-suave`, un gris neutro que no se ofrece para gastos.

| Color | Claro | Claro suave | Oscuro | Oscuro suave |
| --- | --- | --- | --- | --- |
| `ambar` | `#B7791F` | `#FBEFD9` | `#E3A94F` | `#3A2E19` |
| `azul` | `#3B6FC4` | `#E3ECFA` | `#7FA6EB` | `#1F2C44` |
| `violeta` | `#7B5CC4` | `#EEE8FA` | `#AE95EE` | `#2D2544` |
| `rosa` | `#C2477F` | `#FAE6EF` | `#EB8DB7` | `#42232F` |
| `turquesa` | `#1C8EA6` | `#DDF2F6` | `#5CC3D8` | `#17363D` |
| `oliva` | `#7C8B2B` | `#EFF2DC` | `#B9C85E` | `#2F3319` |
| `coral` | `#D0603F` | `#FCE8E1` | `#F09A7E` | `#43271F` |
| `granate` | `#9B2C45` | `#F6E1E6` | `#E5606E` | `#45191E` |
| `alquiler` | `#6B7270` | `#ECEDEC` | `#A7AFAC` | `#2A302E` |

- Los colores fuertes contrastan al menos 3:1 con `superficie` (elementos gráficos, WCAG 1.4.11); `texto` sobre cada `-suave` contrasta al menos 4,5:1. Lo comprueba un test de la web.
- El color nunca va solo: siempre acompaña al nombre del tipo de gasto (spec 006, R9).

## Modo oscuro

Desde el MVP. Sigue por defecto el ajuste del dispositivo y se puede fijar en los ajustes. Todos los colores se usan a través de tokens; nunca valores sueltos en los componentes.

## Tipografía

- **Figtree** (Google Fonts, autoalojada), pesos 400 y 600.
- Cifras tabulares (`font-variant-numeric: tabular-nums`) en importes y tablas, para que las columnas se alineen.

## Forma

Esquinas redondeadas (8 px en controles, 12 px en tarjetas, 16 px en ventanas), bordes finos, sin sombras marcadas ni degradados.

## Idiomas

- Desde el MVP, la app está en **español** e **inglés**. El español es el idioma por defecto.
- Ningún texto de interfaz va escrito directamente en los componentes: todos salen de los ficheros de traducción (`es`, `en`).
- Fechas, importes y números se formatean según el idioma (`1.030,45 €` en español, `€1,030.45` en inglés). La moneda es siempre el euro.
- La propietaria elige su idioma en los ajustes (por defecto, el del navegador).
- La vista del inquilino (spec 004) usa el idioma de su navegador y tiene un selector es/en.
- Los nombres que crea la usuaria (inmuebles, habitaciones, tipos de gasto) no se traducen.
- El código y los nombres de dominio siguen en español.
