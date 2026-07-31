// === server/specialty.js — 자원 196종 catalog ===
// Phase 5-5-A
//
// 각 자원:
//   ko:           한글 이름
//   emoji:        표시 emoji
//   category:     mineral/agri/marine/forest/livestock/spice/goods/jewel
//   weight:       kg/단위 (인벤 무게 시스템)
//   baseValue:    시뮬 기준 가격 (food 1.0 기준)
//   utility:      마을 효용 가중치 (시뮬 가격 영향 — utility×인구 = 수요량)
//   contributes:  마을 stat 기여 — { subsistence, happiness, health, prestige, defense }
//   harvest:      채취 방식 — mining/farming/fishing/hunting/foraging/woodcutting/breeding/crafting
//
// 채취 방식 시스템 (Phase 5-6~5-11):
//   mining       — 광맥 cell에서 곡괭이로
//   farming      — 밭 + 씨 (이미 구현)
//   fishing      — 강·호수·바다 미니게임 (Phase 5-11)
//   hunting      — mob 사냥 + 사체 도살 (Phase 5-7)
//   foraging     — 야생 식물 채집 (E키)
//   woodcutting  — 나무 entity (Phase 5-8)
//   breeding     — 가축 사육 (Phase 5-10) — 우유·양털·실크원사
//   crafting     — 작업장 building + recipe
//
// stat 시스템:
//   subsistence  — 칼로리·생존
//   happiness    — 차·술·향신료·음식 다양성
//   health       — 약초·청결
//   prestige     — 비단·보석·도자기·금
//   defense      — 무기·갑옷

