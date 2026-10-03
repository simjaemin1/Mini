'use strict';
// === server/region-profiles.js — 존 특산 프로필 정본 + 경계 넘는 꼬리 혼용 [T574 · 2026-10-03] ===============
//
// ★왜 [재민 10-03] "한반도랑 닛폰이랑 특산물 차이 나는 거 맞지? 상당히 크게 나야 해 · 경계에서 딱 나는 게
//   아니라 가까운 지역이면 어느 정도는 혼용해서 나야 해 · 새로 추가한 일본 특산물은 밸런스도 잘 고려 ·
//   완전 자유무역이라 비슷한 성장세여야 마을들이 서로 잘 먹고산다"
//   + 추신1(PM) "프로필은 땅속에 무엇이 있나(**지질**)로 · 쓸 수 있나는 **시대**(기술)가 정한다"
//   + 추신2(재민) "닛폰에서만 나는 건 한반도에서 지워도 되고 · '존 안은 골고루' 원칙 없어도 돼 · 닛폰에서만 나는 건
//     한반도 동부에서도 비교적 적은 비중으로 발견되면 좋다 · 경계로 칼로 무 베듯 잘리지 않게"
//   + 추신3(재민) "그때 골고루 하라던 건, PM 이 고증대로 실제 지역에만 몰아넣어서 그랬던 거" — 골고루 = **쏠림 방지**
//
// ★캐논: 존 사이는 크게 다르다 · 존 안은 위치마다 비중이 달라도 되지만 **제 품목이 한두 주머니에 갇히면 안 된다**
//   (쏠림 방지 — ③ 자의 "존 안 접근성") · 한 존**에만** 나는 품목은 이웃 존 안으로 **거리에 따라 줄어드는 꼬리**로만
//   들어간다 · 자유무역이 차이를 메운다 · econ 값(baseValue·utility·부패·무게·kcal)은 **안 고친다** — 바뀌는 것은 **양**뿐.
//
// ★이 파일 하나가 정본이다(사본 0):
//   ① 표 `TABLE` — 갈래마다 품목 한 줄에 두 존의 단계 · 확실도 · 근거를 나란히 적는다(표 하나).
//      존마다의 가중은 이 표에서 **파생**한다(`weightsOf`). 갈래: 광종 · 나무 종 · 낚시 종 · 민물 종 · 채집 군락 ·
//      작물 적성 · 나무 열매. ⚠식료품 칸(채집·물고기·작물·열매)은 **T576 근거가 오면 넣는다 — 그 전엔 빈칸**(추신2 ③ · 추측 0).
//   ② 꼬리 혼용 `regionMix(zone, x, y)` → `{ [이웃 존]: 꼬리 계수 f }` — 이웃마다 f = s₀ · e^(−d/L)
//      (d = 그 이웃과의 경계에서 이 존 안쪽으로의 거리(셀) · L = 꼬리 길이(재민 값) · s₀ = PM 기본 0.5).
//      그 자리의 가중(`mixAt`) = 이 존 가중 × (1 − T) + Σ 이웃 f × (그 이웃**에만** 나는 품목의 그 존 비중)
//      (T = Σ 이웃 f × 그 이웃 고유 품목 비중의 합 · 합 1). ⇒ 이웃 고유 품목의 몫(d) = s₀ · (그 존 비중) · e^(−d/L) —
//      추신2 ② 의 식 그대로(경계에서 제 존 비중의 절반 · 안으로 갈수록 줄어든다). 두 존 다 있는 품목은 꼬리가 없다
//      (각 존 제 비중 — 경계에서 단이 진다). 이웃 = zone-config 동서남북(`findZoneAt` — T408 접합이 보는 그 사각 이웃) ·
//      **바다 존 제외** · 프로필 없는 존 제외(중원북·베링 — 회부).
//   ③ 혼용 자리 다섯(카드 ②): 광맥 광종 — 계획기(`scripts/plan-ore-clusters.js`)가 구울 때 · 그리고
//      `pickMineral` 런타임 채움(zone.js 부팅 — `mineral` 이 빈 광맥만) · 채집 군락 종(chunk.js 야생 군락) ·
//      물고기 종(zone.js 낚시 · villages.js 민물 몸) · 나무 종(trees.js `speciesAt`).
//      ⚠이미 구운 정본 광맥(`hanbando-terrain.json` 의 `mineral`)은 런타임에 **다시 뽑지 않는다** —
//        광종의 혼용은 구울 때 한 번이다(카드 ② "정본 json 의 mineral 칸").
//      ★[추신4 · 재민 10-03 "꼬리 폭은 네 의견대로" — L = 500셀] 두 존 정본 광맥을 L 500 으로 **구웠다**
//        (`scripts/t574-bake.js` — 한반도 787 = 덜 흔드는 굽기 `rebakeKeep` · 닛폰 55 = T580 의 `t580-bake-nippon.js` 다 굽기).
//        자리(좌표·크기·이름)는 그대로 · 광종 칸(`mineral`·`minerals`·`pk`)만 바뀌었다. 바뀐 광맥의 옛 기록(여섯째 판)은
//        `server/region-bake-off.json` 에 통째로 있다 — `T574_REGION=0` 이면 `restoreBakeOff` 가 정본을 실을 때 되돌린다.
//      ★굽기(`bakeOre`)는 땅속 뽑기(`pickOre` — 지질)에 재민 확정 굽기 규칙 셋(2026-08-01 — 주요 광맥 철 없음 ·
//        은 단독 없음 · 다광종 POLY)을 그대로 얹는다 — 표는 `hanbando-minerals.js` POLY 하나(사본 0).
//
// ★손잡이 — 부를 때 읽는다(`WILD.ON` 규약):
//   `T574_REGION`    = 꼬리 길이 L(셀). ★없음 = **500**(재민 10-03 · 추신4 — 켬이 기본). `0` = **끔** — 다섯 자리가 옛 글자
//                      그대로 돌고 구운 정본 광종이 여섯째 판 칸으로 되돌아간다(하네스 ⓐ · 두 자 바이트 동일).
//                      ⚠구운 정본은 L 500 한 판이다 — 다른 L 은 런타임 자리(나무·낚시·계획기 새 광맥)에만 든다.
//   `T574_S0`        = 경계에서의 꼬리 계수 s₀(기본 0.5 = ★PM 기본 "제 존 비중의 0.5").
//   `T574_NEW_ITEMS` = 1 이면 새 품목 셋(진사·사철·조개 팔찌감)의 줄이 표에 든다 — 기본 끔(재민이 값을 본 뒤 켬).
//                      ⚠그 품목이 `specialty.js RESOURCES` 에 없으면 켜도 안 든다(없는 품목을 굽지 않는다).
//
// ★단계의 수는 **지금 정본 POOL(`hanbando-minerals.js`)에서 빌린다** — 새 수 0(새 수는 L · s₀ 둘 — 재민·PM 값):
//     많음 = POOL 최댓값(철 26) · 보통 = POOL 평균(합 100 ÷ 여덟 = 12.5) · 낮음 = POOL 최솟값(주석 2 — "극희소") ·
//     없음 = 0(그 존에선 안 난다 — 이웃 꼬리로만 · 추신2 "한반도에서 지워도 된다")
//   광종의 '그대로' 는 그 광종의 POOL 값이다 — 지금 계획기가 **모든 존**에 쓰는 값(T348 "광종 풀은 존 무관")이라
//   설계상 두 존의 지금 광종 거리(TV)는 0 이다(실측 면적 차는 큰 광맥 몇이 우연히 받은 광종 — 카드 머리).
//   ⚠나무·물고기·군락의 '보통' 은 지금 함수가 쓰는 **고르게**(같은 가중)다 — 그 자리 분포가 고르게면 옛 함수를 그대로 부른다.
//
// ★재민 확정과 부딪히는 칸은 **넣지 않고 표에 적는다**(회부): 텅스텐·석탄·대리석(재민 확정 제거 — `hanbando-minerals.js` 머리).
//
// ⚠주사위 0 — 이 파일은 `Math.random` 을 한 번도 안 부른다. 뽑기의 u 는 **부르는 쪽**이 자리 해시로 준다.
// ⚠econ 무접촉 — 이 파일은 econ 번들(`sim/build-econ-bundle.js`)에 들지 않는다. econ 이 읽는 것은 구운 정본 광맥뿐이다.

