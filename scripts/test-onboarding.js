#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-onboarding.js — 온보딩 v2 서버 계약 ===========================
//
// ★설계 정본: `설계_게임성_사건레이어_TODO.md` §9 [재민 확정 2026-08-25] ·
//   실행 지시 [재민 확정 2026-09-01]. 구현 정본은 `server/onboarding.js`.
//
// ★★이 하네스가 재는 것 — 순서가 곧 대본이다
//   ① **도착 지점 51마을 전수**: 물·바위 위가 아니고, 마을 중심까지 **실제로 걸어갈 수 있다**.
//   ② 결정론: 같은 지도면 같은 자리다(§9.2 "캐릭터는 발생하지 않고 도착한다").
//   ③ 나루터와 길목이 실제로 갈린다(둘 다 0이면 '유도'가 아니라 상수다).
//   ④ 마을 성격: **입지계수**가 절대 수 방식과 다른 답을 낸다(자명 통과 금지).
//   ⑤ 첫 의뢰: **게시판 생성기가 실제로 낸 의뢰**에서만 고른다 · 먹을 것 보상 우선.
//   ⑥ 빈터 권리 게이트: N회 미만 거절 · 이후 허용 · 구역 밖 거절.
//   ⑦ 재접속(=DB 왕복) 후 대본 상태 보존.
//   ⑧ ★검사기 자가 검사 — 일부러 물 위 좌표를 넣으면 ①이 잡는가.
//
// ★★왜 랩이 아니라 **실지도**인가: 도착 지점은 지형의 함수다. 평지 픽스처에서 통과하는 산출은
//   아무것도 증명하지 못한다. 그래서 `scripts/ev-density.js` 와 **같은 조립 순서·같은 정본 함수**로
//   실지도 51곳을 세우고(사본 아님 — 같은 `__labProbe` 를 부른다) 그 위에서 잰다.
//
// 실행: node scripts/test-onboarding.js
//   ONB_MAX=<n>  마을 수 제한(기본 0=전수 51). ★기본은 **전수**다 — 규약(전수 게이트는 전수로).
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/onb-test-${process.pid}.db`;

const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const Events = R('server/events');
const Onb = R('server/onboarding');
const P = Villages.__labProbe;
const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;
const MAX = parseInt(process.env.ONB_MAX || '0', 10) || 0;
const DAYS = parseInt(process.env.ONB_DAYS || '150', 10);

// ── 실지도 조립 — `ev-density.js` 와 같은 순서·같은 정본 함수 ────────────────
P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });

console.log('\n=== 온보딩 v2 서버 계약 ===');
const t0 = Date.now();
const hard = T.getZoneVillages(Z) || [];
const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
const seeds = [];
for (const hv of picked) {
  if (MAX && seeds.length >= MAX) break;
  const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
  if (!c) continue;
  let layout;
  try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); }
  catch (e) { continue; }
  seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, layout, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout) });
}
const buildMs = Date.now() - t0;

// `clientVillages()` 와 **같은 모양**으로 맞춘다 — 라이브가 먹는 것과 같은 입력이어야 의미가 있다.
//   경계는 `terr`(레이아웃 원본 영토)로 넘긴다: `onboarding.js` 가 4방 판정으로 어귀 링을 뽑는다.
const list = seeds.map((s, i) => ({ id: i + 1, name: s.name, cx: s.ccx, cy: s.ccy,
  pop: P.INITIAL_POP, r: 0, terr: s.layout.territory }));

console.log(`\n⓪ 검사 상황 — 무엇을 재고 있나`);
ok(list.length >= 40, `실지도 마을 ${list.length}곳 조립 (${(buildMs / 1000).toFixed(1)}초)`, MAX ? `ONB_MAX=${MAX}` : '전수');
{
  // ★"평지 픽스처가 아니다"를 먼저 못 박는다 — 지형이 없으면 아래 전부가 자명 통과다.
  let water = 0, rock = 0, sample = 0;
  for (const v of list) for (let d = -20; d <= 20; d += 4) { sample += 2;
    if (ta.isWater(v.cx + d, v.cy)) water++; if (ta.isBlocked(v.cx, v.cy + d) && !ta.isWater(v.cx, v.cy + d)) rock++; }
  ok(water > 0 && sample > 0, `지형이 실지도다 — 마을 주변 표본 ${sample}칸 중 물 ${water} · 바위 ${rock}`);
}

// ── ① 도착 지점 전수 ─────────────────────────────────────────────────────────
console.log(`\n① 도착 지점 — ${list.length}마을 전수`);
const tA = Date.now();
const arr = Onb.__probe.computeArrivals(list, ta);
const arrMs = Date.now() - tA;
ok(arr.size === list.length, `모든 마을이 도착 지점을 가졌다 (${arr.size}/${list.length} · ${(arrMs / 1000).toFixed(1)}초)`);
{
  const blocked = [], unreach = [], tooNear = [], outOfZone = [];
  for (const v of list) {
    const a = arr.get(v.id); if (!a) continue;
    if (ta.isBlocked(a.cx, a.cy)) blocked.push(v.name);
    if (!Onb.__probe.reaches(ta, a.cx, a.cy, v.cx, v.cy)) unreach.push(v.name);
    if (Math.hypot(a.cx - v.cx, a.cy - v.cy) < 8) tooNear.push(v.name);   // ★8셀(256px) = "걸어 들어간다"의 최소 — 전수 검사가 물가 취락 3곳을 여기서 잡았다(2026-09-01)
    if (a.x < 0 || a.y < 0 || a.x >= ZONE.zoneWidth || a.y >= ZONE.zoneHeight) outOfZone.push(v.name);
  }
  ok(blocked.length === 0, `물·바위 위가 아니다 (막힌 곳 ${blocked.length})`, blocked.slice(0, 5).join(' '));
  ok(unreach.length === 0, `마을 중심까지 걸어갈 수 있다 (도달 불가 ${unreach.length})`, unreach.slice(0, 5).join(' '));
  ok(outOfZone.length === 0, `존 안이다 (밖 ${outOfZone.length})`, outOfZone.slice(0, 5).join(' '));
  ok(tooNear.length === 0, `마을 한복판이 아니다 — 걸어 들어갈 거리가 있다 (8셀 미만 ${tooNear.length})`, tooNear.slice(0, 5).join(' '));
  const ds = [...arr.values()].map((a) => { const v = list.find((x) => x.id === a.vid); return Math.hypot(a.cx - v.cx, a.cy - v.cy); }).sort((x, y) => x - y);
  console.log(`    중심까지 거리(셀) 최소 ${ds[0].toFixed(0)} · 중앙 ${ds[Math.floor(ds.length / 2)].toFixed(0)} · 최대 ${ds[ds.length - 1].toFixed(0)}`);
}

// ── ② 결정론 ────────────────────────────────────────────────────────────────
console.log('\n② 결정론 — 같은 지도면 같은 자리');
{
  const arr2 = Onb.__probe.computeArrivals(list, ta);
  let diff = 0;
  for (const [vid, a] of arr) { const b = arr2.get(vid); if (!b || b.cx !== a.cx || b.cy !== a.cy) diff++; }
  ok(diff === 0, `두 번 산출해 같은 좌표 (${arr.size - diff}/${arr.size})`);
}

// ── ③ 나루터 · 길목이 갈린다 ────────────────────────────────────────────────
console.log('\n③ 물가 마을은 물가로, 내륙은 길목으로');
{
  const kinds = {};
  for (const a of arr.values()) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
  ok((kinds.dock || 0) > 0, `나루터 ${kinds.dock || 0}곳`, JSON.stringify(kinds));
  ok((kinds.dock || 0) < arr.size, `전부 나루터는 아니다 — 내륙은 다른 방향으로 나간다`, JSON.stringify(kinds));
  // ★나루터라면 **실제로 물 옆**이어야 한다(이름만 나루터면 그건 상수다)
  let far = 0, dockN = 0;
  for (const a of arr.values()) {
    if (a.kind !== 'dock') continue; dockN++;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (ta.isWater(a.cx + dx, a.cy + dy)) { near = true; break; }
    if (!near) far++;
  }
  ok(dockN > 0 && far === 0, `나루터는 실제로 물가에 있다 (물에서 2셀 넘게 떨어진 곳 ${far}/${dockN})`);
}

// ── ④ 마을 성격 — 입지계수 ──────────────────────────────────────────────────
console.log('\n④ 마을 성격 — 절대 수가 아니라 두드러짐(입지계수)');
{
  // 실측에서 나온 모양 그대로의 표본: 어느 마을이든 농부가 제일 많다.
  const A = { hunter: 28, mason: 1, forager: 2 };                          // 사냥꾼 마을
  const B = { farmer: 47, fisher: 33, hunter: 1, lumberjack: 6, mason: 6, forager: 39 };  // 어부가 두드러진 마을
  const C = { farmer: 27, fisher: 8, hunter: 2, lumberjack: 4, miner: 2, mason: 3, forager: 4 };
  const W = Onb.worldSectors([A, B, C]);
  const got = [Onb.characterOf(A, W).key, Onb.characterOf(B, W).key, Onb.characterOf(C, W).key];
  ok(got.join(',') === 'mining,fishing,farming', `세 갈래가 다 나온다`, got.join(' '));
  // ★자명 통과 금지 — 절대 수로 고르면 B 는 '농촌'이 된다. 두 방식이 **다른 답**을 내야 지표가 산다.
  const naive = Onb.characterOf(B, null).key;
  ok(naive === 'farming' && got[1] === 'fishing', `절대 수 방식과 답이 다르다 (절대=${naive} · 입지계수=${got[1]})`);
  // 실지도에서도 한 갈래로 몰리지 않는가(econ 을 돌린 뒤 ⑤에서 다시 본다)
}

// ── econ 세계 — 게시판이 실제로 의뢰를 내야 ⑤가 성립한다 ────────────────────
console.log(`\n⑤ 첫 의뢰 — 생성기가 실제로 낸 의뢰에서만 고른다 (econ ${DAYS}일)`);
const world = econV2.createWorldV2({ seed: 1020, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;
const depositMap = Villages.playerVillageDepositMap();
const L = Events.createLedger({ econV2, vidOf: (v, i) => i + 1, depositMap });
L.prime(world);
{
  const _log = console.log; console.log = () => {};
  for (let d = 0; d < DAYS; d++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); }
  console.log = _log;
}

// ── Onboarding 호스트 주입 — 라이브와 **같은 함수**를 밟게 한다 ──────────────
const { DatabaseSync } = require('node:sqlite');
const TDB = `/tmp/onb-state-${process.pid}.db`;
for (const f of [TDB, TDB + '-wal', TDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
const sdb = new DatabaseSync(TDB);
const FOOD = new Set(['berry', 'herb', 'meat_raw', 'meat_cooked', 'berry_jam', 'food', 'food_cooked', 'fish_cooked',
  'dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg']);
const fakePlayers = new Map();
const sent = [];
Onb.init({
  SimVillages: { eventLedger: L, __labProbe: P, clientVillages: () => list,
    lifeDebug: () => ({ villages: world.villages.map((v, i) => ({ name: v.name, econCounts: v.counts })) }) },
  terrain: T, ZONE, ZONE_ID: Z, db: sdb, players: fakePlayers, Events,
  send: (ws, m) => sent.push(m),
  isTerrainBlockedLocal, isWaterTileLocal, isSeaTileLocal: () => false,
  foodItems: FOOD, gameDay: () => world.day | 0,
  warm: false,   // ★굽기는 이 하네스가 위에서 이미 했다(`computeArrivals`) — 두 번 굽지 않는다
});
Onb.__probe.setArrivals(arr);
{
  let withBoard = 0, picked2 = 0, offBoard = 0, mealN = 0;
  for (const v of list) {
    const rows = L.board(v.id) || [];
    if (!rows.length) continue;
    withBoard++;
    const q = Onb.pickFirstQuest(v.id);
    if (!q) continue;
    picked2++;
    if (!rows.some((r) => r.item === q.item && r.rewItem === q.rewItem)) offBoard++;
    if (q.meal) mealN++;
  }
  ok(withBoard > 0, `게시판에 의뢰가 걸린 마을 ${withBoard}/${list.length}곳 — 검사 상황이 성립한다`);
  ok(picked2 === withBoard, `걸린 마을마다 첫 의뢰를 고른다 (${picked2}/${withBoard})`);
  ok(offBoard === 0, `★게시판에 없는 의뢰를 지어내지 않는다 (밖에서 나온 것 ${offBoard})`);
  console.log(`    먹을 것으로 갚는 첫 의뢰 ${mealN}/${picked2}곳 — "납품 → 밥"(§9.4)이 성립하는 비율`);
  // 게시판이 빈 마을은 **null** 이어야 한다(없는 의뢰를 만들지 않는다)
  const empty = list.filter((v) => !(L.board(v.id) || []).length);
  const madeUp = empty.filter((v) => !!Onb.pickFirstQuest(v.id)).length;
  ok(madeUp === 0, `게시판이 빈 마을에선 첫 의뢰가 없다 (지어낸 것 ${madeUp}/${empty.length})`);
  // 성격 분포 — 실지도에서 한 갈래로 몰리지 않는가
  const info = Onb.startInfo();
  const dist = {};
  for (const r of (info.villages || [])) dist[r.chKo] = (dist[r.chKo] || 0) + 1;
  ok(Object.keys(dist).length >= 2, `실지도 성격 분포가 한 갈래로 안 몰린다`, JSON.stringify(dist));
  console.log(`    추천(이방인 환영) ${info.recommendN}곳 · 첫 추천 vid=${info.recommend}`);
  // 첫 의뢰 품목 분포 — 보고서용 대리 지표
  const items = {};
  for (const v of list) { const q = Onb.pickFirstQuest(v.id); if (q) items[q.item] = (items[q.item] || 0) + 1; }
  const top = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${Events.koRes(k)} ${n}`).join(' · ');
  console.log(`    첫 의뢰 품목 분포(상위): ${top || '없음'}`);
}

