#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T888 표 기계 · 세계 안 만짐 · 판 JSON 만 읽는다)
// === scripts/t888-body-table.js — 몸 하루 일 표(T491 표 꼴): 팔(n1 켬 · n0 끔)마다 나무꾼 · 채집꾼 몸·날 셈 + 존 행위 누계 + 틱 ===
//   node scripts/t888-body-table.js <T449_TMP 폴더> [--json <파일>]
//     읽는 것: `<폴더>/body-day.json`(t449-body-day — 팔마다 잰 날 · 조각 표본 `/perf`) · `<폴더>/<팔>.body.json`(t491-probe — 몸 × 게임일 누계)
//   셈(판정 0 · 산수뿐):
//     잰 날 = t449-body-day 가 영점으로 적은 날(첫 경계 뒤 그날 · 관측자를 세운 날) — 그날 하루를 통째로 본 몸·날만 센다(부팅 · 첫 경계 앞 반쪽 날은 뺀다).
//     몸·날 = 그날 그 직업이었던 표본이 하루 표본의 절반 이상인 몸(직업은 econ 분포를 따라 바뀐다 — T491 §5 와 같은 잣대).
//     나무꾼: 벤 그루(`cutN`) · 곳간에 든 단(해 질 녘 손 `dusk` — T491 의 "곳간에 든 단") · 걸음 m(`walk` ÷ 32) · 곳간행(`gran`) · 요양 표본 몫.
//     채집꾼: 딴 번(`pickN`) · 딴 개체(`pickU`) · 걸음 m · 곳간행.
//     존 행위 누계(`/perf` farm · fish · wood · forage — 조각마다 읽은 누계의 그날 증가분): 밭 왕복(`farm.trips`) · 입고(`delivered`).
//     틱: 조각마다 `/perf` p50 · p95(그날 조각들의 중앙) · 걸음 수 · 벽/지형 질의(걸음당).
'use strict';
const fs = require('fs');
const path = require('path');
const A = process.argv.slice(2);
const DIR = A[0];
const JOUT = A.includes('--json') ? A[A.indexOf('--json') + 1] : null;
if (!DIR) { console.error('쓰는 법: node scripts/t888-body-table.js <폴더> [--json <파일>]'); process.exit(2); }
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const sum = (a) => a.reduce((x, y) => x + (Number.isFinite(y) ? y : 0), 0);
const r1 = (x) => (x == null ? '—' : (Math.round(x * 10) / 10).toLocaleString('en-US'));
const BD = rd(path.join(DIR, 'body-day.json'));
if (!BD) { console.error('body-day.json 없음'); process.exit(2); }
const out = { dir: DIR, obs: BD.obs, arms: {} };
for (const tag of Object.keys(BD.arms)) {
  const arm = BD.arms[tag];
  const zero = (arm.days || []).find((x) => x.zero) || null;
  const day = zero ? zero.day : null;
  const P = rd(path.join(DIR, `${tag}.body.json`));
  const res = { env: arm.env, day, lj: { bodyDays: 0, trees: [], dusk: [], walkM: [], gran: [], rest: 0 }, fg: { bodyDays: 0, pickN: [], pickU: [], walkM: [], gran: [] },
    vil: {}, zone: null, tick: null, lab: {}, labN: 0 };
  if (P && P.bodies && day != null) {
    for (const k of Object.keys(P.bodies)) {
      const b = P.bodies[k], a = b.days && b.days[day];
      if (!a || !a.n) continue;
      //   몸 시간 — 라벨(`_lifeAct`)별 1초 표본 합(나무꾼 · 채집꾼 몸 전부 · 그날) — 걸음이 빨라지면 걷는 라벨(출근 · 귀가 · 운반)의 초가 준다
      res.labN += a.n; for (const [l, c] of Object.entries(a.lab || {})) res.lab[l] = (res.lab[l] || 0) + c;
      const jobs = a.jobs || {}, lj = jobs.lumberjack || 0, fg = jobs.forager || 0;
      if (lj * 2 >= a.n) {
        const R = res.lj; R.bodyDays++; R.trees.push(a.cutN || 0); R.dusk.push(a.dusk || 0); R.walkM.push((a.walk || 0) / 32); R.gran.push(a.gran || 0); if ((a.rest || 0) * 2 >= a.n) R.rest++;
        const V = res.vil[b.vil] || (res.vil[b.vil] = { lj: 0, trees: 0, dusk: 0, walkM: 0, gran: 0, fg: 0, pickU: 0 });
        V.lj++; V.trees += a.cutN || 0; V.dusk += a.dusk || 0; V.walkM += (a.walk || 0) / 32; V.gran += a.gran || 0;
      } else if (fg * 2 >= a.n) {
        const R = res.fg; R.bodyDays++; R.pickN.push(a.pickN || 0); R.pickU.push(a.pickU || 0); R.walkM.push((a.walk || 0) / 32); R.gran.push(a.gran || 0);
        const V = res.vil[b.vil] || (res.vil[b.vil] = { lj: 0, trees: 0, dusk: 0, walkM: 0, gran: 0, fg: 0, pickU: 0 });
        V.fg++; V.pickU += a.pickU || 0;
      }
    }
  }
  //   존 행위 누계 · 틱 — 잰 날의 조각들(`samples` 의 `day === 잰 날`) · 누계는 그날 첫 조각 → 마지막 조각의 증가분
  const S = (arm.samples || []).filter((s) => s.day === day && s.perf);
  if (S.length) {
    const f = S[0].perf, l = S[S.length - 1].perf;
    const dv = (sec, k) => (l[sec] && f[sec] && Number.isFinite(l[sec][k]) && Number.isFinite(f[sec][k])) ? l[sec][k] - f[sec][k] : null;
    res.zone = { slices: S.length, farmTrips: dv('farm', 'trips'), farmDelivered: dv('farm', 'delivered'), fishDelivered: dv('fish', 'delivered'),
      woodDelivered: dv('wood', 'delivered'), forageDelivered: dv('forage', 'delivered') };
    const steps = sum(S.map((s) => s.perf.walk && s.perf.walk.steps)), wq = sum(S.map((s) => s.perf.walk && s.perf.walk.wallQ)), tq = sum(S.map((s) => s.perf.walk && s.perf.walk.terrQ));
    res.tick = { p50: med(S.map((s) => s.perf.p50)), p95: med(S.map((s) => s.perf.p95)), lagPct: med(S.map((s) => s.perf.lagPct)),
      stepsPerSlice: Math.round(steps / S.length), wallPerStep: steps ? +(wq / steps).toFixed(2) : null, terrPerStep: steps ? +(tq / steps).toFixed(2) : null };
  }
  out.arms[tag] = res;
}
// ── 표 ─────────────────────────────────────────────────────────────────────────
const tags = Object.keys(out.arms);
console.log(`\n관측 마을 ${out.obs && out.obs.name} · 잰 날(팔마다) ${tags.map((t) => `${t} ${out.arms[t].day}`).join(' · ')}`);
console.log('\n| 팔 | 나무꾼 몸·날 | 그루/몸·날 중앙 (합) | 곳간에 든 단/몸·날 중앙 (합) | 걸음 m/몸·날 중앙 | 곳간행/몸·날 중앙 (합) | 요양 몸·날 | 채집꾼 몸·날 | 딴 개체/몸·날 중앙 (합) | 채집 걸음 m 중앙 |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const t of tags) { const r = out.arms[t], L = r.lj, F = r.fg;
  console.log(`| ${t} | ${L.bodyDays} | ${r1(med(L.trees))} (${sum(L.trees)}) | ${r1(med(L.dusk))} (${r1(sum(L.dusk))}) | ${r1(med(L.walkM))} | ${r1(med(L.gran))} (${sum(L.gran)}) | ${L.rest} | ${F.bodyDays} | ${r1(med(F.pickU))} (${r1(sum(F.pickU))}) | ${r1(med(F.walkM))} |`); }
