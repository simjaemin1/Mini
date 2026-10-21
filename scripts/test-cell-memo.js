#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-cell-memo.js — T818 ③: 빈 셀 파종 판정 기억(`T818_CELL_MEMO`) = 종전 값 ==================================
//
// ★[T818 ③] 켬이면 `_cellTask` 의 빈 셀 갈래가 (마을 · 그날 · 논/밭 · 구획 홀짝) 넷의 답을 마을마다 그날 한 번만 잰다.
//   ① 같은 값 — 켬 · 끔 아이 둘이 같은 마을 여럿(시드 다름 · 논 · 밭 · 셀 수백)을 730날 돌며 낸 `_cellTask` 줄 전부가 한 글자 같다
//      (상태기 하루 틱 · 파종 · 수확이 같이 돈다 — 기억이 날을 넘기지 않는지까지 본다)
//   ③ 미끼 — 날을 열쇠에서 뺀 사본(날이 바뀌어도 그 전 답)은 끔과 갈린다(위 ① 이 문다)
//   ④ 글자 — 손잡이 '1' 만 켬 · 끔 갈래는 종전 줄 그대로
// 실행: node scripts/test-cell-memo.js
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function child() {
  process.env.ZONE_ID = 'hanbando';
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  const VP = path.join(ROOT, 'server', 'villages.js');
  if (process.env.T818_BAIT === '1') {   // 미끼 — 날을 열쇠에서 뺀 사본(모듈 캐시에 그 글자를 심는다 · 레포 파일 무접촉)
    const Module = require('module');
    const src = fs.readFileSync(VP, 'utf8').replace('if (!M || M.day !== day || M.seed !== (vil.dbId | 0))', 'if (!M || M.seed !== (vil.dbId | 0))');
    const m = new Module(VP, module); m.filename = VP; m.paths = Module._nodeModulePaths(path.dirname(VP)); m._compile(src, VP); require.cache[VP] = m;
  }
  const Villages = require(VP);
  const F = Villages.__farmBind();
  let calls = 0;
  const vcf = F._villageCropFor;
  const mk = (dbId) => {
    const v = { dbId, name: 'm' + dbId, ccx: 100, ccy: 100, _crop: new Map(), _drySet: new Set(), _farmSet: new Set(), _cropClaim: new Set() };
    for (let x = 0; x < 18; x++) for (let y = 0; y < 14; y++) { const k = (100 + x) + ',' + (100 + y); v._farmSet.add(k); if ((x * 7 + y * 3 + dbId) % 5 < 2) v._drySet.add(k); }
    return v;
  };
  const vils = [3, 7, 11, 42, 1020].map(mk);
  const h = crypto.createHash('sha1');
  let n = 0;
  for (let day = 0; day < 730; day++) {
    for (const v of vils) {
      const row = [];
      for (const k of v._farmSet) { const p = F._cellTask(v, k, day); row.push(p); n++;
        if (p > 0 && (n % 3) === 0) F._lifeDoTask0(v, null, k, day); }   // 일을 조금씩 한다 — 셀이 차고(파종) 익고(수확) 비는 판
      for (const k of v._farmSet) F._cellTask(v, k, day);   // 같은 날 두 번째 — 기억이 쓰이는 자리
      h.update(day + ':' + v.dbId + ':' + row.join(''));
      for (const [k, e] of v._crop) F.cropDayTick ? F.cropDayTick(e, !v._drySet.has(k), day, k) : null;
    }
  }
  return { hash: h.digest('hex').slice(0, 16), n, crops: vils.reduce((s, v) => s + v._crop.size, 0), memo: process.env.T818_CELL_MEMO === '1' };
}

if (process.argv[2] === '--child') { const o = child(); process.stdout.write('\n@@JSON@@' + JSON.stringify(o)); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };
const run = (env) => JSON.parse(String(execFileSync(process.execPath, [__filename, '--child'], { env: Object.assign({}, process.env, { T818_CELL_MEMO: '', T818_BAIT: '' }, env), encoding: 'utf8', maxBuffer: 1 << 26 })).split('@@JSON@@').pop());

console.log('\n=== T818 ③ 빈 셀 파종 판정 기억 = 종전 값 ===');
const OFF = run({}), ON = run({ T818_CELL_MEMO: '1' });
console.log('\n① 같은 값');
ok(OFF.n > 100000 && OFF.crops > 0, '[상황] 판 — 마을 다섯 · 셀 252 씩 · 730날 · 파종 · 수확이 돈다', `판정 ${OFF.n} · 끝 날 작물 ${OFF.crops}`);
ok(ON.hash === OFF.hash && ON.crops === OFF.crops, '★★켬 = 끔 — `_cellTask` 줄 730날이 한 글자 같다(작물 상태기 같이)', `${ON.hash} / ${OFF.hash}`);
console.log('\n③ 미끼');
const BAIT = run({ T818_CELL_MEMO: '1', T818_BAIT: '1' });
ok(BAIT.hash !== OFF.hash, '★미끼 — 날을 열쇠에서 뺀 사본은 끔과 갈린다(위 같음은 자명 통과가 아니다)', `${BAIT.hash} / ${OFF.hash}`);
console.log('\n④ 글자');
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/const T818_CELL_MEMO = process\.env\.T818_CELL_MEMO === '1';/.test(V), "손잡이 — '1' 만 켬");
ok(V.includes("    return _villageCropFor(vil, nong ? '논' : '밭', _Crops().monthOf(day), par) ? 2 : 0;\n  }\n  return cropTaskOf(e, nong, day);"), '끔 갈래 = 종전 줄 그대로');
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