// ── ⑥ 빈터 권리 게이트 ──────────────────────────────────────────────────────
console.log('\n⑥ 빈터 권리 — 누적 기여 게이트 · 구역 판정');
{
  const vid = list[0].id;
  const a = arr.get(vid);
  const pid = 'test_onb_1';
  Onb.__probe.clearCache();
  const st = Onb.stateOf(pid);
  st.start_vid = vid; st.arrived = 1; st.contrib = 0; st.lot_ok = 0;
  Onb.__probe.save(pid, st);
  const player = { playerId: pid, x: a.x, y: a.y, ws: null, fishStats: null };
  ok(!Onb.vacantLotAllows(player, a.x, a.y), `기여 0회 — 빈터에 걸 수 없다`);
  // 기여를 채운다 — **정본 훅**(`onDeliver`)으로 채운다(하네스가 상태를 손으로 빚으면 사본이다)
  for (let i = 0; i < Onb.CFG.LOT_AFTER; i++) Onb.onDeliver(player, { ok: true, done: true, req: { item: 'food' } }, vid);
  ok(Onb.stateOf(pid).contrib === Onb.CFG.LOT_AFTER, `납품 ${Onb.CFG.LOT_AFTER}회 — 누적 기여가 하나의 카운터로 쌓인다`, `contrib=${Onb.stateOf(pid).contrib}`);
  ok(Onb.vacantLotAllows(player, a.x, a.y), `기여 ${Onb.CFG.LOT_AFTER}회 — 빈터 구역 안이면 허용`);
  const z = Onb.vacantZoneOf(vid);
  ok(!Onb.vacantLotAllows(player, a.x + z.rPx * 2, a.y), `구역 밖은 여전히 거절 (구역 반경 ${z.rPx}px)`);
  // 다른 마을의 빈터는 내 것이 아니다
  if (list[1]) {
    const b = arr.get(list[1].id);
    ok(!Onb.vacantLotAllows(player, b.x, b.y), `내가 도착한 마을이 아닌 곳의 빈터는 거절`);
  }
}

