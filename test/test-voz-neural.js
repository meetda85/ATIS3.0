/* Pruebas de la voz neuronal local (node test/test-voz-neural.js)
 *
 * Las que necesitan a Piper instalado se omiten solas si no está, para que la
 * suite corra igual en una computadora sin la carpeta «voz».
 */
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const RAIZ = path.join(__dirname, '..');
const voz = require(path.join(RAIZ, 'servidor', 'voz-piper.js'));
const instalador = require(path.join(RAIZ, 'servidor', 'instalar-voz.js'));

const PUERTO = 8900 + Math.floor(Math.random() * 600);
const BASE = 'http://127.0.0.1:' + PUERTO;

const hijos = new Set();
function arrancarServidor() {
  const h = spawn('node', [path.join(RAIZ, 'servidor', 'servidor.js'), '--puerto', String(PUERTO)],
    { stdio: 'ignore' });
  hijos.add(h);
  h.on('exit', () => hijos.delete(h));
  return h;
}
function apagarTodo() { for (const h of hijos) { try { h.kill('SIGKILL'); } catch (e) { /* ignorado */ } } }
process.on('exit', apagarTodo);
['SIGINT', 'SIGTERM', 'uncaughtException'].forEach(ev => process.on(ev, () => { apagarTodo(); process.exit(1); }));

let pass = 0, fail = 0, omitidas = 0;
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
async function test(nombre, fn) {
  try { await fn(); pass++; console.log('  ok   ' + nombre); }
  catch (e) { fail++; console.log('  FAIL ' + nombre + '\n       ' + e.message); }
}
function omitir(nombre, motivo) { omitidas++; console.log('  --   ' + nombre + ' (' + motivo + ')'); }

/* Un WAV armado a mano: así se comprueba que la duración se lee, no se estima */
function wavDePrueba(ruta, segundos, muestreo, canales) {
  muestreo = muestreo || 22050; canales = canales || 1;
  const datos = Math.round(segundos * muestreo * canales * 2);
  const b = Buffer.alloc(44 + datos);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(36 + datos, 4);
  b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(canales, 22);
  b.writeUInt32LE(muestreo, 24);
  b.writeUInt32LE(muestreo * canales * 2, 28);
  b.writeUInt16LE(canales * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'ascii');
  b.writeUInt32LE(datos, 40);
  fs.writeFileSync(ruta, b);
  return ruta;
}

const GUION_ES = 'Aeropuerto Internacional de la Ciudad de México, información Charlie. ' +
  'Viento cero cinco cero grados ocho nudos. Visibilidad diez millas. Altímetro tres cero tres nueve.';
const GUION_EN = 'Mexico City International Airport, information Charlie. ' +
  'Wind zero five zero degrees eight knots. Visibility ten miles. Altimeter three zero three niner.';

