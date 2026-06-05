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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RESOURCES, _summary, _byHarvest };
}
if (typeof window !== 'undefined') {
  window.Specialty = { RESOURCES };
}
