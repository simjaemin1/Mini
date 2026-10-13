#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T701 표 자)
// =============================================================================
// T701 — 팔마다 "통나무가 모자라 못 한 일"(t701-short.js) · 0 마을(종전 자) · 인구 — d30 · d100 · d400 + 평균.
//   node scripts/t701-table.js <dir> [팔=main,t692,t666off,t666,both] [씨=1020,7,42] [md]
//   ⚠새 수 0 — 셈만 한다. "가르나" = 켬 팔의 세 씨가 모두 main 세 씨의 같은 쪽에 서고, 차가 같은 씨 두 판의 차(있으면)보다 크다.
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const [DIR, ARMS0 = 'main,t692,t666off,t666,both', SEEDS0 = '1020,7,42'] = process.argv.slice(2);
if (!DIR) { console.error('쓰는 법: node scripts/t701-table.js <dir> [팔] [씨]'); process.exit(2); }
const ARMS = ARMS0.split(','), SEEDS = SEEDS0.split(',');
const rd = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
const at = (R, d) => R.find((r) => r.d >= d) || R[R.length - 1];
const mean = (R, k, lo, hi) => { const x = R.filter((r) => r.d >= lo && r.d <= hi); return x.length ? x.reduce((s, r) => s + r[k], 0) / x.length : null; };
const f1 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('en-US'));
const T = {};
for (const a of ARMS) for (const s of SEEDS) {
  const R = rd(path.join(DIR, `${a}-${s}.json.t701.jsonl`));
  if (!R.length) continue;
  let j = null; try { j = JSON.parse(fs.readFileSync(path.join(DIR, `${a}-${s}.json`), 'utf8')); } catch (e) {}
  const o = { last: R[R.length - 1].d };
  for (const d of [30, 100, 400]) { const r = at(R, d); o['d' + d] = { any: r.any, ev: r.ev, fuel: r.fuel, fuelPd: r.fuelPd, house: r.house, smelt: r.smelt, kiln: r.kiln, z0: r.z0, z1: r.z1, pop: r.pop, live: r.live }; }
  for (const k of ['any', 'ev', 'fuel', 'fuelPd', 'house', 'smelt', 'kiln', 'z0', 'pop']) { o['m_' + k] = mean(R, k, 1, 400); o['m30_' + k] = mean(R, k, 1, 30); o['m100_' + k] = mean(R, k, 31, 100); }
  o.cum = { fuelPd: R.reduce((s, r) => s + (r.fuelPd || 0), 0), ev: R.reduce((s, r) => s + r.ev, 0), any: R.reduce((s, r) => s + r.any, 0) };
  o.eight = j && j.eight ? j.eight : null; o.dissolved = j ? j.dissolved : null; o.empty = j ? j.empty : null;
  (T[a] || (T[a] = {}))[s] = o;
}
fs.writeFileSync(path.join(DIR, 't701_table.json'), JSON.stringify(T, null, 1));
console.log('| 팔 | 씨 | 못 한 마을 d30 · d100 · d400 | 그중 땔감 · 집 · 노 · 숯가마(d30) | 땔감 못 땐 사람-날 d30 · d100 · d400 | 400일 누계 못 한 마을-날 · 사람-날 | 0 마을 d30 · d100 · d400 | 인구 d30 · d100 · d400 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const a of ARMS) for (const s of SEEDS) {
  const o = T[a] && T[a][s]; if (!o) { console.log(`| ${a} | ${s} | 없음 |||||||`); continue; }
  const D = (k) => [o.d30[k], o.d100[k], o.d400[k]].map(f1).join(' · ');
  console.log(`| ${a} | ${s} | ${D('any')} | ${o.d30.fuel} · ${o.d30.house} · ${o.d30.smelt} · ${o.d30.kiln} | ${D('fuelPd')} | ${f1(o.cum.any)} · ${f1(o.cum.fuelPd)} | ${D('z0')} | ${D('pop')} |`);
}
console.log('\n| 팔 | 못 한 마을 평균 1~30 · 31~100 · 1~400(세 씨) | 사람-날 누계(세 씨) | 0 마을 평균 1~30 · 1~400(세 씨) | 인구 d400(세 씨) |\n|---|---|---|---|---|');
for (const a of ARMS) { if (!T[a]) continue;
  const S = SEEDS.filter((s) => T[a][s]);
  const g = (fn) => S.map((s) => f1(fn(T[a][s]))).join(' / ');
  console.log(`| ${a} | ${g((o) => o.m30_any)} · ${g((o) => o.m100_any)} · ${g((o) => o.m_any)} | ${g((o) => o.cum.fuelPd)} | ${g((o) => o.m30_z0)} · ${g((o) => o.m_z0)} | ${g((o) => o.d400.pop)} |`); }
