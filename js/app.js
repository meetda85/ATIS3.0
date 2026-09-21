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
      'infoType', 'obsTime', 'approach', 'approachRunway', 'runwayChips', 'runwayCondition', 'transitionLevel',
      'windMode', 'windDir', 'windSpeed', 'windGust', 'windVarFrom', 'windVarTo',
      'visValue', 'visUnit', 'visCause', 'visOrMore',
      'temperature', 'dewpoint', 'altimeter', 'includeHpa',
      'layers', 'btnAddLayer',
      'notamRaw', 'btnNotamAdd', 'btnNotamClear', 'notamStatus', 'notamList',
      'additionalEs', 'additionalEn', 'includeNotams',
      'scriptEs', 'scriptEn', 'btnDownload', 'scriptStatus',
      'btnPlay', 'btnStop', 'playState', 'playDetail',
      'voiceEs', 'voiceEn', 'rate', 'gap', 'sentencePause', 'btnTestEs', 'btnTestEn',
      'voiceListEs', 'voiceListEn'
    ].forEach(function (id) { el[id] = $(id); });

    fillStations();
    fillCauses();
    ensureLayerRows(3);
    bindEvents();
    restore();
    applyAirport(el.station.value, true);
    if (savedApproachRwy) selectIfPresent(el.approachRunway, savedApproachRwy);
    setLetter(el.letterBig.textContent || 'A');
    startClock();
    initVoices();
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

    if (ap && !keepFields) {
      el.transitionLevel.value = ap.transitionLevel || '';
    } else if (ap && !el.transitionLevel.value) {
      el.transitionLevel.value = ap.transitionLevel || '';
    }
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
    if (!raw) { status(el.notamStatus, 'Pegue uno o varios NOTAM.', 'err'); return; }
    var blocks = ATIS.notam.split(raw);
    blocks.forEach(function (b) {
      notams.push({
        raw: b,
        es: ATIS.notam.parse(b, 'es'),
        en: ATIS.notam.parse(b, 'en'),
        include: true
      });
    });
    el.notamRaw.value = '';
    status(el.notamStatus, blocks.length + ' NOTAM agregado(s).', 'ok');
    renderNotams();
    render();
  }

  function renderNotams() {
    if (!notams.length) {
      el.notamList.innerHTML = '<span class="status">Sin NOTAM cargados.</span>';
      return;
    }
    el.notamList.innerHTML = notams.map(function (n, i) {
      var q = n.es.q;
      var qtxt = q ? [q.subject, q.condition].filter(Boolean).join(' · ') : '';
      return '<div class="notam' + (n.include ? '' : ' off') + '">' +
        '<header>' +
          '<span class="id">' + (n.es.id || 'NOTAM ' + (i + 1)) + '</span>' +
          (n.es.location ? '<span class="q">' + n.es.location + '</span>' : '') +
          (qtxt ? '<span class="q">' + escapeHtml(qtxt) + '</span>' : '') +
          '<span class="spacer"></span>' +
          '<label class="checkline"><input type="checkbox" data-n="' + i + '" class="n-inc"' +
            (n.include ? ' checked' : '') + '> <span>transmitir</span></label>' +
          '<button class="mini n-del" data-n="' + i + '">quitar</button>' +
        '</header>' +
        '<div class="txt">' + escapeHtml(n.es.summary || n.es.plain) + '</div>' +
        '<div class="txt en">' + escapeHtml(n.en.summary || n.en.plain) + '</div>' +
        '<div class="raw">' + escapeHtml(n.raw) + '</div>' +
      '</div>';
    }).join('');

    Array.prototype.forEach.call(el.notamList.querySelectorAll('.n-inc'), function (c) {
      on(c, 'change', function () {
        notams[+c.dataset.n].include = c.checked;
        renderNotams(); render();
      });
    });
    Array.prototype.forEach.call(el.notamList.querySelectorAll('.n-del'), function (b) {
      on(b, 'click', function () {
        notams.splice(+b.dataset.n, 1);
        renderNotams(); render();
      });
    });
  }

  function notamLines(lang) {
    if (!el.includeNotams.checked) return [];
    return notams.filter(function (n) { return n.include; })
      .map(function (n) { return n[lang].summary || n[lang].plain; })
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
      transitionLevel: el.transitionLevel.value.replace(/\D/g, ''),
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
   * Reproduccion
   * ================================================================== */
  function play() {
    if (!ATIS.speech.supported) {
      status(el.scriptStatus, 'Este navegador no soporta síntesis de voz. Use Chrome o Edge.', 'err');
      return;
    }
    render();
    var ok = ATIS.speech.play(
      [{ lang: 'es', text: lastScripts.es.speech }, { lang: 'en', text: lastScripts.en.speech }],
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
    document.querySelector('.brand .dot').classList.add('live');
  }

  function stop() {
    ATIS.speech.stop();
    el.btnPlay.disabled = false;
    el.btnStop.disabled = true;
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
    ATIS.speech.onState(function (st) {
      if (!st.playing) return;
      el.playState.textContent = 'TRANSMITIENDO · ' + (st.lang === 'es' ? 'ESPAÑOL' : 'INGLÉS');
      el.playState.classList.add('live');
      el.playDetail.textContent = 'Ciclo ' + st.cycle + ' · fragmento ' + st.chunk + ' de ' + st.total +
        ' · información ' + N.letterInfo(el.letterBig.textContent).word;
    });
  }

  function fillVoiceSelect(select, lang) {
    var list = ATIS.speech.rankedVoices(lang);
    if (!list.length) {
      select.innerHTML = '<option value="">(sin voces ' + lang + ')</option>';
      status(el.scriptStatus, 'El sistema no tiene voces instaladas en ' +
        (lang === 'es' ? 'español' : 'inglés') + '. Vea el cuadro 8, Calidad de voz.', 'err');
      return;
    }
    /* Ya vienen de mejor a peor calidad: la primera queda seleccionada */
    select.innerHTML = list.map(function (v) {
      return '<option value="' + v.name + '">' + (v.natural ? '★ ' : '') + v.name + ' (' + v.lang + ')</option>';
    }).join('');
    select.selectedIndex = 0;
  }

  /* Cuadro 8: que voces tiene la computadora */
  function renderVoiceList(node, lang, selectedName) {
    var list = ATIS.speech.rankedVoices(lang);
    if (!list.length) {
      node.innerHTML = '<span class="status err">No hay ninguna voz en ' +
        (lang === 'es' ? 'español' : 'inglés') + ' instalada en este equipo.</span>';
      return;
    }
    node.innerHTML = list.map(function (v) {
      return '<div class="voiceitem' + (v.natural ? ' natural' : '') +
        (v.name === selectedName ? ' inuse' : '') + '">' +
        '<span>' + (v.natural ? '★' : '·') + '</span>' +
        '<span class="vname">' + escapeHtml(v.name) + '</span>' +
        '<span class="vlang">' + escapeHtml(v.lang) + '</span></div>';
    }).join('');
  }

  function updateVoiceReport() {
    renderVoiceList(el.voiceListEs, 'es', el.voiceEs.value);
    renderVoiceList(el.voiceListEn, 'en', el.voiceEn.value);
    var esNat = /^★/.test(el.voiceEs.options[el.voiceEs.selectedIndex] ? el.voiceEs.options[el.voiceEs.selectedIndex].text : '');
    var enNat = /^★/.test(el.voiceEn.options[el.voiceEn.selectedIndex] ? el.voiceEn.options[el.voiceEn.selectedIndex].text : '');
    if (!ATIS.speech.state.playing) {
      if (esNat && enNat) {
        el.playDetail.textContent = 'Voces naturales seleccionadas. Listo para transmitir en bucle: español → inglés';
        el.playDetail.classList.remove('warn');
      } else {
        el.playDetail.textContent = 'Voz robótica: no hay voz natural en ' +
          (!esNat && !enNat ? 'español ni inglés' : (!esNat ? 'español' : 'inglés')) +
          '. Vea el cuadro 8, Calidad de voz.';
        el.playDetail.classList.add('warn');
      }
    }
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
          notams: notams.map(function (n) { return { raw: n.raw, include: n.include }; }),
          voices: { es: el.voiceEs.value, en: el.voiceEn.value },
          rate: el.rate.value, gap: el.gap.value, sentencePause: el.sentencePause.value
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
    el.transitionLevel.value = c.transitionLevel || '';
    el.approach.value = c.approach || '';
    el.additionalEs.value = c.additionalEs || '';
    el.additionalEn.value = c.additionalEn || '';
    el.includeNotams.checked = data.includeNotams !== false;
    el.includeHpa.checked = !!data.includeHpa;
    if (data.rate) el.rate.value = data.rate;
    if (data.gap) el.gap.value = data.gap;
    if (data.sentencePause !== undefined) el.sentencePause.value = data.sentencePause;
    savedVoices = data.voices || null;
    savedApproachRwy = c.approachRunway || '';
    (data.notams || []).forEach(function (n) {
      notams.push({ raw: n.raw, es: ATIS.notam.parse(n.raw, 'es'), en: ATIS.notam.parse(n.raw, 'en'), include: n.include !== false });
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

    ['infoType', 'obsTime', 'approach', 'approachRunway', 'runwayCondition', 'transitionLevel',
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

    on(el.btnPlay, 'click', play);
    on(el.btnStop, 'click', stop);
    on(el.btnTestEs, 'click', function () {
      ATIS.speech.setOptions({ voices: { es: el.voiceEs.value }, rate: { es: +el.rate.value } });
      ATIS.speech.test('es');
    });
    on(el.btnTestEn, 'click', function () {
      ATIS.speech.setOptions({ voices: { en: el.voiceEn.value }, rate: { en: +el.rate.value } });
      ATIS.speech.test('en');
    });
    on(el.rate, 'input', save);
    on(el.gap, 'input', save);
    on(el.sentencePause, 'input', save);
    on(el.voiceEs, 'change', function () { save(); updateVoiceReport(); });
    on(el.voiceEn, 'change', function () { save(); updateVoiceReport(); });

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
