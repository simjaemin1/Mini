#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1500 표 · 판 폴더만 읽는다 · 판정 0)
// === 계측/T1500_2026-11-27/t1500-table.js — 끔 ↔ 켬 판의 힙 곡선 · 하루 초 · 그릇 셈 · 넘치는 날 어림 ===
//   R=<판 출력 폴더(/home/user/t1500-out)> node t1500-table.js [--json <출력>]
//   읽는 것: <판>/obs/day-1020.jsonl(날마다 RSS · 힙 · 하루 초 · 10날마다 산 힙 · 큰 GC 꼭대기) · census-1020.jsonl(50날마다 그릇 셈) · progress.json · runner.out
//   넘치는 날 어림: 하루 꼭대기(그날 큰 GC 뒤 힙의 최대 · 없으면 산 힙)의 마지막 300날 기울기로 기본 힙 한도(판의 heap 한도 · 2,096 MB)에 닿는 날
const fs = require('fs'), path = require('path');
const R = process.env.R || '/home/user/t1500-out';
const a = process.argv.slice(2); const JOUT = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
const LIMIT = 2096;
const rd = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
const runs = ['heap-off1300', 'heap-on1300', 'fp-off700', 'fp-on700', 'snapA', 'snapC'].filter((d) => fs.existsSync(path.join(R, d)));
const out = {};
for (const d of runs) {
  const rows = rd(path.join(R, d, 'obs', 'day-1020.jsonl')).filter((r) => r.day != null);
  const cen = rd(path.join(R, d, 'obs', 'census-1020.jsonl'));
  let prog = null; try { prog = JSON.parse(fs.readFileSync(path.join(R, d, 'progress.json'), 'utf8')); } catch (e) {}
  let ro = ''; try { ro = fs.readFileSync(path.join(R, d, 'runner.out'), 'utf8'); } catch (e) {}
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const last = rows.length ? rows[rows.length - 1].day : 0;
  const seg = (lo, hi) => { const s = rows.filter((r) => r.day > lo && r.day <= hi && Number.isFinite(r.sec)); return s.length ? +(s.reduce((x, r) => x + r.sec, 0) / s.length).toFixed(2) : null; };
  const live = rows.filter((r) => r.liveMB != null);
  // 하루 꼭대기 — 그날 큰 GC 뒤 힙 최대(majMaxMB · 큰 GC 없던 날은 산 힙)
  const peak = rows.map((r) => ({ day: r.day, v: Math.max(r.majMaxMB || 0, r.liveMB || 0) })).filter((r) => r.v > 0);
  const fit = (pts) => { if (pts.length < 5) return null; const n = pts.length, mx = pts.reduce((s, p) => s + p.day, 0) / n, my = pts.reduce((s, p) => s + p.v, 0) / n;
    let sxy = 0, sxx = 0; for (const p of pts) { sxy += (p.day - mx) * (p.v - my); sxx += (p.day - mx) ** 2; } const b = sxy / sxx; return { b, a: my - b * mx }; };
  const w = (lo) => live.filter((r) => r.day > lo).map((r) => ({ day: r.day, v: r.liveMB }));
  const L = fit(w(Math.max(0, last - 300))), P = fit(peak.filter((p) => p.day > Math.max(0, last - 300)));
  const maxPeak = peak.reduce((m, p) => (p.v > m.v ? p : m), { day: 0, v: 0 });
  const oomBy = (f, base) => (f && f.b > 0 ? Math.round((LIMIT - base) / f.b + last) : null);
  const lastLive = live.length ? live[live.length - 1].liveMB : null;
  out[d] = {
    last, done: !!(prog && prog.done), died: /✗/.test(ro) ? ro.split('\n').filter((l) => /✗/.test(l)).pop().trim().slice(0, 160) : null,
    at: Object.fromEntries([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300].filter((x) => byDay.has(x)).map((x) => { const r = byDay.get(x); return [x, { rss: r.rssMB, heap: r.heapMB, live: r.liveMB != null ? r.liveMB : null }]; })),
    secPerDay: Object.fromEntries([[0, 100], [100, 300], [300, 500], [500, 700], [700, 900], [900, 1100], [1100, 1300]].filter(([lo]) => last > lo).map(([lo, hi]) => [`${lo}-${hi}`, seg(lo, hi)])),
    sec700: seg(0, 700), liveSlope300: L ? +L.b.toFixed(3) : null, peakSlope300: P ? +P.b.toFixed(3) : null, maxPeak, lastLive,
    oomLive: L && lastLive != null ? oomBy(L, lastLive) : null,
    census: cen,
  };
}
const f = (x) => (x == null ? '—' : typeof x === 'number' ? x.toLocaleString('en-US') : x);
console.log('## 판별 100날 칸 — RSS · 쓴 힙 · 산 힙(MB)');
console.log('| 날 | ' + runs.join(' | ') + ' |'); console.log('|---|' + runs.map(() => '---').join('|') + '|');
for (const x of [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300]) {
  if (!runs.some((d) => out[d].at[x])) continue;
  console.log(`| ${f(x)} | ` + runs.map((d) => { const c = out[d].at[x]; return c ? `${f(c.rss)} · ${f(c.heap)} · ${f(c.live)}` : '—'; }).join(' | ') + ' |');
}
console.log('\n## 판별 요약');
console.log('| 판 | 마친 날 | 끝 | 하루 초(0-700) | 산 힙 기울기(마지막 300날 · MB/날) | 하루 꼭대기 기울기 | 가장 높은 꼭대기 | 산 힙 기울기로 넘치는 날(어림) |');
console.log('|---|---|---|---|---|---|---|---|');
for (const d of runs) { const o = out[d]; console.log(`| ${d} | ${f(o.last)} | ${o.done ? '끝' : o.died ? '죽음' : '도는 중'} | ${f(o.sec700)} | ${f(o.liveSlope300)} | ${f(o.peakSlope300)} | ${f(o.maxPeak.v)}(${f(o.maxPeak.day)}날) | ${f(o.oomLive)} |`); }
console.log('\n## 하루 초(구간 평균)');
for (const d of runs) console.log(`- ${d}: ` + Object.entries(out[d].secPerDay).map(([k, v]) => `${k} ${f(v)}`).join(' · '));
console.log('\n## 그릇 셈(50날마다 · 마지막 줄)');
for (const d of runs) { const c = out[d].census; if (!c.length) continue; const l = c[c.length - 1]; console.log(`- ${d} ${l.day}날: ` + JSON.stringify(l)); }
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
