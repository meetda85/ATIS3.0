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
    PL: { es: 'gránulos de hielo', en: 'ice pellets' },
    GR: { es: 'granizo', en: 'hail' },
    GS: { es: 'granizo menudo', en: 'small hail' },
    UP: { es: 'precipitación desconocida', en: 'unknown precipitation' },
    BR: { es: 'neblina', en: 'mist' },
    FG: { es: 'niebla', en: 'fog' },
    FU: { es: 'humo', en: 'smoke' },
    VA: { es: 'ceniza volcánica', en: 'volcanic ash' },
    DU: { es: 'polvo extendido', en: 'widespread dust' },
    SA: { es: 'arena', en: 'sand' },
    HZ: { es: 'bruma', en: 'haze' },
    PY: { es: 'rocío de agua', en: 'spray' },
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
    ABN: { es: 'faro de aeródromo', en: 'aerodrome beacon' },
    ABV: { es: 'arriba de', en: 'above' },
    ACFT: { es: 'aeronave', en: 'aircraft' },
    ACT: { es: 'activo', en: 'active' },
    AD: { es: 'aeródromo', en: 'aerodrome' },
    ADJ: { es: 'adyacente', en: 'adjacent' },
    AFT: { es: 'después de', en: 'after' },
    AGL: { es: 'sobre el nivel del terreno', en: 'above ground level' },
    AMSL: { es: 'sobre el nivel medio del mar', en: 'above mean sea level' },
    APCH: { es: 'aproximación', en: 'approach' },
    APN: { es: 'plataforma', en: 'apron' },
    APP: { es: 'control de aproximación', en: 'approach control' },
    ARP: { es: 'punto de referencia del aeródromo', en: 'aerodrome reference point' },
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
    DME: { es: 'equipo radiotelemétrico DME', en: 'distance measuring equipment' },
    DRG: { es: 'durante', en: 'during' },
    DTHR: { es: 'umbral desplazado', en: 'displaced threshold' },
    DUE: { es: 'debido a', en: 'due to' },
    EXC: { es: 'excepto', en: 'except' },
    FATO: { es: 'área de aproximación final y despegue', en: 'final approach and take-off area' },
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
    NR: { es: 'número', en: 'number' },
    OBST: { es: 'obstaculo', en: 'obstacle' },
    OPR: { es: 'operando', en: 'operating' },
    PAPI: { es: 'indicador de trayectoria de aproximación de precision', en: 'precision approach path indicator' },
    PARL: { es: 'paralelo', en: 'parallel' },
    PERM: { es: 'permanente', en: 'permanent' },
    PJE: { es: 'salto en paracaídas', en: 'parachute jumping exercise' },
    PSN: { es: 'posición', en: 'position' },
    RTE: { es: 'ruta', en: 'route' },
    RVR: { es: 'alcance visual en la pista', en: 'runway visual range' },
    RWY: { es: 'pista', en: 'runway' },
    RWYS: { es: 'pistas', en: 'runways' },
    TWYS: { es: 'calles de rodaje', en: 'taxiways' },
    ACFTS: { es: 'aeronaves', en: 'aircraft' },
    LGTS: { es: 'luces', en: 'lights' },
    FLG: { es: 'de destello', en: 'flashing' },
    SEQ: { es: 'secuencial', en: 'sequenced' },
    ALS: { es: 'sistema de luces de aproximación', en: 'approach lighting system' },
    REDL: { es: 'luces de borde de pista', en: 'runway edge lights' },
    RCLL: { es: 'luces de eje de pista', en: 'runway centre line lights' },
    TDZ: { es: 'zona de toma de contacto', en: 'touchdown zone' },
    ASDA: { es: 'distancia disponible de aceleración-parada', en: 'accelerate stop distance available' },
    LDA: { es: 'distancia disponible de aterrizaje', en: 'landing distance available' },
    TORA: { es: 'recorrido de despegue disponible', en: 'take-off run available' },
    NOTAM: { es: 'NOTAM', en: 'NOTAM' },
    SFC: { es: 'superficie', en: 'surface' },
    SID: { es: 'salida normalizada por instrumentos', en: 'standard instrument departure' },
    STAR: { es: 'llegada normalizada por instrumentos', en: 'standard instrument arrival' },
    SVC: { es: 'servicio', en: 'service' },
    TAR: { es: 'radar de área terminal', en: 'terminal area surveillance radar' },
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

  /* Frases completas de los NOTAM (se sustituyen antes que las palabras sueltas) */
  var FRASES_ES = [
    ['ACFT STANDS', 'posiciones de estacionamiento'],
    ['ACFT STAND', 'posición de estacionamiento'],
    ['NOT USEFUL FOR', 'no utilizable para'],
    ['USEFUL ONLY FOR', 'utilizable solamente para'],
    ['USABLE ONLY FOR', 'utilizable solamente para'],
    ['NOT AVBL FOR', 'no disponible para'],
    ['WORK IN PROGRESS', 'trabajos en curso'],
    ['OUT OF SERVICE', 'fuera de servicio'],
    ['DUE TO', 'debido a'],
    ['OPR IN FREQ', 'operando en la frecuencia'],
    ['OPR ON FREQ', 'operando en la frecuencia'],
    ['SEQUENCED FLG LGT', 'luces de destello secuencial'],
    ['SEQUENCED FLASHING LIGHTS', 'luces de destello secuencial'],
    ['AND MINORS', 'y menores'],
    ['AND LOWER', 'y menores'],
    ['AND ABOVE', 'y mayores'],
    ['WILL BE', 'estará'],
    ['UNTIL FURTHER NOTICE', 'hasta nuevo aviso'],
    ['WITH IMMEDIATE EFFECT', 'con efecto inmediato']
  ];

  /* Palabras sueltas en inglés. Solo se aplican a las que siguen en MAYUSCULAS,
     es decir, a lo que no tradujeron ni las frases ni las contracciones. */
  var PALABRAS_ES = {
    AND: 'y', OR: 'o', NOT: 'no', ONLY: 'solamente', ALSO: 'también',
    FOR: 'para', WITH: 'con', WITHOUT: 'sin', FROM: 'desde', UNTIL: 'hasta',
    ALL: 'todas', ANY: 'cualquier', EACH: 'cada', OTHER: 'otro',
    USEFUL: 'utilizable', USABLE: 'utilizable', UNUSABLE: 'inutilizable',
    CLOSED: 'cerrada', OPEN: 'abierta', OPERATING: 'operando', OPERATIONAL: 'operacional',
    STAND: 'posición de estacionamiento', STANDS: 'posiciones de estacionamiento',
    STRIP: 'franja', STRIPS: 'franjas', SHOULDER: 'margen', SHOULDERS: 'márgenes',
    NORTH: 'norte', SOUTH: 'sur', EAST: 'este', WEST: 'oeste',
    CENTRAL: 'central', TERMINAL: 'terminal', SECTOR: 'sector',
    CAT: 'categoría', CATEGORY: 'categoría', MINORS: 'menores',
    LIGHT: 'luz', LIGHTS: 'luces', LIGHTING: 'iluminación',
    SEQUENCED: 'de destello secuencial', FLASHING: 'destellante',
    WORK: 'trabajos', WORKS: 'trabajos', PROGRESS: 'curso', MAINTENANCE: 'mantenimiento',
    CONSTRUCTION: 'construcción', CRANE: 'grúa', CRANES: 'grúas', OBSTACLE: 'obstáculo',
    HEIGHT: 'altura', LENGTH: 'longitud', WIDTH: 'ancho', DEPTH: 'profundidad',
    METERS: 'metros', METRES: 'metros', FEET: 'pies',
    AIRCRAFT: 'aeronave', HELICOPTER: 'helicóptero', VEHICLE: 'vehículo', VEHICLES: 'vehículos',
    PERSONNEL: 'personal', EQUIPMENT: 'equipo',
    APRON: 'plataforma', GATE: 'puerta', RAMP: 'rampa', TOWER: 'torre',
    FREQUENCY: 'frecuencia', MHZ: 'megahertz', KHZ: 'kilohertz',
    ARRIVAL: 'llegada', ARRIVALS: 'llegadas', DEPARTURE: 'salida', DEPARTURES: 'salidas',
    APPROACH: 'aproximación', LANDING: 'aterrizaje', TAKEOFF: 'despegue',
    TAXI: 'rodaje', HOLDING: 'espera', POSITION: 'posición',
    AVAILABLE: 'disponible', LIMITED: 'limitado', RESTRICTED: 'restringido',
    PROHIBITED: 'prohibido', TEMPORARY: 'temporal', PERMANENT: 'permanente',
    ESTABLISHED: 'establecido', CANCELLED: 'cancelado', CHANGED: 'cambiado',
    DISPLACED: 'desplazado', REDUCED: 'reducido', SUSPENDED: 'suspendido',
    BIRD: 'aves', BIRDS: 'aves', ACTIVITY: 'actividad',
    GRASS: 'pasto', CUTTING: 'corte', PAINTING: 'pintura', MARKING: 'señalamiento',
    WATER: 'agua', FUEL: 'combustible', SNOW: 'nieve',
    HOURS: 'horas', DAILY: 'diariamente', EXCEPT: 'excepto', DURING: 'durante',
    BOEING: 'Boeing', AIRBUS: 'Airbus',
    SERVICE: 'servicio', TEST: 'prueba', CHECK: 'verificación',
    THE: '', OF: 'de', IS: 'está', ARE: 'están', WILL: 'será', BE: 'ser'
  };

  /* Codigos Q: materia (letras 2 y 3) */
  var Q_SUBJECT = {
    FA: { es: 'aeródromo', en: 'aerodrome' },
    FF: { es: 'servicio de salvamento y extinción de incendios', en: 'fire fighting and rescue' },
    FM: { es: 'servicio meteorológico', en: 'meteorological service' },
    FU: { es: 'disponibilidad de combustible', en: 'fuel availability' },
    MR: { es: 'pista', en: 'runway' },
    MS: { es: 'zona de parada', en: 'stopway' },
    MT: { es: 'umbral', en: 'threshold' },
    MU: { es: 'bahia de viraje en pista', en: 'runway turning bay' },
    MW: { es: 'franja o margen de pista', en: 'strip or shoulder' },
    MX: { es: 'calle de rodaje', en: 'taxiway' },
    MN: { es: 'plataforma', en: 'apron' },
    MP: { es: 'puestos de estacionamiento de aeronaves', en: 'aircraft stands' },
    MK: { es: 'área de estacionamiento', en: 'parking area' },
    LA: { es: 'sistema de iluminación de aproximación', en: 'approach lighting system' },
    LB: { es: 'faro de aeródromo', en: 'aerodrome beacon' },
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
    NA: { es: 'todas las radioayudas para la navegación', en: 'all radio navigation facilities' },
    NB: { es: 'radiofaro no direccional', en: 'non-directional radio beacon' },
    ND: { es: 'equipo DME', en: 'distance measuring equipment' },
    NM: { es: 'VOR/DME', en: 'VOR/DME' },
    NV: { es: 'radiofaro VOR', en: 'VOR' },
    CA: { es: 'instalacion aire-tierra', en: 'air/ground facility' },
    CE: { es: 'radar de vigilancia en ruta', en: 'en-route surveillance radar' },
    PI: { es: 'procedimiento de aproximación por instrumentos', en: 'instrument approach procedure' },
    PA: { es: 'llegada normalizada por instrumentos', en: 'standard instrument arrival' },
    PD: { es: 'salida normalizada por instrumentos', en: 'standard instrument departure' },
    PH: { es: 'procedimiento de espera', en: 'holding procedure' },
    PM: { es: 'mínimos de operación de aeródromo', en: 'aerodrome operating minima' },
    PT: { es: 'altitud o nivel de transición', en: 'transition altitude or level' },
    PU: { es: 'procedimiento de aproximación frustrada', en: 'missed approach procedure' },
    RA: { es: 'reserva de espacio aereo', en: 'airspace reservation' },
    RD: { es: 'zona peligrosa', en: 'danger area' },
    RP: { es: 'zona prohibida', en: 'prohibited area' },
    RR: { es: 'zona restringida', en: 'restricted area' },
    RT: { es: 'zona restringida temporal', en: 'temporary restricted area' },
    WA: { es: 'exhibicion aerea', en: 'air display' },
    WE: { es: 'ejercicios', en: 'exercises' },
    WM: { es: 'lanzamiento de cohetes o disparos', en: 'missile, gun or rocket firing' },
    WP: { es: 'salto en paracaídas', en: 'parachute jumping' },
    WU: { es: 'aeronave no tripulada', en: 'unmanned aircraft' },
    WW: { es: 'actividad volcánica significativa', en: 'significant volcanic activity' },
    WZ: { es: 'vuelo de aeromodelos', en: 'model flying' },
    OB: { es: 'obstaculo', en: 'obstacle' },
    OL: { es: 'iluminación de obstaculo', en: 'obstacle lighting' }
  };

  /* Codigos Q: condición (letras 4 y 5) */
  var Q_CONDITION = {
    AC: { es: 'retirado por mantenimiento', en: 'withdrawn for maintenance' },
    AD: { es: 'disponible para operación diurna', en: 'available for daylight operation' },
    AH: { es: 'horario de servicio ahora', en: 'hours of service now' },
    AK: { es: 'reanudo operaciones normales', en: 'resumed normal operations' },
    AL: { es: 'operativo sujeto a condiciones publicadas', en: 'operative subject to published conditions' },
    AM: { es: 'solo operaciones militares', en: 'military operations only' },
    AN: { es: 'disponible para operación nocturna', en: 'available for night operation' },
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
    CF: { es: 'frecuencia de operación cambiada a', en: 'operating frequency changed to' },
    CH: { es: 'modificado', en: 'changed' },
    CI: { es: 'identificación o distintivo de llamada cambiado a', en: 'identification or radio call sign changed to' },
    CL: { es: 'realineado', en: 'realigned' },
    CM: { es: 'desplazado', en: 'displaced' },
    CN: { es: 'cancelado', en: 'cancelled' },
    CO: { es: 'en operación', en: 'operating' },
    CP: { es: 'operando con potencia reducida', en: 'operating on reduced power' },
    CR: { es: 'reemplazado temporalmente por', en: 'temporarily replaced by' },
    CS: { es: 'instalado', en: 'installed' },
    CT: { es: 'en prueba, no utilizar', en: 'on test, do not use' },
    HA: { es: 'accion de frenado', en: 'braking action' },
    HB: { es: 'coeficiente de fricción', en: 'friction coefficient' },
    HE: { es: 'cubierto de agua', en: 'covered by water' },
    HH: { es: 'peligro debido a', en: 'hazard due to' },
    HK: { es: 'migración de aves en curso', en: 'bird migration in progress' },
    HM: { es: 'marcado por', en: 'marked by' },
    HQ: { es: 'operación cancelada', en: 'operation cancelled' },
    HR: { es: 'agua estancada', en: 'standing water' },
    HV: { es: 'trabajos terminados', en: 'work completed' },
    HW: { es: 'trabajos en curso', en: 'work in progress' },
    HX: { es: 'concentración de aves', en: 'concentration of birds' },
    LA: { es: 'operando con fuente de energía auxiliar', en: 'operating on auxiliary power supply' },
    LC: { es: 'cerrada', en: 'closed' },
    LD: { es: 'inseguro', en: 'unsafe' },
    LF: { es: 'interferencia de', en: 'interference from' },
    LG: { es: 'operando sin identificación', en: 'operating without identification' },
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
    K: { es: 'lista de verificación', en: 'checklist' }
  };

  var Q_PURPOSE = {
    N: { es: 'atención inmediata', en: 'immediate attention' },
    B: { es: 'de importancia operacional', en: 'operational significance' },
    O: { es: 'para operaciones de vuelo', en: 'flight operations' },
    M: { es: 'diverso', en: 'miscellaneous' },
    K: { es: 'lista de verificación', en: 'checklist' }
  };

  var Q_SCOPE = {
    A: { es: 'aeródromo', en: 'aerodrome' },
    E: { es: 'en ruta', en: 'en-route' },
    W: { es: 'aviso a la navegación', en: 'navigation warning' },
    AE: { es: 'aeródromo y en ruta', en: 'aerodrome and en-route' },
    AW: { es: 'aeródromo y aviso a la navegación', en: 'aerodrome and navigation warning' },
    K: { es: 'lista de verificación', en: 'checklist' }
  };

  ATIS.dict = {
    FRASES_ES: FRASES_ES,
    PALABRAS_ES: PALABRAS_ES,
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
