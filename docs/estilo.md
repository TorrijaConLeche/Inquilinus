# Estilo visual e idiomas

Estado: aprobado

## Nombre

**Inquilinus** (del latín, "inquilino"). Marca comprobada en OEPM y EUIPO (tarea 1.1). Dominio: `inquilinus.es`; `inquilinus.com` está ocupado y la alternativa se decide en la tarea 6.9 (el dominio se registra al final de la fase 6).

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
- Los colores de los tipos de gasto del timeline (spec 006) son una paleta aparte, distinta de `primario` y del color reservado al alquiler. Se define al implementar la spec 006, con versión clara y oscura.
- Estados: éxito, aviso y error con sus propios tokens, siempre acompañados de texto o icono (spec 006, R9).

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
