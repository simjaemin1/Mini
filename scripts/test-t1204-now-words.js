#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1204-now-words.js — T1204 「지금 할 일」 칸 — 화살을 빼고 글로 방위 · 걸음 [★재민 11-07 문 29 ⓑ "그러자 b"] ===
//
// ★재는 것 — **제품 파일 원문**(`public/dir-word.js` · `public/client/70-lobby.js` 통째)을 vm 에 올려 진짜 함수를 부른다(서버 하나는 자식 판):
//   ① 정본 하나 — 서버 방위말(`onboarding.dirWord` · 촌장 대사 · 쓰러짐 외침)과 칸의 방위말이 **같은 파일**(`public/dir-word.js`) ·
//      `onboarding.js` 에 8방 표 글자 0 · 페이지가 그 파일을 70-lobby 보다 먼저 싣는다
//   ② 서버 — 손잡이 `T1204_NOW_WORDS`(켬 기본 · `=0` 종전): 켬이면 온보딩 상태에 시작 마을 쉼터 자리(`shelterOf` 정본 · 설 자리) · 끔이면 칸 없음(옛 바이트) ·
//      welcome 에 `nowWords: { cell, near }`(셀 px · "바로 앞" 문턱) 한 줄
//   ③ 칸 글 — 대상 넷(마을 · 빈터 · 내 터 · 쉼터 — 빈터는 두 길: 빈터로 가기 · 사유지 터 잡기)마다 "○○는 <방위>으로 <n>걸음입니다." · 방위 = 정본 낱말(따로 셈) · 걸음 = 셀 거리(따로 셈) ·
//      "바로 앞"(문턱 안) · "화살표" 글자 0 · 쉼터는 시작 마을 인사일 때만(다른 마을 인사 = 종전 그대로)
//   ④ 그리기 — 켬이면 화살 그림 0(아이콘 0 · 숨김) · 하네스 훅에 글 · 끔(입력에 정본 없음)이면 종전 화살 그대로(자명 통과 금지)
// 실행: node scripts/test-t1204-now-words.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);

if (process.env.T1204_CHILD) {   // 자식 — 온보딩 상태 한 벌(가짜 존 손 · 쉼터 하나)
  const Onb = require(path.join(ROOT, 'server', 'onboarding.js'));
  const H = { shelterOf: (vid) => (vid === 1 ? { vid: 1, cx: 2100, cy: 2130, x: (2100 - 2.5) * 32, y: (2130 - 0.5) * 32 } : null) };
  let st = null;
  try { st = Onb._t1204Probe ? Onb._t1204Probe(H, 1) : null; } catch (e) { st = { err: String(e && e.message || e) }; }
  console.log(JSON.stringify({ st }));
  process.exit(0);
}

// ── ① 정본 하나 ────────────────────────────────────────────────────────────────
sec('① 방위말 정본 하나 — 서버 · 칸이 같은 파일');
const DW = require(path.join(ROOT, 'public', 'dir-word.js'));
const Onb = require(path.join(ROOT, 'server', 'onboarding.js'));
ok(Onb.dirWord === DW.dirWord, '★서버 `onboarding.dirWord`(촌장 대사 · 쓰러짐 외침이 부르는 것) = `public/dir-word.js` 의 그 함수(같은 참조)');
const onbSrc = rd('server/onboarding.js');
ok(!/'해 뜨는 남쪽'|'해 지는 북쪽'/.test(onbSrc) && /require\('\.\.\/public\/dir-word\.js'\)\.dirWord/.test(onbSrc), '`onboarding.js` 에 8방 표 글자 0 · 정본을 require 한다(사본 0)');
const html = rd('public/index.html');
const iDw = html.indexOf('src="dir-word.js'), iLob = html.indexOf('src="client/70-lobby.js');
ok(iDw > 0 && iLob > iDw, '페이지가 `dir-word.js` 를 `70-lobby.js` 보다 먼저 싣는다', `${iDw} < ${iLob}`);
{
  const want = ['해 뜨는 쪽', '해 뜨는 남쪽', '남쪽', '해 지는 남쪽', '해 지는 쪽', '해 지는 북쪽', '북쪽', '해 뜨는 북쪽'];
  const got = want.map((_, i) => DW.dirWord(Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)));
  ok(JSON.stringify(got) === JSON.stringify(want), '여덟 방위 낱말(화면 x 오른쪽 · y 아래) — 옮기기 전 몸 그대로', got.join(' · '));
}