const HB = require('./hanbando-minerals');

// ── 단계 — POOL 에서 파생(새 수 0) ─────────────────────────────────────────────────
const LV = (() => {
  const v = Object.values(HB.POOL);
  const sum = v.reduce((a, b) => a + b, 0);
  return Object.freeze({ '많음': Math.max(...v), '보통': sum / v.length, '낮음': Math.min(...v), '없음': 0 });
})();

// ── 프로필이 있는 존 — 표의 열 이름 ─────────────────────────────────────────────────
//   ⚠중원북·베링 프로필은 지형 정본 뒤(카드 §3 회부) — 표에 없는 존은 섞이지 않는다.
const COLS = Object.freeze({ hanbando: 'hb', nippon: 'np' });

// ══ ① 표 — 품목 한 줄 = 두 존의 단계 · 확실도 · 근거 ══════════════════════════════════════════════
//   단계: '많음' · '보통' · '낮음' · '없음'(그 존엔 안 난다 — 이웃 꼬리로만) · '그대로'(광종 = POOL 값 · 그 밖 = 보통) ·
//         null(그 존 목록에 없다 — 낚시 biome 목록 · 옛 함수가 애초에 안 낸다)
//   확실도: '확실'(출토 실측·문헌·지질 자료를 이번 판에 열었다) · '약'(근거 칸을 못 열었거나 결이 다르다) · '—'(지금 값 그대로)
//   `isNew` = 새 품목(`T574_NEW_ITEMS` 뒤) · 근거 칸의 따옴표는 원문 그대로다(15자 남짓).
const TABLE = Object.freeze({
  // ── 광종(계획기 굽기 + 부팅 채움) — 추신1 표(PM · 재민 거부권)를 근거 칸으로 받쳤다 ──
  ore: [
    { id: 'iron', ko: '철(정광)', hb: '그대로', np: '없음', st: '확실',
      ev: '한반도에만(추신1): 삼국지 위서 동이전 변진조 "국에서 철이 나는데 한(韓), 예(濊), 왜(倭) 모두가 와서 사 간다"(한경 생글생글 인용) · 닛폰: "日本には鉄鉱石が少なく"(JST 사이언스포털 — 열도는 사철) · 시대: 철 제련은 early_iron(era.js)' },
    { id: 'copper', ko: '구리', hb: '많음', np: '많음', st: '약',
      ev: '추신1 표가 두 쪽 "많음" 칸에 다 적었다 — 이번 판 근거 미열람 · 재민 구리:주석 ≈ 1:12(hanbando-minerals 머리)에 26:2 가 더 가깝다' },
    { id: 'gold', ko: '금', hb: '그대로', np: '많음', st: '확실',
      ev: '열도 금은 광상 = 화산 활동에 딸린 천열수 광상 — "火山活動の始まり…菱刈鉱床の含金石英脈が形成"(산총연 GSJ) · 추신1 표' },
    { id: 'silver', ko: '은', hb: '그대로', np: '많음', st: '약',
      ev: '추신1 표("일본에서 은이 엄청나게") · 같은 천열수 금은 광상(GSJ) — 은을 직접 적은 문장은 이번 판 미열람 · ★굽기: 은 단독 광맥은 없다(재민 08-01 ③) — 연은(납 + 은 15%)으로 굽는다 · ⚠시대: bronze 가 이미 cupellation·은을 안다(era.js UNLOCK) — 은 사용을 시대 축이 막지 않는다' },
    { id: 'lead', ko: '납', hb: '그대로', np: '그대로', st: '—', ev: '추신1 표에 없다 — 지금 값' },
    { id: 'tin', ko: '주석', hb: '그대로', np: '그대로', st: '—', ev: '재민 확정 구리:주석 ≈ 1:12 — 두 존 같은 극희소(hanbando-minerals 머리)' },
    { id: 'jade_raw', ko: '옥(비취)', hb: '없음', np: '많음', st: '확실',
      ev: '닛폰에만(추신1): 이토이가와 "糸魚川産のヒスイ玉は…全国に流通していた"(이토이가와 지오파크 · T551) · 한반도 곡옥 = 열도산 교역품("produced in specific areas of Japan" — 위키 Gogok · 약) · "동아시아 거의 유일"은 미열람' },
    { id: 'obsidian', ko: '흑요석', hb: '그대로', np: '많음', st: '확실',
      ev: '닛폰: 고시다케(T551 출토 실측) · 한반도: 백두산계 · 남해안 출토 일부가 열도산(hanbando-minerals 머리 · 추신1) — 양쪽에 있되 닛폰이 많다' },
    { id: 'sulfur', ko: '유황', hb: '없음', np: '많음', st: '확실',
      ev: '닛폰에만(추신1): "日本の硫黄鉱床は第四紀の火山に伴なって産出する"(GSJ 地質ニュース) · ⚠econ 쓰임 0 — 재민이 텅스텐을 뺀 둘째 까닭("캐도 쓸 데가 없어 쌓이기만")과 같은 처지(③ 자로 본다)' },
    { id: 'cinnabar', ko: '진사(수은 원광)', hb: '없음', np: '많음', st: '확실', isNew: true,
      ev: '닛폰에만(추신1): 와카스기야마 진사 채굴 유적(도쿠시마 · 야요이 후기~고분 전기 · 2023 중요문화재) "辰砂の採掘と精製過程を具体的に復元しうるもの"(문화청) — 새 품목' },
    { id: 'iron_sand', ko: '사철', hb: '낮음', np: '많음', st: '확실', isNew: true,
      ev: '"日本には鉄鉱石が少なく…砂鉄を原料とする「たたら製鉄」"(JST 사이언스포털) — 새 품목 · 추신1 "닛폰 쪽 많음"(닛폰에만은 아니다) · 시대: 철 제련은 early_iron' },
  ],
  // ── 나무 종(trees.js `speciesAt`) — 종 표 8(T123 랩 정본) 안에서만 · **숲의 얼굴(목재)** 근거 ──
  //   ⚠열매(식료)는 종을 따라온다 — 식료 근거(T576)가 오면 `fruit` 칸과 맞대 본다.
  tree: [
    { id: 'oak', ko: '참나무', hb: '보통', np: '많음', st: '확실', ev: '다카스미이데조에 유적 목재 983점 — 시이노키속 최다 · 아카가시아속(T551 · 오사카대) = 참나무과 → 게임 종 oak' },
    { id: 'chestnut', ko: '밤나무', hb: '보통', np: '많음', st: '확실', ev: '같은 유적 — 쿠리(밤나무)(T551 출토 실측)' },
    { id: 'pine', ko: '소나무', hb: '보통', np: '보통', st: '—', ev: '근거 없음 — 한 유적 목록에 없다고 없는 게 아니다(T551: 히노키 "다른 유적엔 있을 수 있음")' },
    { id: 'jat', ko: '잣나무', hb: '보통', np: '보통', st: '—', ev: '근거 없음 — 지금 값' },
    { id: 'hazel', ko: '개암나무', hb: '보통', np: '보통', st: '—', ev: '근거 없음 — 지금 값' },
    { id: 'mulberry', ko: '산뽕나무', hb: '보통', np: '보통', st: '—', ev: '근거 없음 — 지금 값' },
    { id: 'grape', ko: '머루', hb: '보통', np: '보통', st: '—', ev: '근거 없음 — 지금 값' },
    { id: 'willow', ko: '버드나무', hb: '보통', np: '보통', st: '—', ev: '근거 없음 — 지금 값' },
  ],
  // ── 낚시 종(zone.js 낚싯대) — 목록은 biome 표(`fishing.js SPECIES_BY_BIOME` 정본)가 정한다 ──
  //   ⚠식료 칸 — T576 근거가 오면 넣는다(그 전엔 지금 값 = biome 목록 그대로). 한 존 목록에만 있는 종(잉어·명태)은
  //     이웃 존 안으로 꼬리로 든다(그 종을 '그 존에만 나는 것'으로 본다 — 지금 목록 그대로의 결과).
  fishRod: [
    { id: 'trout', ko: '송어', hb: '보통', np: '보통', st: '—', ev: '한반도 forest · 닛폰 mountain 목록 둘 다 — 지금 값' },
    { id: 'carp', ko: '잉어', hb: '보통', np: null, st: '—', ev: '한반도 forest 목록 — 지금 값(닛폰 mountain 목록에 없다)' },
    { id: 'pollock', ko: '명태', hb: '보통', np: null, st: '—', ev: '한반도 forest 목록 — 지금 값(닛폰 mountain 목록에 없다)' },
  ],
  // ── 민물 종(villages.js 민물 몸 `freshfish.pick`) — 식료 칸 · **빈칸**(T576 · 추신2 ③) ──
  fishFresh: [],
  // ── 채집 군락(chunk.js 야생 군락 `WILD_HAB`) — 식료 칸 · **빈칸**(T576 · 추신2 ③) ──
  forage: [],
  // ── 작물 적성 — 식료 칸 · **빈칸**(T576 · 추신2 ③) · 혼용 자리 없음(기후 정본 T570 과 겹친다 — 회부) ──
  crop: [],
  // ── 나무 열매 — 식료 칸 · **빈칸**(T576 · 추신2 ③) · 혼용 자리는 나무 종(열매는 종을 따라온다) ──
  fruit: [],
});