(async () => {
  const hay = voz.estado(true);

  /* ============================================================ el módulo == */
  console.log('\nVoz neuronal: reconocer el motor y las voces');

  await test('el idioma se saca del nombre del modelo', () => {
    assert.strictEqual(voz.idiomaDeArchivo('es_MX-claude-high.onnx'), 'es');
    assert.strictEqual(voz.idiomaDeArchivo('es_ES-davefx-medium.onnx'), 'es');
    assert.strictEqual(voz.idiomaDeArchivo('en_US-lessac-medium.onnx'), 'en');
    assert.strictEqual(voz.idiomaDeArchivo('en_GB-alan-low.onnx'), 'en');
    assert.strictEqual(voz.idiomaDeArchivo('de_DE-thorsten-high.onnx'), '');
    assert.strictEqual(voz.idiomaDeArchivo('cualquiera.onnx'), '');
  });

  await test('la velocidad del navegador se traduce a la escala de Piper', () => {
    assert.strictEqual(voz.escalaLargo(1), 1);
    assert.ok(voz.escalaLargo(0.8) > 1, 'más despacio debe alargar');
    assert.ok(voz.escalaLargo(1.25) < 1, 'más rápido debe acortar');
    /* nada de valores absurdos aunque lleguen */
    assert.strictEqual(voz.escalaLargo(0), 1);
    assert.strictEqual(voz.escalaLargo('x'), 1);
    assert.strictEqual(voz.escalaLargo(-3), 1);
    assert.ok(voz.escalaLargo(99) >= 0.5, 'queda acotado');
  });

  await test('la duración se lee del encabezado del WAV, no se estima', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atis-wav-'));
    try {
      assert.strictEqual(voz.duracionWav(wavDePrueba(path.join(dir, 'a.wav'), 3, 22050, 1)), 3);
      assert.strictEqual(voz.duracionWav(wavDePrueba(path.join(dir, 'b.wav'), 12.5, 16000, 1)), 12.5);
      assert.strictEqual(voz.duracionWav(wavDePrueba(path.join(dir, 'c.wav'), 2, 44100, 2)), 2);
      /* un archivo que no es WAV no debe reventar */
      fs.writeFileSync(path.join(dir, 'd.wav'), 'esto no es audio');
      assert.strictEqual(voz.duracionWav(path.join(dir, 'd.wav')), 0);
      assert.strictEqual(voz.duracionWav(path.join(dir, 'no-existe.wav')), 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  await test('sin la carpeta instalada avisa qué falta y no se cae', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atis-voz-'));
    try {
      const salida = execFileSync('node', ['-e',
        'console.log(JSON.stringify(require(' + JSON.stringify(path.join(RAIZ, 'servidor', 'voz-piper.js')) + ').estado(true)))'],
        { env: Object.assign({}, process.env, { ATIS_VOZ_DIR: dir }), encoding: 'utf8' });
      const e = JSON.parse(salida);
      assert.strictEqual(e.disponible, false);
      assert.strictEqual(e.completa, false);
      assert.strictEqual(e.binario, '');
      assert.strictEqual(e.voces.length, 0);
      assert.strictEqual(e.falta.length, 3, 'falta el motor y las dos voces');
      assert.ok(/motor/.test(e.falta[0]));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  await test('un .onnx truncado no se toma por una voz', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atis-voz-'));
    try {
      fs.mkdirSync(path.join(dir, 'voces'));
      fs.writeFileSync(path.join(dir, 'voces', 'es_MX-roto-high.onnx'), Buffer.alloc(2048));
      fs.writeFileSync(path.join(dir, 'voces', 'es_MX-roto-high.onnx.json'), '{}');
      const salida = execFileSync('node', ['-e',
        'console.log(JSON.stringify(require(' + JSON.stringify(path.join(RAIZ, 'servidor', 'voz-piper.js')) + ').buscarVoces()))'],
        { env: Object.assign({}, process.env, { ATIS_VOZ_DIR: dir }), encoding: 'utf8' });
      assert.strictEqual(JSON.parse(salida).length, 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  await test('la dirección de descarga de cada voz se arma bien', () => {
    assert.strictEqual(instalador.rutaDeVoz('es_MX-claude-high'), 'es/es_MX/claude/high/es_MX-claude-high');
    assert.strictEqual(instalador.rutaDeVoz('en_US-lessac-medium'), 'en/en_US/lessac/medium/en_US-lessac-medium');
    assert.strictEqual(instalador.rutaDeVoz('es_MX-ald-x_low'), 'es/es_MX/ald/x_low/es_MX-ald-x_low');
    assert.throws(() => instalador.rutaDeVoz('una-voz-cualquiera'));
  });

  await test('hay un paquete de Piper para esta computadora', () => {
    const clave = process.platform + '-' + process.arch;
    assert.ok(instalador.PAQUETES[clave], 'no hay paquete para ' + clave);
  });

  /* ======================================================== la síntesis == */
  console.log('\nVoz neuronal: generar el audio');

  if (!hay.disponible) {
    omitir('generar el audio del ATIS', 'Piper no está instalado: ejecute VOZ.bat');
    omitir('el mismo texto no se genera dos veces', 'Piper no está instalado');
    omitir('un texto vacío se rechaza', 'Piper no está instalado');
  } else {
    let primero = null;

    await test('genera el audio del ATIS y dice cuánto dura', async () => {
      primero = await voz.sintetizar({ texto: GUION_ES, lang: 'es', velocidad: 0.95 });
      assert.ok(/^[0-9a-f]{40}$/.test(primero.hash), 'el nombre del archivo es el resumen del texto');
      assert.strictEqual(primero.lang, 'es');
      assert.ok(primero.segundos > 5, 'debe durar algo: ' + primero.segundos);
      assert.ok(primero.bytes > 10000, 'el WAV no puede venir vacío');
      assert.ok(fs.existsSync(voz.rutaDe(primero.hash)), 'el archivo quedó en el caché');
    });

    await test('el mismo texto no se genera dos veces', async () => {
      const t = Date.now();
      const otra = await voz.sintetizar({ texto: GUION_ES, lang: 'es', velocidad: 0.95 });
      assert.strictEqual(otra.hash, primero.hash);
      assert.strictEqual(otra.nuevo, false, 'debió salir del caché');
      assert.ok(Date.now() - t < 500, 'un acierto de caché tiene que ser inmediato');
      assert.strictEqual(otra.segundos, primero.segundos);
    });

    await test('si cambia el texto o la velocidad, cambia el audio', async () => {
      const otroTexto = await voz.sintetizar({ texto: GUION_ES + ' Pista en uso cero cinco.', lang: 'es', velocidad: 0.95 });
      assert.notStrictEqual(otroTexto.hash, primero.hash);
      const otraVel = await voz.sintetizar({ texto: GUION_ES, lang: 'es', velocidad: 0.8 });
      assert.notStrictEqual(otraVel.hash, primero.hash);
      assert.ok(otraVel.segundos > primero.segundos, 'más despacio debe durar más');
    });

    await test('dos peticiones iguales a la vez generan un solo archivo', async () => {
      const texto = GUION_EN + ' Report receiving information Charlie.';
      const [a, b] = await Promise.all([
        voz.sintetizar({ texto: texto, lang: 'en' }),
        voz.sintetizar({ texto: texto, lang: 'en' })
      ]);
      assert.strictEqual(a.hash, b.hash);
      /* La segunda se cuelga de la primera: recibe el mismo resultado, no una
         segunda corrida de Piper. Si la primera ya había terminado, la segunda
         sale del caché. Cualquiera de las dos cosas está bien; dos corridas no. */
      assert.ok(a === b || b.nuevo === false, 'se generó el mismo audio dos veces');
    });

    await test('un texto vacío o imposible se rechaza con un motivo claro', async () => {
      await assert.rejects(() => voz.sintetizar({ texto: '   ', lang: 'es' }), /no hay texto/);
      await assert.rejects(() => voz.sintetizar({ texto: 'x'.repeat(9000), lang: 'es' }), /caracteres/);
      await assert.rejects(() => voz.sintetizar({ texto: 'hola', lang: 'es', voz: 'no_existe' })
        .then((r) => { assert.notStrictEqual(r.voz, 'no_existe'); throw new Error('cayó en la voz por omisión'); }),
        /cayó en la voz por omisión/);
    });

    await test('un hash inventado no devuelve ningún archivo', () => {
      assert.strictEqual(voz.rutaDe('0'.repeat(40)), null);
      assert.strictEqual(voz.rutaDe('../../etc/passwd'), null);
      assert.strictEqual(voz.rutaDe(''), null);
    });
  }

  /* ======================================================== el servidor == */
  console.log('\nVoz neuronal: el servidor (puerto ' + PUERTO + ')');
  arrancarServidor();
  await dormir(1200);

  await test('dice si la voz neuronal está instalada', async () => {
    const r = await fetch(BASE + '/api/voz');
    assert.strictEqual(r.status, 200);
    const d = await r.json();
    assert.strictEqual(typeof d.disponible, 'boolean');
    assert.strictEqual(typeof d.completa, 'boolean');
    assert.ok(Array.isArray(d.voces));
    assert.ok(Array.isArray(d.falta));
    assert.ok(d.carpeta, 'tiene que decir dónde busca');
  });

  await test('la comprobación del programa incluye la voz', async () => {
    const d = await fetch(BASE + '/api/salud').then(r => r.json());
    assert.ok(d.voz, 'falta el apartado de la voz');
    assert.strictEqual(typeof d.voz.disponible, 'boolean');
  });

  if (!hay.disponible) {
    omitir('sintetiza los dos idiomas de una vez', 'Piper no está instalado');
    omitir('entrega el audio y atiende los saltos del deslizador', 'Piper no está instalado');
  } else {
    let piezas = null;

    await test('sintetiza los dos idiomas de una vez', async () => {
      const d = await fetch(BASE + '/api/voz/sintetizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piezas: [{ lang: 'es', texto: GUION_ES }, { lang: 'en', texto: GUION_EN }],
          velocidad: 0.95, pausaFrase: 0.25
        })
      }).then(r => r.json());
      piezas = d.piezas;
      assert.strictEqual(piezas.length, 2);
      assert.strictEqual(piezas[0].lang, 'es');
      assert.strictEqual(piezas[1].lang, 'en');
      piezas.forEach((p) => {
        assert.ok(!p.error, 'no debió fallar: ' + p.error);
        assert.ok(p.segundos > 4, p.lang + ' dura ' + p.segundos);
        assert.ok(/^\/api\/voz\/audio\/[0-9a-f]{40}\.wav$/.test(p.archivo), p.archivo);
      });
      assert.ok(d.estado && d.estado.disponible);
    });

    await test('si un idioma falla, el otro sale igual', async () => {
      const d = await fetch(BASE + '/api/voz/sintetizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piezas: [{ lang: 'es', texto: GUION_ES }, { lang: 'en', texto: '' }] })
      }).then(r => r.json());
      assert.strictEqual(d.piezas.length, 2);
      assert.ok(d.piezas[0].archivo, 'el español tenía que salir');
      assert.ok(d.piezas[1].error, 'el inglés tenía que avisar el motivo');
    });

    await test('entrega el audio completo', async () => {
      const r = await fetch(BASE + piezas[0].archivo);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.headers.get('content-type'), 'audio/wav');
      assert.strictEqual(r.headers.get('accept-ranges'), 'bytes');
      const buf = Buffer.from(await r.arrayBuffer());
      assert.strictEqual(buf.length, piezas[0].bytes);
      assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF');
    });

    await test('atiende los saltos del deslizador (Range)', async () => {
      const r = await fetch(BASE + piezas[0].archivo, { headers: { Range: 'bytes=100-199' } });
      assert.strictEqual(r.status, 206);
      assert.strictEqual(r.headers.get('content-range'), 'bytes 100-199/' + piezas[0].bytes);
      const buf = Buffer.from(await r.arrayBuffer());
      assert.strictEqual(buf.length, 100);
      /* el final del archivo, que es lo que pide el navegador al arrancar */
      const fin = await fetch(BASE + piezas[0].archivo, { headers: { Range: 'bytes=-50' } });
      assert.strictEqual(fin.status, 206);
      assert.strictEqual(fin.headers.get('content-range'),
        'bytes ' + (piezas[0].bytes - 50) + '-' + (piezas[0].bytes - 1) + '/' + piezas[0].bytes);
      /* un rango que se pasa del final se recorta, no revienta */
      const largo = await fetch(BASE + piezas[0].archivo, { headers: { Range: 'bytes=0-999999999' } });
      assert.strictEqual(largo.status, 206);
    });

    await test('un audio que no existe contesta 404, no el archivo de otro', async () => {
      const r = await fetch(BASE + '/api/voz/audio/' + '1'.repeat(40) + '.wav');
      assert.strictEqual(r.status, 404);
      const malo = await fetch(BASE + '/api/voz/audio/..%2F..%2Fpackage.json');
      assert.ok(malo.status === 404, 'no puede servir nada de fuera del caché');
    });

    await test('vaciar los audios guardados los borra de verdad', async () => {
      const d = await fetch(BASE + '/api/voz/limpiar', { method: 'POST' }).then(r => r.json());
      assert.ok(d.borrados >= 1, 'no borró nada');
      assert.strictEqual(d.estado.cache.archivos, 0);
      const r = await fetch(BASE + piezas[0].archivo);
      assert.strictEqual(r.status, 404, 'después de vaciar, el audio ya no está');
    });
  }

  console.log('');
  console.log(pass + ' pruebas correctas, ' + fail + ' fallidas' +
    (omitidas ? ', ' + omitidas + ' omitidas' : ''));
  apagarTodo();
  process.exit(fail ? 1 : 0);
})();