// ── ② 서버 ────────────────────────────────────────────────────────────────────
sec('② 서버 — 손잡이 · 쉼터 자리 · welcome 한 줄');
const zoneSrc = rd('server/zone.js');
ok(/process\.env\.T1204_NOW_WORDS !== '0' \? \{ nowWords: \{ cell: BUILDING_SIZE, near: 10 \} \}/.test(zoneSrc), 'welcome `uiCfg.nowWords` = { cell: 셀 px 정본(BUILDING_SIZE) · near: 10(카드 ②) } · 켬 기본 · `=0` 이면 칸 없음');
ok(/const T1204 = process\.env\.T1204_NOW_WORDS !== '0';/.test(onbSrc) && /H\.shelterOf\(vid \| 0\)/.test(onbSrc), '온보딩 손잡이 · 쉼터 자리는 `shelterOf` 정본을 부른다(자리를 다시 고르지 않는다)');
{
  const go = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1204_CHILD: '1' }, env), encoding: 'utf8' }).trim().split('\n').pop());
  const on = go({ T1204_NOW_WORDS: '' }), off = go({ T1204_NOW_WORDS: '0' });
  ok(on.st && on.st.has && on.st.sh && on.st.sh.vid === 1 && on.st.sh.x === Math.round((2100 - 2.5) * 32) && on.st.sh.y === Math.round((2130 - 0.5) * 32) && on.st.none === null,
    '★켬 — 온보딩 상태에 시작 마을 쉼터 설 자리(문 앞 · 존 로컬 px) · 쉼터 없는 마을은 null(좌표를 짓지 않는다)', JSON.stringify(on.st));
  ok(off.st && off.st.has === false, '끔(`=0`) — 온보딩 상태에 `shelter` 칸이 없다(옛 바이트)', JSON.stringify(off.st));
}

