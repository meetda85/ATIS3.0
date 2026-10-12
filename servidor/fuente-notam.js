/* ATIS 3.0 — De dónde salen los NOTAM, sin bajar nada a mano
 *
 * Dos caminos, y los dos dan exactamente los mismos registros que la carga
 * manual del archivo del FNS, así que de aquí para abajo nada cambia:
 *
 *   1. La API oficial de la FAA (external-api.faa.gov). Es la buena: contesta
 *      JSON, no se cae, y no hay que bajar ningún archivo. Pide unas llaves
 *      gratuitas que se sacan una vez en api.faa.gov.
 *
 *   2. Una carpeta vigilada. Se sigue bajando el Excel de la página de la FAA
 *      como siempre, pero el programa lo levanta solo de la carpeta de
 *      Descargas. No hace falta registrarse ni pedir permiso a nadie.
 *
 * Lo que NO se hace: imitar a un navegador contra notams.aim.faa.gov. Ese
 * sitio está detrás de una protección que bloquea a los programas (contesta
 * 403), y montar el ATIS sobre algo que el otro lado trata de impedir es
 * pedir que falle el día menos conveniente.
 *
 * Sin dependencias: solo Node.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const API_FAA = 'https://external-api.faa.gov/notamapi/v1/notams';
const ESPERA_API = 25000;

/* ------------------------------------------------ los módulos del navegador -- */

/* El decodificador de NOTAM y el lector del FNS son los mismos que usa la
   pantalla. Se cargan aquí para no tener dos versiones que se desincronicen. */
let navegador = null;

function modulos() {
  if (navegador) return navegador;
  const ctx = vm.createContext({ console: console, Date: Date, Math: Math, JSON: JSON });
  ctx.window = ctx;
  ['js/data/dictionary.js', 'js/notam.js', 'js/fns.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f });
  });
  navegador = ctx.ATIS;
  return navegador;
}

/* ------------------------------------------------------------ utilidades -- */

function texto(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\r/g, '').trim();
}

function fecha(v) {
  const t = texto(v);
  if (!t || /^PERM$/i.test(t)) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

/* Completa lo que falte sacándolo del propio texto del NOTAM */
function completar(reg) {
  if (!reg.id) {
    const m = /\b([A-Z]\d{4}\/\d{2})\b/.exec(reg.raw);
    if (m) reg.id = m[1];
  }
  if (!reg.location) {
    const m = /\bA\)\s*([A-Z]{4})/.exec(reg.raw);
    if (m) reg.location = m[1];
  }
  return reg;
}

/* ------------------------------------------- 1) la API oficial de la FAA -- */

/* La respuesta trae cada NOTAM anidado en varias capas y con el texto en más
   de un formato. Se busca con paciencia y se prefiere el formato ICAO, que es
   el que lleva los campos Q) A) B) C) E) que el decodificador entiende. */
function deJSON(json, estacion) {
  const salida = [];
  const objetivo = texto(estacion).toUpperCase();
  const lista = (json && (json.items || json.features)) || [];

  lista.forEach((item) => {
    const prop = (item && (item.properties || item)) || {};
    const nucleo = prop.coreNOTAMData || prop;
    const n = nucleo.notam || nucleo;
    if (!n || typeof n !== 'object') return;

    /* El texto, por orden de preferencia:
       1) el formato ICAO, que trae los campos Q) A) B) C) E) completos;
       2) el cuerpo del NOTAM tal cual, con sus contracciones, que es lo que
          el decodificador de la aplicación sabe traducir;
       3) cualquier otra traducción, como último recurso. */
    const traducciones = (nucleo.notamTranslation || n.notamTranslation || []);
    let crudo = '';
    if (Array.isArray(traducciones)) {
      const icao = traducciones.filter((t) => t && /ICAO/i.test(texto(t.type)) &&
        (t.formattedText || t.simpleText))[0];
      if (icao) crudo = texto(icao.formattedText || icao.simpleText);
    }
    if (!crudo) crudo = texto(n.text);
    if (!crudo && Array.isArray(traducciones)) {
      const otra = traducciones.filter((t) => t && (t.formattedText || t.simpleText))[0];
      if (otra) crudo = texto(otra.formattedText || otra.simpleText);
    }
    if (!crudo || crudo.length < 10) return;

    const reg = completar({
      location: texto(n.icaoLocation || n.location || n.affectedFIR).toUpperCase(),
      id: texto(n.number || n.id),
      clase: texto(n.classification || n.type),
      desde: fecha(n.effectiveStart || n.issued),
      hasta: fecha(n.effectiveEnd),
      raw: crudo
    });

    /* La API devuelve también los del FIR; aquí interesa el aeródromo pedido */
    if (objetivo && reg.location && reg.location !== objetivo) return;
    salida.push(reg);
  });

  return salida;
}

