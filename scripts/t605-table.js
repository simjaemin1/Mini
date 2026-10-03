#!/usr/bin/env node
// === scripts/t605-table.js — T605 ③ 하루 틱 주인 표(t605-boot `--days` 판의 <out>/<zone>.json 을 읽는다 · 러너 밖) ===============
// 실행: node scripts/t605-table.js /tmp/t605/tick30 [hanbando,nippon] [--clock-ns 50]
//   ⚠함수 몫은 **포함 값**이다(감싼 함수끼리 안에서 부르면 겹친다 — `walkFor` 는 `caravanTick` 안에서도 불린다).
//   ⚠최대 ms: 창마다 최대를 적은 판(rt 의 `winMax`)이면 첫 창을 뺀 창들의 최대 · 아니면 판 전체(부팅 포함) 최대다.
//   ⚠탐침 몫: 감싼 부름마다 시계 두 번 — `--clock-ns`(따뜻한 상자에서 잰 performance.now 한 번 값) × 2 × 호출 수를 "탐침" 칸에 적는다(빼지 않고 나란히).
'use strict';
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const D = argv[0] || '/tmp/t605/tick30';
const Z = (argv[1] && !argv[1].startsWith('--') ? argv[1] : 'hanbando,nippon').split(',');
const ci = argv.indexOf('--clock-ns'); const CLK = ci >= 0 ? +argv[ci + 1] : 50;
const f1 = (x) => (Math.round(x * 10) / 10).toLocaleString('en-US');
for (const z of Z) {
  let J; try { J = JSON.parse(fs.readFileSync(path.join(D, `${z}.json`), 'utf8')); } catch (e) { console.log(`${z}: 없음`); continue; }
  const W = J.wins || [];
  const first = W[0] && W[0].extra, last = W.length ? W[W.length - 1].extra : null;
  const wall = W.length ? W[W.length - 1].tS : 0;
  console.log(`\n### ${z} — 창 ${W.length}개 · ${f1(wall / 60)}분 · 게임일 ${first ? first.day : '?'} → ${last ? last.day : '?'} · 마을 ${last ? last.vils : '?'} · 인구 ${first ? first.pop : '?'} → ${last ? last.pop : '?'} · 영토 셀 ${last ? last.terr : '?'} · 교역로 캐시 ${last ? last.routes : '?'}`);
  const T = J.tick;
  console.log(`틱 본문(판 전체 · ${T.n.toLocaleString()}틱): 평균 ${T.mean} · p50 ${T.p50} · p95 ${T.p95} · p99 ${T.p99} · 최대 ${T.max} ms · 조각 예산(${J.slice}ms) 넘은 틱 ${T.overSlice} · 33ms 넘은 틱 ${T.over33}`);
  // 창별 분포 — p95 의 중앙값과 범위, 최대 틱이 난 창
  const p95s = W.map((w) => w.tick.p95).sort((a, b) => a - b), maxW = W.slice().sort((a, b) => b.tick.max - a.tick.max).slice(0, 3);
  if (W.length) console.log(`창(${(W[1] ? W[1].tS - W[0].tS : 0) / 60}분) p95 중앙 ${p95s[Math.floor(p95s.length / 2)]} [${p95s[0]}–${p95s[p95s.length - 1]}] · 최대 틱 창: ${maxW.map((w) => `${f1(w.tS / 60)}분 ${w.tick.max}ms(day ${w.extra ? w.extra.day : '?'})`).join(' · ')}`);
  const tickSum = T.mean * T.n;
  const days = (last && first && last.day > first.day) ? last.day - first.day : 1;
  console.log('| 주인(포함) | 부름 | 합 ms | 틱 합 대비 | 게임일당 ms | 최대 ms | 16ms 넘음 | 탐침 몫 ms |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
  // 함수 몫은 **첫 창을 뺀** 창 증분의 합이다(첫 창에 부팅 — 도적 표본 1,225쌍 — 이 들어 있다 · 틱이 아니다)
  const acc = {};
  for (const w of W.slice(1)) for (const [k, d] of Object.entries(w.acc || {})) { const a = acc[k] || (acc[k] = { n: 0, ms: 0, over: 0, max: (J.acc[k] || {}).max }); a.n += d.n; a.ms += d.ms; a.over += d.over; if (d.max != null) { if (!a._wm) { a._wm = true; a.max = 0; } if (d.max > a.max) a.max = d.max; } }
  const rows = Object.entries(acc).filter(([k]) => !/^bdt(RoutePts|DenScan)$|^streamsLoad$/.test(k)).sort((a, b) => b[1].ms - a[1].ms);
  for (const [k, a] of rows) console.log(`| ${k} | ${a.n.toLocaleString()} | ${f1(a.ms)} | ${(100 * a.ms / tickSum).toFixed(2)}% | ${f1(a.ms / days)} | ${a.max} | ${a.over} | ${f1(2 * CLK * a.n / 1e6)} |`);
}
