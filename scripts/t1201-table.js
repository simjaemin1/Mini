#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1201 표 기계 · 랩 자 `t176-ab.js` 판 JSON 만 읽는다 · 산수뿐 · 판정 0)
// === scripts/t1201-table.js — 농사 고증 판의 랩 표(판마다 3시드) ====================================================
//   node scripts/t1201-table.js <디렉터리> <판,…> [--seeds 1020,7,42]   ⇒ <디렉터리>/lab-<판>-<시드>.json(또는 .json.gz)
//   셈(전부 정본이 센 누계를 읽기만):
//     인구 · 빈 마을(소멸) · 밭 칸(끝) · 사람당 밭 칸 = 밭 칸 ÷ 인구
//     농부 하나가 먹인 사람 = 밭이 곳간에 넣은 식량등가 누계(`fieldFoodEqTot` — econ 단위 1 = 사람 하루) ÷ 농부-날 누계(`fDaysTot`)
//     밭 식량 몫 = 밭 식량등가 누계 ÷ 사람-날 누계(`popDaysTot`) — 1 이면 밭만으로 모두 먹는다
//     텃밭 하한 누계(`floorTot` — 끈 판은 0 이어야 한다) · 채소 몫(작물별 식량등가 중 청동기 열 가지 밖)
'use strict';
const fs = require('fs');
const path = require('path');
const D = process.argv[2];
const ARMS = (process.argv[3] || 'A,G').split(',');
const si = process.argv.indexOf('--seeds');
const SEEDS = (si > 0 ? process.argv[si + 1] : '1020,7,42').split(',');
const BRONZE = new Set(require(path.join(__dirname, '..', 'server', 'crops.js')).T1201_BRONZE_SET);
const J = (f) => { for (const g of [f, f + '.gz']) { try { const b = fs.readFileSync(g); return JSON.parse((g.endsWith('.gz') ? require('zlib').gunzipSync(b) : b).toString('utf8')); } catch (e) { /* 다음 */ } } return null; };   // `.json` 또는 `.json.gz`
const nf = (x) => (x == null ? '—' : Math.round(x).toLocaleString('en-US'));
const f3 = (x) => (x == null ? '—' : (+x).toFixed(3));
console.log('| 판 · 시드 | 인구 | 빈 마을 | 밭 칸(끝) | 사람당 밭 칸 | 농부-날 · 사람-날 | 밭 식량등가 누계 | 농부 하나가 먹인 사람 | 밭 식량 몫 | 텃밭 하한 누계 | 청동기 밖 작물 식량 몫 |');
console.log('|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|');
for (const a of ARMS) for (const s of SEEDS) {
  const o = J(path.join(D, `lab-${a}-${s}.json`));
  if (!o) { console.log(`| ${a} · ${s} | 자료 없음 |`); continue; }
  const by = (o.t368 && o.t368.byCrop) || {};
  let feAll = 0, feOut = 0; for (const [c, b] of Object.entries(by)) { feAll += b.fe || 0; if (!BRONZE.has(c)) feOut += b.fe || 0; }
  const fe = o.fieldFoodEqTot;
  console.log(`| ${a} · ${s} | ${nf(o.pop)} | ${o.dead}/${o.ever} | ${nf(o.cellsTot)} | ${o.pop ? (o.cellsTot / o.pop).toFixed(1) : '—'} | ${nf(o.fDaysTot)} · ${nf(o.popDaysTot)} | ${nf(fe)} | ${f3(o.fDaysTot ? fe / o.fDaysTot : null)} | ${f3(o.popDaysTot ? fe / o.popDaysTot : null)} | ${nf(o.floorTot)} | ${feAll ? (100 * feOut / feAll).toFixed(1) + '%' : '—'} |`);
}
