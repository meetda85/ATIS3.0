# ATIS 3.0 — Laboratorio de Torre

Sistema ATIS para laboratorio de torre de control. Se pega el METAR de la estación
(por ejemplo **MMMX**), el programa lo decodifica y llena automáticamente todos los
campos, se agregan los NOTAM vigentes —que también se decodifican— y se transmite
el mensaje en **bucle infinito: primero en español y después en inglés**.

No necesita instalar programas ni tener internet: es una página que se abre en el
navegador (Chrome o Edge, que son los que traen las voces).

## Instalar en la PC

1. Descargar el proyecto: en GitHub, botón verde **Code → Download ZIP**.
2. Descomprimir el ZIP (clic derecho → *Extraer todo*). **Importante**: hay que
   extraerlo, no trabajar dentro del ZIP.
3. Doble clic en **`INSTALAR.bat`**.
   Si Windows muestra el aviso azul de SmartScreen: *Más información → Ejecutar de todas formas*.

El instalador copia el programa a `%LOCALAPPDATA%\Programs\ATIS3.0` y crea dos accesos
directos en el Escritorio y en el Menú Inicio:

- **ATIS 3.0** — abre el programa en ventana propia, sin barra de direcciones.
- **ATIS 3.0 (con servidor)** — lo mismo, pero levantando el servidor local. Hace falta
  para la **voz neuronal** y para el **control remoto** desde otra computadora.

Al reinstalar no se pierde la voz neuronal ya descargada ni el último ATIS guardado.

Para quitarlo: **`DESINSTALAR.bat`**.

### Sin instalar

- **Probarlo sin más**: doble clic en `index.html`.
- **Llevarlo en USB o copiarlo a otra PC**: el archivo `dist/ATIS-3.0.html` lleva todo
  adentro (un solo archivo). Se copia donde sea y se abre con doble clic.

### Voz neuronal, sin internet (recomendado)

Es un motor de voz que vive en la propia computadora: **no usa internet ni las voces de
Windows**. El servidor genera el audio del ATIS una sola vez y el navegador lo reproduce
en bucle. Es la opción que mejor suena y la más estable para trabajar 24/7.

Instalación, una sola vez y con internet:

1. Abrir el ATIS con **SERVIDOR.bat** (la voz neuronal la genera el servidor).
2. En *Ajustes → Voz neuronal*, pulsar **Instalar la voz neuronal**. Baja el motor y dos
   voces (unos 170 MB) y las deja en la carpeta `voz` del programa. Tarda unos minutos y
   el avance se ve en la misma pantalla; se puede seguir trabajando mientras tanto.
3. Al terminar queda *lista* y ya es la que sale al aire: las voces de la barra inferior
   cambian a las neuronales.
4. De ahí en adelante no hace falta internet nunca más.

También se puede instalar sin abrir el programa, con **VOZ.bat**, que hace exactamente lo
mismo. Si la descarga se corta a medias, se vuelve a pulsar: lo ya bajado no se baja otra
vez.

Qué resuelve:

- **No depende de la red.** El audio se descarga a la memoria del navegador al pulsar
  TRANSMITIR; si después se cae la red, o el propio servidor, el bucle sigue sonando.
- **No depende de las voces de Windows.** Una PC sin voz en inglés transmite igual.
- **Suena idéntico todos los ciclos**, sin variaciones del motor del navegador.
- **El deslizador avanza por segundos de verdad**: &#9664;&#9664; y &#9654;&#9654; saltan
  diez segundos y la barra va a cualquier punto del ciclo.

Generar el audio tarda unos segundos la primera vez (unos 2 s por cada 30 s de locución) y
nada las siguientes: el resultado queda guardado en `voz/cache` con el nombre del resumen
del texto, así que mientras el ATIS no cambie no se vuelve a generar. *Vaciar audios
guardados* los borra si hiciera falta.

En *Ajustes → Voz neuronal*, **Motor de voz** decide cuál se usa:

| Opción | Qué hace |
|---|---|
| Automático | la neuronal si está instalada; si no, la del navegador. Es lo normal. |
| Siempre la voz neuronal | no cae a la del navegador salvo que la neuronal falle al generar |
| Siempre la voz del navegador | ignora la neuronal aunque esté instalada |

Si la voz neuronal falla justo al pulsar TRANSMITIR, el programa **sale al aire con la voz
del navegador** y lo dice; nunca se queda callado. Y si la carpeta `voz` no está instalada,
todo funciona como antes, con las voces del sistema.

**Si esa computadora no tiene internet**, la voz se instala a mano: en otra que sí tenga se
instala igual, y después se copia por memoria USB la carpeta `voz` entera —la que queda
junto a `index.html`—. Aquí se pega en el mismo lugar y se pulsa *Comprobar de nuevo*: el
programa la reconoce sola, no hay nada que configurar.

