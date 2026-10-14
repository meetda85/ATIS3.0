/* Pruebas de la clave de administración (node test/test-admin.js)
 *
 * Lo que se comprueba no es que haya un candado en la pantalla, sino que la
 * cerradura esté en el servidor: que la clave no se pueda leer, que los
 * intentos repetidos cuesten, y que un pase caduque.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const RAIZ = path.join(__dirname, '..');
const admin = require(path.join(RAIZ, 'servidor', 'admin.js'));

let pass = 0, fail = 0;
function test(nombre, fn) {
  try { fn(); pass++; console.log('  ok   ' + nombre); }
  catch (e) { fail++; console.log('  FAIL ' + nombre + '\n       ' + e.message); }
}

console.log('\nClave de administración');
admin.reiniciar();

test('de fabrica es 0348, y se nota que lo es', () => {
  assert.strictEqual(admin.correcta('0348'), true);
  assert.strictEqual(admin.esLaDeFabrica(), true);
  assert.strictEqual(admin.correcta('1234'), false);
  assert.strictEqual(admin.correcta(''), false);
  assert.strictEqual(admin.correcta(null), false);
});

test('en el disco queda el resumen, nunca la clave', () => {
  admin.entrar('0348');
  const d = JSON.parse(fs.readFileSync(admin.ARCHIVO, 'utf8'));
  assert.strictEqual(JSON.stringify(d).indexOf('0348'), -1, 'la clave esta en el archivo');
  assert.ok(d.sal && d.sal.length >= 32, 'sin sal, dos instalaciones con la misma clave se verian igual');
  assert.strictEqual(d.hash.length, 64);
  /* y el resumen depende de la sal: otra instalacion da otro resumen */
  admin.reiniciar();
  const d2 = JSON.parse((admin.entrar('0348'), fs.readFileSync(admin.ARCHIVO, 'utf8')));
  assert.notStrictEqual(d.sal, d2.sal, 'la sal se repite entre instalaciones');
  assert.notStrictEqual(d.hash, d2.hash, 'el resumen se repite aunque cambie la sal');
});

test('el estado que ve la pantalla no lleva nada secreto', () => {
  const e = admin.estado();
  assert.strictEqual(JSON.stringify(e).indexOf('0348'), -1);
  assert.strictEqual(e.hash, undefined);
  assert.strictEqual(e.sal, undefined);
  assert.strictEqual(e.deFabrica, true, 'deberia avisar que sigue la de fabrica');
});

test('un pase sirve; uno inventado no', () => {
  admin.reiniciar();
  const r = admin.entrar('0348');
  assert.strictEqual(r.ok, true);
  assert.ok(r.pase && r.pase.length >= 32, 'el pase es muy corto para ser impredecible');
  assert.strictEqual(admin.vale(r.pase), true);
  assert.strictEqual(admin.vale('inventado'), false);
  assert.strictEqual(admin.vale(''), false);
  assert.strictEqual(admin.vale(null), false);
});

test('dos entradas dan pases distintos, y cerrar una no mata la otra', () => {
  admin.reiniciar();
  const a = admin.entrar('0348').pase;
  const b = admin.entrar('0348').pase;
  assert.notStrictEqual(a, b, 'dio el mismo pase dos veces');
  admin.salir(a);
  assert.strictEqual(admin.vale(a), false, 'el pase cerrado sigue sirviendo');
  assert.strictEqual(admin.vale(b), true, 'cerrar uno mato el otro');
});

test('la clave equivocada no abre, y repetirla sale caro', () => {
  admin.reiniciar();
  let ultimo = null;
  for (let i = 0; i < admin.FALLOS_ANTES_DE_ESPERA; i++) {
    ultimo = admin.entrar('9999');
    assert.strictEqual(ultimo.ok, false);
  }
  /* pasado el limite se entra en espera, y ni la clave buena abre mientras tanto */
  const enEspera = admin.entrar('0348');
  assert.strictEqual(enEspera.ok, false, 'abrio estando en espera');
  assert.ok(enEspera.esperaSegundos > 0, 'no dijo cuanto hay que esperar');
  assert.ok(admin.estado().bloqueadoSegundos > 0);
});

test('cambiar la clave pide la actual y cierra todas las sesiones', () => {
  admin.reiniciar();
  const p = admin.entrar('0348').pase;
  assert.strictEqual(admin.cambiar('9999', '1111').ok, false, 'cambio sin saber la actual');
  assert.strictEqual(admin.vale(p), true, 'un intento fallido no deberia cerrar sesiones');

  const r = admin.cambiar('0348', '987654');
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(admin.vale(p), false, 'el pase viejo sobrevivio al cambio de clave');
  assert.strictEqual(admin.correcta('987654'), true);
  assert.strictEqual(admin.correcta('0348'), false);
  assert.strictEqual(admin.esLaDeFabrica(), false, 'sigue diciendo que es la de fabrica');
  assert.ok(admin.estado().cambiada, 'no anoto cuando se cambio');
});

test('una clave nueva que no sirve se rechaza con motivo', () => {
  admin.reiniciar();
  ['', '12', '123', 'abcd', '12a4', '1234567890123'].forEach((mala) => {
    const r = admin.cambiar('0348', mala);
    assert.strictEqual(r.ok, false, 'acepto "' + mala + '"');
    assert.ok(/4 a 12 cifras/.test(r.error), r.error);
  });
  /* y la de antes sigue valiendo */
  assert.strictEqual(admin.correcta('0348'), true);
});

test('el pase se saca de la cabecera de la peticion', () => {
  assert.strictEqual(admin.paseDe({ headers: { 'x-atis-admin': ' abc ' } }), 'abc');
  assert.strictEqual(admin.paseDe({ headers: {} }), '');
  assert.strictEqual(admin.paseDe({}), '');
  assert.strictEqual(admin.paseDe(null), '');
});

test('abierto() solo es cierto con un pase de verdad', () => {
  admin.reiniciar();
  const p = admin.entrar('0348').pase;
  assert.strictEqual(admin.abierto({ headers: { 'x-atis-admin': p } }), true);
  assert.strictEqual(admin.abierto({ headers: { 'x-atis-admin': 'no' } }), false);
  assert.strictEqual(admin.abierto({ headers: {} }), false);
});

admin.reiniciar();
console.log('');
console.log(pass + ' pruebas correctas, ' + fail + ' fallidas');
process.exit(fail ? 1 : 0);