// ── ③ 칸 글 ───────────────────────────────────────────────────────────────────
function fakeDom() {
  const byId = new Map();
  const mk = (tag) => {
    const el = { tagName: tag.toUpperCase(), id: '', children: [], style: {}, dataset: {}, _cls: new Set(), _html: '', textContent: '',
      get className() { return [...this._cls].join(' '); }, set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
      classList: null, get firstChild() { return this._html ? {} : null; },
      appendChild(c) { this.children.push(c); if (c.id) byId.set(c.id, c); return c; },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
    el.classList = { add: (c) => el._cls.add(c), remove: (c) => el._cls.delete(c), contains: (c) => el._cls.has(c) };
    Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) {
      el._html = String(v);
      for (const m of el._html.matchAll(/id="([^"]+)"/g)) { const k = mk('span'); k.id = m[1]; byId.set(m[1], k); }
    } });
    return el;
  };
  const doc = { getElementById: (id) => byId.get(id) || null, createElement: (t) => mk(t), body: null };
  doc.body = mk('body');
  const game = mk('div'); game.id = 'game'; byId.set('game', game);
  return { doc, byId };
}
function load(cfg) {
  const D = fakeDom();
  const ctx = { console, Math, JSON, Map, Set, Array, Object, String, Number, isFinite, document: D.doc, innerWidth: 1440, innerHeight: 900,
    uiCfg: cfg || {}, window: {}, conns: new Map(), primaryZoneId: 'hanbando', evNearVid: null, myAbsPredicted: { x: 0, y: 0 },
    uiIcon: (n) => `<svg data-i="${n}"></svg>`, itemKo: (k) => ({ wood: '나무', grain: '곡식' }[k] || k) };
  ctx.window.__w2s = (x, y) => ({ px: (x - y), py: (x + y) / 2 });
  vm.createContext(ctx);
  vm.runInContext(rd('public/dir-word.js'), ctx, { filename: 'public/dir-word.js' });   // 페이지처럼 먼저 싣는다(전역 DirWord)
  {   // 조사 정본(`vvJosa` — 52-v-village-view.js · 페이지는 70-lobby 앞에 싣는다) — 그 함수 몸만 원문에서 떠 온다(사본 0)
    const vv = rd('public/client/52-v-village-view.js'), i0 = vv.indexOf('function vvJosa('), i1 = vv.indexOf('\n}\n', i0);
    vm.runInContext(vv.slice(i0, i1 + 3), ctx, { filename: 'public/client/52-v-village-view.js#vvJosa' });
  }
  vm.runInContext(rd('public/client/70-lobby.js'), ctx, { filename: 'public/client/70-lobby.js' });
  return { ctx, D };
}
const OFF = { x: 409984, y: 0 };
const HOME = { x: OFF.x + 2120 * 32 + 16, y: 2117 * 32 + 16, name: '광산1' };
const ARR = { vid: 1, name: '광산1', kind: 'dock', x: 66000, y: 67000, centerX: HOME.x - OFF.x, centerY: HOME.y - OFF.y };
const LOT = { x: 66000, y: 67000, r: 320 };
const SH = { vid: 1, x: Math.round((2100 - 2.5) * 32), y: Math.round((2130 - 0.5) * 32) };
const ST0 = { vid: 1, firstItem: null, firstDone: false, contrib: 0, need: 3, lotOk: false, lot: LOT, day: { day: 1, deliv: 0, fish: 0 }, shelter: SH };
const anchor = (vid) => (vid === 1 ? HOME : vid === 2 ? { x: OFF.x + 2007 * 32 + 16, y: 218 * 32 + 16, name: '광산2' } : null);
const CELL = 32, NEAR = 10;
const W = { words: DW.dirWord, wordsCell: CELL, wordsNear: NEAR };
const I0 = (o, w) => Object.assign({ state: ST0, arrive: ARR, greet: null, nearVid: null, me: { x: OFF.x + 64000, y: 64000 }, off: OFF, anchor,
  itemKo: (k) => ({ wood: '나무', grain: '곡식' }[k] || k) }, w === false ? {} : W, o || {});