function pedirJSON(url, llaves, tiempoLimite) {
  return new Promise((resolver, rechazar) => {
    let destino;
    try { destino = new URL(url); } catch (e) { return rechazar(new Error('dirección inválida')); }

    const peticion = https.request({
      method: 'GET',
      hostname: destino.hostname,
      path: destino.pathname + destino.search,
      headers: {
        'client_id': llaves.clientId,
        'client_secret': llaves.clientSecret,
        'Accept': 'application/json',
        'User-Agent': 'ATIS3.0 (laboratorio de torre)'
      }
    }, (res) => {
      const trozos = [];
      let total = 0;
      res.on('data', (t) => {
        total += t.length;
        if (total > 2e7) { peticion.destroy(); return rechazar(new Error('respuesta demasiado grande')); }
        trozos.push(t);
      });
      res.on('end', () => {
        const cuerpo = Buffer.concat(trozos).toString('utf8');
        if (res.statusCode === 401 || res.statusCode === 403) {
          return rechazar(new Error('la FAA no aceptó las llaves (HTTP ' + res.statusCode +
            '). Revise que estén bien copiadas y que la API esté aprobada en api.faa.gov'));
        }
        if (res.statusCode !== 200) {
          return rechazar(new Error('la FAA contestó ' + res.statusCode +
            (cuerpo ? ': ' + cuerpo.replace(/\s+/g, ' ').slice(0, 160) : '')));
        }
        try { resolver(JSON.parse(cuerpo)); }
        catch (e) { rechazar(new Error('la FAA contestó algo que no es JSON')); }
      });
    });

    peticion.setTimeout(tiempoLimite || ESPERA_API, () => {
      peticion.destroy();
      rechazar(new Error('la FAA no respondió en ' + Math.round((tiempoLimite || ESPERA_API) / 1000) + ' s'));
    });
    peticion.on('error', (e) => rechazar(new Error(e.message)));
    peticion.end();
  });
}

async function consultarAPI(estacion, llaves, opciones) {
  opciones = opciones || {};
  const sitio = texto(estacion).toUpperCase();
  if (!/^[A-Z]{4}$/.test(sitio)) throw new Error('el indicador debe ser de cuatro letras');
  if (!llaves || !llaves.clientId || !llaves.clientSecret) {
    throw new Error('faltan las llaves de la FAA');
  }

  /* Se piden de a mil, que es el máximo, y se recorren las páginas si hiciera falta */
  const porPagina = 1000;
  let pagina = 1, registros = [], paginas = 0;
  for (;;) {
    const url = API_FAA + '?icaoLocation=' + encodeURIComponent(sitio) +
      '&responseFormat=geoJson&pageSize=' + porPagina + '&pageNum=' + pagina;
    const json = await pedirJSON(url, llaves, opciones.tiempoLimite);
    paginas++;
    registros = registros.concat(deJSON(json, sitio));
    const total = Number(json.totalCount || json.total || 0);
    if (!total || registros.length >= total || paginas >= 5) break;
    const traidos = ((json.items || json.features) || []).length;
    if (!traidos) break;
    pagina++;
  }

  return { fuente: 'API de la FAA', estacion: sitio, records: registros, paginas: paginas };
}

/* --------------------------------------------- 2) la carpeta de descargas -- */

/* Lo que baja la página de la FAA se llama fnsNotams_<fecha>.xls; también se
   acepta cualquier hoja de cálculo, por si cambian el nombre. */
const RE_ARCHIVO = /\.(xls|xlsx|csv)$/i;

function buscarArchivos(carpeta, cuantos) {
  const dir = texto(carpeta);
  if (!dir) return [];
  let nombres = [];
  try { nombres = fs.readdirSync(dir); } catch (e) { return []; }
  return nombres
    .filter((n) => RE_ARCHIVO.test(n))
    .map((n) => {
      const ruta = path.join(dir, n);
      try {
        const st = fs.statSync(ruta);
        if (!st.isFile()) return null;
        return { nombre: n, ruta: ruta, bytes: st.size, visto: st.mtimeMs, fns: /^fnsNotams/i.test(n) };
      } catch (e) { return null; }
    })
    .filter(Boolean)
    /* Primero los del FNS, y dentro de cada grupo el más reciente */
    .sort((a, b) => (b.fns - a.fns) || (b.visto - a.visto))
    .slice(0, cuantos || 12);
}