Otras voces: `node servidor/instalar-voz.js --voz-es es_MX-ald-medium --voz-en en_US-ryan-high`
(el catálogo está en <https://huggingface.co/rhasspy/piper-voices>; los nombres tienen la
forma `es_MX-voz-calidad`).

### Voces del sistema (si no se instala la neuronal)

Las voces las pone el sistema, no el programa, y de ahí depende que la locución suene
humana o metálica. *Ajustes → Voces del sistema* muestra el navegador, la conexión y
todas las voces que ve el programa: las marcadas con ★ son **naturales** (neuronales) y se
eligen solas. **Al hacer clic en cualquier voz se escucha** con una frase de ATIS y queda
seleccionada, así se comparan de oído antes de transmitir. El botón *Copiar diagnóstico*
deja en el portapapeles la lista completa, para pedir apoyo o comparar entre equipos.

- **Lo más rápido**: abrir el ATIS en **Microsoft Edge**. Trae voces naturales sin instalar
  nada — en español de México *Dalia* y *Jorge*; en inglés *Aria*, *Guy* o *Jenny*. Requieren
  conexión a internet. El instalador usa Edge si está disponible.
- **Sin internet**: instalar las voces naturales de Windows 11 en *Configuración →
  Accesibilidad → Narrador → Agregar voces naturales*, y agregar el idioma inglés en
  *Hora e idioma → Idioma y región*. Después reiniciar el navegador.
- Las voces cuyo nombre lleva *Desktop* son las antiguas de Windows: suenan robóticas
  por más que se baje la velocidad.
- **Si falta el idioma completo** (por ejemplo, ninguna voz en inglés), se instala en
  *Configuración → Hora e idioma → Idioma y región → Agregar idioma*, eligiendo el idioma
  y dejando marcada la casilla **Voz**. El programa desmarca solo el idioma sin voz en
  **Transmitir**, para no locutarlo con la voz del otro idioma.

Ajustes recomendados: velocidad **0.85–0.95**, pausa entre frases **250 ms**, pausa entre
idiomas **3 s**.

## Traer el METAR de la red

Hay dos maneras, y las dos las hace **el servidor**, no el navegador:

- **A mano**: el botón **Obtener en línea**, junto al recuadro del METAR. Trae el informe
  más reciente de la estación que esté seleccionada.
- **Automática**: *Ajustes → METAR automático*, que revisa cada cierto tiempo y avisa.

Las dos buscan primero en la **red AFTN del CAPMA**, que es la fuente operativa y la que
llega antes, y si de ahí no sale nada, en el servicio del **NOAA** (aviationweather.gov),
que publica el mismo METAR oficial con unos minutos más de retraso. El aviso dice de cuál
de las dos salió, y cuando fallan las dos dice qué contestó cada una, para saber dónde
está el problema.

> Esto **tiene** que pasar por el servidor. Los sitios de meteorología no autorizan que
> otra página los consulte —es la política de origen cruzado del navegador—, así que
> pedirlo directamente desde el navegador falla siempre, con un escueto *Failed to fetch*.
> Abierto sin servidor, el botón lo explica en lugar de dar ese error.

### El vigilante

Con el servidor andando, el ATIS puede vigilar la fuente y avisar cuando hay
un METAR nuevo. Se configura en *Ajustes → METAR automático*: dirección de la fuente
(por omisión `http://capma.mx/reportemetar/elegir_samx_3.php`), estación y cada cuántos
minutos revisar.

**Nunca cambia el ATIS por su cuenta.** Cuando aparece uno nuevo, la consola lo muestra
con dos botones: *Usar este METAR* y *Ahora no*. Al aceptarlo se llena el formulario, se
avanza la letra y —si se está transmitiendo— el cambio entra **al terminar el ciclo**.
Esa decisión es deliberada: un ATIS no debe cambiar solo mientras alguien lo está
escuchando.

El lector no depende de cómo esté armada la página: quita las etiquetas HTML y busca los
informes por su propio formato, así que sigue funcionando aunque al sitio le cambien el
diseño. Distingue METAR, SPECI y corregidos, y se queda con el más reciente de la estación.

Si el sitio no responde o deja de publicar, se avisa en pantalla y **la transmisión sigue**
con los últimos datos buenos.

El lector está probado contra la página real del CAPMA: de ahí salen los 65 informes de
las estaciones del país, y de esos se toma el de la estación configurada.

### Si no trae el METAR

En *Ajustes → METAR automático* hay un botón **Probar la conexión**. Lo hace el servidor y
prueba, una por una, las direcciones que el ATIS necesita: una cualquiera de internet, el
CAPMA, el NOAA, y las dos de donde se bajan las voces. Dice cuál responde, en cuántos
milisegundos, y cuál no, con el motivo.

