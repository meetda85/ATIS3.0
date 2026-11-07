/* Pruebas de la pantalla (node test/test-pantalla.js)
 *
 * Abren index.html en un navegador de verdad y comprueban lo que no se puede
 * ver desde Node: que las tarjetas no dejen huecos, que la pista en uso
 * aguante un METAR nuevo y que «Ir a corregir» lleve de campo en campo.
 *
 * Necesitan Playwright, que solo está en la computadora donde se desarrolla.
 * Si no está, la prueba se omite sola y la suite sigue corriendo igual en la
 * computadora de la torre.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const PAGINA = 'file://' + path.join(RAIZ, 'index.html');

function cargarPlaywright() {
  const sitios = ['playwright', '/opt/node22/lib/node_modules/playwright',
    '/usr/lib/node_modules/playwright'];
  for (const s of sitios) {
    try { return require(s); } catch (e) { /* se prueba el siguiente */ }
  }
  return null;
}

let correctas = 0, fallidas = 0;
function ok(nombre) { correctas++; console.log('  ok   ' + nombre); }
function mal(nombre, e) { fallidas++; console.log('  FALLA ' + nombre + '\n        ' + e.message); }
async function prueba(nombre, fn) {
  try { await fn(); ok(nombre); } catch (e) { mal(nombre, e); }
}

