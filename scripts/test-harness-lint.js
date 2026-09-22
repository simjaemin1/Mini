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
const ROOT = path.resolve(__dirname, '..');   // ★[T171] ⑦ 이 `server/villages.js` 를 대조군으로 읽는다

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

// ═══ ⑤ [T104 2026-09-05 · T98 회부 8] **프레임을 화소로 재는 하네스는 표를 단다** ═══════
//
//   ★왜: 렌더 층이 하나 늘 때마다 픽셀 하네스 **전부**가 흔들린다. 그런데 접점 목록은
//     `grep -l "<파일명>"` 으로 뽑는다 — `e2e-nature` 는 하늘 때문에 셋이 빨갰는데 그 파일엔
//     `weather` 라는 낱말이 없어 목록에 **안 걸렸다**. 이름으로는 못 찾는 관계다.
//   ⇒ 규약은 이미 있다: `// @regress` 자동 발견 문법 그대로 `// @pixel` 한 줄.
//     기계가 뽑는다 — `bash scripts/run-regress.sh --list pixel`.
//   ⚠표 검사는 **AST 로** 한다: 표 주석 자체가 `PNG.sync.read` 라는 글자를 품고 있어서
//     정규식으로 파일을 훑으면 **표를 단 파일이 곧 픽셀 파일**이 되는 자명 통과가 된다.
{
  // 화소를 실제로 **읽는가** — 호출자리로만 본다(주석·문자열은 AST 에 안 걸린다)
  //   ⚠★[실측] "화소를 읽는다"만으로는 부족했다. `test-icons`·`test-crops-world` 는 **디스크의 아이콘 PNG**를
  //     읽지 브라우저 **프레임**을 안 읽는다 — 하늘도 바람도 없는 자리다. 이 카드가 세우는 목록은
  //     "렌더 층이 흔들면 같이 흔들리는 하네스"이므로 가르는 조건은 **화소 읽기 ∧ 스크린샷**이다.
  function shoots(src) {
    let ast; try { ast = acorn.parse(src, { ecmaVersion: 2023, sourceType: 'script', locations: true, allowReturnOutsideFunction: true }); }
    catch (e) { return null; }
    let hit = false;
    const walk = (n) => {
      if (!n || typeof n !== 'object' || hit) return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression' && !n.callee.computed
          && n.callee.property && n.callee.property.name === 'screenshot') hit = true;
      for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'range') walk(n[k]);
    };
    walk(ast);
    return hit;
  }
  function pixelUse(src) {
    let ast; try { ast = acorn.parse(src, { ecmaVersion: 2023, sourceType: 'script', locations: true, allowReturnOutsideFunction: true }); }
    catch (e) { return null; }
    let hit = false;
    const walk = (n) => {
      if (!n || typeof n !== 'object' || hit) return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression' && !n.callee.computed) {
        const pn = n.callee.property && n.callee.property.name;
        if (pn === 'getImageData' || pn === 'toDataURL') hit = true;
        // PNG.sync.read(...) — 스크린샷 파일을 화소로 읽는 이 저장소의 정본 문법
        if (pn === 'read' && n.callee.object && n.callee.object.type === 'MemberExpression'
            && n.callee.object.property && n.callee.object.property.name === 'sync') hit = true;
      }
      for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'range') walk(n[k]);
    };
    walk(ast);
    return hit;
  }
  // 하늘·바람을 끄는가 — 식별자/속성 이름으로 본다(역시 주석은 안 센다)
  function calmsWeather(src) {
    let ast; try { ast = acorn.parse(src, { ecmaVersion: 2023, sourceType: 'script', locations: true, allowReturnOutsideFunction: true }); }
    catch (e) { return null; }
    let rain = false, wind = false;
    const walk = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const nm = (n.type === 'Identifier') ? n.name : ((n.type === 'MemberExpression' && !n.computed && n.property) ? n.property.name : null);
      if (nm === '__rainForce') rain = true;
      if (nm === 'windOff' || nm === 'windGrassOff') wind = true;
      for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'range') walk(n[k]);
    };
    walk(ast);
    return rain && wind;
  }
  const TAG = /^\/\/ @pixel([\s]|$)/m;
  // ⚠하늘을 끄면 **재는 대상이 사라지는** 하네스 — 날씨 그 자체를 재는 파일이다(이유를 코드에 적는다)
  const CALM_EXEMPT = { 'e2e-weather.js': '날씨를 재는 하네스다 — 하늘을 끄면 검사가 사라진다' };

  const tagged = [], pixel = [], noTag = [], noPixel = [], noCalm = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    const t = TAG.test(src), u = pixelUse(src) && shoots(src);
    if (t) tagged.push(f);
    if (u) pixel.push(f);
    if (u && !t) noTag.push(f);
    if (t && !u) noPixel.push(f);
    if (t && !CALM_EXEMPT[f] && calmsWeather(src) === false) noCalm.push(f);
  }
  ok(tagged.length >= 10, '⑤ 전제: `@pixel` 표를 단 하네스가 실제로 여럿이다(0 이면 아래가 자명 통과다)', `${tagged.length}개`);
  ok(noTag.length === 0, '⑤b ★화소를 읽는데 `@pixel` 표가 없는 하네스 0 (렌더 카드가 이 파일을 못 찾는다)', noTag.join(' '));
  ok(noPixel.length === 0, '⑤c ★역도 — 표는 있는데 화소를 안 읽는 하네스 0 (표가 부풀면 목록이 거짓말이 된다)', noPixel.join(' '));
  ok(noCalm.length === 0,
    '⑤d ★★`@pixel` 하네스는 **하늘과 바람을 끈다**(T98 §4-c) — 안 끄면 렌더 층이 늘 때마다 흔들린다',
    noCalm.join(' ') || `${tagged.length - Object.keys(CALM_EXEMPT).length}개 확인 · 예외 ${Object.keys(CALM_EXEMPT).join(',')}`);
  // ★돌연변이와 대조 — 이 검사가 잡을 줄 아는가
  ok(pixelUse("const p = PNG.sync.read(fs.readFileSync(x));") === true,
    '⑤e 돌연변이 — `PNG.sync.read` 를 쓰는 소스는 **픽셀로 잡힌다**');
  // ★가르는 조건이 실제로 가르는지 — 자산 PNG 만 읽는 하네스는 표를 안 단다(그리고 안 달아도 빨갛지 않다)
  const ASSET = ['test-icons.js', 'test-crops-world.js'].filter((f) => files.includes(f));
  ok(ASSET.length > 0, '⑤e2 전제: 자산 PNG 만 읽는 하네스가 실제로 있다(없으면 아래가 자명 통과다)', ASSET.join(' '));
  ok(ASSET.every((f) => { const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8'); return pixelUse(src) === true && shoots(src) === false; }),
    '⑤e3 ★★그것들은 **화소는 읽지만 스크린샷을 안 찍는다** — 프레임이 아니라 자산이라 이 목록 밖이다',
    ASSET.join(' '));
  ok(pixelUse("// PNG.sync.read 는 주석일 뿐이다\nconst a = 1;") === false,
    '⑤f ★★대조 — **주석 안의 같은 글자는 안 잡는다**(표 주석이 스스로를 픽셀로 만들지 않는다)');
  ok(calmsWeather("page.evaluate(() => { window.__rainForce({ precip: 0 }); window.__terrain19.windOff = true; });") === true
     && calmsWeather("page.screenshot({ path: p });") === false,
    '⑤g 돌연변이 — 하늘·바람을 끄는 소스와 안 끄는 소스를 **가른다**');
}

// ── ⑥ [T160] 하네스는 **다른 하네스를 먼저 돌리라고 시키지 않는다** ────────────
{
  console.log('\n[⑥ 순서 의존 — "X 를 먼저 돌려라"라고 말하는 하네스 0]');
  // ★★왜: 러너는 **이름순**으로 돈다(`run-regress.sh` 의 `LC_ALL=C sort`). "먼저 돌려라"는
  //   사람에게 하는 말인데, 전수는 사람이 안 본다 — 이름이 앞이면 **매번 반드시** 죽는다.
  //   T49 가 `test-site-memo` 에서, T160 이 `e2e-rtt`·`test-route-persist` 에서 같은 자리를 고쳤다.
  //   고치는 길은 하나다: **없으면 자기가 만든다**(픽스처를 정본 모듈에 두고 부른다 · 사본 0).
  //   ⇒ 이 검사는 그 규약이 다시 무너지는 것을 막는다. 문구가 아니라 **패턴**을 본다.
  const ORDER = /먼저\s*(한\s*번\s*)?(돌려라|실행|돌려)|를\s*먼저\s*돌린|run .{0,40} first/;
  const bad = [];
  for (const f of files) {
    // ★이 파일 자신은 뺀다 — 규칙과 돌연변이 픽스처가 **그 문구 자체**다(②의 예외와 같은 까닭).
    if (f === 'test-harness-lint.js') continue;
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    // 판정·출력 줄만 본다(주석 속 설명은 역사다 — 이 파일 위 주석들이 그렇다)
    for (const line of src.split('\n')) {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) continue;
      if (ORDER.test(line)) { bad.push(`${f}: ${t.slice(0, 72)}`); break; }
    }
  }
  ok(bad.length === 0,
     '⑥ ★"다른 하네스를 먼저 돌려라"라고 죽는 하네스 0 — 없으면 **스스로 만든다**',
     bad.join(' | '));
  // ★자명 통과 금지 — 이 정규식이 실제로 그 말을 잡는지 본다
  ok(ORDER.test("console.log('  ✗ 씨앗 DB 없음 — `node scripts/test-tick-slicer.js` 를 먼저 한 번 돌려라');") === true,
     '⑥b 돌연변이 — 옛 문구(T160 이 고친 그 줄)를 이 검사가 **잡는다**');
  ok(ORDER.test("console.log('  ✓ 씨앗을 스스로 만들었다');") === false,
     '⑥c 대조 — 스스로 만드는 하네스는 안 잡는다');
}

