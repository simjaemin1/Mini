#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-t1044-scram-walk.js — 긴급 소집 몸이 제 자리(포진점 · 대형 슬롯)로 걸어 온다(`T1044_SCRAM_WALK` 켬 기본 후보) ==========
//
// ★왜 [지시 T1044 · T1019 회부 1 · ★PM 결함 "같은 몸 — 싸우러 소집된 몸은 싸움터로 간다"]
//   농성(hold) 마을에 돌격 결단 적군이 마을권에 들면 긴급 소집(villages `_warEnsureDefense` scram)이 선다 — 슬롯 놓기를 안 거친다.
//   종전 ⓐ 돌격이 이미 전진 중이면 그 걸음에 곧바로 교전에 풀린다(`setSideCtl(B, false)`) — 지키는 쪽(holder)이라 `world.advance` 가 null —
//     소집된 그 자리(집 · 일터)에 선 채 싸움터에 못 온다 · ⓑ 돌격 결단 그 자리 소집은 대형이 쥐지만 지휘 몸을 원점에 바로 놓는다(몸 걸음 칸이 없으면).
//   지키는 것:
//     ⓐ 정적 — 손잡이 문(`!== '0'` 한 자리) · T790 두 줄 글자 그대로(+ 한 줄씩) · 대형이 쥐는 줄 · advance 지키는 쪽 줄 · 칸 내리는 술어 둘 · 새 수 0
//     ⓑ 전진 중 긴급 소집(실경로 — war-core 결단 · villages 몸 · war-live 교전 · battle-core) · 방어 몸이 회관 동쪽 120칸 들일에 있다:
//        ★끔(`=0`) = 그 걸음에 풀린다 · 첫 10초 걸음 0 · 끝까지 포진점에서 100칸 밖(자명 통과 금지의 증인) ·
//        ★켬(미설정 = 기본) = 대형이 쥔다 · 걸어 와 포진점 13m 안에 든다 · 한 걸음이 2칸을 넘는 몸 0(순간이동 0) · 접촉에 풀린 뒤에도 덜 온 몸은 제 자리로 걷는다 · 칸 다 내림
//     ⓒ 돌격 결단 그 자리 긴급 소집(방어 마을 영토가 넓다 — 마을권이 주둔 링보다 크다):
//        ★끔 = 지휘 몸이 한 걸음에 2칸 넘게 뛴다(원점에 놓기 — 증인) · ★켬 = 한 걸음 2칸 넘는 몸 0 · 지휘 몸이 걸어 원점 13m 안에 든다
//     ⓓ 켬 `'1'` = 미설정과 같은 걸음 · 끔과는 다른 걸음(끄는 값은 `'0'` 하나)
// ⚠존을 부팅하지 않는다 — 정본(battle-core · war-live · war-core · villages `__p3Bind`)을 그대로 부른다(규칙 사본 0). 손잡이는 모듈을 싣는 순간 읽는다 ⇒ 판마다 아이 프로세스.
// 실행: node scripts/test-t1044-scram-walk.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const KNOBS = ['T1044_SCRAM_WALK', 'T790_NO_SNAP', 'T1019_UNTRAP', 'T1019_ASSAULT_HP', 'T956_ASSAULT_MISS', 'T771_SORTIE_MISS'];
const r2 = (x) => Number.isFinite(x) ? Math.round(x * 100) / 100 : null;

