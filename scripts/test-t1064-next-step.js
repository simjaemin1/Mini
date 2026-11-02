#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1064-next-step.js — T1064 「지금 할 일」 칸 — 대본 단계 → 다음 행동 한 줄 + 그 쪽 ====================
//
// ★왜 [재민 11-01 · 카드 T1064] "막막하다 · 뭘 해야 할지 모르겠다 · 마을 앞에 스폰되면 제대로 보여 주는 게 없다."
//   서버는 대본 단계를 다 안다(`onboarding_state` · 촌장 첫 인사 · 첫 의뢰 · 빈터 권리). 고침은 그걸 화면 한쪽 칸 하나로 말한다
//   (`public/client/70-lobby.js` `onbNextPlan` · `onbNextRender` · 손잡이 `T1064_NEXT_STEP` → welcome `uiCfg.nextStep`).
//
// ★이 하네스가 재는 것 — **제품 파일 원문**(70-lobby.js 통째)을 vm 에 올려 진짜 함수를 부른다(서버 0 · 1초 안):
//   ① 단계 — 도착(마을로) · 게이트 안(촌장 기다림) · 인사 받음(의뢰 / 빈 판) · 첫 납품 뒤(의뢰 더) · 빈터 권리(빈터로 / 집 짓기)
//      · 차례(빈터 > 첫 납품 > 인사 > 게이트 > 도착) · 목표(마을 = 그 마을 중심 · 빈터 = 서버 lot + 존 오프셋) · 닿으면 화살 없음 · 자리 이름
//   ② 말투(지시_T1069) — 할 일 명사형 · 설명 하십시오체 · 가운뎃점 · 화살표 · 괄호 · 느낌표 · 이모지 0 · 단축키 뒤 "키로"
//   ③ 새 수 0 — 문구의 수는 입력(서버 값)에서만 · 고르기 함수 몸에 수 글자는 0 · 2(촌장 셋째 줄 자리)뿐
//   ④ 손잡이 — 끔(welcome 칸 없음)이면 칸을 안 만든다 · 켬이면 가짜 DOM 에 칸 하나 · 글자 · 화살 · 숨김
//   ⑤ 먹선 — CSS 줄은 토큰만(색 리터럴 0) · 조각 글자에 색 리터럴 · 이모지 0 · 서버 손잡이 한 줄
//   ⑥ 돌연변이 — 고르기의 "닿으면 화살 없음" · 단계 차례를 걷어 낸 글자면 위 판정이 빨갛다(자명 통과 금지)
//
// 실행: node scripts/test-t1064-next-step.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);
const SRC = rd('public/client/70-lobby.js');

// ── 가짜 DOM(이 하네스가 쓰는 만큼만) ───────────────────────────────────────────
function fakeDom() {
  const byId = new Map();
  let created = 0;
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
    created++;
    return el;
  };
  const doc = { getElementById: (id) => byId.get(id) || null, createElement: (t) => mk(t), body: null };
  doc.body = mk('body');
  const game = mk('div'); game.id = 'game'; byId.set('game', game);
  const mini = mk('div'); mini.id = 'minimap'; byId.set('minimap', mini);
  mini.getBoundingClientRect = () => ({ left: 1086, top: 12, right: 1428, bottom: 250, width: 342, height: 238 });
  return { doc, byId, created: () => created };
}
function load(src, cfg) {
  const D = fakeDom();
  const ctx = { console, Math, JSON, Map, Set, Array, Object, String, Number, isFinite, document: D.doc, innerWidth: 1440, innerHeight: 900,
    uiCfg: cfg || {}, window: {}, conns: new Map(), primaryZoneId: 'hanbando', evNearVid: null, myAbsPredicted: { x: 0, y: 0 },
    uiIcon: (n) => `<svg data-i="${n}"></svg>`, itemKo: (k) => ({ wood: '나무', grain: '곡식', fish: '물고기' }[k] || k) };
  ctx.window.__w2s = (x, y) => ({ px: (x - y), py: (x + y) / 2 });   // 아이소 사영 꼴(돌림 0 · 줌 1) — 화살 각을 잴 때만 쓴다
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'public/client/70-lobby.js' });
  return { ctx, D };
}

