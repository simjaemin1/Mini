#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T666 표 자)
// =============================================================================
// T666 — `T666_LOG_FIRST` 끔/켬 표: T650 결정론 판(`t577-server-run.js` · 캐러밴 몸 끔)의 `<판>-<씨>.json.t666.jsonl`(t666-obs.js)을 접는다.
//   node scripts/t666-table.js <dir> [끔 표지=off] [켬 표지=on] [씨=1020,7,42]
//   칸: 통나무 0 마을(z0 — 곳간 통나무 0 · 사람 있는 마을) d100·d200·d400 · 임업 마을 통나무 합 · 인구 · 400일 출발 품목(대수 · 단위)
//       — 쌀(rice) · 통나무(wood · 그중 0 마을행) · 곡물 묶음(rice+wheat+food) · 판 JSON 여덟 수(인구 · 소멸)
//   [--spare <T656 판 outdir> [표지]] — T656 유통 장부(flow_*.jsonl 'v' 줄)로 `spareCap` 이 통나무 재고를 안 보는 표(재고 구간별 상한 · 꽉 참)
//   ⚠새 수 0 — 셈만 한다.
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const A = process.argv.slice(2);
const rd = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const f1 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('en-US'));
const pc = (a, b) => (b ? ((a - b) / b * 100).toFixed(1) + '%' : '—');

if (A[0] === '--spare') {
  const D = A[1], TAG = A[2] || 's1020_off';
  for (const z of ['hanbando', 'nippon']) {
    const F = rd(path.join(D, `flow_${TAG}_${z}.jsonl`));
    const V = F.filter((r) => r.k === 'v'), C = F.filter((r) => r.k === 'c');
    const loop = new Set(C.map((r) => r.d + '|' + r.s));
    const bins = [[0, 100], [100, 300], [300, 1000], [1000, 3000], [3000, Infinity]];
    console.log(`### ${z} — 통나무 남는 마을-날(재고 > 1.2 × 인구)의 여유 노동 상한 spareCap = max(1, ⌊인구 × 유휴 × 0.11⌋)`);
    console.log('| 곳간 통나무 | 마을-날 | 인구 중앙 | 상한 중앙(최대) | 지금 교역 중 중앙 | 꽉 참(루프 안 돎) |\n|---|---|---|---|---|---|');
    for (const [lo, hi] of bins) {
      const R = V.filter((r) => r.w > lo && r.w <= hi); if (!R.length) continue;
      const full = R.filter((r) => !loop.has(r.d + '|' + r.s) && r.cur >= r.cap).length;
      console.log(`| ${lo}~${hi === Infinity ? '' : hi} | ${R.length} | ${med(R.map((r) => r.n))} | ${med(R.map((r) => r.cap))}(${Math.max(...R.map((r) => r.cap))}) | ${med(R.map((r) => r.cur))} | ${full}(${(100 * full / R.length).toFixed(0)}%) |`);
    }
    // 같은 인구 구간에서 재고가 상한을 바꾸나 — 인구 150 이상 마을만
    const big = V.filter((r) => r.n >= 150);
    if (big.length) {
      const lo = big.filter((r) => r.w <= 1000), hi = big.filter((r) => r.w > 3000);
      console.log(`\n인구 150 이상 마을-날: 통나무 ≤ 1,000 → 상한 중앙 ${med(lo.map((r) => r.cap))} (${lo.length}날) · 통나무 > 3,000 → 상한 중앙 ${med(hi.map((r) => r.cap))} (${hi.length}날)\n`);
    }
  }
  process.exit(0);
}

const [DIR, OFF = 'off', ON = 'on', SEEDS0 = '1020,7,42'] = A;
if (!DIR) { console.error('쓰는 법: node scripts/t666-table.js <dir> [끔] [켬] [씨] · --spare <T656 outdir> [표지]'); process.exit(2); }
const SEEDS = SEEDS0.split(',');
const DAYS = [100, 200, 400];
function fold(tag, seed) {
  const R = rd(path.join(DIR, `${tag}-${seed}.json.t666.jsonl`));
  if (!R.length) return null;
  const at = (d) => R.find((r) => r.d >= d) || R[R.length - 1];
  const dep = {}; let woodZ = 0;
  for (const r of R) { for (const [k, [n, q]] of Object.entries(r.dep || {})) { const x = dep[k] || (dep[k] = [0, 0]); x[0] += n; x[1] += q; } woodZ += r.woodZ || 0; }
  let j = null; try { j = JSON.parse(fs.readFileSync(path.join(DIR, `${tag}-${seed}.json`), 'utf8')); } catch (e) {}
  const g = (k) => (dep[k] ? dep[k][1] : 0);
  return {
    last: R[R.length - 1].d,
    z0: DAYS.map((d) => at(d).z0), live: DAYS.map((d) => at(d).live), forest: DAYS.map((d) => at(d).forest), pop: DAYS.map((d) => at(d).pop), top: at(400).top,
    rice: dep.rice || [0, 0], wood: dep.wood || [0, 0], woodZ, grain: g('rice') + g('wheat') + g('food'),
    deps: Object.values(dep).reduce((s, x) => s + x[0], 0),
    j: j ? { pop: j.pop != null ? j.pop : (j.eight && j.eight.pop), dead: j.dead != null ? j.dead : (j.eight && j.eight.dead), empty: j.empty, dissolved: j.dissolved } : null,
  };
}
const T = {};
for (const s of SEEDS) T[s] = { off: fold(OFF, s), on: fold(ON, s) };
fs.writeFileSync(path.join(DIR, 't666_table.json'), JSON.stringify(T, null, 1));
console.log('| 씨 | 팔 | 마지막 날 | 0 마을 d100 · d200 · d400(/사람 있는 마을) | 임업 통나무 d100 · d200 · d400 | 인구 d100 · d200 · d400 | 출발 수레 | 쌀 수레 · 단위 | 곡물(쌀·밀·식량) 단위 | 통나무 수레 · 단위 · 0 마을행 | d400 최다 통나무 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const s of SEEDS) for (const arm of ['off', 'on']) {
  const o = T[s][arm]; if (!o) { console.log(`| ${s} | ${arm} | 없음 |||||||||`); continue; }
  console.log(`| ${s} | ${arm === 'off' ? '끔' : '켬'} | ${o.last} | ${o.z0.join(' · ')} (/${o.live[2]}) | ${o.forest.map(f1).join(' · ')} | ${o.pop.map(f1).join(' · ')} | ${f1(o.deps)} | ${f1(o.rice[0])} · ${f1(o.rice[1])} | ${f1(o.grain)} | ${f1(o.wood[0])} · ${f1(o.wood[1])} · ${f1(o.woodZ)} | ${o.top ? o.top[0] + ' ' + f1(o.top[1]) : '—'} |`);
}
console.log('\n| 씨 | 0 마을 d400 끔 → 켬 | 쌀 단위 변화 | 곡물 단위 변화 | 통나무 단위 끔 → 켬 | 인구 d400 끔 → 켬 |\n|---|---|---|---|---|---|');
for (const s of SEEDS) { const a = T[s].off, b = T[s].on; if (!a || !b) continue;
  console.log(`| ${s} | ${a.z0[2]} → ${b.z0[2]} | ${pc(b.rice[1], a.rice[1])} | ${pc(b.grain, a.grain)} | ${f1(a.wood[1])} → ${f1(b.wood[1])} | ${f1(a.pop[2])} → ${f1(b.pop[2])} (${pc(b.pop[2], a.pop[2])}) |`); }
