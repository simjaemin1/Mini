#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T860 표 · 판 JSON 만 읽는다)
// === scripts/t860-table.js — 갈무리 ÷ 버림 · 인구 · 빈 마을 — 갈래마다 대조 띠(T837 `diverge-ctl` 꼴) ====================
//   쓰는 법: node scripts/t860-table.js <판 뿌리> [--arm a --arm on] [--one r --one rc] [--json out.json]
//     판 뿌리 아래 `run-<갈래>`(갈래 판) · `run-<갈래>~raid<n>`(대조 판) — 판마다 `base-<시드>.json`(t577) · `base-<시드>.t847.json`(t847-preserve 서버 판 곁)
//   셈(3시드 합): 버림(생선 · 연어 · 고기 · 해산물 넷 — 곳간 장부 마감 버림 + econ 일일 부패 `tickDecay`) · 요리사 갈무리 · 잡은 날 말리기(어부 · 사냥꾼) ·
//     갈무리 ÷ 버림 · 800일 인구 · 빈 마을. 띠 = 갈래 판 + 대조 판 최소 ~ 최대(판정 0 — 산수뿐).
'use strict';
const fs = require('fs');
const path = require('path');
const D = process.argv[2];
if (!D) { console.error('쓰는 법: node scripts/t860-table.js <판 뿌리> --arm a --arm on'); process.exit(2); }
const arg = (k) => { const o = []; process.argv.forEach((x, i) => { if (x === k) o.push(process.argv[i + 1]); }); return o; };
const ARMS = arg('--arm'), ONES = arg('--one');
const JOUT = arg('--json')[0] || null;
const SEEDS = [1020, 7, 42];
const G = ['fish', 'salmon', 'meat', 'seaweed', 'shrimp', 'crab', 'oyster'];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
function measure(dir) {
  const m = { rot: 0, dec: 0, cook: 0, catchU: 0, catchFish: 0, catchMeat: 0, pop: 0, empty: 0, ok: true, seeds: 0 };
  for (const s of SEEDS) {
    const o = rd(path.join(dir, `base-${s}.json`)), p = rd(path.join(dir, `base-${s}.t847.json`));
    if (!o || !p) { m.ok = false; continue; }
    m.seeds++; m.pop += o.eight ? o.eight.pop : 0; m.empty += o.empty || 0;
    for (const r of p.rows) {
      for (const k of G) { m.rot += +r.rot[k] || 0; m.dec += +(r.dec || {})[k] || 0; }
      m.cook += r.used;
      if (r.catch) { m.catchU += r.catch.used; for (const [k, x] of Object.entries(r.catch.take)) { if (k === 'meat') m.catchMeat += x; else m.catchFish += x; } }
    }
  }
  m.lost = m.rot + m.dec; m.pres = m.cook + m.catchU; m.ratio = m.lost > 0 ? m.pres / m.lost : 0;
  return m;
}
const runs = fs.existsSync(D) ? fs.readdirSync(D).filter((x) => /^run-/.test(x)).sort() : [];
const M = {}; for (const r of runs) M[r.slice(4)] = measure(path.join(D, r));
const f0 = (x) => Math.round(x).toLocaleString('en-US'), pc = (x) => (100 * x).toFixed(1) + '%';
console.log('\n| 판 | 시드 | 버림(장부) | 부패(econ) | 요리사 갈무리 | 잡은 날 말리기(생선 · 고기) | 갈무리 ÷ 버림 | 800일 인구 | 빈 마을 |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [k, m] of Object.entries(M)) console.log(`| ${k} | ${m.seeds}/3 | ${f0(m.rot)} | ${f0(m.dec)} | ${f0(m.cook)} | ${f0(m.catchU)} (${f0(m.catchFish)} · ${f0(m.catchMeat)}) | ${pc(m.ratio)} | ${f0(m.pop)} | ${m.empty} |`);
const band = (a) => { const ks = Object.keys(M).filter((k) => k === a || k.startsWith(a + '~')); const ms = ks.map((k) => M[k]).filter((m) => m.ok);
  const b = (f) => { const v = ms.map(f); return { lo: Math.min(...v), hi: Math.max(...v), mean: v.reduce((x, y) => x + y, 0) / (v.length || 1), arm: M[a] && M[a].ok ? f(M[a]) : null }; };
  return { n: ms.length, ratio: b((m) => m.ratio), pop: b((m) => m.pop), empty: b((m) => m.empty), lost: b((m) => m.lost), pres: b((m) => m.pres) }; };
const out = { runs: M, bands: {} };
if (ARMS.length) {
  for (const a of ARMS) out.bands[a] = band(a);
  console.log('\n| 셈 | ' + ARMS.map((a) => `${a} 띠(폭) · 판 ${out.bands[a].n}`).join(' | ') + (ARMS.length === 2 ? ' | 갈래 차 | 띠 겹침 |' : ' |'));
  console.log('|---|' + ARMS.map(() => '---|').join('') + (ARMS.length === 2 ? '---|---|' : ''));
  const rows = [['갈무리 ÷ 버림', 'ratio', pc], ['버림 + 부패', 'lost', f0], ['갈무리 합', 'pres', f0], ['800일 인구', 'pop', f0], ['빈 마을', 'empty', (x) => String(x)]];
  for (const [nm, k, fm] of rows) {
    const cs = ARMS.map((a) => { const b = out.bands[a][k]; return `${fm(b.lo)} ~ ${fm(b.hi)} (${k === 'ratio' ? ((b.hi - b.lo) * 100).toFixed(1) + '%p' : fm(b.hi - b.lo)})`; });
    let tail = '';
    if (ARMS.length === 2) { const [x, y] = ARMS.map((a) => out.bands[a][k]); const d = (y.arm != null && x.arm != null) ? y.arm - x.arm : null;
      tail = ` | ${d == null ? '—' : (k === 'ratio' ? (d * 100).toFixed(1) + '%p' : (d > 0 ? '+' : '') + fm(d))} | ${(y.lo > x.hi || x.lo > y.hi) ? '**안 겹침**' : '겹침'} |`; }
    console.log(`| ${nm} | ${cs.join(' | ')}${tail}`);
  }
}
if (ONES.length) { console.log('\n(한 판씩) ' + ONES.map((k) => M[k] ? `${k}: 갈무리 ÷ 버림 ${pc(M[k].ratio)} · 인구 ${f0(M[k].pop)} · 빈 마을 ${M[k].empty}` : `${k}: 없음`).join(' · ')); }
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out));
