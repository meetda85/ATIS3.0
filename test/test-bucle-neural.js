/* Pruebas del bucle con voz neuronal (node test/test-bucle-neural.js)
   Monta un navegador simulado —fetch, Audio y URL.createObjectURL— para
   provocar audios que fallan, audios que se cuelgan y un servidor que se cae a
   media transmisión, y comprueba que el bucle nunca se detiene. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');

let pass = 0, fail = 0;
function test(name, fn) {
  return fn().then(
    () => { pass++; console.log('  ok   ' + name); },
    (e) => { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
  );
}
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

/* Navegador simulado ----------------------------------------------------- */
function montar(opciones) {
  const cfg = Object.assign({
    modo: 'normal',        /* normal | errorAudio | audioMuerto | bloqueado */
    segundos: 0.4,         /* lo que dura cada pista */
    completa: true,
    faltaIngles: false,
    servidorCaido: false
  }, opciones);

  const registro = { fetch: [], play: [], blobs: 0, revocados: 0 };

  function respuesta(cuerpo, ok) {
    return Promise.resolve({
      ok: ok !== false, status: ok === false ? 500 : 200,
      json: () => Promise.resolve(cuerpo),
      blob: () => Promise.resolve({ size: 1000 })
    });
  }

  const ESTADO = {
    disponible: true, completa: cfg.completa,
    voces: [{ nombre: 'es_MX-claude-high', lang: 'es', calidad: 'high', mb: 60, config: true },
            { nombre: 'en_US-lessac-medium', lang: 'en', calidad: 'medium', mb: 60, config: true }],
    falta: [], carpeta: '/atis/voz', cache: { archivos: 2, mb: 1.6 }, binario: '/atis/voz/piper/piper'
  };

  function fetchFalso(url, opts) {
    registro.fetch.push({ url: String(url), metodo: (opts && opts.method) || 'GET' });
    if (cfg.servidorCaido) return Promise.reject(new Error('fetch failed'));
    if (/^\/api\/voz\/audio\//.test(url)) { registro.blobs++; return respuesta(null); }
    if (/^\/api\/voz\/sintetizar/.test(url)) {
      const cuerpo = JSON.parse(opts.body);
      const piezas = cuerpo.piezas.map((p, i) => (
        (p.lang === 'en' && cfg.faltaIngles)
          ? { lang: 'en', error: 'no hay voz instalada para inglés' }
          : {
            hash: String(i).repeat(40).slice(0, 40), lang: p.lang,
            archivo: '/api/voz/audio/' + String(i).repeat(40).slice(0, 40) + '.wav',
            voz: p.lang === 'es' ? 'es_MX-claude-high' : 'en_US-lessac-medium',
            segundos: cfg.segundos, bytes: 100000, caracteres: p.texto.length, nuevo: true
          }));
      return respuesta({ piezas: piezas, estado: ESTADO });
    }
    if (/^\/api\/voz\/limpiar/.test(url)) return respuesta({ borrados: 2, estado: ESTADO });
    if (/^\/api\/voz/.test(url)) return respuesta(ESTADO);
    return respuesta({}, false);
  }

  /* <audio> simulado: avanza el tiempo solo y avisa cuando termina */
  class Audio {
    constructor(src) {
      this.src = src || '';
      this.currentTime = 0;
      this.volume = 1;
      this.paused = true;
      this.preload = '';
      this.error = null;
      this._oyentes = {};
      this._reloj = null;
    }
    addEventListener(ev, fn) { (this._oyentes[ev] = this._oyentes[ev] || []).push(fn); }
    _avisar(ev) { (this._oyentes[ev] || []).forEach((f) => f({ type: ev })); }
    pause() { this.paused = true; clearInterval(this._reloj); this._reloj = null; }
    play() {
      registro.play.push({ src: this.src, desde: this.currentTime, t: Date.now() });
      if (cfg.modo === 'bloqueado') {
        const e = new Error('play() failed'); e.name = 'NotAllowedError';
        return Promise.reject(e);
      }
      if (cfg.modo === 'errorAudio') {
        this.error = { code: 4 };
        setTimeout(() => this._avisar('error'), 5);
        return Promise.resolve();
      }
      this.paused = false;
      if (cfg.modo === 'audioMuerto') return Promise.resolve();   /* ni avanza ni termina */
      clearInterval(this._reloj);
      this._reloj = setInterval(() => {
        this.currentTime += 0.05;
        this._avisar('timeupdate');
        if (this.currentTime >= cfg.segundos) {
          clearInterval(this._reloj); this._reloj = null;
          this.paused = true;
          this._avisar('ended');
        }
      }, 50);
      return Promise.resolve();
    }
  }

  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, Error, Math, JSON,
    fetch: fetchFalso,
    Audio: Audio,
    URL: {
      createObjectURL: (b) => 'blob:atis/' + (registro.blobs) + '-' + Math.random().toString(36).slice(2),
      revokeObjectURL: () => { registro.revocados++; }
    },
    location: { protocol: 'http:', origin: 'http://127.0.0.1:8080' },
    navigator: { userAgent: 'prueba', onLine: true },
    document: { addEventListener: () => {}, visibilityState: 'visible' }
  });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(root, 'js/voz-neural.js'), 'utf8'), ctx,
    { filename: 'js/voz-neural.js' });

  return { ATIS: ctx.ATIS, registro, cfg };
}

