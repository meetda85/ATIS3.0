/* Pruebas de los modulos de decodificacion y generacion (node test/test.js) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const context = vm.createContext({ console });
['js/data/dictionary.js', 'js/data/airports.js', 'js/lib/numbers.js',
 'js/metar.js', 'js/notam.js', 'js/fns.js', 'js/llaves.js', 'js/atis.js',
 'js/vendor/xlsx.full.min.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
});
const ATIS = context.ATIS;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('\nMETAR');
test('MMMX con millas terrestres y altímetro en pulgadas', () => {
  const m = ATIS.metar.parse('MMMX 212145Z 05008KT 6SM HZ SCT020 BKN100 BKN220 22/11 A3039 RMK 8/522');
  assert.strictEqual(m.station, 'MMMX');
  assert.strictEqual(m.day, 21);
  assert.strictEqual(m.hour, 21);
  assert.strictEqual(m.minute, 45);
  assert.strictEqual(m.wind.direction, 50);
  assert.strictEqual(m.wind.speed, 8);
  assert.strictEqual(m.visibility.unit, 'SM');
  assert.strictEqual(m.visibility.value, 6);
  assert.strictEqual(m.weather[0].phenomena[0], 'HZ');
  assert.strictEqual(m.clouds.length, 3);
  assert.strictEqual(m.clouds[0].amount, 'SCT');
  assert.strictEqual(m.clouds[0].height, 2000);
  assert.strictEqual(m.temperature, 22);
  assert.strictEqual(m.dewpoint, 11);
  assert.strictEqual(m.qnh.inHg, 30.39);
  assert.strictEqual(m.qnh.hpa, 1029);
  assert.strictEqual(m.remarks, '8/522');
  assert.strictEqual(m.unparsed.join(' '), '');
});

test('formato metrico con QNH en hectopascales y CAVOK', () => {
  const m = ATIS.metar.parse('METAR MMUN 211200Z 09012G22KT 060V120 CAVOK 30/24 Q1012 NOSIG');
  assert.strictEqual(m.cavok, true);
  assert.strictEqual(m.wind.gust, 22);
  assert.strictEqual(m.wind.varFrom, 60);
  assert.strictEqual(m.wind.varTo, 120);
  assert.strictEqual(m.qnh.hpa, 1012);
  assert.strictEqual(m.trend, 'NOSIG');
});

test('visibilidad fraccionaria, RVR, visibilidad vertical y temperatura negativa', () => {
  const m = ATIS.metar.parse('MMMX 210600Z VRB03KT 1/2SM R05L/2000FT FG VV002 M01/M02 A3012');
  assert.strictEqual(m.wind.variable, true);
  assert.strictEqual(m.visibility.text, '1/2');
  assert.strictEqual(m.rvr[0].runway, '05L');
  assert.strictEqual(m.rvr[0].value, 2000);
  assert.strictEqual(m.rvr[0].unit, 'ft');
  assert.strictEqual(m.verticalVisibility, 200);
  assert.strictEqual(m.temperature, -1);
  assert.strictEqual(m.dewpoint, -2);
});

test('viento en calma, visibilidad en metros y tormenta con lluvia', () => {
  const m = ATIS.metar.parse('MMGL 211800Z 00000KT 4000 TSRA BKN015CB OVC080 18/16 Q1015');
  assert.strictEqual(m.wind.calm, true);
  assert.strictEqual(m.visibility.meters, 4000);
  assert.strictEqual(m.weather[0].descriptor, 'TS');
  assert.strictEqual(m.weather[0].phenomena.join(''), 'RA');
  assert.strictEqual(m.clouds[0].type, 'CB');
});

console.log('\nNumeros y locucion');
test('deletreo aeronautico', () => {
  assert.strictEqual(ATIS.num.spell('050', 'es'), 'cero cinco cero');
  assert.strictEqual(ATIS.num.spell('3039', 'en'), 'three zero three niner');
  assert.strictEqual(ATIS.num.cardinal(2000, 'es'), 'dos mil');
  assert.strictEqual(ATIS.num.cardinal(22000, 'en'), 'twenty two thousand');
  assert.strictEqual(ATIS.num.cardinal(19, 'es'), 'diecinueve');
});

test('designador de pista', () => {
  assert.strictEqual(ATIS.num.runway('05L', 'es').text, '05 izquierda');
  assert.strictEqual(ATIS.num.runway('05L', 'es').speech, 'cero cinco izquierda');
  assert.strictEqual(ATIS.num.runway('23R', 'en').speech, 'two three right');
});

test('letra de información', () => {
  const i = ATIS.num.letterInfo('S');
  assert.strictEqual(i.word, 'SIERRA');
  assert.strictEqual(i.index, 18);
});

console.log('\nNOTAM');
test('NOTAM estructurado ICAO', () => {
  const raw = [
    'A1234/25 NOTAMN',
    'Q) MMFR/QMRLC/IV/NBO/A/000/999/1926N09904W005',
    'A) MMMX B) 2509210600 C) 2509211800',
    'E) RWY 05R/23L CLSD DUE WIP'
  ].join('\n');
  const n = ATIS.notam.parse(raw, 'es');
  assert.strictEqual(n.id, 'A1234/25');
  assert.strictEqual(n.location, 'MMMX');
  assert.strictEqual(n.q.subject, 'pista');
  assert.strictEqual(n.q.condition, 'cerrada');
  assert.ok(/pista 05 derecha, 23 izquierda cerrada/.test(n.plain), n.plain);
  assert.ok(/trabajos en curso/.test(n.plain), n.plain);
  assert.ok(/Vigente el 21 de septiembre de 06:00 a 18:00 UTC/.test(n.summary), n.summary);
});

test('NOTAM en texto libre', () => {
  const n = ATIS.notam.parse('TWY B AND H CLSD BTN TWY H1 AND TWY D', 'en');
  /* En ingles las palabras corrientes bajan a minusculas: el NOTAM viene todo
     en mayusculas, pero en pantalla tiene que leerse como una frase */
  assert.ok(/taxiway B and H closed between/.test(n.plain), n.plain);
  assert.ok(!/\bAND\b/.test(n.plain), 'quedo un AND gritando: ' + n.plain);
  /* Los indicativos que no son palabra comun se quedan como estan */
  const s2 = ATIS.notam.parse('E) VOR MEX U/S', 'en');
  assert.ok(/MEX/.test(s2.plain), 'se perdio el indicativo: ' + s2.plain);
});