const RESOURCES = {
  // ═══════════════════════════════════════════════════════════════════
  // 🪨 광물 32개
  // ═══════════════════════════════════════════════════════════════════
  iron:        { ko: '철광석',       emoji: '⚙️', category: 'mineral', weight: 4.0, baseValue: 3,    utility: 0.5, contributes: { production: 1.0 },           harvest: 'mining' },
  copper:      { ko: '구리',         emoji: '🟠', category: 'mineral', weight: 3.5, baseValue: 4,    utility: 0.4, contributes: { production: 0.8 },           harvest: 'mining' },
  tin:         { ko: '주석',         emoji: '⚪', category: 'mineral', weight: 3.0, baseValue: 4,    utility: 0.4, contributes: { production: 0.6 },           harvest: 'mining' },
  lead:        { ko: '납',           emoji: '⬛', category: 'mineral', weight: 5.0, baseValue: 3,    utility: 0.3, contributes: { production: 0.5 },           harvest: 'mining' },
  zinc:        { ko: '아연',         emoji: '🪙', category: 'mineral', weight: 3.5, baseValue: 4,    utility: 0.3, contributes: { production: 0.5 },           harvest: 'mining' },
  silver:      { ko: '은',           emoji: '🥈', category: 'mineral', weight: 2.0, baseValue: 30,   utility: 0.4, contributes: { prestige: 0.8 },             harvest: 'mining' },
  gold:        { ko: '금',           emoji: '🥇', category: 'mineral', weight: 2.0, baseValue: 100,  utility: 0.5, contributes: { prestige: 1.5 },             harvest: 'mining' },
  mercury:     { ko: '수은',         emoji: '💧', category: 'mineral', weight: 4.0, baseValue: 50,   utility: 0.2, contributes: { production: 0.3 },           harvest: 'mining' },
  nickel:      { ko: '니켈',         emoji: '⚒️', category: 'mineral', weight: 3.5, baseValue: 8,    utility: 0.3, contributes: { production: 0.7 },           harvest: 'mining' },
  cobalt:      { ko: '코발트',       emoji: '🔵', category: 'mineral', weight: 3.5, baseValue: 40,   utility: 0.2, contributes: { production: 0.5 },           harvest: 'mining' },
  tungsten:    { ko: '텅스텐',       emoji: '⚫', category: 'mineral', weight: 4.5, baseValue: 50,   utility: 0.3, contributes: { production: 0.9 },           harvest: 'mining' },
  chromium:    { ko: '크롬',         emoji: '🌫️', category: 'mineral', weight: 4.0, baseValue: 20,   utility: 0.2, contributes: { production: 0.6 },           harvest: 'mining' },
  manganese:   { ko: '망간',         emoji: '🌑', category: 'mineral', weight: 4.0, baseValue: 8,    utility: 0.2, contributes: { production: 0.4 },           harvest: 'mining' },
  bauxite:     { ko: '보크사이트',   emoji: '🟫', category: 'mineral', weight: 4.0, baseValue: 5,    utility: 0.2, contributes: { production: 0.4 },           harvest: 'mining' },
  coal:        { ko: '석탄',         emoji: '🪨', category: 'mineral', weight: 3.0, baseValue: 2,    utility: 0.5, contributes: { production: 0.6 },           harvest: 'mining' },
  salt:        { ko: '소금',         emoji: '🧂', category: 'mineral', weight: 1.0, baseValue: 5,    utility: 0.8, contributes: { subsistence: 0.3, happiness: 0.5 }, harvest: 'mining' },
  sulfur:      { ko: '유황',         emoji: '🌕', category: 'mineral', weight: 2.0, baseValue: 6,    utility: 0.2, contributes: { production: 0.3 },           harvest: 'mining' },
  nitrate:     { ko: '초석',         emoji: '💥', category: 'mineral', weight: 2.0, baseValue: 15,   utility: 0.2, contributes: { production: 0.3 },           harvest: 'mining' },
  phosphate:   { ko: '인광석',       emoji: '🦴', category: 'mineral', weight: 4.0, baseValue: 8,    utility: 0.3, contributes: { production: 0.5 },           harvest: 'mining' },
  magnesite:   { ko: '마그네사이트', emoji: '⚪', category: 'mineral', weight: 3.5, baseValue: 25,   utility: 0.2, contributes: { production: 0.4 },           harvest: 'mining' },
  limestone:   { ko: '석회암',       emoji: '🤍', category: 'mineral', weight: 3.0, baseValue: 1,    utility: 0.4, contributes: { production: 0.5 },           harvest: 'mining' },
  marble:      { ko: '대리석',       emoji: '🪞', category: 'mineral', weight: 5.0, baseValue: 30,   utility: 0.4, contributes: { prestige: 0.6 },             harvest: 'mining' },
  granite:     { ko: '화강암',       emoji: '🔘', category: 'mineral', weight: 6.0, baseValue: 4,    utility: 0.3, contributes: { production: 0.5 },           harvest: 'mining' },
  jade_raw:    { ko: '옥 원석',      emoji: '🟢', category: 'mineral', weight: 3.0, baseValue: 80,   utility: 0.4, contributes: { prestige: 1.0 },             harvest: 'mining' },
  obsidian:    { ko: '흑요석',       emoji: '🌒', category: 'mineral', weight: 2.5, baseValue: 15,   utility: 0.3, contributes: { production: 0.5 },           harvest: 'mining' },
  flint:       { ko: '부싯돌',       emoji: '🔥', category: 'mineral', weight: 1.5, baseValue: 2,    utility: 0.4, contributes: { production: 0.5 },           harvest: 'mining' },
  amber_raw:   { ko: '호박 원석',    emoji: '🟨', category: 'mineral', weight: 0.5, baseValue: 60,   utility: 0.3, contributes: { prestige: 0.8 },             harvest: 'mining' },
  meteorite:   { ko: '운철',         emoji: '🌠', category: 'mineral', weight: 5.0, baseValue: 1000, utility: 0.2, contributes: { prestige: 3.0, production: 1.0 }, harvest: 'mining' },
  clay:        { ko: '진흙',         emoji: '🟫', category: 'mineral', weight: 3.0, baseValue: 0.5,  utility: 0.5, contributes: { production: 0.5 },           harvest: 'mining' },
  kaolin:      { ko: '고령토',       emoji: '⚪', category: 'mineral', weight: 3.5, baseValue: 8,    utility: 0.3, contributes: { production: 0.6 },           harvest: 'mining' },
  sand:        { ko: '모래',         emoji: '🟡', category: 'mineral', weight: 2.5, baseValue: 0.3,  utility: 0.4, contributes: { production: 0.3 },           harvest: 'mining' },
  soda_ash:    { ko: '소다재',       emoji: '⚪', category: 'mineral', weight: 1.0, baseValue: 4,    utility: 0.3, contributes: { production: 0.4 },           harvest: 'mining' },

  // ═══════════════════════════════════════════════════════════════════
  // 🌾 농산물 43개
  // ═══════════════════════════════════════════════════════════════════
  wheat:       { ko: '밀',       emoji: '🌾', category: 'agri', weight: 0.5, baseValue: 1.0,  utility: 1.0, contributes: { subsistence: 1.0 }, harvest: 'farming' },
  rice:        { ko: '쌀',       emoji: '🍚', category: 'agri', weight: 0.5, baseValue: 1.2,  utility: 1.0, contributes: { subsistence: 1.0 }, harvest: 'farming' },
  corn:        { ko: '옥수수',   emoji: '🌽', category: 'agri', weight: 0.5, baseValue: 1.0,  utility: 0.9, contributes: { subsistence: 1.0 }, harvest: 'farming' },
  barley:      { ko: '보리',     emoji: '🌿', category: 'agri', weight: 0.5, baseValue: 0.8,  utility: 0.9, contributes: { subsistence: 0.9 }, harvest: 'farming' },
  oats:        { ko: '귀리',     emoji: '🌾', category: 'agri', weight: 0.5, baseValue: 0.8,  utility: 0.8, contributes: { subsistence: 0.9 }, harvest: 'farming' },
  rye:         { ko: '호밀',     emoji: '🌾', category: 'agri', weight: 0.5, baseValue: 0.9,  utility: 0.8, contributes: { subsistence: 0.9 }, harvest: 'farming' },
  millet:      { ko: '기장',     emoji: '🌾', category: 'agri', weight: 0.5, baseValue: 0.8,  utility: 0.8, contributes: { subsistence: 0.9 }, harvest: 'farming' },
  sorghum:     { ko: '수수',     emoji: '🌾', category: 'agri', weight: 0.5, baseValue: 0.9,  utility: 0.7, contributes: { subsistence: 0.8 }, harvest: 'farming' },
  buckwheat:   { ko: '메밀',     emoji: '🌾', category: 'agri', weight: 0.5, baseValue: 1.0,  utility: 0.7, contributes: { subsistence: 0.8 }, harvest: 'farming' },
  potato:      { ko: '감자',     emoji: '🥔', category: 'agri', weight: 0.8, baseValue: 0.7,  utility: 0.9, contributes: { subsistence: 1.0 }, harvest: 'farming' },
  sweet_potato:{ ko: '고구마',   emoji: '🍠', category: 'agri', weight: 0.8, baseValue: 0.7,  utility: 0.8, contributes: { subsistence: 0.9 }, harvest: 'farming' },
  cassava:     { ko: '카사바',   emoji: '🥔', category: 'agri', weight: 1.0, baseValue: 0.6,  utility: 0.7, contributes: { subsistence: 0.9 }, harvest: 'farming' },
  yam:         { ko: '마',       emoji: '🥔', category: 'agri', weight: 0.8, baseValue: 0.7,  utility: 0.6, contributes: { subsistence: 0.8 }, harvest: 'farming' },
  soybean:     { ko: '콩',       emoji: '🫘', category: 'agri', weight: 0.4, baseValue: 1.5,  utility: 0.8, contributes: { subsistence: 0.8 }, harvest: 'farming' },
  chickpea:    { ko: '병아리콩', emoji: '🫘', category: 'agri', weight: 0.4, baseValue: 1.3,  utility: 0.6, contributes: { subsistence: 0.7 }, harvest: 'farming' },
  lentil:      { ko: '렌즈콩',   emoji: '🫘', category: 'agri', weight: 0.4, baseValue: 1.3,  utility: 0.6, contributes: { subsistence: 0.7 }, harvest: 'farming' },
  peanut:      { ko: '땅콩',     emoji: '🥜', category: 'agri', weight: 0.4, baseValue: 1.2,  utility: 0.5, contributes: { subsistence: 0.5, happiness: 0.2 }, harvest: 'farming' },
  cotton:      { ko: '면화',     emoji: '☁️', category: 'agri', weight: 0.3, baseValue: 6,    utility: 0.6, contributes: { production: 0.6 }, harvest: 'farming' },
  flax:        { ko: '아마',     emoji: '🪢', category: 'agri', weight: 0.4, baseValue: 5,    utility: 0.5, contributes: { production: 0.5 }, harvest: 'farming' },
  hemp:        { ko: '대마',     emoji: '🌿', category: 'agri', weight: 0.4, baseValue: 4,    utility: 0.4, contributes: { production: 0.4 }, harvest: 'farming' },
  sugarcane:   { ko: '사탕수수', emoji: '🎋', category: 'agri', weight: 1.0, baseValue: 3,    utility: 0.5, contributes: { happiness: 0.5 }, harvest: 'farming' },
  sugarbeet:   { ko: '사탕무',   emoji: '🥕', category: 'agri', weight: 1.0, baseValue: 3,    utility: 0.5, contributes: { happiness: 0.5 }, harvest: 'farming' },
  tea:         { ko: '차',       emoji: '🍵', category: 'agri', weight: 0.2, baseValue: 15,   utility: 0.6, contributes: { happiness: 1.0 }, harvest: 'farming' },
  coffee:      { ko: '커피',     emoji: '☕', category: 'agri', weight: 0.3, baseValue: 20,   utility: 0.6, contributes: { happiness: 1.0 }, harvest: 'farming' },
  cocoa:       { ko: '카카오',   emoji: '🍫', category: 'agri', weight: 0.3, baseValue: 25,   utility: 0.5, contributes: { happiness: 0.8, prestige: 0.3 }, harvest: 'farming' },
  tobacco:     { ko: '담배',     emoji: '🌿', category: 'agri', weight: 0.3, baseValue: 10,   utility: 0.4, contributes: { happiness: 0.5 }, harvest: 'farming' },
  grape:       { ko: '포도',     emoji: '🍇', category: 'agri', weight: 0.5, baseValue: 2,    utility: 0.5, contributes: { happiness: 0.4 }, harvest: 'foraging' },
  olive:       { ko: '올리브',   emoji: '🫒', category: 'agri', weight: 0.5, baseValue: 4,    utility: 0.5, contributes: { subsistence: 0.3, happiness: 0.4 }, harvest: 'foraging' },
  dates:       { ko: '대추야자', emoji: '🌴', category: 'agri', weight: 0.5, baseValue: 3,    utility: 0.6, contributes: { subsistence: 0.5, happiness: 0.3 }, harvest: 'foraging' },
  fig:         { ko: '무화과',   emoji: '🫐', category: 'agri', weight: 0.5, baseValue: 4,    utility: 0.4, contributes: { subsistence: 0.3, happiness: 0.3 }, harvest: 'foraging' },
  banana:      { ko: '바나나',   emoji: '🍌', category: 'agri', weight: 0.8, baseValue: 1.5,  utility: 0.5, contributes: { subsistence: 0.5 }, harvest: 'foraging' },
  coconut:     { ko: '코코넛',   emoji: '🥥', category: 'agri', weight: 1.5, baseValue: 2,    utility: 0.5, contributes: { subsistence: 0.5 }, harvest: 'foraging' },
  pineapple:   { ko: '파인애플', emoji: '🍍', category: 'agri', weight: 1.5, baseValue: 3,    utility: 0.4, contributes: { happiness: 0.4 }, harvest: 'foraging' },
  mango:       { ko: '망고',     emoji: '🥭', category: 'agri', weight: 0.6, baseValue: 3,    utility: 0.4, contributes: { happiness: 0.4 }, harvest: 'foraging' },
  apple:       { ko: '사과',     emoji: '🍎', category: 'agri', weight: 0.4, baseValue: 1.5,  utility: 0.5, contributes: { subsistence: 0.3, happiness: 0.3 }, harvest: 'foraging' },
  chili:       { ko: '고추',     emoji: '🌶️', category: 'agri', weight: 0.1, baseValue: 4,    utility: 0.5, contributes: { happiness: 0.6 }, harvest: 'farming' },
  garlic:      { ko: '마늘',     emoji: '🧄', category: 'agri', weight: 0.2, baseValue: 2,    utility: 0.5, contributes: { happiness: 0.4, health: 0.2 }, harvest: 'farming' },
  onion:       { ko: '양파',     emoji: '🧅', category: 'agri', weight: 0.3, baseValue: 1,    utility: 0.5, contributes: { subsistence: 0.2, happiness: 0.3 }, harvest: 'farming' },
  tomato:      { ko: '토마토',   emoji: '🍅', category: 'agri', weight: 0.3, baseValue: 1.5,  utility: 0.5, contributes: { subsistence: 0.3 }, harvest: 'farming' },
  pumpkin:     { ko: '호박',     emoji: '🎃', category: 'agri', weight: 2.0, baseValue: 1,    utility: 0.4, contributes: { subsistence: 0.5 }, harvest: 'farming' },
  mulberry:    { ko: '뽕나무 잎',emoji: '🌿', category: 'agri', weight: 0.2, baseValue: 2,    utility: 0.3, contributes: { production: 0.3 }, harvest: 'farming' },  // 누에 먹이
  cabbage:     { ko: '배추',     emoji: '🥬', category: 'agri', weight: 0.8, baseValue: 1,    utility: 0.6, contributes: { subsistence: 0.5 }, harvest: 'farming' },
  indigo_plant:{ ko: '인디고 풀',emoji: '🌱', category: 'agri', weight: 0.1, baseValue: 8,    utility: 0.3, contributes: { production: 0.4 }, harvest: 'farming' },

  // ═══════════════════════════════════════════════════════════════════
  // 🐟 수산물 16개 (whale/tuna/pearl/coral/caviar 빼기)
  // ═══════════════════════════════════════════════════════════════════
  pollock:     { ko: '명태',     emoji: '🐟', category: 'marine', weight: 0.8,  baseValue: 2,  utility: 0.7, contributes: { subsistence: 0.8 }, harvest: 'fishing' },
  salmon:      { ko: '연어',     emoji: '🐟', category: 'marine', weight: 1.5,  baseValue: 3,  utility: 0.7, contributes: { subsistence: 0.9, happiness: 0.2 }, harvest: 'fishing' },
  cod:         { ko: '대구',     emoji: '🐟', category: 'marine', weight: 1.5,  baseValue: 3,  utility: 0.7, contributes: { subsistence: 0.9 }, harvest: 'fishing' },
  herring:     { ko: '청어',     emoji: '🐟', category: 'marine', weight: 0.3,  baseValue: 1.5, utility: 0.6, contributes: { subsistence: 0.7 }, harvest: 'fishing' },
  sardine:     { ko: '정어리',   emoji: '🐟', category: 'marine', weight: 0.1,  baseValue: 1,  utility: 0.6, contributes: { subsistence: 0.5 }, harvest: 'fishing' },
  anchovy:     { ko: '멸치',     emoji: '🐟', category: 'marine', weight: 0.05, baseValue: 1,  utility: 0.6, contributes: { subsistence: 0.5 }, harvest: 'fishing' },
  trout:       { ko: '송어',     emoji: '🐟', category: 'marine', weight: 0.8,  baseValue: 2,  utility: 0.6, contributes: { subsistence: 0.7 }, harvest: 'fishing' },
  carp:        { ko: '잉어',     emoji: '🐟', category: 'marine', weight: 1.0,  baseValue: 1.5, utility: 0.5, contributes: { subsistence: 0.6 }, harvest: 'fishing' },
  shrimp:      { ko: '새우',     emoji: '🦐', category: 'marine', weight: 0.1,  baseValue: 3,  utility: 0.5, contributes: { subsistence: 0.4, happiness: 0.2 }, harvest: 'fishing' },
  crab:        { ko: '게',       emoji: '🦀', category: 'marine', weight: 1.0,  baseValue: 6,  utility: 0.5, contributes: { subsistence: 0.5, happiness: 0.3 }, harvest: 'fishing' },
  lobster:     { ko: '바닷가재', emoji: '🦞', category: 'marine', weight: 2.0,  baseValue: 12, utility: 0.4, contributes: { happiness: 0.6, prestige: 0.2 }, harvest: 'fishing' },
  oyster:      { ko: '굴',       emoji: '🦪', category: 'marine', weight: 0.2,  baseValue: 4,  utility: 0.4, contributes: { subsistence: 0.3, happiness: 0.3 }, harvest: 'fishing' },
  abalone:     { ko: '전복',     emoji: '🐚', category: 'marine', weight: 0.5,  baseValue: 15, utility: 0.4, contributes: { happiness: 0.5, prestige: 0.3 }, harvest: 'fishing' },
  octopus:     { ko: '문어',     emoji: '🐙', category: 'marine', weight: 2.0,  baseValue: 5,  utility: 0.4, contributes: { subsistence: 0.5, happiness: 0.2 }, harvest: 'fishing' },
  squid:       { ko: '오징어',   emoji: '🦑', category: 'marine', weight: 1.0,  baseValue: 3,  utility: 0.4, contributes: { subsistence: 0.5 }, harvest: 'fishing' },
  seaweed:     { ko: '미역·다시마',emoji: '🌿', category: 'marine', weight: 0.3,  baseValue: 2,  utility: 0.5, contributes: { subsistence: 0.4, health: 0.2 }, harvest: 'fishing' },
  murex_shell: { ko: '자색고둥', emoji: '🐚', category: 'marine', weight: 0.5,  baseValue: 40, utility: 0.3, contributes: { production: 0.5 }, harvest: 'fishing' },  // 자색 염료

  // ═══════════════════════════════════════════════════════════════════
  // 🌲 임산물 27개
  // ═══════════════════════════════════════════════════════════════════
  pine_log:    { ko: '소나무 통나무',   emoji: '🪵', category: 'forest', weight: 5.0, baseValue: 1.5, utility: 0.7, contributes: { production: 0.7 }, harvest: 'woodcutting' },
  oak_log:     { ko: '참나무 통나무',   emoji: '🪵', category: 'forest', weight: 6.0, baseValue: 2.5, utility: 0.6, contributes: { production: 0.9 }, harvest: 'woodcutting' },
  birch_log:   { ko: '자작나무',       emoji: '🪵', category: 'forest', weight: 4.0, baseValue: 2,   utility: 0.5, contributes: { production: 0.7 }, harvest: 'woodcutting' },
  cedar_log:   { ko: '삼나무',         emoji: '🪵', category: 'forest', weight: 5.0, baseValue: 3,   utility: 0.5, contributes: { production: 0.8 }, harvest: 'woodcutting' },
  bamboo:      { ko: '대나무',         emoji: '🎋', category: 'forest', weight: 1.5, baseValue: 2,   utility: 0.6, contributes: { production: 0.7 }, harvest: 'woodcutting' },
  teak_log:    { ko: '티크',           emoji: '🪵', category: 'forest', weight: 7.0, baseValue: 8,   utility: 0.4, contributes: { production: 1.2, prestige: 0.3 }, harvest: 'woodcutting' },
  mahogany_log:{ ko: '마호가니',       emoji: '🪵', category: 'forest', weight: 7.0, baseValue: 12,  utility: 0.4, contributes: { prestige: 0.6 }, harvest: 'woodcutting' },
  ebony_log:   { ko: '흑단',           emoji: '🪵', category: 'forest', weight: 8.0, baseValue: 20,  utility: 0.3, contributes: { prestige: 0.9 }, harvest: 'woodcutting' },
  rubber:      { ko: '고무',           emoji: '🟤', category: 'forest', weight: 0.5, baseValue: 6,   utility: 0.4, contributes: { production: 0.5 }, harvest: 'foraging' },
  cork:        { ko: '코르크',         emoji: '🟫', category: 'forest', weight: 0.2, baseValue: 3,   utility: 0.3, contributes: { production: 0.3 }, harvest: 'foraging' },
  resin:       { ko: '송진',           emoji: '🟡', category: 'forest', weight: 0.3, baseValue: 4,   utility: 0.4, contributes: { production: 0.4 }, harvest: 'foraging' },
  amber_resin: { ko: '호박',           emoji: '🟨', category: 'forest', weight: 0.05,baseValue: 80,  utility: 0.3, contributes: { prestige: 1.0 }, harvest: 'foraging' },
  latex:       { ko: '라텍스',         emoji: '🌫️', category: 'forest', weight: 0.5, baseValue: 5,   utility: 0.3, contributes: { production: 0.4 }, harvest: 'foraging' },
  ginseng:     { ko: '인삼',           emoji: '🌱', category: 'forest', weight: 0.05,baseValue: 50,  utility: 0.4, contributes: { health: 1.2, prestige: 0.3 }, harvest: 'foraging' },
  wild_ginseng:{ ko: '산삼',           emoji: '🌱', category: 'forest', weight: 0.05,baseValue: 500, utility: 0.2, contributes: { health: 2.0, prestige: 1.5 }, harvest: 'foraging' },
  herbs:       { ko: '약초',           emoji: '🌿', category: 'forest', weight: 0.05,baseValue: 3,   utility: 0.5, contributes: { health: 0.5 }, harvest: 'foraging' },
  chamomile:   { ko: '카모마일',       emoji: '🌼', category: 'forest', weight: 0.05,baseValue: 4,   utility: 0.4, contributes: { health: 0.4, happiness: 0.2 }, harvest: 'foraging' },
  sage:        { ko: '세이지',         emoji: '🌿', category: 'forest', weight: 0.05,baseValue: 4,   utility: 0.4, contributes: { health: 0.4, happiness: 0.2 }, harvest: 'foraging' },
  truffle:     { ko: '송로버섯',       emoji: '🍄', category: 'forest', weight: 0.05,baseValue: 200, utility: 0.3, contributes: { happiness: 1.0, prestige: 1.0 }, harvest: 'foraging' },
  mushroom:    { ko: '버섯',           emoji: '🍄', category: 'forest', weight: 0.1, baseValue: 2,   utility: 0.5, contributes: { subsistence: 0.3, happiness: 0.2 }, harvest: 'foraging' },
  honey:       { ko: '꿀',             emoji: '🍯', category: 'forest', weight: 0.5, baseValue: 5,   utility: 0.6, contributes: { happiness: 0.7, subsistence: 0.3 }, harvest: 'foraging' },
  beeswax:     { ko: '밀랍',           emoji: '🟡', category: 'forest', weight: 0.3, baseValue: 4,   utility: 0.4, contributes: { production: 0.4 }, harvest: 'foraging' },
  nuts:        { ko: '견과류',         emoji: '🌰', category: 'forest', weight: 0.3, baseValue: 2,   utility: 0.5, contributes: { subsistence: 0.4, happiness: 0.2 }, harvest: 'foraging' },
  fruit_berries:{ ko: '산딸기',        emoji: '🫐', category: 'forest', weight: 0.2, baseValue: 1.5, utility: 0.5, contributes: { subsistence: 0.3, happiness: 0.2 }, harvest: 'foraging' },
  birch_sap:   { ko: '자작나무 수액',  emoji: '💧', category: 'forest', weight: 0.5, baseValue: 3,   utility: 0.3, contributes: { happiness: 0.3 }, harvest: 'foraging' },
  charcoal:    { ko: '숯',             emoji: '🌑', category: 'forest', weight: 1.0, baseValue: 2,   utility: 0.5, contributes: { production: 0.7 }, harvest: 'crafting' },  // wood → charcoal
  paper_mulberry:{ ko: '닥나무 껍질',  emoji: '🪵', category: 'forest', weight: 0.5, baseValue: 5,   utility: 0.3, contributes: { production: 0.5 }, harvest: 'woodcutting' },  // 종이 원료

  // ═══════════════════════════════════════════════════════════════════
  // 🐄 축산물 21개 (silkworm 추가, 가축 + 사냥 부산물)
  // ═══════════════════════════════════════════════════════════════════
  meat_beef:   { ko: '쇠고기',     emoji: '🥩', category: 'livestock', weight: 1.0, baseValue: 5,  utility: 0.7, contributes: { subsistence: 0.8, happiness: 0.3 }, harvest: 'breeding' },
  meat_pork:   { ko: '돼지고기',   emoji: '🥩', category: 'livestock', weight: 1.0, baseValue: 4,  utility: 0.7, contributes: { subsistence: 0.8, happiness: 0.3 }, harvest: 'breeding' },
  meat_mutton: { ko: '양고기',     emoji: '🥩', category: 'livestock', weight: 1.0, baseValue: 4,  utility: 0.6, contributes: { subsistence: 0.7, happiness: 0.2 }, harvest: 'breeding' },
  meat_chicken:{ ko: '닭고기',     emoji: '🍗', category: 'livestock', weight: 0.5, baseValue: 2,  utility: 0.6, contributes: { subsistence: 0.5 }, harvest: 'breeding' },
  meat_game:   { ko: '사슴·들짐승고기', emoji: '🍖', category: 'livestock', weight: 1.0, baseValue: 4, utility: 0.6, contributes: { subsistence: 0.7 }, harvest: 'hunting' },
  fur:         { ko: '모피',       emoji: '🦊', category: 'livestock', weight: 1.0, baseValue: 25, utility: 0.4, contributes: { happiness: 0.5, prestige: 0.6 }, harvest: 'hunting' },
  leather:     { ko: '가죽',       emoji: '🟫', category: 'livestock', weight: 0.5, baseValue: 5,  utility: 0.6, contributes: { production: 0.7 }, harvest: 'hunting' },
  wool:        { ko: '양털',       emoji: '🧶', category: 'livestock', weight: 0.3, baseValue: 4,  utility: 0.6, contributes: { production: 0.6 }, harvest: 'breeding' },
  silk_raw:    { ko: '비단 원사',  emoji: '🧵', category: 'livestock', weight: 0.2, baseValue: 30, utility: 0.4, contributes: { production: 0.8 }, harvest: 'breeding' },
  silkworm:    { ko: '누에',       emoji: '🐛', category: 'livestock', weight: 0.01,baseValue: 5,  utility: 0.2, contributes: { production: 0.2 }, harvest: 'breeding' },
  linen:       { ko: '리넨',       emoji: '🪢', category: 'livestock', weight: 0.3, baseValue: 5,  utility: 0.4, contributes: { production: 0.5 }, harvest: 'crafting' },  // flax → linen
  feather:     { ko: '깃털',       emoji: '🪶', category: 'livestock', weight: 0.05,baseValue: 3,  utility: 0.3, contributes: { production: 0.3 }, harvest: 'hunting' },
  ivory:       { ko: '상아',       emoji: '🦴', category: 'livestock', weight: 3.0, baseValue: 80, utility: 0.3, contributes: { prestige: 1.5 }, harvest: 'hunting' },
  bone:        { ko: '뼈',         emoji: '🦴', category: 'livestock', weight: 1.0, baseValue: 2,  utility: 0.4, contributes: { production: 0.4 }, harvest: 'hunting' },
  horn:        { ko: '뿔',         emoji: '🦌', category: 'livestock', weight: 0.5, baseValue: 6,  utility: 0.3, contributes: { production: 0.5 }, harvest: 'hunting' },
  milk:        { ko: '우유',       emoji: '🥛', category: 'livestock', weight: 1.0, baseValue: 1,  utility: 0.5, contributes: { subsistence: 0.4, health: 0.2 }, harvest: 'breeding' },
  cheese:      { ko: '치즈',       emoji: '🧀', category: 'livestock', weight: 0.5, baseValue: 5,  utility: 0.5, contributes: { subsistence: 0.4, happiness: 0.4 }, harvest: 'crafting' },  // milk → cheese
  egg:         { ko: '계란',       emoji: '🥚', category: 'livestock', weight: 0.06,baseValue: 1,  utility: 0.6, contributes: { subsistence: 0.5 }, harvest: 'breeding' },
  beef_tallow: { ko: '소기름',     emoji: '🟡', category: 'livestock', weight: 0.5, baseValue: 3,  utility: 0.3, contributes: { production: 0.3 }, harvest: 'hunting' },
  goat_milk:   { ko: '염소젖',     emoji: '🥛', category: 'livestock', weight: 1.0, baseValue: 1.5, utility: 0.4, contributes: { subsistence: 0.4, health: 0.2 }, harvest: 'breeding' },
  duck_meat:   { ko: '오리고기',   emoji: '🍗', category: 'livestock', weight: 0.5, baseValue: 3,  utility: 0.5, contributes: { subsistence: 0.5, happiness: 0.2 }, harvest: 'breeding' },

  // ═══════════════════════════════════════════════════════════════════
  // 🌶️ 향신료 22개 (opium/coca/khat 빼기)
  // ═══════════════════════════════════════════════════════════════════
  black_pepper:{ ko: '후추',       emoji: '🌶️', category: 'spice', weight: 0.1,  baseValue: 40,  utility: 0.6, contributes: { happiness: 1.2, prestige: 0.3 }, harvest: 'foraging' },
  cinnamon:    { ko: '계피',       emoji: '🟫', category: 'spice', weight: 0.1,  baseValue: 35,  utility: 0.6, contributes: { happiness: 1.0, prestige: 0.3 }, harvest: 'foraging' },
  clove:       { ko: '정향',       emoji: '🌑', category: 'spice', weight: 0.05, baseValue: 60,  utility: 0.5, contributes: { happiness: 1.0, prestige: 0.4 }, harvest: 'foraging' },
  nutmeg:      { ko: '육두구',     emoji: '🌰', category: 'spice', weight: 0.05, baseValue: 50,  utility: 0.5, contributes: { happiness: 0.9, prestige: 0.3 }, harvest: 'foraging' },
  ginger:      { ko: '생강',       emoji: '🫚', category: 'spice', weight: 0.3,  baseValue: 5,   utility: 0.5, contributes: { happiness: 0.5, health: 0.3 }, harvest: 'farming' },
  turmeric:    { ko: '강황',       emoji: '🟡', category: 'spice', weight: 0.2,  baseValue: 8,   utility: 0.5, contributes: { happiness: 0.4, health: 0.4 }, harvest: 'farming' },
  cardamom:    { ko: '카다멈',     emoji: '🌿', category: 'spice', weight: 0.05, baseValue: 80,  utility: 0.4, contributes: { happiness: 1.0, prestige: 0.5 }, harvest: 'foraging' },
  vanilla:     { ko: '바닐라',     emoji: '🟤', category: 'spice', weight: 0.05, baseValue: 100, utility: 0.4, contributes: { happiness: 1.2, prestige: 0.5 }, harvest: 'foraging' },
  saffron:     { ko: '사프란',     emoji: '🟧', category: 'spice', weight: 0.005,baseValue: 500, utility: 0.3, contributes: { happiness: 1.5, prestige: 1.5 }, harvest: 'foraging' },
  star_anise:  { ko: '팔각',       emoji: '⭐', category: 'spice', weight: 0.1,  baseValue: 20,  utility: 0.4, contributes: { happiness: 0.7, prestige: 0.2 }, harvest: 'foraging' },
  coriander:   { ko: '고수',       emoji: '🌿', category: 'spice', weight: 0.1,  baseValue: 5,   utility: 0.4, contributes: { happiness: 0.4 }, harvest: 'farming' },
  cumin:       { ko: '큐민',       emoji: '🌰', category: 'spice', weight: 0.1,  baseValue: 8,   utility: 0.4, contributes: { happiness: 0.5 }, harvest: 'farming' },
  paprika:     { ko: '파프리카',   emoji: '🟥', category: 'spice', weight: 0.1,  baseValue: 5,   utility: 0.4, contributes: { happiness: 0.5 }, harvest: 'farming' },
  basil:       { ko: '바질',       emoji: '🌿', category: 'spice', weight: 0.05, baseValue: 4,   utility: 0.3, contributes: { happiness: 0.4, health: 0.2 }, harvest: 'foraging' },
  mint:        { ko: '박하',       emoji: '🌿', category: 'spice', weight: 0.05, baseValue: 3,   utility: 0.4, contributes: { happiness: 0.4, health: 0.3 }, harvest: 'foraging' },
  lavender:    { ko: '라벤더',     emoji: '💜', category: 'spice', weight: 0.05, baseValue: 6,   utility: 0.3, contributes: { happiness: 0.6, health: 0.2 }, harvest: 'foraging' },
  rosemary:    { ko: '로즈마리',   emoji: '🌿', category: 'spice', weight: 0.05, baseValue: 4,   utility: 0.3, contributes: { happiness: 0.4, health: 0.2 }, harvest: 'foraging' },
  thyme:       { ko: '타임',       emoji: '🌿', category: 'spice', weight: 0.05, baseValue: 4,   utility: 0.3, contributes: { happiness: 0.4, health: 0.2 }, harvest: 'foraging' },
  sage_herb:   { ko: '세이지 향초',emoji: '🌿', category: 'spice', weight: 0.05, baseValue: 4,   utility: 0.3, contributes: { happiness: 0.4, health: 0.2 }, harvest: 'foraging' },
  musk:        { ko: '사향',       emoji: '🟤', category: 'spice', weight: 0.005,baseValue: 300, utility: 0.2, contributes: { prestige: 2.5 }, harvest: 'hunting' },  // 사향노루
  frankincense:{ ko: '유향',       emoji: '🟡', category: 'spice', weight: 0.1,  baseValue: 80,  utility: 0.3, contributes: { prestige: 1.5, happiness: 0.5 }, harvest: 'foraging' },
  myrrh:       { ko: '몰약',       emoji: '🟤', category: 'spice', weight: 0.1,  baseValue: 100, utility: 0.3, contributes: { prestige: 1.5, health: 0.3 }, harvest: 'foraging' },

  // ═══════════════════════════════════════════════════════════════════
  // 🏺 가공품 20개 (gunpowder/whiskey/rum/celadon/porcelain 빼기)
  // ═══════════════════════════════════════════════════════════════════
  plank:       { ko: '판자',         emoji: '🪵', category: 'goods', weight: 2.0, baseValue: 3,   utility: 0.6, contributes: { production: 0.8 }, harvest: 'crafting' },  // log → plank
  stone_brick: { ko: '석재 벽돌',    emoji: '🧱', category: 'goods', weight: 4.0, baseValue: 5,   utility: 0.4, contributes: { production: 0.6, defense: 0.3 }, harvest: 'crafting' },
  clay_brick:  { ko: '진흙 벽돌',    emoji: '🟫', category: 'goods', weight: 3.0, baseValue: 2,   utility: 0.5, contributes: { production: 0.5 }, harvest: 'crafting' },
  pottery:     { ko: '도자기',       emoji: '🏺', category: 'goods', weight: 2.0, baseValue: 15,  utility: 0.4, contributes: { happiness: 0.5, prestige: 0.8 }, harvest: 'crafting' },
  silk_cloth:  { ko: '비단',         emoji: '🧵', category: 'goods', weight: 0.5, baseValue: 60,  utility: 0.4, contributes: { happiness: 0.5, prestige: 1.5 }, harvest: 'crafting' },
  clothes:     { ko: '옷',           emoji: '🧥', category: 'goods', weight: 0.5, baseValue: 8,   utility: 0.8, contributes: { happiness: 0.2 }, harvest: 'crafting' },  // ★의복(2026-07-12): 1인 1벌 자본재 — 한랭 건강 효과는 커버리지 로직(econ v1)이 처리(contributes 이중계상 방지, 소폭 행복만)
  paper:       { ko: '종이',         emoji: '📜', category: 'goods', weight: 0.3, baseValue: 8,   utility: 0.4, contributes: { prestige: 0.8 }, harvest: 'crafting' },
  ink:         { ko: '먹',           emoji: '🖋️', category: 'goods', weight: 0.2, baseValue: 10,  utility: 0.3, contributes: { prestige: 0.7 }, harvest: 'crafting' },
  brush:       { ko: '붓',           emoji: '🖌️', category: 'goods', weight: 0.1, baseValue: 6,   utility: 0.3, contributes: { prestige: 0.5 }, harvest: 'crafting' },
  sword:       { ko: '도검',         emoji: '⚔️', category: 'goods', weight: 1.5, baseValue: 50,  utility: 0.4, contributes: { defense: 1.5, prestige: 0.5 }, harvest: 'crafting' },
  armor:       { ko: '갑옷',         emoji: '🛡️', category: 'goods', weight: 8.0, baseValue: 100, utility: 0.4, contributes: { defense: 2.0 }, harvest: 'crafting' },
  bow:         { ko: '활',           emoji: '🏹', category: 'goods', weight: 0.8, baseValue: 15,  utility: 0.4, contributes: { defense: 0.8 }, harvest: 'crafting' },
  glass:       { ko: '유리',         emoji: '🪞', category: 'goods', weight: 1.0, baseValue: 10,  utility: 0.4, contributes: { production: 0.5, prestige: 0.4 }, harvest: 'crafting' },
  perfume:     { ko: '향수',         emoji: '🌸', category: 'goods', weight: 0.1, baseValue: 80,  utility: 0.3, contributes: { happiness: 0.8, prestige: 1.5 }, harvest: 'crafting' },
  dye_purple:  { ko: '자색 염료',    emoji: '🟣', category: 'goods', weight: 0.05,baseValue: 150, utility: 0.3, contributes: { prestige: 2.0 }, harvest: 'crafting' },
  dye_indigo:  { ko: '인디고',       emoji: '🔵', category: 'goods', weight: 0.05,baseValue: 30,  utility: 0.3, contributes: { prestige: 0.7 }, harvest: 'crafting' },
  wine:        { ko: '와인',         emoji: '🍷', category: 'goods', weight: 1.0, baseValue: 8,   utility: 0.5, contributes: { happiness: 1.0 }, harvest: 'crafting' },
  beer:        { ko: '맥주',         emoji: '🍺', category: 'goods', weight: 1.0, baseValue: 3,   utility: 0.5, contributes: { happiness: 0.7 }, harvest: 'crafting' },
  soy_sauce:   { ko: '간장',         emoji: '🟫', category: 'goods', weight: 1.0, baseValue: 5,   utility: 0.4, contributes: { happiness: 0.5 }, harvest: 'crafting' },
  kimchi:      { ko: '김치',         emoji: '🥬', category: 'goods', weight: 1.0, baseValue: 3,   utility: 0.5, contributes: { subsistence: 0.4, happiness: 0.6 }, harvest: 'crafting' },
  bread:       { ko: '빵',           emoji: '🍞', category: 'goods', weight: 0.5, baseValue: 2,   utility: 0.7, contributes: { subsistence: 0.8 }, harvest: 'crafting' },

  // ═══════════════════════════════════════════════════════════════════
  // 💎 보석·진귀품 15개
  // ═══════════════════════════════════════════════════════════════════
  diamond:     { ko: '다이아몬드',   emoji: '💎', category: 'jewel', weight: 0.005,baseValue: 1000, utility: 0.2, contributes: { prestige: 5.0 }, harvest: 'mining' },
  ruby:        { ko: '루비',         emoji: '❤️', category: 'jewel', weight: 0.005,baseValue: 500,  utility: 0.2, contributes: { prestige: 3.0 }, harvest: 'mining' },
  sapphire:    { ko: '사파이어',     emoji: '💙', category: 'jewel', weight: 0.005,baseValue: 400,  utility: 0.2, contributes: { prestige: 2.5 }, harvest: 'mining' },
  emerald:     { ko: '에메랄드',     emoji: '💚', category: 'jewel', weight: 0.005,baseValue: 600,  utility: 0.2, contributes: { prestige: 3.5 }, harvest: 'mining' },
  topaz:       { ko: '토파즈',       emoji: '🟡', category: 'jewel', weight: 0.005,baseValue: 80,   utility: 0.2, contributes: { prestige: 1.0 }, harvest: 'mining' },
  amethyst:    { ko: '자수정',       emoji: '💜', category: 'jewel', weight: 0.005,baseValue: 60,   utility: 0.2, contributes: { prestige: 0.8 }, harvest: 'mining' },
  turquoise:   { ko: '터키석',       emoji: '🩵', category: 'jewel', weight: 0.01, baseValue: 50,   utility: 0.2, contributes: { prestige: 0.7 }, harvest: 'mining' },
  jade_polished:{ ko: '옥 가공품',   emoji: '🟢', category: 'jewel', weight: 0.5,  baseValue: 200,  utility: 0.3, contributes: { prestige: 2.0 }, harvest: 'crafting' },
  amber_polished:{ ko: '호박 가공',  emoji: '🟨', category: 'jewel', weight: 0.1,  baseValue: 150,  utility: 0.3, contributes: { prestige: 1.5 }, harvest: 'crafting' },
  gold_coin:   { ko: '금화',         emoji: '🪙', category: 'jewel', weight: 0.01, baseValue: 50,   utility: 0.4, contributes: { prestige: 0.3 }, harvest: 'crafting' },
  silver_coin: { ko: '은화',         emoji: '🪙', category: 'jewel', weight: 0.01, baseValue: 8,    utility: 0.4, contributes: { prestige: 0.1 }, harvest: 'crafting' },
  relic:       { ko: '유물',         emoji: '🗿', category: 'jewel', weight: 5.0,  baseValue: 500,  utility: 0.2, contributes: { prestige: 3.0 }, harvest: 'foraging' },  // 발굴
  scroll:      { ko: '두루마리',     emoji: '📜', category: 'jewel', weight: 0.3,  baseValue: 80,   utility: 0.3, contributes: { prestige: 1.0 }, harvest: 'crafting' },

};

