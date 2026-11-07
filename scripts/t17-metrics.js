#!/usr/bin/env node
// === scripts/t17-metrics.js — ECON 수술의 계측기 (T17 → T60 확장) ==============
//
// ★★**계측기다. 하네스가 아니다 — 러너에 넣지 마라.**
//   러너는 파일 **첫 열의 등재 표**로 스스로 찾는다(`run-regress.sh` `_disc`) — 이 파일엔 그 표가 없다.
//   `scripts/trade-metrics.js` 와 같은 자리: 판정하지 않고 **수치를 낸다**.
//   판정은 `보고_T17_승인대기.md` 의 옛/새/귀속 표에서 재민이 한다(지시 §5).
//
// ★세계 조립은 `scripts/ev-density.js` 와 **같은 순서·같은 정본 함수**다(사본 아님).
//   실지도 → pickSeedVillages → VillageLayout.generate → extractLandParamsApprox → createWorldV2.
//
// 내는 열 (지시 §6 의 "새 기준선 스냅샷 제안" 항목):
//   ⓐ 기준선 — 인구 · 소멸 · 무기Q · 확장셀 · 거래
//   ⓑ 게시 — 건수 · 마을당 며칠에 1건(밀도 캐논 2~3일)
//   ⓒ 부족/글럿 **품목 분포** — 지시 §3 "부족 품목 분포 전/후"
//   ⓓ 도구 — 재고 Σ · 도구Q(품질보정 총량) · 부족 건수 · 게시 의뢰 건수
//   ⓔ 보존식 — 재고 Σ · 캐러밴 유통량(건수·수량)
//   ⓕ 소금 — 재고 Σ · **해안/내륙 가격 지역차**(자염 편입의 목적 그 자체)
//   ⓖ MSY — 상한이 선 마을 · 어촌 인구·어부·생선 재고·가격
//   ⓗ [T60] **어장 눈금** — 어촌별 잠재 어획(`_fishRawLast`) 대 상한(`land.fishSustain`)의 비
//   ⓘ [T60] **밀도 분해** — 사건 밀도가 어떤 유형·품목에서 왔나
//   ⓙ [T60] **사장 셋** — `woodSustain`·`forageSustain`·`marginalQ` 가 켜지면 무엇이 움직이나(표만)
//
// 축 손잡이(대조군 — 지시 §3 "①~③ 각각 끈 시드 1개씩"):
//   T17_TOOL=0 / T17_PRESERVE=0 / T17_SALT=0  → 그 축만 끈다(엔진 쪽 손잡이와 같은 이름)
//   [T60] T60_FISH2WAY=0  낚시 양방향 끔 · T60_MSY_MODE=legacy|lab|ema|fishv2 · T17_MSY=0 상한 끔(★T923 켬 기본 — 서버와 같은 값 · 같은 때 · 엔진 `T17_MSY` 를 읽는다)
//
// 실행: node scripts/t17-metrics.js [일수=800] [시드=1020]
//   T17_JSON=/tmp/x.json  … 표를 JSON 으로도 남긴다(옛/새 비교 표를 손으로 옮겨 적지 않게)
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t17-metrics-${process.pid}.db`;

const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
// ★[T525 2026-09-29] `T17_ZONE=<존A>+<존B>` = 두 존을 **따로** 돌리며 하루마다 잇는 판(`scripts/t525-cross-zone.js two`) — 존 하나면 이 줄은 무동작(비트 동일).
if (String(process.env.T17_ZONE || '').includes('+')) { require('./t525-cross-zone').orchestrateFromT17(DAYS, SEED); return; }

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const Events = R('server/events');
const SPEC = R('server/specialty');
const P = Villages.__labProbe;
// ★★[T407 2026-09-26] **존 손잡이** — `T17_ZONE=<존 id>`(기본 `hanbando` = 종전 한 줄 그대로 · 비트 동일).
//   마을은 이 자가 **서버와 같은 길**로 세운다: 후보 `T.getZoneVillages(Z)`(정본 json 의 칸 — 닛폰도 T351 이후
//   16곳이 거기 적혀 서버 `siteCandidates` 와 같은 배열이다) → `P.pickSeedVillages`(존 설정 `seedAllVillages`·
//   `villageMax` — 한반도 = 전수 · 닛폰 = 키 없음 → 품질 게이트) → `findOpenCenter`(뭍 없으면 스킵) → `generate`.
//   ⚠`LAB_SEEDCACHE` 는 존마다 다른 파일을 줘라(캐시는 존을 모른다).
const Z = process.env.T17_ZONE || 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;
if (!ZONE) { console.error(`[T17_ZONE] 모르는 존: ${Z}`); process.exit(2); }

P.setZoneId(Z);
// ★[T484] 존 기후 — 서버 존 기동과 **같은 한 호출**(`weather.applyZoneClimate`) · 표에 없거나 `apply: false` · `T484_PALEO` 끔이면 무동작(비트 동일).
//   `T484_T17_NORMALS=1` 은 이 자만의 팔(평년값 `apply: false` 인 존 — 한반도 — 을 켰을 때의 3시드 표 · 켜기는 재민).
{ const _c = R('server/weather').applyZoneClimate(Z, { forceNormals: process.env.T484_T17_NORMALS === '1' }); if (_c && _c.changed) console.log('[T484] 존 기후', JSON.stringify(_c.CLIMATE)); }
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
// ★★[T407 2026-09-26] **해안선 띠** — 서버의 통행 정본(`zone.js isWaterTileLocal`)은 물을 **둘** 본다:
//   해안선 띠(`WATER_TILES` = `chunk.generateCoastlineWaterTiles`)와 손그림 강·호수. 이 자는 여태 **뒤엣것만** 봤다.
//   한반도에선 띠가 가장자리 4.4% 라 마을 땅에 안 닿지만(T407 §1 — 켜고 꺼도 51곳 시딩 JSON 바이트 동일),
//   닛폰은 폭이 좁아 띠가 16% 로 안쪽까지 든다(T348 계획기가 **정확히 이 자리**에서 헛다리를 놓았다).
//   띠를 안 보면 자가 바다 위에 마을을 세운다(이즈사키 — 서버는 "뭍 없음 — 스킵").
//   ⇒ `T17_COAST`(기본: 켬 — ★T709 한반도도 · `=0` 이면 종전 한반도 끔 판). 원천은 서버가 부르는 그 함수 하나(사본 0).
//   ★[T669 2026-10-08] `T17_COAST=1` = 서버 정본 해안 그대로다 — 물 술어(시딩 `findOpenCenter` · 마당 · 땅 셈 · 걸음)가 서버 `WATER_TILES` 와 같은 칸을 본다.
//     바다 거리(`villages.seaDistPx`)는 손잡이와 무관하게 이미 같은 칸이다(자는 `deps.waterTiles` 가 없어 같은 함수를 `findZoneAt` 없이 부른다 — 생성기가 그 인자를 안 써 칸 집합 같음 · 두 존 다른 칸 0).
//     한반도 기본 끔 = 기준선 자 바이트(여덟째 판) · 켜는 것은 기준선 자 변경(PM) — 표 `보고/T669_2026-10-08.md`.
//   ★[T709 2026-10-16] 한반도도 기본 켬(재민 10-12 ⑤ B "3시드 자를 서버 해안으로") — 아홉째 판 후보 · 되돌림 `T17_COAST=0`(여덟째 판 자).
const _COAST = process.env.T17_COAST !== undefined ? process.env.T17_COAST === '1' : true;
const _COAST_TILES = _COAST ? R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, R('server/zone-config').findZoneAt,
  Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }))) : null;
const isWaterTileLocal = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  if (_COAST_TILES && _COAST_TILES.has(`${tx}_${ty}`)) return true;
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
// ★★[T601 ④] **개울 술어를 기본으로** — 실서버 시딩(= 초기화 세계)은 존이 `isStreamLocal` 을 넘겨 집터·논밭이 개울을 본다(T585).
//   두 자가 같은 술어(`server/streams.js` 래스터 · 사본 0)를 deps 에 끼워야 게이트가 초기화 세계를 잰다 = 일곱째 판(족보 560).
//   손잡이 `T601_RULER_STREAMS=0` = 옛 정의(개울 없는 자 판 · 바이트 그대로). 씨앗 캐시는 래스터 지문 표식(`t601s`)이 다르면 버린다.
const _t601 = R('server/streams').rulerDeps(Z, { isTerrainBlockedLocal, isWaterTileLocal });
const ta = P.makeTerrainAdapter(T, ZONE, _t601.deps);

// ★[T100 2026-09-05 · 순전한 계측 편의 · 값 무변] 51곳 `VillageLayout.generate` 는 전수 ~10분이다.
//   결정론이라 캐시할 수 있다. **손잡이가 없으면 종전 루프 그대로**(기본값 무변 — 이 파일은 기준선의 자다).
//   `LAB_SEEDCACHE=<경로>` 를 주면 그 파일에 적고/읽는다. 지우면 그대로 다시 만든다(값 동일).
const _SEEDCACHE = process.env.LAB_SEEDCACHE || '';
let seeds = null;
if (_SEEDCACHE && fs.existsSync(_SEEDCACHE)) { try { seeds = JSON.parse(fs.readFileSync(_SEEDCACHE, 'utf8')); } catch (e) { seeds = null; } }
// ★[T593 ⑤] 이름표 손잡이(`T593_LABEL=1`)는 이름을 바꾼다 — 캐시는 이름까지 담으므로 **손잡이가 다른 캐시는 안 쓴다**(켠 판만 `t593` 표식).
if (seeds && !!(seeds[0] && seeds[0].t593) !== !!P.T593_LABEL) { console.log(`  ⚠[T593] 캐시(${_SEEDCACHE})의 이름표 손잡이가 지금과 다르다 — 다시 굽는다`); seeds = null; }
if (seeds && ((seeds[0] && seeds[0].t601s) || '') !== _t601.sig) { console.log(`  ⚠[T601] 캐시(${_SEEDCACHE})의 개울 표식이 지금과 다르다 — 다시 굽는다`); seeds = null; }
if (!seeds) {
  const hard = T.getZoneVillages(Z) || [];
  const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  const _t593 = P.T593_LABEL ? P.t593Namer(hard) : null;   // ★[T593 ⑤] 서버 시딩과 **같은 함수 · 같은 순서**로 이름을 짓는다(끔 = null = 후보 이름 그대로)
  seeds = [];
  for (const hv of picked) {
    const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
    if (!c) continue;
    let layout;
    try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); } catch (e) { continue; }
    const lp = P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout);
    seeds.push({ name: _t593 ? _t593.label(hv, layout, lp).name : hv.name, ccx: c.ccx, ccy: c.ccy, lp,
      layout: { farmland: layout.farmland, dryfield: layout.dryfield, nongZone: layout.nongZone, territory: layout.territory,
                houses: (layout.houses || []).map((h) => ({ cx: h.cx, cy: h.cy })) }, ...(_t593 ? { t593: 1 } : {}), ...(_t601.sig ? { t601s: _t601.sig } : {}) });
  }
  if (_SEEDCACHE) { try { fs.mkdirSync(path.dirname(_SEEDCACHE), { recursive: true }); fs.writeFileSync(_SEEDCACHE, JSON.stringify(seeds)); } catch (e) {} }
}
const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
// ★★[T135] 나무 층 주입 — **서버가 부르는 그 문**(`server/villages.js` Stage 3)을 계측기도 부른다.
//   ⚠족보 130: 계측기가 이 문을 안 열면 여덟 수는 대체를 못 보고 "안 움직인다"고 말한다.
//     그건 대체가 없다는 증거가 아니라 **자가 그 층을 안 돈다**는 증거다. `test-trees` 가 두 자리를 다 본다.
require('../server/trees').attachToWorld(world);
// ★★[T191 2026-09-12 · 계측 전용 · **env 가 없으면 한 글자도 안 바뀐다**] 도구 마모 배수 주입.
//   T180 이 엔진에 뚫은 문(`world.toolWearMul`)을 **서버 세계에서도** 한 번 보기 위한 자리다.
//   카드 T191 ②: 랩 8마을이 못 보는 꼬리(족보 144)를 51마을로 한 번 본다.
//   ⚠이 줄을 여기 둔 이유: ⓚ 여덟 수를 **다시 구현하지 않기 위해서**다(계측기 정본 재구현 0 · T163 규약).
//     `T191_TOOLWEAR` 를 안 주면 `world.toolWearMul` 이 없고 엔진 배수는 1 이다 — 기준선 계측기 무변.
{ const _tw = parseFloat(process.env.T191_TOOLWEAR || ''); if (Number.isFinite(_tw) && _tw > 0 && _tw !== 1) world.toolWearMul = _tw; }
// ★[T206·T233 · T299 가 자리를 정본으로 옮겼다 · ★재민 09-19 로 기본은 **끔**] 둘째 화물과 그 관문.
//   ⚠**여기서 문을 열지 않는다** — 읽는 자리는 정본 하나다(`sim/economy-sim-v2.js` `cargoTwoOn`/`cargoTwoGateOn`).
//     이 계측기는 손잡이만 준다: 기본(끔) 팔은 아무것도 안 주고, 켠 팔은 `L_CARGO_TWO=1 L_CARGO_TWO_GATE=1`.
//   ⚠옛 이름(`T206_CARGO_TWO`·`T233_CARGO_GATE`)은 **덮어쓰기**로 남긴다 — 지난 표를 다시 낼 수 있어야 하고
//     `0` 을 줄 수도 있어야 한다(`=1` 만 보던 종전 문법이면 팔이 기본에 끌려간다 · 족보 128 의 거울).
if (process.env.T206_CARGO_TWO !== undefined) world.cargoTwo = process.env.T206_CARGO_TWO === '1';
if (process.env.T233_CARGO_GATE !== undefined) world.cargoTwoGate = process.env.T233_CARGO_GATE === '1';
// ★[T239 · 계측 전용] 수익 최대 선택은 **끔 그대로**다(T265 정정 — `twogate` 와 못 가름). 주입으로만 켠다.
if (process.env.T239_CARGO_BEST === '1') world.cargoTwoBest = true;
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
  // ★★[T1050] 서버 집 규칙(크루가 곳간 목재로 짓고 지은 침상이 주거를 묶는다)을 몸 없는 이 자에도 — 시딩 집 칸 = `layout.houses`(서버 `_houseCells` 시딩과 같은 칸).
  //   붙이는 문 · 하루 · 크루 함수는 econ 정본(`labHouseAttach` · `labHouseWorldDay` · `houseCrewDay`) — 이 자는 칸 수와 서버 크루 두 수만 준다(사본 0). `T1050_LAB_HOUSE=0` = 안 붙인다 = 종전 바이트.
  if (s.layout && s.layout.houses) econ.labHouseAttach(ev, s.layout.houses.length, { crew: P._t400Probe.LIFE_CREW, pday: P._t400Probe.LIFE_STAGE_PDAY });   // 두 수 = 서버 정본(`villages.js` 그 두 상수)
  else if (econ.T1050_LAB_HOUSE) console.log(`  ⚠[T1050] 캐시에 layout.houses 가 없다(${s.name}) — 그 마을은 종전 셈 주거로 돈다`);
}
world.day = 0;
// ★★[T1047 2026-11-01 · T1012 카드 감 4 · PM "추상 금지 — 랩도 같은 지형 거리"] 교역 거리 = 서버 존이 econ 에 넣는 **그 행렬**(지형 최단거리 · 정본 `computeAndInjectDistMatrix`).
//   손잡이 `T1047_LAB_DIST`(랩 기본 켬 후보 · `=0` = 직선 = 종전 바이트) · 몸통은 `scripts/lib-lab-dist.js` 한 벌(두 랩 자가 같은 함수 · 사본 0).
//   ⚠생활층 문(`_clearProbe` · `_cropProbe`)을 열기 **전**에 부른다 — 정본 문이 모듈 칸을 잠깐 빌렸다 비운다.
const _t1047 = require('./lib-lab-dist').inject({ P, T, ZONE, deps: _t601.deps, sig: _t601.sig, world, econ, cache: _SEEDCACHE });
// ★★[T100 2026-09-05 · 손잡이 없으면 무변] **개간 관측** — 이 계측기는 여태 `ENABLE_VILLAGES=0` 이라
//   생활층 개간이 안 돌았다. econ 이 밭을 안 봤을 땐 무해했지만(T86 까지), 밭이 밑변이 되면
//   **밭이 시딩값에 얼어붙은 세계**를 재게 된다(라이브는 개간이 돈다). `T100_CLEAR=1` 이면 정본
//   `_lifeClearDay` 를 하루에 한 번 돌린다 — 판정은 그 함수가 하고 계측기는 부르기만 한다(사본 0).
const _CLEAR = process.env.T100_CLEAR === '1';
const _clearVils = [];
if (_CLEAR) {
  let _rowid = 0;
  P._clearProbe.setup(ta, world, { insertVillageBuilding: () => ++_rowid });
  // ★★[T286 2026-09-14 실측 · 경고만 · 값 무변] **반쪽 캐시 함정.**
  //   `LAB_SEEDCACHE` 가 가리키는 파일이 옛 판(`layout` 칸이 없는 판)이면 아래 `if (!s2.layout) return;`
  //   가 51곳을 **조용히 전부 건너뛴다** — 실측: 그 캐시로 `T100_CLEAR=1` 을 켜면 "마을 **0**곳 · 초기 밭 **0**칸",
  //   `layout` 이 든 캐시면 "마을 **51**곳 · 초기 밭 **5,050**칸". 끈 것과 켠 것이 같은 수를 내니 아무도 안 본다.
  //   ⇒ 여기서 **소리를 낸다**(동작은 그대로 — 이 카드는 계측기만이고 판정을 안 바꾼다 · 고치는 것은 회부).
  if (_SEEDCACHE && seeds.some((s2) => s2 && !s2.layout)) {
    console.log(`  ⚠[T286] 캐시(${_SEEDCACHE})에 \`layout\` 칸이 없다 — T100_CLEAR 관측이 **조용히 0곳**이 된다.`
      + ' 캐시를 지우고 다시 구워라(`rm` 뒤 한 판) — 보고/T286_2026-09-14.md §1.');
  }
  world.villages.forEach((ev, i) => {
    const s2 = seeds[i]; if (!s2 || !s2.layout) return;
    _clearVils.push(P._clearProbe.attach({ dbId: i + 1, name: s2.name, ccx: s2.ccx, ccy: s2.ccy, econ: ev, layout: s2.layout }));
  });
  console.log(`  [T100] 개간 관측 켬 — 마을 ${_clearVils.length}곳 · 초기 밭 ${_clearVils.reduce((a, v) => a + v._farmSet.size, 0)}칸`);
}

