/* ATIS 3.0 - Diccionarios de codigos aeronauticos (METAR / NOTAM)
 * Cada entrada tiene forma { es: '...', en: '...' }
 */
(function (global) {
  'use strict';
  var ATIS = global.ATIS = global.ATIS || {};

  /* ------------------------------------------------------------------ *
   * METAR: fenomenos meteorologicos presentes
   * ------------------------------------------------------------------ */
  var INTENSITY = {
    '-': { es: 'ligera', en: 'light' },
    '+': { es: 'fuerte', en: 'heavy' },
    'VC': { es: 'en las cercanias', en: 'in the vicinity' }
  };

  var DESCRIPTOR = {
    MI: { es: 'banco bajo de', en: 'shallow' },
    BC: { es: 'bancos de', en: 'patches of' },
    PR: { es: 'parcial', en: 'partial' },
    DR: { es: 'baja levantada por el viento', en: 'low drifting' },
    BL: { es: 'levantada por el viento', en: 'blowing' },
    SH: { es: 'chubascos de', en: 'showers of' },
    TS: { es: 'tormenta con', en: 'thunderstorm with' },
    FZ: { es: 'engelante', en: 'freezing' }
  };

  var PHENOMENON = {
    DZ: { es: 'llovizna', en: 'drizzle' },
    RA: { es: 'lluvia', en: 'rain' },
    SN: { es: 'nieve', en: 'snow' },
    SG: { es: 'cinarra', en: 'snow grains' },
    IC: { es: 'cristales de hielo', en: 'ice crystals' },
    PL: { es: 'granulos de hielo', en: 'ice pellets' },
    GR: { es: 'granizo', en: 'hail' },
    GS: { es: 'granizo menudo', en: 'small hail' },
    UP: { es: 'precipitacion desconocida', en: 'unknown precipitation' },
    BR: { es: 'neblina', en: 'mist' },
    FG: { es: 'niebla', en: 'fog' },
    FU: { es: 'humo', en: 'smoke' },
    VA: { es: 'ceniza volcanica', en: 'volcanic ash' },
    DU: { es: 'polvo extendido', en: 'widespread dust' },
    SA: { es: 'arena', en: 'sand' },
    HZ: { es: 'bruma', en: 'haze' },
    PY: { es: 'rocio de agua', en: 'spray' },
    PO: { es: 'remolinos de polvo o arena', en: 'dust or sand whirls' },
    SQ: { es: 'turbonada', en: 'squall' },
    FC: { es: 'tromba o tornado', en: 'funnel cloud or tornado' },
    SS: { es: 'tempestad de arena', en: 'sandstorm' },
    DS: { es: 'tempestad de polvo', en: 'duststorm' },
    TS: { es: 'tormenta', en: 'thunderstorm' }
  };

  var CLOUD_AMOUNT = {
    FEW: { es: 'pocas nubes', en: 'few clouds', short_es: 'pocas', short_en: 'few' },
    SCT: { es: 'nubosidad dispersa', en: 'scattered clouds', short_es: 'dispersas', short_en: 'scattered' },
    BKN: { es: 'cielo fragmentado', en: 'broken clouds', short_es: 'fragmentado', short_en: 'broken' },
    OVC: { es: 'cielo cubierto', en: 'overcast', short_es: 'cubierto', short_en: 'overcast' }
  };

  var CLOUD_TYPE = {
    CB: { es: 'cumulonimbus', en: 'cumulonimbus' },
    TCU: { es: 'cumulos en torre', en: 'towering cumulus' }
  };

  var SKY_STATE = {
    NSC: { es: 'sin nubes de importancia operacional', en: 'no significant cloud' },
    NCD: { es: 'sin nubes detectadas', en: 'no cloud detected' },
    SKC: { es: 'cielo despejado', en: 'sky clear' },
    CLR: { es: 'cielo despejado por debajo de 12 mil pies', en: 'clear below one two thousand feet' }
  };

  var TREND = {
    NOSIG: { es: 'sin cambios significativos', en: 'no significant change' },
    BECMG: { es: 'cambiando a', en: 'becoming' },
    TEMPO: { es: 'temporalmente', en: 'temporarily' }
  };

  /* ------------------------------------------------------------------ *
   * NOTAM: contracciones ICAO Doc 8400 (las de uso mas frecuente)
   * ------------------------------------------------------------------ */
  var CONTRACTIONS = {
    ABN: { es: 'faro de aerodromo', en: 'aerodrome beacon' },
    ABV: { es: 'arriba de', en: 'above' },
    ACFT: { es: 'aeronave', en: 'aircraft' },
    ACT: { es: 'activo', en: 'active' },
    AD: { es: 'aerodromo', en: 'aerodrome' },
    ADJ: { es: 'adyacente', en: 'adjacent' },
    AFT: { es: 'despues de', en: 'after' },
    AGL: { es: 'sobre el nivel del terreno', en: 'above ground level' },
    AMSL: { es: 'sobre el nivel medio del mar', en: 'above mean sea level' },
    APCH: { es: 'aproximacion', en: 'approach' },
    APN: { es: 'plataforma', en: 'apron' },
    APP: { es: 'control de aproximacion', en: 'approach control' },
    ARP: { es: 'punto de referencia del aerodromo', en: 'aerodrome reference point' },
    ARR: { es: 'llegada', en: 'arrival' },
    ASPH: { es: 'asfalto', en: 'asphalt' },
    ATS: { es: 'servicios de transito aereo', en: 'air traffic services' },
    AVBL: { es: 'disponible', en: 'available' },
    AWY: { es: 'aerovia', en: 'airway' },
    BCN: { es: 'faro', en: 'beacon' },
    BLW: { es: 'debajo de', en: 'below' },
    BTN: { es: 'entre', en: 'between' },
    CL: { es: 'eje de pista', en: 'runway centre line' },
    CLSD: { es: 'cerrada', en: 'closed' },
    CTN: { es: 'precaucion', en: 'caution' },
    DEP: { es: 'salida', en: 'departure' },
    DME: { es: 'equipo radiotelemetrico DME', en: 'distance measuring equipment' },
    DRG: { es: 'durante', en: 'during' },
    DTHR: { es: 'umbral desplazado', en: 'displaced threshold' },
    DUE: { es: 'debido a', en: 'due to' },
    EXC: { es: 'excepto', en: 'except' },
    FATO: { es: 'area de aproximacion final y despegue', en: 'final approach and take-off area' },
    FLW: { es: 'siguiente', en: 'following' },
    FM: { es: 'desde', en: 'from' },
    FREQ: { es: 'frecuencia', en: 'frequency' },
    GLD: { es: 'planeador', en: 'glider' },
    GP: { es: 'senda de planeo', en: 'glide path' },
    GND: { es: 'terreno', en: 'ground' },
    HEL: { es: 'helicoptero', en: 'helicopter' },
    HGT: { es: 'altura', en: 'height' },
    HJ: { es: 'del orto al ocaso', en: 'sunrise to sunset' },
    HN: { es: 'del ocaso al orto', en: 'sunset to sunrise' },
    HOL: { es: 'dia feriado', en: 'holiday' },
    HR: { es: 'horas', en: 'hours' },
    ILS: { es: 'sistema de aterrizaje por instrumentos', en: 'instrument landing system' },
    INOP: { es: 'inoperativo', en: 'inoperative' },
    INSTR: { es: 'instrumento', en: 'instrument' },
    LDG: { es: 'aterrizaje', en: 'landing' },
    LGT: { es: 'luces', en: 'lighting' },
    LLZ: { es: 'localizador', en: 'localizer' },
    MAINT: { es: 'mantenimiento', en: 'maintenance' },
    MIL: { es: 'militar', en: 'military' },
    NDB: { es: 'radiofaro no direccional', en: 'non-directional radio beacon' },
    NML: { es: 'normal', en: 'normal' },
    NR: { es: 'numero', en: 'number' },
    OBST: { es: 'obstaculo', en: 'obstacle' },
    OPR: { es: 'operar u operador', en: 'operate or operator' },
    PAPI: { es: 'indicador de trayectoria de aproximacion de precision', en: 'precision approach path indicator' },
    PARL: { es: 'paralelo', en: 'parallel' },
    PERM: { es: 'permanente', en: 'permanent' },
    PJE: { es: 'salto en paracaidas', en: 'parachute jumping exercise' },
    PSN: { es: 'posicion', en: 'position' },
    RTE: { es: 'ruta', en: 'route' },
    RVR: { es: 'alcance visual en la pista', en: 'runway visual range' },
    RWY: { es: 'pista', en: 'runway' },
    SFC: { es: 'superficie', en: 'surface' },
    SID: { es: 'salida normalizada por instrumentos', en: 'standard instrument departure' },
    STAR: { es: 'llegada normalizada por instrumentos', en: 'standard instrument arrival' },
    SVC: { es: 'servicio', en: 'service' },
    TAR: { es: 'radar de area terminal', en: 'terminal area surveillance radar' },
    TFC: { es: 'transito', en: 'traffic' },
    THR: { es: 'umbral', en: 'threshold' },
    TIL: { es: 'hasta', en: 'until' },
    TKOF: { es: 'despegue', en: 'take-off' },
    TWR: { es: 'torre de control', en: 'control tower' },
    TWY: { es: 'calle de rodaje', en: 'taxiway' },
    UFN: { es: 'hasta nuevo aviso', en: 'until further notice' },
    UNL: { es: 'ilimitado', en: 'unlimited' },
    'U/S': { es: 'fuera de servicio', en: 'unserviceable' },
    VOR: { es: 'radiofaro omnidireccional VHF', en: 'VHF omnidirectional radio range' },
    WDI: { es: 'indicador de direccion del viento', en: 'wind direction indicator' },
    WIE: { es: 'con efecto inmediato', en: 'with immediate effect' },
    WIP: { es: 'trabajos en curso', en: 'work in progress' },
    WI: { es: 'dentro de', en: 'within' }
  };

  /* Codigos Q: materia (letras 2 y 3) */
  var Q_SUBJECT = {
    FA: { es: 'aerodromo', en: 'aerodrome' },
    FF: { es: 'servicio de salvamento y extincion de incendios', en: 'fire fighting and rescue' },
    FM: { es: 'servicio meteorologico', en: 'meteorological service' },
    FU: { es: 'disponibilidad de combustible', en: 'fuel availability' },
    MR: { es: 'pista', en: 'runway' },
    MS: { es: 'zona de parada', en: 'stopway' },
    MT: { es: 'umbral', en: 'threshold' },
    MU: { es: 'bahia de viraje en pista', en: 'runway turning bay' },
    MW: { es: 'franja o margen de pista', en: 'strip or shoulder' },
    MX: { es: 'calle de rodaje', en: 'taxiway' },
    MN: { es: 'plataforma', en: 'apron' },
    MP: { es: 'puestos de estacionamiento de aeronaves', en: 'aircraft stands' },
    MK: { es: 'area de estacionamiento', en: 'parking area' },
    LA: { es: 'sistema de iluminacion de aproximacion', en: 'approach lighting system' },
    LB: { es: 'faro de aerodromo', en: 'aerodrome beacon' },
    LC: { es: 'luces de eje de pista', en: 'runway centre line lights' },
    LE: { es: 'luces de borde de pista', en: 'runway edge lights' },
    LP: { es: 'indicador PAPI', en: 'precision approach path indicator' },
    LT: { es: 'luces de umbral', en: 'threshold lights' },
    LZ: { es: 'luces de zona de toma de contacto', en: 'runway touchdown zone lights' },
    IC: { es: 'sistema ILS', en: 'instrument landing system' },
    ID: { es: 'equipo DME del ILS', en: 'ILS DME' },
    IG: { es: 'senda de planeo del ILS', en: 'glide path' },
    IL: { es: 'localizador del ILS', en: 'localizer' },
    IM: { es: 'radiobaliza intermedia', en: 'middle marker' },
    IO: { es: 'radiobaliza exterior', en: 'outer marker' },
    NA: { es: 'todas las radioayudas para la navegacion', en: 'all radio navigation facilities' },
    NB: { es: 'radiofaro no direccional', en: 'non-directional radio beacon' },
    ND: { es: 'equipo DME', en: 'distance measuring equipment' },
    NM: { es: 'VOR/DME', en: 'VOR/DME' },
    NV: { es: 'radiofaro VOR', en: 'VOR' },
    CA: { es: 'instalacion aire-tierra', en: 'air/ground facility' },
    CE: { es: 'radar de vigilancia en ruta', en: 'en-route surveillance radar' },
    PI: { es: 'procedimiento de aproximacion por instrumentos', en: 'instrument approach procedure' },
    PA: { es: 'llegada normalizada por instrumentos', en: 'standard instrument arrival' },
    PD: { es: 'salida normalizada por instrumentos', en: 'standard instrument departure' },
    PH: { es: 'procedimiento de espera', en: 'holding procedure' },
    PM: { es: 'minimos de operacion de aerodromo', en: 'aerodrome operating minima' },
    PT: { es: 'altitud o nivel de transicion', en: 'transition altitude or level' },
    PU: { es: 'procedimiento de aproximacion frustrada', en: 'missed approach procedure' },
    RA: { es: 'reserva de espacio aereo', en: 'airspace reservation' },
    RD: { es: 'zona peligrosa', en: 'danger area' },
    RP: { es: 'zona prohibida', en: 'prohibited area' },
    RR: { es: 'zona restringida', en: 'restricted area' },
    RT: { es: 'zona restringida temporal', en: 'temporary restricted area' },
    WA: { es: 'exhibicion aerea', en: 'air display' },
    WE: { es: 'ejercicios', en: 'exercises' },
    WM: { es: 'lanzamiento de cohetes o disparos', en: 'missile, gun or rocket firing' },
    WP: { es: 'salto en paracaidas', en: 'parachute jumping' },
    WU: { es: 'aeronave no tripulada', en: 'unmanned aircraft' },
    WW: { es: 'actividad volcanica significativa', en: 'significant volcanic activity' },
    WZ: { es: 'vuelo de aeromodelos', en: 'model flying' },
    OB: { es: 'obstaculo', en: 'obstacle' },
    OL: { es: 'iluminacion de obstaculo', en: 'obstacle lighting' }
  };

  /* Codigos Q: condicion (letras 4 y 5) */
  var Q_CONDITION = {
    AC: { es: 'retirado por mantenimiento', en: 'withdrawn for maintenance' },
    AD: { es: 'disponible para operacion diurna', en: 'available for daylight operation' },
    AH: { es: 'horario de servicio ahora', en: 'hours of service now' },
    AK: { es: 'reanudo operaciones normales', en: 'resumed normal operations' },
    AL: { es: 'operativo sujeto a condiciones publicadas', en: 'operative subject to published conditions' },
    AM: { es: 'solo operaciones militares', en: 'military operations only' },
    AN: { es: 'disponible para operacion nocturna', en: 'available for night operation' },
    AO: { es: 'operacional', en: 'operational' },
    AP: { es: 'disponible con permiso previo', en: 'available, prior permission required' },
    AR: { es: 'disponible a solicitud', en: 'available on request' },
    AS: { es: 'fuera de servicio', en: 'unserviceable' },
    AU: { es: 'no disponible', en: 'not available' },
    AW: { es: 'retirado completamente', en: 'completely withdrawn' },
    AX: { es: 'se cancela el cierre publicado', en: 'previously announced shutdown cancelled' },
    CA: { es: 'activado', en: 'activated' },
    CC: { es: 'terminado', en: 'completed' },
    CD: { es: 'desactivado', en: 'deactivated' },
    CE: { es: 'erigido', en: 'erected' },
    CF: { es: 'frecuencia de operacion cambiada a', en: 'operating frequency changed to' },
    CH: { es: 'modificado', en: 'changed' },
    CI: { es: 'identificacion o distintivo de llamada cambiado a', en: 'identification or radio call sign changed to' },
    CL: { es: 'realineado', en: 'realigned' },
    CM: { es: 'desplazado', en: 'displaced' },
    CN: { es: 'cancelado', en: 'cancelled' },
    CO: { es: 'en operacion', en: 'operating' },
    CP: { es: 'operando con potencia reducida', en: 'operating on reduced power' },
    CR: { es: 'reemplazado temporalmente por', en: 'temporarily replaced by' },
    CS: { es: 'instalado', en: 'installed' },
    CT: { es: 'en prueba, no utilizar', en: 'on test, do not use' },
    HA: { es: 'accion de frenado', en: 'braking action' },
    HB: { es: 'coeficiente de friccion', en: 'friction coefficient' },
    HE: { es: 'cubierto de agua', en: 'covered by water' },
    HH: { es: 'peligro debido a', en: 'hazard due to' },
    HK: { es: 'migracion de aves en curso', en: 'bird migration in progress' },
    HM: { es: 'marcado por', en: 'marked by' },
    HQ: { es: 'operacion cancelada', en: 'operation cancelled' },
    HR: { es: 'agua estancada', en: 'standing water' },
    HV: { es: 'trabajos terminados', en: 'work completed' },
    HW: { es: 'trabajos en curso', en: 'work in progress' },
    HX: { es: 'concentracion de aves', en: 'concentration of birds' },
    LA: { es: 'operando con fuente de energia auxiliar', en: 'operating on auxiliary power supply' },
    LC: { es: 'cerrada', en: 'closed' },
    LD: { es: 'inseguro', en: 'unsafe' },
    LF: { es: 'interferencia de', en: 'interference from' },
    LG: { es: 'operando sin identificacion', en: 'operating without identification' },
    LH: { es: 'inutilizable para aeronaves mas pesadas que', en: 'unusable for aircraft heavier than' },
    LI: { es: 'cerrado a operaciones IFR', en: 'closed to IFR operations' },
    LL: { es: 'utilizable con longitud y anchura de', en: 'usable for length and width of' },
    LN: { es: 'cerrado a operaciones nocturnas', en: 'closed to all night operations' },
    LP: { es: 'prohibido a', en: 'prohibited to' },
    LR: { es: 'aeronaves restringidas a pistas y calles de rodaje', en: 'aircraft restricted to runways and taxiways' },
    LS: { es: 'sujeto a interrupcion', en: 'subject to interruption' },
    LT: { es: 'limitado a', en: 'limited to' },
    LV: { es: 'cerrado a operaciones VFR', en: 'closed to VFR operations' },
    LW: { es: 'se llevara a cabo', en: 'will take place' },
    LX: { es: 'operando pero se recomienda precaucion', en: 'operating but caution advised' },
    XX: { es: 'lenguaje claro', en: 'plain language' }
  };

  var Q_TRAFFIC = {
    I: { es: 'IFR', en: 'IFR' },
    V: { es: 'VFR', en: 'VFR' },
    IV: { es: 'IFR y VFR', en: 'IFR and VFR' },
    K: { es: 'lista de verificacion', en: 'checklist' }
  };

  var Q_PURPOSE = {
    N: { es: 'atencion inmediata', en: 'immediate attention' },
    B: { es: 'de importancia operacional', en: 'operational significance' },
    O: { es: 'para operaciones de vuelo', en: 'flight operations' },
    M: { es: 'diverso', en: 'miscellaneous' },
    K: { es: 'lista de verificacion', en: 'checklist' }
  };

  var Q_SCOPE = {
    A: { es: 'aerodromo', en: 'aerodrome' },
    E: { es: 'en ruta', en: 'en-route' },
    W: { es: 'aviso a la navegacion', en: 'navigation warning' },
    AE: { es: 'aerodromo y en ruta', en: 'aerodrome and en-route' },
    AW: { es: 'aerodromo y aviso a la navegacion', en: 'aerodrome and navigation warning' },
    K: { es: 'lista de verificacion', en: 'checklist' }
  };

  ATIS.dict = {
    INTENSITY: INTENSITY,
    DESCRIPTOR: DESCRIPTOR,
    PHENOMENON: PHENOMENON,
    CLOUD_AMOUNT: CLOUD_AMOUNT,
    CLOUD_TYPE: CLOUD_TYPE,
    SKY_STATE: SKY_STATE,
    TREND: TREND,
    CONTRACTIONS: CONTRACTIONS,
    Q_SUBJECT: Q_SUBJECT,
    Q_CONDITION: Q_CONDITION,
    Q_TRAFFIC: Q_TRAFFIC,
    Q_PURPOSE: Q_PURPOSE,
    Q_SCOPE: Q_SCOPE
  };
})(this);