// 카테고리별 통계 (확인용)
function _summary() {
  const cats = {};
  for (const [id, r] of Object.entries(RESOURCES)) {
    cats[r.category] = (cats[r.category] || 0) + 1;
  }
  return cats;
}

// 채취 방식별 자원 list
function _byHarvest() {
  const m = {};
  for (const [id, r] of Object.entries(RESOURCES)) {
    if (!m[r.harvest]) m[r.harvest] = [];
    m[r.harvest].push(id);
  }
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════
// === 채굴 — 11차 전면 재설계 [재민 확정] ===
// ═══════════════════════════════════════════════════════════════════════════
// 구 모델(폐기): 셀 번영도 100 · 1타에 cost 10 · tier별 refillMs 1~24시간 · dropChance.
//   결함 셋 — ①1타=10이면 셀 하나를 10번 파고 고갈, 실척으로 1m²를 **1.3cm** 판 셈(고증 붕괴)
//             ②서버 쿨다운이 없어 E 연타(초당 3~5타)가 그대로 통과 → 한 명이 광맥 하루치를 20분에 긁음
//             ③드롭 실패해도 재고는 깎여 이중 손해
//
// 신 모델 — 단위가 전부 실측에서 유도된다:
//   · 1타 = **1초** (게임일 24분 = 1440 게임분 ⇒ 1 게임분 = 1 실시간초)
//   · **60타 = 재고 1 = 돌덩이 1개**  ⇒ 광부는 1 게임시간에 덩이 하나
//   · 셀 재고 K = **1000** = 1m²를 **130cm** 파는 양 (덩이 3.5kg · 암석 2.7t/m³)
//   · 캐면 **무조건 뭔가 나온다**(실패 없음). 다만 나온 것이 광석인지 그냥 돌인지는
//     **채굴 시점에 알 수 없다** — 미확인 `ore_chunk`로 들어오고 마을에서 **선광**해야 갈린다.
//   · 광석일 확률 p 는 셀마다 다른 **연속장**(terrain.oreProbAt) — 광맥 중심이 높고 평지는 0.
//
// 고증 눈금(Great Orme, 웨일스, BC1700~900): 800년 채굴 · 굴착 3~10만 m³.
//   광부 30명 × 600 게임년 = 96.8M 덩이 = 33.9만 톤 — 상한 추정 27만 톤의 1.25배(같은 규모).
const ORE_K = 1000;              // 셀 재고(덩이)
const MINE_SWING_MS = 1000;      // 1타 = 1초 (서버 강제 쿨다운)
const MINE_SWINGS_PER = 60;      // 60타 = 재고 1 = 덩이 1
const CHUNK_KG = 3.5;            // 돌덩이 1개 무게

// 리젠 — 고갈될수록 빨라지되 **2배 안에서만**(재민 확정: 플레이어가 몰릴 때의 완충).
//   dR/dt = ORE_REG0 + ORE_REG1·(1 − R/K) = A − B·R   (게임일 단위)
//   만땅 0.01/게임일 · 완전고갈 0.02/게임일.
//   ★선형이 아니므로 **닫힌 해**로 적분한다 — lazy 갱신에서 dt가 아무리 길어도 오차 0:
//     R(t) = A/B − (A/B − R0)·e^(−B·t) = 2000 − (2000−R0)·e^(−t/100000)
//   완전고갈→만땅 69,315 게임일 = 190 게임년(선형 0.01이면 274년).
//   ※기각안: dR=r(1−R/K) 단독 → 빈 셀은 선형과 같고 중·고 재고만 느려져 고갈이 *더* 잘 됨(의도 반대)
//            dR=r·K/R 류 → R→0에서 발산 → 고갈이 물리적으로 불가능
const ORE_REG0 = 0.01, ORE_REG1 = 0.01;
const _ORE_A = ORE_REG0 + ORE_REG1, _ORE_B = ORE_REG1 / ORE_K, _ORE_ASY = _ORE_A / _ORE_B;
function oreRegen(R0, gameDays) {
  if (!(gameDays > 0)) return Math.min(ORE_K, R0);
  return Math.min(ORE_K, _ORE_ASY - (_ORE_ASY - R0) * Math.exp(-_ORE_B * gameDays));
}
// 광부 1명 일일 정산량(NPC 마을 경제용) — L_MINE 동형 유도:
//   1440 게임분 × 노동률 0.633 × 왕복효율 0.9697 ÷ 60 = 14.73 덩이/게임일
//   노동률   = 낮 0.70 − 기상시차 0.015 − 반일근무 0.052 (villages.js 스케줄 상수 실측)
//   왕복효율 = (지게 8덩이 × 60분) / (그 + 왕복 15분) — 덩이당 60분이라 왕복 비중이 3%뿐이다.
//              ⇒ 무게·왕복은 가까운 광맥에선 제동이 아니고 **먼 광맥 원정**에서만 물린다:
//                 왕복 15분(7.5셀) 0.970 · 100분(50셀) 0.828 · 200분(100셀) 0.706 · 800분(400셀) 0.375
const MINE_HAUL = 8, MINE_HAUL_TRIP = 15, MINE_LABOR = 0.633;
const MINE_HAULEFF = (MINE_HAUL * MINE_SWINGS_PER) / (MINE_HAUL * MINE_SWINGS_PER + MINE_HAUL_TRIP);
const NPC_MINE_PER_DAY = +(1440 * MINE_LABOR * MINE_HAULEFF / MINE_SWINGS_PER).toFixed(2);   // 14.73
// 먼 광맥 왕복 효율 — land.ore 의 거리 가중, NPC 원정 판정 공용. d = 왕복 게임분(= 셀거리, L_WALK 2셀/분 왕복)
function haulEff(tripMinutes) { const m = MINE_HAUL * MINE_SWINGS_PER; return m / (m + Math.max(0, tripMinutes)); }

// ── 광물 가치 → 품위(p_peak) 감쇠 [11차 재민 확정] ──────────────────────
// 재민: "금광 같은 건 전부 p값 조절을 하면 되지 않아?"
//   맞다. 광물 *종류*를 지도에서 빼면 고증이 깨진다(한반도에 금이 아예 없던 건 아니다).
//   대신 **품위**를 낮춘다 — 금맥은 있되 한 삽에 금이 나올 확률이 낮다. 그게 실제 광상이다.
//   (금 품위는 g/t 단위, 철광은 %(=만 g/t) 단위. 실제로 5~6자릿수 차이가 난다.)
//
// oreValueScale(v) = clamp((5/v)^0.8, 0.01, 1.0)      — 기준 v=5(흔한 광물)에서 1.0
//   철 3 → 1.00 · 구리 4 → 1.00 · 대리석 30 → 0.240 · 텅스텐 50 → 0.158
//   옥 80 → 0.109 · 금 100 → 0.091 · 다이아 1000 → 0.014
//   ★바닥은 0.01. 0.10으로 두면 금(100)과 다이아(1000)가 같은 배수가 돼 가치흐름이 100으로 튄다(실측).
// 검산(가치 흐름 = 가치 × 품위배수, 광맥 크기 동일 가정):
//   석탄 2.0 · 철 3.0 · 구리 4.0 · 대리석 7.2 · 텅스텐 7.9 · 옥 8.7 · 금 9.1 · 다이아 14.4
//   ⇒ 귀금속이 여전히 낫지만 **3~4배 안**이다. 구 모델(금이 철의 33배)의 인플레가 사라진다.
// 지수 0.8은 노브다: 1.0이면 가치 완전 중립(금=철), 0.5면 금이 철의 8배로 벌어진다.
const ORE_VALUE_EXP = 0.8;
function oreValueScale(baseValue) {
  const v = Math.max(0.5, baseValue || 5);
  return Math.max(0.01, Math.min(1.0, Math.pow(5 / v, ORE_VALUE_EXP)));
}
// 클러스터 p_peak — 등급 기준값 × 위치 지터(0.4~1.6) × 가치 감쇠.
//   지터가 있어서 "넓지만 가난한 광맥"도, "작지만 노다지"도 생긴다.
// ★[재민 (다) 확정] **등급 서열은 지키고 총량만 중립화**하는 전역 축척.
//   배치기가 대형(0.45)·중형(0.38)을 r22 등급(0.30)으로 몰래 강등시켜 온 걸 되돌렸더니
//   전 광물 산출이 +17%(38,276 → 44,769)가 됐다. 등급표를 손대면 서열이 흐려지므로
//   **곱하기 하나**로 총량만 되돌린다 — 곱이라 등급 비율·광물 비율·자리별 편차가 전부 보존된다.
//   k 는 실측으로 풀었다(전 광맥 셀을 훑으며 여러 k 를 동시에 적분):
//     k=1.000 → 44,769 (+17.0%) · k=0.900 → 40,306 (+5.3%) · **k=0.855 → 38,296 (+0.1%)** · k=0.800 → 35,840 (−6.4%)
//   ※합성(1−∏(1−p_i)) 때문에 총량은 k에 정확히 비례하지 않는다 — 그래서 계산이 아니라 실측으로 잡았다.
//   ※이 값을 바꾸면 **terrain.json 에 박힌 pk 도 같은 비율로 다시 매겨야 한다**(저장값이라 자동 반영 안 됨).
const ORE_P_SCALE = 1.1841;   // ★광종을 지역 무관·골고루로 되돌리며 고가 광물(옥·금)이 늘어 총량 −16% → k 1.198 재보정(실측 38,315 = +0.1%)

// ★★[재민 확정] "크기 무관 모든 광맥이 평균이 비슷하게" + "광맥의 평균의 표준편차가 크게"
//
//   ① **크기는 등급을 정하지 않는다.** 등급기준을 하나로 합쳤다(ORE_TIER_BASE).
//      기각된 것: r130 0.45 / r70 0.38 / r22 0.30 / 자잘 0.22 (큰 광맥일수록 진함).
//      기각 이유가 둘이다.
//        · 고증이 반대다 — 거대 광체는 오히려 **저품위**다(반암동광은 산 하나가 광체인데
//          구리 0.5% 미만). 좁은 열수맥이 작고 진하다. "크면 넓고 묽다"가 자연스럽다.
//        · 이중 보상이었다 — 광부 정원(villages.oreD)은 **면적만** 본다(품위를 안 본다).
//          대형은 이미 넓이·수명·정원으로 보상받는데 품위까지 높으면 자잘을 찾을 이유가 없다.
//      ⇒ 이제 큰 광맥은 **넓고 오래 가고**, 작은 광맥도 **똑같이 진할 수 있다**.
//        r7 짜리가 r130 보다 진한 일이 흔하다 — 그게 탐험의 보상이다.
//
//   ② **광맥 사이 산포를 크게.** 균등 지터 0.4~1.6(CV 0.346)을 **로그정규**로 바꿨다.
//      고증: 광상의 품위 분포는 로그정규다(Ahrens 의 법칙 · De Wijs). 대부분은 그저 그렇고
//      드물게 노다지가 있다 — 균등분포는 "적당한 광맥"이 너무 흔하다.
//        mult = exp(σZ − σ²/2)  ⇒ 기댓값 정확히 1 (총량을 안 흔든다)
//        σ = 0.75 → CV = √(e^0.5625 − 1) = 0.869   (실측 0.394 → 목표 ~0.85)
//      Z 는 균등 해시를 **역정규누적분포**로 밀어 만든다(결정론 유지 — 좌표만 알면 재현된다).
//      꼬리는 [0.12, 4.0] 으로 자른다(p 가 1을 넘지 않게 · 완전 빈 광맥이 안 생기게).
const ORE_TIER_BASE = 0.30;     // 전 등급 공통. 크기는 **넓이**로만 말한다.
const ORE_LN_SIGMA = 0.75;      // 광맥 사이 산포(로그정규 σ) — 클수록 노다지/꽝의 차이가 커진다
const ORE_LN_CLAMP = [0.12, 4.0];

// 역정규누적분포(Acklam 유리근사) — 균등 u∈(0,1) → 표준정규 z. 최대오차 ~1.15e-9.
function _probit(u) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const dd = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl;
  let q, r;
  if (u < pl) { q = Math.sqrt(-2 * Math.log(u));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((dd[0]*q+dd[1])*q+dd[2])*q+dd[3])*q+1); }
  if (u > ph) { q = Math.sqrt(-2 * Math.log(1 - u));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((dd[0]*q+dd[1])*q+dd[2])*q+dd[3])*q+1); }
  q = u - 0.5; r = q * q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) * q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