// 다섯 자리 밖이거나 근거가 식료 칸(T576 대기)이라 **표에만** 적는 줄(손잡이와 무관 · 보고·회부용)
const NOTES = Object.freeze([
  { id: 'eel', ko: '뱀장어(우나기)', np: '많음', st: '확실', where: '식료 칸(민물 종) — T576 근거가 오면 맞대어 넣는다(추신2 ③ "그 전엔 빈칸")', ev: 'T551 이치하라 유적군 조개무지 — 우나기 어골(출토 실측)' },
  { id: 'rice', ko: '쌀(벼)', np: '많음', st: '확실', where: '식료 칸(작물 적성) — T576 · 기후 정본(T570) 뒤', ev: 'T551 — 야요이 정의 자체가 수도작 시작(통설)' },
  { id: 'millet', ko: '기장', np: '보통', st: '약', where: '식료 칸(작물 적성) — T576 뒤', ev: 'T551 "이미 있는 종" 목록에만 — 야요이 직접 근거 미열람' },
  { id: 'salt', ko: '소금', np: '많음', st: '확실', where: '해안 제염(`salt.js` 자염) — 광맥 칸이 아니다(열도는 암염이 없다 · 제염토기)', ev: 'T551 한난시 제염토기(출토 실측)' },
  { id: 'oyster', ko: '굴·조개', np: '많음', st: '약', where: '갯벌(`tidal.js`) — 다섯 자리 밖 · 식료(T576)', ev: 'T551 이치하라 이보키사고·하마구리 — 게임 짝은 갯벌 `oyster` 뿐' },
  { id: 'abalone', ko: '전복', np: '보통', st: '약', where: '갯벌(`tidal.js` RARE_FRAC) · 식료(T576)', ev: 'T551 ① 표엔 없음("전복·상어·고래는 이 유적 자료엔 없음")' },
  { id: 'shell_bangle', ko: '조개 팔찌감', np: '많음', st: '약', isNew: true, where: '새 품목 — 바다(남쪽 해안) · 나는 자리는 ③ 판에서 정한다', ev: '추신1 표 "조개의 길"(고호라·이모가이) — 근거 확인은 T575/세션' },
  { id: 'cedar_log', ko: '삼나무(스기)', np: '많음', st: '확실', where: '나무 종 표(trees.json · T123 랩 정본)에 종이 없다 — 넣으려면 새 종(값) · 회부', ev: 'T551 다카스미이데조에 스기(출토 실측)' },
  { id: 'tungsten', ko: '텅스텐', hb: '많음', st: '—', where: '재민 확정 제거(hanbando-minerals 머리 — 3422℃ · econ 참조 0) — 추신1 표와 부딪혀 넣지 않았다 · 회부', ev: '추신1 표 "한반도에만"' },
  { id: 'amazonite', ko: '천하석', hb: '많음', st: '약', where: '196종에 없다 · T575 확인 뒤', ev: '추신1 표' },
  { id: 'marble', ko: '대리석', hb: '많음', st: '—', where: '재민 확정 제거(청동기 쓰임 근거 없음) — 넣지 않았다', ev: '추신1 표' },
  { id: 'shark_whale_hinoki_urushi', ko: '상어·고래·히노키·옻', np: '약', st: '약', where: '196종 밖 · T551 "근거 약함" 넷', ev: 'T551 ③' },
]);

