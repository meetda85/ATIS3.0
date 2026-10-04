/* Pruebas del servidor de control remoto (node test/test-servidor.js) */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const PUERTO = 8123;
const BASE = 'http://127.0.0.1:' + PUERTO;
const ESTADO = path.join(__dirname, '..', 'servidor', 'estado.json');

let pass = 0, fail = 0;
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
async function test(nombre, fn) {
  try { await fn(); pass++; console.log('  ok   ' + nombre); }
  catch (e) { fail++; console.log('  FAIL ' + nombre + '\n       ' + e.message); }
}
const api = (ruta, opciones) => fetch(BASE + ruta, opciones).then(r => r.json());

(async () => {
  try { fs.unlinkSync(ESTADO); } catch (e) { /* no existía */ }
  const srv = spawn('node', [path.join(__dirname, '..', 'servidor', 'servidor.js'), '--puerto', String(PUERTO)],
    { stdio: 'ignore' });
  await dormir(1200);

  console.log('\nServidor de control remoto');

  await test('sirve la aplicación', async () => {
    const r = await fetch(BASE + '/');
    assert.strictEqual(r.status, 200);
    const html = await r.text();
    assert.ok(/ATIS 3\.0/.test(html), 'no devolvió el index');
    for (const f of ['/css/styles.css', '/js/app.js', '/js/enlace.js']) {
      assert.strictEqual((await fetch(BASE + f)).status, 200, 'falta ' + f);
    }
  });

  await test('no deja salir de la carpeta del programa', async () => {
    const r = await fetch(BASE + '/../../etc/passwd');
    assert.ok(r.status === 403 || r.status === 404, 'devolvió ' + r.status);
  });

  await test('guarda y entrega el estado, subiendo la versión', async () => {
    const vacio = await api('/api/estado');
    assert.strictEqual(vacio.version, 0);

    const r1 = await api('/api/estado', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origen: 'control', datos: { metar: 'MMMX 041200Z 09008KT', letter: 'D' } })
    });
    assert.strictEqual(r1.version, 1);

    const leido = await api('/api/estado');
    assert.strictEqual(leido.datos.letter, 'D');
    assert.strictEqual(leido.origen, 'control');

    const r2 = await api('/api/estado', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origen: 'torre', datos: { letter: 'E' } })
    });
    assert.strictEqual(r2.version, 2);
  });

  await test('rechaza un cuerpo que no es JSON', async () => {
    const r = await fetch(BASE + '/api/estado', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'esto no es json'
    });
    assert.strictEqual(r.status, 400);
    /* y el estado bueno sigue intacto */
    assert.strictEqual((await api('/api/estado')).datos.letter, 'E');
  });

  await test('lleva la cuenta de los equipos conectados', async () => {
    await api('/api/latido', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'torre1', nombre: 'PC Torre', papel: 'transmisor', aire: { transmitiendo: true, ciclo: 4 } })
    });
    await api('/api/latido', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'ctrl1', nombre: 'PC Control', papel: 'control' })
    });
    const salud = await api('/api/salud');
    assert.strictEqual(salud.equipos.length, 2);
    const t = salud.equipos.filter(e => e.papel === 'transmisor')[0];
    assert.ok(t && t.aire.transmitiendo, 'no registró que la torre está al aire');
    assert.strictEqual(t.aire.ciclo, 4);
  });

  await test('avisa a los clientes cuando cambia el estado', async () => {
    const ctrl = new AbortController();
    const r = await fetch(BASE + '/api/eventos', { signal: ctrl.signal });
    const lector = r.body.getReader();
    await lector.read();                        /* el primer aviso con la versión actual */

    await api('/api/estado', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origen: 'control', datos: { letter: 'F' } })
    });
    const { value } = await lector.read();
    const texto = Buffer.from(value).toString();
    assert.ok(/event: estado/.test(texto), 'no mandó el aviso: ' + texto);
    assert.ok(/"origen":"control"/.test(texto), texto);
    ctrl.abort();
  });

  await test('el estado sobrevive al reinicio del servidor', async () => {
    srv.kill('SIGKILL');
    await dormir(600);
    const srv2 = spawn('node', [path.join(__dirname, '..', 'servidor', 'servidor.js'), '--puerto', String(PUERTO)],
      { stdio: 'ignore' });
    await dormir(1200);
    const r = await api('/api/estado');
    assert.strictEqual(r.datos.letter, 'F', 'perdió el estado al reiniciar');
    srv2.kill('SIGKILL');
  });

  try { fs.unlinkSync(ESTADO); } catch (e) { /* ignorado */ }
  console.log('\n' + pass + ' pruebas correctas, ' + fail + ' fallidas\n');
  process.exit(fail ? 1 : 0);
})();
