/* ATIS 3.0 - Decodificador de NOTAM */
(function (global) {
  'use strict';
  var ATIS = global.ATIS = global.ATIS || {};
  var D = ATIS.dict;

  var MONTHS = {
    es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
      'septiembre', 'octubre', 'noviembre', 'diciembre'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December']
  };

  /* Expande contracciones ICAO dentro de un texto libre */
  function expand(text, lang) {
    var out = String(text || '').replace(/\s+/g, ' ').trim();
    /* Casos con diagonal, antes de la sustitucion general */
    out = out.replace(/\bU\/S\b/g, D.CONTRACTIONS['U/S'][lang]);
    out = out.replace(/\b(\d{2})([LRC])\/(\d{2})([LRC])\b/g, function (m, n1, s1, n2, s2) {
      var side = { L: { es: 'izquierda', en: 'left' }, R: { es: 'derecha', en: 'right' }, C: { es: 'central', en: 'center' } };
      return n1 + ' ' + side[s1][lang] + (lang === 'es' ? ' y ' : ' and ') + n2 + ' ' + side[s2][lang];
    });
    out = out.replace(/\b([A-Z]{2,5})\b/g, function (match) {
      var entry = D.CONTRACTIONS[match];
      if (!entry) return match;
      return entry[lang] || match;
    });
    /* Designadores de pista: RWY 05L -> pista cero cinco izquierda (texto legible) */
    out = out.replace(/\b(\d{2})([LRC])\b/g, function (m, num, side) {
      var s = { L: { es: 'izquierda', en: 'left' }, R: { es: 'derecha', en: 'right' }, C: { es: 'central', en: 'center' } }[side];
      return num + ' ' + (s ? s[lang] : side);
    });
    return out;
  }

  function parseDT(raw) {
    var m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(raw || '').trim());
    if (!m) return null;
    return { year: 2000 + (+m[1]), month: (+m[2]) - 1, day: +m[3], hhmm: m[4] + ':' + m[5] };
  }

  function fmtDate(raw, lang) {
    var d = parseDT(raw);
    if (!d) {
      var t = String(raw || '').trim().toUpperCase();
      if (/^PERM/.test(t)) return lang === 'es' ? 'permanente' : 'permanent';
      if (/^(EST|UFN)/.test(t)) return lang === 'es' ? 'hasta nuevo aviso' : 'until further notice';
      return raw || '';
    }
    var month = (MONTHS[lang] || MONTHS.en)[d.month];
    return lang === 'es'
      ? d.day + ' de ' + month + ' a las ' + d.hhmm + ' UTC'
      : month + ' ' + d.day + ' at ' + d.hhmm + ' UTC';
  }

  /* Frase de vigencia compacta: si es el mismo dia se menciona una sola vez */
  function validity(from, to, lang) {
    var a = parseDT(from), b = parseDT(to);
    if (a && b && a.year === b.year && a.month === b.month && a.day === b.day) {
      var month = (MONTHS[lang] || MONTHS.en)[a.month];
      return lang === 'es'
        ? 'Vigente el ' + a.day + ' de ' + month + ' de ' + a.hhmm + ' a ' + b.hhmm + ' UTC'
        : 'Valid on ' + month + ' ' + a.day + ' from ' + a.hhmm + ' to ' + b.hhmm + ' UTC';
    }
    var head = lang === 'es' ? 'Vigente desde el ' : 'Valid from ';
    var mid = lang === 'es' ? ' hasta el ' : ' until ';
    return head + fmtDate(from, lang) + (to ? mid + fmtDate(to, lang) : '');
  }

  function parseQLine(q, lang) {
    var fields = String(q || '').split('/');
    if (fields.length < 8) return null;
    var code = fields[1] || '';
    var subject = code.substr(1, 2);
    var condition = code.substr(3, 2);
    return {
      fir: fields[0],
      code: code,
      subject: D.Q_SUBJECT[subject] ? D.Q_SUBJECT[subject][lang] : null,
      subjectCode: subject,
      condition: D.Q_CONDITION[condition] ? D.Q_CONDITION[condition][lang] : null,
      conditionCode: condition,
      traffic: D.Q_TRAFFIC[fields[2]] ? D.Q_TRAFFIC[fields[2]][lang] : fields[2],
      purpose: D.Q_PURPOSE[fields[3]] ? D.Q_PURPOSE[fields[3]][lang] : fields[3],
      scope: D.Q_SCOPE[fields[4]] ? D.Q_SCOPE[fields[4]][lang] : fields[4],
      lower: fields[5],
      upper: fields[6],
      coordinates: fields[7]
    };
  }

  /* Acepta NOTAM en formato ICAO completo o texto libre */
  function parse(raw, lang) {
    lang = lang || 'es';
    var text = String(raw || '').replace(/\r/g, '').trim();
    var result = {
      raw: text,
      id: '',
      kind: '',
      series: '',
      q: null,
      location: '',
      from: '', to: '', schedule: '',
      body: '',
      lower: '', upper: '',
      plain: '',
      summary: '',
      structured: false
    };
    if (!text) return result;

    var idMatch = /\b([A-Z]\d{4}\/\d{2})\s*(NOTAM[NRC])?\s*(?:([A-Z]\d{4}\/\d{2}))?/.exec(text);
    if (idMatch) {
      result.id = idMatch[1];
      result.kind = idMatch[2] || '';
      if (idMatch[3]) result.replaces = idMatch[3];
    }

    var flat = text.replace(/\n/g, ' ');
    function item(letter) {
      var re = new RegExp('(?:^|\\s)' + letter + '\\)\\s*([\\s\\S]*?)(?=\\s[A-GQ]\\)\\s|$)');
      var m = re.exec(' ' + flat);
      return m ? m[1].trim() : '';
    }

    var qRaw = item('Q');
    if (qRaw) { result.q = parseQLine(qRaw, lang); result.structured = true; }
    result.location = item('A');
    result.from = item('B');
    result.to = item('C');
    result.schedule = item('D');
    result.body = item('E');
    result.lower = item('F');
    result.upper = item('G');

    if (!result.body) {
      /* Texto libre: todo el contenido es el cuerpo */
      result.body = flat.replace(/\b[A-Z]\d{4}\/\d{2}\b\s*(NOTAM[NRC])?/g, '').trim();
    } else {
      result.structured = true;
    }

    result.plain = expand(result.body, lang);

    var pieces = [];
    if (result.plain) pieces.push(capitalize(result.plain));
    if (result.from) pieces.push(validity(result.from, result.to, lang));
    if (result.schedule) {
      pieces.push((lang === 'es' ? 'Horario: ' : 'Schedule: ') + expand(result.schedule, lang));
    }
    if (result.lower && result.upper) {
      pieces.push((lang === 'es' ? 'Limites: ' : 'Limits: ') + expand(result.lower, lang) + ' - ' + expand(result.upper, lang));
    }
    result.summary = pieces.join('. ') + (pieces.length ? '.' : '');

    return result;
  }

  function capitalize(s) {
    s = String(s || '').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* Divide un bloque con varios NOTAM (separados por linea en blanco o por ID) */
  function split(raw) {
    var text = String(raw || '').replace(/\r/g, '').trim();
    if (!text) return [];
    if (/\n\s*\n/.test(text)) {
      return text.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    var byId = text.split(/\n(?=[A-Z]\d{4}\/\d{2}\b)/);
    return byId.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  ATIS.notam = { parse: parse, expand: expand, split: split, fmtDate: fmtDate, validity: validity };
})(this);
