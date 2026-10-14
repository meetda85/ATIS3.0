/* ATIS 3.0 — La parte de ajustes que no es de todos
 *
 * Separa lo que cualquiera en la torre puede tocar —el tema, la velocidad de
 * locución, las voces— de lo que no: las credenciales de la FAA, las fuentes
 * de datos y el control remoto.
 *
 * Qué protege de verdad y qué no, dicho de frente:
 *
 *   - La clave vive AQUÍ, en el servidor, y guardada en resumen (no se puede
 *     leer de vuelta). Nunca viaja a la pantalla, así que mirar el código de
 *     la página no la revela.
 *   - Las rutas que cambian credenciales o fuentes exigen un pase que solo se
 *     consigue escribiendo la clave. No es un candado de adorno en la
 *     pantalla: sin pase, el servidor dice que no.
 *   - El secreto de la FAA NUNCA sale del servidor, con clave o sin ella. Aun
 *     si alguien entrara, no se lo lleva.
 *
 * Lo que NO es: esto es un laboratorio en una red local, no un banco. Una
 * clave de cuatro cifras detiene a quien no tiene por qué andar ahí; no
 * detiene a alguien decidido con acceso a la computadora.
 *
 * Sin dependencias: solo Node.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ARCHIVO = path.join(__dirname, 'admin.json');
const CLAVE_INICIAL = '0348';

/* Cuánto dura un pase sin tocar nada. Un turno de torre es largo, pero dejar
   la sesión abierta para siempre sería lo mismo que no tener clave. */
const VIDA_PASE = 8 * 3600 * 1000;

/* Una clave de cuatro cifras son diez mil combinaciones: a mano no se prueban,
   con un programa sí. El castigo por fallar hace que no valga la pena. */
const FALLOS_ANTES_DE_ESPERA = 5;
const ESPERA_BASE = 30000;

let config = null;
const pases = new Map();     /* token -> { creado, visto } */
let fallos = 0;
let bloqueadoHasta = 0;

/* ------------------------------------------------------------ la clave -- */

function resumen(clave, sal) {
  return crypto.pbkdf2Sync(String(clave), sal, 120000, 32, 'sha256').toString('hex');
}

function cargar() {
  if (config) return config;
  try {
    const d = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
    if (d && d.sal && d.hash) { config = d; return config; }
  } catch (e) { /* primera vez */ }
  config = nueva(CLAVE_INICIAL);
  guardar();
  return config;
}

function nueva(clave) {
  const sal = crypto.randomBytes(16).toString('hex');
  return { sal: sal, hash: resumen(clave, sal), cambiada: null };
}

function guardar() {
  try {
    fs.writeFileSync(ARCHIVO, JSON.stringify(config), 'utf8');
  } catch (e) {
    console.error('No se pudo guardar la clave de administración:', e.message);
  }
}

/** ¿La clave es la correcta? Comparación en tiempo constante. */
function correcta(clave) {
  const c = cargar();
  const dado = Buffer.from(resumen(clave, c.sal), 'hex');
  const bueno = Buffer.from(c.hash, 'hex');
  if (dado.length !== bueno.length) return false;
  return crypto.timingSafeEqual(dado, bueno);
}

/** ¿Sigue siendo la que viene de fábrica? Conviene avisarlo. */
function esLaDeFabrica() {
  return correcta(CLAVE_INICIAL);
}

/* ------------------------------------------------------------- los pases -- */

function limpiarPases() {
  const limite = Date.now() - VIDA_PASE;
  for (const [t, p] of pases) if (p.visto < limite) pases.delete(t);
}

/**
 * Entra con la clave y devuelve un pase.
 * @returns {{ok:boolean, pase?:string, error?:string, esperaSegundos?:number}}
 */
function entrar(clave) {
  const ahora = Date.now();
  if (ahora < bloqueadoHasta) {
    return {
      ok: false,
      error: 'demasiados intentos fallidos',
      esperaSegundos: Math.ceil((bloqueadoHasta - ahora) / 1000)
    };
  }
  if (!clave || !correcta(clave)) {
    fallos++;
    if (fallos >= FALLOS_ANTES_DE_ESPERA) {
      /* Cada tanda de fallos espera el doble que la anterior */
      const tandas = fallos - FALLOS_ANTES_DE_ESPERA + 1;
      bloqueadoHasta = ahora + ESPERA_BASE * Math.pow(2, Math.min(tandas - 1, 6));
    }
    return { ok: false, error: 'clave incorrecta', intentos: fallos };
  }
  fallos = 0;
  bloqueadoHasta = 0;
  limpiarPases();
  const pase = crypto.randomBytes(24).toString('hex');
  pases.set(pase, { creado: ahora, visto: ahora });
  return { ok: true, pase: pase, deFabrica: esLaDeFabrica() };
}

/** ¿Este pase sirve? Si sirve, se le renueva la vigencia. */
function vale(pase) {
  if (!pase) return false;
  const p = pases.get(String(pase));
  if (!p) return false;
  if (Date.now() - p.visto > VIDA_PASE) { pases.delete(String(pase)); return false; }
  p.visto = Date.now();
  return true;
}

function salir(pase) {
  return pases.delete(String(pase || ''));
}

/** Cambia la clave. Hace falta la actual: un pase no basta. */
function cambiar(actual, nueva2) {
  if (!correcta(actual)) return { ok: false, error: 'la clave actual no es esa' };
  const limpia = String(nueva2 || '').trim();
  if (!/^\d{4,12}$/.test(limpia)) {
    return { ok: false, error: 'la clave nueva debe ser de 4 a 12 cifras' };
  }
  config = nueva(limpia);
  config.cambiada = new Date().toISOString();
  guardar();
  /* Se cierran todas las sesiones: la clave cambió, hay que volver a entrar */
  pases.clear();
  return { ok: true };
}

/** El pase que trae una petición, si trae alguno */
function paseDe(req) {
  const h = (req && req.headers) || {};
  return String(h['x-atis-admin'] || h['X-ATIS-Admin'] || '').trim();
}

function abierto(req) {
  return vale(paseDe(req));
}

function estado() {
  limpiarPases();
  const c = cargar();
  return {
    protegido: true,
    deFabrica: esLaDeFabrica(),
    cambiada: c.cambiada || null,
    sesiones: pases.size,
    bloqueadoSegundos: Date.now() < bloqueadoHasta
      ? Math.ceil((bloqueadoHasta - Date.now()) / 1000) : 0
  };
}

/* Para las pruebas: volver a empezar */
function reiniciar() {
  config = null;
  pases.clear();
  fallos = 0;
  bloqueadoHasta = 0;
  try { fs.unlinkSync(ARCHIVO); } catch (e) { /* no estaba */ }
}

module.exports = {
  ARCHIVO, CLAVE_INICIAL, VIDA_PASE, FALLOS_ANTES_DE_ESPERA,
  entrar, salir, vale, cambiar, correcta, esLaDeFabrica,
  paseDe, abierto, estado, reiniciar
};
