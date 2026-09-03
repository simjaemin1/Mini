#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-notice.js — 알림 경계: 이모지 → `kind` [T78] =====================
//
// ★왜 [재민 확정 2026-09-03 · T78]
//   T71 이 판정 하나를 남겼다: **알림에는 유형 필드가 없다.** 그래서 접두 이모지가
//   "무엇에 대한 알림인가"를 나르는 **유일한 표시**였고, 그냥 지우면 정보가 준다.
//   ⇒ 322곳을 고치지 않고 **경계 하나**(`zone.js send()`)에서 `kind` 로 옮기고 글자를 뺀다.
//   이 하네스는 그 경계가 **정말 그렇게 하는가**를 잰다.
//
// ★재는 것 넷: ① 표대로 접히는가 ② 텍스트에 이모지 코드포인트 0 ③ 이모지 없는 문장은 원문 그대로
//   ④ **돌연변이** — 경계를 끄면(정규화를 안 하면) 빨개지는가.
'use strict';
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const Notice = R('server/notice');
const acorn = require(path.join(__dirname, '..', 'node_modules', 'acorn'));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const EMO = /\p{Extended_Pictographic}/u;

console.log('\n=== 알림 경계 하네스 (이모지 → kind) ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// ① 표대로 접힌다 — 접두 30종 픽스처(실측 39종에서 종류마다 뽑았다)
// ─────────────────────────────────────────────────────────────────────────────
{
  const FIX = [
    ['🏘️ 곳간에 넣었다 — 곡식 5', 'village', '곳간에 넣었다 — 곡식 5'],
    ['🏠 모서리로만 닿는다', 'village', '모서리로만 닿는다'],
    ['🏛️ 길드 메인 사유지', 'village', '길드 메인 사유지'],
    ['🏚️ 길드 곳간 완공!', 'village', '길드 곳간 완공!'],
    ['🔒 잠긴 상자다', 'village', '잠긴 상자다'],
    ['🪵 탄화 중 — 3일', 'gather', '탄화 중 — 3일'],
    ['⛏️ 이 자리는 다 팠다', 'gather', '이 자리는 다 팠다'],
    ['🤏 여긴 주울 게 없다', 'gather', '여긴 주울 게 없다'],
    ['🪓 통나무 2', 'gather', '통나무 2'],
    ['🌱 씨를 뿌렸다', 'gather', '씨를 뿌렸다'],
    ['🌾 수확!', 'gather', '수확!'],
    ['☄️ 하늘에서 떨어진 쇠', 'gather', '하늘에서 떨어진 쇠'],
    ['🎣 던졌다. 찌를 봐라', 'fishing', '던졌다. 찌를 봐라'],
    ['🌊 짠물이다', 'fishing', '짠물이다'],
    ['🔥 노 앞에서만 녹인다', 'craft', '노 앞에서만 녹인다'],
    ['🏺 빈 그릇', 'craft', '빈 그릇'],
    ['⚒ 선광 3', 'craft', '선광 3'],
    ['🧂 소금 1', 'craft', '소금 1'],
    ['🔧 고쳤다', 'craft', '고쳤다'],
    ['✅ 다 됐다', 'craft', '다 됐다'],
    ['🏪 거래소', 'board', '거래소'],
    ['📋 게시판 2건', 'board', '게시판 2건'],
    ['📜 연표', 'board', '연표'],
    ['🧊 올겨울 몫 — 곡식 5', 'board', '올겨울 몫 — 곡식 5'],
    ['🤚 일으켜 세웠다', 'rescue', '일으켜 세웠다'],
    ['🫂 업었다', 'rescue', '업었다'],
    ['🩹 다쳤다 — 팔', 'rescue', '다쳤다 — 팔'],
    ['🥣 무엇을 먹일 것인가', 'rescue', '무엇을 먹일 것인가'],
    ['⚔️ PvP 활성화', 'combat', 'PvP 활성화'],
    ['🗡️ 벴다', 'combat', '벴다'],
    ['🏴‍☠️ 약탈! 곡식 3', 'combat', '약탈! 곡식 3'],
    ['💥 부서졌다', 'combat', '부서졌다'],
    ['🧪 몸 상태 세움 — 허기 10', 'dev', '몸 상태 세움 — 허기 10'],
    ['🌀 텔레포트 → (100,200)', 'info', '텔레포트 → (100,200)'],
    ['🎉 축하!', 'info', '축하!'],
    ['⏳ 기다려라', 'info', '기다려라'],
  ];
  let bad = 0, badText = 0;
  for (const [src, kind, text] of FIX) {
    const r = Notice.normalize({ type: 'notice', text: src });
    if (r.kind !== kind) { bad++; if (bad <= 3) console.log(`    ↳ ${JSON.stringify(src)} → ${r.kind} (기대 ${kind})`); }
    if (r.text !== text) { badText++; if (badText <= 3) console.log(`    ↳ ${JSON.stringify(src)} → ${JSON.stringify(r.text)} (기대 ${JSON.stringify(text)})`); }
  }
  ok(FIX.length >= 30, '① 전제: 픽스처가 30종 이상이다(작은 표로 자명 통과하지 않는다)', `${FIX.length}종`);
  ok(bad === 0, '① ★접두 이모지가 표대로 `kind` 로 접힌다', bad ? `${bad}건 어긋남` : '');
  ok(badText === 0, '①b ★텍스트는 **이모지만 빠지고** 나머지는 그대로다', badText ? `${badText}건 어긋남` : '');
  const kinds = new Set(FIX.map((f) => f[1]));
  ok(kinds.size >= 8, '①c 전제: 픽스처가 `kind` 8종을 실제로 덮는다', [...kinds].join(' '));
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 이모지 코드포인트 0 — 접두든 중간이든
// ─────────────────────────────────────────────────────────────────────────────
{
  const MID = [
    '수확! 🫐 ×3 + 씨앗 ×1',
    '고구마 섭취 (+허기 12) · 🤢 탈이 났다(부상↑)',
    '고구마 섭취 (+허기 12) · ✨ 잘 먹었다(사기↑)',
    '🎣🐟 **월척!** 연어 3.2kg — 여태 잡은 것 중 가장 크다',
    '아직 자라는 중 — 3/7일 · ❄겨울엔 안 자란다(월동)',
  ];
  let left = 0;
  for (const s of MID) { const r = Notice.normalize({ type: 'notice', text: s }); if (EMO.test(r.text)) left++; }
  ok(MID.some((s) => EMO.test(s.replace(/^\s*\p{Extended_Pictographic}️?/u, ''))),
    '② 전제: 픽스처에 **문장 한가운데** 이모지가 실제로 있다(접두만 있는 게 아니다)');
  ok(left === 0, '② ★중간에 박힌 이모지도 남지 않는다', left ? `${left}건 남음` : '');
  const r = Notice.normalize({ type: 'notice', text: '🎣🐟 **월척!** 연어' });
  ok(r.kind === 'fishing' && r.text === '**월척!** 연어',
    '②b 이모지 둘이 붙어 있어도 **맨 앞 하나**가 종류를 정하고 둘 다 빠진다', JSON.stringify(r.text));
  const z = Notice.normalize({ type: 'notice', text: '🏴‍☠️ 약탈!' });
  ok(z.text === '약탈!' && !/‍|️/.test(z.text),
    '②c 합자(ZWJ)·변이 선택자 찌꺼기가 안 남는다', JSON.stringify(z.text));
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ 이모지가 없던 문장은 **원문 그대로** · `kind:'info'`
// ─────────────────────────────────────────────────────────────────────────────
{
  const PLAIN = ['사체 없음', '너무 멀어', '오늘 몫은 다 꺼냈다 (한도 3)', '지금 낼 수 있는 의뢰가 없다'];
  let changed = 0, notInfo = 0;
  for (const s of PLAIN) {
    const r = Notice.normalize({ type: 'notice', text: s });
    if (r.text !== s) changed++;
    if (r.kind !== 'info') notInfo++;
  }
  ok(changed === 0, '③ ★이모지가 없던 문장은 **한 글자도 안 바뀐다**', changed ? `${changed}건 바뀜` : '');
  ok(notInfo === 0, '③b 그 문장들의 종류는 `info` 다');
  // 여러 줄 — 줄바꿈과 **이모지가 없던 줄**은 그대로다(모양을 바꾸지 않는다)
  const multi = '📋 농촌1 게시판\n · 돌 2 → 곡식 4\n · 약초 1 → 곡식 8';
  const rm = Notice.normalize({ type: 'notice', text: multi });
  ok(rm.text === '농촌1 게시판\n · 돌 2 → 곡식 4\n · 약초 1 → 곡식 8',
    '③c ★여러 줄 알림에서 **이모지가 없던 줄은 앞 공백까지 그대로**다(글자만 뺀다)', JSON.stringify(rm.text));
  // 알림이 아닌 메시지는 **손대지 않는다**
  const other = Notice.normalize({ type: 'inventory', text: '🏘️ 안 건드림' });
  ok(other.text === '🏘️ 안 건드림' && other.kind === undefined,
    '③d ★`type:"notice"` 가 아니면 경계가 **통과만 시킨다**(다른 메시지를 건드리면 안 된다)');
  // 호출부가 이미 kind 를 실었으면 존중한다(원문 청소가 시작될 때의 길)
  const kept = Notice.normalize({ type: 'notice', kind: 'board', text: '🏘️ 게시판 알림' });
  ok(kept.kind === 'board', '③e 호출부가 준 `kind` 를 덮어쓰지 않는다(영역별 원문 청소의 길)');
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ ★돌연변이 — 경계를 끄면 빨개지는가(= 이 검사가 잡을 수 있는 검사인가)
//    그리고 **접점이 실제로 배선돼 있는가**를 소스에서 확인한다(AST — 주석 아님).
// ─────────────────────────────────────────────────────────────────────────────
{
  const raw = { type: 'notice', text: '🏘️ 곳간에 넣었다' };
  ok(EMO.test(raw.text), '④ 전제: 원문에 이모지가 있다');
  ok(!EMO.test(Notice.normalize(raw).text), '④ 경계를 지나면 없다');
  ok(EMO.test(raw.text), '④b ★경계를 **안 지나면 그대로다** — 켜고 끄는 것이 실제로 다르다(돌연변이)');

  // 배선 검사 — `zone.js send()` 안에서 `Notice.normalize` 를 부르는가
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'zone.js'), 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 2023, sourceType: 'script', locations: true });
  let wired = false, sendSeen = false;
  const calls = (n, acc) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((x) => calls(x, acc)); return; }
    if (n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression'
      && n.callee.object && n.callee.object.name === 'Notice'
      && n.callee.property && n.callee.property.name === 'normalize') acc.push(true);
    for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'range') calls(n[k], acc);
  };
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'send') {
      sendSeen = true;
      const acc = []; calls(n.body, acc); if (acc.length) wired = true;
    }
    for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'range') walk(n[k]);
  };
  walk(ast);
  ok(sendSeen, '④c 전제: `zone.js` 에서 `send()` 를 찾았다(못 찾으면 아래가 자명 통과다)');
  ok(wired, '④ ★접점 한 줄이 **실제로 배선돼 있다** — `send()` 안에서 `Notice.normalize` 를 부른다');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
