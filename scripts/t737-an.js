#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T737 분석 · 제품 무변)
// === scripts/t737-an.js — t686 자 판(+ t737-probe 셈)을 낮 · 밤 분 창으로 가른다 ==========
//   쓰는 법: T686_DIR=/tmp/t737 node scripts/t737-an.js H0 H1 H2
//   ★분 창(t686 `win` 줄 · 60초)마다 세계 위상(창 끝 `ph`)으로 낮(ph < 0.7 · 세계 `dayPhaseRatio`) · 밤을 가르고,
//     창마다 틱 평균 ms · 구간 µs/틱(결정 문 · 이동 문 · 걸음 커널 준비 · 늦은 마감)의 중앙값을 낸다(부팅 뒤 첫 3분 창은 뺀다).
//   ★판 전체 틱 p50 · p99 는 t686 `table` 그대로(`<판>.table.json`).
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.env.T686_DIR || '/tmp/t737';
const SEG = ['결정 문(순회)', '이동 문(순회)', '화살·걸음 커널 준비', '늦은 마감(T695)·밭 그림'];
const med = (a) => { if (!a.length) return null; const t = a.slice().sort((x, y) => x - y); return t[t.length >> 1]; };
for (const tag of process.argv.slice(2)) {
  const L = fs.readFileSync(path.join(DIR, `${tag}.jsonl`), 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  const W = L.slice(L.findIndex((x) => x.kind === 'reset') + 1).filter((x) => x.kind === 'win').slice(3);
  let T = {}; try { T = JSON.parse(fs.readFileSync(path.join(DIR, `${tag}.table.json`), 'utf8')); } catch (e) {}
  let P = null; try { P = JSON.parse(fs.readFileSync(path.join(DIR, `${tag}.t737.json`), 'utf8')); } catch (e) {}
  const out = { tag, p50: T.p50, p99: T.p99, over16: T.over16, over30: T.over30 };
  for (const [nm, f] of [['낮', (x) => x.ph < 0.7], ['밤', (x) => !(x.ph < 0.7)]]) {
    const ws = W.filter(f); const o = { n: ws.length, tickMs: med(ws.map((x) => x.tot / x.ticks)) };
    for (const s of SEG) o[s] = med(ws.map((x) => ((x.seg || {})[s] || 0) / x.ticks * 1000));
    out[nm] = o;
  }
  const r = (v, d = 1) => (v == null ? '-' : (+v).toFixed(d));
  console.log(`${tag} · 틱 p50 ${out.p50} · p99 ${out.p99} · 16+ ${out.over16} · 30+ ${out.over30}`);
  for (const nm of ['낮', '밤']) { const o = out[nm]; console.log(`   ${nm} 창 ${o.n} · 틱 평균(창 중앙) ${r(o.tickMs, 2)} ms · ` + SEG.map((s) => `${s} ${r(o[s])}`).join(' · ') + ' µs/틱'); }
  if (P) {
    const f = P.fn || {}, z = P.zone || {};
    console.log('   셈: ' + Object.entries(f).map(([k, v]) => `${k} ${v[0]}번 ${v[1].toFixed(0)} ms(${v[0] ? (v[1] / v[0] * 1000).toFixed(2) : '-'} µs/번)`).join(' · '));
    console.log(`   생활 층(npcLifeTick) ${z.lt ? z.lt[0] + '번 ' + z.lt[1].toFixed(0) + ' ms' : '-'} · 해 질 녘 운반 몸 길 묻기 ${z.n || 0}번 ${(z.ms || 0).toFixed(0)} ms · 갈래 ${JSON.stringify(P.br || {})}` + (P.verify ? ` · 견줌 ${JSON.stringify(P.verify)}` : ''));
  }
}
