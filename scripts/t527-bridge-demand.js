// === scripts/t527-bridge-demand.js — 다리 자재가 마을을 얼마나 먹나 · 언제 서나 (T527 ③ · 계측기) ================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//
// ★왜: `t17-metrics`·`t176-ab` 는 생활층 크루를 안 돈다(NPC 몸·명부가 없다 — T435 §0-ⓐ 와 같은 까닭) ⇒ T527 켬 팔 = 끔 팔 JSON.
//   그래서 800일 econ 세계 위에서 **같은 규칙**을 돌린다: `node -r ./scripts/t527-bridge-demand.js scripts/t17-metrics.js 800 <seed>`
//
// ★규칙 — 전부 정본에서 읽는다(새 수 0):
//   · 착공 후보 = 존 설정 `bridgeSites`(`T17_ZONE` · 기본 한반도) · 짓는 마을 = 그 줄의 `v`
//   · 단계 자재 = `bridge-stages.js bridgeStages(span, 칸 수)` 를 움집·곳간 레시피로 푼 econ 재화(생활층 `_t527EconNeed` 와 같은 식)
//   · 하루 시공 = `LIFE_CREW × LIFE_STAGE_PDAY` 단계(villages.js 그 줄을 **글자로** 읽는다) · 자재가 다 놓여야 단계가 오른다
//   · 걸음 한도는 걸지 않는다(T435 계측기와 같다 — 크루 왕복 상한은 실서버 판에서만 · 보고에 적었다) ⇒ **가장 이른** 완공일이다
// ★손잡이(이 파일 것): `T527_SIM=1` 이면 자재를 곳간에서 **실제로 뺀다**(켬 팔) · 없으면 세기만(끔 팔 = 기준선과 비트 동일이어야 한다) ·
//   `T527_JSON=<경로>` 에 누계를 쓴다.
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const vsrc = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const mP = vsrc.match(/const LIFE_STAGE_PDAY = (\d+);/), mC = vsrc.match(/const LIFE_CREW = (\d+);/);
if (!mP || !mC) throw new Error('villages.js 의 크루 상수 줄을 못 찾았다');
const LABOR = (+mP[1]) * (+mC[1]);
const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
const B = require(path.join(ROOT, 'server', 'bridge-stages.js'));
const REC = Object.assign({}, require(path.join(ROOT, 'server', 'hut-stages.js')).HUT_RECIPES, require(path.join(ROOT, 'server', 'granary-stages.js')).GRANARY_RECIPES);
const RES = E.RESOURCES || null;
const econOnly = (o) => { const r = {}; for (const k of Object.keys(o)) if (!RES || RES.indexOf(k) >= 0) r[k] = o[k]; return r; };
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
const ZID = process.env.T17_ZONE || 'hanbando';
const SITES = (ZONES[ZID].bridgeSites || []).map((s, i) => {
  const st = B.bridgeStages(s.span, s.cells.length / 2);
  return { i, v: s.v.slice(), span: s.span, n: s.cells.length / 2, need: st.map((x) => econOnly(B.rawOfNeed(x.need, REC))), stage: 0, mat: {}, took: {}, done: null, stall: 0, adv: [], wood0: null, woodMin: null };
});
const SIM = process.env.T527_SIM === '1';
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
const orig = V2.tickWorldV2;
let day = 0;
V2.tickWorldV2 = function (w) {
  const r = orig.apply(this, arguments);
  day++;
  for (const s of SITES) {
    if (s.done != null) continue;
    const v = (w.villages || []).find((x) => x && s.v.indexOf(x.name) >= 0 && x.storage && x.npcs && x.npcs.length);
    if (!v) continue;
    if (s.wood0 == null) s.wood0 = v.storage.wood || 0;
    let labor = LABOR, short = false;
    while (labor > 0 && s.done == null) {
      const need = s.need[s.stage] || {};
      for (const [k, n] of Object.entries(need)) {
        const have = s.mat[k] || 0; if (have >= n) continue;
        const take = Math.min(n - have, v.storage[k] || 0);
        if (take > 0) { s.mat[k] = have + take; s.took[k] = (s.took[k] || 0) + take; if (SIM) v.storage[k] -= take; }
        if ((s.mat[k] || 0) < n) short = true;
      }
      if (short) break;
      for (const [k, n] of Object.entries(need)) s.mat[k] -= n;
      labor--; s.stage++; s.adv.push(day);
      if (s.stage >= s.need.length) s.done = day;
    }
    if (short) s.stall++;
    const wv = v.storage.wood || 0; if (s.woodMin == null || wv < s.woodMin) s.woodMin = wv;
  }
  return r;
};
process.on('exit', () => {
  if (!process.env.T527_JSON) return;
  fs.writeFileSync(process.env.T527_JSON, JSON.stringify({ zone: ZID, sim: SIM, days: day, labor: LABOR,
    sites: SITES.map((s) => ({ v: s.v, span: s.span, n: s.n, need: s.need, stage: s.stage, done: s.done, adv: s.adv, stall: s.stall, took: s.took, wood0: s.wood0, woodMin: s.woodMin })) }));
});