Con eso se distingue de una vez lo que antes era un mismo error para todo:

| Lo que sale | Qué significa |
|---|---|
| Ninguna responde | esa computadora no tiene salida a internet |
| Responden unas sí y otras no | hay internet, pero el cortafuegos o el proxy del trabajo bloquea las demás |
| Todas responden pero el METAR no llega | el problema está en la página, no en la red |

La página del CAPMA arma la lista de todo el país en cada visita y puede tardar **más de
diez segundos**; el ATIS la espera hasta 45, porque esto va en segundo plano y nada se
detiene mientras tanto.

### El puerto

`SERVIDOR.bat` usa el puerto 8080. Si está ocupado no se queda atorado:

- **Si lo que está ahí es otro ATIS** (porque ya se había abierto antes), lo dice y abre
  esa misma dirección en lugar de levantar un segundo servidor.
- **Si lo ocupa cualquier otro programa**, se corre al siguiente puerto libre (8081, 8082…)
  y avisa en qué dirección quedó.

Solo si del 8080 al 8092 estuvieran todos ocupados pide elegir uno a mano
(`node servidor/servidor.js --puerto 9100`).

### El aviso de METAR nuevo

Cuando la vigilancia encuentra una observación nueva, **se pone encima de todo**: una
ventana al centro con el METAR crudo y, sobre todo, **qué cambia respecto a lo que está al
aire** — viento, visibilidad, altímetro, cielo, tiempo presente—, con lo importante
marcado en ámbar: una ráfaga que no estaba, la visibilidad que bajó de tres millas, un
fenómeno nuevo. Si es un SPECI, lo dice.

El título de la ventana del navegador también parpadea, para que se note aunque el ATIS
esté minimizado o en la otra pantalla.

Hay dos botones y ninguno hace nada por su cuenta:

- **Usar este METAR** llena el formulario, avanza la letra y —si se está transmitiendo— el
  cambio entra al terminar el ciclo.
- **Ahora no** cierra el aviso, pero el METAR se queda ofrecido en la barra de abajo: nadie
  pierde el dato por haber dicho que no. También cierra con `Esc` o haciendo clic afuera.

Hay una casilla para **avisar también con un sonido**, y viene **apagada a propósito**: en
la torre, la bocina de esa computadora es la que sale al aire, y un pitido encima del ATIS
sería peor que no avisar. Quien la encienda sabrá si en su instalación eso aplica.

## El guion se subraya mientras se locuta

Durante la transmisión, la pieza del guion que está sonando queda **resaltada**, y las que
ya se dijeron se apagan. Se ve de un vistazo por dónde va el mensaje, y el panel se
desplaza solo para que lo que suena quede siempre a la vista. Solo se subraya el idioma que
está al aire.

Los tiempos no son una estimación:

- **Con la voz neuronal**, el servidor sintetiza **una pieza por renglón** en una sola
  corrida de Piper, las une en un archivo y anota en qué segundo empieza y termina cada
  una. El subrayado cae exactamente donde cae la voz.
- **Con la voz del navegador**, se resalta el fragmento que se está locutando; cuando el
  motor avisa por dónde va dentro de la frase (Chrome lo hace con las voces instaladas),
  baja a la pieza exacta.

Las piezas son las mismas que arma el generador del guion, así que cada una es una frase
completa del ATIS. Copiar el guion sigue dando exactamente el mismo texto de siempre.

## NOTAM automáticos

Lo mismo que con el METAR: el servidor los trae y avisa, **sin meter nada al ATIS por su
cuenta**. Se configura en *Ajustes → NOTAM automáticos*. Hay dos caminos y se pueden tener
los dos; si el primero falla, entra el segundo.

### 1. La carpeta vigilada — sin registrarse en nada

Se sigue bajando el Excel de la página de la FAA como siempre, y el programa **levanta solo
el más reciente** de la carpeta que se le indique (normalmente `Descargas`). Se acabó el
«bajar, buscar el archivo, subirlo en la aplicación»: se baja y ya.

Prefiere los archivos que se llaman `fnsNotams_…`, y entre ésos el más nuevo; si no hay
ninguno, toma cualquier otra hoja de cálculo. El botón **Ver qué hay ahí** enseña qué
encontró, para no adivinar la ruta.

### 2. El servicio NMS de la FAA — la buena

Con esto ya no se baja ningún archivo: el servidor le pregunta directo al **NOTAM
Management Service** y contesta en menos de un segundo. Las credenciales se piden por
correo a **notams@faa.gov** y llegan en una hoja de cálculo donde el **KEY** es el
`client_id` y el **SECRET** el `client_secret`.

Cómo funciona por dentro:

