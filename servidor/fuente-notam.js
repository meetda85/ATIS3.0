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
const http = require('http');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
/* El servicio de NOTAM de la FAA (NMS). Hay tres ambientes y las credenciales
   sirven solo en el que las dieron: unas de preproducción no entran a
   producción, y al revés tampoco. */
const AMBIENTES = {
  prod:    { nombre: 'producción',   host: 'https://api-nms.aim.faa.gov' },
  staging: { nombre: 'preproducción', host: 'https://api-staging.cgifederal-aim.com' },
  fit:     { nombre: 'pruebas (FIT)', host: 'https://api-fit.cgifederal-aim.com' }
};
const AMBIENTE_POR_OMISION = 'prod';
const ESPERA_API = 30000;

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
  /* Cada servicio envuelve la lista a su manera: el NMS la manda en
     data.geojson, la API vieja en items, y un GeoJSON suelto en features. */
  const datos = (json && json.data) || {};
  const lista = (json && (datos.geojson || datos.geoJson || datos.features ||
    json.items || json.features)) || [];

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
      location: texto(n.icaoLocation || n.location || n.affectedFir || n.affectedFIR).toUpperCase(),
      id: texto(n.number || n.id),
      clase: texto(n.classification || ''),
      /* N: nuevo · R: reemplaza a otro · C: cancela a otro */
      tipo: texto(n.type).toUpperCase() || tipoDelTexto(crudo),
      reemplaza: referido(crudo),
      desde: fecha(n.effectiveStart || n.issued),
      hasta: fecha(n.effectiveEnd),
      raw: crudo
    });

    /* La API devuelve también los del FIR; aquí interesa el aeródromo pedido */
    if (objetivo && reg.location && reg.location !== objetivo) return;
    salida.push(reg);
  });

  return depurar(salida);
}

/* El tipo también está en la primera línea: «B2864/26 NOTAMC B2857/26» */
function tipoDelTexto(crudo) {
  const m = /\bNOTAM([NRC])\b/.exec(String(crudo));
  return m ? m[1] : '';
}

/* A qué NOTAM se refiere una cancelación o un reemplazo */
function referido(crudo) {
  const m = /\bNOTAM[RC]\s+([A-Z]\d{4}\/\d{2})/.exec(String(crudo));
  return m ? m[1] : '';
}

/**
 * Quita lo que no se transmite.
 *
 * Un NOTAMC no es información: es el aviso de que otro NOTAM quedó cancelado,
 * y su texto («... NOTAM CNL») leído al aire no significa nada para nadie. Se
 * usa para lo que sirve —borrar el que cancela— y se descarta.
 * Un NOTAMR reemplaza a otro: se queda el nuevo y se va el viejo.
 */
function depurar(lista) {
  const fuera = Object.create(null);
  lista.forEach((r) => {
    if ((r.tipo === 'C' || r.tipo === 'R') && r.reemplaza) fuera[r.reemplaza] = true;
    if (r.tipo === 'C' && r.id) fuera[r.id] = true;
  });
  return lista.filter((r) => !(r.id && fuera[r.id]));
}

/* El NMS no acepta las llaves en cada consulta: primero se cambian por un
   pase (bearer token) que dura media hora. Se guarda y se reusa mientras
   sirva; pedir uno nuevo en cada revisión sería tirar tiempo y cuota. */
const pases = Object.create(null);

function clave(ambiente, llaves) {
  return ambiente + '|' + llaves.clientId;
}

function pedir(opciones) {
  return new Promise((resolver, rechazar) => {
    let destino;
    try { destino = new URL(opciones.url); }
    catch (e) { return rechazar(new Error('dirección inválida')); }

    /* El servicio va por https; http solo aparece en las pruebas, contra un
       servidor local. */
    const cliente = destino.protocol === 'http:' ? http : https;
    const peticion = cliente.request({
      method: opciones.metodo || 'GET',
      hostname: destino.hostname,
      port: destino.port || (destino.protocol === 'http:' ? 80 : 443),
      path: destino.pathname + destino.search,
      headers: opciones.cabeceras || {}
    }, (res) => {
      /* El NMS reenvía a una dirección firmada en algunas respuestas */
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && (opciones.saltos || 0) < 5) {
        res.resume();
        let siguiente;
        try { siguiente = new URL(res.headers.location, opciones.url).toString(); }
        catch (e) { return rechazar(new Error('reenvío inválido')); }
        return resolver(pedir(Object.assign({}, opciones, { url: siguiente, saltos: (opciones.saltos || 0) + 1 })));
      }
      const trozos = [];
      let total = 0;
      res.on('data', (t) => {
        total += t.length;
        if (total > 4e7) { peticion.destroy(); return rechazar(new Error('respuesta demasiado grande')); }
        trozos.push(t);
      });
      res.on('end', () => resolver({
        codigo: res.statusCode,
        cuerpo: Buffer.concat(trozos).toString('utf8')
      }));
    });

    peticion.setTimeout(opciones.tiempoLimite || ESPERA_API, () => {
      peticion.destroy();
      rechazar(new Error('la FAA no respondió en ' +
        Math.round((opciones.tiempoLimite || ESPERA_API) / 1000) + ' s'));
    });
    peticion.on('error', (e) => rechazar(new Error(e.message)));
    if (opciones.cuerpo) peticion.write(opciones.cuerpo);
    peticion.end();
  });
}

