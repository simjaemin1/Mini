// === scripts/t435-granary-demand.js — 곳간 증설 재료가 마을을 얼마나 먹나 (T435 · 계측기) ================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//
// ★왜: `t17-metrics`·`t176-ab` 는 생활층의 곳간 증설(`villages.js _lifeGranAdd`)을 **안 돈다** — 그래서 T435 켬 팔이 끔 팔과
//   JSON 까지 같다(보고/T435 §0-ⓐ). 실서버 30일 판에서는 곳간이 **한 동도** 안 선다(식량이 목표를 안 넘는다 · T361 판도 38 → 38).
//   ⇒ 800일 econ 세계 위에서 **같은 규칙**을 돌린다: `node -r ./scripts/t435-granary-demand.js scripts/t17-metrics.js 800 <seed>`
//
// ★규칙 — 전부 정본에서 읽는다(새 수 0):
//   · 목표 동 수 = clamp(⌈식량 ÷ G_CAP⌉, 1, G_MAX) · 착공 뒤 G_BUILDD 일에 선다 · 하루 1동 — `villages.js` 의 그 줄을 **글자로** 읽는다
//     (`test-granary-add.js` 가 이미 쓰는 문법 · 사본 0)
//   · 한 동의 재료 = `granary-stages.js granaryRaw()` 의 econ 재화(통나무 6 · 돌 8) — econ `granaryEconMaterials()` 그대로
//   · 크루 걸음은 하루 짐 3 개로 충분하다(실제 낮 1,008초 · 곳간↔터 수백 px) ⇒ 여기선 걸음 한도를 걸지 않는다(보고에 적었다)
//   · 시작 동 수 = 1(시딩 곳간 · 서버 판 50마을 38동 — 곳간 없는 마을도 목표 하한 1 이 곧 선다)
// ★손잡이(이 파일 것): `T435_SIM=1` 이면 재료를 곳간에서 **실제로 뺀다**(켬 팔) · 없으면 세기만(끔 팔 = 기준선과 비트 동일이어야 한다) ·
//   `T435_JSON=<경로>` 에 누계를 쓴다.
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const vsrc = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const m = vsrc.match(/const G_CAP = (\d+), G_MAX = (\d+), G_BUILDD = (\d+);/);
if (!m) throw new Error('villages.js 의 곳간 상수 줄을 못 찾았다');
const G_CAP = +m[1], G_MAX = +m[2], G_BUILDD = +m[3];
const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
const G = require(path.join(ROOT, 'server', 'granary-stages.js'));
const RES = new Set(E.RESOURCES || []);
const NEED = {}; for (const [k, n] of Object.entries(G.granaryRaw())) if (RES.size === 0 || RES.has(k)) NEED[k] = n;
const SIM = process.env.T435_SIM === '1';
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
const orig = V2.tickWorldV2;
const S = new Map();   // 마을 이름 → { n, pend, built, took:{}, stall }
let day = 0;
V2.tickWorldV2 = function (w) {
  const r = orig.apply(this, arguments);
  day++;
  for (const v of (w.villages || [])) {
    if (!v || !v.storage || !(v.npcs && v.npcs.length)) continue;
    let s = S.get(v.name); if (!s) S.set(v.name, (s = { n: 1, pend: null, built: 0, took: {}, stall: 0 }));
    if (s.pend) {
      let full = true;
      for (const [k, n] of Object.entries(NEED)) {
        const have = s.pend.mat[k] || 0; if (have >= n) continue;
        const take = Math.min(n - have, v.storage[k] || 0);
        if (take > 0) { s.pend.mat[k] = have + take; s.took[k] = (s.took[k] || 0) + take; if (SIM) v.storage[k] -= take; }
        if ((s.pend.mat[k] || 0) < n) full = false;
      }
      if (!full) s.stall++;
      if (day >= s.pend.day && full) { s.pend = null; s.n++; s.built++; }
      continue;
    }
    const food = v.storage.food || 0;
    const gn = Math.max(1, Math.min(G_MAX, Math.ceil(food / G_CAP)));
    if (s.n < gn) s.pend = { day: day + G_BUILDD, mat: {} };
  }
  return r;
};
process.on('exit', () => {
  if (!process.env.T435_JSON) return;
  const vs = [...S.entries()].map(([name, s]) => ({ name, n: s.n, built: s.built, took: s.took, stall: s.stall }));
  const tot = { built: 0, took: {}, stall: 0, vil: vs.length, builtVil: 0 };
  for (const x of vs) { tot.built += x.built; tot.stall += x.stall; if (x.built) tot.builtVil++; for (const [k, n] of Object.entries(x.took)) tot.took[k] = +((tot.took[k] || 0) + n).toFixed(3); }
  try { fs.writeFileSync(process.env.T435_JSON, JSON.stringify({ sim: SIM, G_CAP, G_MAX, G_BUILDD, NEED, tot, vs }, null, 1)); } catch (e) {}
});
