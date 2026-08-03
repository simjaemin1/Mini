#!/usr/bin/env node
// === scripts/test-village-found.js — 마을 건립 + **식량이 사람을 부른다** 하네스 ==========
//
// ★★[2026-08-03e 배치 12 ①②] 재민 확정 (마):
//   *"플레이어가 농사지어서 식량 확보하면 그냥 늘어나는 거 아냐?"*
//   회부 문서의 (가)~(라)는 전부 **새 기구를 만드는 안**이었다. 답은 다섯째 — 있는 기구
//   (`tickRecovery`, 식량 ≥ N×15 자연회복)를 **인구 0 플레이어 마을까지** 넓힌다. 새 상수 0.
//
// ★이 하네스가 증명해야 하는 것 넷:
//   ① **선물이 없다** — `initialPop: 0` 창설은 곳간이 진짜로 비어 있다(종전 `|| 8` 폴백이 이걸 깼다).
//   ② **세 궤적** — (a)빈 곳간=영영 0·소멸 아님 (b)식량 15+=첫 주민→성장 (c)식량 끊김=아사→소멸(P) 1
//   ③ **NPC 경로 비트 동일** — `founder == null` 인 마을에 대해 문턱 산술이 완전히 같다
//   ④ **건립 계약** — `foundPlayerVillage` 가 자리·상한·터를 실제로 판정하고 econ·DB 에 등록한다
//
// ⚠검사 상황이 실제로 그 코드를 밟는지 assert 한다(검증 원칙 — 자명한 통과 금지):
//   `tickRecovery` 는 `day % 50 === 0 && day >= 100` 에서만 돈다. 그 창을 실제로 밟았는지 먼저 건다.
//
// 실행: node scripts/test-village-found.js   (econ 만 — ④는 지형까지, 실서버 부팅 없음)
'use strict';
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));

const _log = console.log;
let quiet = true;
console.log = (...a) => { if (!quiet) _log(...a); };
console.warn = () => {};
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const v2 = R('sim/economy-sim-v2');
const P = R('server/villages').__labProbe;
quiet = false; console.log = _log;

const say = (...a) => _log(...a);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; say((c ? '  ✓ ' : '  ✗ ') + m); };

say('=== 마을 건립 · 식량 유입 하네스 (배치 12 ①②) ===');