// ── 세계 한 벌 ───────────────────────────────────────────────────────────────
const OFF = { x: 409984, y: 0 };                                   // 1차 존 오프셋(절대 = 존 로컬 + 오프셋)
const HOME = { x: OFF.x + 2120 * 32 + 16, y: 2117 * 32 + 16, name: '광산1' };   // 마을 중심(절대 · `_evVillageAnchorAbs`)
const OTHER = { x: OFF.x + 2007 * 32 + 16, y: 218 * 32 + 16, name: '광산2' };
const ARR = { vid: 1, name: '광산1', kind: 'dock', x: 66000, y: 67000, centerX: HOME.x - OFF.x, centerY: HOME.y - OFF.y };   // 존 로컬
const LOT = { x: 66000, y: 67000, r: 320 };                        // 서버 `vacantZoneOf`(존 로컬 · 반경 px)
const ST0 = { vid: 1, firstItem: null, firstDone: false, contrib: 0, need: 3, lotOk: false, lot: LOT, day: { day: 1, deliv: 0, fish: 0 } };
const anchor = (vid) => (vid === 1 ? HOME : vid === 2 ? OTHER : null);
const I0 = (o) => Object.assign({ state: ST0, arrive: ARR, greet: null, nearVid: null, me: { x: OFF.x + 64000, y: 64000 }, off: OFF, anchor,
  itemKo: (k) => ({ wood: '나무', grain: '곡식' }[k] || k) }, o || {});
const GREETQ = { vid: 1, quest: { item: 'wood', qty: 4, remain: 2, rewItem: 'grain', rewQty: 1 }, lines: ['낯선 얼굴이군. 어디서 왔나.', '요즘 나무가 달리네. 2만 구해다 주면 곡식(으)로 갚음세.', '해 뜨는 쪽 강가로 가 보게.'] };
const GREET0 = { vid: 1, quest: null, lines: ['낯선 얼굴이군. 어디서 왔나.', '지금은 급한 일이 없네. 마을 쉼터에서 쉬게.'] };
const flat = (p) => p ? p.guide.map((x) => (x && x.k != null) ? `[${x.k}]` : x).join('') : '';

