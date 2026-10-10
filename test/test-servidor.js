/* Pruebas del servidor de control remoto (node test/test-servidor.js) */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

/* Puerto distinto en cada corrida: una prueba anterior no puede estorbar */
const PUERTO = 8100 + Math.floor(Math.random() * 800);
const BASE = 'http://127.0.0.1:' + PUERTO;
const ESTADO = path.join(__dirname, '..', 'servidor', 'estado.json');

/* Todo servidor que arranque la prueba se apaga al terminar, pase lo que pase */
const hijos = new Set();
function arrancarServidor() {
  const h = spawn('node', [path.join(__dirname, '..', 'servidor', 'servidor.js'), '--puerto', String(PUERTO)],
    { stdio: 'ignore' });
  hijos.add(h);
  h.on('exit', () => hijos.delete(h));
  return h;
}
function apagarTodo() { for (const h of hijos) { try { h.kill('SIGKILL'); } catch (e) { /* ignorado */ } } }
process.on('exit', apagarTodo);
['SIGINT', 'SIGTERM', 'uncaughtException'].forEach(ev => process.on(ev, () => { apagarTodo(); process.exit(1); }));

let pass = 0, fail = 0;
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
async function test(nombre, fn) {
  try { await fn(); pass++; console.log('  ok   ' + nombre); }
  catch (e) { fail++; console.log('  FAIL ' + nombre + '\n       ' + e.message); }
}
const api = (ruta, opciones) => fetch(BASE + ruta, opciones).then(r => r.json());

