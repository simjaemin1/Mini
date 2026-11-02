#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1075 표 기계 · 판 JSON 만 읽는다 · 판정 0)
// === scripts/t1075-table.js — 행복 평형(T1075) 끔 ↔ 켬 표(둘 다 T1074 식량 빚 켬 세계) ===
//   node scripts/t1075-table.js <뿌리> [--json <파일>]   — <뿌리>/run-<off|on>/base-<시드>.{t1075,t1074}.json + base-<시드>.json(판 자 줄)
//   셈(시드 셋 합): 400 · 800날 인구 · 해체 · 빈 마을 · 이탈(`_emigTot`) · 길 없어 못 떠난 압력(`_emigLost`) · 기근 길 죽음 · 빚 죽음 ·
//     불행 날(마을-날 H < 0.5 — `_happyTerm` 이 음수가 되는 그 기준) · 행복 바닥(마을별 H 최저의 평균 · 최저) · 바닥에서 절반 회복까지 걸린 날(체감)
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];
const ji = process.argv.indexOf('--json'), JOUT = ji > 0 ? process.argv[ji + 1] : null;
const SEEDS = [1020, 7, 42];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const out = {};
for (const k of ['off', 'on']) {
  const dir = path.join(ROOT, `run-${k}`);
  const r = { seeds: 0, pop400: 0, popEnd: 0, dissolved: 0, empty: 0, emig: 0, emigLost: 0, deaths: 0, fdDead: 0, unhappyDays: 0, villDays: 0, Hmin: Infinity, HminMean: 0, nv: 0, halfRec: [] };
  for (const s of SEEDS) {
    const t = J(path.join(dir, `base-${s}.t1075.json`)); if (!t) continue;
    r.seeds++;
    const C = t.cols, iP = C.indexOf('pop'), iH = C.indexOf('H'), iE = C.indexOf('emigTot'), iL = C.indexOf('emigLost'), iD = C.indexOf('deathsToday'), iF = C.indexOf('fdDead');
    const nV = t.names.length, Hs = Array.from({ length: nV }, () => []);
    let last = null;
    for (const [day, vs] of t.rows) {
      vs.forEach((x, k2) => { r.deaths += x[iD]; if (x[iP] > 0) { r.villDays++; if (x[iH] < 0.5) r.unhappyDays++; Hs[k2].push([day, x[iH]]); } });
      if (day === 400) r.pop400 += vs.reduce((a, x) => a + x[iP], 0);
      last = vs;
    }
    r.popEnd += last.reduce((a, x) => a + x[iP], 0); r.empty += last.filter((x) => x[iP] === 0).length;
    r.emig += last.reduce((a, x) => a + x[iE], 0); r.emigLost += last.reduce((a, x) => a + x[iL], 0); r.fdDead += last.reduce((a, x) => a + x[iF], 0);
    for (const h of Hs) {
      if (!h.length) continue;
      let mi = 0; for (let i = 1; i < h.length; i++) if (h[i][1] < h[mi][1]) mi = i;
      const lo = h[mi][1]; r.nv++; r.HminMean += lo; if (lo < r.Hmin) r.Hmin = lo;
      // 바닥 뒤 그 바닥과 바닥 전 최고 사이 절반까지 걸린 날(체감 — 평형이 다시 무너지면 안 닿을 수 있다)
      let pre = 0; for (let i = 0; i < mi; i++) pre = Math.max(pre, h[i][1]);
      const half = lo + (pre - lo) / 2;
      if (pre - lo > 0.1) { for (let i = mi + 1; i < h.length; i++) if (h[i][1] >= half) { r.halfRec.push(h[i][0] - h[mi][0]); break; } }
    }
    const b = J(path.join(dir, `base-${s}.json`)); if (b && b.dissolved != null) r.dissolved += +b.dissolved || 0;
  }
  if (!r.seeds) continue;
  r.HminMean = r.nv ? r.HminMean / r.nv : 0;
  r.halfRec.sort((a, b) => a - b);
  out[k] = r;
}
console.log('| T1075 | 시드 | 400날 인구 | 800날 인구 | 해체 | 빈 마을 | 이탈 | 못 떠난 압력 | 기근 길 죽음 | 빚 죽음 | 불행 마을-날(H < 0.5) | 마을별 H 최저 평균 | H 최저 | 바닥 → 절반 회복 날(중앙 · 표본) |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [k, r] of Object.entries(out)) {
  const med = r.halfRec.length ? r.halfRec[Math.floor(r.halfRec.length / 2)] : '—';
  console.log(`| ${k === 'on' ? '켬' : '끔'} | ${r.seeds} | ${r.pop400} | ${r.popEnd} | ${r.dissolved} | ${r.empty} | ${r.emig} | ${r.emigLost.toFixed(1)} | ${r.deaths} | ${r.fdDead} | ${r.unhappyDays} / ${r.villDays} | ${r.HminMean.toFixed(3)} | ${r.Hmin.toFixed(3)} | ${med} · ${r.halfRec.length} |`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