console.log('\nGuion ATIS');
test('guion en espanol e ingles a partir del METAR', () => {
  const m = ATIS.metar.parse('MMMX 212145Z 05008KT 6SM HZ SCT020 BKN100 BKN220 22/11 A3039');
  const obs = ATIS.script.fromMetar(m);
  const cfg = {
    station: 'MMMX',
    airportNameEs: ATIS.airports.MMMX.es,
    airportNameEn: ATIS.airports.MMMX.en,
    letter: 'S', infoType: 'normal',
    approach: 'RNP', approachRunway: '05L',
    runwaysInUse: ['05L'], runwayCondition: 'DRY',
    additionalEs: 'PISTA 05 DERECHA CERRADA',
    additionalEn: 'RUNWAY 05 RIGHT CLOSED',
    notamLines: []
  };
  const es = ATIS.script.build('es', obs, cfg);
  const en = ATIS.script.build('en', obs, cfg);

  assert.ok(es.text.indexOf('información SIERRA') > 0, es.text);
  assert.ok(es.text.indexOf('Observación de las 2145 UTC') > 0, es.text);
  assert.ok(es.text.indexOf('Esperar aproximación RNP a pista 05 izquierda') > 0, es.text);
  assert.ok(es.text.indexOf('Pista en uso 05 izquierda') > 0, es.text);
  assert.ok(es.text.indexOf('Pista seca') > 0, es.text);
  assert.ok(es.text.indexOf('transición') < 0, 'el nivel de transición ya no se difunde');
  assert.ok(es.text.indexOf('Viento 050 grados 8 nudos') > 0, es.text);
  assert.ok(es.text.indexOf('Visibilidad 6 millas.') > 0, es.text);
  assert.ok(es.text.indexOf('Bruma') > 0, es.text);
  assert.ok(es.text.indexOf('Nubes dispersas a 2000 pies, cielo fragmentado a 10000 pies') > 0, es.text);
  assert.ok(es.text.indexOf('Temperatura 22, punto de rocío 11') > 0, es.text);
  assert.ok(es.text.indexOf('Altímetro 3039') > 0, es.text);
  assert.ok(es.text.indexOf('\nInformación adicional:\nPISTA 05 DERECHA CERRADA.') > 0, JSON.stringify(es.text));

  assert.ok(es.speech.indexOf('cero cinco cero grados ocho nudos') > 0, es.speech);
  assert.ok(es.speech.indexOf('tres cero tres nueve') > 0, es.speech);
  assert.ok(es.speech.indexOf('dos mil pies') > 0, es.speech);
  assert.ok(es.speech.indexOf('dos dos, punto de rocío uno uno') > 0, es.speech);
  assert.ok(es.speech.indexOf('Pista cero cinco Derecha Cerrada') > 0, es.speech);

  assert.ok(en.text.indexOf('Mexico City International Airport, information SIERRA') === 0, en.text);
  assert.ok(en.text.indexOf('Expect RNP approach runway 05 left') > 0, en.text);
  assert.ok(en.text.indexOf('Wind 050 degrees 8 knots') > 0, en.text);
  assert.ok(en.text.indexOf('Scattered at 2000 feet, broken at 10000 feet') > 0, en.text);
  assert.ok(en.text.indexOf('Visibility 6 miles.') > 0, en.text);
  assert.ok(en.speech.indexOf('three zero three niner') > 0, en.speech);
  assert.ok(en.text.indexOf('On initial contact advise you have information SIERRA') > 0, en.text);
});

