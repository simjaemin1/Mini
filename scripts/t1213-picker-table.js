#!/usr/bin/env node
// (@regress 없음 — 판 JSON 읽기만 · 세계를 안 세운다 · 판정 0)
// === scripts/t1213-picker-table.js — T1213: "값이 오르면 나무꾼이 느나" — 훅 2 판(칸 27~37)의 마을 · 50날 줄을 읽는다 ===
//   읽는 것: 판 폴더의 `sbc-<시드>.json.t1213.json`(계측 훅 2 — 칸 읽기만: 값표 캐시 `_priceCache` · 바꾸기 문 표지 `_dbgSwitch` · 땅)
//   재는 것(인구 > 0 줄만):
//     · 통나무 값 · 직업 고르기 가중치 w = 값 ÷ 1 을 [0.05, 200] 로 자른 것(정본 `pickDeficitJob_rational` · `autoSwitchJob` 의 그 식) — 천장(200)에 닿은 몫
//     · 나무꾼 자리(정본 `jobCapacity` — 유효토지 × 숲 × 0.30 · 원본 글을 메모리에서 엮어 그 함수 하나를 꺼낸다 · 파일 무변) · 자리가 다 찬 몫
//     · 바꾸기 문 — 고른 부족 직업(`need`)이 나무꾼인 몫 · 그중 보류(`hold(…)` — 히스테리시스 ×1.3)된 몫
//     · 같은 마을 · 같은 날 짝(켬 ÷ 켬0) 통나무 값 비 · 나무꾼 차
//   쓰는 법: node scripts/t1213-picker-table.js --arm off=<폴더> --arm on0=<폴더> --arm on=<폴더> [--seed 1020] [--out 계측/T1213_<날짜>]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const A = process.argv.slice(2);
const arms = []; for (let i = 0; i < A.length; i++) if (A[i] === '--arm') { const j = A[i + 1].indexOf('='); arms.push({ k: A[i + 1].slice(0, j), d: A[i + 1].slice(j + 1) }); }
const opt = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const SEED = +(opt('--seed') || 1020), OUT = opt('--out');
const NAME = { off: '끔', on0: '켬 · T1213 끔', on: '켬(T1207+T1213)', on659: '켬 + T659 흐름 닻' };
const C = { name: 0, pop: 1, wood: 3, lj: 5, need: 15, pWood: 27, pFood: 28, pStone: 29, swNeed: 30, swDid: 31, swDay: 32, landWood: 33, size: 34, base: 35, fert: 36, foodSur: 37 };
const W_MAX = 200, W_MIN = 0.05;
const clampW = (p) => Math.max(W_MIN, Math.min(W_MAX, (p || 1) / 1.0));
//   정본 `jobCapacity` 를 꺼낸다(내보내지 않는 함수 — test-one-target 과 같은 꼴 · 파일 무변 · 사본 0)
const JC = (() => {
  const Module = require('module'), P = path.join(ROOT, 'sim', 'economy-sim.js');
  const m = new Module(P, null); m.filename = P; m.paths = Module._nodeModulePaths(path.dirname(P));
  m._compile(fs.readFileSync(P, 'utf8') + '\n;module.exports.__t1213 = { jobCapacity };', P);
  return m.exports.__t1213.jobCapacity;
})();
const ljCap = (r) => JC({ land: { size: r[C.size], baseSize: r[C.base], wood: r[C.landWood], fertility: r[C.fert], water: 0, game: 0, ore: 0 } }).lumberjack;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const res = {};
for (const a of arms) {
  const h = rd(path.join(a.d, `sbc-${SEED}.json.t1213.json`));
  if (!h) { console.log(`${a.k}: 판 없음`); continue; }
  const rows = [];
  for (const s of h.snaps) for (const r of s.rows) if (r[C.pop] > 0 && r.length > C.foodSur) rows.push({ day: s.day, r });
  if (!rows.length) { console.log(`${a.k}: 훅 2 칸 없음(옛 훅 판)`); continue; }
  const n = rows.length, cnt = (f) => rows.filter(f).length;
  const priced = rows.filter((x) => x.r[C.pWood] != null);
  const q = {
    rows: n, priced: priced.length,
    woodCeil: +(100 * priced.filter((x) => x.r[C.pWood] >= W_MAX).length / Math.max(1, priced.length)).toFixed(1),
    foodCeil: +(100 * priced.filter((x) => x.r[C.pFood] >= W_MAX).length / Math.max(1, priced.length)).toFixed(1),
    meanW: +(priced.reduce((s, x) => s + clampW(x.r[C.pWood]), 0) / Math.max(1, priced.length)).toFixed(2),
    medP: (() => { const v = priced.map((x) => x.r[C.pWood]).sort((a, b) => a - b); return v.length ? +v[Math.floor(v.length / 2)].toFixed(2) : null; })(),
    lj: rows.reduce((s, x) => s + x.r[C.lj], 0), cap: rows.reduce((s, x) => s + ljCap(x.r), 0),
    atCap: +(100 * cnt((x) => { const c = ljCap(x.r); return c > 0 && x.r[C.lj] >= c; }) / n).toFixed(1),
    zeroCap: +(100 * cnt((x) => ljCap(x.r) === 0) / n).toFixed(1),
    zeroLj: +(100 * cnt((x) => x.r[C.lj] === 0) / n).toFixed(1),
    needLJ: +(100 * cnt((x) => x.r[C.swNeed] === 'lumberjack') / n).toFixed(1),
    holdLJ: +(100 * cnt((x) => x.r[C.swNeed] === 'lumberjack' && String(x.r[C.swDid] || '').startsWith('hold')) / Math.max(1, cnt((x) => x.r[C.swNeed] === 'lumberjack'))).toFixed(1),
    needs: (() => { const o = {}; for (const x of rows) { const k = x.r[C.swNeed] || '없음'; o[k] = (o[k] || 0) + 1; } return o; })(),
    foodDef: +(100 * cnt((x) => x.r[C.foodSur] < 0) / n).toFixed(1),
  };
  res[a.k] = { q, rows: rows.map((x) => ({ day: x.day, name: x.r[C.name], pop: x.r[C.pop], lj: x.r[C.lj], cap: ljCap(x.r), pWood: x.r[C.pWood], need: x.r[C.swNeed], did: x.r[C.swDid] })) };
}
//   짝 — 같은 마을 · 같은 날(켬 ↔ 켬0 · 켬0 ↔ 끔)
function pair(a, b) {
  if (!res[a] || !res[b]) return null;
  const m = new Map(); for (const x of res[b].rows) m.set(x.name + '@' + x.day, x);
  const rat = [], dLj = [];
  for (const x of res[a].rows) { const y = m.get(x.name + '@' + x.day); if (!y || x.pWood == null || y.pWood == null || !(y.pWood > 0)) continue; rat.push(x.pWood / y.pWood); dLj.push(x.lj - y.lj); }
  if (!rat.length) return null;
  rat.sort((p, q) => p - q);
  return { pairs: rat.length, medRatio: +rat[Math.floor(rat.length / 2)].toFixed(3), upShare: +(100 * rat.filter((r) => r > 1.0001).length / rat.length).toFixed(1), ljDiffMean: +(dLj.reduce((s, d) => s + d, 0) / dLj.length).toFixed(3) };
}
const pairs = { on_on0: pair('on', 'on0'), on0_off: pair('on0', 'off'), on_off: pair('on', 'off') };
const md = ['| 판 | 마을 · 50날 줄 | 통나무 값 중앙 | 가중치 w 평균(천장 200) | w 천장에 닿은 몫 · 식량 | 나무꾼 / 자리(합) · 자리 다 찬 몫 · 자리 0 몫 | 바꾸기 문 — 고른 직업이 나무꾼 · 그중 보류 | 식량 적자 몫 |', '|:-:|---:|---:|---:|:-:|:-:|:-:|---:|'];
for (const k of Object.keys(res)) {
  const q = res[k].q;
  md.push(`| ${NAME[k] || k} | ${q.rows} | ${q.medP} | ${q.meanW} | ${q.woodCeil}% · ${q.foodCeil}% | ${q.lj} / ${q.cap} · ${q.atCap}% · ${q.zeroCap}% | ${q.needLJ}% · ${q.holdLJ}% | ${q.foodDef}% |`);
}
md.push('', `짝(같은 마을 · 같은 날) — ` + Object.entries(pairs).filter(([, p]) => p).map(([k, p]) => `${k.replace('_', ' ÷ ')}: 통나무 값 비 중앙 ${p.medRatio}(오른 몫 ${p.upShare}% · 짝 ${p.pairs}) · 나무꾼 차 평균 ${p.ljDiffMean}`).join(' · '));
md.push(`바꾸기 문 표지(고른 부족 직업 · 줄 수) — ` + Object.keys(res).map((k) => `${NAME[k] || k} ${JSON.stringify(res[k].q.needs)}`).join(' · '));
const txt = md.join('\n'); console.log(txt);
if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  //   `prices` = 판마다 마을 · 50날 줄의 통나무 값(그림 T1213_03 — 가중치 천장 200 과 견준다)
  const prices = Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.rows.map((x) => x.pWood).filter((p) => p != null)]));
  fs.writeFileSync(path.join(OUT, 't1213-picker.json'), JSON.stringify({ seed: SEED, wMax: W_MAX, dirs: Object.fromEntries(arms.map((a) => [a.k, a.d])), sum: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.q])), pairs, prices }));
  fs.writeFileSync(path.join(OUT, 't1213-picker.md'), txt + '\n');
  console.log(`\n→ ${OUT}/t1213-picker.{json,md}`);
}
