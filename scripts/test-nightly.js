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

console.log('\n=== ⑩ [T1029] 상자 의존 한 줄 · `[editor-layers]` 귀속 줄 ===');
{
  // ★러너가 찍은 `[의존]` 줄을 보고 머리로 옮긴다 — 없으면(옛 로그) "로그에 없다" · `[상황]` 이면 굵게
  const head = (dep) => [L(4, 0, '===== nightly-run 시작 · TZ=Asia/Seoul · base=deadbeef ====='), ...(dep ? [L(4, 0, `  [의존] ${dep}`)] : []),
    L(4, 0, '  [오늘] 묶음 A · 1종'), L(4, 0, '  [목록] test-map-editor.js ')];
  const elLog = (dep, mark) => [...head(dep), ...block(4, 1, 'test-map-editor.js', false,
    ['층 데이터(lab/map-editor-layers.json) = 정본에서 지금 다시 구운 것과 같다(editor-layers-bake.py --check)  ' + mark]), L(4, 3, '===== 본 판 끝 =====')].join('\n') + '\n';
  const go = (txt, i) => { const f = path.join(TMP, `el${i}.log`); fs.writeFileSync(f, txt); fs.writeFileSync(f + '.retry', ''); return run(['--log', f, '--base', 'x', '--known', known]); };
  const E1 = go(elLog('python 3.13.0 · numpy 2.5.3 · PIL 12.3.0 · zlib 1.3', '[editor-layers] 다른 자리: hanbando.png — PNG 바이트 다름 · 화소 같음(인코더 차이) (10B ↔ 11B)'), 1);
  ok(/· 상자 의존 `python 3\.13\.0 · numpy 2\.5\.3 · PIL 12\.3\.0 · zlib 1\.3`/.test(E1), '★`[의존]` 줄을 보고 머리 **상자 의존** 칸으로 옮긴다');
  ok(/\[editor-layers\] 귀속: \*\*상자 인코더\(zlib\) 차\*\*/.test(E1), '★`화소 같음(인코더 차이)` 줄 → **상자 인코더 차** 귀속');
  const E2 = go(elLog('[상황] python3 · numpy · PIL 중 없는 것이 있다 — ModuleNotFoundError', '[editor-layers] 다른 자리: ores.minor — 값 다름'), 2);
  ok(/· 상자 의존 \*\*\[상황\] python3/.test(E2), '`[상황]` 줄은 **굵게** 옮긴다');
  ok(/\[editor-layers\] 귀속: \*\*층 데이터가 정본과 다르다\*\*/.test(E2), '★`값 다름` 줄 → **층 데이터 다시 굽기** 귀속(자명 통과 금지 — 앞 판과 다른 답)');
  const E3 = go(elLog('', '[editor-layers] 다른 자리 못 찾음: x'), 3);
  ok(/· 상자 의존 \*\*로그에 없다\*\*\(T1029 앞 러너\)/.test(E3) && !/\[editor-layers\] 귀속: \*\*(상자|층)/.test(E3), '옛 로그(`[의존]` 없음) → "로그에 없다" · 못 찾음 줄은 둘 어느 쪽도 아니다');
  ok(!/\[editor-layers\] 귀속/.test(B), '★`[editor-layers]` 줄이 없는 보고엔 귀속 줄이 **안** 선다');
  // ★[T1051] 화소 같음(통과) 판 — 하네스가 찍은 `[상황]` 줄이 머리 "층 데이터 인코더 차이" 칸으로 간다 · 없는 로그엔 칸 0
  { const enc = [...head('python 3.13.0 · numpy 2.5.3 · PIL 12.3.0 · zlib 1.3'), ...block(4, 1, 'test-map-editor.js', true, []).slice(0, 1),
      L(4, 1, '  [상황] 층 데이터 PNG 인코더 차이(화소 같음) — [editor-layers] 정본과 같다(화소) · [상황] 인코더 차이(화소 같음) — PNG 6 자리 바이트만 다르다 · PIL 12.3.0 · zlib 1.3 · 야간 상자 [의존] 줄과 같이 본다'),
      L(4, 2, '  ✓ RC=0'), L(4, 3, '===== 본 판 끝 =====')].join('\n') + '\n';
    const E4 = go(enc, 4);
    ok(/· 층 데이터 인코더 차이\(화소 같음 · 통과 · T1051\) — .*PNG 6 자리 바이트만 다르다 · PIL 12\.3\.0 · zlib 1\.3/.test(E4) && /상시 밖 빨강 0건/.test(E4), '★[T1051] 화소 같음 판은 **통과** · `[상황]` 줄이 머리 "층 데이터 인코더 차이" 칸으로 간다');
    ok(!/층 데이터 인코더 차이/.test(E1), '자명 통과 금지 — `[상황]` 줄 없는 로그엔 그 칸이 **안** 선다'); }
  // 러너가 실제로 `[의존]` 한 줄을 찍는가 — 예행(`NIGHT_DRY`)으로 목록만 뽑고 선다(서버 0) · 가짜 python3 면 `[상황]`
  const dry = (extraPath) => { const LP = path.join(TMP, `dep${extraPath ? 'F' : 'T'}`, 'r.log'); fs.mkdirSync(path.dirname(LP), { recursive: true });
    execFileSync('bash', [path.join(ROOT, 'scripts', 'nightly-run.sh')], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { LOG: LP, NIGHT_LIST: 'test-calendar.js', NIGHT_DRY: '1', NIGHT_NO_FONT: '1' }, extraPath ? { PATH: extraPath + ':' + process.env.PATH } : {}) });
    return (fs.readFileSync(LP, 'utf8').split('\n').find((l) => / \[의존\] /.test(l)) || ''); };
  const fake = path.join(TMP, 'fakebin'); fs.mkdirSync(fake, { recursive: true });
  fs.writeFileSync(path.join(fake, 'python3'), '#!/bin/sh\necho "ModuleNotFoundError: No module named numpy" >&2\nexit 1\n', { mode: 0o755 });
  const dF = dry(fake);
  ok(/\[의존\] \[상황\] python3 · numpy · PIL 중 없는 것이 있다 — ModuleNotFoundError/.test(dF), '★러너 — 의존이 없으면 `[의존] [상황] …` 한 줄(설치 0 · 판정 무변)', dF.slice(25, 110));
  const dT = dry('');
  ok(/\[의존\] /.test(dT) && dT !== dF, '러너 — 이 상자 그대로면 `[의존]` 한 줄이 선다(자명 통과 금지 — 가짜 python 판과 다른 글자)', dT.slice(25, 110));
}