test('viento en calma y NOTAM incluidos en el guion', () => {
  const obs = ATIS.script.fromMetar(ATIS.metar.parse('MMMX 210600Z 00000KT 10SM SKC 12/05 A3025'));
  const cfg = {
    airportNameEs: 'Aeropuerto Internacional de la Ciudad de México',
    airportNameEn: 'Mexico City International Airport',
    letter: 'A', runwaysInUse: ['05L', '05R'],
    notamLines: ['Pista 05 derecha cerrada.']
  };
  const es = ATIS.script.build('es', obs, cfg);
  assert.ok(es.text.indexOf('Viento en calma') > 0, es.text);
  assert.ok(es.text.indexOf('Pistas en uso 05 izquierda y 05 derecha') > 0, es.text);
  assert.ok(es.text.indexOf('NOTAM') < 0, 'ya no se anuncia el encabezado NOTAM');
  assert.ok(es.speech.indexOf('Pista cero cinco derecha cerrada') > 0, es.speech);
});

test('los NOTAM salen en renglones, separados por comas y sin fechas', () => {
  const obs = ATIS.script.fromMetar(ATIS.metar.parse('MMMX 210600Z 00000KT 10SM SKC 12/05 A3025'));
  const cfg = {
    airportNameEs: 'Aeropuerto Internacional de la Ciudad de México',
    airportNameEn: 'Mexico City International Airport',
    letter: 'A', runwaysInUse: ['05L'],
    notamLines: [
      'Pista 05 derecha, 23 izquierda cerrada',
      'Calle de rodaje A4 entre pista 05 derecha y calle de rodaje J cerrada',
      'Umbral pista 23 izquierda luces de destello secuencial fuera de servicio'
    ]
  };
  const es = ATIS.script.build('es', obs, cfg);
  const renglones = es.text.split('\n');

  assert.ok(renglones.indexOf('Pista 05 derecha, 23 izquierda cerrada,') > 0, JSON.stringify(renglones));
  assert.ok(renglones.indexOf('Calle de rodaje A4 entre pista 05 derecha y calle de rodaje J cerrada,') > 0);
  assert.ok(renglones.indexOf('Umbral pista 23 izquierda luces de destello secuencial fuera de servicio.') > 0);
  assert.ok(es.text.indexOf('Vigente') < 0, 'la vigencia no se difunde');
  /* El cierre también va en su renglón */
  assert.ok(/\nAl establecer comunicación informe tener información ALFA\.$/.test(es.text), JSON.stringify(es.text));
});

