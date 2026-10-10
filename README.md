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
2. Ejecutar **VOZ.bat**. Descarga el motor y dos voces (unos 170 MB) y las deja en la
   carpeta `voz` del programa.
3. En *Ajustes → Voz neuronal* pulsar **Comprobar de nuevo**. Cuando diga *lista*, ya es
   la que sale al aire: las voces de la barra inferior cambian a las neuronales.
4. De ahí en adelante no hace falta internet nunca más.

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

## METAR automático desde el CAPMA

Con el servidor andando, el ATIS puede vigilar la red AFTN del CAPMA y avisar cuando hay
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

Esto necesita el servidor porque el navegador, por sí solo, no puede leer otro sitio
(se lo impide la política de origen cruzado). El servidor sí, y además la PC de la torre
alcanza `capma.mx` sin problema aunque sea por `http`.

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

## Archivos

```
INSTALAR.bat          instalador para Windows
SERVIDOR.bat          arranca el servidor de control remoto
servidor/servidor.js  servidor local: sirve la app y guarda el estado compartido
servidor/fuente-metar.js  lectura del METAR desde la página del CAPMA
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
js/speech.js          motor de voz del navegador y su bucle
js/voz-neural.js      bucle con la voz neuronal: descarga el audio y lo reproduce
js/app.js             interfaz y control
test/test.js          pruebas (node test/test.js)
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
