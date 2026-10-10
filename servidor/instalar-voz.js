/* ATIS 3.0 — Instalador de la voz neuronal (Piper)
 *
 * Se ejecuta una sola vez, con internet. Baja el motor y las voces y las deja
 * en la carpeta «voz» del programa. De ahí en adelante el ATIS ya no necesita
 * internet para hablar.
 *
 *   node servidor/instalar-voz.js
 *   node servidor/instalar-voz.js --voz-es es_MX-ald-medium --voz-en en_US-ryan-high
 *   node servidor/instalar-voz.js --solo-voces      (el motor ya está)
 *   node servidor/instalar-voz.js --solo-motor
 *
 * Si algo se corta a medias no pasa nada: se vuelve a ejecutar y continúa.
 * Lo ya descargado no se baja otra vez.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const voz = require('./voz-piper');

const VERSION_PIPER = '2023.11.14-2';
const BASE_PIPER = 'https://github.com/rhasspy/piper/releases/download/' + VERSION_PIPER + '/';
const BASE_VOCES = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';

/* Las voces por omisión: español de México y inglés de Estados Unidos.
   La ruta dentro del repositorio se arma con el propio nombre. */
const POR_OMISION = { es: 'es_MX-claude-high', en: 'en_US-lessac-medium' };

const PAQUETES = {
  'win32-x64': 'piper_windows_amd64.zip',
  'linux-x64': 'piper_linux_x86_64.tar.gz',
  'linux-arm64': 'piper_linux_aarch64.tar.gz',
  'linux-arm': 'piper_linux_armv7l.tar.gz',
  'darwin-x64': 'piper_macos_x64.tar.gz',
  'darwin-arm64': 'piper_macos_aarch64.tar.gz'
};

function arg(nombre, pordefecto) {
  const i = process.argv.indexOf('--' + nombre);
  if (i > 0 && process.argv[i + 1] && !/^--/.test(process.argv[i + 1])) return process.argv[i + 1];
  const igual = process.argv.filter((a) => a.indexOf('--' + nombre + '=') === 0)[0];
  return igual ? igual.split('=').slice(1).join('=') : pordefecto;
}
function bandera(nombre) { return process.argv.indexOf('--' + nombre) > 0; }

function mb(bytes) { return (bytes / 1048576).toFixed(1) + ' MB'; }

/* --------------------------------------------------------------- descarga -- */

function bajar(url, destino, etiqueta, intento, saltos) {
  intento = intento || 1;
  saltos = saltos || 0;
  return new Promise((resolver, rechazar) => {
    if (saltos > 8) { rechazar(new Error(etiqueta + ': demasiados reenvíos')); return; }
    const temporal = destino + '.parcial';
    const salida = fs.createWriteStream(temporal);
    let hechos = 0, total = 0, ultimo = 0;

    const peticion = https.get(url, { headers: { 'User-Agent': 'ATIS3/3.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        salida.destroy();
        try { fs.unlinkSync(temporal); } catch (e) { /* ignorado */ }
        res.resume();
        /* Hugging Face reenvía a una dirección relativa, así que hay que
           resolverla contra la anterior o Node la rechaza por inválida. */
        let siguiente;
        try { siguiente = new URL(res.headers.location, url).toString(); }
        catch (e) { rechazar(new Error(etiqueta + ': reenvío inválido')); return; }
        bajar(siguiente, destino, etiqueta, intento, saltos + 1).then(resolver, rechazar);
        return;
      }
      if (res.statusCode !== 200) {
        salida.destroy();
        try { fs.unlinkSync(temporal); } catch (e) { /* ignorado */ }
        res.resume();
        rechazar(new Error(etiqueta + ': el servidor contestó ' + res.statusCode));
        return;
      }
      total = parseInt(res.headers['content-length'] || '0', 10);
      res.on('data', (t) => {
        hechos += t.length;
        if (Date.now() - ultimo > 1000) {
          ultimo = Date.now();
          process.stdout.write('    ' + etiqueta + ': ' + mb(hechos) +
            (total ? ' de ' + mb(total) + ' (' + Math.round((hechos / total) * 100) + '%)' : '') + '          \r');
        }
      });
      res.pipe(salida);
      salida.on('finish', () => {
        salida.close(() => {
          if (total && hechos !== total) {
            try { fs.unlinkSync(temporal); } catch (e) { /* ignorado */ }
            rechazar(new Error(etiqueta + ': la descarga llegó incompleta'));
            return;
          }
          try { fs.renameSync(temporal, destino); } catch (e) { rechazar(e); return; }
          process.stdout.write('    ' + etiqueta + ': ' + mb(hechos) + ' listo                    \n');
          resolver(destino);
        });
      });
    });

    peticion.setTimeout(120000, () => {
      peticion.destroy(new Error('se agotó el tiempo de espera'));
    });
    peticion.on('error', (e) => {
      salida.destroy();
      try { fs.unlinkSync(temporal); } catch (err) { /* ignorado */ }
      if (intento < 4) {
        const espera = Math.pow(2, intento) * 1000;
        console.log('    ' + etiqueta + ': ' + e.message + ', se reintenta en ' + (espera / 1000) + ' s');
        setTimeout(() => bajar(url, destino, etiqueta, intento + 1, saltos).then(resolver, rechazar), espera);
        return;
      }
      rechazar(new Error(etiqueta + ': ' + e.message));
    });
  });
}

/* -------------------------------------------------------------- extracción -- */

function extraer(archivo, carpeta) {
  if (/\.zip$/i.test(archivo)) {
    /* Windows trae Expand-Archive desde PowerShell 5, que es el de Windows 10 */
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      'Expand-Archive -LiteralPath "' + archivo + '" -DestinationPath "' + carpeta + '" -Force'],
      { stdio: 'inherit' });
    return;
  }
  execFileSync('tar', ['-xzf', archivo, '-C', carpeta], { stdio: 'inherit' });
}

