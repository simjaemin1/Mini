#!/usr/bin/env node
// @regress
// === scripts/test-lab-trees.js — T123 랩 나무·열매·벌목 부등식·채집 하네스 =========
//
// 이 카드는 **랩만** 만진다(서버 이식은 승인 게이트가 달린 다음 카드). 그래서 이 하네스가
// 지키는 것의 절반은 "무엇이 있는가"가 아니라 **"무엇이 없는가"**다 — 서버 무접촉·새 수 0·사본 0.
//
//  ① 표 ≡ 파일        `build-trees.js --check` (랩 `TREES` 와 `lab/trees.json` 이 어긋나면 빨강)
//  ② 서버 무접촉      server/·public/ 에 T123 이름이 한 곳도 없다(이식 전이라는 사실 자체를 잠근다)
//  ③ 부등식 새 수 0   `fellOK` 본문에 숫자 리터럴 0 — 표의 축과 그림자가격만 쓴다
//  ④ 종에 우열 없음   표의 축이 정확히 일곱 키(ko·wood·mature·char·fruit·fy·fs) — "좋은 나무" 축 금지
//  ⑤ 주사위 금지      종 배정·열매 정산에 Math.random 0 (자리 × 시드의 함수)
//  ⑥ 열매 규약(실행)  연 1회 결실 · 겨울 소멸 · 이듬해 재결실 · 재고 = fy × 크기 (랩을 실제로 부른다)
//  ⑦ 베면 같이 떨어진다(증발 0)  벌목 자리에서 정산 → 곳간 += 드랍 → 나무 재고 −= 드랍
//  ⑧ 채집 실체화      추상 `fruit` 자리에 실체가 얹혔고 되돌림 손잡이(T123_FRUIT)가 걸려 있다
//  ⑨ 계측은 관측자    `_tstat` 를 읽는 곳은 계측기뿐(랩의 세계 규칙이 계측을 안 읽는다)
//  ⑩ 랩 경로          test-lab-* 가 레포 안 랩을 본다(레포 밖 homedir 기본값 0)
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LABP = path.join(ROOT, 'lab', '전쟁실험실.html');
const LAB = fs.readFileSync(LABP, 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS  ' + m); } else { fail++; console.log('  FAIL  ' + m); } };
const sec = (t) => console.log('\n' + t);

// 랩에서 한 함수의 본문만 떼어 온다(중괄호 세기) — 주석은 뺀다(주석 속 숫자에 걸리지 않게).
function bodyOf(name) {
  const i = LAB.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('랩에 `' + name + '` 이 없다');
  const o = LAB.indexOf('{', i);
  let d = 0, j = o;
  for (; j < LAB.length; j++) { const c = LAB[j]; if (c === '{') d++; else if (c === '}') { d--; if (!d) break; } }
  return LAB.slice(o, j + 1);
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ── ① 표 ≡ 파일 ─────────────────────────────────────────────────────────────
sec('① 표 ≡ 파일 — 랩 `TREES` 가 `lab/trees.json` 의 유일한 원천');
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-trees.js'), '--check'], { stdio: 'pipe' });
  ok(true, 'build-trees.js --check 통과(표와 파일이 같다)');
} catch (e) { ok(false, 'build-trees.js --check 실패 — `node scripts/build-trees.js` 를 돌려라'); }
const TJ = JSON.parse(fs.readFileSync(path.join(ROOT, 'lab', 'trees.json'), 'utf8'));
ok(Object.keys(TJ.trees).length >= 5, '종 ' + Object.keys(TJ.trees).length + '개(≥5)');

// ── ② 서버 무접촉 ───────────────────────────────────────────────────────────
sec('② 서버 무접촉 — 이식은 다음 카드(승인 게이트)다');
const walk = (d, out) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f);
  const st = fs.statSync(p); if (st.isDirectory()) { if (f !== 'node_modules') walk(p, out); }
  else if (/\.(js|json)$/.test(f)) out.push(p); } return out; };
const serverFiles = walk(path.join(ROOT, 'server'), []).concat(walk(path.join(ROOT, 'public'), []));
for (const name of ['fellOK', 'fruitSettle', 'treeAt', 'trees.json', 'T123_FRUIT']) {
  const hits = serverFiles.filter((p) => fs.readFileSync(p, 'utf8').includes(name));
  ok(hits.length === 0, `server/·public/ 에 \`${name}\` 0곳` + (hits.length ? ' — ' + hits.map((p) => path.relative(ROOT, p)).join(', ') : ''));
}

