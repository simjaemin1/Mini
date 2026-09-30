#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// =============================================================================
// test-indoor-on — 실내 = 지붕 아래 **기본 켬**(T536 · ★PM 승격) · 끔 = 종전 글자 그대로 · 클라 비·눈 층이 서버의 실내를 듣는다
//
// ★묻는 것 셋(카드 T536 ①②):
//   ① 손잡이 `T526_VILLAGE_INDOOR` — 한 곳에서 읽고 · 기본이 켬이고(`=0` 만 끔) · 끄면 몸의 실내(`isIndoorAt`)와
//      게이지 페이로드(`weatherFor`)가 **T526 전 글자 그대로**인가(끔 갈래를 빼면 옛 본문이 한 글자도 안 다르다).
//   ② 클라 비·눈 층(`37-r1-weather.js drawWeather`) — "지붕 아래선 안 그린다"와 소리 훅(`__sfx.weather(w, indoor)`)이
//      서버 게이지 `weather.indoor` 를 **먼저** 듣는가(클라는 판정하지 않는다) · 칸이 없으면(끔) 종전 방 정본(`playerIsIndoors`) 그대로인가.
//      ⇒ 층을 **그 파일 그대로** vm 에 올려(사본 0) 네 판(서버 참/거짓/없음 × 클라 방 참/거짓)을 그리고,
//         칸 없음 두 판은 **T536 전 판**(같은 파일에서 T536 줄만 옛 한 줄로 되돌린 것)과 결과·훅 인자까지 대 본다.
//   ③ 자명 통과 금지 — 옛 손잡이 식(`=== '1'`)과 옛 층 줄을 미끼로 넣으면 위 판정이 **빨개진다**.
// ★제품 코드는 한 줄도 다시 짓지 않는다 — 소스를 읽어 대 보거나, 층 파일을 통째로 올려 부른다.
//
// 실행: node scripts/test-indoor-on.js
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const codeOnly = require('./code-only.js');   // ★주석 제거기 정본(사본 0)
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m, extra) => { if (c) pass++; else fail++; say(`  ${c ? '✓' : '✗'} ${m}` + (extra !== undefined ? `  ${extra}` : '')); };
const fnText = (src, head) => {   // `function 이름(` 부터 짝 맞는 `}` 까지(원문 그대로)
  const at = src.indexOf(head); if (at < 0) return '';
  let i = src.indexOf('{', at), d = 0;
  for (let j = i; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(at, j + 1); } }
  return '';
};

say('\n=== 실내 = 지붕 아래 기본 켬 · 끔 = 글자 그대로 · 비·눈 층이 서버 실내를 듣는다 (T536) ===');