// ★해안 판정 — **엔진이 쓰는 그 값을 그대로 읽는다**(사본 금지).
//   `server/villages.js` 의 `extractLandParamsApprox` 가 `coastal`(과 계측용 `_seaDistPx`)을 붙이고,
//   `createVillage` 의 land 화이트리스트가 그걸 통과시킨다. 계측기가 따로 재면 그게 곧 두 번째 정의다.
const coastal = new Set();

world.villages.forEach((v, i) => { if (v.land && v.land.coastal) coastal.add(i); });
{
  const d = seeds.map((s) => s.lp && s.lp._seaDistPx).filter((x) => x != null).sort((a, b) => a - b);
  console.log(`  해안(land.coastal) ${coastal.size}곳 · 바다까지 px — 최소 ${d[0]} · 중앙 ${d[Math.floor(d.length / 2)]} · 최대 ${d[d.length - 1]}`);
}
// ★[T1088 · 계측 전용 · **env 가 없으면 한 글자도 안 바뀐다**] 품목 빈도 — 곳간 · 거래 · 게시판.
//   `T17_ITEMFREQ=<파일>` 이면 하루마다 ⓐ 마을 곳간 실키(곳간 창 `villages.playerVillageInventory` 와 같은 문턱 0.005 · `_` 내부 칸 빼고)를
//   마을·날로 세고 ⓑ 그날 새로 붙은 캐러밴 장부 줄(`world.tradeLog` — 5000 줄에서 잘리니 끝에 몰아 세지 않는다)의 보낸 것 · 받아 온 것과
//   ⓒ 게시판 의뢰(`onRequest` 'open')의 구하는 것 · 보상을 센다. 첫 1시간 = 게임일 0~2(하루 24실분 · 1시간 = 2.5일 · `server/zone-config.js:543`).
//   판정 0 — 수만 낸다(그림 굽는 차례의 자 · 보고/T1088).
const _T1088 = process.env.T17_ITEMFREQ ? { store: {}, trade: {}, req: {}, rew: {}, seen: new WeakSet(), d: 0 } : null;
function _t1088Bump(tab, k, h1) { if (!k) return; const o = tab[k] || (tab[k] = { n: 0, n1h: 0 }); o.n++; if (h1) o.n1h++; }
function _t1088Req(q) { if (!_T1088 || !q) return; const h1 = _T1088.d < 3; _t1088Bump(_T1088.req, q.item, h1); _t1088Bump(_T1088.rew, q.rewItem, h1); }
function _t1088Day(d) {
  if (!_T1088) return;
  const h1 = d < 3;
  for (const v of world.villages) {
    const st = v.storage || {};
    for (const r of Object.keys(st)) { if (r.charCodeAt(0) === 95) continue; if (+(st[r] || 0) > 0.005) _t1088Bump(_T1088.store, r, h1); }
  }
  const TL = world.tradeLog || [];
  for (let i = TL.length - 1; i >= 0 && !_T1088.seen.has(TL[i]); i--) {
    const t = TL[i]; _T1088.seen.add(t);
    for (const x of [t.sent, t.bought, t.aGave, t.bGave]) if (x && x.res) _t1088Bump(_T1088.trade, x.res, h1);
  }
  _T1088.d = d + 1;
}
// ★[T1136 · 계측 전용 · **env 가 없으면 한 글자도 안 바뀐다**] 바구니 교역 표 — `T17_BASKET=<파일>` 이면 관측 훅 둘(읽기만)을 꽂아
//   다리마다 ⓐ 품목 수 · 짐 kg · 적재율(kg ÷ 몸 짐 정본 25) · 값 ⓑ 도착 · 집 도착 시각(econ 날 몫 → 시 · 낮/밤 = zone-config 해 뜸 · `dayPhaseRatio`)
//   ⓒ 품목별 실은 양(숯 ↔ 통나무 — T1135) ⓓ 받아 온 짐 · 남은 값 ⓔ 약탈(짐 값 ↔ 약탈 — 규칙 무변)을 세고 · 날마다 ⓕ 값 진동(|Δln p|) ·
//   열흘마다 ⓖ 차익 남는 폭(이웃 20 · 정보 반경 · 한 kg 당 · 값 = 그날 교역 값표)을 잰다. 바구니 판은 `world.onBasket` · 종전 판은 `world.onTradeLeg`(첫째 화물 출발)와 장부 줄.
//   판정 0 — 수만 낸다(보고/T1136). 세계에는 아무것도 안 넣는다(훅은 관측자 — 엔진이 try 로 감싸 부른다).
const _T1136 = process.env.T17_BASKET ? (() => {
  const W = R('server/weights'), CY = R('server/carry'), ZC = R('server/zone-config');
  const cap = CY.CFG.CAP_KG, kgOf = (r) => +W.kgOfOrDefault(r) || 0;
  const night = (t) => { const p = (((t % 1) + 1) % 1 - ZC.SUNRISE_FRAC + 1) % 1; return p > ZC.WORLD.dayPhaseRatio; };   // 해 몫 > 낮 몫 = 밤(econ 날 몫 0 = 앵커 자정)
  const S = { legs: 0, items: {}, kg: [], load: [], val: 0, unitsBy: {}, kgBy: {}, retLegs: 0, retItems: {}, retKg: [], retBy: {}, left: [], bail: 0, dead: 0,
    raided: 0, raidVal: [], cleanVal: [], arrH: new Array(24).fill(0), homeH: new Array(24).fill(0), arrNight: 0, arrN: 0, homeNight: 0, homeN: 0,
    tOut: [], gain: [], seen: new WeakSet(), px: new Map(), vol: {}, volN: {}, arb: [], arbKg: [], arbPos: 0, arbN: 0, bind: { budget: 0, cap: 0, avail: 0, none: 0 }, outWhy: {}, how: {}, trimLeft: 0 };
  const hist = (o, n) => { o[n] = (o[n] || 0) + 1; };
  const tod = (t, H, k) => { const h = Math.floor((((t % 1) + 1) % 1) * 24) % 24; H[h]++; if (night(t)) S[k + 'Night']++; S[k + 'N']++; };
  world.onBasket = (kind, x) => {
    const c = x.c;
    if (kind === 'launch') {
      S.legs++; hist(S.items, c.basket.length); S.kg.push(c.kg); S.load.push(c.kg / c.capKg); S.val += c._t1136.val; S.tOut.push(c.travelDays); S.gain.push(x.plan.gain);
      for (const it of c.basket) { S.unitsBy[it.res] = (S.unitsBy[it.res] || 0) + it.amt; S.kgBy[it.res] = (S.kgBy[it.res] || 0) + it.kg; }
      if (x.plan.outWhy) for (const k in x.plan.outWhy) S.outWhy[k] = (S.outWhy[k] || 0) + x.plan.outWhy[k];   // 가는 길 품목이 멈춘 까닭(낱개 상한 = 내 잉여 · 짐 자리 · 한계 이득 ≤ 0)
      if (x.plan.how) S.how[x.plan.how] = (S.how[x.plan.how] || 0) + 1;
      if (x.plan.leftover > 0) S.trimLeft++;
    } else if (kind === 'arrive') {
      tod(x.t, S.arrH, 'arr'); S.retLegs++; hist(S.retItems, x.ret.length); S.retKg.push(x.kgRet); S.left.push(x.credit > 0 ? (x.credit - x.spent) / x.credit : 0);
      for (const it of x.ret) S.retBy[it.res] = (S.retBy[it.res] || 0) + it.amt;
      (x.lossOut > 0 ? S.raidVal : S.cleanVal).push(c._t1136.val); if (x.lossOut > 0) S.raided++;
      //   받아 온 짐이 무엇에 걸렸나 — 다 팔았다(받을 값이 모자람 = 가는 짐 몫) · 짐 자리(남은 자리 < 1kg) · B 잉여(그 밖 — B 가 내놓을 몫 · 이득이 바닥) · 받아 온 것 0
      if (!x.ret.length) S.bind.none++; else if (!(x.back && x.back.length)) S.bind.budget++; else if ((c.capKg || cap) - x.kgRet < 1) S.bind.cap++; else S.bind.avail++;
    } else if (kind === 'bail') { tod(x.t, S.arrH, 'arr'); S.bail++; }
    else if (kind === 'home') tod(x.t, S.homeH, 'home');
    else if (kind === 'dead') S.dead++;
  };
  world.onTradeLeg = (L) => {   // 종전 판 — 첫째 화물(+ 둘째) 출발
    S.legs++; hist(S.items, L.second ? 2 : 1);
    const kg = L.units * kgOf(L.res) + (L.second ? L.secondUnits * kgOf(L.second) : 0);
    S.kg.push(kg); S.load.push(kg / cap); S.val += L.units * L.pFrom; S.tOut.push(L.tripDays / 2); S.gain.push(L.profit);
    S.unitsBy[L.res] = (S.unitsBy[L.res] || 0) + L.units; S.kgBy[L.res] = (S.kgBy[L.res] || 0) + L.units * kgOf(L.res);
    if (L.second) { S.unitsBy[L.second] = (S.unitsBy[L.second] || 0) + L.secondUnits; S.kgBy[L.second] = (S.kgBy[L.second] || 0) + L.secondUnits * kgOf(L.second); }
  };
  const day = (d) => {
    const TL = world.tradeLog || [];
    for (let i = TL.length - 1; i >= 0 && !S.seen.has(TL[i]); i--) {   // 종전 판 장부 줄(도착 · 받아 온 짐 · 날 경계 도착) — 바구니 판은 훅이 센다
      const t = TL[i]; S.seen.add(t);
      if (t.basket || t.rerouted) continue;
      if (t.abandoned) { S.bail++; continue; }
      tod(t.day, S.arrH, 'arr'); S.retLegs++; hist(S.retItems, t.bought ? 1 : 0);
      if (t.bought) { S.retBy[t.bought.res] = (S.retBy[t.bought.res] || 0) + t.bought.amt; S.retKg.push(t.bought.amt * kgOf(t.bought.res)); } else S.retKg.push(0);
      if (t.raided) S.raided++;
    }
    if (d < 100) { for (const v of world.villages) if (v._priceCache) S.px.set(v, v._priceCache); return; }
    for (const v of world.villages) {   // ⓕ 값 진동 — 그날 교역 값표(`_priceCache` · 교역이 그날 새로 뜬 값)의 품목별 |Δ ln p|
      const P = v._priceCache, Q = S.px.get(v);
      if (P && Q && P !== Q && (v.npcs || []).length) for (const r in P) { const a = +P[r], b = +Q[r]; if (a > 0 && b > 0) { S.vol[r] = (S.vol[r] || 0) + Math.abs(Math.log(a / b)); S.volN[r] = (S.volN[r] || 0) + 1; } }
      if (P) S.px.set(v, Object.assign({}, P));
    }
    if (d % 10) return;
    const TAU = econV2.TAU, infoR = world.infoRange || 400;
    for (const a of world.villages) {   // ⓖ 차익 남는 폭 — 이웃(교역 후보 20 · 정보 반경) 사이 두 곳 다 곳간에 있는 품목(≥ 1)마다: 사서(×(1+세금) + 운반비) 팔 때(×(1−세금)) 남는 몫
      const PA = a._priceCache; if (!PA || !(a.npcs || []).length || !a._near20) continue;   //   = ln(팔 값 ÷ 산 값) — 엔진 식(세금 · 운반비). 남는 쌍의 몫(> 0) · 그 쌍의 한 kg 당 남는 값을 모은다
      for (const b of a._near20) {
        const PB = b._priceCache; if (!PB || !(b.npcs || []).length) continue;
        const dist = econ.villageDist(a, b); if (!(dist <= infoR)) continue;
        const tc = (econV2.TRANSPORT_COST_PER_1000 * dist / 1000) * econV2.haulMul();
        for (const r in PA) {
          if (!((a.storage[r] || 0) >= 1) || !((b.storage[r] || 0) >= 1)) continue;
          const pa = +PA[r] || 0, pb = +PB[r] || 0, k = kgOf(r); if (!(pa > 0) || !(pb > 0) || !(k > 0)) continue;
          const buy = pa * (1 + TAU) + tc, sell = pb * (1 - TAU);
          S.arbN++;
          if (sell > buy) { S.arbPos++; S.arb.push(Math.log(sell / buy)); S.arbKg.push((sell - buy) / k); }
        }
      }
    }
  };
  const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(4); };
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const out = () => {
    const topUnits = Object.entries(S.unitsBy).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([r, u]) => ({ res: r, units: +u.toFixed(1), kg: +(S.kgBy[r] || 0).toFixed(1) }));
    const traded = Object.entries(S.unitsBy).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([r]) => r);
    const vol = (rs) => { let s = 0, n = 0; for (const r of rs) { s += S.vol[r] || 0; n += S.volN[r] || 0; } return n ? +(s / n).toFixed(5) : null; };
    let deadTot = 0; for (const v of world.villages) deadTot += v._deadTot || 0;
    return { cap, legs: S.legs, items: S.items, kg: { p10: q(S.kg, 0.1), p50: q(S.kg, 0.5), p90: q(S.kg, 0.9), mean: S.kg.length ? +(sum(S.kg) / S.kg.length).toFixed(3) : null },
      load: { p10: q(S.load, 0.1), p50: q(S.load, 0.5), p90: q(S.load, 0.9), mean: S.load.length ? +(sum(S.load) / S.load.length).toFixed(4) : null, full: S.load.filter((x) => x >= 0.95).length },
      val: +S.val.toFixed(1), tOut: { p10: q(S.tOut, 0.1), p50: q(S.tOut, 0.5), p90: q(S.tOut, 0.9) }, gain: { p50: q(S.gain, 0.5), p90: q(S.gain, 0.9) },
      ret: { legs: S.retLegs, items: S.retItems, kg: { p50: q(S.retKg, 0.5), mean: S.retKg.length ? +(sum(S.retKg) / S.retKg.length).toFixed(3) : null },
        leftFrac: { p50: q(S.left, 0.5), p90: q(S.left, 0.9) }, top: Object.entries(S.retBy).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([r, u]) => ({ res: r, units: +u.toFixed(1) })) },
      bind: S.bind, outWhy: S.outWhy, how: S.how, trimLeft: S.trimLeft, bail: S.bail, dead: S.dead, raided: S.raided, raidVal: { n: S.raidVal.length, p50: q(S.raidVal, 0.5) }, cleanVal: { n: S.cleanVal.length, p50: q(S.cleanVal, 0.5) },
      arrive: { hours: S.arrH, night: S.arrNight, n: S.arrN }, home: { hours: S.homeH, night: S.homeNight, n: S.homeN },
      top: topUnits, fuel: { charcoal: { units: +(S.unitsBy.charcoal || 0).toFixed(1), kg: +(S.kgBy.charcoal || 0).toFixed(1), ret: +(S.retBy.charcoal || 0).toFixed(1) },
        wood: { units: +(S.unitsBy.wood || 0).toFixed(1), kg: +(S.kgBy.wood || 0).toFixed(1), ret: +(S.retBy.wood || 0).toFixed(1) } },
      vol: { traded: vol(traded), food: vol(['food']), tradedItems: traded }, arb: { lnP50: q(S.arb, 0.5), lnP90: q(S.arb, 0.9), kgP50: q(S.arbKg, 0.5), kgP90: q(S.arbKg, 0.9), pos: S.arbPos, n: S.arbN, posFrac: S.arbN ? +(S.arbPos / S.arbN).toFixed(4) : null },
      famineDead: deadTot };
  };
  return { day, out };
})() : null;
// ★[T1152 · 계측 전용 · **env 가 없으면 한 글자도 안 바뀐다**] 식량이 어디서 어디로 · 굶는 마을의 치를 힘 — `T17_MARKET=<파일>` 이면 날마다 읽기만 한다.
//   ⓐ 마을·날 — 식량 빚(T1074 정본 `foodDebtOf` · 빚 > 0 = 굶는 마을) · 그날 죽음(정본 `lib-day-deaths` — `_deadTot` 의 하루 차) · 곳간 식량 환산(정본 `totalFoodEquivalent`)
//   ⓑ 장부 줄(그날 새 줄)마다 받는 마을 곳간에 든 식량 환산 — 바구니 = 판 품목(`basket`) · 종전 = `sent` · 받아 온 짐(→ 보낸 마을) ·
//      받는 마을이 그 날 앞(어제 끝)에 굶었나로 가른다 · 낱개 환산 = 정본 함수에 곳간 한 칸만 넣어 잰다(econ `_t825FoodPer` 와 같은 셈)
//   ⓒ 열흘마다 굶는 마을의 치를 힘 — 내보낼 몫(정본 후보 함수 · 정산이 보는 칸)의 값 · 몫 밖 곳간(유보 줄 아래 · 갈래별 — 정산이 못 보는 칸) ·
//      금고(품목 · 채권 `_cash`) · 사람 수 — 값은 그 마을 그림자가격(그날) · 온 세계 가운데 값(인구 있는 마을의 그 품목 값 중앙) 둘
//   판정 0 — 수만 낸다(보고/T1152). 세계에는 아무것도 안 넣는다(장부 줄 · 곳간 · 빚을 읽기만).
const _T1152 = process.env.T17_MARKET ? (() => {
  const V1 = econ, V2 = econV2;
  const phi = new Map();
  const phiOf = (r) => {
    if (phi.has(r)) return phi.get(r);
    let f = 0;
    try { const st = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; st[r] = (st[r] || 0) + 1; f = +V1.totalFoodEquivalent({ storage: st, npcs: [], _world: world }) || 0; } catch (e) { f = 0; }
    phi.set(r, f); return f;
  };
  const byName = new Map(); for (const v of world.villages) byName.set(v.name, v);
  const DD = require('./lib-day-deaths');   // 그날 죽음 정본(T963 — `_deadTot` 의 하루 차 · 빈 마을에 남은 전날 `_deathsToday` 를 다시 세지 않는다 · 사본 0)
  const lastDead = new Map(); for (const v of world.villages) lastDead.set(v, DD.deadTot(v));
  const prev = new Map();   // 마을 → 어제 끝 { debt, starving }
  const seen = new WeakSet();
  const S = { rows: 0, rowsToStarv: 0, feTo: 0, feToStarv: 0, feToOk: 0, feRet: 0, feRetToStarv: 0, feFromStarv: 0, rowsFromStarv: 0,
    vd: 0, vdDebt: 0, vdStarv: 0, deaths: 0, deathsInDebt: 0, feSum: 0, pay: [], byItem: {}, mvs: [], mvAll: [] };
  const CAT = (r) => (r === 'tool' || r === 'bronze_tool' || r === 'iron_tool' || r === 'clothes') ? 'capital' : (r === 'weapon' || r === 'armor') ? 'arms'
    : (r === 'stone' || r === 'wood') ? 'build' : (r === 'ore') ? 'ore' : 'other';
  const items = (row) => row.basket ? row.basket : (row.sent && !row.abandoned ? [row.sent] : []);
  const rets = (row) => row.retBasket ? row.retBasket : (row.bought ? [row.bought] : []);
  const fe = (list) => { let s = 0; for (const it of list) if (it && it.res && it.amt > 0) s += it.amt * phiOf(it.res); return s; };
  const day = (d) => {
    const TL = world.tradeLog || [];
    for (let i = TL.length - 1; i >= 0 && !seen.has(TL[i]); i--) {
      const t = TL[i]; seen.add(t);
      if (t.rerouted) continue;
      const to = byName.get(t.to), from = byName.get(t.from);
      const pt = prev.get(to), pf = prev.get(from);
      const giv = items(t), x = fe(giv), y = fe(rets(t));
      S.rows++; S.feTo += x; S.feRet += y;
      for (const it of giv) if (it && it.res && it.amt > 0 && phiOf(it.res) > 0) S.byItem[it.res] = (S.byItem[it.res] || 0) + it.amt * phiOf(it.res);
      if (pt && pt.debt) { S.rowsToStarv++; S.feToStarv += x; } else S.feToOk += x;
      if (pf && pf.debt) { S.feRetToStarv += y; S.rowsFromStarv++; S.feFromStarv += x; }
    }
    let medP = null;
    const sample = d % 10 === 9;
    if (sample && V2._lowestProducer) for (const v of world.villages) { if (!(v.npcs || []).length) continue; try { const lp = V2._lowestProducer(v, v._priceCache || V2.computeShadowPrices(v), world.day); if (lp && isFinite(lp.mv)) S.mvAll.push(lp.mv); } catch (e) {} }   // 상인 하루 몫(가장 값싼 생산자 · 그날 교역 값표)
    for (const v of world.villages) {
      const N = (v.npcs || []).length;
      const D = V1.foodDebtOf ? V1.foodDebtOf(v) : { max: 0, starving: 0 };
      const debt = N > 0 && D.max > 0, starving = N > 0 && D.starving > 0;
      if (N > 0) { S.vd++; S.feSum += +V1.totalFoodEquivalent(v) || 0; if (debt) S.vdDebt++; if (starving) S.vdStarv++; }
      const dead = DD.dayDelta(lastDead, v, v); S.deaths += dead; if (debt) S.deathsInDebt += dead;
      prev.set(v, { debt, starving });
      if (!sample || !debt) continue;
      if (!medP) {   // 온 세계 가운데 값(그날 · 인구 있는 마을)
        const cols = {};
        for (const x of world.villages) { if (!(x.npcs || []).length) continue; const P = V2.computeShadowPrices(x); for (const r in P) (cols[r] || (cols[r] = [])).push(+P[r] || 0); }
        medP = {}; for (const r in cols) { const a = cols[r].sort((p, q) => p - q); medP[r] = a[Math.floor(a.length / 2)]; }
      }
      const P = V2.computeShadowPrices(v), C = V2._t1136Probe.exportCands({ v }, N), sur = {};
      for (const c of C) sur[c.res] = Math.min(c.surplus, v.storage[c.res] || 0);
      const rec = { d, N, feDays: +((+V1.totalFoodEquivalent(v) || 0) / N).toFixed(3), pFood: +(P.food || 0).toFixed(3), pFoodMed: +(medP.food || 0).toFixed(3),
        payOwn: 0, payMed: 0, keepOwn: {}, keepMed: {}, trOwn: 0, trMed: 0, cash: +((v.treasury && v.treasury._cash) || 0).toFixed(2), cands: C.length };
      for (const r in v.storage) {
        const s = +v.storage[r] || 0; if (!(s > 0) || phiOf(r) > 0) continue;
        const po = +P[r] || 0, pm = +medP[r] || 0, u = sur[r] || 0, k = Math.max(0, s - u), cat = CAT(r);
        rec.payOwn += u * po; rec.payMed += u * pm;
        rec.keepOwn[cat] = (rec.keepOwn[cat] || 0) + k * po; rec.keepMed[cat] = (rec.keepMed[cat] || 0) + k * pm;
      }
      rec.trFE = 0; rec.trFood = +((v.treasury && v.treasury.food) || 0).toFixed(2);
      for (const r in (v.treasury || {})) { if (r === '_cash') continue; const s = +v.treasury[r] || 0; if (!(s > 0)) continue; rec.trOwn += s * (+P[r] || 0); rec.trMed += s * (+medP[r] || 0); rec.trFE += s * phiOf(r); }
      rec.trFE = +rec.trFE.toFixed(2); rec.needDay = N;   // 금고 식량 환산(그 마을 하루 먹는 양 N 과 견준다)
      if (S.mvs.length < 20000) { try { const lp = V2._lowestProducer ? V2._lowestProducer(v, P, world.day) : null; if (lp && isFinite(lp.mv)) S.mvs.push(lp.mv); } catch (e) {} }
      for (const k of ['payOwn', 'payMed', 'trOwn', 'trMed']) rec[k] = +rec[k].toFixed(2);
      for (const o of [rec.keepOwn, rec.keepMed]) for (const k in o) o[k] = +o[k].toFixed(2);
      S.pay.push(rec);
    }
  };
  const out = () => {
    const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3); };
    const col = (k) => S.pay.map((r) => r[k]);
    const colc = (k, c) => S.pay.map((r) => r[k][c] || 0);
    const cats = ['capital', 'arms', 'build', 'ore', 'other'];
    return { rows: S.rows, rowsToStarv: S.rowsToStarv, feTo: +S.feTo.toFixed(1), feToStarv: +S.feToStarv.toFixed(1), feToOk: +S.feToOk.toFixed(1), feRet: +S.feRet.toFixed(1),
      feRetToStarv: +S.feRetToStarv.toFixed(1), rowsFromStarv: S.rowsFromStarv, feFromStarv: +S.feFromStarv.toFixed(1),
      vd: S.vd, vdDebt: S.vdDebt, vdStarv: S.vdStarv, deaths: S.deaths, deathsInDebt: S.deathsInDebt, feDaysMean: S.vd ? +(S.feSum / S.vd).toFixed(1) : null,
      byItem: Object.entries(S.byItem).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([r, x]) => ({ res: r, fe: +x.toFixed(1) })),
      pay: { n: S.pay.length, feDays: { p50: q(col('feDays'), 0.5) }, pFood: { p50: q(col('pFood'), 0.5), p90: q(col('pFood'), 0.9) }, pFoodMed: { p50: q(col('pFoodMed'), 0.5) },
        payOwn: { p50: q(col('payOwn'), 0.5), p90: q(col('payOwn'), 0.9) }, payMed: { p50: q(col('payMed'), 0.5), p90: q(col('payMed'), 0.9) },
        keepOwn: Object.fromEntries(cats.map((c) => [c, { p50: q(colc('keepOwn', c), 0.5), p90: q(colc('keepOwn', c), 0.9) }])),
        keepMed: Object.fromEntries(cats.map((c) => [c, { p50: q(colc('keepMed', c), 0.5), p90: q(colc('keepMed', c), 0.9) }])),
        trOwn: { p50: q(col('trOwn'), 0.5), p90: q(col('trOwn'), 0.9) }, trMed: { p50: q(col('trMed'), 0.5), p90: q(col('trMed'), 0.9) }, cash: { p50: q(col('cash'), 0.5), p90: q(col('cash'), 0.9) },
        N: { p50: q(col('N'), 0.5) }, noCands: S.pay.filter((r) => !r.cands).length,
        trFE: { p50: q(col('trFE'), 0.5), p90: q(col('trFE'), 0.9) }, trFood: { p50: q(col('trFood'), 0.5), p90: q(col('trFood'), 0.9) }, trFEdays: { p50: q(S.pay.map((r) => r.trFE / Math.max(1, r.N)), 0.5), p90: q(S.pay.map((r) => r.trFE / Math.max(1, r.N)), 0.9) } },
      mvAll: { n: S.mvAll.length, p10: q(S.mvAll, 0.1), p50: q(S.mvAll, 0.5), p90: q(S.mvAll, 0.9) } };
  };
  return { day, out };
})() : null;
const depositMap = Villages.playerVillageDepositMap();
const shortByItem = new Map(), glutByItem = new Map(), reqByItem = new Map();
const L = Events.createLedger({
  econV2, vidOf: (v, i) => i, depositMap,
  // ★[T94 2026-09-05] 여기 있던 `cfg: { PRICE_UP: 0.70, PRICE_DOWN: 0.70, HYST: 1.6 }` 를 **뺐다**.
  //   그건 채택 문턱의 **사본**이었고, T94 가 채택을 ±90 으로 옮기자 이 계측기만 옛 문턱으로 재면서
  //   "기준선 정본"의 일/건 열을 조용히 옛 값으로 찍고 있었다(실측: 22469건 · 1.82일 — ±70 의 수).
  //   ⇒ 정본(`events.js` 기본값)을 그대로 따른다. 되돌려 보고 싶으면 env 한 줄이다
  //     (`EV_PRICE_UP=0.70 EV_PRICE_DOWN=0.70 node scripts/t17-metrics.js 800 1020`).
  //   ⚠econ 일곱 열(인구·소멸·무기Q·확장셀·도구Q·보존식·소금)은 **장부와 무관**하다 —
  //     장부는 관측자라 문턱을 바꿔도 그 일곱은 한 자도 안 움직인다(T94 보고 §3 이 3시드로 증명한다).
  onEvent: (e) => {
    if (e.type === 'STOCK_SHORTAGE') shortByItem.set(e.item, (shortByItem.get(e.item) || 0) + 1);
    else if (e.type === 'STOCK_GLUT') glutByItem.set(e.item, (glutByItem.get(e.item) || 0) + 1);
  },
  ...(process.env.T17_ITEMFREQ ? { onRequest: (q, w) => { if (w === 'open') _t1088Req(q); } } : {}),
});
L.prime(world);