1. Las llaves se cambian por un **pase** (bearer token) en `/v1/auth/token`, con
   `grant_type=client_credentials` y autenticación básica.
2. El pase dura **media hora**. Se guarda y se reusa; se renueva solo un minuto antes de
   caducar, así una revisión cada 30 minutos no pide un pase cada vez.
3. Con el pase se consulta `/nmsapi/v1/notams?location=MMMX` pidiendo **GEOJSON**, que trae
   el texto ICAO completo — el mismo que el decodificador ya sabe leer.

**El ambiente importa.** Hay tres y las credenciales sirven solo en el que las dieron:

| Ambiente | Dirección |
|---|---|
| Producción | `api-nms.aim.faa.gov` |
| Preproducción | `api-staging.cgifederal-aim.com` |
| Pruebas (FIT) | `api-fit.cgifederal-aim.com` |

Si no sabe cuál le tocó, el botón **Comprobar las llaves** las prueba en los tres, dice en
cuáles entran y deja seleccionado el que sirve.

**El secreto no sale de esa computadora**: se guarda en `servidor/notam.json` y la pantalla
nunca lo recibe de vuelta — solo se le dice si está puesto y los cuatro primeros y últimos
caracteres del `client_id`.

### Lo que no se transmite

El NMS devuelve también los **NOTAMC**, que no son información sino el aviso de que otro
NOTAM quedó cancelado; su texto («… NOTAM CNL») leído al aire no le dice nada a nadie. Se
usan para lo que sirven —borrar de la lista el NOTAM que cancelan— y se descartan. Lo mismo
con los **NOTAMR**: se queda el nuevo y se va el que reemplaza.

Con los NOTAM reales de MMMX eso son 32 que entrega la FAA y **23 que salen al aire**.

### Lo que no se hace, y por qué

La página `notams.aim.faa.gov/notamSearch` está detrás de una protección (Akamai) que
**bloquea a los programas**: contesta `403 Access Denied` a cualquier cosa que no sea una
persona con un navegador. Se podría disfrazar el programa de navegador, pero montar el ATIS
sobre algo que el otro lado trata de impedir es pedir que falle el día menos conveniente.
Por eso las dos rutas de arriba: una no depende de nadie, la otra es la que la propia FAA
publica para esto.

La API anterior, `external-api.faa.gov/notamapi/v1`, **ya no es el camino**: ese catálogo
no ofrece NOTAM API y la FAA movió el servicio al NMS.

### El botón, donde se trabaja

En la tarjeta de **NOTAM vigentes**, junto a *Cargar archivo del FNS*, está **Bajar de la
FAA**: los trae en el momento sin ir a Ajustes y sin archivos de por medio. Usa la estación
que esté arriba en la pantalla, y toma la fuente que haya configurada — el NMS si están las
llaves, o el último Excel de la carpeta.

Si no hay ninguna configurada, lo dice derecho en lugar de fallar en seco.

### Qué pasa cuando encuentra algo

Un aviso al centro de la pantalla con **los NOTAM que no están cargados**, ya decodificados
en español, y los que desaparecieron de la lista. Dos botones: *Cargar los NOTAM* —que los
agrega y marca los que son materia de ATIS, igual que la carga manual— o *Ahora no*.

La carga manual del Excel **sigue funcionando igual**; esto no la reemplaza, le quita el
trabajo.

## Control remoto desde otra computadora

La PC de la torre transmite; cualquier otra de la misma red puede alimentarle los datos.

1. En la PC de la torre, doble clic en **`SERVIDOR.bat`**. Abre el ATIS y deja una ventana
   negra con las direcciones. Esa ventana se queda abierta.
2. En la otra PC, abrir el navegador y escribir la dirección que mostró, por ejemplo
   `http://192.168.1.50:8080/`. Aparece el mismo programa.
3. Listo: lo que se escriba en cualquiera de las dos aparece en la otra.

Quien abre en `localhost` queda como **transmisor** (saca el audio); las demás quedan como
**control remoto** y su botón TRANSMITIR se deshabilita, para que el audio salga en un solo
lugar. El papel se cambia en *Ajustes → Control remoto*, donde además se ve quién está
conectado y si la torre está al aire.

**Los cambios entran al terminar el ciclo en curso**, nunca a media frase. Mientras tanto,
la consola avisa «Datos nuevos de …: entran al terminar el ciclo», con un botón *Aplicar
ahora* para no esperar.

**Si se cae la red o el servidor, la PC de la torre sigue al aire** con los últimos datos
recibidos. El enlace alimenta información; no manda sobre el audio. Esto está probado:
se mata el servidor y la transmisión continúa.

