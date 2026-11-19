#!/usr/bin/env node
// @regress
// @bait 1   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// @date-ok `Date.UTC(2000, …)` 는 "인수 준 Date.UTC 는 안 민다"를 재는 고정 인수 — 벽시계와 안 맞댄다 [T1356]
// === scripts/test-clock-shift.js — 야간 "+30일 판" 의 시계 밀기(`lib-phase.shift` · 프리로드 `clock-shift.js` · `nightly-run.sh NIGHT_CLOCK_DAYS`) [T1356 ③] ==========
//   하네스 도구 검사(제품 무관 — 존 설정의 하루 길이만 읽는다):
//   ① 프리로드를 실은 node 의 벽시계가 꼭 N 날 앞이다(`Date.now` · 인수 없는 `new Date()` · `Date()` 글자) · 인수 준 `new Date(t)` · `Date.UTC` 는 그대로
//   ② 아이 · 손자 프로세스도 같은 상수(env `T1356_CLOCK_SHIFT_DAYS` 와 `NODE_OPTIONS` 프리로드를 물려받는다 — 판 묶음의 서버가 하네스와 같은 날을 본다)
//   ③ 30일 = 게임 하루(존 설정 `dayLengthMs`)의 정수배 — 게임 낮밤(`worldPhase`)이 안 바뀐다 · 가상 시계 판(`T745_VCLOCK=1`)은 안 민다
//   ④ 야간 러너가 손잡이를 받으면 머리에 민 날짜를 적고 보고 이름을 가른다(예행 `NIGHT_DRY=1` · 목록 덮어쓰기 — 하네스 0 개를 돈다)
//   ★미끼 — `lib-phase.js` 사본 한 곳: `shift` 가 `Date.now` 를 안 옮긴다(인수 없는 `new Date()` 만) → ① 빨강.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), CS = path.join(__dirname, 'clock-shift.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? '  ' + x : '')); };
const DAY = 86400000, N = 30;
// 아이: 지금 · 인수 준 Date · 손자의 지금을 한 줄 JSON 으로(실제 벽시계 = `performance.timeOrigin + performance.now()` — 옮기지 않는 단조 축)
const KID = "const real = () => performance.timeOrigin + performance.now(); const { execFileSync } = require('child_process');"
  + "const g = process.argv[1] === 'g' ? null : JSON.parse(execFileSync(process.execPath, ['-e', process.env.__KID, 'g'], { encoding: 'utf8' }));"
  + "console.log(JSON.stringify({ off: Date.now() - real(), str: Date().slice(0, 15) === new Date(real() + (Date.now() - real())).toString().slice(0, 15), fixed: new Date(0).getTime(), utc: Date.UTC(2000, 0, 1), g }));";
