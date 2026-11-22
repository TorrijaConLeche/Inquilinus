# 006 · Timeline del inmueble

Estado: aprobada · Paquetes: `apps/web` (componente compartido), `packages/domain` (posiciones y desgloses)

## Objetivo

Un timeline horizontal donde se ve de un vistazo, sobre un eje de días, el alquiler, cada tipo de gasto y la estancia de cada inquilino. Es la pieza central de la transparencia: explica por qué cada uno paga lo que paga. El mismo componente se usa en dos vistas:

- **Propietaria:** detalle del inmueble (pantalla 2).
- **Inquilino:** su enlace (spec 004), con su fila resaltada.

## Reglas

**Estructura**

- **R1** — Eje horizontal de días en la parte inferior, con una rayita por día. Las rayitas del día 1 y del 15 son más largas y llevan etiqueta ("1 sep", "15 sep").
- **R2** — Filas, de arriba abajo: Alquiler; una fila por tipo de gasto (en orden de creación); una fila por inquilino. Las etiquetas de fila se quedan fijas a la izquierda al desplazarse.
- **R2b** — Los tipos de gasto archivados solo tienen fila si tienen alguna factura repartida. Hay una fila por cada inquilino que ha tenido alguna estancia en el inmueble, también los que ya se fueron.
- **R3** — **Alquiler**: una chincheta por cobro, en su fecha de cobro (spec 005; por defecto el día de cobro del inmueble, o la fecha a la que se haya movido), con su importe.
- **R3b** — Los cobros con la misma fecha (los de varios inquilinos de un mes) van en una sola chincheta con la suma de sus importes; su estado de pago es el del grupo (R10). Los cobros quitados no aparecen.
- **R4** — **Factura**: una barra desde el inicio hasta el fin de su periodo, con su importe dentro.
- **R4b** — Solo aparecen las facturas repartidas. Si dos facturas del mismo tipo se solapan (spec 003 lo permite confirmándolo), van en carriles distintos dentro de su fila.
- **R5** — **Inquilino**: una línea desde la entrada hasta la salida, con un punto verde en la entrada y uno rojo en la salida, cada uno con su fecha. Sin salida, la línea llega hasta el borde derecho. Si un inquilino tiene varias ocupaciones, se dibuja un tramo por cada una.
- **R6** — Zoom: mes (rayita por día), trimestre (por semana) y año (por mes). Se desliza en horizontal, también en el móvil. Por defecto se muestra el mes en curso y el anterior.
- **R6b** — De una vez se ven unos dos meses con el zoom mes, unos seis con trimestre y unos doce con año. El eje va desde el primer mes con datos (o el anterior al actual, si es antes) hasta el último mes con datos (o el actual, si es después); si así no llena lo que se ve de una vez, empieza meses antes. Con trimestre y año, el día 1 de cada mes lleva etiqueta, y el importe y el estado de las chinchetas van en dos líneas y en corto («1/3»).
- **R6c** — Zoom libre: con **Ctrl + rueda** del ratón, o pellizcando en el trackpad o en la pantalla táctil, se acerca o aleja de forma continua, entre unas dos semanas y unos dos años de una vez, sin mover el día que queda bajo el ratón o entre los dedos. La rueda sola sigue desplazando la página. Las rayitas y el formato corto son los del zoom más cercano: hasta unos cuatro meses de una vez (120 días), los del mes; hasta unos nueve (270 días), los del trimestre; con más, los del año. Junto a los botones de zoom, una pista lo explica.

**Colores**

- **R7** — Cada tipo de gasto tiene un color de una paleta fija de ocho (ámbar, azul, violeta, rosa, turquesa, oliva, coral y granate; ver `docs/estilo.md`), que la usuaria elige al crearlo (por defecto, el primero libre). El alquiler tiene un color reservado, un gris neutro, que no se puede elegir para gastos.
- **R7b** — Se puede elegir un color que ya usa otro tipo de gasto activo del inmueble: el selector lo marca con el nombre de quien lo usa («lo usa Luz»). Con los ocho ocupados, el color por defecto vuelve a empezar por el principio.
- **R8** — Un tipo de gasto conserva su color en todas partes (timeline, lista, modales, vista del inquilino) hasta que la usuaria lo cambie.
- **R9** — El color nunca es lo único que transmite información: cada fila tiene su nombre y los estados llevan texto o icono.

**Estado de pago**

- **R10** — En cada chincheta de alquiler y cada barra de factura. Propietaria: ✓ si todos han pagado; si no, "2/3 pagado". Inquilino: ✓ si él ha pagado su parte.