const { ctx: C } = load(SRC, { nextStep: true });
// ★제품에 함수가 없으면(고치기 전 글자) 죽지 않고 빨갛게 센다 — 러너가 크래시를 실패로 세지만, 몇 줄이 빨간지 보이게
const HAS = typeof C.onbNextPlan === 'function';
const plan = (I) => (HAS ? C.onbNextPlan(I) : undefined);
const run = (c, code) => { try { return vm.runInContext(code, c); } catch (e) { return { __err: String(e && e.message || e) }; } };
ok(HAS && typeof C.onbNextRender === 'function', '제품 글자에 「지금 할 일」 고르기 · 그리기 함수가 있다(onbNextPlan · onbNextRender)');
sec('① 단계 — 서버가 보낸 것에서만 고른다');
try {
  ok(plan(I0({ state: null })) === null && plan(I0({ state: Object.assign({}, ST0, { vid: null }) })) === null, '대본 상태가 없거나 시작 마을이 없으면 칸이 없다');
  const e = plan(I0());
  ok(e && e.stage === 'enter' && e.item === '마을로 들어가기' && e.target && e.target.x === HOME.x && e.target.y === HOME.y,
    '★도착 — "마을로 들어가기" · 목표 = 시작 마을 중심(절대)', JSON.stringify(e && [e.stage, e.item, e.target]));
  ok(e && /광산1 마을이 화살표 쪽에 있습니다/.test(flat(e)) && /\[WASD\] 키로 걸어 들어가면 촌장이 맞아 줍니다/.test(flat(e)), '도착 — 마을 이름 · 걷는 키 · 다음에 일어날 일', flat(e));
  ok(e && e.place === '광산1 마을 밖', '자리 — 빈터 구역(도착 둘레) 밖 · 게이트 밖이면 "마을 밖"', e && e.place);
  const eArr = plan(I0({ me: { x: LOT.x + OFF.x + 10, y: LOT.y + OFF.y } }));
  ok(eArr && eArr.place === '광산1 나루터', '자리 — 도착 둘레(서버 lot.r 안) · 물가 도착이면 "나루터"', eArr && eArr.place);
  const eRoad = plan(I0({ arrive: Object.assign({}, ARR, { kind: 'road' }), me: { x: LOT.x + OFF.x, y: LOT.y + OFF.y } }));
  ok(eRoad && eRoad.place === '광산1 어귀', '자리 — 길목 도착이면 "어귀"', eRoad && eRoad.place);
  const w = plan(I0({ nearVid: 1 }));
  ok(w && w.stage === 'wait' && w.target === null && w.place === '광산1 마을 안', '★게이트 안 · 인사 전 — "촌장 이야기 듣기" · 화살 없음 · "마을 안"', JSON.stringify(w && [w.stage, w.place, w.target]));
  const q = plan(I0({ greet: GREETQ }));
  ok(q && q.stage === 'quest' && q.item === '나무 2개 구해 오기' && q.target && q.target.x === HOME.x, '★인사 받음 · 의뢰 — 품목 우리말 · 남은 양(서버 remain) · 목표 = 그 마을 중심', JSON.stringify(q && [q.item, q.target]));
  ok(q && /촌장이 “해 뜨는 쪽 강가로 가 보게\.” 하고 일렀습니다/.test(flat(q)) && /\[Shift N\] 키로 납품하십시오/.test(flat(q)), '의뢰 — 촌장이 가리킨 곳(셋째 줄 그대로) · 납품 키', flat(q));
  const qIn = plan(I0({ greet: GREETQ, nearVid: 1 }));
  ok(qIn && qIn.stage === 'quest' && qIn.target === null, '의뢰 · 그 마을 게이트 안 — 화살 없음(닿았다)');
  const qOther = plan(I0({ greet: Object.assign({}, GREETQ, { vid: 2 }) }));
  ok(qOther && qOther.target && qOther.target.x === OTHER.x, '다른 마을 촌장의 의뢰 — 목표는 그 마을(인사한 마을)', JSON.stringify(qOther && qOther.target));
  const qNoLine = plan(I0({ greet: Object.assign({}, GREETQ, { lines: GREETQ.lines.slice(0, 2) }) }));
  ok(qNoLine && !/일렀습니다/.test(flat(qNoLine)) && /납품하십시오/.test(flat(qNoLine)), '촌장 셋째 줄이 없으면 그 문장을 빼고 남은 말은 그대로');
  const r = plan(I0({ greet: GREET0, nearVid: 1 }));
  ok(r && r.stage === 'rest' && r.item === '쉬어 가기' && r.target === null && /촌장이 “지금은 급한 일이 없네\. 마을 쉼터에서 쉬게\.” 하고 일렀습니다/.test(flat(r)) && /\[Shift G\]/.test(flat(r)), '★인사 받음 · 빈 판 — "쉬어 가기" · 촌장 말(둘째 줄) 그대로 · 게시판 키 · 화살 없음(쉼터 자리는 클라가 모른다)', flat(r));
  const r2 = plan(I0({ greet: Object.assign({}, GREET0, { lines: ['낯선 얼굴이군.', '지금은 급한 일이 없네. 모닥불 곁에서 쉬게.'] }) }));
  ok(r2 && /모닥불 곁에서 쉬게/.test(flat(r2)) && !/쉼터/.test(flat(r2)), '빈 판 · 쉼터 없는 마을 — 촌장이 "모닥불"이라 했으면 칸도 모닥불(쉼터를 지어내지 않는다)', flat(r2));
  const r3 = plan(I0({ greet: Object.assign({}, GREET0, { lines: [] }) }));
  ok(r3 && r3.stage === 'rest' && /지금은 마을에 급한 일이 없다고 합니다/.test(flat(r3)), '촌장 말 줄이 없으면 뜻만 하십시오체로', flat(r3));
  const m = plan(I0({ state: Object.assign({}, ST0, { firstDone: true, contrib: 1 }), greet: GREETQ }));
  ok(m && m.stage === 'more' && /의뢰를 2번 더 하면 촌장이 빈터를 내어 줍니다/.test(flat(m)) && m.target && m.target.x === HOME.x, '★첫 납품 뒤 — 남은 수 = 서버 need − contrib · 목표 = 시작 마을', flat(m));
  const mIn = plan(I0({ state: Object.assign({}, ST0, { firstDone: true, contrib: 1 }), nearVid: 1 }));
  ok(mIn && mIn.stage === 'more' && mIn.target === null, '첫 납품 뒤 · 게이트 안 — 화살 없음');
  const L = plan(I0({ state: Object.assign({}, ST0, { firstDone: true, contrib: 3, lotOk: true }) }));
  ok(L && L.stage === 'lot' && L.target && L.target.x === LOT.x + OFF.x && L.target.y === LOT.y + OFF.y && L.target.r === LOT.r, '★빈터 권리 · 빈터 밖 — "빈터로 가기" · 목표 = 서버 lot + 존 오프셋', JSON.stringify(L && L.target));
  const B = plan(I0({ state: Object.assign({}, ST0, { firstDone: true, contrib: 3, lotOk: true }), me: { x: LOT.x + OFF.x + 100, y: LOT.y + OFF.y - 100 } }));
  ok(B && B.stage === 'build' && B.target === null && /\[C\] 키로 땅을 걸고/.test(flat(B)) && /\[Shift B\]/.test(flat(B)), '★빈터 안(서버 lot.r) — "내 집 짓기" · 땅 걸기 키 · 건축 판 키', flat(B));
  // 차례 — 빈터 > 첫 납품 > 인사 > 게이트 > 도착
  const all = plan(I0({ state: Object.assign({}, ST0, { firstDone: true, contrib: 3, lotOk: true }), greet: GREETQ, nearVid: 1 }));
  ok(all && all.stage === 'lot', '차례 — 빈터 권리가 다른 모든 것보다 앞이다', all && all.stage);
  const fd = plan(I0({ state: Object.assign({}, ST0, { firstDone: true, contrib: 1 }), greet: GREET0, nearVid: 1 }));
  ok(fd && fd.stage === 'more', '차례 — 첫 납품 뒤면 인사 · 게이트보다 앞', fd && fd.stage);
} catch (e) { ok(false, '① 절이 끝까지 못 돌았다(예외)', String(e && e.message || e).slice(0, 120)); }