// ★★[T152 2026-09-07] **석재 바닥 마을 궤적 표본** — 계측만(엔진 무접촉 · 코드 변경 0).
//   `land.stone == FLOOR(0.25)` 인 마을만 하루치 상태를 받아 둔다(그 밖의 마을은 안 본다 = 비용 ~0).
//   왜 이 마을들인가: T135 2판이 농촌12 로 본 죽음의 고리 —
//     석재 0 → 석공이 도구를 못 만든다(`produceSpecial` 게이트 `stone >= _stCost`) → 도구 0 →
//     전 직업 생산 ×0.25(맨손) → 기근 → 인구 0. 그 고리는 **바닥 마을에서만** 상시 임계다.
const STONE_FLOOR = require(path.join(__dirname, '..', 'server', 'livelihood')).FLOOR.stone;
const floorIdx = world.villages.map((v, i) => [v, i]).filter(([v]) => (v.land && v.land.stone || 0) <= STONE_FLOOR + 1e-9);
const floorTrace = floorIdx.map(([v]) => ({ name: v.name, land: +(v.land.stone || 0).toFixed(3),
  pop0: (v.npcs || []).length, popMax: (v.npcs || []).length, stoneMin: Infinity, toolMin: Infinity,
  daysStone0: 0, daysTool0: 0, forDays: 0, masonDays: 0, days: 0 }));

