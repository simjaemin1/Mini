#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T905 관찰 갈래 · 이 프로세스 안 소스 고쳐 쓰기 · 제품 0 · 새 수 0)
// === scripts/t905-arm.js — T825 하한을 "하루치"로 좁힌 갈래(회부 선택지 재기용) ==============================
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t905-arm.js" T905_ARM=day1 node scripts/t577-server-run.js 800 1020,7,42
//     (아이 존에도 NODE_OPTIONS 가 그대로 간다 · `diverge-ctl.js` 와 같이 쓴다)
//   T905_ARM=day1 — T825 켬의 먹을 것 수출 하한(`_fKeep`)을 식량류 `keep` 식(30일 × 1.2 = 36일치)에서
//     **하루치**(`SUBSISTENCE_PER_NPC.food × N` — 굶는 날 정의 · T837 표의 "곳간 < 인구" 와 같은 선)로 바꾼다.
//     ⇒ 굶는 마을(곳간 < 하루치)은 먹을 것을 안 팔고, 팔아서 하루치 밑으로 내려가지도 않는다. 1 ~ 36일치 마을은 끔처럼 판다.
//   econ 소스(`sim/economy-sim-v2.js`)를 require 하는 순간 그 한 줄만 글자 그대로 바꾼다. 줄이 없으면(소스가 바뀌었으면) 바로 죽는다.
'use strict';
const ARM = process.env.T905_ARM || '';
if (ARM) {
  const Module = require('module');
  const path = require('path');
  const OLD = 'const _fKeep = Math.max((SUBSISTENCE_PER_NPC.food || 0) * N * 30, buffer) * 1.2;';
  const NEW = { day1: 'const _fKeep = (SUBSISTENCE_PER_NPC.food || 0) * N;   /* [T905 관찰 갈래 day1] */' };
  if (!NEW[ARM]) throw new Error('[t905-arm] 모르는 갈래: ' + ARM);
  const comp = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename && filename.endsWith(path.join('sim', 'economy-sim-v2.js'))) {
      const n = content.split(OLD).length - 1;
      if (n !== 1) throw new Error(`[t905-arm] 바꿀 줄이 ${n} 곳(1 이어야 한다) — 소스가 바뀌었다`);
      content = content.replace(OLD, NEW[ARM]);
      process.env.T905_ARM_APPLIED = ARM;
    }
    return comp.call(this, content, filename);
  };
}
