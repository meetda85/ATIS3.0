/* ATIS 3.0 — Enlace con el servidor local (control remoto)
 *
 * La PC de la torre transmite; otra PC de la misma red manda los datos. El
 * enlace solo alimenta información: si el servidor se cae o la red se corta,
 * la PC que transmite sigue al aire con lo último que recibió.
 *
 * Solo se activa cuando la página se abrió por http, es decir, servida por
 * servidor/servidor.js. Abierta como archivo suelto, el programa funciona
 * igual que siempre y este módulo queda inerte.
 */
(function (global) {
  'use strict';
  var ATIS = global.ATIS = global.ATIS || {};

  var CLAVE_PAPEL = 'atis3.papel';
  var CLAVE_ID = 'atis3.equipoId';

  var cfg = null;
  var activo = false;
  var fuente = null;          /* EventSource */
  var sondeo = null;          /* respaldo por sondeo */
  var latido = null;
  var enviando = null;
  var oyentes = [];
  var oyentesMetar = [];
  var oyentesVoz = [];
  var ultimoJSON = null;   /* lo último enviado o recibido: evita el ida y vuelta */

  var est = {
    disponible: false,
    conectado: false,
    papel: 'transmisor',
    version: 0,
    ultimoEnvio: null,
    ultimaRecepcion: null,
    origen: '',
    equipos: [],
    error: ''
  };

  function disponible() {
    return global.location && /^https?:$/.test(global.location.protocol);
  }

  function esLocal() {
    var h = global.location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '';
  }

  function idEquipo() {
    var id = null;
    try { id = localStorage.getItem(CLAVE_ID); } catch (e) { /* ignorado */ }
    if (!id) {
      id = 'eq-' + Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36).slice(-4);
      try { localStorage.setItem(CLAVE_ID, id); } catch (e) { /* ignorado */ }
    }
    return id;
  }

  function papelGuardado() {
    var p = null;
    try { p = localStorage.getItem(CLAVE_PAPEL); } catch (e) { /* ignorado */ }
    if (p === 'transmisor' || p === 'control') return p;
    /* Por omisión: la PC donde corre el servidor transmite; las demás controlan */
    return esLocal() ? 'transmisor' : 'control';
  }

  function fijarPapel(papel) {
    est.papel = (papel === 'control') ? 'control' : 'transmisor';
    try { localStorage.setItem(CLAVE_PAPEL, est.papel); } catch (e) { /* ignorado */ }
    avisar();
  }

  function avisar() {
    oyentes.forEach(function (cb) { try { cb(estado()); } catch (e) { /* ignorado */ } });
  }

  function estado() {
    return {
      disponible: est.disponible, conectado: est.conectado, papel: est.papel,
      version: est.version, ultimoEnvio: est.ultimoEnvio, ultimaRecepcion: est.ultimaRecepcion,
      origen: est.origen, equipos: est.equipos.slice(), error: est.error,
      direccion: direccion()
    };
  }

  function direccion() {
    if (!disponible()) return '';
    return global.location.protocol + '//' + global.location.host + '/';
  }

  function pedir(ruta, opciones) {
    return fetch(ruta, Object.assign({ cache: 'no-store' }, opciones || {}))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  /* ---- Traer el estado y aplicarlo ---- */
  function traer(forzar) {
    return pedir('/api/estado').then(function (r) {
      est.conectado = true;
      est.error = '';
      if (!r || !r.datos) { est.version = r ? r.version : 0; avisar(); return false; }
      if (!forzar && r.version <= est.version) { avisar(); return false; }
      est.version = r.version;
      est.origen = r.origen || '';
      est.ultimaRecepcion = new Date();
      try { ultimoJSON = JSON.stringify(r.datos); } catch (e) { ultimoJSON = null; }
      cfg.aplicar(r.datos, r.origen);
      avisar();
      return true;
    }).catch(function (e) {
      est.conectado = false;
      est.error = e.message;
      avisar();
      return false;
    });
  }

  /* ---- Mandar el estado al servidor ---- */
  function enviar() {
    if (!activo) return;
    clearTimeout(enviando);
    enviando = setTimeout(function () {
      var datos, texto;
      try { datos = cfg.recoger(); texto = JSON.stringify(datos); } catch (e) { return; }
      /* Si es idéntico a lo último que pasó por aquí, no hay nada que mandar:
         así una computadora no devuelve el eco de lo que acaba de recibir. */
      if (texto === ultimoJSON) return;
      ultimoJSON = texto;
      pedir('/api/estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origen: cfg.nombre(), datos: datos })
      }).then(function (r) {
        est.conectado = true;
        est.error = '';
        est.version = r.version;          /* lo nuestro no se vuelve a aplicar */
        est.ultimoEnvio = new Date();
        avisar();
      }).catch(function (e) {
        est.conectado = false;
        est.error = e.message;
        avisar();
      });
    }, 600);
  }

  /* ---- Avisos del servidor, con sondeo de respaldo ---- */
  function escuchar() {
    if (!global.EventSource) return;
    try { fuente = new EventSource('/api/eventos'); } catch (e) { return; }

    fuente.addEventListener('estado', function (ev) {
      var d = {};
      try { d = JSON.parse(ev.data); } catch (e) { /* ignorado */ }
      est.conectado = true;
      if (d.version && d.version > est.version) traer(false);
      else avisar();
    });
    /* El servidor avisa en cuanto aparece un METAR nuevo */
    fuente.addEventListener('metar', function (ev) {
      var d = null;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      oyentesMetar.forEach(function (cb) { try { cb(d); } catch (e) { /* ignorado */ } });
    });
    /* Cómo va la instalación de la voz neuronal */
    fuente.addEventListener('voz', function (ev) {
      var d = null;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      oyentesVoz.forEach(function (cb) { try { cb(d); } catch (e) { /* ignorado */ } });
    });
    fuente.onopen = function () { est.conectado = true; est.error = ''; avisar(); };
    fuente.onerror = function () { est.conectado = false; avisar(); };
  }

  function mandarLatido() {
    pedir('/api/latido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: idEquipo(), nombre: cfg.nombre(), papel: est.papel, aire: cfg.aire ? cfg.aire() : null
      })
    }).then(function (r) {
      est.conectado = true;
      est.equipos = r.equipos || [];
      if (r.version > est.version) traer(false); else avisar();
    }).catch(function () { est.conectado = false; avisar(); });
  }

  /* ---- Arranque ---- */
  function iniciar(opciones) {
    cfg = opciones || {};
    est.disponible = disponible();
    if (!est.disponible) { avisar(); return false; }

    activo = true;
    est.papel = papelGuardado();

    traer(true);
    escuchar();
    mandarLatido();
    latido = setInterval(mandarLatido, 10000);
    /* Respaldo por si el flujo de avisos se cae */
    sondeo = setInterval(function () { if (!fuente || fuente.readyState !== 1) traer(false); }, 7000);
    avisar();
    return true;
  }

  function detener() {
    activo = false;
    clearInterval(latido); clearInterval(sondeo); clearTimeout(enviando);
    if (fuente) { try { fuente.close(); } catch (e) { /* ignorado */ } fuente = null; }
  }

  ATIS.enlace = {
    disponible: disponible,
    iniciar: iniciar,
    detener: detener,
    enviar: enviar,
    traer: traer,
    estado: estado,
    fijarPapel: fijarPapel,
    alCambiar: function (cb) { oyentes.push(cb); },
    alMetar: function (cb) { oyentesMetar.push(cb); },
    alVoz: function (cb) { oyentesVoz.push(cb); }
  };
})(this);