// ── 손잡이 ───────────────────────────────────────────────────────────────────────────
const L_DEFAULT = 500;   // ★재민 10-03 "꼬리 폭은 네 의견대로"(추신4 · PM 안 500) — 재민 값(새 수 아님) · 정본 광맥도 이 값으로 구웠다
function L() {
  const s = process.env.T574_REGION;
  if (s == null || s === '') return L_DEFAULT;
  const v = parseFloat(s); return Number.isFinite(v) && v > 0 ? v : 0;
}
function S0() { const v = parseFloat(process.env.T574_S0); return Number.isFinite(v) && v >= 0 ? v : 0.5; }
function on() { return L() > 0; }
function newOn() { return process.env.T574_NEW_ITEMS === '1'; }
function has(zone) { return Object.prototype.hasOwnProperty.call(COLS, zone); }

let _SP = undefined;
function _known(id) {
  if (_SP === undefined) { try { _SP = require('./specialty'); } catch (e) { _SP = null; } }
  return !!(_SP && _SP.RESOURCES && _SP.RESOURCES[id]);
}
// 그 줄이 지금 표에 드나 — 새 품목은 손잡이 + 품목이 실제로 있을 때만
function _rowOn(r) { return !r.isNew || (newOn() && _known(r.id)); }

// ── 단계 → 수 ────────────────────────────────────────────────────────────────────────
function _lv(kind, id, cell) {
  if (cell == null) return 0;
  if (cell === '그대로') return kind === 'ore' ? (HB.POOL[id] || 0) : LV['보통'];
  return LV[cell] || 0;
}
/** 한 존·한 갈래의 단계 수(정규화 전). 표에 줄이 없는 품목: 광종 0(풀 밖) · 그 밖 보통(지금 값 — 고르게). */
function levelOf(kind, zone, id) {
  const col = COLS[zone]; if (!col) return 0;
  const rows = TABLE[kind] || [];
  for (const r of rows) if (r.id === id) return _rowOn(r) ? _lv(kind, id, r[col]) : 0;
  return kind === 'ore' ? 0 : LV['보통'];
}
/** 한 존의 갈래 가중(합 1 · 표 줄 순서) — 후보 목록을 주면 그 안에서. 보고·TV·뽑기가 같은 함수를 부른다. */
function weightsOf(kind, zone, cands) {
  const ids = cands || (TABLE[kind] || []).filter(_rowOn).map((r) => r.id);
  const out = {}; let s = 0;
  for (const id of ids) { const w = levelOf(kind, zone, id); if (w > 0) { out[id] = w; s += w; } }
  if (!(s > 0)) return null;
  for (const id of Object.keys(out)) out[id] /= s;
  return out;
}
/** 총변동거리 TV = ½ Σ|p − q| (0 = 같다 · 1 = 겹침 0). 두 분포 모두 합 1 이라고 본다(아니면 정규화). */
function tv(p, q) {
  const norm = (a) => { let s = 0; for (const k in a) s += a[k] > 0 ? a[k] : 0; const o = {}; for (const k in a) if (a[k] > 0) o[k] = a[k] / s; return o; };
  const P = norm(p || {}), Q = norm(q || {});
  let d = 0; for (const k of new Set([...Object.keys(P), ...Object.keys(Q)])) d += Math.abs((P[k] || 0) - (Q[k] || 0));
  return d / 2;
}