const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world); L.scanDay(world, world.day, {});
  if (_T1088) _t1088Day(d);                                      // ★[T1088] 품목 빈도(env 있을 때만)
  if (_T1136) _T1136.day(d);                                     // ★[T1136] 바구니 표(env 있을 때만)
  if (_T1152) _T1152.day(d);                                     // ★[T1152] 식량 흐름 · 치를 힘 표(env 있을 때만)
  if (_CLEAR) P._clearProbe.tickDay(_clearVils);                 // [T100 4판] 개간 관측
  for (let k = 0; k < floorIdx.length; k++) {                    // ★[T152] 석재 바닥 마을 표본
    const v = floorIdx[k][0], t = floorTrace[k];
    const n = (v.npcs || []).length, st = +(v.storage.stone || 0), tl = +(v.storage.tool || 0);
    t.days++;
    if (n > t.popMax) t.popMax = n;
    if (st < t.stoneMin) t.stoneMin = st;
    if (tl < t.toolMin) t.toolMin = tl;
    if (st < 0.2) t.daysStone0++;                 // STONE_NET 1차 발동 문턱(절대 0.2) 아래에 있던 날
    if (tl < 0.05) t.daysTool0++;                 // 도구가 사실상 0 이던 날
    t.forDays += ((v.counts || {}).forager || 0);
    t.masonDays += ((v.counts || {}).mason || 0);
  }
}
if (_CLEAR) console.log(`  [T100] 개간 관측 — 끝 밭 ${_clearVils.reduce((a, v) => a + v._farmSet.size, 0)}칸 · 마을당 중앙 ${_clearVils.map((v) => v._farmSet.size).sort((a, b) => a - b)[Math.floor(_clearVils.length / 2)]}칸`);
console.log = _log;
if (_T1152) {   // ★[T1152] 식량 흐름 · 치를 힘 표 JSON(env 있을 때만)
  fs.writeFileSync(process.env.T17_MARKET, JSON.stringify({ card: 'T1152', zone: Z, seed: SEED, days: DAYS, market: !!econV2.T1152_MARKET, flags: econV2._t1152Probe ? econV2._t1152Probe.flags : null, curve: (econV2.T1152_MARKET && econV2._t1152Probe && econV2._t1152Probe.flags.cal) ? econV2._t1152Probe.cal(world.day) : null, basket: !!econV2.T1136_BASKET, t474: econV2.CARAVAN_DAY_SPEED !== econV2.NPC_SPEED, ..._T1152.out() }, null, 1));
  console.log(`  [T1152] 식량 흐름 표: ${process.env.T17_MARKET}`);
}
if (_T1136) {   // ★[T1136] 바구니 표 JSON(env 있을 때만)
  fs.writeFileSync(process.env.T17_BASKET, JSON.stringify({ card: 'T1136', zone: Z, seed: SEED, days: DAYS, basket: !!econV2.T1136_BASKET, escortCarry: !!econV2.T1136_ESCORT_CARRY, t474: econV2.CARAVAN_DAY_SPEED !== econV2.NPC_SPEED,
    caravanDaySpeed: econV2.CARAVAN_DAY_SPEED, ..._T1136.out() }, null, 1));
  console.log(`  [T1136] 바구니 표: ${process.env.T17_BASKET}`);
}
if (_T1088) {   // ★[T1088] 품목 빈도 JSON(env 있을 때만 · 단위: 곳간 = 마을·날 · 거래 = 장부 줄 칸 · 게시판 = 연 의뢰)
  fs.writeFileSync(process.env.T17_ITEMFREQ, JSON.stringify({ card: 'T1088', zone: Z, seed: SEED, days: DAYS, villages: world.villages.length, firstHourDays: 3,
    store: _T1088.store, trade: _T1088.trade, req: _T1088.req, rew: _T1088.rew }, null, 1));
  console.log(`  [T1088] 품목 빈도: ${process.env.T17_ITEMFREQ}`);
}

