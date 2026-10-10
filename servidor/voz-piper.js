/* ATIS 3.0 — Voz neuronal local (Piper)
 *
 * Genera el audio del ATIS con un motor neuronal que vive en esta misma
 * computadora: no depende del internet, no depende de las voces de Windows y
 * suena igual todos los ciclos. El servidor sintetiza el guion una sola vez y
 * guarda el archivo; el navegador solo reproduce ese archivo en bucle.
 *
 * Si Piper no está instalado, este módulo no estorba: avisa que no está
 * disponible y la aplicación sigue hablando con la voz del navegador.
 *
 * Instalación esperada (todo dentro de la carpeta del programa):
 *   voz/piper/piper.exe        el motor (piper, sin .exe, en Linux y Mac)
 *   voz/voces/es_MX-....onnx   una voz en español  (+ su .onnx.json)
 *   voz/voces/en_US-....onnx   una voz en inglés   (+ su .onnx.json)
 *   voz/cache/                 los audios ya generados
 *
 * Sin dependencias: solo Node.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const CARPETA = process.env.ATIS_VOZ_DIR || path.join(RAIZ, 'voz');
const CACHE = path.join(CARPETA, 'cache');

/* Cuántos audios se conservan. Cada ciclo del ATIS son dos (español e inglés);
   con 60 queda el historial de un turno completo sin llenar el disco. */
const MAX_CACHE = 60;
const LIMITE_TEXTO = 8000;        /* caracteres */
const TIEMPO_LIMITE = 120000;     /* ms: si Piper se cuelga, se mata */

/* ------------------------------------------------------------ utilidades -- */

function existe(p) {
  try { return !!p && fs.existsSync(p); } catch (e) { return false; }
}

function esEjecutable(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    if (process.platform === 'win32') return true;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch (e) { return false; }
}

function asegurarCache() {
  try { fs.mkdirSync(CACHE, { recursive: true }); return true; }
  catch (e) { return false; }
}

/* ------------------------------------------------------- el motor (piper) -- */

const NOMBRES = process.platform === 'win32' ? ['piper.exe'] : ['piper'];

/* Se busca en los lugares donde el instalador lo deja, y nada más: así nunca
   se toma por sorpresa un piper distinto que ande por el equipo. */
function candidatosBinario() {
  const lista = [];
  if (process.env.ATIS_PIPER) lista.push(process.env.ATIS_PIPER);
  NOMBRES.forEach((n) => {
    lista.push(path.join(CARPETA, 'piper', n));
    lista.push(path.join(CARPETA, n));
    lista.push(path.join(CARPETA, 'piper', 'piper', n));   /* si el ZIP traía otra capa */
  });
  return lista;
}

function buscarBinario() {
  const vistos = candidatosBinario();
  for (const c of vistos) if (existe(c) && esEjecutable(c)) return c;
  return null;
}

/* ------------------------------------------------------------- las voces -- */

/* El nombre del modelo dice el idioma: es_MX-claude-high.onnx, en_US-lessac-medium.onnx */
function idiomaDeArchivo(nombre) {
  const m = /(^|[^a-z])([a-z]{2})[_-][A-Z]{2}[-_]/.exec(nombre) || /^([a-z]{2})[_-]/.exec(nombre);
  const codigo = m ? (m[2] || m[1]) : '';
  if (codigo === 'es') return 'es';
  if (codigo === 'en') return 'en';
  return '';
}

function calidadDeArchivo(nombre) {
  const m = /-(x_low|low|medium|high)\.onnx$/i.exec(nombre);
  return m ? m[1].toLowerCase() : '';
}

function carpetasVoces() {
  return [path.join(CARPETA, 'voces'), CARPETA];
}

function buscarVoces() {
  const salida = [];
  const vistos = Object.create(null);
  carpetasVoces().forEach((dir) => {
    let archivos = [];
    try { archivos = fs.readdirSync(dir); } catch (e) { return; }
    archivos.forEach((nombre) => {
      if (!/\.onnx$/i.test(nombre) || vistos[nombre]) return;
      const ruta = path.join(dir, nombre);
      let bytes = 0;
      try { bytes = fs.statSync(ruta).size; } catch (e) { return; }
      /* Un .onnx de verdad pesa decenas de megas; uno truncado no sirve */
      if (bytes < 1000000) return;
      vistos[nombre] = true;
      salida.push({
        nombre: nombre.replace(/\.onnx$/i, ''),
        archivo: nombre,
        ruta: ruta,
        lang: idiomaDeArchivo(nombre),
        calidad: calidadDeArchivo(nombre),
        config: existe(ruta + '.json'),
        mb: Math.round(bytes / 104857.6) / 10
      });
    });
  });
  /* Primero la mejor calidad, para que la elección por omisión sea la buena */
  const orden = { high: 0, medium: 1, low: 2, x_low: 3, '': 4 };
  return salida.sort((a, b) => (orden[a.calidad] - orden[b.calidad]) || a.nombre.localeCompare(b.nombre));
}

