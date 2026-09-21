/* ATIS 3.0 - Modelo de observacion y generador del guion ATIS (ES / EN) */
(function (global) {
  'use strict';
  var ATIS = global.ATIS = global.ATIS || {};
  var N = ATIS.num, D = ATIS.dict;

  /* ------------------------------------------------------------------ *
   * Constructor de guion: mantiene en paralelo el texto escrito
   * y el texto para el sintetizador de voz.
   * ------------------------------------------------------------------ */
  function Builder() { this.t = []; this.s = []; }
  Builder.prototype.add = function (text, speech) {
    if (text === null || text === undefined || text === '') return this;
    this.t.push(text);
    this.s.push(speech === null || speech === undefined ? text : speech);
    return this;
  };
  Builder.prototype.result = function () {
    return { text: this.t.join(' '), speech: this.s.join(' '), sentences: this.t.slice() };
  };

  /* Catalogo de capas de cielo (clave -> texto ATIS) */
  var SKY_LABELS = {
    SKC: { es: 'Despejado', en: 'Sky clear', noHeight: true },
    FEW: { es: 'Pocas nubes a', en: 'Few clouds at' },
    SCT: { es: 'Nublado a', en: 'Scattered at' },
    BKN: { es: 'Cerrado a', en: 'Broken at' },
    OVC: { es: 'Cielo cubierto a', en: 'Overcast at' },
    VV: { es: 'Visibilidad vertical', en: 'Vertical visibility' },
    NSC: { es: 'Sin nubes de importancia', en: 'No significant cloud', noHeight: true },
    CAVOK: { es: 'CAVOK', en: 'CAVOK', noHeight: true }
  };

  /* Causas de restriccion de visibilidad */
  var VIS_CAUSES = {
    '': { es: '', en: '' },
    HZ: { es: 'Bruma', en: 'Haze' },
    BR: { es: 'Neblina', en: 'Mist' },
    FG: { es: 'Niebla', en: 'Fog' },
    FU: { es: 'Humo', en: 'Smoke' },
    DU: { es: 'Polvo', en: 'Dust' },
    SA: { es: 'Arena', en: 'Sand' },
    RA: { es: 'Lluvia', en: 'Rain' },
    'SHRA': { es: 'Chubascos de lluvia', en: 'Rain showers' },
    TS: { es: 'Tormenta', en: 'Thunderstorm' },
    TSRA: { es: 'Tormenta con lluvia', en: 'Thunderstorm with rain' },
    VA: { es: 'Ceniza volcanica', en: 'Volcanic ash' }
  };

  var RWY_CONDITIONS = {
    '': { es: '', en: '' },
    DRY: { es: 'Pista seca', en: 'Runway dry' },
    WET: { es: 'Pista mojada', en: 'Runway wet' },
    STANDING_WATER: { es: 'Agua estancada en la pista', en: 'Standing water on the runway' },
    SLIPPERY: { es: 'Pista resbalosa cuando esta mojada', en: 'Runway slippery when wet' },
    WIP: { es: 'Trabajos en la pista', en: 'Work in progress on the runway' }
  };

  var VIS_UNITS = {
    SM: { es: 'millas terrestres', en: 'statute miles', es1: 'milla terrestre', en1: 'statute mile' },
    KM: { es: 'kilometros', en: 'kilometers', es1: 'kilometro', en1: 'kilometer' },
    M: { es: 'metros', en: 'meters', es1: 'metro', en1: 'meter' }
  };

  /* ------------------------------------------------------------------ *
   * METAR decodificado -> modelo de observacion del ATIS
   * ------------------------------------------------------------------ */
  function fromMetar(m) {
    var obs = {
      station: m.station || '',
      time: pad2(m.hour) + pad2(m.minute),
      wind: { mode: 'steady', direction: '', speed: '', gust: '', varFrom: '', varTo: '' },
      visibility: { value: '', unit: 'SM', orMore: false, less: false, cause: '' },
      rvr: [],
      layers: [],
      temperature: '', dewpoint: '',
      altimeter: '', altimeterUnit: 'inHg', qnhHpa: '',
      windshear: (m.windshear || []).join(', ')
    };

    if (m.wind) {
      if (m.wind.calm) obs.wind.mode = 'calm';
      else if (m.wind.variable) obs.wind.mode = 'variable';
      else obs.wind.mode = 'steady';
      obs.wind.direction = m.wind.direction === null ? '' : pad3(m.wind.direction);
      obs.wind.speed = m.wind.speed === null ? '' : String(m.wind.speed);
      obs.wind.gust = m.wind.gust ? String(m.wind.gust) : '';
      obs.wind.varFrom = m.wind.varFrom === null ? '' : pad3(m.wind.varFrom);
      obs.wind.varTo = m.wind.varTo === null ? '' : pad3(m.wind.varTo);
      obs.wind.unit = m.wind.unit || 'KT';
    }

    if (m.cavok) {
      obs.visibility.value = '10'; obs.visibility.unit = 'KM'; obs.visibility.orMore = true;
      obs.layers.push({ amount: 'CAVOK', height: '' });
    } else if (m.visibility) {
      if (m.visibility.unit === 'SM') {
        obs.visibility.unit = 'SM';
        obs.visibility.value = m.visibility.text || String(m.visibility.value);
        obs.visibility.less = !!m.visibility.less;
        obs.visibility.orMore = !!m.visibility.more;
      } else {
        if (m.visibility.tenKmOrMore) {
          obs.visibility.unit = 'KM'; obs.visibility.value = '10'; obs.visibility.orMore = true;
        } else if (m.visibility.meters >= 1000 && m.visibility.meters % 1000 === 0) {
          obs.visibility.unit = 'KM'; obs.visibility.value = String(m.visibility.meters / 1000);
        } else {
          obs.visibility.unit = 'M'; obs.visibility.value = String(m.visibility.meters);
        }
      }
    }

    /* Causa de la restriccion: primer fenomeno significativo */
    if (m.weather && m.weather.length) {
      var w = m.weather[0];
      var key = (w.descriptor || '') + (w.phenomena[0] || '');
      obs.visibility.cause = VIS_CAUSES[key] ? key : (VIS_CAUSES[w.phenomena[0]] ? w.phenomena[0] : '');
      obs.weatherRaw = m.weather.map(function (x) { return x.raw; }).join(' ');
    }

    (m.rvr || []).forEach(function (r) {
      obs.rvr.push({ runway: r.runway, value: r.value, unit: r.unit, prefix: r.prefix });
    });

    if (m.skyState === 'SKC' || m.skyState === 'CLR') obs.layers.push({ amount: 'SKC', height: '' });
    else if (m.skyState === 'NSC' || m.skyState === 'NCD') obs.layers.push({ amount: 'NSC', height: '' });
    (m.clouds || []).forEach(function (c) {
      obs.layers.push({ amount: c.amount, height: c.height === null ? '' : String(c.height), type: c.type || '' });
    });
    if (m.verticalVisibility !== null && m.verticalVisibility !== undefined) {
      obs.layers.push({ amount: 'VV', height: String(m.verticalVisibility) });
    }
    while (obs.layers.length < 3) obs.layers.push({ amount: '', height: '' });

    if (m.temperature !== null) obs.temperature = String(m.temperature);
    if (m.dewpoint !== null) obs.dewpoint = String(m.dewpoint);

    if (m.qnh) {
      if (m.qnh.source === 'inHg') {
        obs.altimeterUnit = 'inHg';
        obs.altimeter = m.qnh.digits || String(Math.round(m.qnh.inHg * 100));
        obs.qnhHpa = String(m.qnh.hpa);
      } else {
        obs.altimeterUnit = 'hPa';
        obs.altimeter = String(m.qnh.hpa);
        obs.qnhHpa = String(m.qnh.hpa);
      }
    }
    return obs;
  }

  function pad2(n) { return (n === null || n === undefined) ? '00' : ('0' + n).slice(-2); }
  function pad3(n) { return ('00' + n).slice(-3); }

  /* Numeros dentro de texto libre: 1-2 digitos se deletrean, 3 o mas se leen como cantidad */
  var MONTH_RE = new RegExp('\\s+(?:' + [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre',
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'
  ].join('|') + ')\\b', 'i');

  var MONTH_BEFORE_RE = new RegExp('(?:' + [
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'
  ].join('|') + ')\\s+$', 'i');

  function speakNumbers(text, lang) {
    return String(text || '').replace(/(\d):(\d)/g, '$1 $2').replace(/(\d+)(\s+(?:de|of)\b)?/g, function (all, d, tail, offset, whole) {
      if (!tail && MONTH_RE.test(whole.slice(offset + d.length, offset + d.length + 12))) {
        return N.cardinal(+d, lang);
      }
      if (!tail && MONTH_BEFORE_RE.test(whole.slice(Math.max(0, offset - 12), offset))) {
        return N.cardinal(+d, lang);
      }
      /* "21 de septiembre" se lee como cantidad; los grupos aeronauticos se deletrean */
      if (tail) return N.cardinal(+d, lang) + tail;
      if (d.length <= 2) return N.spell(d, lang);
      return N.cardinal(+d, lang);
    });
  }

  /* ------------------------------------------------------------------ *
   * Generador del guion
   * ------------------------------------------------------------------ */
  function build(lang, obs, cfg) {
    var b = new Builder();
    var L = lang === 'es';
    var info = N.letterInfo(cfg.letter || 'A');
    var letterSpeech = L ? info.speech_es : info.speech_en;

    /* 1. Encabezado */
    var name = (L ? cfg.airportNameEs : cfg.airportNameEn) || cfg.station || '';
    if (cfg.infoType === 'special') {
      b.add(name + ', ' + (L ? 'informacion especial ' : 'special information ') + info.word + '.',
        name + ', ' + (L ? 'informacion especial ' : 'special information ') + letterSpeech + '.');
    } else {
      b.add(name + ', ' + (L ? 'informacion ' : 'information ') + info.word + '.',
        name + ', ' + (L ? 'informacion ' : 'information ') + letterSpeech + '.');
    }

    /* 2. Hora de la observacion */
    if (obs.time) {
      b.add((L ? 'Observacion de las ' : 'Weather observation at ') + obs.time + ' zulu.',
        (L ? 'Observacion de las ' : 'Weather observation at ') + N.spell(obs.time, lang) + ' zulu.');
    }

    /* 3. Tipo de aproximacion */
    if (cfg.approach) {
      var apRwy = cfg.approachRunway ? N.runway(cfg.approachRunway, lang) : null;
      var apName = approachName(cfg.approach, lang);
      var t = (L ? 'Esperar aproximacion ' : 'Expect ') + apName + (L ? '' : ' approach');
      var s = t;
      if (apRwy) {
        t += (L ? ' a pista ' : ' runway ') + apRwy.text;
        s += (L ? ' a pista ' : ' runway ') + apRwy.speech;
      }
      b.add(t + '.', s + '.');
    }

    /* 4. Pista o pistas en uso */
    var rwys = (cfg.runwaysInUse || []).filter(Boolean);
    if (rwys.length) {
      var texts = rwys.map(function (r) { return N.runway(r, lang); });
      var join = L ? ' y ' : ' and ';
      var head = rwys.length > 1 ? (L ? 'Pistas en uso ' : 'Runways in use ') : (L ? 'Pista en uso ' : 'Runway in use ');
      b.add(head + texts.map(function (x) { return x.text; }).join(join) + '.',
        head + texts.map(function (x) { return x.speech; }).join(join) + '.');
    }

    /* 5. Condicion de la pista */
    if (cfg.runwayCondition && RWY_CONDITIONS[cfg.runwayCondition]) {
      var rc = RWY_CONDITIONS[cfg.runwayCondition][lang];
      if (rc) b.add(rc + '.');
    }

    /* 6. Nivel de transicion */
    if (cfg.transitionLevel) {
      b.add((L ? 'Nivel de transicion ' : 'Transition level ') + cfg.transitionLevel + '.',
        (L ? 'Nivel de transicion ' : 'Transition level ') + N.spell(cfg.transitionLevel, lang) + '.');
    }

    /* 7. Viento */
    var w = obs.wind || {};
    if (w.mode === 'calm') {
      b.add(L ? 'Viento en calma.' : 'Wind calm.');
    } else if (w.speed !== '' && w.speed !== undefined && w.speed !== null) {
      var wt, ws;
      var unit = (w.unit === 'MPS') ? (L ? 'metros por segundo' : 'meters per second') : (L ? 'nudos' : 'knots');
      if (w.mode === 'variable' || !w.direction) {
        wt = (L ? 'Viento variable ' : 'Wind variable ') + w.speed + ' ' + unit;
        ws = (L ? 'Viento variable ' : 'Wind variable ') + N.spell(w.speed, lang) + ' ' + unit;
      } else {
        wt = (L ? 'Viento ' : 'Wind ') + w.direction + (L ? ' grados ' : ' degrees ') + w.speed + ' ' + unit;
        ws = (L ? 'Viento ' : 'Wind ') + N.spell(w.direction, lang) + (L ? ' grados ' : ' degrees ') +
          N.spell(w.speed, lang) + ' ' + unit;
      }
      if (w.gust) {
        wt += (L ? ', con rachas de ' : ', gusting ') + w.gust + ' ' + unit;
        ws += (L ? ', con rachas de ' : ', gusting ') + N.spell(w.gust, lang) + ' ' + unit;
      }
      b.add(wt + '.', ws + '.');
      if (w.varFrom && w.varTo) {
        b.add((L ? 'Viento variable entre ' : 'Wind variable between ') + w.varFrom + (L ? ' y ' : ' and ') +
          w.varTo + (L ? ' grados.' : ' degrees.'),
          (L ? 'Viento variable entre ' : 'Wind variable between ') + N.spell(w.varFrom, lang) +
          (L ? ' y ' : ' and ') + N.spell(w.varTo, lang) + (L ? ' grados.' : ' degrees.'));
      }
    }

    /* 8. Visibilidad */
    var v = obs.visibility || {};
    if (v.value !== '' && v.value !== undefined && v.value !== null) {
      var u = VIS_UNITS[v.unit] || VIS_UNITS.SM;
      var singular = String(v.value) === '1';
      var unitText = L ? (singular ? u.es1 : u.es) : (singular ? u.en1 : u.en);
      var vt = (L ? 'Visibilidad ' : 'Visibility ');
      var vs = vt;
      if (v.less) { vt += L ? 'menor de ' : 'less than '; vs += L ? 'menor de ' : 'less than '; }
      vt += v.value + ' ' + unitText;
      vs += visValueSpeech(v.value, v.unit, lang) + ' ' + unitText;
      if (v.orMore) { vt += L ? ' o mas' : ' or more'; vs += L ? ' o mas' : ' or more'; }
      b.add(vt + '.', vs + '.');
    }
    if (v.cause && VIS_CAUSES[v.cause]) {
      var cz = VIS_CAUSES[v.cause][lang];
      if (cz) b.add(cz + '.');
    }

    /* 9. RVR */
    (obs.rvr || []).forEach(function (r) {
      var rr = N.runway(r.runway, lang);
      var unitR = r.unit === 'ft' ? (L ? 'pies' : 'feet') : (L ? 'metros' : 'meters');
      b.add((L ? 'Alcance visual en la pista ' : 'Runway visual range runway ') + rr.text + ' ' + r.value + ' ' + unitR + '.',
        (L ? 'Alcance visual en la pista ' : 'Runway visual range runway ') + rr.speech + ' ' +
        N.cardinal(r.value, lang) + ' ' + unitR + '.');
    });

    /* 10. Condicion de cielo */
    var layers = (obs.layers || []).filter(function (l) { return l && l.amount; });
    if (layers.length) {
      var lt = [], ls = [];
      layers.forEach(function (l, li) {
        var lab = SKY_LABELS[l.amount];
        if (!lab) return;
        var label = li === 0 ? lab[lang] : lowerFirst(lab[lang]);
        if (lab.noHeight || !l.height) {
          lt.push(label); ls.push(label);
        } else {
          var ft = L ? 'pies' : 'feet';
          lt.push(label + ' ' + l.height + ' ' + ft);
          ls.push(label + ' ' + N.altitude(l.height, lang) + ' ' + ft);
        }
        if (l.type && D.CLOUD_TYPE[l.type]) {
          lt[lt.length - 1] += ' ' + (L ? 'con ' : 'with ') + D.CLOUD_TYPE[l.type][lang];
          ls[ls.length - 1] += ' ' + (L ? 'con ' : 'with ') + D.CLOUD_TYPE[l.type][lang];
        }
      });
      if (lt.length) b.add(lt.join(', ') + '.', ls.join(', ') + '.');
    }

    /* 11. Temperatura y punto de rocio */
    if (obs.temperature !== '' && obs.temperature !== null && obs.temperature !== undefined) {
      var tt = (L ? 'Temperatura ' : 'Temperature ') + obs.temperature;
      var tsp = (L ? 'Temperatura ' : 'Temperature ') + signedSpeech(obs.temperature, lang);
      if (obs.dewpoint !== '' && obs.dewpoint !== null && obs.dewpoint !== undefined) {
        tt += (L ? ', punto de rocio ' : ', dew point ') + obs.dewpoint;
        tsp += (L ? ', punto de rocio ' : ', dew point ') + signedSpeech(obs.dewpoint, lang);
      }
      b.add(tt + '.', tsp + '.');
    }

    /* 12. Altimetro / QNH */
    if (obs.altimeter) {
      if (obs.altimeterUnit === 'inHg') {
        b.add((L ? 'Altimetro ' : 'Altimeter ') + obs.altimeter + '.',
          (L ? 'Altimetro ' : 'Altimeter ') + N.spell(obs.altimeter, lang) + '.');
        if (cfg.includeHpa && obs.qnhHpa) {
          b.add('QNH ' + obs.qnhHpa + (L ? ' hectopascales.' : ' hectopascals.'),
            'Q N H ' + N.spell(obs.qnhHpa, lang) + (L ? ' hectopascales.' : ' hectopascals.'));
        }
      } else {
        b.add('QNH ' + obs.altimeter + (L ? ' hectopascales.' : ' hectopascals.'),
          'Q N H ' + N.spell(obs.altimeter, lang) + (L ? ' hectopascales.' : ' hectopascals.'));
      }
    }

    /* 13. Cizalladura */
    if (obs.windshear) {
      b.add((L ? 'Cizalladura del viento reportada: ' : 'Wind shear reported: ') + obs.windshear + '.',
        (L ? 'Cizalladura del viento reportada: ' : 'Wind shear reported: ') + speakNumbers(obs.windshear, lang) + '.');
    }

    /* 14. NOTAM vigentes */
    var notams = (cfg.notamLines || []).filter(Boolean);
    if (notams.length) {
      b.add(L ? 'NOTAM vigentes.' : 'Current NOTAMs.');
      notams.forEach(function (line) {
        var clean = String(line).trim();
        if (!clean) return;
        if (!/[.!?]$/.test(clean)) clean += '.';
        b.add(clean, speakNumbers(clean, lang));
      });
    }

    /* 15. Informacion adicional */
    var extra = (L ? cfg.additionalEs : cfg.additionalEn) || '';
    extra = String(extra).replace(/\r/g, '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    if (extra.length) {
      b.add(L ? 'Informacion adicional.' : 'Additional information.');
      extra.forEach(function (line) {
        if (!/[.!?]$/.test(line)) line += '.';
        b.add(line, speakNumbers(line, lang));
      });
    }

    /* 16. Cierre */
    b.add((L ? 'Al establecer comunicacion informe tener informacion ' : 'On initial contact advise you have information ') +
      info.word + '.',
      (L ? 'Al establecer comunicacion informe tener informacion ' : 'On initial contact advise you have information ') +
      letterSpeech + '.');

    return b.result();
  }

  function approachName(code, lang) {
    var map = {
      ILS: { es: 'ILS', en: 'ILS' },
      RNP: { es: 'RNP', en: 'RNP' },
      VOR: { es: 'VOR', en: 'VOR' },
      NDB: { es: 'NDB', en: 'NDB' },
      VISUAL: { es: 'visual', en: 'visual' },
      RADAR: { es: 'radar', en: 'radar' }
    };
    var e = map[String(code).toUpperCase()];
    return e ? e[lang] : code;
  }

  function signedSpeech(value, lang) {
    var str = String(value).trim();
    var neg = str.charAt(0) === '-' || str.charAt(0) === 'M';
    var digits = str.replace(/^[-M]/, '');
    var head = neg ? (lang === 'es' ? 'menos ' : 'minus ') : '';
    return head + N.spell(digits, lang);
  }

  function visValueSpeech(value, unit, lang) {
    var str = String(value).trim();
    var frac = /^(?:(\d+)\s)?(\d+)\/(\d+)$/.exec(str);
    if (frac) {
      var names = {
        '1/2': { es: 'un medio', en: 'one half' },
        '1/4': { es: 'un cuarto', en: 'one quarter' },
        '3/4': { es: 'tres cuartos', en: 'three quarters' },
        '1/8': { es: 'un octavo', en: 'one eighth' },
        '3/8': { es: 'tres octavos', en: 'three eighths' },
        '5/8': { es: 'cinco octavos', en: 'five eighths' },
        '7/8': { es: 'siete octavos', en: 'seven eighths' },
        '1/16': { es: 'un dieciseisavo', en: 'one sixteenth' }
      };
      var key = frac[2] + '/' + frac[3];
      var fracText = names[key] ? names[key][lang] : N.cardinal(+frac[2], lang) + ' / ' + N.cardinal(+frac[3], lang);
      return (frac[1] ? N.cardinal(+frac[1], lang) + (lang === 'es' ? ' y ' : ' and ') : '') + fracText;
    }
    var n = Number(str);
    if (isNaN(n)) return speakNumbers(str, lang);
    return N.cardinal(n, lang);
  }

  function lowerFirst(s) {
    return String(s || '').charAt(0).toLowerCase() + String(s || '').slice(1);
  }

  ATIS.script = {
    build: build,
    fromMetar: fromMetar,
    speakNumbers: speakNumbers,
    SKY_LABELS: SKY_LABELS,
    VIS_CAUSES: VIS_CAUSES,
    RWY_CONDITIONS: RWY_CONDITIONS,
    VIS_UNITS: VIS_UNITS
  };
})(this);