sec('② 말투 — 할 일 명사형 · 설명 하십시오체 · 기호 나열 0(지시_T1069)');
try {
  const cases = [I0(), I0({ nearVid: 1 }), I0({ greet: GREETQ }), I0({ greet: GREET0, nearVid: 1 }),
    I0({ state: Object.assign({}, ST0, { firstDone: true, contrib: 1 }) }),
    I0({ state: Object.assign({}, ST0, { firstDone: true, contrib: 3, lotOk: true }) }),
    I0({ state: Object.assign({}, ST0, { firstDone: true, contrib: 3, lotOk: true }), me: { x: LOT.x + OFF.x, y: LOT.y + OFF.y } })].map(plan);
  const EMO = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  const items = cases.map((p) => p.item), guides = cases.map((p) => p.guide.filter((x) => typeof x === 'string').join('')
    .replace(/“[^”]*”/g, ''));   // 촌장 말 따옴표 안(하게체 대사)은 촌장 말투 그대로 — 설명 말투 검사에서 뺀다
  ok(cases.length === 7 && new Set(cases.map((p) => p.stage)).size === 7, '일곱 단계가 다 섰다', cases.map((p) => p.stage).join(' '));
  ok(items.every((t) => !/다\.$|요$/.test(t) && /(기|하기)$/.test(t)), '할 일은 명사형(…기)', JSON.stringify(items));
  ok(guides.every((t) => /(니다|십시오)\.\s*$/.test(t.trim()) && !/요\.|요$/.test(t)), '설명은 하십시오체(…니다 · …십시오) · 해요체 0', JSON.stringify(guides.map((t) => t.trim().slice(-8))));
  const allTxt = items.join('|') + '|' + cases.map(flat).join('|');
  ok(!/[·→←↑↓()!！]/.test(allTxt.replace(/“[^”]*”/g, '')), '가운뎃점 · 화살표 · 괄호 · 느낌표 0', (allTxt.match(/[·→←↑↓()!！]/g) || []).join(''));
  ok(!EMO.test(allTxt), '이모지 0');
  ok(cases.every((p) => p.guide.every((x, i) => !(x && x.k != null) || /^ 키로|^ 에서/.test(String(p.guide[i + 1] || '')))), '단축키 뒤 조사는 "키로"(또는 "에서") — 키 이름의 받침을 안 가린다');
} catch (e) { ok(false, '② 절이 끝까지 못 돌았다(예외)', String(e && e.message || e).slice(0, 120)); }

