#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2
// === scripts/test-t1377-onb-guide.js — 봇 자가 「지금 할 일」 칸(안내 글 · 화살)을 그대로 손 한 수로 옮기나 ====================
//
// ★왜 [T1368 회부 5 · 카드 T1377 ①] 첫 30분 실클라 봇은 칸이 화살로 가리킨 나무 · 바위 · 내 터를 안 따라가서 걸린 분을 믿을 수 없었다.
//   이제 자(`e2e-first30 --guide`)는 칸 한 벌을 `scripts/lib-onb-guide.js` `guideAct` 에 넣어 한 수를 고른다.
// ★이 하네스는 **제품 칸 고르기 함수**(`public/client/70-lobby.js` `onbNextPlan` 원문 · vm)가 낸 칸을 그대로 넣는다 — 칸 글이 바뀌면 여기서 빨강이다.
//   두 꼴을 다 넣는다: ⓐ 제품 함수가 돌려준 칸(`noun` · 글 조각 배열) ⓑ 화면 칸(`window.__t1064Next` 가 주는 꼴 — 글이 한 줄 · `noun` 없음).
//   ① 나무가 모자라면 — 화살 끝(서버가 준 가까운 나무 + 존 오프셋)으로 가서 나무를 E
//   ② 나무가 차고 돌이 모자라면 — 바위
//   ③ 재료가 되면 — 집터 잡기(C · 단추)
//   ④ 터가 서고 그 밖이면 — 터로 간다 · 터 안이면 — 움집 터파기
//   ⑤ 서버가 도구 막힘을 걸면(`need`) — 칸의 도구 한 칸(만들기 · 줍기)이 먼저
//   ⑥ 끔(서버가 own 칸을 안 실음) — 제 집 줄기 수가 없다
//   ⑦ 미끼 둘(이 파일 안 · 바꾼 자리 정확히 1곳): ⓐ 칸 글에서 무엇(나무 · 바위)을 읽는 줄을 걷은 사본 → 화면 칸 줄(①ⓑ · ②ⓑ)만 빨강
//      ⓑ 터 밖이면 터로 가는 줄을 걷은 사본 → ④ 터 밖 줄만 빨강
// ★날짜 · 벽시계 0 · 서버 0(1초 안).
// 실행: node scripts/test-t1377-onb-guide.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);

// ── 제품 칸 고르기(70-lobby.js 원문) ─────────────────────────────────────────────
function fakeDoc() {
  const mk = (tag) => ({ tagName: tag.toUpperCase(), id: '', children: [], style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) });
  const doc = { getElementById: () => null, createElement: mk, body: null }; doc.body = mk('body'); return doc;
}
const COST = { wood: 3, stone: 2 };
function loadClient() {
  const ctx = { console, Math, JSON, Map, Set, Array, Object, String, Number, isFinite, document: fakeDoc(), innerWidth: 1440, innerHeight: 900,
    uiCfg: { nextStep: true, firstJoin: { cost: COST } }, window: {}, conns: new Map(), primaryZoneId: 'hanbando', evNearVid: null, myAbsPredicted: { x: 0, y: 0 },
    inventory: {}, myPlayerId: 'u1', myUsername: 'u1', sendPrimary: () => {}, uiIcon: (n) => `<svg data-i="${n}"></svg>`, itemKo: (k) => k };
  vm.createContext(ctx);
  const jo = /function vvJosa\([\s\S]*?\n}\n/.exec(rd('public/client/52-v-village-view.js'));
  if (jo) vm.runInContext(jo[0], ctx, { filename: 'public/client/52-v-village-view.js#vvJosa' });
  vm.runInContext(rd('public/client/70-lobby.js'), ctx, { filename: 'public/client/70-lobby.js' });
  return ctx;
}
const OFF = { x: 409984, y: 0 };
const ARR = { vid: 1, name: '광산1', kind: 'dock', x: 66000, y: 67000, centerX: 67000, centerY: 67600 };
const HOME = { x: OFF.x + ARR.centerX, y: ARR.centerY, name: '광산1' };
const TREE = { x: 66300, y: 66900 }, ROCK = { x: 65700, y: 67200 };   // 서버가 준 가까운 나무 · 바위(존 로컬)
const OWN = { cost: COST, need: 12, recog: false, tree: TREE, rock: ROCK };
const ST0 = { vid: 1, firstItem: null, firstDone: false, contrib: 0, need: 12, lotOk: false, lot: { x: ARR.x, y: ARR.y, r: 320 }, day: { day: 1, deliv: 0, fish: 0 }, own: OWN };
const ME = { x: OFF.x + ARR.x, y: ARR.y };
const Ib = (o) => Object.assign({ state: ST0, arrive: ARR, greet: null, nearVid: null, me: ME, off: OFF, anchor: (v) => (v === 1 ? HOME : null), itemKo: (k) => k,
  join: { member: null, offer: null }, firstJoin: { cost: COST }, inv: { wood: 0, stone: 0 }, myLot: null, myClaim: null, myHome: false }, o || {});