function kid(env) {
  const r = spawnSync(process.execPath, ['-e', KID], { encoding: 'utf8', env: { ...process.env, __KID: KID, NODE_OPTIONS: `--require ${CS}`, T1356_CLOCK_SHIFT_MS: '', ...env } });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return { err: (r.stderr || r.stdout || '').slice(-200) }; }
}
const near = (a, b) => Math.abs(a - b) < 5000;   // 프로세스 띄움 사이 흐른 몇 ms
console.log('\n=== 야간 +30일 판 — 시계 밀기 (T1356) ===');
const K = kid({ T1356_CLOCK_SHIFT_DAYS: String(N) });
ok(!K.err && near(K.off, N * DAY) && K.str, `① 프리로드를 실은 node 의 지금이 꼭 ${N}날 앞(Date.now · Date() 글자)`, K.err || `${(K.off / DAY).toFixed(4)}날`);
ok(!K.err && K.fixed === 0 && K.utc === 946684800000, '① 인수 준 `new Date(t)` · `Date.UTC` 는 그대로(주입한 고정 시각은 안 민다)', K.err || `${K.fixed} · ${K.utc}`);
ok(!K.err && K.g && near(K.g.off, N * DAY), '② 손자 프로세스도 같은 상수(env 를 물려받는다)', K.err || `${K.g ? (K.g.off / DAY).toFixed(4) : '?'}날`);
const V = kid({ T1356_CLOCK_SHIFT_DAYS: String(N), T745_VCLOCK: '1' });
ok(!V.err && near(V.off, 0), '③ 가상 시계 판(T745_VCLOCK=1)은 안 민다(시각을 가상 시계가 정한다)', V.err || `${(V.off / DAY).toFixed(4)}날`);
const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
ok((N * DAY) % ZC.WORLD.dayLengthMs === 0 && !ZC.WORLD.worldEpoch, `③ ${N}날 = 게임 하루(${ZC.WORLD.dayLengthMs}ms)의 정수배 — 게임 낮밤이 안 바뀐다`, `${(N * DAY) / ZC.WORLD.dayLengthMs}게임일`);
{
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 't1356-cs-')), LOG = path.join(T, 'r.log');
  const r = spawnSync('bash', [path.join(ROOT, 'scripts', 'nightly-run.sh')], { cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, LOG, NIGHT_DRY: '1', NIGHT_LIST: 'test-none.js', NIGHT_CLOCK_DAYS: String(N), NIGHT_UNSHALLOW: '0', NIGHT_NO_FONT: '1', NODE_OPTIONS: '' } });
  const lg = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '';
  const m = /\[시계\] \+(\d+)일 판 — node 가 보는 지금 (\S+) · 상자 시계 (\S+)/.exec(lg);
  const d = m ? (Date.parse(m[2]) - Date.parse(m[3])) / DAY : null;
  ok(r.status === 0 && !!m && +m[1] === N && d != null && Math.abs(d - N) < 0.01, `④ 야간 러너가 NIGHT_CLOCK_DAYS=${N} 를 받으면 머리에 민 날짜를 적는다(node 에게 물은 지금 − 상자 시계 = ${N}날)`, m ? `${m[2]} − ${m[3]} = ${d && d.toFixed(3)}날` : `rc ${r.status} · ${(r.stderr || '').slice(0, 120)}`);
  const sh = fs.readFileSync(path.join(ROOT, 'scripts', 'nightly-run.sh'), 'utf8');
  ok(/elif \[ -n "\$CLOCK_DAYS" \]; then OUTMD="보고\/야간러너_\$\{DAY\}_시계\+\$\{CLOCK_DAYS\}일\.md"/.test(sh) && /regress-clock\$\{CLOCK_DAYS\}\.log/.test(sh), '④ 시계 판은 보고 · 로그 이름을 가른다(보통 판 보고를 안 덮는다)', '');
  try { fs.rmSync(T, { recursive: true, force: true }); } catch (e) { /* 임시 */ }
}
// ★미끼 — lib-phase 사본의 `shift` 에서 `Date.now` 옮김만 뺀다 → ① 빨강(지금이 안 밀린다). 사본은 임시 자리에 clock-shift 와 같이 둔다.
{
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 't1356-csb-'));
  const src = fs.readFileSync(path.join(__dirname, 'lib-phase.js'), 'utf8'), TAIL = 'PDate.parse = RD.parse; PDate.UTC = RD.UTC;\n  glo' + 'bal.Date = PDate;\n  global.__t1356Shift', FROM = '  PDate.now = () => rnow() + off; ' + TAIL;
  const n = src.split(FROM).length - 1;
  fs.writeFileSync(path.join(T, 'lib-phase.js'), src.replace(FROM, '  ' + TAIL)); fs.writeFileSync(path.join(T, 'phase-pin.js'), ''); fs.copyFileSync(CS, path.join(T, 'clock-shift.js'));
  const r = spawnSync(process.execPath, ['-e', KID], { encoding: 'utf8', env: { ...process.env, __KID: KID, NODE_OPTIONS: `--require ${path.join(T, 'clock-shift.js')}`, T1356_CLOCK_SHIFT_MS: '', T1356_CLOCK_SHIFT_DAYS: String(N) } });
  let B = null; try { B = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { B = null; }
  ok(n === 1 && !!B && near(B.off, 0) && B.fixed === 0, '미끼 — `shift` 가 `Date.now` 를 안 옮기는 lib-phase 사본 → ① 빨강(지금이 안 밀린다 · 판은 돈다)', `바꾼 자리 ${n} · 사본의 지금 ${B ? (B.off / DAY).toFixed(3) : '?'}날`);
  try { fs.rmSync(T, { recursive: true, force: true }); } catch (e) { /* 임시 */ }
}
console.log(`\n=== test-clock-shift 결과: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
