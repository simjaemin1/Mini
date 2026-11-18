#!/usr/bin/env node
// @regress
// @harness-only
// @bait 2
// === scripts/test-notice-mark.js — e2e 의 "마지막 알림 N줄" 판정 0 · 표지 자 `lib-notice-mark` (T1367 · T1339 회부 1) =================
//
// ★무엇: ① `scripts/e2e-*.js` 에서 `window.__notices … slice(-N)`(고리의 마지막 N줄)을 읽는 줄은 모두 표지 뒤 알림(`lib-notice-mark`)으로
//   옮겼거나, 판정 밖인 까닭을 같은 줄 `// @notice-ok <까닭>` 으로 단다(진단 찍기 · 고리 전부 40칸 · 칸 수를 재는 자리 · T1339 표지).
//   까닭 없는 표지 · 표지 없는 N줄 읽기 = 빨강. ② 자 `lib-notice-mark` 의 뜻을 가짜 창(`window.__notices` 40칸 고리 — 클라 `50-i-panel.js`
//   와 같은 꼴)으로 잰다: 표지 뒤만 · 앞 판 글자 0 · 표지가 고리에서 밀려나도 · 배열을 비워도 · 표지 칸은 안 돌려준다 · 기다림의 닿음과 상한.
// ★미끼(이 파일 안): ⓐ e2e 사본 한 곳을 옛 꼴(N줄 · 표지 없음)로 되돌림 → ① 이 그 줄 하나로 빨강 ⓑ 자 사본의 "표지 뒤" 를 "마지막 두 줄"로 → ② 앞 판 글자 단언이 빨강.
// ★제품 부름 0(`@harness-only`) — e2e 파일은 글자로만 읽는다.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SCRIPTS = __dirname;
const NM = require('./lib-notice-mark.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? '  ' + x : '')); };

//   N줄 읽기 = `window.__notices` 를 부르는 줄에 `.slice(-<수>` 가 같이 있는 줄(고리 끝 N칸)
const READ_RE = /window\.__notices[^\n]*\.slice\(\s*-\s*\d+/;
const TAG_RE = /\/\/\s*@notice-ok\b(.*)$/;
function scan(text) {
  const bare = [], tagged = [], noWhy = [];
  text.split('\n').forEach((l, i) => {
    if (!READ_RE.test(l)) return;
    const t = TAG_RE.exec(l);
    if (!t) bare.push(i + 1);
    else if (!t[1].trim()) noWhy.push(i + 1);
    else tagged.push({ line: i + 1, why: t[1].trim() });
  });
  return { bare, tagged, noWhy };
}

console.log('\n=== ① e2e 의 "마지막 알림 N줄" 판정 0 (T1367) ===');
const E2E = fs.readdirSync(SCRIPTS).filter((f) => /^e2e-.*\.js$/.test(f)).sort();
let bare = [], noWhy = [], tagged = [], users = [];
for (const f of E2E) {
  const s = fs.readFileSync(path.join(SCRIPTS, f), 'utf8'); const r = scan(s);
  bare = bare.concat(r.bare.map((n) => `${f}:${n}`)); noWhy = noWhy.concat(r.noWhy.map((n) => `${f}:${n}`));
  tagged = tagged.concat(r.tagged.map((x) => `${f}:${x.line}`));
  if (/require\(\s*['"]\.\/lib-notice-mark(\.js)?['"]\s*\)/.test(s)) users.push(f);
}
ok(E2E.length >= 50 && users.length >= 15, '① [전제] e2e 를 실제로 읽었고 표지 자를 쓰는 e2e 가 여럿이다(0 이면 아래가 자명 통과다)', `e2e ${E2E.length} · 표지 자 ${users.length}`);
ok(bare.length === 0, '★★① 고리의 마지막 N줄을 읽는 줄 0 — 표지 뒤 알림(`lib-notice-mark`) 또는 `// @notice-ok <까닭>`', bare.join(' ') || `0 (표지 단 판정 밖 ${tagged.length}줄)`);
ok(noWhy.length === 0, '★① `@notice-ok` 표지에는 까닭이 붙는다', noWhy.join(' ') || '0');
//   판정 밖 표지는 늘면 보인다(늘리는 것 자체는 빨강 아님 — 줄마다 까닭이 있다) — 지금 판 기준 수를 찍는다(판정 밖)
console.log(`    (참고 · 판정 밖) @notice-ok ${tagged.length}줄 — ${tagged.join(' ')}`);

console.log('\n=== ② 표지 자의 뜻 — 가짜 창(40칸 고리) ===');
//   가짜 page: evaluate(fn, arg) 를 가짜 창 안에서 부른다(브라우저 0). 클라 `showNotice` 의 고리와 같은 꼴: push · 40 넘으면 shift.
function fakePage() {
  const win = { __notices: [] };
  const ctx = vm.createContext({ window: win, String });
  return {
    win,
    push: (t) => { (win.__notices = win.__notices || []).push(t); if (win.__notices.length > 40) win.__notices.shift(); },
    evaluate: async (fn, arg) => vm.runInContext(`(${fn.toString()})`, ctx)(arg),
  };
}
async function laws(L) {
  const out = {};
  { const p = fakePage(); p.push('앞 판: 너무 멉니다'); const t = await L.mark(p); const s0 = await L.since(p, t); p.push('물을 마셨습니다');
    out.after = `${JSON.stringify(s0)}|${JSON.stringify(await L.since(p, t))}`; }
  { const p = fakePage(); const t = await L.mark(p); for (let i = 0; i < 45; i++) p.push('잡음 ' + i);
    const s = await L.since(p, t); out.ring = `${s.length}:${s[0]}`; }
  { const p = fakePage(); p.push('앞 판'); const t = await L.mark(p); p.win.__notices = []; p.push('뒤'); out.clear = JSON.stringify(await L.since(p, t)); }
  { const p = fakePage(); const t1 = await L.mark(p); p.push('가'); const t2 = await L.mark(p); p.push('나');
    out.marks = `${JSON.stringify(await L.since(p, t1))}|${JSON.stringify(await L.since(p, t2))}`; }
  { const p = fakePage(); const t = await L.mark(p); setTimeout(() => p.push('🎣 놓쳤습니다'), 150);
    const r = await L.waitSince(p, t, (l) => l.some((x) => /놓쳤습니다/.test(x)), { capMs: 5000, pollMs: 20 }); out.wait = `${r.hit}:${r.list.length}`;
    const r2 = await L.waitSince(p, t, (l) => l.some((x) => /거절/.test(x)), { capMs: 120, pollMs: 20 }); out.cap = `${r2.hit}:${r2.ms >= 120}`; }
  { const p = fakePage(); p.push('x (문턱 1)'); const t = await L.mark(p); p.push('잡음'); p.push('🧪 마을 곡식 9→2 (문턱 5 · 갚을거 a 1)');
    out.line = (await L.waitLine(p, t, /\(문턱 /, { capMs: 500, pollMs: 20 })).line; }
  return out;
}
const WANT = { after: '[]|["물을 마셨습니다"]', ring: '40:잡음 5', clear: '["뒤"]', marks: '["가","나"]|["나"]', wait: 'true:1', cap: 'false:true', line: '🧪 마을 곡식 9→2 (문턱 5 · 갚을거 a 1)' };
(async () => {
  const got = await laws(NM);
  ok(got.after === WANT.after, '★★② 표지 뒤만 돌려준다 — 앞 판이 남긴 같은 글자를 안 읽는다', got.after);
  ok(got.ring === WANT.ring, '★② 표지가 40칸 고리에서 밀려나도 남은 것 전부가 표지 뒤다(N줄 자름 0)', got.ring);
  ok(got.clear === WANT.clear, '② 배열을 비운 뒤에도 그 뒤 것만', got.clear);
  ok(got.marks === WANT.marks, '② 표지 칸은 안 돌려주고 · 표지끼리 섞이지 않는다', got.marks);
  ok(got.wait === WANT.wait, '★② 기다림 — 늦게 온 답에 닿는다(고정 sleep 아님)', got.wait);
  ok(got.cap === WANT.cap, '② 기다림 상한 — 안 오면 닿지 않음으로 돌아온다(판정은 부른 쪽 · 안전망)', got.cap);
  ok(got.line === WANT.line, '② `waitLine` — 표지 뒤 맞는 줄(앞 판 "(문턱" 줄 아님)', got.line);

  console.log('\n=== ③ 미끼 — 한 자리만 바꾼 사본 둘 ===');
  //   ⓐ e2e 사본 — 옮긴 자리 하나(`e2e-fishing` "놓쳤습니다")를 옛 꼴(마지막 넉 줄)로 되돌린다
  { const src = fs.readFileSync(path.join(SCRIPTS, 'e2e-fishing.js'), 'utf8');
    const from = /const notes3 = \(await NM\.waitSince\([^\n]*\n/;
    const hits = (src.match(new RegExp(from.source, 'g')) || []).length;
    const bad = src.replace(from, "const notes3 = await page.evaluate(() => (window.__notices || []).slice(-4));\n");
    const r = scan(bad), line = bad.split('\n').findIndex((l) => l.startsWith('  const notes3 = await page.evaluate')) + 1;
    ok(hits === 1 && r.bare.length === 1 && r.bare[0] === line, '★③ⓐ [미끼] 옮긴 자리 하나를 옛 꼴(마지막 넉 줄)로 되돌린 e2e 사본 — ① 이 그 줄 하나로 빨강', `바꾼 자리 ${hits} · 빨강 줄 ${r.bare.join(',')}(${line})`); }
  //   ⓑ 자 사본 — `since` 의 "표지 뒤" 를 "마지막 두 줄"로
  { const p = path.join(SCRIPTS, 'lib-notice-mark.js'), src = fs.readFileSync(p, 'utf8');
    const from = 'return (i >= 0 ? a.slice(i + 1) : a.slice())';
    const hits = src.split(from).length - 1;
    const m = { exports: {} };
    new Function('module', 'exports', 'require', src.replace(from, 'return a.slice(-2)'))(m, m.exports, require);
    const g = await laws(m.exports);
    const red = Object.keys(WANT).filter((k) => g[k] !== WANT[k]);
    ok(hits === 1 && red.includes('after') && red.includes('ring'), '★③ⓑ [미끼] 자 사본의 "표지 뒤" 를 "마지막 두 줄"로 — ② 앞 판 글자 · 고리 단언이 빨강', `바꾼 자리 ${hits} · 빨강 ${red.join(' ')}`); }

  console.log(`\n=== test-notice-mark 결과: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})();