// ══ ② 꼬리 혼용 ═══════════════════════════════════════════════════════════════════════
//   이웃마다 꼬리 계수 f = s₀ · e^(−d/L) — d 는 그 이웃과의 경계에서 이 존 안쪽으로의 거리(셀 · 32px).
const CELL = 32;
let _ZC = null;
function _zc() { return _ZC || (_ZC = require('./zone-config')); }
const _geo = new Map();
const _biome = new Map();
const _NONE = Object.freeze({});
// 존 하나의 이웃 표 — 변마다 **셀 하나 간격**으로 건너편 존을 묻는다(`findZoneAt` · 반열린 사각 [x0, x0+W)).
//   한 변을 여러 존이 나눠 가져도(베링 남변처럼) 그 자리의 이웃이 답한다 — `_findNeighborSide` 의 가운데 한 점 묻기를 변 전체로 넓힌 것.
//   유효 = 다른 존 · 바다 아님 · 프로필 있음. 존마다 한 번 짓는다(프로세스 수명).
function _geoOf(zone) {
  if (_geo.has(zone)) return _geo.get(zone);
  const ZC = _zc(); const Z = ZC.ZONES && ZC.ZONES[zone];
  if (!Z) { _geo.set(zone, null); return null; }
  _biome.set(zone, Z.biome);
  const x0 = Z.worldOffsetX, y0 = Z.worldOffsetY, W = Z.zoneWidth, H = Z.zoneHeight;
  const nx = Math.max(1, Math.ceil(W / CELL)), ny = Math.max(1, Math.ceil(H / CELL));
  const at = (ax, ay) => {
    const z = ZC.findZoneAt(ax, ay);
    if (!z || z.id === zone || z.isOcean || !has(z.id)) return null;
    if (!_biome.has(z.id)) _biome.set(z.id, z.biome);
    return z.id;
  };
  const side = { W: new Array(ny), E: new Array(ny), N: new Array(nx), S: new Array(nx) };
  for (let j = 0; j < ny; j++) { const ay = y0 + Math.min(H - 1, j * CELL + CELL / 2); side.W[j] = at(x0 - 1, ay); side.E[j] = at(x0 + W, ay); }
  for (let i = 0; i < nx; i++) { const ax = x0 + Math.min(W - 1, i * CELL + CELL / 2); side.N[i] = at(ax, y0 - 1); side.S[i] = at(ax, y0 + H); }
  const any = {}; for (const k of Object.keys(side)) any[k] = side[k].some((v) => v);
  const g = { W, H, nx, ny, side, any, none: !(any.W || any.E || any.N || any.S) };
  _geo.set(zone, g);
  return g;
}
function biomeOf(zone) { if (!_biome.has(zone)) _geoOf(zone); return _biome.get(zone) || null; }
/**
 * 존 로컬 px (x, y) 에서 이웃마다의 **꼬리 계수** `{ [이웃 존]: f }` — f = s₀ · e^(−d/L)(같은 이웃이 두 변이면 가까운 쪽).
 * 끔·프로필 없는 존·섞이는 이웃이 없는 존이면 빈 객체(같은 객체 — 할당 0).
 * @param {number} [Lc] 꼬리 길이(셀) — 안 주면 손잡이(`T574_REGION`). 표·그림이 250·500·1000 을 넣어 부른다.
 */
