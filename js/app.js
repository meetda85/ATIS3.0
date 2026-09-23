/* ATIS 3.0 - Interfaz y control */
(function (global) {
  'use strict';
  var ATIS = global.ATIS;
  var S = ATIS.script, N = ATIS.num;
  var STORE_KEY = 'atis3.state';

  var el = {};
  var notams = [];
  var runwaysInUse = [];
  var lastMetar = '';
  var lastScripts = { es: null, en: null };
  var saveTimer = null, renderTimer = null;

  function $(id) { return document.getElementById(id); }
  function on(node, ev, fn) { if (node) node.addEventListener(ev, fn); }

  /* ================================================================== *
   * Arranque
   * ================================================================== */
  function init() {
    [
      'station', 'stationList', 'letterBig', 'letterWord', 'letterPrev', 'letterNext', 'utcClock',
      'metarRaw', 'btnDecode', 'btnFetch', 'btnSample', 'metarStatus', 'metarDecoded',
      'infoType', 'obsTime', 'approach', 'approachRunway', 'runwayChips', 'runwayCondition',
      'windMode', 'windDir', 'windSpeed', 'windGust', 'windVarFrom', 'windVarTo',
      'visValue', 'visUnit', 'visCause', 'visOrMore',
      'temperature', 'dewpoint', 'altimeter', 'includeHpa',
      'layers', 'btnAddLayer',
      'notamRaw', 'btnNotamAdd', 'btnNotamClear', 'notamStatus', 'notamList',
      'btnNotamFile', 'notamFile', 'btnNotamAll', 'btnNotamNone', 'btnNotamAtis',
      'btnNotamCopy', 'notamSoloVigentes',
      'additionalEs', 'additionalEn', 'includeNotams',
      'scriptEs', 'scriptEn', 'btnDownload', 'scriptStatus',
      'btnPlay', 'btnStop', 'playState', 'playDetail',
      'voiceEs', 'voiceEn', 'rate', 'gap', 'sentencePause', 'btnTestEs', 'btnTestEn',
      'voiceListEs', 'voiceListEn', 'voiceDiag', 'btnVoiceDiag', 'voiceDiagStatus',
      'voiceAlert', 'langEs', 'langEn',
      'logList', 'btnLogCopy', 'btnLogClear', 'logAuto', 'logStatus',
      'btnTema', 'temaTexto', 'rateVal',
      'tabAtis', 'tabAjustes', 'pageAtis', 'pageAjustes', 'temaOpciones', 'saltos',
      'libreActivo', 'libreEs', 'libreEn', 'cardLibre',
      'pavance', 'posicion', 'posTexto', 'btnPrev', 'btnNext', 'paireDatos',
      'preflight', 'preflightLista', 'btnIgual', 'btnCorregir', 'metarEdad'
    ].forEach(function (id) { el[id] = $(id); });

    fillStations();
    fillCauses();
    ensureLayerRows(3);
    bindEvents();
    restore();
    applyAirport(el.station.value, true);
    if (savedApproachRwy) selectIfPresent(el.approachRunway, savedApproachRwy);
    setLetter(el.letterBig.textContent || 'A');
    iniciarTema();
    iniciarPaginas();
    startClock();
    initVoices();
    renderLog();
    render();
  }

  function fillStations() {
    var html = '';
    Object.keys(ATIS.airports).forEach(function (code) {
      html += '<option value="' + code + '">' + ATIS.airports[code].es + '</option>';
    });
    el.stationList.innerHTML = html;
  }

  function fillCauses() {
    var html = '';
    Object.keys(S.VIS_CAUSES).forEach(function (k) {
      var label = S.VIS_CAUSES[k].es || '— sin causa —';
      html += '<option value="' + k + '">' + label + '</option>';
    });
    el.visCause.innerHTML = html;
  }

  /* ================================================================== *
   * Aerodromo, pistas y letra
   * ================================================================== */
  function applyAirport(code, keepFields) {
    var ap = ATIS.getAirport(code);
    var runways = ap ? ap.runways : [];

    el.approachRunway.innerHTML = '<option value="">— sin pista —</option>' +
      runways.map(function (r) { return '<option value="' + r + '">' + r + '</option>'; }).join('');

    el.runwayChips.innerHTML = runways.map(function (r) {
      return '<button type="button" class="chip" data-rwy="' + r + '">' + r + '</button>';
    }).join('') || '<span class="status">Estación sin pistas registradas; use Información adicional.</span>';
    paintChips();

  }

  function airportNames(code) {
    var ap = ATIS.getAirport(code);
    if (ap) return { es: ap.es, en: ap.en };
    var spelled = String(code || '').toUpperCase().split('').join(' ');
    return { es: 'Aeropuerto ' + spelled, en: 'Airport ' + spelled };
  }

  function paintChips() {
    Array.prototype.forEach.call(el.runwayChips.querySelectorAll('.chip'), function (c) {
      if (runwaysInUse.indexOf(c.dataset.rwy) >= 0) c.classList.add('on');
      else c.classList.remove('on');
    });
  }

  function setLetter(letter) {
    var info = N.letterInfo(letter);
    el.letterBig.textContent = info.letter;
    el.letterWord.textContent = info.word;
    scheduleRender();
  }

  function stepLetter(delta) {
    var info = N.letterInfo(el.letterBig.textContent);
    var next = (info.index + delta + 26) % 26;
    setLetter(String.fromCharCode(65 + next));
  }

  /* ================================================================== *
   * Capas de cielo
   * ================================================================== */
  function layerRow(amount, height) {
    var opts = '<option value="">— sin capa —</option>' +
      Object.keys(S.SKY_LABELS).map(function (k) {
        return '<option value="' + k + '"' + (k === amount ? ' selected' : '') + '>' + S.SKY_LABELS[k].es + '</option>';
      }).join('');
    var div = document.createElement('div');
    div.className = 'layer';
    div.innerHTML =
      '<label class="field"><span>Condición</span><select class="l-amount">' + opts + '</select></label>' +
      '<label class="field"><span>Altura (ft)</span><input class="l-height" inputmode="numeric" value="' +
        (height || '') + '" placeholder="2000"></label>' +
      '<button type="button" class="mini l-del" title="Quitar capa">&times;</button>';
    on(div.querySelector('.l-del'), 'click', function () { div.remove(); scheduleRender(); });
    on(div.querySelector('.l-amount'), 'change', scheduleRender);
    on(div.querySelector('.l-height'), 'input', scheduleRender);
    return div;
  }

  function ensureLayerRows(n) {
    while (el.layers.children.length < n) el.layers.appendChild(layerRow('', ''));
  }

  function setLayers(list) {
    el.layers.innerHTML = '';
    (list || []).forEach(function (l) { el.layers.appendChild(layerRow(l.amount, l.height)); });
    ensureLayerRows(3);
  }

  function readLayers() {
    return Array.prototype.map.call(el.layers.querySelectorAll('.layer'), function (row) {
      return {
        amount: row.querySelector('.l-amount').value,
        height: row.querySelector('.l-height').value.replace(/\D/g, '')
      };
    }).filter(function (l) { return l.amount; });
  }

  /* ================================================================== *
   * METAR
   * ================================================================== */
  function decodeMetar() {
    var raw = el.metarRaw.value.trim();
    if (!raw) { status(el.metarStatus, 'Pegue un METAR para decodificar.', 'err'); return; }
    var m = ATIS.metar.parse(raw);
    if (!m.valid) {
      status(el.metarStatus, 'METAR no reconocido: ' + (m.errors.join('; ') || 'formato inválido'), 'err');
      showDecoded(m);
      return;
    }

    if (m.station) {
      el.station.value = m.station;
      applyAirport(m.station, true);
    }

    var obs = S.fromMetar(m);
    el.obsTime.value = obs.time;
    el.windMode.value = obs.wind.mode;
    el.windDir.value = obs.wind.direction;
    el.windSpeed.value = obs.wind.speed;
    el.windGust.value = obs.wind.gust;
    el.windVarFrom.value = obs.wind.varFrom;
    el.windVarTo.value = obs.wind.varTo;
    el.visValue.value = obs.visibility.value;
    el.visUnit.value = obs.visibility.unit;
    el.visCause.value = obs.visibility.cause || '';
    el.visOrMore.checked = !!obs.visibility.orMore;
    el.temperature.value = obs.temperature;
    el.dewpoint.value = obs.dewpoint;
    el.altimeter.value = obs.altimeter;
    el.altimeter.dataset.unit = obs.altimeterUnit;
    el.altimeter.dataset.hpa = obs.qnhHpa || '';
    setLayers(obs.layers.filter(function (l) { return l.amount; }));

    var advanced = false;
    if (lastMetar && lastMetar !== m.raw) { stepLetter(1); advanced = true; }
    lastMetar = m.raw;

    showDecoded(m);
    status(el.metarStatus, 'METAR decodificado' +
      (advanced ? ' · letra avanzada a ' + N.letterInfo(el.letterBig.textContent).word : '') +
      (m.unparsed.length ? ' · grupos sin decodificar: ' + m.unparsed.join(' ') : ''), 'ok');
    render();
  }

  function showDecoded(m) {
    var tags = [];
    function tag(label, value, warn) {
      if (value === '' || value === null || value === undefined) return;
      tags.push('<span class="tag' + (warn ? ' warn' : '') + '"><b>' + label + '</b>' + value + '</span>');
    }
    tag('estación', m.station);
    if (m.hour !== null) tag('observación', 'día ' + m.day + ' ' + ('0' + m.hour).slice(-2) + ':' + ('0' + m.minute).slice(-2) + 'Z');
    if (m.auto) tag('tipo', 'automático');
    if (m.wind) {
      var dirTxt = m.wind.variable || m.wind.direction === null
        ? 'variable' : ('00' + m.wind.direction).slice(-3) + '°';
      var w = m.wind.calm ? 'en calma'
        : dirTxt + ' ' + m.wind.speed + ' kt' + (m.wind.gust ? ' rachas ' + m.wind.gust + ' kt' : '');
      tag('viento', w);
    }
    if (m.cavok) tag('cielo', 'CAVOK');
    if (m.visibility) {
      tag('visibilidad', m.visibility.unit === 'SM'
        ? m.visibility.text + ' SM'
        : (m.visibility.tenKmOrMore ? '10 km o más' : m.visibility.meters + ' m'));
    }
    m.weather.forEach(function (w) {
      tag('tiempo', describeWeather(w, 'es') + ' (' + w.raw + ')');
    });
    m.clouds.forEach(function (c) {
      var lab = ATIS.dict.CLOUD_AMOUNT[c.amount];
      tag('nubes', (lab ? lab.es : c.amount) + ' a ' + c.height + ' ft' +
        (c.type ? ' ' + ATIS.dict.CLOUD_TYPE[c.type].es : ''));
    });
    if (m.verticalVisibility !== null) tag('vis. vertical', m.verticalVisibility + ' ft');
    if (m.temperature !== null) tag('temperatura', m.temperature + ' °C');
    if (m.dewpoint !== null) tag('punto de rocío', m.dewpoint + ' °C');
    if (m.qnh) tag('altímetro', m.qnh.inHg.toFixed(2) + ' inHg / ' + m.qnh.hpa + ' hPa');
    m.rvr.forEach(function (r) { tag('RVR', r.runway + ' ' + r.value + ' ' + r.unit); });
    if (m.windshear.length) tag('cizalladura', m.windshear.join(', '), true);
    if (m.trend) tag('tendencia', m.trend);
    if (m.remarks) tag('comentarios', m.remarks);
    if (m.unparsed.length) tag('sin decodificar', m.unparsed.join(' '), true);
    el.metarDecoded.innerHTML = tags.join('');
  }

  function describeWeather(w, lang) {
    var D = ATIS.dict, parts = [];
    if (w.intensity && D.INTENSITY[w.intensity]) parts.push(D.INTENSITY[w.intensity][lang]);
    if (w.descriptor && D.DESCRIPTOR[w.descriptor]) parts.push(D.DESCRIPTOR[w.descriptor][lang]);
    w.phenomena.forEach(function (p) { if (D.PHENOMENON[p]) parts.push(D.PHENOMENON[p][lang]); });
    return parts.join(' ');
  }

  function fetchMetar() {
    var code = (el.station.value || '').toUpperCase().trim();
    if (!/^[A-Z]{4}$/.test(code)) { status(el.metarStatus, 'Indique un código OACI de 4 letras.', 'err'); return; }
    status(el.metarStatus, 'Consultando METAR de ' + code + '…');
    var url = 'https://aviationweather.gov/api/data/metar?ids=' + code + '&format=raw&hours=2';
    fetch(url, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (txt) {
        var line = String(txt).trim().split('\n')[0];
        if (!line) throw new Error('sin datos');
        el.metarRaw.value = line.trim();
        decodeMetar();
      })
      .catch(function (e) {
        status(el.metarStatus, 'No fue posible obtener el METAR (' + e.message + '). Péguelo manualmente.', 'err');
      });
  }

  /* ================================================================== *
   * NOTAM
   * ================================================================== */
  function addNotam() {
    var raw = el.notamRaw.value.trim();
    if (!raw) { status(el.notamStatus, 'Pegue uno o varios NOTAM, o cargue el archivo del FNS.', 'err'); return; }
    var datos = ATIS.fns.fromText(raw);
    var n = agregarRegistros(datos.records);
    el.notamRaw.value = '';
    status(el.notamStatus, n.total + ' NOTAM agregado(s), ' + n.marcados + ' marcado(s) para transmitir' +
      (n.repetidos ? ', ' + n.repetidos + ' repetido(s) omitido(s)' : '') + '.', 'ok');
    renderNotams(); render();
  }

  /* Alta de registros provenientes del texto pegado o del archivo del FNS */
  function agregarRegistros(records) {
    var marcados = 0, repetidos = 0;
    var existentes = {};
    notams.forEach(function (n) { if (n.meta && n.meta.id) existentes[n.meta.id] = 1; });

    (records || []).forEach(function (reg) {
      var idReg = reg.id || (/\b([A-Z]\d{4}\/\d{2})\b/.exec(reg.raw) || [])[1] || '';
      if (idReg && existentes[idReg]) { repetidos++; return; }
      if (idReg) existentes[idReg] = 1;
      var es = ATIS.notam.parse(reg.raw, 'es');
      var en = ATIS.notam.parse(reg.raw, 'en');
      var codigoQ = es.q ? es.q.code : '';
      var propio = !reg.location || !el.station.value ||
        reg.location.toUpperCase() === el.station.value.toUpperCase();
      var incluir = propio && ATIS.fns.esMateriaAtis(codigoQ);
      if (incluir) marcados++;
      notams.push({
        raw: reg.raw, es: es, en: en, include: incluir, expanded: false,
        meta: {
          id: reg.id || es.id || '',
          location: reg.location || es.location || '',
          desde: reg.desde || null,
          hasta: reg.hasta || null,
          codigoQ: codigoQ,
          propio: propio
        }
      });
    });
    return { total: (records || []).length - repetidos, marcados: marcados, repetidos: repetidos };
  }

  /* Carga del archivo descargado del FNS (.xls, .xlsx, .csv o .txt) */
  function importarArchivo(file) {
    if (!file) return;
    var esTexto = /\.(txt)$/i.test(file.name);
    var lector = new FileReader();
    status(el.notamStatus, 'Leyendo ' + file.name + ' …');

    lector.onerror = function () { status(el.notamStatus, 'No se pudo leer el archivo.', 'err'); };
    lector.onload = function (e) {
      var datos;
      try {
        if (esTexto) {
          datos = ATIS.fns.fromText(String(e.target.result));
        } else {
          if (typeof global.XLSX === 'undefined') {
            status(el.notamStatus, 'Falta la librería de hojas de cálculo (js/vendor/xlsx.full.min.js).', 'err');
            return;
          }
          var libro = global.XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          var hoja = libro.Sheets[libro.SheetNames[0]];
          var filas = global.XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' });
          datos = ATIS.fns.fromMatrix(filas);
        }
      } catch (err) {
        status(el.notamStatus, 'El archivo no se pudo interpretar: ' + err.message, 'err');
        return;
      }

      if (datos.errors && datos.errors.length) {
        status(el.notamStatus, datos.errors.join(' '), 'err');
        return;
      }

      var n = agregarRegistros(datos.records);
      var aviso = '';
      if (datos.station && el.station.value &&
          datos.station.toUpperCase() !== el.station.value.toUpperCase()) {
        aviso = ' · ATENCIÓN: el archivo es de ' + datos.station +
          ' y la estación configurada es ' + el.station.value.toUpperCase();
      }
      var vencidos = notams.filter(function (x) {
        return ATIS.fns.vigencia(x.meta, new Date()) !== 'vigente';
      }).length;
      status(el.notamStatus, n.total + ' NOTAM leídos de ' + file.name + ' · ' +
        n.marcados + ' marcados para transmitir' +
        (n.repetidos ? ' · ' + n.repetidos + ' ya estaban en la lista' : '') +
        (vencidos ? ' · ' + vencidos + ' fuera de vigencia' : '') + aviso, aviso ? 'err' : 'ok');
      renderNotams(); render();
    };

    if (esTexto) lector.readAsText(file);
    else lector.readAsArrayBuffer(file);
  }

  function marcarNotams(modo) {
    notams.forEach(function (n) {
      if (modo === 'todos') n.include = true;
      else if (modo === 'ninguno') n.include = false;
      else n.include = n.meta.propio !== false && ATIS.fns.esMateriaAtis(n.meta.codigoQ);
    });
    renderNotams(); render();
  }

  function fechaCorta(d) {
    if (!d) return '';
    var dd = ('0' + d.getUTCDate()).slice(-2), mm = ('0' + (d.getUTCMonth() + 1)).slice(-2);
    return dd + '/' + mm + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
  }

  function renderNotams() {
    if (!notams.length) {
      el.notamList.innerHTML = '<span class="status">Sin NOTAM cargados.</span>';
      return;
    }
    var ahora = new Date();
    var soloVigentes = el.notamSoloVigentes.checked;
    var ocultos = 0, marcados = 0;

    var html = notams.map(function (n, i) {
      var estado = ATIS.fns.vigencia(n.meta, ahora);
      if (n.include) marcados++;
      if (soloVigentes && estado !== 'vigente' && !n.include) { ocultos++; return ''; }

      var condicion = (n.es.plain || n.raw).replace(/\s+/g, ' ');
      var badge = estado === 'expirado' ? '<span class="badge exp">vencido</span>'
        : estado === 'futuro' ? '<span class="badge fut">futuro</span>' : '';
      var ajeno = n.meta.propio === false
        ? '<span class="badge fut">' + escapeHtml(n.meta.location) + '</span>' : '';

      var fila = '<div class="notamrow ' + (n.include ? 'on' : 'off') + '">' +
        '<input type="checkbox" class="n-inc" data-n="' + i + '"' + (n.include ? ' checked' : '') +
          ' title="transmitir">' +
        '<span class="nid">' + escapeHtml(n.meta.id || ('#' + (i + 1))) + '</span>' +
        '<span class="ncond" title="' + escapeHtml(condicion) + '">' + escapeHtml(condicion) + '</span>' +
        '<span class="nwhen">' + badge + ajeno + ' ' +
          escapeHtml(fechaCorta(n.meta.desde)) + (n.meta.hasta ? ' → ' + escapeHtml(fechaCorta(n.meta.hasta)) : '') +
        '</span>' +
        '<button class="nmore" data-more="' + i + '">' + (n.expanded ? 'ocultar' : 'ver') + '</button>' +
      '</div>';

      if (n.expanded) {
        fila += '<div class="notamdetail">' +
          '<div>' + escapeHtml(n.es.summary || n.es.plain) + '</div>' +
          '<div class="en">' + escapeHtml(n.en.summary || n.en.plain) + '</div>' +
          '<div class="raw">' + escapeHtml(n.raw) + '</div>' +
          '<button class="mini n-del" data-n="' + i + '">quitar de la lista</button>' +
        '</div>';
      }
      return fila;
    }).join('');

    el.notamList.innerHTML =
      '<div class="notamcount">' + notams.length + ' cargados · ' + marcados + ' al aire' +
      (ocultos ? ' · ' + ocultos + ' ocultos por vigencia' : '') + '</div>' + html;
  }

  /* Al aire va solo la condición, nunca el número ni las fechas */
  function notamLines(lang) {
    if (!el.includeNotams.checked) return [];
    return notams.filter(function (n) { return n.include; })
      .map(function (n) { return n[lang].plain; })
      .filter(Boolean);
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ================================================================== *
   * Generacion del guion
   * ================================================================== */
  function readModel() {
    var code = (el.station.value || '').toUpperCase().trim();
    var names = airportNames(code);
    var obs = {
      station: code,
      time: el.obsTime.value.replace(/\D/g, ''),
      wind: {
        mode: el.windMode.value,
        direction: el.windDir.value.replace(/\D/g, ''),
        speed: el.windSpeed.value.replace(/\D/g, ''),
        gust: el.windGust.value.replace(/\D/g, ''),
        varFrom: el.windVarFrom.value.replace(/\D/g, ''),
        varTo: el.windVarTo.value.replace(/\D/g, ''),
        unit: 'KT'
      },
      visibility: {
        value: el.visValue.value.trim(),
        unit: el.visUnit.value,
        orMore: el.visOrMore.checked,
        cause: el.visCause.value
      },
      rvr: [],
      layers: readLayers(),
      temperature: el.temperature.value.trim(),
      dewpoint: el.dewpoint.value.trim(),
      altimeter: el.altimeter.value.replace(/\D/g, ''),
      altimeterUnit: el.altimeter.dataset.unit || 'inHg',
      qnhHpa: el.altimeter.dataset.hpa || '',
      windshear: ''
    };
    var cfg = {
      station: code,
      airportNameEs: names.es,
      airportNameEn: names.en,
      letter: el.letterBig.textContent,
      infoType: el.infoType.value,
      approach: el.approach.value,
      approachRunway: el.approachRunway.value,
      runwaysInUse: runwaysInUse.slice(),
      runwayCondition: el.runwayCondition.value,
      includeHpa: el.includeHpa.checked,
      additionalEs: el.additionalEs.value,
      additionalEn: el.additionalEn.value
    };
    return { obs: obs, cfg: cfg };
  }

  function render() {
    var m = readModel();
    var cfgEs = Object.create(m.cfg); cfgEs.notamLines = notamLines('es');
    var cfgEn = Object.create(m.cfg); cfgEn.notamLines = notamLines('en');
    lastScripts.es = S.build('es', m.obs, cfgEs);
    lastScripts.en = S.build('en', m.obs, cfgEn);
    el.scriptEs.textContent = lastScripts.es.text;
    el.scriptEn.textContent = lastScripts.en.text;
    var words = lastScripts.es.text.split(/\s+/).length + lastScripts.en.text.split(/\s+/).length;
    status(el.scriptStatus, 'Guion listo · ' + words + ' palabras · duración aproximada ' +
      estimateDuration(words) + ' por ciclo');
    if (ATIS.speech.state.playing) {
      el.playDetail.textContent = 'El guion cambió: pulse TRANSMITIR para reiniciar el bucle con la información nueva.';
    }
    pintarEdadMetar();
    pintarResumen();
    pintarVerificacion();
    el.cardLibre.classList.toggle('libre-on', el.libreActivo.checked);
    save();
  }

  function estimateDuration(words) {
    var secs = Math.round(words / 2.2);   /* ~2.2 palabras por segundo a velocidad ATIS */
    var m = Math.floor(secs / 60), s = secs % 60;
    return (m ? m + ' min ' : '') + s + ' s';
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 180);
  }

  /* ================================================================== *
   * Verificación previa a transmitir
   * Un ATIS incompleto al aire es un error operativo; más vale detenerlo aquí.
   * ================================================================== */
  function minutosDelMetar() {
    var hhmm = el.obsTime.value.replace(/\D/g, '');
    if (hhmm.length !== 4) return null;
    var ahora = new Date();
    var obs = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(),
      +hhmm.slice(0, 2), +hhmm.slice(2)));
    var min = Math.round((ahora - obs) / 60000);
    if (min < -60) min += 24 * 60;      /* la observación es del día anterior */
    return min;
  }

  function verificar() {
    var avisos = [];
    function err(t) { avisos.push({ nivel: 'error', texto: t }); }
    function adv(t) { avisos.push({ nivel: 'aviso', texto: t }); }

    if (!el.langEs.checked && !el.langEn.checked) err('No hay ningún idioma marcado para transmitir.');
    if (el.langEs.checked && !ATIS.speech.rankedVoices('es').length) err('El español está marcado pero el equipo no tiene voz en español.');
    if (el.langEn.checked && !ATIS.speech.rankedVoices('en').length) err('El inglés está marcado pero el equipo no tiene voz en inglés.');

    if (el.libreActivo.checked) {
      var hayEs = el.langEs.checked && el.libreEs.value.trim();
      var hayEn = el.langEn.checked && el.libreEn.value.trim();
      if (!hayEs && !hayEn) err('El modo de texto libre está activado y el texto está vacío.');
      else adv('Modo de texto libre activo: se transmitirá ese texto, no el ATIS.');
      return avisos;
    }

    if (!runwaysInUse.length) adv('No hay pista en uso marcada: el mensaje no la va a anunciar.');
    if (!el.obsTime.value.replace(/\D/g, '')) adv('Falta la hora de la observación.');
    if (el.windMode.value !== 'calm' && !el.windSpeed.value.replace(/\D/g, '')) adv('Falta el viento.');
    if (!el.altimeter.value.replace(/\D/g, '')) adv('Falta el altímetro.');
    if (!el.visValue.value.trim()) adv('Falta la visibilidad.');

    var edad = minutosDelMetar();
    if (edad !== null && edad >= 60) adv('La observación tiene ' + edad + ' minutos: conviene actualizar el METAR.');

    var vencidos = notams.filter(function (n) {
      return n.include && ATIS.fns.vigencia(n.meta, new Date()) !== 'vigente';
    }).length;
    if (vencidos) adv(vencidos + ' NOTAM marcado(s) para transmitir están fuera de vigencia.');

    return avisos;
  }

  function pintarVerificacion() {
    var avisos = verificar();
    var graves = avisos.filter(function (a) { return a.nivel === 'error'; });
    if (!avisos.length) {
      el.preflight.hidden = true;
    } else {
      el.preflight.hidden = false;
      el.preflight.className = 'preflight' + (graves.length ? ' grave' : '');
      el.preflightLista.innerHTML = avisos.map(function (a) {
        return '<li class="' + a.nivel + '">' + escapeHtml(a.texto) + '</li>';
      }).join('');
    }
    return { avisos: avisos, graves: graves };
  }

  /* La edad de la observación, siempre a la vista */
  function pintarEdadMetar() {
    var edad = minutosDelMetar();
    if (edad === null) { el.metarEdad.textContent = ''; el.metarEdad.className = 'edad'; return; }
    var texto = edad < 1 ? 'recién observado'
      : edad < 60 ? 'hace ' + edad + ' min'
      : 'hace ' + Math.floor(edad / 60) + ' h ' + (edad % 60) + ' min';
    el.metarEdad.textContent = 'Observación ' + texto;
    el.metarEdad.className = 'edad' + (edad >= 60 ? ' vencida' : (edad >= 30 ? ' vieja' : ''));
  }

  /* Resumen de lo esencial, sin importar dónde esté uno en la página */
  function pintarResumen() {
    var m = readModel();
    var info = N.letterInfo(el.letterBig.textContent);
    var datos = [];
    function dato(clave, valor, clase) {
      if (!valor) return;
      datos.push('<div class="dato ' + (clase || '') + '"><span class="dv">' +
        escapeHtml(valor) + '</span><span class="dk">' + escapeHtml(clave) + '</span></div>');
    }
    dato('info', info.letter, 'letra');
    dato('pista', runwaysInUse.length ? runwaysInUse.join(' · ') : '—', runwaysInUse.length ? '' : 'alerta');
    var w = m.obs.wind;
    dato('viento', w.mode === 'calm' ? 'calma'
      : (w.direction ? w.direction + '/' : 'VRB ') + (w.speed || '—') + (w.gust ? 'G' + w.gust : ''));
    dato('visib', m.obs.visibility.value ? m.obs.visibility.value + ' ' + m.obs.visibility.unit.toLowerCase() : '');
    dato('altim', m.obs.altimeter || '');
    var edad = minutosDelMetar();
    if (edad !== null) dato('obs', (m.obs.time || '----') + 'Z', edad >= 60 ? 'alerta' : '');
    el.paireDatos.innerHTML = datos.join('') || '<span class="vacio">sin datos</span>';
  }

  /* ================================================================== *
   * Reproduccion
   * ================================================================== */
  function play(forzar) {
    forzar = forzar === true;
    if (!ATIS.speech.supported) {
      status(el.scriptStatus, 'Este navegador no soporta síntesis de voz. Use Chrome o Edge.', 'err');
      return;
    }
    render();

    /* Nada sale al aire sin pasar la verificación. Un ATIS completo no genera
       ningún aviso, así que esto no estorba en la operación normal. */
    var chequeo = pintarVerificacion();
    if (chequeo.avisos.length && !forzar) {
      el.btnIgual.hidden = chequeo.graves.length > 0;   /* un error no se puede forzar */
      status(el.scriptStatus, chequeo.graves.length
        ? 'Hay que corregir lo marcado en rojo antes de transmitir.'
        : 'Revise lo que falta, o pulse «Transmitir de todos modos».', 'err');
      return;
    }

    var libre = el.libreActivo.checked;
    var secuencia = [];
    if (el.langEs.checked) {
      var textoEs = libre ? S.paraLocutar(el.libreEs.value.trim(), 'es') : lastScripts.es.speech;
      if (textoEs) secuencia.push({ lang: 'es', text: textoEs });
    }
    if (el.langEn.checked) {
      var textoEn = libre ? S.paraLocutar(el.libreEn.value.trim(), 'en') : lastScripts.en.speech;
      if (textoEn) secuencia.push({ lang: 'en', text: textoEn });
    }
    if (!secuencia.length) {
      status(el.scriptStatus, 'No hay nada que transmitir. ' +
        'Si las casillas de idioma están deshabilitadas, falta instalar la voz: vea Ajustes, Voces del sistema.', 'err');
      return;
    }
    var ok = ATIS.speech.play(
      secuencia,
      {
        loop: true,
        gap: +el.gap.value || 0,
        cycleGap: (+el.gap.value || 0) + 2,
        voices: { es: el.voiceEs.value, en: el.voiceEn.value },
        rate: { es: +el.rate.value, en: +el.rate.value },
        sentencePause: +el.sentencePause.value || 0
      }
    );
    if (!ok) { status(el.scriptStatus, 'No hay nada que transmitir.', 'err'); return; }
    el.btnPlay.disabled = true;
    el.btnStop.disabled = false;
    el.pavance.hidden = false;
    el.preflight.hidden = true;
    document.querySelector('.brand .dot').classList.add('live');
    prepararAvance();
  }

  /* ---- Barra de posición dentro del ciclo ---- */
  var arrastrando = false;

  function prepararAvance() {
    var fr = ATIS.speech.fragmentos().filter(function (f) { return !f.pausa; });
    el.posicion.max = String(Math.max(0, ATIS.speech.fragmentos().length - 1));
    el.posicion.value = '0';
    el.posTexto.textContent = fr.length + ' fragmentos';
  }

  function pintarAvance(st) {
    if (arrastrando) return;
    var total = st.total || 1;
    el.posicion.max = String(Math.max(0, total - 1));
    el.posicion.value = String(Math.max(0, st.chunk - 1));
    el.posTexto.textContent = st.chunk + ' / ' + total;
  }

  function stop() {
    ATIS.speech.stop();
    el.btnPlay.disabled = false;
    el.btnStop.disabled = true;
    el.pavance.hidden = true;
    document.querySelector('.brand .dot').classList.remove('live');
    el.playState.textContent = 'Detenido';
    el.playState.classList.remove('live');
    updateVoiceReport();
  }

  function initVoices() {
    ATIS.speech.onVoicesReady(function () {
      fillVoiceSelect(el.voiceEs, 'es');
      fillVoiceSelect(el.voiceEn, 'en');
      restoreVoices();
      updateVoiceReport();
    });
    ATIS.speech.onLog(pintarEvento);
    ATIS.speech.onState(function (st) {
      if (!st.playing) return;
      el.playState.textContent = 'TRANSMITIENDO · ' + (st.lang === 'es' ? 'ESPAÑOL' : 'INGLÉS');
      el.playState.classList.add('live');
      var detalle = 'Ciclo ' + st.cycle + ' · fragmento ' + st.chunk + ' de ' + st.total +
        ' · información ' + N.letterInfo(el.letterBig.textContent).word;
      if (st.respaldo) detalle += ' · voz de respaldo: ' + st.respaldo;
      if (st.aviso) detalle += ' · ' + st.aviso;
      el.playDetail.textContent = detalle;
      el.playDetail.classList.toggle('warn', !!(st.aviso || st.respaldo));
      pintarAvance(st);
    });
  }

  function fillVoiceSelect(select, lang) {
    var list = ATIS.speech.rankedVoices(lang);
    if (!list.length) {
      select.innerHTML = '<option value="">(sin voces ' + lang + ')</option>';
      status(el.scriptStatus, 'El sistema no tiene voces instaladas en ' +
        (lang === 'es' ? 'español' : 'inglés') + '. Vea Ajustes, Voces del sistema.', 'err');
      return;
    }
    /* Ya vienen de mejor a peor calidad: la primera queda seleccionada */
    select.innerHTML = list.map(function (v) {
      return '<option value="' + v.name + '">' + (v.natural ? '★ ' : '') + v.name + ' (' + v.lang + ')</option>';
    }).join('');
    select.selectedIndex = 0;
  }

  /* Qué voces tiene la computadora. Cada una se puede escuchar. */
  function renderVoiceList(node, lang, selectedName) {
    var list = ATIS.speech.rankedVoices(lang);
    if (!list.length) {
      node.innerHTML = '<span class="status err">No hay ninguna voz en ' +
        (lang === 'es' ? 'español' : 'inglés') + ' instalada en este equipo.</span>';
      return;
    }
    node.innerHTML = list.map(function (v) {
      return '<div class="voiceitem' + (v.natural ? ' natural' : '') +
        (v.name === selectedName ? ' inuse' : '') + '" data-voz="' + escapeHtml(v.name) +
        '" data-lang="' + lang + '" title="Clic para escucharla y seleccionarla">' +
        '<span class="vplay">&#9654;</span>' +
        '<span>' + (v.natural ? '★' : '·') + '</span>' +
        '<span class="vname">' + escapeHtml(v.name) + '</span>' +
        '<span class="vlang">' + escapeHtml(v.lang) + '</span></div>';
    }).join('');
  }

  /* Qué hacer, según lo que falte en este equipo */
  function renderVoiceAlert(d) {
    var faltaEs = d.es.length === 0, faltaEn = d.en.length === 0;
    var naturalEs = d.es.some(function (v) { return v.natural; });
    var naturalEn = d.en.some(function (v) { return v.natural; });
    var html = '';

    if (faltaEs || faltaEn) {
      html += '<div class="alert grave"><h4>Falta la voz en ' +
        (faltaEs && faltaEn ? 'español y en inglés' : (faltaEs ? 'español' : 'inglés')) + '</h4>' +
        'Sin esa voz, el programa no puede locutar esa parte del ATIS, por eso quedó ' +
        'desmarcada en <b>Transmitir</b>. Dos maneras de resolverlo:' +
        '<ol>' +
        '<li><b>La inmediata:</b> abrir este mismo programa en <b>Microsoft Edge</b> (ya viene en Windows). ' +
        'Edge trae voces en línea en los dos idiomas sin instalar nada.</li>' +
        '<li><b>La definitiva, para trabajar sin internet:</b> instalar el idioma que falta en Windows — ' +
        '<i>Configuración &rarr; Hora e idioma &rarr; Idioma y región &rarr; Agregar idioma</i>, elegir ' +
        (faltaEn ? '<b>Inglés (Estados Unidos)</b>' : '<b>Español (México)</b>') +
        ' y dejar marcada la casilla <b>Voz</b> (texto a voz). Al terminar, reiniciar el navegador.</li>' +
        '</ol></div>';
    }

    if (!d.esEdge && !(naturalEs && naturalEn)) {
      html += '<div class="alert"><h4>Se puede oír mucho mejor</h4>' +
        'Este equipo solo tiene las voces antiguas de Windows, que suenan metálicas. ' +
        'Abriendo el programa en <b>Microsoft Edge</b> aparecen las voces naturales ' +
        '<i>Dalia</i> y <i>Jorge</i> en español y <i>Aria</i>, <i>Guy</i> o <i>Jenny</i> en inglés, ' +
        'sin instalar ni pagar nada (necesitan conexión, y aquí sí la hay). ' +
        'Si el ATIS está instalado con <code>INSTALAR.bat</code>, el acceso directo del Escritorio ' +
        'ya abre en Edge: úselo en lugar de abrir el archivo a mano.</div>';
    }
    el.voiceAlert.innerHTML = html;
  }

  /* Encabezado de Voces del sistema: navegador, conexión y qué implica */
  function renderVoiceDiag() {
    var d = ATIS.speech.diagnostico();
    renderVoiceAlert(d);
    ajustarIdiomas(d);
    var naturalesEs = d.es.filter(function (v) { return v.natural; }).length;
    var naturalesEn = d.en.filter(function (v) { return v.natural; }).length;
    var tags = [];
    function tag(label, valor, clase) {
      tags.push('<span class="tag' + (clase ? ' ' + clase : '') + '"><b>' + label + '</b>' +
        escapeHtml(valor) + '</span>');
    }
    tag('navegador', d.navegador, d.esEdge ? '' : 'warn');
    tag('sistema', d.sistema);
    tag('conexión', d.enLinea ? 'sí' : 'no', d.enLinea ? '' : 'warn');
    tag('voces español', d.es.length + ' (' + naturalesEs + ' naturales)', naturalesEs ? '' : 'warn');
    tag('voces inglés', d.en.length + ' (' + naturalesEn + ' naturales)', naturalesEn ? '' : 'warn');
    if (!d.esEdge && !(naturalesEs && naturalesEn)) {
      tags.push('<span class="tag warn"><b>sugerencia</b>abra este programa en Microsoft Edge: ' +
        'trae voces naturales sin instalar nada</span>');
    }
    el.voiceDiag.innerHTML = tags.join('');
  }

  /* Un idioma sin voz no se puede transmitir: se desmarca y se deja a la vista */
  function ajustarIdiomas(d) {
    [['es', el.langEs, d.es.length], ['en', el.langEn, d.en.length]].forEach(function (par) {
      var chk = par[1], hay = par[2] > 0;
      chk.disabled = !hay;
      if (!hay) chk.checked = false;
      var etiqueta = chk.parentNode;
      if (etiqueta && etiqueta.classList) etiqueta.classList.toggle('sinvoz', !hay);
      chk.title = hay ? 'Incluir este idioma en la transmisión'
        : 'No hay ninguna voz de este idioma instalada en el equipo';
    });
  }

  /* Texto para pegar en un correo o mensaje cuando haga falta apoyo */
  function textoDiagnostico() {
    var d = ATIS.speech.diagnostico();
    function listar(list) {
      return list.length
        ? list.map(function (v) { return '  ' + (v.natural ? '[natural] ' : '          ') + v.name + '  (' + v.lang + ')'; }).join('\n')
        : '  (ninguna)';
    }
    return 'ATIS 3.0 - diagnóstico de voces\n' +
      'Navegador : ' + d.navegador + '\n' +
      'Sistema   : ' + d.sistema + '\n' +
      'Conexión  : ' + (d.enLinea ? 'sí' : 'no') + '\n' +
      'Voces en español (' + d.es.length + '):\n' + listar(d.es) + '\n' +
      'Voces en inglés (' + d.en.length + '):\n' + listar(d.en) + '\n';
  }

  function updateVoiceReport() {
    renderVoiceDiag();
    renderVoiceList(el.voiceListEs, 'es', el.voiceEs.value);
    renderVoiceList(el.voiceListEn, 'en', el.voiceEn.value);
    var esNat = /^★/.test(el.voiceEs.options[el.voiceEs.selectedIndex] ? el.voiceEs.options[el.voiceEs.selectedIndex].text : '');
    var enNat = /^★/.test(el.voiceEn.options[el.voiceEn.selectedIndex] ? el.voiceEn.options[el.voiceEn.selectedIndex].text : '');
    if (!ATIS.speech.state.playing) {
      var activos = [];
      if (el.langEs.checked) activos.push('español');
      if (el.langEn.checked) activos.push('inglés');
      var bucle = activos.length ? 'bucle: ' + activos.join(' → ') : 'sin idiomas marcados';
      if (!el.langEs.checked || !el.langEn.checked) {
        el.playDetail.textContent = 'Se transmitirá en ' + bucle +
          (el.langEs.disabled || el.langEn.disabled ? ' · falta instalar una voz, vea Ajustes' : '');
        el.playDetail.classList.add('warn');
      } else if (esNat && enNat) {
        el.playDetail.textContent = 'Voces naturales seleccionadas. Listo para transmitir en ' + bucle;
        el.playDetail.classList.remove('warn');
      } else {
        el.playDetail.textContent = 'Voz robótica: no hay voz natural en ' +
          (!esNat && !enNat ? 'español ni inglés' : (!esNat ? 'español' : 'inglés')) +
          '. Vea Ajustes, Voces del sistema.';
        el.playDetail.classList.add('warn');
      }
    }
  }

  /* ================================================================== *
   * Modo claro / oscuro
   * El modo elegido se conserva entre sesiones; si nunca se ha elegido, se
   * sigue el del sistema operativo.
   * ================================================================== */
  var TEMA_KEY = 'atis3.tema';

  function temaDelSistema() {
    return (global.matchMedia && global.matchMedia('(prefers-color-scheme: light)').matches)
      ? 'light' : 'dark';
  }

  /* Lo elegido: 'system', 'light' u 'oscuro'. Sin nada guardado, manda el sistema. */
  function modoGuardado() {
    var v = null;
    try { v = localStorage.getItem(TEMA_KEY); } catch (e) { /* ignorado */ }
    return (v === 'light' || v === 'dark') ? v : 'system';
  }

  /* El que se está viendo ahora mismo */
  function temaActual() {
    var puesto = document.documentElement.getAttribute('data-theme');
    return (puesto === 'light' || puesto === 'dark') ? puesto : temaDelSistema();
  }

  function aplicarModo(modo, guardar) {
    if (modo === 'system') {
      document.documentElement.removeAttribute('data-theme');
      if (guardar) { try { localStorage.removeItem(TEMA_KEY); } catch (e) { /* ignorado */ } }
    } else {
      document.documentElement.setAttribute('data-theme', modo);
      if (guardar) { try { localStorage.setItem(TEMA_KEY, modo); } catch (e) { /* ignorado */ } }
    }
    sincronizarTema();
  }

  function sincronizarTema() {
    var visible = temaActual();
    var modo = modoGuardado();
    el.temaTexto.textContent = visible === 'dark' ? 'Oscuro' : 'Claro';
    el.btnTema.setAttribute('title', visible === 'dark'
      ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    Array.prototype.forEach.call(el.temaOpciones.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.dataset.tema === modo);
    });
  }

  function iniciarTema() {
    aplicarModo(modoGuardado(), false);

    /* Mientras no se elija a mano, la aplicación sigue al sistema */
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-color-scheme: light)');
      var alCambiar = function () { if (modoGuardado() === 'system') sincronizarTema(); };
      if (mq.addEventListener) mq.addEventListener('change', alCambiar);
      else if (mq.addListener) mq.addListener(alCambiar);
    }
  }

  /* ================================================================== *
   * Pestañas
   * ================================================================== */
  var PAGINA_KEY = 'atis3.pagina';

  function mostrarPagina(cual) {
    var esAjustes = cual === 'pageAjustes';
    el.pageAtis.hidden = esAjustes;
    el.pageAjustes.hidden = !esAjustes;
    el.tabAtis.classList.toggle('on', !esAjustes);
    el.tabAjustes.classList.toggle('on', esAjustes);
    el.saltos.hidden = esAjustes;
    el.tabAtis.setAttribute('aria-selected', String(!esAjustes));
    el.tabAjustes.setAttribute('aria-selected', String(esAjustes));
    try { localStorage.setItem(PAGINA_KEY, cual); } catch (e) { /* ignorado */ }
    global.scrollTo(0, 0);
  }

  function iniciarPaginas() {
    var guardada = null;
    try { guardada = localStorage.getItem(PAGINA_KEY); } catch (e) { /* ignorado */ }
    mostrarPagina(guardada === 'pageAjustes' ? 'pageAjustes' : 'pageAtis');
  }

  /* ================================================================== *
   * Registro de la transmisión
   * ================================================================== */
  var CLASE_EVENTO = {
    error: 'mal', omitido: 'mal', vigilancia: 'mal',
    reintento: 'aviso', espera: 'aviso', saltado: 'aviso', reanudada: 'aviso',
    fin: 'bien', hablando: 'bien'
  };

  function horaEvento(t) {
    var d = new Date(t);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' +
      ('0' + d.getSeconds()).slice(-2) + '.' + ('00' + d.getMilliseconds()).slice(-3);
  }

  function descripcionEvento(e) {
    var partes = [];
    if (e.lang) partes.push(e.lang === 'es' ? 'ES' : 'EN');
    if (e.n) partes.push('frag ' + e.n + (e.de ? '/' + e.de : ''));
    if (e.intento && e.intento > 1) partes.push('intento ' + e.intento);
    if (e.voz) partes.push(e.voz);
    if (e.largo) partes.push(e.largo + ' car');
    if (e.ms) partes.push(e.ms + ' ms');
    if (e.motivo) partes.push('motivo: ' + e.motivo);
    if (e.detalle) partes.push(e.detalle);
    if (e.texto) partes.push('«' + String(e.texto).slice(0, 60) + (String(e.texto).length > 60 ? '…' : '') + '»');
    return partes.join(' · ');
  }

  function pintarEvento(e) {
    var fila = document.createElement('div');
    fila.className = 'logrow ' + (CLASE_EVENTO[e.tipo] || '');
    fila.innerHTML = '<span class="lt">' + horaEvento(e.t) + '</span>' +
      '<span class="ltipo">' + escapeHtml(e.tipo) + '</span>' +
      '<span class="ldet">' + escapeHtml(descripcionEvento(e)) + '</span>';
    el.logList.appendChild(fila);
    while (el.logList.children.length > 200) el.logList.removeChild(el.logList.firstChild);
    if (el.logAuto.checked) el.logList.scrollTop = el.logList.scrollHeight;
  }

  function renderLog() {
    var eventos = ATIS.speech.registro();
    el.logList.innerHTML = '';
    if (!eventos.length) {
      el.logList.innerHTML = '<span class="logvacio">Sin eventos todavía. Pulse TRANSMITIR.</span>';
      return;
    }
    eventos.forEach(pintarEvento);
  }

  function textoRegistro() {
    var eventos = ATIS.speech.registro();
    var cab = 'ATIS 3.0 - registro de la transmisión\n' +
      new Date().toISOString() + '\n' +
      ATIS.speech.diagnostico().navegador + '\n\n';
    return cab + eventos.map(function (e) {
      return horaEvento(e.t) + '  ' + e.tipo + '  ' + descripcionEvento(e);
    }).join('\n') + '\n';
  }

  /* ================================================================== *
   * Persistencia
   * ================================================================== */
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var m = readModel();
        localStorage.setItem(STORE_KEY, JSON.stringify({
          metar: el.metarRaw.value,
          letter: el.letterBig.textContent,
          obs: m.obs, cfg: m.cfg,
          runwaysInUse: runwaysInUse,
          includeNotams: el.includeNotams.checked,
          includeHpa: el.includeHpa.checked,
          notams: notams.map(function (n) {
            return {
              raw: n.raw, include: n.include,
              meta: {
                id: n.meta.id, location: n.meta.location, codigoQ: n.meta.codigoQ,
                propio: n.meta.propio,
                desde: n.meta.desde ? n.meta.desde.toISOString() : null,
                hasta: n.meta.hasta ? n.meta.hasta.toISOString() : null
              }
            };
          }),
          notamSoloVigentes: el.notamSoloVigentes.checked,
          voices: { es: el.voiceEs.value, en: el.voiceEn.value },
          rate: el.rate.value, gap: el.gap.value, sentencePause: el.sentencePause.value,
          langEs: el.langEs.checked, langEn: el.langEn.checked,
          libre: { activo: el.libreActivo.checked, es: el.libreEs.value, en: el.libreEn.value }
        }));
      } catch (e) { /* almacenamiento no disponible */ }
    }, 400);
  }

  function restore() {
    var data;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { data = null; }
    if (!data) { renderNotams(); return; }
    var o = data.obs || {}, c = data.cfg || {};
    el.metarRaw.value = data.metar || '';
    lastMetar = data.metar || '';
    if (c.station) el.station.value = c.station;
    if (data.letter) el.letterBig.textContent = data.letter;
    el.infoType.value = c.infoType || 'normal';
    el.obsTime.value = o.time || '';
    if (o.wind) {
      el.windMode.value = o.wind.mode || 'steady';
      el.windDir.value = o.wind.direction || '';
      el.windSpeed.value = o.wind.speed || '';
      el.windGust.value = o.wind.gust || '';
      el.windVarFrom.value = o.wind.varFrom || '';
      el.windVarTo.value = o.wind.varTo || '';
    }
    if (o.visibility) {
      el.visValue.value = o.visibility.value || '';
      el.visUnit.value = o.visibility.unit || 'SM';
      el.visCause.value = o.visibility.cause || '';
      el.visOrMore.checked = !!o.visibility.orMore;
    }
    el.temperature.value = o.temperature || '';
    el.dewpoint.value = o.dewpoint || '';
    el.altimeter.value = o.altimeter || '';
    el.altimeter.dataset.unit = o.altimeterUnit || 'inHg';
    el.altimeter.dataset.hpa = o.qnhHpa || '';
    if (o.layers && o.layers.length) setLayers(o.layers);
    runwaysInUse = data.runwaysInUse || [];
    el.runwayCondition.value = c.runwayCondition || '';
    el.approach.value = c.approach || '';
    el.additionalEs.value = c.additionalEs || '';
    el.additionalEn.value = c.additionalEn || '';
    el.includeNotams.checked = data.includeNotams !== false;
    el.includeHpa.checked = !!data.includeHpa;
    if (data.rate) el.rate.value = data.rate;
    el.rateVal.textContent = (+el.rate.value).toFixed(2);
    if (data.gap) el.gap.value = data.gap;
    if (data.sentencePause !== undefined) el.sentencePause.value = data.sentencePause;
    if (data.langEs !== undefined) el.langEs.checked = data.langEs;
    if (data.langEn !== undefined) el.langEn.checked = data.langEn;
    if (data.libre) {
      el.libreActivo.checked = !!data.libre.activo;
      el.libreEs.value = data.libre.es || '';
      el.libreEn.value = data.libre.en || '';
    }
    savedVoices = data.voices || null;
    savedApproachRwy = c.approachRunway || '';
    if (data.notamSoloVigentes !== undefined) el.notamSoloVigentes.checked = data.notamSoloVigentes;
    (data.notams || []).forEach(function (n) {
      var es = ATIS.notam.parse(n.raw, 'es');
      var m = n.meta || {};
      notams.push({
        raw: n.raw, es: es, en: ATIS.notam.parse(n.raw, 'en'),
        include: n.include !== false, expanded: false,
        meta: {
          id: m.id || es.id || '', location: m.location || es.location || '',
          codigoQ: m.codigoQ || (es.q ? es.q.code : ''),
          propio: m.propio !== false,
          desde: m.desde ? new Date(m.desde) : null,
          hasta: m.hasta ? new Date(m.hasta) : null
        }
      });
    });
    renderNotams();
  }

  var savedVoices = null, savedApproachRwy = '';
  function restoreVoices() {
    if (!savedVoices) return;
    if (savedVoices.es) selectIfPresent(el.voiceEs, savedVoices.es);
    if (savedVoices.en) selectIfPresent(el.voiceEn, savedVoices.en);
  }
  function selectIfPresent(select, value) {
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === value) { select.selectedIndex = i; return; }
    }
  }

  /* ================================================================== *
   * Utilidades de interfaz
   * ================================================================== */
  function status(node, msg, cls) {
    if (!node) return;
    node.textContent = msg;
    node.className = 'status' + (cls ? ' ' + cls : '');
  }

  function startClock() {
    function tick() {
      var d = new Date();
      el.utcClock.textContent = ('0' + d.getUTCHours()).slice(-2) + ':' +
        ('0' + d.getUTCMinutes()).slice(-2) + ':' + ('0' + d.getUTCSeconds()).slice(-2);
    }
    tick();
    setInterval(tick, 1000);
  }

  function download() {
    var code = (el.station.value || 'ATIS').toUpperCase();
    var letter = N.letterInfo(el.letterBig.textContent);
    var body =
      'ATIS ' + code + ' - INFORMACION ' + letter.word + '\n' +
      new Date().toISOString() + '\n\n' +
      '--- ESPANOL ---\n' + lastScripts.es.text + '\n\n' +
      '--- ENGLISH ---\n' + lastScripts.en.text + '\n';
    var blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ATIS_' + code + '_' + letter.letter + '.txt';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ================================================================== *
   * Eventos
   * ================================================================== */
  function bindEvents() {
    on(el.btnDecode, 'click', decodeMetar);
    on(el.btnFetch, 'click', fetchMetar);
    on(el.btnSample, 'click', function () {
      el.metarRaw.value = 'MMMX 212145Z 05008KT 6SM HZ SCT020 BKN100 BKN220 22/11 A3039 RMK 8/522 HZY';
      decodeMetar();
    });
    on(el.metarRaw, 'keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); decodeMetar(); }
    });

    on(el.station, 'change', function () {
      el.station.value = el.station.value.toUpperCase();
      runwaysInUse = [];
      applyAirport(el.station.value, false);
      render();
    });

    on(el.letterPrev, 'click', function () { stepLetter(-1); });
    on(el.letterNext, 'click', function () { stepLetter(1); });

    on(el.runwayChips, 'click', function (e) {
      var chip = e.target.closest ? e.target.closest('.chip') : null;
      if (!chip) return;
      var r = chip.dataset.rwy;
      var i = runwaysInUse.indexOf(r);
      if (i >= 0) runwaysInUse.splice(i, 1); else runwaysInUse.push(r);
      paintChips();
      if (runwaysInUse.length === 1 && !el.approachRunway.value) {
        selectIfPresent(el.approachRunway, runwaysInUse[0]);
      }
      render();
    });

    on(el.btnAddLayer, 'click', function () { el.layers.appendChild(layerRow('', '')); });

    ['infoType', 'obsTime', 'approach', 'approachRunway', 'runwayCondition',
      'windMode', 'windDir', 'windSpeed', 'windGust', 'windVarFrom', 'windVarTo',
      'visValue', 'visUnit', 'visCause', 'visOrMore',
      'temperature', 'dewpoint', 'altimeter', 'includeHpa',
      'additionalEs', 'additionalEn', 'includeNotams'].forEach(function (id) {
        on(el[id], 'input', scheduleRender);
        on(el[id], 'change', scheduleRender);
      });

    on(el.altimeter, 'input', function () {
      /* Altimetro escrito a mano: 4 digitos en pulgadas, o 4 digitos >= 0800 en hPa */
      var v = el.altimeter.value.replace(/\D/g, '');
      el.altimeter.dataset.unit = (v.length === 4 && +v >= 2500 && +v <= 3200) ? 'inHg' : el.altimeter.dataset.unit || 'inHg';
    });

    on(el.btnNotamAdd, 'click', addNotam);
    on(el.btnNotamClear, 'click', function () {
      notams = []; renderNotams(); render();
      status(el.notamStatus, 'Lista vacía.');
    });
    on(el.btnNotamFile, 'click', function () { el.notamFile.click(); });
    on(el.notamFile, 'change', function () {
      importarArchivo(el.notamFile.files[0]);
      el.notamFile.value = '';
    });
    on(el.btnNotamCopy, 'click', function () {
      var lineas = notamLines('es');
      if (!lineas.length) { status(el.notamStatus, 'No hay NOTAM marcados.', 'err'); return; }
      var texto = lineas.map(function (l) { return l.replace(/[.,;]+$/, ''); }).join('\n');
      if (navigator.clipboard) navigator.clipboard.writeText(texto);
      status(el.notamStatus, lineas.length + ' NOTAM copiados, un renglón cada uno.', 'ok');
    });
    on(el.btnNotamAll, 'click', function () { marcarNotams('todos'); });
    on(el.btnNotamNone, 'click', function () { marcarNotams('ninguno'); });
    on(el.btnNotamAtis, 'click', function () { marcarNotams('atis'); });
    on(el.notamSoloVigentes, 'change', renderNotams);

    /* Un solo manejador para toda la lista: se vuelve a dibujar a cada cambio */
    on(el.notamList, 'change', function (e) {
      var chk = e.target.classList && e.target.classList.contains('n-inc') ? e.target : null;
      if (!chk) return;
      notams[+chk.dataset.n].include = chk.checked;
      renderNotams(); render();
    });
    on(el.notamList, 'click', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.more !== undefined) {
        var i = +t.dataset.more;
        notams[i].expanded = !notams[i].expanded;
        renderNotams();
      } else if (t.classList && t.classList.contains('n-del')) {
        notams.splice(+t.dataset.n, 1);
        renderNotams(); render();
      }
    });

    on(el.btnPlay, 'click', function () { play(false); });
    on(el.btnIgual, 'click', function () { play(true); });
    on(el.btnCorregir, 'click', function () {
      el.preflight.hidden = true;
      mostrarPagina('pageAtis');
    });

    on(el.btnPrev, 'click', function () { ATIS.speech.saltar(-1); });
    on(el.btnNext, 'click', function () { ATIS.speech.saltar(1); });
    on(el.posicion, 'input', function () { arrastrando = true; el.posTexto.textContent = (+el.posicion.value + 1) + ' / ' + (+el.posicion.max + 1); });
    on(el.posicion, 'change', function () {
      arrastrando = false;
      ATIS.speech.irA(+el.posicion.value);
    });

    ['libreActivo', 'libreEs', 'libreEn'].forEach(function (id) {
      on(el[id], 'input', scheduleRender);
      on(el[id], 'change', scheduleRender);
    });

    /* La edad de la observación avanza sola */
    setInterval(function () { pintarEdadMetar(); pintarVerificacion(); }, 30000);
    on(el.btnStop, 'click', stop);
    on(el.btnTestEs, 'click', function () {
      ATIS.speech.setOptions({ voices: { es: el.voiceEs.value }, rate: { es: +el.rate.value } });
      ATIS.speech.test('es');
    });
    on(el.btnTestEn, 'click', function () {
      ATIS.speech.setOptions({ voices: { en: el.voiceEn.value }, rate: { en: +el.rate.value } });
      ATIS.speech.test('en');
    });
    /* Clic en una voz de la lista: se escucha y queda seleccionada */
    [el.voiceListEs, el.voiceListEn].forEach(function (lista) {
      on(lista, 'click', function (e) {
        var item = e.target.closest ? e.target.closest('.voiceitem') : null;
        if (!item) return;
        var nombre = item.dataset.voz, lang = item.dataset.lang;
        selectIfPresent(lang === 'es' ? el.voiceEs : el.voiceEn, nombre);
        ATIS.speech.setOptions({ rate: { es: +el.rate.value, en: +el.rate.value } });
        ATIS.speech.testWithVoice(nombre, lang);
        save();
        updateVoiceReport();
      });
    });

    on(el.btnVoiceDiag, 'click', function () {
      var texto = textoDiagnostico();
      if (navigator.clipboard) navigator.clipboard.writeText(texto);
      status(el.voiceDiagStatus, 'Diagnóstico copiado al portapapeles.', 'ok');
    });

    on(el.rate, 'input', function () { el.rateVal.textContent = (+el.rate.value).toFixed(2); });
    on(el.rate, 'input', save);
    on(el.gap, 'input', save);
    on(el.sentencePause, 'input', save);
    on(el.langEs, 'change', function () { save(); updateVoiceReport(); });
    on(el.langEn, 'change', function () { save(); updateVoiceReport(); });
    on(el.voiceEs, 'change', function () { save(); updateVoiceReport(); });
    on(el.voiceEn, 'change', function () { save(); updateVoiceReport(); });

    on(el.btnTema, 'click', function () {
      aplicarModo(temaActual() === 'dark' ? 'light' : 'dark', true);
    });
    on(el.temaOpciones, 'click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-tema]') : null;
      if (b) aplicarModo(b.dataset.tema, true);
    });

    on(el.saltos, 'click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-ir]') : null;
      if (!b) return;
      mostrarPagina('pageAtis');
      var destino = document.getElementById(b.dataset.ir);
      if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    on(el.tabAtis, 'click', function () { mostrarPagina('pageAtis'); });
    on(el.tabAjustes, 'click', function () { mostrarPagina('pageAjustes'); });

    on(el.btnLogCopy, 'click', function () {
      var texto = textoRegistro();
      if (navigator.clipboard) navigator.clipboard.writeText(texto);
      status(el.logStatus, 'Registro copiado (' + ATIS.speech.registro().length + ' eventos).', 'ok');
    });
    on(el.btnLogClear, 'click', function () {
      ATIS.speech.limpiarRegistro();
      renderLog();
      status(el.logStatus, '');
    });

    on(el.btnDownload, 'click', download);
    Array.prototype.forEach.call(document.querySelectorAll('.copy'), function (b) {
      on(b, 'click', function () {
        var txt = $(b.dataset.copy).textContent;
        if (navigator.clipboard) navigator.clipboard.writeText(txt);
        b.textContent = 'copiado';
        setTimeout(function () { b.textContent = b.dataset.copy === 'scriptEs' ? 'copiar' : 'copy'; }, 1200);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { stop(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (ATIS.speech.state.playing) stop(); else play();
      }
    });

    global.addEventListener('beforeunload', function () { ATIS.speech.stop(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(this);
