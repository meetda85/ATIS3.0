/* ATIS 3.0 — Servidor local para control remoto
 *
 * Sirve la aplicación en la red local y guarda un estado compartido. La PC de
 * la torre transmite; otras PC de la misma red abren la misma dirección y
 * mandan los datos. Si el servidor se cae, la PC que transmite sigue al aire:
 * el enlace solo alimenta datos, nunca manda sobre el audio.
 *
 * Uso: node servidor/servidor.js [--puerto 8080]
 * Sin dependencias: solo Node.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const fuente = require('./fuente-metar');
const voz = require('./voz-piper');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO_ESTADO = path.join(__dirname, 'estado.json');

function arg(nombre, pordefecto) {
  const i = process.argv.indexOf('--' + nombre);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : pordefecto;
}
const PUERTO = parseInt(arg('puerto', process.env.ATIS_PUERTO || '8080'), 10);

/* ---------------------------------------------------------------- estado -- */
let estado = { version: 0, actualizado: null, origen: '', datos: null };
try {
  const guardado = JSON.parse(fs.readFileSync(ARCHIVO_ESTADO, 'utf8'));
  if (guardado && typeof guardado === 'object') estado = guardado;
  console.log('Estado recuperado del disco, versión ' + estado.version);
} catch (e) { /* primera vez */ }

/* Se escribe en el momento, sin retrasos: el estado es pequeño y cambia pocas
   veces por minuto, y si la computadora se apaga de golpe no se pierde nada. */
function guardarEstado() {
  try {
    fs.writeFileSync(ARCHIVO_ESTADO, JSON.stringify(estado), 'utf8');
  } catch (err) {
    console.error('No se pudo guardar el estado:', err.message);
  }
}

/* ------------------------------------------------- vigilancia del METAR -- */
/* Revisa la fuente cada cierto tiempo y avisa cuando aparece uno nuevo. Nunca
   cambia el ATIS por su cuenta: solo publica el hallazgo; quien transmite
   decide, y siempre al terminar el ciclo. */
let metar = {
  activo: false,
  url: fuente.URL_CAPMA,
  estacion: 'MMMX',
  minutos: 5,
  ultimo: null,          /* el informe más reciente visto */
  fuente: '',            /* de dónde salió: CAPMA o NOAA */
  revisado: null,        /* cuándo se revisó por última vez */
  error: '',
  revisiones: 0
};
let relojMetar = null;

/* Busca en la red del CAPMA y, si de ahí no sale nada, en el servicio del NOAA.
   La vigilancia no se cae porque una de las dos fuentes esté fuera de servicio. */
async function revisarMetar(motivo) {
  metar.revisado = new Date().toISOString();
  metar.revisiones++;
  try {
    const r = await fuente.buscar(metar.estacion, { url: metar.url, tiempoLimite: 20000 });
    if (!r.ok) {
      metar.error = r.error;
      console.error('[' + new Date().toLocaleTimeString() + '] no se pudo revisar el METAR: ' + r.error);
      avisar('metar', estadoMetar());
      return null;
    }
    metar.error = '';
    metar.fuente = r.fuente;
    const nuevo = !metar.ultimo || r.raw !== metar.ultimo.raw;
    metar.ultimo = r.informe;
    if (nuevo) {
      console.log('[' + new Date().toLocaleTimeString() + '] METAR nuevo (' + motivo + ', ' +
        r.fuente + '): ' + r.raw);
    }
    avisar('metar', estadoMetar());
    return r.informe;
  } catch (e) {
    metar.error = e.message;
    console.error('[' + new Date().toLocaleTimeString() + '] no se pudo revisar el METAR: ' + e.message);
    avisar('metar', estadoMetar());
    return null;
  }
}

function estadoMetar() {
  return {
    activo: metar.activo, url: metar.url, estacion: metar.estacion, minutos: metar.minutos,
    ultimo: metar.ultimo, fuente: metar.fuente, revisado: metar.revisado,
    error: metar.error, revisiones: metar.revisiones
  };
}

