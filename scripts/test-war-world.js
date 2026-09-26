#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-war-world.js — 실체 전쟁: 좌표계 하나 · 장애물은 존의 것 · 전투 = 연속 상태 (T284) ======
//
// ★★[T284 2026-09-14 · 재민 확정 "좌표계는 하나 · 전쟁은 항상 실체 · 전투는 연속 상태"]
//   옛 판(130×130 로컬 전장 · 미러 · 가짜 건물 22채 · 200초 강제결판 · 관측자 없으면 수로 결판)을 걷어냈다.
//   이 하네스는 **실제 모듈**(server/villages.js 전쟁 절 · server/war-live.js · sim/war-core.js · sim/battle-core.js ·
//   sim/economy-sim.js)을 그대로 부른다 — 앞 절은 in-memory 목 존(결정론이 필요한 대조), 뒤 절은 **서버를 띄운다**.
//
// 재는 것 (카드 ⑤ ⓐ~ⓕ)
//   ⓐ 교전 중 병사가 건물·물·바위 셀 안에 있는 틱 = 0   ★자명 통과 금지: 콜라이더를 끈 팔은 > 0
//   ⓑ 가짜 건물 0 — battle-core 에 ctx.buildings·genForest 심볼이 없다(정적)
//   ⓒ 치고 빠지기 — 접촉 → 공격 후퇴 → n초 뒤 대치(방어 포진 복귀 · 판·정산 없음) → 다시 돌격하면 다시 교전
//   ⓓ 관측자 유무 무관 — 같은 씨 · 관측자 켠 팔과 끈 팔의 결과가 한 글자도 안 다르다(시드 셋)
//   ⓔ 궤주 · 항복 · 철수 — 각각 정산을 정확히 한 번
//   ⓕ 미러 함수 0 — 옛 좌표 변환·미러·서브루프·LOD 심볼이 서버·코어에 없다(정적)
//   ⓖ(서버) 존을 띄워 픽스처 전쟁 하나가 실제로 교전·정산까지 가고 틱 빚 drop 0
//
// ★★[T295 2026-09-19 · 동원의 대가] 네 절이 붙었다 — 결속·군량·품목·죽은 칸
//   ⓗ 징발 기간 그 NPC 의 생산 기여 0 · 복귀 뒤 재개   ★대조: 결속을 안 걸면 계속 생산한다
//   ⓘ 환급 합 = 적재 − 소비 − 전사자 몫 (궤주·항복·철수·무저항 **넷 다** · 곳간 품목별)
//   ⓙ 군량 품목 순서가 섭식 정본과 **같은 함수**다(심볼 하나 · 정적) · `food` 0 이어도 팩이 찬다
//   ⓚ `_laborMul` 동원 항 쓰기 0(정적 — 부상 노동력 한 줄만 남는다)
//
// ★★[T403 2026-09-26 · 무기는 실체다 — 1층 장부] 두 절(손잡이 `T403_ARMS_LEDGER` · 기본 끔)
//   ⓢ 소집 = 곳간 무기 −n(n = min(병력, floor 재고)) · 모자라면 민병 수로 적는다 · 방어 소집은 안 건다   ★대조: 끔이면 곳간 무변
//   ⓣ 복귀 = +(n − 결판에서 잃은 몫) · 잃는 몫은 `warWeaponFlow` 가 **짐에서** · 귀환 뒤 곳간 = 끔과 같다(재고 ≥ 병력) · 이중 반납 0
//
// ★★[T413 2026-09-26 · ⓛ 간헐 빨강의 뿌리 = 자] 한 절
//   ⓤ 태어나는 자리의 씨 = 판의 날(벽시계를 밀어도 같은 판) · 전멸 판도 끝을 읽는다 · 미끼 셋(날·옛 규칙·자르기)
//
// 실행: node scripts/test-war-world.js          (서버 절 건너뛰기: WAR_WORLD_NO_SERVER=1)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const say = console.log;

const econ = R('sim/economy-sim.js');
const WarCore = R('sim/war-core.js');
const WarLive = R('server/war-live.js');
const BC = R('sim/battle-core.js');
const SimVillages = R('server/villages.js');
const SZ = 32;

// ── 결정론 난수 — Math.random 을 판마다 같은 씨로 갈아 끼운다(스폰·econ 내부가 쓰는 것까지 같은 줄) ──
function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const _origRandom = Math.random;

// ── 세계 모양(셀) — 공격 마을 A(100,100) · 방어 마을 B(260,100). 둘 사이에 방어 마을 집 넷과 바위 띠 하나.
//   주둔 링 = 방어 중심에서 95셀(=ENGAGE 50 + STANDOFF 45) · 방어 포진 = 45셀. 집·바위는 그 사이(돌격로 위)에 둔다.
const A_C = { cx: 100, cy: 100 }, B_C = { cx: 260, cy: 100 };
const HOUSES_B = [{ type: 'house', cx: 200, cy: 101 }, { type: 'house', cx: 200, cy: 111 }, { type: 'house', cx: 208, cy: 96 }, { type: 'granary', cx: 190, cy: 106 }, { type: 'house', cx: 272, cy: 112 }];
const ROCK = new Set(); for (let x = 186; x <= 188; x++) for (let y = 88; y <= 98; y++) ROCK.add(x * 65536 + y);
const WATER = new Set(); for (let x = 176; x <= 178; x++) for (let y = 110; y <= 118; y++) WATER.add(x * 65536 + y);
// ★[T295 후속] 돌격로 위의 숲 띠(셀) — 나무 술어(존이 주입하는 청크 색인)의 하네스 자리.
// ★[T295 후속] 숲 띠 — **존 숲의 꼴 그대로**: 격자 간격 2셀(존 `forestSpacing` 60~96px = 2~3셀)이라 사이에 길이 남는다.
//   ⚠빽빽한 벽(모든 칸)으로 깔면 두 군대가 서로 못 닿아 판이 안 끝난다(실측 — 보고 §0-ⓒ 함정).
// ★[T364 ⓡ] 행군로 판용 **숲 덩이** — 두 마을을 잇는 직선(y≈100) 위에 놓는다. 코스 노드(4셀)마다 한가운데 셀을
//   보는 규칙이라, 숲이 노드 크기보다 크면 길이 실제로 돌아간다(존 숲도 군락은 이만큼 뭉친다).
const FOREST = new Set(); for (let x = 150; x <= 178; x++) for (let y = 84; y <= 116; y++) FOREST.add(x * 65536 + y);
const TREES = new Set(); for (let x = 195; x <= 215; x++) for (let y = 90; y <= 115; y++) if (x % 2 === 1 && y % 2 === 1) TREES.add(x * 65536 + y);
const cellKey = (px, py) => Math.floor(px / SZ) * 65536 + Math.floor(py / SZ);