Requiere **Node.js** en la PC de la torre (solo ahí). Si no está, `SERVIDOR.bat` explica
las dos formas de ponerlo, incluida la que no instala nada. Sin Node, el ATIS funciona
igual que siempre; lo único que no hay es control remoto.

## Tres páginas, y una con clave

| Página | Quién entra | Qué hay |
|---|---|---|
| **Operación** | todos | el ATIS: METAR, NOTAM, guion, transmitir |
| **Ajustes** | todos | tema, velocidad de locución, voces, voz neuronal, registro |
| **Administración** | con clave | credenciales de la FAA, fuentes de datos, control remoto, estado |

La clave de fábrica es **0348** y se cambia desde la propia pantalla (de 4 a 12 cifras).
Mientras siga siendo la de fábrica, el programa lo dice —en la pantalla y en la ventana del
servidor— en lugar de callárselo.

### Qué protege de verdad, y qué no

Esto no es un candado pintado en la pantalla:

- **La clave vive en el servidor**, guardada en resumen (PBKDF2 con sal, 120 000 vueltas).
  No se puede leer de vuelta, y **nunca viaja a la pantalla**: mirar el código de la página
  no la revela.
- **Las rutas que cambian credenciales o fuentes exigen el pase.** Sin él el servidor
  contesta `403`, aunque se le hable directo saltándose la pantalla. Hay pruebas que fallan
  si alguna vez dejara de exigirlo.
- **Repetir claves equivocadas cuesta**: a los cinco fallos empieza una espera que se
  duplica. Cuatro cifras son diez mil combinaciones; a mano no se prueban, y con un
  programa tampoco vale la pena.
- **El secreto de la FAA nunca sale del servidor**, con clave o sin ella. Aun si alguien
  entrara, no se lo lleva.
- Al cambiar la clave **se cierran todas las sesiones**, aquí y en las computadoras de
  control remoto.
- Al recargar la página el candado **vuelve a estar puesto**; la sesión no se recuerda.

Dicho todo eso, con honestidad: esto es un laboratorio en una red local, no un banco. Una
clave de cuatro cifras detiene a quien no tiene por qué andar ahí; no detiene a alguien
decidido con acceso físico a esa computadora.

## Dos páginas

La aplicación está dividida en dos pestañas:

- **Operación** — todo lo que arma el ATIS: METAR, información, viento y ambiente,
  condición de cielo, NOTAM, información adicional y el guion. Es la que se usa al aire.
- **Ajustes** — lo que se configura una vez y se olvida: apariencia, velocidad y pausas de
  la locución, voces del sistema y el registro de la transmisión.

La consola de transmisión es fija y está en las dos: se puede cambiar de pestaña sin
interrumpir el bucle. La pestaña en la que se quedó se conserva al cerrar el programa.

## Uso rápido

1. Abrir **ATIS 3.0** desde el Escritorio (o `index.html` con doble clic).
2. Pegar el METAR en el cuadro 1 y pulsar **Decodificar y llenar** (o `Enter`).
   También está **Obtener en línea**, que consulta el METAR vigente de la estación.
3. Marcar la(s) pista(s) en uso y el tipo de aproximación.
4. Cargar los NOTAM en el cuadro 5 de la pestaña **Operación**. Hay dos caminos:
   - **Cargar archivo del FNS**: se elige la hoja de cálculo tal como se descarga
     (`fnsNotams_….xls`), sin abrirla ni convertirla a nada.
   - **Decodificar y agregar**: pegando el texto de uno o varios NOTAM.
   Quedan marcados para el aire solo los que corresponden al ATIS (pista, rodaje,
   iluminación, radioayudas); las posiciones de estacionamiento y las frecuencias se
   cargan pero no se transmiten. Cada uno se activa o desactiva con su casilla, y
   *Copiar los marcados* los deja en el portapapeles, un renglón cada uno.
5. Escribir lo que no venga en el METAR ni en los NOTAM en **Información adicional**
   (una idea por línea, en español y en inglés).
6. Pulsar **TRANSMITIR**. El bucle repite español → inglés indefinidamente hasta
   pulsar **STOP**.
7. Mientras está al aire, ese mismo botón pasa a **ACTUALIZAR**: pone la información de
   ahora en el aire **al terminar el ciclo en curso**, nunca a media frase. Con la voz
   neuronal el audio nuevo se genera mientras el viejo sigue sonando, así que el relevo
   no deja ni un segundo de silencio.

### Modo claro y oscuro

El botón de la esquina superior derecha alterna entre los dos, y en *Ajustes → Apariencia*
están las tres opciones: **Seguir al sistema**, **Claro** y **Oscuro**. La elección se
conserva al cerrar el programa; con *Seguir al sistema*, la aplicación cambia sola cuando
Windows pasa de claro a oscuro.

### Atajos de teclado

