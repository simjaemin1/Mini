#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-t1060-scram-hold.js — 긴급 소집 대형의 대치 재편 원점 = 포진점(`T1060_SCRAM_HOLD` 켬 기본 후보) · 공격 겨눔 갈래(`T1060_ATK_AIM` 판 자 env) ==========
//
// ★왜 [지시 T1060 · T1044 회부 2 · ★PM 판정 "결함"]
//   대치 전이(villages `_warToStandoff`)의 재편(war-live `regroup` — 첫 생존자 자리 = 원점)이 걸어 오던 긴급 소집 대형의 길 중간을 원점으로 삼아
//   그 대형이 길 중간에 섰다(접촉 전 주둔 걸음 `_muDefHold` 는 원점이 포진점에서 마중 상한 8칸 밖이면 원점을 안 끈다).
//   켬: 걷는 긴급 소집 대형(몸 걸음 칸 — T1044 켬)은 재편 뒤 원점 = 포진점(`holdPt`) — 몸은 거기까지 걷는다(순간이동 0).
//   ★[T1060 ② · T1044 회부 1 — 재민 질문 근거] `T1060_ATK_AIM='1'`(판 자 아이 env · 제품 기본 무변) — 공격이 걸어 오는 긴급 소집 몸 대신 포진점을 겨눈다.
//   지키는 것:
//     ⓐ 정적 — 손잡이 문 둘(`!== '0'` · `=== '1'` 한 자리씩) · 대치 전이 방어 줄 글자 그대로 + 한 줄 · 원점 문(긴급 소집 · 몸 걸음 칸 · 포진점) ·
//        advance 줄(끔 = 적 본대 무게중심) · war-live · battle-core 무변 · 새 수 0
//     ⓑ 걸어 오던 긴급 소집 대형이 길 중간에서 대치(접촉 0 · 대치는 운영 `_warTickOne` 의 두 문 차례 그대로 — war-live `toStandoff` → villages `_warToStandoff`):
//        ★끔(`=0`) = 재편 원점 = 길 중간(포진점에서 100칸 밖) · 그 대형은 이튿날 돌격까지 길 중간에 선다(자명 통과 금지의 증인) ·
//        ★켬(미설정 = 기본) = 재편 원점 = 포진점 · 몸마다 포진점 쪽으로 걸어 온다 · 한 걸음 2칸 넘는 몸 0 · 막힌 칸 걸음 0 · 켬 `'1'` = 미설정 · 끔과 다르다
//     ⓒ 걷지 않는 긴급 소집 대형(`T1044_SCRAM_WALK=0` — 지휘 몸 놓기)은 손잡이와 무관(원점을 옮기면 놓기가 순간이동이 된다 — 켬 = 끔 바이트)
//     ⓓ 응전 포진(긴급 소집 아님)의 대치 — 손잡이와 무관(켬 = 끔 바이트)
//     ⓔ 겨눔 갈래(`T1060_ATK_AIM`) — 미설정 = `'0'` = 종전(제품 기본 무변) · `'1'` = 풀린 공격 몸이 포진점으로 간다(걸어 오는 몸 쪽이 아니다) · 맞붙는 자리가 포진점 가까이
// ⚠존을 부팅하지 않는다 — 정본(battle-core · war-live · war-core · villages `__p3Bind`)을 그대로 부른다(규칙 사본 0). 손잡이는 모듈을 싣는 순간 읽는다 ⇒ 판마다 아이 프로세스.
// 실행: node scripts/test-t1060-scram-hold.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const KNOBS = ['T1060_SCRAM_HOLD', 'T1060_ATK_AIM', 'T1044_SCRAM_WALK', 'T790_NO_SNAP', 'T1019_UNTRAP', 'T1019_ASSAULT_HP', 'T956_ASSAULT_MISS', 'T771_SORTIE_MISS'];
const r2 = (x) => Number.isFinite(x) ? Math.round(x * 100) / 100 : null;

