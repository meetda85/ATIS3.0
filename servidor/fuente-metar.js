/* ATIS 3.0 — Lectura del METAR desde la red AFTN del CAPMA
 *
 * La página del CAPMA (http://capma.mx/reportemetar/elegir_samx_3.php) publica
 * los METAR y SPECI en una lista, el más reciente arriba. Esto los extrae.
 *
 * No se analiza la estructura HTML a propósito: se quitan las etiquetas y se
 * buscan los informes por su propio formato. Así sigue funcionando aunque el
 * sitio cambie de tablas a párrafos o le muevan el diseño.
 */
'use strict';

const http = require('http');
const https = require('https');

const URL_CAPMA = 'http://capma.mx/reportemetar/elegir_samx_3.php';

/* Respaldo mundial: el servicio del NOAA. Sirve cuando la red del CAPMA no se
   alcanza, o para una estación que esa página no publica. Da el METAR oficial,
   aunque con unos minutos más de retraso que la AFTN. */
const URL_AWC = 'https://aviationweather.gov/api/data/metar?format=raw&hours=3&ids=';

/* Cada informe empieza en el indicador de estación y termina en "=" */
const RE_INFORME = /(?:\b(METAR|SPECI)\s+)?(?:\b(COR)\s+)?\b([A-Z]{4})\s+(\d{2})(\d{2})(\d{2})Z\s+([^=]{10,400}?)=/g;

function quitarEtiquetas(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ');
}

/* Hora del informe a minutos desde el inicio del mes, para poder ordenar */
function momento(dia, hora, minuto) {
  return ((dia * 24) + hora) * 60 + minuto;
}

/**
 * Extrae los informes de una página.
 * @param {string} html      contenido de la página
 * @param {string} estacion  indicador OACI; vacío devuelve todos
 * @returns {Array} informes del más reciente al más antiguo
 */
function extraer(html, estacion) {
  const texto = quitarEtiquetas(html);
  const objetivo = String(estacion || '').toUpperCase();
  const encontrados = [];
  const vistos = Object.create(null);

  RE_INFORME.lastIndex = 0;
  let m;
  while ((m = RE_INFORME.exec(texto)) !== null) {
    const tipo = m[1] || 'METAR';
    const cor = !!m[2];
    const sitio = m[3];
    const dia = +m[4], hora = +m[5], minuto = +m[6];
    if (objetivo && sitio !== objetivo) continue;
    if (hora > 23 || minuto > 59 || dia < 1 || dia > 31) continue;

    const crudo = (tipo === 'SPECI' ? 'SPECI ' : '') + (cor ? 'COR ' : '') +
      sitio + ' ' + m[4] + m[5] + m[6] + 'Z ' + m[7].trim();

    /* La página repite informes corregidos; se queda el primero de cada uno */
    const llave = crudo;
    if (vistos[llave]) continue;
    vistos[llave] = true;

    encontrados.push({
      tipo: tipo,
      corregido: cor,
      estacion: sitio,
      dia: dia, hora: hora, minuto: minuto,
      hhmm: m[5] + m[6],
      momento: momento(dia, hora, minuto),
      raw: crudo.replace(/\s+/g, ' ').trim()
    });
  }

  encontrados.sort((a, b) => b.momento - a.momento);
  return encontrados;
}

/* El NOAA entrega un informe por renglón y sin el "=" final que lleva la AFTN.
   Se lo ponemos para poder usar el mismo lector en los dos casos. */
function normalizarLineas(texto) {
  return String(texto || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 10)
    .map((l) => (l.indexOf('=') >= 0 ? l : l + '='))
    .join('\n');
}

/** El informe más reciente de una estación, o null */
function masReciente(html, estacion) {
  const lista = extraer(html, estacion);
  return lista.length ? lista[0] : null;
}

