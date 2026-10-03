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

// ═══════════════════════════════════════════════════════════════════════
// 🗾 [T622 · 2026-10-04] 존 칸 — T607 짐승 표(`설계/고증_짐승.md` ① · 세션11) 그대로
// ═══════════════════════════════════════════════════════════════════════
// ★왜 [재민 "한반도와 닛폰 특산 차이가 크게"] 위 카탈로그는 존 구분이 없다(biome 만 본다) — 그래서 열도(닛폰 · mountain)에도
//   호랑이가 났다. T607 이 두 존의 있음/드묾/없음을 출처로 적었다 → 그 칸을 여기 옮긴다(T602 바다 · T609 민물과 같은 꼴).
// ★손잡이 `T622_ZONE_FAUNA` — **부를 때 읽는다**(`WILD.ON` 규약). 기본 끔(= main 바이트 · 존 구분 없는 옛 줄 그대로).
//   켬('1')이면 그 존에서 **없음 = 안 남** — 세 자리가 같은 함수(`faunaOut`)를 부른다:
//     ① 부팅 첫 스폰 목록(zone.js `huntableInBiome(ZONE.biome, ZONE_ID)`)  ② DB 적재(이 존에서 없음인 행은 안 싣는다 — 행은 그대로 · 끄면 돌아온다)
//     ③ 야생 블록(wildlife.js — 🐯 는 본체 tiger 로 비친다 · 블록 무수정 · 다리에서 그림자 짓기 전에 거둔다)
//   드묾 = 지금 출현 몫에 T607 이 준 비가 있으면 그 비 — **T607 은 비를 하나도 주지 않았다** ⇒ 표시만(몫 무변 · 보고에 줄).
// ★표 줄 = T607 ① 표에 **게임 id 짝이 하나로 정해지는** 종만(8). 칸 글자는 T607 그대로 · 확실도도 그대로.
//   표에 줄이 없는 종 = **지금 값**(존 구분 없이 biome 대로 · 카드 캐논 "표에 없는 칸은 지금 값"):
//     · 곰(bear) — T607 은 반달가슴곰(있음/있음)과 불곰(드묾~없음/없음) 두 줄이다 · 게임 '곰' 하나가 어느 짝인지 미정 → 재민 칸
//     · 아이벡스(ibex) — T607 이 재민 칸으로 넘겼다("산양 자리로 쓰인 것으로 보이나 판정 0")
//     · 범위 밖(한대·툰드라·열대·사막 종 · 가축) — T607 이 "깊은 출처 조사를 안 했다"고 적은 줄(표 밖) → 재민 칸
// ⚠새 수 0 · 사본 0 — 무게·떼·철은 이 카드에서 **안 고친다**(카탈로그 hp·pack 그대로). 클라 사본(`public/animals.js`)은 위 ANIMALS 만 읽는다(무접촉).
const FAUNA_ZONES = Object.freeze({ hanbando: 'hb', nippon: 'np' });   // region-profiles `COLS` 와 같은 열 이름
const ZONE_FAUNA = Object.freeze([
  { id: 'tiger',     t607: '호랑이(시베리아/아무르)', hb: '있음', np: '없음', st: '확실',
    ev: '한반도: 역사적 전역(현재 멸종) · 열도: 화석까지 재검토 — 열도 "호랑이" 화석은 동굴사자(2026 PNAS)' },
  { id: 'leopard',   t607: '표범(아무르)',            hb: '있음', np: '없음', st: '확실', ev: '한반도: 역사적 전역(1970 마지막 포획) · 열도: 없음' },
  { id: 'wolf',      t607: '늑대',                    hb: '있음', np: '있음', st: '확실', ev: '열도: 일본늑대(1905 나라현 포획이 마지막 — 혼슈·시코쿠·규슈)' },
  { id: 'wild_boar', t607: '멧돼지',                  hb: '있음', np: '있음', st: '확실', ev: '열도: 조몬 주요 수렵대상' },
  { id: 'deer',      t607: '사슴(꽃사슴/시카디어)',   hb: '있음', np: '있음', st: '확실', ev: '동삼동패총(부산) · 이치하라 유적군(치바) 출토' },
  { id: 'red_fox',   t607: '여우',                    hb: '있음', np: '있음', st: '확실', ev: '열도: 고유 아종 V. v. japonica' },
  { id: 'pheasant',  t607: '꿩',                      hb: '있음', np: '있음', st: '확실', diff: true, ev: '열도: 다른 종 — 일본 고유 녹색꿩 P. versicolor("없음"이 아니다)' },
  { id: 'quail',     t607: '메추라기',                hb: '있음', np: '있음', st: '약',   ev: '두 존 다 "있음(추정)" — 통설 수준(전용 1차 출처 못 엶)' },
]);
// T607 ① 표에서 **게임에 짝이 없는** 줄 — 켬에서도 안 넣는다(그림·드롭이 없다 → 재민 판정 칸 · 보고 "새 종 후보")
const FAUNA_NEW = Object.freeze([
  { t607: '스라소니',              hb: '있음', np: '없음' },
  { t607: '노루',                  hb: '있음', np: '없음' },
  { t607: '고라니(물사슴)',        hb: '있음', np: '없음' },
  { t607: '수달',                  hb: '있음', np: '없음', note: '열도 일본수달은 별도 아종·이미 멸종 — 청동기 당시 서식은 미확인' },
  { t607: '일본원숭이',            hb: '없음', np: '있음' },
  { t607: '너구리',                hb: '있음', np: '있음', diff: true, note: '다른 종(대륙 N. procyonoides ↔ 일본 N. viverrinus)' },
  { t607: '오소리',                hb: '있음', np: '있음', diff: true, note: '다른 종(대륙 M. leucurus ↔ 일본 M. anakuma)' },
  { t607: '산양 / 일본산양(세로우)', hb: '있음', np: '있음', diff: true, note: '다른 종 · 게임 ibex 자리인지는 T607 재민 칸' },
]);
// 게임 '곰' 하나에 T607 두 줄 — 짝 미정(재민 칸 · 표에 줄 없음 = 지금 값)
const FAUNA_BEAR = Object.freeze([
  { t607: '반달가슴곰', hb: '있음', np: '있음' },
  { t607: '불곰',       hb: '드묾', np: '없음', note: '한반도 "드묾~없음"(중북부 역사적 · 현재 절멸 추정) · 열도는 홋카이도만' },
]);
const _FBY = new Map(ZONE_FAUNA.map((r) => [r.id, r]));
function faunaOn() { return typeof process !== 'undefined' && !!process.env && process.env.T622_ZONE_FAUNA === '1'; }
/** 그 종의 그 존 칸('있음'·'드묾'·'없음') — 표에 줄이 없거나 프로필 없는 존이면 null(= 지금 값). 손잡이와 무관(표 읽기). */
function faunaCell(id, zone) {
  const col = FAUNA_ZONES[zone]; if (!col) return null;
  const r = _FBY.get(id); return r ? (r[col] || null) : null;
}
/** 켬이고 그 존 칸이 '없음'이면 true — 스폰 목록 · DB 적재 · 야생 블록이 같은 이 함수를 부른다(끔이면 늘 false). */
function faunaOut(id, zone) { return faunaOn() && faunaCell(id, zone) === '없음'; }

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
//   ★[T622] `zone` 을 주면 존 칸이 거른다 — 켬이면 그 존에서 '없음'인 종이 빠진다(끔이면 옛 줄 그대로 · 같은 배열)
function huntableInBiome(biome, zone) {
  return Object.entries(ANIMALS)
    .filter(([id, m]) => !m.breeding && m.spawn_biome.includes(biome) && !(zone && faunaOut(id, zone)))
    .map(([id]) => id);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ANIMALS, _summary, huntableInBiome,
    FAUNA_ZONES, ZONE_FAUNA, FAUNA_NEW, FAUNA_BEAR, faunaOn, faunaCell, faunaOut };
}
if (typeof window !== 'undefined') {
  window.Animals = { ANIMALS };
}