// ── ⓐ 기준선 ────────────────────────────────────────────────────────────────
let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0;
for (const v of world.villages) {
  const n = (v.npcs || []).length; pop += n;
  if (v._everPop) ever++;
  if (v._everPop && n <= 0) dead++;
  weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
  expand += v.expansions || 0;
}
const live = world.villages.filter((v) => (v.npcs || []).length > 0).length;
const S = L.stats;
const perVD = S.emitted / Math.max(1, live * S.days);
const daysPer = 1 / Math.max(1e-9, perVD);

const AX = (k, dflt) => (process.env['T17_' + k] === '0' ? '끔' : dflt);
console.log(`\n=== T17 계측 — 실지도 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일 ===`);
console.log(`  축: 도구 ${AX('TOOL', '켬')} · 보존식 ${AX('PRESERVE', '켬')} · 소금 ${AX('SALT', '켬')}`);
console.log(`\nⓐ 기준선   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand} · 거래 ${world.tradeLog.length}`);
console.log(`ⓑ 게시     의뢰 **${S.reqOpened}**건(기준선 정본의 '게시' 열) · 철회 ${S.reqClosed} · 사건 ${S.emitted}건 · 마을당 ${daysPer.toFixed(2)}일/건 (밀도 캐논 2~3일) · 인구있는 마을 ${live}`);

