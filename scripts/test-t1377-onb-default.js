#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 1
// === scripts/test-t1377-onb-default.js — [T1377 -on 후보] 온보딩 제 집 줄기(`T1341_OWN_HOUSE`)가 켬 기본 · `=0`(또는 빈 값)이면 끔 ====================
//
// ★왜 [카드 T1377 ④] 켬 기본 후보 가지. 손잡이 값은 `server/events.js` 한 자리(온보딩 · 존 · 게시판 · 줍기가 같은 값을 읽는다 — 사본 0).
//   ① env 없음 → 켬 · `=1` → 켬 · `=0` → 끔 · 빈 값(종전 하네스의 끔 판 꼴 `T1341_OWN_HOUSE: ''`) → 끔
//   ② 같은 값을 온보딩(`onboarding.T1341`)이 읽는다(존 `_T1341_ON` 은 같은 줄을 부른다 — 글자)
//   ③ 끔(`=0`)이면 장부 · 게시판 글이 종전 그대로(갚는 말이 있다) · 켬 기본이면 갚는 말 0
//   ④ 미끼 하나(이 파일 안 · 바꾼 자리 정확히 1곳): 손잡이 줄을 종전 꼴(`=== '1'`)로 되돌린 사본 → ① env 없음 줄만 빨강
// ★날짜 · 벽시계 0 · 서버 0.
// 실행: node scripts/test-t1377-onb-default.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

if (process.env.T1377_CHILD) {
  const ev = process.env.T1377_EVENTS ? path.join(ROOT, 'server', process.env.T1377_EVENTS) : path.join(ROOT, 'server', 'events');
  const Ev = require(ev);
  const out = { knob: Ev.T1341_OWN_HOUSE, line: Ev.boardLine({ item: 'wood', qty: 3, filled: 0, rewItem: 'grain', rewQty: 2 }) };
  if (!process.env.T1377_EVENTS) { try { out.onb = require(path.join(ROOT, 'server', 'onboarding')).T1341; } catch (e) { out.onbErr = String(e && e.message || e).slice(0, 80); } }
  process.stdout.write('@@T1377@@' + JSON.stringify(out));
  process.exit(0);
}
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);
function child(env) {
  const e = Object.assign({}, process.env, { T1377_CHILD: '1' }, env);
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  const raw = execFileSync(process.execPath, [__filename], { env: e, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(raw.slice(raw.indexOf('@@T1377@@') + 9));
}
const judge = (f) => {
  const J = {};
  J.unset = f({ T1341_OWN_HOUSE: undefined }).knob === true;
  J.one = f({ T1341_OWN_HOUSE: '1' }).knob === true;
  J.zero = f({ T1341_OWN_HOUSE: '0' }).knob === false;
  J.empty = f({ T1341_OWN_HOUSE: '' }).knob === false;
  return J;
};

sec('① 손잡이 값 — env 없음 · 1 · 0 · 빈 값');
let JR = null;
try {
  JR = judge(child);
  ok(JR.unset, '★env 없음 → 켬(켬 기본)');
  ok(JR.one, '`=1` → 켬');
  ok(JR.zero, '★`=0` → 끔');
  ok(JR.empty, '빈 값(종전 하네스 끔 판 꼴) → 끔');
} catch (e) { ok(false, '① 예외: ' + (e && e.stack || e)); }

sec('② 같은 값을 온보딩 · 존이 읽는다 · ③ 게시판 글');
try {
  const on = child({ T1341_OWN_HOUSE: undefined }), off = child({ T1341_OWN_HOUSE: '0' });
  ok(on.onb === true && off.onb === false, '온보딩(`onboarding.T1341`)이 같은 값(사본 0)', JSON.stringify([on.onb, off.onb, on.onbErr || off.onbErr || '']));
  const SRC = (n) => fs.readFileSync(path.join(ROOT, 'server', n + '.js'), 'utf8');   // 글자만 읽는다(존을 띄우지 않는다)
  const z = SRC('zone');
  ok(/const _T1341_ON = !!require\('\.\/events'\)\.T1341_OWN_HOUSE;/.test(z), '존 손잡이 = events.js 한 자리(글자)');
  ok(!/갚/.test(on.line) && /갚|으로/.test(off.line) && on.line !== off.line, '★게시판 한 줄 — 켬 기본은 갚는 말 0 · `=0` 은 종전 글(갚음)', JSON.stringify([on.line, off.line]));
} catch (e) { ok(false, '②③ 예외: ' + (e && e.stack || e)); }

sec('④ 미끼 — 이 파일 안 · 바꾼 자리 정확히 1곳 · 어느 줄이 빨강인지 단언');
const tmp = [];
try {
  const EV = fs.readFileSync(path.join(ROOT, 'server', 'events.js'), 'utf8');
  const cnt = (s, x) => s.split(x).length - 1;
  const L = "!(process.env.T1341_OWN_HOUSE === '0' || process.env.T1341_OWN_HOUSE === '')";
  const ev = EV.replace(L, "process.env.T1341_OWN_HOUSE === '1'");
  const fa = path.join(ROOT, 'server', `_t1377_bait_${process.pid}.js`);
  fs.writeFileSync(fa, ev); tmp.push(fa);
  const JA = judge((env) => child(Object.assign({ T1377_EVENTS: path.basename(fa) }, env)));
  ok(cnt(EV, L) === 1 && cnt(ev, L) === 0 && !JA.unset && JA.one && JA.zero && JA.empty,
    '★미끼 손잡이 줄을 종전 꼴(`=== \'1\'`)로 되돌린 사본(바꾼 자리 1곳) — env 없음 줄만 빨강', JSON.stringify(JA));
  ok(!!JR && Object.values(JR).every(Boolean), '제품 글자는 같은 자가 전부 초록(미끼만 빨강)', JSON.stringify(JR));
} catch (e) { ok(false, '④ 예외: ' + (e && e.stack || e)); }
finally { for (const f of tmp) { try { fs.unlinkSync(f); } catch (e) {} } }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
