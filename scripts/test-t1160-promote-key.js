#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1160-promote-key.js — welcome 의 `promoted`(승격)과 게스트 → 계정 승계를 가른다 · 망 0 · 몇 초 (T1160) ==========
//
// ★왜: `e2e-t1160-promote-key`(실클라 · central + 두 존)의 빠른 짝 — 포트를 못 여는 상자에서도 돈다.
//   클라 welcome 의 열쇠 갈래(`30-n-net.js` — T1160 머리 줄부터 "시대 게이트" 앞까지)를 **소스에서 그대로 잘라** vm 에서 돌린다(사본 0 ·
//   다섯 꼴의 welcome 을 넣어 열쇠 · 갈래를 본다). 서버 쪽은 글자(손잡이 · 첫 접속 welcome 칸 · 승격 welcome 칸)를 본다.
//   ⓐ 승격 welcome(이 소켓에 `promote_to_primary` 를 보냈다 · `promoted: true`) → 열쇠 **그대로** · 승격 갈래(관측 상태 유지)   ← 결함 자리
//   ⓑ 켬 서버 첫 접속 승계(`guestMerged: true` · `promoted` 칸 없음) → 열쇠 지움 · 일반 갈래(자원 · 땅 · 건물을 받는다)
//   ⓒ 끔 서버 첫 접속 승계(`promoted: true` · 승격을 안 보낸 소켓) → 열쇠 지움 · 일반 갈래                                        ← 둘째 결함 자리
//   ⓓ 넘기 실패 되돌림(`back` · T1092) → 열쇠 그대로 · 승격 갈래
//   ⓔ 게스트 첫 접속(`guestToken`) → 열쇠 저장 · 일반 갈래
// 실행: node scripts/test-t1160-promote-key.js            (작업 트리)
//       node scripts/test-t1160-promote-key.js --rev <커밋>   (그 커밋의 클라 · 서버 글자로 — 고치기 전 트리 빨강 증인: ⓐ ⓒ 와 서버 글자가 빨강)
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const rev = (() => { const i = process.argv.indexOf('--rev'); return i >= 0 ? process.argv[i + 1] : null; })();
const read = (rel) => rev ? execFileSync('git', ['show', `${rev}:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }) : fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log(`\n=== welcome 의 승격 · 승계 가르기 (T1160)${rev ? ` — 커밋 ${rev}` : ''} ===`);
const CL = read('public/client/30-n-net.js');
const ZS = read('server/zone.js');

// ── 클라 갈래 잘라 내기 — 열쇠 갈래 시작(T1160 머리 줄 · 없으면 종전 `if (c._promoteSentAt) {`) → "시대 게이트" 주석 앞 ──
const iW = CL.indexOf("if (msg.type === 'welcome') {");
const i0a = CL.indexOf('// ★[T1160 · 결함]', iW), i0b = CL.indexOf('if (c._promoteSentAt) {', iW);
const i0 = (i0a >= 0 && i0a < i0b) ? i0a : i0b;
const i1 = CL.indexOf('// ★시대 게이트', i0);
const iBr = CL.indexOf('if (msg.promoted || msg.back)', i1);
ok(iW >= 0 && i0 > iW && i1 > i0 && iBr > i1, '소스: welcome 열쇠 갈래 · 승격 갈래 문(`if (msg.promoted || msg.back)`)을 찾았다', `열쇠 갈래 ${i1 - i0} 글자`);
const BLOCK = CL.slice(i0, i1);

function runWelcome(msg, sentPromote, key0) {
  const store = new Map(); if (key0) store.set('durango_guest_token', key0);
  const ctx = {
    msg: JSON.parse(JSON.stringify(msg)), c: { _promoteSentAt: sentPromote ? 1000 : 0 }, _wStart: 1234, store,
    console: { log() {}, warn() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    out: null,
  };
  vm.runInNewContext(`(function () { var GUEST_TOKEN_KEY = 'durango_guest_token'; var myGuestToken = localStorage.getItem(GUEST_TOKEN_KEY) || ''; var myPlayerId = '';
    ${BLOCK}
    out = { mem: myGuestToken, pid: myPlayerId, promoteBranch: !!(msg.promoted || msg.back), sentLeft: c._promoteSentAt };
  })();`, ctx, { timeout: 2000 });
  return { mem: ctx.out.mem, pid: ctx.out.pid, branch: ctx.out.promoteBranch, key: store.has('durango_guest_token') ? store.get('durango_guest_token') : null, sentLeft: ctx.out.sentLeft };
}
const K = 'a'.repeat(64), K2 = 'b'.repeat(64);
const base = { type: 'welcome', pid: 7, zone: { id: 'nippon' } };

// ⓐ 승격 welcome — 서버 `_promoteWelcome(…, { promoted: true })` 꼴(playerId · guestToken 칸 없음)
let r = runWelcome(Object.assign({ promoted: true }, base), true, K);
ok(r.key === K && r.mem === K, 'ⓐ ★승격 welcome(이 소켓에 승격을 보냈다) — 게스트 열쇠가 그대로(브라우저 · 메모리)', `브라우저 ${r.key === K ? '그대로' : (r.key == null ? '없음' : '다름')} · 메모리 ${r.mem === K ? '그대로' : JSON.stringify(r.mem).slice(0, 8)}`);
ok(r.branch === true && r.sentLeft === 0, 'ⓐ 승격 갈래(관측 상태 유지 — 끊김 0)를 탄다 · 승격 시각은 비운다(종전)');
// ⓑ 켬 서버 첫 접속 승계
r = runWelcome(Object.assign({ playerId: 'anon_x', guestToken: null, guestMerged: true, resources: [] }, base), false, K);
ok(r.key == null && r.mem === '', 'ⓑ 켬 서버 승계(`guestMerged`) — 열쇠 지움', `브라우저 ${r.key == null ? '없음' : '남음'}`);
ok(r.branch === false && r.pid === 'anon_x', 'ⓑ 일반 갈래(자원 · 땅 · 건물을 받는다) · playerId 받음');
// ⓒ 끔 서버 첫 접속 승계(종전 칸 `promoted`)
r = runWelcome(Object.assign({ playerId: 'anon_x', guestToken: null, promoted: true, resources: [] }, base), false, K);
ok(r.key == null && r.mem === '', 'ⓒ 끔 서버 승계(`promoted` · 승격 안 보낸 소켓) — 열쇠 지움(배치 14 ① 그대로)', `브라우저 ${r.key == null ? '없음' : '남음'}`);
ok(r.branch === false, 'ⓒ ★일반 갈래 — 승계 첫 welcome 이 승격 갈래를 타 자원 · 땅 · 건물을 건너뛰지 않는다');
// ⓓ 넘기 실패 되돌림(T1092 `back`)
r = runWelcome(Object.assign({ back: true }, base), false, K);
ok(r.key === K && r.branch === true, 'ⓓ 넘기 실패 되돌림(`back`) — 열쇠 그대로 · 승격 갈래(T1092 그대로)');
// ⓔ 게스트 첫 접속
r = runWelcome(Object.assign({ playerId: 'anon_y', guestToken: K2, guestMerged: false, resources: [] }, base), false, '');
ok(r.key === K2 && r.mem === K2 && r.branch === false, 'ⓔ 게스트 첫 접속 — 열쇠 저장 · 일반 갈래');
r = runWelcome(Object.assign({ playerId: 'anon_y', guestToken: K2, promoted: false, resources: [] }, base), false, '');
ok(r.key === K2 && r.branch === false, 'ⓔ′ 끔 서버 게스트 첫 접속(`promoted: false`) — 열쇠 저장 · 일반 갈래');

// ── 서버 글자 ──
ok(/^const T1160_GUEST_MERGED = process\.env\.T1160_GUEST_MERGED !== '0';$/m.test(ZS), '서버: 손잡이 `T1160_GUEST_MERGED`(켬 기본 · `=0` 종전)');
ok(/\.\.\.\(T1160_GUEST_MERGED \? \{ guestMerged: _promoted \|\| false \} : \{ promoted: _promoted \|\| false \}\),/.test(ZS) && !/^\s*promoted: _promoted \|\| false,$/m.test(ZS),
  '서버: 첫 접속 welcome — 켬 = 승계는 `guestMerged` · 끔 = 종전 `promoted` 칸');
ok(/sendWelcome\(ws, _promoteWelcome\(player, pid, \{ promoted: true \}, ws, msg\.have\)\);/.test(ZS), '서버: 승격 welcome 은 `promoted: true` 그대로(T1092 · T1125 하네스 글자 무변)');
ok(/if \(msg\.promoted \|\| msg\.back\)/.test(CL) && /if \(msg\.guestMerged\) \{/.test(CL) && !/if \(msg\.promoted\) \{\s*myGuestToken = ''/.test(CL),
  '클라: 열쇠 지움은 `guestMerged` 하나 · 승격 갈래 문 글자 무변(T1092 하네스)');

console.log(`\n${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