// ── 아이 판 — 공격 마을 A(100,100) · 농성 마을 B(260,100) · 전쟁 하나(돌격 정책) · 방어 몸 자리 = P.far(B 중심에서 셀) 또는 집 자리 ──
if (process.env.T1044_SUB === 'war') {
  const P = JSON.parse(process.env.T1044_P || '{}');
  const econ = R('sim/economy-sim.js'), WarCore = R('sim/war-core.js'), WarLive = R('server/war-live.js'), BC = R('sim/battle-core.js'), SimVillages = R('server/villages.js');
  const SZ = 32;
  let s = 7; Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };   // 판마다 같은 줄(test-war-world 꼴)
  const A_C = { cx: 100, cy: 100 }, B_C = { cx: 260, cy: 100 };
  const HOUSES_B = [{ type: 'house', cx: 300, cy: 100 }, { type: 'house', cx: 312, cy: 94 }, { type: 'granary', cx: 324, cy: 104 }];   // 들일 → 회관 길 위의 집 셋(회관 발자국과 함께 몸이 돌아 걸어야 한다 · 집 자리 14 ~ 23칸과 안 겹친다)
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
    isTerrainBlockedLocal: () => false, isWaterTileLocal: () => false, tickHz: 30, moveSpeed: MOVE, standCellNear,
  };
  const mkVil = (name, c, dbId, pop) => {
    const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name });
    e.storage.weapon = 20; e.storage.stone = 200;
    const back = dbId === 1 ? -1 : 1;
    const housesPx = [0, 1, 2, 3].map(i => ({ x: (c.cx + back * (14 + i * 3)) * SZ + SZ / 2, y: (c.cy - 6 + i * 4) * SZ + SZ / 2 }));
    return { dbId, name, ccx: c.cx, ccy: c.cy, econ: e, npcPids: [], housesPx };
  };
  const atk = mkVil('공격A', A_C, 1, 22), def = mkVil('농성B', B_C, 2, 18);
  if (P.land) def.econ.land.size = P.land;   // 마을권 반경(영토) — 넓으면 돌격 결단 그 자리에서 긴급 소집이 선다
  const villages = [atk, def];
  const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 1 };
  const db = { getVillageStructRows: (id) => (id === 2 ? HOUSES_B : []) };
  let H = null;
  const war = WarCore.createWar({ villages, world, seed: 7, infoRange: 5000, centerOf: v => ({ cx: v.ccx, cy: v.ccy }),
    territoryOf: v => (v.econ.land && v.econ.land.size ? v.econ.land.size * 25 : 2800), log: null,
    onEngage: (w, day, why) => H._warEngage(w, day, why), rationEat: (w, day) => H._warRationEat(w, day), rationCollect: (w) => H._warRationCollect(w), lootCarry: (w, items, kind) => H._warLootAccept(w, items, kind) });
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
  if (P.far) def.npcPids.forEach((pid, i) => { const p = players.get(pid); const L = P.lag && i >= def.npcPids.length - 2, o = L ? P.lag : P.far;   // 들일(회관 동쪽) · 끝 두 몸은 더 먼 들일(P.lag — 접촉 뒤에도 걷는 몸)
    p.x = (B_C.cx + o[0] + (i % 3) * 2) * SZ + SZ / 2; p.y = (B_C.cy + o[1] + ((i / 3) | 0) * 2 - 6) * SZ + SZ / 2; });
  const comp = WarCore.conscript(atk, 'full', {}).composition;
  const w = { id: 1, atk, def, casus: 'feud', force: 12, warriors: 2, composition: comp, weapQ: 0.5, phase: 'march', op: 'march', eta: world.day + 1, marchDays: 1, born: world.day, _packDays: 12, _packRem: 12, _opPolicy: 'assault' };
  def._defPolicy = 'hold'; w._defMode = 'hold'; w._defModeDay = world.day;   // 농성 — war-core 방어 태세(`_opDefenseDaily` 가 `_defPolicy` 'hold' 에서 세우는 그 칸)를 첫 날 앞에 세워 둔다(경보 반경 응전 포진이 먼저 서지 않게)
  war.WARS.push(w);
  //   방어 소집 순간(war-live 문 둘을 지켜보기만) — 그 걸음의 교전 상태 · villages 가 부른 대형 손
  const out = { sc: null, units: [], contactT: null, end: null, endT: null, knob: process.env.T1044_SCRAM_WALK == null ? null : process.env.T1044_SCRAM_WALK, bad: 0 };
  const en = WL.enlist, ssc = WL.setSideCtl;
  let curT = -1;
  WL.enlist = function (f, side, gu, p) { const bu = en.apply(this, arguments); if (side === 'B' && bu && !out.sc) out.sc = { t: curT, fst: f.state, ctl: null, n: 0 }; if (side === 'B' && out.sc && out.sc.t === curT) out.sc.n++; return bu; };
  WL.setSideCtl = function (f, side, on) { const r = ssc.apply(this, arguments); if (side === 'B' && out.sc && out.sc.t === curT && out.sc.ctl == null) out.sc.ctl = on ? 1 : 0; return r; };
  const U = new Map();   // pid → 몸 셈
  let now = world.day * dayMs + 1, dayAt = now;
  const stepMs = 1000 / 30, maxTicks = P.maxTicks || 30 * 60 * 6;
  for (let t = 0; t < maxTicks; t++) {
    curT = t; now += stepMs;
    H.tickWarBodies(now);
    if (now - dayAt >= dayMs) {
      if (H.T681_ON) H._t681Flush();
      dayAt = now; world.day++; H.state.lastGameDay++;
      const sb = (war.stats().surrender) || 0;
      war.daily(world.day); H._warAfterDaily(sb);
      if (H.T681_ON) H._t681Day(now);
    }
    const body = H.state.warBodies.get(w.id), f = body && body.fight, dg = body && body.defGroup;
    if (f && dg && out.sc) {
      if (out.contactT == null && (f.contacts | 0) > 0) out.contactT = t;
      if (!out.hold) out.hold = [r2(dg.holdPt.cx), r2(dg.holdPt.cy)];
      for (const u of f.ctx.units) {
        if (u.side !== 'B') continue;
        let x = U.get(u.agent);
        const dh = Math.hypot(u.x - dg.holdPt.cx, u.y - dg.holdPt.cy);
        if (!x) { x = { pid: u.agent, cmd: !!(u.gu && u.gu.cmd), x0: [r2(u.x), r2(u.y)], d0: dh, mn: dh, mx: 0, mv10: 0, arr: null, post: 0, px: u.x, py: u.y, t0: t, dead: 0, eng: 0, gu: u.gu }; U.set(u.agent, x); out.units.push(x); }
        if (u.hp <= 0) { x.dead = 1; continue; }
        const st = Math.hypot(u.x - x.px, u.y - x.py); if (st > x.mx) x.mx = st;
        if (t - x.t0 <= 300) x.mv10 += st;
        if (out.contactT != null && x.c1 == null) x.c1 = dh;
        if (out.contactT != null && t > out.contactT && !u.ctl) x.post += st;
        if (dh < x.mn) x.mn = dh;
        if (x.arr == null && dh <= 13) x.arr = t;
        if (!u.ctl && (u.st === 'melee' || u.st === 'shoot')) x.eng = 1;
        if (H._warBlockedCell(u.x, u.y)) out.bad++;
        x.px = u.x; x.py = u.y;
      }
    }
    if (body && body.ended && !out.end) { out.end = body.ended; out.endT = t; }
    if (out.end && t - out.endT > 30) break;
  }
  for (const x of out.units) { x.flag = x.gu ? (x.gu._t1044 ? 1 : 0) : null; delete x.gu; delete x.px; delete x.py; x.d0 = r2(x.d0); x.mn = r2(x.mn); x.mx = r2(x.mx); x.mv10 = r2(x.mv10); x.post = r2(x.post); x.c1 = r2(x.c1); }
  out.knobOn = H.T1044_SCRAM_WALK;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (src) => src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const CV = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
