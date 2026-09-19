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
  const mkVil = (name, c, dbId, pop) => {
    const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name });
    e.storage.weapon = 20; e.storage.stone = 200;
    // 집 자리(스폰) — 마을 뒤쪽(돌격로 반대편)에 둔다: 병사가 처음부터 장애물 안에서 나오지 않게
    const back = dbId === 1 ? -1 : 1;
    const housesPx = [0, 1, 2, 3].map(i => ({ x: (c.cx + back * (14 + i * 3)) * SZ + SZ / 2, y: (c.cy - 6 + i * 4) * SZ + SZ / 2 }));
    return { dbId, name, ccx: c.cx, ccy: c.cy, econ: e, npcPids: [], housesPx };
  };
  const atk = mkVil('공격A', A_C, 1, 22), def = mkVil('방어B', B_C, 2, 18);
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
  for (const v of villages) H.syncVillagePop(v, Infinity);
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

  const tr = { badSpawn, blockedTicks: 0, fightTicks: 0, engagedAt: -1, standoffAt: -1, reengagedAt: -1, resolveAtStandoff: -1,
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
    if (body && body.ended && !tr.ended) { tr.ended = body.ended; tr.endT = t; tr.endHit = tr.hitrun; }
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
  tr.bcast = { war: bcast.filter(m => m.type === 'war_battle').length, phases: [...new Set(bcast.filter(m => m.type === 'war_battle').map(m => m.phase))] };
  return tr;
}

(async () => {
  if (process.env.WW_ONLY) { const r = runScenario({ seed: 31, viewer: false, scenario: process.env.WW_ONLY, maxTicks: 30 * 60 * 20 }); say(JSON.stringify({ ended: r.ended, counts: r.counts, stat: r.stat, fight: r.fightTicks, blocked: r.blockedTicks })); process.exit(0); }
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
  // 자명 통과 금지 — 다른 씨는 다른 결과를 낸다(해시가 뭔가를 보고 있다)
  const other = runScenario({ seed: 99, viewer: true, scenario: 'assault', warId: 21 });
  ok(sig(other) !== sig(first), 'ⓓ ★대조 — 씨가 다르면 결과가 다르다(대조가 실제로 무는 비교)');

  // ── ⓗ~ⓚ 동원의 대가(T295) ────────────────────────────────────────────────
  costPart();

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
  const waitHttp = async (url, tries) => { for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(500); } return false; };
  boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET });
  boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT), CENTRAL_SECRET: SECRET,
    ENABLE_VILLAGES: '1', VILLAGE_MAX: process.env.WAR_WORLD_VILLAGES || '8', VILLAGE_DAY_MS: '60000', ENABLE_BANDITS: '0',
    WAR_FIXTURE: 'assault', WAR_FIXTURE_DAY: '1', VILLAGE_WAR_LOG: '1' }, ['ignore', out, out]);
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
