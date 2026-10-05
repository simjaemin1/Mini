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
// ★표 줄 = T607 ① 표에 **게임 id 짝이 하나로 정해지는** 종만(9). 칸 글자는 T607 그대로 · 확실도도 그대로.
//   ★[T636 · 재민 10-04 "곰은 한반도니까 반달곰 · 불곰은 나중 존에서"] 곰(bear) = **반달가슴곰** 줄 — 무게·떼도 그 칸(떼 1 = 카탈로그 pack 1 · 무게는 아래 드롭 kg 표).
//     불곰 줄은 `FAUNA_LATER`(나중 존 — 지금 존엔 안 남)로 남긴다.
//   표에 줄이 없는 종 = **지금 값**(존 구분 없이 biome 대로 · 카드 캐논 "표에 없는 칸은 지금 값"):
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
  { id: 'bear',      t607: '반달가슴곰',              hb: '있음', np: '있음', st: '확실',
    ev: '[T636] 재민 10-04 "곰은 한반도니까 반달곰" · 한반도: 지리산·설악산 극희귀 · 열도: 혼슈·시코쿠·규슈(동쪽 조몬 조기 출토 — T625 하시다테 바위그늘)' },
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
// ★[T636] **나중 존** — 재민 10-04 "불곰은 나중 존에서". 지금 존(한반도 · 닛폰)엔 안 남(게임 id 없음 · 켬에서도 안 넣는다).
//   T607 칸은 그대로 적어 둔다(그 존을 지을 때 읽는다). 게임 '곰'(bear)은 위 표의 반달가슴곰 줄이다.
const FAUNA_LATER = Object.freeze([
  { t607: '불곰', hb: '드묾', np: '없음', note: '나중 존 · 한반도 "드묾~없음"(중북부 역사적 · 현재 절멸 추정) · 열도는 홋카이도만(블래키스턴 선 북쪽)' },
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

// ═══════════════════════════════════════════════════════════════════════
// 🥩 [T636 · 2026-10-04] 사냥 드롭을 킬로그램으로 — T607 몸무게(보통) × T629 수율 · 손잡이 `T636_DROP_KG` ★[T647] **기본 켬**
// ═══════════════════════════════════════════════════════════════════════
// ★왜 [재민 10-04 "아이템 무게는 전부 킬로그램"] 품목 한 개의 무게(`specialty.RESOURCES[..].weight` — 사슴·들짐승고기 1.0kg ·
//   닭고기 0.5kg)는 kg 인데, 위 카탈로그 드롭(`drops`)은 몸무게에서 유도한 근거가 없는 정수였다(T629 §0 — 사슴 고기 3개 = 3kg).
//   T607 이 몸무게를, T629 가 수율을 냈다 → **고기 칸만** 그 곱으로 바꾼다.
// ★손잡이 `T636_DROP_KG` — **부를 때 읽는다**. ★[T647 · 2026-10-05 · PM 결정(위임) · 재민 거부권 — 재민 10-04 "아이템 무게는 전부 킬로그램"]
//   **없음 = 켬** · `=0` = 종전(되돌림 손잡이 하나 = T636 끔 = main 바이트 — `dropsOf` 가 카탈로그 `drops` 객체를 **같은 참조로** 돌려준다 ·
//   사체 고기 먹기(`kcal.js` meat_game 줄 · zone.js 먹기 표)도 같이 꺼진다).
//   켬이면 이 표에 줄이 있는 종의 고기 칸 = 반올림(생체 kg × 수율 ÷ 그 품목 한 개의 kg) — 인벤은 낱개다(남는 몫 장부는 이 카드 밖).
//   가죽·뼈·뿔·모피 = T629 칸이 있으면 그 수 · 없으면 지금 값 → **전부 지금 값**이다
//   (T629 가죽 칸은 사슴 넓이 0.74~0.84㎡ 하나 — 게임 가죽은 한 개 3kg 이라 넓이를 개수로 옮길 수가 없다 · 뼈·뿔은 수가 없다).
// ★몸무게 '보통' 읽기(새 수 0 — T607 칸의 수만 · 셈만): 평균이 적혔으면 평균 · 범위만이면 가운데 · 두 칸(수컷/암컷 · 두 아종)이면 둘의 가운데.
// ★[T647] **존별 아종** — 줄에 `zones`(존 → 아종 칸)가 있으면 그 존은 **그 아종 칸만** 읽는다(사슴: 한반도 = 만주아종 · 닛폰 = 일본아종).
//   근거 = 분포(T607 이 인용한 위키 Sika deer — 만주아종 "northeastern China, Korea, and Russian Far East" · 일본아종 C. n. nippon
//   "southern Honshu, Shikoku, and Kyushu") · T607 칸 자체는 "만주아종 = 한반도"라고 적지 않았다(PM 결정 · 재민 거부권).
//   존을 모르는 부름(하네스 단위 셈)과 표에 없는 존(중원북 · 베링 …)은 **두 아종 가운데**(T636 값)를 읽는다.
// ★표 줄 = T607 무게 칸 **과** T629 수율 칸이 둘 다 있는 게임 종(셋). 나머지는 지금 값 — 멧돼지(T629 미확인) · 호랑이·표범·늑대·여우
//   (T629 줄 없음) · 북극토끼(T607 무게 없음 · T629 토끼는 멧토끼) · 메추라기(T607 무게 미확인) · 아이벡스 · 범위 밖 · 가축.
// ⚠수율은 전부 **다른 아종·종·사육종 참고치**다(T629 그대로) — 줄마다 `ref` 에 적었다.
const DROP_KG = Object.freeze([
  { id: 'deer', item: 'meat_game',
    live: { manchu: [68, 109], nippon: [40, 70] }, liveSrc: 'T607 사슴 "만주아종 수컷68~109·일본아종 수컷40~70"(암컷 칸 없음 — 수컷 값)',
    zones: { hanbando: 'manchu', nippon: 'nippon' },   // ★[T647] 한반도 = 만주아종 · 닛폰 = 일본아종(분포 근거 · 위 주석)
    yld: [0.78, 0.48], yldSrc: 'T629 사슴 생체→지육 ≈78% × 지육→뼈 없는 살코기 ≈48%(= 생체의 37.4% · T629 "약 37~38%")',
    ref: '북미 화이트테일 — 다른 아종 참고치' },
  { id: 'bear', item: 'meat_game',
    live: { m: 135, f: [40, 125] }, liveSrc: 'T607 반달가슴곰 "수컷평균135(60~200)·암컷40~125"',
    yld: [0.33], yldSrc: 'T629 곰 지육→살코기 ≈33% — 생체→지육 칸 미확인(지육 대비 비를 생체에 곱했다 → 큰 쪽)',
    ref: '북미 흑곰 — 다른 종 참고치' },
  { id: 'pheasant', item: 'meat_chicken',
    live: { m: 1.2, f: 0.9 }, liveSrc: 'T607 꿩 "수컷평균1.2·암컷0.9(0.5~3)"',
    yld: [0.70], yldSrc: 'T629 꿩 생체→지육 ≈70%(밀 69.9%·배합 70.2%)',
    ref: '사육 꿩 — 사육종 참고치' },
]);
const _DKG = new Map(DROP_KG.map((r) => [r.id, r]));
// ★[T647] 없음(·빈 값) = 켬 · '0' 하나만 끔(되돌림) — T574_REGION 과 같은 문법(없음 = 기본값)
function dropKgOn() { return !(typeof process !== 'undefined' && !!process.env && process.env.T636_DROP_KG === '0'); }
// 몸무게 칸 하나의 대표값 — 수 그대로 · 범위 [lo, hi] 는 가운데 · 두 칸(객체)은 둘의 가운데
function _rep(v) {
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return (v[0] + v[1]) / 2;
  const xs = Object.values(v).map(_rep);
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
let _WT = null;
function _unitKg(item) {
  if (_WT === null) { try { _WT = require('./weights'); } catch (e) { _WT = false; } }
  const k = _WT && _WT.kgOf ? _WT.kgOf(item) : 0;
  return k > 0 ? k : 1;
}
// 그 존이 읽는 아종 칸 — 줄에 `zones` 가 있고 그 존이 적혀 있을 때만(아니면 null = 두 칸 가운데)
function _subOf(r, zone) { return (r && r.zones && zone && Object.prototype.hasOwnProperty.call(r.zones, zone)) ? r.zones[zone] : null; }
/** 표 한 줄의 셈 — 생체 kg · 수율 · 고기 kg · 낱개(켬 드롭) · 지금 드롭. 표에 줄이 없으면 null. 손잡이와 무관(보고·하네스용).
 *  ★[T647] `zone` 을 주면 그 존의 아종 칸(`zones`) — 없거나 모르는 존이면 두 칸 가운데(T636 값). */
function dropKgRow(id, zone) {
  const r = _DKG.get(id), a = ANIMALS[id];
  if (!r || !a) return null;
  const sub = _subOf(r, zone);
  const liveKg = sub ? _rep(r.live[sub]) : _rep(r.live), yld = r.yld.reduce((p, x) => p * x, 1), meatKg = liveKg * yld, unitKg = _unitKg(r.item);
  return { id, item: r.item, zone: zone || null, sub, liveKg, yld, meatKg, unitKg, units: Math.max(1, Math.round(meatKg / unitKg)), now: (a.drops || {})[r.item] || 0,
    liveSrc: r.liveSrc, yldSrc: r.yldSrc, ref: r.ref };
}
const _KGD = new Map();
/** ★사체 드롭의 정본 — zone.js `spawnCorpse` 가 부른다(★[T647] 존 id 를 같이 넘긴다). 끔(`=0`)이면 카탈로그 `drops` 그 객체 ·
 *  켬(기본)이면 고기 칸만 kg 로 바꾼 사본(얼림 · 종 × 아종 칸마다 하나). */
function dropsOf(id, zone) {
  const a = ANIMALS[id];
  if (!a) return null;
  if (!dropKgOn()) return a.drops;
  const r = dropKgRow(id, zone);
  if (!r) return a.drops;
  const key = id + '|' + (r.sub || '');
  if (!_KGD.has(key)) _KGD.set(key, Object.freeze(Object.assign({}, a.drops, { [r.item]: r.units })));
  return _KGD.get(key);
}

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
    FAUNA_ZONES, ZONE_FAUNA, FAUNA_NEW, FAUNA_LATER, faunaOn, faunaCell, faunaOut,
    DROP_KG, dropKgOn, dropsOf, dropKgRow };
}
if (typeof window !== 'undefined') {
  window.Animals = { ANIMALS };
}