// ── ⑦ 주석 제거기는 **하나**다 [T171 2026-09-11] ──────────────────────────────
//
// ★★T152 §3 이 센 것: `codeOnly` 가 스무 파일에 **스물넷**으로 흩어져 있었고 판이 넷이었다.
//   그중 열넷("블록 먼저")은 `server/villages.js:20` 의 `// … sim/* …` 를 블록 주석의 시작으로
//   읽어 그 파일 **코드 글자의 절반**을 삼켰다(T171 §0-ⓑ 실측: 181,489 → 90,779자).
//   그 위에서 도는 판정은 "없다"를 늘 통과시킨다 — 하네스가 조용히 눈이 먼다.
//   ⇒ 정본은 `scripts/code-only.js`(acorn `onComment`) 하나이고, **정의가 둘이 되면 여기서 빨개진다.**
console.log('\n⑦ 주석 제거기 정본 하나 [T171]');
{
  const CO = require(path.join(SCRIPTS, 'code-only.js'));
  // ⓐ 정의는 하나 — 나머지는 전부 정본을 부른다
  const defs = [];
  for (const f of fs.readdirSync(SCRIPTS).filter((x) => x.endsWith('.js'))) {
    if (f === 'code-only.js') continue;
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8').split('\n');
    src.forEach((L, i) => {
      const m = L.match(/(?:const|let)\s+(codeOnly\d*)\s*=\s*(.*)$/) || L.match(/function\s+(codeOnly\d*)\s*\(/);
      if (!m) return;
      const rhs = m[2] || '';
      if (rhs.includes("require('./code-only.js')")) return;      // 정본 호출은 정의가 아니다
      defs.push(`${f}:${i + 1}`);
    });
  }
  ok(defs.length === 0, '★★⑦a **`codeOnly` 정의는 정본 하나뿐**(나머지 스물넷은 `require` 호출) — 사본이 생기면 여기가 빨개진다',
     defs.length ? defs.slice(0, 4).join(' · ') : `${fs.readdirSync(SCRIPTS).filter((x) => x.endsWith('.js')).length}파일 훑음 · 사본 0`);
  // 자명 통과 금지 — 같은 훑기로 **사본 한 줄을 넣으면 잡는다**
  // ⚠미끼 줄은 **조각을 이어 붙여** 만든다 — 통째로 적으면 위 훑기가 **이 파일**을 잡는다
  //   (1차 실행에서 실제로 `test-harness-lint.js:279` 가 사본으로 걸렸다 · T143 이 물린 자기-일치 함정).
  const canaryLine = 'const ' + 'codeOnly' + " = (s) => s.replace(/x/g, '');";
  const canary = [canaryLine].filter((L) => {
    const m = L.match(/(?:const|let)\s+(codeOnly\d*)\s*=\s*(.*)$/);
    return m && !m[2].includes("require('./code-only.js')");
  }).length;
  ok(canary === 1, '★⑦b 자명 통과 금지 — 같은 자로 **사본 한 줄을 넣으면 잡는다**');

  // ⓑ 정본이 `// … /* …` 에 안 속는다 — T152 가 물린 그 두 줄을 픽스처로
  const FIX = 'const a = 1;   // 길은 sim/* 아래에 있다\nconst keep = 2;\n';
  const outFix = CO(FIX);
  ok(outFix.includes('const keep = 2;'),
     '★★⑦c **`// … sim/* …` 가 블록을 열지 않는다** — 뒤의 코드가 살아 있다(옛 판은 여기서 파일을 삼켰다)');
  ok(!outFix.includes('길은'), '★⑦d 그 줄의 주석 자체는 지워졌다');

  // ⓒ 문자열 안의 `//` 는 코드다
  const STR = 'const u = "http://localhost:3010/x"; const v = 1;\n';
  ok(CO(STR).includes('http://localhost:3010/x'),
     '★★⑦e **문자열 안의 `//` 를 안 지운다**(옛 "줄 먼저" 판은 `zone.js` 에서 이 줄을 잘랐다)');

  // ⓓ 오프셋 보존 — 길이·줄 수가 안 흔들린다(하네스가 `indexOf` 로 찾은 자리를 그대로 쓴다)
  const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const VC = CO(V);
  ok(VC.length === V.length, '★★⑦f **길이가 안 변한다** — 주석을 지우지 않고 공백으로 덮는다', `${V.length} = ${VC.length}`);
  ok(VC.split('\n').length === V.split('\n').length, '★⑦g 줄 수도 같다', `${V.split('\n').length}줄`);
  const ANCH = 'function _pestAt';
  ok(V.indexOf(ANCH) === VC.indexOf(ANCH) && VC.indexOf(ANCH) > 0,
     '★★⑦h 앵커가 **제자리**다 — `indexOf` 로 찾아 `slice` 하는 하네스가 안 흔들린다', `${VC.indexOf(ANCH)}`);
  // 그리고 옛 "블록 먼저" 판이었다면 이 파일이 반토막이라는 것 — 대조군
  const OLDB = V.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const nw = (s) => { let n = 0; for (const c of s) if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') n++; return n; };
  ok(nw(OLDB) < nw(VC) * 0.6,
     '★★⑦i 대조군 — **옛 "블록 먼저" 판이라면 코드 글자가 절반 아래로 떨어진다**(이 검사가 지키는 것이 그것이다)',
     `옛 ${nw(OLDB)} < 정본 ${nw(VC)} × 0.6`);
  console.log('    접점: codeOnly · acorn · onComment · code-only.js · villages.js:20');
}

// ── ⑧ 판정 자리에 **벽시계가 없다** [T185 2026-09-12] ──────────────────────────
//
// ★★족보 ⑩ 의 병: 하네스가 **정해진 초를 자고** 그 뒤에 판정한다. 조용한 판에서 고른 수라
//   러너 안(2코어 · 열 몇 종이 같이 돈다)에서는 안 선다. 09-12 야간 전수가 낸 셋이 전부 그 병이었다:
//     · `test-route-persist ⑦d` — 하네스가 `/health` 응답 간격을 재고 **1500ms** 문턱 → 러너 1506ms(6ms 차)
//     · `e2e-emptystart warp` — 텔레포트 뒤 **900ms** 자고 한 번 본다 × 20 → 예산 소진 → "도착" 전제 빨강
//     · `e2e-events ensureBoard` — **시도 횟수**로 예산(회당 ~1.8초) → 게임일이 덜 흘러 EMA 미성숙
//   셋 다 판정은 그대로 두고 **증인**만 바꿨다(서버 루프 히스토그램 · 서버 권위 좌표 · 게임일).
//
// ★이 검사가 지키는 것: **`ok(...)` 의 조건에 벽시계 수가 직접 들어가지 않는다.**
//   `sleep` 자체는 못 없앤다(입력을 쏘고 세계가 한 틱 도는 것을 기다리는 건 정당하다) —
//   막는 것은 **잰 시간을 판정의 근거로 삼는 것**이다.
console.log('\n⑧ 판정 자리에 벽시계 0 [T185]');
{
  // ★★★[T322 2026-09-19] **이름 그물 → 선언 추적.** 종전 그물은 이름 일곱 개였다
  //   (`hcMax|elapsed|took|dur|durMs|waitMs|ms`) — 의미가 아니라 **철자**를 알던 자다. 그래서
  //   T314 가 손으로 다시 세니 155개에 넷이 있었고 **그 자는 하나도 못 봤다**(`stallAtMs` 같은 이름).
  //   ⇒ 값이 **시간에서 나왔는지**를 선언까지 따라간다: `Date.now()`/`performance.now()` 가 든
  //     선언·대입의 이름을 모으고(그 이름으로 다시 대입되면 그것도), 그 이름이나 시간 식 자체가
  //     `ok(...)` 조건에서 **상수(≥100)** 와 견주어지면 잡는다.
  //   ★**단가는 봐준다 — 이름이 아니라 모양으로.** 시간 식이 **센 수로 나뉘어** 있으면(`/ N` ·
  //     N 이 상수가 아님) 그건 "한 번에 얼마"라 부하에 덜 흔들린다(PM 이 `test-resource-index`
  //     의 `per < 2000` 을 일부러 남긴 그 이유다). 봐주되 **표에 적는다** — 숨기지 않는다.
  const acornL = require(path.join(ROOT, 'node_modules', 'acorn'));
  const isTimeCall = (n) => !!(n && n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression'
    && n.callee.object && n.callee.property
    && ((n.callee.object.name === 'Date' && n.callee.property.name === 'now')
     || (n.callee.object.name === 'performance' && n.callee.property.name === 'now')));
  const anyIn = (n, pred) => { let f = false; (function w(x) { if (f || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) { for (const y of x) w(y); return; }
    if (pred(x)) { f = true; return; }
    for (const k of Object.keys(x)) { if (k === 'type' || k === 'start' || k === 'end') continue; w(x[k]); } })(n); return f; };
  // 센 수로 나뉘었나 — `(…) / N` 에서 N 이 상수가 아니면 단가다(상수로 나눈 건 단위 환산일 뿐이다).
  const perUnit = (n) => anyIn(n, (x) => x.type === 'BinaryExpression' && x.operator === '/'
    && x.right && !(x.right.type === 'Literal' && typeof x.right.value === 'number'));
  const hits = [], rates = [];
  for (const f of fs.readdirSync(SCRIPTS).filter((x) => /^(test|e2e)-.*\.js$/.test(x))) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    let ast; try { ast = acornL.parse(src, { ecmaVersion: 2022, allowHashBang: true }); } catch (e) { continue; }
    // ① 시간에서 나온 이름 모으기 — **직접 판만** 잇는다(`… Date.now() …` 이 그 선언 안에 있다).
    //   ⚠한 다리 건너("시간 이름을 쓴 식")까지 이으면 **이름이 겹쳐서** 엉뚱한 걸 문다:
    //     첫 판이 그렇게 돌았다가 `bDist vs 140`(거리) · `t vs 100`(온도) 같은 거짓 넷을 물었다 —
    //     이 자는 스코프를 모르고 파일 전체의 이름을 한 통에 담기 때문이다(`t` 가 한 파일에 둘이면 끝).
    //   ⇒ 직접 판만 잇는다. T314 가 손으로 센 넷은 전부 직접 판이라 **잡는 집합은 그대로**고,
    //     거짓은 0 이 된다. 못 보는 것: `const secs = ms / 1000` 처럼 **한 다리 건넌 이름**(표에 적었다).
    const timeName = new Map();   // 이름 → 단가인가
    (function w(n) { if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const x of n) w(x); return; }
      let id = null, init = null;
      if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier') { id = n.id.name; init = n.init; }
      if (n.type === 'AssignmentExpression' && n.left && n.left.type === 'Identifier') { id = n.left.name; init = n.right; }
      if (id && init && anyIn(init, isTimeCall) && !timeName.has(id)) timeName.set(id, perUnit(init));
      for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; w(n[k]); } })(ast);
    // ② `ok(...)` 첫 인자 안에서 "시간값 vs 상수(≥100)"
    const line = (pos) => src.slice(0, pos).split('\n').length;
    (function walk(n, inOk) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const x of n) walk(x, inOk); return; }
      if (n.type === 'CallExpression' && n.callee && n.callee.name === 'ok') {
        // 첫 인자(판정 조건)만 본다 — 셋째 인자(설명)에는 시간이 있어도 된다
        walk(n.arguments[0], true);
        for (const a of n.arguments.slice(1)) walk(a, false);
        return;
      }
      if (inOk && n.type === 'BinaryExpression' && ['<', '<=', '>', '>='].indexOf(n.operator) >= 0) {
        const side = [n.left, n.right];
        const t = side.find((x) => x && ((x.type === 'Identifier' && timeName.has(x.name)) || anyIn(x, isTimeCall)));
        const lit = side.find((x) => x && x.type === 'Literal' && typeof x.value === 'number' && x.value >= 100);
        if (t && lit) {
          const nm = t.type === 'Identifier' ? t.name : '<식>';
          const rate = t.type === 'Identifier' ? timeName.get(t.name) : perUnit(t);
          (rate ? rates : hits).push(`${f}:${line(n.start)} ${nm}vs${lit.value}`);
        }
      }
      for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; walk(n[k], inOk); }
    })(ast, false);
  }
  ok(hits.length === 0, '★★⑧a **판정 조건에 "하네스가 잰 시간 vs 상수" 가 없다**(족보 ⑩ — 러너에서만 빨개지는 병)',
     hits.length ? hits.slice(0, 4).join(' · ') : `${fs.readdirSync(SCRIPTS).filter((x) => /^(test|e2e)-.*\.js$/.test(x)).length}개 훑음 · 0건`);
  // ★자명 통과 금지 — **같은 자**(위 함수가 아니라 같은 규칙)로 미끼 셋을 재서 셋이 갈리는지 본다.
  //   ⓐ 총 시간 vs 상수 → 잡아야 한다 · ⓑ 단가(센 수로 나눔) vs 상수 → 봐줘야 한다 ·
  //   ⓒ 시간 vs 시간(상수 없음) → 안 잡아야 한다. 셋이 안 갈리면 위 0건은 아무것도 안 증명한다.
  const bait = (src) => {
    const ast = acornL.parse(src, { ecmaVersion: 2022 });
    const tn = new Map();
    (function w(n) { if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const x of n) w(x); return; }
      let id = null, init = null;
      if (n.type === 'VariableDeclarator' && n.id && n.id.type === 'Identifier') { id = n.id.name; init = n.init; }
      if (id && init && anyIn(init, isTimeCall) && !tn.has(id)) tn.set(id, perUnit(init));
      for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; w(n[k]); } })(ast);
    let hit = 0, rate = 0;
    (function walk(n, inOk) { if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const x of n) walk(x, inOk); return; }
      if (n.type === 'CallExpression' && n.callee && n.callee.name === 'ok') { walk(n.arguments[0], true); return; }
      if (inOk && n.type === 'BinaryExpression' && ['<', '<=', '>', '>='].indexOf(n.operator) >= 0) {
        const side = [n.left, n.right];
        const t = side.find((x) => x && ((x.type === 'Identifier' && tn.has(x.name)) || anyIn(x, isTimeCall)));
        const lit = side.find((x) => x && x.type === 'Literal' && typeof x.value === 'number' && x.value >= 100);
        if (t && lit) { if (t.type === 'Identifier' ? tn.get(t.name) : perUnit(t)) rate++; else hit++; }
      }
      for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; walk(n[k], inOk); } })(ast, false);
    return { hit, rate };
  };
  const bTotal = bait('const t0 = Date.now(); const spent = Date.now() - t0; ok(spent <= 1500, "x");');
  const bRate  = bait('const t0 = Date.now(); const each = (Date.now() - t0) / n; ok(each < 2000, "x");');
  const bPair  = bait('const t0 = Date.now(); const a = Date.now() - t0; const b = Date.now(); ok(a <= b, "x");');
  ok(bTotal.hit === 1 && bTotal.rate === 0, '★⑧b 자명 통과 금지 ⓐ — **총 시간 vs 상수**를 넣으면 잡는다(이름은 아무거나)', `잡음 ${bTotal.hit}`);
  ok(bRate.hit === 0 && bRate.rate === 1, '★⑧b 자명 통과 금지 ⓑ — **단가**(센 수로 나눔)는 봐주고 표로만 센다', `단가 ${bRate.rate}`);
  ok(bPair.hit === 0 && bPair.rate === 0, '★⑧b 자명 통과 금지 ⓒ — **시간 vs 시간**(상수 없음)은 안 문다', `잡음 ${bPair.hit}`);
  console.log(`    [표] 단가로 봐준 단정 ${rates.length}건${rates.length ? ' — ' + rates.join(' · ') : ''}`);
  // ── [T322] **둘째 모양 — 예산형**(시도 횟수 × 잠). 판정문에 상수가 없어 위 자는 못 본다 ──────
  //   `for (i < N) { … sleep(M) }` 의 `N×M` 이 사실상 마감액이고, 다 돌면 **그 다음 `ok` 가 빨개진다**.
  //   09-18 야간의 `e2e-conn ②` 가 `60×400ms = 24초` 였고 보고에 적힌 수가 "24초 경과" 다.
  //   ⚠**판정하지 않는다 — 경고다.** 이 모양은 하네스의 표준 관용구라(재시도도 같은 꼴) 전수를 막으면
  //     쓸 수 있는 자가 없다. 큰 것만 이름을 불러 다음 카드가 고르게 둔다.
  {
    const BIG = 10000;   // 표의 수 — 판정에 안 든다
    const budgets = [];
    for (const f of fs.readdirSync(SCRIPTS).filter((x) => /^(test|e2e)-.*\.js$/.test(x))) {
      const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
      let ast; try { ast = acornL.parse(src, { ecmaVersion: 2022, allowHashBang: true }); } catch (e) { continue; }
      (function w(n) { if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { for (const x of n) w(x); return; }
        if (n.type === 'ForStatement' && n.test && n.test.type === 'BinaryExpression'
            && n.test.right && n.test.right.type === 'Literal' && typeof n.test.right.value === 'number') {
          let ms = 0;
          anyIn(n.body, (x) => { if (x.type === 'CallExpression' && x.callee && x.callee.name === 'sleep'
              && x.arguments[0] && x.arguments[0].type === 'Literal' && typeof x.arguments[0].value === 'number') ms = Math.max(ms, x.arguments[0].value); return false; });
          const total = n.test.right.value * ms;
          if (total >= BIG) budgets.push({ s: `${f}:${src.slice(0, n.start).split('\n').length}`, t: total });
        }
        for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; w(n[k]); } })(ast);
    }
    budgets.sort((a, b) => b.t - a.t);
    console.log(`    [표·경고] 예산형(시도×잠) ${(BIG / 1000) | 0}초 이상 ${budgets.length}자리 — 판정 아님`
      + (budgets.length ? '\n      ' + budgets.slice(0, 8).map((b) => `${b.s} ${(b.t / 1000).toFixed(0)}초`).join(' · ') : ''));
  }

  // ── ⑧c **입장 기다리기는 정본 하나다** [T214 2026-09-12] ─────────────────────
  //   T140 이 `fixture-clock.waitInWorld` 를 세우며 적었다: *"두 하네스 모두 `for (i<60) sleep(500)`
  //   = 30초로 잘라 놓았는데, 부하가 있으면 그 안에 못 들어온다 … 늦는 것과 안 되는 것은 다른 일이다."*
  //   그런데 **사본이 더 있었다**: `e2e-downed`(러너에서 `[A] 존 입장` 빨강 → 뒤가 줄줄이 무너졌다 ·
  //   단독 35/0) · `e2e-hp`(같은 30초 · 아직 안 걸렸을 뿐) · `e2e-verbs`(제 손으로 180초).
  //   ⇒ **제 손으로 `__inWorld` 폴링 루프를 세우지 않는다.** 한 번 읽어 판정하는 것은 그대로 둔다 —
  //     막는 것은 **기다리는 방식의 사본**이다(⑦a 가 `codeOnly` 에 건 것과 같은 규약).
  //   ※`scripts/fixture-clock.js` 는 `test-*`·`e2e-*` 가 아니라 이 훑기에 안 든다 — 정본은 거기 하나다.
  {
    const hasTok = (n, w) => { let f = false; (function g(x) { if (f || !x || typeof x !== 'object') return;
      if (Array.isArray(x)) { for (const y of x) g(y); return; }
      if ((x.type === 'Identifier' && x.name === w) || (x.type === 'Literal' && x.value === w)) { f = true; return; }
      for (const k of Object.keys(x)) { if (k === 'type' || k === 'start' || k === 'end') continue; g(x[k]); } })(n); return f; };
    const LOOP = /^(For|While|DoWhile|ForOf|ForIn)Statement$/;
    const scan = (src) => { const out = [];
      let ast; try { ast = acornL.parse(src, { ecmaVersion: 2022, allowHashBang: true }); } catch (e) { return out; }
      (function w(n) { if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { for (const x of n) w(x); return; }
        if (LOOP.test(n.type) && hasTok(n, '__inWorld')) out.push(src.slice(0, n.start).split('\n').length);
        for (const k of Object.keys(n)) { if (k === 'type' || k === 'start' || k === 'end') continue; w(n[k]); } })(ast);
      return out; };
    const copies = [];
    const hFiles = fs.readdirSync(SCRIPTS).filter((x) => /^(test|e2e)-.*\.js$/.test(x));
    for (const f of hFiles) for (const ln of scan(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'))) copies.push(`${f}:${ln}`);
    ok(fs.existsSync(path.join(SCRIPTS, 'fixture-clock.js')), '⑧c [전제] 정본 파일이 실제로 있다(없으면 아래가 자명 통과다)');
    ok(copies.length === 0, '★★⑧c **입장 기다리기 사본 0** — `__inWorld` 폴링 루프를 제 손으로 안 세운다(정본 `fixture-clock.waitInWorld`)',
       copies.length ? copies.slice(0, 4).join(' · ') : `${hFiles.length}개 훑음 · 사본 0`);
    // 자명 통과 금지 — 같은 자로 사본 한 루프를 넣으면 잡는다(조각을 이어 만든다 · 제 소스 자기 일치 금지 · T143)
    const bait = 'async function f(pg){ for (let i = 0; i < 60 && !(await pg.evaluate(() => !!(window.'
      + ['__in', 'World'].join('') + ' && window.' + ['__in', 'World'].join('') + '()))); i++) await sleep(500); }';
    ok(scan(bait).length === 1, '★⑧c 자명 통과 금지 — 같은 자로 **폴링 루프 한 줄을 되살리면 잡는다**', `미끼 ${scan(bait).length}건`);
  }
  console.log('    접점: fixture-clock · __e2e_clock · __evGameDay · __getSrvAbs · /perf loop · ok()');
}

// ── ⑨ 야간 여러 밤 — **무거운 하네스는 묶음을 하나 단다** [T220 · 셋으로 T238] ──────
//
//   왜: 이 상자에서 e2e 48종만 **4시간 4분**이다(T220 실측 · 종별 표는 보고에). 야간 창은
//   3h39m~3h43m 이라 09-12 는 108종 · 09-13 은 112종까지밖에 못 닿았다(미측정 35 → 31 · 전부 e2e).
//   ⇒ e2e 를 소요로 **균등 두 묶음**(`// @nightly A` · `// @nightly B`)으로 갈라 이틀에 나눠 돈다.
//   ★러너는 한 글자도 안 고쳤다 — `--list` 가 이미 태그를 인자로 받는다(T104 의 `@pixel` 문법 그대로).
//
//   이 검사가 지키는 것: **새 e2e 가 표식 없이 들어오면 여기서 빨개진다.** 표식이 없으면
//   `nightly-split.sh` 가 그것을 "단위"로 보고 **매일** 돌린다 — 무거운 것이 매일 돌면 창이 다시 넘친다.
//   그건 조용히 넘어가는 종류의 잘못이라(아무도 안 죽는다) 자가 검사로 잡는다.
console.log('\n⑨ 야간 여러 밤 — e2e 는 묶음을 하나 단다 [T220 · 셋 T238]');
{
  // ★[T238 2026-09-13] 묶음이 **둘일 필요가 없다** — 이 자는 글자를 안 박고 **몇 개를 달았나**만 센다.
  //   (T220 은 A·B 만 봤다. #25 가 세 묶음으로 갈리면서 그 자가 낡았다 — 넷이 돼도 여기는 안 고친다.)
  const RE_REG = /^\/\/ @regress([\s]|$)/m;
  const RE_NIGHT = /^\/\/ @nightly ([A-Z])([\s]|$)/gm;
  const tagsOf = (src) => { const out = []; let m; RE_NIGHT.lastIndex = 0;
    while ((m = RE_NIGHT.exec(src))) out.push(m[1]); return out; };
  const e2e = fs.readdirSync(SCRIPTS).filter((x) => /^e2e-.*\.js$/.test(x))
    .map((f) => ({ f, src: fs.readFileSync(path.join(SCRIPTS, f), 'utf8') }))
    .filter((x) => RE_REG.test(x.src));
  const none = [], many = [], seen = {};
  for (const x of e2e) {
    const g = tagsOf(x.src);
    if (g.length === 0) none.push(x.f);
    else if (g.length > 1) many.push(`${x.f}(${g.join('')})`);
    else seen[g[0]] = (seen[g[0]] | 0) + 1;
  }
  const gk = Object.keys(seen).sort();
  ok(e2e.length >= 40, '⑨ [전제] `@regress` 를 단 e2e 가 실제로 여럿이다(0 이면 아래가 자명 통과다)', `${e2e.length}개`);
  ok(none.length === 0, '★★⑨a **`@regress` e2e 는 전부 `@nightly <글자>` 를 단다**(안 달면 매일 돌아 창이 넘친다)',
     none.length ? none.slice(0, 5).join(' ') : `${e2e.length}개 훑음 · 표식 없는 것 0 · 묶음 ${gk.map((k) => k + ':' + seen[k]).join(' ')}`);
  ok(many.length === 0, '★⑨b **둘 이상**을 단 하네스 0 (그러면 한 바퀴에 두 번 돈다)',
     many.length ? many.join(' ') : '0건');
  ok(gk.length >= 2, '⑨c 묶음이 실제로 둘 이상이다(하나면 나눈 것이 아니다)', `${gk.length}개 ${gk.join('')}`);
  // 자명 통과 금지 — 같은 자로 표식 없는 소스·둘 단 소스를 재면 각각 답한다(조각을 이어 만든다)
  const baitNone = ['// @reg', 'ress\n'].join('') + 'const x = 1;\n';
  const baitTwo = ['// @reg', 'ress\n'].join('') + ['// @night', 'ly A\n'].join('') + ['// @night', 'ly C\n'].join('');
  ok(RE_REG.test(baitNone) && tagsOf(baitNone).length === 0,
     '★⑨ 자명 통과 금지 — 표식 없는 소스를 같은 자로 재면 **없다고 답한다**');
  ok(tagsOf(baitTwo).join('') === 'AC',
     '★⑨ 자명 통과 금지 — 둘 단 소스를 같은 자로 재면 **둘 다 잡는다**', tagsOf(baitTwo).join(''));
  console.log('    접점: run-regress.sh --list · nightly-split.sh · @nightly');
}

// ── ⑩ **서버 기동 증인은 "내가 띄운 아이의 입"이다** [T344 2026-09-21] ──────────
//   ★왜. 하네스가 central 을 띄운 뒤 "떴나"를 확인하는 법이 셋 있었다:
//     ⓐ `sleep(2500)` — 예산형. 모자라면 그 다음 줄(`page.goto`)이 대신 죽는다. (T344 가 열셋 고쳤다)
//     ⓑ `waitHttp(/zones)` — **더 깊은 자명 통과**다. T344 실측:
//        앞 판 central 이 포트를 쥔 채면 새 central 은 `EADDRINUSE` 로 즉시 죽는데(종료코드 1 · `boot()`은
//        stderr 를 안 본다), `waitHttp` 는 **앞 판의 central** 에게 200 을 받고 "기동" 이라 답한다.
//        앞 판이 내려가면 `page.goto` → `net::ERR_CONNECTION_REFUSED`(한가한 상자에서 두 번 재현).
//        즉 **포트가 답하는 것은 내 서버가 떴다는 증인이 아니다.**
//     ⓒ 아이가 제 `listen` 콜백에서 찍는 줄(`central server up on`) — 남의 서버로는 만들 수 없는 증거.
//   ⚠**판정하지 않는다 — 표다.** e2e 대부분이 ⓑ 를 쓰고 하네스 서른여덟이 포트 3010 하나를 나눠 쓴다.
//     전수를 막으면 쓸 수 있는 자가 없다. 수를 세어 다음 카드가 고르게 둔다(예산형 표와 같은 자리).
{
  const GATE = { own: [], port: [], blind: [] };
  for (const f of fs.readdirSync(SCRIPTS).filter((x) => /^(test|e2e)-.*\.js$/.test(x))) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    if (!/boot\((?:'central'|path\.join\(ROOT, 'server', 'central)/.test(src)) continue;
    if (/FB\.waitUp\(/.test(src)) GATE.own.push(f);
    else if (/waitHttp\(`http:\/\/localhost:\$\{CPORT\}\/zones`\)/.test(src)) GATE.port.push(f);
    else GATE.blind.push(f);
  }
  ok(GATE.own.length > 0, '⑩ [전제] 기동 정본(`fixture-boot.waitUp`)을 쓰는 하네스가 실제로 있다(0 이면 아래가 자명 통과다)',
     `${GATE.own.length}개`);
  ok(fs.existsSync(path.join(SCRIPTS, 'fixture-boot.js')), '⑩ [전제] 정본 파일이 있다');
  // ★자명 통과 금지 — 같은 자로 세 모양을 각각 세는지 미끼로 확인한다(글자를 조각내 자기 자신을 안 문다)
  const baitOwn = "boot('cent" + "ral', x); await FB.wait" + "Up(c, /up/);";
  const baitPort = "boot('cent" + "ral', x); await waitHttp(`http://localhost:${CPORT}/zones`);";
  const seenOwn = /FB\.waitUp\(/.test(baitOwn) && /boot\('central'/.test(baitOwn);
  const seenPort = !/FB\.waitUp\(/.test(baitPort) && /waitHttp\(`http:\/\/localhost:\$\{CPORT\}\/zones`\)/.test(baitPort);
  ok(seenOwn && seenPort, '★⑩ 자명 통과 금지 — 정본 판과 포트 판 미끼를 같은 자로 재면 **서로 다르게** 답한다',
     `정본 ${seenOwn} · 포트 ${seenPort}`);
  console.log(`    [표] central 기동 증인 — **아이의 입 ${GATE.own.length}** · 포트 응답 ${GATE.port.length} · 맹목 잠 ${GATE.blind.length}`
    + (GATE.blind.length ? `\n      ★맹목: ${GATE.blind.join(' · ')}` : '')
    + (GATE.port.length ? `\n      포트 응답(자명 통과 위험 · 다음 카드): ${GATE.port.slice(0, 6).join(' · ')}${GATE.port.length > 6 ? ` 외 ${GATE.port.length - 6}` : ''}` : ''));
  console.log('    접점: fixture-boot.waitUp · EADDRINUSE · central server up on · CPORT 3010');
}


// =============================================================================
// ⑪ 세계 자리에 `Math.random` 0 [T350 2026-09-22 · 주사위 0]
// =============================================================================
// ★왜 — 이 게임의 첫 캐논은 **주사위 금지**(07-12 재민)인데, T340 이 걸음 하나를 세어 보니
//   `decideNpcBehavior` 가 **걸음마다 15번** 굴리고 있었다. 한 번 지운다고 안 돌아오지 않는다 —
//   `Math.random()` 은 타이핑 여섯 자다. ⇒ **정적으로** 건다.
//
// ★예외는 **표에서 유도한다**(T350 §2). 세계를 안 움직이는 자리 셋뿐이다:
//   ⓐ **식별자** — `Math.random().toString(36)`(토큰·pack·npc·anon). 씨로 만들면 재시작마다 **같은 id** 가
//      나서 충돌한다. 세계 상태가 아니다.
//   ⓑ **I/O 지터** — `_nextSaveAt`(저장이 한 순간에 몰리지 않게 흩는다). 세계 상태가 아니다.
//   ⓒ **주입 자리의 기본 가지** — `typeof rnd === 'function' ? rnd : Math.random` 꼴.
//      부르는 자리가 전부 rng 를 넣으면 이 가지는 **죽은 가지**다. 그 '전부' 를 아래 ⑪-b 가 센다.
console.log('\n⑪ 세계 자리에 `Math.random` 0 [T350]');
{
  const CO = require('./code-only.js');
  const SRV = path.join(ROOT, 'server');
  // 표 — 허용되는 꼴과 그 이유(세 줄이 전부다)
  const ALLOW = [
    { why: '식별자', re: /Math\.random\(\)\.toString\(36\)/ },
    { why: 'I/O 지터', re: /_nextSaveAt\s*=/ },
    { why: '주입 자리 기본 가지', re: /(typeof\s+[\w.]+\s*===\s*'function'\s*\)?\s*\?|\(host\s*&&\s*host\.rng\)\s*\|\|)/ },   // 넣은 rng 가 있으면 그걸, 없으면 이 가지
  ];
  const bad = [], seen = { '식별자': 0, 'I/O 지터': 0, '주입 자리 기본 가지': 0 };
  for (const f of fs.readdirSync(SRV).filter((x) => x.endsWith('.js'))) {
    if (f === 'seed-rand.js') continue;                       // 정본 자신 — `Math.random` 을 안 쓴다(아래가 확인)
    const src = CO(fs.readFileSync(path.join(SRV, f), 'utf8'));
    src.split('\n').forEach((L, i) => {
      if (!/Math\.random/.test(L)) return;
      const hit = ALLOW.find((a) => a.re.test(L));
      if (hit) { seen[hit.why] += (L.match(/Math\.random/g) || []).length; return; }
      bad.push(`${f}:${i + 1}`);
    });
  }
  ok(bad.length === 0, '★★⑪-a **`server/` 세계 자리에 `Math.random` 이 없다**(예외 셋은 표에서 유도 — 식별자·I/O 지터·주입 기본 가지)',
     bad.length ? bad.slice(0, 6).join(' · ') : `세계 굴림 0 · 예외 식별자 ${seen['식별자']} · 지터 ${seen['I/O 지터']} · 주입 ${seen['주입 자리 기본 가지']}`);
  // ⓑ 주입 자리의 기본 가지가 **정말 죽었나** — 세계가 부르는 자리가 rng 를 빠뜨리면 여기서 문다
  const zone = CO(fs.readFileSync(path.join(SRV, 'zone.js'), 'utf8'));
  const INJ = [
    { call: 'Specialty.mineChunkRoll(', argN: 2 },
    { call: 'Specialty.mineTypeGuess(', argN: 4 },
    { call: 'PlayerItems.materializeFromVillage(', argN: 3 },
    { call: 'Fishing.plan(', argN: 4 },
    { call: '.oreMineralAt(', argN: 4 },
  ];
  // 주입이 **인수**가 아니라 **초기화 옵션**인 자리 — 야생 생태는 `init({ rng })` 로 받는다
  ok(/Wildlife\.init\(\{\s*\n?\s*rng:\s*_dt,/.test(zone), '⑪-b ★야생 생태에 흐름을 **넣어서** 기동한다(`Wildlife.init({ rng: _dt, … })`)');
  const naked = [];
  for (const it of INJ) {
    let i = 0;
    while ((i = zone.indexOf(it.call, i)) >= 0) {
      const open = i + it.call.length;
      let d = 1, j = open;
      for (; j < zone.length && d > 0; j++) { if (zone[j] === '(') d++; else if (zone[j] === ')') d--; }
      const args = zone.slice(open, j - 1);
      let depth = 0, n = 1;
      for (const ch of args) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; else if (ch === ',' && depth === 0) n++; }
      if (n < it.argN) naked.push(`${it.call}…) 인수 ${n}/${it.argN}`);
      i = open;
    }
  }
  ok(naked.length === 0, '★⑪-b **주입 자리에 rng 를 안 넣고 부르는 자리가 0**(안 넣으면 그 모듈의 `Math.random` 기본 가지로 떨어진다 — T350 이 실제로 둘을 그렇게 찾았다)',
     naked.length ? naked.join(' · ') : `${INJ.length}꼴 전부 채워 부른다`);
  // ⓒ 정본은 `Math.random` 을 안 쓴다
  const seedSrc = CO(fs.readFileSync(path.join(SRV, 'seed-rand.js'), 'utf8'));
  ok(!/Math\.random/.test(seedSrc), '⑪-c 씨 해시 정본(`server/seed-rand.js`)에 `Math.random` 0');
  // ★자명 통과 금지 — 세계 자리 한 줄을 미끼로 넣으면 ⑪-a 의 그 자가 문다(글자를 조각내 자기 자신을 안 문다)
  const bait = '  npc.targetX = npc.x + (Math.' + 'random() - 0.5) * 200;';
  const baitCaught = /Math\.random/.test(bait) && !ALLOW.some((a) => a.re.test(bait));
  const baitOk = '  return Math.' + 'random().toString(36).slice(2, 12);';
  const baitPassed = ALLOW.some((a) => a.re.test(baitOk));
  ok(baitCaught && baitPassed, '★⑪ 자명 통과 금지 — 세계 자리 미끼는 **물고**(걸음 목표), 식별자 미끼는 **보낸다**',
     `세계 미끼 잡힘 ${baitCaught} · 식별자 미끼 통과 ${baitPassed}`);
  console.log(`    [표] server/ 세계 굴림 **0** · 예외 = 식별자 ${seen['식별자']} · I/O 지터 ${seen['I/O 지터']} · 주입 기본 가지 ${seen['주입 자리 기본 가지']}`);
  console.log('    접점: decideNpcBehavior · seed-rand.js · seedOf · makeStream · _t340Rng · test-move-soa');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