// ═══ ① 손잡이 — 한 곳 · 기본 켬 · 끔 = T526 전 글자 그대로 ═════════════════════════════════════
say('\n① 손잡이 `T526_VILLAGE_INDOOR` — 한 곳 · 기본 켬(`=0` 만 끔) · 끔 갈래를 빼면 옛 본문');
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const ZCODE = codeOnly(ZSRC);
{
  // ①a 읽는 곳은 서버 전체에서 한 곳
  const reads = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'server')).filter((x) => x.endsWith('.js'))) {
    const c = codeOnly(fs.readFileSync(path.join(ROOT, 'server', f), 'utf8'));
    const n = (c.match(/process\.env\.T526_VILLAGE_INDOOR\b/g) || []).length;
    if (n) reads.push(`${f}×${n}`);
  }
  ok(reads.length === 1 && reads[0] === 'zone.js×1', '①a 손잡이를 읽는 곳은 서버 전체에서 **한 곳**(zone.js · 적재 때 한 번)', reads.join(' · ') || '0곳');
  // ①b 그 한 줄 — 기본 켬
  const KLINE = "const T526_VILLAGE_INDOOR = process.env.T526_VILLAGE_INDOOR !== '0';";
  ok(ZCODE.split('\n').some((l) => l.trim() === KLINE), '★①b 그 한 줄이 **기본 켬**이다(`!== \'0\'` — T510·T528 승격과 같은 문법)', KLINE);
  // ①c 뜻의 표 — 그 식을 그대로 떠서 env 값마다 돌린다(식을 다시 짓지 않는다)
  const exprOf = (line) => (line.match(/=\s*(process\.env\.T526_VILLAGE_INDOOR[^;]*);/) || [])[1] || null;
  const expr = exprOf(ZCODE.split('\n').find((l) => /const T526_VILLAGE_INDOOR\s*=/.test(l)) || '');
  const table = (e) => { const f = new Function('process', `return (${e});`);
    return [undefined, '', '1', 'true', '0'].map((v) => (f({ env: v === undefined ? {} : { T526_VILLAGE_INDOOR: v } }) ? '켬' : '끔')).join(' '); };
  const T = expr ? table(expr) : null;
  ok(T === '켬 켬 켬 켬 끔', '★★①c 값 표 — 없음·빈칸·`1`·`true` 는 켬, **`0` 만 끔**(되돌림 한 줄)', `없음 · '' · 1 · true · 0 → ${T}`);
  const OLD_T = table("process.env.T526_VILLAGE_INDOOR === '1'");
  ok(OLD_T !== '켬 켬 켬 켬 끔', '①c′ (자명 통과 금지) 옛 식(`=== \'1\'` · T526 기본 끔)을 같은 표에 넣으면 **다르게** 나온다 — 위 판정이 승격을 실제로 잰다', `옛 식 → ${OLD_T}`);
  // ①d isIndoorAt — 켬 갈래 한 줄을 빼면 T526 전 본문 그대로
  const OLD_FN = [
    'function isIndoorAt(p) {',
    '  try {',
    '    const cx = Math.floor(p.x / 32), cy = Math.floor(p.y / 32);',
    '    return !!Rooms.roomAt(cx, cy, p.floor || 0);',
    '  } catch (e) { return false; }',
    '}'].join('\n');
  const ON_LINE = '    if (T526_VILLAGE_INDOOR) return Rooms.underRoofAt(cx, cy, p.floor || 0);\n';
  const fn = fnText(ZSRC, 'function isIndoorAt(');
  ok(fn.includes(ON_LINE), '①d 전제 — `isIndoorAt` 의 켬 갈래는 한 줄(`Rooms.underRoofAt` = 방 ∪ 마을 발자국)', `${fn.split('\n').length}줄`);
  ok(fn.replace(ON_LINE, '') === OLD_FN, '★★①d 켬 갈래 한 줄을 빼면 **T526 전 `isIndoorAt` 과 글자 하나 다르지 않다**(끔 = 종전 방 판정 그대로)',
    fn.replace(ON_LINE, '') === OLD_FN ? '6줄 동일' : JSON.stringify(fn.replace(ON_LINE, '')).slice(0, 160));
  // ①e weatherFor — `indoor` 칸은 켬일 때만 · 끔은 `null`(Object.assign 은 null 원천을 건너뛴다 ⇒ 페이로드 바이트 동일)
  const wf = fnText(ZSRC, 'function weatherFor(');
  const RET_NEW = 'wind: +Wind.seasonWind(day).toFixed(3), exp: wexp, precip, wet: +wet.toFixed(4), cover }, T526_VILLAGE_INDOOR ? { indoor: isIndoorAt(p) } : null);';
  const RET_OLD = 'wind: +Wind.seasonWind(day).toFixed(3), exp: wexp, precip, wet: +wet.toFixed(4), cover });';
  ok(wf.includes(RET_NEW) && wf.replace(RET_NEW, RET_OLD).includes(RET_OLD) && (wf.match(/T526_VILLAGE_INDOOR/g) || []).length === 1,
    '★①e `weatherFor` 의 마지막 인자 하나 — 켬이면 `{ indoor }` · 끔이면 `null` · 그 인자를 빼면 T526 전 반환 줄 그대로', `${wf.split('\n').length}줄`);
  const W0 = { tempC: 3.2, hint: '쌀쌀', day: 317 }, X0 = { shelter: 1, cut: 0.65, insC: 0, wind: -0.2, exp: 0, precip: 0, wet: 0, cover: 0 };
  const off = JSON.stringify(Object.assign({}, W0, X0, null)), old = JSON.stringify(Object.assign({}, W0, X0));
  const on = JSON.stringify(Object.assign({}, W0, X0, { indoor: true }));
  ok(off === old && on === old.slice(0, -1) + ',"indoor":true}', '①f 끔 페이로드 = 옛 페이로드(바이트 동일) · 켬은 **맨 끝에 한 칸**(`"indoor":…`)만 붙는다',
    `끔 ${off.length}B = 옛 ${old.length}B · 켬 +${on.length - old.length}B`);
}

// ═══ ② 클라 비·눈 층 — 서버 게이지가 먼저 · 없으면 종전 방 정본 ═════════════════════════════════
say('\n② 클라 비·눈 층 — `weather.indoor` 가 먼저(클라는 판정하지 않는다) · 칸이 없으면 종전 `playerIsIndoors`');
const WX_FILE = path.join(ROOT, 'public', 'client', '37-r1-weather.js');
const WSRC = fs.readFileSync(WX_FILE, 'utf8');
// T536 전 판 — 같은 파일에서 T536 이 바꾼 자리만 옛 세 줄로 되돌린다(층의 나머지는 글자 그대로)
const NEW_START = WSRC.indexOf('    // ★지붕 아래선 안 그린다');
const NEW_END = WSRC.indexOf('\n', WSRC.indexOf('    const indoor = (typeof _wIn'));
const OLD_BLOCK = [
  '    // ★지붕 아래선 안 그린다 — 실내 술어는 **방 정본**을 그대로 부른다(사본 금지).',
  '    //   `playerIsIndoors` 는 서버가 보낸 방을 꺼내 볼 뿐이다(`20-r2-visibility.js`).',
  '    const indoor = (typeof playerIsIndoors === \'function\') ? !!playerIsIndoors() : false;'].join('\n');
