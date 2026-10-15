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
const assert = require('assert');

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
