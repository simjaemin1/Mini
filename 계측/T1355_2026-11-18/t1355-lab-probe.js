'use strict';
// (@regress 없음 — 랩 판 곁 관찰기 · 읽기만 · 세계 무변)
// === 계측/T1355_2026-11-18/t1355-lab-probe.js — 랩 800날 판(`scripts/t176-ab.js`) 곁: 해마다 칸 · 마을별 칸 · 행복 몫 가르기 ===
//   쓰는 법: T1355_LAB_OUT=<out.json> node -r <이 파일> scripts/t176-ab.js 800 <시드>   (T1360 pool.sh 와 같은 env · 같은 자)
//   econ 세계 틱(`tickWorldV2`)을 감싸 틱 뒤에 읽기만 한다(t176-ab 가 같은 자리에서 읽는 칸 — `lastStats` · `totalFoodEquivalent` · `tradeStats`):
//     해(1 ~ 365 · 366 ~ 730 · 731 ~ 끝)마다 사람-날 가중 건강 · 다양성 · 행복 · 행복 몫 셋(다양성 = min(1, 군 ÷ DIVERSITY_FULL) × DIVERSITY_HAPPY_W ·
//     여가 = LEISURE_HAPPY_W × leisure · 나머지 = 곳간 기여 · 옷 · 가죽 · 추위) · 기근 마을-날(`totalFoodEquivalent < 사람×30` — t176-ab 와 같은 정의)
//     해 끝(365 · 730 · 끝 날)마다 마을마다 [이름 · 사람 · 행복 · 건강 · 군 수 · 들여옴 누계] · 인구 합 · 들여옴 합
//   상수는 정본 소스에서 읽는다(사본 0) · 칸에 쓰지 않는다.
const path = require('path'), fs = require('fs');
const OUT = process.env.T1355_LAB_OUT; if (!OUT) return;
const ROOT = path.resolve(__dirname, '..', '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const K = (n) => { const m = new RegExp('const ' + n + ' = ([\\d.]+);').exec(SRC); return m ? +m[1] : null; };
const DIV_FULL = K('DIVERSITY_FULL'), DIV_HAPPY_W = K('DIVERSITY_HAPPY_W'), LEIS_W = V1.LEISURE_HAPPY_W;
const ENDS = [365, 730];
const rec = { consts: { DIV_FULL, DIV_HAPPY_W, LEIS_W }, years: [], ends: [], err: null };
const yr0 = () => ({ w: 0, h: 0, fg: 0, hap: 0, div: 0, lei: 0, fam: 0, vd: 0, days: 0 });
let k = 0, Y = yr0();
function endSnap(day, world) {
  const per = []; let pop = 0, imp = 0;
  for (const v of world.villages) {
    const n = (v.npcs || []).length; pop += n; const fi = +((v.tradeStats && v.tradeStats.foodImported) || 0); imp += fi; const L = v.lastStats || {};
    per.push([v.name, n, L.happiness != null ? +(+L.happiness).toFixed(4) : null, L.health != null ? +(+L.health).toFixed(4) : null, L.foodGroups != null ? +L.foodGroups : null, +fi.toFixed(1)]);
  }
  rec.ends.push({ day, pop, imp: +imp.toFixed(1), per });
}
function closeYear(day) {
  const w = Y.w, r = (x) => (w ? +(x / w).toFixed(5) : null);
  rec.years.push({ end: day, days: Y.days, health: r(Y.h), fg: r(Y.fg), happy: r(Y.hap), hDiv: r(Y.div), hLei: r(Y.lei), hRest: w ? +((Y.hap - Y.div - Y.lei) / w).toFixed(5) : null, famine: Y.fam, villDays: Y.vd });
  Y = yr0();
}
const _t = V2.tickWorldV2;
V2.tickWorldV2 = function (world) {
  const ret = _t.apply(this, arguments);
  try {
    k++; Y.days++;
    for (const v of world.villages) {
      const n = (v.npcs || []).length; if (!(n > 0)) continue;
      Y.vd++; if (V1.totalFoodEquivalent(v) < n * 30) Y.fam++;
      const L = v.lastStats; if (!L) continue;
      const fg = +L.foodGroups || 0, hap = +L.happiness || 0;
      Y.w += n; Y.h += (+L.health || 0) * n; Y.fg += fg * n; Y.hap += hap * n;
      if (DIV_FULL) Y.div += Math.min(1, fg / DIV_FULL) * DIV_HAPPY_W * n;
      if (LEIS_W != null) Y.lei += LEIS_W * (+L.leisure || 0) * n;
    }
    if (ENDS.includes(k)) { closeYear(k); endSnap(k, world); }
    rec._world = world;
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return ret;
};
process.on('exit', () => {
  try {
    const W = rec._world; delete rec._world;
    if (Y.days) closeYear(k);
    if (W && !ENDS.includes(k)) endSnap(k, W);
    fs.writeFileSync(OUT, JSON.stringify(rec));
  } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e) })); } catch (e2) {} }
});
