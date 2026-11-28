#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1497 ② 랩 한반도 짐 굽기 · 제품 무변 · 캐시 읽기만)
// === scripts/t1497-hanbando-pack.js — 판 자(t17)가 세계를 세우는 재료를 한 파일로 =====
//   읽는 것: 판 자 시딩 캐시(`LAB_SEEDCACHE` — 마을 이름 · 자리 · 땅 값 lp · 시딩 집 칸) · 그 곁 거리 행렬 캐시(`<캐시>.t1047dist.json` — 서버 정본 행렬)
//           · 서버 정본 두 수(처음 인구 `INITIAL_POP` · 집 크루 `LIFE_CREW` · `LIFE_STAGE_PDAY`)
//           · 나무 층(`server/trees.js` `treeCountOf`)이 부르는 다섯 상수 — `livelihood` FLOOR/GAIN.wood · `chunk` 숲 셀 나무 수(평균 · 상한) · 흩어진 나무 수(존 biome)
//             (번들은 `chunk`(지형 전체)를 못 싣는다 — 같은 수를 node 에서 불러 짐에 담고, 번들의 나무 층이 그 수를 읽는다 · 사본 0 · 새 수 0)
//   쓰는 것: `sim/lab-hanbando-pack.json` { v, zone, sig(시딩 · 행렬 지문), initialPop, life, villages: [{ name, ccx, ccy, lp, houses }], dist }
//   node scripts/t1497-hanbando-pack.js [--seeds <캐시>] [--out sim/lab-hanbando-pack.json]
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const A = process.argv.slice(2), opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const Z = process.env.T17_ZONE || 'hanbando';
const SEEDS = opt('seeds', process.env.LAB_SEEDCACHE || path.join(process.env.TMPDIR || '/tmp', 'durango-eq-cache', `lab-seeds-${Z}-1020.json`));
const OUT = opt('out', path.join(__dirname, '..', 'sim', `lab-${Z}-pack.json`));
const P = require('../server/villages').__labProbe;
const seeds = JSON.parse(fs.readFileSync(SEEDS, 'utf8'));
let dist = null; try { dist = JSON.parse(fs.readFileSync(SEEDS + '.t1047dist.json', 'utf8')); } catch (e) { console.error(`⚠ 거리 행렬 캐시 없음(${SEEDS}.t1047dist.json) — 판 자를 한 번 돌려 만든다`); process.exit(2); }
const villages = seeds.map((s) => ({ name: s.name, ccx: s.ccx, ccy: s.ccy, lp: s.lp, houses: (s.layout && s.layout.houses) ? s.layout.houses.length : null }));
const LVm = require('../server/livelihood'), CHm = require('../server/chunk'), ZC = require('../server/zone-config');
const biome = ((ZC.ZONES || {})[process.env.ZONE_ID || Z] || {}).biome || null;
const trees = { floorWood: LVm.FLOOR.wood, gainWood: LVm.GAIN.wood, scatter: CHm.scatterTreesPerCell(biome), perMean: CHm.forestTreesPerCellMean(), perMax: CHm.forestTreesPerCell() };
const sig = crypto.createHash('sha1').update(JSON.stringify({ villages, dist: dist.sig, trees })).digest('hex').slice(0, 16);
const out = { v: 1, card: 'T1497', zone: Z, sig, distSig: dist.sig, initialPop: P.INITIAL_POP, life: { crew: P._t400Probe.LIFE_CREW, pday: P._t400Probe.LIFE_STAGE_PDAY }, trees, villages, dist: dist.mat };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`[T1497] 한반도 짐 — ${villages.length}마을 · 지문 ${sig} · ${fs.statSync(OUT).size.toLocaleString()} B → ${OUT}`);
