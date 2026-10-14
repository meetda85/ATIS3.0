/* Pruebas de los NOTAM automáticos (node test/test-notam.js)
 *
 * La API de la FAA pide unas llaves que no viajan en el repositorio, así que
 * la respuesta se prueba contra un ejemplo guardado con su forma real. Lo que
 * sí se prueba de verdad es la carpeta vigilada, que es la ruta que funciona
 * sin registrarse en nada.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const RAIZ = path.join(__dirname, '..');
const fuente = require(path.join(RAIZ, 'servidor', 'fuente-notam.js'));

const PUERTO = 8700 + Math.floor(Math.random() * 500);
const BASE = 'http://127.0.0.1:' + PUERTO;
const AJUSTES = path.join(RAIZ, 'servidor', 'notam.json');

const hijos = new Set();
function arrancarServidor() {
  const h = spawn('node', [path.join(RAIZ, 'servidor', 'servidor.js'), '--puerto', String(PUERTO)],
    { stdio: 'ignore' });
  hijos.add(h);
  h.on('exit', () => hijos.delete(h));
  return h;
}
function apagarTodo() { for (const h of hijos) { try { h.kill('SIGKILL'); } catch (e) { /* ignorado */ } } }
process.on('exit', apagarTodo);
['SIGINT', 'SIGTERM', 'uncaughtException'].forEach(ev => process.on(ev, () => { apagarTodo(); process.exit(1); }));

let pass = 0, fail = 0;
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
async function test(nombre, fn) {
  try { await fn(); pass++; console.log('  ok   ' + nombre); }
  catch (e) { fail++; console.log('  FAIL ' + nombre + '\n       ' + e.message); }
}
const api = (ruta, opciones) => fetch(BASE + ruta, opciones).then(r => r.json());

/* La configuración está detrás de la clave de administración; las pruebas
   entran igual que una persona. */
const ADMIN = path.join(RAIZ, 'servidor', 'admin.json');
let pase = '';
async function entrarAdmin() {
  const r = await api('/api/admin/entrar', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clave: '0348' })
  });
  pase = r.pase || '';
  return r;
}
function conPase(opciones) {
  opciones = opciones || {};
  opciones.headers = Object.assign({ 'X-ATIS-Admin': pase }, opciones.headers || {});
  return opciones;
}

const EJEMPLO = path.join(__dirname, 'fixtures', 'faa_notamapi_MMMX.json');
const NMS = path.join(__dirname, 'fixtures', 'nms_geojson_MMMX.json');
const FIXTURES = path.join(__dirname, 'fixtures');

/* Un NMS de mentiras: hace el intercambio de pase igual que el de verdad y
   devuelve el ejemplo guardado. Así las pruebas no dependen de la red ni de
   unas credenciales que no viajan en el repositorio. */
const LLAVES = { clientId: 'LLAVE-DE-PRUEBA', clientSecret: 'SECRETO-DE-PRUEBA' };

function nmsFalso(opciones) {
  opciones = opciones || {};
  const http = require('http');
  const cuenta = { tokens: 0, consultas: 0, cabeceras: [] };
  const srv = http.createServer((pet, resp) => {
    if (pet.url === '/v1/auth/token' && pet.method === 'POST') {
      cuenta.tokens++;
      let cuerpo = '';
      pet.on('data', (t) => { cuerpo += t; });
      pet.on('end', () => {
        const aut = String(pet.headers.authorization || '');
        const esperado = 'Basic ' + Buffer.from(LLAVES.clientId + ':' + LLAVES.clientSecret).toString('base64');
        if (opciones.rechazar || aut !== esperado) {
          resp.writeHead(401, { 'Content-Type': 'application/json' });
          return resp.end(JSON.stringify({ ErrorCode: 'invalid_client', Error: 'ClientId is Invalid' }));
        }
        if (cuerpo.indexOf('grant_type=client_credentials') < 0) {
          resp.writeHead(400, { 'Content-Type': 'application/json' });
          return resp.end(JSON.stringify({ Error: 'falta grant_type' }));
        }
        resp.writeHead(200, { 'Content-Type': 'application/json' });
        resp.end(JSON.stringify({
          access_token: 'PASE-' + cuenta.tokens,
          expires_in: String(opciones.expiraEn || 1799),
          api_product_list: '[FAA Notam Distribution APIs]',
          status: 'approved'
        }));
      });
      return;
    }
    if (/^\/nmsapi\/v1\/notams/.test(pet.url)) {
      cuenta.consultas++;
      cuenta.cabeceras.push({
        aut: pet.headers.authorization || '',
        formato: pet.headers.nmsresponseformat || '',
        url: pet.url
      });
      if (!/^Bearer PASE-/.test(String(pet.headers.authorization || ''))) {
        resp.writeHead(401); return resp.end('sin pase');
      }
      resp.writeHead(200, { 'Content-Type': 'application/json' });
      return resp.end(fs.readFileSync(NMS));
    }
    resp.writeHead(404); resp.end('no');
  });
  return { srv: srv, cuenta: cuenta };
}