function programarMetar() {
  clearInterval(relojMetar);
  relojMetar = null;
  if (!metar.activo) return;
  const cada = Math.max(2, Math.min(60, metar.minutos)) * 60000;
  relojMetar = setInterval(() => revisarMetar('automático'), cada);
  revisarMetar('al activar');
}

/* Quién está conectado y qué está haciendo */
const equipos = new Map();   /* id -> { id, nombre, papel, visto, aire } */

function limpiarEquipos() {
  const limite = Date.now() - 30000;
  for (const [id, eq] of equipos) if (eq.visto < limite) equipos.delete(id);
}
setInterval(limpiarEquipos, 10000);

/* ---------------------------------------------------- avisos a los clientes -- */
const oyentes = new Set();

function avisar(tipo, carga) {
  const mensaje = 'event: ' + tipo + '\ndata: ' + JSON.stringify(carga) + '\n\n';
  for (const res of oyentes) {
    try { res.write(mensaje); } catch (e) { oyentes.delete(res); }
  }
}

/* ------------------------------------------------------------- archivos -- */
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.xls': 'application/vnd.ms-excel',
  '.wav': 'audio/wav', '.onnx': 'application/octet-stream'
};

function servirArchivo(req, res, ruta) {
  let rel = decodeURIComponent(ruta.split('?')[0]);
  if (rel === '/' ) rel = '/index.html';
  const destino = path.normalize(path.join(RAIZ, rel));
  if (!destino.startsWith(RAIZ)) { res.writeHead(403).end('Prohibido'); return; }

  fs.readFile(destino, (err, datos) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado'); return; }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(destino).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(datos);
  });
}

function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    let datos = '';
    req.on('data', (t) => {
      datos += t;
      if (datos.length > 4e6) { rechazar(new Error('cuerpo demasiado grande')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolver(datos ? JSON.parse(datos) : {}); }
      catch (e) { rechazar(new Error('JSON inválido')); }
    });
    req.on('error', rechazar);
  });
}

function json(res, codigo, cuerpo) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(cuerpo));
}

/* --------------------------------------------------------- audio neuronal -- */
/* El navegador pide trozos del WAV cuando se mueve el deslizador, así que hay
   que atender «Range»: sin eso, adelantar el audio no funciona. */
function servirAudio(req, res, archivo) {
  const hash = (/([0-9a-f]{40})\.wav$/.exec(archivo) || [])[1];
  const ruta = hash ? voz.rutaDe(hash) : null;
  if (!ruta) { return json(res, 404, { error: 'ese audio ya no está en el caché' }); }

  let total = 0;
  try { total = fs.statSync(ruta).size; } catch (e) { return json(res, 404, { error: 'no se pudo leer el audio' }); }

  const cabeceras = {
    'Content-Type': 'audio/wav',
    'Accept-Ranges': 'bytes',
    /* El nombre es el resumen del contenido: si el texto cambia, cambia la
       dirección, así que este archivo se puede guardar para siempre. */
    'Cache-Control': 'public, max-age=31536000, immutable'
  };

  const rango = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  if (rango && (rango[1] !== '' || rango[2] !== '')) {
    let desde = rango[1] === '' ? total - parseInt(rango[2], 10) : parseInt(rango[1], 10);
    let hasta = rango[1] === '' || rango[2] === '' ? total - 1 : parseInt(rango[2], 10);
    desde = Math.max(0, Math.min(total - 1, isNaN(desde) ? 0 : desde));
    hasta = Math.max(desde, Math.min(total - 1, isNaN(hasta) ? total - 1 : hasta));
    cabeceras['Content-Range'] = 'bytes ' + desde + '-' + hasta + '/' + total;
    cabeceras['Content-Length'] = hasta - desde + 1;
    res.writeHead(206, cabeceras);
    if (req.method === 'HEAD') { res.end(); return; }
    const flujo = fs.createReadStream(ruta, { start: desde, end: hasta });
    flujo.on('error', () => { try { res.destroy(); } catch (e) { /* ignorado */ } });
    flujo.pipe(res);
    return;
  }

  cabeceras['Content-Length'] = total;
  res.writeHead(200, cabeceras);
  if (req.method === 'HEAD') { res.end(); return; }
  const flujo = fs.createReadStream(ruta);
  flujo.on('error', () => { try { res.destroy(); } catch (e) { /* ignorado */ } });
  flujo.pipe(res);
}

