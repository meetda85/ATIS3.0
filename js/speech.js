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
    volume: 1
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
    if (voices.length) cb(voices);
    else {
      readyCbs.push(cb);
      /* Algunos navegadores tardan en publicar las voces */
      setTimeout(loadVoices, 250);
      setTimeout(loadVoices, 1000);
    }
  }

  function getVoices(langPrefix) {
    if (!langPrefix) return voices.slice();
    return voices.filter(function (v) {
      return String(v.lang || '').toLowerCase().indexOf(langPrefix) === 0;
    });
  }

  function findVoice(name, langPrefix) {
    var v = null;
    if (name) {
      v = voices.filter(function (x) { return x.name === name; })[0] || null;
    }
    if (!v) {
      var list = getVoices(langPrefix);
      /* Preferencia: es-MX / en-US */
      var preferred = langPrefix === 'es' ? 'es-mx' : 'en-us';
      v = list.filter(function (x) { return String(x.lang).toLowerCase() === preferred; })[0] || list[0] || null;
    }
    return v;
  }

  /* Divide el guion en fragmentos cortos: los motores TTS cortan textos largos */
  function splitChunks(text, max) {
    max = max || 180;
    var sentences = String(text || '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g) || [];
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
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    else u.lang = langPrefix === 'es' ? 'es-MX' : 'en-US';
    u.rate = options.rate[langPrefix] || 1;
    u.pitch = options.pitch[langPrefix] || 1;
    u.volume = options.volume;
    u.onend = function () { current = null; if (state.playing) speakNext(); };
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

  /* Prueba corta de voz */
  function test(lang, text) {
    if (!synth) return;
    synth.cancel();
    var u = new global.SpeechSynthesisUtterance(text || (lang === 'es'
      ? 'Prueba de voz. Información Sierra.'
      : 'Voice test. Information Sierra.'));
    var v = findVoice(options.voices[lang], lang);
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = options.rate[lang] || 1;
    u.pitch = options.pitch[lang] || 1;
    u.volume = options.volume;
    synth.speak(u);
  }

  ATIS.speech = {
    supported: !!synth,
    onVoicesReady: onVoicesReady,
    getVoices: getVoices,
    play: play, stop: stop, pause: pause, resume: resume,
    setOptions: setOptions, onState: onState, test: test,
    splitChunks: splitChunks,
    get state() { return state; }
  };
})(this);