test('los designadores se locutan con el alfabeto fonetico', () => {
  const casos = [
    ['E) TWY A4 BTN RWY 05R AND TWY J CLSD',
     'calle de rodaje Alfa cuatro entre pista cero cinco derecha y calle de rodaje Julieta cerrada'],
    ['E) TWY D BTN TWYS E AND B CLSD',
     'calle de rodaje Delta entre calles de rodaje Eco y Bravo cerrada'],
    ['E) TWYS B9, C2 AND B8 CLSD',
     'calles de rodaje Bravo nueve, Charli dos y Bravo ocho cerrada'],
    ['E) TWY E BTN TWYS B3 AND PH CLSD',
     'calle de rodaje Eco entre calles de rodaje Bravo tres y Papa Hotel cerrada'],
    ['E) TWY H1 USEFUL ONLY FOR ACFT CAT E AND MINORS',
     'calle de rodaje Hotel uno utilizable solamente para aeronave categoría Eco y menores'],
    ['E) TWY B BTN RWY 23R AND TWY D USEFUL ONLY FOR ACFT B747-8',
     'calle de rodaje Bravo entre pista dos tres derecha y calle de rodaje Delta utilizable solamente para aeronave Boeing siete cuatro siete ocho']
  ];
  casos.forEach(function (c) {
    const n = ATIS.notam.parse(c[0], 'es');
    assert.strictEqual(ATIS.script.paraLocutar(n.plain, 'es'), c[1]);
  });

  /* En una enumeración, la conjunción no se convierte en Yanki ni en Oscar */
  assert.strictEqual(
    ATIS.script.paraLocutar('BRAVO Y HOTEL CERRADOS ENTRE HOTEL 1 Y DELTA', 'es'),
    'Bravo y Hotel Cerrados Entre Hotel uno y Delta');

  /* La pista con numero se sigue deletreando, no se vuelve fonetica */
  const rwy = ATIS.notam.parse('E) RWY 05R/23L CLSD', 'es');
  assert.strictEqual(ATIS.script.paraLocutar(rwy.plain, 'es'),
    'pista cero cinco derecha, dos tres izquierda cerrada');

  /* Ingles: AND en mayusculas no debe cortar la enumeracion */
  const en = ATIS.notam.parse('E) TWYS B9, C2 AND B8 CLSD', 'en');
  assert.strictEqual(ATIS.script.paraLocutar(en.plain, 'en'),
    'taxiways Bravo niner, Charlie two and Bravo eight closed');

  /* La palabra clave puede venir de cualquier forma: en el guion va en
     minusculas, en los resumenes con mayuscula inicial, y en Informacion
     adicional se escribe toda en mayusculas. Las tres tienen que decir Delta.
     Antes solo servia la primera, y en una misma frase una decia Delta y la
     otra se quedaba en D. */
  [
    ['es', 'calle de rodaje D cerrada'],
    ['es', 'Calle de rodaje D cerrada'],
    ['es', 'CALLE DE RODAJE D CERRADA'],
    ['en', 'taxiway D closed'],
    ['en', 'Taxiway D closed'],
    ['en', 'TAXIWAY D CLOSED']
  ].forEach(function (c) {
    const dicho = ATIS.script.paraLocutar(c[1], c[0]);
    assert.ok(/Delta/.test(dicho), 'no se locuto el designador: ' + c[1] + ' -> ' + dicho);
    assert.ok(!/\bD\b/.test(dicho), 'quedo la letra suelta: ' + c[1] + ' -> ' + dicho);
  });

  /* Y en una misma frase, las dos igual */
  assert.strictEqual(
    ATIS.script.paraLocutar('Taxiway D closed between runway 05 right and taxiway D', 'en'),
    'Taxiway Delta closed between runway zero five right and taxiway Delta');

  /* Lo demas no se toca: una palabra detras de la clave no es un designador */
  assert.strictEqual(ATIS.script.paraLocutar('taxiway is closed', 'en'), 'taxiway is closed');
  assert.strictEqual(ATIS.script.paraLocutar('Taxiway Delta closed', 'en'), 'Taxiway Delta closed');
  assert.strictEqual(ATIS.script.paraLocutar('la pista en uso es la 05 derecha', 'es'),
    'la pista en uso es la cero cinco derecha');

  /* Las otras claves tambien, en cualquier forma */
  assert.ok(/Alfa/.test(ATIS.script.paraLocutar('Plataforma A cerrada', 'es')));
  assert.ok(/Bravo/.test(ATIS.script.paraLocutar('Threshold B displaced', 'en')));
});

test('la pista sin lado anuncia las dos de esa direccion', () => {
  const obs = ATIS.script.fromMetar(ATIS.metar.parse('MMMX 222047Z 08004KT 10SM SCT020 26/05 A3016'));
  const base = {
    airportNameEs: ATIS.airports.MMMX.es, airportNameEn: ATIS.airports.MMMX.en,
    letter: 'C', notamLines: []
  };
  const es = (rwys) => ATIS.script.build('es', obs, Object.assign({}, base, { runwaysInUse: rwys }));

  assert.ok(es(['05']).text.indexOf('Pista en uso 05.') > 0);
  assert.ok(es(['05']).speech.indexOf('Pista en uso cero cinco.') > 0);
  assert.ok(es(['05', '23']).text.indexOf('Pistas en uso 05 y 23.') > 0);
  assert.ok(es(['05L']).text.indexOf('Pista en uso 05 izquierda.') > 0);
  assert.ok(es(['05L', '05R']).text.indexOf('Pistas en uso 05 izquierda y 05 derecha.') > 0);
});

test('el texto libre se suma al final del ATIS, antes del cierre', () => {
  const obs = ATIS.script.fromMetar(ATIS.metar.parse('MMMX 222047Z 08004KT 10SM SCT020 26/05 A3016'));
  const es = ATIS.script.build('es', obs, {
    airportNameEs: ATIS.airports.MMMX.es, airportNameEn: ATIS.airports.MMMX.en,
    letter: 'C', runwaysInUse: ['05'], notamLines: [],
    libreLines: ['Aeropuerto cerrado por condiciones meteorológicas', 'Manténgase a la escucha en 118.475']
  });
  const renglones = es.text.split('\n');

  /* El ATIS completo sigue ahí */
  assert.ok(es.text.indexOf('Pista en uso 05.') > 0, 'se perdió el ATIS');
  assert.ok(es.text.indexOf('Altímetro 3016.') > 0);
  /* El texto libre va antes del cierre */
  const iLibre = renglones.indexOf('Aeropuerto cerrado por condiciones meteorológicas.');
  const iCierre = renglones.findIndex(r => /^Al establecer comunicación/.test(r));
  assert.ok(iLibre > 0, 'no se agregó el texto libre');
  assert.ok(iLibre < iCierre, 'el texto libre quedó después del cierre');
  /* Y se locuta con las reglas del ATIS */
  assert.ok(es.speech.indexOf('uno uno ocho punto cuatro siete cinco') > 0, es.speech);
});