/* --------------------------------------------- instalar la voz neuronal -- */
/* Lo mismo que hace VOZ.bat, pero desde la pantalla de Ajustes: así no hay que
   ir a buscar un archivo a una carpeta. Va contando lo que lleva, para que no
   parezca que se colgó mientras bajan los 170 MB. */
let instalacion = { andando: false, lineas: [], empezo: null, termino: null, ok: null, error: '' };

function apuntar(linea) {
  const t = String(linea).replace(/\r/g, '').trim();
  if (!t) return;
  instalacion.lineas.push(t);
  if (instalacion.lineas.length > 200) instalacion.lineas.shift();
  avisar('voz', { andando: instalacion.andando, linea: t });
}

function estadoInstalacion() {
  return {
    andando: instalacion.andando,
    empezo: instalacion.empezo,
    termino: instalacion.termino,
    ok: instalacion.ok,
    error: instalacion.error,
    lineas: instalacion.lineas.slice(-60)
  };
}

const RE_VOZ = /^[a-z]{2}_[A-Z]{2}-[A-Za-z0-9]+-(x_low|low|medium|high)$/;

function instalarVoz(cuerpo) {
  if (instalacion.andando) return { andando: true, yaEstaba: true };

  const argumentos = [path.join(__dirname, 'instalar-voz.js')];
  /* Solo se aceptan nombres con la forma de un modelo de Piper: nada más
     puede llegar a la línea de órdenes. */
  if (cuerpo && RE_VOZ.test(String(cuerpo.es || ''))) argumentos.push('--voz-es', String(cuerpo.es));
  if (cuerpo && RE_VOZ.test(String(cuerpo.en || ''))) argumentos.push('--voz-en', String(cuerpo.en));

  instalacion = { andando: true, lineas: [], empezo: new Date().toISOString(), termino: null, ok: null, error: '' };
  apuntar('Instalando la voz neuronal. Son unos 170 MB; puede tardar varios minutos.');

  const hijo = spawn(process.execPath, argumentos, { cwd: RAIZ, windowsHide: true });
  let resto = '';

  function trozo(datos) {
    resto += datos;
    const partes = resto.split(/\n/);
    resto = partes.pop();
    partes.forEach(apuntar);
    /* El instalador pinta el avance con \r en la misma línea */
    const ultimo = resto.split(/\r/).filter(Boolean).pop();
    if (ultimo && /%/.test(ultimo)) avisar('voz', { andando: true, avance: ultimo.trim() });
  }

  hijo.stdout.on('data', trozo);
  hijo.stderr.on('data', trozo);

  hijo.on('error', (e) => {
    instalacion.andando = false;
    instalacion.ok = false;
    instalacion.error = e.message;
    instalacion.termino = new Date().toISOString();
    apuntar('No se pudo arrancar el instalador: ' + e.message);
    avisar('voz', { andando: false, ok: false, error: e.message });
  });

  hijo.on('close', (codigo) => {
    if (resto) apuntar(resto);
    voz.olvidarEstado();
    const est = voz.estado(true);
    instalacion.andando = false;
    instalacion.termino = new Date().toISOString();
    instalacion.ok = codigo === 0 && est.completa;
    if (!instalacion.ok) {
      instalacion.error = est.falta.length ? 'quedó incompleta: falta ' + est.falta.join(' y ')
        : 'el instalador terminó con error ' + codigo;
    }
    apuntar(instalacion.ok ? 'Listo: la voz neuronal quedó instalada.' : instalacion.error);
    avisar('voz', { andando: false, ok: instalacion.ok, error: instalacion.error, estado: est });
    console.log('Instalación de la voz neuronal: ' + (instalacion.ok ? 'lista' : 'falló — ' + instalacion.error));
  });

  return { andando: true, yaEstaba: false };
}

