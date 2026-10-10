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

module.exports = { URL_CAPMA, extraer, masReciente, descargar, consultar, quitarEtiquetas };
