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
      'btnNotamCopy', 'notamSoloVigentes', 'notamSoltar',
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
      'preflight', 'preflightLista', 'btnIgual', 'btnCorregir', 'metarEdad',
      'enlaceEstado', 'enlaceDetalle', 'enlacePapel', 'enlaceEquipos',
      'saludBadge', 'saludLista', 'btnSaludCopy', 'saludStatus',
      'vigBadge', 'vigActiva', 'vigUrl', 'vigEstacion', 'vigMinutos', 'btnVigAhora',
      'vigStatus', 'vigUltimo', 'avisoMetar', 'avisoMetarTexto', 'btnUsarMetar', 'btnIgnorarMetar',
      'pendiente', 'pendienteTexto', 'btnAplicarYa',
      'motorSel', 'vozNBadge', 'vozNInfo', 'btnVozNRevisar', 'btnVozNLimpiar', 'vozNStatus',
      'rotVozEs', 'rotVozEn'
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
    iniciarEnlace();
    iniciarMotor();
    comprobarInstalacion();
    if (vigDisponible()) {
      pedirVigilancia(null).then(function (st) {
        if (st && !st.error) {
          el.vigActiva.checked = !!st.activo;
          if (st.url) el.vigUrl.value = st.url;
          if (st.estacion) el.vigEstacion.value = st.estacion;
          if (st.minutos) el.vigMinutos.value = st.minutos;
        }
        pintarVigilancia(st);
      });
    } else {
      pintarVigilancia({});
    }
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
  /* Las pistas del aeródromo más el designador sin lado (05, 23), que significa
     las dos de esa dirección. Queda antes de sus pistas individuales. */
  function pistasSeleccionables(runways) {
    var lista = [], vistos = {};
    runways.forEach(function (r) {
      var m = /^(\d{2})([LRC])$/.exec(r);
      if (!m) return;
      if (!vistos[m[1]]) {
        vistos[m[1]] = true;
        lista.push({ valor: m[1], ambas: true });
      }
    });
    runways.forEach(function (r) { lista.push({ valor: r, ambas: false }); });
    /* Ordenadas por número, con el designador sin lado a la cabeza de su grupo */
    return lista.sort(function (a, b) {
      var na = a.valor.slice(0, 2), nb = b.valor.slice(0, 2);
      if (na !== nb) return na < nb ? -1 : 1;
      if (a.ambas !== b.ambas) return a.ambas ? -1 : 1;
      return a.valor < b.valor ? -1 : 1;
    });
  }

  function applyAirport(code, keepFields) {
    var ap = ATIS.getAirport(code);
    var runways = ap ? ap.runways : [];
    var seleccionables = pistasSeleccionables(runways);

    el.approachRunway.innerHTML = '<option value="">— sin pista —</option>' +
      seleccionables.map(function (r) {
        return '<option value="' + r.valor + '">' + r.valor +
          (r.ambas ? ' (ambas)' : '') + '</option>';
      }).join('');

    el.runwayChips.innerHTML = seleccionables.map(function (r) {
      return '<button type="button" class="chip' + (r.ambas ? ' ambas' : '') +
        '" data-rwy="' + r.valor + '"' +
        (r.ambas ? ' title="Las dos pistas ' + r.valor + '"' : '') + '>' + r.valor + '</button>';
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
  function tamanoLegible(bytes) {
    return bytes < 1024 ? bytes + ' B'
      : bytes < 1048576 ? Math.round(bytes / 1024) + ' KB'
      : (bytes / 1048576).toFixed(1) + ' MB';
  }

  function importarArchivo(file) {
    if (!file) return;
    var esTexto = /\.(txt)$/i.test(file.name);
    var lector = new FileReader();
    var sello = file.name + ' (' + tamanoLegible(file.size) + ')';

    if (!file.size) {
      status(el.notamStatus, 'El archivo ' + sello + ' está vacío. ' +
        'Vuelva a descargarlo del FNS: pudo haberse cortado la descarga.', 'err');
      return;
    }
    status(el.notamStatus, 'Leyendo ' + sello + ' …');

    lector.onerror = function () { status(el.notamStatus, 'No se pudo leer el archivo.', 'err'); };
    lector.onload = function (e) {
      var datos;
      try {
        if (esTexto) {
          datos = ATIS.fns.fromText(String(e.target.result));
        } else {
          if (typeof global.XLSX === 'undefined') {
            status(el.notamStatus, 'No se cargó el lector de hojas de cálculo. ' +
              'Si abrió el ATIS desde el enlace en línea y esta computadora no tiene ' +
              'internet, use la versión instalada: ahí el lector viene incluido.', 'err');
            return;
          }
          var libro = global.XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          var hoja = libro.Sheets[libro.SheetNames[0]];
          var filas = global.XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' });
          datos = ATIS.fns.fromMatrix(filas);
        }
      } catch (err) {
        status(el.notamStatus, 'No se pudo leer ' + sello + ': ' + err.message +
          '. Debe ser la hoja tal como la descarga el FNS; si la abrió y la volvió a ' +
          'guardar con otro programa, descárguela de nuevo.', 'err');
        return;
      }

      if (datos.errors && datos.errors.length) {
        status(el.notamStatus, datos.errors.join(' ') + ' (' + sello + ')', 'err');
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

  /* Renglones del texto libre, si está activado */
  function libreLines(lang) {
    if (!el.libreActivo.checked) return [];
    var texto = (lang === 'es' ? el.libreEs.value : el.libreEn.value) || '';
    return texto.replace(/\r/g, '').split('\n')
      .map(function (l) { return l.trim(); }).filter(Boolean);
  }

  function render() {
    var m = readModel();
    var cfgEs = Object.create(m.cfg); cfgEs.notamLines = notamLines('es'); cfgEs.libreLines = libreLines('es');
    var cfgEn = Object.create(m.cfg); cfgEn.notamLines = notamLines('en'); cfgEn.libreLines = libreLines('en');
    lastScripts.es = S.build('es', m.obs, cfgEs);
    lastScripts.en = S.build('en', m.obs, cfgEn);
    el.scriptEs.textContent = lastScripts.es.text;
    el.scriptEn.textContent = lastScripts.en.text;
    var words = lastScripts.es.text.split(/\s+/).length + lastScripts.en.text.split(/\s+/).length;
    status(el.scriptStatus, 'Guion listo · ' + words + ' palabras · duración aproximada ' +
      estimateDuration(words) + ' por ciclo');
    if (enAire()) {
      el.playDetail.textContent = 'El guion cambió: pulse ACTUALIZAR para ponerlo al aire ' +
        'al terminar el ciclo.';
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
    var neural = motorElegido() === 'neuronal';
    var hayVoz = ajustarIdiomasPorMotor();
    var dondeFalta = neural ? 'la voz neuronal de ese idioma no está instalada'
      : 'el equipo no tiene esa voz';
    if (el.langEs.checked && !hayVoz.es) err('El español está marcado pero ' + dondeFalta + '.');
    if (el.langEn.checked && !hayVoz.en) err('El inglés está marcado pero ' + dondeFalta + '.');

    if (el.libreActivo.checked) {
      var hayEs = el.langEs.checked && el.libreEs.value.trim();
      var hayEn = el.langEn.checked && el.libreEn.value.trim();
      if (!hayEs && !hayEn) err('El texto libre está activado y no hay texto escrito.');
      else if (el.langEs.checked && el.langEn.checked && (!hayEs || !hayEn)) {
        adv('El texto libre solo está escrito en ' + (hayEs ? 'español' : 'inglés') +
          ': el otro idioma saldrá sin él.');
      } else adv('Texto libre activo: se añadirá al final del ATIS.');
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
  /* forzar: salta la verificación previa (ya se avisó).
     relevo: el ATIS cambió mientras se transmitía. Con la voz neuronal el audio
     nuevo se genera mientras el viejo sigue sonando y entra en el corte del
     ciclo, así que no hay ni un segundo de silencio. */
  function play(forzar, relevo) {
    forzar = forzar === true;
    if (!ATIS.speech.supported && motorElegido() !== 'neuronal') {
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

    var secuencia = [];
    if (el.langEs.checked && lastScripts.es.speech) secuencia.push({ lang: 'es', text: lastScripts.es.speech });
    if (el.langEn.checked && lastScripts.en.speech) secuencia.push({ lang: 'en', text: lastScripts.en.speech });
    if (!secuencia.length) {
      status(el.scriptStatus, 'No hay nada que transmitir. ' +
        'Si las casillas de idioma están deshabilitadas, falta instalar la voz: vea Ajustes, Voces del sistema.', 'err');
      return;
    }
    var opciones = {
      loop: true,
      gap: +el.gap.value || 0,
      cycleGap: (+el.gap.value || 0) + 2,
      voices: { es: el.voiceEs.value, en: el.voiceEn.value },
      rate: { es: +el.rate.value, en: +el.rate.value },
      sentencePause: +el.sentencePause.value || 0
    };

    if (motorElegido() === 'neuronal') {
      transmitirNeural(secuencia, opciones, relevo === true);
      return;
    }
    if (!ATIS.speech.play(secuencia, opciones)) {
      status(el.scriptStatus, 'No hay nada que transmitir.', 'err');
      return;
    }
    alAire('navegador');
  }

  /* Con la voz neuronal hay que generar el audio antes de arrancar: tarda unos
     segundos la primera vez y nada las siguientes, porque queda guardado.
     Si el servidor falla justo ahora, se sale al aire con la voz del navegador
     en lugar de quedarse callado. */
  function transmitirNeural(secuencia, opciones, relevo) {
    var alAireYa = relevo && ATIS.neural.state.playing;
    el.btnPlay.disabled = true;      /* mientras se genera, para no pedirlo dos veces */
    status(el.scriptStatus, alAireYa
      ? 'Generando el audio nuevo. El ciclo en curso sigue al aire y el relevo entra al terminar…'
      : 'Generando el audio con la voz neuronal…');
    if (!alAireYa) el.playState.textContent = 'Generando el audio…';
    var arranque = alAireYa ? ATIS.neural.relevar(secuencia, opciones)
      : ATIS.neural.play(secuencia, opciones);
    arranque.then(function (r) {
      if (!r.ok) throw new Error('el audio llegó vacío');
      alAire('neuronal');
      el.btnPlay.disabled = false;
      var dur = ATIS.neural.reloj(ATIS.neural.duracionCiclo());
      var aviso = r.faltaron.length
        ? ' No se pudo generar ' + r.faltaron.map(function (f) { return f.lang; }).join(' ni ') + '.'
        : '';
      status(el.scriptStatus, (r.relevo ? 'Relevo hecho en el corte del ciclo, sin silencio · ciclo de '
        : 'Al aire con la voz neuronal · ciclo de ') + dur + '.' + aviso,
        r.faltaron.length ? 'err' : 'ok');
      pintarNeural();
    }).catch(function (e) {
      el.btnPlay.disabled = false;
      /* Si ya había algo al aire, ahí se queda: mejor el ATIS anterior que el silencio */
      if (alAireYa && ATIS.neural.state.playing) {
        status(el.scriptStatus, 'No se pudo generar el audio nuevo (' + e.message +
          '). Sigue al aire el ATIS anterior; vuelva a pulsar TRANSMITIR.', 'err');
        el.btnPlay.disabled = false;
        revisarNeural(true);
        return;
      }
      status(el.scriptStatus, 'La voz neuronal falló (' + e.message +
        '). Se transmite con la voz del navegador.', 'err');
      /* El respaldo necesita las voces del navegador en los desplegables */
      var guardado = prefMotor;
      prefMotor = 'navegador';
      llenarVoces();
      if (ATIS.speech.play(secuencia, {
        loop: opciones.loop, gap: opciones.gap, cycleGap: opciones.cycleGap,
        voices: { es: el.voiceEs.value, en: el.voiceEn.value },
        rate: opciones.rate, sentencePause: opciones.sentencePause
      })) {
        alAire('navegador');
      } else {
        el.playState.textContent = 'Detenido';
      }
      prefMotor = guardado;
      revisarNeural(true);
    });
  }

  /* El ATIS cambió mientras se transmitía: el ciclo nuevo entra en el corte.
     Con la voz neuronal el audio se genera por delante y no hay silencio; con
     la del navegador se reinicia el bucle al terminar el ciclo, como siempre. */
  function relevar(forzar) {
    if (!enAire()) { play(forzar); return; }
    if (motor() === ATIS.neural) { play(forzar, true); return; }
    /* Con la voz del navegador no se puede adelantar nada: se corta el ciclo
       actual al terminar y el siguiente ya sale con lo nuevo. */
    var chequeo = pintarVerificacion();
    if (chequeo.avisos.length && forzar !== true) {
      el.btnIgual.hidden = chequeo.graves.length > 0;
      status(el.scriptStatus, chequeo.graves.length
        ? 'Hay que corregir lo marcado en rojo antes de poner esto al aire.'
        : 'Revise lo que falta, o pulse «Transmitir de todos modos».', 'err');
      return;
    }
    ATIS.speech.alFinDeCiclo(function () { play(true); });
    status(el.scriptStatus, 'El ciclo en curso termina y el siguiente sale con ' +
      'la información nueva.', 'ok');
  }

  function alAire(cual) {
    /* El botón no se apaga: al aire sirve para poner el ATIS nuevo, que entra
       en el corte del ciclo. Con la voz neuronal el relevo no deja silencio. */
    el.btnPlay.disabled = false;
    el.btnPlay.textContent = 'ACTUALIZAR';
    el.btnPlay.title = 'Pone al aire la información de ahora: entra al terminar el ciclo';
    el.btnStop.disabled = false;
    el.pavance.hidden = false;
    el.preflight.hidden = true;
    document.querySelector('.brand .dot').classList.add('live');
    prepararAvance(cual);
  }

  /* ---- Barra de posición dentro del ciclo ---- */
  var arrastrando = false;

  function prepararAvance(cual) {
    var m = motor();
    var fr = m.fragmentos();
    el.posicion.max = String(Math.max(0, m.state.total - 1));
    el.posicion.value = '0';
    if (cual === 'neuronal') {
      el.posicion.title = 'Posición dentro del ciclo, en segundos';
      el.btnPrev.title = 'Diez segundos atrás';
      el.btnNext.title = 'Diez segundos adelante';
      el.posTexto.textContent = ATIS.neural.reloj(ATIS.neural.duracionCiclo()) + ' por ciclo';
    } else {
      el.posicion.title = 'Posición dentro del ciclo';
      el.btnPrev.title = 'Fragmento anterior';
      el.btnNext.title = 'Fragmento siguiente';
      el.posTexto.textContent = fr.filter(function (f) { return !f.pausa; }).length + ' fragmentos';
    }
  }

  function pintarAvance(st) {
    if (arrastrando) return;
    var total = st.total || 1;
    el.posicion.max = String(Math.max(0, total - 1));
    el.posicion.value = String(Math.max(0, st.chunk - 1));
    el.posTexto.textContent = st.etiqueta || (st.chunk + ' / ' + total);
  }

  function stop() {
    ATIS.speech.stop();
    if (ATIS.neural) ATIS.neural.stop();
    el.btnPlay.disabled = false;
    el.btnPlay.textContent = 'TRANSMITIR';
    el.btnPlay.title = '';
    el.btnStop.disabled = true;
    el.pavance.hidden = true;
    document.querySelector('.brand .dot').classList.remove('live');
    el.playState.textContent = 'Detenido';
    el.playState.classList.remove('live');
    updateVoiceReport();
  }

  function initVoices() {
    ATIS.speech.onVoicesReady(function () {
      llenarVoces();
      updateVoiceReport();
    });
    ATIS.speech.onLog(pintarEvento);
    ATIS.speech.onState(pintarEstado);
    if (ATIS.neural) {
      ATIS.neural.onLog(pintarEvento);
      ATIS.neural.onState(pintarEstado);
    }
  }

  function pintarEstado(st) {
    if (!st.playing) return;
    el.playState.textContent = 'TRANSMITIENDO · ' + (st.lang === 'es' ? 'ESPAÑOL' : 'INGLÉS');
    el.playState.classList.add('live');
    var detalle = 'Ciclo ' + st.cycle + ' · ' +
      (st.motor === 'neuronal'
        ? 'voz neuronal · ' + (st.etiqueta || '')
        : 'fragmento ' + st.chunk + ' de ' + st.total) +
      ' · información ' + N.letterInfo(el.letterBig.textContent).word;
    if (st.respaldo) detalle += ' · voz de respaldo: ' + st.respaldo;
    if (st.aviso) detalle += ' · ' + st.aviso;
    el.playDetail.textContent = detalle;
    el.playDetail.classList.toggle('warn', !!(st.aviso || st.respaldo));
    pintarAvance(st);
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
    if (motorElegido() === 'neuronal') ajustarIdiomasPorMotor(); else ajustarIdiomas(d);
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
      chk.checked = hay && quiereIdioma[par[0]] !== false;
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
    pintarNeural();
    if (motorElegido() === 'neuronal') {
      if (!enAire()) {
        var ls = [];
        if (el.langEs.checked) ls.push('español');
        if (el.langEn.checked) ls.push('inglés');
        el.playDetail.textContent = 'Voz neuronal lista' +
          (ls.length ? ' · bucle: ' + ls.join(' → ') : ' · sin idiomas marcados');
        el.playDetail.classList.remove('warn');
      }
      return;
    }
    renderVoiceList(el.voiceListEs, 'es', el.voiceEs.value);
    renderVoiceList(el.voiceListEn, 'en', el.voiceEn.value);
    var esNat = /^★/.test(el.voiceEs.options[el.voiceEs.selectedIndex] ? el.voiceEs.options[el.voiceEs.selectedIndex].text : '');
    var enNat = /^★/.test(el.voiceEn.options[el.voiceEn.selectedIndex] ? el.voiceEn.options[el.voiceEn.selectedIndex].text : '');
    if (!enAire()) {
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
   * Qué motor de voz sale al aire
   *
   * Hay dos: la voz neuronal (Piper, local, la genera el servidor) y la voz
   * del navegador. La neuronal es la buena, pero necesita el servidor y la
   * carpeta «voz» instalada; si falta cualquiera de las dos cosas, se usa la
   * del navegador sin preguntar nada. Nunca se queda sin voz.
   * ================================================================== */
  var prefMotor = 'auto';            /* auto | neuronal | navegador */
  /* Qué idiomas quiere el operador. Se guarda aparte de las casillas porque un
     motor sin voz las desmarca, y al cambiar de motor hay que devolverlas como
     las dejó: si no, el inglés se quedaría apagado para siempre. */
  var quiereIdioma = { es: true, en: true };
  var MOTOR_KEY = 'atis3.motor';
  var savedVocesN = null;

  function neuralLista() {
    return !!(ATIS.neural && ATIS.neural.conServidor && ATIS.neural.servicio().disponible);
  }

  /* El motor que se usaría si se pulsara TRANSMITIR ahora */
  function motorElegido() {
    if (prefMotor === 'navegador') return 'navegador';
    return neuralLista() ? 'neuronal' : 'navegador';
  }

  /* El motor con el que hay que hablar. Mientras algo esté al aire manda el
     que está sonando: así un cambio de ajustes no deja un bucle huérfano. */
  function motor() {
    if (ATIS.neural && ATIS.neural.state.playing) return ATIS.neural;
    if (ATIS.speech.state.playing) return ATIS.speech;
    return motorElegido() === 'neuronal' ? ATIS.neural : ATIS.speech;
  }

  function enAire() {
    return !!(ATIS.speech.state.playing || (ATIS.neural && ATIS.neural.state.playing));
  }

  function guardarMotor() {
    try { localStorage.setItem(MOTOR_KEY, prefMotor); } catch (e) { /* ignorado */ }
  }

  function iniciarMotor() {
    var v = null;
    try { v = localStorage.getItem(MOTOR_KEY); } catch (e) { v = null; }
    if (v === 'auto' || v === 'neuronal' || v === 'navegador') prefMotor = v;
    if (el.motorSel) el.motorSel.value = prefMotor;
    revisarNeural(false);
  }

  /* Pregunta al servidor si la voz neuronal está instalada y repinta todo */
  function revisarNeural(forzar) {
    if (!ATIS.neural || !ATIS.neural.conServidor) { pintarNeural(); return Promise.resolve(null); }
    return ATIS.neural.comprobar(forzar).then(function (sv) {
      pintarNeural();
      llenarVoces();
      updateVoiceReport();
      pintarVerificacion();
      return sv;
    });
  }

  function pintarNeural() {
    if (!el.vozNBadge) return;
    var hay = !!(ATIS.neural && ATIS.neural.conServidor);
    var sv = hay ? ATIS.neural.servicio() : { consultado: true, disponible: false, error: 'sin servidor' };
    var usando = motorElegido() === 'neuronal';

    var texto, clase;
    if (!hay) { texto = 'hace falta el servidor'; clase = 'mal'; }
    else if (!sv.consultado) { texto = 'comprobando…'; clase = ''; }
    else if (sv.completa) { texto = usando ? 'lista, al aire' : 'lista, sin usar'; clase = usando ? 'ok' : ''; }
    else if (sv.disponible) { texto = 'incompleta'; clase = 'mal'; }
    else { texto = 'no instalada'; clase = 'mal'; }
    el.vozNBadge.textContent = texto;
    el.vozNBadge.className = 'enlace-badge ' + clase;

    var tags = [];
    function tag(label, valor, cls) {
      tags.push('<span class="tag' + (cls ? ' ' + cls : '') + '"><b>' + label + '</b>' +
        escapeHtml(String(valor)) + '</span>');
    }
    tag('motor al aire', usando ? 'voz neuronal (Piper)' : 'voz del navegador', usando ? '' : 'warn');
    if (!hay) {
      tag('servidor', 'no hay: el programa se abrió como archivo local', 'warn');
    } else if (sv.error) {
      tag('servidor', sv.error, 'warn');
    } else {
      tag('voces instaladas', (sv.voces || []).length
        ? sv.voces.map(function (v) { return v.nombre; }).join(', ') : 'ninguna',
        (sv.voces || []).length ? '' : 'warn');
      if (sv.carpeta) tag('carpeta', sv.carpeta);
      if (sv.cache) tag('audios guardados', sv.cache.archivos + ' (' + sv.cache.mb + ' MB)');
      (sv.falta || []).forEach(function (f) { tag('falta', f, 'warn'); });
    }
    el.vozNInfo.innerHTML = tags.join('');
  }

  /* ---- Las voces del pie son siempre las del motor que va a salir ---- */
  function llenarVoces() {
    var neural = motorElegido() === 'neuronal';
    var rot = neural ? 'Voz neuronal' : 'Voz';
    if (el.rotVozEs) el.rotVozEs.textContent = rot + ' en español';
    if (el.rotVozEn) el.rotVozEn.textContent = rot + ' en inglés';
    if (neural) {
      llenarVocesNeurales(el.voiceEs, 'es');
      llenarVocesNeurales(el.voiceEn, 'en');
      if (savedVocesN) {
        if (savedVocesN.es) selectIfPresent(el.voiceEs, savedVocesN.es);
        if (savedVocesN.en) selectIfPresent(el.voiceEn, savedVocesN.en);
      }
    } else {
      fillVoiceSelect(el.voiceEs, 'es');
      fillVoiceSelect(el.voiceEn, 'en');
      restoreVoices();
    }
    ajustarIdiomasPorMotor();
  }

  function llenarVocesNeurales(select, lang) {
    var list = ATIS.neural.vocesDe(lang);
    if (!list.length) {
      select.innerHTML = '<option value="">(falta la voz neuronal en ' + lang + ')</option>';
      return;
    }
    select.innerHTML = list.map(function (v) {
      return '<option value="' + escapeHtml(v.nombre) + '">&#9733; ' + escapeHtml(v.nombre) +
        (v.calidad ? ' (' + v.calidad + ')' : '') + '</option>';
    }).join('');
    select.selectedIndex = 0;
  }

  /* Un idioma sin voz en el motor activo no se puede transmitir */
  function ajustarIdiomasPorMotor() {
    var neural = motorElegido() === 'neuronal';
    var cuenta = {
      es: neural ? ATIS.neural.vocesDe('es').length : ATIS.speech.rankedVoices('es').length,
      en: neural ? ATIS.neural.vocesDe('en').length : ATIS.speech.rankedVoices('en').length
    };
    [['es', el.langEs], ['en', el.langEn]].forEach(function (par) {
      var chk = par[1], hay = cuenta[par[0]] > 0;
      if (!chk) return;
      chk.disabled = !hay;
      chk.checked = hay && quiereIdioma[par[0]] !== false;
      var etiqueta = chk.parentNode;
      if (etiqueta && etiqueta.classList) etiqueta.classList.toggle('sinvoz', !hay);
      chk.title = hay ? 'Incluir este idioma en la transmisión'
        : (neural ? 'La voz neuronal de este idioma no está instalada'
          : 'No hay ninguna voz de este idioma instalada en el equipo');
    });
    return cuenta;
  }

  /* Escuchar la voz seleccionada, con el motor que vaya a salir al aire */
  function probarVoz(lang, nombre) {
    if (motorElegido() === 'neuronal') {
      status(el.vozNStatus, 'Generando la muestra…');
      ATIS.neural.muestra(lang, nombre || (lang === 'es' ? el.voiceEs.value : el.voiceEn.value), +el.rate.value)
        .then(function (d) { status(el.vozNStatus, 'Muestra con ' + d.voz + ' (' + d.segundos + ' s).', 'ok'); })
        .catch(function (e) { status(el.vozNStatus, 'No se pudo generar la muestra: ' + e.message, 'err'); });
      return;
    }
    ATIS.speech.setOptions({ rate: { es: +el.rate.value, en: +el.rate.value } });
    if (nombre) ATIS.speech.testWithVoice(nombre, lang);
    else {
      ATIS.speech.setOptions({ voices: lang === 'es' ? { es: el.voiceEs.value } : { en: el.voiceEn.value } });
      ATIS.speech.test(lang);
    }
  }

  /* ================================================================== *
   * METAR automático
   * El servidor vigila la fuente; aquí solo se avisa y se decide. El ATIS
   * nunca cambia solo: ese es el punto.
   * ================================================================== */
  var metarPropuesto = null;
  var metarVistoUltimo = null;

  function vigDisponible() { return ATIS.enlace.disponible(); }

  function pedirVigilancia(opciones) {
    if (!vigDisponible()) return Promise.resolve(null);
    var cfg = { cache: 'no-store' };
    if (opciones) {
      cfg.method = 'POST';
      cfg.headers = { 'Content-Type': 'application/json' };
      cfg.body = JSON.stringify(opciones);
    }
    return fetch('/api/metar' + (opciones ? '' : (arguments[1] ? '?revisar=1' : '')), cfg)
      .then(function (r) { return r.json(); })
      .catch(function (e) { return { error: e.message }; });
  }

  function guardarVigilancia() {
    if (!vigDisponible()) return;
    pedirVigilancia({
      activo: el.vigActiva.checked,
      url: el.vigUrl.value.trim(),
      estacion: el.vigEstacion.value.trim().toUpperCase(),
      minutos: +el.vigMinutos.value
    }).then(pintarVigilancia);
  }

  function pintarVigilancia(st) {
    if (!st) return;
    if (!vigDisponible()) {
      el.vigBadge.textContent = 'necesita el servidor';
      el.vigBadge.className = 'enlace-badge';
      el.vigUltimo.innerHTML = '<span class="vacio">Esta función necesita que el ATIS se ' +
        'haya iniciado con SERVIDOR.bat: el navegador por sí solo no puede leer otro sitio.</span>';
      return;
    }
    el.vigBadge.textContent = st.activo ? 'vigilando' : 'apagado';
    el.vigBadge.className = 'enlace-badge ' + (st.activo ? 'ok' : '');
    if (st.error) {
      el.vigBadge.textContent = 'con problemas';
      el.vigBadge.className = 'enlace-badge mal';
    }

    var partes = [];
    if (st.ultimo) {
      partes.push('<b>' + escapeHtml(st.ultimo.raw) + '</b>');
      partes.push('Informe de las ' + escapeHtml(st.ultimo.hhmm) + 'Z' +
        (st.ultimo.tipo === 'SPECI' ? ' (SPECI)' : '') + (st.ultimo.corregido ? ' corregido' : ''));
    } else {
      partes.push('<span class="vacio">Todavía no se ha leído ningún METAR.</span>');
    }
    if (st.revisado) {
      partes.push('Última revisión: ' + new Date(st.revisado).toLocaleTimeString() +
        ' · ' + st.revisiones + ' revisión(es)');
    }
    if (st.error) partes.push('<span class="status err">' + escapeHtml(st.error) + '</span>');
    el.vigUltimo.innerHTML = partes.join('<br>');

    /* ¿Es uno que no hemos visto? Se propone, no se impone. */
    if (st.ultimo && st.ultimo.raw !== metarVistoUltimo &&
        st.ultimo.raw.trim() !== el.metarRaw.value.trim()) {
      metarVistoUltimo = st.ultimo.raw;
      proponerMetar(st.ultimo);
    }
  }

  function proponerMetar(informe) {
    metarPropuesto = informe;
    el.avisoMetar.hidden = false;
    el.avisoMetarTexto.textContent = 'METAR nuevo de ' + informe.estacion + ', ' +
      informe.hhmm + 'Z: ' + informe.raw.slice(0, 90) + (informe.raw.length > 90 ? '…' : '');
  }

  function usarMetarPropuesto() {
    if (!metarPropuesto) return;
    el.metarRaw.value = metarPropuesto.raw;
    el.avisoMetar.hidden = true;
    var transmitiendo = enAire();
    decodeMetar();                       /* llena el formulario y avanza la letra */
    if (transmitiendo) {
      relevar();
      status(el.scriptStatus, 'METAR aplicado. El ciclo en curso termina y el siguiente ' +
        'sale con la información nueva.', 'ok');
    }
    metarPropuesto = null;
  }

  /* ================================================================== *
   * Comprobación de la instalación
   * Responde a "¿quedó bien instalado?" sin tener que revisar carpetas.
   * ================================================================== */
  var VERSION = '3.0';

  function comprobarInstalacion() {
    var piezas = [
      ['Decodificador de METAR', !!(ATIS.metar && ATIS.metar.parse), true],
      ['Decodificador de NOTAM', !!(ATIS.notam && ATIS.notam.parse), true],
      ['Lectura del archivo del FNS', !!(ATIS.fns && ATIS.fns.fromMatrix), true],
      ['Lector de hojas de cálculo (.xls)', typeof global.XLSX !== 'undefined', true],
      ['Generador del guion', !!(ATIS.script && ATIS.script.build), true],
      ['Motor de locución del navegador', !!(ATIS.speech && ATIS.speech.supported), true],
      ['Voz neuronal local (Piper)', neuralLista(), false],
      ['Aeródromos registrados', !!(ATIS.airports && ATIS.airports.MMMX), true],
      ['Control remoto', !!(ATIS.enlace), false]
    ];
    var faltan = piezas.filter(function (p) { return p[2] && !p[1]; }).length;

    el.saludBadge.textContent = faltan ? faltan + ' problema(s)' : 'instalación completa';
    el.saludBadge.className = 'enlace-badge ' + (faltan ? 'mal' : 'ok');

    var voces = ATIS.speech.diagnostico();
    var filas = piezas.map(function (p) {
      return '<div class="voiceitem' + (p[1] ? ' natural' : (p[2] ? ' falla' : '')) + '">' +
        '<span>' + (p[1] ? '✓' : (p[2] ? '✕' : '–')) + '</span>' +
        '<span class="vname">' + escapeHtml(p[0]) + '</span>' +
        '<span class="vlang">' + (p[1] ? 'presente' : 'falta') + '</span></div>';
    });

    function dato(clave, valor, bien) {
      filas.push('<div class="voiceitem' + (bien === false ? ' falla' : '') + '">' +
        '<span>·</span><span class="vname">' + escapeHtml(clave) + '</span>' +
        '<span class="vlang">' + escapeHtml(valor) + '</span></div>');
    }
    dato('Versión', VERSION);
    dato('Se abrió como', location.protocol === 'file:' ? 'archivo local (sin servidor)' : location.origin);
    dato('Navegador', voces.navegador);
    dato('Internet', voces.enLinea ? 'disponible' : 'sin conexión (el ATIS funciona igual)');
    dato('Voces en español', String(voces.es.length), voces.es.length > 0);
    dato('Voces en inglés', String(voces.en.length), voces.en.length > 0);
    dato('Motor de voz al aire', motorElegido() === 'neuronal' ? 'neuronal local (Piper)' : 'voz del navegador');
    if (ATIS.neural && ATIS.neural.conServidor) {
      var sv = ATIS.neural.servicio();
      dato('Voz neuronal', sv.completa ? 'instalada y completa'
        : (sv.disponible ? 'incompleta: falta ' + (sv.falta || []).join(' y ')
          : (sv.error ? 'no disponible (' + sv.error + ')' : 'no instalada')), sv.completa);
    }

    el.saludLista.innerHTML = filas.join('');
    return { faltan: faltan, piezas: piezas, voces: voces };
  }

  function textoComprobacion() {
    var r = comprobarInstalacion();
    return 'ATIS 3.0 — comprobación de la instalación\n' +
      new Date().toISOString() + '\n' +
      'Versión: ' + VERSION + '\n' +
      'Abierto como: ' + (location.protocol === 'file:' ? 'archivo local' : location.origin) + '\n' +
      'Navegador: ' + r.voces.navegador + '\n' +
      'Internet: ' + (r.voces.enLinea ? 'sí' : 'no') + '\n' +
      'Voces: ' + r.voces.es.length + ' en español, ' + r.voces.en.length + ' en inglés\n\n' +
      r.piezas.map(function (p) {
        return (p[1] ? '[ok]   ' : (p[2] ? '[FALTA]' : '[  -  ]')) + ' ' + p[0];
      }).join('\n') + '\n';
  }

  /* ================================================================== *
   * Control remoto: esta PC transmite, otra manda los datos
   * ================================================================== */
  var enlaceListo = false;
  var aplicandoRemoto = false;

  function nombreEquipo() {
    var papel = ATIS.enlace.estado().papel === 'control' ? 'control' : 'torre';
    return papel + '@' + (location.hostname || 'local');
  }

  function iniciarEnlace() {
    if (!ATIS.enlace.disponible()) { pintarEnlace(ATIS.enlace.estado()); return; }

    ATIS.enlace.alCambiar(pintarEnlace);
    ATIS.enlace.alMetar(pintarVigilancia);
    ATIS.enlace.iniciar({
      nombre: nombreEquipo,
      recoger: estadoCompartido,
      aplicar: function (datos, origen) {
        pendienteRemoto = { datos: datos, origen: origen || 'control remoto' };
        /* Nunca a media frase: si se está transmitiendo, espera al corte de ciclo */
        if (motor().alFinDeCiclo(aplicarRemotoAhora)) pintarPendiente();
      },
      aire: function () {
        var st = motor().state;
        return {
          transmitiendo: st.playing,
          ciclo: st.cycle,
          letra: el.letterBig.textContent,
          pistas: runwaysInUse.join(',')
        };
      }
    });
    enlaceListo = true;
  }

  var pendienteRemoto = null;

  /* Aplica los datos recibidos y, si se estaba transmitiendo, reinicia el bucle
     para que el ciclo siguiente salga ya con la información nueva. */
  function aplicarRemotoAhora() {
    if (!pendienteRemoto) return;
    var p = pendienteRemoto;
    pendienteRemoto = null;
    var transmitiendo = enAire();

    aplicandoRemoto = true;
    try { aplicarCompartido(p.datos, false); } finally { aplicandoRemoto = false; }

    el.pendiente.hidden = true;
    status(el.scriptStatus, 'Datos de ' + p.origen + ' aplicados a las ' +
      new Date().toLocaleTimeString() + '.', 'ok');
    if (transmitiendo) relevar();      /* el bucle sigue y el guion nuevo entra en el corte */
  }

  function pintarPendiente() {
    if (!pendienteRemoto) { el.pendiente.hidden = true; return; }
    el.pendiente.hidden = false;
    el.pendienteTexto.textContent = 'Datos nuevos de ' + pendienteRemoto.origen +
      ': entran al terminar el ciclo en curso.';
  }

  function pintarEnlace(st) {
    var badge = el.enlaceEstado, detalle = el.enlaceDetalle;
    if (!badge) return;

    if (!st.disponible) {
      badge.textContent = 'sin servidor';
      badge.className = 'enlace-badge';
      detalle.innerHTML = 'La aplicación se abrió como archivo suelto, así que trabaja sola. ' +
        'Para controlarla desde otra computadora hay que iniciarla con <code>SERVIDOR.bat</code>.';
      el.enlacePapel.hidden = true;
      el.enlaceEquipos.innerHTML = '';
      return;
    }

    el.enlacePapel.hidden = false;
    badge.textContent = st.conectado ? 'conectado' : 'sin conexión';
    badge.className = 'enlace-badge ' + (st.conectado ? 'ok' : 'mal');

    var partes = [];
    partes.push('Esta computadora es <b>' +
      (st.papel === 'control' ? 'control remoto' : 'la que transmite') + '</b>.');
    partes.push('Dirección para las demás: <code>' + escapeHtml(st.direccion) + '</code>');
    if (st.ultimaRecepcion) partes.push('Último dato recibido: ' + st.ultimaRecepcion.toLocaleTimeString() +
      (st.origen ? ' de ' + escapeHtml(st.origen) : ''));
    if (st.ultimoEnvio) partes.push('Último envío: ' + st.ultimoEnvio.toLocaleTimeString());
    if (!st.conectado && st.error) partes.push('<span class="status err">Sin contacto con el servidor (' +
      escapeHtml(st.error) + '). La transmisión sigue con los últimos datos.</span>');
    detalle.innerHTML = partes.join('<br>');

    Array.prototype.forEach.call(el.enlacePapel.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.dataset.papel === st.papel);
    });

    el.enlaceEquipos.innerHTML = (st.equipos || []).map(function (eq) {
      var aire = eq.aire && eq.aire.transmitiendo
        ? '<span class="badge enaire">al aire · ciclo ' + eq.aire.ciclo + ' · info ' + escapeHtml(eq.aire.letra || '') + '</span>'
        : '';
      return '<div class="equipo"><span class="eqp ' + eq.papel + '">' + eq.papel + '</span>' +
        '<span class="eqn">' + escapeHtml(eq.nombre) + '</span>' + aire + '</div>';
    }).join('') || '<span class="status">Nadie más conectado.</span>';

    /* En modo control esta PC no saca audio: manda datos */
    var control = st.papel === 'control';
    el.btnPlay.disabled = control;
    if (control) el.btnPlay.title = 'Esta computadora es control remoto: el audio sale en la PC de la torre';
    document.body.classList.toggle('modo-control', control);
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
    var eventos = motor().registro();
    el.logList.innerHTML = '';
    if (!eventos.length) {
      el.logList.innerHTML = '<span class="logvacio">Sin eventos todavía. Pulse TRANSMITIR.</span>';
      return;
    }
    eventos.forEach(pintarEvento);
  }

  function textoRegistro() {
    var eventos = motor().registro();
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
  /* Lo operativo: el ATIS en sí. Es lo que viaja entre computadoras. */
  function estadoCompartido() {
    var m = readModel();
    return {
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
      libre: { activo: el.libreActivo.checked, es: el.libreEs.value, en: el.libreEn.value }
    };
  }

  /* Lo de esta máquina: voces instaladas, velocidad, idiomas disponibles.
     No se comparte, porque cada computadora tiene lo suyo. */
  function estadoLocal() {
    return {
      voices: motorElegido() === 'neuronal' ? (savedVoices || { es: '', en: '' })
        : { es: el.voiceEs.value, en: el.voiceEn.value },
      vocesN: motorElegido() === 'neuronal' ? { es: el.voiceEs.value, en: el.voiceEn.value }
        : (savedVocesN || { es: '', en: '' }),
      rate: el.rate.value, gap: el.gap.value, sentencePause: el.sentencePause.value,
      langEs: quiereIdioma.es, langEn: quiereIdioma.en
    };
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var datos = estadoCompartido();
        var local = estadoLocal();
        for (var k in local) if (Object.prototype.hasOwnProperty.call(local, k)) datos[k] = local[k];
        localStorage.setItem(STORE_KEY, JSON.stringify(datos));
      } catch (e) { /* almacenamiento no disponible */ }
      if (enlaceListo) ATIS.enlace.enviar();
    }, 400);
  }

  function restore() {
    var data;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { data = null; }
    if (!data) { renderNotams(); return; }
    aplicarCompartido(data, true);
    aplicarLocal(data);
  }

  /* Aplica el ATIS recibido (del disco o de otra computadora) */
  function aplicarCompartido(data, inicial) {
    if (!data) return;
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
    savedApproachRwy = c.approachRunway || '';
    el.additionalEs.value = c.additionalEs || '';
    el.additionalEn.value = c.additionalEn || '';
    el.includeNotams.checked = data.includeNotams !== false;
    el.includeHpa.checked = !!data.includeHpa;
    if (data.notamSoloVigentes !== undefined) el.notamSoloVigentes.checked = data.notamSoloVigentes;
    if (data.libre) {
      el.libreActivo.checked = !!data.libre.activo;
      el.libreEs.value = data.libre.es || '';
      el.libreEn.value = data.libre.en || '';
    }
    notams = [];
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
    if (!inicial) { applyAirport(el.station.value, true); paintChips(); render(); }
  }

  function aplicarLocal(data) {
    if (!data) return;
    if (data.rate) el.rate.value = data.rate;
    el.rateVal.textContent = (+el.rate.value).toFixed(2);
    if (data.gap) el.gap.value = data.gap;
    if (data.sentencePause !== undefined) el.sentencePause.value = data.sentencePause;
    if (data.langEs !== undefined) { quiereIdioma.es = !!data.langEs; el.langEs.checked = !!data.langEs; }
    if (data.langEn !== undefined) { quiereIdioma.en = !!data.langEn; el.langEn.checked = !!data.langEn; }
    savedVoices = data.voices || null;
    savedVocesN = data.vocesN || null;
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
      if (i >= 0) {
        runwaysInUse.splice(i, 1);
      } else {
        /* "05" ya incluye 05L y 05R: marcar uno descarta el otro */
        var numero = r.slice(0, 2);
        var sinLado = r.length === 2;
        runwaysInUse = runwaysInUse.filter(function (x) {
          if (x.slice(0, 2) !== numero) return true;
          return sinLado ? false : x.length !== 2;
        });
        runwaysInUse.push(r);
      }
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

    /* Arrastrar el archivo encima, por si el selector de Windows da problemas */
    ['dragenter', 'dragover'].forEach(function (ev) {
      on(el.notamSoltar, ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        el.notamSoltar.classList.add('encima');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      on(el.notamSoltar, ev, function (e) {
        e.preventDefault(); e.stopPropagation();
        el.notamSoltar.classList.remove('encima');
      });
    });
    on(el.notamSoltar, 'drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) importarArchivo(f);
    });
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

    on(el.btnPlay, 'click', function () {
      if (enAire()) relevar(false); else play(false);
    });
    on(el.btnIgual, 'click', function () {
      if (enAire()) relevar(true); else play(true);
    });
    on(el.btnCorregir, 'click', function () {
      el.preflight.hidden = true;
      mostrarPagina('pageAtis');
    });

    on(el.btnPrev, 'click', function () { motor().saltar(-1); });
    on(el.btnNext, 'click', function () { motor().saltar(1); });
    on(el.posicion, 'input', function () { arrastrando = true; el.posTexto.textContent = (+el.posicion.value + 1) + ' / ' + (+el.posicion.max + 1); });
    on(el.posicion, 'change', function () {
      arrastrando = false;
      motor().irA(+el.posicion.value);
    });

    ['libreActivo', 'libreEs', 'libreEn'].forEach(function (id) {
      on(el[id], 'input', scheduleRender);
      on(el[id], 'change', scheduleRender);
    });

    /* La edad de la observación avanza sola */
    setInterval(function () { pintarEdadMetar(); pintarVerificacion(); }, 30000);
    on(el.btnStop, 'click', stop);
    on(el.btnTestEs, 'click', function () {
      probarVoz('es');
    });
    on(el.btnTestEn, 'click', function () {
      probarVoz('en');
    });
    /* Clic en una voz de la lista: se escucha y queda seleccionada */
    [el.voiceListEs, el.voiceListEn].forEach(function (lista) {
      on(lista, 'click', function (e) {
        var item = e.target.closest ? e.target.closest('.voiceitem') : null;
        if (!item) return;
        var nombre = item.dataset.voz, lang = item.dataset.lang;
        selectIfPresent(lang === 'es' ? el.voiceEs : el.voiceEn, nombre);
        probarVoz(lang, nombre);
        save();
        updateVoiceReport();
      });
    });

    ['vigActiva', 'vigUrl', 'vigEstacion', 'vigMinutos'].forEach(function (id) {
      on(el[id], 'change', guardarVigilancia);
    });
    on(el.btnVigAhora, 'click', function () {
      status(el.vigStatus, 'Revisando la fuente…');
      fetch('/api/metar?revisar=1', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (st) {
          pintarVigilancia(st);
          status(el.vigStatus, st.error ? 'No se pudo: ' + st.error
            : (st.ultimo ? 'Leído el de las ' + st.ultimo.hhmm + 'Z.' : 'Sin METAR en la página.'),
            st.error ? 'err' : 'ok');
        })
        .catch(function (e) { status(el.vigStatus, 'No se pudo: ' + e.message, 'err'); });
    });
    on(el.btnUsarMetar, 'click', usarMetarPropuesto);
    on(el.btnIgnorarMetar, 'click', function () {
      el.avisoMetar.hidden = true;
      metarPropuesto = null;
    });

    /* ---- Voz neuronal ---- */
    on(el.motorSel, 'change', function () {
      prefMotor = el.motorSel.value;
      guardarMotor();
      if (prefMotor !== 'navegador' && !neuralLista()) {
        revisarNeural(true).then(function () {
          if (!neuralLista()) {
            status(el.vozNStatus, 'La voz neuronal todavía no está disponible: ' +
              (ATIS.neural.conServidor ? (ATIS.neural.servicio().falta || []).join(' y ') ||
                ATIS.neural.servicio().error : 'hace falta abrir el ATIS con SERVIDOR.bat') +
              '. Mientras tanto sale la voz del navegador.', 'err');
          } else {
            status(el.vozNStatus, 'Voz neuronal lista.', 'ok');
          }
        });
        return;
      }
      pintarNeural();
      llenarVoces();
      updateVoiceReport();
      pintarVerificacion();
      status(el.vozNStatus, enAire()
        ? 'Guardado. El cambio de motor entra en el próximo TRANSMITIR.'
        : 'Guardado.', 'ok');
      save();
    });

    on(el.btnVozNRevisar, 'click', function () {
      status(el.vozNStatus, 'Comprobando…');
      revisarNeural(true).then(function (sv) {
        if (!sv) { status(el.vozNStatus, 'Hace falta abrir el ATIS con SERVIDOR.bat.', 'err'); return; }
        if (sv.completa) status(el.vozNStatus, 'Instalada y completa: ' +
          sv.voces.map(function (v) { return v.nombre; }).join(', '), 'ok');
        else if (sv.disponible) status(el.vozNStatus, 'Incompleta: falta ' + sv.falta.join(' y '), 'err');
        else status(el.vozNStatus, sv.error
          ? 'No se pudo preguntar al servidor: ' + sv.error
          : 'No está instalada. Ejecute VOZ.bat una vez, con internet.', 'err');
      });
    });

    on(el.btnVozNLimpiar, 'click', function () {
      if (!ATIS.neural || !ATIS.neural.conServidor) {
        status(el.vozNStatus, 'Hace falta el servidor.', 'err'); return;
      }
      ATIS.neural.limpiarCacheServidor().then(function (d) {
        status(el.vozNStatus, 'Se borraron ' + d.borrados + ' audios guardados. ' +
          'El próximo TRANSMITIR los vuelve a generar.', 'ok');
        pintarNeural();
      }).catch(function (e) { status(el.vozNStatus, 'No se pudo vaciar: ' + e.message, 'err'); });
    });

    on(el.btnSaludCopy, 'click', function () {
      var texto = textoComprobacion();
      if (navigator.clipboard) navigator.clipboard.writeText(texto);
      status(el.saludStatus, 'Comprobación copiada al portapapeles.', 'ok');
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
    on(el.langEs, 'change', function () {
      quiereIdioma.es = el.langEs.checked;
      save(); updateVoiceReport();
    });
    on(el.langEn, 'change', function () {
      quiereIdioma.en = el.langEn.checked;
      save(); updateVoiceReport();
    });
    on(el.voiceEs, 'change', function () { save(); updateVoiceReport(); });
    on(el.voiceEn, 'change', function () { save(); updateVoiceReport(); });

    on(el.btnTema, 'click', function () {
      aplicarModo(temaActual() === 'dark' ? 'light' : 'dark', true);
    });
    on(el.btnAplicarYa, 'click', aplicarRemotoAhora);

    on(el.enlacePapel, 'click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-papel]') : null;
      if (!b) return;
      if (b.dataset.papel === 'transmisor' || confirm(
          'En modo control remoto esta computadora deja de sacar audio y solo manda ' +
          'los datos a la PC de la torre. ¿Continuar?')) {
        ATIS.enlace.fijarPapel(b.dataset.papel);
      }
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
      status(el.logStatus, 'Registro copiado (' + motor().registro().length + ' eventos).', 'ok');
    });
    on(el.btnLogClear, 'click', function () {
      ATIS.speech.limpiarRegistro();
      if (ATIS.neural) ATIS.neural.limpiarRegistro();
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
        if (enAire()) stop(); else play();
      }
    });

    global.addEventListener('beforeunload', function () {
      ATIS.speech.stop();
      if (ATIS.neural) ATIS.neural.stop();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(this);