/* Voces fingidas: en el navegador de pruebas no hay ninguna instalada */
function vocesFingidas() {
  const voces = [
    { name: 'Microsoft Dalia Online (Natural) - Spanish (Mexico)', lang: 'es-MX', localService: false },
    { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', localService: false }
  ];
  window.speechSynthesis.getVoices = () => voces;
  window.speechSynthesis.speak = (u) => setTimeout(() => u.onend && u.onend(), 10);
  try { localStorage.clear(); } catch (e) { /* sin almacenamiento */ }
}

async function abrir(navegador) {
  const p = await navegador.newPage({ viewport: { width: 1600, height: 1000 } });
  const errores = [];
  p.on('pageerror', e => errores.push(e.message));
  await p.addInitScript(vocesFingidas);
  await p.goto(PAGINA);
  await p.waitForTimeout(500);
  p.erroresJS = errores;
  return p;
}

async function main() {
  const pw = cargarPlaywright();
  if (!pw) {
    console.log('\nPantalla: omitida (no hay Playwright en esta computadora)\n');
    return;
  }
  const navegador = await pw.chromium.launch();
  console.log('\nPantalla');

  /* ---------------- Acomodo de las tarjetas ---------------- */
  await prueba('las tarjetas de la observación no dejan hueco', async () => {
    const p = await abrir(navegador);
    await p.click('#btnSample'); await p.waitForTimeout(250);
    const caja = (id) => p.$eval('#' + id, e => {
      const b = e.getBoundingClientRect();
      return { arriba: Math.round(b.top + window.scrollY), abajo: Math.round(b.bottom + window.scrollY) };
    });
    const info = await caja('secInfo'), viento = await caja('secViento');
    const cielo = await caja('secCielo'), notam = await caja('secNotam');
    /* Información y Viento arrancan parejos; Cielo va debajo de Información */
    assert.strictEqual(info.arriba, viento.arriba, 'Información y Viento no empiezan a la misma altura');
    assert.ok(cielo.arriba > info.abajo, 'Cielo no va debajo de Información');
    /* Y el NOTAM arranca en cuanto termina la más larga de las dos columnas */
    const finBanda = Math.max(cielo.abajo, viento.abajo);
    assert.ok(notam.arriba - finBanda < 40,
      'queda un hueco de ' + (notam.arriba - finBanda) + ' px antes de los NOTAM');
    await p.close();
  });

  await prueba('las pestañas no quedan detrás de la barra superior', async () => {
    for (const ancho of [1600, 1280, 1000]) {
      const p = await navegador.newPage({ viewport: { width: ancho, height: 900 } });
      await p.addInitScript(vocesFingidas);
      await p.goto(PAGINA); await p.waitForTimeout(400);
      await p.evaluate(() => window.scrollTo(0, 1200));
      await p.waitForTimeout(250);
      const r = await p.evaluate(() => ({
        barra: document.querySelector('.topbar').getBoundingClientRect().bottom,
        pestanas: document.querySelector('.tabs').getBoundingClientRect().top
      }));
      assert.ok(r.pestanas >= r.barra - 1,
        'a ' + ancho + ' px las pestañas se meten ' + Math.round(r.barra - r.pestanas) + ' px bajo la barra');
      await p.close();
    }
  });

  /* ---------------- La pista en uso aguanta el METAR nuevo ---------------- */
  await prueba('un METAR nuevo no borra la pista en uso ni la aproximación', async () => {
    const p = await abrir(navegador);
    await p.click('#btnSample'); await p.waitForTimeout(250);
    await p.click('.chip[data-rwy="05R"]');
    await p.click('.chip[data-rwy="23L"]');
    await p.selectOption('#approach', 'ILS');
    await p.selectOption('#approachRunway', '05R');
    await p.waitForTimeout(250);
    await p.fill('#metarRaw', 'MMMX 212245Z 07012KT 4SM BR SCT015 BKN090 21/12 A3025');
    await p.click('#btnDecode'); await p.waitForTimeout(350);
    const d = await p.evaluate(() => ({
      pistas: [...document.querySelectorAll('#runwayChips .chip.on')].map(c => c.dataset.rwy),
      apr: document.getElementById('approach').value,
      aprPista: document.getElementById('approachRunway').value,
      guion: document.getElementById('scriptEs').textContent
    }));
    assert.deepStrictEqual(d.pistas, ['05R', '23L'], 'se perdieron las pistas en uso');
    assert.strictEqual(d.apr, 'ILS');
    assert.strictEqual(d.aprPista, '05R');
    assert.ok(/ILS a pista 05 derecha/i.test(d.guion), 'la aproximación no salió en el guion');
    await p.close();
  });

  await prueba('cambiar de estación sí suelta las pistas', async () => {
    const p = await abrir(navegador);
    await p.click('#btnSample'); await p.waitForTimeout(250);
    await p.click('.chip[data-rwy="05R"]');
    await p.fill('#station', 'MMGL');
    await p.dispatchEvent('#station', 'change');
    await p.waitForTimeout(300);
    const quedan = await p.$$eval('#runwayChips .chip.on', ns => ns.length);
    assert.strictEqual(quedan, 0, 'las pistas del otro aeródromo siguieron marcadas');
    await p.close();
  });

  /* ---------------- Ir a corregir ---------------- */
  await prueba('«Ir a corregir» va campo por campo y los marca', async () => {
    const p = await abrir(navegador);
    await p.click('#btnSample'); await p.waitForTimeout(250);
    await p.click('.chip[data-rwy="05"]');          /* la pista sí está puesta */
    await p.fill('#obsTime', '');
    await p.fill('#altimeter', '');
    await p.fill('#visValue', '');
    await p.waitForTimeout(250);
    await p.click('#btnPlay'); await p.waitForTimeout(350);

    const visible = await p.evaluate(() => !document.getElementById('preflight').hidden);
    assert.ok(visible, 'no apareció el recuadro de verificación');

    /* Los campos que faltan quedan señalados en cuanto se detiene el intento */
    const marcados = await p.$$eval('.malo, .flojo, .zona-mala, .zona-floja', ns => ns.map(n => n.id));
    ['obsTime', 'altimeter', 'visValue'].forEach(id =>
      assert.ok(marcados.indexOf(id) >= 0, 'no quedó señalado ' + id));

    /* Y el botón lleva a uno distinto en cada pulsación */
    const recorrido = [];
    for (let i = 0; i < 3; i++) {
      await p.click('#btnCorregir'); await p.waitForTimeout(350);
      recorrido.push(await p.evaluate(() => ({
        foco: document.activeElement ? document.activeElement.id : '',
        rojo: (document.querySelector('.ahora') || {}).id || ''
      })));
    }
    const rojos = recorrido.map(r => r.rojo);
    assert.deepStrictEqual(rojos, ['obsTime', 'altimeter', 'visValue'],
      'el recorrido no fue de campo en campo: ' + JSON.stringify(rojos));
    assert.strictEqual(recorrido[0].foco, 'obsTime', 'el cursor no se quedó en el primer campo');
    await p.close();
  });

  await prueba('la marca se quita sola al corregir el campo', async () => {
    const p = await abrir(navegador);
    await p.click('#btnSample'); await p.waitForTimeout(250);
    await p.fill('#altimeter', ''); await p.waitForTimeout(200);
    await p.click('#btnPlay'); await p.waitForTimeout(350);
    assert.strictEqual(await p.$$eval('#altimeter.flojo, #altimeter.malo', n => n.length), 1,
      'el altímetro no quedó señalado');
    await p.fill('#altimeter', '3025'); await p.waitForTimeout(400);
    assert.strictEqual(await p.$$eval('#altimeter.flojo, #altimeter.malo, #altimeter.ahora', n => n.length), 0,
      'la marca no se quitó al llenar el altímetro');
    await p.close();
  });

  await prueba('un renglón de la lista lleva a su campo', async () => {
    const p = await abrir(navegador);
    await p.click('#btnSample'); await p.waitForTimeout(250);
    await p.fill('#obsTime', ''); await p.fill('#visValue', '');
    await p.waitForTimeout(200);
    await p.click('#btnPlay'); await p.waitForTimeout(350);
    const renglones = await p.$$eval('#preflightLista li[data-i]', ns => ns.map(n => n.textContent.trim()));
    const i = renglones.findIndex(t => /visibilidad/i.test(t));
    assert.ok(i >= 0, 'no apareció el aviso de la visibilidad');
    await p.click('#preflightLista li[data-i="' + i + '"]');
    await p.waitForTimeout(350);
    const foco = await p.evaluate(() => document.activeElement.id);
    assert.strictEqual(foco, 'visValue', 'el renglón no llevó al campo de la visibilidad');
    await p.close();
  });

  await prueba('con el ATIS completo no se señala nada', async () => {
    const p = await abrir(navegador);
    /* Un METAR de esta misma hora, para que no avise por antigüedad */
    const ahora = new Date();
    const dd = String(ahora.getUTCDate()).padStart(2, '0');
    const hh = String(ahora.getUTCHours()).padStart(2, '0');
    const mm = String(ahora.getUTCMinutes()).padStart(2, '0');
    await p.fill('#metarRaw', 'MMMX ' + dd + hh + mm + 'Z 05008KT 6SM HZ SCT020 22/11 A3039');
    await p.click('#btnDecode'); await p.waitForTimeout(350);
    await p.click('.chip[data-rwy="05"]'); await p.waitForTimeout(350);
    const d = await p.evaluate(() => ({
      visible: !document.getElementById('preflight').hidden,
      marcados: document.querySelectorAll('.malo, .flojo, .zona-mala, .zona-floja').length,
      lista: [...document.querySelectorAll('#preflightLista li')].map(n => n.textContent.trim())
    }));
    assert.strictEqual(d.marcados, 0, 'señaló campos sin haber nada que corregir');
    assert.ok(!d.visible, 'el recuadro de verificación quedó visible: ' + JSON.stringify(d.lista));
    await p.close();
  });

  await prueba('Información adicional y Texto libre comparten renglón', async () => {
    const p = await abrir(navegador);
    const d = await p.evaluate(() => {
      const a = document.getElementById('secAdic').getBoundingClientRect();
      const b = document.getElementById('cardLibre').getBoundingClientRect();
      const g = document.getElementById('secGuion').getBoundingClientRect();
      return {
        mismaFila: Math.abs(a.top - b.top) < 2,
        ladoALado: a.right <= b.left + 1,
        mismoAlto: Math.abs(a.height - b.height) < 2,
        hueco: Math.round(g.top - Math.max(a.bottom, b.bottom))
      };
    });
    assert.ok(d.mismaFila && d.ladoALado, 'las dos tarjetas no quedaron una al lado de la otra');
    assert.ok(d.mismoAlto, 'no terminan a la misma altura: una deja un hueco');
    assert.ok(d.hueco < 40, 'queda un hueco de ' + d.hueco + ' px antes del guion');
    await p.close();
  });

  /* ---------------- La lista de NOTAM ---------------- */
  /* Un juego de NOTAM relativos a esta hora: uno que empieza en 40 minutos,
     uno vigente que termina en 50, uno de mañana, uno vencido y uno largo. */
  function notamDePrueba() {
    const sello = (min) => {
      const d = new Date(Date.now() + min * 60000), p2 = n => String(n).padStart(2, '0');
      return String(d.getUTCFullYear()).slice(2) + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) +
        p2(d.getUTCHours()) + p2(d.getUTCMinutes());
    };
    const uno = (id, q, desde, hasta, texto) =>
      id + ' NOTAMN\nQ) MMFR/' + q + '/IV/NBO/A/000/999/1926N09904W005\n' +
      'A) MMMX B) ' + sello(desde) + ' C) ' + sello(hasta) + '\nE) ' + texto;
    return [
      uno('A0001/25', 'QMRLC', -600, 50, 'RWY 05R/23L CLSD DUE WIP'),
      uno('A0002/25', 'QMXLC', 40, 600, 'TWY B CLSD'),
      uno('A0003/25', 'QMXLC', 1500, 3000, 'TWY A4 CLSD BTN TWY A AND TWY B'),
      uno('A0004/25', 'QLRAS', -5000, -300, 'RWY 05L PAPI U/S'),
      uno('A0005/25', 'QMRLC', -2000, 9000, 'RWY 23R CLSD DUE MAINT')
    ].join('\n\n');
  }

  async function conNotam(p) {
    await p.fill('#notamRaw', notamDePrueba());
    await p.uncheck('#notamSoloVigentes');
    await p.click('#btnNotamAdd');
    await p.waitForTimeout(400);
  }

  await prueba('los NOTAM se agrupan por lo que están haciendo', async () => {
    const p = await abrir(navegador);
    await conNotam(p);
    const grupos = await p.$$eval('.ngrupo .ngtit', ns => ns.map(n => n.textContent));
    assert.deepStrictEqual(grupos, ['Activos ahora', 'Todavía no empiezan', 'Vencidos'],
      'los grupos no salieron en orden: ' + JSON.stringify(grupos));
    await p.close();
  });

  await prueba('cada NOTAM dice cuánto falta, y el más próximo va arriba', async () => {
    const p = await abrir(navegador);
    await conNotam(p);
    const filas = await p.$$eval('.notamrow', ns => ns.map(n => {
      const h = [...n.querySelectorAll('.nh')];
      return {
        id: n.querySelector('.nid').textContent,
        cuando: n.querySelector('.ncuando').textContent,
        rotulos: h.map(x => x.querySelector('.nhrot').textContent),
        horas: h.map(x => x.querySelector('.nhhora').textContent),
        dias: h.map(x => x.querySelector('.nhdia').textContent),
        pronto: n.classList.contains('pronto')
      };
    }));
    /* Dentro de los que todavía no empiezan, el más próximo va arriba */
    const porEmpezar = filas.filter(f => /empieza en/.test(f.cuando));
    assert.strictEqual(porEmpezar[0].id, 'A0002/25', 'arriba no quedó el que empieza antes');
    assert.ok(/empieza en \d+ min/.test(porEmpezar[0].cuando),
      'no dijo cuánto falta: ' + porEmpezar[0].cuando);
    assert.ok(porEmpezar[0].pronto, 'no quedó marcado el que empieza dentro de 2 h');
    /* El de mañana va después, y no se marca como próximo */
    assert.strictEqual(porEmpezar[1].id, 'A0003/25');
    assert.ok(!porEmpezar[1].pronto, 'marcó como próximo uno que es de mañana');
    /* El vigente que termina pronto también se avisa */
    const term = filas.find(f => f.id === 'A0001/25');
    assert.ok(/termina en/.test(term.cuando), 'no dijo cuándo termina: ' + term.cuando);
    assert.ok(term.pronto, 'no avisó del que termina dentro de 2 h');
    /* El vencido lo dice sin rodeos */
    const vencido = filas.find(f => f.id === 'A0004/25');
    assert.ok(/venció hace/.test(vencido.cuando), 'no dijo que estaba vencido: ' + vencido.cuando);
    /* Y las dos horas, con su rótulo y su día, están en todos */
    filas.forEach(f => {
      assert.deepStrictEqual(f.rotulos, ['Desde', 'Hasta'], 'faltan los rótulos en ' + f.id);
      f.horas.forEach(h => assert.ok(/^\d\d:\d\d$/.test(h), 'hora rara en ' + f.id + ': ' + h));
      assert.strictEqual(f.dias.length, 2, 'falta el día en ' + f.id);
    });
    /* El que empieza hoy lo dice con todas sus letras, no con una fecha */
    assert.strictEqual(filas[0].dias[0], 'HOY', 'el día de hoy no se dijo como HOY');
    await p.close();
  });

  /* ---------------- La pantalla no se mueve sola ---------------- */
  await prueba('cargar o marcar NOTAM no sube la pantalla al principio', async () => {
    const p = await abrir(navegador);
    await conNotam(p);
    await p.evaluate(() => document.getElementById('secNotam').scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(300);
    const antes = await p.evaluate(() => Math.round(window.scrollY));
    assert.ok(antes > 100, 'la prueba no llegó a desplazar la página');
    /* Marcar y desmarcar vuelve a dibujar la lista entera */
    await p.click('.notamrow .n-inc');
    await p.waitForTimeout(300);
    const despues = await p.evaluate(() => Math.round(window.scrollY));
    assert.ok(Math.abs(despues - antes) < 20,
      'la pantalla se movió de ' + antes + ' a ' + despues);
    await p.close();
  });

  await prueba('volver a pulsar la pestaña en la que ya se está no mueve nada', async () => {
    const p = await abrir(navegador);
    await conNotam(p);
    await p.evaluate(() => window.scrollTo(0, 800));
    await p.waitForTimeout(250);
    await p.click('#tabAtis');
    await p.waitForTimeout(300);
    const y = await p.evaluate(() => Math.round(window.scrollY));
    assert.ok(y > 600, 'volver a la misma pestaña subió la pantalla a ' + y);
    await p.close();
  });

  await prueba('la lista de NOTAM conserva su propio desplazamiento', async () => {
    const p = await abrir(navegador);
    await conNotam(p);
    const movida = await p.evaluate(() => {
      const l = document.getElementById('notamList');
      l.style.maxHeight = '180px';     /* para que seguro haya que desplazarla */
      l.scrollTop = 60;
      return l.scrollTop;
    });
    if (!movida) { /* con pocos NOTAM puede no haber desplazamiento que conservar */
      await p.close(); return;
    }
    /* La casilla se cambia sin clic: un clic de verdad arrastraría la lista
       para alcanzarla, y eso es cosa del navegador, no del programa. */
    await p.evaluate(() => {
      const c = document.querySelectorAll('.notamrow .n-inc')[0];
      c.checked = !c.checked;
      c.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(300);
    const queda = await p.evaluate(() => document.getElementById('notamList').scrollTop);
    assert.strictEqual(queda, movida, 'la lista se fue al principio al redibujarse');
    await p.close();
  });

  /* ---------------- Las llaves de la FAA, desde un archivo ---------------- */
  await prueba('carga las llaves de un archivo y llena los dos recuadros', async () => {
    /* Valores de mentira: las de verdad no entran en una prueba */
    const ID = 'EjemploDeLlaveFalsa0000000000000000000000000000AB';
    const SEC = 'EjemploDeSecretoFalso00000000000000000000000000000000000000000CD';
    const archivo = path.join(os.tmpdir(), 'llaves-prueba-' + process.pid + '.txt');
    fs.writeFileSync(archivo, 'ambiente: produccion\nclient_id: ' + ID + '\nclient_secret: ' + SEC + '\n');
    try {
      const p = await abrir(navegador);
      /* La tarjeta vive detrás del candado; sin servidor no se puede entrar,
         así que para la prueba se destapa y se usa el mismo botón de siempre. */
      await p.evaluate(() => {
        document.getElementById('pageAdmin').hidden = false;
        document.getElementById('admContenido').hidden = false;
      });
      await p.setInputFiles('#ntArchivo', archivo);
      await p.waitForTimeout(400);
      const d = await p.evaluate(() => ({
        id: document.getElementById('ntClientId').value,
        secreto: document.getElementById('ntClientSecret').value,
        aviso: document.getElementById('ntArchivoStatus').textContent
      }));
      assert.strictEqual(d.id, ID, 'no llenó el client_id');
      assert.strictEqual(d.secreto, SEC, 'no llenó el client_secret');
      assert.ok(/client_id/.test(d.aviso), 'no dijo qué leyó: ' + d.aviso);
      assert.ok(d.aviso.indexOf(SEC) < 0, 'enseñó el secreto en pantalla: ' + d.aviso);
      await p.close();
    } finally { try { fs.unlinkSync(archivo); } catch (e) { /* ya no está */ } }
  });

  await prueba('un archivo sin llaves lo dice, no se inventa nada', async () => {
    const archivo = path.join(os.tmpdir(), 'nada-' + process.pid + '.txt');
    fs.writeFileSync(archivo, 'Buen dia, adjunto el oficio para su revision.\n');
    try {
      const p = await abrir(navegador);
      await p.evaluate(() => {
        document.getElementById('pageAdmin').hidden = false;
        document.getElementById('admContenido').hidden = false;
      });
      await p.setInputFiles('#ntArchivo', archivo);
      await p.waitForTimeout(400);
      const d = await p.evaluate(() => ({
        id: document.getElementById('ntClientId').value,
        aviso: document.getElementById('ntArchivoStatus').textContent
      }));
      assert.strictEqual(d.id, '', 'puso algo en el client_id');
      assert.ok(/no vienen las dos llaves/.test(d.aviso), 'no avisó: ' + d.aviso);
      await p.close();
    } finally { try { fs.unlinkSync(archivo); } catch (e) { /* ya no está */ } }
  });

  /* ---------------- El horario del NOTAM (campo D) ---------------- */
  /* Un NOTAM puede estar dentro de sus fechas y NO estar surtiendo efecto. */
  await prueba('separa los activos ahora de los que están fuera de su horario', async () => {
    const p = await abrir(navegador);
    const ahora = new Date();
    const hh = ahora.getUTCHours();
    const dosDigitos = (n) => String(((n % 24) + 24) % 24).padStart(2, '0');
    const dentro = dosDigitos(hh - 1) + '00-' + dosDigitos(hh + 1) + '00';
    const fuera = dosDigitos(hh + 3) + '00-' + dosDigitos(hh + 5) + '00';
    const sello = (min) => {
      const d = new Date(Date.now() + min * 60000), q = (n) => String(n).padStart(2, '0');
      return String(d.getUTCFullYear()).slice(2) + q(d.getUTCMonth() + 1) + q(d.getUTCDate()) +
        q(d.getUTCHours()) + q(d.getUTCMinutes());
    };
    const uno = (id, d, texto) => id + ' NOTAMN\nQ) MMFR/QMXLC/IV/M/A/000/999/1926N09904W002\n' +
      'A) MMMX B) ' + sello(-2000) + ' C) ' + sello(2000) + '\n' + (d ? 'D) ' + d + '\n' : '') +
      'E) ' + texto;

    await p.fill('#notamRaw', [
      uno('B4023/26', 'DLY ' + fuera, 'TWY D BTN RWY 23L AND TWY D4 CLSD'),
      uno('B4024/26', 'DLY ' + dentro, 'RWY 05R CLSD DUE WIP'),
      uno('B4025/26', '', 'RWY 23R CLSD DUE MAINT'),
      uno('B4026/26', 'SR-SS', 'TWY B LGT U/S')
    ].join('\n\n'));
    await p.uncheck('#notamSoloVigentes');
    await p.click('#btnNotamAdd');
    await p.waitForTimeout(500);

    const grupos = await p.$$eval('.ngrupo .ngtit', ns => ns.map(n => n.textContent));
    assert.ok(grupos.indexOf('Activos ahora') >= 0, 'falta el grupo de los activos');
    assert.ok(grupos.indexOf('Vigentes, pero fuera de su horario') >= 0,
      'no separó los que están fuera de horario: ' + JSON.stringify(grupos));
    assert.ok(grupos.indexOf('Con horario que hay que leer') >= 0,
      'no apartó el horario que no sabe leer: ' + JSON.stringify(grupos));
    assert.ok(grupos.indexOf('Vigentes ahora') < 0, 'quedó la palabra «vigente» a secas');

    const filas = await p.$$eval('.notamrow', ns => ns.map(n => ({
      id: n.querySelector('.nid').textContent,
      clase: n.className,
      horario: n.querySelector('.nhorario') ? n.querySelector('.nhorario b').textContent : '',
      cuando: n.querySelector('.ncuando').textContent
    })));
    const de = (id) => filas.find(f => f.id === id);
    assert.ok(/e-dormido/.test(de('B4023/26').clase), 'el de horario vencido salió como activo');
    assert.ok(/vuelve a las/.test(de('B4023/26').cuando), 'no dice cuándo vuelve: ' + de('B4023/26').cuando);
    assert.ok(/e-activo/.test(de('B4024/26').clase), 'el que sí está en horario no salió activo');
    assert.ok(/e-activo/.test(de('B4025/26').clase), 'el que no tiene horario debe estar activo');
    assert.ok(/e-revisar/.test(de('B4026/26').clase), 'SR-SS no se puede dar por bueno');
    /* Y el horario se ve en el renglón, sin tener que desplegar nada */
    assert.ok(de('B4023/26').horario, 'el horario no se ve en el renglón');
    await p.close();
  });

  await prueba('avisa antes de transmitir si hay marcados que no están activos', async () => {
    const p = await abrir(navegador);
    const hh = new Date().getUTCHours();
    const dosDigitos = (n) => String(((n % 24) + 24) % 24).padStart(2, '0');
    const sello = (min) => {
      const d = new Date(Date.now() + min * 60000), q = (n) => String(n).padStart(2, '0');
      return String(d.getUTCFullYear()).slice(2) + q(d.getUTCMonth() + 1) + q(d.getUTCDate()) +
        q(d.getUTCHours()) + q(d.getUTCMinutes());
    };
    await p.fill('#notamRaw', 'B4023/26 NOTAMN\nQ) MMFR/QMXLC/IV/M/A/000/999/1926N09904W002\n' +
      'A) MMMX B) ' + sello(-2000) + ' C) ' + sello(2000) + '\n' +
      'D) DLY ' + dosDigitos(hh + 3) + '00-' + dosDigitos(hh + 5) + '00\n' +
      'E) TWY D BTN RWY 23L AND TWY D4 CLSD');
    await p.click('#btnNotamAdd');
    await p.waitForTimeout(400);
    const marcado = await p.$eval('.notamrow .n-inc', e => e.checked);
    assert.ok(marcado, 'la prueba necesita que quede marcado para transmitir');
    await p.click('#btnPlay');
    await p.waitForTimeout(400);
    const avisos = await p.$$eval('#preflightLista li', ns => ns.map(n => n.textContent));
    assert.ok(avisos.some(t => /no están activos ahora/.test(t)),
      'no avisó de que va a transmitir un NOTAM que no surte efecto: ' + JSON.stringify(avisos));
    await p.close();
  });

  /* ---------------- Al transmitir, la pantalla no se mueve sola ----------------
     El subrayado del guion seguía a la frase que sonaba. Lo hacía con
     scrollIntoView, que arrastra todo lo que se pueda desplazar por encima,
     la ventana incluida: al transmitir, la pantalla se iba sola hasta el
     guion y no dejaba escribir el METAR nuevo. */
  await prueba('al transmitir, el guion se desplaza solo, no la pantalla', async () => {
    const p = await navegador.newPage({ viewport: { width: 1280, height: 800 } });
    await p.addInitScript(() => {
      try { localStorage.clear(); } catch (e) {}
      const v = [{ name: 'Dalia', lang: 'es-MX', localService: false },
                 { name: 'Aria', lang: 'en-US', localService: false }];
      window.speechSynthesis.getVoices = () => v;
      /* Una voz que tarda lo suyo en cada fragmento, para que el subrayado
         avance de verdad mientras se mira */
      window.speechSynthesis.speak = (u) => setTimeout(() => u.onend && u.onend(), 300);
      window.speechSynthesis.cancel = () => {};
    });
    await p.goto(PAGINA); await p.waitForTimeout(600);
    await p.click('#btnSample'); await p.waitForTimeout(250);
    await p.click('.chip[data-rwy="05"]');
    await p.fill('#notamRaw', notamDePrueba());
    await p.click('#btnNotamAdd'); await p.waitForTimeout(300);
    /* Texto libre largo, para que el guion no quepa en su recuadro: es ahí
       donde el subrayado tiene que desplazar algo. */
    await p.check('#libreActivo');
    const largo = l => Array(4).fill(l).join('\n');
    await p.fill('#libreEs', largo('Aeropuerto Internacional de la Ciudad de Mexico, prueba del ' +
      'sistema de informacion automatica terminal, mantengase a la escucha en esta frecuencia.'));
    await p.fill('#libreEn', largo('Mexico City International Airport, automatic terminal ' +
      'information service test, stand by on this frequency.'));
    await p.evaluate(() => {
      const g = document.getElementById('gap');
      g.value = '0'; g.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await p.waitForTimeout(300);

    const caben = await p.$eval('#scriptEs', e => e.scrollHeight > e.clientHeight + 4);
    assert.ok(caben, 'la prueba no logró que el guion desbordara su recuadro');

    await p.evaluate(() => window.scrollTo(0, 0));
    await p.click('#btnPlay'); await p.waitForTimeout(300);
    if (!(await p.evaluate(() => document.getElementById('preflight').hidden))) {
      await p.click('#btnIgual');
    }
    /* El controlador se pone a escribir el METAR nuevo, arriba */
    await p.click('#metarRaw');
    const ventana = [], caja = [];
    for (let i = 0; i < 18; i++) {
      await p.waitForTimeout(200);
      const d = await p.evaluate(() => ({
        y: Math.round(window.scrollY),
        caja: Math.round(document.getElementById('scriptEs').scrollTop)
      }));
      ventana.push(d.y); caja.push(d.caja);
    }
    assert.strictEqual(Math.max.apply(null, ventana), 0,
      'la pantalla se fue sola a ' + Math.max.apply(null, ventana) + ' px mientras transmitía');
    assert.ok(Math.max.apply(null, caja) > 0,
      'el recuadro del guion no siguió a lo que se estaba locutando');
    await p.close();
  });

  /* ---------------- Con el servidor de verdad ----------------
     Lo de administración no se puede probar con file://: hace falta el
     servidor, que es quien guarda la clave y firma el pase. Si esta
     computadora ya tiene una clave puesta, la prueba se omite: no es cosa
     suya andar borrando la clave de la torre. */
  const ARCHIVO_CLAVE = path.join(RAIZ, 'servidor', 'admin.json');
  if (fs.existsSync(ARCHIVO_CLAVE)) {
    console.log('  --   administración: omitida (esta computadora ya tiene clave puesta)');
  } else {
    const PUERTO = 8800 + Math.floor(Math.random() * 120);
    let servidor = spawn('node', [path.join(RAIZ, 'servidor', 'servidor.js'), '--puerto', String(PUERTO)],
      { stdio: 'ignore' });
    let servidor2 = null;
    await new Promise(r => setTimeout(r, 1300));

    await prueba('los botones de administración llevan el pase al servidor', async () => {
      const p = await navegador.newPage({ viewport: { width: 1600, height: 1000 } });
      const respuestas = [];
      p.on('response', r => {
        if (/\/api\/(notam|metar|voz)/.test(r.url())) {
          respuestas.push({ estado: r.status(), metodo: r.request().method(), url: r.url() });
        }
      });
      await p.goto('http://127.0.0.1:' + PUERTO + '/');
      await p.waitForTimeout(900);
      await p.click('#tabAdmin'); await p.waitForTimeout(400);
      await p.fill('#admClave', '0348');
      await p.click('#btnAdmEntrar'); await p.waitForTimeout(800);
      assert.ok(await p.evaluate(() => !document.getElementById('admContenido').hidden),
        'la clave de fábrica no abrió la administración');

      /* Llaves inventadas: lo que importa no es que sirvan, sino que el
         servidor las llegue a probar en lugar de contestar 403. */
      await p.fill('#ntClientId', 'PRUEBA');
      await p.fill('#ntClientSecret', 'PRUEBA');
      await p.click('#btnNtLlaves'); await p.waitForTimeout(2500);
      const llaves = await p.$eval('#ntLlavesStatus', e => e.textContent);
      assert.ok(!/hace falta la clave/.test(llaves),
        'Comprobar las llaves no mandó el pase: ' + llaves);

      await p.click('#btnNtGuardar'); await p.waitForTimeout(1200);
      const guardado = await p.$eval('#ntStatus', e => e.textContent);
      assert.ok(/Guardado/.test(guardado), 'no se guardó: ' + guardado);

      const negadas = respuestas.filter(r => r.estado === 403);
      assert.deepStrictEqual(negadas, [],
        'el servidor rechazó peticiones por falta de pase: ' +
        negadas.map(r => r.metodo + ' ' + r.url).join(', '));
      await p.close();
    });

    /* Y si el servidor se reinicia, los pases que tenía en memoria se pierden.
       La pantalla no puede quedarse creyendo que sigue abierta: tiene que
       volver a pedir la clave en lugar de fallar en silencio. */
    await prueba('si el pase ya no vale, la pantalla vuelve a pedir la clave', async () => {
      const p = await navegador.newPage({ viewport: { width: 1600, height: 1000 } });
      await p.goto('http://127.0.0.1:' + PUERTO + '/');
      await p.waitForTimeout(900);
      await p.click('#tabAdmin'); await p.waitForTimeout(400);
      await p.fill('#admClave', '0348');
      await p.click('#btnAdmEntrar'); await p.waitForTimeout(800);
      assert.ok(await p.evaluate(() => !document.getElementById('admContenido').hidden),
        'no se llegó a abrir la administración');

      /* El servidor se va y vuelve: misma clave, ningún pase vivo */
      servidor.kill('SIGKILL');
      await new Promise(r => setTimeout(r, 500));
      servidor2 = spawn('node', [path.join(RAIZ, 'servidor', 'servidor.js'), '--puerto', String(PUERTO)],
        { stdio: 'ignore' });
      await new Promise(r => setTimeout(r, 1300));

      await p.click('#btnNtGuardar'); await p.waitForTimeout(1200);
      const cerrado = await p.evaluate(() => ({
        candado: !document.getElementById('admEntrar').hidden,
        contenido: document.getElementById('admContenido').hidden,
        aviso: document.getElementById('admStatus').textContent
      }));
      assert.ok(cerrado.candado && cerrado.contenido,
        'la pantalla siguió creyendo que la administración estaba abierta');
      assert.ok(/vuelva a escribir la clave/i.test(cerrado.aviso),
        'no se avisó de que la sesión se cerró: ' + JSON.stringify(cerrado.aviso));
      await p.close();
    });

    if (servidor2) servidor2.kill('SIGKILL'); else servidor.kill('SIGKILL');
    try { fs.unlinkSync(ARCHIVO_CLAVE); } catch (e) { /* no quedó nada */ }
  }

  await prueba('la pantalla no tira ningún error de JavaScript', async () => {
    const p = await abrir(navegador);
    await p.click('#btnSample'); await p.waitForTimeout(250);
    await p.click('.chip[data-rwy="05"]');
    await p.click('#tabAjustes'); await p.waitForTimeout(250);
    await p.click('#tabAdmin'); await p.waitForTimeout(250);
    await p.click('#tabAtis'); await p.waitForTimeout(250);
    assert.deepStrictEqual(p.erroresJS, [], 'la pantalla tiró errores');
    await p.close();
  });

  await navegador.close();
  console.log('\n' + correctas + ' pruebas correctas, ' + fallidas + ' fallidas\n');
  if (fallidas) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