(async () => {
  /* ==================================================== la API de la FAA == */
  console.log('\nNOTAM: leer la respuesta de la FAA');

  const json = JSON.parse(fs.readFileSync(EJEMPLO, 'utf8'));

  await test('saca los NOTAM de la estacion pedida y descarta los demas', () => {
    const r = fuente.deJSON(json, 'MMMX');
    assert.strictEqual(r.length, 2, 'el de MMTJ no debia venir');
    assert.strictEqual(r[0].id, 'A9186/26');
    assert.strictEqual(r[0].location, 'MMMX');
    assert.strictEqual(r[1].id, 'A9201/26');
    /* sin filtro vienen todos */
    assert.strictEqual(fuente.deJSON(json, '').length, 3);
    assert.strictEqual(fuente.deJSON(json, 'MMTJ').length, 1);
  });

  await test('prefiere el formato ICAO, que trae los campos completos', () => {
    const r = fuente.deJSON(json, 'MMMX');
    assert.ok(/^A9186\/26 NOTAMN/.test(r[0].raw), 'no uso el formato ICAO: ' + r[0].raw.slice(0, 40));
    assert.ok(/Q\)/.test(r[0].raw) && /E\)/.test(r[0].raw), 'faltan los campos Q) y E)');
  });

  await test('sin formato ICAO usa el cuerpo del NOTAM, no la traduccion simple', () => {
    const r = fuente.deJSON(json, 'MMMX');
    assert.strictEqual(r[1].raw, 'TWY B BTN TWY A AND TWY C CLSD',
      'uso la traduccion simple en lugar del texto con contracciones');
  });

  await test('las fechas quedan como fechas, y PERM queda sin fecha', () => {
    const r = fuente.deJSON(json, 'MMMX');
    assert.ok(r[0].desde && !isNaN(r[0].desde.getTime()));
    assert.ok(r[0].hasta && !isNaN(r[0].hasta.getTime()));
    assert.strictEqual(r[0].desde.toISOString(), '2026-10-08T14:22:00.000Z');
    assert.strictEqual(r[1].hasta, null, 'PERM no es una fecha');
  });

  await test('lo que se saca de la FAA lo entiende el decodificador', () => {
    const ATIS = fuente.modulos();
    const r = fuente.deJSON(json, 'MMMX');
    const a = ATIS.notam.parse(r[0].raw, 'es');
    assert.ok(/pista/.test(a.plain), 'no lo tradujo: ' + a.plain);
    assert.ok(/cerrada/.test(a.plain));
    const b = ATIS.notam.parse(r[1].raw, 'es');
    assert.ok(/calle de rodaje/.test(b.plain), 'no lo tradujo: ' + b.plain);
  });

  await test('una respuesta rara no revienta nada', () => {
    [null, undefined, {}, { items: null }, { items: [] }, { items: [null, {}, { properties: {} }] },
     { items: [{ properties: { coreNOTAMData: { notam: { text: 'corto' } } } }] }]
      .forEach((malo, i) => {
        const r = fuente.deJSON(malo, 'MMMX');
        assert.ok(Array.isArray(r), 'el caso ' + i + ' no devolvio una lista');
        assert.strictEqual(r.length, 0, 'el caso ' + i + ' invento ' + r.length + ' registros');
      });
  });

  /* ========================================= cancelaciones y reemplazos == */
  console.log('\nNOTAM: lo que no se transmite');

  await test('saca el tipo y a quien se refiere de la primera linea', () => {
    assert.strictEqual(fuente.tipoDelTexto('A9186/26 NOTAMN\nQ) ...'), 'N');
    assert.strictEqual(fuente.tipoDelTexto('B2864/26 NOTAMC B2857/26\n...'), 'C');
    assert.strictEqual(fuente.tipoDelTexto('B2279/26 NOTAMR B2100/26\n...'), 'R');
    assert.strictEqual(fuente.tipoDelTexto('sin encabezado'), '');
    assert.strictEqual(fuente.referido('B2864/26 NOTAMC B2857/26'), 'B2857/26');
    assert.strictEqual(fuente.referido('B2279/26 NOTAMR B2100/26'), 'B2100/26');
    assert.strictEqual(fuente.referido('A9186/26 NOTAMN'), '');
  });

  await test('una cancelacion no se transmite, y borra al que cancela', () => {
    const lista = [
      { id: 'B2857/26', tipo: 'N', raw: 'TWY EDGE LGT U/S' },
      { id: 'B2864/26', tipo: 'C', reemplaza: 'B2857/26', raw: 'B2864/26 NOTAMC B2857/26 TWY EDGE LGT NOTAM CNL' },
      { id: 'A9186/26', tipo: 'N', raw: 'SOUTH MMMX ARR OPR IN FREQ 121.40MHZ' }
    ];
    const r = fuente.depurar(lista);
    assert.strictEqual(r.length, 1, 'debia quedar solo el que sigue vigente');
    assert.strictEqual(r[0].id, 'A9186/26');
    assert.ok(!r.some((x) => /NOTAM CNL/.test(x.raw)), 'se colo un aviso de cancelacion');
  });

  await test('un reemplazo se queda, y el reemplazado se va', () => {
    const r = fuente.depurar([
      { id: 'B2100/26', tipo: 'N', raw: 'viejo' },
      { id: 'B2279/26', tipo: 'R', reemplaza: 'B2100/26', raw: 'B2279/26 NOTAMR B2100/26 nuevo' }
    ]);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].id, 'B2279/26', 'se quedo con el viejo en lugar del nuevo');
  });

  await test('con los NOTAM reales de MMMX quedan fuera las cuatro cancelaciones', () => {
    const json = JSON.parse(fs.readFileSync(NMS, 'utf8'));
    const todos = json.data.geojson.length;
    const r = fuente.deJSON(json, 'MMMX');
    assert.strictEqual(todos, 32, 'el ejemplo guardado cambio');
    assert.ok(r.length < todos, 'no filtro nada');
    assert.strictEqual(r.filter((x) => x.tipo === 'C').length, 0, 'se colo una cancelacion');
    assert.strictEqual(r.filter((x) => /NOTAM CNL/.test(x.raw)).length, 0,
      'quedo un "NOTAM CNL" que se leeria al aire');
    /* y los que quedan si son del aerodromo y se entienden */
    const ATIS = fuente.modulos();
    r.forEach((x) => {
      assert.strictEqual(x.location, 'MMMX');
      const es = ATIS.notam.parse(x.raw, 'es');
      assert.ok(es.plain && es.plain.length > 3, 'no se pudo leer ' + x.id);
    });
  });

  /* ======================================================= el NMS == */
  console.log('\nNOTAM: el servicio NMS de la FAA');

  await test('cambia las llaves por un pase y lo usa en la consulta', async () => {
    const falso = nmsFalso();
    await new Promise((r) => falso.srv.listen(0, '127.0.0.1', r));
    const host = 'http://127.0.0.1:' + falso.srv.address().port;
    try {
      fuente.olvidarPases();
      const r = await fuente.consultarAPI('MMMX', LLAVES, { ambiente: 'staging', host: host });
      assert.ok(r.records.length > 15, 'solo trajo ' + r.records.length);
      assert.strictEqual(falso.cuenta.tokens, 1, 'pidio ' + falso.cuenta.tokens + ' pases');
      assert.strictEqual(falso.cuenta.consultas, 1);
      const c = falso.cuenta.cabeceras[0];
      assert.strictEqual(c.aut, 'Bearer PASE-1', 'no mando el pase');
      assert.strictEqual(c.formato, 'GEOJSON', 'no pidio GEOJSON');
      assert.ok(/location=MMMX/.test(c.url), 'no filtro por estacion: ' + c.url);
    } finally { falso.srv.close(); }
  });

  await test('reusa el pase mientras sirva, en lugar de pedir uno cada vez', async () => {
    const falso = nmsFalso();
    await new Promise((r) => falso.srv.listen(0, '127.0.0.1', r));
    const host = 'http://127.0.0.1:' + falso.srv.address().port;
    try {
      fuente.olvidarPases();
      for (let i = 0; i < 3; i++) await fuente.consultarAPI('MMMX', LLAVES, { ambiente: 'staging', host: host });
      assert.strictEqual(falso.cuenta.consultas, 3);
      assert.strictEqual(falso.cuenta.tokens, 1, 'pidio ' + falso.cuenta.tokens + ' pases para 3 consultas');
    } finally { falso.srv.close(); }
  });

  await test('un pase a punto de caducar se renueva antes de usarlo', async () => {
    /* Un pase que dura menos que el margen de renovación (un minuto) ya nace
       vencido para nuestros efectos: cada consulta tiene que pedir uno nuevo. */
    const falso = nmsFalso({ expiraEn: 30 });
    await new Promise((r) => falso.srv.listen(0, '127.0.0.1', r));
    const host = 'http://127.0.0.1:' + falso.srv.address().port;
    try {
      fuente.olvidarPases();
      await fuente.consultarAPI('MMMX', LLAVES, { ambiente: 'staging', host: host });
      await fuente.consultarAPI('MMMX', LLAVES, { ambiente: 'staging', host: host });
      assert.strictEqual(falso.cuenta.tokens, 2, 'no renovo el pase a punto de caducar');
    } finally { falso.srv.close(); }
  });

  await test('si las llaves no entran, lo dice nombrando el ambiente', async () => {
    const falso = nmsFalso({ rechazar: true });
    await new Promise((r) => falso.srv.listen(0, '127.0.0.1', r));
    const host = 'http://127.0.0.1:' + falso.srv.address().port;
    try {
      fuente.olvidarPases();
      await assert.rejects(
        () => fuente.consultarAPI('MMMX', LLAVES, { ambiente: 'staging', host: host }),
        (e) => {
          assert.ok(/preproducción/.test(e.message), 'no nombro el ambiente: ' + e.message);
          assert.ok(/ambiente/.test(e.message), 'no sugiere revisar el ambiente');
          return true;
        });
      assert.strictEqual(falso.cuenta.consultas, 0, 'consulto sin tener pase');
    } finally { falso.srv.close(); }
  });

  await test('probarLlaves dice si entran, sin pedir ningun NOTAM', async () => {
    const falso = nmsFalso();
    await new Promise((r) => falso.srv.listen(0, '127.0.0.1', r));
    const host = 'http://127.0.0.1:' + falso.srv.address().port;
    try {
      fuente.olvidarPases();
      const r = await fuente.probarLlaves('staging', LLAVES, 10000, host);
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.nombre, 'preproducción');
      assert.ok(/Distribution/.test(r.productos), 'no dijo que productos: ' + r.productos);
      assert.strictEqual(falso.cuenta.consultas, 0, 'pidio NOTAM cuando solo iba a comprobar');
    } finally { falso.srv.close(); }
  });

  await test('los tres ambientes estan declarados con su direccion', () => {
    assert.deepStrictEqual(Object.keys(fuente.AMBIENTES).sort().join(','), 'fit,prod,staging');
    Object.keys(fuente.AMBIENTES).forEach((k) => {
      const a = fuente.AMBIENTES[k];
      assert.ok(/^https:\/\//.test(a.host), k + ' no tiene direccion segura');
      assert.ok(a.nombre, k + ' no tiene nombre');
    });
    assert.strictEqual(fuente.AMBIENTE_POR_OMISION, 'prod', 'por omision debe ser produccion');
  });

  /* ================================================= la carpeta vigilada == */
  console.log('\nNOTAM: la carpeta vigilada');

  await test('elige el archivo del FNS mas reciente', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atis-nt-'));
    try {
      const poner = (n, edadMin) => {
        const r = path.join(dir, n);
        fs.writeFileSync(r, 'x');
        const t = new Date(Date.now() - edadMin * 60000);
        fs.utimesSync(r, t, t);
        return r;
      };
      poner('otra-cosa.txt', 1);
      poner('reporte.xlsx', 5);
      poner('fnsNotams_viejo.xls', 60);
      poner('fnsNotams_nuevo.xls', 2);
      const lista = fuente.buscarArchivos(dir, 10);
      assert.strictEqual(lista.length, 3, 'el .txt no es una hoja de calculo');
      assert.strictEqual(lista[0].nombre, 'fnsNotams_nuevo.xls', 'no eligio el mas reciente del FNS');
      assert.strictEqual(lista[1].nombre, 'fnsNotams_viejo.xls', 'los del FNS van primero');
      assert.strictEqual(lista[2].nombre, 'reporte.xlsx');
      assert.strictEqual(lista[0].fns, true);
      assert.strictEqual(lista[2].fns, false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  await test('una carpeta que no existe no revienta, solo viene vacia', () => {
    assert.deepStrictEqual(fuente.buscarArchivos('/no/existe/esta/carpeta', 5), []);
    assert.deepStrictEqual(fuente.buscarArchivos('', 5), []);
    assert.deepStrictEqual(fuente.buscarArchivos(null, 5), []);
  });

  await test('lee el Excel del FNS y saca los mismos registros de siempre', () => {
    const r = fuente.consultarCarpeta(FIXTURES, 'MMMX');
    assert.strictEqual(r.fuente, 'carpeta vigilada');
    assert.ok(r.records.length > 30, 'solo saco ' + r.records.length);
    assert.ok(/^fnsNotams/.test(r.archivo.nombre));
    r.records.forEach((x, i) => {
      assert.ok(x.raw && x.raw.length > 10, 'el registro ' + i + ' viene sin texto');
      assert.ok(/^[A-Z]\d{4}\/\d{2}$/.test(x.id), 'identificador raro en ' + i + ': ' + x.id);
    });
  });

  await test('filtra por estacion: los de otro aerodromo no se cuelan', () => {
    const r = fuente.consultarCarpeta(FIXTURES, 'MMMX');
    r.records.forEach((x) => {
      assert.ok(!x.location || x.location === 'MMMX', 'se colo uno de ' + x.location);
    });
    const otra = fuente.consultarCarpeta(FIXTURES, 'ZZZZ');
    assert.strictEqual(otra.records.length, 0, 'devolvio NOTAM de una estacion que no es');
    assert.ok(otra.descartados > 0, 'no conto los descartados');
  });

  await test('un archivo que no es una hoja de calculo se rechaza con motivo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atis-nt-'));
    try {
      fs.writeFileSync(path.join(dir, 'fnsNotams_falso.xls'), 'esto no es un Excel');
      assert.throws(() => fuente.consultarCarpeta(dir, 'MMMX'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  /* ======================================================== comparar == */
  console.log('\nNOTAM: qué cambió desde la revisión anterior');

  await test('dice cuales son nuevos y cuales ya no estan', () => {
    const antes = [{ id: 'A1/26', raw: 'uno' }, { id: 'A2/26', raw: 'dos' }, { id: 'A3/26', raw: 'tres' }];
    const ahora = [{ id: 'A2/26', raw: 'dos' }, { id: 'A3/26', raw: 'tres' }, { id: 'A4/26', raw: 'cuatro' }];
    const c = fuente.comparar(ahora, antes);
    assert.deepStrictEqual(c.nuevos.map(x => x.id).join(','), 'A4/26');
    assert.deepStrictEqual(c.idos.map(x => x.id).join(','), 'A1/26');
    assert.strictEqual(c.iguales, 2);
  });

  await test('sin identificador se compara por el texto', () => {
    const c = fuente.comparar(
      [{ id: '', raw: 'RWY 05 CLSD' }, { id: '', raw: 'TWY B CLSD' }],
      [{ id: '', raw: 'RWY 05 CLSD' }]);
    assert.strictEqual(c.nuevos.length, 1);
    assert.strictEqual(c.nuevos[0].raw, 'TWY B CLSD');
    assert.strictEqual(c.iguales, 1);
  });

  await test('la primera vez todo es nuevo, y eso no es un error', () => {
    const c = fuente.comparar([{ id: 'A1/26', raw: 'uno' }], []);
    assert.strictEqual(c.nuevos.length, 1);
    assert.strictEqual(c.idos.length, 0);
    const d = fuente.comparar([], [{ id: 'A1/26', raw: 'uno' }]);
    assert.strictEqual(d.idos.length, 1);
  });

  /* ============================================================ buscar == */
  console.log('\nNOTAM: elegir de dónde traerlos');

  await test('sin fuentes configuradas lo dice en lugar de fallar en silencio', async () => {
    const r = await fuente.buscar('MMMX', {});
    assert.strictEqual(r.ok, false);
    assert.ok(/ninguna fuente/.test(r.error), r.error);
    assert.strictEqual(r.intentos.length, 0);
  });

  await test('un indicador que no es de cuatro letras se rechaza antes de salir', async () => {
    for (const malo of ['', 'MM', 'MMMXX', '12 34']) {
      const r = await fuente.buscar(malo, { carpeta: FIXTURES });
      assert.strictEqual(r.ok, false, 'acepto "' + malo + '"');
      assert.ok(/cuatro letras/.test(r.error));
      assert.strictEqual(r.intentos.length, 0, 'no debe ni intentarlo');
    }
  });

  await test('con la carpeta puesta los trae de ahi', async () => {
    const r = await fuente.buscar('MMMX', { carpeta: FIXTURES });
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.fuente, 'carpeta vigilada');
    assert.ok(r.records.length > 30);
    assert.strictEqual(r.intentos.length, 1);
    assert.strictEqual(r.intentos[0].ok, true);
  });

  await test('si las llaves no sirven, cae a la carpeta y cuenta las dos cosas', async () => {
    const r = await fuente.buscar('MMMX', {
      llaves: { clientId: 'inventado', clientSecret: 'inventado' },
      carpeta: FIXTURES, tiempoLimite: 20000
    });
    assert.strictEqual(r.intentos.length, 2, 'debio intentar las dos');
    assert.strictEqual(r.intentos[0].fuente, 'NMS de la FAA');
    assert.strictEqual(r.intentos[0].ok, false, 'unas llaves inventadas no pueden funcionar');
    assert.ok(r.intentos[0].error, 'no dijo por que fallo la API');
    assert.strictEqual(r.ok, true, 'la carpeta tenia que salvarlo: ' + r.error);
    assert.strictEqual(r.fuente, 'carpeta vigilada');
  });

  /* ========================================================= el servidor == */
  console.log('\nNOTAM: el servidor (puerto ' + PUERTO + ')');
  try { fs.unlinkSync(AJUSTES); } catch (e) { /* no existia */ }
  try { fs.unlinkSync(ADMIN); } catch (e) { /* no existia */ }
  arrancarServidor();
  await dormir(1300);
  await entrarAdmin();

  await test('entrega la configuracion, y el secreto nunca sale', async () => {
    const d = await api('/api/notam');
    assert.strictEqual(typeof d.activo, 'boolean');
    assert.ok(d.llaves, 'falta el apartado de llaves');
    assert.strictEqual(d.llaves.puestas, false);
    assert.strictEqual(d.clientSecret, undefined, 'mando el secreto');
    assert.strictEqual(JSON.stringify(d).indexOf('clientSecret'), -1, 'el secreto aparece en la respuesta');
  });

  await test('guarda la configuracion y la conserva al reiniciar', async () => {
    const d = await api('/api/notam', conPase({
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estacion: 'mmmx', minutos: 45, carpeta: FIXTURES,
        clientId: 'ABCD1234EFGH', clientSecret: 'secreto-de-verdad' })
    }));
    assert.strictEqual(d.estacion, 'MMMX', 'no puso el indicador en mayusculas');
    assert.strictEqual(d.minutos, 45);
    assert.strictEqual(d.carpeta, FIXTURES);
    assert.strictEqual(d.llaves.puestas, true);
    assert.ok(/^ABCD…/.test(d.llaves.clientId), 'el client_id debe venir recortado: ' + d.llaves.clientId);
    assert.strictEqual(JSON.stringify(d).indexOf('secreto-de-verdad'), -1, 'devolvio el secreto');

    /* y quedo en el disco, pero sin salir a la red */
    const guardado = JSON.parse(fs.readFileSync(AJUSTES, 'utf8'));
    assert.strictEqual(guardado.llaves.clientSecret, 'secreto-de-verdad');
  });

  await test('respeta los limites de la revision', async () => {
    const a = await api('/api/notam', conPase({ method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutos: 1 }) }));
    assert.strictEqual(a.minutos, 5, 'no puso el minimo');
    const b = await api('/api/notam', conPase({ method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutos: 9999 }) }));
    assert.strictEqual(b.minutos, 240, 'no puso el maximo');
  });

  await test('trae los NOTAM a peticion', async () => {
    const d = await api('/api/notam/buscar?estacion=MMMX');
    assert.strictEqual(d.ok, true, d.error);
    assert.ok(d.records.length > 30, 'solo trajo ' + d.records.length);
    assert.strictEqual(d.fuente, 'carpeta vigilada');
    assert.ok(d.archivo && d.archivo.nombre, 'no dijo de que archivo salieron');
    /* las fechas viajan como texto, que es lo que la pantalla sabe volver fecha */
    const conFecha = d.records.filter((x) => x.desde)[0];
    if (conFecha) assert.ok(!isNaN(new Date(conFecha.desde).getTime()), 'fecha ilegible');
  });

  await test('dice que hojas de calculo hay en una carpeta', async () => {
    const d = await api('/api/notam/carpeta?ruta=' + encodeURIComponent(FIXTURES));
    assert.ok(Array.isArray(d.archivos));
    assert.ok(d.archivos.length >= 2, 'no vio los archivos de prueba');
    assert.ok(d.archivos[0].fns, 'los del FNS van primero');
    const vacia = await api('/api/notam/carpeta?ruta=' + encodeURIComponent('/no/existe'));
    assert.deepStrictEqual(vacia.archivos, [], 'invento archivos');
  });

  await test('una estacion sin NOTAM contesta 502 y dice que paso en cada fuente', async () => {
    const r = await fetch(BASE + '/api/notam/buscar?estacion=ZZZZ');
    assert.strictEqual(r.status, 502);
    const d = await r.json();
    assert.strictEqual(d.ok, false);
    /* con las llaves de mentiras de la prueba anterior tiene que intentar las dos */
    assert.strictEqual(d.intentos.length, 2, 'no intento las dos fuentes');
    const api = d.intentos.filter((i) => /NMS/.test(i.fuente))[0];
    const carpeta = d.intentos.filter((i) => /carpeta/.test(i.fuente))[0];
    assert.ok(api && /llaves|ambiente|401/.test(api.error),
      'el NMS debio quejarse de las llaves: ' + (api && api.error));
    assert.ok(carpeta && /ZZZZ/.test(carpeta.error), 'la carpeta debio nombrar la estacion: ' + (carpeta && carpeta.error));
    assert.ok(d.error.indexOf('NMS de la FAA') >= 0 && d.error.indexOf('carpeta') >= 0,
      'el resumen debe nombrar las dos: ' + d.error);
  });

  await test('sin llaves no se intenta la API siquiera', async () => {
    await api('/api/notam', conPase({ method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: '', clientSecret: '' }) }));
    const d = await api('/api/notam/buscar?estacion=ZZZZ');
    assert.strictEqual(d.intentos.length, 1, 'salio a la red sin llaves');
    assert.ok(/carpeta/.test(d.intentos[0].fuente));
    const est = await api('/api/notam');
    assert.strictEqual(est.llaves.puestas, false, 'no borro las llaves');
  });

  await test('sin la clave no se pueden poner ni probar las llaves de la FAA', async () => {
    const guardar = await fetch(BASE + '/api/notam', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'ajeno', clientSecret: 'ajeno' })
    });
    assert.strictEqual(guardar.status, 403, 'dejo poner credenciales sin clave');
    const probar = await fetch(BASE + '/api/notam/llaves', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'ajeno', clientSecret: 'ajeno' })
    });
    assert.strictEqual(probar.status, 403, 'dejo probar credenciales sin clave');
    /* leer la configuracion si es libre: no trae nada secreto */
    const ver = await fetch(BASE + '/api/notam');
    assert.strictEqual(ver.status, 200);
  });

  try { fs.unlinkSync(AJUSTES); } catch (e) { /* ignorado */ }
  try { fs.unlinkSync(ADMIN); } catch (e) { /* ignorado */ }
  console.log('');
  console.log(pass + ' pruebas correctas, ' + fail + ' fallidas');
  apagarTodo();
  process.exit(fail ? 1 : 0);
})();