| Atajo | Acción |
|---|---|
| `Ctrl` + `Enter` | Transmitir / detener |
| `Esc` | Detener |
| `Enter` en el cuadro METAR | Decodificar |

## Qué decodifica

**METAR / SPECI**: estación, día y hora, `AUTO`/`COR`, viento (incluye `VRB`, calma,
rachas y variación `dddVddd`), visibilidad en millas terrestres —enteros y fracciones,
con `M` y `P`—, metros y `CAVOK`, RVR, fenómenos presentes y recientes con intensidad y
descriptor, capas de nubes con `CB`/`TCU`, visibilidad vertical, `NSC`/`NCD`/`SKC`/`CLR`,
temperatura y punto de rocío con valores negativos, altímetro en pulgadas (`A3039`) y
QNH en hectopascales (`Q1013`) con conversión entre ambos, cizalladura, tendencia y
comentarios. Los grupos que no reconoce los muestra como *sin decodificar* en lugar de
descartarlos en silencio.

**NOTAM**: formato ICAO completo (campos `Q)` `A)` `B)` `C)` `D)` `E)` `F)` `G)`), texto
libre, o la descarga del **FNS** (*FAA NOTAM Search*) en `.xls`, `.xlsx` o `.csv`. Del
código Q obtiene materia y condición (por ejemplo `QMRLC` → *pista · cerrada*) y con eso
decide cuáles van al aire. Expande las contracciones del Doc 8400 (`RWY`, `CLSD`, `WIP`,
`U/S`, `TWY`, `AVBL`, …) y **traduce al español** el texto en inglés del NOTAM
(`TWY B BTN RWY 23R AND TWY D USEFUL ONLY FOR ACFT B747-8` → *calle de rodaje B entre
pista 23 derecha y calle de rodaje D utilizable solamente para aeronave B747-8*).
Lo que no logra traducir queda en mayúsculas, para que se note a simple vista.

De la hoja del FNS toma además el número, el aeródromo y las fechas de vigencia: oculta
los que ya vencieron o todavía no empiezan, avisa si el archivo es de otra estación y no
duplica los que ya estaban cargados.

## Estructura del mensaje

Sigue el orden de la OACI: aeródromo e información, hora de la observación en UTC,
aproximación a esperar, pista(s) en uso, condición de pista, viento, visibilidad y causa,
RVR, condición de cielo, temperatura y punto de rocío, altímetro, cizalladura, NOTAM,
información adicional y el cierre *"…informe tener información X"*.

Los números se locutan como en radiotelefonía: los grupos aeronáuticos se deletrean
(`050` → «cero cinco cero», `3039` → «tres cero tres nueve»), la temperatura y el altímetro
van dígito por dígito (`22` → «dos dos») y las altitudes se leen como cantidad
(`2000 ft` → «dos mil pies»). La visibilidad se da en millas (`6SM` → «Visibilidad 6
millas»). La letra de información usa el alfabeto OACI y avanza sola cada vez que se
decodifica un METAR distinto al anterior.

La condición de cielo usa la cobertura en octas: `FEW` *pocas nubes* (1-2), `SCT` *nubes
dispersas* (3-4), `BKN` *cielo fragmentado* (5-7) y `OVC` *cielo cubierto* (8). El selector
de cada capa permite cambiarla, e incluye las variantes *Nublado a* y *Cerrado a*.

Los NOTAM y la información adicional van **un renglón cada uno, separados por comas**, para
poder leerlos y copiarlos; de los NOTAM se transmite solo la condición, nunca el número ni
las fechas de vigencia.

Los designadores con letra se locutan con el **alfabeto fonético OACI**: *calle de rodaje A4*
se lee «calle de rodaje Alfa cuatro», *calles de rodaje B9, C2 y B8* se lee «Bravo nueve,
Charli dos y Bravo ocho», y *PH* se lee «Papa Hotel». Solo se convierten las letras que
siguen a una palabra clave (*calle de rodaje*, *pista*, *umbral*, *plataforma*, *categoría*)
y los designadores de letra con dígitos, para que la «y» de una enumeración no se vuelva
«Yanki». Los tipos de aeronave se leen como en radio: *B747-8* → «Boeing siete cuatro siete
ocho». En pantalla el texto se conserva tal como viene en el NOTAM.

## Qué versión está instalada

Arriba a la izquierda, junto al nombre, está el número de versión (`v3.3`). Al pasarle el
ratón dice la fecha y qué trae. También aparece en *Ajustes → Estado del programa* y en la
ventana del servidor al arrancar. Sirve para responder de un vistazo a «¿se actualizó o
no?»: si la pantalla no cambió después de actualizar, ese número lo dice.