console.log('\n| 팔 | 조각 | 밭 왕복(그날) | 밭 입고 | 어부 입고 | 나무 입고 | 채집 입고 | 틱 p50 · p95 ms | 빚 % | 걸음/조각 | 벽 · 지형 질의/걸음 |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const t of tags) { const r = out.arms[t], z = r.zone || {}, k = r.tick || {};
  console.log(`| ${t} | ${z.slices || 0} | ${r1(z.farmTrips)} | ${r1(z.farmDelivered)} | ${r1(z.fishDelivered)} | ${r1(z.woodDelivered)} | ${r1(z.forageDelivered)} | ${r1(k.p50)} · ${r1(k.p95)} | ${r1(k.lagPct)} | ${k.stepsPerSlice || '—'} | ${k.wallPerStep ?? '—'} · ${k.terrPerStep ?? '—'} |`); }
//   몸 시간 — 라벨별 몸·초(나무꾼 · 채집꾼 · 그날 · 1초 표본) · 팔 사이 비(첫 팔 ÷ 둘째 팔)
{
  const labs = [...new Set(tags.flatMap((t) => Object.keys(out.arms[t].lab)))].sort((a, b) => (out.arms[tags[0]].lab[b] || 0) - (out.arms[tags[0]].lab[a] || 0));
  console.log(`\n| 라벨(몸·초 — 1초 표본 합) | ${tags.join(' | ')}${tags.length === 2 ? ` | ${tags[0]} ÷ ${tags[1]}` : ''} |`);
  console.log(`|---|${tags.map(() => '---:').join('|')}${tags.length === 2 ? '|---:' : ''}|`);
  for (const l of labs) {
    const v = tags.map((t) => out.arms[t].lab[l] || 0);
    console.log(`| ${l} | ${v.map((x) => x.toLocaleString('en-US')).join(' | ')}${tags.length === 2 ? ` | ${v[1] ? (v[0] / v[1]).toFixed(2) : '—'}` : ''} |`);
  }
  console.log(`| (표본 합) | ${tags.map((t) => out.arms[t].labN.toLocaleString('en-US')).join(' | ')}${tags.length === 2 ? ' | ' : ''} |`);
}
//   마을별(나무꾼 몸이 있는 마을 · 두 팔 다)
const vs = [...new Set(tags.flatMap((t) => Object.keys(out.arms[t].vil)))].filter((v) => tags.every((t) => out.arms[t].vil[v] && out.arms[t].vil[v].lj > 0)).sort();
if (vs.length) {
  console.log(`\n| 마을 | ${tags.map((t) => `${t} 나무꾼 · 그루 · 단 · 걸음 m · 곳간행`).join(' | ')} |`);
  console.log(`|---|${tags.map(() => '---').join('|')}|`);
  for (const v of vs) console.log(`| ${v} | ${tags.map((t) => { const x = out.arms[t].vil[v]; return `${x.lj} · ${x.trees} · ${r1(x.dusk)} · ${r1(x.walkM)} · ${x.gran}`; }).join(' | ')} |`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
