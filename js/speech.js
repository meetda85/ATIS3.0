/* ATIS 3.0 - Motor de locucion en bucle (Web Speech API) */
(function (global) {
  'use strict';
  var ATIS = global.ATIS = global.ATIS || {};

  var synth = global.speechSynthesis;
  var voices = [];
  var readyCbs = [];
  var stateCbs = [];
  var logCbs = [];

  /* Bitácora de la transmisión: lo que pasó, cuándo y por qué */
  var registro = [];
  var MAX_REGISTRO = 400;

  function anotar(tipo, datos) {
    var e = { t: Date.now(), tipo: tipo };
    for (var k in datos) if (Object.prototype.hasOwnProperty.call(datos, k)) e[k] = datos[k];
    registro.push(e);
    if (registro.length > MAX_REGISTRO) registro.shift();
    logCbs.forEach(function (cb) { try { cb(e); } catch (err) { /* ignorado */ } });
    return e;
  }

  var state = {
    playing: false,
    paused: false,
    cycle: 0,
    lang: '',
    chunk: 0,
    total: 0,
    aviso: '',
    respaldo: ''
  };

  var queue = [];          /* [{lang, text}] */
  var options = {
    loop: true,
    gap: 3,                /* segundos entre idiomas */
    cycleGap: 5,           /* segundos entre repeticiones completas */
    voices: { es: null, en: null },
    rate: { es: 0.95, en: 0.95 },
    pitch: { es: 1, en: 1 },
    volume: 1,
    sentencePause: 250       /* milisegundos entre frases, da naturalidad */
  };

  var idx = 0;
  var chunks = [];
  var timer = null;
  var current = null;

  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices() || [];
    if (voices.length) {
      readyCbs.forEach(function (cb) { cb(voices); });
      readyCbs = [];
    }
  }

  if (synth) {
    loadVoices();
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', loadVoices);
    } else {
      synth.onvoiceschanged = loadVoices;
    }
  }

  function onVoicesReady(cb) {
    if (voices.length) { cb(voices); return; }
    var llamado = false;
    function una(list) { if (!llamado) { llamado = true; cb(list); } }
    readyCbs.push(una);
    /* Algunos navegadores tardan en publicar las voces */
    setTimeout(loadVoices, 250);
    setTimeout(loadVoices, 1000);
    /* Si el sistema no tiene ninguna voz, hay que avisarlo igual */
    setTimeout(function () { una(voices); }, 2500);
  }

  function getVoices(langPrefix) {
    if (!langPrefix) return voices.slice();
    return voices.filter(function (v) {
      return String(v.lang || '').toLowerCase().indexOf(langPrefix) === 0;
    });
  }

  /* Una voz neuronal ("natural", "neural") suena humana; las SAPI de Windows suenan roboticas */
  function isNatural(v) {
    return /natural|neural/i.test(v.name || '');
  }

  function voiceScore(v, langPrefix) {
    var name = String(v.name || ''), lang = String(v.lang || '').toLowerCase();
    var score = 0;
    if (isNatural(v)) score += 100;
    else if (/google/i.test(name)) score += 60;
    if (v.localService === false) score += 20;
    if (/desktop/i.test(name)) score -= 15;          /* voces SAPI antiguas */
    if (lang === (langPrefix === 'es' ? 'es-mx' : 'en-us')) score += 15;
    else if (langPrefix === 'es' && /^es-(419|us|co|ar|cl)/.test(lang)) score += 8;
    else if (langPrefix === 'en' && /^en-(ca|gb|au)/.test(lang)) score += 5;
    return score;
  }

  /* Voces del idioma, de mejor a peor calidad */
  function rankedVoices(langPrefix) {
    return getVoices(langPrefix)
      .map(function (v) {
        return { voice: v, name: v.name, lang: v.lang, natural: isNatural(v), score: voiceScore(v, langPrefix) };
      })
      .sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name); });
  }

  function findVoice(name, langPrefix) {
    var v = null;
    if (name) {
      v = voices.filter(function (x) { return x.name === name; })[0] || null;
    }
    if (!v) {
      var best = rankedVoices(langPrefix)[0];
      v = best ? best.voice : null;
    }
    return v;
  }

  /* Divide el guion en fragmentos cortos: los motores TTS cortan textos largos */
  function splitChunks(text, max) {
    max = max || 180;
    var sentences = String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) || [];
    /* Una enumeración larga (la lista de NOTAM) es una sola frase: se parte por comas */
    var partidas = [];
    sentences.forEach(function (frase) {
      if (frase.length <= max) { partidas.push(frase); return; }
      var trozos = frase.split(/,\s*/), acum = '';
      trozos.forEach(function (t, i) {
        var pieza = t + (i === trozos.length - 1 ? '' : ',');
        if ((acum + ' ' + pieza).trim().length > max && acum) { partidas.push(acum.trim()); acum = pieza; }
        else acum = (acum + ' ' + pieza).trim();
      });
      if (acum) partidas.push(acum.trim());
    });
    sentences = partidas;
    var out = [], buf = '';
    sentences.forEach(function (s) {
      s = s.trim();
      if (!s) return;
      if ((buf + ' ' + s).trim().length > max && buf) { out.push(buf.trim()); buf = s; }
      else buf = (buf + ' ' + s).trim();
    });
    if (buf) out.push(buf.trim());
    return out;
  }

  function buildChunks() {
    chunks = [];
    queue.forEach(function (item, qi) {
      splitChunks(item.text).forEach(function (c) {
        chunks.push({ lang: item.lang, text: c, part: qi });
      });
      chunks.push({ lang: item.lang, text: '', pause: qi === queue.length - 1 ? options.cycleGap : options.gap, part: qi });
    });
    state.total = chunks.length;
  }

  function emit() {
    stateCbs.forEach(function (cb) {
      cb({
        playing: state.playing, paused: state.paused, cycle: state.cycle,
        lang: state.lang, chunk: state.chunk, total: state.total,
        aviso: state.aviso, respaldo: state.respaldo
      });
    });
  }

  function onState(cb) { stateCbs.push(cb); }

  /* ================================================================== *
   * Reproducción tolerante a fallos.
   * La transmisión no se detiene por nada: si un fragmento falla se
   * reintenta, si la voz en línea se cae se pasa a una voz local, si el
   * motor se cuelga un latido lo reanuda, y si un idioma entero falla se
   * omite ese ciclo y se vuelve a intentar en el siguiente.
   * ================================================================== */
  var MAX_INTENTOS = 3;        /* por fragmento */
  var MAX_FALLOS_IDIOMA = 3;   /* por ciclo */
  var intentos = 0;
  var fallosIdioma = {};
  var exitosCiclo = 0;
  var watchdog = null;
  var latido = null;
  var enCurso = false;
  var ultimaActividad = 0;
  var itemActual = null;

  function limpiarTimer() { if (timer) { clearTimeout(timer); timer = null; } }
  function esperar(ms, fn) {
    limpiarTimer();
    timer = setTimeout(function () { timer = null; fn(); }, Math.max(0, ms));
  }

  function limpiarWatchdog() { if (watchdog) { clearTimeout(watchdog); watchdog = null; } }

  /* Vigilancia de arranque: si en dos segundos y medio el motor ni empezó a
     hablar, es que se murió. Así la recuperación es inmediata y no hay que
     esperar a que se agote la duración completa del fragmento. */
  var MAX_ESPERAS_ARRANQUE = 4;   /* hasta 4 prórrogas de 2.5 s */
  function armarArranque(item, prorroga) {
    limpiarWatchdog();
    prorroga = prorroga || 0;
    watchdog = setTimeout(function () {
      watchdog = null;
      /* Hay motores que no avisan onstart aunque ya estén hablando */
      if (synth.speaking) { anotar('vigilancia', { detalle: 'ya hablaba sin avisar' }); armarFin(item); return; }
      /* Una voz en línea puede tardar en traer el audio: si sigue en cola, se le da tiempo */
      if (synth.pending && prorroga < MAX_ESPERAS_ARRANQUE) {
        anotar('espera', { detalle: 'la voz aún no arranca, prórroga ' + (prorroga + 1), lang: item.lang });
        armarArranque(item, prorroga + 1);
        return;
      }
      anotar('vigilancia', { detalle: 'el motor no arrancó', lang: item.lang });
      try { synth.cancel(); } catch (e) { /* ignorado */ }
      fallo(item, 'no inició');
    }, 2500);
  }

  /* Vigilancia de término: ya empezó, pero podría quedarse colgado a media frase */
  function armarFin(item) {
    limpiarWatchdog();
    var rate = options.rate[item.lang] || 1;
    var esperado = 4000 + (item.text.length * 140) / rate;
    watchdog = setTimeout(function () {
      watchdog = null;
      anotar('vigilancia', { detalle: 'se colgó a media frase', lang: item.lang });
      try { synth.cancel(); } catch (e) { /* ignorado */ }
      fallo(item, 'sin respuesta');
    }, esperado);
  }

  /* Voz instalada en el equipo: sirve cuando la voz en línea se queda sin red */
  function vozDeRespaldo(langPrefix) {
    var locales = rankedVoices(langPrefix).filter(function (v) {
      return v.voice && v.voice.localService !== false;
    });
    return locales.length ? locales[0].voice : null;
  }

  function avisar(texto) {
    if (state.aviso === texto) return;
    state.aviso = texto;
    emit();
  }

  function siguiente() {
    limpiarWatchdog();
    enCurso = false;
    if (!state.playing) return;

    if (idx >= chunks.length) {
      state.cycle++;
      anotar('ciclo', { detalle: 'inicia el ciclo ' + state.cycle + ', fragmentos logrados ' + exitosCiclo });
      fallosIdioma = {};
      if (!options.loop) { stop(); return; }
      idx = 0;
      /* Si el ciclo completo falló, se espera antes de repetir: así no gira en vacío */
      var espera = exitosCiclo === 0 ? 5000 : 0;
      exitosCiclo = 0;
      emit();
      if (espera) { esperar(espera, siguiente); return; }
    }

    var item = chunks[idx++];
    itemActual = item;
    intentos = 0;
    state.chunk = idx;
    state.lang = item.lang;
    emit();
    reproducir(item);
  }

  function reproducir(item) {
    if (!state.playing || !item) return;
    ultimaActividad = Date.now();

    if (!item.text) {
      enCurso = false;
      esperar((item.pause || 0) * 1000, siguiente);
      return;
    }

    /* Idioma que ya falló varias veces en este ciclo: se omite y se reintenta en el próximo */
    if ((fallosIdioma[item.lang] || 0) >= MAX_FALLOS_IDIOMA) {
      anotar('saltado', { lang: item.lang, detalle: 'idioma omitido en este ciclo', texto: item.text });
      siguiente(); return;
    }

    var u = new global.SpeechSynthesisUtterance(item.text);
    u.lang = item.lang === 'es' ? 'es-MX' : 'en-US';

    /* Al primer reintento se cambia a la voz local, que no depende de la red */
    var voz = null;
    if (intentos > 0) voz = vozDeRespaldo(item.lang);
    if (!voz) voz = findVoice(options.voices[item.lang], item.lang);
    if (voz) {
      if (voz.lang) u.lang = voz.lang;
      try { u.voice = voz; } catch (e) { /* ignorado */ }
      state.respaldo = (intentos > 0 && voz.localService !== false) ? voz.name : '';
    }

    u.rate = options.rate[item.lang] || 1;
    u.pitch = options.pitch[item.lang] || 1;
    u.volume = options.volume;

    u.onstart = function () {
      ultimaActividad = Date.now();
      anotar('hablando', { lang: item.lang, voz: voz ? voz.name : '(por omisión)', n: state.chunk });
      armarFin(item);
    };
    u.onend = function () {
      limpiarWatchdog();
      current = null; enCurso = false;
      exitosCiclo++;
      anotar('fin', { lang: item.lang, n: state.chunk, ms: Date.now() - ultimaActividad });
      ultimaActividad = Date.now();
      if (state.aviso) avisar('');
      if (!state.playing) return;
      esperar(options.sentencePause > 0 ? options.sentencePause : 0, siguiente);
    };
    u.onerror = function (e) {
      limpiarWatchdog();
      current = null; enCurso = false;
      var motivo = (e && e.error) ? e.error : 'error';
      /* interrupted y canceled los provoca nuestro propio stop */
      if (motivo === 'interrupted' || motivo === 'canceled') return;
      anotar('error', { lang: item.lang, motivo: motivo, n: state.chunk, texto: item.text });
      fallo(item, motivo);
    };

    enCurso = true;
    current = u;
    anotar('inicio', {
      lang: item.lang, n: state.chunk, de: state.total, intento: intentos + 1,
      voz: voz ? voz.name : '(por omisión)', largo: item.text.length, texto: item.text
    });
    try {
      synth.speak(u);
      armarArranque(item);
    } catch (e) {
      enCurso = false;
      fallo(item, 'excepción');
    }
  }

  function fallo(item, motivo) {
    if (!state.playing) return;
    intentos++;
    if (intentos < MAX_INTENTOS) {
      anotar('reintento', { lang: item.lang, motivo: motivo, intento: intentos + 1 });
      avisar('Reintentando (' + motivo + ')');
      try { synth.cancel(); } catch (e) { /* ignorado */ }
      esperar(400, function () { reproducir(item); });
      return;
    }
    fallosIdioma[item.lang] = (fallosIdioma[item.lang] || 0) + 1;
    anotar('omitido', { lang: item.lang, motivo: motivo, texto: item.text });
    avisar('Fragmento omitido en ' + (item.lang === 'es' ? 'español' : 'inglés') + ' (' + motivo + ')');
    intentos = 0;
    siguiente();
  }

  /* Latido: mantiene viva la síntesis y reanuda sola la transmisión si se detuvo */
  function iniciarLatido() {
    detenerLatido();
    ultimaActividad = Date.now();
    latido = setInterval(function () {
      if (!state.playing || state.paused) return;
      /* Chrome detiene la síntesis pasados ~15 s */
      if (synth.speaking) {
        try { synth.pause(); synth.resume(); } catch (e) { /* ignorado */ }
        ultimaActividad = Date.now();
        return;
      }
      /* Nada sonando, nada pendiente y ningún temporizador: el motor murió */
      var inactivo = Date.now() - ultimaActividad;
      if (!synth.pending && !timer && !watchdog && inactivo > 4000) {
        anotar('reanudada', { detalle: 'silencio de ' + Math.round(inactivo / 1000) + ' s' });
        avisar('Transmisión reanudada');
        ultimaActividad = Date.now();
        if (enCurso && itemActual) reproducir(itemActual);
        else siguiente();
      }
    }, 2000);
  }
  function detenerLatido() { if (latido) { clearInterval(latido); latido = null; } }

  /* ---- Navegación dentro del ciclo ---- */

  /* Los fragmentos con texto, para pintar la barra de avance */
  function fragmentos() {
    return chunks.map(function (c, i) {
      return { i: i, lang: c.lang, texto: c.text, pausa: !c.text };
    });
  }

  /* Saltar a un fragmento: adelantar o retroceder sin cortar la transmisión */
  function irA(n) {
    if (!state.playing || !chunks.length) return false;
    n = Math.max(0, Math.min(chunks.length - 1, n));
    limpiarTimer();
    limpiarWatchdog();
    try { synth.cancel(); } catch (e) { /* ignorado */ }
    enCurso = false;
    intentos = 0;
    idx = n;
    anotar('salto', { detalle: 'al fragmento ' + (n + 1) + ' de ' + chunks.length });
    ultimaActividad = Date.now();
    siguiente();
    return true;
  }

  function saltar(delta) {
    /* idx apunta al siguiente; el que suena es idx-1 */
    return irA((idx - 1) + delta);
  }

  /* ---- La pantalla no se debe apagar durante una transmisión ---- */
  var wakeLock = null;
  function pedirWakeLock() {
    if (!global.navigator || !global.navigator.wakeLock) return;
    global.navigator.wakeLock.request('screen').then(function (w) {
      wakeLock = w;
      anotar('pantalla', { detalle: 'suspensión bloqueada mientras se transmite' });
      w.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* el navegador no lo permitió */ });
  }
  function soltarWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignorado */ } wakeLock = null; }
  }

  /* Al volver a primer plano, el motor pudo quedarse detenido */
  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState !== 'visible') return;
      if (!state.playing || state.paused) return;
      if (wakeLock === null) pedirWakeLock();
      if (!synth.speaking && !synth.pending) {
        anotar('reanudada', { detalle: 'la ventana volvió al frente' });
        ultimaActividad = Date.now();
        if (enCurso && itemActual) reproducir(itemActual); else siguiente();
      }
    });
  }

  function play(sequence, opts) {
    if (!synth) return false;
    stop();
    queue = (sequence || []).filter(function (s) { return s && s.text; });
    if (!queue.length) return false;
    if (opts) setOptions(opts);
    buildChunks();
    idx = 0;
    intentos = 0;
    fallosIdioma = {};
    exitosCiclo = 0;
    itemActual = null;
    state.playing = true;
    state.paused = false;
    state.cycle = 1;
    state.aviso = '';
    state.respaldo = '';
    registro = [];
    anotar('inicio de transmisión', {
      detalle: queue.map(function (q) { return q.lang; }).join(' + ') + ', ' + chunks.length + ' fragmentos',
      voz: (options.voices.es || '') + ' / ' + (options.voices.en || '')
    });
    emit();
    iniciarLatido();
    pedirWakeLock();
    siguiente();
    return true;
  }

  function stop() {
    if (state.playing) anotar('detenida', { detalle: 'se pulsó STOP' });
    state.playing = false;
    state.paused = false;
    state.lang = '';
    state.chunk = 0;
    state.aviso = '';
    state.respaldo = '';
    enCurso = false;
    itemActual = null;
    limpiarTimer();
    limpiarWatchdog();
    detenerLatido();
    soltarWakeLock();
    if (synth) { try { synth.cancel(); } catch (e) { /* ignorado */ } }
    current = null;
    emit();
  }

  function pause() {
    if (!synth || !state.playing) return;
    state.paused = true;
    try { synth.pause(); } catch (e) { /* ignorado */ }
    emit();
  }

  function resume() {
    if (!synth || !state.playing) return;
    state.paused = false;
    ultimaActividad = Date.now();
    try { synth.resume(); } catch (e) { /* ignorado */ }
    emit();
  }

  function setOptions(o) {
    o = o || {};
    if (typeof o.loop === 'boolean') options.loop = o.loop;
    if (typeof o.gap === 'number') options.gap = o.gap;
    if (typeof o.cycleGap === 'number') options.cycleGap = o.cycleGap;
    if (typeof o.volume === 'number') options.volume = o.volume;
    if (typeof o.sentencePause === 'number') options.sentencePause = o.sentencePause;
    if (o.voices) {
      if (o.voices.es !== undefined) options.voices.es = o.voices.es;
      if (o.voices.en !== undefined) options.voices.en = o.voices.en;
    }
    if (o.rate) {
      if (o.rate.es !== undefined) options.rate.es = o.rate.es;
      if (o.rate.en !== undefined) options.rate.en = o.rate.en;
    }
    if (o.pitch) {
      if (o.pitch.es !== undefined) options.pitch.es = o.pitch.es;
      if (o.pitch.en !== undefined) options.pitch.en = o.pitch.en;
    }
  }

  /* Frase de muestra con fraseología real, para juzgar la voz en contexto */
  var MUESTRA = {
    es: 'Aeropuerto Internacional de la Ciudad de México, información Sierra. ' +
        'Viento cero cinco cero grados ocho nudos. Altímetro tres cero tres nueve.',
    en: 'Mexico City International Airport, information Sierra. ' +
        'Wind zero five zero degrees eight knots. Altimeter three zero three niner.'
  };

  /* Prueba corta con la voz seleccionada */
  function test(lang, text) {
    testWithVoice(options.voices[lang], lang, text);
  }

  /* Prueba corta con una voz concreta, para escuchar y comparar */
  function testWithVoice(nombre, lang, text) {
    if (!synth) return;
    synth.cancel();
    var u = new global.SpeechSynthesisUtterance(text || MUESTRA[lang] || MUESTRA.en);
    var v = findVoice(nombre, lang);
    if (v) { try { u.voice = v; u.lang = v.lang; } catch (e) { /* ignorado */ } }
    u.rate = options.rate[lang] || 1;
    u.pitch = options.pitch[lang] || 1;
    u.volume = options.volume;
    synth.speak(u);
  }

  /* Diagnóstico: con qué cuenta realmente esta computadora */
  function diagnostico() {
    var ua = String((global.navigator && global.navigator.userAgent) || '');
    var navegador = /Edg\//.test(ua) ? 'Microsoft Edge'
      : /OPR\//.test(ua) ? 'Opera'
      : /Firefox\//.test(ua) ? 'Mozilla Firefox'
      : /Chrome\//.test(ua) ? 'Google Chrome'
      : /Safari\//.test(ua) ? 'Safari' : 'desconocido';
    var version = (/(?:Edg|Chrome|Firefox|Version)\/(\d+)/.exec(ua) || [])[1] || '';
    return {
      navegador: navegador + (version ? ' ' + version : ''),
      esEdge: navegador === 'Microsoft Edge',
      enLinea: !!(global.navigator && global.navigator.onLine),
      sistema: /Windows NT 10/.test(ua) ? 'Windows 10 u 11'
        : (/Windows/.test(ua) ? 'Windows' : (/Mac/.test(ua) ? 'macOS' : 'otro')),
      total: voices.length,
      es: rankedVoices('es'),
      en: rankedVoices('en')
    };
  }

  ATIS.speech = {
    supported: !!synth,
    onVoicesReady: onVoicesReady,
    getVoices: getVoices,
    rankedVoices: rankedVoices,
    isNatural: isNatural,
    play: play, stop: stop, pause: pause, resume: resume,
    setOptions: setOptions, onState: onState, test: test,
    fragmentos: fragmentos, irA: irA, saltar: saltar,
    registro: function () { return registro.slice(); },
    onLog: function (cb) { logCbs.push(cb); },
    limpiarRegistro: function () { registro = []; },
    testWithVoice: testWithVoice, diagnostico: diagnostico,
    splitChunks: splitChunks,
    get state() { return state; }
  };
})(this);
