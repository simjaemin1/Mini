#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-body-fields.js — 몸 필드 규약: 새 필드는 `_t671Shape` 목록에 (T673 ② · 2026-10-07) ======================
//
// ★왜 [T671 회부 2 · T673 ②]
//   T671 이 주민 몸을 **한 모양**으로 묶었다(`server/zone.js` `_t671Shape` — 나중에 붙던 필드를 태어날 때 같은 차례로 `undefined`).
//   그 뒤 누가 몸에 **목록 밖 새 필드**를 붙이면 그 필드를 받은 몸만 모양이 갈라진다 — 틀리진 않고 느려진다
//   (T671 ①: 모양 79~87 가지 = 속성 자리 메가모픽 = 사람당 ×2.2~2.4). 조용히 느려지는 것을 **빨강으로** 바꾸는 린트다.
//
// ★무엇을 보나: `server/*.js` 에서 `npc.<이름>` 에 **쓰는** 자리(`=` · `++` · `+=` · `??=` …)의 이름이
//     ⓐ 스폰 리터럴·스폰 대입 ⓑ `_t671Shape` 목록 ⓒ 아래 `FROZEN`(이 린트가 생길 때 이미 있던 목록 밖 이름 · 까닭을 적었다)
//   어디에도 없으면 빨강. 새 몸 필드면 `_t671Shape` 에 넣고, econ 사람(장부) 객체 필드면 `FROZEN.econ` 에 까닭과 함께 넣는다.
//   ⚠변수 이름이 `npc` 인 자리만 본다 — `p`·`body` 는 서버에서 몸이 아닌 것(캐러밴 몸·건물·몹)에도 쓰여 오탐이 넘친다(T673 보고 §3 표).
//     그 빈칸은 동적 자(`node scripts/t646-anatomy.js run cap40 <tag> --seg --trap` — 몸을 Proxy 로 싸서 새 키를 센다)가 메운다.
// ★자명 통과 금지: 미끼 필드(`npc._t673Bait = 1`)를 글자에 심으면 문다 · 목록·리터럴에서 이름을 제대로 떴다(수).
//
// 실행: node scripts/test-body-fields.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

// 이 린트가 생길 때(2026-10-07) 이미 있던 목록 밖 이름 — 늘리면 까닭을 적는다
const FROZEN = {
  // 드문 몸 필드 — 그 사건을 겪은 몸만 갈라진다(캐나디아 캐러밴 · 싸움 · 수확 · 어로 옛 갈래). 매 틱 읽어도 없음은 같은 모양에서 싸다.
  rare: ['_canadiaSubAt', '_caughtFish', '_lastFishAt', 'canadiaCaravanKey', 'canadiaCaravanSpeed', 'canadiaTask', 'canadiaTaskAt', 'canadiaTaskEndAt',
    'canadiaWorkX', 'canadiaWorkY', 'farmClaimId', 'fightTarget', 'harvestTarget'],
  // `server/villages.js` 의 `npc` 가 econ 사람(장부)이거나 생활층 드문 갈래인 자리 — 존 몸 모양과 무관하거나 드물다
  econ: ['_carryOn', '_granD', '_granTask', '_rest', '_t325Ei', '_t325Site', '_t325U', '_t368H', '_t368N', '_t529Since', '_t529StepAt', '_t529X', '_t529Y',
    '_t561Hall', '_t561Wd', 'currentJob'],
};

function known(Z) {
  const i = Z.indexOf('function _t671Shape(p) {'), j = Z.indexOf('\n}\n', i);
  const shape = new Set([...Z.slice(i, j).matchAll(/p\.([A-Za-z_$][\w$]*) = undefined/g)].map((m) => m[1]));
  const k = Z.indexOf('  const player = {\n    pid, playerId'), l = Z.indexOf('  if (T671_SHAPE) _t671Shape(player);', k);
  const lit = new Set([...Z.slice(k, l).matchAll(/(?:^|[\s{,])([A-Za-z_$][\w$]*)\s*[:,]/g)].map((m) => m[1]));
  for (const m of Z.slice(k, l).matchAll(/player\.([A-Za-z_$][\w$]*)\s*=/g)) lit.add(m[1]);
  return { shape, lit, ok: i > 0 && j > i && k > 0 && l > k };
}
const WRITE = /\bnpc\.([A-Za-z_$][\w$]*)\s*(?:=(?!=)|\+\+|--|\+=|-=|\*=|\/=|\|\|=|\?\?=|&&=)/g;
function scan(files, K) {
  const all = new Set([...K.shape, ...K.lit, ...FROZEN.rare, ...FROZEN.econ]);
  const bad = [];
  for (const [f, S] of files) for (const m of S.matchAll(WRITE)) if (!all.has(m[1])) bad.push(`${f}:${S.slice(0, m.index).split('\n').length} npc.${m[1]}`);
  return bad;
}

console.log('\n=== 몸 필드 규약 — 새 필드는 `_t671Shape` 목록에 (T673 ②) ===');
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const K = known(Z);
ok(K.ok && K.shape.size >= 50, '[전제] `_t671Shape` 목록을 떴다', `${K.shape.size}개`);
ok(K.lit.has('pid') && K.lit.has('targetX') && K.lit.has('npcWorkY'), '[전제] 스폰 리터럴·대입 이름을 떴다', `${K.lit.size}개`);
const files = fs.readdirSync(path.join(ROOT, 'server')).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(ROOT, 'server', f), 'utf8')]);
let writes = 0; for (const [, S] of files) writes += [...S.matchAll(WRITE)].length;
ok(writes > 300, '[상황] 서버의 `npc.<이름>` 쓰기 자리', writes);
const bad = scan(files, K);
ok(bad.length === 0, '★몸 필드 규약 — `npc.` 에 쓰는 이름이 전부 스폰·`_t671Shape`·FROZEN 안에 있다(새 몸 필드면 `_t671Shape` 에 넣어라)', bad.slice(0, 8).join(' · '));
// 자명 통과 금지 — 미끼
{
  const bait = files.map(([f, S]) => [f, f === 'villages.js' ? S + '\nfunction _bait(npc) { npc._t673Bait = 1; }\n' : S]);
  const b2 = scan(bait, K);
  ok(b2.length === 1 && b2[0].includes('npc._t673Bait'), '★자명 통과 금지 — 미끼 필드(`npc._t673Bait = 1`)를 심으면 **문다**', b2.join(' · '));
  const b3 = scan(files.map(([f, S]) => [f, f === 'zone.js' ? S + '\nfunction _bait2(npc) { if (npc._lifeAct == null) npc._t673Bait2 ??= 0; }\n' : S]), K);
  ok(b3.length === 1, '★자명 통과 금지 — `??=` 꼴도 문다 · 읽기(`==`)는 안 문다', b3.join(' · '));
}
// 목록 위생 — FROZEN 이 목록과 겹치면(이미 모양에 들었으면) 지운다
{
  const dup = [...FROZEN.rare, ...FROZEN.econ].filter((n) => K.shape.has(n) || K.lit.has(n));
  ok(dup.length === 0, 'FROZEN 과 `_t671Shape`·스폰이 안 겹친다(겹치면 FROZEN 에서 지운다)', dup.join(','));
}
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
