'use strict';
// (@regress 없음 — 러너 밖 · T1263 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1263-observe.js — 몸 전부 라이브 시계 한 해 판(밭 켬 · 끔): 곳간 품목별 열량 · 겨울 들머리 곳간 · 거둔 칸(두 판 같은 자) — 서버 판 자 곁 프리로드 ===
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1263-observe.js" node scripts/t577-server-run.js 365 1020   (판 JSON 곁 `<판>-<시드>.t1263.json`)
//   기존 관찰기(t1243 · t1221 · t1230 · t745)는 글자 그대로 — 이 파일은 칸을 새로 더할 뿐이다(econ `tickVillage` 첫 마을 머리에서 읽기만).
//   ⓐ 날마다 — 밭 칸 훑음(`vil._crop` 날 머리 사진 둘의 차): 빠진 칸(한해살이 거둠) · 같은 칸 심은 날 `p` 가 바뀐 칸(여러해살이 그루터기 — `cropAfterHarvest`) = **거둔 칸** ·
//      새로 선 칸 = **심은 칸**(첫 훑음 날은 그때 선 칸 전부 — 새 세계라 판 안에서 심은 칸). 작물이 칸에서 빠지는 자리는 수확 둘뿐(`villages.js` 'harvest' 갈래 · 플레이어 `t1238TakeVillageCrop` — 이 판엔 손님 0)이라 켬 · 끔 같은 자다.
//      (켬 판은 `_t1243PStat.reaped` 와 맞대 본다 — 표 자가 둘을 나란히 싣는다.)
//   ⓑ 10날마다 · 겨울 들머리(달력 정본 첫 12월 날) · 끝 — 한 줄:
//      인구 · 빈 마을(`_everPop` · 인구 0) · econ 죽음 누계(`_deadTot` · 식량 빚 `_fdDeadTot` · 늙음 `_natDeadTot`) · 떠남(`_emigTot`) · 몸 층 `bodyExitStats().died` ·
//      켬 셈(`_t1243PStat` 심음 · 거둠 · 씨 씀 · 씨 남김 `seedBack` · `seedKg`) · 곳간 씨(`seed_*` 단위 합) ·
//      곳간 품목별(세계 합) [곳간 수 · 식량 단위] — 식량 단위 = T1246 정본 `storageFoodPer`(econ `sim/economy-sim.js` · land1063) × 수 · 로트 상한 몫 뺌(`storageFoodEquivalent` 와 같은 식) ·
//        1 단위 = 사람 하루 = `kcal.DAY_KCAL` kcal · 정본 합 · econ 이 그 판에서 쓰는 합(`totalFoodEquivalent` — 켬 = 정본 · 끔 = 옛 식) ·
//      마을마다 [이름 · 사람 · 정본 식량 단위 · econ 식량 단위] (겨울 일치 = 단위 ÷ 사람 · 겨울 날 수 = 달력 정본 12/1 → 3/1)
//   쓰기: 10날마다 · 겨울 들머리 · 끝(`exit`) — 판이 끊겨도 그날까지 남는다.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1263.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Cal = require(path.join(ROOT, 'server', 'calendar'));
let K = null; try { K = require(path.join(ROOT, 'server', 'kcal')); } catch (e) { K = null; }
const rec = { v: 1, farmOn: process.env.T1243_FARM_ON === '1', dayKcal: K ? K.DAY_KCAL : null, days: [], snaps: [], err: null };
let last = -1, VIL = null;
const _prev = new Map();   // 마을 이름 → Map(칸 → [작물 칸 객체, 심은 날 p])
let reapT = 0, sownT = 0, perT = 0;
function scanCrops(P, day) {
  let reap = 0, sown = 0, per = 0, first = 0;
  for (const vil of (P.villages || [])) {
    const cur = vil._crop || new Map(), pm = _prev.get(vil.name), nm = new Map();
    for (const [k, e] of cur) {
      if (!e || !e.c) continue;
      nm.set(k, [e, e.p]);
      if (!pm) { first++; continue; }                     // 첫 훑음 — 그때 선 칸(새 세계라 판 안에서 심은 칸)은 심은 칸으로 센다
      const q = pm.get(k);
      if (!q) sown++;
      else if (q[0] !== e) { reap++; sown++; }          // 앞 작물이 빠지고 그 칸에 새로 심었다
      else if (q[1] !== e.p) { reap++; per++; }          // 같은 작물 — 그루터기에서 다시(여러해살이 거둠)
    }
    if (pm) for (const [k, q] of pm) { const e = cur.get(k); if (!e || !e.c) reap++; }   // 빠진 칸(한해살이 거둠)
    _prev.set(vil.name, nm);
  }
  sown += first;
  reapT += reap; sownT += sown; perT += per;
  rec.days.push([day, reap, sown, per]);
}
let _w0 = null;   // 첫 겨울 들머리 날
function isWinterEntry(day) { const t = Cal.dateOf(day); return t.month === 12 && t.dom === 1; }
function winterLen(day) { const t = Cal.dateOf(day); const y = t.month <= 2 ? t.year - 1 : t.year; return Cal.dayOf(y + 1, 3, 1) - Cal.dayOf(y, 12, 1); }
function snap(day, P, B, why) {
  const by = {}, vs = [];
  let pop = 0, empty = 0, dead = 0, fd = 0, nat = 0, emig = 0, canon = 0, econ = 0, seed = 0;
  for (const vil of (P.villages || [])) {
    const e = vil.econ; if (!e) continue;
    const n = (e.npcs || []).length; pop += n; if (e._everPop && n === 0) empty++;
    dead += e._deadTot || 0; fd += e._fdDeadTot || 0; nat += e._natDeadTot || 0; emig += e._emigTot || 0;
    let vc = 0;
    for (const [r, q] of Object.entries(e.storage || {})) {
      const qty = Math.max(0, Number(q) || 0); if (!(qty > 0)) continue;
      if (r.startsWith('seed_')) seed += qty;
      let f = 0; try { f = V1.storageFoodPer ? V1.storageFoodPer(e, r) : 0; } catch (x) { f = 0; }
      if (!(f > 0)) continue;
      const u = usableOf(e, r, qty) * f;
      vc += u;
      const b = by[r] || (by[r] = [0, 0]); b[0] += qty; b[1] += u;
    }
    const et = V1.totalFoodEquivalent ? V1.totalFoodEquivalent(e) : 0;
    canon += vc; econ += et;
    vs.push([vil.name, n, +vc.toFixed(2), +et.toFixed(2)]);
  }
  for (const r of Object.keys(by)) by[r] = [+by[r][0].toFixed(3), +by[r][1].toFixed(3)];
  let bx = null; try { bx = VIL.bodyExitStats ? VIL.bodyExitStats().died : null; } catch (x) { bx = null; }
  const ps = B._t1243PStat || null;
  rec.snaps.push({ day, why, date: Cal.dateOf(day), winterLen: winterLen(day), pop, empty, dead, fd, nat, emig, bodyDied: bx,
    reap: reapT, sown: sownT, per: perT,
    pick: ps ? ps.pick : null, reaped: ps ? ps.reaped : null, seedUse: ps ? (ps.seedUse || 0) : null, seedBack: ps ? (ps.seedBack || 0) : null, seedKg: ps ? (ps.seedKg || 0) : null,
    seedStore: +seed.toFixed(3), canon: +canon.toFixed(2), econ: +econ.toFixed(2), by, vs });
}
// 로트 상한 몫을 뺀 수(정본 `storageFoodEquivalent` 의 `usable` 줄과 같은 식 — 곳간 장부 `freshOf` 를 읽기만)
let _GL = null;
function usableOf(e, r, n) {
  if (_GL === null) { try { _GL = require(path.join(ROOT, 'server', 'granary-lots')); } catch (x) { _GL = false; } }
  if (!_GL || typeof _GL.freshOf !== 'function') return n;
  let lots = null; try { lots = _GL.freshOf(e, r); } catch (x) { lots = null; }
  return lots ? Math.max(0, n - Math.min(n, lots.spoiledU || 0)) : n;
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} }
const DAYS = +(process.env.T577_DAYS || 0);
function onDay(day) {
  if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
  const P = VIL.__labProbe._t569Probe.setup(), B = VIL.__p3Bind({});
  scanCrops(P, day);
  const w = isWinterEntry(day) && _w0 == null;
  if (w) _w0 = day;
  if (day % 10 === 0 || w || (DAYS && day >= DAYS)) { snap(day, P, B, w ? 'winter' : 'ten'); write(); }
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; onDay(day); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); write(); }
  return _t.apply(this, arguments);
};
process.on('exit', () => {
  try { if (VIL) { const P = VIL.__labProbe._t569Probe.setup(), B = VIL.__p3Bind({}); const d = (B.state && B.state.world && B.state.world.day) | 0; if (!rec.snaps.length || rec.snaps[rec.snaps.length - 1].day !== d) snap(d, P, B, 'exit'); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  write();
});