(async () => {
  try { fs.unlinkSync(ESTADO); } catch (e) { /* no existía */ }
  const srv = arrancarServidor();
  await dormir(1200);

  /* ---- Lectura del METAR desde la fuente del CAPMA ---- */
  const fuente = require(path.join(__dirname, '..', 'servidor', 'fuente-metar.js'));
  console.log('\nLectura del METAR (CAPMA)');

  await test('extrae los informes sin importar como este armada la pagina', async () => {
    for (const forma of ['parrafos', 'tabla', 'texto']) {
      const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'capma_' + forma + '.html'), 'latin1');
      const lista = fuente.extraer(html, 'MMMX');
      assert.strictEqual(lista.length, 15, 'en formato ' + forma);
      assert.strictEqual(lista[0].hhmm, '1144', 'el mas reciente va primero, formato ' + forma);
    }
  });

  await test('ordena del mas reciente al mas antiguo y respeta la estacion', async () => {
    const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'capma_parrafos.html'), 'latin1');
    const l = fuente.extraer(html, 'MMMX');
    for (let i = 1; i < l.length; i++) {
      assert.ok(l[i - 1].momento >= l[i].momento, 'desordenado en ' + i);
    }
    assert.strictEqual(fuente.extraer(html, 'MMTJ').length, 1);
    assert.strictEqual(fuente.extraer(html, 'MMMY').length, 1);
    assert.strictEqual(fuente.extraer(html, '').length, 17);
  });

  await test('distingue METAR, SPECI y corregidos, y deja el texto limpio', async () => {
    const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'capma_parrafos.html'), 'latin1');
    const l = fuente.extraer(html, 'MMMX');
    const ultimo = l[0];
    assert.strictEqual(ultimo.tipo, 'METAR');
    assert.strictEqual(ultimo.estacion, 'MMMX');
    /* Sin el "= HHMM" con que termina cada renglon en la pagina */
    assert.ok(!/=/.test(ultimo.raw), 'quedo el igual: ' + ultimo.raw);
    assert.ok(/^MMMX 101144Z 00000KT 4SM BKN010 OVC070 15\/13 A3025 NOSIG RMK/.test(ultimo.raw), ultimo.raw);

    const speci = l.filter(x => x.tipo === 'SPECI');
    assert.ok(speci.length >= 4, 'no reconocio los SPECI');
    assert.ok(speci.some(x => x.corregido), 'no reconocio el SPECI COR');
  });

  await test('una pagina sin METAR no revienta', async () => {
    assert.strictEqual(fuente.extraer('<html><body>Sin datos</body></html>', 'MMMX').length, 0);
    assert.strictEqual(fuente.extraer('', 'MMMX').length, 0);
    assert.strictEqual(fuente.masReciente('<p>nada</p>', 'MMMX'), null);
  });

  await test('lee el formato del NOAA, que viene por renglones y sin "="', async () => {
    const txt = fs.readFileSync(path.join(__dirname, 'fixtures', 'noaa_mmmx.txt'), 'utf8');
    const lista = fuente.extraer(fuente.normalizarLineas(txt), 'MMMX');
    assert.strictEqual(lista.length, 5);
    assert.strictEqual(lista[0].hhmm, '1818', 'el mas reciente va primero');
    assert.strictEqual(lista[0].tipo, 'SPECI');
    assert.ok(/A3027/.test(lista[0].raw), 'se perdio parte del informe: ' + lista[0].raw);
    assert.ok(!/=/.test(lista[0].raw), 'no debe quedar el signo igual');
    /* el mismo lector sirve para las dos fuentes */
    assert.strictEqual(fuente.extraer(fuente.normalizarLineas(txt), 'KJFK').length, 0);
  });

  await test('normalizar renglones no estropea lo que ya trae "="', async () => {
    const conIgual = 'METAR MMMX 101745Z 34005KT 5SM 20/13 A3029=\nSPECI MMTJ 101800Z 00000KT 9SM 24/10 A2998=';
    const l = fuente.extraer(fuente.normalizarLineas(conIgual), '');
    assert.strictEqual(l.length, 2);
    assert.ok(!/==/.test(l[0].raw + l[1].raw));
  });

  await test('buscar cae a la segunda fuente cuando la primera no sirve', async () => {
    /* La primera direccion no existe: tiene que seguir con la otra sin rendirse */
    const r = await fuente.buscar('MMMX', { url: 'http://127.0.0.1:1/nada', tiempoLimite: 2000, awc: false });
    assert.strictEqual(r.ok, false, 'sin fuentes utiles no puede decir que si');
    assert.strictEqual(r.intentos.length, 1);
    assert.strictEqual(r.intentos[0].fuente, 'CAPMA');
    assert.ok(r.intentos[0].error, 'tiene que decir que paso');
    assert.ok(r.error.indexOf('CAPMA') === 0, 'el aviso nombra la fuente: ' + r.error);
  });

  await test('buscar rechaza un indicador que no es de cuatro letras', async () => {
    for (const malo of ['', 'MM', 'MMMXX', '12 34']) {
      const r = await fuente.buscar(malo, { tiempoLimite: 1000 });
      assert.strictEqual(r.ok, false, 'acepto "' + malo + '"');
      assert.ok(/cuatro letras/.test(r.error));
      assert.strictEqual(r.intentos.length, 0, 'no debe salir a la red con un indicador malo');
    }
  });

  await test('avisa cuando el sitio no responde', async () => {
    await fuente.consultar('http://127.0.0.1:1/', 'MMMX', 2000)
      .then(() => { throw new Error('deberia haber fallado'); })
      .catch((e) => { assert.ok(/ECONNREFUSED|no respondió|respondió/.test(e.message), e.message); });
  });

  console.log('\nServidor de control remoto (puerto ' + PUERTO + ')');

  /* Si el puerto estuviera ocupado por otra cosa, mejor saberlo de inmediato */
  const inicial = await api('/api/estado').catch(() => null);
  if (!inicial) { console.error('  El servidor no respondió.'); apagarTodo(); process.exit(1); }
  if (inicial.version !== 0) {
    console.error('  Hay otro servidor en el puerto ' + PUERTO + '; se aborta.');
    apagarTodo(); process.exit(1);
  }

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

  /* Un sitio de mentiras con la pagina del CAPMA, para probar sin salir a la red */
  await test('el servidor trae el METAR de la estacion que le pidan', async () => {
    const http = require('http');
    const pagina = fs.readFileSync(path.join(__dirname, 'fixtures', 'capma_parrafos.html'));
    const falso = http.createServer((pet, resp) => {
      resp.writeHead(200, { 'Content-Type': 'text/html; charset=windows-1252' });
      resp.end(pagina);
    });
    await new Promise((r) => falso.listen(0, '127.0.0.1', r));
    const puertoFalso = falso.address().port;
    try {
      /* Se apunta la vigilancia a ese sitio; el NOAA queda como respaldo */
      await api('/api/metar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://127.0.0.1:' + puertoFalso + '/capma', estacion: 'MMMX' })
      });

      const r = await api('/api/metar/buscar?estacion=MMMX');
      assert.strictEqual(r.ok, true, 'no lo encontro: ' + r.error);
      assert.strictEqual(r.fuente, 'CAPMA', 'debio salir de la fuente configurada');
      assert.ok(/^(METAR |SPECI )?MMMX \d{6}Z /.test(r.raw), 'informe raro: ' + r.raw);
      assert.strictEqual(r.informe.estacion, 'MMMX');
      assert.ok(r.recientes.length > 1, 'tambien entrega los anteriores');

      /* Otra estacion de la misma pagina */
      const tj = await api('/api/metar/buscar?estacion=MMTJ');
      assert.strictEqual(tj.ok, true);
      assert.strictEqual(tj.informe.estacion, 'MMTJ');

      /* Una que no esta: tiene que decir que intento en cada fuente */
      const no = await api('/api/metar/buscar?estacion=ZZZZ');
      assert.strictEqual(no.ok, false);
      assert.ok(no.intentos.length >= 1, 'no dijo que intento');
      assert.strictEqual(no.intentos[0].fuente, 'CAPMA');
      assert.ok(/ZZZZ/.test(no.intentos[0].error), 'el motivo nombra la estacion: ' + no.intentos[0].error);
      assert.ok(no.error, 'falta el resumen de la falla');

      /* Un indicador invalido ni siquiera sale a la red */
      const malo = await api('/api/metar/buscar?estacion=MM');
      assert.strictEqual(malo.ok, false);
      assert.strictEqual(malo.intentos.length, 0);
    } finally {
      falso.close();
    }
  });

  await test('dos veces SERVIDOR.bat: el segundo reconoce al primero y no se pelea', async () => {
    const otro = spawn('node', [path.join(__dirname, '..', 'servidor', 'servidor.js'), '--puerto', String(PUERTO)],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    hijos.add(otro);
    let salida = '';
    otro.stdout.on('data', (t) => { salida += t; });
    otro.stderr.on('data', (t) => { salida += t; });
    const codigo = await new Promise((r) => otro.on('close', r));
    assert.strictEqual(codigo, 0, 'no debe terminar con error: ' + salida);
    assert.ok(/ATIS_YA_ANDABA=1/.test(salida), 'no reconocio al que ya andaba: ' + salida);
    assert.ok(salida.indexOf('ATIS_PUERTO=' + PUERTO) >= 0, 'no dijo en que puerto esta: ' + salida);
    assert.ok(/Ya hay un ATIS andando/.test(salida), 'no lo explico: ' + salida);
    /* y el primero sigue atendiendo */
    const salud = await api('/api/salud');
    assert.strictEqual(salud.ok, true, 'el primero se cayo');
  });

  await test('si el puerto lo ocupa otro programa, se corre al siguiente libre', async () => {
    const net = require('net');
    const estorbo = net.createServer(() => {});
    const libre = PUERTO + 40;
    await new Promise((r) => estorbo.listen(libre, '127.0.0.1', r));
    const otro = spawn('node', [path.join(__dirname, '..', 'servidor', 'servidor.js'), '--puerto', String(libre)],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    hijos.add(otro);
    let salida = '';
    otro.stdout.on('data', (t) => { salida += t; });
    try {
      /* a esperar a que anuncie en que puerto quedo */
      for (let i = 0; i < 60 && !/ATIS_PUERTO=/.test(salida); i++) await dormir(100);
      const puesto = parseInt((/ATIS_PUERTO=(\d+)/.exec(salida) || [])[1], 10);
      assert.strictEqual(puesto, libre + 1, 'quedo en ' + puesto + ', salida: ' + salida);
      assert.ok(/lo ocupa otro programa/.test(salida), 'no dijo por que se movio');
      const r = await fetch('http://127.0.0.1:' + (libre + 1) + '/api/salud').then((x) => x.json());
      assert.strictEqual(r.ok, true, 'no esta atendiendo en el puerto nuevo');
      /* el aviso de la pantalla trae el puerto de verdad, no el pedido */
      assert.ok(salida.indexOf('http://localhost:' + (libre + 1) + '/') >= 0,
        'el aviso dice un puerto que no es: ' + salida);
    } finally {
      otro.kill('SIGKILL');
      estorbo.close();
    }
  });

  await test('dice si hay una instalacion de voz en marcha', async () => {
    const d = await api('/api/voz/instalacion');
    assert.strictEqual(typeof d.andando, 'boolean');
    assert.ok(Array.isArray(d.lineas));
    assert.strictEqual(d.andando, false, 'no deberia haber ninguna andando');
  });

  await test('el estado sobrevive al reinicio del servidor', async () => {
    srv.kill('SIGKILL');
    await dormir(600);
    const srv2 = arrancarServidor();
    await dormir(1200);
    const r = await api('/api/estado');
    assert.strictEqual(r.datos.letter, 'F', 'perdió el estado al reiniciar');
    srv2.kill('SIGKILL');
    await dormir(300);
  });

  try { fs.unlinkSync(ESTADO); } catch (e) { /* ignorado */ }
  console.log('\n' + pass + ' pruebas correctas, ' + fail + ' fallidas\n');
  process.exit(fail ? 1 : 0);
})();
