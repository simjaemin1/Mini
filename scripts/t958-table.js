#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T958 표 기계 · 판 JSON 만 읽는다 · 세계 안 만짐)
// === scripts/t958-table.js — 집 행위 마을: 크루가 지은 집 ↔ econ 주거 증가 표(3시드 · 날 1~90) ===
//   node scripts/t958-table.js --srv <뿌리> [--runs A,C,...] [--lab <랩 뿌리>] [--vil 농촌14,광산7,광산1] [--json <파일>]
//     서버 판 = <뿌리>/run-<판>/base-<시드>.t958.json · 랩 판 = <랩 뿌리>/<on|off>-<시드>.t958.json
//   셈(관찰기 칸 그대로 · 산수뿐 · 판정 0):
//     econ 이 올린 주거 Σ = Σ built(그날 econ 증축) · 크루가 지은 침상 = 맵 침상 증가 Σ · 크루가 꺼낸 목재 Σ
//     침상당 목재 = 꺼낸 목재 ÷ 지은 침상(econ `houseCostPerCap('wood')` 와 견준다)
//     목재 없이 올린 주거 = econ 증축 가운데 그날 크루가 목재를 안 꺼낸 날의 몫
//     주거 > 침상 마을-날(계획이 지은 집을 넘은 날) · 주거 < 침상 ∧ 게이트 막힘 마을-날(지은 침상이 비어 있는데 econ 주거가 인구를 막은 날)
//     못 받칠 주거 = max(0, 주거 − 침상 − 곳간 목재 ÷ 침상당 목재)(지은 집 + 곳간 목재로 지을 몫을 넘은 econ 주거)
'use strict';
const fs = require('fs');
const path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SRV = arg('--srv', null), LABD = arg('--lab', null), JOUT = arg('--json', null);
const RUNS = arg('--runs', null), VIL = (arg('--vil', '농촌14,광산7,광산1') || '').split(',').filter(Boolean);
const SEEDS = [1020, 7, 42];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const f0 = (x) => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
const f1 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(1));
const f2 = (x) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(3));
function one(o) {
  if (!o || !o.rows) return null;
  const C = {}; o.cols.forEach((c, i) => { C[c] = i; });
  const wpc = (o.econ && o.econ.woodPerCap) || null;
  const per = o.names.map(() => ({ built: 0, builtNoWood: 0, beds0: null, beds1: null, h0: null, h1: null, took: 0, overDays: 0, underGated: 0, unbacked: 0, unbackedMax: 0, live: 0, popMax: 0, gatedDays: 0 }));
  for (const [d, row] of o.rows) row.forEach((r, i) => {
    if (!r) return; const m = per[i];
    if (r[C.live]) m.live = 1;
    if (m.h0 == null) m.h0 = r[C.housing]; m.h1 = r[C.housing];
    const b = r[C.beds]; if (b != null) { if (m.beds0 == null) m.beds0 = b; m.beds1 = b; }
    const bt = r[C.built] || 0; if (bt > 1e-9) { m.built += bt; if (!(r[C.tookWood] > 0)) m.builtNoWood += bt; }
    m.took += r[C.tookWood] || 0;
    if (r[C.gated]) m.gatedDays++;
    if (r[C.pop] > m.popMax) m.popMax = r[C.pop];
    if (b != null) {
      if (r[C.housing] > b + 1e-6) m.overDays++;
      if (r[C.housing] < b - 1e-6 && r[C.gated]) m.underGated++;
      if (wpc) { const ub = Math.max(0, r[C.housing] - b - (r[C.wood] || 0) / wpc); m.unbacked += ub; if (ub > m.unbackedMax) m.unbackedMax = ub; }
    }
  });
  return { names: o.names, per, wpc, knob: o.knob, econ: o.econ };
}
const sets = [];
if (SRV) for (const d of fs.readdirSync(SRV).filter((x) => /^run-/.test(x)).sort()) { const k = d.slice(4); if (RUNS && RUNS.split(',').indexOf(k) < 0) continue; sets.push([k, SEEDS.map((s) => [s, one(J(path.join(SRV, d, `base-${s}.t958.json`)))])]); }
if (LABD) for (const a of ['on', 'off']) sets.push(['lab-' + a, SEEDS.map((s) => [s, one(J(path.join(LABD, `${a}-${s}.t958.json`)))])]);
const out = {};
console.log('\n| 판 | 시드 | 집 행위 마을 | econ 이 올린 주거 Σ (목재 안 꺼낸 날 몫) | 크루가 지은 침상 Σ(날 1 → 끝) | 크루가 꺼낸 목재 Σ | 침상당 목재(econ 1인당) | 주거 > 침상 마을-날 | 주거 < 침상 ∧ 게이트 막힘 마을-날 | 못 받칠 주거 마을-날 합 · 최대 | 게이트 막힘 마을-날 |');
console.log('|---|---|---:|---:|---|---:|---|---:|---:|---|---:|');
for (const [k, arr] of sets) {
  out[k] = {};
  for (const [s, r] of arr) {
    if (!r) { console.log(`| ${k} | ${s} | 판 없음 |`); continue; }
    const t = { live: 0, built: 0, builtNoWood: 0, beds: 0, beds0: 0, beds1: 0, took: 0, over: 0, under: 0, ub: 0, ubMax: 0, gated: 0 };
    for (const m of r.per) {
      t.live += m.live; t.built += m.built; t.builtNoWood += m.builtNoWood; t.took += m.took; t.over += m.overDays; t.under += m.underGated; t.ub += m.unbacked; t.ubMax = Math.max(t.ubMax, m.unbackedMax); t.gated += m.gatedDays;
      if (m.beds0 != null) { t.beds += m.beds1 - m.beds0; t.beds0 += m.beds0; t.beds1 += m.beds1; }
    }
    out[k][s] = t;
    console.log(`| ${k} | ${s} | ${t.live}/${r.names.length} | ${f1(t.built)} (${f1(t.builtNoWood)}) | ${f0(t.beds)} (${f0(t.beds0)} → ${f0(t.beds1)}) | ${f1(t.took)} | ${t.beds > 0 ? f2(t.took / t.beds) : '—'} (${f2(r.wpc)}) | ${t.over} | ${t.under} | ${f1(t.ub)} · ${f1(t.ubMax)} | ${t.gated} |`);
  }
}
console.log('\n| 판 | 시드:마을 | 주거 날 1 → 끝 | econ 이 올린 주거 Σ (목재 안 꺼낸 날) | 침상 날 1 → 끝 | 크루 목재 | 꼭대기 인구 | 주거 > 침상 날 | 주거 < 침상 ∧ 막힘 날 | 게이트 막힘 날 |');
console.log('|---|---|---|---:|---|---:|---:|---:|---:|---:|');
const vrows = [];
for (const [k, arr] of sets) for (const [s, r] of arr) {
  if (!r) continue;
  for (const nm of VIL) {
    const i = r.names.indexOf(nm); if (i < 0) continue; const m = r.per[i];
    vrows.push({ run: k, seed: s, nm, ...m });
    console.log(`| ${k} | ${s}:${nm} | ${f1(m.h0)} → ${f1(m.h1)} | ${f1(m.built)} (${f1(m.builtNoWood)}) | ${m.beds0 == null ? '—' : `${f0(m.beds0)} → ${f0(m.beds1)}`} | ${f1(m.took)} | ${m.popMax} | ${m.overDays} | ${m.underGated} | ${m.gatedDays} |`);
  }
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ sums: out, vil: vrows }));
