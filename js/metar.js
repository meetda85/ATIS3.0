/* ATIS 3.0 - Decodificador METAR / SPECI */
(function (global) {
  'use strict';
  var ATIS = global.ATIS = global.ATIS || {};

  var RE = {
    station: /^[A-Z][A-Z0-9]{3}$/,
    time: /^(\d{2})(\d{2})(\d{2})Z$/,
    wind: /^(\d{3}|VRB|\/{3})(\d{2,3}|\/\/)(?:G(\d{2,3}))?(KT|MPS|KMH)$/,
    windVar: /^(\d{3})V(\d{3})$/,
    visMeters: /^(\d{4})(NDV|[NSEW]{1,2})?$/,
    visSM: /^(M|P)?(\d{1,2})?(?:\s)?(\d\/\d)?SM$/,
    rvr: /^R(\d{2}[LRC]?)\/([MP])?(\d{4})(?:V([MP])?(\d{4}))?(FT)?([UDN])?$/,
    weather: /^(-|\+|VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+)$/,
    recent: /^RE(.+)$/,
    cloud: /^(FEW|SCT|BKN|OVC)(\d{3}|\/{3})(CB|TCU)?$/,
    vv: /^VV(\d{3}|\/{3})$/,
    temp: /^(M?\d{2})\/(M?\d{2})?$/,
    qnhHpa: /^Q(\d{4})$/,
    qnhInHg: /^A(\d{4})$/,
    windshear: /^WS(?:\s|$)/,
    runwayState: /^(\d{2}|88|99)(\d{6}|CLRD\d{2}|\/{6})$/
  };

  function parse(raw) {
    var text = String(raw || '').toUpperCase().replace(/=+\s*$/, '').replace(/\s+/g, ' ').trim();
    var result = {
      raw: text,
      valid: false,
      type: 'METAR',
      station: '',
      day: null, hour: null, minute: null,
      auto: false, cor: false, nil: false,
      wind: null,
      cavok: false,
      visibility: null,
      rvr: [],
      weather: [],
      recent: [],
      clouds: [],
      verticalVisibility: null,
      skyState: null,
      temperature: null,
      dewpoint: null,
      qnh: null,
      windshear: [],
      trend: '',
      remarks: '',
      unparsed: [],
      errors: []
    };
    if (!text) { result.errors.push('METAR vacio'); return result; }

    var parts = text.split(' ');
    var i = 0;

    /* Encabezado */
    if (parts[i] === 'METAR' || parts[i] === 'SPECI') { result.type = parts[i]; i++; }
    if (parts[i] === 'COR') { result.cor = true; i++; }

    if (parts[i] && RE.station.test(parts[i]) && !RE.time.test(parts[i])) {
      result.station = parts[i]; i++;
    } else {
      result.errors.push('No se encontro el indicador de estacion');
    }

    if (parts[i] && RE.time.test(parts[i])) {
      var t = RE.time.exec(parts[i]);
      result.day = +t[1]; result.hour = +t[2]; result.minute = +t[3];
      i++;
    } else {
      result.errors.push('No se encontro el grupo dia/hora');
    }

    /* Cuerpo: separar tendencia y comentarios */
    var body = [], trend = [], rmk = [], mode = 'body';
    for (; i < parts.length; i++) {
      var p = parts[i];
      if (p === 'RMK' || p === 'RMKS') { mode = 'rmk'; continue; }
      if (mode === 'body' && (p === 'NOSIG' || p === 'BECMG' || p === 'TEMPO')) mode = 'trend';
      if (mode === 'body') body.push(p);
      else if (mode === 'trend') trend.push(p);
      else rmk.push(p);
    }
    result.trend = trend.join(' ');
    result.remarks = rmk.join(' ');

    for (var k = 0; k < body.length; k++) {
      var tok = body[k], m;

      if (tok === 'AUTO') { result.auto = true; continue; }
      if (tok === 'COR') { result.cor = true; continue; }
      if (tok === 'NIL') { result.nil = true; continue; }
      if (tok === 'CAVOK') { result.cavok = true; continue; }

      if ((m = RE.wind.exec(tok))) {
        result.wind = {
          direction: m[1] === 'VRB' ? null : (m[1] === '///' ? null : +m[1]),
          variable: m[1] === 'VRB',
          missing: m[1] === '///' || m[2] === '//',
          speed: m[2] === '//' ? null : +m[2],
          gust: m[3] ? +m[3] : null,
          unit: m[4],
          varFrom: null, varTo: null
        };
        result.wind.calm = result.wind.speed === 0;
        continue;
      }
      if ((m = RE.windVar.exec(tok)) && result.wind) {
        result.wind.varFrom = +m[1]; result.wind.varTo = +m[2];
        continue;
      }
      if (tok === 'WS' || RE.windshear.test(tok)) {
        var ws = [tok];
        while (k + 1 < body.length && /^(ALL|RWY|R\d{2}[LRC]?|RWY\d{2}[LRC]?)$/.test(body[k + 1])) {
          ws.push(body[++k]);
        }
        result.windshear.push(ws.join(' '));
        continue;
      }
      /* Visibilidad en millas terrestres, puede venir en dos tokens: "1 1/2SM" */
      if (/SM$/.test(tok)) {
        var smText = tok;
        if (/^\d$/.test(body[k - 1] || '') && result.visibility === null) {
          smText = body[k - 1] + ' ' + tok;
        }
        var sm = parseSM(smText);
        if (sm) { result.visibility = sm; continue; }
      }
      if (/^\d$/.test(tok) && /SM$/.test(body[k + 1] || '')) continue; /* parte entera, se une despues */

      if (result.visibility === null && (m = RE.visMeters.exec(tok))) {
        var meters = +m[1];
        result.visibility = {
          unit: 'm',
          meters: meters,
          tenKmOrMore: meters === 9999,
          below50: meters === 0,
          direction: m[2] && m[2] !== 'NDV' ? m[2] : null
        };
        continue;
      }
      if ((m = RE.rvr.exec(tok))) {
        result.rvr.push({
          runway: m[1], prefix: m[2] || '', value: +m[3],
          varPrefix: m[4] || '', varValue: m[5] ? +m[5] : null,
          unit: m[6] ? 'ft' : 'm', trend: m[7] || ''
        });
        continue;
      }
      if ((m = RE.recent.exec(tok)) && RE.weather.test(m[1])) {
        result.recent.push(parseWeather(m[1]));
        continue;
      }
      if (RE.weather.test(tok) && tok !== 'VV' ) {
        var wx = parseWeather(tok);
        if (wx) { result.weather.push(wx); continue; }
      }
      if ((m = RE.cloud.exec(tok))) {
        result.clouds.push({
          amount: m[1],
          height: m[2] === '///' ? null : +m[2] * 100,
          type: m[3] || ''
        });
        continue;
      }
      if ((m = RE.vv.exec(tok))) {
        result.verticalVisibility = m[1] === '///' ? null : +m[1] * 100;
        continue;
      }
      if (tok === 'NSC' || tok === 'NCD' || tok === 'SKC' || tok === 'CLR') {
        result.skyState = tok; continue;
      }
      if ((m = RE.temp.exec(tok))) {
        result.temperature = toSigned(m[1]);
        result.dewpoint = m[2] ? toSigned(m[2]) : null;
        continue;
      }
      if ((m = RE.qnhHpa.exec(tok))) {
        result.qnh = { hpa: +m[1], inHg: Math.round((+m[1]) * 100 / 33.8639) / 100, source: 'hPa' };
        continue;
      }
      if ((m = RE.qnhInHg.exec(tok))) {
        var inHg = (+m[1]) / 100;
        result.qnh = { inHg: inHg, hpa: Math.round(inHg * 33.8639), source: 'inHg', digits: m[1] };
        continue;
      }
      if (RE.runwayState.test(tok)) { result.unparsed.push(tok); continue; }
      if (tok) result.unparsed.push(tok);
    }

    result.valid = !!(result.station && result.hour !== null);
    return result;
  }

  function toSigned(v) {
    if (!v) return null;
    return v.charAt(0) === 'M' ? -(+v.slice(1)) : +v;
  }

  function parseSM(token) {
    var t = String(token).replace(/\s+/g, ' ').trim();
    var prefix = '';
    var pm = /^([MP])/.exec(t);
    if (pm) { prefix = pm[1]; t = t.slice(1); }
    if (!/SM$/.test(t)) return null;
    t = t.replace(/SM$/, '').trim();

    var whole = 0, num = 0, den = 0, mm;
    if ((mm = /^(\d{1,3})\s(\d{1,2})\/(\d{1,2})$/.exec(t))) { whole = +mm[1]; num = +mm[2]; den = +mm[3]; }
    else if ((mm = /^(\d{1,2})\/(\d{1,2})$/.exec(t))) { num = +mm[1]; den = +mm[2]; }
    else if ((mm = /^(\d{1,3})$/.exec(t))) { whole = +mm[1]; }
    else return null;

    var text = (prefix === 'M' ? 'M' : '') +
      (whole ? String(whole) : '') + (whole && den ? ' ' : '') + (den ? num + '/' + den : '');
    return {
      unit: 'SM',
      whole: whole, numerator: num, denominator: den,
      value: whole + (den ? num / den : 0),
      less: prefix === 'M', more: prefix === 'P',
      text: text
    };
  }

  function parseWeather(token) {
    var m = RE.weather.exec(token);
    if (!m) return null;
    var phenomena = [];
    var rest = m[3] || '';
    for (var i = 0; i < rest.length; i += 2) phenomena.push(rest.substr(i, 2));
    return {
      raw: token,
      intensity: m[1] || '',
      descriptor: m[2] || '',
      phenomena: phenomena
    };
  }

  ATIS.metar = { parse: parse, parseWeather: parseWeather };
})(this);