/** Cambia las llaves por un pase, o devuelve el que ya se tenía si aún sirve */
async function pase(ambiente, llaves, tiempoLimite, host) {
  const amb = AMBIENTES[ambiente] || AMBIENTES[AMBIENTE_POR_OMISION];
  const base = host || amb.host;
  const k = clave(ambiente, llaves);
  const guardado = pases[k];
  /* Se renueva un minuto antes de que caduque, para no quedarse a medias */
  if (guardado && guardado.vence > Date.now() + 60000) return guardado.token;

  const credenciales = Buffer.from(llaves.clientId + ':' + llaves.clientSecret).toString('base64');
  const r = await pedir({
    url: base + '/v1/auth/token',
    metodo: 'POST',
    cabeceras: {
      'Authorization': 'Basic ' + credenciales,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'ATIS3.0 (laboratorio de torre)'
    },
    cuerpo: 'grant_type=client_credentials',
    tiempoLimite: tiempoLimite
  });

  if (r.codigo !== 200) {
    let detalle = '';
    try {
      const d = JSON.parse(r.cuerpo);
      detalle = d.Error || d.error_description || d.message || '';
    } catch (e) { detalle = r.cuerpo.replace(/\s+/g, ' ').slice(0, 120); }
    if (r.codigo === 401 || r.codigo === 403) {
      throw new Error('la FAA no aceptó las llaves en ' + amb.nombre +
        (detalle ? ' (' + detalle + ')' : '') +
        '. Las credenciales sirven solo en el ambiente donde se las dieron: ' +
        'pruebe cambiarlo arriba.');
    }
    throw new Error('el servicio de la FAA contestó ' + r.codigo + (detalle ? ': ' + detalle : ''));
  }

  let d;
  try { d = JSON.parse(r.cuerpo); }
  catch (e) { throw new Error('la respuesta del pase no es JSON'); }
  if (!d.access_token) throw new Error('la FAA no devolvió ningún pase');

  const dura = Math.max(60, parseInt(d.expires_in, 10) || 1799) * 1000;
  pases[k] = { token: d.access_token, vence: Date.now() + dura, productos: d.api_product_list || '' };
  return d.access_token;
}

/** Consulta los NOTAM de una estación en el NMS */
async function consultarAPI(estacion, llaves, opciones) {
  opciones = opciones || {};
  const sitio = texto(estacion).toUpperCase();
  if (!/^[A-Z]{4}$/.test(sitio)) throw new Error('el indicador debe ser de cuatro letras');
  if (!llaves || !llaves.clientId || !llaves.clientSecret) {
    throw new Error('faltan las llaves de la FAA');
  }
  const ambiente = AMBIENTES[opciones.ambiente] ? opciones.ambiente : AMBIENTE_POR_OMISION;
  const amb = AMBIENTES[ambiente];

  /* host solo para las pruebas: en la operación se usa el del ambiente */
  const base = opciones.host || amb.host;
  const token = await pase(ambiente, llaves, opciones.tiempoLimite, opciones.host);
  const r = await pedir({
    url: base + '/nmsapi/v1/notams?location=' + encodeURIComponent(sitio),
    cabeceras: {
      'Authorization': 'Bearer ' + token,
      /* GEOJSON en lugar de AIXM: trae lo mismo pero en JSON, y dentro viene
         el texto ICAO completo, que es el que sabe leer el decodificador. */
      'nmsResponseFormat': 'GEOJSON',
      'Accept': 'application/json',
      'User-Agent': 'ATIS3.0 (laboratorio de torre)'
    },
    tiempoLimite: opciones.tiempoLimite
  });

  if (r.codigo === 401 || r.codigo === 403) {
    /* El pase pudo caducar antes de tiempo: se tira y que lo pida de nuevo */
    delete pases[clave(ambiente, llaves)];
    throw new Error('la FAA rechazó la consulta en ' + amb.nombre + ' (HTTP ' + r.codigo + ')');
  }
  if (r.codigo !== 200) {
    throw new Error('la FAA contestó ' + r.codigo +
      (r.cuerpo ? ': ' + r.cuerpo.replace(/\s+/g, ' ').slice(0, 140) : ''));
  }

  let json;
  try { json = JSON.parse(r.cuerpo); }
  catch (e) { throw new Error('la FAA contestó algo que no es JSON'); }

  return {
    fuente: 'NMS de la FAA (' + amb.nombre + ')',
    estacion: sitio,
    records: deJSON(json, sitio),
    ambiente: ambiente
  };
}

/** Una comprobación rápida de que las llaves sirven, sin pedir NOTAM */
async function probarLlaves(ambiente, llaves, tiempoLimite, host) {
  const amb = AMBIENTES[ambiente] || AMBIENTES[AMBIENTE_POR_OMISION];
  await pase(ambiente, llaves, tiempoLimite, host);
  const k = clave(ambiente, llaves);
  return {
    ok: true, ambiente: ambiente, nombre: amb.nombre,
    productos: (pases[k] && pases[k].productos) || '',
    vence: pases[k] ? new Date(pases[k].vence).toISOString() : null
  };
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
    fuentes.push({
      nombre: 'NMS de la FAA',
      leer: () => consultarAPI(sitio, opciones.llaves, opciones)
    });
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
  AMBIENTES, AMBIENTE_POR_OMISION, RE_ARCHIVO,
  deJSON, depurar, tipoDelTexto, referido, consultarAPI, pase, probarLlaves, pedir,
  buscarArchivos, leerArchivo, consultarCarpeta,
  buscar, comparar, modulos,
  /* para las pruebas: olvidar los pases guardados */
  olvidarPases: function () { Object.keys(pases).forEach((k) => delete pases[k]); }
};
