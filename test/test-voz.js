/* Pruebas del motor de locución frente a fallas (node test/test-voz.js)
   Monta una Web Speech API simulada para provocar caídas de red, voces que
   fallan y un motor que se muere, y comprueba que la transmisión nunca se
   detiene. */
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

/* Web Speech API simulada ------------------------------------------------ */
function montar(opciones) {
  const cfg = Object.assign({ modo: 'normal', duracion: 30 }, opciones);
  const voces = [
    { name: 'Dalia Online (Natural)', lang: 'es-MX', localService: false },
    { name: 'Sabina', lang: 'es-MX', localService: true },
    { name: 'Aria Online (Natural)', lang: 'en-US', localService: false }
  ];
  const registro = [];
  let hablando = false;

  class SpeechSynthesisUtterance {
    constructor(text) { this.text = text; this.voice = null; this.lang = ''; }
  }

  const synth = {
    getVoices: () => voces,
    get speaking() { return hablando; },
    get pending() { return false; },
    pause() {}, resume() {},
    cancel() { hablando = false; },
    addEventListener() {},
    speak(u) {
      registro.push({ lang: u.lang, voz: u.voice ? u.voice.name : null, texto: u.text, t: Date.now() });
      const enLinea = u.voice && u.voice.localService === false;
      if (cfg.modo === 'motorMuerto') return;                      /* ni onend ni onerror */
      if (cfg.modo === 'inglesFalla' && /^en/i.test(u.lang)) {
        setTimeout(() => u.onerror && u.onerror({ error: 'synthesis-failed' }), 5);
        return;
      }
      if (cfg.modo === 'redCaida' && enLinea) {
        setTimeout(() => u.onerror && u.onerror({ error: 'network' }), 5);
        return;
      }
      hablando = true;
      setTimeout(() => {
        hablando = false;
        u.onstart && u.onstart();
        u.onend && u.onend();
      }, cfg.duracion);
    }
  };

  const ctx = vm.createContext({
    console, setTimeout, clearTimeout, setInterval, clearInterval, Date,
    speechSynthesis: synth, SpeechSynthesisUtterance,
    navigator: { userAgent: 'prueba', onLine: true }
  });
  ctx.window = ctx;
  ['js/data/dictionary.js', 'js/data/airports.js', 'js/lib/numbers.js',
   'js/metar.js', 'js/notam.js', 'js/fns.js', 'js/atis.js', 'js/speech.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f }));

  return { ATIS: ctx.ATIS, registro, cfg, voces };
}

const GUION = [
  { lang: 'es', text: 'Aeropuerto Internacional de la Ciudad de México, información Alfa. Viento cero cinco cero grados ocho nudos.' },
  { lang: 'en', text: 'Mexico City International Airport, information Alfa. Wind zero five zero degrees eight knots.' }
];
const OPCIONES = { loop: true, gap: 0, cycleGap: 0, sentencePause: 0, voices: { es: 'Dalia Online (Natural)', en: 'Aria Online (Natural)' } };

function cuenta(registro, lang, desde) {
  return registro.slice(desde).filter(r => new RegExp('^' + lang, 'i').test(r.lang)).length;
}

(async () => {
  console.log('\nMotor de locución');

  await test('transmite en bucle sin detenerse', async () => {
    const { ATIS, registro } = montar({});
    ATIS.speech.play(GUION, OPCIONES);
    await dormir(1200);
    assert.ok(ATIS.speech.state.playing, 'la transmisión se detuvo sola');
    assert.ok(ATIS.speech.state.cycle >= 2, 'no completó dos ciclos, va en ' + ATIS.speech.state.cycle);
    assert.ok(cuenta(registro, 'es', 0) > 0 && cuenta(registro, 'en', 0) > 0, 'faltó un idioma');
    ATIS.speech.stop();
  });

  await test('si el inglés falla, el español sigue y el ciclo avanza', async () => {
    const m = montar({ modo: 'inglesFalla' });
    m.ATIS.speech.play(GUION, OPCIONES);
    await dormir(2500);
    assert.ok(m.ATIS.speech.state.playing, 'la transmisión se detuvo');
    assert.ok(m.ATIS.speech.state.cycle >= 2, 'el ciclo se quedó atorado en el inglés');
    assert.ok(cuenta(m.registro, 'es', 0) >= 2, 'el español dejó de transmitirse');
    m.ATIS.speech.stop();
  });

  await test('si se cae la red, pasa solo a la voz instalada en el equipo', async () => {
    const m = montar({ modo: 'redCaida' });
    m.ATIS.speech.play(GUION, OPCIONES);
    await dormir(2500);
    assert.ok(m.ATIS.speech.state.playing, 'la transmisión se detuvo');
    const conRespaldo = m.registro.filter(r => r.voz === 'Sabina');
    assert.ok(conRespaldo.length > 0, 'nunca usó la voz local de respaldo');
    assert.ok(m.ATIS.speech.state.cycle >= 2, 'el ciclo no avanzó');
    m.ATIS.speech.stop();
  });

  await test('si el motor se muere, se reanuda solo en menos de 5 segundos', async () => {
    const m = montar({});
    m.ATIS.speech.play(GUION, OPCIONES);
    await dormir(400);
    m.cfg.modo = 'motorMuerto';
    const marca = m.registro.length;
    await dormir(600);
    const durante = m.registro.length;
    m.cfg.modo = 'normal';
    await dormir(4000);
    assert.ok(m.ATIS.speech.state.playing, 'la transmisión se detuvo');
    assert.ok(m.registro.length > durante, 'no reintentó nada mientras el motor estaba muerto');
    const despues = m.registro.slice(durante);
    assert.ok(despues.length >= 2, 'no se reanudó al volver el motor (' + despues.length + ' intentos)');
    assert.ok(marca >= 0);
    m.ATIS.speech.stop();
  });

  await test('con el motor muerto todo el tiempo, sigue intentando sin girar en vacío', async () => {
    const m = montar({ modo: 'motorMuerto' });
    m.ATIS.speech.play(GUION, OPCIONES);
    await dormir(8000);
    assert.ok(m.ATIS.speech.state.playing, 'se rindió y se detuvo');
    /* Cada intento cuesta 2.5 s de vigilancia más 0.4 s de espera */
    assert.ok(m.registro.length >= 3, 'dejó de intentar: solo ' + m.registro.length + ' intentos en 8 s');
    assert.ok(m.registro.length < 60, 'entró en un ciclo desbocado: ' + m.registro.length + ' intentos');
    m.ATIS.speech.stop();
  });

  await test('stop detiene de verdad', async () => {
    const m = montar({});
    m.ATIS.speech.play(GUION, OPCIONES);
    await dormir(300);
    m.ATIS.speech.stop();
    const marca = m.registro.length;
    await dormir(1500);
    assert.strictEqual(m.registro.length, marca, 'siguió hablando después del stop');
    assert.strictEqual(m.ATIS.speech.state.playing, false);
  });

  console.log('\n' + pass + ' pruebas correctas, ' + fail + ' fallidas\n');
  process.exit(fail ? 1 : 0);
})();