console.log('\n=== ⑪ [T1038] §1b 상시 점검 — 상시 줄 연속 초록 10밤이면 "뺄 차례" · 상시 밖 2밤 빨강은 "올릴지 · 카드" ===');
{
  // 지난 밤 보고 픽스처 — 09-01 ~ 09-13 · `A` 는 09-03 빨강 뒤 초록(09-07 · 09-08 은 안 돎 · 09-10 은 손 보고) · `B` 는 이 밤 빨강 · `C` 는 상시 밖 빨강 둘째 밤
  const dir = path.join(TMP, 'streak');
  fs.mkdirSync(dir, { recursive: true });
  const rep = (reds, greens) => ['# 보고', '', '## 1. 실패 표', '',
    ...(reds.length ? ['| 하네스 | 연속 | 첫 판 | 소요 | 단독 재실행 | 귀속 |', '|---|---|---|---|---|---|', ...reds.map((n) => `| \`${n}\` | 연속 **1밤** | RC=1 | 1분 | — | x |`)] : ['빨강 **0종**.']),
    '', `## 5. 통과 ${greens.length}종`, '', '```', greens.join('  '), '```', ''].join('\n');
  const day = (d) => path.join(dir, `야간러너_2026-09-${String(d).padStart(2, '0')}.md`);
  fs.writeFileSync(day(1), '이 꼴은 못 읽는다\n');                       // ★못 읽는 꼴 — 여기서 멈춘다
  fs.writeFileSync(day(2), rep([], ['A', 'B']));
  fs.writeFileSync(day(3), rep(['A'], ['B']));                             // A 마지막 빨강
  for (const d of [4, 5, 6, 9, 11, 12]) fs.writeFileSync(day(d), rep([], ['A', 'B']));
  for (const d of [7, 8]) fs.writeFileSync(day(d), rep([], ['B']));       // A 안 돎(묶음 밖) — 건너뛴다
  fs.writeFileSync(day(10), ['# 손 보고', '', '| 하네스 | 묶음 판 |', '|---|---|', '| `X` | RC=1 |', ''].join('\n'));   // 통과 줄 없는 손 보고
  fs.writeFileSync(day(13), rep(['C'], ['A', 'B']));
  const LIST = ['A.js', 'B.js', 'C.js'];
  const lg = [L(4, 0, '===== nightly-run 시작 · TZ=Asia/Seoul · base=deadbeef ====='), L(4, 0, '  [오늘] 묶음 A · 3종'), L(4, 0, `  [목록] ${LIST.join(' ')} `),
    ...block(4, 1, 'A.js', true, []), ...block(4, 3, 'B.js', false, ['① 틀렸다']), ...block(4, 5, 'C.js', false, ['② 틀렸다']), L(4, 7, '===== 본 판 끝 =====')].join('\n') + '\n';
  const fl = path.join(TMP, 'st.log'); fs.writeFileSync(fl, lg); fs.writeFileSync(fl + '.retry', '');
  const kn = path.join(TMP, 'known3.txt');
  fs.writeFileSync(kn, 'A.js | 기계 의존 | 픽스처\nB.js | 기계 의존 | 픽스처\n');
  const R = run(['--log', fl, '--base', 'x', '--known', kn, '--prev-dir', dir]);
  const row = (n) => (R.split('\n').find((l) => l.startsWith(`| \`${n}\` | `) && /목록|상시/.test(l) && !/연속 \*\*/.test(l)) || '');
  ok(/초록 \*\*8밤\*\*/.test(row('A')), '★상시 줄 연속 초록 = **돈 밤**만 거슬러 센다(안 돈 09-07 · 09-08 건너뜀 · 09-03 빨강에서 멈춤)', row('A').slice(0, 90));
  ok(/손 보고 2026-09-10 건너뜀/.test(row('A')), '통과 줄 없는 손 보고(09-10)는 건너뛰었다고 말한다');
  ok(!/뺄 차례/.test(row('A')), '★자명 통과 금지 — 8밤은 **뺄 차례가 아니다**(10밤 문턱)');
  ok(/빨강 \*\*1밤\*\*\(초록 0\)/.test(row('B')) && !/뺄 차례/.test(row('B')), '이 밤 빨간 상시 줄은 초록 0 · 표시 없음');
  ok(/\| `C` \| 상시 밖 \| 빨강 \*\*2밤\*\* \| \*\*상시 올릴지 · 카드\*\*/.test(R), '★상시 밖 2밤 빨강 → **상시 올릴지 · 카드**');
  ok(/· 상시 점검\(§1b · T1038\) — 뺄 차례 \*\*0\*\* · 상시 올릴지 \*\*1\*\* · 상시 줄 2/.test(R), '머리 한 줄에 셈이 선다');
  // 09-14 ~ 09-16 셋 더 초록이면(이 밤 로그 대신 보고 · 09-04 ~ 09-16 의 돈 밤 10) → 뺄 차례
  for (const d of [14, 15, 16]) fs.writeFileSync(path.join(dir, `야간러너_2026-09-${d}.md`), rep([], ['A', 'B']));
  const S = run(['--streaks', '2026-09-16', '--known', kn, '--prev-dir', dir]);
  ok(/\| `A` \| 상시\(기계 의존\) \| 초록 \*\*10밤\*\*.*\*\*뺄 차례\*\*\(T1038 규칙 · 10밤/.test(S), '★`--streaks` — 로그 없이 그 밤 보고까지 읽어 **10밤 → 뺄 차례**', (S.split('\n').find((l) => l.startsWith('| `A`')) || '').slice(0, 90));
  ok(/\| `B` \| 상시\(기계 의존\) \| 초록 \*\*1\d밤\*\* · 2026-09-01 보고에서 멈춤/.test(S), '★못 읽는 꼴의 보고에서 **멈췄다고 말한다**(조용히 이어 세지 않는다)', (S.split('\n').find((l) => l.startsWith('| `B`')) || '').slice(0, 100));
  ok(run(['--log', fl, '--base', 'x', '--known', kn, '--prev-dir', dir]) === run(['--log', fl, '--base', 'x', '--known', kn, '--prev-dir', dir]), '같은 로그 + 같은 보고 칸 → 같은 바이트');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