test('redaccion de los NOTAM del 10 de octubre', () => {
  const casos = [
    /* Este NOTAM viene escrito con la "Y" española en lugar de AND */
    ['E) STRIPS RWYS 05R/23L Y 05L/23R WIP',
     'franjas de las pistas 05 derecha, 23 izquierda y 05 izquierda, 23 derecha trabajos en curso'],
    ['E) STRIPS RWY 23R BTN TWYS B AND H WIP',
     'franjas de la pista 23 derecha entre calles de rodaje B y H trabajos en curso']
  ];
  casos.forEach(function (c) {
    assert.strictEqual(ATIS.notam.parse(c[0], 'es').plain, c[1]);
  });

  /* Una calle de rodaje que se llama Y no es la conjuncion */
  const y = ATIS.notam.parse('E) TWY Y CLSD', 'es');
  assert.strictEqual(y.plain, 'calle de rodaje Y cerrada');
  assert.strictEqual(ATIS.script.paraLocutar(y.plain, 'es'), 'calle de rodaje Yanki cerrada');
  const ye = ATIS.notam.parse('E) TWYS Y AND B CLSD', 'es');
  assert.strictEqual(ATIS.script.paraLocutar(ye.plain, 'es'), 'calles de rodaje Yanki y Bravo cerrada');
});

console.log('\nDescarga del FNS');
test('lee el archivo .xls tal como lo entrega el FNS', () => {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures', 'fnsNotams_MMMX.xls'));
  const libro = context.XLSX.read(buf.toString('base64'), { type: 'base64' });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = context.XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' });
  const datos = ATIS.fns.fromMatrix(filas);

  assert.strictEqual(datos.station, 'MMMX');
  assert.strictEqual(datos.records.length, 34);
  assert.strictEqual(datos.errors.length, 0);

  const rwy = datos.records.filter(r => r.id === 'A9411/26')[0];
  assert.ok(rwy, 'no se encontro el NOTAM A9411/26');
  assert.strictEqual(rwy.location, 'MMMX');
  assert.strictEqual(rwy.desde.toISOString(), '2026-09-22T17:30:00.000Z');
  assert.strictEqual(rwy.hasta.toISOString(), '2026-09-28T17:40:00.000Z');
  assert.ok(/RWY 05R\/23L CLSD/.test(rwy.raw));
});

test('lee tambien la descarga del 10 de octubre, con 59 NOTAM', () => {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures', 'fnsNotams_MMMX_59.xls'));
  const libro = context.XLSX.read(buf.toString('base64'), { type: 'base64' });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = context.XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' });
  const datos = ATIS.fns.fromMatrix(filas);

  assert.strictEqual(datos.station, 'MMMX');
  assert.strictEqual(datos.records.length, 59);
  assert.strictEqual(datos.errors.length, 0);
  /* Todos traen identificador y fechas utilizables */
  datos.records.forEach(function (r) {
    assert.ok(/^[A-Z]\d{4}\/\d{2}$/.test(r.id), 'identificador raro: ' + r.id);
    /* Date del contexto de vm: se comprueba por comportamiento, no por instanceof */
    assert.ok(r.desde && !isNaN(r.desde.getTime()), 'sin fecha de inicio: ' + r.id);
  });
});

test('selecciona por codigo Q lo que corresponde al ATIS', () => {
  assert.strictEqual(ATIS.fns.esMateriaAtis('QMRLC'), true);   // pista cerrada
  assert.strictEqual(ATIS.fns.esMateriaAtis('QMXLC'), true);   // calle de rodaje cerrada
  assert.strictEqual(ATIS.fns.esMateriaAtis('QLFAS'), true);   // luces fuera de servicio
  assert.strictEqual(ATIS.fns.esMateriaAtis('QICAS'), true);   // ILS
  assert.strictEqual(ATIS.fns.esMateriaAtis('QMPLC'), false);  // posicion de estacionamiento
  assert.strictEqual(ATIS.fns.esMateriaAtis('QPAXX'), false);  // procedimiento de llegada
  assert.strictEqual(ATIS.fns.esMateriaAtis('QSTCF'), false);  // frecuencia de torre
});

test('vigencia respecto de la hora actual', () => {
  const reg = { desde: new Date('2026-09-22T17:30:00Z'), hasta: new Date('2026-09-28T17:40:00Z') };
  assert.strictEqual(ATIS.fns.vigencia(reg, new Date('2026-09-23T00:00:00Z')), 'vigente');
  assert.strictEqual(ATIS.fns.vigencia(reg, new Date('2026-09-22T00:00:00Z')), 'futuro');
  assert.strictEqual(ATIS.fns.vigencia(reg, new Date('2026-10-01T00:00:00Z')), 'expirado');
});

console.log('\nLlaves de la FAA desde un archivo');
/* Valores de mentira, de la misma forma que los de verdad. Las credenciales
   reales no entran al repositorio ni en una prueba. */