sec('③ 새 수 0 — 문구의 수는 서버 값에서만');
try {
  const body = SRC.slice(SRC.indexOf('function onbNextPlan('), SRC.indexOf('function onbNextInputs('));
  const nums = [...body.replace(/\/\/[^\n]*/g, '').matchAll(/(?<![\w$.])(\d+(?:\.\d+)?)(?![\w$])/g)].map((m) => m[1]);
  ok(body.length > 0 && nums.every((n) => n === '0' || n === '1' || n === '2'), '고르기 함수 몸의 수 글자 = 0 · 1 · 2(촌장 말 줄 자리)뿐 — 반경 · 문턱 · 거리 상수 0', JSON.stringify([...new Set(nums)]));
  const p1 = plan(I0({ greet: Object.assign({}, GREETQ, { quest: Object.assign({}, GREETQ.quest, { remain: 7 }) }) }));
  const p2 = plan(I0({ state: Object.assign({}, ST0, { firstDone: true, contrib: 2, need: 5 }) }));
  ok(p1.item === '나무 7개 구해 오기' && /의뢰를 3번 더/.test(flat(p2)), '의뢰 양 · 남은 수는 입력을 따라간다(서버 remain · need − contrib)', `${p1.item} · ${flat(p2).slice(0, 12)}`);
  const pOut = plan(I0({ state: Object.assign({}, ST0, { lotOk: true, firstDone: true, lot: { x: LOT.x, y: LOT.y, r: 50 } }), me: { x: LOT.x + OFF.x + 60, y: LOT.y + OFF.y } }));
  const pIn = plan(I0({ state: Object.assign({}, ST0, { lotOk: true, firstDone: true, lot: { x: LOT.x, y: LOT.y, r: 70 } }), me: { x: LOT.x + OFF.x + 60, y: LOT.y + OFF.y } }));
  ok(pOut.stage === 'lot' && pIn.stage === 'build', '빈터 닿음은 서버 lot.r 하나로 판다(반경을 바꾸면 답이 바뀐다)');
} catch (e) { ok(false, '③ 절이 끝까지 못 돌았다(예외)', String(e && e.message || e).slice(0, 120)); }