// 한 판 — 새 목 존 · 새 war-core · 새 war-live. opts: { seed, viewer, noCollide, scenario, maxTicks, warId }
function runScenario(opts) {
  Math.random = seeded(opts.seed || 7);
  try { return _run(opts); } finally { Math.random = _origRandom; }
}
function _run(opts) {
  const players = new Map(), npcs = new Set(), bcast = [];
  let _pid = 1;
  const JOBS = ['warrior', 'hunter', 'farmer', 'fisher', 'miner', 'forager', 'lumberjack', 'mason'];
  const deps = {
    players, npcs, broadcast: (m) => bcast.push(m),
    spawnNpc: (o) => { const pid = 'p' + (_pid++); const p = { pid, x: o.x, y: o.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: JOBS[_pid % JOBS.length] }; players.set(pid, p); npcs.add(pid); return p; },
    anyViewerNear: () => !!opts.viewer,
    isPositionActive: () => !!opts.viewer,
    isBlockedByWall: () => false,
    isTerrainBlockedLocal: (px, py) => { const k = cellKey(px, py); return ROCK.has(k) || WATER.has(k); },
    isWaterTileLocal: (px, py) => WATER.has(cellKey(px, py)),
    tickHz: 30,
  };
  // ★[T295 후속] 나무 술어 — 존이 주입하는 그 자리(`deps.treeCellBlocked` · 셀 단위 · 관측자 무관).
  //   미주입 팔(opts.trees 없음)은 **빈 들판**이다 = 이 카드 전 동작(대조군).
  if (opts.trees) deps.treeCellBlocked = (cx, cy) => TREES.has(Math.floor(cx) * 65536 + Math.floor(cy));
  // ★[T329 ⓝ] 현장 후보를 만들 자원·짐승·물가 — 운영과 같은 모양(쿼드트리 질의·mobs·_terrSet)만 갖춘다.
  if (opts.probeRout) {
    const RES = [];
    for (let i = 0; i < 400; i++) {   // 마을 B 둘레에 고르게(반경 0~1,400px) 나무·바위·열매
      const ang = i * 0.61803398875 * Math.PI * 2, rad = 60 + (i / 400) * 1340;
      RES.push({ x: B_C.cx * SZ + Math.cos(ang) * rad, y: B_C.cy * SZ + Math.sin(ang) * rad, type: ['tree', 'rock', 'ore', 'berry_bush', 'herb'][i % 5] });
    }
    deps.qtResources = () => ({ queryCircle: (x, y, r) => RES.filter(q => Math.hypot(q.x - x, q.y - y) <= r) });
    const MOBS = new Map();
    for (let i = 0; i < 40; i++) { const ang = i * 0.7, rad = 80 + i * 35; MOBS.set('m' + i, { x: B_C.cx * SZ + Math.cos(ang) * rad, y: B_C.cy * SZ + Math.sin(ang) * rad, hp: 10, type: 'deer' }); }
    deps.mobs = MOBS;
  }
  const mkVil = (name, c, dbId, pop) => {
    const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name });
    e.storage.weapon = 20; e.storage.stone = 200;
    // 집 자리(스폰) — 마을 뒤쪽(돌격로 반대편)에 둔다: 병사가 처음부터 장애물 안에서 나오지 않게
    const back = dbId === 1 ? -1 : 1;
    const housesPx = [0, 1, 2, 3].map(i => ({ x: (c.cx + back * (14 + i * 3)) * SZ + SZ / 2, y: (c.cy - 6 + i * 4) * SZ + SZ / 2 }));
    return { dbId, name, ccx: c.cx, ccy: c.cy, econ: e, npcPids: [], housesPx };
  };
  const atk = mkVil('공격A', A_C, 1, 22), def = mkVil('방어B', B_C, 2, 18);
  if (opts.probeRout) { def._maxRPx = 1200; def._terrSet = new Set(); for (let i = 0; i < 60; i++) def._terrSet.add((B_C.cx + (i % 10) - 5) + ',' + (B_C.cy + ((i / 10) | 0) - 3)); }
  const villages = [atk, def];
  const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 1 };
  const db = { getVillageStructRows: (id) => (id === 2 ? HOUSES_B : []) };
  let H = null;
  const counts = { resolve: 0 };
  const war = WarCore.createWar({
    villages, world, seed: 7, infoRange: 5000,
    centerOf: v => ({ cx: v.ccx, cy: v.ccy }),
    territoryOf: v => (v.econ.land && v.econ.land.size ? v.econ.land.size * 25 : 2800),
    log: null,
    onEngage: (w, day, why) => H._warEngage(w, day, why),
  });
  const dayMs = opts.dayMs || 30000;
  H = SimVillages.__p3Bind({
    ready: true, zoneId: 'test', deps, villages, byDbId: new Map(villages.map(v => [v.dbId, v])), byEcon: new Map(villages.map(v => [v.econ, v])),
    war, warCore: WarCore, world, db, warBodies: new Map(), routeCache: new Map(), _route: null, _distCtx: null, roads: null, pathfind: R('server/pathfind.js'),
    epoch: 0, dayMs, lastGameDay: world.day, _warThreatBuf: null, _warRects: null, _warRectCells: null, _warNoCollide: !!opts.noCollide,
    _warStat: { engage: 0, standoff: 0, rout: 0, withdraw: 0, withdrawQuiet: 0, surrender: 0, walkover: 0, noArmy: 0, engageErr: 0 },
    _warPerf: { ring: new Array(3000).fill(0), i: 0, n: 0, max: 0, soldiers: 0, soldiersMax: 0, fighting: 0 },
  });
  const WL = WarLive.createWarLive({
    BC, dayOf: () => world.day, cellPx: SZ, pxPerM: SZ, tickHz: 30,
    resolveBattle: (w, day, pre) => { counts.resolve++; war.warResolveBattle(w, day, pre); },
    blockedCell: (cx, cy) => H._warBlockedCell(cx, cy),
  });
  H.state.warLive = WL;
  // ★★[T413 ①] **태어나는 자리의 씨는 하네스의 날이다.** 운영 `spawnOneNpc` 는 자리 주사위를 `gameDayOf(Date.now())`
  //   (존의 게임일 정본)로 씨 뿌린다 — 그런데 이 판의 날은 `world.day`(가상 시계)이고 `Date.now()` 는 **벽시계**다
  //   (epoch 0 · dayMs 30초 ⇒ 30초마다 다른 날). 그래서 같은 씨의 판이 **돌린 시각에 따라** 다른 자리에서 태어났다
  //   (ⓛ 간헐 빨강의 첫 뿌리 · 보고 T413 §0-ⓐ). 스폰 순간만 시계를 판의 날에 맞춘다 — 운영 코드는 한 글자도 안 바뀐다.
  //   `opts.spawnDay` = 그 날을 바꿔 보는 손(ⓛ 전멸 판 · 미끼용). 없으면 `world.day`.
  { const _n = Date.now, _t = (opts.spawnDay != null ? opts.spawnDay : world.day) * dayMs + 1; Date.now = () => _t;
    try { for (const v of villages) H.syncVillagePop(v, Infinity); } finally { Date.now = _n; } }
  // 집 발자국 색인 — 스폰 자리가 발자국·바위 안이면 판 자체가 틀렸다(하네스 전제)
  H._warBuildRectIndex();
  let badSpawn = 0; for (const p of players.values()) { if (H._warBlockedCell(p.x / SZ, p.y / SZ) && !opts.noCollide) badSpawn++; }

  // 전쟁 하나 — 실경로(war-core march→camp→결단). 시나리오가 정책·곳간을 만든다(픽스처 문법과 같은 손잡이).
  const sc = opts.scenario || 'assault';
  const comp = WarCore.conscript(atk, 'full', {}).composition;
  const w = { id: opts.warId || 1, atk, def, casus: 'feud', force: 12, warriors: 2, composition: comp, weapQ: 0.5,
    phase: 'march', op: 'march', eta: world.day + 1, marchDays: 1, born: world.day, _packDays: 12, _packRem: 12 };
  if (sc === 'assault' || sc === 'hitrun') w._opPolicy = 'assault';
  if (sc === 'surrender') { w._opPolicy = 'siege'; def._defPolicy = 'hold'; for (const r of ['food', 'fish', 'meat', 'cooked_food', 'vegetable']) def.econ.storage[r] = 0; }
  if (sc === 'hitrun' || sc === 'assault') def._defPolicy = 'respond';
  if (sc === 'sortie') { w._opPolicy = 'siege'; def._defPolicy = 'respond'; w._forceSortie = true; }
  war.WARS.push(w);

  const tr = { badSpawn, blockedTicks: 0, treeTicks: 0, fightTicks: 0, engagedAt: -1, standoffAt: -1, reengagedAt: -1, resolveAtStandoff: -1,
    defHomeGap: null, settles: [], hitrun: sc === 'hitrun' ? 'wait' : null, pos: null };
  let now = world.day * dayMs + 1, dayAt = now;
  const stepMs = 1000 / 30;
  const maxTicks = opts.maxTicks || 30 * 60 * 12;   // 12분(판정 창)
  for (let t = 0; t < maxTicks; t++) {
    now += stepMs;
    H.tickWarBodies(now);
    // 하루 경계 — onGameTick 과 같은 순서(daily → 결단 뒤 정리)
    if (now - dayAt >= dayMs) {
      dayAt = now; world.day++; H.state.lastGameDay++;
      const sb = (war.stats().surrender) || 0;
      war.daily(world.day); H._warAfterDaily(sb);
    }
    const body = H.state.warBodies.get(w.id);
    const f = body && body.fight;
    if (w._forceSortie && (w.op === 'camp' || w.op === 'siege') && w.phase === 'march' && !tr.sortied) { tr.sortied = t; w._sortie = true; H._warEngage(w, world.day, 'sortie'); }   // 출격 결단(war-core 문턱 대신 하네스가 곧바로)
    if (process.env.WW_DEBUG && f && t % 30 === 0 && sc === 'sortie') { const st = {}; for (const u of f.ctx.units) { if (u.hp <= 0) continue; const k = u.side + (u.ctl ? 'c' : '') + ':' + u.st + (u.routing ? '!' : ''); st[k] = (st[k] || 0) + 1; } const ca = WL.centroid(f, 'A'), cb = WL.centroid(f, 'B'); console.log('dbg', t, f.state, w.phase, JSON.stringify(st), ca && cb ? Math.hypot(ca.x - cb.x, ca.y - cb.y).toFixed(1) : '-', f.adv ? f.adv.side + (f.adv.released ? 'R' : '') : ''); }
    if (f && f.state !== 'form') {
      tr.fightTicks++;
      let bad = false;
      for (const u of f.ctx.units) { if (u.hp <= 0) continue; if (H._warBlockedCell(u.x, u.y) || (opts.noCollide && (ROCK.has(Math.floor(u.x) * 65536 + Math.floor(u.y)) || H.state._warRectCells && H.state._warRectCells.has(Math.floor(u.x) * 65536 + Math.floor(u.y))))) { bad = true; break; } }
      if (bad) tr.blockedTicks++;
      // 나무 셀 안에 선 **전투 병사**가 있는 틱 — 대형이 모는 병사(`u.ctl`)는 세지 않는다:
      //   그 걸음은 대형 슬롯(`_warBlockedCell`)의 몫이고, 나무는 **전투 스텝의 장애물**이다(어댑터 `blocked`).
      if (process.env.WW_BOX) { for (const u of f.ctx.units) { if (u.hp <= 0) continue; tr._bx0 = Math.min(tr._bx0 == null ? 1e9 : tr._bx0, u.x); tr._bx1 = Math.max(tr._bx1 || 0, u.x); tr._by0 = Math.min(tr._by0 == null ? 1e9 : tr._by0, u.y); tr._by1 = Math.max(tr._by1 || 0, u.y); } }
      { let inTree = false; for (const u of f.ctx.units) { if (u.hp <= 0 || u.ctl) continue; if (TREES.has(Math.floor(u.x) * 65536 + Math.floor(u.y))) { inTree = true; break; } } if (inTree) tr.treeTicks++; }
      if (f.state === 'engaged' && tr.engagedAt < 0) tr.engagedAt = t;
    }
    // ⓒ 치고 빠지기 — 첫 접촉 1.5초 뒤 후퇴 명령 · 대치 확인 · 다음 결단(돌격 정책)에서 재교전
    if (tr.hitrun === 'wait' && tr.engagedAt >= 0 && t - tr.engagedAt >= 45) { H._warOrderFallback(body); tr.hitrun = 'fallback'; tr.resolveAtFallback = counts.resolve; }
    if (tr.hitrun === 'fallback' && w.phase === 'march' && body && body.mode === 'camp') { tr.hitrun = 'standoff'; tr.standoffAt = t; tr.resolveAtStandoff = counts.resolve; tr.nSec = WL.standoffSec(f); }
    if (tr.hitrun === 'standoff' && body && body.defGroup && t - tr.standoffAt === 30 * 20) {   // 대치 20초 뒤
      const dg = body.defGroup; tr.defHomeGap = Math.hypot(dg.cmd.cx - dg.holdPt.cx, dg.cmd.cy - dg.holdPt.cy);
      tr.defAllCtl = f.ctx.units.filter(u => u.side === 'B' && u.hp > 0).every(u => u.ctl);
    }
    if (tr.hitrun === 'standoff' && f && f.state === 'engaged' && t > tr.standoffAt) { tr.hitrun = 'reengaged'; tr.reengagedAt = t; tr.resolveAtReengage = counts.resolve; }
    if (tr.hitrun === 'reengaged' && t - tr.reengagedAt > 15) { tr.hitrun = 'done'; w._opPolicy = 'siege'; w._packRem = 0; H._warOrderFallback(body); }   // 끝: 군량 0 → 철수로 정산
    // ★★[T413 ①] **끝은 몸이 남긴 기록으로 읽는다 — 몸이 아직 세계에 있는지와 무관하게.** 공격 표본이 전멸하면
    //   `_warEndFight` 가 `ended` 를 적고 **같은 틱에** 몸을 치운다(귀환할 사람이 없다 · `_warCleanupBody`). 종전 하네스는
    //   살아 있는 몸에서만 `ended` 를 읽어 그 판을 "안 끝났다"로 셌다(ⓛ 간헐 빨강의 둘째 뿌리 — 제품은 끝났다: 궤주 1 · w.phase 'return').
    if (body) tr._body = body;
    const _eb = body || tr._body;
    if (body && body.ended && !tr.endedLive) tr.endedLive = body.ended;   // 옛 규칙(살아 있는 몸만) — 미끼 대조용
    if (_eb && _eb.ended && !tr.ended) { tr.ended = _eb.ended; tr.endT = t; tr.endHit = tr.hitrun; tr.endGone = !body; }
    if (process.env.WW_DEBUG && f && t % 30 === 0 && sc === 'hitrun') { const a = f.ctx.units.filter(u => u.side === 'A' && u.hp > 0); console.log('dbg', t, tr.hitrun, f.state, w.phase, w.op, 'A', a.length, 'rout', a.filter(u => u.routing).length, 'ctl', a.filter(u => u.ctl).length, 'B', f.ctx.units.filter(u => u.side === 'B' && u.hp > 0).length); }
    if (!H.state.warBodies.has(w.id) && tr.ended) break;
    if (body && body.phase === 'return' && tr.ended) { /* 귀환 중 — 몇 틱 더 */ if (t - tr.endT > 60) break; }
  }
  const st = war.stats();
  tr.counts = { resolve: counts.resolve, surrender: st.surrender || 0, battle: st.battle || 0 };
  tr.stat = Object.assign({}, H.state._warStat);
  tr.econ = { A: atk.econ.npcs.length, B: def.econ.npcs.length, foodA: +(atk.econ.storage.food || 0).toFixed(4), foodB: +(def.econ.storage.food || 0).toFixed(4) };
  tr.phase = w.phase;
  // 최종 병사 위치 해시(관측자 대조용)
  let hsh = 0; for (const p of players.values()) { hsh = (hsh * 31 + Math.round(p.x * 16) * 7 + Math.round(p.y * 16) + (p.hp | 0)) >>> 0; }
  tr.posHash = hsh; tr.players = players.size;
  tr.bodyGoneAtEnd = !!tr.endGone; delete tr._body;   // 몸 참조는 판 밖으로 안 나간다(순환 참조)
  tr.bcast = { war: bcast.filter(m => m.type === 'war_battle').length, phases: [...new Set(bcast.filter(m => m.type === 'war_battle').map(m => m.phase))] };

  // ── ★[T329] 위협 T 프로브 — **운영 함수 그대로**(H.threatOf · H._warOutMul · H._lifeJobSites) ──
  if (opts.probeThreat) {
    const WLc = H.state.warLive, R = WLc.WAR_ALERT_R;
    const body = H.state.warBodies.get(w.id) || { cmd: { cx: def.ccx - R, cy: def.ccy } };
    H.state.warBodies.set(w.id, body); w.phase = 'march';
    const rst = () => { body._thX = null; body._thY = null; body._thAt = 0; };   // ★[T364] 표본은 몸의 속도 벡터다(_thX/_thY)
    const at = (dCell, dtMs) => { body.cmd = { cx: def.ccx - dCell, cy: def.ccy }; return H.threatOf(def, (body._thAt || 0) + (dtMs || 1000)); };
    const rows = [];
    // 멀리 → 가까이(같은 간격으로 다가온다)
    rst();
    for (let d = R * 1.4; d >= 2; d -= R * 0.1) rows.push({ d: +d.toFixed(1), T: +at(d, 1000).toFixed(4) });
    const zeroFar = rows.filter(r => r.d > R).reduce((m, r) => Math.max(m, r.T), 0);
    let monoUp = true; for (let i = 2; i < rows.length; i++) if (rows[i].T < rows[i - 1].T - 1e-9) monoUp = false;
    // 가까이 → 멀리(물러난다)
    const back = [];
    for (let d = 4; d <= R * 1.2; d += R * 0.1) back.push({ d: +d.toFixed(1), T: +at(d, 1000).toFixed(4) });
    let monoDown = true; for (let i = 2; i < back.length; i++) if (back[i].T > back[i - 1].T + 1e-9) monoDown = false;
    // 병력비 — 같은 자리·같은 속도에서 병력만 바꾼다
    const force0 = w.force;
    rst(); w.force = 2; const lo = at(R * 0.3, 1000);
    rst(); w.force = 200; const hi = at(R * 0.3, 1000);
    w.force = force0;
    const all = rows.concat(back).map(r => r.T);
    tr.threat = { rows, zeroFar: +zeroFar.toFixed(6), monoUp, monoDown,
      upTrace: rows.slice(0, 4).map(r => `d${r.d}→T${r.T}`).join(' '), downTrace: back.slice(0, 4).map(r => `d${r.d}→T${r.T}`).join(' '),
      oddsLo: lo, oddsUp: hi, minT: Math.min(...all), maxT: Math.max(...all) };
  }
  // ── ★[T364] 옆 마을 프로브 — 군대가 옆 마을 곁을 지나가게 하고 T 를 훑는다(운영 함수 `_warWriteThreats` 그대로) ──
  if (opts.probeNeighbor) {
    const WLc = H.state.warLive, R = WLc.WAR_ALERT_R;
    // 옆 마을 둘 — 행군선(A→B) 근처와 멀리
    const side = { dbId: 3, name: '옆마을', ccx: Math.round((A_C.cx + B_C.cx) / 2), ccy: A_C.cy + Math.round(R * 0.35), econ: econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 12, name: '옆마을' }), npcPids: [], housesPx: [] };
    const far = { dbId: 4, name: '먼마을', ccx: A_C.cx, ccy: A_C.cy + Math.round(R * 3), econ: econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 12, name: '먼마을' }), npcPids: [], housesPx: [] };
    H.state.villages.push(side, far); H.state.byDbId.set(3, side); H.state.byDbId.set(4, far);
    const body = H.state.warBodies.get(w.id) || { cmd: { cx: A_C.cx, cy: A_C.cy } };
    H.state.warBodies.set(w.id, body); w.phase = 'march';
    const rows = []; let tNow = 1000;
    let scanN = 0; const scan0 = Date.now();
    for (let i = 0; i <= 20; i++) {   // A → B 직선으로 지나간다
      const f = i / 20;
      body.cmd = { cx: A_C.cx + (B_C.cx - A_C.cx) * f, cy: A_C.cy + (B_C.cy - A_C.cy) * f };
      tNow += 1000;
      H._warWriteThreats(tNow); scanN += H.state.villages.length;
      rows.push({ f: +f.toFixed(2), side: +(side.econ._warThreat || 0).toFixed(4), def: +(def.econ._warThreat || 0).toFixed(4), far: +(far.econ._warThreat || 0).toFixed(4) });
    }
    const maxSide = rows.reduce((m, r) => Math.max(m, r.side), 0);
    const sideCount = (maxSide > 0 ? 1 : 0) + (rows.reduce((m, r) => Math.max(m, r.far), 0) > 0 ? 1 : 0);
    const onCount = sideCount + (rows.reduce((m, r) => Math.max(m, r.def), 0) > 0 ? 1 : 0);
    // 지나간 뒤 — 군대를 옆 마을에서 아주 멀리 보내고 다시 쓴다
    body.cmd = { cx: B_C.cx + R * 2, cy: B_C.cy + R * 2 }; tNow += 1000; H._warWriteThreats(tNow);
    const leftZero = !(side.econ._warThreat > 0) && !(def.econ._warThreat > 0);
    tr.neighbor = { rows, maxSide, sideCount, onCount,
      defT: rows.reduce((m, r) => Math.max(m, r.def), 0),
      defAlsoOn: rows.some(r => r.def > 0), leftZero,
      leftTrace: `떠난 뒤 옆 ${side.econ._warThreat || 0} · 목표 ${def.econ._warThreat || 0}`,
      scanTrace: `마을 ${H.state.villages.length}곳 × 21틱 = 거리 술어 ${scanN}회 · ${Date.now() - scan0}ms` };
    H.state.villages.length = 2;   // 프로브가 세운 마을은 도로 치운다
  }
  // ── ★[T364] 행군로 프로브 — 같은 마을쌍의 길을 술어 없이/있이 두 번 뽑는다 ──
  if (opts.probeRoute) {
    // 목 존엔 교역로 격자가 없다 — **운영과 같은 모양**(터레인 어댑터 + 존 크기)만 세워 주면 같은 탐색이 돈다.
    H.state._distCtx = {
      ZONE: { zoneWidth: 400 * SZ, zoneHeight: 200 * SZ },
      ta: { isBlocked: (cx, cy) => ROCK.has(cx * 65536 + cy) || WATER.has(cx * 65536 + cy), isBridgeCell: null },
    };
    H.state._route = null;
    const cellOf = (p) => Math.floor(p.x / SZ) * 65536 + Math.floor(p.y / SZ);
    const len = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / SZ; return L; };
    const treeHits = (pts) => { let n = 0; for (let i = 1; i < pts.length; i++) { const steps = Math.ceil(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / SZ); for (let k = 0; k <= steps; k++) { const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * (k / steps), y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * (k / steps); if (FOREST.has(Math.floor(x / SZ) * 65536 + Math.floor(y / SZ))) n++; } } return n; };
    const pairs = [[atk, def], [def, atk], [atk, { ccx: B_C.cx, ccy: B_C.cy - 14, dbId: 9 }]];
    const rows = []; let allLonger = true, oldSame = true, avoidOk = true;
    for (const [a, b] of pairs) {
      const px = (v) => ({ x0: v.ccx * SZ + SZ / 2, y0: v.ccy * SZ + SZ / 2 });
      const A0 = px(a), B0 = px(b);
      const old = H.computeRoutePts(A0.x0, A0.y0, B0.x0, B0.y0, null);
      const treeBlk = (gx, gy) => { const half = 2; return FOREST.has((gx * 4 + half) * 65536 + (gy * 4 + half)); };   // DIST_STEP 4 · 노드 한가운데 셀(운영 `_warRouteTreeBlk` 와 같은 규칙)
      const neu = H.computeRoutePts(A0.x0, A0.y0, B0.x0, B0.y0, treeBlk);
      if (!old || !neu) { allLonger = false; rows.push({ err: 'no-path' }); continue; }
      const lo = len(old), ln = len(neu), ho = treeHits(old), hn = treeHits(neu);
      if (!(ln > lo)) allLonger = false;
      if (!(hn < ho)) avoidOk = false;
      const again = H.computeRoutePts(A0.x0, A0.y0, B0.x0, B0.y0, null);
      if (JSON.stringify(again) !== JSON.stringify(old)) oldSame = false;
      rows.push({ lo: +lo.toFixed(1), ln: +ln.toFixed(1), ho, hn });
    }
    tr.route = { rows, allLonger, oldSame, avoidOk,
      trace: rows.map(r => r.err || `${r.lo}셀 → ${r.ln}셀(+${(r.ln - r.lo).toFixed(1)})`).join(' · '),
      oldTrace: '술어 미주입 판을 두 번 뽑아 대조',
      avoidTrace: rows.map(r => r.err || `나무 칸 ${r.ho} → ${r.hn}`).join(' · ') };
  }
  // ── ★[T329] R_out 프로브 — T 열한 칸 훑기(현장 목록은 _lifeJobSites 그대로) ──
  if (opts.probeRout) {
    const e = def.econ;
    const sites = (T) => { if (T > 0) e._warThreat = T; else delete e._warThreat; def._jobSites = null; const js = H._lifeJobSites(def, H.state.world.day); return js; };
    const cnt = (js) => (js.lumberjack.length + js.miner.length + js.forager.length + js.hunter.length + js.fisher.length);
    const base = sites(0), baseN = cnt(base), baseJSON = JSON.stringify(base.fisher.length) + '|' + JSON.stringify(base.hunter.length);
    const mulRows = [];
    for (let i = 0; i <= 10; i++) { const T = i / 10; const mul = (T > 0 ? (delete e._warThreat, e._warThreat = T, H._warOutMul(def)) : (delete e._warThreat, H._warOutMul(def))); mulRows.push({ T, mul: +mul.toFixed(6), want: +(1 - T).toFixed(6) }); }
    const mulOk = mulRows.every(r => Math.abs(r.mul - r.want) < 1e-9);
    const ns = []; for (let i = 0; i <= 10; i++) { const T = i / 10; ns.push({ T, n: cnt(sites(T)) }); }
    // 연속 — 이웃 칸 사이 현장 수 차이가 전체의 절반을 넘지 않는다(칼로 나뉘는 값 0)
    let worst = 0, worstAt = null;
    for (let i = 1; i < ns.length; i++) { const dd = Math.abs(ns[i].n - ns[i - 1].n); if (dd > worst) { worst = dd; worstAt = ns[i].T; } }
    const contOk = baseN === 0 ? true : worst <= Math.max(1, baseN * 0.5);
    const zeroJS = sites(0);
    const zeroSame = cnt(zeroJS) === baseN && (JSON.stringify(zeroJS.fisher.length) + '|' + JSON.stringify(zeroJS.hunter.length)) === baseJSON;
    const oneN = cnt(sites(1));
    delete e._warThreat; def._jobSites = null;
    tr.rout = { mulRows, mulOk, mulTrace: mulRows.map(r => `${r.T}→${r.mul}`).join(' '),
      contOk, contTrace: `평시 현장 ${baseN} · 이웃 칸 최대 차 ${worst}${worstAt != null ? `(T=${worstAt})` : ''} · 칸별 ${ns.map(x => x.n).join(',')}`,
      zeroSame, zeroTrace: `T=0 현장 ${cnt(zeroJS)} = 평시 ${baseN}`,
      oneEmpty: oneN === 0, oneTrace: `T=1 현장 ${oneN}` };
  }
  return tr;
}

