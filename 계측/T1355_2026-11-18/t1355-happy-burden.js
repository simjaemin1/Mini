'use strict';
// (@regress 없음 — 랩 판 곁 관찰기 · 읽기만 · 세계 무변)
// === 계측/T1355_2026-11-18/t1355-happy-burden.js — 행복을 정본 T1205 칸으로 가른다(랩 800날 판 곁 · 해마다 사람-날 가중) ===
//   쓰는 법: T1355_BURDEN_OUT=<out.json> node -r <이 파일> scripts/t176-ab.js 800 <시드>
//   마을 행복(`lastStats.happiness`)은 T1134 · T1205(둘 다 켬 기본) — h = clip01(S − B):
//     천천히 S 가 목표 0.5 + G − E 로 다가가고(반감기 30날) · G = 좋은 것(`_computeVillageStats` 행복 + 사치품 항) · E = 겪은 일(굶은 몫 · 승전)
//     · B = 인구 부담 c × 사람ᵃ ÷ 영토ᵇ(그날 바로). econ 이 그날 `lastStats` 에 적은 칸(`happinessGoods` · `happinessLux` · `happinessEq`(= 목표) ·
//     `happinessSlow` · `happinessBurden` · `terrCells`)을 틱 뒤에 읽기만 한다 — 해(1 ~ 365 · 366 ~ 730 · 731 ~ 끝)마다 사람-날 가중 평균 ·
//     해 끝 마을마다 [이름 · 사람 · 행복 · 좋은 것 · 부담 · 영토].
const path = require('path'), fs = require('fs');
const OUT = process.env.T1355_BURDEN_OUT; if (!OUT) return;
const ROOT = path.resolve(__dirname, '..', '..');
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const ENDS = [365, 730];
const rec = { years: [], ends: [], err: null };
const yr0 = () => ({ w: 0, h: 0, G: 0, lux: 0, tgt: 0, S: 0, B: 0, E: 0, clipLo: 0, clipHi: 0, days: 0 });
let k = 0, Y = yr0(), W = null;
const r5 = (x, w) => (w ? +(x / w).toFixed(5) : null);
function closeYear(day) { const w = Y.w; rec.years.push({ end: day, days: Y.days, h: r5(Y.h, w), G: r5(Y.G, w), lux: r5(Y.lux, w), target: r5(Y.tgt, w), S: r5(Y.S, w), B: r5(Y.B, w), E: r5(Y.E, w), clipLo: r5(Y.clipLo, w), clipHi: r5(Y.clipHi, w) }); Y = yr0(); }
function endSnap(day, world) {
  const per = [];
  for (const v of world.villages) { const n = (v.npcs || []).length, L = v.lastStats || {}; per.push([v.name, n, L.happiness != null ? +(+L.happiness).toFixed(4) : null, L.happinessGoods != null ? +(+L.happinessGoods).toFixed(4) : null, L.happinessBurden != null ? +(+L.happinessBurden).toFixed(4) : null, L.terrCells != null ? +L.terrCells : null]); }
  rec.ends.push({ day, per });
}
const _t = V2.tickWorldV2;
V2.tickWorldV2 = function (world) {
  const ret = _t.apply(this, arguments);
  try {
    k++; Y.days++; W = world;
    for (const v of world.villages) {
      const n = (v.npcs || []).length, L = v.lastStats; if (!(n > 0) || !L) continue;
      const G = +L.happinessGoods || 0, tgt = +L.happinessEq || 0, S = +L.happinessSlow || 0, B = +L.happinessBurden || 0, h = +L.happiness || 0;
      Y.w += n; Y.h += h * n; Y.G += G * n; Y.lux += (+L.happinessLux || 0) * n; Y.tgt += tgt * n; Y.S += S * n; Y.B += B * n; Y.E += (0.5 + G - tgt) * n;
      if (S - B < 0) Y.clipLo += (B - S) * n; if (S - B > 1) Y.clipHi += (S - B - 1) * n;
    }
    if (ENDS.includes(k)) { closeYear(k); endSnap(k, world); }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return ret;
};
process.on('exit', () => { try { if (Y.days) closeYear(k); if (W && !ENDS.includes(k)) endSnap(k, W); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e) })); } catch (e2) {} } });
