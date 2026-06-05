// === server/animals.js — 동물 mob 카탈로그 36종 ===
// Phase 5-6
//
// 분류: 사냥감(wild) 23 + 가축(domestic) 13
//
// 각 mob:
//   ko, emoji
//   hp, speed (px/sec, 캐릭터 132 기준)
//   size: 'tiny'|'small'|'medium'|'large'|'huge' (콜라이더 + 시각 크기)
//   aggressive: 사람 보면 공격(true) / 도망(false)
//   pack: 무리 사냥 사이즈 (1이면 단독)
//   drops: 사체 도살 시 자원 drop (Phase 5-7)
//   breeding: 가축 가능 (Phase 5-10)
//   produces: 사육 중 일일 산출 (가축만)
//   feed: 먹이 자원 (가축만)
//   spawn_biome: 출현 biome list
//   spawn_density: 밀도 (0~1, 낮을수록 희귀)
//
// biome 종류 (zone-config 참조):
//   taiga, tundra, forest, plains, desert, jungle, savanna,
//   archipelago, mountain, ocean

const ANIMALS = {
  // ═══════════════════════════════════════════════════════════════════
  // 🦌 사냥감 23종 (wild)
  // ═══════════════════════════════════════════════════════════════════

  // ─── 한대 (북부) ───
  wolf: {
    ko: '늑대', emoji: '🐺', hp: 40, speed: 5, size: 'medium',
    aggressive: true, pack: 4,
    drops: { meat_game: 2, fur: 1, leather: 1, bone: 2 },
    spawn_biome: ['forest', 'taiga', 'mountain', 'tundra'],
    spawn_density: 0.03,
  },
  bear: {
    ko: '곰', emoji: '🐻', hp: 120, speed: 3, size: 'large',
    aggressive: true, pack: 1,
    drops: { meat_game: 6, fur: 3, leather: 2, bone: 4 },
    spawn_biome: ['forest', 'taiga', 'mountain'],
    spawn_density: 0.01,
  },
  reindeer_wild: {
    ko: '야생 순록', emoji: '🦌', hp: 35, speed: 6, size: 'medium',
    aggressive: false, pack: 6,
    drops: { meat_game: 3, leather: 2, horn: 2, fur: 1 },
    spawn_biome: ['tundra', 'taiga'],
    spawn_density: 0.04,
  },
  arctic_fox: {
    ko: '북극 여우', emoji: '🦊', hp: 18, speed: 6, size: 'small',
    aggressive: false, pack: 1,
    drops: { meat_game: 1, fur: 2 },
    spawn_biome: ['tundra', 'taiga'],
    spawn_density: 0.03,
  },
  wolverine: {
    ko: '울버린', emoji: '🦡', hp: 50, speed: 4, size: 'medium',
    aggressive: true, pack: 1,
    drops: { meat_game: 2, fur: 2, leather: 1 },
    spawn_biome: ['taiga', 'tundra'],
    spawn_density: 0.01,
  },
  arctic_hare: {
    ko: '북극 토끼', emoji: '🐇', hp: 10, speed: 7, size: 'tiny',
    aggressive: false, pack: 1,
    drops: { meat_game: 1, fur: 1 },
    spawn_biome: ['tundra', 'taiga', 'plains'],
    spawn_density: 0.08,
  },
  moose: {
    ko: '무스', emoji: '🫎', hp: 100, speed: 4, size: 'huge',
    aggressive: false, pack: 1,
    drops: { meat_game: 8, leather: 3, horn: 3, bone: 4 },
    spawn_biome: ['taiga', 'forest'],
    spawn_density: 0.015,
  },

  // ─── 온대 (중부) ───
  deer: {
    ko: '사슴', emoji: '🦌', hp: 30, speed: 6, size: 'medium',
    aggressive: false, pack: 4,
    drops: { meat_game: 3, leather: 2, horn: 1 },
    spawn_biome: ['forest', 'plains'],
    spawn_density: 0.05,
  },
  wild_boar: {
    ko: '멧돼지', emoji: '🐗', hp: 60, speed: 4, size: 'medium',
    aggressive: true, pack: 3,
    drops: { meat_game: 4, leather: 1, bone: 2 },
    spawn_biome: ['forest', 'plains'],
    spawn_density: 0.04,
  },
  red_fox: {
    ko: '여우', emoji: '🦊', hp: 18, speed: 6, size: 'small',
    aggressive: false, pack: 1,
    drops: { meat_game: 1, fur: 1 },
    spawn_biome: ['forest', 'plains'],
    spawn_density: 0.04,
  },
  ibex: {
    ko: '아이벡스', emoji: '🐐', hp: 40, speed: 5, size: 'medium',
    aggressive: false, pack: 5,
    drops: { meat_game: 2, leather: 1, horn: 2 },
    spawn_biome: ['mountain'],
    spawn_density: 0.03,
  },
  pheasant: {
    ko: '꿩', emoji: '🐦', hp: 8, speed: 5, size: 'tiny',
    aggressive: false, pack: 2,
    drops: { meat_chicken: 1, feather: 2 },
    spawn_biome: ['forest', 'plains'],
    spawn_density: 0.06,
  },
  quail: {
    ko: '메추라기', emoji: '🐦', hp: 5, speed: 5, size: 'tiny',
    aggressive: false, pack: 4,
    drops: { meat_chicken: 1, feather: 1, egg: 1 },
    spawn_biome: ['plains', 'forest'],
    spawn_density: 0.08,
  },

  // ─── 열대 (적도) ───
  elephant: {
    ko: '코끼리', emoji: '🐘', hp: 300, speed: 3, size: 'huge',
    aggressive: false, pack: 5,
    drops: { meat_game: 20, ivory: 2, leather: 5, bone: 6 },
    spawn_biome: ['savanna', 'jungle'],
    spawn_density: 0.008,
  },
  giraffe: {
    ko: '기린', emoji: '🦒', hp: 80, speed: 5, size: 'huge',
    aggressive: false, pack: 3,
    drops: { meat_game: 10, leather: 4, bone: 3 },
    spawn_biome: ['savanna'],
    spawn_density: 0.015,
  },
  hippo: {
    ko: '하마', emoji: '🦛', hp: 200, speed: 3, size: 'huge',
    aggressive: true, pack: 2,
    drops: { meat_game: 15, ivory: 1, leather: 5 },
    spawn_biome: ['jungle', 'savanna'],
    spawn_density: 0.005,
  },
  crocodile: {
    ko: '악어', emoji: '🐊', hp: 80, speed: 3, size: 'large',
    aggressive: true, pack: 1,
    drops: { meat_game: 6, leather: 4, bone: 2 },
    spawn_biome: ['jungle', 'savanna'],
    spawn_density: 0.02,
  },
  lion: {
    ko: '사자', emoji: '🦁', hp: 100, speed: 6, size: 'large',
    aggressive: true, pack: 3,
    drops: { meat_game: 5, fur: 2, leather: 1, bone: 2 },
    spawn_biome: ['savanna'],
    spawn_density: 0.015,
  },
  tiger: {
    ko: '호랑이', emoji: '🐅', hp: 130, speed: 7, size: 'large',
    aggressive: true, pack: 1,
    drops: { meat_game: 6, fur: 3, leather: 1, bone: 2 },
    spawn_biome: ['jungle', 'forest', 'mountain'],
    spawn_density: 0.008,
  },
  leopard: {
    ko: '표범', emoji: '🐆', hp: 70, speed: 7, size: 'medium',
    aggressive: true, pack: 1,
    drops: { meat_game: 3, fur: 2, leather: 1 },
    spawn_biome: ['savanna', 'jungle'],
    spawn_density: 0.015,
  },

  // ─── 사막 ───
  wild_camel: {
    ko: '야생 낙타', emoji: '🐪', hp: 80, speed: 4, size: 'large',
    aggressive: false, pack: 4,
    drops: { meat_game: 6, leather: 3, fur: 1, bone: 2 },
    spawn_biome: ['desert'],
    spawn_density: 0.02,
  },
  jackal: {
    ko: '자칼', emoji: '🦊', hp: 25, speed: 6, size: 'small',
    aggressive: true, pack: 3,
    drops: { meat_game: 1, fur: 1 },
    spawn_biome: ['desert', 'savanna'],
    spawn_density: 0.04,
  },
  hyena: {
    ko: '하이에나', emoji: '🐺', hp: 50, speed: 5, size: 'medium',
    aggressive: true, pack: 4,
    drops: { meat_game: 2, fur: 1, bone: 2 },
    spawn_biome: ['savanna', 'desert'],
    spawn_density: 0.03,
  },

  // ═══════════════════════════════════════════════════════════════════
  // 🐄 가축 13종 (domestic — 길들이기·사육·번식·산출)
  // ═══════════════════════════════════════════════════════════════════
  cow: {
    ko: '소', emoji: '🐄', hp: 80, speed: 2, size: 'large',
    aggressive: false, pack: 1, breeding: true,
    produces: { milk: 1.0, beef_tallow: 0.05 },  // 일일 산출
    feed: 'wheat',                                  // 또는 grass (야생 풀)
    drops: { meat_beef: 8, leather: 3, bone: 4, horn: 2 },  // 도축 시
    spawn_biome: [], spawn_density: 0,             // 야생 X (가축만)
  },
  horse: {
    ko: '말', emoji: '🐴', hp: 100, speed: 8, size: 'large',
    aggressive: false, pack: 2, breeding: true,
    produces: {},  // 노동 (운송) 별도 시스템
    feed: 'oats',
    drops: { meat_game: 6, leather: 4, horn: 1 },
    spawn_biome: ['plains'], spawn_density: 0.02,  // 야생 말도 OK
  },
  sheep: {
    ko: '양', emoji: '🐑', hp: 30, speed: 3, size: 'medium',
    aggressive: false, pack: 5, breeding: true,
    produces: { wool: 0.3 },
    feed: 'wheat',
    drops: { meat_mutton: 3, leather: 1, wool: 2, horn: 1 },
    spawn_biome: ['mountain', 'plains'], spawn_density: 0.03,  // 야생 양
  },
  pig: {
    ko: '돼지', emoji: '🐖', hp: 40, speed: 3, size: 'medium',
    aggressive: false, pack: 2, breeding: true,
    produces: {},  // 도축만
    feed: 'corn',
    drops: { meat_pork: 5, leather: 2, bone: 2 },
    spawn_biome: [], spawn_density: 0,
  },
  goat: {
    ko: '염소', emoji: '🐐', hp: 25, speed: 4, size: 'small',
    aggressive: false, pack: 3, breeding: true,
    produces: { goat_milk: 0.6 },
    feed: 'grass',
    drops: { meat_mutton: 2, leather: 1, horn: 1 },
    spawn_biome: ['mountain'], spawn_density: 0.025,
  },
  chicken: {
    ko: '닭', emoji: '🐓', hp: 5, speed: 3, size: 'tiny',
    aggressive: false, pack: 4, breeding: true,
    produces: { egg: 0.8, feather: 0.1 },
    feed: 'wheat',
    drops: { meat_chicken: 1, feather: 2 },
    spawn_biome: [], spawn_density: 0,
  },
  duck: {
    ko: '오리', emoji: '🦆', hp: 8, speed: 3, size: 'tiny',
    aggressive: false, pack: 4, breeding: true,
    produces: { egg: 0.5, feather: 0.1 },
    feed: 'rice',
    drops: { duck_meat: 1, feather: 2 },
    spawn_biome: [], spawn_density: 0,
  },
  camel_domestic: {
    ko: '낙타', emoji: '🐫', hp: 80, speed: 3, size: 'large',
    aggressive: false, pack: 3, breeding: true,
    produces: { milk: 0.4 },  // 낙타젖
    feed: 'dates',
    drops: { meat_game: 6, leather: 3, fur: 1 },
    spawn_biome: [], spawn_density: 0,
  },
  llama: {
    ko: '라마', emoji: '🦙', hp: 40, speed: 3, size: 'medium',
    aggressive: false, pack: 3, breeding: true,
    produces: { wool: 0.2 },
    feed: 'corn',
    drops: { meat_mutton: 3, wool: 1, leather: 1 },
    spawn_biome: ['mountain'], spawn_density: 0.02,
  },
  reindeer_domestic: {
    ko: '가축 순록', emoji: '🦌', hp: 35, speed: 5, size: 'medium',
    aggressive: false, pack: 6, breeding: true,
    produces: { milk: 0.3 },  // 순록 우유
    feed: 'mushroom',
    drops: { meat_game: 3, leather: 2, horn: 2, fur: 1 },
    spawn_biome: [], spawn_density: 0,
  },
  yak: {
    ko: '야크', emoji: '🐂', hp: 100, speed: 2, size: 'large',
    aggressive: false, pack: 2, breeding: true,
    produces: { milk: 0.8, wool: 0.15 },
    feed: 'grass',
    drops: { meat_beef: 8, leather: 3, horn: 2, fur: 2 },
    spawn_biome: ['mountain'], spawn_density: 0.015,
  },
  bee: {
    ko: '꿀벌', emoji: '🐝', hp: 3, speed: 4, size: 'tiny',
    aggressive: false, pack: 100,  // 벌집
    breeding: true,
    produces: { honey: 0.3, beeswax: 0.05 },
    feed: null,  // 꽃 (자동 자연)
    drops: {},  // 도축 X
    spawn_biome: ['forest', 'plains'], spawn_density: 0.05,
  },
  silkworm: {
    ko: '누에', emoji: '🐛', hp: 1, speed: 0, size: 'tiny',
    aggressive: false, pack: 50, breeding: true,
    produces: { silk_raw: 0.2 },
    feed: 'mulberry',  // 뽕나무 잎
    drops: {},
    spawn_biome: [], spawn_density: 0,  // 야생 X (사육만)
  },
};

// === helpers ===
function _summary() {
  let wild = 0, dom = 0;
  for (const m of Object.values(ANIMALS)) {
    if (m.breeding) dom++;
    else wild++;
  }
  return { total: Object.keys(ANIMALS).length, wild, domestic: dom };
}

// biome → 가능한 사냥감 list
function huntableInBiome(biome) {
  return Object.entries(ANIMALS)
    .filter(([id, m]) => !m.breeding && m.spawn_biome.includes(biome))
    .map(([id]) => id);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ANIMALS, _summary, huntableInBiome };
}
if (typeof window !== 'undefined') {
  window.Animals = { ANIMALS };
}
