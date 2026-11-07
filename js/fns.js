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

  /* ================================================================== *
   * El campo D) del NOTAM: el horario
   *
   * Un NOTAM puede estar dentro de sus fechas (B y C) y aun así NO estar
   * surtiendo efecto ahora mismo, porque el campo D) le pone un horario:
   * «DLY 0630-1200» quiere decir todos los días de 06:30 a 12:00 UTC, y a
   * las 17:25 ese NOTAM no está activo. Darlo por vigente y ponerlo al aire
   * sería anunciar una pista cerrada que está abierta.
   *
   * Se interpretan las formas corrientes y nada más. Lo que no se entiende
   * se dice que no se entendió —nunca se adivina—, y entonces lo decide
   * quien está en la posición, con el texto del horario a la vista.
   * ================================================================== */
  var DIAS = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
               DOM: 0, LUN: 1, MAR: 2, MIE: 3, JUE: 4, VIE: 5, SAB: 6 };
  var ORDEN_DIAS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  function minutosDe(hhmm) {
    var h = +hhmm.slice(0, 2), m = +hhmm.slice(2);
    if (h > 24 || m > 59) return null;
    return h * 60 + m;
  }

  function comoHora(minutos) {
    var m = ((minutos % 1440) + 1440) % 1440;
    return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
  }

  /* Lee el campo D). Devuelve qué días aplica y en qué tramos, o entendido:false */
  function leerHorario(texto) {
    var t = String(texto || '').toUpperCase().replace(/\s+/g, ' ').trim();
    if (!t) return { texto: '', hay: false, entendido: true, siempre: true, dias: null, tramos: [] };
    if (/\bH24\b/.test(t) && !/\d{4}-\d{4}/.test(t)) {
      return { texto: t, hay: true, entendido: true, siempre: true, dias: null, tramos: [] };
    }

    var dias = [], tramos = [], entendido = true;
    /* Se va consumiendo lo que se reconoce; si sobra algo, no se entendió */
    var resto = t;
    resto = resto.replace(/\b(\d{4})-(\d{4})\b/g, function (todo, a, b) {
      var i = minutosDe(a), f = minutosDe(b);
      if (i === null || f === null) { entendido = false; return ''; }
      tramos.push({ inicio: i, fin: f });
      return ' ';
    });
    resto = resto.replace(/\b([A-Z]{3})-([A-Z]{3})\b/g, function (todo, a, b) {
      if (!(a in DIAS) || !(b in DIAS)) { entendido = false; return ''; }
      var i = DIAS[a], f = DIAS[b];
      for (var d = i; ; d = (d + 1) % 7) { dias.push(d); if (d === f) break; }
      return ' ';
    });
    resto = resto.replace(/\b([A-Z]{3})\b/g, function (todo, d) {
      if (d === 'DLY' || d === 'DAY') return ' ';
      if (d in DIAS) { dias.push(DIAS[d]); return ' '; }
      return todo;
    });
    resto = resto.replace(/\bDAILY\b/g, ' ').replace(/[\s,;.]+/g, ' ').trim();

    /* Si queda cualquier cosa —fechas, SR-SS, EXC, notas— no se entendió */
    if (resto) entendido = false;
    if (!tramos.length) entendido = false;

    return {
      texto: t, hay: true, entendido: entendido, siempre: false,
      dias: dias.length ? dias : null, tramos: tramos
    };
  }

  /* Las ventanas de un día concreto, en fechas de verdad. Un tramo que cruza
     la medianoche (2200-0600) termina al día siguiente. */
  function ventanasDe(lectura, base) {
    var dia = base.getUTCDay();
    if (lectura.dias && lectura.dias.indexOf(dia) < 0) return [];
    var cero = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
    return lectura.tramos.map(function (tr) {
      var fin = tr.fin > tr.inicio ? tr.fin : tr.fin + 1440;   /* cruza la medianoche */
      return { inicio: new Date(cero + tr.inicio * 60000), fin: new Date(cero + fin * 60000),
               rotulo: comoHora(tr.inicio) + ' a ' + comoHora(tr.fin) };
    });
  }

  /**
   * ¿Está surtiendo efecto el horario ahora mismo?
   * @param {string} texto  el campo D) tal cual
   * @param {Date}   ahora
   * @returns {{hay, entendido, activo, hasta, vuelve, rotulo, texto}}
   */
  function horario(texto, ahora) {
    ahora = ahora || new Date();
    var l = leerHorario(texto);
    if (!l.hay) return { hay: false, entendido: true, activo: true, texto: '' };
    if (l.siempre) return { hay: true, entendido: true, activo: true, texto: l.texto, rotulo: 'todo el día' };
    if (!l.entendido) return { hay: true, entendido: false, activo: null, texto: l.texto };

    /* De ayer a ocho días: alcanza para cualquier horario semanal */
    var todas = [];
    for (var d = -1; d <= 8; d++) {
      var base = new Date(ahora.getTime() + d * 86400000);
      ventanasDe(l, base).forEach(function (v) { todas.push(v); });
    }
    todas.sort(function (a, b) { return a.inicio - b.inicio; });

    var dentro = null, siguiente = null;
    todas.forEach(function (v) {
      if (!dentro && ahora >= v.inicio && ahora < v.fin) dentro = v;
      if (!siguiente && v.inicio > ahora) siguiente = v;
    });

    var tramo = l.tramos.length === 1
      ? comoHora(l.tramos[0].inicio) + ' a ' + comoHora(l.tramos[0].fin)
      : l.tramos.map(function (t) { return comoHora(t.inicio) + '-' + comoHora(t.fin); }).join(' y ');

    return {
      hay: true, entendido: true, activo: !!dentro, texto: l.texto, rotulo: tramo,
      hasta: dentro ? dentro.fin : null,
      vuelve: dentro ? null : (siguiente ? siguiente.inicio : null)
    };
  }

  /**
   * En qué está el NOTAM ahora mismo, contando fechas Y horario:
   *   futuro    - todavía no empieza (antes de B)
   *   expirado  - ya venció (después de C)
   *   activo    - dentro de B..C y dentro de su horario: esto va al aire
   *   dormido   - dentro de B..C pero fuera de su horario de hoy
   *   revisar   - dentro de B..C y con un horario que el programa no entiende
   */
  function estado(registro, ahora) {
    ahora = ahora || new Date();
    var v = vigencia(registro, ahora);
    if (v !== 'vigente') return v;
    var h = horario(registro && registro.horario, ahora);
    if (!h.hay) return 'activo';
    if (!h.entendido) return 'revisar';
    return h.activo ? 'activo' : 'dormido';
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
    horario: horario,
    leerHorario: leerHorario,
    estado: estado,
    esMateriaAtis: esMateriaAtis
  };
})(this);
