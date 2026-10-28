#!/usr/bin/env node
// === scripts/t970-own-table.js — 1시간 판(`t926-mem-hour.js --own`) 표본을 붙든 이름별 넓이 표로(T970 ①) — 계측 자 · 러너 밖 ===================
//
//   `<dir>/<tag>-samples.jsonl`(바퀴 끝 표본 열세 줄) 을 읽어
//     ① 바퀴마다 — 살아 있는 캔버스(갈고리 WeakRef · 강제 GC · memory-infra 덤프 뒤) 수 · 넓이 · 붙든 이름 몫 · memory-infra 렌더러 canvas MB ·
//        4바이트 × 넓이(MB) · 렌더러 RSS · 프레임 p50 · p95 · 최대
//     ② 붙든 이름마다 — 5분 · 60분 넓이 · 가장 큰 넓이(어느 분) · 5 → 60분 늘어난 넓이(차례 = 늘어난 넓이 · 같으면 60분 넓이)
//   를 적는다. 판정 0 — 세기만 한다. --json 이면 같은 값을 JSON 으로(계측/ 묶음에 넣는 꼴).
// 실행: node scripts/t970-own-table.js <dir> <tag> [<tag> …] [--json out.json]
'use strict';
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const JOUT = (() => { const i = argv.indexOf('--json'); return i >= 0 ? argv[i + 1] : null; })();
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--json'));
const [DIR, ...TAGS] = pos;
if (!DIR || !TAGS.length) { console.log('쓰임: node scripts/t970-own-table.js <dir> <tag> [<tag> …] [--json out.json]'); process.exit(1); }
const M6 = (v) => (v == null ? '-' : (v / 1e6).toFixed(2));
const MB = (px) => +(px * 4 / 1048576).toFixed(1);
const out = {};
for (const tag of TAGS) {
  const f = path.join(DIR, `${tag}-samples.jsonl`);
  const rows = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const meta = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, `${tag}-meta.json`), 'utf8')); } catch (e) { return null; } })();
  const rendOf = (r) => { const P = (r.mdump && r.mdump.procs) || {}; const k = Object.keys(P).find((x) => /Renderer/.test(x)); return k ? P[k] : null; };
  const gpuOf = (r) => { const P = (r.mdump && r.mdump.procs) || {}; const k = Object.keys(P).find((x) => /GPU/.test(x)); return k ? P[k] : null; };
  const rssR = (r) => (r.rss ? +(((r.rss['cr.renderer'] || r.rss['wk.web'] || 0)) / 1024).toFixed(1) : null);
  const S = rows.map((r) => {
    const o = r.own || {}, R = rendOf(r) || {}, G = gpuOf(r) || {};
    const by = {}; for (const b of (o.by || [])) by[b[0]] = [b[1], b[2]];
    return { k: r.k, atMin: r.atMin, zone: r.zone, frame: r.frame, live: o.live, px: o.px, held: o.held, unheld: o.unheld, by, unk: o.unk || [],
      cvMB: R.canvas == null ? null : R.canvas, px4MB: o.px == null ? null : MB(o.px), rendRssMB: rssR(r),
      rend: { malloc: R.malloc, partition_alloc: R.partition_alloc, v8: R.v8, blink_gc: R.blink_gc, cc: R.cc, discardable: R.discardable, gpu: R.gpu, shared_memory: R.shared_memory },
      gpuProc: { malloc: G.malloc, gpu: G.gpu, shared_memory: G.shared_memory },
      cdp: r.cdp ? { usedGC: +(r.cdp.usedGC / 1048576).toFixed(1), nodes: r.cdp.nodes, listeners: r.cdp.listeners } : null,
      made: r.cv ? r.cv.made : null, site: r.cv ? r.cv.site : null, cache: r.cache, arr: r.arr, knob: r.knob, own: r.own ? { visits: o.visits, ms: o.ms, missN: o.missN, budgetLeft: o.budgetLeft } : null };
  });
  console.log(`\n=== ${tag} — ${meta ? `${meta.browser} · ${meta.min}분 · 손잡이 ${(meta.knobs || []).join(' ') || '(기본)'} · 오류 ${(meta.errs || []).length}` : '(meta 없음)'} ===`);
  console.log('분 | 존 | 프레임 수 · p50 · p95 · 최대 | 산 캔버스 · 넓이(M화소) | 이름 몫 · 이름 없음 | memory-infra canvas MB · 4B×넓이 MB | 렌더러 RSS MB');
  for (const s of S) console.log(`${s.atMin} | ${s.zone} | ${s.frame.n} · ${s.frame.p50} · ${s.frame.p95} · ${s.frame.max} | ${s.live} · ${M6(s.px)} | ${s.held ? M6(s.held[1]) : '-'} · ${s.unheld ? M6(s.unheld[1]) : '-'} | ${s.cvMB} · ${s.px4MB} | ${s.rendRssMB}`);
  // 붙든 이름마다 — 5분(k=1) · 60분(마지막) · 최대
  const names = new Set(); for (const s of S) for (const n of Object.keys(s.by)) names.add(n);
  const k1 = S.find((s) => s.k === 1) || S[0], kL = S[S.length - 1];
  const tab = [...names].map((n) => {
    let mx = 0, mxAt = null; for (const s of S) { const v = (s.by[n] || [0, 0])[1]; if (v > mx) { mx = v; mxAt = s.atMin; } }
    const a = (k1.by[n] || [0, 0]), b = (kL.by[n] || [0, 0]);
    return { name: n, n5: a[0], px5: a[1], n60: b[0], px60: b[1], max: mx, maxAt: mxAt, d: b[1] - a[1] };
  }).sort((x, y) => (y.d - x.d) || (y.px60 - x.px60));
  console.log(`\n붙든 이름 | ${k1.atMin}분 장 · M화소 | ${kL.atMin}분 장 · M화소 | 가장 큰 넓이(분) | 늘어난 M화소`);
  for (const t of tab) console.log(`${t.name} | ${t.n5} · ${M6(t.px5)} | ${t.n60} · ${M6(t.px60)} | ${M6(t.max)}(${t.maxAt}) | ${(t.d >= 0 ? '+' : '') + M6(t.d)}`);
  const unkAll = {}; for (const s of S) for (const u of s.unk) { const e = unkAll[u[0]] = unkAll[u[0]] || { maxN: 0, maxPx: 0 }; if (u[2] > e.maxPx) { e.maxPx = u[2]; e.maxN = u[1]; } }
  if (Object.keys(unkAll).length) console.log('이름 없음(만든 곳 · 가장 큰 넓이): ' + Object.entries(unkAll).map(([k, v]) => `${k} ${v.maxN}장 ${M6(v.maxPx)}`).join(' · '));
  out[tag] = { browser: meta && meta.browser, min: meta && meta.min, knobs: meta && meta.knobs, welcome: meta && meta.welcome, errs: meta && meta.errs, samples: S, byName: tab };
}
// 판 견줌(태그 둘 넘게) — 바퀴마다 나란히: 렌더러 RSS · memory-infra canvas · 산 넓이 · 가르기 붙듦 넓이 · 프레임 수 · p95
if (TAGS.length > 1) {
  console.log(`\n=== 바퀴마다 나란히(${TAGS.join(' · ')}) — 렌더러 RSS MB / canvas MB / 산 넓이 M화소 / 가르기 붙듦 M화소 / 프레임 수 · p95 ===`);
  const n = Math.max(...TAGS.map((t) => out[t].samples.length));
  for (let i = 0; i < n; i++) {
    const cells = TAGS.map((t) => { const s = out[t].samples[i]; if (!s) return '-'; const h = (s.by._mtCutHold || [0, 0])[1];
      return `${s.rendRssMB} / ${s.cvMB} / ${M6(s.px)} / ${M6(h)} / ${s.frame.n} · ${s.frame.p95}`; });
    console.log(`${(out[TAGS[0]].samples[i] || {}).atMin}분 | ${cells.join(' | ')}`);
  }
  const d5 = (t, f) => { const S = out[t].samples, a = S.find((s) => s.k === 1), b = S[S.length - 1]; return a && b ? f(b) - f(a) : null; };
  console.log('5 → 60분 늘어난 값 | ' + TAGS.map((t) => `${t}: RSS ${(d5(t, (s) => s.rendRssMB) || 0).toFixed(1)} · canvas ${(d5(t, (s) => s.cvMB) || 0).toFixed(1)}MB · 넓이 ${M6(d5(t, (s) => s.px))}M화소`).join(' | '));
  const fsum = (t) => { const S = out[t].samples.filter((s) => s.k >= 1); return { n: S.reduce((a, s) => a + s.frame.n, 0), p95: S.map((s) => s.frame.p95).sort((a, b) => a - b)[Math.floor(S.length / 2)] }; };
  console.log('프레임 열두 바퀴 합 · p95 가운데 | ' + TAGS.map((t) => { const f = fsum(t); return `${t}: ${f.n}판 · ${f.p95}`; }).join(' | '));
}
if (JOUT) { fs.writeFileSync(JOUT, JSON.stringify(out, null, 1)); console.log(`\n→ ${JOUT}`); }