sec('④ 손잡이 · 그리기 — 끔이면 칸 0 · 켬이면 칸 하나');
try {
  const off = load(SRC, {});
  const r0 = run(off.ctx, 'onbNextRender()');
  ok(r0 === null && !off.D.byId.has('onbNext'), '★끔(welcome 에 nextStep 없음) — 칸을 만들지 않는다(종전 화면)');
  const on = load(SRC, { nextStep: true });
  const c = on.ctx;
  c.conns.set('hanbando', { meta: { worldOffsetX: OFF.x, worldOffsetY: OFF.y }, simVillages: [] });
  c._evVillageAnchorAbs = (vid) => { const a = anchor(vid); return a ? { x: a.x, y: a.y, v: { name: a.name } } : null; };
  vm.runInContext(`onbState = ${JSON.stringify(ST0)}; onbArrive = ${JSON.stringify(ARR)};`, c);
  c.myAbsPredicted = { x: OFF.x + 64000, y: 64000 };
  run(c, 'onbNextRender()');
  const el = on.D.byId.get('onbNext');
  ok(!!el && !el.classList.contains('hidden') && el.dataset.stage === 'enter', '★켬 — 칸 하나가 선다(도착 단계)', el && el.dataset.stage);
  ok(on.D.byId.get('onbNextItem').textContent === '마을로 들어가기' && /<span class="key">WASD<\/span>/.test(on.D.byId.get('onbNextGuide').innerHTML), '글자 · 단축키 칸', on.D.byId.get('onbNextGuide').innerHTML.slice(0, 60));
  ok(el.style.top === '250px' && el.style.right === '12px' && el.style.width === '342px', '자리 — 지도 판 바로 밑 · 지도 판의 폭(조각에 수 0)', JSON.stringify(el.style));
  {   // 무들 칩 기둥이 지도 판보다 길어지면 그 밑으로 — 칩을 덮지도 칩에 덮이지도 않는다
    const mo = on.D.doc.createElement('div'); mo.id = 'moodles'; on.D.byId.set('moodles', mo);
    mo.children = [1, 2, 3, 4, 5];
    mo.getBoundingClientRect = () => ({ left: 1325, right: 1428, top: 96, bottom: 281, width: 103, height: 185 });
    run(c, 'onbNextRender()');
    const tLong = el.style.top;
    mo.children = [1, 2];
    mo.getBoundingClientRect = () => ({ left: 1325, right: 1428, top: 96, bottom: 170, width: 103, height: 74 });
    run(c, 'onbNextRender()');
    const tShort = el.style.top;
    mo.children = [];
    run(c, 'onbNextRender()');
    ok(tLong === '281px' && tShort === '250px' && el.style.top === '250px', '무들 칩이 지도 판 밑으로 길어지면 그 밑 · 짧으면 지도 판 밑', JSON.stringify([tLong, tShort, el.style.top]));
  }
  const ar = on.D.byId.get('onbNextArrow');
  const me = c.myAbsPredicted, a = c.window.__w2s(HOME.x, HOME.y), b = c.window.__w2s(me.x, me.y);
  const want = Math.atan2(a.py - b.py, a.px - b.px);
  const got = c.window.__t1064Next ? null : vm.runInContext('onbNextLast', c);
  ok(!ar.classList.contains('hidden') && /data-i="arrowR"/.test(ar.innerHTML) && got && Math.abs(got.angle - want) < 1e-9, '화살 — 선 아이콘 하나(arrowR) · 화면에서 목표 쪽 각', got && got.angle.toFixed(3));
  vm.runInContext(`evNearVid = 1;`, c);
  run(c, 'onbNextRender()');
  ok(on.D.byId.get('onbNextArrow').classList.contains('hidden') && el.dataset.stage === 'wait', '게이트 안 — 화살이 숨는다 · 단계가 넘어간다', el.dataset.stage);
  vm.runInContext(`onbOnMessage({ type: 'onboarding_quest', kind: 'greet', vid: 1, name: '광산1', quest: ${JSON.stringify(GREETQ.quest)}, lines: ${JSON.stringify(GREETQ.lines)} })`,
    Object.assign(c, { showNotice: () => {}, speechBubbles: new Map(), villageBubbles: new Map(), performance: { now: () => 0 }, updateHud: () => {}, needsRedraw: false }));
  run(c, 'onbNextRender()');
  ok(el.dataset.stage === 'quest' && on.D.byId.get('onbNextItem').textContent === '나무 2개 구해 오기', '★인사 한 통(서버 메시지 그대로)이 들어오면 의뢰 단계', on.D.byId.get('onbNextItem').textContent);
  c.document.getElementById('game').classList.add('hidden');
  run(c, 'onbNextRender()');
  ok(el.classList.contains('hidden'), '게임 화면이 아니면(로비) 칸을 숨긴다');
  c.uiCfg.nextStep = false;
  c.document.getElementById('game').classList.remove('hidden');
  run(c, 'onbNextRender()');
  ok(el.classList.contains('hidden'), '손잡이를 끄면 숨는다');
} catch (e) { ok(false, '④ 절이 끝까지 못 돌았다(예외)', String(e && e.message || e).slice(0, 120)); }

