// @regress
// === scripts/test-client-globals.js — 클라 최상위 이름 충돌 감사 ==============
//
// `public/client.js` 가 조각들로 갈리면서 **모든 조각이 같은 전역 스코프를 공유**하게 됐다.
// 그 전엔 IIFE 클로저가 이름을 가둬 줬다. 이제는 안 가둬 준다 —
//   · 두 파일이 같은 `let/const` 를 선언하면 **SyntaxError**(페이지가 통째로 안 뜬다)
//   · 두 파일이 같은 `function` 을 선언하면 **조용한 덮어쓰기**(이쪽이 훨씬 위험하다)
//   · 브라우저 전역(`open`·`name`·`status`·`length`·`top`…)과 겹쳐도 같은 일이 난다
// ⇒ 이 하네스가 그 셋을 막는다. 분할의 안전벨트다.
//
// ★브라우저 전역 목록은 **추측하지 않는다** — 실제 Chromium 에서 뜬 것을 쓴다
//   (`scripts/browser-globals.json` · 갱신: `node scripts/dump-browser-globals.js`).
'use strict';
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };

// ── 공용: 파일 하나의 **최상위** 선언 이름 ───────────────────────────────────
function pat(p, out) {
  if (!p) return;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ObjectPattern') for (const q of p.properties) pat(q.value || q.argument, out);
  else if (p.type === 'ArrayPattern') for (const q of p.elements) pat(q, out);
  else if (p.type === 'AssignmentPattern') pat(p.left, out);
  else if (p.type === 'RestElement') pat(p.argument, out);
}
function topDecls(code) {
  const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'script' });
  const fns = [], lex = [], vars = [];
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration' && st.id) fns.push(st.id.name);
    else if (st.type === 'ClassDeclaration' && st.id) lex.push(st.id.name);
    else if (st.type === 'VariableDeclaration') { const b = st.kind === 'var' ? vars : lex; for (const d of st.declarations) pat(d.id, b); }
  }
  return { fns, lex, vars, all: [...fns, ...lex, ...vars] };
}
// index.html 등록 순서의 classic 스크립트 전부(조각 포함)
function registeredScripts(html) {
  return [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*>/g)].map((m) => m[1].split('?')[0]);
}

// ── 실검사 ───────────────────────────────────────────────────────────────────
function audit(htmlPath, pubDir) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const files = registeredScripts(html).filter((f) => fs.existsSync(path.join(pubDir, f)));
  const owner = new Map();          // 이름 → [파일…]
  const perFile = new Map();
  const execOutsideMain = [];
  for (const f of files) {
    const code = fs.readFileSync(path.join(pubDir, f), 'utf8');
    const d = topDecls(code);
    perFile.set(f, d);
    for (const n of d.all) { if (!owner.has(n)) owner.set(n, []); owner.get(n).push(f); }
    // ⓒ 최상위 실행문이 99-main 밖에 **새로** 생기는지(규약 위반 조기 발견)
    if (/client\//.test(f) && !/99-main/.test(f)) {
      const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'script', locations: true });
      for (const st of ast.body) if (st.type === 'ExpressionStatement') execOutsideMain.push(`${f}:${st.loc.start.line}`);
    }
  }
  const dupes = [...owner.entries()].filter(([, v]) => v.length > 1);
  return { files, perFile, dupes, execOutsideMain, owner };
}

console.log('\n=== 클라 최상위 이름 충돌 감사 ===');
const R = audit(path.join(PUB, 'index.html'), PUB);
const names = [...R.owner.keys()];

console.log('\n⓪ 검사 상황 — 무엇을 재고 있나');
ok(R.files.length >= 10, `index.html 이 등록한 classic 스크립트 ${R.files.length}개를 전부 읽었다`, R.files.join(' '));
ok(names.length > 500, `최상위 선언 이름 ${names.length}개 — 실제 분할본이다(빈 검사가 아니다)`);

console.log('\n① 같은 이름을 두 파일이 선언하지 않는다');
ok(R.dupes.length === 0, `중복 선언 ${R.dupes.length}건`,
   R.dupes.slice(0, 5).map(([n, v]) => `${n}(${v.join(',')})`).join(' · '));

console.log('\n② 브라우저 전역과 겹치지 않는다');
const bgFile = path.join(__dirname, 'browser-globals.json');
ok(fs.existsSync(bgFile), '실측 전역 목록이 있다 (없으면 node scripts/dump-browser-globals.js)');
const BG = JSON.parse(fs.readFileSync(bgFile, 'utf8'));
ok(Array.isArray(BG.names) && BG.names.length > 500, `전역 ${BG.names.length}개 — 실제 Chromium 에서 뜬 것`, BG.userAgent || '');
const bgSet = new Set(BG.names);
const hit = names.filter((n) => bgSet.has(n));
ok(hit.length === 0, `브라우저 전역과 교집합 ${hit.length}건`, hit.slice(0, 8).join(' '));

