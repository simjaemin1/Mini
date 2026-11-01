'use strict';
// (@regress 없음 — 러너 밖 · T1044 관찰기 · 읽기만 · 제품 손잡이 0)
// === scripts/t1044-scram-probe.js — 방어 소집 몸 관찰기(서버 판 자 `t577-server-run.js` 곁 프리로드) =======================
//
// ★왜 [T1019 회부 1 → T1044] 돌격이 이미 전진 중일 때 긴급 소집(villages `_warEnsureDefense` scram)이 서면 방어 몸은 슬롯 놓기 없이
//   곧바로 교전에 풀린다(`setSideCtl(B, false)`) — 소집된 그 자리(집 · 일터)에서 지키는 쪽(holder)이라 `world.advance` 가 null — 싸움터에 못 온다.
//   이 관찰기는 방어 대형이 교전 명부에 오르는 순간(war-live `enlist` B)마다 한 줄을 남기고, 그 교전이 정산될 때까지 그 몸들을 따라간다:
//   ① 언제 — 그날 · 교전 상태(`f.state` — 'form' = 돌격 결단 그 자리 `_warEngage` · 'advance' = 돌격 전진 중) · 긴급 소집 칸(`_scram`) ·
//      돌격 무게중심 → 회관 거리 · 대형이 쥐나(그 걸음 villages 가 부른 `setSideCtl(B, …)`)
//   ② 얼마나 먼가 — 몸마다 회관 · 포진점(`holdPt`) · 제 슬롯(`_muSlotXY`)까지(셀) — 소집 순간
//   ③ 왔나 — 몸마다 포진점까지 가장 가까웠던 거리 · 첫 접촉 순간의 거리 · 맞붙음(풀린 몸의 'melee' · 'shoot') · 다침 · 죽음 · 교전 끝(정산)
//   ⚠읽기만 — 전쟁 칸 · 몸 칸 · 교전 칸에 쓰지 않는다 · RNG 무접촉(몸 자리는 접근자 읽기 · 슬롯 자리는 순수 함수 `_muSlotXY`).
//     감싸는 것은 `createWarLive` 가 돌려준 문 넷(`enlist` · `setSideCtl` · `stepFight` · `settle`)뿐 — 받은 값을 그대로 돌려준다.
//     (war-live 안에서 부르는 `setSideCtl`(접촉 · 대치 · 전진 명령)은 감싸지 않는다 — villages 가 부른 것만 본다.)
//
// 쓰는 법:  NODE_OPTIONS="… -r $PWD/scripts/t1044-scram-probe.js" node scripts/t577-server-run.js 800 1020,7,42
//           (`T577_SEED` 가 있는 아이 서버만 잰다 · 판 JSON 곁 `<판>-<시드>.t1044.json` · `T1044_OUT` 로 바꿀 수 있다)
//   ⇒ { seed, ev: [ { day, wid, atk, def, t, fst, scram, ctl, n, hall, hold, rally, dAg, u: [ {ty, h0, d0, s0, mn, c1, eng, hurt, dead} ], c1, so, end } ], errs }
//     표 기계: `scripts/t1044-scram-table.js <판 자 뿌리>`
const path = require('path');
const fs = require('fs');
if (!process.env.T577_SEED) return;
const OUT = process.env.T1044_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1044.json' : '');
const ROOT = path.join(__dirname, '..');
const WLM = require(path.join(ROOT, 'server', 'war-live'));
const SAMPLE = 30;   // 표본 간격(걸음) — 존 틱 Hz 30 이면 몸 1초(관찰 간격일 뿐 · 세계 수 아님)
const rec = { ver: 1, seed: +process.env.T577_SEED, ev: [], errs: 0, err0: null };
const r2 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 100) / 100;
function err(e) { rec.errs++; if (!rec.err0) rec.err0 = String(e && e.stack || e).slice(0, 600); }
let _vst = null;
function vstate() {
  if (_vst) return _vst;
  try { const k = require.resolve(path.join(ROOT, 'server', 'villages.js')); const m = require.cache[k]; if (m && m.exports && typeof m.exports.__p3Bind === 'function') _vst = m.exports.__p3Bind({}).state; } catch (e) { _vst = null; }
  return _vst;
}
const pt = (p) => p ? [r2(p.cx), r2(p.cy)] : null;
const FS = new WeakMap();   // 교전(f) → 방어 소집 줄(몸 참조는 여기만 — 쓸 때 뺀다)
function med(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return r2(s[Math.floor(s.length / 2)]); }
function nearCount(E, MPC) {   // 산 몸 중 포진점에서 13셀(근접 교전 거리 — war-live MELEE_ENG_R · 관찰 문턱) 안 · 50셀(WAR_ENGAGE_R) 안 · 가운데 · 가장 먼
  const ds = []; let ctl = 0;
  for (const x of E._U) { if (x.bu.hp <= 0) continue; ds.push(Math.hypot(x.bu.x / MPC - E._hold.cx, x.bu.y / MPC - E._hold.cy)); if (x.bu.ctl) ctl++; }
  return { n: ds.length, in13: ds.filter((d) => d <= 13).length, in50: ds.filter((d) => d <= 50).length, med: med(ds), max: ds.length ? r2(Math.max(...ds)) : null, ctl };
}
const cwl = WLM.createWarLive;
WLM.createWarLive = function (opts) {
  const WL = cwl.apply(this, arguments);
  const dayOf = (opts && typeof opts.dayOf === 'function') ? opts.dayOf : () => -1;
  const MPC = WL.M_PER_CELL || 1;
  const en = WL.enlist, ssc = WL.setSideCtl, sf = WL.stepFight, se = WL.settle;
  WL.enlist = function (f, side, gu, p) {
    const bu = en.apply(this, arguments);
    try {
      if (side === 'B' && bu && f && f.w) {
        let E = FS.get(f);
        const S = vstate(), b = S && S.warBodies && S.warBodies.get ? S.warBodies.get(f.w.id) : null, dg = b ? b.defGroup : null;
        if (!E && dg) {
          const w = f.w, hall = { cx: w.def.ccx, cy: w.def.ccy };
          let ag = null; if (b.atkGroup && b.atkGroup.units) { let x = 0, y = 0, n = 0; for (const u of b.atkGroup.units) { if (u.dead) continue; x += u.x; y += u.y; n++; } if (n) ag = { cx: x / n, cy: y / n }; }
          if (!ag && b.cmd) ag = b.cmd;
          E = { day: dayOf() | 0, wid: w.id, atk: w.atk && w.atk.name, def: w.def && w.def.name, casus: w.casus || null, op: w.op || null, dm: w._defMode || null,
            t: r2(f.t), fst: f.state, scram: !!dg._scram, ctl: null, n: dg.units.length, hall: pt(hall), hold: pt(dg.holdPt || dg.cmd), rally: pt(dg.rally),
            dAg: ag ? r2(Math.hypot(ag.cx - hall.cx, ag.cy - hall.cy)) : null, u: [], c1: null, so: [], end: null, nS: 0,
            _U: [], _hold: dg.holdPt ? { cx: dg.holdPt.cx, cy: dg.holdPt.cy } : { cx: dg.cmd.cx, cy: dg.cmd.cy }, _dg: dg };
          FS.set(f, E); rec.ev.push(E);
        }
        if (E && E._dg === dg) {
          const s = WL._muSlotXY(dg, gu), gx = gu.x, gy = gu.y;
          const x = { bu, ty: gu.type, h0: r2(Math.hypot(gx - E.hall[0], gy - E.hall[1])), d0: r2(Math.hypot(gx - E._hold.cx, gy - E._hold.cy)), s0: r2(Math.hypot(gx - s[0], gy - s[1])),
            hp0: bu.hp, mn: null, c1: null, eng: 0, hurt: 0, dead: 0 };
          x.mn = x.d0; E._U.push(x);
        }
      }
    } catch (e) { err(e); }
    return bu;
  };
  WL.setSideCtl = function (f, side, on) {
    const r = ssc.apply(this, arguments);
    try { const E = side === 'B' && f ? FS.get(f) : null; if (E && E.ctl == null && r2(f.t) === E.t) E.ctl = on ? 1 : 0; } catch (e) { err(e); }
    return r;
  };
  WL.stepFight = function (f) {
    const k0 = f ? (f.contacts | 0) : 0;
    const ev = sf.apply(this, arguments);
    try {
      const E = FS.get(f);
      if (E && !E.end) {
        E.nS++;
        for (const x of E._U) { const u = x.bu; if (u.hp <= 0) continue; if (!u.ctl && (u.st === 'melee' || u.st === 'shoot')) x.eng = 1; }
        const first = E.c1 == null && (f.contacts | 0) > k0;
        if (first || ev.standoff || ev.rout || E.nS % SAMPLE === 0) {
          for (const x of E._U) { const u = x.bu; if (u.hp <= 0) continue; const d = Math.hypot(u.x / MPC - E._hold.cx, u.y / MPC - E._hold.cy); if (d < x.mn) x.mn = d; if (first) x.c1 = r2(d); }
        }
        if (first) E.c1 = Object.assign({ day: dayOf() | 0, t: r2(f.t) }, nearCount(E, MPC));
        if (ev.standoff && E.so.length < 40) E.so.push(Object.assign({ day: dayOf() | 0, t: r2(f.t), k: f.contacts | 0 }, nearCount(E, MPC)));
      }
    } catch (e) { err(e); }
    return ev;
  };
  WL.settle = function (f, why, winner) {
    let E = null, near = null;
    try { E = f ? FS.get(f) : null; if (E && !E.end) near = nearCount(E, MPC); } catch (e) { err(e); }
    const r = se.apply(this, arguments);
    try {
      if (E && !E.end) {
        E.end = Object.assign({ day: dayOf() | 0, t: r2(f.t), why, winner: winner || null, k: f.contacts | 0 }, near || {});
        for (const x of E._U) { if (x.bu.hp <= 0) x.dead = 1; if (x.bu.hp < x.hp0) x.hurt = 1; }
      }
    } catch (e) { err(e); }
    return r;
  };
  return WL;
};
process.on('exit', () => {
  if (!OUT) return;
  try {
    for (const E of rec.ev) {
      E.u = E._U.map((x) => ({ ty: x.ty, h0: x.h0, d0: x.d0, s0: x.s0, mn: r2(x.mn), c1: x.c1, eng: x.eng, hurt: x.hurt || (x.bu.hp < x.hp0 ? 1 : 0), dead: x.dead || (x.bu.hp <= 0 ? 1 : 0) }));
      delete E._U; delete E._hold; delete E._dg;
    }
    fs.writeFileSync(OUT, JSON.stringify(rec));
  } catch (e) { /* 관측 실패는 판을 안 건드린다 */ }
});