function oreGradeMult(jitter01) {
  const u = Math.min(1 - 1e-9, Math.max(1e-9, jitter01 == null ? 0.5 : jitter01));
  const m = Math.exp(ORE_LN_SIGMA * _probit(u) - ORE_LN_SIGMA * ORE_LN_SIGMA / 2);
  return Math.max(ORE_LN_CLAMP[0], Math.min(ORE_LN_CLAMP[1], m));
}
// tierBase 인자는 호출부 호환을 위해 남기되 **무시한다** — 크기가 등급을 정하지 않는다.
// ★노다지에도 천장을 둔다 — p=1 이면 **모든 덩이가 광석**이라 "돌이냐 광석이냐"의 긴장이 사라진다.
//   로그정규 상한(mult 4.0)에 걸린 광맥이 23개 있었고 그 자리 p_peak 이 1.09 였다.
const ORE_PK_MAX = 0.90;
function orePeakFor(mineralId, tierBase, jitter01) {
  const r = RESOURCES[mineralId];
  const p = ORE_TIER_BASE * ORE_P_SCALE * oreGradeMult(jitter01) * oreValueScale(r ? r.baseValue : 5);
  return +Math.min(ORE_PK_MAX, p).toFixed(4);
}

// ══════════════════════════════════════════════════════════════════════════
// 채광 숙련 — 세 채널 [11차 재민 확정]
// ══════════════════════════════════════════════════════════════════════════
// 요건(재민): 스킬은 **30점 예산에서 골라 찍는다**(분야당 10점, 평생 3분야 만렙).
//   그러니 개인이 채광에 10점을 쓸 이유가 있어야 한다. 그리고 그 이유는
//   ★**남에게 전이되면 안 된다** — "고렙 한 명이 찍고 나머지는 저렙"이 최적이 되면 실패다.
//
// 전이성으로 후보를 걸렀다:
//   ✗ 탐맥(좋은 자리를 읽어줌)  — 최대 55배지만 **전이됨**(고렙이 찾아주면 끝) → 한 명만 찍으면 된다
//   ✗ 재고 효율(광맥 수명 연장) — 공공재라 무임승차
//   ✗ 부산물 회수율            — 결국 "광석 1개당 나오는 금속"을 바꾸는 것 = **제련** = 대장장이 영역
//   ✗ 채굴 속도(기여도)         — 재민 최종: **속도는 고정**
//   ✔ 큰 돌덩이                  — 내가 떼어내야 내 것
//   ✔ 곡괭이 내구                — 내가 써야 내 것
//   ✔ 감정                       — 내 눈이라 남에게 못 빌려준다
//
// 게임의 확립된 환율(CHECKLIST 스킬 효과 감사): 수량 ×1.5 · 품질 ×2.5 → 장인 합성 **×3.75**.
// 채광: 큰 덩이 ×1.5(= 시간당 산출) × 곡괭이 ×2 × 감정(헛짐 회피) — 토지(광맥 등급)가
//   지배하는 직업이라 스킬은 중위 보정이 맞다(CHECKLIST: "도구·토지가 지배하고 스킬은 중위 보정").

