// (@regress 없음 — 러너 밖 · T899 정적 자 · 제품 무변 · `test-harness-lint ⑬` 이 `scanSrc`/`census` 를 부른다)
// === scripts/t899-wait-census.js — 서버를 띄우고 **부팅 시간을 가정한 고정 sleep** 으로 기다리는 자리 전수 ===
//
// ★왜 [T899 · PM 착지 10-23b test-car-fast] 2코어 상자에서 부팅이 100초를 넘자 고정 `sleep(100000)` 이 날 0 에서 저장해 상황 빨강이 됐다.
//   부팅 증인은 아이의 입(`fixture-boot.waitUp` · T344) 또는 `/health` 다 — 고정 sleep 은 상자가 느리면 빨강, 빠르면 헛기다림이다.
//   이 자는 `scripts/*.js` · `scripts/*.sh` 중 central · 존(또는 서버 판 자)을 띄우는 파일마다, 띄우는 줄 뒤 **처음 기다리는 것**이 무엇인지 본다:
//     · 준비 증인(ready) — `waitUp(` · `/health` · `waitHttp(` · `up on` 표식 · `/zones`(central 문) · 그 파일이 그것들로 만든 손(`health()` · `waitH(` …)
//     · 끝 기다림(exit) — 스스로 닫히는 판(t577 · `T577_DAYS`)을 `exit` 로 기다림(`exitOf(` · `wait(c` · `on/once('exit'`) — 부팅을 가정하지 않는다
//     · 두드림(poll) — 고리 안의 sleep(`while`/`for` 몸)으로 결과 파일 · 로그 · 날을 두드림 — 부팅 길이를 가정하지 않는다
//     · 고정 대기(fixed) — `sleep(N)` · `setTimeout(…, N)` · 셸 `sleep N`(N ≥ 1초)이 증인보다 먼저 — "부팅 가정"
//       (끄기 손 `kill … sleep` 은 부팅 가정이 아니라 건너뛴다)
//   띄우는 줄 뒤 아무것도 없으면 "증인 없음"이다.
//   node scripts/t899-wait-census.js [--regress] [--json <out>]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const A = process.argv.slice(2);
const onlyReg = A.includes('--regress');
const SPAWN = /\bspawn\s*\(|\bfork\s*\(|\bboot\s*\(\s*['"](central|zone)/;
const SERVER = /(central|zone)\.js|t577-server-run|server-baseline-check|['"](central|zone)['"]/;
const SH_SPAWN = /(^|\s)node\b[^#]*server\/(central|zone)\.js[^#]*&\s*$|docker\s+(run|start|restart)|\brecreate\s/;
const READY0 = /waitUp\s*\(|\/health|waitHttp\s*\(|server up on|zone server up|central server up|['"`]up on|waitReady|waitUntilUp|waitServer|waitZone\s*\(|waitCentral\s*\(|waitPort\s*\(|\.waitFor(Up|Ready)\s*\(|\/zones\b|\bwait_?health\b/;
const EXIT = /(?<!process)\.on\s*\(\s*['"]exit['"]|exitOf\s*\(|\bwait\s*\(\s*\w+\s*,|once\s*\(\s*['"]exit['"]|\bexitP\b|waitExit\s*\(/;
const FIXED = /\bsleep\s*\(\s*([0-9_]+(?:\s*\*\s*[0-9_]+)?)\s*\)|setTimeout\s*\([^;]*?,\s*([0-9_]+(?:\s*\*\s*[0-9_]+)?)\s*\)/;
const SH_FIXED = /(^|[;&|\s])sleep\s+([0-9.]+)\b/;
const num = (s) => s.replace(/_/g, '').split('*').map((x) => +x.trim()).reduce((a, b) => a * b, 1);
const LOOP = /\b(while|for)\s*\(|\bfor\s+\w+\s+in\b|\bwhile\b.*;\s*do\b|\bdo\b\s*$/;
// 그 파일이 준비 증인으로 만든 손 이름(`const health = …/health…` · `function waitH(…) { …/health… }` · `wait_h() { …/health… }`)
const helpers = (L) => { const s = new Set(); for (const l of L) { const m = l.match(/(?:const|let|function|async function)\s+(\w+)\s*(?:=|\()|^\s*(\w+)\s*\(\)\s*\{/); if (m && READY0.test(l)) s.add(m[1] || m[2]); } return s; };
// 한 파일 → 띄우는 자리마다 첫 기다림 { file, regress, spawn, first: { kind: ready|exit|poll|fixed|none, line, ms, text } }
function scanSrc(f, src) {
  const rows = [];
  const sh = f.endsWith('.sh');
  const reg = /^(\/\/|#) @regress(\s|$)/m.test(src);
  const L = src.split('\n');
  const H = helpers(L);
  const READY = H.size ? new RegExp(READY0.source + '|\\b(' + [...H].join('|') + ')\\b\\s*' + (sh ? '' : '\\(')) : READY0;
  const isCom = (l) => (sh ? /^\s*#/ : /^\s*\/\//).test(l);
  const spawns = [];
  for (let i = 0; i < L.length; i++) {
    const l = L[i]; if (isCom(l)) continue;
    if (sh ? SH_SPAWN.test(l) : (SPAWN.test(l) && SERVER.test(l + (L[i + 1] || '')))) spawns.push(i);
  }
  for (const s of spawns) {
    let first = null;
    for (let j = s + 1; j < Math.min(L.length, s + 400); j++) {
      const l = L[j]; if (isCom(l)) continue;
      if (READY.test(l)) { first = { kind: 'ready', line: j + 1, text: l.trim().slice(0, 120) }; break; }
      // 끝 기다림은 **기다릴 때**만 — `const zx = exitOf(z)` 처럼 약속만 잡아 두고 고정 sleep 을 먼저 기다리면 부팅 가정이다(PM 10-23b 전 test-car-fast)
      if (!sh && EXIT.test(l) && (/\bawait\b|\breturn\b|\bres(olve)?\s*\(/.test(l) || /\bres(olve)?\s*\(/.test(L.slice(j + 1, j + 8).join('\n')))) { first = { kind: 'exit', line: j + 1, text: l.trim().slice(0, 120) }; break; }
      const m = sh ? l.match(SH_FIXED) : l.match(FIXED);
      if (m) {
        const ms = sh ? Math.round(+m[2] * 1000) : num(m[1] || m[2]);
        const kill = /\bkill/.test(l), loop = LOOP.test(l) || LOOP.test(L[j - 1] || '');
        if (loop) { first = { kind: 'poll', line: j + 1, text: l.trim().slice(0, 120) }; break; }
        if (ms >= 1000 && !kill) { first = { kind: 'fixed', ms, line: j + 1, text: l.trim().slice(0, 120) }; break; }
      }
    }
    rows.push({ file: f, regress: reg, spawn: s + 1, first: first || { kind: 'none' } });
  }
  return rows;
}
function census(dir, onlyRegress) {
  const rows = [];
  for (const f of fs.readdirSync(dir).filter((x) => /\.(js|sh)$/.test(x)).sort()) {
    if (f === path.basename(__filename)) continue;
    const r = scanSrc(f, fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const x of r) if (!onlyRegress || x.regress) rows.push(x);
  }
  return rows;
}
module.exports = { scanSrc, census };
if (require.main !== module) return;
const rows = census(DIR, onlyReg);
const files = [...new Set(rows.map((r) => r.file))];
const K = (k) => rows.filter((r) => r.first.kind === k);
console.log(`서버를 띄우는 파일 ${files.length}(@regress ${new Set(rows.filter((r) => r.regress).map((r) => r.file)).size}) · 띄우는 자리 ${rows.length}`);
console.log(`  첫 기다림 = 준비 증인 ${K('ready').length} · 끝 기다림 ${K('exit').length} · 두드림 ${K('poll').length} · 고정 대기 ${K('fixed').length} · 증인 없음 ${K('none').length}`);
console.log(`\n고정 대기가 먼저인 자리 ${K('fixed').length}(@regress ${K('fixed').filter((r) => r.regress).length}):`);
for (const r of K('fixed').sort((a, b) => (b.regress - a.regress) || a.file.localeCompare(b.file))) console.log(`  ${r.regress ? '[R]' : '   '} ${r.file}:${r.spawn} → ${r.first.line} sleep ${r.first.ms}ms  ${r.first.text}`);
console.log(`\n증인 없음(띄우고 기다리는 줄이 없다) ${K('none').length}:`);
for (const r of K('none')) console.log(`  ${r.regress ? '[R]' : '   '} ${r.file}:${r.spawn}`);
const out = A.indexOf('--json'); if (out >= 0) fs.writeFileSync(A[out + 1], JSON.stringify({ rows }, null, 1));
process.exit(0);