const WSRC_OLD = (NEW_START > 0 && NEW_END > NEW_START) ? WSRC.slice(0, NEW_START) + OLD_BLOCK + WSRC.slice(NEW_END) : null;
ok(!!WSRC_OLD, '② 전제 — 층 파일에서 T536 자리를 찾았다(옛 판을 같은 파일에서 되돌려 만들 수 있다)',
  WSRC_OLD ? `${WSRC.split('\n').length}줄 → 옛 판 ${WSRC_OLD.split('\n').length}줄` : '못 찾음');
// 층을 vm 에 통째로 올린다 — 클라 전역(`myWeather`·`playerIsIndoors`·`window`)만 끼운다
function layer(src) {
  const sfx = [];
  const g = { window: { __sfx: { weather: (w, indoor) => sfx.push({ w: Object.assign({}, w), indoor }) } }, myWeather: null, playerIsIndoors: () => false, Math, JSON, Object };
  const c = vm.createContext(g);
  vm.runInContext(src, c, { filename: '37-r1-weather.js' });
  const ctx2d = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, strokeStyle: '', lineWidth: 1, lineCap: '' };
  return (weather, roomIndoor) => {
    g.myWeather = weather; g.playerIsIndoors = () => roomIndoor; sfx.length = 0;
    const n = vm.runInContext('drawWeather', c)(ctx2d, 1280, 800, 1000);
    const dbg = g.window.__rainDbg ? g.window.__rainDbg() : null;
    return { n, indoor: dbg && dbg.indoor, on: dbg && dbg.on, sfxIndoor: sfx.length ? sfx[sfx.length - 1].indoor : null, sfxN: sfx.length };
  };
}
{
  const NOW = layer(WSRC), OLD = WSRC_OLD ? layer(WSRC_OLD) : null;
  const RAIN = { precip: 1, tempC: 5, wind: 0 };
  const a = NOW(Object.assign({}, RAIN, { indoor: true }), false);
  const b = NOW(Object.assign({}, RAIN, { indoor: false }), true);
  ok(a.n === 0 && a.indoor === true && a.sfxIndoor === true,
    '★★②a 서버가 "지붕 아래"라면(`weather.indoor: true`) 클라 방이 아니어도 **한 획도 안 그리고** 소리 훅도 실내로 받는다(마을 움집 안)', JSON.stringify(a));
  ok(b.n > 0 && b.indoor === false && b.sfxIndoor === false,
    '★★②b 서버가 "바깥"이라면(`indoor: false`) 클라가 방으로 알아도 **비가 온다** — 판정은 서버 하나(클라 사본 0)', JSON.stringify(b));
  const c1 = NOW(Object.assign({}, RAIN), true), d1 = NOW(Object.assign({}, RAIN), false);
  ok(c1.n === 0 && c1.indoor === true && d1.n > 0 && d1.indoor === false,
    '②c 칸이 없으면(서버 끔) **종전 방 정본**(`playerIsIndoors`)으로 가른다 — 방 안 0획 · 방 밖 비', `방 안 ${c1.n}획 · 방 밖 ${d1.n}획`);
  if (OLD) {
    const c0 = OLD(Object.assign({}, RAIN), true), d0 = OLD(Object.assign({}, RAIN), false);
    ok(JSON.stringify(c0) === JSON.stringify(c1) && JSON.stringify(d0) === JSON.stringify(d1),
      '★★②d 칸 없는 두 판이 **T536 전 층과 같다**(획 수 · 진단 훅 · 소리 훅 인자까지) — 끔 = 종전 그대로', `${JSON.stringify(c0)} | ${JSON.stringify(d0)}`);
    const a0 = OLD(Object.assign({}, RAIN, { indoor: true }), false);
    ok(a0.n > 0 && a0.indoor === false, '②d′ (자명 통과 금지) T536 전 층은 같은 움집 안(서버 참 · 클라 방 아님)에서 **비를 그렸다** — ②a 가 실제 차이를 잰다',
      JSON.stringify(a0));
  }
  const e = NOW(Object.assign({}, RAIN, { precip: 0, indoor: true }), false);
  ok(e.n === 0 && e.indoor === true && e.on === false, '②e 맑은 날 실내 — 그릴 것 없음 · 실내 표시는 그대로(훅 모양 불변)', JSON.stringify(e));
  const code = codeOnly(WSRC);
  const dw = fnText(code, 'function drawWeather(');
  ok((dw.match(/playerIsIndoors\(\)/g) || []).length === 1 && /typeof _wIn === 'boolean'/.test(dw) && /window\.__sfx\.weather\(w, indoor\)/.test(dw),
    '②f 층 안의 실내는 **한 값**이다 — 그리기 판정과 소리 훅이 같은 `indoor` 를 받는다(종전 방 정본 호출은 폴백 한 자리)');
  const db = fnText(code, 'function drawBreath(');
  ok(/playerIsIndoors\(\)/.test(db) && !/_wIn|myWeather\.indoor/.test(db),
    '②g 입김(`drawBreath`)은 **안 건드렸다** — 몸마다 칸을 보는 규약(남의 몸은 게이지가 없다 · 회부)');
}

say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
