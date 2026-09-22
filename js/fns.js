/* ATIS 3.0 - Lectura de la descarga de NOTAM del FNS (FAA NOTAM Search)
 * Acepta la hoja de calculo tal como se descarga (.xls / .xlsx) y tambien
 * listados en texto plano.
 */
(function (global) {
  'use strict';
  var ATIS = global.ATIS = global.ATIS || {};

  /* Materias del codigo Q que se difunden por ATIS. Las posiciones de
     estacionamiento, las frecuencias y los procedimientos no se difunden. */
  var MATERIAS_ATIS = {
    MR: 1, MS: 1, MT: 1, MU: 1, MW: 1, MX: 1,   /* pista, zona de parada, umbral, rodaje, franja */
    FA: 1,                                       /* aerodromo */
    IC: 1, ID: 1, IG: 1, IL: 1, IM: 1, IO: 1, IS: 1,  /* ILS */
    NA: 1, NB: 1, ND: 1, NM: 1, NV: 1, NT: 1,    /* radioayudas */
    OB: 1, OL: 1                                 /* obstaculos */
  };

  function esMateriaAtis(codigoQ) {
    var q = String(codigoQ || '').toUpperCase();
    var materia = q.charAt(0) === 'Q' ? q.substr(1, 2) : q.substr(0, 2);
    if (MATERIAS_ATIS[materia]) return true;
    return /^L/.test(materia);   /* cualquier tipo de iluminacion */
  }

  /* "09/22/2026 1730" -> Date en UTC. Tambien acepta "2609221730". */
  function parseFecha(valor) {
    var s = String(valor === null || valor === undefined ? '' : valor).trim();
    if (!s) return null;
    if (/^(PERM|UFN)/i.test(s)) return null;
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(\d{2}):?(\d{2})?/.exec(s);
    if (m) return new Date(Date.UTC(+m[3], (+m[1]) - 1, +m[2], +m[4], +(m[5] || 0)));
    m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
    if (m) return new Date(Date.UTC(2000 + (+m[1]), (+m[2]) - 1, +m[3], +m[4], +m[5]));
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function vigencia(registro, ahora) {
    ahora = ahora || new Date();
    if (registro.desde && ahora < registro.desde) return 'futuro';
    if (registro.hasta && ahora > registro.hasta) return 'expirado';
    return 'vigente';
  }

  var COLUMNAS = [
    ['location', /^location/i],
    ['id', /notam\s*#|notam\s*number|^notam$/i],
    ['clase', /^class/i],
    ['emitido', /issue/i],
    ['desde', /effective/i],
    ['hasta', /expir/i],
    ['texto', /condition|subject|graphic\s*title|text/i]
  ];

  /* Matriz de celdas (arreglo de filas) -> registros de NOTAM */
  function fromMatrix(filas) {
    var resultado = { station: '', records: [], errors: [] };
    if (!filas || !filas.length) { resultado.errors.push('El archivo no tiene filas.'); return resultado; }

    var texto = function (v) { return String(v === null || v === undefined ? '' : v).replace(/\r/g, '').trim(); };

    /* Estacion, si viene en el encabezado del reporte */
    for (var i = 0; i < Math.min(filas.length, 8); i++) {
      for (var j = 0; j < (filas[i] || []).length; j++) {
        var m = /location\(s\)\s*([A-Z]{4})/i.exec(texto(filas[i][j]));
        if (m) { resultado.station = m[1].toUpperCase(); break; }
      }
      if (resultado.station) break;
    }

    /* Fila de encabezados */
    var hIdx = -1;
    for (var r = 0; r < filas.length && hIdx < 0; r++) {
      var fila = filas[r] || [];
      for (var c = 0; c < fila.length; c++) {
        if (/notam\s*#/i.test(texto(fila[c]))) { hIdx = r; break; }
      }
    }

    var col = {};
    if (hIdx >= 0) {
      (filas[hIdx] || []).forEach(function (celda, idx) {
        var nombre = texto(celda);
        COLUMNAS.forEach(function (par) {
          if (col[par[0]] === undefined && par[1].test(nombre)) col[par[0]] = idx;
        });
      });
    }

    /* Sin encabezados: la columna con el texto mas largo es el NOTAM */
    if (col.texto === undefined) {
      var largos = {};
      filas.forEach(function (fila) {
        (fila || []).forEach(function (celda, idx) {
          largos[idx] = Math.max(largos[idx] || 0, texto(celda).length);
        });
      });
      var mejor = -1, max = 0;
      Object.keys(largos).forEach(function (idx) {
        if (largos[idx] > max) { max = largos[idx]; mejor = +idx; }
      });
      if (mejor < 0 || max < 20) { resultado.errors.push('No se encontro la columna con el texto del NOTAM.'); return resultado; }
      col.texto = mejor;
    }

    var inicio = hIdx >= 0 ? hIdx + 1 : 0;
    for (var k = inicio; k < filas.length; k++) {
      var f = filas[k] || [];
      var cuerpo = texto(f[col.texto]);
      if (!cuerpo || cuerpo.length < 10) continue;
      var reg = {
        location: col.location !== undefined ? texto(f[col.location]).toUpperCase() : '',
        id: col.id !== undefined ? texto(f[col.id]) : '',
        clase: col.clase !== undefined ? texto(f[col.clase]) : '',
        desde: col.desde !== undefined ? parseFecha(f[col.desde]) : null,
        hasta: col.hasta !== undefined ? parseFecha(f[col.hasta]) : null,
        raw: cuerpo
      };
      if (!reg.id) {
        var mid = /\b([A-Z]\d{4}\/\d{2})\b/.exec(cuerpo);
        if (mid) reg.id = mid[1];
      }
      if (!reg.location) {
        var mloc = /\bA\)\s*([A-Z]{4})/.exec(cuerpo);
        if (mloc) reg.location = mloc[1];
      }
      resultado.records.push(reg);
    }

    if (!resultado.station && resultado.records.length) {
      /* La estacion mas repetida */
      var cuenta = {}, top = '', n = 0;
      resultado.records.forEach(function (x) {
        if (!x.location) return;
        cuenta[x.location] = (cuenta[x.location] || 0) + 1;
        if (cuenta[x.location] > n) { n = cuenta[x.location]; top = x.location; }
      });
      resultado.station = top;
    }
    if (!resultado.records.length) resultado.errors.push('El archivo no contiene NOTAM reconocibles.');
    return resultado;
  }

  /* Listados en texto plano: se separan por identificador o por linea en blanco */
  function fromText(texto) {
    var bloques = ATIS.notam.split(texto);
    return {
      station: '',
      records: bloques.map(function (b) {
        var id = /\b([A-Z]\d{4}\/\d{2})\b/.exec(b);
        var loc = /\bA\)\s*([A-Z]{4})/.exec(b);
        var desde = /\bB\)\s*(\d{10})/.exec(b);
        var hasta = /\bC\)\s*(\d{10})/.exec(b);
        return {
          location: loc ? loc[1] : '',
          id: id ? id[1] : '',
          clase: '',
          desde: desde ? parseFecha(desde[1]) : null,
          hasta: hasta ? parseFecha(hasta[1]) : null,
          raw: b
        };
      }),
      errors: []
    };
  }

  ATIS.fns = {
    fromMatrix: fromMatrix,
    fromText: fromText,
    parseFecha: parseFecha,
    vigencia: vigencia,
    esMateriaAtis: esMateriaAtis
  };
})(this);