// ── ⓒ 부족/글럿 품목 분포 ────────────────────────────────────────────────────
const topOf = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const ko = (r) => (SPEC.RESOURCES[r] && SPEC.RESOURCES[r].ko) || r;
const fmtTop = (m) => topOf(m, 10).map(([r, c]) => `${ko(r)} ${c}`).join(' · ') || '없음';
const sumOf = (m) => [...m.values()].reduce((a, b) => a + b, 0);
console.log(`\nⓒ 부족 품목 분포 (총 ${sumOf(shortByItem)}건)`);
console.log(`   ${fmtTop(shortByItem)}`);
console.log(`ⓒ 글럿 품목 분포 (총 ${sumOf(glutByItem)}건)`);
console.log(`   ${fmtTop(glutByItem)}`);

// ── ⓓ~ⓕ 축별 열 ─────────────────────────────────────────────────────────────
const PRESERVED = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'];
const stockOf = (r) => world.villages.reduce((a, v) => a + (v.storage[r] || 0), 0);
const toolStock = stockOf('tool') + stockOf('bronze_tool') + stockOf('iron_tool');
let toolQ = 0;
for (const v of world.villages) toolQ += (v.storage.tool || 0) * (v._toolQ != null ? v._toolQ : 1);
console.log(`\nⓓ 도구     재고 ${toolStock.toFixed(1)} · 도구Q ${toolQ.toFixed(1)} · 부족 ${shortByItem.get('tool') || 0}건 · 글럿 ${glutByItem.get('tool') || 0}건`);

const presStock = PRESERVED.reduce((a, r) => a + stockOf(r), 0);
let presTrades = 0, presAmt = 0;
for (const t of world.tradeLog) {
  if (t.basket) { for (const x of [...t.basket, ...(t.retBasket || [])]) if (PRESERVED.includes(x.res)) { presTrades++; presAmt += x.amt || 0; } continue; }   // ★[T1136] 바구니 줄 — 품목마다(끔 = 바구니 줄 없음 = 아래 종전 두 줄)
  if (t.sent && PRESERVED.includes(t.sent.res)) { presTrades++; presAmt += t.sent.amt || 0; }
  if (t.bought && PRESERVED.includes(t.bought.res)) { presTrades++; presAmt += t.bought.amt || 0; }
}
console.log(`ⓔ 보존식   재고 ${presStock.toFixed(1)} (${PRESERVED.map((r) => `${ko(r)} ${stockOf(r).toFixed(1)}`).join(' · ')})`);
console.log(`           캐러밴 유통 ${presTrades}건 · ${presAmt.toFixed(1)} 단위`);

// 소금 — 해안/내륙 가격 지역차. 가격은 정본 함수(computeShadowPrices) 하나만 부른다.
let cN = 0, cP = 0, iN = 0, iP = 0, cS = 0, iS = 0, saltTrades = 0, saltAmt = 0;
world.villages.forEach((v, i) => {
  if (!(v.npcs || []).length) return;
  let p = 0; try { p = (econV2.computeShadowPrices(v) || {}).salt || 0; } catch (e) {}
  if (coastal.has(i)) { cN++; cP += p; cS += v.storage.salt || 0; }
  else { iN++; iP += p; iS += v.storage.salt || 0; }
});
for (const t of world.tradeLog) {
  if (t.basket) { for (const x of [...t.basket, ...(t.retBasket || [])]) if (x.res === 'salt') { saltTrades++; saltAmt += x.amt || 0; } continue; }   // ★[T1136] 바구니 줄
  if (t.sent && t.sent.res === 'salt') { saltTrades++; saltAmt += t.sent.amt || 0; }
  if (t.bought && t.bought.res === 'salt') { saltTrades++; saltAmt += t.bought.amt || 0; }
}
const cAvg = cN ? cP / cN : 0, iAvg = iN ? iP / iN : 0;
console.log(`ⓕ 소금     재고 해안 ${cS.toFixed(1)}(${cN}곳) · 내륙 ${iS.toFixed(1)}(${iN}곳) · 부족 ${shortByItem.get('salt') || 0}건`);
console.log(`           가격 해안 ${cAvg.toFixed(3)} · 내륙 ${iAvg.toFixed(3)} · **지역차 ×${cAvg > 0 ? (iAvg / cAvg).toFixed(2) : '—'}** (내륙÷해안 — 1보다 크면 소금길이 선다)`);
console.log(`           캐러밴 유통 ${saltTrades}건 · ${saltAmt.toFixed(1)} 단위`);