//   화면 칸 꼴 — 클라가 그린 것을 하네스 훅(`window.__t1064Next`)이 주는 그 꼴(글 한 줄 · 단추 · 화살 · 도구 한 칸 · `noun` 없음)
const screen = (p) => (p ? Object.assign({ stage: p.stage, item: p.item, guide: p.guide.map((x) => (x && x.k != null) ? `[${x.k}]` : x).join(''),
  target: p.target ? { x: Math.round(p.target.x), y: Math.round(p.target.y) } : null, btn: p.btn || null }, p.step ? { step: p.step } : {}) : null);

let C = null, PLANS = null;
try {
  C = loadClient();
  const plan = (I) => C.onbNextPlan(I);
  PLANS = {
    wood: plan(Ib()),
    stone: plan(Ib({ inv: { wood: 3, stone: 1 } })),
    claim: plan(Ib({ inv: { wood: 3, stone: 2 } })),
    out: plan(Ib({ myClaim: { x: ME.x + 640, y: ME.y, inside: false } })),
    inside: plan(Ib({ myClaim: { x: ME.x, y: ME.y, inside: true } })),
    tool: plan(Ib({ need: { verb: 'chop' }, toolCfg: { verbs: { chop: { ok: ['axe', 'crude_axe'], make: 'crude_axe', act: '나무를 벨' } } },
      recipes: { crude_axe: { cost: { pebble: 2, twig: 1, fiber: 2 } } }, bag: {}, tools: [] })),
    off: plan(Ib({ state: (() => { const s = Object.assign({}, ST0); delete s.own; return s; })() })),
  };
} catch (e) { ok(false, '제품 칸 고르기를 못 올렸다: ' + (e && e.stack || e)); }

// ── 자(같은 자를 제품 · 미끼 사본에 똑같이) ───────────────────────────────────────
function judge(guideAct) {
  const P = PLANS, J = {};
  const tAbs = { x: TREE.x + OFF.x, y: TREE.y + OFF.y }, rAbs = { x: ROCK.x + OFF.x, y: ROCK.y + OFF.y };
  const isG = (a, res, item, t) => !!a && a.do === 'gather' && a.res === res && a.item === item && a.target.x === t.x && a.target.y === t.y;
  J.woodPlan = isG(guideAct(P.wood), 'tree', 'wood', tAbs);
  J.woodScreen = isG(guideAct(screen(P.wood)), 'tree', 'wood', tAbs);
  J.stonePlan = isG(guideAct(P.stone), 'rock', 'stone', rAbs);
  J.stoneScreen = isG(guideAct(screen(P.stone)), 'rock', 'stone', rAbs);
  const c = guideAct(screen(P.claim)); J.claim = !!c && c.do === 'claim';
  const o = guideAct(screen(P.out)); J.buildOut = !!o && o.do === 'goto' && o.why === 'build' && o.target.x === ME.x + 640 && o.target.y === ME.y;
  const h = guideAct(screen(P.inside)); J.buildIn = !!h && h.do === 'hut';
  const t = guideAct(screen(P.tool)); J.tool = !!t && t.do === 'tool' && !!t.step && t.step.what === P.tool.step.what;
  const f = guideAct(screen(P.off)); J.off = !f || (f.do !== 'gather' && f.do !== 'claim' && f.do !== 'hut');
  J.nul = guideAct(null) === null && guideAct({ stage: 'gather', target: null, guide: '나무 곁에서' }) === null;
  return J;
}
const LIB = path.join(__dirname, 'lib-onb-guide.js');
const G = require(LIB).guideAct;

