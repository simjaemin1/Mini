#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-harness-lint.js — 하네스가 **이모지로 판정하지 않는다** [T84] ==========
//
// ★왜 [재민 확정 2026-09-03 · T84]
//   T78(서버 알림)·T66(클라 판)이 이모지를 지웠다. 그런데 하네스가 그 글자로 문장을 찾고 있으면
//   그 절은 **거짓 초록이거나 곧 빨강**이다 — 그리고 제일 나쁜 쪽은 거짓 초록이다(족보 100).
//   실제로 T69 가 순수 origin/main 에서 `e2e-trade` 네 절이 T78 로 깨진 걸 실측했다
//   (내가 정규식으로 센 목록은 그걸 놓쳤다 — 그래서 이 린트는 **AST 로** 센다).
//
// ★★가르는 규칙을 **코드로** 둔다(장식은 허용 · 판정은 금지):
//   · 장식 = `console.log`/`say`/`process.stdout.write` 의 인자 · `ok(cond, msg, extra)` 의 msg·extra
//   · 판정 = 정규식 리터럴 · `.test/.includes/.startsWith/.endsWith/.match/.indexOf` 의 인자 ·
//            `page.$`/`locator`/`click`/`waitForSelector` 의 셀렉터 · `===`/`!==` 비교의 한쪽 ·
//            `ok()` 의 **첫 인자(조건)** 안
//   · 픽스처 = 세계에 **넣는** 값(`items`/`kgs`/`lots`/`text` 같은 속성값) — 넣는 것은 이 카드가 아니다
//
// ⚠예외 파일이 넷 있다 — **이모지가 곧 검사 대상**인 하네스다(아래 `ALLOW` · 이유를 코드에 적는다).
'use strict';
const path = require('path');
const fs = require('fs');
const acorn = require(path.join(__dirname, '..', 'node_modules', 'acorn'));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };
const EMO = /\p{Extended_Pictographic}/u;
const SCRIPTS = path.join(__dirname);

// 이모지가 **검사 대상 자체**인 하네스 — 여기선 판정 자리에 이모지가 있어야 정상이다
const ALLOW = {
  'test-notice.js': '알림 경계(T78)의 입력 픽스처와 기대값이 곧 이모지다',
  'test-events.js': '㊸ 절이 "문장에 이모지가 없다"를 재고, 돌연변이로 하나를 되살린다',
  'e2e-events.js': '★⑤-c 자명 통과 금지 대조가 이모지 한 줄을 되살린 소스다 — 판정이 아니라 픽스처다',
  'test-itemlabel.js': '⑫ 절이 "클라 소스에 이모지 0"을 재고, 자명 통과 금지 대조를 심는다',
  'test-harness-lint.js': '이 파일 자신 — 규칙과 돌연변이 픽스처가 이모지다',
};

const JUDGE_PRED = new Set(['test', 'includes', 'startsWith', 'endsWith', 'match', 'indexOf', 'search']);
const JUDGE_SEL = new Set(['$', '$$', 'locator', 'click', 'waitForSelector', 'fill']);

// 파일 하나에서 **판정 자리의 이모지**를 모은다
function judgeHits(src, file) {
  const ast = acorn.parse(src, { ecmaVersion: 2023, sourceType: 'script', locations: true, allowReturnOutsideFunction: true });
  const hits = [];
  const has = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (node.type === 'Literal' && node.regex) return EMO.test(node.regex.pattern);
    if (node.type === 'Literal' && typeof node.value === 'string') return EMO.test(node.value);
    if (node.type === 'TemplateLiteral') return node.quasis.some((q) => EMO.test(q.value.cooked || ''));
    return false;
  };
  const scan = (node, why) => {   // 이 서브트리 안의 이모지 리터럴을 전부 담는다
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((x) => scan(x, why)); return; }
    if (has(node)) hits.push({ line: node.loc.start.line, why,
      text: node.regex ? '/' + node.regex.pattern + '/' : (node.value != null ? String(node.value) : node.quasis.map((q) => q.value.cooked).join('${}')) });
    for (const k of Object.keys(node)) if (k !== 'loc' && k !== 'range') scan(node[k], why);
  };
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'CallExpression') {
      const c = n.callee, mem = c && c.type === 'MemberExpression', prop = mem && c.property && c.property.name;
      if (prop && JUDGE_PRED.has(prop)) { n.arguments.forEach((a) => scan(a, `.${prop}()`)); if (mem && has(c.object)) scan(c.object, `.${prop}() 수신자`); }
      if (prop && JUDGE_SEL.has(prop)) n.arguments.forEach((a) => scan(a, `${prop}() 셀렉터`));
      if (c && c.type === 'Identifier' && /^(ok|chk|assert)$/.test(c.name) && n.arguments.length) scan(n.arguments[0], 'ok() 조건');
    }
    if (n.type === 'BinaryExpression' && /^(===|!==|==|!=)$/.test(n.operator)) { scan(n.left, `${n.operator} 비교`); scan(n.right, `${n.operator} 비교`); }
    for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'range') walk(n[k]);
  };
  walk(ast);
  // 같은 줄 중복 제거
  const seen = new Set();
  return hits.filter((h) => { const k = h.line + '|' + h.text; if (seen.has(k)) return false; seen.add(k); return true; });
}

