'use strict';
// (@regress 없음 — 러너 밖 · T1344 진단 자 · 읽기만)
// === scripts/t1344-legs.js — 첫째 화물 다리(t1344 관찰기 `legs` — 구리를 내보낼 수 있던 마을의 출발 · 광산5 로 간 출발)를 마을마다 · 줄마다 ==========
//   쓰는 법: node scripts/t1344-legs.js <이름=머리> [<이름=머리> …] [--rows 12]
//   ① 구리를 내보낼 수 있던 출발(내보낼 몫 > 0) — 마을마다: 출발 수 · 고른 품목(많은 셋) · 고른 다리 낱개 몫 · 양 · 짐 몫(가운데) ·
//      같은 날 구리 → 광산5 다리였다면 낱개 몫 · 양(min(내보낼 몫, 100)) · 짐 몫(가운데) · 구리 다리가 더 컸던 출발 · 광산5 로 간 출발(그 가운데)
//   ② 광산5 로 간 출발 — 마을마다: 수 · 남는 kg(가운데) · 구리 한 낱개(3.5 kg) 들 자리 · 둘째 화물(품목)
//   ③ 구리를 내보낼 수 있던 출발 줄(앞 N)
const fs = require('fs');
const zlib = require('zlib');
const args = process.argv.slice(2), arms = [], opt = { rows: 12 };
for (let i = 0; i < args.length; i++) { if (args[i] === '--rows') opt.rows = +args[++i]; else if (args[i] === '--sum') opt.sum = args[++i]; else { const k = args[i].indexOf('='); arms.push([args[i].slice(0, k), args[i].slice(k + 1)]); } }
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8')); } catch (e2) { return null; } } };
const med = (a) => { const b = a.filter((x) => x != null && Number.isFinite(+x)); if (!b.length) return null; const s = b.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const f1 = (x) => x == null ? '—' : (+x).toFixed(1), f2 = (x) => x == null ? '—' : (+x).toFixed(2);
const top = (a, n) => { const m = {}; for (const x of a) m[x] = (m[x] || 0) + 1; return Object.entries(m).sort((p, q) => q[1] - p[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(' · '); };
//   --sum <마을> — 판마다 한 줄: 그 마을이 구리를 내보낼 수 있던 출발(날 범위 · 수) · 고른 다리 낱개 몫 · 짐 몫(가장 작은 / 가운데 / 가장 큰) ·
//     구리 내보낼 몫 · 광산5 구리 값 · 구리 → 광산5 낱개 몫 · 짐 몫 · 고른 다리 ÷ 구리 다리(가운데) · 광산5 로 간 출발 · 호위 0 · 남는 kg < 0 · 둘째 화물 · 구리 다리가 이긴 출발
if (opt.sum) {
  const r3 = (a) => { const b = a.filter((x) => x != null && Number.isFinite(+x)).sort((x, y) => x - y); return b.length ? `${(+b[0]).toFixed(1)} / ${(+b[b.length >> 1]).toFixed(1)} / ${(+b[b.length - 1]).toFixed(1)}` : '—'; };
  console.log(`| 판(${opt.sum}) | 출발(날) | 고른 다리 낱개 몫 | 고른 다리 짐 몫 | 구리 내보낼 몫 | 광산5 구리 값 | 구리 → 광산5 낱개 몫 | 구리 → 광산5 짐 몫 | 고른 ÷ 구리(가운데) | 광산5 로 · 호위 0 · 남는 kg < 0 · 둘째 화물 · 구리가 이김 |`);
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const [name, h] of arms) {
    const X = rd(h + '.t1344.json'); if (!X) { console.log(`| ${name} | (관찰기 없음) |||||||||`); continue; }
    const c = X.lcols, I = (k) => c.indexOf(k), A = (X.legs || []).filter((l) => l[I('from')] === opt.sum && l[I('cuSurplus')] > 0);
    if (!A.length) { console.log(`| ${name} | 0 |||||||||`); continue; }
    const ratio = med(A.filter((l) => l[I('cuTot5')] > 0).map((l) => l[I('profit')] / l[I('cuTot5')]));
    console.log(`| ${name} | ${A.length}(${A[0][I('day')]} ~ ${A[A.length - 1][I('day')]}) | ${r3(A.map((l) => l[I('pu')]))} | ${r3(A.map((l) => l[I('profit')]))} | ${r3(A.map((l) => l[I('cuSurplus')]))} | ${r3(A.map((l) => l[I('pCu5')]))} | ${r3(A.map((l) => l[I('cuPu5')]))} | ${r3(A.map((l) => l[I('cuTot5')]))} | ${ratio == null ? '— (구리 짐 몫 ≤ 0)' : ratio.toFixed(1)} | ${A.filter((l) => l[I('to')] === '광산5').length} · ${A.filter((l) => !l[I('escort')]).length} · ${A.filter((l) => l[I('roomKg')] != null && l[I('roomKg')] < 0).length} · ${A.filter((l) => l[I('res2')]).length} · ${A.filter((l) => l[I('cuTot5')] != null && l[I('cuTot5')] > l[I('profit')]).length} |`);
  }
  process.exit(0);
}
for (const [name, h] of arms) {
  const X = rd(h + '.t1344.json');
  if (!X) { console.log(`## ${name} — 관찰기 없음\n`); continue; }
  const c = X.lcols, I = (k) => c.indexOf(k), L = X.legs || [];
  console.log(`## ${name} — 다리 ${L.length}(구리를 내보낼 수 있던 마을의 출발 · 광산5 로 간 출발)\n`);
  const cu = L.filter((l) => l[I('cuSurplus')] > 0);
  console.log('| 마을 | 출발 | 고른 품목 | 고른 다리 낱개 몫 · 양 · 짐 몫(가운데) | 구리 → 광산5 낱개 몫 · 양 · 짐 몫(가운데) | 구리 다리가 더 컸던 출발 | 광산5 로 간 출발 |');
  console.log('|---|---:|---|---:|---:|---:|---:|');
  const byV = {}; for (const l of cu) (byV[l[I('from')]] || (byV[l[I('from')]] = [])).push(l);
  for (const [v, A] of Object.entries(byV).sort((p, q) => q[1].length - p[1].length)) {
    const qty = A.map((l) => Math.min(l[I('cuSurplus')], 100));
    console.log(`| ${v} | ${A.length} | ${top(A.map((l) => l[I('res')]), 3)} | ${f2(med(A.map((l) => l[I('pu')])))} · ${f1(med(A.map((l) => l[I('units')])))} · ${f1(med(A.map((l) => l[I('profit')])))} | ${f2(med(A.map((l) => l[I('cuPu5')])))} · ${f1(med(qty))} · ${f1(med(A.map((l) => l[I('cuTot5')])))} | ${A.filter((l) => l[I('cuTot5')] != null && l[I('cuTot5')] > l[I('profit')]).length} | ${A.filter((l) => l[I('to')] === '광산5').length} |`);
  }
  if (!cu.length) console.log('| (없음 — 구리가 내보낼 후보로 선 출발 0) | | | | | | |');
  console.log();
  const to5 = L.filter((l) => l[I('to')] === '광산5');
  console.log('| 광산5 로 간 마을 | 출발 | 주 짐(많은 셋) | 남는 kg 가운데 | 남는 kg ≥ 3.5 | 둘째 화물(품목) | 그 마을 구리 내보낼 몫 > 0 |');
  console.log('|---|---:|---|---:|---:|---|---:|');
  const by5 = {}; for (const l of to5) (by5[l[I('from')]] || (by5[l[I('from')]] = [])).push(l);
  for (const [v, A] of Object.entries(by5).sort((p, q) => q[1].length - p[1].length).slice(0, 12)) {
    const r2 = A.filter((l) => l[I('res2')]).map((l) => l[I('res2')]);
    console.log(`| ${v} | ${A.length} | ${top(A.map((l) => l[I('res')]), 3)} | ${f1(med(A.map((l) => l[I('roomKg')])))} | ${A.filter((l) => l[I('roomKg')] != null && l[I('roomKg')] >= 3.5).length} | ${r2.length ? `${r2.length} — ${top(r2, 3)}` : '0'} | ${A.filter((l) => l[I('cuSurplus')] > 0).length} |`);
  }
  console.log();
  if (cu.length && opt.rows > 0) {
    console.log('| 날 | 다리 | 주 짐 × 양 | 낱개 몫 · 짐 몫 | 호위 · 남는 kg | 둘째 화물 | 구리 내보낼 몫 · 값(여기 · 광산5) · 거리 | 구리 → 광산5 낱개 몫 · 짐 몫 |');
    console.log('|---:|---|---|---:|---:|---|---:|---:|');
    for (const l of cu.slice(0, opt.rows)) console.log(`| ${l[I('day')]} | ${l[I('from')]} → ${l[I('to')]} | ${l[I('res')]} × ${f1(l[I('units')])} | ${f2(l[I('pu')])} · ${f1(l[I('profit')])} | ${l[I('escort')]} · ${f1(l[I('roomKg')])} | ${l[I('res2')] ? `${l[I('res2')]} × ${f1(l[I('amt2')])}` : '—'} | ${f1(l[I('cuSurplus')])} · ${f2(l[I('pCuFrom')])} · ${f2(l[I('pCu5')])} · ${l[I('dist5')] == null ? '—' : l[I('dist5')]} | ${f2(l[I('cuPu5')])} · ${f1(l[I('cuTot5')])} |`);
    console.log();
  }
}