// ── ⓖ MSY A/B (지시 §5 — 표만 낸다. 판정은 재민) ─────────────────────────────
{
  const on = !!econ.T17_MSY;   // ★[T923] 켬 기본 — 엔진의 손잡이를 읽는다(되돌림 `T17_MSY=0`)
  const fishers = world.villages.reduce((a, v) => a + ((v.counts && v.counts.fisher) || 0), 0);
  let fv = 0, fpop = 0, fstock = 0, fp = 0, fpN = 0, capped = 0;
  for (const v of world.villages) {
    if (!(v.npcs || []).length) continue;
    const isFish = ((v.counts && v.counts.fisher) || 0) > 0;
    if (v.land && v.land.fishSustain != null) capped++;
    if (!isFish) continue;
    fv++; fpop += v.npcs.length; fstock += v.storage.fish || 0;
    try { const p = (econV2.computeShadowPrices(v) || {}).fish; if (p != null) { fp += p; fpN++; } } catch (e) {}
  }
  console.log(`ⓖ MSY      상한 ${on ? '**켬**' : '끔'}(T17_MSY) · 상한이 실제로 선 마을 ${capped}/${live}`);
  console.log(`           어촌 ${fv}곳 · 인구 ${fpop} · 어부 ${fishers} · 생선 재고 ${fstock.toFixed(1)} · 생선 가격 평균 ${fpN ? (fp / fpN).toFixed(3) : '—'}`);
}

// ── ⓗ [T60] 어장 눈금 — 잠재 어획 대 상한 ────────────────────────────────────
const SUS = R('server/sustain');
{
  const rows = [];
  for (const v of world.villages) {
    if (!(v.npcs || []).length) continue;
    const raw = +(v._fishRawLast || 0), cap = (v.land && v.land.fishSustain != null) ? +v.land.fishSustain : null;
    if (!(raw > 0)) continue;
    rows.push({ n: v.name, f: (v.counts && v.counts.fisher) || 0, raw: +raw.toFixed(2), cap,
                ratio: cap != null ? +(cap / raw).toFixed(2) : null, ema: +(v._fishRawEMA || 0).toFixed(2) });
  }
  rows.sort((a, b) => b.raw - a.raw);
  const rs = rows.filter((r) => r.ratio != null).map((r) => r.ratio).sort((a, b) => a - b);
  console.log(`\nⓗ 어장 눈금  모드 **${SUS.MSY_MODE}** · 헤드룸 ${SUS.MSY_HEADROOM} · 상한 스위치 T17_MSY=${econ.T17_MSY ? '켬' : '끔'}`);
  console.log(`           어부가 있는 마을 ${rows.length} · 잠재 어획 최대 ${rows[0] ? rows[0].raw : 0} · 중앙 ${rows.length ? rows[Math.floor(rows.length / 2)].raw : 0}`);
  if (rs.length) {
    console.log(`           **상한÷잠재** 최소 ${rs[0]} · 중앙 ${rs[Math.floor(rs.length / 2)]} · 최대 ${rs[rs.length - 1]}   (랩 설계 의도 = 1.5~2)`);
    console.log(`           상한이 **무는**(비<1) 마을 ${rs.filter((x) => x < 1).length}/${rs.length}`);
  } else console.log('           상한 미적용(land.fishSustain 없음) — 비를 못 잰다');
  console.log('           ' + rows.slice(0, 6).map((r) => `${r.n}(어부${r.f} 잠재${r.raw}${r.cap != null ? ' 상한' + r.cap : ''})`).join(' · '));
}

// ── ⓘ [T60] 밀도 분해 ────────────────────────────────────────────────────────
{
  const byType = L.stats.byType || {};
  console.log(`\nⓘ 밀도 분해  사건 ${S.emitted} · 마을당 ${daysPer.toFixed(2)}일/건 (캐논 2~3일)`);
  console.log(`           유형 — ` + Object.entries(byType).map(([k, v]) => `${k} ${v}`).join(' · '));
  const topS = topOf(shortByItem, 5).map(([r, c]) => `${ko(r)} ${c}`).join(' · ');
  console.log(`           부족 상위 — ${topS}   (도구 ${shortByItem.get('tool') || 0} · 소금 ${shortByItem.get('salt') || 0})`);
}

// ── ⓙ [T60] 사장 셋 — 켜면 무엇이 움직이나(표만) ─────────────────────────────
{
  let wN = 0, fN = 0, mN = 0, wS = 0, fS = 0;
  for (const s2 of seeds) {
    const lp = s2.lp || {};
    if (lp.woodSustain != null) { wN++; wS += lp.woodSustain; }
    if (lp.forageSustain != null) { fN++; fS += lp.forageSustain; }
    if (lp.marginalQ != null) mN++;
  }
  let lumber = 0, forager = 0;
  for (const v of world.villages) { lumber += (v.counts && v.counts.lumberjack) || 0; forager += (v.counts && v.counts.forager) || 0; }
  console.log(`\nⓙ 사장 셋   woodSustain 잰 마을 ${wN}(합 ${wS.toFixed(1)}) · forageSustain ${fN}(합 ${fS.toFixed(1)}) · marginalQ ${mN}`);
  console.log(`           지금 land 에 실린 것: wood ${world.villages.filter((v) => v.land && v.land.woodSustain != null).length} · forage ${world.villages.filter((v) => v.land && v.land.forageSustain != null).length} · marginalQ ${world.villages.filter((v) => v.land && v.land.marginalQ != null).length}  ← **전부 0 이면 사장**`);
  console.log(`           켜지면 물릴 대상 — 벌목꾼 ${lumber}명 · 채집꾼 ${forager}명 (어부 ${world.villages.reduce((a, v) => a + ((v.counts && v.counts.fisher) || 0), 0)}명과 같은 자리)`);
}

// ★[T277] ⓚ 블록이 찍는 수 중 JSON 에 없던 셋(생곡 · ㉮ · ㉯)을 담아 내보내는 상자 — 값은 그 블록이 만든다.
let _eightOut = null;
// ── ⓚ ★★[T152 2026-09-07] **기준선 한 줄** — 카드들이 각자 다른 문법으로 내던 열을 한 자리에 ──────
//   ㉮/㉯ 밀도(T133 문법) · 게시·깨진 약속(T142 문법) · `land.game` 최저·중앙(T146 문법 자리) ·
//   그리고 위 ⓐ 여덟 수. 이 한 줄이 다음 카드들이 견줄 기준선이다.
{
  const DEED = new Set(Events.DEED_TYPES || []);
  const B = S.byType || {};
  let vN = 0, dN = 0;
  for (const t of Events.TYPES) { const n = B[t] || 0; if (DEED.has(t)) dN += n; else vN += n; }
  const dens = (n) => (n > 0 ? (live * DAYS / n) : Infinity);
  // 생곡 — 밀·쌀·보리·기장 곳간 합(T73 이 만든 열 · 공통.md 기준선 표의 그 이름).
  const RAWGRAIN = ['wheat', 'rice', 'barley', 'millet'];
  const rawGrainStock = RAWGRAIN.reduce((a, r) => a + stockOf(r), 0);
  // ★[T277] 아래 JSON 이 **같은 값을 다시 계산하지 않게** 밖으로 내보낸다(사본 0 · 값 무변).
  //   `_eightOut` 은 읽기 전용 전달 상자다 — 이 블록이 이미 찍은 그 수 그대로를 담는다.
  _eightOut = { grain: +rawGrainStock.toFixed(1),
                densAll: +dens(S.emitted).toFixed(2), densValue: +dens(vN).toFixed(2),
                eventsValue: vN, eventsDeed: dN, eventsAll: S.emitted };
  const games = world.villages.filter((v) => (v.npcs || []).length > 0)
    .map((v) => +((v.land && v.land.game) || 0)).sort((a, b) => a - b);
  const gMin = games.length ? games[0] : null;
  const gMed = games.length ? games[games.length >> 1] : null;
  console.log(`\nⓚ [T152] 기준선 한 줄 — 시드 ${SEED} · ${DAYS}일 · 인구있는 마을 ${live}`);
  console.log(`  여덟 수   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand}`
    + ` · 게시 ${S.reqOpened} · 도구Q ${toolQ.toFixed(1)} · 보존식 ${presStock.toFixed(1)} · 생곡 ${rawGrainStock.toFixed(1)}`);
  console.log(`  밀도      ㉮ 전체 ${dens(S.emitted).toFixed(2)}일/건 · ㉯ 값 유형 ${dens(vN).toFixed(2)}일/건 (캐논 2~3일)`
    + `   [값 ${vN} · 일 ${dN} · 합 ${S.emitted}]`);
  console.log(`  약속      게시 ${S.reqOpened} · 철회 ${S.reqClosed} · 축소 ${S.reqShrunk}`
    + ` · 못갚아미게시 ${S.reqNoPay} · **깨진 약속(재검증철회) ${S.reqRevalidated}**`);
  // ★★[T152 실측 · 족보 (130)] 이 두 수는 **시딩값(정적)** 이다 — econ 랩은 `villages.js` 생활층
  //   하루 틱(`_lifeDaily`)을 **안 돈다.** T146 이 얹은 **동적** `land.game`(사냥으로 줄고 회복하는 그 값)은
  //   여기 안 잡힌다(T146 자신도 "3시드 A/B 전부 비트 동일 — econ 랩은 _lifeDaily 를 안 돈다"고 적었고,
  //   T152 가 `T146_GAME=0` 으로 되돌려도 JSON 이 비트 동일함을 재확인했다).
  //   ⇒ 동적 land.game 의 기준선은 **T146 계측기**에서 읽어라. 여기 수를 그 자리에 쓰면 틀린 근거가 된다.
  console.log(`  land.game(시딩값 · 정적) 최저 ${gMin == null ? '—' : gMin.toFixed(2)} · 중앙 ${gMed == null ? '—' : gMed.toFixed(2)}`
    + `   [바닥 ${require(path.join(__dirname, '..', 'server', 'livelihood')).FLOOR.game}]`);
  console.log(`            ⚠동적 land.game(T146)은 이 랩이 **안 돈다**(생활층 미실행 · 족보 130) — T146 계측기를 봐라.`);
}