const LLAVE_ID = 'EjemploDeLlaveFalsa0000000000000000000000000000AB';
const LLAVE_SEC = 'EjemploDeSecretoFalso00000000000000000000000000000000000000000CD';

test('las reconoce en un texto, venga como venga', () => {
  const casos = {
    'dos puntos': 'client_id: ' + LLAVE_ID + '\nclient_secret: ' + LLAVE_SEC,
    'igual': 'CLIENT_ID = ' + LLAVE_ID + '\nCLIENT_SECRET = ' + LLAVE_SEC,
    'KEY y SECRET': 'Key: ' + LLAVE_ID + '\nSecret: ' + LLAVE_SEC,
    'solo espacios': '  client_id       ' + LLAVE_ID + '\n  client_secret   ' + LLAVE_SEC,
    'rotulo arriba': 'CLIENT_ID\n' + LLAVE_ID + '\nCLIENT_SECRET\n' + LLAVE_SEC,
    'csv': 'KEY,SECRET\n' + LLAVE_ID + ',' + LLAVE_SEC,
    'correo pegado': 'Buen dia,\n\nKey: ' + LLAVE_ID + '\nSecret = ' + LLAVE_SEC + '\n\nSaludos'
  };
  Object.keys(casos).forEach(function (k) {
    const r = ATIS.llaves.deTexto(casos[k]);
    assert.strictEqual(r.clientId, LLAVE_ID, 'client_id en «' + k + '»');
    assert.strictEqual(r.clientSecret, LLAVE_SEC, 'client_secret en «' + k + '»');
  });
});

test('lee el notam.json del propio programa, con su ambiente', () => {
  const r = ATIS.llaves.deTexto(JSON.stringify({
    activo: true, estacion: 'MMMX', ambiente: 'prod',
    llaves: { clientId: LLAVE_ID, clientSecret: LLAVE_SEC }
  }));
  assert.strictEqual(r.clientId, LLAVE_ID);
  assert.strictEqual(r.clientSecret, LLAVE_SEC);
  assert.strictEqual(r.ambiente, 'prod');
  /* y entiende como se diga el ambiente */
  assert.strictEqual(ATIS.llaves.deTexto('ambiente: preproduccion\nkey: ' + LLAVE_ID +
    '\nsecret: ' + LLAVE_SEC).ambiente, 'staging');
});

test('lee la hoja de la FAA, con los rotulos al lado o encima', () => {
  const alLado = [['Onboarding NMS', ''], ['KEY', LLAVE_ID], ['SECRET', LLAVE_SEC]];
  const encima = [['KEY', 'SECRET'], [LLAVE_ID, LLAVE_SEC]];
  [alLado, encima].forEach(function (filas, i) {
    const r = ATIS.llaves.deMatriz(filas);
    assert.strictEqual(r.clientId, LLAVE_ID, 'client_id en la hoja ' + i);
    assert.strictEqual(r.clientSecret, LLAVE_SEC, 'client_secret en la hoja ' + i);
  });
});

test('sin rotulos toma las dos cadenas con pinta de llave, y lo avisa', () => {
  const r = ATIS.llaves.deMatriz([['Credenciales'], [LLAVE_ID], [LLAVE_SEC]]);
  assert.strictEqual(r.clientId, LLAVE_ID);
  assert.strictEqual(r.clientSecret, LLAVE_SEC);
  assert.ok(r.aviso, 'tiene que avisar de que las tomo sin rotulo');
});

test('no inventa llaves donde no las hay', () => {
  ['Buenos dias, adjunto el documento.', '', 'cliente: Juan\nfecha: hoy',
   'client_id: corto'].forEach(function (t) {
    assert.strictEqual(ATIS.llaves.completo(ATIS.llaves.deTexto(t)), false,
      'invento llaves en: ' + JSON.stringify(t));
  });
  assert.strictEqual(ATIS.llaves.completo(ATIS.llaves.deMatriz([['hola', 'mundo']])), false);
});

test('TXL CN se locuta, no se deletrea', () => {
  /* Lo encontro la torre: «TXL CN CLSD» se oia «te equis ele, ce ene cerrada».
     TXL no estaba en el diccionario, asi que el sintetizador lo deletreaba. */
  const es = ATIS.notam.parse('E) TXL CN CLSD', 'es');
  const en = ATIS.notam.parse('E) TXL CN CLSD', 'en');
  assert.strictEqual(es.plain, 'calle de acceso CN cerrada');
  assert.strictEqual(en.plain, 'taxilane CN closed');
  assert.strictEqual(ATIS.script.paraLocutar(es.plain, 'es'), 'calle de acceso Charli November cerrada');
  assert.strictEqual(ATIS.script.paraLocutar(en.plain, 'en'), 'taxilane Charlie November closed');
  /* Y una calle de acceso no es una calle de rodaje: se dicen distinto */
  assert.ok(ATIS.notam.parse('E) TWY CN CLSD', 'es').plain.indexOf('calle de rodaje') === 0);
});

