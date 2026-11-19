#!/usr/bin/env node
'use strict';
// (계측 자 · 판정 0) T1383 ② 남은 것 — 옛 @regress 하네스 가운데 "미끼는 있으나 바꾼 자리 수를 안 세는" 것(lib-harness-guard ⓓ)의 꼴 가름 표.
//   쓰는 법: node 계측/T1375_2026-11-18/옛미끼표.js > 계측/T1375_2026-11-18/옛미끼표.md
//   꼴(글자로만 — 손으로 뜻을 바꿔야 하는지 가르는 짐작):
//     ㉮ 자리 셈이 미끼 판정과 떨어져 있거나 일부 미끼만(셈을 옮기면 뜻이 바뀐다 · 미끼 판정 줄에 넣으려면 손)
//     ㉯ 사본 미끼 · 자리 셈 없음(`.replace(` 로 사본을 짓지만 앵커가 몇 번인지 안 센다 — 셈을 새로 써야 한다)
//     ㉰ 끔 대조 미끼(손잡이를 끈 판이 대조 · 사본 0 — "바꾼 자리" = 손잡이 하나인지 뜻을 정해야 한다)
//     ㉱ 행위 · 픽스처 미끼(가짜 남 · 모서리 캐시 · 대조 몸 — 소스 사본이 아니다)
//     ㉲ 미끼 판정 호출 0(글자에 미끼 · bait 는 있으나 판정 호출 글자엔 없다)
const fs = require('fs'), path = require('path');
const S = path.join(__dirname, '..', '..', 'scripts');
const G = require(path.join(S, 'lib-harness-guard.js'));
const rows = [];
for (const f of fs.readdirSync(S).filter((x) => /^(test|e2e)-.*\.js$/.test(x)).sort()) {
  const src = fs.readFileSync(path.join(S, f), 'utf8');
  if (!G.regress(src) || !G.hasBait(src) || G.baitCounts(src) !== false) continue;
  const C = G.calls(src) || [], B = C.filter((c) => /미끼|\bbait\b/i.test(c));
  const once = /split\(\s*[\w.[\]]+\s*\)\.length\s*(===|!==)\s*2|split\([^)]*\)\.length\s*-\s*1/.test(src) && /replace\(/.test(src);
  const copy = /(bait|decoy|mut|BAIT|Bait)\w*\s*=[^;\n]*\.replace\(|\.replace\([^)]*\)[^;\n]*(bait|decoy|미끼)/i.test(src) || /_compile\([^)]*replace\(/.test(src);
  const off = B.some((c) => /끔|OFF|=0|off\b/.test(c));
  const cls = !B.length ? '㉲' : once ? '㉮' : copy ? '㉯' : off ? '㉰' : '㉱';
  rows.push({ f, cls, n: B.length });
}
const by = {}; for (const r of rows) (by[r.cls] = by[r.cls] || []).push(r);
const NAME = { '㉮': '자리 셈이 미끼 줄과 떨어짐 · 일부만', '㉯': '사본 미끼 · 자리 셈 없음', '㉰': '끔 대조 미끼', '㉱': '행위 · 픽스처 미끼', '㉲': '미끼 판정 호출 0' };
console.log(`# 옛 하네스 미끼 — 바꾼 자리를 안 세는 @regress ${rows.length}종 꼴 표 (T1383 ② 남은 것 · 글자 짐작 · 판정 0)\n`);
console.log('· T1375 가 넷 · T1383 이 ㉮ 11 · ㉯ 13 · ㉰ 여섯을 옮겼다(`계측/T1383_2026-11-19/㉰_규약_제안.md`) — 이 표에서 빠진다.');
console.log('· 아래는 손으로 뜻을 바꿔야 하는 것(목록만).\n');
console.log('| 꼴 | 수 | 하네스(미끼 판정 호출 수) |'); console.log('|---|---:|---|');
for (const k of ['㉮', '㉯', '㉰', '㉱', '㉲']) { const L = by[k] || []; console.log(`| ${k} ${NAME[k]} | ${L.length} | ${L.map((r) => `\`${r.f}\`(${r.n})`).join(' · ')} |`); }