// ── ⓛ ★★[T152] 석재 바닥의 나선 — **몇 곳이 칼날 위에 있나**(귀속만 · 구현 0) ─────────────
{
  console.log(`\nⓛ [T152] 석재 바닥 마을 — \`land.stone == FLOOR(${STONE_FLOOR})\` 전수`);
  if (!floorTrace.length) {
    console.log(`  이 시드엔 바닥 마을이 **0곳**이다(그래서 이 시드에선 그 궤적이 못 난다).`);
  } else {
    console.log('  ' + '마을'.padEnd(12) + 'land'.padStart(6) + '인구(끝/최고)'.padStart(14)
      + '돌 최저'.padStart(9) + '도구 최저'.padStart(10) + '돌<0.2 일수'.padStart(12)
      + '도구≈0 일수'.padStart(12) + '채집·석공(누적 인·일)'.padStart(22) + '  궤적');
    let onEdge = 0;
    for (let k = 0; k < floorTrace.length; k++) {
      const v = floorIdx[k][0], t = floorTrace[k];
      const now = (v.npcs || []).length;
      // ★"궤적 진입" 의 정의(이 표 안에서만 쓰는 말): 도구가 사실상 0 이던 날이 전체의 10% 를 넘고,
      //   그 판에서 인구가 최고점의 절반 밑으로 내려간 적이 있다 — T135 2판이 적은 그 고리의 관측 가능한 그림자.
      const spiral = (t.daysTool0 / Math.max(1, t.days) > 0.1) && (now < t.popMax * 0.5);
      if (spiral) onEdge++;
      console.log('  ' + String(t.name).padEnd(12) + t.land.toFixed(2).padStart(6)
        + `${now}/${t.popMax}`.padStart(14) + (isFinite(t.stoneMin) ? t.stoneMin.toFixed(2) : '—').padStart(9)
        + (isFinite(t.toolMin) ? t.toolMin.toFixed(2) : '—').padStart(10)
        + String(t.daysStone0).padStart(12) + String(t.daysTool0).padStart(12)
        + `${t.forDays}/${t.masonDays}`.padStart(22) + (spiral ? '  ★진입' : '  —'));
    }
    console.log(`  ⇒ **칼날 위 ${onEdge}곳 / 바닥 마을 ${floorTrace.length}곳**(인구있는 마을 ${live} 중).`);
  }
  console.log(`  ★산수(귀속): 바닥 마을 채집꾼의 돌 산출은 \`land.stone × 스킬 × MSY × 0.9\` = **0.225/인·일**(스킬 1 기준)이 상한이고,`);
  console.log(`    석공의 도구 한 배치가 \`_stCost = 0.2 × taper\`, 마제석검 한 자루가 **0.5** 다(economy-sim.js:2152·2178).`);
  console.log(`    ⇒ 바닥 마을에선 채집꾼 하나가 석공 하나를 겨우 먹인다 — 전사 무장이 한 번 끼면 그 자리에서 0 이 된다.`);
  console.log(`    STONE_NET 은 **부르는 사람**은 맞게 부른다(게이트 \`land.stone >= 0.25\` 가 바닥을 포함하도록 \`>\`→\`>=\` 로 고쳐져 있다).`);
  console.log(`    못 잡는 것은 **흐름의 굵기**다 — 바닥 마을은 그 안전망이 여는 관이 세계에서 가장 가늘다.`);
}

if (process.env.T17_JSON) {
  const out = {
    seed: SEED, days: DAYS, villages: seeds.length, live,
    axes: { tool: process.env.T17_TOOL !== '0', preserve: process.env.T17_PRESERVE !== '0', salt: process.env.T17_SALT !== '0' },
    fdDeadTot: world.villages.reduce((a, v) => a + (v._fdDeadTot || 0), 0), // [B전쟁] 사망 누계와 실제 기아 사망을 구분
    base: { pop, dead, ever, weapQ: +weapQ.toFixed(0), expand, trades: world.tradeLog.length },
    //   ★[T256 관측 항 · T277 에서 정식화] 마을별 끝 인구 — 짝 Δ 의 부분집합(작은/큰 17곳 · `<20명` 꼬리)과
    //     홀드아웃을 **같은 판에서** 읽으려고 더한다. 계측기를 두 벌 돌리면 기계 시간이 두 배다(30판 → 60판).
    //     ⚠관측만이다 — 세계에 아무것도 안 넣는다(여덟 수 비트 동일 · 보고/T277 §1).
    //     ⚠꼬리 집합은 **기준 팔(A)로 뽑아야 한다**(족보 204) — 뽑는 쪽에서 지킨다(`scripts/t17-seeds.js`).
    vpop: world.villages.map((v) => ({ name: v.name, pop: v.npcs.length })),
    //   ★[T277] 여덟 수 중 JSON 에 없던 셋 — 생곡 · 밀도 ㉮㉯. ⓚ 블록이 **이미 만든 값**을 그대로 담는다(사본 0).
    eight: _eightOut,
    board: { reqOpened: S.reqOpened, reqClosed: S.reqClosed, emitted: S.emitted, daysPer: +daysPer.toFixed(2) },
    short: Object.fromEntries(topOf(shortByItem, 30)), glut: Object.fromEntries(topOf(glutByItem, 30)),
    tool: { stock: +toolStock.toFixed(1), q: +toolQ.toFixed(1), short: shortByItem.get('tool') || 0 },
    preserve: { stock: +presStock.toFixed(1), trades: presTrades, amt: +presAmt.toFixed(1),
                each: Object.fromEntries(PRESERVED.map((r) => [r, +stockOf(r).toFixed(1)])) },
    msy: (() => {
      const on = !!econ.T17_MSY;   // ★[T923] 켬 기본 — 엔진의 손잡이를 읽는다(되돌림 `T17_MSY=0`)
      let fv = 0, fpop = 0, fstock = 0, fp = 0, fpN = 0, capped = 0;
      const fishers = world.villages.reduce((a, v) => a + ((v.counts && v.counts.fisher) || 0), 0);
      for (const v of world.villages) {
        if (!(v.npcs || []).length) continue;
        if (v.land && v.land.fishSustain != null) capped++;
        if (!(((v.counts && v.counts.fisher) || 0) > 0)) continue;
        fv++; fpop += v.npcs.length; fstock += v.storage.fish || 0;
        try { const p = (econV2.computeShadowPrices(v) || {}).fish; if (p != null) { fp += p; fpN++; } } catch (e) {}
      }
      return { on, capped, fishVillages: fv, fishPop: fpop, fishers, fishStock: +fstock.toFixed(1), fishPrice: fpN ? +(fp / fpN).toFixed(4) : null };
    })(),
    fish: (() => {
      const rows = [];
      for (const v of world.villages) {
        if (!(v.npcs || []).length) continue;
        const raw = +(v._fishRawLast || 0), cap = (v.land && v.land.fishSustain != null) ? +v.land.fishSustain : null;
        if (raw > 0) rows.push({ name: v.name, fishers: (v.counts && v.counts.fisher) || 0, raw: +raw.toFixed(2), cap, ratio: cap != null ? +(cap / raw).toFixed(3) : null });
      }
      const rs = rows.filter((r) => r.ratio != null).map((r) => r.ratio).sort((a, b) => a - b);
      return { mode: SUS.MSY_MODE, headroom: SUS.MSY_HEADROOM, capOn: !!econ.T17_MSY,
               n: rows.length, ratioMin: rs[0] ?? null, ratioMed: rs.length ? rs[Math.floor(rs.length / 2)] : null,
               ratioMax: rs.length ? rs[rs.length - 1] : null, binding: rs.filter((x) => x < 1).length, rows: rows.slice(0, 20) };
    })(),
    salt: { coastStock: +cS.toFixed(1), inlandStock: +iS.toFixed(1), coastN: cN, inlandN: iN,
            coastPrice: +cAvg.toFixed(4), inlandPrice: +iAvg.toFixed(4),
            gap: cAvg > 0 ? +(iAvg / cAvg).toFixed(3) : null, trades: saltTrades, amt: +saltAmt.toFixed(1) },
  };
  fs.writeFileSync(process.env.T17_JSON, JSON.stringify(out, null, 2));
  console.log(`\n  JSON: ${process.env.T17_JSON}`);
}
try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