test('no queda ninguna sigla sin traducir en los NOTAM reales', () => {
  /* La prueba de fondo: si manana falta otra abreviatura como TXL, el
     sintetizador la deletreara y esto lo cacha antes que la torre. Solo se
     admiten los indicativos OACI, que en radio si se dicen letra por letra. */
  const permitidas = /^(MM[A-Z]{2}|K[A-Z]{3}|[A-Z]{3}\d*)$/;
  const encontradas = {};
  ['fnsNotams_MMMX.xls', 'fnsNotams_MMMX_59.xls'].forEach(function (archivo) {
    const buf = fs.readFileSync(path.join(__dirname, 'fixtures', archivo));
    const libro = context.XLSX.read(buf, { type: 'buffer' });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filas = context.XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' });
    ATIS.fns.fromMatrix(filas).records.forEach(function (r) {
      ['es', 'en'].forEach(function (lang) {
        const dicho = ATIS.script.paraLocutar(ATIS.notam.parse(r.raw, lang).plain, lang);
        (dicho.match(/\b[A-Z]{2,}\b/g) || []).forEach(function (t) {
          if (!permitidas.test(t)) encontradas[t] = dicho.slice(0, 90);
        });
      });
    });
  });
  assert.deepStrictEqual(Object.keys(encontradas), [],
    'quedaron siglas que se van a deletrear: ' + JSON.stringify(encontradas, null, 1));
});

console.log('\nHorario de los NOTAM');
test('el campo D) dice a que horas surte efecto', () => {
  /* 7 de noviembre de 2026 es sabado */
  const sabado1725 = new Date('2026-11-07T17:25:00Z');
  const sabado0800 = new Date('2026-11-07T08:00:00Z');
  const h = (t, cuando) => ATIS.fns.horario(t, cuando || sabado1725);

  /* El caso que reporto la torre: vigente por fechas, pero a esta hora no */
  assert.strictEqual(h('DLY 0630-1200').entendido, true);
  assert.strictEqual(h('DLY 0630-1200').activo, false, 'a las 17:25 no le toca');
  assert.strictEqual(h('DLY 0630-1200', sabado0800).activo, true, 'a las 08:00 si');
  assert.strictEqual(h('DLY 0630-1200').rotulo, '06:30 a 12:00');

  /* Sin campo D) no hay horario que valga: vale siempre */
  assert.strictEqual(h('').hay, false);
  assert.strictEqual(h('').activo, true);
  assert.strictEqual(h('H24').activo, true);

  /* Dias de la semana */
  assert.strictEqual(h('MON-FRI 0600-1400').activo, false, 'el sabado no es MON-FRI');
  assert.strictEqual(h('SAT SUN 1200-1800').activo, true);
  assert.strictEqual(h('MON-FRI 0600-1400', new Date('2026-11-09T07:00:00Z')).activo, true);

  /* Varios tramos, y uno que cruza la medianoche */
  assert.strictEqual(h('DLY 0600-1200 1400-1800').activo, true);
  assert.strictEqual(h('DLY 2200-0600').activo, false);
  assert.strictEqual(h('DLY 2200-0600', new Date('2026-11-07T23:00:00Z')).activo, true);
  assert.strictEqual(h('DLY 2200-0600', new Date('2026-11-07T02:00:00Z')).activo, true,
    'el tramo de anoche sigue corriendo de madrugada');

  /* Lo que no se entiende NO se adivina */
  assert.strictEqual(h('SR-SS').entendido, false);
  assert.strictEqual(h('SR-SS').activo, null);
  assert.strictEqual(h('NOV 06 0630-1200').entendido, false);
  assert.strictEqual(h('DLY 0630-1200 EXC HOL').entendido, false);

  /* Y dice cuando vuelve, para poder avisarlo en pantalla */
  const v = h('DLY 0630-1200');
  assert.ok(v.vuelve && v.vuelve.toISOString().indexOf('2026-11-08T06:30') === 0,
    'no dijo cuando vuelve: ' + (v.vuelve && v.vuelve.toISOString()));
});

test('el estado cuenta las fechas Y el horario', () => {
  const sabado1725 = new Date('2026-11-07T17:25:00Z');
  const base = { desde: new Date('2026-11-06T06:30:00Z'), hasta: new Date('2026-11-08T12:00:00Z') };

  /* Dentro de las fechas y sin horario: activo */
  assert.strictEqual(ATIS.fns.estado(base, sabado1725), 'activo');

  /* Dentro de las fechas pero fuera del horario de hoy: NO va al aire */
  const conD = Object.assign({}, base, { horario: 'DLY 0630-1200' });
  assert.strictEqual(ATIS.fns.estado(conD, sabado1725), 'dormido');
  assert.strictEqual(ATIS.fns.estado(conD, new Date('2026-11-07T08:00:00Z')), 'activo');

  /* Un horario que no se entiende se marca para que lo lea una persona */
  assert.strictEqual(ATIS.fns.estado(Object.assign({}, base, { horario: 'SR-SS' }), sabado1725), 'revisar');

  /* Las fechas siguen mandando por encima del horario */
  const futuro = { desde: new Date('2026-12-01T00:00:00Z'), horario: 'H24' };
  assert.strictEqual(ATIS.fns.estado(futuro, sabado1725), 'futuro');
  const viejo = { hasta: new Date('2026-10-01T00:00:00Z'), horario: 'H24' };
  assert.strictEqual(ATIS.fns.estado(viejo, sabado1725), 'expirado');
});

