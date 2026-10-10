/* ATIS 3.0 — Versión del programa
 *
 * Un solo lugar para el número y la fecha. Lo leen la pantalla, el servidor y
 * la comprobación de la instalación, así no hay manera de que digan cosas
 * distintas. Sirve para responder de un vistazo a «¿se actualizó o no?».
 */
(function (global) {
  'use strict';
  var datos = {
    VERSION: '3.3',
    FECHA: '2026-10-10',
    /* Lo que trae esta versión, para saber qué esperar en pantalla */
    NOVEDADES: 'voz neuronal local, METAR por el servidor, instalación desde Ajustes'
  };
  var ATIS = global.ATIS = global.ATIS || {};
  ATIS.VERSION = datos.VERSION;
  ATIS.FECHA = datos.FECHA;
  ATIS.NOVEDADES = datos.NOVEDADES;
  ATIS.versionLarga = function () { return datos.VERSION + ' (' + datos.FECHA + ')'; };
  if (typeof module !== 'undefined' && module.exports) module.exports = datos;
})(typeof globalThis !== 'undefined' ? globalThis : this);
