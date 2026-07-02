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
  silver:      { ko: '은',           emoji: '🥈', category: 'mineral', weight: 2.0, baseValue: 30,   utility: 0.4, contributes: { prestige: 0.8 },             harvest: 'mining' },
  gold:        { ko: '금',           emoji: '🥇', category: 'mineral', weight: 2.0, baseValue: 100,  utility: 0.5, contributes: { prestige: 1.5 },             harvest: 'mining' },
  coal:        { ko: '석탄',         emoji: '🪨', category: 'mineral', weight: 3.0, baseValue: 2,    utility: 0.5, contributes: { production: 0.6 },           harvest: 'mining' },
  salt:        { ko: '소금',         emoji: '🧂', category: 'mineral', weight: 1.0, baseValue: 5,    utility: 0.8, contributes: { subsistence: 0.3, happiness: 0.5 }, harvest: 'mining' },
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

  // ═══════════════════════════════════════════════════════════════════
  // 🌾 농산물 43개
  // ═══════════════════════════════════════════════════════════════════
  wheat:       { ko: '밀',       emoji: '🌾', category: 'agri', weight: 0.5, baseValue: 1.0,  utility: 1.0, contributes: { subsistence: 1.0 }, harvest: 'farming' },
  rice:        { ko: '쌀',       emoji: '🍚', category: 'agri', weight: 0.5, baseValue: 1.2,  utility: 1.0, contributes: { subsistence: 1.0 }, harvest: 'farming' },
  barley:      { ko: '보리',     emoji: '🌿', category: 'agri', weight: 0.5, baseValue: 0.8,  utility: 0.9, contributes: { subsistence: 0.9 }, harvest: 'farming' },
  millet:      { ko: '기장',     emoji: '🌾', category: 'agri', weight: 0.5, baseValue: 0.8,  utility: 0.8, contributes: { subsistence: 0.9 }, harvest: 'farming' },
  sorghum:     { ko: '수수',     emoji: '🌾', category: 'agri', weight: 0.5, baseValue: 0.9,  utility: 0.7, contributes: { subsistence: 0.8 }, harvest: 'farming' },
  buckwheat:   { ko: '메밀',     emoji: '🌾', category: 'agri', weight: 0.5, baseValue: 1.0,  utility: 0.7, contributes: { subsistence: 0.8 }, harvest: 'farming' },
  yam:         { ko: '마',       emoji: '🥔', category: 'agri', weight: 0.8, baseValue: 0.7,  utility: 0.6, contributes: { subsistence: 0.8 }, harvest: 'farming' },
  soybean:     { ko: '콩',       emoji: '🫘', category: 'agri', weight: 0.4, baseValue: 1.5,  utility: 0.8, contributes: { subsistence: 0.8 }, harvest: 'farming' },
  hemp:        { ko: '대마',     emoji: '🌿', category: 'agri', weight: 0.4, baseValue: 4,    utility: 0.4, contributes: { production: 0.4 }, harvest: 'farming' },
  grape:       { ko: '포도',     emoji: '🍇', category: 'agri', weight: 0.5, baseValue: 2,    utility: 0.5, contributes: { happiness: 0.4 }, harvest: 'foraging' },
  garlic:      { ko: '마늘',     emoji: '🧄', category: 'agri', weight: 0.2, baseValue: 2,    utility: 0.5, contributes: { happiness: 0.4, health: 0.2 }, harvest: 'farming' },
  onion:       { ko: '양파',     emoji: '🧅', category: 'agri', weight: 0.3, baseValue: 1,    utility: 0.5, contributes: { subsistence: 0.2, happiness: 0.3 }, harvest: 'farming' },
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

  // ═══════════════════════════════════════════════════════════════════
  // 🌲 임산물 27개
  // ═══════════════════════════════════════════════════════════════════
  pine_log:    { ko: '소나무 통나무',   emoji: '🪵', category: 'forest', weight: 5.0, baseValue: 1.5, utility: 0.7, contributes: { production: 0.7 }, harvest: 'woodcutting' },
  oak_log:     { ko: '참나무 통나무',   emoji: '🪵', category: 'forest', weight: 6.0, baseValue: 2.5, utility: 0.6, contributes: { production: 0.9 }, harvest: 'woodcutting' },
  birch_log:   { ko: '자작나무',       emoji: '🪵', category: 'forest', weight: 4.0, baseValue: 2,   utility: 0.5, contributes: { production: 0.7 }, harvest: 'woodcutting' },
  cedar_log:   { ko: '삼나무',         emoji: '🪵', category: 'forest', weight: 5.0, baseValue: 3,   utility: 0.5, contributes: { production: 0.8 }, harvest: 'woodcutting' },
  bamboo:      { ko: '대나무',         emoji: '🎋', category: 'forest', weight: 1.5, baseValue: 2,   utility: 0.6, contributes: { production: 0.7 }, harvest: 'woodcutting' },
  resin:       { ko: '송진',           emoji: '🟡', category: 'forest', weight: 0.3, baseValue: 4,   utility: 0.4, contributes: { production: 0.4 }, harvest: 'foraging' },
  amber_resin: { ko: '호박',           emoji: '🟨', category: 'forest', weight: 0.05,baseValue: 80,  utility: 0.3, contributes: { prestige: 1.0 }, harvest: 'foraging' },
  ginseng:     { ko: '인삼',           emoji: '🌱', category: 'forest', weight: 0.05,baseValue: 50,  utility: 0.4, contributes: { health: 1.2, prestige: 0.3 }, harvest: 'foraging' },
  wild_ginseng:{ ko: '산삼',           emoji: '🌱', category: 'forest', weight: 0.05,baseValue: 500, utility: 0.2, contributes: { health: 2.0, prestige: 1.5 }, harvest: 'foraging' },
  herbs:       { ko: '약초',           emoji: '🌿', category: 'forest', weight: 0.05,baseValue: 3,   utility: 0.5, contributes: { health: 0.5 }, harvest: 'foraging' },
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
  meat_chicken:{ ko: '닭고기',     emoji: '🍗', category: 'livestock', weight: 0.5, baseValue: 2,  utility: 0.6, contributes: { subsistence: 0.5 }, harvest: 'breeding' },
  meat_game:   { ko: '사슴·들짐승고기', emoji: '🍖', category: 'livestock', weight: 1.0, baseValue: 4, utility: 0.6, contributes: { subsistence: 0.7 }, harvest: 'hunting' },
  fur:         { ko: '모피',       emoji: '🦊', category: 'livestock', weight: 1.0, baseValue: 25, utility: 0.4, contributes: { happiness: 0.5, prestige: 0.6 }, harvest: 'hunting' },
  leather:     { ko: '가죽',       emoji: '🟫', category: 'livestock', weight: 0.5, baseValue: 5,  utility: 0.6, contributes: { production: 0.7 }, harvest: 'hunting' },
  feather:     { ko: '깃털',       emoji: '🪶', category: 'livestock', weight: 0.05,baseValue: 3,  utility: 0.3, contributes: { production: 0.3 }, harvest: 'hunting' },
  bone:        { ko: '뼈',         emoji: '🦴', category: 'livestock', weight: 1.0, baseValue: 2,  utility: 0.4, contributes: { production: 0.4 }, harvest: 'hunting' },
  horn:        { ko: '뿔',         emoji: '🦌', category: 'livestock', weight: 0.5, baseValue: 6,  utility: 0.3, contributes: { production: 0.5 }, harvest: 'hunting' },
  egg:         { ko: '계란',       emoji: '🥚', category: 'livestock', weight: 0.06,baseValue: 1,  utility: 0.6, contributes: { subsistence: 0.5 }, harvest: 'breeding' },
  beef_tallow: { ko: '소기름',     emoji: '🟡', category: 'livestock', weight: 0.5, baseValue: 3,  utility: 0.3, contributes: { production: 0.3 }, harvest: 'hunting' },
  duck_meat:   { ko: '오리고기',   emoji: '🍗', category: 'livestock', weight: 0.5, baseValue: 3,  utility: 0.5, contributes: { subsistence: 0.5, happiness: 0.2 }, harvest: 'breeding' },

  // ═══════════════════════════════════════════════════════════════════
  // 🌶️ 향신료 22개 (opium/coca/khat 빼기)
  // ═══════════════════════════════════════════════════════════════════
  ginger:      { ko: '생강',       emoji: '🫚', category: 'spice', weight: 0.3,  baseValue: 5,   utility: 0.5, contributes: { happiness: 0.5, health: 0.3 }, harvest: 'farming' },
  mint:        { ko: '박하',       emoji: '🌿', category: 'spice', weight: 0.05, baseValue: 3,   utility: 0.4, contributes: { happiness: 0.4, health: 0.3 }, harvest: 'foraging' },
  musk:        { ko: '사향',       emoji: '🟤', category: 'spice', weight: 0.005,baseValue: 300, utility: 0.2, contributes: { prestige: 2.5 }, harvest: 'hunting' },  // 사향노루

  // ═══════════════════════════════════════════════════════════════════
  // 🏺 가공품 20개 (gunpowder/whiskey/rum/celadon/porcelain 빼기)
  // ═══════════════════════════════════════════════════════════════════
  plank:       { ko: '판자',         emoji: '🪵', category: 'goods', weight: 2.0, baseValue: 3,   utility: 0.6, contributes: { production: 0.8 }, harvest: 'crafting' },  // log → plank
  stone_brick: { ko: '석재 벽돌',    emoji: '🧱', category: 'goods', weight: 4.0, baseValue: 5,   utility: 0.4, contributes: { production: 0.6, defense: 0.3 }, harvest: 'crafting' },
  clay_brick:  { ko: '진흙 벽돌',    emoji: '🟫', category: 'goods', weight: 3.0, baseValue: 2,   utility: 0.5, contributes: { production: 0.5 }, harvest: 'crafting' },
  pottery:     { ko: '도자기',       emoji: '🏺', category: 'goods', weight: 2.0, baseValue: 15,  utility: 0.4, contributes: { happiness: 0.5, prestige: 0.8 }, harvest: 'crafting' },
  paper:       { ko: '종이',         emoji: '📜', category: 'goods', weight: 0.3, baseValue: 8,   utility: 0.4, contributes: { prestige: 0.8 }, harvest: 'crafting' },
  ink:         { ko: '먹',           emoji: '🖋️', category: 'goods', weight: 0.2, baseValue: 10,  utility: 0.3, contributes: { prestige: 0.7 }, harvest: 'crafting' },
  brush:       { ko: '붓',           emoji: '🖌️', category: 'goods', weight: 0.1, baseValue: 6,   utility: 0.3, contributes: { prestige: 0.5 }, harvest: 'crafting' },
  sword:       { ko: '도검',         emoji: '⚔️', category: 'goods', weight: 1.5, baseValue: 50,  utility: 0.4, contributes: { defense: 1.5, prestige: 0.5 }, harvest: 'crafting' },
  armor:       { ko: '갑옷',         emoji: '🛡️', category: 'goods', weight: 8.0, baseValue: 100, utility: 0.4, contributes: { defense: 2.0 }, harvest: 'crafting' },
  bow:         { ko: '활',           emoji: '🏹', category: 'goods', weight: 0.8, baseValue: 15,  utility: 0.4, contributes: { defense: 0.8 }, harvest: 'crafting' },
  glass:       { ko: '유리',         emoji: '🪞', category: 'goods', weight: 1.0, baseValue: 10,  utility: 0.4, contributes: { production: 0.5, prestige: 0.4 }, harvest: 'crafting' },
  dye_indigo:  { ko: '인디고',       emoji: '🔵', category: 'goods', weight: 0.05,baseValue: 30,  utility: 0.3, contributes: { prestige: 0.7 }, harvest: 'crafting' },
  soy_sauce:   { ko: '간장',         emoji: '🟫', category: 'goods', weight: 1.0, baseValue: 5,   utility: 0.4, contributes: { happiness: 0.5 }, harvest: 'crafting' },
  kimchi:      { ko: '김치',         emoji: '🥬', category: 'goods', weight: 1.0, baseValue: 3,   utility: 0.5, contributes: { subsistence: 0.4, happiness: 0.6 }, harvest: 'crafting' },

  // ═══════════════════════════════════════════════════════════════════
  // 💎 보석·진귀품 15개
  // ═══════════════════════════════════════════════════════════════════
  amethyst:    { ko: '자수정',       emoji: '💜', category: 'jewel', weight: 0.005,baseValue: 60,   utility: 0.2, contributes: { prestige: 0.8 }, harvest: 'mining' },
  jade_polished:{ ko: '옥 가공품',   emoji: '🟢', category: 'jewel', weight: 0.5,  baseValue: 200,  utility: 0.3, contributes: { prestige: 2.0 }, harvest: 'crafting' },
  amber_polished:{ ko: '호박 가공',  emoji: '🟨', category: 'jewel', weight: 0.1,  baseValue: 150,  utility: 0.3, contributes: { prestige: 1.5 }, harvest: 'crafting' },
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

