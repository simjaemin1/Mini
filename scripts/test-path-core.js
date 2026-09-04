#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-path-core.js — 경로 정본 검사기를 러너에 물린다 =================
//
// ★왜 [T85 2026-09-03 재민 확정]
//   `sim/_path-core-test.js` 는 경로 **정본**(랩·서버 공용 `sim/path-core.js`)의 계약을 재는
//   검사기인데, **아무도 안 돌리고 있었다** — 러너의 자동 발견은 `scripts/*` 만 훑고
//   (`run-regress.sh` `_disc`), 그 파일은 `sim/` 에 있어 표(`// @regress`)를 붙일 자리가 없었다.
//   ⇒ 손으로만 돌던 검사기가 러너 밖에 있으면, 그건 **없는 검사**다(회귀를 못 잡는다).
//   T85 가 그 파일에 재개 가능 A* 절(비트 동일·예산 1노드·번갈아·돌연변이)을 더하면서
//   더더욱 러너 안에 있어야 했다.
//
// ★이 파일은 **아무것도 다시 짜지 않는다** — 정본 검사기를 그대로 자식으로 돌리고 결과만 옮긴다
//   (검사를 옮겨 적으면 그게 사본이고, 그날부터 둘이 갈린다).
//
// 실행: node scripts/test-path-core.js
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TARGET = path.join(ROOT, 'sim', '_path-core-test.js');

const r = spawnSync(process.execPath, [TARGET], { cwd: ROOT, encoding: 'utf8' });
process.stdout.write(r.stdout || '');
if (r.stderr) process.stderr.write(r.stderr);

const line = (r.stdout || '').split('\n').reverse().find((l) => /^(PASS|FAIL) \d+\/\d+/.test(l)) || '';
const m = line.match(/^(PASS|FAIL) (\d+)\/(\d+)/);
const okAll = r.status === 0 && m && m[1] === 'PASS';
const n = m ? +m[3] : 0;

// ★자명 통과 금지 — 자식이 **실제로 무언가를 쟀는지**까지 본다.
//   (파일이 지워지거나 첫 줄에서 죽어도 `status` 만 보면 초록으로 보일 수 있다.)
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + msg + (extra ? `  ${extra}` : '')); };
ok(!!m, '① 정본 검사기가 결과줄을 냈다(파일이 살아 있고 끝까지 돌았다)', line || '(결과줄 없음)');
ok(n >= 30, '② [상황] 실제로 여러 건을 쟀다 — 빈 검사기가 통과한 게 아니다', `${n}건`);
ok(okAll, '★★③ `sim/_path-core-test.js` 전부 통과(경로 정본 계약 · T85 재개 가능 A* 절 포함)', line);

console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
