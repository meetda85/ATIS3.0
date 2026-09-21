/* Pruebas de los modulos de decodificacion y generacion (node test/test.js) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const context = vm.createContext({ console });
['js/data/dictionary.js', 'js/data/airports.js', 'js/lib/numbers.js',
 'js/metar.js', 'js/notam.js', 'js/atis.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
});
const ATIS = context.ATIS;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('\nMETAR');
test('MMMX con millas terrestres y altimetro en pulgadas', () => {
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

test('letra de informacion', () => {
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
  assert.ok(/pista 05 derecha y 23 izquierda cerrada/.test(n.plain), n.plain);
  assert.ok(/trabajos en curso/.test(n.plain), n.plain);
  assert.ok(/Vigente el 21 de septiembre de 06:00 a 18:00 UTC/.test(n.summary), n.summary);
});

test('NOTAM en texto libre', () => {
  const n = ATIS.notam.parse('TWY B AND H CLSD BTN TWY H1 AND TWY D', 'en');
  assert.ok(/taxiway B AND H closed between/.test(n.plain), n.plain);
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
    transitionLevel: '200',
    additionalEs: 'PISTA 05 DERECHA CERRADA',
    additionalEn: 'RUNWAY 05 RIGHT CLOSED',
    notamLines: []
  };
  const es = ATIS.script.build('es', obs, cfg);
  const en = ATIS.script.build('en', obs, cfg);

  assert.ok(es.text.indexOf('informacion SIERRA') > 0, es.text);
  assert.ok(es.text.indexOf('Observacion de las 2145 zulu') > 0, es.text);
  assert.ok(es.text.indexOf('Esperar aproximacion RNP a pista 05 izquierda') > 0, es.text);
  assert.ok(es.text.indexOf('Pista en uso 05 izquierda') > 0, es.text);
  assert.ok(es.text.indexOf('Pista seca') > 0, es.text);
  assert.ok(es.text.indexOf('Nivel de transicion 200') > 0, es.text);
  assert.ok(es.text.indexOf('Viento 050 grados 8 nudos') > 0, es.text);
  assert.ok(es.text.indexOf('Visibilidad 6 millas terrestres') > 0, es.text);
  assert.ok(es.text.indexOf('Bruma') > 0, es.text);
  assert.ok(es.text.indexOf('Nublado a 2000 pies, cerrado a 10000 pies') > 0, es.text);
  assert.ok(es.text.indexOf('Temperatura 22, punto de rocio 11') > 0, es.text);
  assert.ok(es.text.indexOf('Altimetro 3039') > 0, es.text);
  assert.ok(es.text.indexOf('PISTA 05 DERECHA CERRADA') > 0, es.text);

  assert.ok(es.speech.indexOf('cero cinco cero grados ocho nudos') > 0, es.speech);
  assert.ok(es.speech.indexOf('tres cero tres nueve') > 0, es.speech);
  assert.ok(es.speech.indexOf('dos mil pies') > 0, es.speech);
  assert.ok(es.speech.indexOf('dos dos, punto de rocio uno uno') > 0, es.speech);
  assert.ok(es.speech.indexOf('PISTA cero cinco DERECHA CERRADA') > 0, es.speech);

  assert.ok(en.text.indexOf('Mexico City International Airport, information SIERRA') === 0, en.text);
  assert.ok(en.text.indexOf('Expect RNP approach runway 05 left') > 0, en.text);
  assert.ok(en.text.indexOf('Wind 050 degrees 8 knots') > 0, en.text);
  assert.ok(en.text.indexOf('Scattered at 2000 feet, broken at 10000 feet') > 0, en.text);
  assert.ok(en.speech.indexOf('three zero three niner') > 0, en.speech);
  assert.ok(en.text.indexOf('On initial contact advise you have information SIERRA') > 0, en.text);
});

test('viento en calma y NOTAM incluidos en el guion', () => {
  const obs = ATIS.script.fromMetar(ATIS.metar.parse('MMMX 210600Z 00000KT 10SM SKC 12/05 A3025'));
  const cfg = {
    airportNameEs: 'Aeropuerto Internacional de la Ciudad de Mexico',
    airportNameEn: 'Mexico City International Airport',
    letter: 'A', runwaysInUse: ['05L', '05R'],
    notamLines: ['Pista 05 derecha cerrada.']
  };
  const es = ATIS.script.build('es', obs, cfg);
  assert.ok(es.text.indexOf('Viento en calma') > 0, es.text);
  assert.ok(es.text.indexOf('Pistas en uso 05 izquierda y 05 derecha') > 0, es.text);
  assert.ok(es.text.indexOf('NOTAM vigentes') > 0, es.text);
  assert.ok(es.speech.indexOf('Pista cero cinco derecha cerrada') > 0, es.speech);
});

console.log('\n' + pass + ' pruebas correctas, ' + fail + ' fallidas\n');
process.exit(fail ? 1 : 0);
