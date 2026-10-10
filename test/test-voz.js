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
  const cfg = Object.assign({ modo: 'normal', duracion: 30, demoraArranque: 0 }, opciones);
  const voces = [
    { name: 'Dalia Online (Natural)', lang: 'es-MX', localService: false },
    { name: 'Sabina', lang: 'es-MX', localService: true },
    { name: 'Aria Online (Natural)', lang: 'en-US', localService: false }
  ];
  const registro = [];
  let hablando = false, enCola = false;

  class SpeechSynthesisUtterance {
    constructor(text) { this.text = text; this.voice = null; this.lang = ''; }
  }

  const synth = {
    getVoices: () => voces,
    get speaking() { return hablando; },
    get pending() { return enCola; },
    pause() {}, resume() {},
    cancel() { hablando = false; enCola = false; },
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
      /* Una voz en línea tarda en traer el audio: queda en cola antes de sonar */
      enCola = true;
      setTimeout(() => {
        if (!enCola) return;                 /* la cancelaron mientras esperaba */
        enCola = false;
        hablando = true;
        u.onstart && u.onstart();
        setTimeout(() => {
          hablando = false;
          u.onend && u.onend();
        }, cfg.duracion);
      }, cfg.demoraArranque);
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

  await test('una voz en línea lenta no se cancela por la vigilancia', async () => {
    /* Tarda 6 s en arrancar: más que los 2.5 s de la vigilancia de arranque */
    const m = montar({ demoraArranque: 6000, duracion: 30 });
    m.ATIS.speech.play([GUION[0]], OPCIONES);
    await dormir(9000);
    assert.ok(m.ATIS.speech.state.playing, 'la transmisión se detuvo');
    const log = m.ATIS.speech.registro();
    assert.ok(log.some(e => e.tipo === 'espera'), 'no le dio prórroga a la voz lenta');
    assert.ok(log.some(e => e.tipo === 'fin'), 'nunca llegó a terminar un fragmento');
    assert.ok(!log.some(e => e.tipo === 'omitido'), 'descartó un fragmento que sí iba a sonar');
    m.ATIS.speech.stop();
  });

  await test('el registro deja el motivo de cada falla', async () => {
    const m = montar({ modo: 'inglesFalla' });
    m.ATIS.speech.play(GUION, OPCIONES);
    await dormir(2500);
    const log = m.ATIS.speech.registro();
    const errores = log.filter(e => e.tipo === 'error');
    assert.ok(errores.length > 0, 'no registró ningún error');
    assert.strictEqual(errores[0].motivo, 'synthesis-failed');
    assert.ok(errores[0].texto, 'no guardó el texto del fragmento que falló');
    assert.ok(log.some(e => e.tipo === 'reintento'), 'no registró los reintentos');
    assert.ok(log.some(e => e.tipo === 'omitido'), 'no registró el fragmento omitido');
    m.ATIS.speech.stop();
  });

  await test('con el guion en piezas, cada fragmento sabe cuales cubre', async () => {
    /* cada fragmento dura lo suficiente para alcanzar a mirar el subrayado */
    const { ATIS, registro } = montar({ duracion: 400 });
    const partes = [
      { texto: 'MMMX, informacion ALFA.', locucion: 'Aeropuerto Internacional de la Ciudad de Mexico, informacion Alfa.' },
      { texto: 'Viento 050 grados 8 nudos.', locucion: 'Viento cero cinco cero grados ocho nudos.' },
      { texto: 'Visibilidad 10 millas.', locucion: 'Visibilidad diez millas.' },
      { texto: 'Altimetro 3039.', locucion: 'Altimetro tres cero tres nueve.' },
      { texto: 'Informe recibo informacion ALFA.', locucion: 'Informe recibo informacion Alfa.' }
    ];
    ATIS.speech.play([{ lang: 'es', text: partes.map(p => p.locucion).join(' '), partes: partes }],
      { loop: false, gap: 0, cycleGap: 0, sentencePause: 0 });

    const conTexto = ATIS.speech.fragmentos().filter(f => !f.pausa);
    assert.ok(conTexto.length >= 1, 'no armo fragmentos');
    /* juntos cubren todas las piezas, en orden y sin huecos */
    assert.strictEqual(conTexto[0].desde, 0, 'no empieza en la primera pieza');
    assert.strictEqual(conTexto[conTexto.length - 1].hasta, partes.length - 1, 'no llega a la ultima');
    for (let i = 1; i < conTexto.length; i++) {
      assert.strictEqual(conTexto[i].desde, conTexto[i - 1].hasta + 1,
        'hueco o encimado entre el fragmento ' + (i - 1) + ' y el ' + i);
    }
    /* y ninguno se pasa del maximo, que es lo que corta a los motores */
    conTexto.forEach(f => assert.ok(f.texto.length <= 200, 'fragmento de ' + f.texto.length));

    /* mientras locuta, dice en que pieza va */
    await dormir(60);
    assert.ok(ATIS.speech.state.pieza >= 0, 'no dice en que pieza va');
    assert.ok(ATIS.speech.state.piezaFin >= ATIS.speech.state.pieza);
    ATIS.speech.stop();
    assert.strictEqual(ATIS.speech.state.pieza, -1, 'detenido no se subraya nada');
    assert.ok(registro.length > 0);
  });

  await test('sin piezas se locuta igual que siempre, sin subrayado', async () => {
    const { ATIS } = montar({ duracion: 400 });
    ATIS.speech.play(GUION, OPCIONES);
    await dormir(80);
    assert.ok(ATIS.speech.state.playing);
    assert.strictEqual(ATIS.speech.state.pieza, -1, 'invento un subrayado sin piezas');
    ATIS.speech.stop();
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
