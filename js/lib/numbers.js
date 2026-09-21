/* ATIS 3.0 - Conversion de numeros a palabras para locucion aeronautica */
(function (global) {
  'use strict';
  var ATIS = global.ATIS = global.ATIS || {};

  var DIGITS = {
    es: ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'],
    en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
    en_icao: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner']
  };

  var SYMBOLS = {
    es: { '.': 'punto', ',': 'punto', '/': 'diagonal', '-': 'menos', 'M': 'menos', ':': '' },
    en: { '.': 'point', ',': 'point', '/': 'slash', '-': 'minus', 'M': 'minus', ':': '' }
  };

  /* Alfabeto ICAO: forma escrita y forma para el sintetizador de voz */
  var ALPHABET = [
    ['ALFA', 'Alfa', 'Alfa'],
    ['BRAVO', 'Bravo', 'Bravo'],
    ['CHARLIE', 'Charli', 'Charlie'],
    ['DELTA', 'Delta', 'Delta'],
    ['ECHO', 'Eco', 'Echo'],
    ['FOXTROT', 'Foxtrot', 'Foxtrot'],
    ['GOLF', 'Golf', 'Golf'],
    ['HOTEL', 'Hotel', 'Hotel'],
    ['INDIA', 'India', 'India'],
    ['JULIETT', 'Julieta', 'Juliett'],
    ['KILO', 'Kilo', 'Kilo'],
    ['LIMA', 'Lima', 'Lima'],
    ['MIKE', 'Maik', 'Mike'],
    ['NOVEMBER', 'November', 'November'],
    ['OSCAR', 'Oscar', 'Oscar'],
    ['PAPA', 'Papa', 'Papa'],
    ['QUEBEC', 'Quebec', 'Quebec'],
    ['ROMEO', 'Romeo', 'Romeo'],
    ['SIERRA', 'Sierra', 'Sierra'],
    ['TANGO', 'Tango', 'Tango'],
    ['UNIFORM', 'Uniform', 'Uniform'],
    ['VICTOR', 'Victor', 'Victor'],
    ['WHISKEY', 'Wiski', 'Whiskey'],
    ['XRAY', 'Ex Rey', 'X-ray'],
    ['YANKEE', 'Yanki', 'Yankee'],
    ['ZULU', 'Zulu', 'Zulu']
  ];

  var opts = { icaoEnglish: true };

  function setOptions(o) {
    if (o && typeof o.icaoEnglish === 'boolean') opts.icaoEnglish = o.icaoEnglish;
  }

  function digitTable(lang) {
    if (lang === 'es') return DIGITS.es;
    return opts.icaoEnglish ? DIGITS.en_icao : DIGITS.en;
  }

  /* Deletrea una cadena digito por digito: "050" -> "cero cinco cero" */
  function spell(value, lang) {
    var str = String(value === null || value === undefined ? '' : value);
    var table = digitTable(lang);
    var syms = SYMBOLS[lang] || SYMBOLS.en;
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charAt(i);
      if (c >= '0' && c <= '9') out.push(table[+c]);
      else if (syms[c] !== undefined) { if (syms[c]) out.push(syms[c]); }
      else if (c === ' ') continue;
      else out.push(c);
    }
    return out.join(' ');
  }

  /* Cardinal en espanol (0 - 999 999) */
  var ES_UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
    'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
    'veintisiete', 'veintiocho', 'veintinueve'];
  var ES_TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  var ES_HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
    'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  function esCardinal(n) {
    n = Math.round(Number(n));
    if (isNaN(n)) return '';
    if (n < 0) return 'menos ' + esCardinal(-n);
    if (n < 30) return ES_UNITS[n];
    if (n < 100) {
      var t = Math.floor(n / 10), u = n % 10;
      return ES_TENS[t] + (u ? ' y ' + ES_UNITS[u] : '');
    }
    if (n === 100) return 'cien';
    if (n < 1000) {
      var h = Math.floor(n / 100), r = n % 100;
      return ES_HUNDREDS[h] + (r ? ' ' + esCardinal(r) : '');
    }
    if (n < 1000000) {
      var th = Math.floor(n / 1000), rem = n % 1000;
      var head = th === 1 ? 'mil' : esCardinal(th) + ' mil';
      return head + (rem ? ' ' + esCardinal(rem) : '');
    }
    return spell(n, 'es');
  }

  /* Cardinal en ingles (0 - 999 999) */
  var EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  function enCardinal(n) {
    n = Math.round(Number(n));
    if (isNaN(n)) return '';
    if (n < 0) return 'minus ' + enCardinal(-n);
    if (n < 20) return EN_UNITS[n];
    if (n < 100) {
      var t = Math.floor(n / 10), u = n % 10;
      return EN_TENS[t] + (u ? ' ' + EN_UNITS[u] : '');
    }
    if (n < 1000) {
      var h = Math.floor(n / 100), r = n % 100;
      return EN_UNITS[h] + ' hundred' + (r ? ' ' + enCardinal(r) : '');
    }
    if (n < 1000000) {
      var th = Math.floor(n / 1000), rem = n % 1000;
      return enCardinal(th) + ' thousand' + (rem ? ' ' + enCardinal(rem) : '');
    }
    return spell(n, 'en');
  }

  function cardinal(n, lang) {
    return lang === 'es' ? esCardinal(n) : enCardinal(n);
  }

  /* Altitudes y alturas de nubes: 2500 -> "dos mil quinientos" / "two thousand five hundred" */
  function altitude(feet, lang) {
    var n = Math.round(Number(feet));
    if (isNaN(n)) return '';
    return cardinal(n, lang);
  }

  /* Letra ATIS: indice 0-25 o caracter */
  function letterInfo(letter) {
    var idx;
    if (typeof letter === 'number') idx = letter;
    else idx = String(letter || 'A').toUpperCase().charCodeAt(0) - 65;
    if (idx < 0 || idx > 25) idx = 0;
    return {
      index: idx,
      letter: String.fromCharCode(65 + idx),
      word: ALPHABET[idx][0],
      speech_es: ALPHABET[idx][1],
      speech_en: ALPHABET[idx][2]
    };
  }

  /* Designador de pista: "05L" -> texto y locucion */
  var SIDE = {
    L: { es: 'izquierda', en: 'left', speech_es: 'izquierda', speech_en: 'left' },
    R: { es: 'derecha', en: 'right', speech_es: 'derecha', speech_en: 'right' },
    C: { es: 'central', en: 'center', speech_es: 'central', speech_en: 'center' }
  };

  function runway(designator, lang) {
    var d = String(designator || '').toUpperCase().replace(/[^0-9LRC]/g, '');
    var m = /^(\d{1,2})([LRC])?$/.exec(d);
    if (!m) return { text: designator || '', speech: spell(String(designator || ''), lang) };
    var num = m[1].length === 1 ? '0' + m[1] : m[1];
    var side = m[2] ? SIDE[m[2]] : null;
    var text = num + (side ? ' ' + (lang === 'es' ? side.es : side.en) : '');
    var speech = spell(num, lang) + (side ? ' ' + (lang === 'es' ? side.speech_es : side.speech_en) : '');
    return { text: text, speech: speech, number: num, side: m[2] || '' };
  }

  ATIS.num = {
    setOptions: setOptions,
    spell: spell,
    cardinal: cardinal,
    altitude: altitude,
    letterInfo: letterInfo,
    runway: runway,
    ALPHABET: ALPHABET
  };
})(this);
