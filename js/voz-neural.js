/* ATIS 3.0 - Voz neuronal local (Piper) del lado del navegador
 *
 * El servidor sintetiza el guion una sola vez y entrega dos archivos de audio
 * (español e inglés). Aquí se descargan a la memoria y se reproducen en bucle.
 *
 * Por qué así:
 *   - No depende del internet ni de las voces de Windows.
 *   - El audio queda en la memoria del navegador: si después se cae el
 *     servidor o se va la red, el bucle sigue sonando igual.
 *   - Suena idéntico en cada ciclo, y el deslizador avanza por segundos de
 *     verdad, no por fragmentos.
 *
 * Expone la misma interfaz que ATIS.speech para que la aplicación pueda
 * cambiar de motor sin cambiar nada más.
 */
(function (global) {
  'use strict';
  var ATIS = global.ATIS = global.ATIS || {};

  /* Solo tiene sentido con el servidor detrás: desde un archivo suelto
     (file://) no hay a quién pedirle el audio. */
  var conServidor = !!(global.location && /^https?:$/.test(global.location.protocol));

  var stateCbs = [];
  var logCbs = [];
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
    playing: false, paused: false, cycle: 0, lang: '',
    chunk: 0, total: 0, etiqueta: '', aviso: '', respaldo: '', motor: 'neuronal'
  };

  var options = {
    loop: true, gap: 3, cycleGap: 5,
    voices: { es: '', en: '' },
    rate: { es: 1, en: 1 },
    volume: 1,
    sentencePause: 250
  };

  /* --------------------------------------------------- estado del servicio -- */
  var servicio = { consultado: false, disponible: false, completa: false, voces: [], falta: [], error: '' };

  function pedir(ruta, opciones) {
    if (!conServidor || !global.fetch) return Promise.reject(new Error('sin servidor'));
    return global.fetch(ruta, opciones).then(function (r) {
      if (!r.ok) throw new Error('el servidor contestó ' + r.status);
      return r.json();
    });
  }

  function comprobar(forzar) {
    if (!conServidor) {
      servicio = { consultado: true, disponible: false, completa: false, voces: [], falta: [], error: 'sin servidor' };
      return Promise.resolve(servicio);
    }
    return pedir('/api/voz' + (forzar ? '?revisar=1' : ''))
      .then(function (d) {
        servicio = {
          consultado: true,
          disponible: !!d.disponible, completa: !!d.completa,
          voces: d.voces || [], falta: d.falta || [], carpeta: d.carpeta || '',
          cache: d.cache || null, binario: d.binario || '', error: ''
        };
        return servicio;
      })
      .catch(function (e) {
        servicio = { consultado: true, disponible: false, completa: false, voces: [], falta: [], error: e.message };
        return servicio;
      });
  }

  function vocesDe(lang) {
    return (servicio.voces || []).filter(function (v) { return v.lang === lang; });
  }

  /* ------------------------------------------------------------ el audio -- */
  var elemento = null;
  var pistas = [];        /* [{lang, url, blob, segundos, texto}] */
  var tramos = [];        /* la línea de tiempo del ciclo */
  var tramo = 0;
  var timer = null;
  var vigilante = null;
  var latido = null;
  var ultimoAvance = 0;
  var ultimaPos = -1;
  var intentos = 0;
  var MAX_INTENTOS = 3;
  var finDeCiclo = [];
  var descargas = {};     /* hash -> url del blob, para no bajar dos veces */
  /* Sube cada vez que se ponen pistas nuevas. Sirve para saber si una tarea de
     fin de ciclo relevó el audio: en ese caso el ciclo viejo ya no sigue. */
  var generacion = 0;

  function elAudio() {
    if (elemento) return elemento;
    elemento = new global.Audio();
    elemento.preload = 'auto';
    elemento.addEventListener('ended', function () {
      if (!state.playing) return;
      anotar('fin', { lang: state.lang, ms: Math.round(elemento.duration * 1000) });
      avanzar();
    });
    elemento.addEventListener('error', function () {
      if (!state.playing) return;
      var c = elemento.error;
      fallo('el audio no se pudo reproducir' + (c ? ' (código ' + c.code + ')' : ''));
    });
    elemento.addEventListener('timeupdate', function () {
      ultimoAvance = Date.now();
      emitir();
    });
    return elemento;
  }

  function limpiarTimer() { if (timer) { clearTimeout(timer); timer = null; } }
  function limpiarVigilante() { if (vigilante) { clearTimeout(vigilante); vigilante = null; } }
  function esperar(ms, fn) {
    limpiarTimer();
    timer = setTimeout(function () { timer = null; fn(); }, Math.max(0, ms));
  }

  /* ------------------------------------------------- línea de tiempo del ciclo -- */
  function armarTramos() {
    tramos = [];
    pistas.forEach(function (p, i) {
      tramos.push({ tipo: 'audio', lang: p.lang, pista: i, segundos: p.segundos });
      tramos.push({
        tipo: 'pausa', lang: p.lang,
        segundos: i === pistas.length - 1 ? options.cycleGap : options.gap
      });
    });
    var acumulado = 0;
    tramos.forEach(function (t) { t.inicio = acumulado; acumulado += t.segundos; });
    state.total = Math.max(1, Math.round(acumulado));
    return acumulado;
  }

  function duracionCiclo() {
    return tramos.reduce(function (s, t) { return s + t.segundos; }, 0);
  }

  function posicionSegundos() {
    var t = tramos[tramo];
    if (!t) return 0;
    if (t.tipo === 'audio' && elemento && isFinite(elemento.currentTime)) return t.inicio + elemento.currentTime;
    return t.inicio;
  }

  function reloj(seg) {
    seg = Math.max(0, Math.round(seg));
    var m = Math.floor(seg / 60), s = seg % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function emitir() {
    var pos = posicionSegundos();
    var total = duracionCiclo();
    state.chunk = Math.max(1, Math.min(state.total, Math.floor(pos) + 1));
    state.etiqueta = reloj(pos) + ' / ' + reloj(total);
    stateCbs.forEach(function (cb) {
      try {
        cb({
          playing: state.playing, paused: state.paused, cycle: state.cycle,
          lang: state.lang, chunk: state.chunk, total: state.total,
          etiqueta: state.etiqueta, aviso: state.aviso, respaldo: state.respaldo,
          motor: 'neuronal', segundos: pos, duracion: total
        });
      } catch (e) { /* ignorado */ }
    });
  }

  function avisar(texto) {
    if (state.aviso === texto) return;
    state.aviso = texto;
    emitir();
  }

  /* ------------------------------------------------------------ descargas -- */

  /* El audio se trae completo a la memoria. Es el punto clave de la robustez:
     a partir de aquí el bucle ya no necesita ni servidor ni red. */
  function bajar(pieza) {
    if (descargas[pieza.hash]) return Promise.resolve(descargas[pieza.hash]);
    return global.fetch(pieza.archivo).then(function (r) {
      if (!r.ok) throw new Error('el audio contestó ' + r.status);
      return r.blob();
    }).then(function (b) {
      var url = global.URL.createObjectURL(b);
      descargas[pieza.hash] = url;
      anotar('descargado', { lang: pieza.lang, kb: Math.round(b.size / 1024), s: pieza.segundos });
      return url;
    });
  }

  function olvidarDescargas(conservar) {
    Object.keys(descargas).forEach(function (h) {
      if (conservar && conservar[h]) return;
      try { global.URL.revokeObjectURL(descargas[h]); } catch (e) { /* ignorado */ }
      delete descargas[h];
    });
  }

  /* Pide el audio al servidor y lo deja listo en la memoria */
  function preparar(secuencia, opts) {
    if (opts) setOptions(opts);
    var piezas = (secuencia || []).filter(function (s) { return s && s.text; })
      .map(function (s) { return { lang: s.lang, texto: s.text }; });
    if (!piezas.length) return Promise.reject(new Error('no hay nada que sintetizar'));

    anotar('sintetizando', { detalle: piezas.map(function (p) { return p.lang; }).join(' + ') });
    return pedir('/api/voz/sintetizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        piezas: piezas,
        voces: { es: options.voices.es || '', en: options.voices.en || '' },
        velocidad: options.rate.es || 1,
        pausaFrase: Math.max(0, (options.sentencePause || 0) / 1000)
      })
    }).then(function (d) {
      var buenas = (d.piezas || []).filter(function (p) { return p && p.archivo; });
      var malas = (d.piezas || []).filter(function (p) { return p && p.error; });
      malas.forEach(function (p) { anotar('error', { lang: p.lang, motivo: p.error }); });
      if (!buenas.length) {
        throw new Error(malas.length ? malas[0].error : 'el servidor no devolvió audio');
      }
      if (d.estado) {
        servicio.disponible = !!d.estado.disponible;
        servicio.completa = !!d.estado.completa;
        servicio.voces = d.estado.voces || servicio.voces;
        servicio.cache = d.estado.cache || servicio.cache;
      }
      return Promise.all(buenas.map(function (p) {
        return bajar(p).then(function (url) {
          return {
            lang: p.lang, url: url, hash: p.hash, segundos: p.segundos,
            voz: p.voz, caracteres: p.caracteres
          };
        });
      })).then(function (listas) {
        return { pistas: listas, faltaron: malas };
      });
    });
  }

  /* ------------------------------------------------------------ el bucle -- */

  function arrancarTramo() {
    limpiarVigilante();
    if (!state.playing) return;

    if (tramo >= tramos.length) {
      state.cycle++;
      anotar('ciclo', { detalle: 'inicia el ciclo ' + state.cycle });
      if (finDeCiclo.length) {
        var pendientes = finDeCiclo.slice();
        var gen = generacion;
        finDeCiclo = [];
        pendientes.forEach(function (cb) { try { cb(); } catch (e) { /* ignorado */ } });
        /* Si la tarea cambió el audio, ese relevo ya arrancó su propio ciclo */
        if (generacion !== gen) return;
      }
      if (!state.playing) return;      /* la tarea de fin de ciclo pudo detener todo */
      if (!options.loop) { stop(); return; }
      tramo = 0;
    }

    var t = tramos[tramo];
    if (!t) { stop(); return; }
    state.lang = t.lang;
    intentos = 0;

    if (t.tipo === 'pausa') {
      try { elAudio().pause(); } catch (e) { /* ignorado */ }
      emitir();
      esperar(t.segundos * 1000, function () { tramo++; arrancarTramo(); });
      return;
    }

    sonar(0);
  }

  function sonar(desde) {
    var t = tramos[tramo];
    var p = pistas[t.pista];
    if (!p) { avanzar(); return; }
    var a = elAudio();
    a.volume = Math.max(0, Math.min(1, options.volume));
    if (a.src !== p.url) a.src = p.url;
    try { a.currentTime = Math.max(0, Math.min(p.segundos - 0.05, desde || 0)); }
    catch (e) { /* aún no hay metadatos; empieza desde el principio */ }

    anotar('inicio', {
      lang: p.lang, voz: p.voz, s: p.segundos, desde: Math.round(desde || 0),
      largo: p.caracteres
    });
    ultimoAvance = Date.now();
    ultimaPos = -1;

    var promesa = a.play();
    if (promesa && promesa.catch) {
      promesa.catch(function (e) {
        /* El navegador puede bloquear el audio si no hubo un clic antes */
        fallo('el navegador no dejó sonar el audio (' + (e && e.name ? e.name : 'bloqueado') + ')');
      });
    }
    armarVigilante(p, desde || 0);
    emitir();
  }

  /* Si el audio debió terminar y nadie avisó, se sigue adelante solo */
  function armarVigilante(p, desde) {
    limpiarVigilante();
    var queda = Math.max(1, p.segundos - (desde || 0));
    vigilante = setTimeout(function () {
      vigilante = null;
      if (!state.playing) return;
      anotar('vigilancia', { lang: p.lang, detalle: 'el audio no avisó que terminó' });
      avanzar();
    }, (queda + 4) * 1000);
  }

  function avanzar() {
    limpiarVigilante();
    tramo++;
    arrancarTramo();
  }

  function fallo(motivo) {
    limpiarVigilante();
    if (!state.playing) return;
    var t = tramos[tramo] || {};
    intentos++;
    anotar(intentos < MAX_INTENTOS ? 'reintento' : 'omitido', { lang: t.lang, motivo: motivo, intento: intentos });
    if (intentos < MAX_INTENTOS) {
      avisar('Reintentando (' + motivo + ')');
      var desde = elemento && isFinite(elemento.currentTime) ? elemento.currentTime : 0;
      esperar(500, function () { sonar(desde); });
      return;
    }
    avisar('Audio omitido en ' + (t.lang === 'es' ? 'español' : 'inglés') + ' (' + motivo + ')');
    intentos = 0;
    avanzar();
  }

  /* Latido: si el audio se queda clavado, lo empuja; si no reacciona, lo salta */
  function iniciarLatido() {
    detenerLatido();
    ultimoAvance = Date.now();
    latido = setInterval(function () {
      if (!state.playing || state.paused) return;
      var t = tramos[tramo];
      if (!t || t.tipo !== 'audio') return;
      var a = elemento;
      if (!a) return;
      var pos = isFinite(a.currentTime) ? a.currentTime : 0;
      if (Math.abs(pos - ultimaPos) > 0.2) { ultimaPos = pos; ultimoAvance = Date.now(); return; }
      var quieto = Date.now() - ultimoAvance;
      if (quieto < 6000) return;
      anotar('reanudada', { lang: t.lang, detalle: 'el audio llevaba ' + Math.round(quieto / 1000) + ' s sin avanzar' });
      avisar('Transmisión reanudada');
      ultimoAvance = Date.now();
      if (a.paused) { try { a.play(); } catch (e) { fallo('no se pudo reanudar'); } }
      else sonar(pos);
    }, 2000);
  }
  function detenerLatido() { if (latido) { clearInterval(latido); latido = null; } }

  /* ------------------------------------------------- la pantalla no se apaga -- */
  var wakeLock = null;
  function pedirWakeLock() {
    if (!global.navigator || !global.navigator.wakeLock) return;
    global.navigator.wakeLock.request('screen').then(function (w) {
      wakeLock = w;
      w.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { /* el navegador no lo permitió */ });
  }
  function soltarWakeLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignorado */ } wakeLock = null; }
  }

  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState !== 'visible') return;
      if (!state.playing || state.paused) return;
      if (wakeLock === null) pedirWakeLock();
      var t = tramos[tramo];
      if (t && t.tipo === 'audio' && elemento && elemento.paused) {
        anotar('reanudada', { detalle: 'la ventana volvió al frente' });
        try { elemento.play(); } catch (e) { /* el latido lo recoge */ }
      }
    });
  }

  /* ------------------------------------------------------- navegación -- */

  /* Los tramos del ciclo, para que la aplicación pueda pintarlos */
  function fragmentos() {
    return tramos.map(function (t, i) {
      return { i: i, lang: t.lang, texto: '', pausa: t.tipo === 'pausa', segundos: t.segundos, inicio: t.inicio };
    });
  }

  /* Ir a un segundo del ciclo: adelantar o retroceder de verdad */
  function irA(segundo) {
    if (!state.playing || !tramos.length) return false;
    var total = duracionCiclo();
    var s = Math.max(0, Math.min(total - 0.1, Number(segundo) || 0));
    var destino = 0;
    for (var i = 0; i < tramos.length; i++) {
      if (s >= tramos[i].inicio && s < tramos[i].inicio + tramos[i].segundos) { destino = i; break; }
      destino = i;
    }
    limpiarTimer();
    limpiarVigilante();
    intentos = 0;
    tramo = destino;
    var dentro = s - tramos[destino].inicio;
    anotar('salto', { detalle: 'a ' + reloj(s) + ' del ciclo' });
    if (tramos[destino].tipo === 'pausa') {
      try { elAudio().pause(); } catch (e) { /* ignorado */ }
      emitir();
      esperar(Math.max(0, tramos[destino].segundos - dentro) * 1000, function () { tramo++; arrancarTramo(); });
    } else {
      state.lang = tramos[destino].lang;
      sonar(dentro);
    }
    return true;
  }

  /* El deslizador se mueve por segundos, así que adelantar son 10 s */
  function saltar(delta) {
    var paso = 10;
    return irA(posicionSegundos() + (delta > 0 ? paso : -paso));
  }

  /* --------------------------------------------------------- control -- */

  /* Arranca con pistas ya descargadas (las que devolvió preparar) */
  function reproducir(listas) {
    pistas = listas || [];
    if (!pistas.length) return false;
    generacion++;
    limpiarTimer();
    limpiarVigilante();
    if (elemento) { try { elemento.pause(); } catch (e) { /* ignorado */ } }
    var conservar = {};
    pistas.forEach(function (p) { conservar[p.hash] = true; });
    olvidarDescargas(conservar);
    armarTramos();
    tramo = 0;
    intentos = 0;
    state.playing = true;
    state.paused = false;
    state.cycle = 1;
    state.aviso = '';
    state.respaldo = '';
    registro = [];
    anotar('inicio de transmisión', {
      detalle: pistas.map(function (p) { return p.lang + ' ' + p.segundos + ' s'; }).join(' + ') +
        ', ciclo de ' + reloj(duracionCiclo()),
      voz: pistas.map(function (p) { return p.voz; }).join(' / ')
    });
    emitir();
    iniciarLatido();
    pedirWakeLock();
    arrancarTramo();
    return true;
  }

  /* Cambiar el ATIS sin dejar silencio: el audio nuevo se genera mientras el
     ciclo en curso sigue sonando, y entra justo en el corte. Si generarlo falla,
     el bucle viejo se queda al aire, que es mejor que callarse. */
  function relevar(secuencia, opts) {
    if (!state.playing) return play(secuencia, opts);
    return preparar(secuencia, opts).then(function (r) {
      return new Promise(function (resolver) {
        anotar('relevo', {
          detalle: 'audio nuevo listo (' + r.pistas.map(function (p) { return p.lang; }).join(' + ') +
            '), entra al terminar el ciclo'
        });
        finDeCiclo.push(function () {
          var ok = reproducir(r.pistas);
          resolver({ ok: ok, pistas: r.pistas, faltaron: r.faltaron, relevo: true });
        });
      });
    });
  }

  /* play() hace las dos cosas: pide el audio y arranca. Devuelve una promesa
     porque sintetizar lleva unos segundos la primera vez. */
  function play(secuencia, opts) {
    stop();
    return preparar(secuencia, opts).then(function (r) {
      var ok = reproducir(r.pistas);
      return { ok: ok, pistas: r.pistas, faltaron: r.faltaron };
    });
  }

  function stop() {
    if (state.playing) anotar('detenida', { detalle: 'se pulsó STOP' });
    state.playing = false;
    state.paused = false;
    state.lang = '';
    state.chunk = 0;
    state.aviso = '';
    limpiarTimer();
    limpiarVigilante();
    detenerLatido();
    soltarWakeLock();
    if (elemento) { try { elemento.pause(); } catch (e) { /* ignorado */ } }
    emitir();
  }

  function pause() {
    if (!state.playing) return;
    state.paused = true;
    limpiarTimer();
    limpiarVigilante();
    if (elemento) { try { elemento.pause(); } catch (e) { /* ignorado */ } }
    emitir();
  }

  function resume() {
    if (!state.playing) return;
    state.paused = false;
    ultimoAvance = Date.now();
    var t = tramos[tramo];
    if (t && t.tipo === 'audio' && elemento) { try { elemento.play(); } catch (e) { /* ignorado */ } }
    else arrancarTramo();
    emitir();
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
  }

  /* Muestra para escuchar la voz antes de ponerla al aire */
  function muestra(lang, nombre, velocidad) {
    return pedir('/api/voz/muestra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: lang, voz: nombre, velocidad: velocidad || options.rate[lang] || 1 })
    }).then(function (d) {
      if (d.error) throw new Error(d.error);
      var a = new global.Audio(d.archivo);
      a.volume = Math.max(0, Math.min(1, options.volume));
      var p = a.play();
      if (p && p.catch) p.catch(function () { /* el navegador lo bloqueó */ });
      return d;
    });
  }

  function limpiarCacheServidor() {
    return pedir('/api/voz/limpiar', { method: 'POST' });
  }

  ATIS.neural = {
    conServidor: conServidor,
    get supported() { return conServidor && servicio.disponible; },
    servicio: function () { return servicio; },
    comprobar: comprobar,
    vocesDe: vocesDe,
    preparar: preparar,
    reproducir: reproducir,
    play: play, relevar: relevar, stop: stop, pause: pause, resume: resume,
    setOptions: setOptions,
    onState: function (cb) { stateCbs.push(cb); },
    onLog: function (cb) { logCbs.push(cb); },
    registro: function () { return registro.slice(); },
    limpiarRegistro: function () { registro = []; },
    fragmentos: fragmentos, irA: irA, saltar: saltar,
    alFinDeCiclo: function (cb) {
      if (!state.playing) { cb(); return false; }
      finDeCiclo.push(cb);
      return true;
    },
    ciclosPendientes: function () { return finDeCiclo.length; },
    muestra: muestra,
    limpiarCacheServidor: limpiarCacheServidor,
    reloj: reloj,
    duracionCiclo: duracionCiclo,
    get state() { return state; }
  };
})(this);
