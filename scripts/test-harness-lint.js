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

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
