# ATIS 3.0 — Laboratorio de Torre

Sistema ATIS para laboratorio de torre de control. Se pega el METAR de la estación
(por ejemplo **MMMX**), el programa lo decodifica y llena automáticamente todos los
campos, se agregan los NOTAM vigentes —que también se decodifican— y se transmite
el mensaje en **bucle infinito: primero en español y después en inglés**.

No requiere instalación, servidor ni conexión a internet: es una página HTML que se
abre directamente en el navegador (Chrome o Edge, que son los que traen voces de
síntesis en español e inglés).

## Uso rápido

1. Abrir `index.html` con doble clic (o `npm start` para servirlo en `http://localhost:8080`).
2. Pegar el METAR en el cuadro 1 y pulsar **Decodificar y llenar** (o `Enter`).
   También está **Obtener en línea**, que consulta el METAR vigente de la estación.
3. Marcar la(s) pista(s) en uso y el tipo de aproximación.
4. Pegar los NOTAM vigentes en el cuadro 5 y pulsar **Decodificar y agregar**.
   Cada NOTAM se puede activar o desactivar para la transmisión con la casilla *transmitir*.
5. Escribir lo que no venga en el METAR ni en los NOTAM en **Información adicional**
   (una idea por línea, en español y en inglés).
6. Pulsar **TRANSMITIR**. El bucle repite español → inglés indefinidamente hasta
   pulsar **STOP**.

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

**NOTAM**: formato ICAO completo (campos `Q)` `A)` `B)` `C)` `D)` `E)` `F)` `G)`) o texto
libre. Del código Q obtiene materia y condición (por ejemplo `QMRLC` → *pista · cerrada*),
expande las contracciones del Doc 8400 (`RWY`, `CLSD`, `WIP`, `U/S`, `TWY`, `AVBL`, …) en
español y en inglés, y convierte las fechas a lenguaje claro.

## Estructura del mensaje

Sigue el orden de la OACI: aeródromo e información, hora de la observación, aproximación
en servicio, pista(s) en uso, condición de pista, nivel de transición, viento, visibilidad
y causa, RVR, condición de cielo, temperatura y punto de rocío, altímetro, cizalladura,
NOTAM, información adicional y el cierre *"…informe tener información X"*.

Los números se locutan como en radiotelefonía: los grupos aeronáuticos se deletrean
(`050` → «cero cinco cero», `3039` → «tres cero tres nueve») y las altitudes se leen como
cantidad (`2000 ft` → «dos mil pies»). La letra de información usa el alfabeto OACI y
avanza sola cada vez que se decodifica un METAR distinto al anterior.

## Archivos

```
index.html            interfaz
css/styles.css        tema oscuro de torre
js/data/dictionary.js códigos METAR, contracciones y códigos Q de NOTAM
js/data/airports.js   aeródromos, pistas y nivel de transición (editable)
js/lib/numbers.js     locución de números, alfabeto OACI y designadores de pista
js/metar.js           decodificador METAR
js/notam.js           decodificador NOTAM
js/atis.js            modelo de observación y generación del guion ES/EN
js/speech.js          motor de voz y bucle
js/app.js             interfaz y control
test/test.js          pruebas (node test/test.js)
```

Para agregar un aeródromo basta con añadirlo en `js/data/airports.js` con su nombre en
español e inglés, sus pistas y su nivel de transición.

## Pruebas

```bash
node test/test.js     # o: npm test
```

## Notas de operación

- El guion y los NOTAM se guardan en el navegador; al volver a abrir la página queda todo como estaba.
- Si se edita algo durante la transmisión, el bucle sigue con el texto anterior hasta
  que se pulsa **TRANSMITIR** otra vez.
- La velocidad, la pausa entre idiomas y la voz de cada idioma se ajustan en la barra inferior.
- Las voces dependen del sistema operativo. En Windows se agregan en
  *Configuración → Hora e idioma → Voz*.
- Es material para laboratorio y entrenamiento; no sustituye al ATIS operativo.
