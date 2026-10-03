#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T611 표 기계 · 판정 0) 마을 옮김이 3시드를 왜 깎나 — 팔별 합 · 흔들림 바닥 · 옮긴 마을의 무엇이 줄었나
//   입력: t17 JSON(`T17_JSON`)과 시딩 캐시(`LAB_SEEDCACHE`)를 팔·시드마다 — 이름 규약 <dir>/<팔>_<시드>.json · <dir>/../seeds_<팔>_<시드>.json
//   쓰는 법: node scripts/t611-why.js <rul dir> <seeds dir> <plan_C.json>
'use strict';
const fs = require('fs');
const path = require('path');
const [RUL, SEEDS, PLANC] = process.argv.slice(2);
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const run = (g, s) => J(path.join(RUL, `${g}_${s}.json`));
const seedsOf = (g, s) => J(path.join(SEEDS, `seeds_${g}_${s}.json`));
const sum = (j) => j ? j.vpop.reduce((a, v) => a + v.pop, 0) : null;
const dead = (j) => j ? j.vpop.filter((v) => !(v.pop > 0)).length : null;
const planC = J(PLANC).zones.hanbando.rows;
const movedOf = (g) => { const p = J(`/tmp/t611/plan_${g}.json`); return new Set(p ? p.zones.hanbando.rows.filter((r) => r.moved > 0).map((r) => r.name) : []); };
const out = { arms: {}, jitter: {}, villages: [] };

// ① 팔 셋 + 흔들림 팔 — 3시드 인구 · 소멸 · 옮긴 마을 합 / 안 옮긴 마을 합
const CAN = [1020, 7, 42], EXTRA = [101, 202, 303];
console.log('\n[① 팔별] 3시드 인구 · 소멸 · 옮긴 마을 합 Δ / 안 옮긴 마을 합 Δ (base 대비 · 시드마다)');
console.log('| 팔 | 옮김 | 1020 | 7 | 42 | 평균 Δ% | 옮긴 마을 Δ(3시드 합) | 안 옮긴 마을 Δ(3시드 합) |');
console.log('|---|---:|---|---|---|---:|---:|---:|');
for (const g of ['A', 'B', 'C', 'J']) {
  const mv = movedOf(g); const cells = []; let dM = 0, dU = 0, pct = 0, n = 0;
  for (const s of CAN) {
    const b = run('base', s), a = run(g, s); if (!a || !b) { cells.push('—'); continue; }
    const bm = new Map(b.vpop.map((v) => [v.name, v.pop]));
    for (const v of a.vpop) { const d = v.pop - (bm.get(v.name) || 0); if (mv.has(v.name)) dM += d; else dU += d; }
    pct += (sum(a) - sum(b)) / sum(b) * 100; n++;
    cells.push(`${sum(a).toLocaleString()}(${((sum(a) - sum(b)) / sum(b) * 100).toFixed(1)}%) · 소멸 ${dead(a)}`);
  }
  out.arms[g] = { moved: mv.size, cells, pct: n ? pct / n : null, dMoved: dM, dUnmoved: dU };
  console.log(`| ${g} | ${mv.size} | ${cells.join(' | ')} | ${n ? (pct / n).toFixed(1) : '—'}% | ${dM} | ${dU} |`);
}
console.log(`| base | 0 | ${CAN.map((s) => { const b = run('base', s); return b ? `${sum(b).toLocaleString()} · 소멸 ${dead(b)}` : '—'; }).join(' | ')} | — | — | — |`);

