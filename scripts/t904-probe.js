// === scripts/t904-probe.js — 나무꾼 몸의 하루를 **층으로** 가른다(T904 ① 귀속) — 계측 전용 예비 적재 ===================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 레포의 `server/villages.js` 는 **한 글자도 안 만진다**.
//   `node -r scripts/t904-probe.js server/zone.js` 로 띄우면 적재 순간에만 villages.js 원문 **뒤에** 창 한 줄을 덧붙인다(동작 0 ·
//   `t449-probe` · `t491-probe` 와 같은 문법). `t491-probe.js`(→ `t449-probe.js`)를 같이 싣는다 — 몸 × 날 누계(그루 · 해 질 녘 손 · 걸음)는 그쪽 것.
//
// ★재는 것 — 1초마다(`T904_SAMPLE_MS`) 모든 마을의 나무꾼 · 채집꾼 **몸**을 한 번씩 본다(읽기만 · 정본 함수를 부른다 · 사본 0):
//   몸 × 게임일 — **층**별 초(한 표본은 한 층 · 위에서부터 먼저 맞는 층):
//     밤(현지 해 몫 ≥ 낮 비율) · 요양(`_rest`) · 해 질 녘 정산(`_t720.k` — 손 → 곳간 걸음) · 곳간행(`_granTask` — 통나무를 든 채 / 빈손) ·
//     회관행(`_t561Hall`) · 과업(`_lifeTask.k` — 시공 · 개간 …) · **수요 문**(`_t374Done(vil, 직업)` 참 — 그날 D 를 채웠다 · 퇴근) ·
//     그날 끝(`_t325Site.none` — 그날 목록이 다 비었다) · **빈 셀 위**(현장 44px 안 · 그 셀에 선 그루 0 — T491 §2-ⓑ 멈춤) ·
//     벌목(현장 44px 안 · 그루가 선 셀) · 출근(현장으로 걷는 중) · 제자리 출근(현장 밖인데 지난 표본보다 2px 도 못 갔다 — 닿지 못하는 셀 의심) ·
//     그 밖(라벨 그대로 — `휴식` 이면 수요 문 밖의 쉼)
//   마을 × 게임일(행위 층이 켜진 마을) — 수요 문의 수: D(`_woodOutLast` — econ 수식의 그날 목재) · 오늘 든 것(`_t325InflowToday`) ·
//     손(`_t374Held` — 그 마을 사람 손의 통나무) · 남은 수요(`woodDemandLeft`) · 수요 문 참인 낮 표본 몫 · 처음 참이 된 해 몫 ·
//     짐(`_t717Pack` — 곳간이 안 받은 일괄 몫) · econ 나무꾼 수 · `land.wood` · w̄(그루당 단) · 셀 · N · K · 사다리 누계(`_t561Lad`) — 채집도 같은 칸(D = `_forageOutLast × _t347MixShare`).
// ★읽는 법 — `SIGUSR2` 를 보내면 `T904_PROBE_OUT` 에 JSON 을 쓴다(tmp + rename · 틱을 멈추지 않는다).
'use strict';
require('./t491-probe.js');
const Module = require('module');
const fs = require('fs');
const path = require('path');
const OUT = process.env.T904_PROBE_OUT || '';
const SAMPLE_MS = parseInt(process.env.T904_SAMPLE_MS || '1000', 10);
const VJS = path.join('server', 'villages.js');
const _compile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  if (filename.endsWith(VJS)) content += '\n;globalThis.__t904fn = { state, SZ, _lifeEcon, _t374Done, _t374Held, _T374_WOOD, _t347KeepOf, _t720Fv };\n';
  return _compile.call(this, content, filename);
};
const r4 = (x) => (typeof x === 'number' && isFinite(x)) ? +x.toFixed(4) : (x == null ? null : x);
const B = {};     // `${vilId}|${pid}` → { job(처음 본) , vil, days: { d: { n, lay: {층: 초}, jobs: {직업: 표본} } } }
const V = {};     // vilId → { name, days: { d: 수요 문 칸 } }
const last = {};  // `${vilId}|${pid}` → { x, y }
function bodyAgg(k, job, vname, d) {
  const b = B[k] || (B[k] = { job, vil: vname, days: {} });
  const a = b.days[d] || (b.days[d] = { n: 0, lay: {}, jobs: {} });
  a.jobs[job] = (a.jobs[job] || 0) + 1;
  return a;
}
function vilAgg(vil, d) {
  const v = V[vil.dbId] || (V[vil.dbId] = { name: vil.name, days: {} });
  return v.days[d] || (v.days[d] = { n: 0, dayN: 0, w: null, f: null });
}
function gate(F, E, vil, kind) {   // 그 직업의 수요 문 — 정본 몸통(`actDemandLeft` 를 부르는 두 품목 함수 · 손은 `_t374Held`)
  const e = vil.econ;
  if (kind === 'wood') {
    if (!E.woodActOn(e)) return null;
    const held = F._t374Held(vil, F._T374_WOOD);
    const left = E.woodDemandLeft(e, held);
    return { D: e._woodOutLast || 0, got: e._t325InflowToday || 0, held, left: left === Infinity ? -1 : left, done: F._t374Done(vil, 'lumberjack') ? 1 : 0 };
  }
  if (!E.forageActOn(e)) return null;
  const held = F._t374Held(vil, F._t347KeepOf(vil));
  const left = E.forageDemandLeft(e, held);
  const share = (typeof e._t347MixShare === 'number' && e._t347MixShare > 0) ? e._t347MixShare : 0;
  return { D: (e._forageOutLast || 0) * share, got: e._t347InflowToday || 0, held, left: left === Infinity ? -1 : left, done: F._t374Done(vil, 'forager') ? 1 : 0 };
}
function gateAgg(g, s, isDay, fv) {   // 마을 × 날 칸에 표본 하나를 더한다
  if (!s) return g;
  const x = g || { D: 0, got0: null, gotMax: 0, held0: null, heldMax: 0, leftMin: null, doneDay: 0, firstDoneFv: null, dayN: 0 };
  x.D = r4(s.D); x.gotMax = r4(Math.max(x.gotMax, s.got)); x.heldMax = r4(Math.max(x.heldMax, s.held));
  if (isDay) {
    x.dayN++;
    if (x.held0 == null) { x.held0 = r4(s.held); x.got0 = r4(s.got); }
    if (s.done) { x.doneDay++; if (x.firstDoneFv == null) x.firstDoneFv = r4(fv); }
    if (s.left >= 0 && (x.leftMin == null || s.left < x.leftMin)) x.leftMin = r4(s.left);
  }
  return x;
}
function sample() {
  const F = globalThis.__t904fn; if (!F || !F.state || !F.state.villages || !F.state.deps) return;
  const st = F.state, now = Date.now(), pl = st.deps.players; if (!pl) return;
  const E = F._lifeEcon(); if (!E) return;
  const d = (st.world && typeof st.world.day === 'number') ? st.world.day : 0;   // 게임일 = econ 날(t491 몸 누계 · t449 마을 하루 줄과 같은 열쇠)
  const wpF = st.deps.worldPhase, dayR = st.deps.dayPhaseRatio || 0.7, wp = wpF ? wpF(now) : 0;
  const treesAt = st.deps.t325TreesAtCell;
  for (const vil of st.villages) {
    if (!vil.econ || !vil.npcPids) continue;
    //   마을 — 수요 문의 수(그 마을 해 몫으로 낮 · 밤을 가른다)
    const vfv = F._t720Fv(wp, vil._lonOff || 0), vDay = vfv < dayR;
    const VA = vilAgg(vil, d); VA.n++; if (vDay) VA.dayN++;
    const gw = gate(F, E, vil, 'wood'), gf = gate(F, E, vil, 'forage');
    VA.w = gateAgg(VA.w, gw, vDay, vfv); VA.f = gateAgg(VA.f, gf, vDay, vfv);
    if (gw) {
      const e = vil.econ, S = vil._t325Trees || {};
      VA.lj = (e.counts && e.counts.lumberjack) || 0; VA.landWood = r4((e.land && e.land.wood) || 0); VA.wBar = r4(S.wBar || 0);
      VA.cells = (S.list || []).length; VA.N = S.N | 0; VA.K = S.K | 0; VA.pack = r4(e._t717Pack || 0); VA.lad = r4(vil._t561Lad || 0);
      VA.deliv = r4(vil._t325Deliv || 0); VA.gran = (vil._granList || []).length; VA.dbg = vil._t325Dbg ? { walked: vil._t325Dbg.walked, ln: vil._t325Dbg.ln, cut: vil._t325Dbg.cut, stop: vil._t325Dbg.stop, dem: vil._t325Dbg.dem } : null;
    }
    if (gf) { const e = vil.econ; VA.fg = (e.counts && e.counts.forager) || 0; VA.mix = r4(e._t347MixShare || 0); }
    //   몸 — 층
    for (const pid of vil.npcPids) {
      const p = pl.get(pid); if (!p) continue;
      const job = p.simJob; if (job !== 'lumberjack' && job !== 'forager') continue;
      const k = vil.dbId + '|' + pid, a = bodyAgg(k, job, vil.name, d);
      const fv = F._t720Fv(wp, p.simLonOff || 0), isDay = fv < dayR;
      const L = last[k], moved = L ? Math.hypot(p.x - L.x, p.y - L.y) : null;
      last[k] = { x: p.x, y: p.y };
      let lay;
      if (!isDay) lay = '밤';
      else if (p._rest) lay = '요양';
      else if (p._t720 && p._t720.k) lay = '해질녘정산';
      else if (p._granTask) lay = (p.inventory && (p.inventory.wood || 0) > 0) ? '곳간행(통나무 든 채)' : '곳간행';
      else if (p._t561Hall) lay = '회관행';
      else if (p._lifeTask && p._lifeTask.k) lay = '과업:' + p._lifeTask.k;
      else if ((job === 'lumberjack' ? gw : gf) && (job === 'lumberjack' ? gw : gf).done) lay = '수요문';
      else if (job === 'lumberjack' && p._t325Site && p._t325Site.none) lay = '그날끝';
      else if (job === 'lumberjack' && p._t325Site && p._t325Site.cx != null) {
        const s = p._t325Site, dd = Math.hypot(p.x - s.x, p.y - s.y);
        if (dd <= 44) {
          let n = 0; try { const t = treesAt ? treesAt(s.cx, s.cy) : null; n = t ? t.length : 0; } catch (e) { n = 0; }
          lay = n > 0 ? '벌목(그루 선 셀)' : '빈 셀 위';
        } else lay = (moved != null && moved < 2) ? '제자리 출근' : '출근';
      } else lay = '그 밖:' + (p._lifeAct || '-');
      a.n++; a.lay[lay] = (a.lay[lay] || 0) + 1;
    }
  }
}
setInterval(() => { try { sample(); } catch (e) { /* 계측기 — 존을 안 멈춘다 */ } }, SAMPLE_MS).unref();
process.on('SIGUSR2', () => {
  if (!OUT) return;
  try {
    const F = globalThis.__t904fn;
    const d = F && F.state && F.state.world ? F.state.world.day : null;
    fs.writeFileSync(OUT + '.tmp', JSON.stringify({ t: Date.now(), day: d, bodies: B, vils: V }));
    fs.renameSync(OUT + '.tmp', OUT);
  } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e && e.message || e) })); } catch (_) {} }
});
