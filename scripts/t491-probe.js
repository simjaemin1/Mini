// === scripts/t491-probe.js — 나무꾼·채집꾼 **몸의 하루**를 재는 계측 전용 예비 적재(T491 ②) =====================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 레포의 `server/villages.js` 는 **한 글자도 안 만진다**.
//   `node -r scripts/t491-probe.js server/zone.js` 로 띄우면 적재 순간에만 villages.js 원문 **뒤에** 한 줄을 덧붙여
//   정본 함수 몇 개를 읽는 창을 연다(동작 0). `t449-probe.js`(마을 하루 줄 · SIGUSR2)를 같이 싣는다.
//
// ★재는 것 — 1초마다(`T491_SAMPLE_MS`) 모든 마을의 나무꾼·채집꾼 **몸**(`simJob`)을 한 번씩 본다(읽기만):
//   몸 × 게임일 누계 = 표본 수 · 걸은 px(표본 사이 거리 합 · 200px 넘는 점프는 뺀다) · 라벨별 초(`_lifeAct`) ·
//   벤 그루(`_t325U` 가 오른 횟수 · 오른 양) · 딴 개체(손의 걷는 품목 합이 오른 횟수 · 양) · 곳간행(`_granTask` 가 선 횟수) ·
//   손 최대 · 해 질 녘 손(낮 마지막 표본) · 요양·반일 표본 · 최소 hp · 현장(`_t325Site`) · 현장↔집·중심·곳간 사다리 거리.
//   마을 × 게임일 = T341 가 일괄 한도에 쓰는 수 그대로(중심 → 가장 가까운 나무 셀 거리 · `_t341TripsPerDay` · `_t341TreesPerLoad` ·
//   `_t400PerLoad('wood')` · w̄ · N · K · econ 나무꾼 수 · 몸 나무꾼 수 · 곳간 사다리 → 가장 가까운 나무 셀 거리) — **정본 함수를 부른다**(사본 0).
//   `T491_TRACE_VIL`(마을 이름)이면 그 마을 몸의 1초 궤적을 `T491_TRACE_OUT`(JSONL)에 적는다.
// ★읽는 법 — `SIGUSR2` 를 보내면 `T449_PROBE_OUT`(마을 하루 줄)과 `T491_PROBE_OUT`(몸·마을 누계)을 쓴다(tmp + rename).
'use strict';
require('./t449-probe.js');
const Module = require('module');
const fs = require('fs');
const path = require('path');
const OUT = process.env.T491_PROBE_OUT || '';
const TRACE_VIL = process.env.T491_TRACE_VIL || '';
const TRACE_OUT = process.env.T491_TRACE_OUT || '';
const SAMPLE_MS = parseInt(process.env.T491_SAMPLE_MS || '1000', 10);
const VJS = path.join('server', 'villages.js');
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename.endsWith(VJS)) content += '\n;globalThis.__t491fn = { state, SZ, gameDayOf, _dayNow, _t341TripsPerDay, _t341TreesPerLoad, _t400PerLoad, _t347PerLoad, _woodKg, _carryCfg, _t347KeepOf, _t347HandsOf, _granLadder, _lifeLootWood };\n';
  return _compile.call(this, content, filename);
};
const r3 = (x) => (typeof x === 'number' && isFinite(x)) ? +x.toFixed(3) : (x == null ? null : x);
const B = {};     // `${vilId}|${pid}` → { job, vil, days: { d: agg } }
const V = {};     // vilId → { name, days: { d: info } }
const last = {};  // `${vilId}|${pid}` → { x, y, u, f, g, fv }
let traceFd = null;
function aggOf(k, job, vname, d) {
  const b = B[k] || (B[k] = { job, vil: vname, days: {} });
  return b.days[d] || (b.days[d] = { n: 0, walk: 0, lab: {}, cutN: 0, cutU: 0, pickN: 0, pickU: 0, gran: 0, granS: 0, rest: 0, half: 0, hpMin: null,
    handMax: 0, dusk: null, site: null, dHome: null, dCtr: null, dGran: null, task: {}, firstFv: null, lastDayFv: null });
}
function forageHand(F, vil, p) {
  let u = 0; const keep = (F._t347KeepOf && F._t347KeepOf(vil)) || [];
  for (const k of keep) for (const h of (F._t347HandsOf ? F._t347HandsOf(k) : [k])) u += (p.inventory && p.inventory[h]) || 0;
  return u;
}
function vilInfo(F, vil, d) {
  const v = V[vil.dbId] || (V[vil.dbId] = { name: vil.name, days: {} });
  const gd = F.state.dayMs ? F.gameDayOf(F._dayNow()) : null;
  if (v.days[d] && v.days[d].sday === gd) return v.days[d];   // 그날 스캔(`_t325Trees.day`)을 본 뒤로는 다시 안 센다 — 경계 직후 어제 스캔을 본 표본은 다음 초에 다시
  const SZ = F.SZ, st = F.state, S = vil._t325Trees || null;
  const cx0 = vil.ccx * SZ + SZ / 2, cy0 = vil.ccy * SZ + SZ / 2;
  let bd = Infinity, bestT = null; const list = (S && S.list) || [];
  for (const t of list) { const dd = (t.x - cx0) * (t.x - cx0) + (t.y - cy0) * (t.y - cy0); if (dd < bd) { bd = dd; bestT = t; } }
  const dC = bestT ? Math.sqrt(bd) : null;
  //   곳간 사다리 → 가장 가까운 나무 셀(몸이 짐을 지고 오가는 쪽 — 사다리가 여럿이면 가장 가까운 짝)
  let dG = null;
  for (const g of (vil._granList || [])) { const L = F._granLadder(g); for (const t of list) { const dd = Math.hypot(t.x - L.x, t.y - L.y); if (dG == null || dd < dG) dG = dd; } }
  const w = (S && S.wBar > 0) ? S.wBar : 1;
  const e = vil.econ || {}, pl = st.deps && st.deps.players;
  let bodyLj = 0, bodyFg = 0;
  for (const pid of (vil.npcPids || [])) { const p = pl && pl.get(pid); if (!p) continue; if (p.simJob === 'lumberjack') bodyLj++; else if (p.simJob === 'forager') bodyFg++; }
  const info = { sday: S ? S.day : null, N: S ? S.N | 0 : null, K: S ? S.K | 0 : null, wBar: S ? r3(S.wBar) : null, cells: list.length,
    dCtr: r3(dC), dGran: r3(dG),
    trips: dC ? F._t341TripsPerDay(vil, dC, w) : null, tripsGran: dG ? F._t341TripsPerDay(vil, dG, w) : null,
    treesPerLoad: F._t341TreesPerLoad(w), woodPerLoad: F._t400PerLoad('wood'), woodKg: F._woodKg(),
    capKg: ((F._carryCfg() || {}).CFG || {}).CAP_KG || null,
    ljE: (e.counts && e.counts.lumberjack) || 0, fgE: (e.counts && e.counts.forager) || 0, ljB: bodyLj, fgB: bodyFg,
    pop: e.npcs ? e.npcs.length : null, gran: (vil._granList || []).length,
    speed: st.deps && st.deps.moveSpeed, dayR: st.deps && st.deps.dayPhaseRatio, dayMs: st.dayMs };
  v.days[d] = info;
  return info;
}
function sample() {
  const F = globalThis.__t491fn; if (!F || !F.state || !F.state.villages || !F.state.deps) return;
  const st = F.state, now = Date.now(), SZ = F.SZ, pl = st.deps.players; if (!pl) return;
  const d = (st.world && typeof st.world.day === 'number') ? st.world.day : (st.dayMs ? F.gameDayOf(F._dayNow()) : 0);   // 게임일 = econ 날(`state.world.day` — 마을 하루 줄과 같은 열쇠)
  const wpF = st.deps.worldPhase, dayR = st.deps.dayPhaseRatio || 0.7;
  for (const vil of st.villages) {
    if (!vil.econ || !vil.npcPids) continue;
    let info = vilInfo(F, vil, d);   // 마을마다 하루 한 번(몸이 없는 마을도 — ② 51마을 표)
    for (const pid of vil.npcPids) {
      const p = pl.get(pid); if (!p) continue;
      const job = p.simJob; if (job !== 'lumberjack' && job !== 'forager') continue;
      const k = vil.dbId + '|' + pid, a = aggOf(k, job, vil.name, d);
      const fv = wpF ? (wpF(now) + (p.simLonOff || 0)) % 1 : null;
      const u = +(p._t325U || 0), f = forageHand(F, vil, p), g = p._granTask ? 1 : 0, w = (p.inventory && p.inventory.wood) || 0;
      const L = last[k];
      if (L) {
        const dd = Math.hypot(p.x - L.x, p.y - L.y); if (dd < 200) a.walk += dd;
        if (u > L.u + 1e-9) { a.cutN++; a.cutU += u - L.u; }
        if (f > L.f + 1e-9) { a.pickN++; a.pickU += f - L.f; }
        if (g && !L.g) a.gran++;
      }
      last[k] = { x: p.x, y: p.y, u, f, g };
      a.n++; if (g) a.granS++;
      const lab = p._lifeAct || '-'; a.lab[lab] = (a.lab[lab] || 0) + 1;
      if (p._lifeTask && p._lifeTask.k) a.task[p._lifeTask.k] = (a.task[p._lifeTask.k] || 0) + 1;
      if (p._rest) a.rest++; if (p._half) a.half++;
      const hp = (p.hp != null && p.maxHp) ? p.hp / p.maxHp : null; if (hp != null && (a.hpMin == null || hp < a.hpMin)) a.hpMin = r3(hp);
      const hand = job === 'lumberjack' ? w : f; if (hand > a.handMax) a.handMax = r3(hand);
      if (fv != null) { if (a.firstFv == null) a.firstFv = r3(fv); if (fv < dayR) { a.dusk = r3(hand); a.lastDayFv = r3(fv); } }
      if (job === 'lumberjack' && p._t325Site && !a.site) {
        const s = p._t325Site; a.site = [s.cx, s.cy];
        if (p.npcHomeX != null) a.dHome = r3(Math.hypot(s.x - p.npcHomeX, s.y - p.npcHomeY));
        a.dCtr = r3(Math.hypot(s.x - (vil.ccx * SZ + SZ / 2), s.y - (vil.ccy * SZ + SZ / 2)));
        let dg = null; for (const gg of (vil._granList || [])) { const Lg = F._granLadder(gg); const q = Math.hypot(s.x - Lg.x, s.y - Lg.y); if (dg == null || q < dg) dg = q; }
        a.dGran = r3(dg);
      }
      if (TRACE_OUT && vil.name === TRACE_VIL) {
        if (!traceFd) traceFd = fs.openSync(TRACE_OUT, 'a');
        fs.writeSync(traceFd, JSON.stringify([now, d, pid, job, Math.round(p.x), Math.round(p.y), lab, r3(hand), g, r3(fv), p._rest ? 1 : 0, p._half ? 1 : 0, r3(hp), p.behavior || '', r3(u)]) + '\n');
      }
    }
  }
}
setInterval(() => { try { sample(); } catch (e) { /* 계측기 — 존을 안 멈춘다 */ } }, SAMPLE_MS).unref();
process.on('SIGUSR2', () => {
  if (!OUT) return;
  try {
    const F = globalThis.__t491fn;
    const d = F && F.state && F.state.world ? F.state.world.day : null;
    for (const k of Object.keys(B)) for (const dd of Object.keys(B[k].days)) { const a = B[k].days[dd]; a.walk = r3(a.walk); a.cutU = r3(a.cutU); a.pickU = r3(a.pickU); }
    fs.writeFileSync(OUT + '.tmp', JSON.stringify({ t: Date.now(), day: d, bodies: B, vils: V }));
    fs.renameSync(OUT + '.tmp', OUT);
  } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e && e.message || e) })); } catch (_) {} }
});