/* ------------------------------------------------------------------ pasos -- */

function rutaDeVoz(nombre) {
  /* es_MX-claude-high  ->  es/es_MX/claude/high/es_MX-claude-high */
  const m = /^([a-z]{2})_([A-Z]{2})-(.+)-(x_low|low|medium|high)$/.exec(nombre);
  if (!m) throw new Error('el nombre "' + nombre + '" no tiene la forma es_MX-voz-calidad');
  return m[1] + '/' + m[1] + '_' + m[2] + '/' + m[3] + '/' + m[4] + '/' + nombre;
}

async function instalarMotor() {
  const clave = process.platform + '-' + process.arch;
  const paquete = PAQUETES[clave];
  if (!paquete) throw new Error('no hay un Piper publicado para ' + clave);

  if (voz.buscarBinario()) {
    console.log('  Motor: ya estaba instalado (' + voz.buscarBinario() + ')');
    return;
  }

  console.log('  Motor de voz (' + paquete + '):');
  fs.mkdirSync(voz.CARPETA, { recursive: true });
  const descarga = path.join(voz.CARPETA, paquete);
  if (!fs.existsSync(descarga)) await bajar(BASE_PIPER + paquete, descarga, paquete);
  else console.log('    ' + paquete + ': ya estaba descargado');

  console.log('    descomprimiendo…');
  extraer(descarga, voz.CARPETA);

  voz.olvidarEstado();
  const binario = voz.buscarBinario();
  if (!binario) throw new Error('el paquete se descomprimió pero no apareció el ejecutable de Piper');
  if (process.platform !== 'win32') {
    /* El tar conserva los permisos, pero por si acaso */
    try { fs.chmodSync(binario, 0o755); } catch (e) { /* ignorado */ }
  }
  try { fs.unlinkSync(descarga); } catch (e) { /* se queda, no estorba */ }
  console.log('  Motor: listo (' + binario + ')');
}

async function instalarVoz(lang, nombre) {
  const carpeta = path.join(voz.CARPETA, 'voces');
  fs.mkdirSync(carpeta, { recursive: true });
  const modelo = path.join(carpeta, nombre + '.onnx');
  const config = modelo + '.json';
  const ruta = rutaDeVoz(nombre);

  let bytes = 0;
  try { bytes = fs.statSync(modelo).size; } catch (e) { bytes = 0; }
  if (bytes > 1000000 && fs.existsSync(config)) {
    console.log('  Voz en ' + (lang === 'es' ? 'español' : 'inglés') + ': ya estaba (' + nombre + ')');
    return;
  }

  console.log('  Voz en ' + (lang === 'es' ? 'español' : 'inglés') + ' (' + nombre + '):');
  await bajar(BASE_VOCES + ruta + '.onnx.json', config, nombre + '.onnx.json');
  await bajar(BASE_VOCES + ruta + '.onnx', modelo, nombre + '.onnx');
}

async function principal() {
  console.log('');
  console.log('  ATIS 3.0 — instalación de la voz neuronal');
  console.log('  =========================================');
  console.log('');
  console.log('  Carpeta de destino: ' + voz.CARPETA);
  console.log('  Son unos 170 MB. Hace falta internet solo ahora, nunca más.');
  console.log('');

  const soloVoces = bandera('solo-voces');
  const soloMotor = bandera('solo-motor');

  if (!soloVoces) await instalarMotor();
  if (!soloMotor) {
    await instalarVoz('es', arg('voz-es', POR_OMISION.es));
    await instalarVoz('en', arg('voz-en', POR_OMISION.en));
  }

  voz.olvidarEstado();
  const est = voz.estado(true);
  console.log('');
  if (est.completa) {
    console.log('  LISTO. La voz neuronal quedó instalada y completa:');
    est.voces.forEach((v) => console.log('     ' + v.nombre + '  (' + v.lang + ', ' + v.mb + ' MB)'));
    console.log('');
    console.log('  Ahora se hace una prueba de locución…');
    try {
      const r = await voz.muestra('es');
      console.log('     ' + r.segundos + ' s de audio generados con ' + r.voz + '. Funciona.');
    } catch (e) {
      console.log('     no se pudo probar: ' + e.message);
      console.log('     Revise que la carpeta no esté bloqueada por el antivirus.');
      process.exitCode = 1;
      return;
    }
    console.log('');
    console.log('  Abra el ATIS con SERVIDOR.bat, vaya a Ajustes → Voz neuronal');
    console.log('  y pulse «Comprobar de nuevo».');
  } else {
    console.log('  Quedó incompleta. Falta: ' + est.falta.join(' y '));
    console.log('  Vuelva a ejecutar esto; lo ya descargado no se baja otra vez.');
    process.exitCode = 1;
  }
  console.log('');
}

if (require.main === module) {
  principal().catch((e) => {
    console.error('');
    console.error('  ERROR: ' + e.message);
    console.error('');
    console.error('  Qué revisar:');
    console.error('   - que haya internet en esta computadora (esto es lo único que lo necesita);');
    console.error('   - que el antivirus o el proxy no estén bloqueando github.com ni huggingface.co;');
    console.error('   - volver a ejecutarlo: lo que ya se bajó no se baja otra vez.');
    console.error('');
    process.exit(1);
  });
}

module.exports = { rutaDeVoz: rutaDeVoz, PAQUETES: PAQUETES, POR_OMISION: POR_OMISION, VERSION_PIPER: VERSION_PIPER };
