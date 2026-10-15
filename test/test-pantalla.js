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
    assert.deepStrictEqual(grupos, ['Todavía no empiezan', 'Vigentes ahora', 'Vencidos'],
      'los grupos no salieron en orden: ' + JSON.stringify(grupos));
    await p.close();
  });

  await prueba('cada NOTAM dice cuánto falta, y el más próximo va arriba', async () => {
    const p = await abrir(navegador);
    await conNotam(p);
    const filas = await p.$$eval('.notamrow', ns => ns.map(n => ({
      id: n.querySelector('.nid').textContent,
      cuando: n.querySelector('.ncuando').textContent,
      rango: n.querySelector('.nrango').textContent,
      pronto: n.classList.contains('pronto')
    })));
    /* El que empieza en 40 minutos va primero de todos */
    assert.strictEqual(filas[0].id, 'A0002/25', 'arriba no quedó el que empieza antes');
    assert.ok(/empieza en \d+ min/.test(filas[0].cuando), 'no dijo cuánto falta: ' + filas[0].cuando);
    assert.ok(filas[0].pronto, 'no quedó marcado el que empieza dentro de 2 h');
    /* El de mañana va después, y no se marca como próximo */
    assert.strictEqual(filas[1].id, 'A0003/25');
    assert.ok(!filas[1].pronto, 'marcó como próximo uno que es de mañana');
    /* El vigente que termina pronto también se avisa */
    const term = filas.find(f => f.id === 'A0001/25');
    assert.ok(/vigente .* termina en/.test(term.cuando), 'no dijo cuándo termina: ' + term.cuando);
    assert.ok(term.pronto, 'no avisó del que termina dentro de 2 h');
    /* El vencido lo dice sin rodeos */
    const vencido = filas.find(f => f.id === 'A0004/25');
    assert.ok(/venció hace/.test(vencido.cuando), 'no dijo que estaba vencido: ' + vencido.cuando);
    /* Y el rango exacto sigue a la vista en todos */
    filas.forEach(f => assert.ok(/\d\d\/\d\d \d\d:\d\d/.test(f.rango),
      'se perdió el rango exacto de ' + f.id));
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
      l.scrollTop = 60;
      return l.scrollTop;
    });
    if (!movida) { /* con pocos NOTAM puede no haber desplazamiento que conservar */
      await p.close(); return;
    }
    await p.click('.notamrow .n-inc');
    await p.waitForTimeout(300);
    const queda = await p.evaluate(() => document.getElementById('notamList').scrollTop);
    assert.strictEqual(queda, movida, 'la lista se fue al principio al redibujarse');
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