// ── 아이 판 — 공격 마을 A(100,100) · 방어 마을 B(460,100) · 전쟁 하나(돌격 정책) · 방어 몸 자리 = B 중심 + P.far(셀) ──
if (process.env.T1060_SUB === 'war') {
  const P = JSON.parse(process.env.T1060_P || '{}');
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
    isTerrainBlockedLocal: () => false, isWaterTileLocal: () => false, tickHz: 30, moveSpeed: MOVE, standCellNear,
  };
  const mkVil = (name, c, dbId, pop) => {
    const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name });
    e.storage.weapon = 20; e.storage.stone = 200;
    const back = dbId === 1 ? -1 : 1;
    const housesPx = [0, 1, 2, 3].map(i => ({ x: (c.cx + back * (14 + i * 3)) * SZ + SZ / 2, y: (c.cy - 6 + i * 4) * SZ + SZ / 2 }));
    return { dbId, name, ccx: c.cx, ccy: c.cy, econ: e, npcPids: [], housesPx };
  };
  const atk = mkVil('공격A', A_C, 1, 22), def = mkVil('방어B', B_C, 2, 18);
  if (P.land) def.econ.land.size = P.land;   // 마을권 반경(영토) — 넓으면 돌격 결단 그 자리에서 긴급 소집이 선다(S1)
  const villages = [atk, def];
  const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 1 };
  const db = { getVillageStructRows: () => [] };
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
  if (P.far) def.npcPids.forEach((pid, i) => { const p = players.get(pid);
    p.x = (B_C.cx + P.far[0] + (i % 3) * 2) * SZ + SZ / 2; p.y = (B_C.cy + P.far[1] + ((i / 3) | 0) * 2 - 6) * SZ + SZ / 2; });
  const comp = WarCore.conscript(atk, 'full', {}).composition;
  const w = { id: 1, atk, def, casus: 'feud', force: 12, warriors: 2, composition: comp, weapQ: 0.5, phase: 'march', op: 'march', eta: world.day + 1, marchDays: 1, born: world.day, _packDays: 12, _packRem: 12, _opPolicy: 'assault' };
  if (P.hold !== false) { def._defPolicy = 'hold'; w._defMode = 'hold'; w._defModeDay = world.day; }   // 농성(긴급 소집) — war-core 방어 태세 칸을 첫 날 앞에 세워 둔다
  else { def._defPolicy = 'respond'; w._defMode = 'respond'; w._defModeDay = world.day; }   // `hold:false` = 응전(경보 반경 소집 — war-core 정책 칸 그대로)
  war.WARS.push(w);
  const out = { sc: null, eng: null, so: null, nx: null, c2: null, rel: null, units: [], end: null, endT: null, bad: 0, knob: { hold: process.env.T1060_SCRAM_HOLD == null ? null : process.env.T1060_SCRAM_HOLD, aim: process.env.T1060_ATK_AIM == null ? null : process.env.T1060_ATK_AIM } };
  const en = WL.enlist, ssc = WL.setSideCtl, oa = WL.orderAdvance;
  let curT = -1;
  const cenB = (f) => { let x = 0, y = 0, n = 0; for (const u of f.ctx.units) { if (u.side !== 'B' || u.hp <= 0) continue; x += u.x; y += u.y; n++; } return n ? { cx: x / n, cy: y / n, n } : null; };
  const cenA = (f) => { let x = 0, y = 0, n = 0; for (const u of f.ctx.units) { if (u.side !== 'A' || u.hp <= 0) continue; x += u.x; y += u.y; n++; } return n ? { cx: x / n, cy: y / n, n } : null; };
  const near = (f, h) => { const ds = []; for (const u of f.ctx.units) { if (u.side !== 'B' || u.hp <= 0) continue; ds.push(Math.hypot(u.x - h.cx, u.y - h.cy)); } ds.sort((a, b) => a - b);
    const c = cenB(f); return { n: ds.length, in13: ds.filter((d) => d <= 13).length, med: ds.length ? r2(ds[Math.floor(ds.length / 2)]) : null, max: ds.length ? r2(ds[ds.length - 1]) : null, cen: c ? r2(Math.hypot(c.cx - h.cx, c.cy - h.cy)) : null }; };
  WL.enlist = function (f, side, gu, p) { const bu = en.apply(this, arguments); if (side === 'B' && bu && !out.sc) out.sc = { t: curT, fst: f.state, ctl: null, n: 0 }; if (side === 'B' && out.sc && out.sc.t === curT) out.sc.n++; return bu; };
  WL.setSideCtl = function (f, side, on) { const r = ssc.apply(this, arguments); if (side === 'B' && out.sc && out.sc.t === curT && out.sc.ctl == null) out.sc.ctl = on ? 1 : 0; return r; };
  WL.orderAdvance = function (f, side) {   // 대치 뒤 첫 전진 명령(이튿날 돌격) — 그 순간 방어 몸이 어디 섰나
    try { const b = H.state.warBodies.get(w.id), dg = b && b.defGroup; if (out.so && !out.nx && dg) out.nx = Object.assign({ t: curT, day: world.day, oD: r2(Math.hypot(dg.cmd.cx - dg.holdPt.cx, dg.cmd.cy - dg.holdPt.cy)) }, near(f, dg.holdPt)); } catch (_) { }
    return oa.apply(this, arguments);
  };
  const U = new Map();   // pid → 몸 셈
  let now = world.day * dayMs + 1, dayAt = now, k0 = null;
  const stepMs = 1000 / 30, maxTicks = P.maxTicks || 30 * 60 * 4;
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
    if (out.eng == null && w.phase === 'battle') out.eng = t;   // 첫 교전 걸음(돌격 결단)
    //   대치 — 첫 교전 뒤 P.force 걸음에 접촉이 아직 없으면 운영 `_warTickOne` 의 대치 두 줄 차례 그대로(war-live `toStandoff` → villages `_warToStandoff`)
    if (P.force != null && out.eng != null && out.sc && !out.so && t === out.eng + P.force && f && dg && w.phase === 'battle' && !(f.contacts > 0)) {
      const pre = near(f, dg.holdPt);
      WL.toStandoff(f); H._warToStandoff(body);
      const cm = dg.commander;
      out.so = { t, day: world.day, k: f.contacts | 0, pre, oD: r2(Math.hypot(dg.cmd.cx - dg.holdPt.cx, dg.cmd.cy - dg.holdPt.cy)), cmdD: cm ? r2(Math.hypot(cm.x - dg.holdPt.cx, cm.y - dg.holdPt.cy)) : null,
        oCmd: cm ? r2(Math.hypot(dg.cmd.cx - cm.x, dg.cmd.cy - cm.y)) : null, oBlk: H._warBlockedCell(dg.cmd.cx, dg.cmd.cy) ? 1 : 0, walk: dg._t790Walk > 0 ? 1 : 0, scram: dg._scram ? 1 : 0 };
      k0 = f.contacts | 0;
    }
    if (f && dg && out.sc) {
      if (out.so && out.c2 == null && (f.contacts | 0) > k0) out.c2 = Object.assign({ t, day: world.day }, near(f, dg.holdPt));   // 대치 뒤 첫 접촉 — 그 순간 방어 몸
      if (!out.so && out.c2 == null && (f.contacts | 0) > 0) out.c2 = Object.assign({ t, day: world.day, first: 1 }, near(f, dg.holdPt));   // (대치 없는 판) 첫 접촉
      if (!out.hold) out.hold = [r2(dg.holdPt.cx), r2(dg.holdPt.cy)];
      if (!out.rel && f.adv && f.adv.side === 'A' && f.adv.released) { const a = cenA(f), b = cenB(f); out.rel = { t, a0: a ? [a.cx, a.cy] : null, b0: b ? [b.cx, b.cy] : null }; }   // 공격 풀림 순간(겨눔 갈래)
      if (out.rel && out.rel.a1 == null && t === out.rel.t + 90) { const a = cenA(f); if (a && out.rel.a0) { const dx = a.cx - out.rel.a0[0], dy = a.cy - out.rel.a0[1], dd = Math.hypot(dx, dy);
        const hx = dg.holdPt.cx - out.rel.a0[0], hy = dg.holdPt.cy - out.rel.a0[1], hd = Math.hypot(hx, hy), bx = out.rel.b0 ? out.rel.b0[0] - out.rel.a0[0] : 0, by = out.rel.b0 ? out.rel.b0[1] - out.rel.a0[1] : 0, bd = Math.hypot(bx, by);
        out.rel.a1 = [r2(a.cx), r2(a.cy)]; out.rel.mv = r2(dd); out.rel.cosH = dd > 0 && hd > 0 ? r2((dx * hx + dy * hy) / dd / hd) : null; out.rel.cosB = dd > 0 && bd > 0 ? r2((dx * bx + dy * by) / dd / bd) : null; } }
      for (const u of f.ctx.units) {
        if (u.side !== 'B') continue;
        let x = U.get(u.agent);
        const dh = Math.hypot(u.x - dg.holdPt.cx, u.y - dg.holdPt.cy);
        if (!x) { x = { pid: u.agent, cmd: !!(u.gu && u.gu.cmd), d0: dh, dS: null, mnS: null, mx: 0, px: u.x, py: u.y, dead: 0 }; U.set(u.agent, x); out.units.push(x); }
        if (u.hp <= 0) { x.dead = 1; continue; }
        const st = Math.hypot(u.x - x.px, u.y - x.py); if (st > x.mx) x.mx = st;
        if (out.so && x.dS == null) { x.dS = dh; x.mnS = dh; }
        if (out.so && dh < x.mnS) x.mnS = dh;
        if (H._warBlockedCell(u.x, u.y)) out.bad++;
        x.px = u.x; x.py = u.y;
      }
    }
    if (body && body.ended && !out.end) { out.end = body.ended; out.endT = t; }
    if (out.end && t - out.endT > 30) break;
  }
  for (const x of out.units) { delete x.px; delete x.py; x.d0 = r2(x.d0); x.dS = r2(x.dS); x.mnS = r2(x.mnS); x.mx = r2(x.mx); }
  out.knobOn = { hold: H.T1060_SCRAM_HOLD, aim: H.T1060_ATK_AIM };
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
const sub = (env, P) => { const E = Object.assign({}, process.env, { T1060_SUB: 'war' }); for (const k of KNOBS) delete E[k]; E.T790_NO_SNAP = '0'; E.T941_BATTLE_DAY = '0'; E.T627_TRIP_DAY = '0'; delete E.T1060_P; Object.assign(E, env || {}); if (P) E.T1060_P = JSON.stringify(P);
  const o = execFileSync(process.execPath, [__filename], { cwd: ROOT, env: E, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString(); return JSON.parse(o.slice(o.indexOf('{"sc"'))); };
const strip = (o) => JSON.stringify(Object.assign({}, o, { knob: null, knobOn: null }));
const sum = (o) => JSON.stringify({ sc: o.sc, so: o.so, nx: o.nx, c2: o.c2, end: o.end, endT: o.endT, bad: o.bad, u: o.units.slice(0, 4).map((x) => [x.cmd ? 'C' : '', x.d0, x.dS, x.mnS, x.mx, x.dead].join(':')) });
console.log('\n=== 긴급 소집 대형의 대치 재편 원점 = 포진점 — T1060 ===');

// ── ⓐ 정적 ──────────────────────────────────────────────────────────────────
console.log('\n[ⓐ] 정적 — 손잡이 문 둘 · 줄 · 새 수 0');
const so = fnBody(CV, '_warToStandoff'), hold = fnBody(CV, '_t1060Hold'), aim = fnBody(CV, '_t1060Aim'), ww = fnBody(CV, '_warWorld');
ok(/const T1060_SCRAM_HOLD = process\.env\.T1060_SCRAM_HOLD !== '0';/.test(CV) && (CV.match(/process\.env\.T1060_SCRAM_HOLD/g) || []).length === 1
  && /const T1060_ATK_AIM = process\.env\.T1060_ATK_AIM === '1';/.test(CV) && (CV.match(/process\.env\.T1060_ATK_AIM/g) || []).length === 1 && !/T1060/.test(CW + CB),
  "ⓐ 손잡이 문 둘 — villages `T1060_SCRAM_HOLD !== '0'`(켬 기본 · 되돌림 `=0`) · `T1060_ATK_AIM === '1'`(끔 기본 · 판 자 env) · war-live · battle-core 무변");
ok(/if \(body\.defGroup\) \{ WL\.regroup\(body\.defGroup\); if \(!body\.defGroup\.holdPt\) body\.defGroup\.holdPt = \{ cx: body\.defGroup\.cmd\.cx, cy: body\.defGroup\.cmd\.cy \}; \}\s*\n\s*if \(T1060_SCRAM_HOLD\) _t1060Hold\(body\.defGroup\);/.test(so)
  && /if \(body\.atkGroup\) \{ WL\.regroup\(body\.atkGroup\);/.test(so),
  'ⓐ ① 대치 전이 — 방어 재편 줄 글자 그대로 + 바로 다음 한 줄(`_t1060Hold`) · 공격 재편 줄 무변');
ok(/if \(g && g\._scram && g\._t790Walk > 0 && g\.holdPt && g\.units && g\.units\.length\) g\.cmd = \{ cx: g\.holdPt\.cx, cy: g\.holdPt\.cy \};/.test(hold) && !/regroup|setSideCtl|\.x =|\.y =/.test(hold),
  'ⓐ ① 원점 문 — 긴급 소집(`_scram`) · 몸 걸음 칸(`_t790Walk`) · 포진점이 있을 때만 원점 = 포진점(몸 자리 · 상태 무변 — 몸은 걷는다)');
ok(/const T = shooter \|\| \(\(c && c\.n\) \? \(_t1060Aim\(fight, u\) \|\| \{ x: c\.x, y: c\.y \}\) : fight\.objective\); if \(!T\) return null;/.test(ww)
  && /if \(!T1060_ATK_AIM \|\| u\.side !== 'A'\) return null;/.test(aim) && /if \(!g \|\| !g\._scram \|\| !g\.holdPt\) return null;/.test(aim) && /return \{ x: g\.holdPt\.cx \* MPC, y: g\.holdPt\.cy \* MPC \};/.test(aim),
  "ⓐ ② 겨눔 — advance 목표 = (켬 · 공격 몸 · 긴급 소집 수비면 포진점) 아니면 적 본대 무게중심(끔 = 종전 글자의 값) · 수비 없으면 목표 마을 그대로");
{
  const add = [hold, aim, (so.match(/if \(T1060_SCRAM_HOLD\)[^\n]*/) || [''])[0], (ww.match(/const T = [^\n]*/) || [''])[0]].join(' ').replace(/'[^']*'/g, "''").replace(/T1060|_t1060|T790|_t790/g, '');
  ok(!/[^\w.'](?:[1-9]|\d{2,})(?:\.\d+)?(?![\w'])/.test(add), 'ⓐ 새 수 0 — 더한 글자엔 0 만(원점 = 포진점 · 목표 = 포진점 — 거리 · 걸음 · 문턱은 종전 것)', add.length + '자');
}

// ── ⓑ 걸어 오던 긴급 소집 대형이 길 중간에서 대치 — 몸은 회관 북쪽 150칸 ──────────
console.log('\n[ⓑ] 걸어 오던 긴급 소집 대형이 길 중간에서 대치(접촉 0) — 방어 몸이 회관 북쪽 150칸(돌격 결단 그 자리 소집 · 영토 400)');
const FAR = { land: 400, far: [0, -150], force: 300, maxTicks: 30 * 60 * 3 };
const OFF = sub({ T1060_SCRAM_HOLD: '0' }, FAR), ON = sub({}, FAR), ON1 = sub({ T1060_SCRAM_HOLD: '1' }, FAR);
{
  const alive = (o) => o.units.filter((x) => !x.dead);
  ok(OFF.sc && OFF.sc.fst === 'form' && OFF.sc.ctl === 1 && ON.sc && ON.sc.fst === 'form' && ON.sc.n === OFF.sc.n && OFF.so && ON.so && OFF.so.k === 0 && ON.so.k === 0
    && OFF.so.scram === 1 && OFF.so.walk === 1 && ON.so.walk === 1 && OFF.so.pre.cen > 100 && ON.so.pre.cen === OFF.so.pre.cen,
    'ⓑ 전제 — 두 판 다 결단 그 자리 긴급 소집(대형이 쥔다 · 걷는 대형) · 접촉 0 인 채 대치 · 그 순간 몸은 포진점에서 100칸 밖(같은 자리)', JSON.stringify({ off: OFF.so, on: ON.so }));
  ok(OFF.so.oD > 100 && OFF.so.oCmd < 1 && OFF.nx && OFF.nx.cen > 100 && OFF.nx.in13 === 0 && alive(OFF).every((x) => x.dS - x.mnS < 13),
    '★ⓑ 끔(`=0`) — 재편 원점 = 길 중간(첫 생존자 자리 · 포진점에서 100칸 밖) · 이튿날 돌격 때도 그 대형은 길 중간(포진점 13칸 안 0 · 대치 뒤 13칸도 못 온다 — 증인)', sum(OFF));
  ok(ON.so.oD === 0 && ON.nx && alive(ON).every((x) => x.dS - x.mnS >= 60) && ON.nx.cen < OFF.nx.cen - 30,
    '★ⓑ 켬(미설정 = 기본) — 재편 원점 = 포진점 · 몸마다 포진점 쪽으로 60칸 넘게 걸어 온다 · 이튿날 돌격 때 대형이 마을 쪽으로 왔다', sum(ON));
  ok(ON.units.every((x) => x.mx <= 2) && OFF.units.every((x) => x.mx <= 2) && ON.bad === 0 && OFF.bad === 0,
    'ⓑ 두 판 다 한 걸음 2칸 넘는 몸 0(순간이동 0) · 막힌 칸 걸음 0', JSON.stringify({ on: Math.max(...ON.units.map((x) => x.mx)), off: Math.max(...OFF.units.map((x) => x.mx)) }));
  ok(strip(ON1) === strip(ON) && strip(ON) !== strip(OFF) && ON.knobOn.hold === true && OFF.knobOn.hold === false, "ⓑ 켬 `'1'` = 미설정과 같은 판 · 끔(`=0`)과는 다른 판");
}

// ── ⓒ 걷지 않는 긴급 소집 대형 — 손잡이와 무관 ─────────
console.log('\n[ⓒ] 걷지 않는 긴급 소집 대형(`T1044_SCRAM_WALK=0` — 지휘 몸 놓기) — 원점을 옮기지 않는다');
{
  const OFF3 = sub({ T1044_SCRAM_WALK: '0', T1060_SCRAM_HOLD: '0' }, FAR), ON3 = sub({ T1044_SCRAM_WALK: '0' }, FAR);
  ok(OFF3.so && ON3.so && ON3.so.walk === 0 && ON3.so.scram === 1 && ON3.so.oCmd < 1 && strip(ON3) === strip(OFF3),
    'ⓒ 걷지 않는 대형 — 켬 = 끔 바이트(원점 = 첫 생존자(지휘 몸 — 원점에 놓인 몸) 자리 그대로 · 놓기가 순간이동이 될 원점 옮김 0)', JSON.stringify({ so: ON3.so }));
}

// ── ⓓ 응전 포진(긴급 소집 아님)의 대치 — 손잡이와 무관 ─────────
console.log('\n[ⓓ] 응전 포진(경보 반경 — 긴급 소집 아님)의 대치 — 손잡이와 무관');
{
  const RS = { hold: false, far: [0, -150], force: 300, maxTicks: 30 * 60 * 3 };
  const OFF4 = sub({ T1060_SCRAM_HOLD: '0' }, RS), ON4 = sub({}, RS);
  ok(OFF4.so && ON4.so && ON4.so.scram === 0 && ON4.so.k === 0 && strip(ON4) === strip(OFF4), 'ⓓ 응전 포진 대형(접촉 0 대치) — 켬 = 끔 바이트', JSON.stringify({ so: ON4.so }));
}

// ── ⓔ 겨눔 갈래(판 자 env) — 미설정 = 종전 · '1' = 포진점 ─────────
console.log('\n[ⓔ] 겨눔 갈래 `T1060_ATK_AIM`(판 자 아이 env · 제품 기본 무변) — 대치를 세우지 않은 판(진척 시계 그대로)');
{
  const NAT = { land: 400, far: [0, -150], maxTicks: 30 * 60 * 3 };
  const B0 = sub({}, NAT), B00 = sub({ T1060_ATK_AIM: '0' }, NAT), A1 = sub({ T1060_ATK_AIM: '1' }, NAT);
  ok(strip(B0) === strip(B00) && strip(A1) !== strip(B0) && B0.knobOn.aim === false && A1.knobOn.aim === true,
    "ⓔ 미설정 = `'0'` 같은 판(제품 기본 무변 — 켜는 값은 `'1'` 하나) · `'1'` 은 다른 판");
  ok(B0.rel && A1.rel && B0.rel.mv > 2 && A1.rel.mv > 2 && A1.rel.cosH > 0.9 && B0.rel.cosB > 0.9 && A1.rel.cosB < B0.rel.cosB,
    "ⓔ 풀린 공격 몸 3초 걸음 — `'1'` 은 포진점 쪽(cos > 0.9) · 미설정은 걸어 오는 몸 쪽(cos > 0.9)", JSON.stringify({ b: B0.rel, a: A1.rel }));
  ok(B0.c2 && A1.c2 && A1.c2.cen < 30 && B0.c2.cen > A1.c2.cen + 40, "ⓔ 첫 접촉 순간 방어 몸 무게중심 — `'1'` 은 포진점 30칸 안(성문 앞) · 미설정은 그보다 40칸 넘게 밖(길 중간)", JSON.stringify({ b: B0.c2, a: A1.c2 }));
  ok(A1.units.every((x) => x.mx <= 2) && A1.bad === 0, "ⓔ `'1'` — 한 걸음 2칸 넘는 몸 0 · 막힌 칸 걸음 0");
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
