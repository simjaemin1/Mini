'use strict';
// (@regress 없음 — 러너 밖 · T956 관찰기 · 읽기만 · 제품 손잡이 0)
// === scripts/t956-war-probe.js — 끝나지 않는 전쟁 관찰기(서버 판 자 `t577-server-run.js` 곁 프리로드) ===================
//
// ★왜 [T941 회부 2 → T956] 교전 몫을 라이브와 같게 한 판(`T941_BATTLE_DAY=1`)에서도 몇 달 가는 전쟁 두 꼴이 남았다 —
//   ⓐ 접촉 0 ~ 1 인 채 날마다 출격(★실제로는 **돌격** — 보고 T956 §1-2) → 진척 없음 → 대치 → 행군 · 주둔(`_warToStandoff`)을 되풀이(대치 수 = 날 수)
//   ⓑ 맞붙은 채(접촉 8) 하루 몸 1,440초를 다 쓰고도 궤주 없이 151날.
//   t924 관찰기는 하루 경계의 전쟁 칸(국면 · 작전 · 접촉 수 · 대치 수 · 생존)만 본다 — 그날 **누가 나섰고 왜 못 닿았는지**,
//   **맞붙은 채 왜 안 끝나는지**는 안 보인다. 이 관찰기는 그 셋을 날마다 남긴다:
//   ① 결단 층(war-core `daily`) — 그날 앞뒤 전쟁 칸(국면 · 작전 · 방어 태세 · 출격 · 헛걸음 · 짐) · 두 승산(`_opAtkOdds` · `_opDefOdds` — 순수 함수) ·
//      그날 war-core 결단 글(`log` — 호스트가 비워 둔 문에 받아 적기만 · 버퍼 `stats().log` 는 그대로) · 교전 훅(`onEngage`)이 받은 까닭(돌격 · 출격)
//   ② 교전 층(war-live) — 전진 명령(`orderAdvance` — 누가 나섰나 · 지키는 쪽 · 두 대형 원점 거리) · 걸음마다 사건(접촉 · 대치 · 궤주) ·
//      1초(30걸음)마다 표본: 측마다 생존 · 싸우는 수 · 궤주 · 대형이 쥔 수 · 상태 분포 · 사기 평균 · 최저 · hp 합 · 맞선 두 몸 최소 거리 ·
//      제자리 몸 · 화살 · 돌 · 전진 쪽 행군로 진척(`f.adv` — 풀림 · 투영점) — 대치 순간엔 그 앞 걸음의 진척 시계(접촉 · 진척 · 최소 간격)
//   ③ 몸 층(villages `state.warBodies` — 하네스 문 `__p3Bind({})` · 빈 목 = 아무것도 안 덮는다) — 그날 끝 대형 원점 · 포진점 · 주둔점 · 마을 중심 거리
//   ④ 막힘 셈(대치 앞 걸음 · 그날 첫 표본) — 풀림 술어의 원점선(두 대형 원점 사이 걸음 줄) · 맞선 두 몸 사이 걸음 줄 · 시야 표본의 첫 막힌 칸과 종류.
//      **호스트 메모만 읽는다**(`_warRectCells` · `_warTerrMemo` · `_warTreeMemo` · `_warWaterMemo` — 술어를 새로 안 부른다 · 메모에 없는 칸은 '?').
//   ⚠읽기만 — 전쟁 칸 · 몸 칸 · 교전 칸에 쓰지 않는다 · RNG 무접촉(승산 둘은 RNG 없는 순수 함수 · 몸 자리는 접근자 읽기).
//     감싸는 것은 모듈이 내보낸 문 넷(`createWarLive` · `createWar` · 그 둘이 돌려준 `stepFight` · `orderAdvance` · `settle` · `daily`)과
//     호스트가 넘긴 훅 둘(`onEngage` · `log` — log 는 호스트가 null 로 둔 문이다)뿐 — 받은 값을 그대로 돌려준다.
//     증인: 같은 판을 이 관찰기 없이 돈 판과 판 JSON · t924 JSON 바이트 같음(보고 T956 §1).
//
// 쓰는 법:  NODE_OPTIONS="-r $PWD/scripts/t745-vclock.js -r $PWD/scripts/t924-observe.js -r $PWD/scripts/t956-war-probe.js" \
//             T745_VCLOCK=1 WAR_MINDAY=100 T941_BATTLE_DAY=1 node scripts/t577-server-run.js 400 1020
//           (`T577_SEED` 가 있는 아이 서버만 잰다 · 판 JSON 곁 `<판>-<시드>.t956.json` · `T956_OUT` 로 바꿀 수 있다)
//   ⇒ { wars: { id: { atk, def, casus, force, first, end, days: { 날: {...} }, eng: [...], so: [...], set: [...] } }, errs }
//     표 기계: `scripts/t956-war-table.js <t956.json>`
const path = require('path');
const fs = require('fs');
if (!process.env.T577_SEED) return;
const OUT = process.env.T956_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t956.json' : '');
const ROOT = path.join(__dirname, '..');
const WLM = require(path.join(ROOT, 'server', 'war-live'));
const WCM = require(path.join(ROOT, 'sim', 'war-core'));
const SAMPLE = 30;   // 표본 간격(걸음) — 존 틱 Hz 30 이면 몸 1초(관찰 간격일 뿐 · 세계 수 아님)
const rec = { ver: 1, seed: +process.env.T577_SEED, wars: {}, errs: 0, err0: null, logN: 0 };
const r2 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 100) / 100;
const r3 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 1000) / 1000;
function err(e) { rec.errs++; if (!rec.err0) rec.err0 = String(e && e.stack || e).slice(0, 600); }
function W(w) {
  const id = w && w.id; if (id == null) return null;
  let o = rec.wars[id];
  if (!o) o = rec.wars[id] = { id, atk: w.atk && w.atk.name, def: w.def && w.def.name, casus: w.casus, force: w.force, warriors: w.warriors, comp: w.composition || null, born: w.born, marchDays: w.marchDays, first: null, end: null, days: {}, hook: [], eng: [], so: [], set: [] };
  return o;
}
function D(o, day) { let d = o.days[day]; if (!d) d = o.days[day] = {}; return d; }
// ── 몸 층(호스트 상태 · t924 와 같은 문) ──
let _vst = null;
function vstate() {
  if (_vst) return _vst;
  try { const k = require.resolve(path.join(ROOT, 'server', 'villages.js')); const m = require.cache[k]; if (m && m.exports && typeof m.exports.__p3Bind === 'function') _vst = m.exports.__p3Bind({}).state; } catch (e) { _vst = null; }
  return _vst;
}
const pt = (p) => p ? [r2(p.cx), r2(p.cy)] : null;
const dist = (a, b) => (a && b) ? r2(Math.hypot(a.cx - b.cx, a.cy - b.cy)) : null;
function bodySnap(w) {
  const S = vstate(), b = S && S.warBodies && S.warBodies.get ? S.warBodies.get(w.id) : null; if (!b) return null;
  const ag = b.atkGroup, dg = b.defGroup, vc = w.def ? { cx: w.def.ccx, cy: w.def.ccy } : null;
  const alive = (g) => g && g.units ? g.units.filter((u) => !u.dead).length : 0;
  return { ph: b.phase || null, mode: b.mode || null, ag: ag ? pt(ag.cmd) : null, agN: alive(ag), dg: dg ? pt(dg.cmd) : null, dgN: alive(dg), hold: dg ? pt(dg.holdPt) : null, camp: pt(b.campPt), vc: pt(vc),
    agVc: ag ? dist(ag.cmd, vc) : null, agDg: (ag && dg) ? dist(ag.cmd, dg.cmd) : null, agCamp: ag ? dist(ag.cmd, b.campPt) : null, scram: dg ? !!dg._scram : null, defBuilt: !!b.defBuilt };
}
// ── ① 결단 층 ──
const WSNAP = (w) => ({ ph: w.phase, op: w.op, dm: w._defMode || null, dmd: w._defModeDay != null ? w._defModeDay : null, so: !!w._sortie, sm: w._sortieMiss != null ? w._sortieMiss : null, pk: r2(w._packRem), eta: w.eta });
let _today = -1, _logBuf = [];
//   그날 글 중 그 전쟁의 두 마을 이름이 든 줄(war-core 글은 전쟁 id 를 안 싣는다 — 같은 두 마을의 전쟁이 둘이면 둘 다에 붙는다)
const logsOf = (o) => _logBuf.filter(([, m]) => [o.atk, o.def].some((n) => n && m.indexOf(n) >= 0)).map(([d, m]) => 'D' + d + ' ' + m);
const cw = WCM.createWar;
WCM.createWar = function (opts) {
  const host = opts || {};
  const hostLog = typeof host.log === 'function' ? host.log : null;
  const hostEngage = host.onEngage;
  const o2 = Object.assign({}, host, {
    log: function (day, m) { try { if (rec.logN < 400000) { rec.logN++; _logBuf.push([day | 0, String(m)]); } } catch (e) { err(e); } if (hostLog) return hostLog.apply(this, arguments); },
    onEngage: typeof hostEngage === 'function' ? function (w, day, why) {
      let took; const t0 = W(w); const pre = t0 ? WSNAP(w) : null;
      took = hostEngage.apply(this, arguments);
      try { if (t0) t0.hook.push({ day: day | 0, why, took: !!took, pre, post: WSNAP(w) }); } catch (e) { err(e); }
      return took;
    } : hostEngage,
  });
  const war = cw.call(this, o2);
  const dl = war.daily;
  war.daily = function (day) {
    const WARS = war.WARS || [];
    const pre = new Map();
    try { for (const w of WARS) pre.set(w.id, WSNAP(w)); } catch (e) { err(e); }
    const r = dl.apply(this, arguments);
    try {
      const d0 = day | 0; _today = d0;
      const seen = new Set();
      for (const w of war.WARS || []) {
        const o = W(w); if (!o) continue; seen.add(w.id);
        if (o.first == null) o.first = d0;
        const d = D(o, d0);
        d.pre = pre.get(w.id) || null; d.post = WSNAP(w);
        try { d.pWin = r3(WCM._opAtkOdds(w)); d.pDef = r3(WCM._opDefOdds(w.def, w.force || 0)); } catch (e) { err(e); }
        d.body = bodySnap(w);
        const L = logsOf(o); if (L.length) d.log = L;
      }
      for (const [id, p] of pre) if (!seen.has(id)) { const o = rec.wars[id]; if (o && o.end == null) { o.end = d0; D(o, d0).pre = p; const L = logsOf(o); if (L.length) D(o, d0).log = L; } }
    } catch (e) { err(e); }
    _logBuf = [];   // 지난 하루치(틱 사이 정산 글 · 그날 결단 글)를 그날 전쟁에 붙였다 — 다음 하루치를 받는다
    return r;
  };
  return war;
};
// ── ② 교전 층 ──
const FA = new WeakMap();   // 교전(f) → 그날 셈
function side(f, s) {
  let alive = 0, fight = 0, rout = 0, ctl = 0, hp = 0, mrl = 0, mMin = 9, still = 0; const st = {};
  for (const u of f.ctx.units) {
    if (u.side !== s || u.hp <= 0) continue;
    alive++; if (!u.routing) fight++; else rout++; if (u.ctl) ctl++;
    hp += u.hp; const m = +u.mrl || 0; mrl += m; if (m < mMin) mMin = m;
    const k = (u.ctl ? 'c:' : '') + (u.st || '-') + ':' + u.type; st[k] = (st[k] || 0) + 1;
    if (u._ox != null && Math.abs(u._ox - u.x) + Math.abs(u._oy - u.y) < 1e-9) still++;
  }
  return { n: alive, f: fight, r: rout, c: ctl, hp: r2(hp), m: alive ? r3(mrl / alive) : null, mMin: alive ? r3(mMin) : null, still, st, ar: f.ctx.sides[s] ? (f.ctx.sides[s].arrows | 0) : null, sn: f.ctx.sides[s] ? (f.ctx.sides[s].stones | 0) : null, dead: f.ctx.sides[s] ? f.ctx.sides[s].dead : null, start: f.ctx.sides[s] ? f.ctx.sides[s].start : null };
}
function minCross(f) {
  let md = Infinity; const U = f.ctx.units;
  for (const a of U) { if (a.side !== 'A' || a.hp <= 0) continue; const ax = a.x, ay = a.y;
    for (const b of U) { if (b.side !== 'B' || b.hp <= 0) continue; const d = (b.x - ax) ** 2 + (b.y - ay) ** 2; if (d < md) md = d; } }
  return md === Infinity ? null : r2(Math.sqrt(md));
}
// ── 막힘 셈(대치 앞 걸음 · 맞붙은 날 첫 표본) — 호스트 메모만 읽는다(술어를 새로 부르지 않는다 · 메모에 없는 칸은 '?') ──
//   셀 종류: R = 건물 발자국(`state._warRectCells`) · Tw 물 · Tr 바위 · 도랑(`_warTerrMemo` 1 + `_warWaterMemo`) · W = 나무(`_warTreeMemo` 1) · . = 열림
function cellK(S, ix, iy) {
  const k = ix * 65536 + iy;
  if (S._warRectCells && S._warRectCells.has(k)) return 'R';
  const t = S._warTerrMemo ? S._warTerrMemo.get(k) : undefined;
  if (t === 1) { const w = S._warWaterMemo ? S._warWaterMemo.get(k) : undefined; return w === 1 ? 'Tw' : (w === 0 ? 'Tr' : 'T'); }
  const w = S._warTreeMemo ? S._warTreeMemo.get(k) : undefined;
  if (w === 1) return 'W';
  if (t === undefined || w === undefined) return '?';
  return '.';
}
//   villages `_warClearLine` 과 같은 격자 순회(40m 앞까지 · 서 있는 칸 빼고 · 끝 칸 넣고) — 첫 막힌 칸 · 종류 셈
function lineK(S, MPC, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy); if (d < 1) return { d: r2(d), first: null, n: 0, ks: {} };
  const tEnd = Math.min(d, 40) / d;
  let cx = Math.floor(x1 / MPC), cy = Math.floor(y1 / MPC);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? MPC / Math.abs(dx) : Infinity, tdy = dy !== 0 ? MPC / Math.abs(dy) : Infinity;
  let tx = dx !== 0 ? (sx > 0 ? (cx + 1) * MPC - x1 : x1 - cx * MPC) / Math.abs(dx) : Infinity;
  let ty = dy !== 0 ? (sy > 0 ? (cy + 1) * MPC - y1 : y1 - cy * MPC) / Math.abs(dy) : Infinity;
  let first = null, n = 0; const ks = {};
  for (let g = 0; g < 200; g++) {
    let tt;
    if (tx < ty) { if (tx > tEnd) break; tt = tx; cx += sx; tx += tdx; } else { if (ty > tEnd) break; tt = ty; cy += sy; ty += tdy; }
    n++; const k = cellK(S, cx, cy);
    if (k !== '.') { ks[k] = (ks[k] || 0) + 1; if (!first && k !== '?') first = { i: n, c: [cx, cy], k, at: r2(tt * d) }; }   // 걷기 막힘 = 건물 · 지형(물 포함) · 나무
  }
  return { d: r2(d), first, n, ks };
}
//   battle-core 시야(villages `_warWorld().losBlocked` — 1.5m 표본 · 건물 · 바위(물 아닌 막힌 지형) · 나무)
function losK(S, MPC, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy), n = Math.ceil(d / 1.5);
  const ks = {}; let first = null;
  for (let i = 1; i < n; i++) { const s = i / n, cx = Math.floor((x1 + dx * s) / MPC), cy = Math.floor((y1 + dy * s) / MPC); const k = cellK(S, cx, cy);
    const blk = k === 'R' || k === 'Tr' || k === 'W'; if (k !== '.') ks[k] = (ks[k] || 0) + 1; if (blk && !first) first = { i, c: [cx, cy], k, at: r2(s * d) }; }
  return { d: r2(d), n: Math.max(0, n - 1), first, ks };
}
function census(f) {
  const S = vstate(); if (!S) return null;
  const MPC = (S.warLive && S.warLive.M_PER_CELL) || 1;
  const b = S.warBodies && S.warBodies.get ? S.warBodies.get(f.w.id) : null;
  const out = {};
  const fl = (m) => Math.floor(m / MPC);
  if (b && b.atkGroup && b.defGroup && b.atkGroup.cmd && b.defGroup.cmd) {
    const gm = { x: b.atkGroup.cmd.cx * MPC, y: b.atkGroup.cmd.cy * MPC }, T = { x: b.defGroup.cmd.cx * MPC, y: b.defGroup.cmd.cy * MPC };
    //   풀림 술어(villages `_warAdvanceMarch`): 두 대형 원점 거리 ≤ WAR_ENGAGE_R · `_warClearLine(원점 → 적 대형 원점)`
    out.rel = Object.assign(lineK(S, MPC, gm.x, gm.y, T.x, T.y), { from: cellK(S, fl(gm.x), fl(gm.y)), to: cellK(S, fl(T.x), fl(T.y)), hold: b.defGroup.holdPt ? cellK(S, Math.floor(b.defGroup.holdPt.cx), Math.floor(b.defGroup.holdPt.cy)) : null });
  }
  let best = null, bd = Infinity;
  for (const a of f.ctx.units) { if (a.side !== 'A' || a.hp <= 0) continue; for (const e of f.ctx.units) { if (e.side !== 'B' || e.hp <= 0) continue; const d = (a.x - e.x) ** 2 + (a.y - e.y) ** 2; if (d < bd) { bd = d; best = [a, e]; } } }
  if (best) {
    const [a, e] = best;
    const U = (u) => ({ x: r2(u.x), y: r2(u.y), ty: u.type, st: u.st || null, ctl: u.ctl ? 1 : 0, cell: cellK(S, fl(u.x), fl(u.y)), clear: u._clear == null ? null : (u._clear ? 1 : 0), wpBlk: u._wpBlk == null ? null : (u._wpBlk ? 1 : 0), tgt: u.tgt ? 1 : 0, cd: r2(u.cd), mrl: r3(u.mrl), hp: r2(u.hp) });
    out.pair = { a: U(a), e: U(e), d: r2(Math.sqrt(bd)), line: lineK(S, MPC, a.x, a.y, e.x, e.y), los: losK(S, MPC, a.x, a.y, e.x, e.y) };
  }
  return out;
}
function advSnap(f) { const A = f.adv; if (!A) return null; const L = f.routePoly ? f.routePoly.cum[f.routePoly.cum.length - 1] : null; return { side: A.side, rel: !!A.released, s: r2(A.s), sT: r2(A.sT), L: r2(L) }; }
function snapFight(f, WL) {
  const ca = WL.centroid(f, 'A'), cb = WL.centroid(f, 'B');
  return { t: r2(f.t), st: f.state, A: side(f, 'A'), B: side(f, 'B'), gap: (ca && cb) ? r2(Math.hypot(ca.x - cb.x, ca.y - cb.y)) : null, mc: minCross(f), adv: advSnap(f), holder: f.holder || null, ctT: r2(f.contactT), gpT: r2(f.gapT), best: r2(f.bestGap) };
}
const cwl = WLM.createWarLive;
WLM.createWarLive = function (opts) {
  const WL = cwl.apply(this, arguments);
  const dayOf = (opts && typeof opts.dayOf === 'function') ? opts.dayOf : () => _today;
  const sf = WL.stepFight, oa = WL.orderAdvance, se = WL.settle;
  WL.stepFight = function (f) {
    const c0 = f.contactT, g0 = f.gapT, b0 = f.bestGap, s0 = f.state, k0 = f.contacts;
    //   대치가 이 걸음에 날 판이면(진척 시계가 문턱을 넘는다 — war-live 그 식) 걸음 **앞** 표본을 남긴다(대치 전이가 상태 · 대형 손을 되돌리기 전)
    let preSnap = null;
    try { if (s0 !== 'form' && (f.t + WL.STEP_DT) - Math.max(c0, g0) > WL.standoffSec(f)) { preSnap = snapFight(f, WL); preSnap.cen = census(f); } } catch (e) { err(e); }
    const ev = sf.apply(this, arguments);
    try {
      const day = dayOf() | 0;
      let a = FA.get(f);
      if (!a || a.day !== day) {
        const o = W(f.w); if (!o) return ev;
        a = { day, n: 0, o, out: { steps: 0, cSteps: 0, eSteps: 0, aSteps: 0, newC: 0, so: 0, rout: null, first: null, last: null, mcMin: null, relT: null } };
        FA.set(f, a); D(o, day).fight = a.out;
      }
      const q = a.out; q.steps++;
      if (ev.contact) q.cSteps++;
      if (f.state === 'engaged') q.eSteps++; else if (f.state === 'advance') q.aSteps++;
      if ((f.contacts | 0) > (k0 | 0)) q.newC++;
      if (q.relT == null && f.adv && f.adv.released) q.relT = r2(f.t);
      if (ev.rout) q.rout = ev.rout;
      a.n++;
      if (a.n === 1 || a.n % SAMPLE === 0 || ev.rout || ev.standoff) {
        const s = snapFight(f, WL);
        if (s.mc != null && (q.mcMin == null || s.mc < q.mcMin)) q.mcMin = s.mc;
        if (!q.first) { q.first = s; try { s.cen = census(f); } catch (e) { err(e); } }
        q.last = s;
      }
      if (ev.standoff) {
        q.so++;
        a.o.so.push({ day, t: r2(f.t), pre: { st: s0, ctT: r2(c0), gpT: r2(g0), best: r2(b0) }, sec: r3(WL.standoffSec(f)), before: preSnap, contacts: f.contacts | 0 });
      }
    } catch (e) { err(e); }
    return ev;
  };
  WL.orderAdvance = function (f, s) {
    let pre = null; try { pre = { st: f.state, contacts: f.contacts | 0, standoffs: f.standoffs | 0 }; } catch (e) { err(e); }
    const r = oa.apply(this, arguments);
    try { const o = W(f.w); if (o) o.eng.push({ day: dayOf() | 0, adv: s, holder: f.holder || null, t: r2(f.t), pre, body: bodySnap(f.w), snap: snapFight(f, WL) }); } catch (e) { err(e); }
    return r;
  };
  WL.settle = function (f, why, winner) {
    const r = se.apply(this, arguments);
    try { const o = W(f.w); if (o) o.set.push({ day: dayOf() | 0, why, winner: winner || null, took: !!r, t: r2(f.t), snap: snapFight(f, WL) }); } catch (e) { err(e); }
    return r;
  };
  return WL;
};
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