// ── 연속 레벨 ────────────────────────────────────────────────────────────
// 재민: "3렙·7렙 해금이 아니라 경험치에 따라 **연속적으로**".
//   econ 의 xp 표(need(L) = 80 + 30L, 만렙까지 누적 2,150)를 **연속으로 역산**한다.
//     누적(L) = 15L² + 65L  →  L(xp) = (−65 + √(4225 + 60·xp)) / 30
//   정수 지점에서 econ 표와 **정확히 일치**하고 그 사이는 매끈하다. NPC(econ)와 플레이어가 같은 축.
//   플레이어 xp = 덩이 1개당 +1 = 1 게임시간 ⇒ 만렙 2,150덩이 = 89.6 게임일 = 35.8 실시간시간.
const MINE_XP_MAX = 2150;
function mineLevelF(xp) {
  const x = Math.max(0, xp || 0);
  return Math.min(10, (-65 + Math.sqrt(4225 + 60 * x)) / 30);
}

// ── ② 큰 돌덩이 [재민 확정] ──────────────────────────────────────────────
// 재민 최종: "채굴 속도는 **고정**으로 하고, 레벨 높을수록 얻는 이득은 세 가지 —
//            ①곡괭이 내구도 절약 ②큰 돌덩이 ③미리 어느 정도 알 수 있는 능력".
//
//   ⇒ 리듬(1초/타)도, 덩이당 타수(60)도, 재고 소모(1)도 **전부 고정**이다. 레벨은
//     그 한 덩이가 **얼마나 크게 떨어져 나오는지**만 바꾼다.
//     kg(lvl) = 3.5 × (1 + 0.05·lvl)  → 만렙 5.25kg (×1.5)
//
//   고증: 숙련 광부·석공의 제1기술은 암석의 **결(節理·벽개)을 읽어 크게 떼어내는 것**이다.
//     미숙련은 같은 힘으로 쳐도 잘게 부수고, 그 잔부스러기(fines)는 당시 선광 기술로
//     회수가 안 돼 폐석더미로 갔다 — 실제 고대 광산 폐석에서 상당한 품위가 나오는 이유다.
//
//   ★재고 소모는 1 고정(재민 지시)이므로 **광맥 수명(=재고 1000회)은 숙련과 무관**하고,
//     같은 광맥에서 뽑히는 **총량(kg)만 숙련에 비례**한다. 회수율이 기술에 달렸다는 고증 그대로.
//   ★셀 카운터 무임승차 없음: 문턱(60타)은 셀 공용이고 덩이 크기는 **문턱을 넘긴 사람**의 것이다.
//   ★지게(28kg)가 짐당 유효량을 고정하므로 이득은 "한 짐 채우는 시간"으로 나온다:
//     lvl0 8덩이 480타 · lvl10 5.3덩이 320타 — 같은 28kg를 1.5배 빨리 채운다.
function mineChunkKg(lvlF) { return CHUNK_KG * (1 + 0.05 * Math.max(0, Math.min(10, lvlF))); }

