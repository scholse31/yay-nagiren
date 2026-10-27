// mapData.js - RoWorld Tactical World Map Definition
// Defines provinces, coordinates, polygons, adjacency, sea lanes, and continent bonuses.

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 700;

const CONTINENTS = {
  NA: { name: 'Kuzey Amerika', color: '#3b82f6', bonus: 5 },
  SA: { name: 'Güney Amerika', color: '#10b981', bonus: 3 },
  EU: { name: 'Avrupa', color: '#8b5cf6', bonus: 6 },
  AF: { name: 'Afrika', color: '#f59e0b', bonus: 4 },
  ME: { name: 'Orta Doğu', color: '#ec4899', bonus: 3 },
  AS: { name: 'Asya', color: '#ef4444', bonus: 8 },
  OC: { name: 'Okyanusya', color: '#06b6d4', bonus: 2 }
};

const PROVINCES = [
  // --- KUZEY AMERİKA ---
  {
    id: 'alaska',
    name: 'Alaska',
    continent: 'NA',
    x: 105, y: 110,
    neighbors: ['w_canada'],
    seaLanes: ['siberia'],
    poly: [[60, 70], [135, 75], [145, 135], [95, 145], [60, 115]]
  },
  {
    id: 'w_canada',
    name: 'Batı Kanada',
    continent: 'NA',
    x: 200, y: 115,
    neighbors: ['alaska', 'e_canada', 'west_us'],
    seaLanes: [],
    poly: [[145, 75], [255, 75], [260, 150], [165, 150], [145, 135]]
  },
  {
    id: 'e_canada',
    name: 'Doğu Kanada',
    continent: 'NA',
    x: 320, y: 125,
    neighbors: ['w_canada', 'midwest_us', 'east_us'],
    seaLanes: ['uk'],
    poly: [[255, 75], [385, 95], [375, 160], [285, 165], [260, 150]]
  },
  {
    id: 'west_us',
    name: 'Batı ABD (Kaliforniya)',
    continent: 'NA',
    x: 170, y: 205,
    neighbors: ['w_canada', 'midwest_us', 'texas', 'mexico'],
    seaLanes: ['japan'],
    poly: [[130, 160], [205, 160], [210, 255], [140, 245]]
  },
  {
    id: 'midwest_us',
    name: 'Orta Batı ABD',
    continent: 'NA',
    x: 255, y: 195,
    neighbors: ['w_canada', 'e_canada', 'west_us', 'texas', 'east_us'],
    seaLanes: [],
    poly: [[205, 160], [290, 165], [295, 230], [215, 230]]
  },
  {
    id: 'east_us',
    name: 'Doğu ABD (New York)',
    continent: 'NA',
    x: 335, y: 205,
    neighbors: ['e_canada', 'midwest_us', 'texas'],
    seaLanes: ['uk', 'caribbean'],
    poly: [[290, 165], [375, 160], [365, 245], [295, 240]]
  },
  {
    id: 'texas',
    name: 'Teksas & Güney ABD',
    continent: 'NA',
    x: 250, y: 260,
    neighbors: ['west_us', 'midwest_us', 'east_us', 'mexico'],
    seaLanes: ['caribbean'],
    poly: [[205, 235], [305, 240], [290, 285], [225, 280]]
  },
  {
    id: 'mexico',
    name: 'Meksika',
    continent: 'NA',
    x: 215, y: 325,
    neighbors: ['west_us', 'texas', 'colombia'],
    seaLanes: ['caribbean'],
    poly: [[175, 260], [260, 285], [255, 365], [190, 345]]
  },
  {
    id: 'caribbean',
    name: 'Karayipler',
    continent: 'NA',
    x: 325, y: 320,
    neighbors: [],
    seaLanes: ['east_us', 'texas', 'mexico', 'colombia', 'brazil_n'],
    poly: [[300, 300], [355, 305], [350, 340], [295, 335]]
  },

  // --- GÜNEY AMERİKA ---
  {
    id: 'colombia',
    name: 'Kolombiya & Venezuela',
    continent: 'SA',
    x: 300, y: 385,
    neighbors: ['mexico', 'brazil_n', 'peru'],
    seaLanes: ['caribbean'],
    poly: [[260, 365], [345, 365], [340, 415], [270, 415]]
  },
  {
    id: 'brazil_n',
    name: 'Kuzey Brezilya (Amazon)',
    continent: 'SA',
    x: 395, y: 400,
    neighbors: ['colombia', 'peru', 'brazil_s'],
    seaLanes: ['west_africa', 'caribbean'],
    poly: [[345, 365], [445, 385], [435, 445], [345, 425]]
  },
  {
    id: 'peru',
    name: 'Peru & Bolivya',
    continent: 'SA',
    x: 295, y: 465,
    neighbors: ['colombia', 'brazil_n', 'brazil_s', 'argentina'],
    seaLanes: [],
    poly: [[265, 420], [335, 425], [330, 515], [275, 495]]
  },
  {
    id: 'brazil_s',
    name: 'Güney Brezilya',
    continent: 'SA',
    x: 405, y: 485,
    neighbors: ['brazil_n', 'peru', 'argentina'],
    seaLanes: ['south_africa'],
    poly: [[345, 425], [455, 440], [425, 535], [345, 520]]
  },
  {
    id: 'argentina',
    name: 'Arjantin & Şili',
    continent: 'SA',
    x: 345, y: 580,
    neighbors: ['peru', 'brazil_s'],
    seaLanes: ['south_africa'],
    poly: [[295, 515], [385, 525], [355, 655], [305, 635]]
  },

  // --- AVRUPA ---
  {
    id: 'uk',
    name: 'Birleşik Krallık',
    continent: 'EU',
    x: 520, y: 180,
    neighbors: [],
    seaLanes: ['e_canada', 'france', 'scandinavia', 'germany'],
    poly: [[495, 145], [540, 145], [545, 215], [500, 210]]
  },
  {
    id: 'scandinavia',
    name: 'İskandinavya',
    continent: 'EU',
    x: 605, y: 135,
    neighbors: ['russia_w'],
    seaLanes: ['uk', 'germany', 'poland'],
    poly: [[565, 95], [645, 95], [635, 175], [580, 170]]
  },
  {
    id: 'france',
    name: 'Fransa',
    continent: 'EU',
    x: 535, y: 245,
    neighbors: ['spain', 'germany', 'italy'],
    seaLanes: ['uk'],
    poly: [[505, 215], [565, 215], [565, 275], [510, 270]]
  },
  {
    id: 'spain',
    name: 'İspanya & Portekiz',
    continent: 'EU',
    x: 495, y: 300,
    neighbors: ['france'],
    seaLanes: ['maghreb'],
    poly: [[465, 275], [525, 275], [520, 335], [465, 325]]
  },
  {
    id: 'germany',
    name: 'Almanya & Orta Avrupa',
    continent: 'EU',
    x: 590, y: 215,
    neighbors: ['france', 'italy', 'poland'],
    seaLanes: ['uk', 'scandinavia'],
    poly: [[565, 185], [620, 185], [620, 245], [565, 245]]
  },
  {
    id: 'italy',
    name: 'İtalya',
    continent: 'EU',
    x: 585, y: 285,
    neighbors: ['france', 'germany', 'balkans'],
    seaLanes: ['maghreb', 'egypt'],
    poly: [[565, 255], [605, 255], [615, 325], [575, 315]]
  },
  {
    id: 'poland',
    name: 'Polonya & Baltık',
    continent: 'EU',
    x: 645, y: 205,
    neighbors: ['germany', 'balkans', 'ukraine', 'russia_w'],
    seaLanes: ['scandinavia'],
    poly: [[620, 175], [680, 175], [680, 235], [620, 235]]
  },
  {
    id: 'balkans',
    name: 'Balkanlar & Yunanistan',
    continent: 'EU',
    x: 645, y: 275,
    neighbors: ['italy', 'poland', 'ukraine', 'turkey'],
    seaLanes: ['egypt'],
    poly: [[615, 245], [670, 245], [665, 310], [615, 305]]
  },
  {
    id: 'ukraine',
    name: 'Ukrayna',
    continent: 'EU',
    x: 705, y: 220,
    neighbors: ['poland', 'balkans', 'turkey', 'russia_w', 'caucasus'],
    seaLanes: [],
    poly: [[675, 185], [745, 185], [745, 245], [675, 245]]
  },
  {
    id: 'russia_w',
    name: 'Batı Rusya (Moskova)',
    continent: 'EU',
    x: 725, y: 145,
    neighbors: ['scandinavia', 'poland', 'ukraine', 'urals', 'caucasus'],
    seaLanes: [],
    poly: [[675, 105], [785, 105], [785, 185], [675, 185]]
  },

  // --- ORTA DOĞU & KUZEY AFRİKA ---
  {
    id: 'turkey',
    name: 'Türkiye (Anadolu)',
    continent: 'ME',
    x: 690, y: 285,
    neighbors: ['balkans', 'ukraine', 'caucasus', 'levant', 'iraq'],
    seaLanes: ['egypt'],
    poly: [[665, 260], [730, 260], [730, 305], [665, 305]]
  },
  {
    id: 'caucasus',
    name: 'Kafkaslar',
    continent: 'ME',
    x: 745, y: 255,
    neighbors: ['russia_w', 'ukraine', 'turkey', 'iran', 'kazakhstan'],
    seaLanes: [],
    poly: [[730, 235], [775, 235], [775, 275], [730, 275]]
  },
  {
    id: 'levant',
    name: 'Levant (Suriye/Lübnan)',
    continent: 'ME',
    x: 695, y: 330,
    neighbors: ['turkey', 'iraq', 'arabia', 'egypt'],
    seaLanes: [],
    poly: [[675, 310], [715, 310], [715, 350], [675, 350]]
  },
  {
    id: 'iraq',
    name: 'Irak',
    continent: 'ME',
    x: 735, y: 320,
    neighbors: ['turkey', 'levant', 'arabia', 'iran'],
    seaLanes: [],
    poly: [[715, 295], [755, 295], [755, 345], [715, 345]]
  },
  {
    id: 'iran',
    name: 'İran',
    continent: 'ME',
    x: 780, y: 310,
    neighbors: ['caucasus', 'iraq', 'arabia', 'kazakhstan', 'pakistan'],
    seaLanes: ['india_n'],
    poly: [[755, 280], [815, 280], [815, 345], [755, 345]]
  },
  {
    id: 'arabia',
    name: 'Arabistan',
    continent: 'ME',
    x: 735, y: 385,
    neighbors: ['levant', 'iraq', 'iran', 'egypt', 'east_africa'],
    seaLanes: ['india_s'],
    poly: [[705, 350], [775, 350], [765, 425], [710, 420]]
  },

  // --- AFRİKA ---
  {
    id: 'maghreb',
    name: 'Mağrip (Kuzey Afrika)',
    continent: 'AF',
    x: 525, y: 360,
    neighbors: ['west_africa', 'egypt'],
    seaLanes: ['spain', 'italy'],
    poly: [[475, 335], [585, 335], [580, 395], [475, 390]]
  },
  {
    id: 'egypt',
    name: 'Mısır',
    continent: 'AF',
    x: 645, y: 360,
    neighbors: ['maghreb', 'levant', 'arabia', 'east_africa'],
    seaLanes: ['italy', 'balkans', 'turkey'],
    poly: [[615, 335], [685, 335], [680, 400], [615, 400]]
  },
  {
    id: 'west_africa',
    name: 'Batı Afrika',
    continent: 'AF',
    x: 515, y: 440,
    neighbors: ['maghreb', 'congo'],
    seaLanes: ['brazil_n'],
    poly: [[460, 400], [565, 400], [560, 480], [470, 480]]
  },
  {
    id: 'congo',
    name: 'Orta Afrika (Kongo)',
    continent: 'AF',
    x: 605, y: 470,
    neighbors: ['west_africa', 'east_africa', 'south_africa'],
    seaLanes: [],
    poly: [[565, 425], [645, 425], [640, 520], [565, 515]]
  },
  {
    id: 'east_africa',
    name: 'Doğu Afrika (Etiyopya)',
    continent: 'AF',
    x: 685, y: 450,
    neighbors: ['egypt', 'arabia', 'congo', 'south_africa'],
    seaLanes: ['india_s'],
    poly: [[645, 405], [725, 415], [715, 500], [645, 495]]
  },
  {
    id: 'south_africa',
    name: 'Güney Afrika',
    continent: 'AF',
    x: 625, y: 570,
    neighbors: ['congo', 'east_africa'],
    seaLanes: ['brazil_s', 'argentina', 'w_australia'],
    poly: [[575, 520], [675, 515], [665, 625], [585, 620]]
  },

  // --- ASYA ---
  {
    id: 'urals',
    name: 'Ural Dağları',
    continent: 'AS',
    x: 820, y: 145,
    neighbors: ['russia_w', 'siberia', 'kazakhstan'],
    seaLanes: [],
    poly: [[785, 105], [865, 105], [865, 190], [785, 190]]
  },
  {
    id: 'siberia',
    name: 'Sibirya & Uzak Doğu',
    continent: 'AS',
    x: 960, y: 130,
    neighbors: ['urals', 'china_w', 'china_e'],
    seaLanes: ['alaska', 'japan'],
    poly: [[865, 80], [1070, 80], [1050, 185], [865, 185]]
  },
  {
    id: 'kazakhstan',
    name: 'Orta Asya (Kazakistan)',
    continent: 'AS',
    x: 805, y: 235,
    neighbors: ['caucasus', 'russia_w', 'urals', 'iran', 'pakistan', 'china_w'],
    seaLanes: [],
    poly: [[765, 195], [865, 195], [865, 275], [765, 275]]
  },
  {
    id: 'pakistan',
    name: 'Pakistan & Afganistan',
    continent: 'AS',
    x: 810, y: 310,
    neighbors: ['iran', 'kazakhstan', 'india_n', 'china_w'],
    seaLanes: [],
    poly: [[785, 280], [840, 280], [840, 345], [785, 345]]
  },
  {
    id: 'india_n',
    name: 'Kuzey Hindistan',
    continent: 'AS',
    x: 855, y: 330,
    neighbors: ['pakistan', 'china_w', 'india_s', 'se_asia'],
    seaLanes: ['iran'],
    poly: [[835, 295], [895, 295], [895, 370], [835, 370]]
  },
  {
    id: 'india_s',
    name: 'Güney Hindistan',
    continent: 'AS',
    x: 865, y: 410,
    neighbors: ['india_n'],
    seaLanes: ['arabia', 'east_africa', 'se_asia', 'indonesia'],
    poly: [[840, 370], [895, 370], [885, 455], [850, 455]]
  },
  {
    id: 'china_w',
    name: 'Batı Çin (Tibet / Sincan)',
    continent: 'AS',
    x: 890, y: 245,
    neighbors: ['kazakhstan', 'urals', 'siberia', 'pakistan', 'india_n', 'china_e'],
    seaLanes: [],
    poly: [[865, 195], [935, 195], [935, 295], [865, 295]]
  },
  {
    id: 'china_e',
    name: 'Doğu Çin (Pekin / Şanghay)',
    continent: 'AS',
    x: 970, y: 275,
    neighbors: ['siberia', 'china_w', 'se_asia', 'korea'],
    seaLanes: ['japan', 'indonesia'],
    poly: [[935, 205], [1025, 205], [1025, 325], [935, 325]]
  },
  {
    id: 'korea',
    name: 'Kore Yarımadası',
    continent: 'AS',
    x: 1025, y: 250,
    neighbors: ['china_e'],
    seaLanes: ['japan'],
    poly: [[1015, 225], [1045, 225], [1045, 275], [1015, 275]]
  },
  {
    id: 'japan',
    name: 'Japonya',
    continent: 'AS',
    x: 1080, y: 240,
    neighbors: [],
    seaLanes: ['siberia', 'korea', 'china_e', 'west_us'],
    poly: [[1060, 205], [1105, 205], [1105, 280], [1060, 275]]
  },
  {
    id: 'se_asia',
    name: 'Güneydoğu Asya (Vietnam/Tayland)',
    continent: 'AS',
    x: 945, y: 380,
    neighbors: ['india_n', 'china_e'],
    seaLanes: ['india_s', 'indonesia'],
    poly: [[910, 335], [980, 335], [975, 425], [915, 420]]
  },
  {
    id: 'indonesia',
    name: 'Endonezya & Filipinler',
    continent: 'AS',
    x: 1005, y: 450,
    neighbors: [],
    seaLanes: ['india_s', 'china_e', 'se_asia', 'w_australia'],
    poly: [[960, 425], [1060, 430], [1050, 490], [965, 485]]
  },

  // --- OKYANUSYA ---
  {
    id: 'w_australia',
    name: 'Batı Avustralya',
    continent: 'OC',
    x: 1025, y: 550,
    neighbors: ['e_australia'],
    seaLanes: ['indonesia', 'south_africa'],
    poly: [[980, 500], [1055, 500], [1055, 620], [980, 615]]
  },
  {
    id: 'e_australia',
    name: 'Doğu Avustralya (Sidney)',
    continent: 'OC',
    x: 1105, y: 560,
    neighbors: ['w_australia'],
    seaLanes: ['new_zealand'],
    poly: [[1055, 500], [1145, 510], [1140, 630], [1055, 620]]
  },
  {
    id: 'new_zealand',
    name: 'Yeni Zelanda',
    continent: 'OC',
    x: 1155, y: 615,
    neighbors: [],
    seaLanes: ['e_australia'],
    poly: [[1135, 595], [1175, 600], [1170, 645], [1135, 640]]
  }
];

// Helper to find province by ID
function getProvince(id) {
  return PROVINCES.find(p => p.id === id);
}

// Check adjacency (direct land border or sea lane with required port condition)
function areNeighbors(idA, idB) {
  const pA = getProvince(idA);
  if (!pA) return false;
  return pA.neighbors.includes(idB);
}

function areSeaConnected(idA, idB) {
  const pA = getProvince(idA);
  if (!pA) return false;
  return pA.seaLanes.includes(idB);
}

// Export for Node and Browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MAP_WIDTH,
    MAP_HEIGHT,
    CONTINENTS,
    PROVINCES,
    getProvince,
    areNeighbors,
    areSeaConnected
  };
}