function leerArchivo(ruta) {
  const XLSX = require(path.join(RAIZ, 'js', 'vendor', 'xlsx.full.min.js'));
  const datos = fs.readFileSync(ruta);
  const libro = XLSX.read(datos, { type: 'buffer' });
  if (!libro.SheetNames.length) throw new Error('el archivo no tiene ninguna hoja');
  const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: false });
  const r = modulos().fns.fromMatrix(filas);
  if (!r.records.length) {
    throw new Error(r.errors[0] || 'el archivo no traía ningún NOTAM reconocible');
  }
  return r;
}

function consultarCarpeta(carpeta, estacion) {
  const archivos = buscarArchivos(carpeta, 12);
  if (!archivos.length) {
    throw new Error('no hay ninguna hoja de cálculo en ' + (carpeta || '(carpeta sin indicar)'));
  }
  const elegido = archivos[0];
  const r = leerArchivo(elegido.ruta);
  const sitio = texto(estacion).toUpperCase();
  const registros = sitio
    ? r.records.filter((x) => !x.location || x.location === sitio)
    : r.records;
  return {
    fuente: 'carpeta vigilada',
    estacion: r.station || sitio,
    records: registros,
    archivo: { nombre: elegido.nombre, bytes: elegido.bytes, visto: new Date(elegido.visto).toISOString() },
    descartados: r.records.length - registros.length
  };
}

/* --------------------------------------------------------------- elegir -- */

/**
 * Trae los NOTAM de donde se pueda, en orden: la API si hay llaves, y si no
 * (o si falla) la carpeta. Siempre dice qué intentó y qué pasó en cada caso.
 */
async function buscar(estacion, opciones) {
  opciones = opciones || {};
  const sitio = texto(estacion).toUpperCase();
  if (!/^[A-Z]{4}$/.test(sitio)) {
    return { ok: false, estacion: sitio, error: 'el indicador debe ser de cuatro letras', intentos: [] };
  }

  const intentos = [];
  const fuentes = [];
  if (opciones.llaves && opciones.llaves.clientId && opciones.llaves.clientSecret) {
    fuentes.push({ nombre: 'API de la FAA', leer: () => consultarAPI(sitio, opciones.llaves, opciones) });
  }
  if (opciones.carpeta) {
    fuentes.push({ nombre: 'carpeta vigilada', leer: () => consultarCarpeta(opciones.carpeta, sitio) });
  }

  if (!fuentes.length) {
    return {
      ok: false, estacion: sitio, intentos: [],
      error: 'no hay ninguna fuente configurada: hacen falta las llaves de la FAA o una carpeta que vigilar'
    };
  }

  for (const f of fuentes) {
    try {
      const r = await f.leer();
      if (r.records.length) {
        intentos.push({ fuente: f.nombre, ok: true, total: r.records.length });
        return Object.assign({ ok: true, intentos: intentos }, r);
      }
      intentos.push({ fuente: f.nombre, ok: false, total: 0,
        error: 'respondió, pero sin ningún NOTAM de ' + sitio });
    } catch (e) {
      intentos.push({ fuente: f.nombre, ok: false, error: e.message });
    }
  }

  return {
    ok: false, estacion: sitio, intentos: intentos,
    error: intentos.map((i) => i.fuente + ': ' + i.error).join(' · ')
  };
}

/* Compara con lo que ya se tiene: cuáles son nuevos y cuáles desaparecieron */
function comparar(nuevos, anteriores) {
  const clave = (r) => texto(r.id) || texto(r.raw).slice(0, 60);
  const antes = Object.create(null);
  (anteriores || []).forEach((r) => { antes[clave(r)] = r; });
  const ahora = Object.create(null);
  (nuevos || []).forEach((r) => { ahora[clave(r)] = r; });

  return {
    nuevos: (nuevos || []).filter((r) => !antes[clave(r)]),
    idos: (anteriores || []).filter((r) => !ahora[clave(r)]),
    iguales: (nuevos || []).filter((r) => antes[clave(r)]).length
  };
}

module.exports = {
  API_FAA, RE_ARCHIVO,
  deJSON, consultarAPI, pedirJSON,
  buscarArchivos, leerArchivo, consultarCarpeta,
  buscar, comparar, modulos
};
