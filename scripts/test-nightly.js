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

console.log('\n=== ⑧ 연속 빨강 칸 — 직전 밤 보고 한 장을 읽어 **세기만** 한다 ===');
{
  // ★왜: T304 규약이 "단독 초록이어도 **두 밤째** 빨강이면 nightly-known 에 올린다" 인데 그 수를
  //   사람이 손으로 셌다. 기계가 센다 — **판정은 안 한다**(올리고 내리는 것은 PM).
  const dir = path.join(TMP, 'nights');
  fs.mkdirSync(dir, { recursive: true });
  // 직전 밤(09-13) 보고 픽스처: 새 꼴 한 줄(연속 1밤) + 옛 꼴 한 줄(연속 칸 없음 = 1밤으로 읽는다)
  fs.writeFileSync(path.join(dir, '야간러너_2026-09-13.md'), [
    '| 하네스 | 연속 | 첫 판 | 소요 | 단독 재실행 | 귀속 |',
    '|---|---|---|---|---|---|',
    '| `e2e-cold` | 연속 **1밤** | RC=1 | 3분 | ★**단독 초록** (RC=0) | **상시(부하 거짓 빨강)** |',
    '| `test-imaginary` | 연속 **1밤** | RC=1 | 1분 | 여전히 빨강 | **귀속: 모델 몫** |',
    '| **`test-tick-slicer.js`** | **22 / 2** | 창 안에 못 끝냈다 | **상시(기계 의존)** |',   // ★사람이 쓴 꼴(이름 굵게 · .js)
  ].join('\n') + '\n');
  const withPrev = run(['--log', f1, '--base', 'x', '--known', known, '--prev-dir', dir]);
  ok(/\| `e2e-cold` \| 연속 \*\*2밤\*\*/.test(withPrev), '★직전 밤에도 빨갰으면 **2밤**으로 센다', '1밤 → 2밤');
  ok(/\| `test-imaginary` \| 연속 \*\*2밤\*\* \(상시 밖\)/.test(withPrev), '★상시 목록에 **없는** 2밤짜리엔 (상시 밖) 표가 붙는다');
  ok(/\| `test-tick-slicer` \| 연속 \*\*2밤\*\*/.test(withPrev), '옛 꼴(연속 칸 없는 표)도 **한 밤**으로 읽어 잇는다');
  // ⚠줄은 **상시 목록에 없는** 2밤짜리만 부른다 — 상시로 올라간 것을 다시 부르지 않는다.
  const warn = (withPrev.split('\n').find((l) => l.indexOf('연속 2밤 이상인데') >= 0) || '');
  ok(/`test-imaginary`\(2밤\)/.test(warn) && !/e2e-cold/.test(warn) && !/tick-slicer/.test(warn),
     '★⚠줄은 **상시 밖** 2밤짜리만 부른다(상시로 올라간 것은 다시 안 부른다)', warn.slice(0, 80));
  // ★자명 통과 금지 — 직전 밤이 없으면 **못 읽었다고 말한다**(조용히 1 로 되돌리지 않는다).
  const noPrev = run(['--log', f1, '--base', 'x', '--known', known, '--prev-dir', path.join(TMP, '없는칸')]);
  ok(/연속 수를 못 믿는다/.test(noPrev) && /`test-imaginary` \| 연속 \*\*1밤\*\*/.test(noPrev),
     '★자명 통과 금지 — 직전 밤이 없으면 **못 읽었다**고 말하고 전부 1밤이다(그러니 위 2밤은 진짜로 읽은 것)');
  ok(withPrev !== noPrev, '자명 통과 금지 — 직전 밤 유무로 **바이트가 갈린다**',
     `${Buffer.byteLength(withPrev)}B vs ${Buffer.byteLength(noPrev)}B`);
  ok(run(['--log', f1, '--base', 'x', '--known', known, '--prev-dir', dir]) === withPrev,
     '★그래도 결정적이다 — 같은 입력이면 바이트가 같다');
}

console.log('\n=== ⑦ 묶음 기계 마른 판 — 세 밤이면 e2e 가 **한 번씩 다 든다** ===');
{
  // ★왜: 09-19 야간이 e2e 46종을 못 쟀다. 그 밤은 **묶음 기계를 안 썼다**(전수 149종을 손 청크로).
  //   기계가 옳은지는 3시간을 걸어 보지 않고도 잴 수 있다 — `NIGHT_DATE` 로 **마른 판**을 찍으면 된다.
  //   여기서 재는 것: ⓐ 사흘이면 묶음 셋이 다 돈다 ⓑ 그 사흘의 합이 e2e 전수와 **정확히 같다**(빠짐 0 · 중복 0).
  const sh = (env, args) => execFileSync('bash', [path.join(ROOT, 'scripts', 'nightly-split.sh'), ...args],
    { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, env) });
  const dry = (date) => {
    const out = sh(date ? { NIGHT_DATE: date } : {}, ['auto', '--list-only']);
    const g = (/→ \*\*([A-D])\*\*/.exec(out) || [])[1] || null;
    return { g, list: out.split('\n').filter((l) => /^[A-Za-z0-9_.-]+\.js$/.test(l.trim())).map((l) => l.trim()) };
  };
  const all = execFileSync('bash', [path.join(ROOT, 'scripts', 'run-regress.sh'), '--list'],
    { cwd: ROOT, encoding: 'utf8' }).split('\n').map((x) => x.trim()).filter(Boolean);
  const e2eAll = new Set(all.filter((x) => x.startsWith('e2e-')));
  const D = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'];
  const runs = D.map(dry);
  const three = runs.slice(0, 3);
  ok(three.every((r) => r.g) && new Set(three.map((r) => r.g)).size === 3,
     '★사흘이면 묶음 **셋이 다** 돈다', three.map((r, i) => `${D[i].slice(5)}→${r.g}`).join(' · '));
  // 사흘 치 목록에서 e2e 만 모은다 — 단위는 매일 도니 셈에서 뺀다(이름 규칙이 아니라 전수 목록으로 가른다).
  const seen = [];
  for (const r of three) for (const f of r.list) if (e2eAll.has(f)) seen.push(f);
  const uniq = new Set(seen);
  ok(uniq.size === e2eAll.size && seen.length === uniq.size,
     `★사흘의 합 = e2e 전수 (빠짐 0 · 중복 0)`, `${uniq.size}/${e2eAll.size}종 · 중복 ${seen.length - uniq.size}`);
  const missing = [...e2eAll].filter((f) => !uniq.has(f));
  ok(missing.length === 0, '★빠지는 종이 0 이다', missing.join(' ') || '없음');
  // ★자명 통과 금지 ①: 넷째 날은 **첫날 묶음으로 되돌아온다**(주기가 3 이라는 증거 — "늘 다르다"가 아니다).
  ok(runs[3].g === runs[0].g, '★자명 통과 금지 — 나흘째는 첫날 묶음으로 **되돌아온다**(주기 3)',
     `${D[0].slice(5)}→${runs[0].g} · ${D[3].slice(5)}→${runs[3].g}`);
  // ★자명 통과 금지 ②: `NIGHT_DATE` 를 안 주면 **오늘**을 쓴다(마른 판 손잡이가 기본 동작을 안 바꿨다).
  const today = dry(null);
  ok(!!today.g, '★자명 통과 금지 — `NIGHT_DATE` 없이도 묶음이 선다(기본 동작 무변)', `오늘→${today.g}`);
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