function regionMix(zone, x, y, Lc) {
  const Lv = Lc != null ? +Lc : L();
  if (!(Lv > 0) || !has(zone)) return _NONE;
  const g = _geoOf(zone); if (!g || g.none) return _NONE;
  const ci = Math.max(0, Math.min(g.ny - 1, Math.floor(y / CELL))), cj = Math.max(0, Math.min(g.nx - 1, Math.floor(x / CELL)));
  const s0 = S0(), out = {};
  const put = (nb, dPx) => { if (!nb) return; const f = s0 * Math.exp(-Math.max(0, dPx) / CELL / Lv); if (!(nb in out) || f > out[nb]) out[nb] = f; };
  if (g.any.W) put(g.side.W[ci], x);
  if (g.any.E) put(g.side.E[ci], g.W - x);
  if (g.any.N) put(g.side.N[cj], y);
  if (g.any.S) put(g.side.S[cj], g.H - y);
  return out;
}
/** 섞이는 이웃이 있는 변까지의 거리(셀) — 없으면 Infinity. 표·그림용. */
function borderDistCells(zone, x, y) {
  if (!has(zone)) return Infinity;
  const g = _geoOf(zone); if (!g) return Infinity;
  const ci = Math.max(0, Math.min(g.ny - 1, Math.floor(y / CELL))), cj = Math.max(0, Math.min(g.nx - 1, Math.floor(x / CELL)));
  let d = Infinity;
  if (g.side.W[ci]) d = Math.min(d, x / CELL);
  if (g.side.E[ci]) d = Math.min(d, (g.W - x) / CELL);
  if (g.side.N[cj]) d = Math.min(d, y / CELL);
  if (g.side.S[cj]) d = Math.min(d, (g.H - y) / CELL);
  return d;
}
/**
 * 그 자리의 섞인 가중(합 1) — 이 존 가중 × (1 − T) + Σ 이웃 f × (그 이웃 **고유** 품목의 그 존 비중).
 *   고유 = 그 이웃 가중 > 0 이고 이 존 가중 = 0(이 존 목록에 없거나 '없음') — 두 존 다 있는 품목은 꼬리가 없다.
 * @param {Function} [listOf] (zoneId) → 그 존의 후보 목록(낚시는 존 biome 목록이 존마다 다르다) · 없으면 `cands`
 * @returns {{p: object, order: string[], tail: number}|null} 이 존 가중이 없으면 null
 */
function mixAt(kind, zone, x, y, cands, listOf, Lc) {
  const own = weightsOf(kind, zone, listOf ? listOf(zone) : cands);
  if (!own) return null;
  const order = Object.keys(own), p = {};
  const tails = regionMix(zone, x, y, Lc);
  const add = [];
  let T = 0;
  for (const nb of Object.keys(tails)) {
    const w = weightsOf(kind, nb, listOf ? listOf(nb) : cands); if (!w) continue;
    for (const k of Object.keys(w)) {
      if (own[k] > 0) continue;                       // 두 존 다 있다 — 꼬리 없음
      const t = tails[nb] * w[k]; if (!(t > 0)) continue;
      add.push([k, t]); T += t;
    }
  }
  if (T > 1) { for (const a of add) a[1] /= T; T = 1; }
  for (const k of order) p[k] = own[k] * (1 - T);
  for (const [k, t] of add) { if (!(k in p)) { p[k] = 0; order.push(k); } p[k] += t; }
  return { p, order, tail: T };
}

// ══ ③ 뽑기 — 섞인 가중에서 u 로 하나(결정론 · u 는 부르는 쪽의 자리 해시) ════════════════════════
function _pick(order, p, u) {
  let s = 0; for (const k of order) s += p[k] || 0;
  if (!(s > 0)) return null;
  let r = Math.max(0, Math.min(1 - 1e-12, u)) * s, last = null;
  for (const k of order) { const w = p[k] || 0; if (!(w > 0)) continue; last = k; r -= w; if (r < 0) return k; }
  return last;
}
/** 그 자리의 섞인 광종 가중(합 1 · 땅속) — 그림·표용. 프로필 없는 존이면 null. */
function oreMixAt(zone, x, y, Lc) {
  const m = mixAt('ore', zone, x, y, null, null, Lc);
  return m ? m.p : null;
}
/** 광종 하나(땅속 = 지질 뽑기) — 순서 = 이 존 표 줄 순서 + 꼬리 품목. 프로필 없는 존이면 null. */
function pickOre(zone, x, y, u, Lc) {
  const m = mixAt('ore', zone, x, y, null, null, Lc);
  return m ? _pick(m.order, m.p, u) : null;
}
/**
 * ★광맥 하나 **굽기** — 계획기(새 광맥 · 빈 칸 채움)와 부팅 채움이 부른다. 땅속 뽑기에
 *   재민 확정 굽기 규칙 셋(2026-08-01 · `hanbando-minerals.js` POLY 머리 — 지금은 한반도에만 걸려 있다)을 그대로 얹는다:
 *     ① 주요(NPC 시야 · 대·중·소) 광맥엔 철이 없다 — "철은 기본 마을에서는 안 생기도록. 플레이어가 탐험해서 찾는 거야"
 *        (사철 = 철의 원광이라 같은 줄로 본다 · 자잘은 그대로 = 탐험 보상) — 그 가중을 빼고 나머지로 정규화
 *     ③ 은 단독 광맥은 없다 — 뽑기가 은이면 연은(납)으로
 *     ② 다광종 — 납·구리·금은 POLY 분포를 단다(`minerals`)
 * @returns {{mineral: string, minerals: object|null}|null} 프로필 없는 존이면 null(부르는 쪽이 옛 길로)
 */
