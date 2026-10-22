#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-vern-num.js — T834 ②: 춘화일 사전 열쇠를 날 하나로(`T834_VERN_NUM`) = 종전 값 =====================================
//
// ★[T834 ②] 켬이면 `crops.vernalDay` 의 사전 열쇠가 문자열(`id + ',' + p`)이 아니라 심은 날(수) 하나다 — 계산(`_vernalCompute`)이 id 를 안 읽어서다.
//   ① 같은 값 — 켬 · 끔 아이 둘이 모든 작물 × 심은 날 0~2,999(+ 소수 · 음수 날) 의 `vernalDay` 와 그 위의 `grownDays` · `isReady` 를 같은 차례로 묻고 낸 줄 전부가 한 글자 같다
//      (월동 작물이 둘 이상이라 켬 사전을 작물끼리 나눠 쓰는 판이 실제로 선다 · 사전 비우기(4096) 문턱도 넘는다)
//   ② 미끼 — 열쇠를 해(365) 나머지로 접은 사본은 끔과 갈린다(위 같음은 자명 통과가 아니다)
//   ③ 글자 — 손잡이 '1' 만 켬 · 끔 갈래 종전 줄 그대로
// 실행: node scripts/test-vern-num.js
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CP = path.join(ROOT, 'server', 'crops.js');

function child() {
  if (process.env.T834_BAIT === '1') {
    const Module = require('module');
    const src = fs.readFileSync(CP, 'utf8').replace('let w = _vernByP.get(p);', 'let w = _vernByP.get(p % 365);').replace('_vernByP.set(p, w);', '_vernByP.set(p % 365, w);');
    const m = new Module(CP, module); m.filename = CP; m.paths = Module._nodeModulePaths(path.dirname(CP)); m._compile(src, CP); require.cache[CP] = m;
  }
  const C = require(CP);
  const h = crypto.createHash('sha1');
  const win = C.IDS.filter((id) => C.isWinterCrop(id));
  let n = 0;
  const days = [];
  for (let d = 0; d < 3000; d++) days.push(d);
  days.push(-3, 0.5, 17.9, 365.2, 1e6);
  for (const d of days) for (const id of C.IDS) {
    const v = C.vernalDay(id, d);
    const g = C.grownDays ? C.grownDays(id, d, d + 200) : null;
    const r = C.isReady ? C.isReady(id, d, d + 200) : null;
    h.update(`${id}:${d}:${v}:${g}:${r};`); n++;
  }
  return { hash: h.digest('hex').slice(0, 16), n, win: win.length, on: process.env.T834_VERN_NUM !== '0' };
}
if (process.argv[2] === '--child') { const o = child(); process.stdout.write('\n@@JSON@@' + JSON.stringify(o)); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };
const run = (env) => JSON.parse(String(execFileSync(process.execPath, [__filename, '--child'], { env: Object.assign({}, process.env, { T834_VERN_NUM: '', T834_BAIT: '' }, env), encoding: 'utf8', maxBuffer: 1 << 26 })).split('@@JSON@@').pop());

console.log('\n=== T834 ② 춘화일 사전 열쇠 = 날 하나 · 종전 값 ===');
const OFF = run({ T834_VERN_NUM: '0' }), ON = run({}), ON1 = run({ T834_VERN_NUM: '1' });   // ★[T846] 켬 기본 — 끔 탐침 `=0` · 기본(빈 값) · '1' 둘 다 켬
console.log('\n① 같은 값');
ok(OFF.win >= 2 && OFF.n > 100000, '[상황] 월동 작물 둘 이상 · 물음 수(끔 사전은 비우기 문턱 4096 을 넘는다 — 월동 셋 × 날 3,005)', `월동 ${OFF.win} · 물음 ${OFF.n}`);
ok(ON.on && ON1.on && !OFF.on && ON.hash === OFF.hash && ON1.hash === OFF.hash, '★★켬 = 끔 — `vernalDay` · `grownDays` · `isReady` 줄이 한 글자 같다', `${ON.hash} / ${OFF.hash}`);
console.log('\n② 미끼');
const BAIT = run({ T834_VERN_NUM: '1', T834_BAIT: '1' });
ok(BAIT.hash !== OFF.hash, '★미끼 — 열쇠를 해 나머지로 접은 사본은 끔과 갈린다', `${BAIT.hash} / ${OFF.hash}`);
console.log('\n③ 글자');
const S = fs.readFileSync(CP, 'utf8');
ok(/const T834_VERN_NUM = !\(typeof process !== 'undefined' && process\.env && process\.env\.T834_VERN_NUM === '0'\);/.test(S), "손잡이 — 켬 기본 · `=0` 만 끔");
ok(S.includes("  const k = id + ',' + p;\n  let v = _vernCache.get(k);\n  if (v === undefined) { if (_vernCache.size > 4096) _vernCache.clear(); v = _vernalCompute(id, p); _vernCache.set(k, v); }\n  return v;"), '끔 갈래 = 종전 줄 그대로');
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