/** Descarga una página. Acepta http, que es lo que usa el CAPMA. */
function descargar(url, tiempoLimite) {
  return new Promise((resolver, rechazar) => {
    let destino;
    try { destino = new URL(url); } catch (e) { return rechazar(new Error('dirección inválida')); }
    const cliente = destino.protocol === 'https:' ? https : http;

    const peticion = cliente.get({
      protocol: destino.protocol,
      hostname: destino.hostname,
      port: destino.port || (destino.protocol === 'https:' ? 443 : 80),
      path: destino.pathname + destino.search,
      headers: { 'User-Agent': 'ATIS3.0 (laboratorio de torre)', 'Accept': 'text/html,*/*' }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolver(descargar(new URL(res.headers.location, url).href, tiempoLimite));
      }
      /* 204 es "no tengo nada de esa estación": no es una falla del sitio */
      if (res.statusCode === 204) { res.resume(); return resolver(''); }
      if (res.statusCode !== 200) {
        res.resume();
        return rechazar(new Error('el sitio respondió ' + res.statusCode));
      }
      const trozos = [];
      let total = 0;
      res.on('data', (t) => {
        total += t.length;
        if (total > 8e6) { peticion.destroy(); return rechazar(new Error('respuesta demasiado grande')); }
        trozos.push(t);
      });
      /* La página del CAPMA declara windows-1252; para el METAR basta latin1 */
      res.on('end', () => resolver(Buffer.concat(trozos).toString('latin1')));
    });

    peticion.setTimeout(tiempoLimite || 20000, () => {
      peticion.destroy();
      rechazar(new Error('el sitio no respondió a tiempo'));
    });
    peticion.on('error', (e) => rechazar(new Error(e.message)));
  });
}

/** Consulta la fuente y devuelve el informe más reciente de la estación */
async function consultar(url, estacion, tiempoLimite) {
  const html = await descargar(url || URL_CAPMA, tiempoLimite);
  const lista = extraer(html, estacion);
  return {
    url: url || URL_CAPMA,
    estacion: String(estacion || '').toUpperCase(),
    total: lista.length,
    ultimo: lista[0] || null,
    recientes: lista.slice(0, 8)
  };
}

/** Consulta el servicio del NOAA, que entrega los informes en texto plano */
async function consultarAWC(estacion, tiempoLimite) {
  const sitio = String(estacion || '').toUpperCase();
  if (!/^[A-Z]{4}$/.test(sitio)) throw new Error('el indicador debe ser de cuatro letras');
  const texto = await descargar(URL_AWC + encodeURIComponent(sitio), tiempoLimite);
  const lista = extraer(normalizarLineas(texto), sitio);
  return {
    url: URL_AWC + sitio,
    estacion: sitio,
    total: lista.length,
    ultimo: lista[0] || null,
    recientes: lista.slice(0, 8)
  };
}

/**
 * Busca el METAR de una estación donde se pueda.
 *
 * Primero en la red del CAPMA, que es la fuente operativa y la que llega antes;
 * si de ahí no sale nada, en el servicio del NOAA. Nunca se rinde en la primera:
 * el aviso final dice qué pasó en cada intento, para saber dónde está la falla.
 */
async function buscar(estacion, opciones) {
  opciones = opciones || {};
  const sitio = String(estacion || '').toUpperCase();
  if (!/^[A-Z]{4}$/.test(sitio)) {
    return { ok: false, estacion: sitio, error: 'el indicador debe ser de cuatro letras', intentos: [] };
  }

  const fuentes = [];
  if (opciones.capma !== false) {
    fuentes.push({ nombre: 'CAPMA', url: opciones.url || URL_CAPMA, leer: () => consultar(opciones.url || URL_CAPMA, sitio, opciones.tiempoLimite) });
  }
  if (opciones.awc !== false) {
    fuentes.push({ nombre: 'NOAA', url: URL_AWC + sitio, leer: () => consultarAWC(sitio, opciones.tiempoLimite) });
  }

  const intentos = [];
  for (const f of fuentes) {
    try {
      const r = await f.leer();
      if (r.ultimo) {
        intentos.push({ fuente: f.nombre, url: f.url, ok: true, total: r.total });
        return {
          ok: true, estacion: sitio, fuente: f.nombre, url: f.url,
          raw: r.ultimo.raw, informe: r.ultimo, recientes: r.recientes, intentos: intentos
        };
      }
      intentos.push({ fuente: f.nombre, url: f.url, ok: false, total: r.total,
        error: 'respondió, pero no traía ningún METAR de ' + sitio });
    } catch (e) {
      intentos.push({ fuente: f.nombre, url: f.url, ok: false, error: e.message });
    }
  }

  return {
    ok: false, estacion: sitio, intentos: intentos,
    error: intentos.length
      ? intentos.map((i) => i.fuente + ': ' + i.error).join(' · ')
      : 'no hay ninguna fuente configurada'
  };
}

module.exports = {
  URL_CAPMA, URL_AWC, extraer, masReciente, descargar, consultar, consultarAWC,
  buscar, quitarEtiquetas, normalizarLineas
};
