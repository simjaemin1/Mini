#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-nightly.js — 야간 기계 둘의 자(`nightly-run.sh` · `nightly-report.js`) [T293 2026-09-14 · 재민 확정] ===
//
// ★무엇을 재나: `scripts/nightly-report.js` 가 **로그만 읽고** 야간 보고 표를 옳게 내는가.
//   이 자가 없으면 보고기는 "빨강이 없다고 말하는 기계"가 되기 쉽다 — 그건 이 저장소에서
//   제일 위험한 답이다(조용한 빈 목록과 같은 자리).
//
// ★서버·브라우저 0 · 1초 안 · 픽스처는 **여기서 만들고 여기서 지운다**(/tmp).
//
// 픽스처 둘(카드 T293 ⓐ):
//   ① 빨강 셋 — ⓐ 상시 목록에 있는 것 · ⓑ 단독 재실행에서 초록이 되는 것 · ⓒ 남는 것(모델 몫)
//      + 목록에 있는데 안 돈 것(미측정) + 열렸는데 안 닫힌 것(끊김)
//   ② 전부 초록 — 같은 자로 재면 **다른 답**이 나와야 한다(자명 통과 금지)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REPORT = path.join(ROOT, 'scripts', 'nightly-report.js');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't293-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} });

// ── 픽스처 만들기 — 러너가 실제로 찍는 꼴 그대로(도장 + 본문) ────────────────
const stamp = (hh, mm) => `2026-09-14T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+0900`;
function L(hh, mm, s) { return `${stamp(hh, mm)} ${s}`; }
function block(hh, mm, name, ok0, marks) {
  const out = [L(hh, mm, `##### ${name} #####`)];
  for (const m of marks || []) out.push(L(hh, mm, `  ✗ ${m}`));
  out.push(L(hh, mm + 1, ok0 ? '  ✓ RC=0' : '  ✗ RC=1 · 결과줄 22개 → **실패로 센다**'));
  return out;
}

const LIST1 = ['test-tick-slicer.js', 'e2e-cold.js', 'test-imaginary.js', 'test-calendar.js', 'e2e-neverran.js', 'e2e-cutoff.js'];
const log1 = [
  L(4, 0, '===== nightly-run 시작 · TZ=Asia/Seoul · base=deadbeef ====='),
  L(4, 0, '  [auto] 2026-09-14 · 묶음 3개 → **C**'),
  L(4, 0, `  [오늘] 묶음 C · ${LIST1.length}종`),
  L(4, 0, `  [목록] ${LIST1.join(' ')} `),
  ...block(4, 10, 'test-tick-slicer.js', false, ['⑥a 막힘 11,308ms', '⑧ 잡음 바닥 0.612%']),
  ...block(4, 20, 'e2e-cold.js', false, ['존 입장 — 월드 안이다  5625ms 기다림']),
  ...block(4, 30, 'test-imaginary.js', false, ['③ 값이 바뀌었다 7 → 9']),
  ...block(4, 40, 'test-calendar.js', true, []),
  L(5, 0, '##### e2e-cutoff.js #####'),            // 열렸는데 안 닫혔다 = 끊김
  L(5, 30, '===== 본 판 끝 ====='),
].join('\n') + '\n';
const retry1 = [
  L(5, 40, '===== 단독 재실행: test-tick-slicer.js ====='),
  ...block(5, 40, 'test-tick-slicer.js', false, ['⑥a 막힘 9,900ms']),
  L(5, 50, '===== 단독 재실행: e2e-cold.js ====='),
  ...block(5, 50, 'e2e-cold.js', true, []),        // ★단독에선 초록
  L(6, 0, '===== 단독 재실행: test-imaginary.js ====='),
  ...block(6, 0, 'test-imaginary.js', false, ['③ 값이 바뀌었다 7 → 9']),
].join('\n') + '\n';

const LIST2 = ['test-calendar.js', 'test-kcal.js'];
const log2 = [
  L(4, 0, '===== nightly-run 시작 · TZ=Asia/Seoul · base=cafef00d ====='),
  L(4, 0, `  [오늘] 묶음 A · ${LIST2.length}종`),
  L(4, 0, `  [목록] ${LIST2.join(' ')} `),
  ...block(4, 5, 'test-calendar.js', true, []),
  ...block(4, 9, 'test-kcal.js', true, []),
  L(4, 12, '===== 본 판 끝 ====='),
].join('\n') + '\n';

const f1 = path.join(TMP, 'a.log'), f2 = path.join(TMP, 'b.log');
fs.writeFileSync(f1, log1); fs.writeFileSync(f1 + '.retry', retry1);
fs.writeFileSync(f2, log2); fs.writeFileSync(f2 + '.retry', '');
// 상시 목록도 픽스처다 — 레포 파일이 바뀌어도 이 자는 안 흔들린다(그 파일의 내용은 PM 몫이다).
const known = path.join(TMP, 'known.txt');
fs.writeFileSync(known, [
  '# 픽스처',
  'test-tick-slicer.js | 기계 의존 | 공통.md §2 ⑥ (T185)',
  'e2e-cold.js | 부하 거짓 빨강 | 야간 09-13·09-14',
].join('\n') + '\n');
const knownNoSlicer = path.join(TMP, 'known2.txt');
fs.writeFileSync(knownNoSlicer, 'e2e-cold.js | 부하 거짓 빨강 | 야간 09-13·09-14\n');

