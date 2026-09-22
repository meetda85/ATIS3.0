/* ATIS 3.0 - Base de aerodromos (editable) */
(function (global) {
  'use strict';
  var ATIS = global.ATIS = global.ATIS || {};

  ATIS.airports = {
    MMMX: {
      es: 'Aeropuerto Internacional de la Ciudad de México',
      en: 'Mexico City International Airport',
      runways: ['05L', '05R', '23L', '23R'],
      elevation: 7316,
      approaches: ['ILS', 'RNP', 'VOR', 'Visual']
    },
    MMTO: {
      es: 'Aeropuerto Internacional de Toluca',
      en: 'Toluca International Airport',
      runways: ['15', '33'], elevation: 8466, approaches: ['ILS', 'RNP', 'VOR', 'Visual']
    },
    MMSM: {
      es: 'Aeropuerto Internacional Felipe Angeles',
      en: 'Felipe Angeles International Airport',
      runways: ['04L', '04R', '22L', '22R'], elevation: 7503, approaches: ['ILS', 'RNP', 'Visual']
    },
    MMGL: {
      es: 'Aeropuerto Internacional de Guadalajara',
      en: 'Guadalajara International Airport',
      runways: ['02', '20'], elevation: 5016, approaches: ['ILS', 'RNP', 'VOR', 'Visual']
    },
    MMMY: {
      es: 'Aeropuerto Internacional de Monterrey',
      en: 'Monterrey International Airport',
      runways: ['11', '29'], elevation: 1278, approaches: ['ILS', 'RNP', 'Visual']
    },
    MMUN: {
      es: 'Aeropuerto Internacional de Cancun',
      en: 'Cancun International Airport',
      runways: ['12L', '12R', '30L', '30R'], elevation: 22, approaches: ['ILS', 'RNP', 'Visual']
    },
    MMTJ: {
      es: 'Aeropuerto Internacional de Tijuana',
      en: 'Tijuana International Airport',
      runways: ['09', '27'], elevation: 489, approaches: ['ILS', 'RNP', 'Visual']
    },
    MMPR: {
      es: 'Aeropuerto Internacional de Puerto Vallarta',
      en: 'Puerto Vallarta International Airport',
      runways: ['04', '22'], elevation: 23, approaches: ['ILS', 'RNP', 'Visual']
    },
    MMMD: {
      es: 'Aeropuerto Internacional de Merida',
      en: 'Merida International Airport',
      runways: ['10', '28'], elevation: 38, approaches: ['ILS', 'RNP', 'Visual']
    },
    MMBT: {
      es: 'Aeropuerto Internacional de Bajio',
      en: 'Bajio International Airport',
      runways: ['13', '31'], elevation: 5956, approaches: ['ILS', 'RNP', 'Visual']
    }
  };

  ATIS.getAirport = function (icao) {
    var code = String(icao || '').toUpperCase();
    return ATIS.airports[code] || null;
  };
})(this);