// ── 덩이 크기의 **산포** — 레벨은 평균만 정한다 ────────────────────────────
//   ★[재민 확정] "레벨에 따른 돌덩이 크기도, 고정이 아니라 정규분포야.
//                 레벨 낮은 광부가 캐도 가끔 큰 돌덩이 나올 수 있어"
//   고증: 떼어지는 크기는 결(節理)의 간격이 정한다. 숙련은 **결을 읽을 확률**을 올릴 뿐
//         암반이 어디서 갈라질지를 지배하지 못한다 — 저렙이 운 좋게 큰 판을 떼기도 하고,
//         고렙이 잔부스러기만 얻기도 한다. 평균만 기울고 분포는 겹친다.
//
//   무게 ~ N(mu, (CV·mu)²) ,  mu = mineChunkKg(lvlF) ,  CV = 0.28
//   ±2.5σ 밖은 **기각 재추첨**(절사 아님) — 절사는 경계에 덩어리를 만들고 평균을 흔든다.
//   재추첨은 좌우 대칭이라 평균이 정확히 mu로 보존된다(NPC·econ이 평균을 쓰므로 이게 중요하다).
//
//   겹침(재민이 요구한 "가끔"): lvl0 이 lvl10 평균(5.25kg)을 넘길 확률
//     z = (5.25−3.5)/(0.28×3.5) = 1.786 → 3.7%.  60타에 한 번 캐니 대략 27덩이에 한 번.
//   범위: lvl0  1.05~5.95kg  ·  lvl10  1.58~8.93kg
const CHUNK_CV = 0.28;      // 변동계수(표준편차 ÷ 평균) — 평균에 비례하므로 고렙일수록 절대 산포도 크다
const CHUNK_Z_MAX = 2.5;    // 이 밖은 재추첨(하한이 0 이하로 내려가지 않게 하는 역할도 겸한다)
function _stdNormal(rnd) {
  // Box–Muller. u1=0 이면 log 가 발산하므로 (0,1] 로 민다.
  let u1 = rnd(); if (!(u1 > 0)) u1 = 1e-12;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rnd());
}
// meanKg 를 받는다 — 2인 1조에서는 **타격별 가중평균**이 들어오기 때문이다(막타 레벨이 아니다).
function mineChunkRoll(meanKg, rnd) {
  const r = (typeof rnd === 'function') ? rnd : Math.random;
  const mu = Math.max(0.01, meanKg || CHUNK_KG);
  let z = _stdNormal(r), guard = 0;
  while (Math.abs(z) > CHUNK_Z_MAX && ++guard < 32) z = _stdNormal(r);
  if (Math.abs(z) > CHUNK_Z_MAX) z = z > 0 ? CHUNK_Z_MAX : -CHUNK_Z_MAX;   // 안전망(도달 확률 ~0)
  return mu * (1 + CHUNK_CV * z);
}