test('traduce al espanol el texto en ingles del NOTAM', () => {
  const casos = [
    ['E) RWY 05R/23L CLSD', 'pista 05 derecha, 23 izquierda cerrada'],
    ['E) TWY B BTN RWY 23R AND TWY D USEFUL ONLY FOR ACFT B747-8',
     'calle de rodaje B entre pista 23 derecha y calle de rodaje D utilizable solamente para aeronave B747-8'],
    ['E) STRIPS TWY D BTN TWYS B AND E WIP',
     'franjas de la calle de rodaje D entre calles de rodaje B y E trabajos en curso'],
    ['E) THR RWY 23L SEQUENCED FLG LGT U/S',
     'umbral pista 23 izquierda luces de destello secuencial fuera de servicio'],
    ['E) TWY H1 USEFUL ONLY FOR ACFT CAT E AND MINORS',
     'calle de rodaje H1 utilizable solamente para aeronave categoría E y menores'],
    ['E) ACFT STAND 35 CENTRAL APN CLSD',
     'posición de estacionamiento 35 central plataforma cerrada'],
    ['E) TWY D BTN TWYS E AND B NOT USEFUL FOR BOEING 747-8 ACFT',
     'calle de rodaje D entre calles de rodaje E y B no utilizable para Boeing 747-8']
  ];
  casos.forEach(function (c) {
    const n = ATIS.notam.parse(c[0], 'es');
    assert.strictEqual(n.plain, c[1]);
  });
});

test('el texto en ingles conserva las contracciones expandidas', () => {
  const n = ATIS.notam.parse('E) RWY 05R/23L CLSD DUE WIP', 'en');
  assert.strictEqual(n.plain, 'runway 05 right, 23 left closed due to work in progress');
});

/* ---- Las piezas del guion, que es de donde sale el subrayado ---- */

function guionDePrueba(lang) {
  const obs = {
    time: '1745',
    wind: { mode: 'steady', direction: '050', speed: '8' },
    visibility: { value: '10', unit: 'SM' },
    temperature: '22', dewpoint: '14', altimeter: '3039',
    layers: [{ amount: 'FEW', height: '2500' }, { amount: 'SCT', height: '8000' }]
  };
  return ATIS.script.build(lang, obs, {
    station: 'MMMX', letter: 'C', runwaysInUse: ['05L'],
    notamLines: ['pista 05 derecha cerrada'], includeNotams: true
  });
}

test('el guion viene partido en piezas, con su locucion al lado', () => {
  ['es', 'en'].forEach((lang) => {
    const r = guionDePrueba(lang);
    assert.ok(r.partes.length > 4, 'muy pocas piezas en ' + lang + ': ' + r.partes.length);
    assert.strictEqual(r.partes.length, r.sentences.length, 'no coinciden en ' + lang);
    r.partes.forEach((p, i) => {
      assert.ok(typeof p.texto === 'string' && p.texto.length, 'pieza vacia ' + i + ' en ' + lang);
      assert.ok(typeof p.locucion === 'string', 'sin locucion la pieza ' + i + ' en ' + lang);
      assert.ok(p.texto.indexOf('\n') === -1, 'la pieza ' + i + ' trae el salto de renglon adentro');
    });
  });
});

test('las piezas rearman exactamente la locucion y el texto', () => {
  ['es', 'en'].forEach((lang) => {
    const r = guionDePrueba(lang);
    assert.strictEqual(r.partes.map((p) => p.locucion).join(' '), r.speech,
      'la locucion no se rearma en ' + lang);
    const texto = r.partes.map((p, i) => (i && p.renglon ? '\n' : (i ? ' ' : '')) + p.texto).join('');
    assert.strictEqual(texto, r.text, 'el texto no se rearma en ' + lang);
  });
});

test('las piezas que van en su renglon quedan marcadas', () => {
  const r = guionDePrueba('es');
  const enRenglon = r.partes.filter((p) => p.renglon);
  assert.ok(enRenglon.length >= 1, 'el NOTAM deberia ir en su propio renglon');
  assert.ok(/cerrada/.test(enRenglon.map((p) => p.texto).join(' ')));
});

console.log('\n' + pass + ' pruebas correctas, ' + fail + ' fallidas\n');
process.exit(fail ? 1 : 0);