function vocesDe(lang, lista) {
  return (lista || buscarVoces()).filter((v) => v.lang === lang && v.config);
}

/* La voz que se va a usar: la pedida si existe, si no la mejor del idioma */
function elegirVoz(lang, pedida, lista) {
  const todas = lista || buscarVoces();
  if (pedida) {
    const exacta = todas.filter((v) => v.nombre === pedida || v.archivo === pedida)[0];
    if (exacta && exacta.config) return exacta;
  }
  return vocesDe(lang, todas)[0] || null;
}

/* ------------------------------------------------------------- el estado -- */

let cacheEstado = null;
let cacheEstadoEn = 0;
const TTL_ESTADO = 5000;

function estado(forzar) {
  if (!forzar && cacheEstado && Date.now() - cacheEstadoEn < TTL_ESTADO) return cacheEstado;
  const binario = buscarBinario();
  const voces = buscarVoces();
  const es = vocesDe('es', voces);
  const en = vocesDe('en', voces);
  const faltan = [];
  if (!binario) faltan.push('el motor (voz/piper/piper' + (process.platform === 'win32' ? '.exe' : '') + ')');
  if (!es.length) faltan.push('una voz en español (voz/voces/es_*.onnx)');
  if (!en.length) faltan.push('una voz en inglés (voz/voces/en_*.onnx)');
  cacheEstado = {
    disponible: !!binario && (es.length > 0 || en.length > 0),
    completa: !!binario && es.length > 0 && en.length > 0,
    binario: binario || '',
    carpeta: CARPETA,
    voces: voces.map((v) => ({ nombre: v.nombre, lang: v.lang, calidad: v.calidad, mb: v.mb, config: v.config })),
    cuenta: { es: es.length, en: en.length },
    falta: faltan,
    plataforma: process.platform,
    cache: resumenCache(),
    sintetizando: enVuelo.size
  };
  cacheEstadoEn = Date.now();
  return cacheEstado;
}

function olvidarEstado() { cacheEstado = null; }

/* --------------------------------------------------------------- el caché -- */

