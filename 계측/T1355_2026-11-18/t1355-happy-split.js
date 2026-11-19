'use strict';
// (@regress 없음 — 랩 판 곁 관찰기 · 읽기만 · 세계 무변)
// === 계측/T1355_2026-11-18/t1355-happy-split.js — 행복 "나머지" 항을 곳간 품목 묶음으로 가른다(랩 800날 판 곁 · 해 끝 날마다) ===
//   쓰는 법: T1355_SPLIT_OUT=<out.json> node -r <이 파일> scripts/t176-ab.js 800 <시드>
//   30날마다 · 해 끝(365 · 730 · 끝 날)마다 마을마다(해 안 철마다 오르내림 — 해 평균은 표 자가 이 표본으로) 정본 `_computeVillageStats(마을, 사람)` 을 프로토타입 겹(곳간만 바꾼 새 객체 — 원본 무변)으로 세 번 부른다:
//     그대로 · 식량 품목(먹은 것 건강 군 표 `t1309Group` 이 있는 품목 — 원물 · 조리식 · 보존식)을 뺀 곳간 · 식량 아닌 품목을 뺀 곳간
//   ⇒ 곳간 기여는 품목마다 더해지므로(정본 셈 — 사람당 포화 `min(1, 양 ÷ 사람 ÷ 2)` × 기여) 행복 차가 그 묶음의 곳간 몫이다.
//   품목마다 몫(그 품목 하나를 뺀 곳간과의 차)도 식량 · 식량 아닌 것 따로 가장 큰 여덟을 사람 가중 합으로 적는다.
const path = require('path'), fs = require('fs');
const OUT = process.env.T1355_SPLIT_OUT; if (!OUT) return;
const ROOT = path.resolve(__dirname, '..', '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const ENDS = [365, 730];
const rec = { snaps: [], err: null };
let k = 0, W = null;
const isFood = (id) => V1.t1309Group(id) != null;
function stats(v, n, keep) {   // keep(id) → 곳간에 남길 품목
  const st = {}; for (const [id, q] of Object.entries(v.storage || {})) if (keep(id)) st[id] = q;
  const o = Object.create(v); o.storage = st; return V1._computeVillageStats(o, n);
}
function split(day, world) {
  let w = 0; const S = { happy: 0, noFood: 0, noOther: 0, health: 0 }, per = {};
  for (const v of world.villages) {
    const n = (v.npcs || []).length; if (!(n > 0)) continue;
    const a = stats(v, n, () => true), b = stats(v, n, (id) => !isFood(id)), c = stats(v, n, (id) => isFood(id));
    w += n; S.happy += a.happiness * n; S.noFood += b.happiness * n; S.noOther += c.happiness * n; S.health += a.health * n;
    for (const id of Object.keys(v.storage || {})) {
      if (!((v.storage[id] || 0) > 0)) continue;
      const d = a.happiness - stats(v, n, (x) => x !== id).happiness; if (Math.abs(d) > 1e-12) per[id] = (per[id] || 0) + d * n;
    }
  }
  const r = (x) => (w ? +(x / w).toFixed(5) : null);
  const srt = (f) => Object.entries(per).filter(([id]) => f(id)).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1])).slice(0, 8).map(([id, x]) => [id, r(x)]);
  rec.snaps.push({ day, pop: w, happy: r(S.happy), foodStore: r(S.happy - S.noFood), otherStore: r(S.happy - S.noOther), health: r(S.health), foodTop: srt(isFood), otherTop: srt((id) => !isFood(id)) });
}
const _t = V2.tickWorldV2;
V2.tickWorldV2 = function (world) {
  const ret = _t.apply(this, arguments);
  try { k++; W = world; if (ENDS.includes(k) || k % 30 === 0) split(k, world); } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return ret;
};
process.on('exit', () => { try { if (W && !ENDS.includes(k) && k % 30 !== 0) split(k, W); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { try { fs.writeFileSync(OUT, JSON.stringify({ err: String(e) })); } catch (e2) {} } });
