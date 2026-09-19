#!/usr/bin/env node
// === scripts/t285-picker.js — T285: 죽은 다리와 자리 상한 (표 셋) ======================
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T285]
//   T275 가 잡은 것: 옛 `pickDeficitJob` 의 `wood < N*5` 줄이 `picker:'rational'` 세계에서 한 번도 안 돈다.
//   여기선 셋을 읽는다 — ⓐ picker 값이 서는 자리 전수(서버·자·랩이 같은가) ·
//   ⓑ 두 picker 의 **진입 횟수**(함수 전체가 죽은 다리인가) + legacy 에만 있는 규칙 ·
//   ⓒ `hasSlot` 이 막을 때 상한이 **무엇으로** 정해지나 · 막힌 마을은 어떻게 됐나.
//
// 실행: node scripts/t285-picker.js /tmp/t285
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t285';
const ROOT = path.join(__dirname, '..');
const SEEDS = [1020, 7, 42];
const load = (s) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `led_${s}.json`), 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));

console.log('\n=== T285 — 죽은 다리와 자리 상한 (실지도 51마을 · 800일 · 3시드 · 제품 코드 0) ===');

// ── ⓐ picker 값이 서는 자리 전수 ────────────────────────────────────────────
console.log('\nⓐ `picker` 값이 서는 자리 전수 — 서버·자·랩이 같은 규칙을 쓰나');
const FILES = ['server/villages.js', 'server/central.js', 'scripts/t176-ab.js', 'scripts/t17-metrics.js',
  'scripts/econ-lab-real.js', 'scripts/ev-density.js', 'scripts/t60-extinct.js', 'scripts/t86-attrib.js',
  'scripts/lab-happywork-ab.js', 'scripts/test-econ-fieldyield.js', 'scripts/test-valuechain.js',
  'sim/build-econ-bundle.js', 'sim/regression-check.js', 'lab/마을실험실.html', 'lab/전쟁실험실.html'];
