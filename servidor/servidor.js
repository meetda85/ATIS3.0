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
  '.txt': 'text/plain; charset=utf-8', '.xls': 'application/vnd.ms-excel'
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

  if (url === '/api/salud') {
    limpiarEquipos();
    return json(res, 200, {
      ok: true,
      version: estado.version,
      actualizado: estado.actualizado,
      equipos: [...equipos.values()],
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

  if (req.method !== 'GET') { return json(res, 405, { error: 'método no permitido' }); }
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

servidor.listen(PUERTO, '0.0.0.0', () => {
  const ips = direccionesLocales();
  console.log('');
  console.log('  ATIS 3.0 — servidor de control remoto');
  console.log('  =====================================');
  console.log('');
  console.log('  En esta computadora (la que transmite):');
  console.log('     http://localhost:' + PUERTO + '/');
  console.log('');
  console.log('  Desde otra computadora de la misma red:');
  if (ips.length) ips.forEach((ip) => console.log('     http://' + ip + ':' + PUERTO + '/'));
  else console.log('     (no se detectó ninguna red; revise la conexión)');
  console.log('');
  console.log('  Esta ventana debe quedarse abierta. Ctrl+C para detener.');
  console.log('');
});

['SIGINT', 'SIGTERM'].forEach((senal) => {
  process.on(senal, () => {
    console.log('\n  Servidor detenido. El ATIS que ya está abierto sigue transmitiendo.\n');
    guardarEstado();
    process.exit(0);
  });
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('\n  ERROR: el puerto ' + PUERTO + ' ya está ocupado.');
    console.error('  Cierre el otro servidor o use: node servidor/servidor.js --puerto 8081\n');
  } else {
    console.error('\n  ERROR del servidor: ' + e.message + '\n');
  }
  process.exit(1);
});