const CW = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'war-live.js'), 'utf8'));
const CB = codeOf(fs.readFileSync(path.join(ROOT, 'sim', 'battle-core.js'), 'utf8'));
const fnBody = (C, name) => { const i = C.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = C.indexOf('{', i); for (let k = j; k < C.length; k++) { if (C[k] === '{') d++; else if (C[k] === '}') { d--; if (!d) return C.slice(i, k + 1); } } return ''; };
const sub = (env, P) => { const E = Object.assign({}, process.env, { T1044_SUB: 'war' }); for (const k of KNOBS) delete E[k]; delete E.T1044_P; Object.assign(E, env || {}); if (P) E.T1044_P = JSON.stringify(P);
  const o = execFileSync(process.execPath, [__filename], { cwd: ROOT, env: E, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString(); return JSON.parse(o.slice(o.indexOf('{'))); };
const strip = (o) => JSON.stringify(Object.assign({}, o, { knob: null, knobOn: null }));
const sum = (o) => JSON.stringify({ sc: o.sc, c: o.contactT, end: o.end, endT: o.endT, bad: o.bad, u: o.units.map((x) => [x.cmd ? 'C' : '', x.d0, x.mn, x.mx, x.mv10, x.arr, x.post, x.flag, x.dead, x.eng].join(':')) });
console.log('\n=== 긴급 소집 몸이 제 자리로 걸어 온다 — T1044 ===');

// ── ⓐ 정적 ──────────────────────────────────────────────────────────────────
console.log('\n[ⓐ] 정적 — 손잡이 하나 · 문 · 새 수 0');
const ed = fnBody(CV, '_warEnsureDefense'), det = fnBody(CV, '_warDetourFor'), hcs = fnBody(CV, '_warHoldCtlSides'), sfm = fnBody(CV, '_warStepFormations');
const arv = fnBody(CV, '_t1044Arrive'), way = fnBody(CV, '_t1044Way'), plc = fnBody(CV, '_t790Place'), mark = fnBody(CV, '_t790Mark'), ww = fnBody(CV, '_warWorld');
ok(/const T1044_SCRAM_WALK = process\.env\.T1044_SCRAM_WALK !== '0';/.test(CV) && (CV.match(/process\.env\.T1044_SCRAM_WALK/g) || []).length === 1 && !/T1044/.test(CW + CB),
  "ⓐ 손잡이 문 하나 — villages `!== '0'`(켬 기본 · 되돌림 `=0`) · war-live · battle-core 무변");
ok(/\n  _t790Mark\(g\);\s*\n/.test(ed) && /if \(sw\) _t790Mark\(g, true\);/.test(ed) && ed.indexOf('_t790Mark(g);') < ed.indexOf('if (sw) _t790Mark(g, true);')
  && /if \(\(T790_NO_SNAP \|\| on\) && g && sp > 0 && state\.warLive\) g\._t790Walk = sp \/ SZ \* state\.warLive\.STEP_DT;/.test(mark),
  'ⓐ ① 몸 걸음 — T790 줄 글자 그대로 + 긴급 소집 한 줄(같은 문 `_t790Mark` · 같은 값 = 존 `moveSpeed` ÷ 셀 × 스텝)');
ok(/if \(T790_NO_SNAP\) \{ det\.walk = \(u, tx, ty, st\) => _t804Way\(u, u\.x, u\.y, tx, ty, st, body\); det\.body = body; \}/.test(det)
  && /if \(walk && !det\.walk\) \{ det\.walk = \(u, tx, ty, st\) => _t804Way\(u, u\.x, u\.y, tx, ty, st, body\); det\.body = body; \}/.test(det) && /g\.detour = _warDetourFor\(body, sw\);/.test(ed),
  'ⓐ ① 걷는 몸의 길 — T790 줄 글자 그대로 + 긴급 소집 대형만 같은 길 문(`_t804Way`)');
ok(/const sw = T1044_SCRAM_WALK && scram;/.test(ed) && /if \(sw\) for \(const u of g\.units\) u\._t1044 = 1;/.test(ed)
  && /if \(f\.state !== 'form' \|\| scram\) state\.warLive\.setSideCtl\(f, 'B', \(f\.state === 'form' \|\| sw\) \? true : false\);/.test(ed),
  'ⓐ ② 대형이 쥔다 — 긴급 소집이면 전진 중에도 `setSideCtl(B, true)`(끔 = 종전 글자 · 응전 포진 · 출격 무변)');
ok(/if \(fight\.holder === u\.side\) return \(T1044_SCRAM_WALK && u\.gu && u\.gu\._t1044\) \? _t1044Way\(fight, u, dirTo\) : null;/.test(ww),
  'ⓐ ③ 지키는 쪽 전진 — 칸이 선 몸만 제 자리로(그 밖 = 종전 null · 적은 쫓지 않는다)');
ok(/const t = _t790Place\(g, u\); if \(Math\.hypot\(t\[0\] - u\.x, t\[1\] - u\.y\) <= FS\) u\._t1044 = 0;/.test(arv) && /const FS = state\.warLive\.MU\.FOLLOW_SNAP;/.test(arv)
  && /if \(!r \|\| r\.d <= 1\) \{ gu\._t1044 = 0; return null; \}/.test(way) && /_t804Way\(gu, u\.x \/ MPC, u\.y \/ MPC, t\[0\], t\[1\], g\._t790Walk \|\| 0, body\)/.test(way)
  && /if \(T1044_SCRAM_WALK\) _t1044Arrive\(dg\);/.test(hcs) && /if \(T1044_SCRAM_WALK\) _t1044Arrive\(dg\);/.test(sfm),
  'ⓐ 칸 내리기 — 대형 걸음 = T790 늦음 셈 술어(`_t790Place` · `FOLLOW_SNAP`) · 풀린 걸음 = advance 의 "다 왔다"(1m) · 걷는 길 = 같은 `_t804Way`(그 몸의 기억)');
ok(/const t = _t790Place\(g, u\);/.test(fnBody(CV, '_t790Lag')) && /if \(u\.cmd\) return \[g\.cmd\.cx, g\.cmd\.cy\];/.test(plc) && /return \[s\[0\] \+ \(u\.jx \|\| 0\), s\[1\] \+ \(u\.jy \|\| 0\)\];/.test(plc),
  'ⓐ 제 자리 한 곳 — T790 늦음 셈과 긴급 소집 걸음이 같은 점(`_t790Place` · 지휘 = 원점 · 병사 = 슬롯 + 흔들림)');
{
  const add = [arv, way, plc, (ed.match(/const sw = [^\n]*/) || [''])[0], (ed.match(/if \(sw\)[^\n]*/g) || []).join(' '), (det.match(/if \(walk[^\n]*/) || [''])[0],
    (ww.match(/if \(fight\.holder === u\.side\)[^\n]*/) || [''])[0]].join(' ').replace(/'[^']*'/g, "''").replace(/T1044|_t1044|T790|_t790|T804|_t804/g, '').replace(/\[[01]\]/g, '[]');
  ok(!/[^\w.'](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w'])/.test(add), 'ⓐ 새 수 0 — 더한 글자엔 0 · 1 만(걸음 · 반경 · 길은 종전 것)', add.length + '자');
}

// ── ⓑ 전진 중 긴급 소집 — 방어 몸이 회관 동쪽 120칸 들일 · 끝 두 몸은 300칸 ──────────
console.log('\n[ⓑ] 전진 중 긴급 소집(실경로) — 방어 몸이 회관 동쪽 120칸 들일(끝 두 몸은 300칸 — 접촉 때 아직 먼 몸)');
const FAR = { far: [120, 0], lag: [300, 0] };
const OFF = sub({ T1044_SCRAM_WALK: '0' }, FAR), ON = sub({}, FAR), ON1 = sub({ T1044_SCRAM_WALK: '1' }, FAR);
{
  const alive = (o) => o.units.filter((x) => !x.dead);
  ok(OFF.sc && OFF.sc.fst === 'advance' && OFF.sc.n > 1 && ON.sc && ON.sc.fst === 'advance' && ON.sc.n === OFF.sc.n && OFF.units.length === OFF.sc.n,
    'ⓑ 전제 — 두 판 다 돌격이 전진하는 걸음에 긴급 소집이 섰다(결단 그 자리가 아니다) · 같은 몸 수', JSON.stringify({ off: OFF.sc, on: ON.sc }));
  const d0 = Math.min(...OFF.units.map((x) => x.d0)), lagO = OFF.units.filter((x) => x.d0 > 250), lagN = ON.units.filter((x) => x.d0 > 250);
  ok(d0 > 100 && lagO.length > 0 && lagO.length === lagN.length, 'ⓑ 전제 — 소집 순간 몸은 포진점에서 100칸 밖(들일) · 더 먼 몸(250칸 밖)이 소집에 들었다', JSON.stringify({ d0: r2(d0), lag: lagO.length }));
  ok(OFF.sc.ctl === 0 && OFF.units.every((x) => x.mv10 === 0) && OFF.units.every((x) => x.d0 - x.mn < 40) && lagO.every((x) => x.post === 0 && x.mn === x.d0),
    '★ⓑ 끔(`=0`) — 그 걸음에 풀린다 · 첫 10초 걸음 0 · 포진점 쪽으로 40칸도 못 온다(적이 들일로 와서 싸운다) · 먼 몸은 끝까지 한 걸음도 안 뗀다(자명 통과 금지의 증인)', sum(OFF));
  ok(ON.sc.ctl === 1 && alive(ON).every((x) => x.mv10 > 5) && ON.units.every((x) => x.d0 - x.mn >= 90) && ON.units.filter((x) => x.d0 < 250).every((x) => x.mn <= 40),
    '★ⓑ 켬(미설정 = 기본) — 대형이 쥔다 · 첫 10초에 걷기 시작 · 몸마다 포진점 쪽으로 90칸 넘게 걸어 온다 · 들일 몸은 포진점 40칸 안(마을 안에서 맞붙는다)', sum(ON));
  ok(ON.units.every((x) => x.mx <= 2) && OFF.units.every((x) => x.mx <= 2) && ON.bad === 0,
    'ⓑ 켬 — 한 걸음이 2칸을 넘는 몸 0(순간이동 0) · 막힌 칸(회관 · 집 발자국)에 선 걸음 0', JSON.stringify({ mx: Math.max(...ON.units.map((x) => x.mx)), bad: ON.bad }));
  ok(ON.contactT != null && lagN.every((x) => x.c1 > 100 && x.post > 5 && x.mn < x.c1 - 5 && !x.eng),
    'ⓑ 켬 — 접촉 때 아직 먼 몸(100칸 밖)은 풀린 뒤에도 제 자리로 걷는다(풀린 걸음 > 5m · 포진점에 더 가까워졌다 · 맞붙음 0 — 적을 쫓은 걸음이 아니다)', JSON.stringify(lagN.map((x) => ({ c1: x.c1, mn: x.mn, post: x.post }))));
  ok(strip(ON1) === strip(ON) && strip(ON) !== strip(OFF), "ⓑ 켬 `'1'` = 미설정과 같은 걸음 · 끔(`=0`)과는 다른 걸음");
}

// ── ⓒ 돌격 결단 그 자리 긴급 소집 — 마을권이 주둔 링보다 크다(영토 400) ─────────
console.log('\n[ⓒ] 돌격 결단 그 자리 긴급 소집 — 몸은 집 자리(회관 뒤 14 ~ 23칸)');
{
  const NEAR = { land: 400 };
  const OFF2 = sub({ T1044_SCRAM_WALK: '0' }, NEAR), ON2 = sub({}, NEAR);
  ok(OFF2.sc && OFF2.sc.fst === 'form' && OFF2.sc.ctl === 1 && ON2.sc && ON2.sc.fst === 'form' && ON2.sc.ctl === 1,
    'ⓒ 전제 — 두 판 다 결단 그 자리(교전 `form`)에서 소집 · 대형이 쥔다(종전도)', JSON.stringify({ off: OFF2.sc, on: ON2.sc }));
  const cO = OFF2.units.find((x) => x.cmd), cN = ON2.units.find((x) => x.cmd);
  ok(cO && cO.mx > 2 && cO.d0 > 2, '★ⓒ 끔(`=0`) — 지휘 몸이 한 걸음에 2칸 넘게 뛴다(원점에 놓기 — 증인)', JSON.stringify(cO));
  ok(cN && cN.mx <= 2 && ON2.units.every((x) => x.mx <= 2) && cN.mn <= 13 && ON2.bad === 0,
    '★ⓒ 켬 — 한 걸음 2칸 넘는 몸 0 · 지휘 몸이 걸어 원점 13m 안에 든다', JSON.stringify(cN));
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
