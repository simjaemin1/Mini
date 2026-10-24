#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T905 · 랩 t17 판 프리로드 · 읽기만 · 제품 0)
// 쓰는 법: [env] JP_ROOT=$PWD JP_OUT=out.json node -r scripts/t905-jobprobe.js scripts/t17-metrics.js 420 <시드>
//   30일마다(420일까지) 마을 합: 인구 · 곳간 식량 환산 · food · 생곡 · 직업 수 · food 값(인구 가중 기하평균)
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = process.env.JP_ROOT; const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2')); const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const tk = V2.tickWorldV2; const rec = [];
V2.tickWorldV2 = function (world) { const r = tk.apply(this, arguments);
  try { if (world.day % 30 === 0 && world.day <= 420) { const s = { day: world.day, pop: 0, tfe: 0, food: 0, rice: 0, jobs: {}, pFood: 0, nV: 0, prodFood: 0 };
    for (const v of world.villages) { const n = (v.npcs || []).length; if (!n) continue; s.nV++; s.pop += n; s.tfe += V1.totalFoodEquivalent(v); s.food += v.storage.food || 0;
      for (const k of ['rice', 'wheat', 'barley']) s.rice += v.storage[k] || 0;
      for (const [j, c] of Object.entries(v.counts || {})) s.jobs[j] = (s.jobs[j] || 0) + c;
      const p = world.priceFn ? world.priceFn(v) : null; if (p) s.pFood += Math.log(Math.max(1e-6, p.food || 1)) * n; }
    s.pFood = Math.exp(s.pFood / s.pop); rec.push(s); } } catch (e) {}
  return r; };
process.on('exit', () => fs.writeFileSync(process.env.JP_OUT, JSON.stringify(rec)));