// ── ③ 부등식 새 수 0 ────────────────────────────────────────────────────────
sec('③ 부등식 — 새 수 0(표의 축과 그림자가격만)');
const fell = stripComments(bodyOf('fellOK'));
const nums = fell.match(/(?<![\w.$])\d+(\.\d+)?/g) || [];
ok(nums.length === 0, '`fellOK` 본문 숫자 리터럴 0' + (nums.length ? ' — ' + nums.join(',') : ''));
ok(/w\('wood'\)\s*\*\s*T\.wood/.test(fell), '왼쪽 = w(목재) × 목재수율');
ok(/T\.mature\s*\*\s*w\(T\.fruit\)\s*\*\s*T\.fy/.test(fell), '오른쪽 = 성목햇수 × w(열매) × 연간열매수율');
ok(/if\(!T\.fruit\)return true;/.test(fell), '목재 전용 종은 언제나 벤다(사전식 ①의 근거)');

// ── ④ 종에 우열 없음 ────────────────────────────────────────────────────────
sec('④ 종에 우열 없음 — 축은 넷(+이름·품목·철)뿐');
const AX = ['ko', 'wood', 'mature', 'char', 'fruit', 'fy', 'fs'].sort().join(',');
let axOk = true, axBad = '';
for (const [id, t] of Object.entries(TJ.trees)) { const k = Object.keys(t).sort().join(','); if (k !== AX) { axOk = false; axBad = id + ':' + k; } }
ok(axOk, '모든 종의 축이 정확히 [' + AX + ']' + (axOk ? '' : ' — ' + axBad));
ok(!/\b(good|best|rank|tier|우열|등급)\b/i.test(LAB.slice(LAB.indexOf('const TREES={'), LAB.indexOf('const TREE_IDS'))), '표에 등급·우열 축 없음');
const fruity = Object.values(TJ.trees).filter((t) => t.fruit);
ok(fruity.length >= 3 && fruity.length < Object.keys(TJ.trees).length, `열매종 ${fruity.length} · 목재 전용 ${Object.keys(TJ.trees).length - fruity.length}(둘 다 있어야 사전식이 뜻을 가진다)`);

// ── ④' 두 정본과 어휘가 같은가 ──────────────────────────────────────────────
sec("④' 어휘 — 종 아이디는 그림 정본과, 열매 품목은 econ 정본과 같아야 한다");
{
  // ① 그림 정본 — T129 가 구운 종 표(`public/assets/trees/tree_species.json`).
  //    그 파일은 "수치는 서버/랩이 정본"이라고 스스로 적어 뒀다 ⇒ 수는 랩이, **이름은 거기가** 쥔다.
  const artP = path.join(ROOT, 'public', 'assets', 'trees', 'tree_species.json');
  if (!fs.existsSync(artP)) ok(false, 'tree_species.json 이 없다(T129 이전 베이스?)');
  else {
    const art = JSON.parse(fs.readFileSync(artP, 'utf8')).species || {};
    const a = Object.keys(art).sort().join(','), b = Object.keys(TJ.trees).sort().join(',');
    ok(a === b, '종 아이디 집합 ≡ 그림 정본' + (a === b ? ` (${b})` : `\n        그림 [${a}]\n        랩   [${b}]`));
  }
  // ② econ 정본 — 열매 품목은 **econ 이 이미 아는 이름**이어야 한다.
  //    ⚠초안이 `hazelnut`·`mulberry_leaf` 를 지어냈다: 곳간에 유령이 쌓이고 `w()` 가 1.0(모름)이 되어
  //      부등식이 값을 못 읽는 채로 돌았다. 이 검사가 그걸 잡는다.
  //    "안다"의 정본 둘: 열량 환산표(`FORAGE_FOOD_FACTOR` — 먹는 것) ∪ 품목표(`specialty.RESOURCES` — 거래되는 것).
  //    ⚠열매가 곧 식량은 아니다 — 뽕잎(`mulberry`)은 양잠 재료라 열량표엔 없고 품목표엔 있다. 둘 다 봐야 한다.
  const econ = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const spec = require(path.join(ROOT, 'server', 'specialty.js'));
  const food = Object.keys(econ.FORAGE_FOOD_FACTOR || {});
  const item = Object.keys(spec.RESOURCES || {});
  const bad = Object.entries(TJ.trees).filter(([, t]) => t.fruit && food.indexOf(t.fruit) < 0 && item.indexOf(t.fruit) < 0).map(([k, t]) => k + '→' + t.fruit);
  ok(bad.length === 0, 'econ 이 모르는 열매 품목 0' + (bad.length ? ' — ' + bad.join(', ')
    : ' (' + Object.values(TJ.trees).filter((t) => t.fruit).map((t) => t.fruit + (food.indexOf(t.fruit) >= 0 ? '[식량]' : '[품목]')).join(' · ') + ')'));
  const noFruit = Object.entries(TJ.trees).filter(([, t]) => !t.fruit).map(([k]) => k);
  console.log('        ※ 열매 품목이 아직 없는 종: ' + (noFruit.join(' · ') || '없음') + ' (품목 신설은 이식 카드 판정 — 회부)');
}