sec('⑤ 먹선 · 정본 — CSS 는 토큰만 · 조각 색 리터럴 0 · 서버 손잡이 한 줄');
{
  const css = rd('public/style.css');
  const i0 = css.indexOf('#onbNext {'), i1 = css.indexOf('.onb-next-guide .key');
  const block = i0 >= 0 && i1 > i0 ? css.slice(i0, css.indexOf('\n', i1)) : '';
  ok(block.length > 0 && !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(block) && /var\(--pane\)/.test(block) && /var\(--accent\)/.test(block), 'CSS — 색은 토큰(var(--…))만 · 강조는 화살 하나(--accent)', (block.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || []).join(','));
  ok(/pointer-events: none/.test(block) && !/border-radius: [1-9]|box-shadow/.test(block), '눌림을 안 먹는다 · 모서리 · 그림자 0');
  const js = SRC.slice(SRC.indexOf('// ══ ★★[T1064'), SRC.indexOf('// 하네스 훅 — **읽기 전용만**'));
  ok(js.length > 0 && !/#[0-9a-fA-F]{3,6}\b(?![\w-])|rgba?\(/.test(js.replace(/\/\/[^\n]*/g, '')), '조각 글자 — 색 리터럴 0');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(js.replace(/\/\/[^\n]*/g, '')), '조각 글자(주석 밖) — 이모지 0');
  const zn = rd('server/zone.js');
  ok(/\.\.\.\(process\.env\.T1064_NEXT_STEP !== '0' \? \{ nextStep: true \} : \{\}\)/.test(zn), '서버 손잡이 — `T1064_NEXT_STEP` 켬 기본 후보 · `=0` 이면 welcome 칸 없음');
  ok(/function onbNextOn\(\) \{ return !!\(typeof uiCfg !== 'undefined' && uiCfg && uiCfg\.nextStep === true\); \}/.test(SRC), '클라 손잡이 — welcome `uiCfg.nextStep === true` 일 때만');
}

sec('⑥ 돌연변이 — 고침의 뼈를 걷어 낸 글자면 위 판정이 빨갛다(자명 통과 금지)');
try {
  const M1 = SRC.replace('if (p.gate != null && near === p.gate) p.target = null;', '');
  const M2 = SRC.replace('if (s.lotOk) {', 'if (false) {');
  const c1 = load(M1, { nextStep: true }).ctx, c2 = load(M2, { nextStep: true }).ctx;
  ok(M1 !== SRC && M2 !== SRC, '돌연변이 글자를 세웠다(두 자리 다 제품 글자에 있다)');
  const a = c1.onbNextPlan(I0({ greet: GREETQ, nearVid: 1 })), b = c2.onbNextPlan(I0({ state: Object.assign({}, ST0, { firstDone: true, contrib: 3, lotOk: true }) }));
  ok(a && a.target !== null && b && b.stage !== 'lot', '돌연변이 — 게이트 안에도 화살이 남고(①의 "닿으면 화살 없음"이 잡는다) · 빈터 권리를 못 본다(①의 "빈터로 가기"가 잡는다)', JSON.stringify([a && !!a.target, b && b.stage]));
} catch (e) { ok(false, '⑥ 절이 끝까지 못 돌았다(예외)', String(e && e.message || e).slice(0, 120)); }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