/* Sintetiza las piezas que le pidan. Si un idioma falla, el otro sale igual:
   más vale un ATIS en español que ningún ATIS. */
async function sintetizarPiezas(cuerpo) {
  const piezas = Array.isArray(cuerpo.piezas) ? cuerpo.piezas.slice(0, 4) : [];
  const voces = cuerpo.voces || {};
  const salida = [];
  for (const p of piezas) {
    const lang = p && p.lang === 'en' ? 'en' : 'es';
    try {
      const r = await voz.sintetizar({
        texto: p && p.texto,
        lang: lang,
        voz: voces[lang] || '',
        velocidad: cuerpo.velocidad,
        pausaFrase: cuerpo.pausaFrase
      });
      salida.push(r);
      if (r.nuevo) {
        console.log('[' + new Date().toLocaleTimeString() + '] voz ' + lang + ': ' +
          r.segundos + ' s con ' + r.voz);
      }
    } catch (e) {
      salida.push({ lang: lang, error: e.message });
      console.error('[' + new Date().toLocaleTimeString() + '] no se pudo sintetizar ' + lang + ': ' + e.message);
    }
  }
  return salida;
}

/* ------------------------------------------------------------- servidor -- */
const servidor = http.createServer(async (req, res) => {
  const url = req.url || '/';

  if (url === '/api/estado' && req.method === 'GET') {
    return json(res, 200, estado);
  }

  if (url === '/api/estado' && req.method === 'POST') {
    try {
      const cuerpo = await leerCuerpo(req);
      estado = {
        version: estado.version + 1,
        actualizado: new Date().toISOString(),
        origen: String(cuerpo.origen || 'desconocido').slice(0, 60),
        datos: cuerpo.datos || null
      };
      guardarEstado();
      avisar('estado', { version: estado.version, origen: estado.origen, actualizado: estado.actualizado });
      console.log('[' + new Date().toLocaleTimeString() + '] datos nuevos de ' + estado.origen +
        ' → versión ' + estado.version);
      return json(res, 200, { version: estado.version, actualizado: estado.actualizado });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  if (url.startsWith('/api/latido') && req.method === 'POST') {
    try {
      const c = await leerCuerpo(req);
      const id = String(c.id || '').slice(0, 40) || 'sin-id';
      equipos.set(id, {
        id: id,
        nombre: String(c.nombre || 'equipo').slice(0, 40),
        papel: c.papel === 'transmisor' ? 'transmisor' : 'control',
        aire: c.aire || null,
        visto: Date.now()
      });
      limpiarEquipos();
      return json(res, 200, { version: estado.version, equipos: [...equipos.values()] });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  /* Busca el METAR de una estación cualquiera. Lo hace el servidor porque el
     navegador no puede: los sitios de meteorología no autorizan la consulta
     desde otra página (CORS), así que desde el navegador siempre falla. */
  if (url.startsWith('/api/metar/buscar') && req.method === 'GET') {
    const pedido = new URL(url, 'http://local');
    const estacion = String(pedido.searchParams.get('estacion') || metar.estacion).toUpperCase();
    const r = await fuente.buscar(estacion, { url: metar.url, tiempoLimite: 15000 });
    console.log('[' + new Date().toLocaleTimeString() + '] METAR de ' + estacion + ': ' +
      (r.ok ? r.fuente + ' → ' + r.raw : 'no se pudo (' + r.error + ')'));
    return json(res, r.ok ? 200 : 502, r);
  }

  if (url.startsWith('/api/metar') && req.method === 'GET') {
    if (/revisar=1/.test(url)) {
      await revisarMetar('a petición');
    }
    return json(res, 200, estadoMetar());
  }

  if (url === '/api/metar' && req.method === 'POST') {
    try {
      const c = await leerCuerpo(req);
      if (typeof c.activo === 'boolean') metar.activo = c.activo;
      if (c.url) metar.url = String(c.url).slice(0, 400);
      if (c.estacion) metar.estacion = String(c.estacion).toUpperCase().slice(0, 4);
      if (c.minutos) metar.minutos = Math.max(2, Math.min(60, parseInt(c.minutos, 10) || 5));
      programarMetar();
      console.log('Vigilancia del METAR: ' + (metar.activo
        ? metar.estacion + ' cada ' + metar.minutos + ' min desde ' + metar.url
        : 'apagada'));
      return json(res, 200, estadoMetar());
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  if (url.startsWith('/api/voz/audio/') && (req.method === 'GET' || req.method === 'HEAD')) {
    return servirAudio(req, res, url.split('?')[0]);
  }

  /* Exacto a propósito: si fuera «empieza con», se tragaría las demás rutas
     de /api/voz que vienen abajo. */
  if ((url === '/api/voz' || url.indexOf('/api/voz?') === 0) && req.method === 'GET') {
    return json(res, 200, voz.estado(/revisar=1/.test(url)));
  }

  if (url === '/api/voz/sintetizar' && req.method === 'POST') {
    try {
      const cuerpo = await leerCuerpo(req);
      const piezas = await sintetizarPiezas(cuerpo);
      return json(res, 200, { piezas: piezas, estado: voz.estado(true) });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  if (url === '/api/voz/muestra' && req.method === 'POST') {
    try {
      const c = await leerCuerpo(req);
      const r = await voz.muestra(c.lang, c.voz, c.velocidad);
      return json(res, 200, r);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  if (url === '/api/voz/instalar' && req.method === 'POST') {
    try {
      const c = await leerCuerpo(req);
      const r = instalarVoz(c);
      return json(res, 200, Object.assign(r, estadoInstalacion()));
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  if (url === '/api/voz/instalacion' && req.method === 'GET') {
    return json(res, 200, estadoInstalacion());
  }

  if (url === '/api/voz/limpiar' && req.method === 'POST') {
    const borrados = voz.limpiarCache();
    console.log('Caché de voz vaciado: ' + borrados + ' archivos');
    return json(res, 200, { borrados: borrados, estado: voz.estado(true) });
  }

  if (url === '/api/salud') {
    limpiarEquipos();
    return json(res, 200, {
      ok: true,
      version: estado.version,
      actualizado: estado.actualizado,
      equipos: [...equipos.values()],
      voz: { disponible: voz.estado().disponible, completa: voz.estado().completa },
      desde: arranque.toISOString()
    });
  }

  if (url === '/api/eventos') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write('retry: 2000\n\n');
    res.write('event: estado\ndata: ' + JSON.stringify({ version: estado.version, origen: estado.origen }) + '\n\n');
    oyentes.add(res);
    const latido = setInterval(() => { try { res.write(': latido\n\n'); } catch (e) { /* ignorado */ } }, 15000);
    req.on('close', () => { clearInterval(latido); oyentes.delete(res); });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { return json(res, 405, { error: 'método no permitido' }); }
  servirArchivo(req, res, url);
});

/* --------------------------------------------------------------- arranque -- */
const arranque = new Date();

function direccionesLocales() {
  const salida = [];
  const redes = os.networkInterfaces();
  for (const nombre of Object.keys(redes)) {
    for (const red of redes[nombre] || []) {
      if (red.family === 'IPv4' && !red.internal) salida.push(red.address);
    }
  }
  return salida;
}

/* ¿Lo que está en ese puerto es otro ATIS, o un programa ajeno? */
function quienOcupa(puerto) {
  return new Promise((resolver) => {
    const pet = http.get({ host: '127.0.0.1', port: puerto, path: '/api/salud', timeout: 2000 }, (res) => {
      let cuerpo = '';
      res.on('data', (t) => { cuerpo += t; if (cuerpo.length > 20000) res.destroy(); });
      res.on('end', () => {
        try {
          const d = JSON.parse(cuerpo);
          resolver(d && d.ok && d.desde ? { atis: true, desde: d.desde, version: d.version } : { atis: false });
        } catch (e) { resolver({ atis: false }); }
      });
    });
    pet.on('timeout', () => { pet.destroy(); resolver({ atis: false }); });
    pet.on('error', () => resolver({ atis: false }));
  });
}

function anunciar(puerto) {
  const ips = direccionesLocales();
  console.log('');
  console.log('  ATIS 3.0 — servidor de control remoto');
  console.log('  =====================================');
  console.log('');
  console.log('  En esta computadora (la que transmite):');
  console.log('     http://localhost:' + puerto + '/');
  console.log('');
  console.log('  Desde otra computadora de la misma red:');
  if (ips.length) ips.forEach((ip) => console.log('     http://' + ip + ':' + puerto + '/'));
  else console.log('     (no se detectó ninguna red; revise la conexión)');
  console.log('');
  const ev = voz.estado(true);
  console.log('  Voz neuronal (Piper): ' + (ev.completa
    ? 'lista, ' + ev.voces.filter((v) => v.lang).map((v) => v.nombre).join(' / ')
    : (ev.disponible ? 'incompleta, falta ' + ev.falta.join(' y ')
      : 'no instalada — se instala desde Ajustes → Voz neuronal, o con VOZ.bat')));
  console.log('');
  console.log('  Esta ventana debe quedarse abierta. Ctrl+C para detener.');
  console.log('');
  /* Línea para el .bat: así sabe a qué dirección abrir el navegador */
  console.log('ATIS_PUERTO=' + puerto);
}

/* Si el puerto está ocupado no se da por vencido:
   - si lo ocupa otro ATIS, lo dice y manda a usar esa dirección, que ya sirve;
   - si lo ocupa cualquier otro programa, se corre al siguiente puerto libre.
   El operador nunca se queda sin servidor por un puerto. */
const MAX_PUERTOS = 12;

function arrancar(puerto, movido) {
  servidor.once('error', async (e) => {
    if (e.code !== 'EADDRINUSE') {
      console.error('\n  ERROR del servidor: ' + e.message + '\n');
      process.exit(1);
    }
    const quien = await quienOcupa(puerto);
    if (quien.atis) {
      console.log('');
      console.log('  Ya hay un ATIS andando en el puerto ' + puerto + ', desde las ' +
        new Date(quien.desde).toLocaleTimeString() + '.');
      console.log('  No hace falta otro: use esa misma ventana del navegador.');
      console.log('');
      console.log('     http://localhost:' + puerto + '/');
      direccionesLocales().forEach((ip) => console.log('     http://' + ip + ':' + puerto + '/'));
      console.log('');
      console.log('ATIS_PUERTO=' + puerto);
      console.log('ATIS_YA_ANDABA=1');
      process.exit(0);
    }
    if (movido >= MAX_PUERTOS) {
      console.error('\n  ERROR: del puerto ' + PUERTO + ' al ' + (PUERTO + MAX_PUERTOS) +
        ' están todos ocupados por otros programas.');
      console.error('  Elija uno a mano: node servidor/servidor.js --puerto 9100\n');
      process.exit(1);
    }
    console.log('  El puerto ' + puerto + ' lo ocupa otro programa; se usa el ' + (puerto + 1) + '.');
    arrancar(puerto + 1, movido + 1);
  });

  servidor.listen(puerto, '0.0.0.0');
}

/* El aviso sale de aquí y no del listen: así dice el puerto en el que de
   verdad quedó, aunque haya tenido que correrse a otro. */
let puertoEnUso = PUERTO;
servidor.on('listening', () => {
  const dir = servidor.address();
  puertoEnUso = (dir && dir.port) || PUERTO;
  anunciar(puertoEnUso);
});

arrancar(PUERTO, 0);

['SIGINT', 'SIGTERM'].forEach((senal) => {
  process.on(senal, () => {
    console.log('\n  Servidor detenido. El ATIS que ya está abierto sigue transmitiendo.\n');
    guardarEstado();
    process.exit(0);
  });
});
