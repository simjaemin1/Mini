#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// === scripts/test-chron-icons.js — 연표 아이콘 표가 서버 유형을 다 덮는가 (T55) ====
//
// ★왜
//   T50 이 사건 유형을 여섯에서 열넷으로 늘렸고, 연표 페이로드에 `type`·`deed`·`sev` 가 실린다.
//   T55 가 그걸 아이콘으로 갈랐다. 그런데 **표는 사본이다** — 서버가 유형을 하나 더 넣는 날
//   클라 표엔 그 키가 없고, 화면은 조용히 🕰️ 로 되돌아간다. **조용한 것이 문제다.**
//   ⇒ 이 검사기가 "서버 `TYPES` ⊆ 클라 `CHRON_TYPE_EMO` 의 키" 를 지킨다.
//
// ★서버는 **읽기만** 한다(require — 정규식으로 긁으면 그게 또 사본이다).
// ★클라는 소스에서 표를 읽는다(브라우저를 안 띄운다 — 이 검사는 표의 문제다).
// ★자명 통과 금지: 표에서 한 유형을 빼면 빨개지는지 먼저 보인다.
//
// 실행: node scripts/test-chron-icons.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };

// ── 클라 표를 소스에서 읽는다 ────────────────────────────────────────────────
const CLIENT_FILE = 'public/client/65-s-chronicle.js';
function clientEmoKeys(src) {
  const i = src.indexOf('const CHRON_TYPE_EMO = {');
  if (i < 0) return null;
  let j = src.indexOf('{', i), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  const body = src.slice(j, k + 1);
  const keys = new Set();
  for (const mm of body.matchAll(/(?:^|[,{\s])([A-Z][A-Z0-9_]*)\s*:/gm)) keys.add(mm[1]);
  return keys;
}

console.log('\n=== 연표 아이콘 — 클라 표가 서버 유형을 다 덮는가 (T55) ===');

const src = fs.readFileSync(path.join(ROOT, CLIENT_FILE), 'utf8');
const CK = clientEmoKeys(src);
ok(!!CK, `① 전제: 클라 표(\`CHRON_TYPE_EMO\`)를 실제로 읽었다 — ${CLIENT_FILE}`, CK ? `${CK.size}키` : '못 찾았다');
if (!CK) { console.log(`\n=== PASS ${pass} / FAIL ${++fail} ===`); process.exit(1); }

// ── 서버 정본 ────────────────────────────────────────────────────────────────
let Events = null;
try { Events = require(path.join(ROOT, 'server', 'events.js')); } catch (e) { console.log(`    (events.js 로드 실패: ${e.message})`); }
const ST = (Events && Array.isArray(Events.TYPES)) ? Events.TYPES : null;
ok(!!ST && ST.length >= 6, '② 전제: 서버 유형 표를 실제로 읽었다(빈 집합이면 아래가 자명 통과다)', ST ? `${ST.length}유형` : '못 읽었다');
if (!ST) { console.log(`\n=== PASS ${pass} / FAIL ${++fail} ===`); process.exit(1); }

const missing = ST.filter((t) => !CK.has(t));
ok(missing.length === 0, '③ ★서버 유형 ∖ 클라 아이콘 표 = ∅ (빠진 유형은 조용히 🕰️ 로 되돌아간다)',
   missing.length ? missing.join(' ') : `${ST.length}유형 전부 덮는다`);

// ── 아이콘이 실제로 갈리는가(같은 이모지를 붙여 놓으면 표는 있어도 화면은 안 갈린다) ──
const emo = {};
{
  const i = src.indexOf('const CHRON_TYPE_EMO = {');
  let j = src.indexOf('{', i), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  for (const mm of src.slice(j, k + 1).matchAll(/([A-Z][A-Z0-9_]*)\s*:\s*'([^']+)'/g)) emo[mm[1]] = mm[2];
}
const vals = ST.map((t) => emo[t]).filter(Boolean);
ok(new Set(vals).size >= Math.min(8, ST.length),
   '④ ★아이콘이 실제로 갈린다(표만 채우고 같은 그림을 붙이면 화면은 그대로다)',
   `서로 다른 그림 ${new Set(vals).size}종 / ${vals.length}유형`);
// ★[T66] 그림이 이모지 → **선 아이콘 이름**으로 바뀌었다. 폴백도 🕰️ 가 아니라 `scroll` 이다.
ok(!vals.includes('scroll'), "⑤ 표 안에 폴백(`scroll`)을 그대로 넣어 두지 않았다", vals.filter((v) => v === 'scroll').length + '건');

// ── 폴백이 살아 있나 ─────────────────────────────────────────────────────────
ok(/\|\|\s*'scroll'/.test(src), "⑥ 모르는 유형은 `scroll` 폴백 — 서버가 유형을 늘려도 화면이 안 깨진다");

// ── ★자명 통과 금지 — 표에서 한 유형을 빼면 ③ 이 잡는가 ──────────────────────
console.log('\n★이 검사기가 실패할 줄 아는가 — 표에서 한 유형을 빼 본다');
{
  const victim = ST[ST.length - 1];
  const broken = src.replace(new RegExp(`${victim}\\s*:\\s*'[^']+',?`), '');
  const bk = clientEmoKeys(broken);
  const miss2 = ST.filter((t) => !bk.has(t));
  ok(miss2.length === 1 && miss2[0] === victim,
     `  ✓검사: \`${victim}\` 을 빼면 ③ 이 그 유형을 집어낸다`, miss2.join(' ') || '(못 잡았다)');
}
{ // 대조 — 원문은 통과한다(항상 실패하는 검사기가 아니다)
  const bk = clientEmoKeys(src);
  ok(ST.filter((t) => !bk.has(t)).length === 0, '  ✓대조: 원문 표는 통과한다');
}

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