function archivosCache() {
  try {
    return fs.readdirSync(CACHE)
      .filter((n) => /^[0-9a-f]{40}\.wav$/.test(n))
      .map((n) => {
        const ruta = path.join(CACHE, n);
        try { const st = fs.statSync(ruta); return { nombre: n, ruta: ruta, bytes: st.size, visto: st.mtimeMs }; }
        catch (e) { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.visto - a.visto);
  } catch (e) { return []; }
}

function resumenCache() {
  const lista = archivosCache();
  return { archivos: lista.length, mb: Math.round(lista.reduce((s, a) => s + a.bytes, 0) / 104857.6) / 10 };
}

/* Se borran los más viejos; el que se está usando siempre es de los recientes */
function podarCache() {
  const lista = archivosCache();
  for (let i = MAX_CACHE; i < lista.length; i++) {
    try { fs.unlinkSync(lista[i].ruta); } catch (e) { /* ya no estaba */ }
  }
}

function limpiarCache() {
  let borrados = 0;
  archivosCache().forEach((a) => {
    try { fs.unlinkSync(a.ruta); borrados++; } catch (e) { /* ignorado */ }
  });
  olvidarEstado();
  return borrados;
}

function rutaDe(hash) {
  if (!/^[0-9a-f]{40}$/.test(String(hash))) return null;
  const ruta = path.join(CACHE, hash + '.wav');
  return existe(ruta) ? ruta : null;
}

/* ------------------------------------------------- duración real del WAV -- */

/* Se lee del encabezado, no se estima: el deslizador del audio depende de que
   este número sea exacto. */
function duracionWav(ruta) {
  let fd = null;
  try {
    fd = fs.openSync(ruta, 'r');
    const cabeza = Buffer.alloc(4096);
    const leidos = fs.readSync(fd, cabeza, 0, 4096, 0);
    if (leidos < 44 || cabeza.toString('ascii', 0, 4) !== 'RIFF') return 0;
    const total = fs.fstatSync(fd).size;
    let canales = 1, muestreo = 22050, bits = 16, datos = 0;
    let p = 12;
    while (p + 8 <= leidos) {
      const id = cabeza.toString('ascii', p, p + 4);
      const largo = cabeza.readUInt32LE(p + 4);
      if (id === 'fmt ' && p + 24 <= leidos) {
        canales = cabeza.readUInt16LE(p + 10) || 1;
        muestreo = cabeza.readUInt32LE(p + 12) || 22050;
        bits = cabeza.readUInt16LE(p + 22) || 16;
      } else if (id === 'data') {
        /* Piper escribe el tamaño al cerrar; si viniera en cero se deduce */
        datos = largo > 0 && largo <= total ? largo : (total - (p + 8));
        break;
      }
      p += 8 + largo + (largo % 2);
    }
    if (!datos) datos = Math.max(0, total - 44);
    const porSegundo = muestreo * canales * (bits / 8);
    return porSegundo > 0 ? Math.round((datos / porSegundo) * 1000) / 1000 : 0;
  } catch (e) {
    return 0;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (e) { /* ignorado */ } }
  }
}

/* ------------------------------------------------------------- sintetizar -- */

/* Dos peticiones del mismo texto (la torre y el control remoto a la vez) no
   deben generar el audio dos veces: la segunda se cuelga de la primera. */
const enVuelo = new Map();

function normalizar(texto) {
  return String(texto || '').replace(/\s+/g, ' ').trim();
}

function firma(datos) {
  return crypto.createHash('sha1').update(JSON.stringify(datos), 'utf8').digest('hex');
}

/* velocidad: la misma escala que el navegador (1 = normal, 0.9 = más lento).
   Piper usa lo contrario (length_scale), así que se invierte. */
function escalaLargo(velocidad) {
  const v = Number(velocidad);
  if (!isFinite(v) || v <= 0) return 1;
  return Math.round((1 / Math.max(0.5, Math.min(2, v))) * 1000) / 1000;
}

function sintetizar(peticion) {
  peticion = peticion || {};
  const texto = normalizar(peticion.texto);
  const lang = peticion.lang === 'en' ? 'en' : 'es';

  if (!texto) return Promise.reject(new Error('no hay texto que sintetizar'));
  if (texto.length > LIMITE_TEXTO) {
    return Promise.reject(new Error('el texto pasa de ' + LIMITE_TEXTO + ' caracteres'));
  }

  const est = estado(true);
  if (!est.binario) return Promise.reject(new Error('Piper no está instalado en ' + CARPETA));

  const voz = elegirVoz(lang, peticion.voz);
  if (!voz) return Promise.reject(new Error('no hay voz instalada para ' + (lang === 'es' ? 'español' : 'inglés')));

  const largo = escalaLargo(peticion.velocidad);
  const silencio = Math.max(0, Math.min(2, Number(peticion.pausaFrase) || 0.2));
  const hash = firma({ t: texto, v: voz.nombre, l: largo, s: silencio, m: 1 });

  /* Ya estaba generado: se entrega al instante y sin tocar el disco */
  const listo = rutaDe(hash);
  if (listo) {
    try { fs.utimesSync(listo, new Date(), new Date()); } catch (e) { /* ignorado */ }
    return Promise.resolve(describir(hash, listo, { lang: lang, voz: voz.nombre, texto: texto, nuevo: false }));
  }

  if (enVuelo.has(hash)) return enVuelo.get(hash);

  if (!asegurarCache()) return Promise.reject(new Error('no se pudo crear la carpeta ' + CACHE));

  const destino = path.join(CACHE, hash + '.wav');
  const temporal = path.join(CACHE, hash + '.parte-' + process.pid + '.wav');

  const tarea = new Promise((resolver, rechazar) => {
    const argumentos = [
      '--model', voz.ruta,
      '--output_file', temporal,
      '--length_scale', String(largo),
      '--sentence_silence', String(silencio),
      '--quiet'
    ];
    /* El espeak-ng-data viaja junto al binario; se pasa explícito porque si se
       ejecuta desde otra carpeta Piper no lo encuentra. */
    const datosEspeak = path.join(path.dirname(est.binario), 'espeak-ng-data');
    if (existe(datosEspeak)) argumentos.push('--espeak_data', datosEspeak);

    let hijo;
    try {
      hijo = spawn(est.binario, argumentos, {
        cwd: path.dirname(est.binario),
        windowsHide: true,
        env: Object.assign({}, process.env, {
          /* En Linux las bibliotecas de Piper están junto al binario */
          LD_LIBRARY_PATH: [path.dirname(est.binario), process.env.LD_LIBRARY_PATH || ''].filter(Boolean).join(':')
        })
      });
    } catch (e) {
      rechazar(new Error('no se pudo arrancar Piper: ' + e.message));
      return;
    }

    let errores = '';
    let cerrado = false;
    const reloj = setTimeout(() => {
      if (cerrado) return;
      try { hijo.kill('SIGKILL'); } catch (e) { /* ignorado */ }
      rechazar(new Error('Piper no respondió en ' + Math.round(TIEMPO_LIMITE / 1000) + ' s'));
    }, TIEMPO_LIMITE);

    if (hijo.stderr) hijo.stderr.on('data', (t) => { if (errores.length < 4000) errores += t; });

    hijo.on('error', (e) => {
      if (cerrado) return;
      cerrado = true;
      clearTimeout(reloj);
      rechazar(new Error('no se pudo arrancar Piper: ' + e.message));
    });

    hijo.on('close', (codigo) => {
      if (cerrado) return;
      cerrado = true;
      clearTimeout(reloj);
      const salida = errores.replace(/\s+/g, ' ').trim().slice(-300);
      if (codigo !== 0) {
        borrar(temporal);
        rechazar(new Error('Piper terminó con error ' + codigo + (salida ? ': ' + salida : '')));
        return;
      }
      let bytes = 0;
      try { bytes = fs.statSync(temporal).size; } catch (e) { bytes = 0; }
      if (bytes < 1000) {
        borrar(temporal);
        rechazar(new Error('Piper no generó audio' + (salida ? ': ' + salida : '')));
        return;
      }
      try {
        fs.renameSync(temporal, destino);
      } catch (e) {
        borrar(temporal);
        rechazar(new Error('no se pudo guardar el audio: ' + e.message));
        return;
      }
      podarCache();
      olvidarEstado();
      resolver(describir(hash, destino, { lang: lang, voz: voz.nombre, texto: texto, nuevo: true }));
    });

    try {
      hijo.stdin.end(texto + '\n', 'utf8');
    } catch (e) {
      /* el 'close' de arriba se encarga del error */
    }
  });

  enVuelo.set(hash, tarea);
  const soltar = () => { enVuelo.delete(hash); };
  tarea.then(soltar, soltar);
  return tarea;
}

function borrar(ruta) {
  try { fs.unlinkSync(ruta); } catch (e) { /* ya no estaba */ }
}

function describir(hash, ruta, extra) {
  let bytes = 0;
  try { bytes = fs.statSync(ruta).size; } catch (e) { bytes = 0; }
  return {
    hash: hash,
    archivo: '/api/voz/audio/' + hash + '.wav',
    lang: extra.lang,
    voz: extra.voz,
    bytes: bytes,
    segundos: duracionWav(ruta),
    caracteres: extra.texto.length,
    nuevo: !!extra.nuevo
  };
}

/* Muestra corta para escuchar la voz antes de ponerla al aire */
const MUESTRA = {
  es: 'Aeropuerto Internacional de la Ciudad de México, información Sierra. ' +
      'Viento cero cinco cero grados ocho nudos. Altímetro tres cero tres nueve.',
  en: 'Mexico City International Airport, information Sierra. ' +
      'Wind zero five zero degrees eight knots. Altimeter three zero three niner.'
};

function muestra(lang, voz, velocidad) {
  const l = lang === 'en' ? 'en' : 'es';
  return sintetizar({ texto: MUESTRA[l], lang: l, voz: voz, velocidad: velocidad });
}

module.exports = {
  CARPETA: CARPETA,
  CACHE: CACHE,
  MAX_CACHE: MAX_CACHE,
  MUESTRA: MUESTRA,
  estado: estado,
  olvidarEstado: olvidarEstado,
  buscarBinario: buscarBinario,
  buscarVoces: buscarVoces,
  vocesDe: vocesDe,
  elegirVoz: elegirVoz,
  idiomaDeArchivo: idiomaDeArchivo,
  sintetizar: sintetizar,
  muestra: muestra,
  rutaDe: rutaDe,
  duracionWav: duracionWav,
  limpiarCache: limpiarCache,
  podarCache: podarCache,
  resumenCache: resumenCache,
  escalaLargo: escalaLargo
};