console.log('\n③ 최상위 실행문이 99-main.js 밖에 **새로** 생기지 않았다');
// ★분할 시점에 제자리에 남은 실행문 115개는 정상이다(뒤 참조가 없어 옮길 이유가 없었다).
//   규약은 "새 최상위 실행문은 99-main.js 에만"이므로, 검사는 **증가분**을 본다.
//   조각을 의도적으로 재구성하면 이 표를 같이 갱신하라(그 자체가 리뷰 지점이다).
const BASELINE = {
  'client/00-const.js': 15, 'client/11-r1-mountain.js': 41, 'client/20-r2-visibility.js': 5,
  'client/30-n-net.js': 13, 'client/40-r2-sprites.js': 2,
  // ★★[T53 2026-09-02] `41-h-char.js`(18) 를 2차 분할했다. **실행문이 늘지 않았다 — 나뉘었다.**
  //   17 은 조각 ①(진단 훅), 1 은 조각 ④(`setInterval(updateHud,100)`). 합은 그대로 18.
  //   그래서 표를 옮겨 적었다(위 주석이 요구하는 "같이 갱신하라"). 진짜 불변식은 **총계**이고,
  //   바로 아래 두 번째 assert 가 그걸 본다 — 표를 늘려도 총계가 늘면 거기서 잡힌다.
  'client/41-h-bubble.js': 17, 'client/44-h-hud.js': 1,
  // ★★[T82 ⓪ 2026-09-03] `50-i-panel` 12 → **11**. `boot()` 호출 한 줄을 **`99-main.js` 로 옮겼다**
  //   (T0-b: 최상위 실행문은 그 파일 하나). 그러니 "밖의 실행문"은 **줄어야 맞다** — 총계도 115 → 114.
  //   ⚠줄었을 때 이 표를 안 고치면 아래 총계 assert 가 빨개진다. 그게 이 검사의 값이다:
  //     실행문이 **어디로** 갔는지 사람이 한 번 말하게 만든다(옮긴 것과 사라진 것은 다르다).
  'client/50-i-panel.js': 11, 'client/51-s-side.js': 4, 'client/60-t-market.js': 4,
  'client/80-bigmap.js': 1,
};
const cur = {};
for (const loc of R.execOutsideMain) { const f = loc.slice(0, loc.lastIndexOf(':')); cur[f] = (cur[f] || 0) + 1; }
const grew = Object.entries(cur).filter(([f, n]) => n > (BASELINE[f] || 0))
  .map(([f, n]) => `${f} ${BASELINE[f] || 0}→${n}`);
ok(grew.length === 0, `증가한 조각 ${grew.length}개`, grew.join(' · ') || `기준선 합계 ${Object.values(BASELINE).reduce((a, b) => a + b, 0)}건 유지`);
const total = Object.values(cur).reduce((a, b) => a + b, 0);
ok(total === Object.values(BASELINE).reduce((a, b) => a + b, 0),
   `총계가 기준선과 같다`, `${total}건`);

// ── ★검사 상황 선행 assert — 일부러 깨뜨려 본다(자명 통과 금지) ─────────────
console.log('\n④ ★이 감사기가 실패할 줄 아는가 — 픽스처로 일부러 깨뜨린다');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cg-'));
function fixture(files) {
  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(path.join(TMP, 'client'), { recursive: true });
  const tags = Object.keys(files).map((f) => `  <script src="${f}?v=1"></script>`).join('\n');
  fs.writeFileSync(path.join(TMP, 'index.html'), `<html><body>\n${tags}\n</body></html>`);
  for (const [f, code] of Object.entries(files)) fs.writeFileSync(path.join(TMP, f), code);
  return audit(path.join(TMP, 'index.html'), TMP);
}
{ const r = fixture({ 'client/a.js': 'const foo = 1;\n', 'client/99-main.js': 'const foo = 2;\n' });
  ok(r.dupes.length === 1 && r.dupes[0][0] === 'foo', '두 조각에 같은 `const` → ① 이 잡는다', `중복 ${r.dupes.length}건`); }
{ const r = fixture({ 'client/a.js': 'function open(){}\n', 'client/99-main.js': '\n' });
  const h = [...r.owner.keys()].filter((n) => bgSet.has(n));
  ok(h.length === 1 && h[0] === 'open', '`function open(){}` → ② 가 잡는다(조용한 덮어쓰기가 제일 위험하다)', h.join(' ')); }
{ const r = fixture({ 'client/a.js': 'window.zzz = 1;\n', 'client/99-main.js': '\n' });
  ok(r.execOutsideMain.length === 1, '99-main 밖 최상위 실행문 → ③ 이 잡는다(기준선에 없는 파일 = 증가)', `${r.execOutsideMain.length}건`); }
{ const r = fixture({ 'client/a.js': 'const q = 1;\n', 'client/99-main.js': 'const w = 2;\n' });
  ok(r.dupes.length === 0 && r.execOutsideMain.length === 0, '★대조 — 깨끗한 픽스처는 통과한다(항상 실패하는 감사기가 아니다)'); }
fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