Para actualizar: extraer el ZIP nuevo y ejecutar **`INSTALAR.bat`** desde la carpeta
extraída. Conserva la carpeta `voz` y el último ATIS guardado.

## Archivos

```
INSTALAR.bat          instalador para Windows
SERVIDOR.bat          arranca el servidor de control remoto
servidor/servidor.js  servidor local: sirve la app y guarda el estado compartido
servidor/fuente-metar.js  lectura del METAR desde la página del CAPMA
servidor/admin.js         la clave de la pagina de administracion
servidor/fuente-notam.js  NOTAM desde el NMS de la FAA o desde una carpeta vigilada
servidor/voz-piper.js     voz neuronal local: genera el audio y lo guarda
servidor/instalar-voz.js  descarga el motor y las voces neuronales
VOZ.bat               instala la voz neuronal (una sola vez, con internet)
voz/                  motor y voces neuronales (no viaja en el repositorio)
DESINSTALAR.bat       desinstalador
install/              scripts del instalador
index.html            interfaz
css/styles.css        tema oscuro de torre
js/data/dictionary.js códigos METAR, contracciones y códigos Q de NOTAM
js/data/airports.js   aeródromos, pistas y nivel de transición (editable)
js/lib/numbers.js     locución de números, alfabeto OACI y designadores de pista
js/metar.js           decodificador METAR
js/notam.js           decodificador y traductor de NOTAM
js/fns.js             lectura de la descarga del FNS
js/enlace.js          sincronización con el servidor (control remoto)
js/vendor/            librería para leer hojas de cálculo (SheetJS, licencia Apache 2.0)
js/atis.js            modelo de observación y generación del guion ES/EN
js/version.js         numero de version, en un solo lugar
js/speech.js          motor de voz del navegador y su bucle
js/voz-neural.js      bucle con la voz neuronal: descarga el audio y lo reproduce
js/app.js             interfaz y control
test/test.js          pruebas (node test/test.js)
test/test-admin.js        pruebas de la clave de administracion
test/test-notam.js        pruebas de los NOTAM automaticos
test/test-voz-neural.js   pruebas de la voz neuronal y sus rutas del servidor
test/test-bucle-neural.js pruebas del bucle con voz neuronal frente a fallas
test/fixtures/        descarga real del FNS usada en las pruebas
build/build.js        genera dist/ATIS-3.0.html (un solo archivo)
dist/ATIS-3.0.html    version portable, todo en un archivo
assets/atis.ico       icono del acceso directo
```

Para agregar un aeródromo basta con añadirlo en `js/data/airports.js` con su nombre en
español e inglés, sus pistas y su nivel de transición.

## Pruebas

```bash
node test/test.js               # decodificadores y generación del guion
node test/test-voz.js           # el bucle del navegador frente a fallas de voz y de red
node test/test-bucle-neural.js  # el bucle con voz neuronal frente a fallas
node test/test-servidor.js      # el servidor de control remoto
node test/test-admin.js         # la clave de administracion
node test/test-notam.js         # los NOTAM automaticos
node test/test-voz-neural.js    # la voz neuronal y sus rutas del servidor
npm test                        # todas
```

Las pruebas de síntesis se omiten solas si la carpeta `voz` no está instalada, así que
`npm test` corre igual en una computadora sin la voz neuronal.

## Antes de transmitir

Al pulsar **TRANSMITIR**, el programa revisa lo que va a salir al aire y detiene el primer
intento si encuentra algo: falta la pista en uso, la hora, el viento, el altímetro o la
visibilidad; la observación tiene más de una hora; hay NOTAM marcados fuera de vigencia; o
un idioma marcado sin voz instalada. Un ATIS completo no genera ningún aviso, así que esto
no estorba en la operación normal. Lo que es un **error** (ningún idioma, texto libre
vacío, voz faltante) no se puede forzar; lo demás sale con *Transmitir de todos modos*.

En la consola, a la derecha, está siempre a la vista el resumen de lo que se transmite:
letra, pista en uso, viento, visibilidad, altímetro y hora de la observación. La hora se
pone en ámbar cuando la observación pasa de una hora.

## Texto libre

La tarjeta **7** agrega un texto propio **al final del ATIS**, justo antes de la frase de
cierre: aeropuerto cerrado, una emergencia, una prueba del sistema. Se escribe en español
y en inglés, se marca la casilla y aparece en el guion del cuadro 8, así que se ve antes de
transmitir. Usa las mismas reglas de locución que el resto (designadores en alfabeto
fonético, números dígito por dígito, frecuencias con «punto»). Mientras está activado, la
tarjeta se marca en ámbar para que no se olvide encendido.

## Pista en uso

