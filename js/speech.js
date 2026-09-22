/* ATIS 3.0 - Motor de locucion en bucle (Web Speech API) */
(function (global) {
  'use strict';
  var ATIS = global.ATIS = global.ATIS || {};

  var synth = global.speechSynthesis;
  var voices = [];
  var readyCbs = [];
  var stateCbs = [];

  var state = {
    playing: false,
    paused: false,
    cycle: 0,
    lang: '',
    chunk: 0,
    total: 0
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
  var keepAlive = null;
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
        lang: state.lang, chunk: state.chunk, total: state.total
      });
    });
  }

  function onState(cb) { stateCbs.push(cb); }

  function speakNext() {
    if (!state.playing) return;
    if (idx >= chunks.length) {
      state.cycle++;
      if (!options.loop) { stop(); return; }
      idx = 0;
      emit();
    }
    var item = chunks[idx++];
    state.chunk = idx;
    state.lang = item.lang;
    emit();

    if (!item.text) {
      timer = setTimeout(speakNext, Math.max(0, (item.pause || 0) * 1000));
      return;
    }

    var u = new global.SpeechSynthesisUtterance(item.text);
    var langPrefix = item.lang;
    var voice = findVoice(options.voices[langPrefix], langPrefix);
    u.lang = langPrefix === 'es' ? 'es-MX' : 'en-US';
    if (voice) {
      /* Si la voz dejara de existir, se sigue transmitiendo con la del idioma */
      try { u.voice = voice; u.lang = voice.lang; } catch (e) { /* ignorado */ }
    }
    u.rate = options.rate[langPrefix] || 1;
    u.pitch = options.pitch[langPrefix] || 1;
    u.volume = options.volume;
    u.onend = function () {
      current = null;
      if (!state.playing) return;
      if (options.sentencePause > 0) timer = setTimeout(speakNext, options.sentencePause);
      else speakNext();
    };
    u.onerror = function (e) {
      current = null;
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) return;
      if (state.playing) setTimeout(speakNext, 200);
    };
    current = u;
    synth.speak(u);
  }

  function startKeepAlive() {
    stopKeepAlive();
    /* Chrome detiene la síntesis después de ~15 s; resume() la mantiene viva */
    keepAlive = setInterval(function () {
      if (state.playing && !state.paused && synth.speaking) {
        synth.pause(); synth.resume();
      }
    }, 9000);
  }
  function stopKeepAlive() { if (keepAlive) { clearInterval(keepAlive); keepAlive = null; } }

  function play(sequence, opts) {
    if (!synth) return false;
    stop();
    queue = (sequence || []).filter(function (s) { return s && s.text; });
    if (!queue.length) return false;
    if (opts) setOptions(opts);
    buildChunks();
    idx = 0;
    state.playing = true;
    state.paused = false;
    state.cycle = 1;
    emit();
    startKeepAlive();
    speakNext();
    return true;
  }

  function stop() {
    state.playing = false;
    state.paused = false;
    state.lang = '';
    state.chunk = 0;
    if (timer) { clearTimeout(timer); timer = null; }
    stopKeepAlive();
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
    testWithVoice: testWithVoice, diagnostico: diagnostico,
    splitChunks: splitChunks,
    get state() { return state; }
  };
})(this);
