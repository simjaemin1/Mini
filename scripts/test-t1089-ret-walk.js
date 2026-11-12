#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-t1089-ret-walk.js — 귀환 몸이 집까지 걸어 온다(`T1089_RET_WALK` 켬 기본 후보) ==========
//
// ★왜 [지시 T1089 · T1042 회부 1위 "방어 몸 멀리" 25마디 · 캐논 "모든 NPC 는 일관된 몸 — 몸이 걸어 돌아온다 · 순간이동 0"]
//   T681 장부 귀환은 귀환 대형의 원점을 그날 장부 자리(귀환 첫날 = 길 머리 = 방어 마을 중심)에 두고, 이튿날 경계에 장부가 집에 닿으면 그 자리에서 풀었다 —
//   살아 돌아온 몸은 **적 마을 중심에서 풀린다**(집은 장부만 갔다). 판 자(빠른 시계)에선 생활층이 그 몸을 못 걸려 그 마을의 하나뿐인 몸이 남의 큰집에 남는다.
//   지키는 것:
//     ⓐ 정적 — 손잡이 문 하나(`!== '0'`) · 종전 귀환 줄 글자 그대로(+ 한 줄씩) · 걷는 점 = 몸 걸음(`_t790Mark` 같은 값) · 풀기 = 종전 그 함수(`_warCleanupBody`) ·
//        걸음 몫 = 종전 그대로(판 자 손잡이 T941 켬일 때만 걷는 귀환 날도 운영 하루 몫 — `_t941Q` 술어 한 자리) · 새 수 0(길 끝 0.5px 는 종전 그 문턱)
//     ⓑ 실경로(war-core 결단 · villages 몸 · war-live 교전 · battle-core) — 공격 마을 A(100,100) · 방어 마을 B(460,100) · 공격이 지고 몸 하나가 살아 돌아간다:
//        잼 = 귀환 대형 **걸음마다**(villages `_warPaceReturn` 이 부르는 war-live 문 `_muStepFollow` — 존 틱 · 하루 마감 채움 둘 다 같은 문)의 몸 옮김 · 그 걸음 뒤 칸
//        ★끔(`=0`) = 증인 — 첫 걸음에 결판 자리에서 길 머리(B 마을 중심)로 놓이고(한 걸음 2칸 넘게) · B 회관 발자국(막힌 칸)에 서 있다가 · 집에서 300칸 넘게 떨어진 그 자리에서 풀린다
//        ★켬(미설정 = 기본) = 걸어서 집 13칸 안에서 풀린다 · 한 걸음 2칸 넘는 걸음 0(순간이동 0) · 막힌 칸 걸음 0 · 귀환 걸음 합 ≥ 300칸 · 켬 `'1'` = 미설정 · 끔과 다르다
//     ⓒ 판 자 꼴(`T941_BATTLE_DAY=1` — 교전 하루 = 운영 하루 · 교전도 귀환도 하루 마감에서 걷는다) — 끔 = 같은 증인 · 켬 = 같은 걸음
//     ⓓ 결정론 — 같은 판 두 번 = 바이트 같다(하루 마감 첫 자리 `_t681Flush` 를 'retry' 가 그칠 때까지 — 존과 같은 차례)
//     ⓔ 걸음 정본이 없는 판(`deps.moveSpeed` 없음) — 켬 = 끔 한 글자(T790 그 규칙)
// ⚠존을 부팅하지 않는다 — 정본(battle-core · war-live · war-core · villages `__p3Bind`)을 그대로 부른다(규칙 사본 0). 손잡이는 모듈을 싣는 순간 읽는다 ⇒ 판마다 아이 프로세스.
// 실행: node scripts/test-t1089-ret-walk.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const KNOBS = ['T1089_RET_WALK', 'T941_BATTLE_DAY', 'T1060_SCRAM_HOLD', 'T1060_ATK_AIM', 'T1044_SCRAM_WALK', 'T790_NO_SNAP', 'T844_RET_QUOTA', 'T1019_UNTRAP', 'T1019_ASSAULT_HP', 'T956_ASSAULT_MISS', 'T771_SORTIE_MISS'];
const r2 = (x) => Number.isFinite(x) ? Math.round(x * 100) / 100 : null;