Los botones incluyen el designador **sin lado** —`05`, `23`— además de cada pista por
separado. Marcar `05` anuncia «Pista en uso 05», que significa las dos pistas de esa
dirección; marcar `05L` anuncia «Pista en uso 05 izquierda». No pueden convivir: al marcar
el designador sin lado se quitan sus pistas individuales, y al revés.

## Adelantar y retroceder

Durante la transmisión, la consola muestra la posición dentro del ciclo.

- **Con la voz neuronal**, la barra avanza **por segundos**: &#9664;&#9664; y
  &#9654;&#9654; saltan diez segundos y la barra va a cualquier punto del ciclo, con el
  tiempo a la vista (`0:18 / 1:06`).
- **Con la voz del navegador**, la Web Speech API no permite buscar dentro de una frase,
  así que el salto es **por fragmento**: se corta la frase actual y arranca la elegida.

## La transmisión no se detiene

Una vez pulsado **TRANSMITIR**, el bucle se mantiene pase lo que pase:

- **Un fragmento que falla se reintenta**, hasta tres veces, antes de darlo por perdido.
- **Si se cae la red**, las voces en línea dejan de responder: al primer reintento el
  programa pasa solo a una voz instalada en el equipo y sigue transmitiendo. La barra
  inferior indica con qué voz de respaldo está saliendo.
- **Si el motor de voz se cuelga**, una vigilancia de arranque lo detecta en dos segundos
  y medio —no espera a que se agote la duración del fragmento— y lo reinicia.
- **Si un idioma falla repetidamente** (por ejemplo, se perdió la voz en inglés), se omite
  ese idioma durante el ciclo, se avisa en pantalla y se vuelve a intentar en el siguiente:
  el otro idioma nunca deja de salir al aire.
- **Si todo falla**, espera cinco segundos y vuelve a empezar, en lugar de girar en vacío.
- Un latido cada dos segundos mantiene viva la síntesis (Chrome la corta a los 15 s) y
  reanuda la transmisión si detecta que se quedó en silencio.

- **La pantalla no se apaga** mientras se transmite (bloqueo de suspensión del navegador),
  y al volver la ventana al frente se verifica que el motor siga hablando; si no, se reanuda.
- **Una voz en línea lenta no se corta**: si el motor todavía tiene el fragmento en cola,
  la vigilancia le da prórrogas en lugar de cancelarlo. Solo lo da por muerto cuando el
  motor no tiene nada pendiente ni está hablando.

### Con la voz neuronal

El bucle es aún más difícil de tumbar, porque el audio ya no se genera mientras suena:

- **El audio vive en la memoria del navegador.** Se descarga entero al pulsar TRANSMITIR.
  A partir de ahí se puede caer la red, apagarse el servidor o desconectarse el cable: el
  bucle sigue dando vueltas con el mismo audio.
- **Si un idioma no se puede generar**, el otro sale igual y la pantalla dice cuál faltó.
- **Si el audio se cuelga**, un latido cada dos segundos lo detecta —la posición dejó de
  avanzar— y lo empuja; si no reacciona, lo reintenta y después lo omite, sin parar el ciclo.
- **Si el navegador bloquea el audio** (política de reproducción automática), queda
  anotado en el registro y el ciclo avanza en lugar de quedarse trabado.
- **Si la generación falla al pulsar TRANSMITIR**, se sale al aire con la voz del
  navegador y se avisa. Nunca se queda callado.
- **Los datos nuevos siguen esperando el corte entre ciclos**, igual que antes: nada entra
  a media frase.

Todo esto está cubierto por `test/test-voz.js` y `test/test-bucle-neural.js`, que montan
un motor de voz y un navegador simulados y provocan las fallas: caída de red, servidor
caído a media transmisión, voz que no responde, motor muerto, audio bloqueado, voz lenta y
recuperación.

### Registro de la transmisión

La pestaña **Ajustes** lleva la bitácora de lo que sale al aire: cada fragmento con su voz, su
longitud y lo que tardó, y en rojo las fallas con su motivo (`synthesis-failed`,
`network`, `no inició`, `sin respuesta`). Si la transmisión se interrumpe, ahí queda la
causa. El botón *Copiar registro* lo deja en el portapapeles junto con el navegador y la
hora, para revisarlo o mandarlo.

## Notas de operación

- El guion y los NOTAM se guardan en el navegador; al volver a abrir la página queda todo como estaba.
- Si se edita algo durante la transmisión, el bucle sigue con el texto anterior hasta
  que se pulsa **ACTUALIZAR**; el cambio entra en el corte del ciclo, nunca a media frase.
- La velocidad, la pausa entre idiomas y la voz de cada idioma se ajustan en la barra inferior.
- Las voces dependen del sistema operativo. En Windows se agregan en
  *Configuración → Hora e idioma → Voz*.
- Es material para laboratorio y entrenamiento; no sustituye al ATIS operativo.