const flat = (p) => p ? p.guide.map((x) => (x && x.k != null) ? `[${x.k}]` : x).join('') : '';
// 따로 셈 — 방위(정본 낱말) · 걸음(셀 거리 반올림)
const expect = (me, t) => { const dx = t.x - me.x, dy = t.y - me.y, n = Math.round(Math.hypot(dx, dy) / CELL); return { dir: DW.dirWord(dx, dy), steps: n }; };
const { ctx: C } = load({ nextStep: true, nowWords: { cell: CELL, near: NEAR } });
sec('③ 칸 글 — 대상 넷마다 방위 · 걸음(정본 낱말 · 셀 거리)');
try {
  const me = { x: OFF.x + 64000, y: 64000 };
  // 마을(도착) — 화살표 글 대신
  const e = C.onbNextPlan(I0());
  const xe = expect(me, HOME);
  ok(e && e.stage === 'enter' && e.where && e.where.dir === xe.dir && e.where.steps === xe.steps
    && flat(e).startsWith(`광산1 마을은 ${xe.dir}으로 ${xe.steps}걸음입니다. `) && !/화살표/.test(flat(e)) && /\[WASD\] 키로 걸어 들어가면/.test(flat(e)),
    '★마을로 들어가기 — "광산1 마을은 <방위>으로 <n>걸음입니다." · 화살표 글 0 · 나머지 글 그대로', flat(e));
  // 빈터(권리 · 밖)
  const l = C.onbNextPlan(I0({ state: Object.assign({}, ST0, { lotOk: true }) }));
  const xl = expect(me, { x: LOT.x + OFF.x, y: LOT.y + OFF.y });
  ok(l && l.stage === 'lot' && l.where && l.where.dir === xl.dir && l.where.steps === xl.steps && /빈터는 .+으로 \d+걸음입니다\./.test(flat(l)) && !/화살표/.test(flat(l)),
    '★빈터로 가기 — "빈터는 <방위>으로 <n>걸음입니다."', flat(l));
  // 바로 앞 — 문턱(10걸음) 안(마을 게이트 밖 · 마을 중심에서 5걸음)
  const near = C.onbNextPlan(I0({ me: { x: HOME.x + 5 * CELL, y: HOME.y } }));
  ok(near && near.stage === 'enter' && near.where && near.where.steps === 5 && near.where.dir === null && flat(near).startsWith('광산1 마을이 바로 앞입니다. '), '"바로 앞" — 10걸음 안이면 방위 없이', flat(near));
  {
    const pNear = C.onbWordsWhere(I0({}, undefined), '빈터', { x: me.x + 9 * CELL, y: me.y });
    const pFar = C.onbWordsWhere(I0({}, undefined), '빈터', { x: me.x + 11 * CELL, y: me.y });
    ok(pNear && pNear.text === '빈터가 바로 앞입니다.' && pNear.dir === null && pFar && pFar.text === '빈터는 해 뜨는 쪽으로 11걸음입니다.', '문턱 양쪽 — 9걸음 "바로 앞" · 11걸음 방위 · 걸음', `${pNear && pNear.text} / ${pFar && pFar.text}`);
  }
  // 사유지 터 잡기(T1086 길 · 빈터 밖) · 내 집 짓기(내 터 밖)
  {
    const FJ = { firstJoin: { cost: { wood: 3, stone: 2 } }, join: { member: true, offer: null }, inv: { wood: 0, stone: 0 } };
    const cl = C.onbNextPlan(I0(Object.assign({ state: Object.assign({}, ST0, { lotOk: true }) }, FJ)));
    const xc = expect(me, { x: LOT.x + OFF.x, y: LOT.y + OFF.y });
    ok(cl && cl.stage === 'claim' && cl.where && cl.where.dir === xc.dir && cl.where.steps === xc.steps && /빈터는 .+으로 \d+걸음입니다\./.test(flat(cl)) && !/화살표/.test(flat(cl)),
      '★사유지 터 잡기(빈터 밖 · T1086 길) — "빈터는 <방위>으로 <n>걸음입니다."', flat(cl));
    const ML = { x: OFF.x + 64000 + 30 * CELL, y: 64000 - 20 * CELL, inside: false };
    const bd = C.onbNextPlan(I0(Object.assign({ state: Object.assign({}, ST0, { lotOk: true }), myLot: ML }, FJ)));
    const xb = expect(me, ML);
    ok(bd && bd.stage === 'build' && bd.where && bd.where.dir === xb.dir && bd.where.steps === xb.steps && flat(bd).startsWith(`내 터는 ${xb.dir}으로 ${xb.steps}걸음입니다. `),
      '★내 집 짓기(내 터 밖) — "내 터는 <방위>으로 <n>걸음입니다."', flat(bd));
  }
  // 쉼터(빈 판 인사 · 시작 마을)
  const GREET0 = { vid: 1, quest: null, lines: ['낯선 얼굴이군. 어디서 왔나.', '지금은 급한 일이 없네. 마을 쉼터에서 쉬게.'] };
  const r = C.onbNextPlan(I0({ greet: GREET0, nearVid: 1 }));
  const xr = expect(me, { x: SH.x + OFF.x, y: SH.y + OFF.y });
  ok(r && r.stage === 'rest' && r.where && r.where.dir === xr.dir && r.where.steps === xr.steps && flat(r).startsWith(`쉼터는 ${xr.dir}으로 ${xr.steps}걸음입니다. `),
    '★쉬어 가기 — "쉼터는 <방위>으로 <n>걸음입니다."(서버 `shelterOf` 자리 · 따로 셈과 같다)', flat(r));
  const r2 = C.onbNextPlan(I0({ greet: Object.assign({}, GREET0, { vid: 2 }), nearVid: 2 }));
  ok(r2 && r2.stage === 'rest' && !r2.where && !r2.target, '다른 마을 인사 — 그 마을 쉼터 자리를 모르므로 종전 그대로(글 · 목표 없음)', flat(r2));
  const r3 = C.onbNextPlan(I0({ greet: GREET0, nearVid: 1, state: Object.assign({}, ST0, { shelter: null }) }));
  ok(r3 && r3.stage === 'rest' && !r3.where, '쉼터 없는 마을(서버 null) — 자리를 짓지 않는다', flat(r3));
  // 여덟 방위가 칸에서도 정본과 같다(빈터를 사방에 두고)
  let same = 0;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8 + 0.1, t = { x: me.x + Math.cos(a) * 40 * CELL, y: me.y + Math.sin(a) * 40 * CELL };
    const w = C.onbWordsWhere(I0({}, undefined), '빈터', t);
    if (w && w.dir === DW.dirWord(t.x - me.x, t.y - me.y) && w.steps === 40) same++;
  }
  ok(same === 16, '방위 열여섯 자리 — 칸 낱말 = 정본 낱말 · 걸음 40', `${same}/16`);
  // 자명 통과 금지 — 정본이 입력에 없으면(끔) 종전 화살표 글 그대로
  const eOff = C.onbNextPlan(I0({}, false));
  ok(eOff && /광산1 마을이 화살표 쪽에 있습니다/.test(flat(eOff)) && eOff.where === undefined, '끔(입력에 정본 없음) — 종전 글("화살표 쪽") 그대로(위 판정이 자명 통과가 아니다)', flat(eOff));
} catch (e) { ok(false, '③ 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

sec('④ 그리기 — 켬이면 화살 그림 0 · 끔이면 종전 화살');
const draw = (cfg) => {
  const { ctx, D } = load(cfg);
  ctx.conns.set('hanbando', { meta: { worldOffsetX: OFF.x, worldOffsetY: OFF.y }, simVillages: [] });
  ctx._evVillageAnchorAbs = (vid) => { const a = anchor(vid); return a ? { x: a.x, y: a.y, v: { name: a.name } } : null; };
  vm.runInContext(`onbState = ${JSON.stringify(ST0)}; onbArrive = ${JSON.stringify(ARR)};`, ctx);
  ctx.myAbsPredicted = { x: OFF.x + 64000, y: 64000 };
  vm.runInContext('onbNextRender()', ctx);
  return { ar: D.byId.get('onbNextArrow'), last: vm.runInContext('onbNextLast', ctx), guide: D.byId.get('onbNextGuide') };
};
try {
  const on = draw({ nextStep: true, nowWords: { cell: CELL, near: NEAR } });
  ok(on.ar && on.ar.classList.contains('hidden') && on.ar.innerHTML === '' && on.last && on.last.angle === null, '★켬 — 화살 그림 0(아이콘 0 · 숨김 · 각 없음)', JSON.stringify({ html: on.ar && on.ar.innerHTML, angle: on.last && on.last.angle }));
  ok(on.last && on.last.where && /광산1 마을은 .+으로 \d+걸음입니다\./.test(on.last.where.text) && /걸음입니다/.test(on.guide.innerHTML) && !/화살표/.test(on.guide.innerHTML), '켬 — 칸 글이 방위 · 걸음을 말하고 하네스 훅에도 실린다', on.last && on.last.where && on.last.where.text);
  const off = draw({ nextStep: true });
  ok(off.ar && !off.ar.classList.contains('hidden') && /data-i="arrowR"/.test(off.ar.innerHTML) && off.last && Number.isFinite(off.last.angle) && off.last.where === undefined, '끔(welcome 에 nowWords 없음) — 종전 화살 그대로', off.last && off.last.angle);
} catch (e) { ok(false, '④ 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
