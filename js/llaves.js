/* ATIS 3.0 — Lectura de las llaves de la FAA desde un archivo
 *
 * Teclear a mano un client_id y un client_secret de cincuenta y tantos
 * caracteres es pedir un error de dedo, y un error de dedo aquí se ve como
 * «las llaves no sirven». Así que se leen del archivo donde ya vienen:
 *
 *   - la hoja de cálculo que manda la FAA por correo (KEY y SECRET),
 *   - el notam.json del propio programa,
 *   - o un texto cualquiera con «client_id: …» y «client_secret: …».
 *
 * Todo pasa en la computadora: el archivo lo lee la pantalla, y el secreto
 * solo viaja al servidor de aquí al guardar, como siempre.
 *
 * Este archivo lo cargan la pantalla y las pruebas, así que no toca el DOM.
 */
(function (global) {
  'use strict';

  /* Un valor de verdad: las llaves de la FAA son cadenas largas de letras y
     números. Esto descarta rótulos, celdas vacías y notas al margen. */
  var RE_VALOR = /^[A-Za-z0-9._~-]{16,200}$/;

  var ROTULOS = {
    id: /^(client[_\s-]?id|clientid|key|api[_\s-]?key|llave|usuario|consumer[_\s-]?key)$/,
    secreto: /^(client[_\s-]?secret|clientsecret|secret|api[_\s-]?secret|secreto|contrase[nñ]a|consumer[_\s-]?secret)$/,
    ambiente: /^(ambiente|environment|entorno|env)$/
  };

  var AMBIENTES = {
    prod: /^(prod|produccion|producci[oó]n|production|live)$/,
    staging: /^(staging|preproduccion|preproducci[oó]n|preprod|stage)$/,
    fit: /^(fit|pruebas|test|testing)$/
  };

  function normalizar(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/\s+/g, ' ').trim().toLowerCase()
      .replace(/[:=]+$/, '').trim();
  }

  function queRotulo(celda) {
    var t = normalizar(celda);
    if (!t || t.length > 30) return '';
    for (var k in ROTULOS) {
      if (Object.prototype.hasOwnProperty.call(ROTULOS, k) && ROTULOS[k].test(t)) return k;
    }
    return '';
  }

  function queAmbiente(valor) {
    var t = normalizar(valor);
    for (var k in AMBIENTES) {
      if (Object.prototype.hasOwnProperty.call(AMBIENTES, k) && AMBIENTES[k].test(t)) return k;
    }
    return '';
  }

  function vacio() {
    return { clientId: '', clientSecret: '', ambiente: '', fuente: '', aviso: '' };
  }

  function completo(r) { return !!(r && r.clientId && r.clientSecret); }

  /* ----------------------------------------------------------- JSON -- */
  /* Vale el notam.json del programa y cualquier otro JSON donde estén: se
     recorre entero buscando las claves, sin exigir una forma concreta. */
  function deObjeto(obj, r) {
    r = r || vacio();
    if (!obj || typeof obj !== 'object') return r;
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v && typeof v === 'object') { deObjeto(v, r); return; }
      if (typeof v !== 'string' && typeof v !== 'number') return;
      var texto = String(v).trim();
      var cual = queRotulo(k);
      if (cual === 'ambiente' && !r.ambiente) r.ambiente = queAmbiente(texto);
      if (!RE_VALOR.test(texto)) return;
      if (cual === 'id' && !r.clientId) r.clientId = texto;
      if (cual === 'secreto' && !r.clientSecret) r.clientSecret = texto;
    });
    return r;
  }

  /* ----------------------------------------------------------- texto -- */
  /* Un renglón por dato, separados por dos puntos, igual, coma, punto y coma,
     tabulador o simplemente espacios: así sirve igual el archivo de llaves que
     manda el programa que uno escrito a mano o pegado del correo. */
  function deTexto(texto) {
    var crudo = String(texto || '');
    var limpio = crudo.replace(/^﻿/, '').trim();

    if (limpio.charAt(0) === '{' || limpio.charAt(0) === '[') {
      try {
        var r = deObjeto(JSON.parse(limpio));
        if (completo(r)) { r.fuente = 'json'; return r; }
      } catch (e) { /* no era JSON del todo; se sigue por renglones */ }
    }

    var res = vacio();
    var renglones = crudo.split(/\r?\n/);
    var encabezado = null;

    renglones.forEach(function (linea) {
      var l = linea.replace(/^[\s>*#-]+/, '').trim();
      if (!l) return;

      /* CSV: primero el encabezado de rótulos y después la fila de valores.
         Va antes que el par suelto porque «KEY,SECRET» son dos rótulos, no un
         rótulo con su valor. */
      var celdas = (l.indexOf(',') > 0 || l.indexOf('\t') > 0)
        ? l.split(/[,\t]/).map(function (c) { return c.trim().replace(/^"|"$/g, ''); })
        : null;
      if (celdas && celdas.length >= 2) {
        var rotulos = celdas.map(queRotulo);
        if (rotulos.filter(Boolean).length >= 2) { encabezado = rotulos; return; }
        if (encabezado && encabezado.length >= 2) {
          celdas.forEach(function (c, i) {
            var cual = encabezado[i];
            if (cual === 'ambiente' && !res.ambiente) res.ambiente = queAmbiente(c);
            if (!RE_VALOR.test(c)) return;
            if (cual === 'id' && !res.clientId) res.clientId = c;
            if (cual === 'secreto' && !res.clientSecret) res.clientSecret = c;
          });
          return;
        }
      }

      /* rótulo y valor en el mismo renglón */
      var m = /^([A-Za-z_ .()À-ſ-]{2,30}?)\s*[:=,;\t]\s*(.+)$/.exec(l) ||
              /^([A-Za-z_ .()À-ſ-]{2,30}?)\s{2,}(\S.*)$/.exec(l);
      if (m) {
        var cual = queRotulo(m[1]);
        var valor = m[2].trim().replace(/^["']|["',;]+$/g, '').trim();
        if (cual === 'ambiente' && !res.ambiente) res.ambiente = queAmbiente(valor);
        if (cual === 'id' && !res.clientId && RE_VALOR.test(valor)) res.clientId = valor;
        if (cual === 'secreto' && !res.clientSecret && RE_VALOR.test(valor)) res.clientSecret = valor;
        return;
      }

      /* rótulo solo, con el valor en el renglón siguiente */
      var solo = queRotulo(l);
      if (solo) { encabezado = [solo]; return; }
      if (encabezado && encabezado.length === 1 && RE_VALOR.test(l)) {
        if (encabezado[0] === 'id' && !res.clientId) res.clientId = l;
        if (encabezado[0] === 'secreto' && !res.clientSecret) res.clientSecret = l;
        encabezado = null;
      }
    });

    if (completo(res)) res.fuente = 'texto';
    return res;
  }

  /* ------------------------------------------------- hoja de cálculo -- */
  /* La hoja de la FAA trae el rótulo y el valor en celdas vecinas, a veces en
     la misma fila y a veces con el rótulo encima. Se admiten las dos. */
  function deMatriz(filas) {
    var res = vacio();
    if (!filas || !filas.length) return res;

    function poner(cual, valor) {
      var v = String(valor === null || valor === undefined ? '' : valor).trim();
      if (cual === 'ambiente') { if (!res.ambiente) res.ambiente = queAmbiente(v); return; }
      if (!RE_VALOR.test(v)) return;
      if (cual === 'id' && !res.clientId) res.clientId = v;
      if (cual === 'secreto' && !res.clientSecret) res.clientSecret = v;
    }

    filas.forEach(function (fila, y) {
      (fila || []).forEach(function (celda, x) {
        var cual = queRotulo(celda);
        if (!cual) return;
        /* a la derecha, saltando celdas vacías */
        for (var i = x + 1; i < (fila || []).length; i++) {
          if (String(fila[i] || '').trim()) { poner(cual, fila[i]); break; }
        }
        /* o debajo */
        for (var j = y + 1; j < filas.length && j <= y + 2; j++) {
          var abajo = filas[j] && filas[j][x];
          if (String(abajo || '').trim()) { poner(cual, abajo); break; }
        }
      });
    });

    if (completo(res)) { res.fuente = 'hoja'; return res; }

    /* Sin rótulos que reconocer: si en toda la hoja hay exactamente dos
       cadenas con pinta de llave, son esas, en el orden en que vienen. Se
       avisa, para que alguien les eche un ojo antes de guardar. */
    var sueltos = [];
    filas.forEach(function (fila) {
      (fila || []).forEach(function (celda) {
        var v = String(celda === null || celda === undefined ? '' : celda).trim();
        if (RE_VALOR.test(v) && !queRotulo(v) && sueltos.indexOf(v) < 0) sueltos.push(v);
      });
    });
    if (sueltos.length === 2) {
      /* el secreto de la FAA es el más largo de los dos */
      var a = sueltos[0], b = sueltos[1];
      res.clientId = a.length <= b.length ? a : b;
      res.clientSecret = a.length <= b.length ? b : a;
      res.fuente = 'hoja';
      res.aviso = 'La hoja no traía rótulos: se tomaron las dos cadenas con pinta de llave. ' +
        'Compruébelas antes de guardar.';
    }
    return res;
  }

  var API = {
    deTexto: deTexto, deMatriz: deMatriz, deObjeto: deObjeto,
    queRotulo: queRotulo, queAmbiente: queAmbiente, completo: completo, RE_VALOR: RE_VALOR
  };

  var ATIS = global.ATIS = global.ATIS || {};
  ATIS.llaves = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