const NO_MAJOR = Object.freeze(['iron', 'iron_sand']);
function bakeOre(zone, x, y, u, isMajor, Lc, only) {
  const m = mixAt('ore', zone, x, y, null, null, Lc);
  if (!m) return null;
  const p = Object.assign({}, m.p);
  // ★[추신4] `only` — 'tail' = 이웃 고유 품목(꼬리)에서만 · 'own' = 이 존 품목에서만(덜 흔드는 굽기 `rebakeKeep` 의 두 갈래).
  //   없으면 옛 글자 그대로(섞인 가중 전부). 뽑기·규칙 셋은 같은 줄을 지난다(사본 0).
  if (only) { const own = weightsOf('ore', zone) || {}; for (const k of Object.keys(p)) if ((only === 'tail') === (own[k] > 0)) delete p[k]; }
  if (isMajor) for (const k of NO_MAJOR) delete p[k];
  let k = _pick(m.order, p, u);
  if (!k) return null;
  if (k === 'silver') k = 'lead';
  const poly = HB.POLY && HB.POLY[k];
  return { mineral: k, minerals: poly ? Object.assign({}, poly) : null };
}
/**
 * 종 하나 고르기(나무 · 낚시 · 민물 · 군락) — **옛 뽑기와 같은 분포면 null** 을 돌려준다(부르는 쪽이 옛 글자 그대로 돈다).
 *   ⓐ 끔 · 프로필 없는 존 → null
 *   ⓑ 섞인 가중이 옛 후보 목록 위의 **고르게**와 같으면 → null (두 존 다 '보통'인 갈래 · 꼬리가 안 든 자리 — 옛 해시 그대로)
 *   ⓒ 그 밖 → 섞인 가중에서 u 로 하나
 * @param {string}   kind   'tree' | 'fishRod' | 'fishFresh' | 'forage'
 * @param {Function} listOf (zoneId) → 그 존의 옛 후보 목록(배열). 낚시는 존 biome 목록이 존마다 다르다. 없으면 `legacy`.
 * @param {string[]} legacy 이 자리의 옛 후보 목록(부르는 쪽이 지금 쓰는 그 배열 — 고르게 비교의 기준)
 */