console.log('  파일                              createWorldV2 호출   picker 명시   값');
for (const f of FILES) {
  let t; try { t = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
  // ★주석 줄과 **엔진 자신의 정의/기본값**은 빼고 센다(안 그러면 랩 HTML 의 인라인 엔진이 호출로 잡힌다)
  const code = t.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  const calls = (code.match(/(?:econV2|economyV2|Eng|EE|v2b?|E)\.createWorldV2\s*\(/g) || []).length;
  const rat = (code.match(/picker:\s*'rational'/g) || []).length;
  const leg = (code.match(/picker:\s*'legacy'/g) || []).length;
  if (!calls && !rat && !leg) continue;
  const note = f.startsWith('lab/')
    ? '  ※인라인 엔진의 v1 기본값 한 줄 포함(호출 아님)'
    : (calls > rat ? `  ★${calls - rat}곳은 안 줌 → 기본값 legacy` : '');
  console.log('  ' + f.padEnd(34) + String(calls).padStart(10) + String(rat + leg).padStart(13) + '   '
    + (rat ? `rational ${rat}` : '') + (leg ? `  legacy ${leg}` : '') + note);
}
const ES = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const def = ES.match(/picker:\s*opts\.picker\s*\|\|\s*'([a-z]+)'/);
console.log(`  ※기본값(\`economy-sim.js\`): picker: opts.picker || '${def ? def[1] : '?'}'  ← **안 주면 ${def ? def[1] : '?'}** 로 떨어진다`);

// ── ⓑ 진입 횟수 + legacy 에만 있는 규칙 ─────────────────────────────────────
console.log('\nⓑ 두 picker 의 **진입 횟수** — 함수 전체가 죽은 다리인가');
console.log('  시드     옛 `pickDeficitJob`   `pickDeficitJob_rational`  |  옛 위기줄(참/충원/막힘)');
for (const s of SEEDS) {
  const d = load(s); if (!d) { console.log(`  ${s}  자료 없다`); continue; }
  console.log('  ' + String(s).padEnd(8) + nf(d.legacyPickTot).padStart(16) + nf(d.ratPickTot).padStart(26)
    + '  |  ' + `${d.pkTryTot} / ${d.pkHitTot} / ${d.pkBlockTot}`.padStart(16));
}
console.log('  ⇒ 진입이 **0** 이면 그 함수는 이 세계에서 통째로 안 돈다(줄 하나가 아니라 함수 전체).');

const body = (n) => { const st = ES.indexOf('function ' + n + '('); let d = 0;
  for (let j = ES.indexOf('{', st); j < ES.length; j++) { if (ES[j] === '{') d++; else if (ES[j] === '}') { d--; if (!d) return ES.slice(st, j + 1); } } return ''; };
const rulesOf = (t) => t.split('\n').filter((l) => !/^\s*\/\//.test(l) && /return '|candidates\.push/.test(l))
  .map((l) => l.trim().replace(/\s+/g, ' ').replace(/\s*\/\/.*$/, ''));
const keyOf = (l) => { const m = l.match(/return '([a-z_]+)'|push\(\['([a-z_]+)'/); return m ? (m[1] || m[2]) : '?'; };
const L = rulesOf(body('pickDeficitJob')), R = rulesOf(body('pickDeficitJob_rational'));
console.log('\n  옛 picker 의 규칙 ' + L.length + '줄 · rational 의 규칙 ' + R.length + '줄');
console.log('  ★같은 목표라도 **조건이 다르다** — 죽은 다리에만 있는 조건을 나란히 둔다(전부 소스 인용 · 지어낸 말 0)');
const pick = (arr, key, rx) => arr.find((l) => keyOf(l) === key && rx.test(l)) || '(없다)';
const PAIRS = [
  ['lumberjack', /storage\.wood/, /storage\.wood/],
  ['forager', /storage\.stone/, /storage\.stone/],
  ['cook', /foodRich|sideTotal/, /cookTarget/],
];
for (const [k, lr, rr] of PAIRS) {
  console.log('   ─ ' + k);
  console.log('     옛      : ' + pick(L, k, lr).slice(0, 120));
  console.log('     rational: ' + pick(R, k, rr).slice(0, 120));
}
const RK = new Set(R.map(keyOf));
const onlyL = [...new Set(L.map(keyOf))].filter((k) => !RK.has(k));
console.log('   ─ 목표 자체가 rational 에 없는 것: ' + (onlyL.length ? onlyL.join(' · ') : '(없다)'));

// ── ⓒ hasSlot 상한 ──────────────────────────────────────────────────────────
const capLine = (ES.match(/^\s*lumberjack:\s*Math\.floor\([^\n]*$/m) || [''])[0].trim();
console.log('\nⓒ `hasSlot` 이 막을 때 — 상한은 **무엇으로** 정해지나');
console.log('  hasSlot(v, job, cap, counts) = (cap[job] || 0) > (counts[job] || 0)');
console.log('  jobCapacity(v).' + (capLine || 'lumberjack: ?'));
console.log('  ⇒ 도구도 건물도 아니다 — **땅 크기 × 숲 밀도 × 0.30**, 즉 그 마을의 **숲 그 자체**다.');
console.log('\n  시드  막힘/참(전체)    막힌 마을  자리상한 0    상한 꽉참   막힌 마을 중 **소멸**   막힌 마을 끝인구(최소~최대)');
for (const s of SEEDS) {
  const d = load(s); if (!d) continue;
  const rows = d.per.filter((p) => p.everPop && (p.rpBlock || 0) > 0);
  const zero = rows.filter((r) => r.ljCap === 0).length;
  const full = rows.filter((r) => r.ljCap > 0 && r.ljCnt >= r.ljCap).length;
  const dead = rows.filter((r) => r.N <= 0).length;
  const ns = rows.map((r) => r.N).sort((a, b) => a - b);
  console.log('  ' + String(s).padEnd(6) + `${d.rpBlockTot}/${d.rpTryTot} (${(d.rpBlockTot / d.rpTryTot * 100).toFixed(1)}%)`.padStart(15)
    + String(rows.length).padStart(11) + String(zero).padStart(12) + String(full).padStart(12)
    + String(dead).padStart(20) + `   ${ns[0]} ~ ${ns[ns.length - 1]}`);
}
console.log('\n  가장 많이 막힌 마을 — 그 순간의 자리 상한·현원(표본은 마지막 막힘)');
console.log('  시드  마을        참   충원   막힘   막힌%  | 자리상한  현원   숲밀도   끝인구');
for (const s of SEEDS) {
  const d = load(s); if (!d) continue;
  const rows = d.per.filter((p) => p.everPop && (p.rpBlock || 0) > 0).sort((a, b) => b.rpBlock - a.rpBlock).slice(0, 4);
  for (const r of rows)
    console.log('  ' + String(s).padEnd(6) + r.name.padEnd(10) + String(r.rpTry).padStart(5) + String(r.rpHit).padStart(7)
      + String(r.rpBlock).padStart(7) + ((r.rpBlock / r.rpTry * 100).toFixed(0) + '%').padStart(7)
      + '  |' + String(r.ljCap).padStart(8) + String(r.ljCnt).padStart(7) + String(r.wood).padStart(9) + String(r.N).padStart(9));
}
console.log('');