// ── ⑦ 재접속 후 대본 상태 보존 ──────────────────────────────────────────────
console.log('\n⑦ 재접속 — 대본 상태가 살아남는다');
{
  const pid = 'test_onb_1';
  const before = Onb.publicState(pid);
  Onb.__probe.clearCache();          // 메모리 캐시를 비운다 = 새 세션(같은 신원)
  const after = Onb.publicState(pid);
  ok(after.contrib === before.contrib && after.lotOk === before.lotOk && after.vid === before.vid,
    `기여·권리·마을이 DB 왕복을 넘는다`, `contrib ${before.contrib}→${after.contrib} · lot ${before.lotOk}→${after.lotOk}`);
  // 새 신원은 백지다(남의 진척을 물려받지 않는다)
  const fresh = Onb.publicState('test_onb_never_seen');
  ok(fresh.contrib === 0 && !fresh.lotOk && fresh.vid == null, `처음 보는 신원은 백지다`);
}

// ── ⑧ ★검사기 자가 검사 ────────────────────────────────────────────────────
console.log('\n⑧ ★이 하네스가 실패할 줄 아는가 — 일부러 나쁜 도착 지점을 넣는다');
{
  // 물 위 좌표를 하나 찾아 "도착 지점"이라고 우긴다 → ①의 판정이 잡아야 한다.
  let wx = null;
  for (const v of list) { for (let r = 1; r < 40 && !wx; r++) for (let a2 = 0; a2 < 360; a2 += 15) {
    const t = a2 * Math.PI / 180, x = v.cx + Math.round(Math.cos(t) * r), y = v.cy + Math.round(Math.sin(t) * r);
    if (ta.isWater(x, y)) { wx = [x, y]; break; } } if (wx) break; }
  ok(!!wx, `물 위 좌표를 실지도에서 찾았다`, wx ? `(${wx[0]},${wx[1]})` : '');
  ok(!!wx && ta.isBlocked(wx[0], wx[1]), `①의 '물·바위 위가 아니다' 판정이 그 좌표를 막는다`);
  // 도달 불가 판정도 자기가 실패할 줄 아는가 — 존 밖은 언제나 막혀 있다
  ok(!Onb.__probe.reaches(ta, -5, -5, list[0].cx, list[0].cy), `①의 도달성 판정이 존 밖 출발을 잡는다`);
}

try { sdb.close(); } catch (e) {}
for (const f of [TDB, TDB + '-wal', TDB + '-shm', process.env.DB_PATH]) { try { fs.unlinkSync(f); } catch (e) {} }
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===  (총 ${((Date.now() - t0) / 1000).toFixed(0)}초)`);
process.exit(fail ? 1 : 0);
