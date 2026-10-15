/* ATIS 3.0 — Versión del programa
 *
 * Un solo lugar para el número y la fecha. Lo leen la pantalla, el servidor y
 * la comprobación de la instalación, así no hay manera de que digan cosas
 * distintas. Sirve para responder de un vistazo a «¿se actualizó o no?».
 */
(function (global) {
  'use strict';
  var datos = {
    VERSION: '3.9',
    FECHA: '2026-10-15',
    /* Lo que trae esta versión, para saber qué esperar en pantalla */
    NOVEDADES: 'Pantalla sin huecos, la pista en uso ya no se borra con el METAR nuevo, '
      + 'y «Ir a corregir» lleva campo por campo marcándolos en rojo'
  };
  var ATIS = global.ATIS = global.ATIS || {};
  ATIS.VERSION = datos.VERSION;
  ATIS.FECHA = datos.FECHA;
  ATIS.NOVEDADES = datos.NOVEDADES;
  ATIS.versionLarga = function () { return datos.VERSION + ' (' + datos.FECHA + ')'; };
  if (typeof module !== 'undefined' && module.exports) module.exports = datos;
})(typeof globalThis !== 'undefined' ? globalThis : this);