// ── ⑤ 주사위 금지 ───────────────────────────────────────────────────────────
sec('⑤ 주사위 금지 — 자리 × 시드의 함수');
for (const fn of ['treeAt', '_th32', 'fruitSettle']) ok(!/Math\.random/.test(bodyOf(fn)), `\`${fn}\` 에 Math.random 0`);
ok(/_th32\(x,y,\(typeof SEED/.test(LAB), '`treeAt` 이 (x,y,SEED) 셋만 읽는다');

// ── ⑦ 베면 같이 떨어진다(증발 0) — 소스 검사 ────────────────────────────────
sec('⑦ 베면 같이 떨어진다 — 증발 0');
const chop = LAB.slice(LAB.indexOf("if(a.job==='lumberjack')"), LAB.indexOf("else if(a.job==='miner')"));
ok(/fruitSettle\(s,_cx,_cy/.test(chop), '벨 때 그 칸을 정산한다(볼 때 정산 — 벨 때가 그 "볼 때")');
ok(/storage\[_T\.fruit\]=\(s\.econ\.storage\[_T\.fruit\]\|\|0\)\+_drop/.test(chop), '떨어진 열매가 곳간으로 들어간다');
ok(/T123_FRUIT\(\)\?fruitSettle/.test(chop), '통제군은 정산 자체를 안 한다(실체 0 — A/B 의 통제군이 종전 세계)');
ok(/_e\.n=Math\.max\(0,_e\.n-_drop\)/.test(chop), '같은 양이 나무 재고에서 빠진다(이중 계상 아님)');
ok(/T123_FRUIT\(\)/.test(chop), '되돌림 손잡이가 낙과에도 걸려 있다');

// ── ⑧ 채집 실체화 ───────────────────────────────────────────────────────────
sec('⑧ 채집 — 추상 `fruit` 자리에 실체');
const fora = LAB.slice(LAB.indexOf("else if(a.job==='forager'"), LAB.indexOf("if(day%14===0&&s.econ&&s.baseWood!=null)"));
ok(/fruitSettle\(s,_cx,_cy/.test(fora), '채집꾼이 그 칸을 정산한다');
ok(/s\.econ\.storage\[_T\.fruit\]=\(s\.econ\.storage\[_T\.fruit\]\|\|0\)\+_take/.test(fora), '딴 만큼 곳간에');
ok(/_T\.fruit&&T123_FRUIT\(\)/.test(fora), '통제군은 따지도 않는다(되돌림 손잡이가 실체화 전체를 끈다)');
ok(/s\._fbDay!==_d/.test(fora), '열매나무가 **현장 후보**다(마을당 하루 한 번 스캔 · 카드 ④)');
ok(/o\.job==='forager'&&o\.work/.test(fora), '분산 — 다른 채집꾼이 붙은 나무는 피한다(사냥꾼·광부와 같은 문법)');
ok(/_e2\.n=Math\.max\(0,_e2\.n-_take\)/.test(fora), '딴 만큼 나무 재고에서 빠진다(베지 않는다)');
ok(!/L_CHOP/.test(fora), '채집 자리에 벌목 눈금(L_CHOP) 0 — 따는 것과 베는 것은 다른 일');

// ── ⑨ 계측은 관측자 ─────────────────────────────────────────────────────────
sec('⑨ 계측은 관측자 — 세계 규칙이 계측을 안 읽는다');
const worldReads = (stripComments(LAB).match(/_tstat/g) || []).length;
const statCalls = (stripComments(LAB).match(/_tStat\(/g) || []).length;
ok(worldReads <= 2, `랩 안에서 \`_tstat\` 를 직접 읽는 자리 ${worldReads}곳(≤2 — 생성자와 초기화뿐)`);
ok(statCalls >= 3, `\`_tStat(\` 호출 ${statCalls}곳(벌목·낙과·채집)`);
ok(!/if\s*\([^)]*_tstat/.test(stripComments(LAB)), '`_tstat` 로 갈라지는 분기 0(계측이 세계를 안 바꾼다)');

// ── ⑩ 랩 경로 ───────────────────────────────────────────────────────────────
sec('⑩ 랩 경로 — 하네스가 레포 안 랩을 본다');
for (const f of ['test-lab-market.js', 'test-lab-mining.js', 'test-lab-psite.js']) {
  const s = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
  const line = (s.match(/^const LAB = .*$/m) || [''])[0];
  ok(/lab', '전쟁실험실\.html'/.test(line), `${f} 기본 경로가 lab/`);
}

// ── ⑥ 열매 규약 — 랩을 실제로 부른다 ────────────────────────────────────────
(async () => {
  sec('⑥ 열매 규약(랩 실행) — 연 1회 · 겨울 소멸 · 이듬해 재결실 · 재고 = fy × 크기');
  let chromium = null;
  try { chromium = require('playwright').chromium; } catch (e) { chromium = null; }
  if (!chromium) { console.log('  SKIP  playwright 없음'); }
  else {
    const b = await chromium.launch();
    const p = await b.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    await p.goto('file://' + LABP, { waitUntil: 'load', timeout: 180000 });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      const out = { err: null };
      try {
        // 합성 마을 하나 — 세계를 안 돌리고 정산 함수만 부른다(빠르고 정확하다).
        const K = L_WOODMAX;
        // 열매종 칸을 찾는다(종 배정은 자리의 함수라 스캔이면 충분).
        let x = 0, y = 0, sp = null;
        for (let i = 0; i < 5000 && !sp; i++) { const t = treeAt(i, 3); if (TREES[t].fruit) { x = i; y = 3; sp = t; } }
        const T = TREES[sp];
        const s = { forestRich: new Map([[x + ',' + y, K]]), fruitRich: new Map() };
        // 그 종의 결실철 첫날을 찾는다(달력은 랩 정본 lSeason 이 쥔다 — 여기서 수를 안 적는다).
        const findDay = (from, season) => { for (let d = from; d < from + 2 * L_YEAR; d++) if (lSeason(d) === season) return d; return -1; };
        const d0 = findDay(0, T.fs);
        const n0 = fruitSettle(s, x, y, d0);
        const e = s.fruitRich.get(x + ',' + y);
        // 같은 해 같은 철에 다시 물어도 안 채워진다(연 1회) — 딴 뒤 재고를 줄이고 다시 물어본다
        e.n = e.n / 2; const half = e.n;
        const n1 = fruitSettle(s, x, y, d0 + 3);
        // 겨울
        const dW = findDay(d0, 3);
        const nW = fruitSettle(s, x, y, dW);
        // 이듬해 그 철
        const d2 = findDay(dW + 1, T.fs);
        const n2 = fruitSettle(s, x, y, d2);
        // 목재 전용 종은 0
        let wx = 0, wsp = null;
        for (let i = 0; i < 5000 && !wsp; i++) { const t = treeAt(i, 9); if (!TREES[t].fruit) { wx = i; wsp = t; } }
        const s2 = { forestRich: new Map([[wx + ',9', K]]), fruitRich: new Map() };
        const nWood = fruitSettle(s2, wx, 9, d0);
        // 크기 비례 — 절반 크기 칸
        const s3 = { forestRich: new Map([[x + ',' + y, K / 2]]), fruitRich: new Map() };
        const nHalf = fruitSettle(s3, x, y, d0);
        Object.assign(out, { sp, fy: T.fy, fs: T.fs, n0, half, n1, nW, n2, nWood, nHalf, K,
          seasonD0: lSeason(d0), seasonDW: lSeason(dW), yearD0: Math.floor(d0 / L_YEAR), yearD2: Math.floor(d2 / L_YEAR) });
      } catch (err) { out.err = String(err.message).slice(0, 300); }
      return out;
    });
    await b.close();
    if (r.err) { ok(false, '랩 평가 오류: ' + r.err); }
    else {
      ok(r.n0 === +(r.fy * 1).toFixed(4), `결실철 첫 정산에 재고 = fy(${r.fy}) × 크기1 = ${r.n0}`);
      ok(r.n1 === r.half, `같은 해 두 번째 정산은 안 채운다(연 1회) — ${r.half} 유지, 얻은 값 ${r.n1}`);
      ok(r.nW === 0 && r.seasonDW === 3, '겨울에 소멸(0)');
      ok(r.n2 === r.n0 && r.yearD2 > r.yearD0, `이듬해 그 철에 다시 채워진다(${r.n2})`);
      ok(r.nWood === 0, '목재 전용 종은 열매 0');
      ok(Math.abs(r.nHalf - r.n0 / 2) < 1e-6, `재고 ∝ 크기(절반 칸 = ${r.nHalf})`);
      ok(errs.length === 0, 'pageerror 0');
    }
  }

  console.log(`\n=== test-lab-trees: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})();
