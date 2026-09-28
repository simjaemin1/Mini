#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-redeploy-light.js — `redeploy-light.sh` 가 **무엇을 띄우라고 부르나** (T485) ===============
//
// ★`test-redeploy` 문법 그대로 — **진짜 스크립트를 돌린다**(판정 사본 0). 가짜 `docker`·`sleep` 을 PATH 앞에 세워
//   `docker run` 에 넘어간 인자를 줄마다 적고 그 줄을 읽는다.
//   ⓐ 두 호스트 손잡이(`CENTRAL_SECRET` · `EXTRA_ENV`)를 **안 주면** 베이스 스크립트(`git show <BASE>:scripts/redeploy-light.sh`)와
//      인자 줄이 **바이트로 같다**(한 호스트 동작 비트 동일).
//   ⓑ `CENTRAL_SECRET` 을 주면 `-e CENTRAL_SECRET` **이름만** 실리고 값은 어디에도 안 찍힌다.
//   ⓒ `EXTRA_ENV` 낱말마다 `-e` 한 개.
// 실행: node scripts/test-redeploy-light.js [BASE=origin/main]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const BASE = process.argv[2] || 'origin/main';
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rltest-'));
const BIN = path.join(TMP, 'bin'); fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'docker'), `#!/bin/sh
case "$1" in
  run) echo "$*" >> "$FAKE_LOG" ;;
  inspect) case "$*" in *Health*) echo healthy ;; *) echo running ;; esac ;;
  ps) echo "durango-zone-x\tUp" ;;
esac
exit 0
`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'sleep'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'free'), '#!/bin/sh\necho "Mem: 1 1 1"\n', { mode: 0o755 });
function run(script, env) {
  const log = path.join(TMP, `log-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(log, '');
  let out = '';
  try {
    out = execFileSync('bash', [script], { env: Object.assign({ PATH: `${BIN}:${process.env.PATH}`, HOME: TMP, FAKE_LOG: log }, env), stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
  return { runs: fs.readFileSync(log, 'utf8'), out };
}
// /srv/durango 대신 — 스크립트는 mkdir -p /srv/durango/<id> 를 한다(이 상자에선 root 라 된다 · 아니면 실패를 적는다)
const baseSh = path.join(TMP, 'base.sh');
fs.writeFileSync(baseSh, execFileSync('git', ['show', `${BASE}:scripts/redeploy-light.sh`], { cwd: ROOT }));
const newSh = path.join(ROOT, 'scripts', 'redeploy-light.sh');
console.log(`\n=== redeploy-light — 두 호스트 손잡이 (베이스 ${BASE}) ===`);
for (const [tag, env] of [['기본(11존)', {}], ['RUN_ZONES=nippon · CENTRAL_IP 바꿈', { RUN_ZONES: 'nippon', CENTRAL_IP: '203.0.113.9' }], ['STOP_OTHERS=1', { STOP_OTHERS: '1', RUN_ZONES: 'hanbando jungwon_n' }]]) {
  const a = run(baseSh, env), b = run(newSh, env);
  ok(a.runs.length > 0 && a.runs === b.runs, `ⓐ [${tag}] 손잡이 안 주면 docker run 인자가 베이스와 **바이트로 같다**`, `${a.runs.split('\n').filter(Boolean).length}줄`);
  const norm = (t) => t.replace(/\b\d+s\b/g, 'Ns');   // 준비 대기 줄의 경과 초(벽시계)만 지운다
  ok(norm(a.out) === norm(b.out), `ⓐ [${tag}] 화면도 같다(경과 초 빼고)`);
}
{
  const SEC = 'zz-test-secret-' + Date.now();
  const r = run(newSh, { RUN_ZONES: 'nippon', CENTRAL_IP: '203.0.113.9', CENTRAL_SECRET: SEC, EXTRA_ENV: 'CHAR_SPRITE=on ZONE_HOST_HANBANDO=203.0.113.9' });
  const line = r.runs.trim();
  ok(/ -e CENTRAL_SECRET( |$)/.test(line), 'ⓑ CENTRAL_SECRET 을 주면 `-e CENTRAL_SECRET` **이름만** 실린다');
  ok(!line.includes(SEC) && !r.out.includes(SEC), 'ⓑ 비밀 값은 docker 인자에도 화면에도 **없다**');
  ok(/ -e CHAR_SPRITE=on /.test(line) && / -e ZONE_HOST_HANBANDO=203\.0\.113\.9 /.test(line), 'ⓒ EXTRA_ENV 낱말마다 `-e` 한 개', line.split(' -e ').slice(-3).join(' | ').slice(0, 120));
  ok(/ durango-zone$/.test(line), 'ⓒ 이미지 이름은 끝 그대로');
  const r0 = run(newSh, { RUN_ZONES: 'nippon', CENTRAL_SECRET: '' });
  ok(!/CENTRAL_SECRET/.test(r0.runs), 'ⓑ 빈 CENTRAL_SECRET 은 안 싣는다(없는 것과 같다)');
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