(async () => {
  if (process.env.WW_ONLY) { const r = runScenario({ seed: parseInt(process.env.WW_SEED || '31', 10), viewer: false, scenario: process.env.WW_ONLY, trees: process.env.WW_TREES === '1', maxTicks: parseInt(process.env.WW_TICKS || '', 10) || 30 * 60 * 20 }); say(JSON.stringify({ ended: r.ended, counts: r.counts, stat: r.stat, fight: r.fightTicks, blocked: r.blockedTicks, box: [r._bx0, r._bx1, r._by0, r._by1] })); process.exit(0); }
  say('\n=== T284 실체 전쟁 — 좌표계 하나 · 장애물은 존의 것 · 연속 전투 ===');

  // ── ⓑ·ⓕ 정적 ─────────────────────────────────────────────────────────────
  say('\n[ⓑ·ⓕ] 정적 — 가짜 지형·미러·로컬 전장·서브루프 심볼');
  const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');   // 주석 제거(말로 옛 이름을 적은 줄은 코드가 아니다)
  const bcore = strip(src('sim/battle-core.js')), wlive = strip(src('server/war-live.js')), vil = strip(src('server/villages.js')), zone = strip(src('server/zone.js'));
  const bHits = ['ctx.buildings', 'genForest', '.buildings.push', 'ctx.trees'].filter(k => bcore.includes(k));
  ok(bHits.length === 0, 'ⓑ battle-core 에 가짜 지형 심볼 0 (ctx.buildings · genForest · ctx.trees)', bHits.join(',') || '0');
  // 자명 통과 금지 — 옛 코어(main)엔 있었다: 같은 검사가 옛 소스에서 무는가
  const OLD_B = "trees:[], buildings:[], terrain:'plain'\nfunction genForest(ctx,mode){ ctx.buildings.push({x:1}) }";
  ok(['ctx.buildings', 'genForest'].every(k => strip(OLD_B).includes(k)), 'ⓑ 대조 — 옛 모양 문자열엔 같은 검사가 문다(자명 통과 아님)');
  const MIRROR = ['_warSyncBattleMirror', 'mapCellToLocal', 'localToMapCell', 'syncMirror', 'LB_OFF', 'LB_CEN', 'LB_MAX_LOCALT', 'LB_STEP_BUDGET', 'LB_MAX_BATTLES', 'stepLiveBattles', 'startLiveBattle', 'WAR_LOD_VIEW_PX', 'warLodResolveSweep', 'WAR_BODY_MAX', '_muGroupToInjected'];
  const mHits = []; for (const [nm, s] of [['battle-core', bcore], ['war-live', wlive], ['villages', vil], ['zone', zone]]) for (const k of MIRROR) if (s.includes(k)) mHits.push(nm + ':' + k);
  ok(mHits.length === 0, 'ⓕ 미러·로컬 전장·서브루프·LOD 심볼 0 (서버·코어)', mHits.join(',') || '0');
  ok(!/anyViewerNear/.test(vil.slice(vil.indexOf('function warCenterPx'), vil.indexOf('function warThreats'))), 'ⓕ 전쟁 절이 관측자 술어를 읽지 않는다');

  // ── ⓐ 장애물 ─────────────────────────────────────────────────────────────
  say('\n[ⓐ] 교전 중 병사가 건물·물·바위 셀 안에 있는 틱');
  const on = runScenario({ seed: 11, viewer: true, scenario: 'assault' });
  const off = runScenario({ seed: 11, viewer: true, scenario: 'assault', noCollide: true });
  ok(on.badSpawn === 0, 'ⓐ 전제 — 스폰 자리가 장애물 밖', 'bad=' + on.badSpawn);
  ok(on.fightTicks > 0, 'ⓐ 전제 — 교전 틱이 있었다', 'fight ' + on.fightTicks + '틱 · 끝 ' + JSON.stringify(on.ended));
  ok(on.blockedTicks === 0, 'ⓐ 콜라이더 켬: 장애물 안 틱 0', on.blockedTicks + '/' + on.fightTicks);
  ok(off.blockedTicks > 0, 'ⓐ ★대조 — 콜라이더 끔: 장애물 안 틱 > 0 (돌격로 위 집·바위가 실제로 길을 막는다)', off.blockedTicks + '/' + off.fightTicks);

  // ── ⓔ 정산 한 번 ────────────────────────────────────────────────────────
  say('\n[ⓔ] 궤주 · 항복 · 철수 — 정산 정확히 한 번');
  ok(on.ended && on.ended.why === 'rout', 'ⓔ 궤주 판이 궤주로 끝났다', JSON.stringify(on.ended));
  ok(on.counts.resolve === 1 && on.counts.surrender === 0, 'ⓔ 궤주 → warResolveBattle 1회 · 항복 0', JSON.stringify(on.counts));
  const sur = runScenario({ seed: 13, viewer: false, scenario: 'surrender' });
  ok(sur.ended && sur.ended.why === 'surrender', 'ⓔ 항복 판이 항복으로 끝났다', JSON.stringify(sur.ended) + ' · stat ' + JSON.stringify(sur.stat));
  ok(sur.counts.surrender === 1 && sur.counts.resolve === 0, 'ⓔ 항복 → war-core 항복 정산 1회 · 전투 정산 0', JSON.stringify(sur.counts));
  const hr = runScenario({ seed: 17, viewer: false, scenario: 'hitrun', maxTicks: 30 * 60 * 20, dayMs: 60000 });
  ok(hr.ended && hr.ended.why === 'withdraw', 'ⓔ 철수 판(교전 뒤 군량 0)이 철수로 끝났다', JSON.stringify(hr.ended) + ' · stat ' + JSON.stringify(hr.stat));
  ok(hr.counts.resolve === 1 && hr.counts.surrender === 0, 'ⓔ 철수 → warResolveBattle 1회(교전분 정산)', JSON.stringify(hr.counts));

  const so = runScenario({ seed: 31, viewer: false, scenario: 'sortie' });
  ok(so.ended && so.fightTicks > 0 && so.counts.resolve === 1, 'ⓔ(곁) 출격 — 방어가 행군로로 나가 교전하고 정산 1회', JSON.stringify(so.ended) + ' · ' + JSON.stringify(so.counts));

  // ── ⓒ 치고 빠지기 ─────────────────────────────────────────────────────────
  say('\n[ⓒ] 치고 빠지기 — 접촉 → 후퇴 → 대치 → 재교전');
  ok(hr.engagedAt >= 0, 'ⓒ 첫 접촉', 't=' + hr.engagedAt);
  ok(hr.standoffAt > 0, 'ⓒ 후퇴 뒤 대치로 떨어졌다(w.phase=march · op=camp)', 't=' + hr.standoffAt + ' · n=' + (hr.nSec != null ? hr.nSec.toFixed(2) + '초' : '?'));
  ok(hr.standoffAt > 0 && hr.resolveAtStandoff === 0, 'ⓒ 대치까지 정산 0(판·강제결판 없음)', 'resolve=' + hr.resolveAtStandoff);
  ok(hr.defHomeGap != null && hr.defHomeGap < 1.0 && hr.defAllCtl, 'ⓒ 대치 20초 뒤 방어군이 포진점에 있다(대형 · 추격 없음)', 'gap=' + (hr.defHomeGap != null ? hr.defHomeGap.toFixed(2) : '?') + '셀 · ctl=' + hr.defAllCtl);
  ok(hr.reengagedAt > hr.standoffAt, 'ⓒ 다시 돌격하자 다시 교전', 't=' + hr.reengagedAt);
  ok(hr.resolveAtReengage === 0, 'ⓒ 재교전 시점까지도 정산 0', 'resolve=' + hr.resolveAtReengage);
  ok(hr.stat.standoff >= 1 && hr.stat.engage >= 2, 'ⓒ 전이 기록 — 교전 ≥2 · 대치 ≥1', JSON.stringify(hr.stat));

  // ── ⓓ 관측자 무관 ─────────────────────────────────────────────────────────
  say('\n[ⓓ] 관측자 유무 무관 — 같은 씨 · 켬/끔 결과 동일 (시드 셋)');
  const sig = (r) => JSON.stringify({ e: r.ended, c: r.counts, s: r.stat, econ: r.econ, ph: r.phase, h: r.posHash, n: r.players, ft: r.fightTicks });
  let same = 0; const rows = [];
  for (const sd of [21, 22, 23]) {
    const a = runScenario({ seed: sd, viewer: true, scenario: 'assault', warId: sd });
    const b = runScenario({ seed: sd, viewer: false, scenario: 'assault', warId: sd });
    if (sig(a) === sig(b)) same++;
    rows.push(`seed ${sd}: ${a.ended ? a.ended.why + '/' + a.ended.winner : '-'} · A ${a.econ.A} B ${a.econ.B} · hash ${a.posHash}/${b.posHash}`);
  }
  for (const r of rows) say('     ' + r);
  ok(same === 3, 'ⓓ 관측자 켬/끔 세 시드 모두 한 글자 동일', same + '/3');
  const again = runScenario({ seed: 21, viewer: true, scenario: 'assault', warId: 21 });
  const first = runScenario({ seed: 21, viewer: true, scenario: 'assault', warId: 21 });
  ok(sig(again) === sig(first), 'ⓓ 같은 판 두 번 = 동일(결정론)');
  // ★★[T350 2026-09-22 · 주사위 0] **이 대조가 재는 것이 바뀌었다.**
  //   종전 대조는 `opts.seed` 로 **전역 `Math.random` 을 갈아** "씨가 다르면 결과가 다르다"를 봤다(줄 57).
  //   T350 이 존의 세계 자리에서 `Math.random` 을 전부 걷어내자 — 그게 카드가 시킨 일이다 —
  //   **전역을 갈아도 세계가 안 움직인다.** 그래서 옛 대조는 빨개졌다. 이건 회귀가 아니라 **이 카드의 결과**다.
  //   ⇒ 대조를 둘로 가른다: ① 세계가 **실제로 읽는 씨**(`warId` → `_muRng`)를 갈면 달라진다
  //      ② **전역 `Math.random` 을 갈아도** 같다 — 주사위 0 의 산 증거다(옛 대조가 죽은 자리에 선 새 대조).
  const other = runScenario({ seed: 21, viewer: true, scenario: 'assault', warId: 99 });
  ok(sig(other) !== sig(first), 'ⓓ ★대조① — **전쟁 씨**(`warId`)가 다르면 결과가 다르다(해시가 뭔가를 보고 있다)');
  const diceSwap = runScenario({ seed: 99, viewer: true, scenario: 'assault', warId: 21 });
  ok(sig(diceSwap) === sig(first), 'ⓓ ★★대조② [T350] — **전역 `Math.random` 을 갈아도 결과가 같다**(존 세계 자리 주사위 0)');

  // ── ⓗ~ⓚ 동원의 대가(T295) ────────────────────────────────────────────────
  costPart();
  // ── ⓛ 나무 — 존의 것이 되었다(T284 회부 닫기) ─────────────────────────────
  say('\n[ⓛ] 나무 — 전쟁이 존 나무를 본다(관측자 무관 색인 · 메모는 지형과 같은 자리)');
  {
    const on = runScenario({ seed: 41, viewer: true, scenario: 'assault', warId: 41, trees: true, maxTicks: 30 * 60 * 30 });
    const off = runScenario({ seed: 41, viewer: true, scenario: 'assault', warId: 41 });   // 대조 — 술어 미주입(= 이 카드 전)
    ok(on.fightTicks > 0 && off.fightTicks > 0, 'ⓛ 전제 — 두 팔 다 교전이 있었다', `켬 ${on.fightTicks}틱 · 끔 ${off.fightTicks}틱`);
    ok(on.ended && on.ended.why === 'rout', 'ⓛ 숲에서도 판이 끝난다(행위 정산 — 숲은 판을 늘릴 뿐)', `끝 ${JSON.stringify(on.ended)} · 교전 ${on.fightTicks}틱(빈 들판 ${off.fightTicks})`);
    ok(on.treeTicks === 0, 'ⓛ 나무 술어 켬: 병사가 나무 셀 안에 선 틱 0', `${on.treeTicks}/${on.fightTicks}`);
    ok(off.treeTicks > 0, 'ⓛ ★대조 — 술어 끔(미주입): 나무 셀 안 틱 > 0 (숲 띠가 실제로 돌격로 위에 있다)', `${off.treeTicks}/${off.fightTicks}`);
    // 관측자 켬/끔 — 나무를 보면서도 한 글자 동일(T284 ⓓ 를 나무 위에서 다시)
    const sigT = (r) => JSON.stringify({ e: r.ended, c: r.counts, s: r.stat, econ: r.econ, ph: r.phase, h: r.posHash, n: r.players, ft: r.fightTicks, tt: r.treeTicks });
    let same = 0; const rows = [];
    for (const sd of [51, 52, 53]) {
      const a = runScenario({ seed: sd, viewer: true, scenario: 'assault', warId: 100 + sd, trees: true, maxTicks: 30 * 60 * 30 });
      const b = runScenario({ seed: sd, viewer: false, scenario: 'assault', warId: 100 + sd, trees: true, maxTicks: 30 * 60 * 30 });
      if (sigT(a) === sigT(b)) same++;
      rows.push(`seed ${sd}: ${a.ended ? a.ended.why + '/' + a.ended.winner : '-'} · hash ${a.posHash}/${b.posHash} · 나무틱 ${a.treeTicks}/${b.treeTicks}`);
    }
    for (const r of rows) say('     ' + r);
    ok(same === 3, 'ⓛ 나무를 보면서도 관측자 켬/끔 세 시드 한 글자 동일', `${same}/3`);
    // 메모 — 비우는 자리가 건물 색인과 **같은 한 군데**(정적) · 술어는 주입받은 것만 부른다(사본 0)
    const vilSrc = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8');
    ok(/state\._warTreeMemo = new Map\(\);/.test(vilSrc) && (vilSrc.match(/_warTreeMemo = new Map\(\);\s*\/\//g) || []).length >= 1, 'ⓛ 나무 메모를 비우는 줄이 지형 메모 옆에 있다(한 군데)');
    ok(!/require\(['"]\.\/chunk['"]\)[^\n]*treeBlockerAt/.test(vilSrc), 'ⓛ 생활층이 청크를 직접 안 부른다 — 술어는 존이 주입(deps.treeCellBlocked)');
    const zoneSrc = fs.readFileSync(path.join(ROOT, 'server/zone.js'), 'utf8');
    ok(/function warTreeCellBlocked[\s\S]{0,1200}generateChunkResources\(ZONE_ID, ZONE\.biome, qx, qy, cs, harvestedSeeds, day\)/.test(zoneSrc), 'ⓛ 존 술어가 **청크가 켜질 때 쓰는 그 함수·그 인자**로 낳는다(벤 나무 장부 포함)');
    // ★자명 통과 금지 — 청크 통째 색인이 칸마다 묻는 길(`chunk.treeBlockerAt`)과 **같은 답**인지 전수로 대조한다.
    {
      const chunk = R('server/chunk.js');
      const ZID = 'hanbando', BIOME = 'forest', CS = chunk.CHUNK_SIZE, DAY = 400, harvested = new Map();
      const cells = new Set(), loaded = new Set();
      const OV = chunk.forestSpacing(chunk.FOREST_MIN_COV);   // 넘침 상한 — zone 술어가 이웃 청크를 건너뛰는 그 규칙(같은 꼴)
      const cached = (cx, cy) => {
        const px = cx * 32, py = cy * 32;
        const ccx = Math.floor(px / CS), ccy = Math.floor(py / CS);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const qx = ccx + dx, qy = ccy + dy; if (qx < 0 || qy < 0) continue;
          if (dx || dy) { const bx0 = qx * CS, by0 = qy * CS;
            if (px + 31 < bx0 - OV || px > bx0 + CS - 1 + OV) continue;
            if (py + 31 < by0 - OV || py > by0 + CS - 1 + OV) continue; }
          const k = qx * 100000 + qy; if (loaded.has(k)) continue; loaded.add(k);
          for (const r of (chunk.generateChunkResources(ZID, BIOME, qx, qy, CS, harvested, DAY) || [])) if (r.type === 'tree') cells.add(Math.floor(r.x / 32) * 65536 + Math.floor(r.y / 32));
        }
        return cells.has(cx * 65536 + cy);
      };
      let diff = 0, hits = 0, n = 0;
      for (let cx = 1000; cx < 1040; cx++) for (let cy = 1000; cy < 1025; cy++) {   // 숲이 실제로 선 자리(실측 400칸 중 57칸이 나무)
        const a = cached(cx, cy), b = !!chunk.treeBlockerAt(ZID, cx, cy, { biome: BIOME, harvestedSet: harvested, gameDay: DAY });
        if (a !== b) diff++; if (b) hits++; n++;
      }
      ok(diff === 0 && hits > 0, 'ⓛ ★대조 — 청크 색인 = 칸마다 묻는 길(전수 1,000칸 · 나무 있는 칸 > 0)', `다른 칸 ${diff}/${n} · 나무 칸 ${hits}`);
    }
  }

  // ── ⓤ ⓛ 간헐 빨강의 뿌리(T413) ─────────────────────────────────────────
  say('\n[ⓤ] ⓛ 간헐 빨강 — 씨는 판의 날(벽시계 무관) · 끝은 몸의 기록(전멸 판 포함) · 미끼 셋');
  {
    const sigU = (r) => JSON.stringify({ e: r.ended, c: r.counts, s: r.stat, econ: r.econ, ph: r.phase, h: r.posHash, n: r.players, ft: r.fightTicks, tt: r.treeTicks });
    const base = { seed: 41, viewer: true, scenario: 'assault', warId: 41, trees: true, maxTicks: 30 * 60 * 30 };
    const a = runScenario(base);
    const _n = Date.now; Date.now = () => _n() + 3 * 30000 + 7777;   // 벽시계를 사흘 남짓 민다(판의 dayMs = 30초)
    let b; try { b = runScenario(base); } finally { Date.now = _n; }
    ok(sigU(a) === sigU(b), 'ⓤ 벽시계를 사흘 밀어도 한 글자 같은 판 — 태어나는 자리의 씨는 판의 날(`world.day`)', `hash ${a.posHash}/${b.posHash} · 교전 ${a.fightTicks}/${b.fightTicks}틱`);
    const g = runScenario(Object.assign({}, base, { spawnDay: 406 }));
    ok(g.posHash !== a.posHash, 'ⓤ ★미끼① — 날을 바꾸면 자리가 바뀐다(씨가 실제로 날을 본다 · 위 칸은 자명 통과가 아니다)', `날 400 hash ${a.posHash} · 날 406 hash ${g.posHash}`);
    ok(g.ended && g.ended.why === 'rout' && g.bodyGoneAtEnd === true, 'ⓤ 전멸 판(날 406 — 공격 표본 생존 0)도 끝난다 — 몸이 같은 틱에 치워져도 그 몸의 기록으로 읽는다',
      `끝 ${JSON.stringify(g.ended)} · 몸 치움 ${g.bodyGoneAtEnd} · 궤주 ${g.stat.rout} · w.phase ${g.phase}`);
    ok(!g.endedLive, 'ⓤ ★미끼② — 옛 규칙(살아 있는 몸에서만 읽기)은 이 판을 **못 본다**(ⓛ 간헐 빨강의 재현 · 뿌리 둘째)', `옛 규칙 끝 ${JSON.stringify(g.endedLive)}`);
    const cut = runScenario(Object.assign({}, base, { maxTicks: 300 }));
    ok(!cut.ended && cut.fightTicks === 0, 'ⓤ ★미끼③ — 끝나기 전에 자르면 "끝났다"가 안 선다(판정이 상태를 본다 · 자명 통과 0)', `300틱: 끝 ${JSON.stringify(cut.ended)} · 교전 ${cut.fightTicks}틱`);
    const hsrc = fs.readFileSync(__filename, 'utf8');
    const pins = (hsrc.match(/Date\.now = \(\) => _t;/g) || []).length;
    ok(pins === 1 && /try \{ for \(const v of villages\) H\.syncVillagePop\(v, Infinity\); \} finally \{ Date\.now = _n; \}/.test(hsrc),
      'ⓤ 시계는 스폰 순간에만 판의 날에 맞춘다(한 자리 · 되돌림 finally) — 운영 코드 무변', `고정 자리 ${pins}`);
  }

  // ── ⓜ~ⓟ 위협 함수 T(T329) ────────────────────────────────────────────────
  threatPart();
  neighborPart();

  // ── ⓢ~ⓣ 무기 반출/반납 장부(T403) ────────────────────────────────────────
  armsPart();

  // ── ⓖ 서버 ───────────────────────────────────────────────────────────────
  if (process.env.WAR_WORLD_NO_SERVER === '1') { say('\n[ⓖ] 서버 절 건너뜀(WAR_WORLD_NO_SERVER=1)'); }
  else await serverPart();

  say(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

// ── ⓖ 존을 띄운다 — 픽스처 전쟁 하나가 실제 존 틱에서 교전·정산까지 ────────────
async function serverPart() {
  say('\n[ⓖ] 서버 — 존 틱 위의 실체 전쟁(WAR_FIXTURE=assault · 관측자 하나)');
  const { spawn } = require('child_process');
  const FB = require('./fixture-boot');   // ★T349 기동 기다리기 정본(사본 0)
  const CPORT = 3410, ZPORT = 3420;
  const CDB = `/tmp/warw-c-${process.pid}.db`, ZDB = `/tmp/warw-z-${process.pid}.db`;
  for (const f of [CDB, ZDB]) for (const sfx of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + sfx); } catch (e) {} }
  const SECRET = 't284-' + Math.random().toString(36).slice(2);
  const procs = [];
  const LOG = `/tmp/warw-zone-${process.pid}.log`;
  const out = fs.openSync(LOG, 'w');
  const boot = (file, env, io) => { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: io || ['ignore', 'ignore', 'ignore'] }); procs.push(p); return p; };
  const kill = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } };
  process.on('exit', kill);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitHttp = async (url, tries) => { for (let i = 0; i < tries; i++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); if (r.ok) return true; } catch (e) {} await sleep(500); } return false; };
  // ★★[T349 2026-09-21] **central 기동을 아무도 안 보고 있었다** — 존 헬스만 기다렸다.
  //   앞 판 central 이 포트를 쥔 채면 이 판의 central 은 `EADDRINUSE` 로 죽는데, 존은 그 남의
  //   central 에 붙어 헬스가 떠 버린다(=세계가 바뀐 채로 잰다). 정본으로 아이의 입을 듣는다.
  //   ⚠stdio 를 **열어 준다** — 기본이 'ignore' 라 표식이 이쪽에 안 온다.
  const _central = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }, ['ignore', 'pipe', 'pipe']);
  const _upP = FB.waitUp(_central, /central server up on/, { name: 'central' });
  const _zone = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT), CENTRAL_SECRET: SECRET,
    ENABLE_VILLAGES: '1', VILLAGE_MAX: process.env.WAR_WORLD_VILLAGES || '8', VILLAGE_DAY_MS: '60000', ENABLE_BANDITS: '0',
    WAR_FIXTURE: 'assault', WAR_FIXTURE_DAY: '1', VILLAGE_WAR_LOG: '1' }, ['ignore', out, out]);
  // ★★[T355 2026-09-22] **이 존만 X 다 — 정본으로 못 간다.**
  //   이 하네스는 존의 출력을 **파일로** 받는다(`['ignore', out, out]` · 전쟁 로그를 뒤에서 읽는다).
  //   그러면 `child.stdout` 이 null 이라 정본이 아이의 입을 들을 수가 없다 — 파이프로 바꾸면
  //   그 로그가 사라진다. ⇒ 존 게이트는 **포트 응답 그대로 두고 표에 X 로 남긴다**(카드 규약).
  //   central 게이트는 T349 가 이미 정본으로 옮겼다(그쪽은 파이프다).
  const _up = await _upP;
  ok(_up.ok, 'ⓕ central 기동', _up.ok ? `${_up.ms}ms · 아이가 제 입으로 말했다` : _up.why);
  if (!_up.ok) { kill(); return; }
  const up = await waitHttp(`http://localhost:${ZPORT}/health`, 400);
  ok(up, 'ⓖ 존 기동');
  if (!up) { kill(); return; }
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZPORT}/?observer=1`);
  ws.on('error', () => {});
  const pinger = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);   // 30초 무응답 정리(STALE_WS_MS) 방지
  const perf = async (reset) => { try { const r = await fetch(`http://localhost:${ZPORT}/perf${reset ? '?reset=1' : ''}`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
  let last = null, engaged = false, settled = false, maxSoldiers = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 600000) {
    await sleep(2000);
    last = await perf(false);
    const w = last && last.war; if (!w) continue;
    maxSoldiers = Math.max(maxSoldiers, w.soldiersMax || 0);
    if (w.stat && w.stat.engage > 0) engaged = true;
    if (w.stat && (w.stat.rout + w.stat.withdraw + w.stat.surrender + w.stat.walkover) > 0) { settled = true; break; }
  }
  ok(engaged, 'ⓖ 존 틱에서 교전이 열렸다(war-core 돌격 결단 → 실체 전진)', last && last.war ? JSON.stringify(last.war.stat) : 'perf 없음');
  ok(settled, 'ⓖ 존 틱에서 정산까지 갔다(행위 계기)', last && last.war ? `병사 최대 ${maxSoldiers} · 전쟁틱 p95 ${last.war.p95}ms` : '');
  ok(last && last.tick && last.tick.dropN === 0, 'ⓖ 틱 빚 drop 0', last && last.tick ? `dropN ${last.tick.dropN} · 틱 p95 ${last.tick.ms ? last.tick.ms.p95 : '?'}ms` : '');
  ok(last && last.war && last.war.stat.engageErr === 0, 'ⓖ 교전 훅 오류 0(war-core 정산 폴백 0)', last && last.war ? 'engageErr=' + last.war.stat.engageErr : '');
  clearInterval(pinger); try { ws.close(); } catch (e) {}
  kill();
  if (!(engaged && settled)) say('     (존 로그: ' + LOG + ')');
}