// ② 흔들림 바닥 — 한 마을 1셀(J) 대 base · 정본 셋 + 덧시드 셋
console.log('\n[② 흔들림 바닥] 농촌22 한 칸(J) 대 base — 시드마다 인구 Δ% · 그 마을 Δ · 나머지 Δ');
const jr = [];
for (const s of [...CAN, ...EXTRA]) {
  const b = run('base', s), a = run('J', s); if (!a || !b) { jr.push({ s, na: true }); continue; }
  const bm = new Map(b.vpop.map((v) => [v.name, v.pop])); let dSelf = 0, dRest = 0, absRest = 0;
  for (const v of a.vpop) { const d = v.pop - (bm.get(v.name) || 0); if (v.name === '농촌22') dSelf += d; else { dRest += d; absRest += Math.abs(d); } }
  const p = (sum(a) - sum(b)) / sum(b) * 100;
  jr.push({ s, base: sum(b), j: sum(a), pct: +p.toFixed(2), dSelf, dRest, absRest });
  console.log(`  시드 ${s}: ${sum(b)} → ${sum(a)} (${p.toFixed(2)}%) · 농촌22 ${dSelf >= 0 ? '+' : ''}${dSelf} · 나머지 합 ${dRest} · 마을별 |Δ| 합 ${absRest}`);
}
const ps = jr.filter((r) => !r.na).map((r) => r.pct);
out.jitter = { rows: jr, maxAbs: ps.length ? Math.max(...ps.map(Math.abs)) : null, meanAbs: ps.length ? ps.reduce((a, b) => a + Math.abs(b), 0) / ps.length : null };
console.log(`  → |Δ%| 최대 ${out.jitter.maxAbs && out.jitter.maxAbs.toFixed(2)} · 평균 ${out.jitter.meanAbs && out.jitter.meanAbs.toFixed(2)}`);

// ③ 옮긴 31곳 마을마다 — 물 · 비옥 · 해안 · 가장 가까운 이웃 · 어부 몫 전후 · 인구 Δ(3시드 평균)
const sB = seedsOf('base', 1020), sC = seedsOf('C', 1020);
const byName = (arr) => new Map((arr || []).map((v) => [v.name, v]));
const SB = byName(sB), SC = byName(sC);
const nn = (S, v) => { let m = 1e9; for (const o of S.values()) if (o !== v) m = Math.min(m, Math.hypot(o.ccx - v.ccx, o.ccy - v.ccy)); return m; };
const fishShare = (g, name) => { let f = 0, p = 0; for (const s of CAN) { const r = run(g, s); if (!r) continue; const row = (r.fish && r.fish.rows || []).find((q) => q.name === name); const vp = r.vpop.find((q) => q.name === name); f += row ? row.fishers : 0; p += vp ? vp.pop : 0; } return p ? f / p : 0; };
const popAvg = (g, name) => { let p = 0, n = 0; for (const s of CAN) { const r = run(g, s); if (!r) continue; const vp = r.vpop.find((q) => q.name === name); if (vp) { p += vp.pop; n++; } } return n ? p / n : 0; };
for (const r of planC.filter((q) => q.moved > 0)) {
  const b = SB.get(r.name), c = SC.get(r.name); if (!b || !c) continue;
  out.villages.push({ name: r.name, moved: r.moved, reasons: r.reasons.join(' · '),
    seedB: [b.ccx, b.ccy], seedC: [c.ccx, c.ccy],
    water: [b.lp.water, c.lp.water], fert: [b.lp.fertility, c.lp.fertility], coastal: [!!b.lp.coastal, !!c.lp.coastal], fishSus: [b.lp.fishSustain || 0, c.lp.fishSustain || 0],
    nn: [nn(SB, b), nn(SC, c)], fishShare: [fishShare('base', r.name), fishShare('C', r.name)], pop: [popAvg('base', r.name), popAvg('C', r.name)] });
}
const V = out.villages;
const corr = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0; };
const dPop = V.map((v) => v.pop[1] - v.pop[0]);
const cols = { '물 Δ': V.map((v) => v.water[1] - v.water[0]), '비옥 Δ': V.map((v) => v.fert[1] - v.fert[0]), '어장 지속 Δ': V.map((v) => v.fishSus[1] - v.fishSus[0]),
  '이웃 거리 Δ': V.map((v) => v.nn[1] - v.nn[0]), '어부 몫 Δ': V.map((v) => v.fishShare[1] - v.fishShare[0]), '옮긴 셀': V.map((v) => v.moved) };
out.corr = {}; console.log(`\n[③ 옮긴 ${V.length}곳] 인구 Δ(3시드 평균)와의 상관(피어슨 · 판정 0)`);
for (const [k, xs] of Object.entries(cols)) { out.corr[k] = +corr(xs, dPop).toFixed(3); console.log(`  ${k}: r = ${out.corr[k]}`); }
fs.writeFileSync(path.join(RUL, 'why.json'), JSON.stringify(out, null, 1));
console.log('\n→', path.join(RUL, 'why.json'));