// ── 아이 판 — 공격 마을 A(100,100) · 농성 마을 B(460,100) · 전쟁 하나(돌격 정책) · B 몸은 회관 북쪽 150칸(긴급 소집이 걸어 온다) ──
if (process.env.T1089_SUB === 'war') {
  const P = JSON.parse(process.env.T1089_P || '{}');
  const econ = R('sim/economy-sim.js'), WarCore = R('sim/war-core.js'), WarLive = R('server/war-live.js'), BC = R('sim/battle-core.js'), SimVillages = R('server/villages.js');
  const SZ = 32;
  let s = 7; Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };   // 판마다 같은 줄(test-war-world 꼴)
  const A_C = { cx: 100, cy: 100 }, B_C = { cx: 460, cy: 100 };
  const ZS = fs.readFileSync(path.join(ROOT, 'server/zone.js'), 'utf8');
  const MOVE = parseInt((ZS.match(/const MOVE_SPEED = (\d+);/) || [])[1], 10);   // 존 걸음 정본(px/s) — 존이 villages 에 넘기는 그 값(`deps.moveSpeed`)
  const scn = (/function _standCellNear\(x0, y0, blocked\) \{[\s\S]*?\n\}/.exec(ZS) || [''])[0];   // 존 나선 정본 글자 그대로(T541 ⓑ · 사본 0)
  const standCellNear = new Function('ZONE', '_BLOCKED_STAND', scn + '\nreturn _standCellNear;')({ zoneWidth: 1e7, zoneHeight: 1e7 }, () => false);
  const players = new Map(), npcs = new Set(); let _pid = 1;
  const JOBS = ['warrior', 'hunter', 'farmer', 'fisher', 'miner', 'forager', 'lumberjack', 'mason'];
  const deps = {
    players, npcs, broadcast: () => {},
    spawnNpc: (o) => { const pid = 'p' + (_pid++); const p = { pid, x: o.x, y: o.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: JOBS[_pid % JOBS.length] }; players.set(pid, p); npcs.add(pid); return p; },
    anyViewerNear: () => false, isPositionActive: () => false, isBlockedByWall: () => false,
    setHp: require('./lib-hp-door').makeSetHp(() => {}),
    isTerrainBlockedLocal: () => false, isWaterTileLocal: () => false, tickHz: 30, moveSpeed: P.noSpeed ? undefined : MOVE, standCellNear,   // noSpeed = 걸음 정본이 없는 판(하네스 목)
  };
  const mkVil = (name, c, dbId, pop) => {
    const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name });
    e.storage.weapon = 20; e.storage.stone = 200;
    const back = dbId === 1 ? -1 : 1;
    const housesPx = [0, 1, 2, 3].map(i => ({ x: (c.cx + back * (14 + i * 3)) * SZ + SZ / 2, y: (c.cy - 6 + i * 4) * SZ + SZ / 2 }));
    return { dbId, name, ccx: c.cx, ccy: c.cy, econ: e, npcPids: [], housesPx };
  };
  const atk = mkVil('공격A', A_C, 1, 22), def = mkVil('농성B', B_C, 2, 18);
  def.econ.land.size = 400;   // 마을권이 주둔 링보다 넓다 — 돌격 결단 그 자리에서 긴급 소집(S1)
  const villages = [atk, def];
  const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 1 };
  const db = { getVillageStructRows: () => [] };
  let H = null;
  const war = WarCore.createWar({ villages, world, seed: 7, infoRange: 5000, centerOf: v => ({ cx: v.ccx, cy: v.ccy }),
    territoryOf: v => (v.econ.land && v.econ.land.size ? v.econ.land.size * 25 : 2800), log: null,
    onEngage: (w, day, why) => H._warEngage(w, day, why), rationEat: (w, day) => H._warRationEat(w, day), rationCollect: (w) => H._warRationCollect(w), lootCarry: (w, items, kind) => H._warLootAccept(w, items, kind) });
  const rel = [];   // 결속이 풀리는 순간(war-core 문 — villages `_warReleasePid` · `_warDespawnPid` 가 부른다) — 그 몸 자리
  { const f = war.warDraftReleasePid; war.warDraftReleasePid = function (vil, pid) { const p = players.get(pid); if (p) rel.push({ vil: vil.name, pid, day: world.day, dead: p.hp != null && p.hp <= 0 ? 1 : 0, home: r2(Math.hypot(p.x / SZ - vil.ccx, p.y / SZ - vil.ccy)), at: [r2(p.x / SZ), r2(p.y / SZ)] }); return f.apply(this, arguments); }; }
  const dayMs = 30000;
  H = SimVillages.__p3Bind({
    ready: true, zoneId: 'test', deps, villages, byDbId: new Map(villages.map(v => [v.dbId, v])), byEcon: new Map(villages.map(v => [v.econ, v])),
    war, warCore: WarCore, world, db, warBodies: new Map(), routeCache: new Map(), _route: null, _distCtx: null, roads: null, pathfind: R('server/pathfind.js'),
    epoch: 0, dayMs, lastGameDay: world.day, _warThreatBuf: null, _warRects: null, _warRectCells: null, _warNoCollide: false,
    _warStat: { engage: 0, standoff: 0, rout: 0, withdraw: 0, withdrawQuiet: 0, surrender: 0, walkover: 0, noArmy: 0, engageErr: 0 },
    _warPerf: { ring: new Array(3000).fill(0), i: 0, n: 0, max: 0, soldiers: 0, soldiersMax: 0, fighting: 0 }, _t476Stat: null, _t476Kill: null, ledger: null,
  });
  const WL = WarLive.createWarLive({ BC, dayOf: () => world.day, cellPx: SZ, pxPerM: SZ, tickHz: 30, resolveBattle: (w, day, pre) => war.warResolveBattle(w, day, pre), blockedCell: (cx, cy) => H._warBlockedCell(cx, cy) });
  H.state.warLive = WL;
  { const _n = Date.now, _t = world.day * dayMs + 1; Date.now = () => _t; try { for (const v of villages) H.syncVillagePop(v, Infinity); } finally { Date.now = _n; } }
  H._warBuildRectIndex();
  def.npcPids.forEach((pid, i) => { const p = players.get(pid); p.x = (B_C.cx + (i % 3) * 2) * SZ + SZ / 2; p.y = (B_C.cy - 150 + ((i / 3) | 0) * 2 - 6) * SZ + SZ / 2; });
  const comp = WarCore.conscript(atk, 'full', {}).composition;
  const w = { id: 1, atk, def, casus: 'feud', force: 12, warriors: 2, composition: comp, weapQ: 0.5, phase: 'march', op: 'march', eta: world.day + 1, marchDays: 1, born: world.day, _packDays: 12, _packRem: 12, _opPolicy: 'assault' };
  def._defPolicy = 'hold'; w._defMode = 'hold'; w._defModeDay = world.day;
  war.WARS.push(w);
  const out = { end: null, endDay: null, ret: null, units: [], bad: 0, rel: null, relT: null, stat: null, knob: process.env.T1089_RET_WALK == null ? null : process.env.T1089_RET_WALK };
  const U = new Map();   // A 몸(pid) → 귀환 걸음 셈
  // 귀환 대형 한 걸음 = villages `_warPaceReturn` 이 부르는 war-live 문(`state.warLive._muStepFollow`) — 존 틱이든 하루 마감 채움(`_t681Flush`)이든 같은 문 ⇒ **걸음마다** 잰다
  //   (빠른 시계에선 그날 남은 몫을 하루 마감이 한꺼번에 걷는다 — 틱 사이 자리 차는 걸음 차가 아니다 · T941 교전 하루와 같은 꼴)
  { const f = WL._muStepFollow; WL._muStepFollow = function (g) {
      const b = H.state.warBodies.get(w.id), on = !!(b && g && g === b.retGroup && b.phase === 'return');
      const pre = on ? g.units.map((u) => [u.x, u.y]) : null;
      const r = f.apply(this, arguments);
      if (on) {
        if (!out.ret) out.ret = { day: world.day, n: g.units.length, len: r2(b.len / SZ) };
        if (!out.end && b.ended) { out.end = b.ended; out.endDay = world.day; }
        g.units.forEach((u, i) => {
          if (u.dead || u.pid == null) return;
          let x = U.get(u.pid); if (!x) { x = { pid: u.pid, x0: [r2(pre[i][0]), r2(pre[i][1])], mx: 0, walked: 0, n: 0 }; U.set(u.pid, x); out.units.push(x); }
          const st = Math.hypot(u.x - pre[i][0], u.y - pre[i][1]); if (st > x.mx) x.mx = st; x.walked += st; x.n++;
          if (H._warBlockedCell(u.x, u.y)) out.bad++;
        });
      }
      return r;
    }; }
  let now = world.day * dayMs + 1, dayAt = now;
  const stepMs = 1000 / 30, maxTicks = P.maxTicks || 30 * 60 * 6;
  for (let t = 0; t < maxTicks; t++) {
    now += stepMs;
    H.tickWarBodies(now);
    if (now - dayAt >= dayMs) {
      if (H.T681_ON) { let k = 0; while (H._t681Flush() === 'retry' && k++ < 1e6); }   // 존과 같은 차례 — 조각 예산이 차면 이어 간다(벽시계와 무관하게 그날 몫을 다 쓴다)
      dayAt = now; world.day++; H.state.lastGameDay++;
      const sb = (war.stats().surrender) || 0;
      war.daily(world.day); H._warAfterDaily(sb);
      if (H.T681_ON) H._t681Day(now);
    }
    const aRel = rel.filter((r) => r.vil === atk.name && !r.dead);
    if (out.end && aRel.length && !H.state.warBodies.has(w.id)) { out.rel = aRel; out.relT = t; break; }
  }
  for (const x of out.units) { x.mx = r2(x.mx); x.walked = r2(x.walked); }
  out.stat = { t1089Late: H.state._warStat.t1089Late || 0 };
  out.knobOn = H.T1089_RET_WALK;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (src) => src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const CV = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
