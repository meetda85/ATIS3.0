/* ATIS 3.0 — Versión del programa
 *
 * Un solo lugar para el número y la fecha. Lo leen la pantalla, el servidor y
 * la comprobación de la instalación, así no hay manera de que digan cosas
 * distintas. Sirve para responder de un vistazo a «¿se actualizó o no?».
 */
(function (global) {
  'use strict';
  var datos = {
    VERSION: '3.14',
    FECHA: '2026-11-07',
    /* Lo que trae esta versión, para saber qué esperar en pantalla */
    NOVEDADES: 'TXL y otras abreviaturas que faltaban ya no se deletrean: «TXL CN CLSD» '
      + 'se locuta «calle de acceso Charli November cerrada». Una prueba revisa los 60 '
      + 'NOTAM reales del FNS para que no vuelva a quedarse ninguna sigla sin traducir'
  };
  var ATIS = global.ATIS = global.ATIS || {};
  ATIS.VERSION = datos.VERSION;
  ATIS.FECHA = datos.FECHA;
  ATIS.NOVEDADES = datos.NOVEDADES;
  ATIS.versionLarga = function () { return datos.VERSION + ' (' + datos.FECHA + ')'; };
  if (typeof module !== 'undefined' && module.exports) module.exports = datos;
})(typeof globalThis !== 'undefined' ? globalThis : this);
