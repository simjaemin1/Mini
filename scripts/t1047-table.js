#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1047 표 기계 · 판 JSON 만 읽는다 · 산수 = 합 · 비 · 나눗셈뿐)
// === scripts/t1047-table.js — ① 랩 자 켬(지형 거리) ↔ 끔(직선) 3시드 값 · ② 집 한 칸 값 · 짓는 횟수(서버 ↔ 랩) ===
//   node scripts/t1047-table.js [--t17 <뿌리>] [--t176 <뿌리>] [--house srv=<run 디렉터리>,lab=<뿌리>:<접두>] [--json <파일>]
//     --t17  : <뿌리>/n-<시드>.json(켬) · f-<시드>.json(끔) — `T17_JSON` 판(t17-metrics) 기본 팔(사냥 대조 없는 판)
//     --t176 : <뿌리>/n-<시드>.json · f-<시드>.json — `T17_JSON` 판(t176-ab)
//     --house: 서버 `<run>/base-<시드>.t1047.json` · 랩 `<뿌리>/<접두>-<시드>.t1047.json`(관찰기 `t1047-house.js`)
'use strict';
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const SEEDS = [1020, 7, 42];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const out = {};
const n0 = (x) => (Number.isInteger(x) ? x.toLocaleString('en-US') : (+x).toFixed(Math.abs(x) >= 100 ? 1 : 3));
// ① 랩 자 값 — 숫자 칸(base · board · tool.q · eight 의 grain/dens/events)을 시드마다 · 3시드 합
function flat(o) {
  const r = {};
  const put = (k, v) => { if (typeof v === 'number' && isFinite(v)) r[k] = v; };
  for (const [k, v] of Object.entries(o.base || {})) put(k, v);
  for (const [k, v] of Object.entries(o.board || {})) put('board.' + k, v);
  if (o.tool) { put('tool.q', o.tool.q); put('tool.stock', o.tool.stock); }
  for (const [k, v] of Object.entries(o.eight || {})) put('eight.' + k, v);
  if (o.preserve) put('preserve.stock', o.preserve.stock);
  return r;
}
for (const [flag, name] of [['--t17', 't17'], ['--t176', 't176']]) {
  const root = get(flag); if (!root) continue;
  const rows = {};
  for (const s of SEEDS) for (const arm of ['n', 'f']) { const o = J(path.join(root, `${arm}-${s}.json`)); if (!o) continue; for (const [k, v] of Object.entries(flat(o))) { const r = rows[k] || (rows[k] = { n: {}, f: {} }); r[arm][s] = v; } }
  out[name] = rows;
  console.log(`\n### ${name} — 켬(지형 거리 · 기본) ↔ 끔(\`T1047_LAB_DIST=0\` · 직선 = main 바이트)\n`);
  console.log(`| 칸 |${SEEDS.map((s) => ` ${s} 끔 → 켬 |`).join('')} 3시드 합 끔 → 켬 | 켬 ÷ 끔 |`);
  console.log(`|---|${SEEDS.map(() => '---|').join('')}---|---:|`);
  for (const [k, r] of Object.entries(rows)) {
    const sf = SEEDS.reduce((a, s) => a + (r.f[s] || 0), 0), sn = SEEDS.reduce((a, s) => a + (r.n[s] || 0), 0);
    const avg = /dens|daysPer/.test(k);   // 비율 칸은 합이 아니라 가운데(평균)
    const F = avg ? sf / 3 : sf, N = avg ? sn / 3 : sn;
    console.log(`| ${k} |${SEEDS.map((s) => ` ${r.f[s] == null ? '—' : n0(r.f[s])} → ${r.n[s] == null ? '—' : n0(r.n[s])} |`).join('')} ${n0(F)} → ${n0(N)}${avg ? '(평균)' : ''} | ${F ? (N / F).toFixed(3) : '—'} |`);
  }
}
// ② 집 한 칸 — 첫해(날 < 365) 3시드 합
const H = get('--house');
if (H) {
  const parts = Object.fromEntries(H.split(',').map((x) => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));
  const arms = [];
  if (parts.srv) arms.push(['서버', SEEDS.map((s) => path.join(parts.srv, `base-${s}.t1047.json`))]);
  for (const key of Object.keys(parts).filter((k) => k !== 'srv')) { const [root, pre] = parts[key].split(':'); arms.push([key, SEEDS.map((s) => path.join(root, `${pre}-${s}.t1047.json`))]); }
  const sum = (files) => {
    const r = { n: 0, refill: 0, grow: 0, builtLive: 0, builtLab: 0, woodPaid: 0, stonePaid: 0, crewWood: 0, crewStone: 0, huts: 0, woodTick: 0, woodOut: 0, wood364: 0, housing364: 0, beds364: 0, pop364: 0, price: null, err: [] };
    for (const f of files) {
      const o = J(f); if (!o) continue; r.n++; r.price = o.price; if (o.err) r.err.push(o.err);
      const b = o.y1;
      for (const k of ['refill', 'grow', 'builtLive', 'builtLab', 'woodPaid', 'stonePaid', 'huts', 'woodTick', 'woodOut']) r[k] += b[k] || 0;
      r.crewWood += (b.crew && b.crew.wood) || 0; r.crewStone += (b.crew && b.crew.stone) || 0;
      const sn = o.snap && o.snap['364']; if (sn) { r.wood364 += sn.wood; r.housing364 += sn.housing; r.beds364 += sn.beds; r.pop364 += sn.pop; }
    }
    return r;
  };
  const res = arms.map(([nm, files]) => [nm, sum(files)]);
  out.house = Object.fromEntries(res);
  const row = (lab, f) => console.log(`| ${lab} |${res.map(([, r]) => ` ${f(r)} |`).join('')}`);
  console.log(`\n### 집 한 칸 — 첫해(날 < 365) 3시드 합\n`);
  console.log(`| 칸 |${res.map(([nm, r]) => ` ${nm}(${r.n}/3) |`).join('')}`);
  console.log(`|---|${res.map(() => '---:|').join('')}`);
  row('econ 단가 — 수용력 1인당 목재 · 돌(`houseCostPerCap`)', (r) => r.price ? `${(+r.price.wood).toFixed(4)} · ${(+r.price.stone).toFixed(4)}` : '—');
  row('econ 주거 지은 양(노후 메움 + 늘림)', (r) => n0(+(r.refill + r.grow).toFixed(1)));
  row('　노후 메움', (r) => n0(+r.refill.toFixed(1)));
  row('　늘림', (r) => n0(+r.grow.toFixed(1)));
  row('　그중 집 행위 마을(econ 목재 안 뺌)', (r) => n0(+r.builtLive.toFixed(1)));
  row('econ 이 뺀 집 목재(지은 양 × 단가 · 집 행위 아닌 마을)', (r) => n0(+r.woodPaid.toFixed(1)));
  row('크루가 곳간에서 꺼낸 목재 · 돌(`actFromGranary`)', (r) => `${n0(+r.crewWood.toFixed(1))} · ${n0(+r.crewStone.toFixed(1))}`);
  row('완공 움집(지은 침상 늘어난 몫 ÷ 칸당 침상)', (r) => n0(+r.huts.toFixed(1)));
  row('집에 든 목재 합(econ 뺀 몫 + 크루 몫)', (r) => n0(+(r.woodPaid + r.crewWood).toFixed(1)));
  row('　지은 수용력 1인분당(목재 ÷ 지은 양)', (r) => { const b = r.refill + r.grow; return b ? ((r.woodPaid + r.crewWood) / b).toFixed(4) : '—'; });
  row('곳간 목재 틱 안 순변화(생산 − 땔감 − 집(econ) − 숯 …)', (r) => n0(+r.woodTick.toFixed(1)));
  row('곳간 목재 틱 밖 순변화(− 크루 + 행위 입고 + 교역 …)', (r) => n0(+r.woodOut.toFixed(1)));
  row('날 364 곳간 목재', (r) => n0(+r.wood364.toFixed(1)));
  row('날 364 주거 · 지은 침상 · 인구', (r) => `${n0(+r.housing364.toFixed(0))} · ${n0(r.beds364)} · ${n0(r.pop364)}`);
  for (const [nm, r] of res) if (r.err.length) console.log(`  ⚠${nm} 관찰기 오류: ${r.err.join(' / ')}`);
}
// ② 값(표 · 한 줄씩) — econ 단가 ↔ 크루 한 채. 크루는 집터가 `stage: 1`(①굴착을 마친 자리 · villages `_site`)로 서서 단계 1 부터 `hutEconStage(i)` 를 꺼낸다.
if (H) {
  const E = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
  const n = E.hutStageCount(), cap = E.hutCapPerHut(), st = [];
  for (let i = 0; i < n; i++) st.push(E.hutEconStage(i) || {});
  const crewHut = {}; for (let i = 1; i < n; i++) for (const [k, v] of Object.entries(st[i])) crewHut[k] = (crewHut[k] || 0) + v;
  const econHut = { wood: E.houseCostPerCap('wood') * cap, stone: E.houseCostPerCap('stone') * cap };
  out.price = { stages: st, cap, crewHut, econHut, econPerCap: { wood: E.houseCostPerCap('wood'), stone: E.houseCostPerCap('stone') } };
  console.log(`\n### 집 한 채 값 — econ 단가 ↔ 크루\n`);
  console.log(`| 줄 | 목재 | 돌 |\n|---|---:|---:|`);
  st.forEach((x, i) => console.log(`| 단계 ${i} \`hutEconStage(${i})\`${i === 0 ? '(크루는 안 꺼냄 — 집터가 단계 1 로 선다)' : ''} | ${x.wood || 0} | ${x.stone || 0} |`));
  console.log(`| 크루 한 채(단계 1 ~ ${n - 1}) | ${crewHut.wood || 0} | ${crewHut.stone || 0} |`);
  console.log(`| econ 한 채(\`houseCostPerCap\` × 정원 ${cap}) | ${(+econHut.wood).toFixed(4)} | ${(+econHut.stone).toFixed(4)} |`);
  console.log(`| 수용력 1인분 — 크루 ÷ 정원 · econ 단가 | ${((crewHut.wood || 0) / cap).toFixed(4)} · ${E.houseCostPerCap('wood').toFixed(4)} | ${((crewHut.stone || 0) / cap).toFixed(4)} · ${E.houseCostPerCap('stone').toFixed(4)} |`);
}
const JO = get('--json'); if (JO) fs.writeFileSync(JO, JSON.stringify(out));