// ── 깊이 비용 — **셀 속성**(지형 압력). 레벨은 안 들어간다 ────────────────
//   ★"심층에서만 숙련자가 빨라진다"는 기각됐다 — 깊이는 순수 **지형 압력**이고 레벨이 안 들어간다.
//     (필요 타수는 셀 공용 카운터라 개인차를 두면 저렙이 고렙 진척에 무임승차한다.)
// ★★[재민 확정] 깊이 규칙을 다시 짰다.
//   "비옥도가 1000까지 있지? **10마다 필요 타수가 1씩** 늘어나게. 최종적으로 160까지.
//    그리고 깊이 팔수록 **미세하게 p값이 증가**하게. 대신 효율이 타수 늘어나는 것보다 더 크면 안 돼.
//    …결국 **겉핥기로 골고루 파는 게 미세하게 더 이득**인 거야"
//
//   타수  need(s) = 60 + (1000 − s)/10        만땅 60타 → 완전고갈 160타 (×2.667)
//   품위  G(s)    = 1 + 1.40·(1 − s/1000)     만땅 ×1.00 → 완전고갈 ×2.40
//
//   ★핵심은 **G < D** 다. 둘 다 깊이에 따라 커지지만 품위가 더 천천히 큰다:
//     효율(타당 기대 광석) = G/D
//       표층      (1.00)/(1.000) = 1.000
//       절반      (1.70)/(1.833) = 0.927
//       완전고갈  (2.40)/(2.667) = 0.900
//     ⇒ 얕은 자리가 **항상** 유리하다. 다만 차이가 최대 10%라 "미세하게"에 맞는다.
//       깊이 파는 게 손해이긴 해도 못 할 짓은 아니다(자리를 옮기기 귀찮으면 계속 파도 된다).
//   ★깊게 파도 이득이 아예 없으면 안 되는 이유: 그러면 셀 재고 1000 중 뒷부분이 죽은 자원이 된다.
//     p가 오르니 "여긴 이미 깊지만 그래도 진하다"가 성립하고, 광맥 수명은 그대로 1000회다.
const ORE_DEPTH_PER = 10;        // 재고 이만큼 소모될 때마다 필요 타수 +1
const ORE_DEPTH_P_GAIN = 1.40;   // 완전고갈 자리의 품위 배수 = 1 + 이 값 (타수 배수 2.667 보다 작아야 한다)
function mineSwingsNeeded(stockFrac) {
  const f = Math.max(0, Math.min(1, stockFrac));
  return MINE_SWINGS_PER + (ORE_K * (1 - f)) / ORE_DEPTH_PER;
}
function mineDepthCost(stockFrac) { return mineSwingsNeeded(stockFrac) / MINE_SWINGS_PER; }   // 배수(호환용)
// 그 자리의 깊이가 품위에 주는 배수. oreProbAt(정적 장)에 곱해서 쓴다.
function mineDepthP(stockFrac) {
  const f = Math.max(0, Math.min(1, stockFrac));
  return 1 + ORE_DEPTH_P_GAIN * (1 - f);
}
// 타당 기대 광석의 상대 효율 — 얕을수록 1에 가깝고 깊을수록 떨어진다(항상 ≤ 1).
function mineDepthEff(stockFrac) { return mineDepthP(stockFrac) / mineDepthCost(stockFrac); }