function chooseSpecies(kind, zone, x, y, u, listOf, legacy) {
  if (!on() || !has(zone)) return null;
  const m = mixAt(kind, zone, x, y, legacy, listOf);
  if (!m || !m.order.length) return null;
  const p = m.p;
  // ⓑ 옛 분포와 같은가 — 후보가 옛 목록과 같은 집합이고 가중이 고르게면 옛 함수가 낸다(바이트 동일 · 해시 비트도 같다)
  if (legacy && legacy.length === m.order.length && legacy.every((k) => k in p)) {
    const e = 1 / legacy.length; let flat = true;
    for (const k of legacy) if (Math.abs(p[k] - e) > 1e-12) { flat = false; break; }
    if (flat) return null;
  }
  // 순서 = 옛 목록 차례 먼저(그 밖 후보는 처음 나온 차례) — 결정론
  const ord = (legacy || []).filter((k) => k in p).concat(m.order.filter((k) => !legacy || legacy.indexOf(k) < 0));
  return _pick(ord, p, u);
}
// 광맥 자리의 u — 계획기 `plan-ore-clusters.js` 의 hash2(셀x, 셀y, 731)와 **같은 식**(광종 씨 731 · 품위 씨 500 과 분리).
//   ⚠좌표 해시 식은 terrain.js `_oHash` · 계획기 `hash2` · `rebalance-ore-minerals.js H2` 와 같다(그쪽이 정본 — 여기는 그 값을 재현만).
//   ★[추신4] 씨 인자 — 없으면 731(옛 글자). 덜 흔드는 굽기의 꼬리 씨 732 · 뽑기 씨 733 · 품위(pk) 씨 500 이 같은 식을 쓴다.
function veinU(cx, cy, seed) {
  const sd = seed == null ? 731 : (seed | 0);
  let h = (Math.floor(cx / CELL) | 0) * 374761393 + (Math.floor(cy / CELL) | 0) * 668265263 + sd * 1274126177;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/**
 * ★[추신4] **덜 흔드는 굽기**(R2 · 한반도 정본 787 — 재민 v9 + 마을 배정을 될 수 있는 대로 둔다) — 정본 광맥 하나:
 *   ① 꼬리 — 자리 해시(씨 732) < 그 자리 꼬리 몫 T 이면 **이웃 고유 품목에서** 굽는다(뽑기 씨 733 · 규칙 셋) — 닛폰 고유는 한반도에 꼬리 몫만
 *   ② 이 존에서 '없음'이 된 광종(한반도 옥)이면 **이 존 품목에서** 다시 굽는다(뽑기 씨 733 · 규칙 셋)
 *   ③ 그 밖은 null — 정본 그대로
 *   (`scripts/t574-ore-table.js` 미리보기 R2 도 이 함수를 부른다 — 굽기는 `bakeOre` 한 줄을 지난다 · 사본 0)
 * @returns {{mineral:string, minerals:object|null, why:'tail'|'redraw'}|null}
 */
function rebakeKeep(zone, o, Lc) {
  const x = o.center[0], y = o.center[1];
  const m = mixAt('ore', zone, x, y, null, null, Lc);
  if (!m) return null;
  // ⚠뽑기 씨는 733 — 정본 광종을 낸 그 u(씨 731 · 전역 풀 추첨)를 다시 쓰면 고르는 광맥이 **그 u 구간**에 몰려 있어서
  //   한 품목으로 쏠린다(③ 미리보기에서 옥 98 중 90 이 납이 됐다 — 씨 상관). 꼬리 여부(732)·뽑기(733)·옛 광종(731)은 서로 독립.
  const uPick = veinU(x, y, 733);
  let b = null, why = null;
  if (m.tail > 0 && veinU(x, y, 732) < m.tail) { b = bakeOre(zone, x, y, uPick, !o.minor, Lc, 'tail'); why = 'tail'; }
  if (!b) { const own = weightsOf('ore', zone) || {}; if (!(own[o.mineral] > 0)) { b = bakeOre(zone, x, y, uPick, !o.minor, Lc, 'own'); why = 'redraw'; } }
  return b ? Object.assign(b, { why }) : null;
}
/**
 * ★[추신4] **끔이면 구운 정본 광종을 여섯째 판 칸으로 되돌린다** — `server/region-bake-off.json`(굽기 스크립트가 적은 옛 기록).
 *   켬(기본)이면 아무것도 안 한다. 자리(center)로 찾고, 지금 광종이 그 굽기가 적은 광종(`now`)일 때만 옛 기록을 **통째로**
 *   되살린다(키 차례까지 — 사람이 뒤에 고친 칸은 안 건드린다). terrain.js `_getHardcoded` 가 정본을 실을 때 한 번 부른다.
 * @returns {number} 되돌린 광맥 수
 */
function restoreBakeOff(hc) {
  if (on() || !hc) return 0;
  let off = null; try { off = require('./region-bake-off.json'); } catch (e) { off = null; }
  if (!off || !off.zones) return 0;
  let n = 0;
  for (const zone of Object.keys(off.zones)) {
    const ores = hc[zone] && hc[zone].ores; if (!Array.isArray(ores)) continue;
    const idx = new Map();
    ores.forEach((o, i) => { if (o && Array.isArray(o.center)) idx.set(o.center[0] + ',' + o.center[1], i); });
    for (const e of off.zones[zone]) {
      const i = idx.get(e.c[0] + ',' + e.c[1]);
      if (i == null || ores[i].mineral !== e.now) continue;
      ores[i] = JSON.parse(JSON.stringify(e.was)); n++;
    }
  }
  return n;
}
/** 한 존에만 나는 품목(이웃 존 가중 0) — 그 존 가중 순. 꼬리 표·접근성 자가 부른다. */
function uniqueOf(kind, zone, other, cands) {
  const a = weightsOf(kind, zone, cands) || {}, b = weightsOf(kind, other, cands) || {};
  return Object.keys(a).filter((k) => a[k] > 0 && !(b[k] > 0)).sort((x, y) => a[y] - a[x]);
}

// ── 보고·하네스용 — 갈래별 두 존 TV(표 그대로 · 혼용 전) ─────────────────────────────────
function tvTable() {
  const out = {};
  for (const kind of ['ore', 'tree']) out[kind] = +tv(weightsOf(kind, 'hanbando') || {}, weightsOf(kind, 'nippon') || {}).toFixed(4);
  {   // 민물 — 후보는 종 표 10 전부(표에 줄이 없는 종은 보통 · 지금은 빈칸이라 0)
    let FF = null; try { FF = require('./freshfish'); } catch (e) { FF = null; }
    if (FF) { const ids = FF.ids(); out.fishFresh = +tv(weightsOf('fishFresh', 'hanbando', ids) || {}, weightsOf('fishFresh', 'nippon', ids) || {}).toFixed(4); }
  }
  {   // 낚시 — 목록이 biome 마다 다르다(존 biome 의 목록 위 가중)
    let F = null; try { F = require('./fishing'); } catch (e) { F = null; }
    if (F) out.fishRod = +tv(weightsOf('fishRod', 'hanbando', F.speciesFor(biomeOf('hanbando'))) || {}, weightsOf('fishRod', 'nippon', F.speciesFor(biomeOf('nippon'))) || {}).toFixed(4);
  }
  {   // 군락 — 후보는 야생 군락 종 넷(지금은 빈칸이라 0)
    const ids = ['mushroom_patch', 'beehive', 'greens_patch', 'wild_vine'];
    out.forage = +tv(weightsOf('forage', 'hanbando', ids) || {}, weightsOf('forage', 'nippon', ids) || {}).toFixed(4);
  }
  return out;
}

module.exports = {
  LV, COLS, TABLE, NOTES, CELL,
  L, S0, on, newOn, has, levelOf, weightsOf, tv, tvTable, uniqueOf,
  regionMix, mixAt, borderDistCells, biomeOf,
  pickOre, bakeOre, NO_MAJOR, oreMixAt, chooseSpecies, veinU,
  L_DEFAULT, rebakeKeep, restoreBakeOff,
  _resetGeo: () => { _geo.clear(); _biome.clear(); },   // 하네스용(존 표를 다시 지을 때)
};