// === 채굴 파라미터 (광물 가치 tier별) — 광맥 셀 번영도 시스템 ===
const _HOUR = 3600 * 1000;
function miningParams(mineralId) {
  const r = RESOURCES[mineralId];
  const v = r ? r.baseValue : 5;
  if (v <= 5)  return { tier: 'common', cost: 10, refillMs: 1  * _HOUR, dropChance: 0.7,  max: 100 }; // 흔함: +1/시간
  if (v <= 50) return { tier: 'mid',    cost: 12, refillMs: 4  * _HOUR, dropChance: 0.45, max: 100 }; // 중간: +1/4시간
  return                { tier: 'rare',   cost: 15, refillMs: 24 * _HOUR, dropChance: 0.25, max: 100 }; // 귀함: +1/하루
}

// === biome별 광물 풀 (가중치 = 중복) — 광맥에 mineral 미지정 시 위치 해시로 자동 배정 ===
const ORE_POOLS = {
  mountain:    ['iron','iron','copper','copper','silver','gold','obsidian'],
  desert:      ['salt','salt','sand','gold','copper'],
  tundra:      ['iron','iron','silver','coal'],
  taiga:       ['iron','iron','copper','coal','coal','granite'],
  forest:      ['iron','iron','gold','marble','jade_raw','coal','copper'],
  plains:      ['coal','coal','iron','iron','copper','limestone','clay','tin'],
  jungle:      ['iron','gold','copper'],
  savanna:     ['iron','copper','gold','salt'],
  archipelago: ['copper','tin','gold','obsidian','salt'],
};
function pickMineral(biome, seedNum) {
  const pool = (ORE_POOLS[biome] || ORE_POOLS.plains).filter(id => RESOURCES[id]);
  return pool[Math.abs(seedNum) % pool.length] || 'iron';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RESOURCES, _summary, _byHarvest, miningParams, pickMineral, ORE_POOLS };
}
if (typeof window !== 'undefined') {
  window.Specialty = { RESOURCES };
}
