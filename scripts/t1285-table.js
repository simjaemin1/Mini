#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1285 표 기계 · 판정 0 · 제품 무변)
// === scripts/t1285-table.js — 몸 세계 120날 밭 판(관찰기 `t1230-observe` · `t1276-observe`) → 10날 표 · 랩(T1276 계측)과 같은 칸 ===
//   쓰는 법: node scripts/t1285-table.js [--step 10] [--days 120] [--cpu <cpumon.txt>] [--json <출력>] <이름>=<판 밑이름>[@<태그>:<씨>] …
//     판 밑이름 = `<dir>/<tag>-<seed>` — 곁에 `.t1230.json` · `.t1276.json`(서버 판 자) 또는 `.t1230.json(.gz)` · `.json(.gz)`(랩 · T1276 계측)
//     `@<태그>:<씨>` 가 있으면 CPU 줄(`cpumon.txt` — 초 · 태그 · 씨 · 존 프로세스 누적 CPU 초 · 그때 로그의 마지막 econ 날)에서 하루 CPU 를 끊는다
//   칸(10날 칸마다): 끝 인구 · 출생 · 죽음 · 떠남 · 출생 0 마을-날의 까닭 몫(주거 · 곳간 · K · 행복 · 그 밖) · K 세 몫(끝 날 Σslot · Σprod · Σfuel · ΣK ·
//     K 를 정한 몫의 마을 수 slot/prod/fuel) · 곳간 일치(끝 날 Σ곳간 식량 환산 ÷ 인구) · 곳간 목재 · 나무꾼 · 농부(끝 날) · 거둔 칸(칸 합) · 하루 CPU 초(칸 평균)
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const STEP = +opt('--step', 10), DAYS = +opt('--days', 120), CPU = opt('--cpu', null), JOUT = opt('--json', null);
const skip = new Set(); for (const k of ['--step', '--days', '--cpu', '--json']) { const i = A.indexOf(k); if (i >= 0) { skip.add(i); skip.add(i + 1); } }
const rd = (f) => { for (const p of [f, f + '.gz']) if (fs.existsSync(p)) { const b = fs.readFileSync(p); return JSON.parse(p.endsWith('.gz') ? zlib.gunzipSync(b) : b); } return null; };
const cpuRows = CPU && fs.existsSync(CPU) ? fs.readFileSync(CPU, 'utf8').trim().split('\n').map((l) => l.split(' ')) : [];
function cpuAt(tag, seed, day) {   // 로그가 처음 `day` 를 적은 표본의 누적 CPU(없으면 null)
  for (const r of cpuRows) if (r[1] === tag && r[2] === String(seed) && +r[4] >= day) return +r[3];
  return null;
}
function one(name, spec) {
  const [base, ts] = spec.split('@');
  const t30 = rd(base + '.t1230.json');
  const t76 = rd(base + '.t1276.json') || rd(base + '.json');
  if (!t30) return { name, err: `관찰 파일 없음(${base})` };   // `.t1276` 이 없는 판(T1263 · T1244 — 관찰기 앞)은 K 칸이 빈다
  const c30 = {}; t30.cols.forEach((c, i) => { c30[c] = i; });
  const c76 = {}; if (t76) t76.cols.forEach((c, i) => { c76[c] = i; });
  const byDay30 = new Map(t30.rows.map((r) => [r[c30.day], r]));
  const byDay76 = new Map(t76 ? t76.rows.map((r) => [r[c76.day], r]) : []);
  const last30 = Math.max(...t30.rows.map((r) => r[c30.day])), last76 = t76 ? Math.max(...t76.rows.map((r) => r[c76.day])) : 0;
  const [tag, seed] = ts ? ts.split(':') : [null, null];
  const rows = [];
  for (let d0 = 0; d0 < DAYS; d0 += STEP) {
    const d1 = Math.min(DAYS, d0 + STEP);
    if (d0 > last30) break;
    let born = 0, dead = 0, emig = 0, harv = 0; const z = { zHouse: 0, zGran: 0, zK: 0, zH: 0, zOther: 0 };
    for (let d = d0 + 1; d <= d1; d++) { const r = byDay30.get(d); if (!r) continue; born += r[c30.born]; dead += r[c30.dead]; emig += r[c30.emig]; harv += r[c30.harvN] || 0; for (const k in z) z[k] += r[c30[k]] || 0; }
    const e = Math.min(d1, last30), r30 = byDay30.get(e) || {}, r76 = byDay76.get(Math.min(d1, last76)) || {};
    const zt = Object.values(z).reduce((a, b) => a + b, 0);
    const pct = (k) => zt ? Math.round(100 * z[k] / zt) : null;
    const pop = r30[c30.pop] || 0;
    let cpu = null;
    if (tag) { const a = cpuAt(tag, seed, d0 + 1), b = cpuAt(tag, seed, e); if (a != null && b != null && e > d0 + 1) cpu = +((b - a) / (e - d0 - 1)).toFixed(1); }
    rows.push({
      d0, d1: e, pop, born, dead, emig, zVD: zt, zHouse: pct('zHouse'), zGran: pct('zGran'), zK: pct('zK'), zH: pct('zH'), zOther: pct('zOther'),
      slot: Math.round(r76[c76.slot] || 0), prod: Math.round(r76[c76.prod] || 0), fuel: Math.round(r76[c76.fuel] || 0), K: Math.round(r76[c76.K] || 0),
      by: `${r76[c76.bySlot] || 0}/${r76[c76.byProd] || 0}/${r76[c76.byFuel] || 0}`, atK: r76[c76.atK] || 0,
      granDays: pop && t76 ? +((r76[c76.tfe] || 0) / pop).toFixed(1) : null, wood: Math.round(r30[c30.woodSt] || 0), lumber: r30[c30.lumber] || 0, farmer: r30[c30.farmer] || 0, harv, cpu,
    });
  }
  const tot = rows.reduce((a, r) => { a.born += r.born; a.dead += r.dead; a.emig += r.emig; a.zVD += r.zVD; a.zH += (r.zHouse || 0) * r.zVD / 100; return a; }, { born: 0, dead: 0, emig: 0, zVD: 0, zH: 0 });
  return { name, base, lastDay: last30, rows, sum: { pop: rows.length ? rows[rows.length - 1].pop : 0, born: tot.born, dead: tot.dead, emig: tot.emig, house: tot.zVD ? Math.round(100 * tot.zH / tot.zVD) : null } };
}
const out = [];
A.forEach((a, i) => { if (skip.has(i) || !a.includes('=')) return; const k = a.indexOf('='); out.push(one(a.slice(0, k), a.slice(k + 1))); });
for (const r of out) {
  if (r.err) { console.log(`\n## ${r.name} — ${r.err}`); continue; }
  console.log(`\n## ${r.name}  (${r.rows.length ? r.rows[r.rows.length - 1].d1 : 0}날까지 · 끝 인구 ${r.sum.pop} · 출생 ${r.sum.born} · 죽음 ${r.sum.dead} · 떠남 ${r.sum.emig} · 출생 0 마을-날 주거 문 ${r.sum.house}%)`);
  console.log('| 날 | 인구 | 출생 | 죽음 | 떠남 | 출생 0 마을-날 | 주거 · 곳간 · K · 행복 · 그 밖 % | Σslot · Σprod · Σfuel · ΣK | K 정한 몫 slot/prod/fuel | 인구 ≥ 0.95K | 곳간 일치 | 곳간 목재 | 나무꾼 | 농부 | 거둔 칸 | 하루 CPU 초 |');
  console.log('|---|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const x of r.rows) console.log(`| ${x.d0}~${x.d1} | ${x.pop} | ${x.born} | ${x.dead} | ${x.emig} | ${x.zVD} | ${x.zHouse} · ${x.zGran} · ${x.zK} · ${x.zH} · ${x.zOther} | ${x.K ? `${x.slot} · ${x.prod} · ${x.fuel} · ${x.K}` : '—'} | ${x.K ? x.by : '—'} | ${x.K ? x.atK : '—'} | ${x.granDays == null ? '—' : x.granDays} | ${x.wood} | ${x.lumber} | ${x.farmer} | ${x.harv} | ${x.cpu == null ? '—' : x.cpu} |`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