// 랩 세계 하나 — 본 게임과 같은 조립(사본 금지)
const mkWorld = () => {
  const w = v2.createWorldV2({ seed: 1020, villageCount: 1, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  w.villages = []; w.events = []; w.day = 0;
  return w;
};
const LAND = { fertility: 1.2, water: 0.6, wood: 1.0, stone: 1.0, ore: 0.4, game: 0.6, size: 50, arable: 0.9 };
const mkPlayerV = (world, name, food) => {
  const v = econ.createVillage({ ...LAND, initialPop: 0, name, bornDay: 0, founder: 'pid_player' });
  v._world = world; v.coord = { x: 100, y: 100 };
  if (food) v.storage.food = food;
  world.villages.push(v);
  return v;
};

// ── ① 선물이 없다 ────────────────────────────────────────────────────────────
say('\n[① 인구 0 창설 = 빈 터 — 초기 부존이 한 톨도 없다]');
{
  const npcV = econ.createVillage({ ...LAND, name: 'NPC마을' });                       // 기본 8명
  const pV = econ.createVillage({ ...LAND, initialPop: 0, name: '빈터', founder: 'p1' });
  ok(npcV.npcs.length === 8, `★NPC 창설은 종전대로 8명 — ${npcV.npcs.length} (검사가 자명하게 통과하지 않는다)`);
  ok(npcV.storage.food > 0 && npcV.storage.tool > 0, `★NPC 창설은 종전대로 부존을 받는다 — 식량 ${npcV.storage.food} 도구 ${npcV.storage.tool}`);
  ok(pV.npcs.length === 0, `인구 0 으로 태어난다 — ${pV.npcs.length}명`);
  const grants = ['food', 'tool', 'clothes', 'wood', 'stone', 'ore', 'herb', 'weapon'];
  const given = grants.filter((r) => (pV.storage[r] || 0) > 0);
  ok(given.length === 0, `★초기 부존 0 — 준 것: ${given.length ? given.map((r) => `${r} ${pV.storage[r]}`).join(' · ') : '없음'} (종전 \`|| 8\` 폴백이면 여기서 8명분이 나온다)`);
  ok(pV.founder === 'p1' && pV._everPop === 0, `창설자 기록 + everPop=0 (아직 아무도 안 살았다)`);
  ok(npcV._everPop === 1, 'NPC 마을은 everPop=1 — 소멸 판정이 종전과 완전히 같다');
}

// ── ②-a 빈 곳간 = 영영 0, 그리고 **소멸이 아니다** ────────────────────────────
say('\n[②-a 식량 0 빈 터 — 영영 0 이고 소멸로 세지 않는다]');
{
  const w = mkWorld();
  const v = mkPlayerV(w, '빈터', 0);
  let windows = 0;
  for (let d = 1; d <= 400; d++) { w.day = d; if (d % 50 === 0 && d >= 100) windows++; v2.tickRecovery(w, d); }
  ok(windows === 7, `★회복 창을 실제로 밟았다 — ${windows}회(day 100·150·…·400). 0 이면 이 검사는 자명하다`);
  ok(v.npcs.length === 0, `400일 내내 인구 0 — ${v.npcs.length}명 (식량이 없으면 아무도 안 온다)`);
  ok(v._everPop === 0, '★everPop=0 — 지표는 이 마을을 **소멸로 세지 않는다**(빈 터 ≠ 소멸)');
}

// ── ②-b 식량 15 → 첫 주민 → 성장 ─────────────────────────────────────────────
say('\n[②-b 식량이 사람을 부른다 — 15 에서 첫 주민, 이후 기존 규칙 그대로]');
{
  const w = mkWorld();
  const v = mkPlayerV(w, '농사터', 0);
  // 문턱 바로 아래에서는 안 온다(경계 검사 — 문턱이 진짜로 걸리는지)
  v.storage.food = v2.recoveryFoodThreshold(v) - 0.01;
  w.day = 100; v2.tickRecovery(w, 100);
  ok(v.npcs.length === 0, `문턱 바로 아래(${v.storage.food.toFixed(2)})면 안 온다 — ${v.npcs.length}명`);
  // 문턱을 넘기면 온다
  v.storage.food = 15;
  ok(v2.recoveryFoodThreshold(v) === 15, `★인구 0 문턱 = 15 (=1인분×15, 새 상수 아님) — 정본 함수가 ${v2.recoveryFoodThreshold(v)}`);
  // ★"곳간의 식량"은 곡식만이 아니다 — 정본은 `totalFoodEquivalent`(생선·고기·요리·채집물 환산).
  //   실클라 E2E 가 잡았다: 플레이어가 농사·채집으로 얻는 건 베리(→`fruit`)라 곡식이 0 이고,
  //   곡식만 세면 곳간을 가득 채워도 사람이 영영 안 온다.
  { const f = econ.createVillage({ ...LAND, initialPop: 0, name: '과일터', founder: 'p2' });
    f.storage.food = 0; f.storage.fruit = 60;
    ok(v2.recoveryFoodHave(f) > 0, `★곡식 0 · 과일 60 이어도 식량 환산은 ${v2.recoveryFoodHave(f).toFixed(1)} (정본 totalFoodEquivalent)`);
    ok(v2.recoveryFoodHave(f) >= v2.recoveryFoodThreshold(f), '  그 환산이 문턱을 넘는다 — 베리만 캐도 마을이 선다'); }
  w.day = 150; v2.tickRecovery(w, 150);
  ok(v.npcs.length === 1, `★첫 주민이 깃든다 — ${v.npcs.length}명 (${v.npcs[0] && v.npcs[0].currentJob})`);
  ok(v._everPop === 1, 'everPop=1 로 바뀐다 — 이제부터는 0 이 되면 진짜 소멸이다');
  ok(v2.recoveryFoodThreshold(v) === 15, `이후 문턱은 기존 규칙 그대로 N×15 = ${v2.recoveryFoodThreshold(v)} (인구 1 → 1인분. 인구 0 의 하한 1 과 값이 같아지는 것이 곧 '문턱을 새로 만들지 않았다'는 증거다)`);
  // 이후 성장 — 식량을 계속 대면 기존 회복 규칙대로 는다
  for (let d = 151; d <= 400; d++) { w.day = d; v.storage.food = Math.max(v.storage.food, 200); v2.tickRecovery(w, d); }
  ok(v.npcs.length >= 4, `★식량을 대면 기존 규칙대로 자란다 — ${v.npcs.length}명 (회복 상한 5명 직전까지)`);
  ok(v.npcs.length <= 5, `회복 기구의 상한(5명)은 그대로 — ${v.npcs.length}명. 그 위는 로지스틱 성장의 몫이다`);
}

// ── ②-c 식량이 끊기면 죽는다 — 소멸(P) 1 ────────────────────────────────────
say('\n[②-c 필멸 — 식량이 끊기면 죽고, 그때는 소멸(P) 로 센다]');
{
  const w = mkWorld();
  const v = mkPlayerV(w, '망할터', 200);
  w.day = 100; v2.tickRecovery(w, 100);
  ok(v.npcs.length === 1 && v._everPop === 1, `첫 주민 확보 — ${v.npcs.length}명 (이 검사의 전제)`);
  // 곳간을 비우고 굶긴다 — 보호막은 플레이어 마을에 안 걸린다(배치 11 필멸 배선)
  for (const r in v.storage) v.storage[r] = 0;
  v.land.fertility = 0.1; v.land.water = 0.05; v.land.game = 0.05; v.land.arable = 0.05;
  for (let d = 101; d <= 1200 && v.npcs.length > 0; d++) { w.day = d; v2.tickWorldV2(w); for (const r in v.storage) v.storage[r] = 0; }
  ok(v.npcs.length === 0, `★굶으면 죽는다 — 최종 ${v.npcs.length}명 (플레이어 마을은 불멸이 아니다)`);
  ok(v._everPop === 1, '★everPop=1 이 남는다 — 이 마을은 **소멸(P) 로 센다**(빈 터와 구분된다)');
  // 지표 판정식 그대로 재현(ab-summary·econ-regress 와 같은 잣대)
  const isExtinctP = !!(v.founder && v._everPop && v.npcs.length === 0);
  ok(isExtinctP === true, '지표 판정식 재현: founder && everPop && pop==0 → 소멸(P) 1');
}

// ── ②-d 빈 터는 **교역 상대가 아니다** ──────────────────────────────────────
say('\n[②-d 아무도 안 사는 터에는 캐러밴이 안 간다 — 없는 물건을 사 가면 곳간이 마이너스가 된다]');
{
  const w = mkWorld();
  //   부자 NPC 마을 둘 + 인구 0 플레이어 터 하나. 인구 0 터는 목적지 후보에서 빠져야 한다.
  const rich = [0, 1].map((i) => {
    const v = econ.createVillage({ ...LAND, initialPop: 20, name: '부자' + i });
    v._world = w; v.coord = { x: 100 + i * 8, y: 100 };
    for (const r of ['food', 'wood', 'stone', 'tool', 'fish']) v.storage[r] = 5000;
    w.villages.push(v); return v;
  });
  const empty = mkPlayerV(w, '빈터교역', 0);
  empty.coord = { x: 104, y: 100 };            // 두 부자 마을 사이 — 거리로는 최우선 후보다
  const before = { ...empty.storage };
  for (let d = 1; d <= 200; d++) { w.day = d; v2.tickWorldV2(w); }
  ok(rich[0].tradeStats.caravansSent + rich[1].tradeStats.caravansSent > 0,
    `★검사 전제 — 교역이 실제로 일어났다(캐러밴 ${rich[0].tradeStats.caravansSent + rich[1].tradeStats.caravansSent}회). 0 이면 이 검사는 자명하다`);
  let neg = 0; for (const r in empty.storage) if (empty.storage[r] < -0.001) neg++;
  ok(neg === 0, `★빈 터의 곳간에 **음수가 없다** — 음수 항목 ${neg}개 (종전엔 식량 환산이 −69.3 까지 내려갔다)`);
  { const moved = [];
    for (const r of new Set([...Object.keys(before), ...Object.keys(empty.storage)])) {
      const d = (empty.storage[r] || 0) - (before[r] || 0);
      if (Math.abs(d) > 0.001) moved.push(`${r} ${d.toFixed(2)}`);
    }
    ok(moved.length === 0, `빈 터의 곳간이 교역으로 전혀 안 건드려졌다 — 변동 ${moved.length ? moved.join(' · ') : '없음'}`); }
}

// ── ②-e 부패는 있는 것보다 많이 못 썩는다 — 곳간 음수의 진범 회귀 가드 ──────
//   [2026-08-03e 재민 검증 세션] E2E 의 "곳간 음수 −45~−69"의 원인은 tickDecay 의 무클램프
//   과잉재고 가속(rate>1 → s×(1−rate)<0)이었다. ②-d 가 이걸 못 잡은 이유는 빈 터에 **재고를
//   안 넣어서**다(s≤0 은 부패 루프를 건너뛴다 — "자명한 상황을 골라 조용히 통과"의 재발).
//   여기서는 인구 0 마을에 큰 재고를 실제로 넣어 그 갈래를 밟는다.
say('\n[②-e 창설 대기 곳간은 가속 부패 면제 · 부패는 어떤 경우에도 음수를 못 만든다]');
{
  // (1) 창설 대기(founder && 인구 0): excess 면제 — 기본 부패만. 문턱 15 가 회복 창까지 산다.
  const w = mkWorld();
  const pv = mkPlayerV(w, '과잉곳간', 0);
  pv.coord = { x: 300, y: 300 };
  pv.storage.fruit = 202.43;                      // ★probe 실측 재현값 — 종전엔 다음 부패에서 −103.68
  const s0 = pv.storage.fruit;
  let negDays = 0;
  for (let d = 1; d <= 60; d++) {
    w.day = d; v2.tickWorldV2(w);
    if ((pv.storage.fruit || 0) < -0.001) negDays++;
  }
  ok(negDays === 0, `창설 대기 곳간에 음수 없음 — 음수였던 날 ${negDays}일 (종전 202.43→−103.68)`);
  ok((pv.storage.fruit || 0) > s0 * 0.8, `★창설 대기 비축은 가속 없이 천천히 썩는다 — 60일 뒤 ${(pv.storage.fruit || 0).toFixed(1)} > 투입의 80% (면제 전엔 하루 95%씩 사라져 회복 창을 못 버텼다)`);
  // (2) 사람이 서면(인구 1) 가속이 **복귀**한다 — 그리고 rate 클램프 덕에 그래도 음수는 없다.
  const w2 = mkWorld();
  const pv2 = mkPlayerV(w2, '과잉곳간2', 0);
  pv2.coord = { x: 320, y: 300 };
  pv2.storage.food = 15;                          // 정본 경로로 첫 주민을 세운다(회복 창)
  w2.day = 100; v2.tickRecovery(w2, 100);
  ok(pv2.npcs.length >= 1, `검사 준비 — 첫 주민이 섰다(${pv2.npcs.length}명). 창설 대기 종료`);
  pv2.storage.fruit = 202.43;
  let neg2 = 0, min2 = pv2.storage.fruit;
  for (let d = 1; d <= 30; d++) {
    w2.day = d; v2.tickWorldV2(w2);
    const s = pv2.storage.fruit || 0;
    if (s < -0.001) neg2++;
    if (s < min2) min2 = s;
  }
  ok(neg2 === 0, `인구 1 마을 과잉재고도 음수 없음 — rate 클램프(0.95) (종전 무클램프면 첫 부패에서 −103.68)`);
  ok(min2 < s0 * 0.5, `★검사 전제 — 인구가 서면 가속 부패가 실제로 복귀한다(30일 내 최저 ${min2.toFixed(1)} < 투입 절반). 아니면 클램프 검사가 자명하다`);
}

// ── ③ NPC 경로 비트 동일 ─────────────────────────────────────────────────────
say('\n[③ NPC 경로(founder == null) 는 한 비트도 안 바뀐다]');
{
  // (a) 문턱 산술 — N ≥ 1 에서 Math.max(1,N)×15 === N×15
  let same = 0, diff = 0;
  for (let n = 1; n <= 40; n++) {
    const fake = { npcs: new Array(n).fill(0) };
    if (v2.recoveryFoodThreshold(fake) === n * 15) same++; else diff++;
  }
  ok(diff === 0 && same === 40, `★N=1..40 전부 종전 식(N×15)과 동일 — 일치 ${same} / 불일치 ${diff}`);
  // (b) 인구 0 NPC 마을(=소멸한 마을)은 여전히 회복 대상이 아니다
  const w = mkWorld();
  const dead = econ.createVillage({ ...LAND, name: '소멸NPC' });
  dead._world = w; dead.coord = { x: 200, y: 200 };
  dead.npcs.length = 0; dead.counts = {}; dead.storage.food = 100000;   // 식량은 넘치는데
  w.villages.push(dead);
  for (let d = 100; d <= 500; d += 50) { w.day = d; v2.tickRecovery(w, d); }
  ok(dead.storage.food > 15, `★검사 전제 — 이 마을 곳간엔 식량이 ${dead.storage.food} 있다(문턱 미달로 자명 통과하지 않는다)`);
  ok(dead.npcs.length === 0, '★식량이 넘쳐도 인구 0 NPC 마을은 되살아나지 않는다 — 소멸은 소멸이다');
  // (c) 그런데 같은 조건의 **플레이어** 마을은 되살아난다 — 두 경로가 실제로 갈린다
  const pv = mkPlayerV(w, '플레이어터', 100000);
  w.day = 550; v2.tickRecovery(w, 550);
  ok(pv.npcs.length === 1, `★같은 조건에서 플레이어 마을만 사람이 온다 — ${pv.npcs.length}명 (분기가 실재한다)`);
}

// ── ④ 건립 계약 — 실지형에서 자리·터·등록 ────────────────────────────────────
say('\n[④ 건립 계약 — **배선 검사**(실동작은 실클라 E2E `e2e-village.js` 가 잰다)]');
{
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');
  ok(/initialPop: 0/.test(src) && /founder/.test(src), '건립은 `initialPop: 0` + `founder` 로 econ 을 만든다(선물 없음)');
  ok(/state\.distDirty = true;/.test(src.slice(src.indexOf('function foundPlayerVillage'), src.indexOf('function foundPlayerVillage') + 6000)),
    '★건립은 거리행렬을 **그 자리에서 돌리지 않는다** — 기존 지연 경로(distDirty·게임일 경계)에 얹는다(실측: 즉시 계산 시 서버 10.5초 정지)');
  ok(/incrementalFrom: _k/.test(src), '지연 재계산은 **증분**으로 돈다(마을이 늘어난 경우) — 지형이 바뀐 경우엔 `_distIncrFrom` 이 −1 이라 전쌍');
  ok(/state\._distIncrFrom = -1;/.test(src.slice(src.indexOf('function invalidateTradeDistances'), src.indexOf('function invalidateTradeDistances') + 800)),
    '★지형이 바뀌면 증분을 취소한다 — 옛 쌍도 썩으므로 전쌍으로 돌린다(썩은 값 재사용 금지)');
  ok(/state\._distBlk/.test(src), '★코스 격자 메모를 호출 간에 캐시한다(캐러밴 A* 격자와 동형·같은 무효화 훅) — 하네스 실측 41,088ms → 1,584ms');
  ok(!/materializeVillageStructures\(db, \{ dbId/.test(src), '큰집(8×8)을 새로 짓지 않는다 — 플레이어가 세운 회관이 그 마을의 회관이다');
  const zsrc = require('fs').readFileSync(path.join(__dirname, '..', 'server', 'zone.js'), 'utf8');
  ok(/siteType: 'village_site', doneType: 'village_hall'/.test(zsrc), '회관은 노·숯가마와 **같은 계약**(`_siteStart`/`_siteAdvance`)을 쓴다 — 새 기구 0');
  ok(/spec\.onDone/.test(zsrc), '완공 훅 하나만 더 걸었다(노·숯가마는 훅이 없어 동작 불변)');
  ok(/dryRun: true/.test(zsrc), '★착공 **전에** 자리를 판정한다 — 3단계를 다 짓고 나서 거절하면 재료를 삼키는 것이다');
  ok(/_furnaceCanUse\(player, b\)/.test(zsrc.slice(zsrc.indexOf('function tryVillageInventory'))), '재고 열람 권한은 노·숯가마와 **같은 술어**를 쓴다 — 새 권한 개념 0');
  ok(!/_cash/.test(zsrc.slice(zsrc.indexOf('function tryVillageInventory'), zsrc.indexOf('function tryVillageInventory') + 1200)), '★재고 응답에 `_cash` 가 없다(장부이지 재화가 아니다)');
  const vsrc = src.slice(src.indexOf('function playerVillageInventory'));
  ok(/charCodeAt\(0\) === 95/.test(vsrc), '`_` 로 시작하는 내부 필드는 통째로 제외 — `_cash` 가 새 나갈 경로가 없다');
  ok(/recoveryFoodThreshold/.test(vsrc), '★"다음 주민" 문턱은 엔진 정본 함수를 부른다(화면에 숫자를 다시 쓰지 않는다 — 사본 금지)');
}

say(`\n=== 마을 건립 하네스: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
process.exit(fail ? 1 : 0);