**Al pulsar**

- **R11** — Al pulsar una **chincheta de alquiler** se abre una ventana con el desglose del mes:
  - Propietaria: por cada inquilino, su habitación, renta, recargo por vacíos con su explicación ("H3 vacía del 1 al 10, repartida entre 2"), importe, y pagado (con fecha) o pendiente, con un botón para marcarlo como pagado. Debajo, lo que asume la propietaria y el total.
  - Inquilino: solo su propia línea, con la misma explicación. No ve importes ni pagos de los demás (spec 004, R7b).
- **R12** — Al pulsar una **factura** se abre una ventana con: tipo, periodo, importe total, detalle del cálculo por tramos (spec 004, R7) y reparto por inquilino.
  - Propietaria: cada inquilino con su parte y pagado (con fecha) o pendiente; botón para descargar el PDF siempre.
  - Inquilino: su parte y su estado; botón para descargar el PDF solo si la descarga está habilitada (spec 004, R2b).
- **R13** — Debajo del timeline, una lista con los mismos movimientos (lo más reciente primero), incluidas las liquidaciones (spec 011, R14). Al pulsar un elemento se abre su ventana de detalle.

## Casos de prueba

Con los datos del caso C4 de la spec 002 (modo entero; A en H1 y B en H2 todo septiembre; C en H3 desde el 11) y una factura de luz del 1 al 30 de septiembre de 90 €.

| # | Caso | Resultado esperado |
| --- | --- | --- |
| C1 | Orden de filas (R2) | Alquiler, Luz, A, B, C |
| C2 | Barra de factura (R4) | Luz ocupa del 1 al 30 de septiembre con "90 €" |
| C3 | Línea de inquilino (R5) | C empieza el 11 con punto verde y "entra 11 sep"; A y B llegan al borde |
| C4 | Alquiler, propietaria (R11) | A 550 € (500 + 50), B 450 € (400 + 50), C 200 €; explicación "H3 vacía del 1 al 10, repartida entre 2"; estado de pago de cada uno |
| C5 | Alquiler, inquilino (R11) | En el enlace de A, solo su línea: 500 + 50 = 550 €, con la explicación; sin importes de B ni de C |
| C6 | Factura, propietaria (R12) | Tramos del cálculo, reparto por inquilino con estado de pago y botón de descarga |
| C7 | Factura, inquilino sin descarga (R12) | Con la descarga deshabilitada, no aparece el botón |
| C8 | Colores (R7, R8) | "Luz" se ve del mismo color en timeline, lista, ventana y enlace del inquilino |
| C9 | Color por defecto (R7) | Un tipo nuevo recibe el primer color libre, nunca el del alquiler |
| C10 | Zoom año (R6) | Rayitas por mes y etiquetas de mes |
| C11 | Relevo (R5) | En H1, A sale el 15 y B entra el 15: dos líneas que se tocan el día 15 |
| C12 | Estado parcial (R10) | Si 2 de 3 han pagado la luz, la barra muestra "2/3 pagado" |
| C14 | Chincheta agrupada (R3b) | Los cobros de A, B y C del 1 de octubre son una chincheta con la suma; si solo A ha pagado, "1/3 pagado" |
| C15 | Facturas solapadas (R4b) | Dos facturas de luz que se solapan van en dos carriles de la fila Luz |
| C13 | Color repetido (R7b) | Al crear "Agua", el color de Luz aparece marcado "lo usa Luz" y se puede elegir |
| C16 | Zoom libre (R6c) | Con 120 días de una vez, rayitas por día; con 121, por semana; con 271, por mes. Nunca menos de 14 ni más de 730 días |

## Fuera de alcance

- Arrastrar elementos para cambiar fechas desde el timeline.
- Exportar el timeline como imagen o PDF.

## Tareas

- [x] Funciones de dominio para el desglose del alquiler con explicación de vacíos (R11)
- [x] Componente de timeline compartido (propietaria e inquilino): en la ficha del inmueble; el enlace del inquilino lo usará en la tarea 6.5
- [x] Ventanas de detalle de alquiler y de factura (propietaria; las del inquilino, con la tarea 6.5)
- [x] Lista de movimientos (sustituida por las últimas actividades del histórico, spec 012)
- [ ] Zoom libre con Ctrl + rueda y pellizcando (R6c, C16)
- [x] Paleta de colores de gasto (clara y oscura) y color del alquiler
- [x] Selector de color al crear un tipo de gasto y al editarlo
- [ ] Tests C1–C12