// ══════════════════════════════════════════════════════════════════════════════
// ★★[T295] ⓗ~ⓚ — 동원의 대가가 세계에 닿는가
//   여기서는 존을 안 띄운다: 재는 것이 **econ 장부**라 war-core + economy-sim 두 정본이면 충분하다
//   (앞 절들이 이미 존 좌표·교전을 본다). 마을은 econ 정본 함수로 만든다(사본 0).
// ══════════════════════════════════════════════════════════════════════════════
function _mkCostWorld(opts) {
  opts = opts || {};
  const mk = (name, pop) => {
    const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name });
    e.storage.weapon = 40; e.storage.stone = 400;
    return { name, econ: e, ccx: 0, ccy: 0 };
  };
  const atk = mk('대가A', opts.atkPop || 30), def = mk('대가B', opts.defPop || 24);
  const villages = [atk, def];
  const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 1 };
  const war = WarCore.createWar({
    villages, world, seed: 7, infoRange: 5000,
    centerOf: v => ({ cx: v === atk ? 0 : 200, cy: 0 }),
    territoryOf: () => 2800, log: null,
    // ★[T295 ③] 서버가 넘기는 것과 **같은 함수**를 넘긴다(사본 0)
    food: opts.noFood ? undefined : { consumeFood: econ.consumeFood, totalFoodEquivalent: econ.totalFoodEquivalent },
  });
  return { atk, def, villages, world, war };
}
// 하루 생산(그날 곳간 증가분 합) — 같은 마을을 두 팔로 굴려 비교하려고 뽑아 둔다
function _dayProduce(vil, day) {
  const before = Object.assign({}, vil.econ.storage);
  econ.tickVillage(vil.econ, day);
  let d = 0; for (const k in vil.econ.storage) d += (vil.econ.storage[k] || 0) - (before[k] || 0);
  return d;
}
function costPart() {
  // ── ⓗ 징발 기간 생산 0 · 복귀 뒤 재개 ──────────────────────────────────────
  say('\n[ⓗ] 징발자는 생산에서 빠진다 — 자리 비움 · 복귀 재개');
  {
    const W = _mkCostWorld({});
    const e = W.atk.econ;
    const sumCounts = (x) => Object.values(x.counts).reduce((a, b) => a + b, 0);
    const pop0 = e.npcs.length, cnt0 = sumCounts(e);
    ok(cnt0 === pop0, 'ⓗ 전제 — 징발 전 직업 장부 합 = 인구', `${cnt0}/${pop0}`);
    const okMob = W.war.warMobilize(W.atk, W.def, 'feud', 300, W.world.day);
    const w = W.world._warWars[0];
    ok(okMob && w && w._draftN > 0, 'ⓗ 동원 — 징발 마크가 붙었다', w ? `병력 ${w.force} · 징발 ${w._draftN}` : '동원 실패');
    const drafted = e.npcs.filter(n => n._warDraft);
    ok(drafted.length === w._draftN, 'ⓗ 징발자 수 = 마크 수', `${drafted.length}`);
    ok(sumCounts(e) === pop0 - drafted.length, 'ⓗ **직업 자리 비움** — 장부 합이 징발자만큼 줄었다', `${sumCounts(e)} = ${pop0} − ${drafted.length}`);
    // 징발자 개인 기여 0 — 그 사람만 남기고 나머지를 전부 징발해 하루를 굴린다
    const probe = drafted[0];
    const g0 = Object.assign({}, e.storage);
    econ.tickVillage(e, W.world.day);
    let grew = 0; for (const k in e.storage) grew += (e.storage[k] || 0) - (g0[k] || 0);
    ok(probe && probe._warDraft, 'ⓗ 징발 중에도 그 사람은 마을 명부에 남아 있다(죽은 게 아니다)');
    ok(probe && probe.currentJob, 'ⓗ 직업은 그대로다 — 복귀하면 그 자리로 돌아간다', probe ? probe.currentJob : '');
    // 대조 — 같은 세계·같은 날: 결속을 안 걸면(마크 제거) 생산이 더 난다
    const A = _mkCostWorld({}), B = _mkCostWorld({});
    A.war.warMobilize(A.atk, A.def, 'feud', 300, A.world.day);
    B.war.warMobilize(B.atk, B.def, 'feud', 300, B.world.day);
    for (const n of B.atk.econ.npcs) if (n._warDraft) { delete n._warDraft; if (B.atk.econ.counts && n.currentJob) B.atk.econ.counts[n.currentJob] = (B.atk.econ.counts[n.currentJob] || 0) + 1; }
    const pA = _dayProduce(A.atk, A.world.day), pB = _dayProduce(B.atk, B.world.day);
    ok(pA < pB, 'ⓗ ★대조 — 결속 켬이 끔보다 적게 생산한다(대가가 실제로 걸린다)', `켬 ${pA.toFixed(1)} < 끔 ${pB.toFixed(1)}`);
    // 복귀 — 같은 세계에서 해제하면 생산이 대조군 수준으로 돌아온다
    const wA = A.world._warWars[0];
    const rel = A.war.warDraftReleaseWar(wA);
    ok(rel === wA._draftN, 'ⓗ 복귀 — 마크가 전부 풀렸다', `${rel}/${wA._draftN}`);
    ok(Object.values(A.atk.econ.counts).reduce((a, b) => a + b, 0) === A.atk.econ.npcs.length, 'ⓗ 복귀 뒤 장부 합 = 인구(이중 계상 0)');
    const pA2 = _dayProduce(A.atk, A.world.day + 1);
    ok(pA2 > pA, 'ⓗ 복귀 뒤 생산 재개', `징발 중 ${pA.toFixed(1)} → 복귀 ${pA2.toFixed(1)}`);
  }

  // ── ⓘ 환급 — 넷 다 같은 문 · 전사자 몫은 안 돌아온다 ────────────────────────
  say('\n[ⓘ] 군량 — 한 적재 · 환급 한 곳(궤주·항복·철수·무저항) · 전사자 몫 제외');
  {
    const fe = (v) => econ.totalFoodEquivalent(v.econ);
    const ends = ['rout', 'surrender', 'withdraw', 'walkover'];
    let allOk = true, detail = [];
    for (const why of ends) {
      const W = _mkCostWorld({});
      const before = fe(W.atk);
      const okMob = W.war.warMobilize(W.atk, W.def, 'feud', 300, W.world.day);
      const w = W.world._warWars[0];
      if (!okMob || !w) { allOk = false; detail.push(why + ':동원실패'); continue; }
      const load = before - fe(W.atk);                       // 적재(식량등가)
      const days = w._packDays, per = w.force * WarCore.WAR_RATION;
      const eat = 3;                                          // 사흘 원정
      w._packRem = Math.max(0, w._packDays - eat);
      const surv = (why === 'rout') ? Math.round(w.force * 0.6) : w.force;   // 궤주 판만 전사자
      const after0 = fe(W.atk);
      const back = W.war.warRationRefund(w, why, surv);
      const got = fe(W.atk) - after0;
      const want = w._packRem_ ? 0 : (load * (eat < days ? (days - eat) / days : 0)) * (surv / w.force);
      const near = Math.abs(got - want) <= Math.max(0.5, want * 0.02);
      if (!near) { allOk = false; }
      detail.push(`${why} 적재 ${load.toFixed(0)} → 환급 ${got.toFixed(0)}(기대 ${want.toFixed(0)})`);
      // 두 번 부르면 또 주지 않는다(게이트)
      const twice = fe(W.atk); W.war.warRationRefund(w, why, surv);
      if (fe(W.atk) !== twice) { allOk = false; detail.push(why + ':이중환급'); }
    }
    ok(allOk, 'ⓘ 환급 합 = 적재 × 잔량비 × 생존비 — 넷 다(이중 환급 0)', detail.join(' · '));
    // 품목 그대로 — `food` 0 이어도 싣고, 돌려줄 때도 그 품목으로
    const W2 = _mkCostWorld({});
    const S = W2.atk.econ.storage; S.food = 0; S.fish = 400; S.meat = 200;
    const okMob2 = W2.war.warMobilize(W2.atk, W2.def, 'feud', 300, W2.world.day);
    const w2 = W2.world._warWars[0];
    ok(okMob2 && w2 && w2._packDays > 0, 'ⓘ `food` 0 이어도 팩이 찬다(곳간 품목으로)', w2 ? `팩 ${w2._packDays.toFixed(1)}일 · 뗀 품목 ${JSON.stringify(w2._packItems)}` : '동원 실패');
    const fishBefore = S.fish, foodBefore = S.food;
    w2._packRem = w2._packDays;                              // 하나도 안 먹고 돌아왔다
    W2.war.warRationRefund(w2, 'return', w2.force);
    ok(Math.abs(S.fish - fishBefore - (w2._packItemsGone || 0)) >= 0 && S.fish > fishBefore && S.food === foodBefore,
      'ⓘ 환급은 **뗀 품목 그대로**(생선으로 갚는다 — 곡물로 둔갑 안 함)', `생선 ${fishBefore.toFixed(0)}→${S.fish.toFixed(0)} · 곡물 ${S.food.toFixed(0)}`);
  }

  // ── ⓙ 품목 순서 = 섭식 정본 함수(심볼 하나) ────────────────────────────────
  say('\n[ⓙ] 품목은 마을이 먹는 그 함수가 고른다 — 사본 0');
  {
    const wcSrc = fs.readFileSync(path.join(ROOT, 'sim/war-core.js'), 'utf8');
    const vilSrc = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8');
    ok(/opts\.food/.test(wcSrc) && /consumeFood/.test(wcSrc), 'ⓙ war-core 는 주입받은 `consumeFood` 만 부른다(순서표 복제 0)');
    const ladder = /cooked_food[\s\S]{0,400}?fish[\s\S]{0,400}?meat/.test(wcSrc);
    ok(!ladder, 'ⓙ war-core 안에 식사 사다리(품목 순서)를 베낀 자리가 없다');
    ok(/food:\s*\{\s*consumeFood:\s*econ\.consumeFood/.test(vilSrc), 'ⓙ 서버가 econ 정본 함수를 그대로 주입한다');
    // 실제로 같은 순서인가 — 같은 곳간에서 econ 이 먹은 품목 = 군량이 뗀 품목
    const W = _mkCostWorld({});
    const S = W.atk.econ.storage;
    for (const r of ['food', 'fish', 'meat', 'cooked_food']) S[r] = 100;
    W.war.warMobilize(W.atk, W.def, 'feud', 300, W.world.day);
    const w = W.world._warWars[0];
    const took = (w && w._packItems) || {};
    const tookK = Object.keys(took).filter(k => took[k] > 0).sort();
    // 같은 곳간·같은 양을 **섭식 정본 함수**에 그대로 먹여 본다 — 품목도 양도 같아야 한다(같은 함수니까)
    const probe = econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 4, name: '대조' });
    for (const k in probe.storage) probe.storage[k] = 0;
    for (const r of ['food', 'fish', 'meat', 'cooked_food']) probe.storage[r] = 100;
    econ.consumeFood(probe, w ? w._packLoad : 0);
    const eatenM = probe._foodEaten || {};
    const eaten = Object.keys(eatenM).filter(k => eatenM[k] > 0).sort();
    const same = tookK.length > 0 && tookK.join(',') === eaten.join(',') && tookK.every(k => Math.abs(took[k] - eatenM[k]) < 1e-9);
    ok(same, 'ⓙ 군량이 뗀 품목·양 = 섭식 정본이 고른 그것(같은 함수)', `먹은 ${eaten.join(',')} · 군량 ${tookK.join(',')} · 양 ${(w ? w._packLoad : 0).toFixed(1)}`);
    // 미주입(랩·v1 CLI) = 종전 경로(곡물 한 칸)
    const L = _mkCostWorld({ noFood: true });
    const LS = L.atk.econ.storage; LS.food = 600; LS.fish = 300;
    const fish0 = LS.fish;
    L.war.warMobilize(L.atk, L.def, 'feud', 300, L.world.day);
    ok(LS.fish === fish0, 'ⓙ 미주입 팔은 종전대로 `food` 한 칸만 본다(랩 비트 보존)', `생선 ${fish0}→${LS.fish}`);
  }

  // ── ⓚ 죽은 칸 — `_laborMul` 동원 항 ───────────────────────────────────────
  say('\n[ⓚ] `_laborMul` — 동원 항은 지웠고 부상 노동력만 남는다(정적)');
  {
    const wcSrc = fs.readFileSync(path.join(ROOT, 'sim/war-core.js'), 'utf8');
    const vilSrc = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8');
    const wcWrites = (wcSrc.match(/_laborMul\s*=/g) || []).length;
    ok(wcWrites === 0, 'ⓚ war-core 의 `_laborMul` 쓰기 0(=_recomputeLabor 제거)', `${wcWrites}`);
    ok(!/_recomputeLabor/.test(wcSrc), 'ⓚ `_recomputeLabor` 심볼 0');
    const vilWrites = (vilSrc.match(/_laborMul\s*=/g) || []).length;
    ok(vilWrites === 1, 'ⓚ 생활층 쓰기는 한 줄뿐(부상 노동력 — 표에 남긴 예외)', `${vilWrites}`);
    ok(!/_warMobFrac[^\n]*_laborMul|_laborMul[^\n]*_warMobFrac/.test(vilSrc), 'ⓚ 그 한 줄에 동원 항(`_warMobFrac`)이 없다');
    // 대조 — 엔진은 `_laborMul` 을 **실제로 읽는다**(그래서 두 기구가 겹치면 이중 감산이었다)
    const esSrc = fs.readFileSync(path.join(ROOT, 'sim/economy-sim.js'), 'utf8');
    ok(/\(v\._laborMul \|\| 1\)/.test(esSrc), 'ⓚ ★대조 — 생산 식이 `_laborMul` 을 읽는다(미소비가 아니었다 · T284 회부 정정)');
    ok(/if \(npc\._warDraft\) continue;/.test(esSrc), 'ⓚ 생산 제외는 엔진 한 줄(`_warDraft`)이다');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ★★[T329] ⓜ~ⓟ — 위협 함수 T 가 봉쇄를 대신한다
//   재는 것: T 단조(가까워지면 오른다 · 멀어지면 내린다 · 병력비) · R_out 연속(칼로 나뉘는 값 0) ·
//            `_siege*` 심볼 0(정적) · 몸값 품목 = 섭식 정본 순서.
// ══════════════════════════════════════════════════════════════════════════════
function threatPart() {
  say('\n[ⓜ] 위협 T — 거리·접근·병력비 · 연속');
  // 하네스는 **운영 함수 그대로**를 부른다: _run 이 만든 목 존의 H(=__p3Bind)와 war-live.
  const S = runScenario({ seed: 61, viewer: true, scenario: 'assault', warId: 61, probeThreat: true });
  const th = S.threat || {};
  ok(th.rows && th.rows.length >= 3, 'ⓜ 전제 — 군대가 다가오는 동안 T 를 여러 번 쟀다', `표본 ${th.rows ? th.rows.length : 0}`);
  ok(th.zeroFar === 0, 'ⓜ 경보 거리 밖에서는 T = 0', `먼 자리 T ${th.zeroFar}`);
  ok(th.monoUp, 'ⓜ 가까워지면 T 가 오른다(단조)', th.upTrace || '');
  ok(th.monoDown, 'ⓜ 멀어지면 T 가 내린다', th.downTrace || '');
  ok(th.oddsUp > th.oddsLo, 'ⓜ 병력비 — 병력이 많을수록 T 가 크다(같은 자리·같은 속도)', `약군 ${th.oddsLo.toFixed(3)} < 대군 ${th.oddsUp.toFixed(3)}`);
  ok(th.maxT <= 1 && th.minT >= 0, 'ⓜ T ∈ [0,1]', `min ${th.minT.toFixed(3)} · max ${th.maxT.toFixed(3)}`);

  say('\n[ⓝ] R_out = 영토 × (1−T) — 연속(칼로 나뉘는 값 0)');
  {
    // T 를 0 → 1 로 훑으며 R_out 배수와 현장 수를 잰다. 같은 함수(_warOutMul·_lifeJobSites)를 그대로 부른다.
    const S2 = runScenario({ seed: 62, viewer: true, scenario: 'assault', warId: 62, probeRout: true });
    const r = S2.rout || {};
    ok(r.mulRows && r.mulRows.length === 11, 'ⓝ 전제 — T 열한 칸(0.0~1.0)을 훑었다', `${r.mulRows ? r.mulRows.length : 0}칸`);
    ok(r.mulOk, 'ⓝ R_out 배수 = 1−T (정확)', r.mulTrace || '');
    ok(r.contOk, 'ⓝ 연속 — 이웃한 두 T 사이 현장 수 차이가 그 T 차이에 비례(칼로 나뉘는 값 0)', r.contTrace || '');
    ok(r.zeroSame, 'ⓝ T=0 이면 현장 목록이 **평시와 한 글자도 안 다르다**(곱이 항등)', r.zeroTrace || '');
    ok(r.oneEmpty, 'ⓝ T=1 이면 마을 밖 현장이 0(마을 안에서만 — 상태가 아니라 반경이 0)', r.oneTrace || '');
  }

  say('\n[ⓞ] 봉쇄 상태·배수 — 심볼 0(정적)');
  {
    const wcSrc = fs.readFileSync(path.join(ROOT, 'sim/war-core.js'), 'utf8');
    const esSrc = fs.readFileSync(path.join(ROOT, 'sim/economy-sim.js'), 'utf8');
    const v2Src = fs.readFileSync(path.join(ROOT, 'sim/economy-sim-v2.js'), 'utf8');
    const code = (t) => t.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');   // 주석 줄은 뺀다(역사 주석은 남긴다)
    for (const [nm, src] of [['war-core', wcSrc], ['economy-sim', esSrc], ['economy-sim-v2', v2Src]]) {
      const c = code(src);
      const hits = (c.match(/_siegeBlock|_siegeOutMul|_siegeM\b|_recomputeSiege|SIEGE_OUTDOOR_JOBS|WAR_SIEGE_OUTMUL/g) || []).length;
      ok(hits === 0, `ⓞ ${nm} 에 봉쇄 상태·배수 심볼 0`, `${hits}`);
    }
    ok(!/WAR_OPS/.test(code(wcSrc)), 'ⓞ `WAR_OPS` 손잡이 0(폴백 세계가 없다)');
    ok(/_warThreat/.test(code(v2Src)), 'ⓞ 캐러밴이 **같은 T** 를 읽는다(econ v2 기대손실)');
  }

  say('\n[ⓟ] 포로 몸값 — 곳간 품목(섭식 정본 순서)');
  {
    const wcSrc = fs.readFileSync(path.join(ROOT, 'sim/war-core.js'), 'utf8');
    ok(/_warFoodMove\(he, e, m \* WAR_CAP_RANSOM_FOOD\)/.test(wcSrc), 'ⓟ 몸값이 `storage.food` 한 칸이 아니라 품목 이동 함수를 쓴다');
    ok(!/he\.storage\.food -= m \* WAR_CAP_RANSOM_FOOD/.test(wcSrc), 'ⓟ 옛 한 칸 차감 줄 0');
    // 몸값·약탈·공납·조공·군량이 **같은 이동 함수 하나**를 지난다(정적 — 사본 0)
    const movers = (wcSrc.match(/_warFoodMove\(/g) || []).length;
    ok(movers >= 4, 'ⓟ 곳간→곳간 식량 이동이 한 함수(`_warFoodMove`)로 모였다', `호출 ${movers}곳(약탈·공납·조공·몸값)`);
    // 동적 — `food` 0 · 생선만 있는 마을이 공납을 내면 **생선으로** 간다(같은 이동 함수)
    const W = _mkCostWorld({});
    const D = W.def.econ.storage, A = W.atk.econ.storage;
    for (const k of ['food', 'fish', 'meat', 'cooked_food', 'vegetable']) { D[k] = 0; A[k] = 0; }
    D.fish = 500;
    const aFish0 = A.fish;
    W.war._opDoSurrender(W.atk, W.def, W.world.day);
    ok(A.fish > aFish0 && A.food === 0 && D.fish < 500, 'ⓟ `food` 0 마을의 공납이 생선으로 건너간다(곡물로 둔갑 0)', `공격 생선 ${aFish0} → ${A.fish.toFixed(0)} · 방어 ${D.fish.toFixed(0)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ★★[T364] ⓠ~ⓡ — 지나가는 군대를 옆 마을이 본다 · 행군로가 숲을 본다
// ══════════════════════════════════════════════════════════════════════════════
function neighborPart() {
  say('\n[ⓠ] 옆 마을 — 목표가 아니어도 경보 거리 안이면 본다 · 지나가면 잔류 0');
  {
    const S = runScenario({ seed: 71, viewer: true, scenario: 'assault', warId: 71, probeNeighbor: true });
    const nb = S.neighbor || {};
    ok(nb.rows && nb.rows.length >= 3, 'ⓠ 전제 — 군대가 옆 마을 곁을 지나는 동안 여러 번 쟀다', `표본 ${nb.rows ? nb.rows.length : 0}`);
    ok(nb.maxSide > 0, 'ⓠ **목표가 아닌 마을**의 T 가 0 보다 커진다(지나가는 군대를 본다)', `옆 마을 T 최대 ${(nb.maxSide || 0).toFixed(3)} · 그때 R_out 배수 ${(1 - nb.maxSide).toFixed(3)}`);
    ok(nb.sideCount >= 1, 'ⓠ T > 0 이 된 비목표 마을 수', `${nb.sideCount}곳 · 목표 포함 ${nb.onCount}곳`);
    ok(nb.leftZero, 'ⓠ 군대가 지나간 뒤 그 마을 T 는 **0 으로 돌아온다**(잔류 0)', nb.leftTrace || '');
    ok(nb.defAlsoOn, 'ⓠ 목표 마을도 그대로 본다(옛 규칙을 잃지 않았다)', `목표 T ${(nb.defT || 0).toFixed(3)}`);
    ok(nb.scanTrace, 'ⓠ 부하 — 거리 술어로 거른다(전쟁 × 마을 hypot 한 번)', nb.scanTrace);
  }

  say('\n[ⓡ] 행군로 — 숲을 보고 돌아간다(같은 탐색 · 새 코스트 0)');
  {
    const S = runScenario({ seed: 72, viewer: true, scenario: 'assault', warId: 72, probeRoute: true });
    const r = S.route || {};
    ok(r.rows && r.rows.length === 3, 'ⓡ 전제 — 행군로 세 판(마을쌍 셋)을 전/후로 쟀다', r.trace || '');
    ok(r.allLonger, 'ⓡ 숲을 보면 길이 **길어진다**(돌아간다 · 세 판 다)', r.trace || '');
    ok(r.oldSame, 'ⓡ ★대조 — 나무 술어 미주입이면 **옛 길 그대로**(한 점도 안 다르다)', r.oldTrace || '');
    ok(r.avoidOk, 'ⓡ 숲을 보는 길은 나무 칸을 **덜 지난다**', r.avoidTrace || '');
    const vilSrc = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8');
    ok(/_warRoutePts/.test(vilSrc) && /computeRoutePts\(x0, y0, x1, y1, extraBlk\)/.test(vilSrc), 'ⓡ 탐색은 **같은 함수**다 — 술어 하나만 더 받는다(사본 0)');
    ok(!/getRoute\(w\.atk, w\.def\)/.test(vilSrc), 'ⓡ 전쟁 몸이 교역 캐시를 안 쓴다(캐러밴 길 무접촉)');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ★★[T403] ⓢ~ⓣ — 무기 반출/반납 장부(1층 · 몸 무접촉)
// ════════════════════════════════════════════════════════════════════════════
function armsPart() {
  const prevK = process.env.T403_ARMS_LEDGER;
  const setK = (on) => { if (on) process.env.T403_ARMS_LEDGER = '1'; else delete process.env.T403_ARMS_LEDGER; };
  // 한 원정 — 같은 씨로 세계를 짓고(곳간 무기 wA·wD) 동원 → (결판) → 귀환 도착까지. 끈 팔/켠 팔을 같은 씨로 나란히.
  const expedition = (on, cfg) => {
    setK(on);
    Math.random = seeded(cfg.seed);
    const W = _mkCostWorld({ atkPop: cfg.atkPop, defPop: cfg.defPop });
    Math.random = _origRandom;
    const A = W.atk.econ, D = W.def.econ;
    A.storage.weapon = cfg.wA; D.storage.weapon = cfg.wD; D._warCd = 1e9;   // 방어 마을이 되받아 선포하지 않게(판 하나만)
    const r = { a0: A.storage.weapon };
    r.ok = W.war.warMobilize(W.atk, W.def, 'feud', 300, W.world.day);
    const w = W.world._warWars[0];
    if (!r.ok || !w) return r;
    r.force = w.force; r.arms = w._arms ? Object.assign({}, w._arms) : null; r.aMob = A.storage.weapon;
    if (cfg.battle) { W.war.warResolveBattle(w, W.world.day); const st = W.world._warStats || {}; r.atkWin = (st.atkWin | 0) > 0; }
    r.aBat = A.storage.weapon;
    w.phase = 'return'; w.eta = W.world.day; W.war.daily(W.world.day);   // 귀환 도착 — 환급 한 곳과 같은 문
    r.left = W.world._warWars.length; r.aEnd = A.storage.weapon; r.dEnd = D.storage.weapon;
    r.back = w._arms ? w._arms.back : null;
    r.again = WarCore.warArmsReturn(w);                                   // 두 번 부르면 0
    r.aAgain = A.storage.weapon;
    return r;
  };
  const near = (a, b) => Math.abs(a - b) <= 1e-9;

  say('\n[ⓢ] 소집 = 곳간에서 꺼낸다 — n = min(병력, floor 재고) · 모자라면 민병 · 방어 소집은 안 건다');
  {
    const off = expedition(false, { seed: 7, atkPop: 30, defPop: 24, wA: 40, wD: 40 });
    ok(off.ok && off.aMob === 40 && off.arms === null, 'ⓢ ★대조 — 끔이면 동원해도 곳간 무기 무변 · 짐 필드 0', `재고 ${off.a0}→${off.aMob} · _arms ${off.arms}`);
    const on = expedition(true, { seed: 7, atkPop: 30, defPop: 24, wA: 40, wD: 40 });
    ok(on.ok && on.arms && on.arms.out === on.force && near(on.aMob, 40 - on.force) && on.arms.militia === 0,
      'ⓢ 켬 — 곳간 −n(n = 병력 · 재고 넉넉) · 민병 0', on.arms ? `병력 ${on.force} · 반출 ${on.arms.out} · 곳간 ${on.a0}→${on.aMob}` : '동원 실패');
    const low = expedition(true, { seed: 7, atkPop: 30, defPop: 24, wA: 5.6, wD: 40 });
    ok(low.ok && low.arms && low.arms.out === 5 && low.arms.militia === low.force - 5 && near(low.aMob, 0.6),
      'ⓢ 재고 부족 — 있는 만큼(한 사람 한 자루 · floor) · 나머지는 민병 수로 적는다', low.arms ? `병력 ${low.force} · 반출 ${low.arms.out} · 민병 ${low.arms.militia} · 곳간 5.6→${low.aMob.toFixed(1)}` : '동원 실패');
    // 방어 소집 — 마을 안에서 들고 마을 안에서 내려놓는다(장부 무변)
    setK(true);
    const Wd = _mkCostWorld({}); const dw0 = Wd.def.econ.storage.weapon;
    WarCore.conscript(Wd.def, 'full', { defense: true });
    ok(Wd.def.econ.storage.weapon === dw0, 'ⓢ 방어 소집은 곳간을 안 건드린다(같은 날 들고 내려놓는다)', `${dw0}→${Wd.def.econ.storage.weapon}`);
    // 편성은 안 바뀐다(1층 = 장부만 · 몸 무접촉)
    ok(off.force === on.force, 'ⓢ 편성·병력 무변 — 장부만 옮긴다(끔/켬 병력 같다)', `${off.force} / ${on.force}`);
  }

  say('\n[ⓣ] 복귀 = 내려놓는다 — 잃은 몫은 결판 규칙(드랍·투기)이 짐에서 · 귀환 뒤 곳간 = 끔 · 이중 반납 0');
  {
    // ① 결판 없이 귀환(철수·무혈 항복 꼴) — 전부 돌아온다
    const on = expedition(true, { seed: 7, atkPop: 30, defPop: 24, wA: 40, wD: 40 });
    ok(on.left === 0 && on.back === on.arms.out && near(on.aEnd, 40), 'ⓣ 결판 없는 귀환 — 반출분 전부 반납(곳간 원상)', `반출 ${on.arms.out} · 반납 ${on.back} · 곳간 ${on.aEnd}`);
    ok(on.again === 0 && near(on.aAgain, on.aEnd), 'ⓣ 두 번 부르면 0 — 이중 반납 없다', `둘째 ${on.again}`);
    // ② 공격이 졌다 — 드랍·투기가 짐에서 빠지고, 귀환 뒤 곳간은 끔과 같다
    const cL = { seed: 7, atkPop: 30, defPop: 24, wA: 40, wD: 40, battle: true };
    const offL = expedition(false, cL), onL = expedition(true, cL);
    ok(onL.ok && offL.ok && onL.atkWin === false && offL.atkWin === false, 'ⓣ 전제 — 두 팔 다 방어 승(같은 씨 · 같은 결판)', `끔 ${offL.atkWin} · 켬 ${onL.atkWin}`);
    ok(onL.back < onL.arms.out && near(onL.aBat, 40 - onL.arms.out), 'ⓣ 공격 패 — 잃은 무기는 **짐에서** 빠진다(원정 중 곳간은 반출 뒤 그대로)',
      `반출 ${onL.arms.out} · 반납 ${onL.back.toFixed(2)} · 결판 직후 곳간 ${onL.aBat}`);
    ok(near(onL.aEnd, offL.aEnd) && near(onL.dEnd, offL.dEnd), 'ⓣ ★대조 — 귀환 뒤 공격·방어 곳간 = 끔과 같다(재고 ≥ 병력 · 다른 것은 원정 **동안**뿐)',
      `공 ${offL.aEnd.toFixed(3)} / ${onL.aEnd.toFixed(3)} · 방 ${offL.dEnd.toFixed(3)} / ${onL.dEnd.toFixed(3)}`);
    ok(offL.aBat < 40 && onL.aBat < offL.aBat, 'ⓣ ★대조 — 끔은 결판에서 **집 곳간**이 깎이고 켬은 반출 순간 깎인다(원정 동안의 차이)',
      `결판 직후 곳간 끔 ${offL.aBat.toFixed(2)} · 켬 ${onL.aBat}`);
    // ③ 공격이 이겼다 — 종전에도 승자는 제 무기를 잃지 않았다 ⇒ 전부 돌아온다
    const cW = { seed: 3, atkPop: 50, defPop: 10, wA: 60, wD: 5, battle: true };
    const offW = expedition(false, cW), onW = expedition(true, cW);
    ok(onW.atkWin === true && offW.atkWin === true && onW.back === onW.arms.out && near(onW.aEnd, offW.aEnd),
      'ⓣ 공격 승 — 반출분 전부 반납 · 귀환 뒤 곳간 = 끔', `반출 ${onW.arms ? onW.arms.out : '?'} · 반납 ${onW.back} · 곳간 끔 ${offW.aEnd.toFixed(3)} / 켬 ${onW.aEnd.toFixed(3)}`);
    // ④ 정적 — 흐름 함수는 빼는 자리만 바뀌었다(규칙 수 무변 · 새 수 0)
    const wcSrc = fs.readFileSync(path.join(ROOT, 'sim/war-core.js'), 'utf8');
    const fn = wcSrc.slice(wcSrc.indexOf('function warWeaponFlow('), wcSrc.indexOf('function warWeaponFlow(') + 1800);
    ok(/_src\.weapon = lw0 - loss;/.test(fn) && !/loserE\.storage\.weapon =/.test(fn) && /WAR_SALV_DEAD/.test(fn) && /WAR_SALV_DESERT/.test(fn),
      'ⓣ `warWeaponFlow` — 패자 몫을 빼는 자리 하나(곳간 또는 짐) · 회수 규칙(0.7/0.5) 그대로');
  }
  if (prevK == null) delete process.env.T403_ARMS_LEDGER; else process.env.T403_ARMS_LEDGER = prevK;
}
