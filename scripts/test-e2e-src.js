#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-e2e-src.js — e2e 의 소스만 보는 절을 **매일 밤** 돈다(브라우저 · 서버 0 · 1초 안) ==========================
//
// ★왜(T964 · T953 회부): 소스만 보는 절이 야간 묶음(A · B · C — 사흘에 한 밤)의 e2e 안에만 있으면 그 계약이 사흘 초록으로 선다(T930 · T953).
//   ⇒ 절 몸통을 `scripts/lib-e2e-src.js` 한 벌로 옮겼고(원래 e2e 는 제 절을 부른다 · 사본 0 · 글자 · 말 무변) 이 하네스가 같은 함수를 돌린다.
//   `@nightly` 표식이 없으니 단위 묶음 — 매일 밤(`nightly-split.sh`: 단위 = @regress − 묶음 표식).
// ★자명 통과 금지: 절마다 **미끼 하나** — 진짜 원문에서 그 절이 지키는 계약 한 줄만 깨뜨린 사본을 같은 함수에 넣으면 그 절의 정해진 줄이 빨개져야 한다
//   (미끼가 원문을 실제로 바꿨나 · 빨강이 하나 이상 · 빨간 줄이 기대한 그 줄). 미끼 빨강은 세기만 한다(이 하네스의 통과로 안 센다).
//
// 실행: node scripts/test-e2e-src.js
'use strict';
const L = require('./lib-e2e-src');

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };

console.log('\n=== e2e 소스 절 — 진짜 원문(e2e 와 같은 함수) ===');
const real = L.reader();
const ORIGIN = {
  guild: 'e2e-guild ⑥', friends: 'e2e-friends ⑦', events: 'e2e-events ⑤-c', npcsprite: 'e2e-npcsprite ②(T134 · T316)', verbs0: 'e2e-verbs ⓪', verbs10: 'e2e-verbs ⑩',
  aim: 'e2e-aim ⓕ', charsprite: 'e2e-charsprite ④′', handoffProto: 'e2e-handoff-proto ⓢ0', pidCollide: 'e2e-pid-collide 전제', zoneCross: 'e2e-zone-cross ⓢ', npcWalk: 'e2e-npc-walk 머리',
};
for (const [name, fn] of Object.entries(L.SECTIONS)) { console.log(`\n· ${name} — ${ORIGIN[name] || '?'}`); fn(ok, real); }
ok(Object.keys(L.SECTIONS).every((k) => ORIGIN[k]), '[상황] 절마다 출처 e2e 가 적혀 있다(새 절이 들면 아래 미끼도 같이 든다)', Object.keys(L.SECTIONS).join(' '));

// ── 미끼 — 절마다 계약 한 줄을 깨뜨린 사본(원문 한 파일만 바꿔 끼운다) ──
//   [절, 파일, 바꿀 글자(원문에 정확히 한 번), 바꿀 꼴, 빨개져야 할 줄(말의 머리)]
const DECOYS = [
  ['guild', 'server/central.js', "ALTER TABLE tribes ADD COLUMN intro", (s, a) => s.replace(a, a + ' TEXT"); db.exec("ALTER TABLE tribes ADD COLUMN extra_t964'), /⑥b2/],
  ['friends', 'public/client/30-n-net.js', null, (s) => s + '\nfunction __t964() { return isFriend(1, 2); }\n', /⑦d/],
  ['events', 'public/client/47-s-board.js', null, (s) => s + "\nh += '\u{1F6D6} 쉼터';\n", /47-s-board\.js — 이모지 0/],
  ['npcsprite', 'server/zone.js', null, (s) => s + '\nfunction __t964(o) { return o._carry; }\n', /\[T316\] zone 에 주민 손/],
  ['verbs0', 'public/index.html', 'client/46-h-verbs.js', (s, a) => s.replace(a, 'client/46-h-verbs-x.js'), /index\.html.*싣는다/],
  ['verbs10', 'public/client/46-h-verbs.js', null, (s) => s + '\nwindow.__rmbDbg = { tap: true };\n', /__rmbDbg/],
  ['aim', 'public/client/30-n-net.js', null, (s) => s.split('placementMode.dir').join('placementMode.rot'), /ⓕ/],   // ⚠`.dirX` 는 안 잡힌다(검사 정규식이 앞머리만 본다 — 글자 무변 · 보고 회부)
  ['charsprite', 'public/client/42-r2-char.js', null, (s) => s + "\nconst __t964 = /rod|fish|낚/i;\n", /옛 정규식/],
  ['handoffProto', 'server/zone.js', 'if (res.statusCode >= 400)', (s, a) => s.replace(a, 'if (false)'), /응답 코드/],
  ['pidCollide', 'server/zone.js', 'let nextPid = 1;', (s, a) => s.replace(a, 'let nextPid = 0;'), /전제 ①/],
  ['npcWalk', 'server/zone.js', "let speedMult = npc.behavior === 'flee' ? 2.5 : NPC_WALK_MULT;", (s, a) => s.replace(a, "let speedMult = npc.behavior === 'flee' ? 2.5 : 1.0;"), /손잡이 한 자리/],
  ['zoneCross', 'public/client/31-m-move.js', 'const PEEK_THRESHOLD = NAT_VIEW_PAD;', (s, a) => s.replace(a, 'const PEEK_THRESHOLD = 600;'), /ⓢ 이웃 관측 문턱/],
];
console.log('\n=== 미끼 — 계약 한 줄을 깨뜨린 사본은 그 절이 잡는다 ===');
for (const [name, file, anchor, mut, want] of DECOYS) {
  const src = real(file);
  const once = anchor == null || src.split(anchor).length === 2;
  const decoy = mut(src, anchor);
  const bad = [];
  if (once && decoy !== src) L.SECTIONS[name]((c, m) => { if (!c) bad.push(m); }, L.reader({ [file]: decoy }));
  ok(once && decoy !== src && bad.length >= 1 && bad.some((m) => want.test(m)),
    `★★ ${name} — ${file} 를 깨뜨린 사본은 잡힌다(${want.source})`, `빨강 ${bad.length}${bad.length ? ' · ' + bad[0].slice(0, 60) : ''}${once ? '' : ' · ⚠자리가 한 번이 아니다'}`);
}
ok(DECOYS.length === Object.keys(L.SECTIONS).length && Object.keys(L.SECTIONS).every((k) => DECOYS.some((d) => d[0] === k)), '[상황] 절마다 미끼가 하나씩 있다',
  `절 ${Object.keys(L.SECTIONS).length} · 미끼 ${DECOYS.length}`);

console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
