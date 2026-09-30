// === scripts/t549-plan.js — 지형 **안**(레포 밖 json)과 존별 해안선 띠 깊이를 **자 안에서만** 얹는 예비 적재(T549 · 제품 무변) ===
//   `NODE_OPTIONS=--require=<이 파일>` 과 함께:
//     T549_PLAN=<json>        — 그 존 절(`hanbando-terrain.json` 의 `<zone>` 칸과 같은 꼴)을 통째로 바꿔 끼운다.
//                               정본 파일은 안 읽고 안 쓴다 — `require` 캐시에 올라온 객체의 그 칸만 바꾼다(`terrain.js` 가 처음 읽기 전에).
//     T549_PLAN_ZONE=<존>     — 기본 nippon.
//     T549_BAND=<k>           — 그 존 해안선 띠 깊이 × k(`chunk.js generateCoastlineWaterTiles` 의 depth 한 줄 · 다른 존은 × 1).
//                               "존별 깊이(zone-config 칸 하나)" 를 넣었을 때를 자 안에서 흉내 낸다 · k ≤ 1 만(띠를 얕게).
'use strict';
const path = require('path');
const fs = require('fs');
const ZID = process.env.T549_PLAN_ZONE || 'nippon';
if (process.env.T549_PLAN) {
  const hc = require(path.join(__dirname, '..', 'server', 'hanbando-terrain.json'));
  const plan = JSON.parse(fs.readFileSync(process.env.T549_PLAN, 'utf8'));
  hc[ZID] = plan;
  process.stderr.write(`[T549] ${ZID} 지형 안 얹음: ${process.env.T549_PLAN} (강 ${(plan.rivers || []).length} · 호수 ${(plan.lakes || []).length} · 산맥 ${(plan.ridges || []).length} · 고개 ${(plan.passes || []).length} · 계곡 ${(plan.valleys || []).length})\n`);
}
const K = process.env.T549_BAND ? +process.env.T549_BAND : null;
if (K != null && Number.isFinite(K)) {
  const Module = require('module');
  const _compile = Module.prototype._compile;
  const LINE = 'const depth = COASTLINE_BASE + _coastSmoothNoise2D(bnx, bny) * COASTLINE_NOISE;';
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(path.join('server', 'chunk.js'))) {
      if (!content.includes(LINE)) throw new Error('[T549] chunk.js 띠 깊이 줄이 바뀌었다 — 자를 고쳐라');
      content = content.replace(LINE, `const depth = (COASTLINE_BASE + _coastSmoothNoise2D(bnx, bny) * COASTLINE_NOISE) * ((zone && zone.id === ${JSON.stringify(ZID)}) ? ${K} : 1);`);
    }
    return _compile.call(this, content, filename);
  };
  process.stderr.write(`[T549] ${ZID} 해안선 띠 깊이 × ${K}\n`);
}