const CW = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'war-live.js'), 'utf8'));
const CB = codeOf(fs.readFileSync(path.join(ROOT, 'sim', 'battle-core.js'), 'utf8'));
const CC = codeOf(fs.readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8'));
const fnBody = (C, name) => { const i = C.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = C.indexOf('{', i); for (let k = j; k < C.length; k++) { if (C[k] === '{') d++; else if (C[k] === '}') { d--; if (!d) return C.slice(i, k + 1); } } return ''; };
const sub = (env, P) => { const E = Object.assign({}, process.env, { T1089_SUB: 'war' }); for (const k of KNOBS) delete E[k]; E.T790_NO_SNAP = '0'; E.T941_BATTLE_DAY = '0'; E.T627_TRIP_DAY = '0'; delete E.T1089_P; Object.assign(E, env || {}); if (P) E.T1089_P = JSON.stringify(P);
  const o = execFileSync(process.execPath, [__filename], { cwd: ROOT, env: E, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString(); return JSON.parse(o.slice(o.indexOf('{"end"'))); };
const strip = (o) => JSON.stringify(Object.assign({}, o, { knob: null, knobOn: null }));
const sum = (o) => JSON.stringify({ end: o.end, endDay: o.endDay, ret: o.ret, rel: o.rel, relT: o.relT, bad: o.bad, u: o.units.map((x) => [x.x0.join(','), x.mx, x.walked].join(':')), stat: o.stat });
console.log('\n=== 귀환 몸이 집까지 걸어 온다 — T1089 ===');

// ── ⓐ 정적 ──────────────────────────────────────────────────────────────────
console.log('\n[ⓐ] 정적 — 손잡이 하나 · 종전 줄 그대로 · 새 수 0');
const setup = fnBody(CV, '_warSetupReturn'), pace = fnBody(CV, '_warPaceReturn'), dayF = fnBody(CV, '_t681Day'), home = fnBody(CV, '_t1089Home'), step = fnBody(CV, '_t1089Step'), q941 = fnBody(CV, '_t941Q'), take = fnBody(CV, '_t681Take'), flush = fnBody(CV, '_t681Flush');
ok(/const T1089_RET_WALK = process\.env\.T1089_RET_WALK !== '0';/.test(CV) && (CV.match(/process\.env\.T1089_RET_WALK/g) || []).length === 1 && !/T1089/.test(CW + CB + CC),
  "ⓐ 손잡이 문 하나 — villages `!== '0'`(켬 기본 · 되돌림 `=0`) · war-core · war-live · battle-core 무변");
ok(/_t790Mark\(body\.retGroup\);\s*\n\s*if \(body\.retGroup\) body\.retGroup\.detour = _warDetourFor\(body\);/.test(setup)
  && /if \(T1089_RET_WALK && body\.retGroup && body\.len > 0 && _t790Mark\(body\.retGroup, true\)\._t790Walk > 0\) \{/.test(setup) && /body\.retGroup\.detour = _warDetourFor\(body, true\);/.test(setup) && /_warStandNear\(e\.x \/ SZ, e\.y \/ SZ\)/.test(setup) && /_polyS\(/.test(setup),
  'ⓐ 귀환 세우기 — T790 두 줄 글자 그대로 + 켬 줄: 몸 걸음(같은 문 `_t790Mark` · 같은 값 — 걸음 정본이 없는 판은 종전대로 · T790 그 규칙) · 걷는 길(`_warDetourFor(body, true)`) · 걷는 점 출발 = 첫 몸의 길 투영(`_polyS`) · 길 끝 = 설 칸(`_warStandNear`)');
ok(/body\.retGroup\.cmd = \{ cx: body\.cmd\.cx, cy: body\.cmd\.cy \}; body\.retGroup\.heading = body\.heading;\s*\n\s*if \(T1089_RET_WALK && body\._t1089\) _t1089Step\(body\);/.test(pace)
  && /if \(T1089_RET_WALK && body\._t1089 && body\._t1089\.done && _t1089Home\(body\)\) _warCleanupBody\(body, true\);/.test(pace)
  && /T\.p = Math\.min\(body\.len, T\.p \+ \(g\._t790Walk \|\| 0\) \* SZ\);/.test(step),
  'ⓐ 귀환 걸음 — 장부 자리 줄 글자 그대로 + 다음 줄에 걷는 점(한 걸음 = 몸 걸음 px) · 장부가 끝난 뒤 닿으면 종전 그 함수(`_warCleanupBody`)로 푼다');
ok(/if \(body\.len - body\.prog <= 0\.5 \|\| !body\.retGroup\) \{ _warCleanupBody\(body, true\); continue; \}/.test(dayF) && dayF.indexOf('_t1089Home(body)') < dayF.indexOf('if (body.len - body.prog <= 0.5 || !body.retGroup)')
  && /const stuck = body\._t1089\.prevD != null && dH >= body\._t1089\.prevD;/.test(dayF) && /if \(!stuck\) continue;/.test(dayF),
  'ⓐ 하루 경계 — 종전 풀기 줄 글자 그대로 · 그 앞 한 덩이: 장부는 집인데 몸이 길 위면 계속 걷는다(닿을 때 푼다) · 지난 경계보다 안 가까워졌으면(막힘) 종전 줄이 그 자리에서 푼다');
ok(/return T\.p >= body\.len - 0\.5 && Math\.hypot\(g\.cmd\.cx - c\.x, g\.cmd\.cy - c\.y\) <= state\.warLive\.MU\.FOLLOW_SNAP;/.test(home),
  'ⓐ 닿음 술어 — 걷는 점이 길 끝(종전 길 끝 문턱 0.5px) · 첫 몸이 그 점에 닿았다(`FOLLOW_SNAP` — T790 늦음 셈 · T1044 칸 내림과 같은 술어)');
ok(/const inBattle = !!\(body\.w && body\.w\.phase === 'battle' && body\.phase !== 'return'\) \|\| !!\(T1089_RET_WALK && body\.phase === 'return' && body\._t1089\);/.test(q941)
  && /if \(T941_BATTLE_DAY\) q = _t941Q\(body\);/.test(take) && !/T1089/.test(take) && /if \(T941_BATTLE_DAY\) _t941Q\(body\);/.test(flush) && !/T1089/.test(flush),
  'ⓐ 걸음 몫 — 종전 그대로(T681 · T832 · T844 고리 글자 그대로) · 판 자 손잡이 `T941_BATTLE_DAY` 켬일 때만 걷는 귀환 날도 교전 날처럼 운영 하루 몫(`_t941Q` 술어 한 자리 `||` · T941 끔 = 무동작 · 배수 0)');
{
  const add = [home, step, (setup.match(/if \(T1089_RET_WALK && body\.retGroup && body\.len > 0 && [\s\S]*?\n  \}/) || [''])[0], (pace.match(/if \(T1089_RET_WALK[^\n]*/g) || []).join(' '),
    (dayF.match(/if \(T1089_RET_WALK && body\._t1089 && body\.retGroup[\s\S]*?\n      \}/) || [''])[0]].join(' ').replace(/'[^']*'/g, "''").replace(/T1089|_t1089|T790|_t790|T941|_t941/g, '').replace(/body\.len - 0\.5/g, 'body.len').replace(/body\.len - body\.prog <= 0\.5/g, 'body.len - body.prog <= ').replace(/\[[01]\]/g, '[]');
  ok(add.length > 400 && !/[^\w.'](?:[2-9]\d*|1\d+)(?:\.\d+)?(?![\w'])/.test(add) && !/[^\w.']1\.\d/.test(add) && !/[^\w.']0\.\d/.test(add), 'ⓐ 새 수 0 — 더한 글자엔 0 · 1 뿐(표식 · 셈 +1 · 길 끝 0.5px 는 종전 그 문턱 `body.len - body.prog <= 0.5` 글자 그대로 · 걸음 · 반경은 종전 값)', add.length + '자');
}

// ── ⓑ 실경로 — 공격이 지고 몸 하나가 살아 돌아간다 ──────────
console.log('\n[ⓑ] 실경로 — 공격이 지고 살아남은 몸이 집(360칸)으로 돌아간다(장부 귀환 하루 · 하네스 하루 30초 · T941 끔 = 걸음 몫 그날 몫 — 몸은 여러 날 걷는다)');
const RUN = { maxTicks: 30 * 60 * 12 };
const OFF = sub({ T1089_RET_WALK: '0' }, RUN), ON = sub({}, RUN), ON1 = sub({ T1089_RET_WALK: '1' }, RUN);
{
  const relO = (OFF.rel || [])[0], relN = (ON.rel || [])[0];
  ok(OFF.end && ON.end && OFF.end.why === ON.end.why && OFF.endDay === ON.endDay && OFF.ret && ON.ret && OFF.ret.len > 300 && relO && relN,
    'ⓑ 전제 — 두 판 다 같은 결판 · 같은 날 · 살아남은 몸이 귀환 대형에 들었다(귀환 길 300칸 넘게) · 두 판 다 결속이 풀렸다', JSON.stringify({ off: { end: OFF.end, day: OFF.endDay, ret: OFF.ret }, on: { end: ON.end, day: ON.endDay, ret: ON.ret } }));
  ok(relO && relO.home > 300 && OFF.units.some((x) => x.mx > 2) && OFF.bad > 0,
    '★ⓑ 끔(`=0`) — 증인: 첫 걸음에 결판 자리에서 길 머리(적 마을 중심)로 놓이고(한 걸음 2칸 넘게) · 그 마을 막힌 칸(회관 발자국)에 서 있다가 · 집에서 300칸 넘게 떨어진 그 자리에서 풀린다', sum(OFF));
  ok(relN && relN.home <= 13 && ON.units.every((x) => x.walked >= 300),
    '★ⓑ 켬(미설정 = 기본) — 걸어서 집 13칸 안에서 풀린다(귀환 걸음 합 300칸 넘게)', sum(ON));
  ok(ON.units.every((x) => x.mx <= 2) && ON.bad === 0, 'ⓑ 켬 — 귀환 걸음마다(틱 · 하루 마감 채움 둘 다) 한 걸음 2칸 넘는 걸음 0(순간이동 0) · 막힌 칸에 선 걸음 0', JSON.stringify({ mx: Math.max(...ON.units.map((x) => x.mx)), n: ON.units.map((x) => x.n), bad: ON.bad }));
  ok(ON.stat.t1089Late === 0, 'ⓑ 켬 — 막힘 풀기(지난 경계보다 안 가까워짐) 0', JSON.stringify(ON.stat));
  ok(relO && relN && relO.day === OFF.endDay + 1 && relN.day > relO.day,
    'ⓑ 켬 — 장부가 끝난 날 경계(귀환 하루 뒤)에 몸은 아직 길 위 → 풀지 않고 걷다가 닿을 때 푼다(T941 끔 · 걸음 몫 = 그날 몫 — 몸 걸음 그대로 여러 날)', `끔 D${relO && relO.day} · 켬 D${relN && relN.day}`);
  ok(strip(ON1) === strip(ON) && strip(ON) !== strip(OFF) && ON.knobOn === true && OFF.knobOn === false, "ⓑ 켬 `'1'` = 미설정과 같은 판 · 끔(`=0`)과는 다른 판");
}

// ── ⓒ 판 자 꼴(교전 하루 = 운영 하루) ─────────
console.log('\n[ⓒ] 판 자 꼴 — `T941_BATTLE_DAY=1`(교전 하루 = 운영 하루 · 판 자 기본)');
{
  const OFF3 = sub({ T1089_RET_WALK: '0', T941_BATTLE_DAY: '1' }, RUN), ON3 = sub({ T941_BATTLE_DAY: '1' }, RUN);
  const relO = (OFF3.rel || [])[0], relN = (ON3.rel || [])[0];
  ok(OFF3.end && ON3.end && OFF3.end.why === ON3.end.why && OFF3.endDay === ON3.endDay && relO && relN, 'ⓒ 전제 — 두 판 다 같은 결판 · 같은 날(교전 하루가 하루 마감에서 끝난다) · 결속이 풀렸다', JSON.stringify({ off: [OFF3.end, OFF3.endDay], on: [ON3.end, ON3.endDay] }));
  ok(relO && relN && relO.home > 300 && OFF3.units.some((x) => x.mx > 2) && relN.home <= 13 && ON3.units.every((x) => x.mx <= 2 && x.walked >= 300) && ON3.bad === 0 && ON3.stat.t1089Late === 0,
    'ⓒ 판 자 꼴 — 끔 = 적 마을 중심에 놓여 거기서 풀림(300칸 넘게) · 켬 = 걸어서 집 13칸 안 · 한 걸음 2칸 넘는 걸음 0 · 막힌 칸 0 · 막힘 풀기 0', JSON.stringify({ off: relO, on: relN, mx: ON3.units.map((x) => x.mx), walked: ON3.units.map((x) => x.walked) }));
  ok(relO && relN && relN.day === relO.day, 'ⓒ 판 자 꼴 — 걷는 귀환 날 = 운영 하루 몫(T941 켬) ⇒ 장부가 끝나는 그 경계에 이미 집(끔과 같은 날 풀림)', `끔 D${relO && relO.day} · 켬 D${relN && relN.day}`);
}

// ── ⓓ 결정론 ─────────
console.log('\n[ⓓ] 결정론 — 같은 판 두 번');
{
  const ON2 = sub({}, RUN);
  ok(strip(ON2) === strip(ON), 'ⓓ 켬 — 같은 판 두 번 = 바이트 같다(하루 마감 첫 자리를 retry 가 그칠 때까지 · 존과 같은 차례)');
}

// ── ⓔ 걸음 정본이 없는 판 ─────────
console.log('\n[ⓔ] 걸음 정본이 없는 판(`deps.moveSpeed` 없음 — 하네스 목) — 켬이어도 종전 그대로(T790 그 규칙 · 걷지 못하는 몸을 세워 두지 않는다)');
{
  const RN = Object.assign({}, RUN, { noSpeed: 1 });
  const OFF5 = sub({ T1089_RET_WALK: '0' }, RN), ON5 = sub({}, RN);
  ok(ON5.knobOn === true && OFF5.knobOn === false && strip(ON5) === strip(OFF5) && ON5.rel && ON5.rel[0] && ON5.rel[0].home > 300,
    'ⓔ 켬 = 끔 한 글자(결판 · 걸음 · 풀린 자리) — 종전 꼴(적 마을 중심에서 풀림)', JSON.stringify({ on: ON5.rel && ON5.rel[0], off: OFF5.rel && OFF5.rel[0] }));
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