// ── ③ 곡괭이 내구 ────────────────────────────────────────────────────────
// 만렙은 타당 0.5만 축낸다(곡괭이 수명 2배). 깊이와는 무관 — 심층 채널과 이중으로 겹치지 않게.
function mineToolWear(lvlF) { return 1 - 0.05 * Math.max(0, Math.min(10, lvlF)); }

// ── 감정(부차) — **비대칭** 잡음 채널 [재민 확정] ────────────────────────
// 실측으로 감정 단독 이득은 왕복 15분에서 **0.97배(오히려 손해)**, 800분 원정에서도 1.65배뿐이다.
//   (덩이 하나에 60분이 드는데 헛짐을 안 지는 이득은 왕복 15분을 아끼는 것뿐이라 묻힌다)
//   그래서 스킬의 본체가 아니라 **맛**으로 존치한다. 위 ①②③이 본체다.
// ★비대칭(재민 확정): 초보는 **좋은 광석을 몰라보고 버리는 FN**이 많고, 명백한 맥석에 속는 FP는 적다.
//   광석의 단서(광택·비중)는 "있으면 보이는" 신호라 놓치기 쉽고, 맥석은 특징의 부재라 거르기 쉽다.
//     TNR(맥석을 맥석이라) = 0.5 + 0.45·s^0.6   — 빨리 자란다
//     TPR(광석을 광석이라) = 0.5 + 0.45·s^1.6   — 느리게 자란다      (둘 다 만렙 0.95)
function mineTNR(lvlF) { const s = Math.max(0, Math.min(10, lvlF)) / 10; return 0.5 + 0.45 * Math.pow(s, 0.6); }
function mineTPR(lvlF) { const s = Math.max(0, Math.min(10, lvlF)) / 10; return 0.5 + 0.45 * Math.pow(s, 1.6); }
// 문구 문턱은 **균형정확도**((TPR+TNR)/2)로 잡는다 — p에 의존하지 않는 순수 눈의 성능.
//   [재민 지적으로 정정] 사후확률 P(광석|"광석") = p·a/(p·a+(1−p)(1−a)) 은 p에 의존하는데
//   p 는 셀마다 다른 연속장이다(광맥1 중심 0.372 · 가장자리 0.005). 사후로 문턱을 잡으면
//   **문구가 그 자리의 p를 누설**한다 — 감정 스킬이 아니라 p 표시기가 된다.
function mineIdAcc(lvlF) { return (mineTPR(lvlF) + mineTNR(lvlF)) / 2; }
function mineIdPhrase(acc, saysOre, mineralKo) {
  if (acc < 0.60) return null;                                   // 열에 여섯 — 아직 못 본다
  if (acc < 0.78) return saysOre ? '광이 도는 것 같기도 하다' : '그냥 돌 같기도 하다';
  if (acc < 0.90) return saysOre ? '질 좋은 덩이인 것 같다' : '맥석인 것 같다';
  return saysOre ? (mineralKo + '이다') : '맥석이다';             // 열에 아홉 — 단정
}

// tier — 이제 **가치 등급 표시**에만 쓴다(채굴 속도·재고와 무관). 희소성은 광맥 크기·p로 표현한다.
function miningParams(mineralId) {
  const r = RESOURCES[mineralId];
  const v = r ? r.baseValue : 5;
  const tier = v <= 5 ? 'common' : (v <= 50 ? 'mid' : 'rare');
  return { tier, value: v, K: ORE_K, swingMs: MINE_SWING_MS, swingsPer: MINE_SWINGS_PER };
}

// ── 인벤 무게 [11차 신설] ────────────────────────────────────────────────
// RESOURCES.weight 는 정의만 있고 한 줄도 안 쓰이고 있었다. 게다가 게임이 실제로 쓰는 id 중
// stone·wood·ore·fish·berry·herb·fiber 등은 RESOURCES 에 아예 없다 → 여기서 보충한다.
// 광석만 무겁게 하면 나무 999개를 지고 다니게 되어 이상해지므로 **전 자원**에 건다.
const EXTRA_WEIGHT = {
  ore_chunk: 1.0,   // ★[11차] 미확인 원석은 **kg 단위**로 인벤에 든다(덩이 크기가 숙련에 따라 달라서 개수로는 못 센다)
  stone: 3.0, wood: 2.5, plank: 1.2, pillar: 8.0, rafter: 1.0, thatch: 1.5,
  ore: 3.5, fiber: 0.3, herb: 0.2, berry: 0.2, seed_berry: 0.05,
  fish: 1.0, meat_raw: 1.0, meat_cooked: 0.8, hide: 1.5, bone: 0.5,
  food: 1.0, water: 1.0, charcoal: 0.6, resin: 0.3, bark: 0.4, acorn: 0.2,
};
function itemWeight(id) {
  const r = RESOURCES[id];
  if (r && typeof r.weight === 'number') return r.weight;
  if (EXTRA_WEIGHT[id] != null) return EXTRA_WEIGHT[id];
  return 0.5;   // 미등록 소품 기본값
}
// 지게 상한 — 청동기 지게 짐 20~40kg 실측 중간. 덩이(3.5kg)로 8개 = MINE_HAUL 과 정합.
const CARRY_MAX_KG = 28;
function inventoryWeight(inv) { let w = 0; for (const k in inv) { const n = inv[k]; if (n > 0) w += itemWeight(k) * n; } return +w.toFixed(2); }

// === biome별 광물 풀 (가중치 = 중복) — 광맥에 mineral 미지정 시 위치 해시로 자동 배정 ===
const ORE_POOLS = {
  mountain:    ['iron','iron','copper','copper','silver','gold','sulfur','obsidian','tungsten'],
  desert:      ['salt','salt','sulfur','phosphate','nitrate','sand','gold','copper'],
  tundra:      ['nickel','cobalt','iron','iron','silver','diamond','coal'],
  taiga:       ['iron','iron','nickel','copper','coal','coal','granite'],
  forest:      ['iron','iron','gold','tungsten','marble','jade_raw','coal','copper'],
  plains:      ['coal','coal','iron','iron','copper','limestone','clay','tin','zinc'],
  jungle:      ['iron','gold','copper','diamond','ruby','emerald','bauxite'],
  savanna:     ['iron','copper','gold','manganese','phosphate','salt'],
  archipelago: ['copper','tin','gold','obsidian','salt'],
};
function pickMineral(biome, seedNum) {
  const pool = (ORE_POOLS[biome] || ORE_POOLS.plains).filter(id => RESOURCES[id]);
  return pool[Math.abs(seedNum) % pool.length] || 'iron';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RESOURCES, _summary, _byHarvest, miningParams, pickMineral, ORE_POOLS,
    ORE_K, MINE_SWING_MS, MINE_SWINGS_PER, CHUNK_KG, ORE_REG0, ORE_REG1, oreRegen,
    NPC_MINE_PER_DAY, MINE_HAUL, MINE_HAUL_TRIP, MINE_LABOR, MINE_HAULEFF, haulEff,
    itemWeight, inventoryWeight, CARRY_MAX_KG, EXTRA_WEIGHT,
    oreValueScale, orePeakFor, ORE_VALUE_EXP,
    ORE_P_SCALE, ORE_TIER_BASE, ORE_LN_SIGMA, ORE_PK_MAX, oreGradeMult,
    mineLevelF, MINE_XP_MAX, mineChunkKg, mineChunkRoll, CHUNK_CV, CHUNK_Z_MAX,
    mineDepthCost, mineSwingsNeeded, mineToolWear,
    mineTPR, mineTNR, mineIdAcc, mineIdPhrase,
    mineDepthP, mineDepthEff, ORE_DEPTH_PER, ORE_DEPTH_P_GAIN };
}
if (typeof window !== 'undefined') {
  window.Specialty = { RESOURCES };
}