const run = (args) => execFileSync(process.execPath, [REPORT, ...args], { cwd: ROOT, encoding: 'utf8' });
const md = (log, kn) => run(['--log', log, '--base', 'deadbeef', '--known', kn || known]);

console.log('\n=== ① 픽스처 하나 — 빨강 셋이 셋으로 갈린다 ===');
const A = md(f1);
ok(/상시 밖 빨강 1건\*\*/.test(A), '★한 줄 답이 **상시 밖 빨강 1건**이다 (셋 중 둘은 상시)', (A.split('\n').find((l) => l.startsWith('## ★')) || '').slice(0, 70));
ok(/\| `test-tick-slicer` \|.*\*\*상시\(기계 의존\)\*\*/.test(A), 'ⓐ 상시 목록에 있는 빨강은 **상시(이유)** 로 적힌다');
ok(/\| `e2e-cold` \|.*★\*\*단독 초록\*\*/.test(A), 'ⓑ 단독 재실행에서 초록이 된 것은 **단독 초록** 으로 적힌다');
ok(/\| `test-imaginary` \|.*\*\*귀속: 모델 몫\*\*/.test(A), 'ⓒ 상시 목록에 **없는** 빨강만 귀속이 비어 있다');
ok(/## 4\. 아침에 세션으로 넘길 빨강[\s\S]*`test-imaginary`/.test(A), '§4 가 그 하나만 넘긴다');
ok(!/## 4\.[\s\S]*`test-tick-slicer`/.test(A), '★상시는 §4 에 **안** 올라간다 (아침에 볼 것은 모델 몫뿐)');
ok(/## 3\. 미측정 1종[\s\S]*e2e-neverran/.test(A), '목록에 있는데 안 돈 것이 **미측정**으로 센다', '1종');
ok(/끊김[\s\S]*e2e-cutoff/.test(A), '열렸는데 안 닫힌 것은 **끊김**이다(빨강 아님)');
ok(/시작 \*\*04:00\*\* → 종료 \*\*05:30\*\* \(1시간 30분\)/.test(A), '시작·종료·소요를 **로그 도장**에서 읽는다');
ok(/기준 커밋 `deadbeef`/.test(A), '기준 커밋은 인자다(제가 git 을 안 부른다)');

console.log('\n=== ② 자명 통과 금지 — 같은 자를 다른 로그·다른 목록에 대면 답이 바뀐다 ===');
const B = md(f2);
ok(/상시 밖 빨강 0건/.test(B) && /빨강 \*\*0종\*\*/.test(B), '★전부 초록인 로그는 **0건**이라고 답한다 (①의 초록이 자명이 아니다)', (B.split('\n').find((l) => l.startsWith('## ★')) || '').slice(0, 60));
ok(!/test-imaginary/.test(B), '②의 보고에 ①의 이름이 안 샌다 (로그만 읽는다)');
const C = md(f1, knownNoSlicer);
ok(/상시 밖 빨강 2건\*\*/.test(C) && /\| `test-tick-slicer` \|.*\*\*귀속: 모델 몫\*\*/.test(C),
   '★상시 목록에서 한 줄을 빼면 그 하네스가 **모델 몫**으로 옮겨 간다 (목록을 진짜로 읽는다)', '1건 → 2건');

console.log('\n=== ③ 결정적인가 — 같은 로그면 바이트가 같다 ===');
const A2 = md(f1);
ok(A === A2, '★같은 로그를 두 번 넣으면 **바이트가 같다**', `${Buffer.byteLength(A)}B`);
ok(A !== B, '자명 통과 금지 — 다른 로그면 바이트가 다르다', `${Buffer.byteLength(A)}B vs ${Buffer.byteLength(B)}B`);
{
  // ★주석은 뺀다 — 보고기 머리가 *"`Date.now()` 를 안 쓴다"* 고 **적어 두었기** 때문이다.
  //   글자를 세는 자는 주석까지 세고, 그러면 이 줄은 **문서를 고치면 빨개지는** 엉뚱한 자가 된다.
  const code = fs.readFileSync(REPORT, 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ok(!/new Date\(\)|Date\.now\(\)|Math\.random|process\.hrtime/.test(code),
     '★보고기 **코드**에 시각·난수가 하나도 없다 (결정성의 근거를 코드에서 센다)');
  ok(/Date\.now\(\)/.test(fs.readFileSync(REPORT, 'utf8')),
     '★자명 통과 금지 — 같은 자로 **주석까지** 세면 걸린다(그래서 주석을 뺐다는 증거)');
}

console.log('\n=== ④ --reds — 러너가 단독 재실행 목록을 여기서 받는다 ===');
const reds = run(['--reds', f1]).trim().split('\n').filter(Boolean);
ok(reds.join(' ') === 'test-tick-slicer.js e2e-cold.js test-imaginary.js', '빨강 셋을 **로그 차례대로** 낸다', reds.join(' '));
ok(!reds.includes('e2e-cutoff.js'), '★끊긴 것은 재실행 목록에 **안** 넣는다 (안 잰 것을 빨강으로 안 센다)');
ok(!reds.includes('test-calendar.js'), '초록은 안 넣는다');
ok(run(['--reds', f2]).trim() === '', '자명 통과 금지 — 전부 초록인 로그면 **빈 목록**이다');

console.log('\n=== ⑤ 이름 규칙을 안 믿는다 (러너 출력만 본다) ===');
ok(/\| `test-imaginary` \|/.test(A), '`test-` 로 시작해도 빨강이면 표에 든다 (단위라고 봐주지 않는다)');
ok(/\| `e2e-cold` \|/.test(A), '`e2e-` 도 같은 자로 잰다');
{
  // 러너 표식이 아니라 **이름**으로 갈랐다면 이 줄이 깨진다: 이름이 둘 다 아닌 하네스
  const odd = [L(4, 0, '===== nightly-run 시작 ====='), L(4, 0, '  [오늘] 묶음 A · 1종'), L(4, 0, '  [목록] 이상한이름.js '),
               ...block(4, 1, '이상한이름.js', false, ['① 틀렸다'])].join('\n') + '\n';
  const f3 = path.join(TMP, 'c.log'); fs.writeFileSync(f3, odd);
  const D = run(['--log', f3, '--base', 'x', '--known', known]);
  ok(/\| `이상한이름` \|/.test(D) && /상시 밖 빨강 1건\*\*/.test(D), '★`test-`·`e2e-` 어느 쪽도 아닌 이름도 그대로 센다', '이상한이름');
}

console.log('\n=== ⑥ nightly-run.sh — 두 개가 뜨면 둘째가 죽는다 ===');
{
  // 하네스가 전부 central 3010 · zone 3020 을 쓴다(러너 머리 ②). 두 개가 돌면 `EADDRINUSE` 가
  // **없는 회귀**를 보고한다 — 그래서 둘째는 아무것도 안 돌리고 죽어야 한다.
  // ★서버를 안 띄우고 잰다: 살아 있는 남의 프로세스를 `.pid` 에 심어 두고 부른다.
  const { spawn } = require('child_process');
  const LOGP = path.join(TMP, 'guard', 'regress.log');
  fs.mkdirSync(path.dirname(LOGP), { recursive: true });
  // argv[0] 에 `nightly-run` 이 들어간 살아 있는 프로세스(잠만 잔다 · 서버 0)
  const squatter = spawn('bash', ['-c', 'exec -a nightly-run-자리지킴 sleep 25'], { stdio: 'ignore', detached: false });
  fs.writeFileSync(LOGP + '.pid', String(squatter.pid) + '\n');
  let rc = 0, out = '';
  try {
    out = execFileSync('bash', [path.join(ROOT, 'scripts', 'nightly-run.sh')],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        env: Object.assign({}, process.env, { LOG: LOGP, NIGHT_LIST: 'test-calendar.js', NIGHT_NO_REPORT: '1' }) });
  } catch (e) { rc = e.status; out = String(e.stderr || '') + String(e.stdout || ''); }
  ok(rc === 3, '★둘째가 **거부 코드 3**으로 죽는다', `rc=${rc}`);
  ok(/이미 돌고 있다/.test(out), '왜 죽었는지 말한다', out.trim().slice(0, 60));
  ok(!fs.existsSync(LOGP), '★둘째는 로그를 **한 줄도 안 썼다**(아무것도 안 돌렸다는 증거)');
  squatter.kill('SIGKILL');
  // ★자명 통과 금지 — 자리지킴이 죽으면(낡은 `.pid`) 같은 부름이 **통과해야** 한다.
  //   안 그러면 이 문은 "언제나 잠긴 문"이고, 그건 야간 러너가 영영 안 뜬다는 뜻이다.
  const deadPid = String(squatter.pid);
  for (let i = 0; i < 60; i++) { try { process.kill(squatter.pid, 0); } catch (e) { break; } execFileSync('sleep', ['0.05']); }
  fs.writeFileSync(LOGP + '.pid', deadPid + '\n');
  let rc2 = 0;
  try {
    execFileSync('bash', [path.join(ROOT, 'scripts', 'nightly-run.sh')],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        env: Object.assign({}, process.env, { LOG: LOGP, NIGHT_LIST: 'test-calendar.js', NIGHT_NO_REPORT: '1', NIGHT_NO_RETRY: '1', DRAIN_SEC: '0' }) });
  } catch (e) { rc2 = e.status; }
  ok(rc2 === 0 && fs.existsSync(LOGP), '★자명 통과 금지 — 낡은 `.pid`(죽은 프로세스)면 **그냥 돈다**', `rc=${rc2}`);
  ok(fs.readFileSync(LOGP + '.state', 'utf8').trim() === 'done', '`$LOG.state` 가 **done** 으로 끝난다', fs.readFileSync(LOGP + '.state', 'utf8').trim());
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