console.log('\n=== 하네스 린트 — 판정 자리에 이모지 0 · 라벨 셀렉터 0 ===\n');

const files = fs.readdirSync(SCRIPTS).filter((f) => /^(test|e2e)-.*\.js$/.test(f)).sort();
ok(files.length > 60, '① 전제: 하네스를 실제로 여럿 읽었다(빈 목록이면 아래가 자명 통과다)', `${files.length}파일`);

let parsed = 0;
const bad = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
  let hits;
  try { hits = judgeHits(src, f); parsed++; }
  catch (e) { bad.push({ f, line: 0, why: '파싱 실패', text: String(e.message).slice(0, 50) }); continue; }
  if (ALLOW[f]) continue;
  for (const h of hits) bad.push({ f, ...h });
}
ok(parsed === files.length, '①b ★전부 **파싱됐다** — 못 읽은 파일이 조용히 면제되지 않는다', `${parsed}/${files.length}`);
ok(bad.length === 0, '② ★판정 자리에 이모지 0 (정규식 · 술어 인자 · 셀렉터 · 비교 · ok() 조건)',
  bad.length ? bad.slice(0, 5).map((b) => `${b.f}:${b.line} ${b.why} ${JSON.stringify(b.text.slice(0, 28))}`).join(' · ') + (bad.length > 5 ? ` … 총 ${bad.length}` : '') : `${files.length - Object.keys(ALLOW).length}파일`);

// ③ 라벨 셀렉터 — 글자로 로비를 열지 않는다(라벨은 언제든 바뀐다)
{
  const offenders = files.filter((f) => /has-text\(["'][^"']*입장|has-text\(["'][^"']*나루터/.test(fs.readFileSync(path.join(SCRIPTS, f), 'utf8')));
  ok(offenders.length === 0, '③ ★로비 버튼을 **글자로** 집는 하네스 0 (`#enter` 로 집는다)', offenders.join(' '));
  const users = files.filter((f) => /['"]#enter['"]/.test(fs.readFileSync(path.join(SCRIPTS, f), 'utf8')));
  ok(users.length >= 25, '③b 전제: 실제로 여럿이 `#enter` 를 쓴다(0이면 위가 자명 통과다)', `${users.length}파일`);
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  ok(/id="enter"/.test(html), '③c 그 id 가 화면에 실제로 있다');
}

// ④ ★돌연변이 — 판정에 이모지를 되살리면 잡고, **장식은 안 잡는다**(대조)
{
  const JUDGE_SRC = "const x = '\u{1F4CB} 게시판'; ok(/\u{1F4CB}/.test(x), 'm');";
  const PRINT_SRC = "console.log('✅ 다 됐다'); ok(true, '✅ 장식은 통과');";
  // 픽스처가 문법 오류면 **하네스가 죽는 게 아니라** 그 절이 빨강이어야 한다
  const mut = (src) => { try { return judgeHits(src, 'mut.js'); } catch (e) { return null; } };
  const j = mut(JUDGE_SRC);
  const p = mut(PRINT_SRC);
  ok(j && j.length >= 1, '④ ★판정에 이모지를 되살리면 **잡는다**(잡을 수 있는 검사다)', j ? `${j.length}자리` : '픽스처 파싱 실패');
  ok(p && p.length === 0, '④b ★★그런데 **장식은 안 잡는다** — `console.log` 와 `ok()` 의 메시지는 통과', p ? `${p.length}자리` : '픽스처 파싱 실패');
  const F = mut("const s='x'; ok(s.includes('\u{1F3D8}'), 'm');");
  ok(F && F.length === 1, '④c 술어 인자(`includes`)도 잡는다');
  const S = mut("page.$('button:has-text(\"\u{1F3E0} 집\")');");
  ok(S && S.length === 1, '④d 셀렉터 안의 이모지도 잡는다');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