const GUION = [
  { lang: 'es', text: 'Aeropuerto Internacional de la Ciudad de México, información Alfa.' },
  { lang: 'en', text: 'Mexico City International Airport, information Alfa.' }
];
const OPCIONES = { loop: true, gap: 0, cycleGap: 0, rate: { es: 0.95, en: 0.95 } };

(async () => {
  console.log('\nBucle con voz neuronal');

  await test('pregunta al servidor si la voz está instalada', async () => {
    const { ATIS } = montar({});
    const sv = await ATIS.neural.comprobar(true);
    assert.strictEqual(sv.disponible, true);
    assert.strictEqual(sv.completa, true);
    assert.strictEqual(ATIS.neural.vocesDe('es').length, 1);
    assert.strictEqual(ATIS.neural.vocesDe('en').length, 1);
    assert.strictEqual(ATIS.neural.vocesDe('de').length, 0);
  });

  await test('sin servidor no finge que la voz existe', async () => {
    const { ATIS } = montar({ servidorCaido: true });
    const sv = await ATIS.neural.comprobar(true);
    assert.strictEqual(sv.disponible, false);
    assert.ok(sv.error, 'tiene que decir por qué');
    assert.strictEqual(ATIS.neural.supported, false);
  });

  await test('transmite en bucle sin detenerse', async () => {
    const { ATIS, registro } = montar({});
    const r = await ATIS.neural.play(GUION, OPCIONES);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.pistas.length, 2);
    await dormir(1800);
    assert.ok(ATIS.neural.state.playing, 'el bucle se detuvo solo');
    assert.ok(ATIS.neural.state.cycle >= 2, 'no completó dos ciclos, va en ' + ATIS.neural.state.cycle);
    const es = registro.play.filter((p) => p.src === r.pistas[0].url).length;
    const en = registro.play.filter((p) => p.src === r.pistas[1].url).length;
    assert.ok(es >= 2 && en >= 2, 'faltó un idioma: es=' + es + ' en=' + en);
    ATIS.neural.stop();
  });

  await test('el audio queda en memoria: se cae el servidor y el bucle sigue', async () => {
    const m = montar({});
    await m.ATIS.neural.play(GUION, OPCIONES);
    const ciclos = m.ATIS.neural.state.cycle;
    m.cfg.servidorCaido = true;          /* a partir de aquí no hay red ni servidor */
    await dormir(1500);
    assert.ok(m.ATIS.neural.state.playing, 'se detuvo al caerse el servidor');
    assert.ok(m.ATIS.neural.state.cycle > ciclos, 'dejó de dar vueltas');
    m.ATIS.neural.stop();
  });

  await test('si falta el inglés, el español sale igual', async () => {
    const { ATIS } = montar({ faltaIngles: true });
    const r = await ATIS.neural.play(GUION, OPCIONES);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.pistas.length, 1);
    assert.strictEqual(r.pistas[0].lang, 'es');
    assert.strictEqual(r.faltaron.length, 1);
    assert.ok(/inglés/.test(r.faltaron[0].error));
    await dormir(900);
    assert.ok(ATIS.neural.state.playing);
    assert.ok(ATIS.neural.state.cycle >= 2);
    ATIS.neural.stop();
  });

  await test('si no hay audio de ningún idioma, lo dice y no se queda colgado', async () => {
    const { ATIS } = montar({ servidorCaido: true });
    await assert.rejects(() => ATIS.neural.play(GUION, OPCIONES));
    assert.strictEqual(ATIS.neural.state.playing, false);
  });

  await test('un audio que falla se reintenta y luego se omite, sin parar el bucle', async () => {
    const { ATIS, registro } = montar({ modo: 'errorAudio' });
    await ATIS.neural.play(GUION, OPCIONES);
    await dormir(1500);
    assert.ok(ATIS.neural.state.playing, 'el bucle murió con el audio');
    const reintentos = ATIS.neural.registro().filter((e) => e.tipo === 'reintento').length;
    const omitidos = ATIS.neural.registro().filter((e) => e.tipo === 'omitido').length;
    assert.ok(reintentos >= 2, 'no reintentó: ' + reintentos);
    assert.ok(omitidos >= 1, 'no llegó a omitir: ' + omitidos);
    assert.ok(ATIS.neural.state.cycle >= 1);
    ATIS.neural.stop();
  });

  await test('el navegador bloquea el audio: queda anotado y el bucle avanza', async () => {
    const { ATIS } = montar({ modo: 'bloqueado' });
    await ATIS.neural.play(GUION, OPCIONES);
    await dormir(1200);
    const errores = ATIS.neural.registro().filter((e) => /no dejó sonar/.test(e.motivo || ''));
    assert.ok(errores.length >= 1, 'no anotó el bloqueo');
    assert.ok(ATIS.neural.state.playing, 'se detuvo en lugar de seguir intentando');
    ATIS.neural.stop();
  });

  await test('un audio colgado lo levanta el latido', async () => {
    const { ATIS } = montar({ modo: 'audioMuerto', segundos: 1 });
    await ATIS.neural.play(GUION, OPCIONES);
    await dormir(9000);
    const reanudadas = ATIS.neural.registro().filter((e) => e.tipo === 'reanudada').length;
    const vigilancias = ATIS.neural.registro().filter((e) => e.tipo === 'vigilancia').length;
    assert.ok(reanudadas + vigilancias >= 1, 'nadie lo levantó');
    assert.ok(ATIS.neural.state.playing, 'se quedó muerto');
    ATIS.neural.stop();
  });

  await test('el deslizador adelanta y retrasa por segundos de verdad', async () => {
    const { ATIS } = montar({ segundos: 30 });
    await ATIS.neural.play(GUION, { loop: true, gap: 3, cycleGap: 5 });
    /* 30 s de español + 3 de pausa + 30 de inglés + 5 de pausa */
    assert.strictEqual(ATIS.neural.duracionCiclo(), 68);
    assert.strictEqual(ATIS.neural.state.total, 68);
    const tramos = ATIS.neural.fragmentos();
    assert.strictEqual(tramos.length, 4);
    assert.deepStrictEqual(tramos.map((t) => t.inicio).join(','), '0,30,33,63');
    assert.deepStrictEqual(tramos.map((t) => t.pausa).join(','), 'false,true,false,true');

    assert.strictEqual(ATIS.neural.irA(40), true);      /* dentro del inglés */
    assert.strictEqual(ATIS.neural.state.lang, 'en');
    assert.ok(/0:4\d/.test(ATIS.neural.state.etiqueta), 'quedó en ' + ATIS.neural.state.etiqueta);

    ATIS.neural.irA(10);                                 /* de vuelta al español */
    assert.strictEqual(ATIS.neural.state.lang, 'es');
    ATIS.neural.saltar(1);                               /* diez segundos adelante */
    assert.ok(ATIS.neural.state.chunk >= 20, 'no adelantó: ' + ATIS.neural.state.etiqueta);
    ATIS.neural.saltar(-1);
    assert.ok(ATIS.neural.state.chunk <= 12, 'no retrasó: ' + ATIS.neural.state.etiqueta);
    assert.strictEqual(ATIS.neural.irA(99999), true);     /* fuera de rango, sin reventar */
    assert.strictEqual(ATIS.neural.irA(-5), true);
    ATIS.neural.stop();
    assert.strictEqual(ATIS.neural.irA(10), false, 'detenido no se puede saltar');
  });

  await test('la etiqueta del tiempo se escribe en minutos y segundos', async () => {
    const { ATIS } = montar({});
    assert.strictEqual(ATIS.neural.reloj(0), '0:00');
    assert.strictEqual(ATIS.neural.reloj(9), '0:09');
    assert.strictEqual(ATIS.neural.reloj(65), '1:05');
    assert.strictEqual(ATIS.neural.reloj(600), '10:00');
    assert.strictEqual(ATIS.neural.reloj(-4), '0:00');
  });

  await test('los datos nuevos esperan el corte entre ciclos', async () => {
    const { ATIS } = montar({});
    await ATIS.neural.play(GUION, OPCIONES);
    let cuando = null;
    const puesto = ATIS.neural.alFinDeCiclo(() => { cuando = ATIS.neural.state.cycle; });
    assert.strictEqual(puesto, true, 'con el bucle al aire tiene que esperar');
    assert.strictEqual(ATIS.neural.ciclosPendientes(), 1);
    await dormir(1500);
    assert.ok(cuando !== null, 'nunca se aplicó');
    assert.ok(cuando >= 2, 'se aplicó a media frase, en el ciclo ' + cuando);
    assert.strictEqual(ATIS.neural.ciclosPendientes(), 0);
    ATIS.neural.stop();
  });

  await test('detenido, la tarea se hace al momento', async () => {
    const { ATIS } = montar({});
    let hecho = false;
    const puesto = ATIS.neural.alFinDeCiclo(() => { hecho = true; });
    assert.strictEqual(puesto, false);
    assert.strictEqual(hecho, true);
  });

  await test('pausa y continúa sin perder el lugar', async () => {
    const { ATIS } = montar({ segundos: 30 });
    await ATIS.neural.play(GUION, OPCIONES);
    await dormir(300);
    ATIS.neural.pause();
    assert.strictEqual(ATIS.neural.state.paused, true);
    const donde = ATIS.neural.state.chunk;
    await dormir(400);
    assert.strictEqual(ATIS.neural.state.chunk, donde, 'siguió avanzando en pausa');
    ATIS.neural.resume();
    assert.strictEqual(ATIS.neural.state.paused, false);
    await dormir(400);
    assert.ok(ATIS.neural.state.playing);
    ATIS.neural.stop();
  });

  await test('stop detiene de verdad', async () => {
    const { ATIS } = montar({});
    await ATIS.neural.play(GUION, OPCIONES);
    await dormir(300);
    ATIS.neural.stop();
    const ciclos = ATIS.neural.state.cycle;
    await dormir(800);
    assert.strictEqual(ATIS.neural.state.playing, false);
    assert.strictEqual(ATIS.neural.state.cycle, ciclos, 'siguió girando después del stop');
  });

  await test('solo pide una vez cada audio, aunque el texto se repita', async () => {
    const { ATIS, registro } = montar({});
    await ATIS.neural.play(GUION, OPCIONES);
    const bajadas = registro.fetch.filter((f) => /\/api\/voz\/audio\//.test(f.url)).length;
    await dormir(900);
    const despues = registro.fetch.filter((f) => /\/api\/voz\/audio\//.test(f.url)).length;
    assert.strictEqual(bajadas, 2, 'bajó ' + bajadas + ' audios, debían ser 2');
    assert.strictEqual(despues, bajadas, 'volvió a bajar el audio a mitad del bucle');
    ATIS.neural.stop();
  });

  console.log('');
  console.log(pass + ' pruebas correctas, ' + fail + ' fallidas');
  process.exit(fail ? 1 : 0);
})();