sec('제품 칸 → 손 한 수(제품 `onbNextPlan` 이 낸 칸 · 화면 칸 둘 다)');
let JR = null;
try {
  const P = PLANS;
  ok(!!P && P.wood && P.wood.stage === 'gather' && /나무 곁에서/.test(screen(P.wood).guide) && P.stone && /바위 곁에서/.test(screen(P.stone).guide),
    '[전제] 제품 칸이 제 집 줄기를 낸다 — 나무 · 바위 칸 글이 "○○ 곁에서"(아래가 자명 통과가 아니다)', P && P.wood && screen(P.wood).guide.slice(-40));
  ok(!!P && P.tool && P.tool.stage === 'tool' && P.tool.step && P.tool.step.do === 'fetch', '[전제] 서버 막힘(`need`)이 걸리면 칸이 도구 한 칸을 낸다', P && P.tool && JSON.stringify(P.tool.step));
  JR = judge(G);
  ok(JR.woodPlan && JR.woodScreen, '★① 나무가 모자라면 — 화살 끝(서버가 준 가까운 나무 + 존 오프셋)의 나무를 E(제품 칸 · 화면 칸 같음)', JSON.stringify(G(screen(P.wood))));
  ok(JR.stonePlan && JR.stoneScreen, '★② 나무가 차고 돌이 모자라면 — 화살 끝의 바위', JSON.stringify(G(screen(P.stone))));
  ok(JR.claim, '③ 재료가 되면 — 집터 잡기(칸 단추 · C)', JSON.stringify(G(screen(P.claim))));
  ok(JR.buildOut && JR.buildIn, '★④ 터가 섰는데 터 밖이면 — 터로 · 터 안이면 — 움집 터파기', JSON.stringify([G(screen(P.out)), G(screen(P.inside))]));
  ok(JR.tool, '⑤ 서버 막힘이 걸리면 칸의 도구 한 칸이 먼저(제 집 화살보다)', JSON.stringify(G(screen(P.tool))));
  ok(JR.off, '⑥ 끔(서버가 own 칸을 안 실음) — 제 집 줄기 수(나무 · 바위 · 집터 · 움집) 0', JSON.stringify([P.off && P.off.stage, G(screen(P.off))]));
  ok(JR.nul, '칸이 없거나 화살이 없으면 수 0(지어내지 않는다)');
} catch (e) { ok(false, '판 예외: ' + (e && e.stack || e)); }

sec('⑦ 미끼 — 이 파일 안 · 바꾼 자리 정확히 1곳 · 어느 줄이 빨강인지 단언');
const tmp = [];
try {
  const SRC = fs.readFileSync(LIB, 'utf8');
  const cnt = (s, x) => s.split(x).length - 1;
  const LA = "(/나무 곁에서/.test(txt) ? '나무' : /바위 곁에서/.test(txt) ? '바위' : /갈대 곁에서/.test(txt) ? '갈대' : null)";   // ★[T1392] 갈대 한 갈래가 붙었다
  const LB = "    return tg ? { do: 'goto', target: tg, why: 'build' } : { do: 'hut' };";   // ★[T1392] 'build' 갈래가 여러 줄(간이 움집 단추 줄이 앞에)
  const sa = SRC.replace(LA, 'null'), sb = SRC.replace(LB, "    return { do: 'hut' };");
  const fa = path.join(__dirname, `_t1377_bait_a_${process.pid}.js`), fb = path.join(__dirname, `_t1377_bait_b_${process.pid}.js`);
  fs.writeFileSync(fa, sa); fs.writeFileSync(fb, sb); tmp.push(fa, fb);
  const JA = judge(require(fa).guideAct), JB = judge(require(fb).guideAct);
  const onlyRed = (J, keys) => Object.entries(J).every(([k, v]) => (keys.includes(k) ? !v : v));
  ok(cnt(SRC, LA) === 1 && cnt(sa, LA) === 0 && onlyRed(JA, ['woodScreen', 'stoneScreen']),
    '★미끼 ⓐ 칸 글에서 무엇을 읽는 줄을 걷은 사본(바꾼 자리 1곳) — 화면 칸 줄(①ⓑ · ②ⓑ)만 빨강', JSON.stringify(JA));
  ok(cnt(SRC, LB) === 1 && cnt(sb, LB) === 0 && onlyRed(JB, ['buildOut']),
    '★미끼 ⓑ 터 밖이면 터로 가는 줄을 걷은 사본(바꾼 자리 1곳) — ④ 터 밖 줄만 빨강', JSON.stringify(JB));
  ok(!!JR && Object.values(JR).every(Boolean), '제품 칸 + 자 그대로는 같은 자가 전부 초록(미끼만 빨강)', JSON.stringify(JR));
} catch (e) { ok(false, '⑦ 예외: ' + (e && e.stack || e)); }
finally { for (const f of tmp) { try { fs.unlinkSync(f); } catch (e) {} } }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
