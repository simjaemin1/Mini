#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2   ← [T1383] 옛 미끼 표지 — 미끼 판정 줄에 바꾼 자리 수(뜻 그대로)
// === scripts/test-t1341-own-house.js — T1341 온보딩 다시: 스스로 집을 짓게 · 마을 의뢰는 갚음 없이 받아들임만 ====================
//
// ★왜 [★재민 11-16] "마을이 필요한 물건이 아니라 스스로 집을 지을 수 있도록 유도 · 마을이 정말 필요한 물건은 구해오면 받아들임 수치가
//   오르는 것뿐이고 보상 없음 · 집을 짓기 위한 물건도 그거로 사유지를 짓는 것 · 따로 보상은 없음."
//   종전: 첫 의뢰를 채우면 시세대로 갚는다(판에 따라 나무 1 → 돌 35 · T1291) · 첫 의뢰가 어귀 빈터를 내준다(T1086) · 의뢰 3건이면 빈터(K-2).
//   고침: 손잡이 `T1341_OWN_HOUSE`(끔 기본 · `=1` 켬 · 판정 재민).
//
// ★이 하네스가 재는 것 — **제품 파일 원문**을 그대로 올린다(서버 모듈 · 클라 70-lobby.js · 47-s-board.js 통째 · 실서버 0 · 몇 초):
//   ① 납품 갚음 0 — 정본 납품 함수(`events.deliverToVillage`) · 가방 변화 = 낸 것만 · 곳간은 받은 것만 늘고 갚을 품목은 그대로 · 돌려주는 칸 0
//   ② 게시판 · 촌장 말 — "갚" 0 · "구해다 주면 고맙겠 …" · 첫 의뢰 고르기에 갚음 칸 0
//   ③ 의뢰 완수 = 받아들임 +1 · 빈터 선물 0(첫 의뢰 · 의뢰 n건 · 공사 재료 셋 다) · 권함은 그대로 · 촌장 말에 밥 · 빈터 0 · 다음에 열리는 것
//   ④ 가입 · 빈터 예외의 뜻 — `/소속` 이 첫 의뢰로 앉힌다 · 빈터 예외 = 받아들여진 뒤(인정 구성원)만
//   ⑤ 상태 칸 `own` — 집터 값 · 인정 문턱 · 가까운 나무 · 바위(존이 넘긴 정본 손 그대로)
//   ⑥ 「지금 할 일」 — 재료 모으기(나무 → 바위) → 집터 잡기(단추) → 움집 짓기 → 의뢰(받아들임 n) · 방위 · 걸음 글 · 끔 = 종전 칸
//   ⑦ 게시판 판 — 갚을 것 칸 대신 "받아들임 +1"(끔 = 종전 줄)
//   ⑧ 존 — 클레임 문(영토 밖 = 누구나 · 영토 안 = 인정 구성원 · T1305 문 술어 그대로) · 재료 모자람 거절 글 · 납품 알림 · 손잡이 줄(글자로 잰다 · 실판은 e2e-t1341-own-house)
//   ⑨ 끔(자식 프로세스) — 종전 갚음 · 종전 말 · 빈터 선물 그대로(대조군)
//   ⑩ 미끼 — 갚음을 되살린 사본 · 첫 의뢰에 빈터를 선물하는 사본이면 위 판정이 빨갛다(자명 통과 금지)
//
// 실행: node scripts/test-t1341-own-house.js
'use strict';
const LB = require('./lib-bait');   // [T1383] 미끼 사본을 지으며 바꾼 자리를 센다
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다(PM land1082)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const KNOB = process.env.T1341_OWN_HOUSE === '1';
//   미끼 판 — 제품 파일 대신 미끼 사본을 올린다(자식 프로세스 · `T1341_BAIT_EVENTS` / `T1341_BAIT_ONB` = server/ 안의 사본 이름)
const EV_PATH = process.env.T1341_BAIT_EVENTS ? path.join(ROOT, 'server', process.env.T1341_BAIT_EVENTS) : path.join(ROOT, 'server', 'events');
const ONB_PATH = process.env.T1341_BAIT_ONB ? path.join(ROOT, 'server', process.env.T1341_BAIT_ONB) : path.join(ROOT, 'server', 'onboarding');

// ── 세계 한 벌(서버 쪽) ──────────────────────────────────────────────────────────
const ARR = {
  1: { vid: 1, name: '광산1', kind: 'dock', cx: 2063, cy: 2093, x: 2063 * 32 + 16, y: 2093 * 32 + 16, faceX: 1, faceY: 0, centerX: 2120 * 32 + 16, centerY: 2117 * 32 + 16 },
  2: { vid: 2, name: '어촌2', kind: 'road', cx: 1900, cy: 300, x: 1900 * 32 + 16, y: 300 * 32 + 16, faceX: 0, faceY: 1, centerX: 1910 * 32 + 16, centerY: 320 * 32 + 16 },
};
const VILS = { 1: { dbId: 1, name: '광산1' }, 2: { dbId: 2, name: '어촌2' } };
const DONE = { ok: true, done: true, req: { item: 'wood' } };
const COST = { wood: 3, stone: 2 };
const NEED = 12;
const TREE = { x: ARR[1].x + 960, y: ARR[1].y - 320 }, ROCK = { x: ARR[1].x - 448, y: ARR[1].y + 864 };

//   게시판 한 줄(장부 `board` 꼴) — 갚음 약속이 걸린 의뢰(거는 문은 그대로라 장부 안엔 약속 값이 있다)
const BOARD = [{ vid: 1, item: 'wood', qty: 4, filled: 0, remain: 4, rewItem: 'stone', rewQty: 35, day: 3 },
  { vid: 1, item: 'fish', qty: 2, filled: 0, remain: 1, rewItem: 'grain', rewQty: 3, day: 3 }];
const LEDGER = { board: (vid) => (vid === 1 ? BOARD.map((r) => Object.assign({}, r)) : []),
  deliverable: { toEcon: new Map([['stone', 'stone'], ['grain', 'grain'], ['wood', 'wood'], ['fish', 'fish']]) } };

function boot() {
  const Database = require('better-sqlite3');
  const Ev = require(EV_PATH);
  const Onb = require(ONB_PATH), M = require(path.join(ROOT, 'server', 'membership')), VK = require(path.join(ROOT, 'server', 'village-kin'));
  const SimV = { clientVillages: () => Object.values(VILS).map((v) => ({ id: v.dbId, name: v.name })), villageByDbId: (id) => VILS[id] || null, eventLedger: LEDGER };
  const sent = [];
  VK.init({ SimVillages: SimV, players: new Map(), send: () => {} });
  M.init({ SimVillages: SimV, ZONE_ID: 'lab', players: new Map(), gameDay: () => 7, send: (ws, m) => sent.push({ ws, m }), lotClaimed: () => false });
  //   ★존이 넘기는 손과 같은 꼴(`zone.js Onboarding.init` 의 T1341 줄) — 값은 이 세계 한 벌
  Onb.init({ db: new Database(':memory:'), gameDay: () => 7, send: (ws, m) => sent.push({ ws, m }), warm: false, SimVillages: SimV,
    Events: { koRes: (r) => ({ wood: '나무', fish: '물고기', stone: '돌', grain: '곡식' }[r] || r) }, foodItems: new Set(['grain', 'fish']),
    shelterOf: (vid) => (vid === 1 ? { x: ARR[1].centerX + 200, y: ARR[1].centerY - 200 } : null),
    offerJoin: (p, vid) => M.offerFirst(p, vid), joinOf: (p) => M.joinOf(p),
    nearRes: (k, x, y) => (k === 'chop' ? Object.assign({}, TREE, { id: 't1' }) : k === 'quarry' ? Object.assign({}, ROCK, { id: 'r1' }) : null),
    isRecognized: (p, vid) => M.isRecognized(p, vid), claimCost: COST, memberNeed: M.CFG.N_MEMBER });
  Onb.__probe.setArrivals(new Map(Object.entries(ARR).map(([k, v]) => [k | 0, v])));
  const mk = (id, start) => {
    const p = { playerId: id, pid: id, name: id, ws: { id }, x: ARR[1].x, y: ARR[1].y, inventory: {}, member: null, isNpc: false };
    if (start != null) { const s = Onb.stateOf(id); s.start_vid = start; s.arrived = 1; Onb.__probe.save(id, s); }
    return p;
  };
  let seen = 0;
  const take = (p) => { const out = sent.slice(seen).filter((x) => x.ws === p.ws).map((x) => x.m); seen = sent.length; return out; };
  const deliver = (p, vid, r) => { Onb.onDeliver(p, r || DONE, vid); M.onDeliver(p, r || DONE, vid); };
  return { Ev, Onb, M, VK, sent, mk, take, deliver };
}
//   정본 납품 함수를 장부 하나 · 곳간 하나로 부른다 — 갚음이 걸린 의뢰(나무 4 → 돌 35)에 나무 4를 낸다
function deliverOnce(Ev) {
  const req = { vid: 1, item: 'wood', qty: 4, filled: 0, rewItem: 'stone', rewQty: 35, day: 3 };
  const L = { stats: { reqRefused: 0 },
    claim: (vid, item, want) => { const take = Math.min(want, req.qty - req.filled); req.filled += take; return { ok: true, take, refused: want - take, rew: Math.round(req.rewQty * take / req.qty), rewItem: req.rewItem, done: req.filled >= req.qty, req }; },
    unclaim: (vid, item, take) => { req.filled -= take; },
    deliverable: { items: new Map([['wood', ['wood']]]), toEcon: new Map([['stone', 'stone']]) } };
  const vil = { econ: { storage: { wood: 10, stone: 80 } } };
  const inv = { wood: 6, stone: 0 };
  const deposit = (v, inventory, give) => { const taken = {}; for (const [it, n] of Object.entries(give)) { inventory[it] -= n; v.econ.storage[it] = (v.econ.storage[it] || 0) + n; taken[it] = n; } return { ok: true, taken, moved: give }; };
  const inv0 = Object.assign({}, inv), sto0 = Object.assign({}, vil.econ.storage);
  const r = Ev.deliverToVillage({ ledger: L, vil, vid: 1, inventory: inv, item: 'wood', want: 4, deposit });
  return { r, inv0, inv, sto0, sto: vil.econ.storage };
}

// ── 끔 / 미끼 — 자식 프로세스(손잡이는 모듈을 올릴 때 읽는다) ──────────────────────────────
if (process.env.T1341_CHILD) {
  const B = boot();
  const d = deliverOnce(B.Ev);
  const p = B.mk('c1', 1);
  B.deliver(p, 1);
  const o = B.take(p);
  const hook = o.find((m) => m.kind === 'hook');
  const g = B.Onb.greetLines(1, 'c1', null);
  const q = B.Onb.pickFirstQuest(1);
  const out = { knob: !!B.Ev.T1341_OWN_HOUSE, onbKnob: !!B.Onb.T1341, rew: d.r.rew, invStone: d.inv.stone | 0, invWood: d.inv.wood | 0, stoStone: d.sto.stone, noRepay: !!d.r.noRepay,
    board: B.Ev.boardLine({ item: 'wood', qty: 4, filled: 0, rewItem: 'stone', rewQty: 35 }),
    lot: B.Onb.stateOf('c1').lot_ok | 0, vacant: B.Onb.vacantLotAllows(p, ARR[1].x, ARR[1].y), contrib: B.M.contribOf('c1'),
    hook: hook ? hook.lines : null, greet: g.lines, qRew: q && q.rewItem, qMeal: q && q.meal };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}
if (!KNOB) {   // 본판은 켬으로 다시 띄운다(손잡이는 모듈을 올릴 때 읽는다)
  try { execFileSync(process.execPath, [__filename].concat(process.argv.slice(2)), { stdio: 'inherit', env: Object.assign({}, process.env, { T1341_OWN_HOUSE: '1' }) }); process.exit(0); }
  catch (e) { process.exit(e.status || 1); }
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);
const B = boot();
const { Ev, Onb, M } = B;

sec('① 납품 갚음 0 — 정본 납품 함수(`events.deliverToVillage`)');
try {
  ok(Ev.T1341_OWN_HOUSE === true && Onb.T1341 === true, '손잡이 켬(이 판은 `T1341_OWN_HOUSE=1` 로 올렸다 · 기본 끔)');
  const d = deliverOnce(Ev);
  ok(d.r.ok && d.r.take === 4 && d.r.done === true, '[상황] 의뢰(나무 4 → 약속 돌 35)를 다 채웠다', JSON.stringify({ take: d.r.take, done: d.r.done }));
  ok(d.inv.wood === d.inv0.wood - 4 && (d.inv.stone | 0) === (d.inv0.stone | 0) && Object.keys(d.inv).every((k) => k === 'wood' || d.inv[k] === d.inv0[k]),
    '★가방 변화 = 낸 것만(나무 −4 · 돌 +0 · 다른 칸 무변)', JSON.stringify([d.inv0, d.inv]));
  ok(d.sto.wood === d.sto0.wood + 4 && d.sto.stone === d.sto0.stone, '★곳간 — 받은 나무만 +4 · 갚을 품목(돌)은 그대로(장부에 갚음 지출 0)', JSON.stringify([d.sto0, d.sto]));
  ok(d.r.rew === 0 && d.r.rewItem === null && d.r.rewRes === null && d.r.noRepay === true, '돌려주는 칸 — 갚음 0 · 품목 없음 · `noRepay`', JSON.stringify({ rew: d.r.rew, rewItem: d.r.rewItem }));
} catch (e) { ok(false, '① 예외: ' + (e && e.stack || e)); }

sec('② 게시판 · 촌장 말 — 갚는 말 0');
try {
  const bl = Ev.boardLine({ item: 'wood', qty: 4, filled: 1, rewItem: 'stone', rewQty: 35 });
  ok(bl === '나무 3개를 구해다 주면 고맙겠습니다.' && !/갚/.test(bl), '★게시판 한 줄 — "…구해다 주면 고맙겠습니다."(갚는 말 0)', bl);
  const q = Onb.pickFirstQuest(1);
  ok(!!q && q.item === 'wood' && q.rewItem === null && q.rewQty === 0 && q.rewPlayerItem === null && q.meal === false,
    '★첫 의뢰 — 가장 급한 것(잔여 비율) · 갚음 칸 0 · "밥으로 갚는 의뢰" 앞세우기 0', JSON.stringify(q));
  const g = Onb.greetLines(1, 'g1', null);
  ok(g.lines[1] === '요즘 나무가 달리네. 4만 구해다 주면 고맙겠네.' && !g.lines.some((l) => /갚/.test(l)), '★촌장 첫 마디 — "…구해다 주면 고맙겠네"(하게체 · "갚음세" 0)', g.lines[1]);
} catch (e) { ok(false, '② 예외: ' + (e && e.stack || e)); }

sec('③ 의뢰 완수 = 받아들임 +1 · 빈터 선물 0 · 권함은 그대로');
let pA = null;
try {
  pA = B.mk('a1', 1);
  ok(M.contribOf('a1') === 0 && !Onb.vacantLotAllows(pA, ARR[1].x, ARR[1].y) && pA._memberOfferVid == null, '[상황] 의뢰 전 — 받아들임 0 · 빈터 예외 없음 · 권함 없음');
  B.deliver(pA, 1);
  const o = B.take(pA);
  const hook = o.find((m) => m.type === 'onboarding_quest' && m.kind === 'hook');
  ok(M.contribOf('a1') === 1, '★받아들임 +1(계량기 하나 `contrib`)', M.contribOf('a1'));
  ok(Onb.stateOf('a1').lot_ok === 0 && !Onb.vacantLotAllows(pA, ARR[1].x, ARR[1].y) && !o.some((m) => m.kind === 'lot'), '★첫 의뢰가 빈터를 내주지 않는다(lot_ok 0 · 빈터 예외 0 · 빈터 한 통 0)');
  ok(!!hook && hook.lines[0] === Onb.T1341_THANKS && /쉼터/.test(hook.lines[1] || '') && hook.lines.indexOf(Onb.T1086_JOIN_LINE) === 2
    && hook.lines[3] === `부탁을 ${NEED - 1}건 더 채우면 우리 마을 영토 안에도 터를 잡게 해 줌세.` && hook.lines.length === 4,
    '★촌장 한 통 — 고맙다 · 쉼터 · 권함 · 다음에 열리는 것(인정 문턱에서 셈)', JSON.stringify(hook && hook.lines));
  ok(!!hook && !hook.lines.some((l) => /밥|빈터|갚/.test(l)), '밥 · 빈터 · 갚는 말 0', JSON.stringify(hook && hook.lines));
  ok(pA._memberOfferVid === 1 && pA._t1086Offer === 1, '권함 자리는 그대로(T1086 — 받아들임이 여는 첫 문)', JSON.stringify([pA._memberOfferVid, pA._t1086Offer]));
  const st = o.find((m) => m.type === 'onboarding_state');
  ok(!!st && st.state.contrib === 1 && st.state.need === NEED && st.state.lotOk === false && !!st.state.own, '대본 상태 한 통 — 받아들임 1 · 다음 문턱 = 인정(12) · own 칸', JSON.stringify(st && { c: st.state.contrib, need: st.state.need }));
  for (let i = 0; i < 3; i++) B.deliver(pA, 1);
  B.take(pA);
  ok(M.contribOf('a1') === 4 && Onb.stateOf('a1').lot_ok === 0, '★의뢰 4건 — 받아들임 4 · 종전 3건 빈터 문턱도 안 탄다(선물 0)', `${M.contribOf('a1')} · lot ${Onb.stateOf('a1').lot_ok}`);
  const pS = B.mk('s1', 1);
  for (let i = 0; i < 3; i++) Onb.onSiteGive(pS, true, 1);
  ok(M.contribOf('s1') === 3 && Onb.stateOf('s1').lot_ok === 0, '공사 재료 가져오기도 받아들임만(+1 × 3 · 빈터 0)', `${M.contribOf('s1')} · lot ${Onb.stateOf('s1').lot_ok}`);
  const half = B.mk('h1', 1);
  Onb.onDeliver(half, { ok: true, done: false, req: { item: 'wood' } }, 1);
  ok(M.contribOf('h1') === 0, '다 못 채운 납품은 받아들임 0(완수 1건 = +1)', M.contribOf('h1'));
} catch (e) { ok(false, '③ 예외: ' + (e && e.stack || e)); }

sec('④ 가입 · 빈터 예외의 뜻 — 받아들여진 뒤');
try {
  const p = B.mk('j1', 1);
  B.deliver(p, 1); B.take(p);
  ok(M.firstJoinChat(p, '/소속') === true && !!M.memberOf(p) && M.memberOf(p).vid === 1, '★`/소속` — 첫 의뢰를 채운 시작 마을이면 앉힌다(빈터 권리 없이)', JSON.stringify(M.memberOf(p)));
  const j = B.take(p).find((m) => m.kind === 'joined');
  ok(!!j && j.lines[0] === '오늘부터 자네는 우리 마을 사람일세.' && j.lines[1] === Onb._t1341LeftLine(1) && j.lines.length === 2 && !!j.state.own,
    '받아들인 말 — "오늘부터 …" + 다음에 열리는 것(빈터 줄 대신) · 상태에 own 칸', JSON.stringify(j && j.lines));
  ok(!Onb.vacantLotAllows(p, ARR[1].x, ARR[1].y), '마을 사람이어도 인정 전이면 빈터 예외 0');
  const pr = B.mk('r1', 1); pr.member = { zone: 'lab', vid: 1, name: '광산1', since: 1 };
  const s = Onb.stateOf('r1'); s.contrib = NEED; Onb.__probe.save('r1', s);
  ok(M.isRecognized(pr, 1) && Onb.vacantLotAllows(pr, ARR[1].x, ARR[1].y) && !Onb.vacantLotAllows(pr, ARR[1].x + 40 * 32, ARR[1].y), '★인정 구성원(받아들임 12 · 그 마을 사람)이면 어귀 빈터 예외 · 구역 밖은 0');
  const pn = B.mk('r2', 2); const s2 = Onb.stateOf('r2'); s2.contrib = NEED; Onb.__probe.save('r2', s2); pn.member = { zone: 'lab', vid: 1, name: '광산1', since: 1 };
  ok(!Onb.vacantLotAllows(pn, ARR[2].x, ARR[2].y), '시작 마을이 아닌 마을 사람이면 그 시작 마을 빈터 예외 0(시작 마을 · 그 마을 인정)');
} catch (e) { ok(false, '④ 예외: ' + (e && e.stack || e)); }

sec('⑤ 상태 칸 `own` — 존이 넘긴 정본 손 그대로');
try {
  const p = B.mk('o1', 1);
  Onb.handleMsg(p, { type: 'onboarding_state' });
  const m = B.take(p).find((x) => x.type === 'onboarding_state');
  const O = m && m.state && m.state.own;
  ok(!!O && O.cost.wood === 3 && O.cost.stone === 2 && O.need === NEED && O.recog === false, '★집터 값(존 `CLAIM_COST.personal`) · 인정 문턱 · 아직 인정 아님', JSON.stringify(O && { cost: O.cost, need: O.need }));
  ok(!!O && O.tree.x === Math.round(TREE.x) && O.tree.y === Math.round(TREE.y) && O.rock.x === Math.round(ROCK.x) && O.rock.y === Math.round(ROCK.y), '가까운 나무 · 바위 = 존이 정본 술어로 고른 자리 그대로(존 로컬)', JSON.stringify(O && [O.tree, O.rock]));
} catch (e) { ok(false, '⑤ 예외: ' + (e && e.stack || e)); }

// ── 클라 — 70-lobby.js · 47-s-board.js 원문 ─────────────────────────────────────────
function fakeDom() {
  const byId = new Map();
  const mk = (tag) => {
    const el = { tagName: tag.toUpperCase(), id: '', children: [], style: {}, dataset: {}, _cls: new Set(), _html: '', textContent: '',
      get className() { return [...this._cls].join(' '); }, set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
      classList: null, get firstChild() { return this._html ? {} : null; },
      appendChild(c) { this.children.push(c); if (c.id) byId.set(c.id, c); return c; }, addEventListener() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }) };
    el.classList = { add: (c) => el._cls.add(c), remove: (c) => el._cls.delete(c), contains: (c) => el._cls.has(c), toggle: () => {} };
    Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) {
      el._html = String(v);
      for (const mm of el._html.matchAll(/<(\w+) id="([^"]+)"(?: type="[^"]*")?(?: class="([^"]*)")?/g)) { const k = mk(mm[1]); k.id = mm[2]; if (mm[3]) k.className = mm[3]; byId.set(mm[2], k); }
    } });
    return el;
  };
  const doc = { getElementById: (id) => byId.get(id) || null, createElement: (t) => mk(t), body: null };
  doc.body = mk('body');
  return { doc, byId, mk };
}
const OFF = { x: 409984, y: 0 };
const HOME = { x: OFF.x + ARR[1].centerX, y: ARR[1].centerY, name: '광산1' };
const ARRC = { vid: 1, name: '광산1', kind: 'dock', x: ARR[1].x, y: ARR[1].y, centerX: ARR[1].centerX, centerY: ARR[1].centerY };
const OWN = { cost: COST, need: NEED, recog: false, tree: TREE, rock: ROCK };
const ST0 = { vid: 1, firstItem: null, firstDone: false, contrib: 0, need: NEED, lotOk: false, lot: { x: ARR[1].x, y: ARR[1].y, r: 320 }, day: { day: 1, deliv: 0, fish: 0 }, own: OWN };
const ME = { x: OFF.x + ARR[1].x, y: ARR[1].y };
function loadClient() {
  const D = fakeDom();
  const ctx = { console, Math, JSON, Map, Set, Array, Object, String, Number, isFinite, document: D.doc, innerWidth: 1440, innerHeight: 900,
    uiCfg: { nextStep: true, firstJoin: { cost: COST } }, window: {}, conns: new Map(), primaryZoneId: 'hanbando', evNearVid: null, myAbsPredicted: ME,
    inventory: { wood: 0, stone: 0 }, myPlayerId: 'u1', myUsername: 'u1', sendPrimary: () => {}, uiIcon: (n) => `<svg data-i="${n}"></svg>`, itemKo: (k) => k };
  vm.createContext(ctx);
  //   조사 정본(`vvJosa` — 52-v 조각 · 실클라에선 같은 전역)을 그 글자 그대로 올린다
  const jo = /function vvJosa\([\s\S]*?\n}\n/.exec(rd('public/client/52-v-village-view.js'));
  if (jo) vm.runInContext(jo[0], ctx, { filename: 'public/client/52-v-village-view.js#vvJosa' });
  vm.runInContext(rd('public/client/70-lobby.js'), ctx, { filename: 'public/client/70-lobby.js' });
  return ctx;
}
const DW = require(path.join(ROOT, 'public', 'dir-word.js')).dirWord;
const flat = (p) => p ? p.guide.map((x) => (x && x.k != null) ? `[${x.k}]` : x).join('') : '';
const Ib = (o) => Object.assign({ state: ST0, arrive: ARRC, greet: null, nearVid: null, me: ME, off: OFF, anchor: (v) => (v === 1 ? HOME : null),
  itemKo: (k) => k, join: { member: null, offer: null }, firstJoin: { cost: COST }, inv: { wood: 0, stone: 0 }, myLot: null, myClaim: null, myHome: false,
  words: DW, wordsCell: 32, wordsNear: 10 }, o || {});
sec('⑥ 「지금 할 일」 — 제 집 줄기(재료 → 집터 → 움집) → 의뢰(받아들임)');
let C = null;
try {
  C = loadClient();
  const plan = (I) => C.onbNextPlan(I);
  ok(typeof C.onbOwnPlan === 'function' && typeof C.onbMyClaim === 'function' && typeof C.onbMyHome === 'function', '제품 글자에 T1341 함수 셋(onbOwnPlan · onbMyClaim · onbMyHome)');
  const g0 = plan(Ib());
  const tAbs = { x: TREE.x + OFF.x, y: TREE.y + OFF.y };
  const steps = Math.round(Math.hypot(tAbs.x - ME.x, tAbs.y - ME.y) / 32);
  ok(g0 && g0.stage === 'gather' && g0.item === '집터 재료 모으기' && g0.target && g0.target.x === tAbs.x && g0.target.y === tAbs.y, '★도착 — "집터 재료 모으기" · 목표 = 서버가 준 가까운 나무 + 존 오프셋', JSON.stringify(g0 && g0.target));
  ok(/^나무는 .+?으로 \d+걸음입니다\. 집터를 잡으려면 나무 3개와 돌 2개가 있어야 합니다\. 지금 나무 0개와 돌 0개가 있습니다\. 나무 곁에서 \[E\] 키로 나무를 베십시오\.$/.test(flat(g0))
    && g0.where && g0.where.steps === steps && g0.where.dir === DW(tAbs.x - ME.x, tAbs.y - ME.y),
    '★글 — 방위 · 걸음(T1204 꼴 · 방위말 정본) · 무엇이 몇 개 · 지금 몇 개 · 어떻게', flat(g0));
  const g1 = plan(Ib({ inv: { wood: 3, stone: 1 } }));
  const rAbs = { x: ROCK.x + OFF.x, y: ROCK.y + OFF.y };
  ok(g1 && g1.stage === 'gather' && g1.target.x === rAbs.x && /^바위는 /.test(flat(g1)) && /지금 나무 3개와 돌 1개가 있습니다\. 바위 곁에서 \[E\] 키로 돌을 캐십시오\./.test(flat(g1)),
    '★나무가 차면 바위 쪽(돌이 모자란다)', flat(g1));
  const c0 = plan(Ib({ inv: { wood: 3, stone: 2 } }));
  ok(c0 && c0.stage === 'claim' && c0.item === '집터 잡기' && c0.btn === 'claim' && !c0.target && /영토 밖 빈 들에서 집터 잡기 단추를 누르거나 \[C\] 키로 선 자리에 터를 잡으십시오/.test(flat(c0)),
    '★재료가 되면 "집터 잡기" — 단추 · C 키 · 영토 밖 빈 들', flat(c0));
  const b0 = plan(Ib({ inv: { wood: 0, stone: 0 }, myClaim: { x: ME.x + 640, y: ME.y, inside: false } }));
  ok(b0 && b0.stage === 'build' && b0.item === '움집 짓기' && b0.target && b0.target.x === ME.x + 640 && /^내 터는 /.test(flat(b0)) && /\[Shift B\] 에서 움집 터파기를 고르십시오/.test(flat(b0)),
    '★터가 서면 "움집 짓기" — 터 쪽 글 · 건축 판(있는 건축 흐름)', flat(b0));
  const b1 = plan(Ib({ myClaim: { x: ME.x, y: ME.y, inside: true } }));
  ok(b1 && b1.stage === 'build' && b1.target === null, '제 터 안이면 목표 없음(닿았다)');
  const h0 = plan(Ib({ myClaim: { x: ME.x, y: ME.y, inside: true }, myHome: true, nearVid: null }));
  ok(h0 && h0.stage === 'enter', '★움집(터)이 서면 마을 줄기 — "마을로 들어가기"(촌장 · 의뢰)', h0 && h0.stage);
  const q0 = plan(Ib({ myHome: true, nearVid: 1, greet: { vid: 1, quest: { item: 'fish', remain: 1 }, lines: ['낯선 얼굴이군. 어디서 왔나.', '요즘 물고기가 달리네. 1만 구해다 주면 고맙겠네.', '동쪽 강가로 가 보게.'] } }));
  ok(q0 && q0.stage === 'quest' && !/갚/.test(flat(q0)), '의뢰 — 촌장 말 그대로(갚는 말 0)', flat(q0));
  const m0 = plan(Ib({ myHome: true, state: Object.assign({}, ST0, { firstDone: true, contrib: 1 }) }));
  ok(m0 && m0.stage === 'more' && m0.item === '마을 부탁 들어주기' && /^\S+ 마을은 .*걸음입니다\. 받아들임 1\. 부탁을 11건 더 채우면 구성원으로 인정되어 영토 안에도 집터를 잡을 수 있습니다\. 부탁을 들어주어도 갚는 것은 없습니다\./.test(flat(m0)) && !/빈터/.test(flat(m0)),
    '★의뢰 뒤 — "받아들임 n" · 다음에 열리는 것(인정 · 영토 안 집터) · 갚음 없음 · 빈터 말 0', flat(m0));
  const m1 = plan(Ib({ myHome: true, state: Object.assign({}, ST0, { firstDone: true, contrib: 12, own: Object.assign({}, OWN, { recog: true }) }) }));
  ok(m1 && m1.stage === 'more' && /받아들임 12\. 이 마을이 구성원으로 인정했습니다\. 영토 안에도 집터를 잡을 수 있습니다\./.test(flat(m1)), '인정 뒤 — 열린 것을 말한다', flat(m1));
  const j0 = plan(Ib({ join: { member: null, offer: 1 } }));
  ok(j0 && j0.stage === 'join', '권함이 걸리면 "마을 가입"이 먼저(T1086 그대로)', j0 && j0.stage);
  const st0 = Object.assign({}, ST0); delete st0.own;
  const off0 = plan(Ib({ state: st0 }));
  ok(off0 && off0.stage === 'enter' && !off0.btn, '끔(서버가 own 칸을 안 실음) — 종전 차례 그대로("마을로 들어가기")', off0 && off0.stage);
  // 받은 사유지 · 건물 읽기
  const zc = { meta: { worldOffsetX: OFF.x, worldOffsetY: 0 }, claims: new Map([['c1', { ownerPid: 'u1', kind: 'personal', x: ARR[1].x - 16, y: ARR[1].y - 16, w: 32, h: 32 }], ['c2', { ownerPid: 'x', kind: 'personal', x: 0, y: 0, w: 32, h: 32 }]]),
    buildings: new Map([['b1', { type: 'hut_site', data: { owner: 'u1' } }]]) };
  const mc = C.onbMyClaim(zc, OFF, ME);
  ok(!!mc && mc.inside === true && mc.x === ME.x && mc.y === ME.y, '내 개인 사유지(아무 데나) — 받은 사유지에서 읽는다(남의 것 0)', JSON.stringify(mc));
  ok(C.onbMyHome(zc) === true && C.onbMyHome({ buildings: new Map([['b2', { type: 'hut_site', data: { owner: 'x' } }]]) }) === false, '내 움집(터) — 받은 건물에서 읽는다(남의 것 0)');
  // HUD
  vm.runInContext(`onbState = ${JSON.stringify(Object.assign({}, ST0, { contrib: 3 }))};`, C);
  const hud = C.document.createElement('div'); hud.id = 'onbHud';
  C.document.getElementById = ((g) => (id) => (id === 'onbHud' ? hud : g(id)))(C.document.getElementById);
  vm.runInContext('onbHudLine()', C);
  ok(hud.textContent === '받아들임 3', 'HUD 한 줄 — "받아들임 n"(종전 "의뢰 n/3")', hud.textContent);
  // 이모지 0 — 이 줄기가 내는 글자 전부
  const all = [g0, g1, c0, b0, m0, m1].map(flat).join(' ');
  ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(all), '글에 이모지 0(먹선)');
} catch (e) { ok(false, '⑥ 예외: ' + (e && e.stack || e)); }

sec('⑦ 게시판 판 — 갚을 것 칸 대신 받아들임');
try {
  const ctx = { console, Math, JSON, Map, Set, Array, Object, String, Number, document: { getElementById: () => null }, window: {}, itemPic: (k) => `<i>${k}</i>`, itemKo: (k) => k };
  vm.createContext(ctx);
  vm.runInContext(rd('public/client/47-s-board.js'), ctx, { filename: 'public/client/47-s-board.js' });
  const on = ctx.boardRowHtml({ item: 'wood', remain: 3, filled: 1, qty: 4, rewItem: null, rewQty: 0, give: ['wood'] }, 0);
  const off = ctx.boardRowHtml({ item: 'wood', remain: 3, filled: 1, qty: 4, rewItem: 'stone', rewQty: 35, give: ['wood'] }, 0);
  ok(/<span class="bp-rew">받아들임 \+1<\/span>/.test(on) && !/stone/.test(on), '★켬(서버가 갚을 것 칸을 비움) — "받아들임 +1"', on.slice(0, 160));
  ok(/<span class="bp-rew"><i>stone<\/i> stone 35<\/span>/.test(off), '끔(갚을 것이 실려 옴) — 종전 줄 그대로', off.slice(0, 160));
  const src = rd('public/client/47-s-board.js');
  ok(/\$\{bd\.noRepay \? '받는 것' : '갚을 것'\}/.test(src), '머리 칸 — 켬이면 "받는 것"(서버 `noRepay`) · 끔이면 "갚을 것"');
} catch (e) { ok(false, '⑦ 예외: ' + (e && e.stack || e)); }

sec('⑧ 존 — 클레임 문 · 거절 글 · 납품 알림 · 게시판 비우기(글자)');
try {
  const z = rd('server/zone.js'), v = rd('server/villages.js');
  ok(/const _T1341_ON = !!require\('\.\/events'\)\.T1341_OWN_HOUSE;/.test(z), '존 손잡이 = events.js 한 자리(사본 0)');
  const gate = z.indexOf('if (_T1341_ON && kind === \'personal\' && !_t1305P) {');
  const HOUSE = String.fromCodePoint(0x1F3E0);   // 문 술어 글의 머리 그림 — 판정 자리에 그림 글자를 안 둔다(하네스 린트 ②)
  const gs = gate > 0 ? z.slice(gate, gate + 400) : '';
  //   ★[T1392] 문 한 벌이 `_claimGate`(종전 `tryClaim` 안 갈래를 옮긴 것 — 선 칸 = `px, py` · 거절 = 알림 몸을 돌려준다 · `tryClaim` 이 보낸다)로 옮겨 갔다
  const gfn = z.indexOf('function _claimGate('), cl = z.indexOf('{ const _gate = _claimGate(player, kind, cx + SZ / 2, cy + SZ / 2, _t1305P); if (_gate) { send(player.ws, Object.assign({ type: \'notice\' }, _gate)); return; } }');
  ok(gate > 0 && gfn > 0 && gate > gfn && cl > 0 && gs.includes('const _g = _t1305Gate(player, px, py);') && gs.includes(`return { text: String(_g.why).replace(/^${HOUSE} /, ''), kind: 'claim' };`),
    '★켬 — 개인 사유지 선포 문 = T1305 문 술어 하나(영토 밖 누구나 · 영토 안 인정 구성원) · 빈터 예외도 같은 문을 지난다 · 그림 글자 머리를 뗀다');
  ok(gate > 0 && gate < z.indexOf("if (kind === 'personal' && !_onbLot && VillageKin.ON) {"), '그 문이 종전 "내 마을 땅 안에만" 갈래보다 앞(켬이면 종전 갈래를 안 탄다)');
  ok(z.indexOf('if ((player.inventory.wood || 0) < cost.wood || (player.inventory.stone || 0) < cost.stone) {') > 0 && z.indexOf('`재료가 모자랍니다(나무 ${cost.wood}, 돌 ${cost.stone}).`') > 0,
    '재료가 모자라면 집터 거절 글(종전 그대로 · 문보다 앞)');
  ok(/if \(r\.noRepay\) send\(player\.ws, \{ type: 'notice', text: `\$\{r\.name\}에 \$\{gave\}을\(를\) 바쳤습니다\. \$\{r\.done \? '부탁을 다 채워 받아들임이 1 올랐습니다\.' : '부탁을 다 채우면 받아들임이 오릅니다\.'\}/.test(z),
    '납품 알림 — 켬이면 받아들임 한 마디 · 삯 0 · 이모지 0');
  ok(/if \(Events\.T1341_OWN_HOUSE\) for \(const r of rows\) \{ r\.rewItem = null; r\.rewQty = 0; r\.take = null; \}/.test(v), '게시판 — 켬이면 갚을 것 칸을 비운다(화면 · 마을 화면이 같은 줄을 읽는다)');
  ok(/nearRes: \(kind, x, y\) => _t1341NearRes\(kind, x, y\),/.test(z) && /if \(!r \|\| r\.type !== want \|\| !\(r\.hp > 0\) \|\| _t1065ResKind\(r\) !== kind\) continue;/.test(z), '가까운 나무 · 바위 = 자연물 동사 정본 술어 + 살아 있음');
  ok(!/T1341_OWN_HOUSE/.test(rd('server/trade.js')) && !/T1341/.test(rd('server/trade.js')), '교역(거래소 · 캐러밴) 무접촉 — trade.js 에 손잡이 0');
} catch (e) { ok(false, '⑧ 예외: ' + (e && e.stack || e)); }

const child = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1341_CHILD: '1' }, env), encoding: 'utf8' }));
sec('⑨ 끔(자식 프로세스) — 종전 그대로(대조군)');
try {
  const o = child({ T1341_OWN_HOUSE: '' });
  ok(o.knob === false && o.onbKnob === false, '손잡이 끔 기본(env 없음)');
  ok(o.rew === 35 && o.invStone === 35 && o.stoStone === 45 && o.noRepay === false, '★끔 — 시세대로 갚는다(나무 4 → 돌 35 · 곳간 돌 80 → 45)', JSON.stringify(o));
  ok(o.board === '나무 4개를 가져오면 돌 35개로 갚습니다.' && /갚음세/.test(o.greet[1] || ''), '끔 — 게시판 · 촌장 말 종전 그대로', `${o.board} · ${o.greet[1]}`);
  ok(o.lot === 1 && o.vacant === true && o.hook && o.hook[0] === '잘했네. 오늘은 밥이라도 들게.' && o.hook.indexOf('어귀 빈터에 자네 터를 잡게. 거기다 집을 올리게.') >= 0,
    '끔 — 첫 의뢰 = 빈터 + 밥(T1086 그대로)', JSON.stringify(o.hook));
  ok(o.qRew === 'grain' && o.qMeal === true, '끔 — 첫 의뢰는 먹을 것으로 갚는 것(§9.4 그대로)', JSON.stringify([o.qRew, o.qMeal]));
} catch (e) { ok(false, '⑨ 예외: ' + (e && e.stack || e)); }

sec('⑩ 미끼 — 갚음을 되살린 사본 · 첫 의뢰에 빈터를 선물하는 사본이면 빨갛다');
const baits = [];
try {
  const EV = rd('server/events.js'), ON = rd('server/onboarding.js');
  //   ⓐ 갚음 되살림 — 납품 함수의 켬 갈래(갚음 0)를 걷는다
  const BEV = LB.swap(EV, "  if (T1341_OWN_HOUSE) {\n    return { ok: true, take: c.take, refused: c.refused, taken: dep.taken, moved: dep.moved,\n      rew: 0, rewRes: null, rewItem: null, done: c.done, req: c.req, noRepay: true };\n  }\n", ''); const evBait = BEV.src;
  //   ⓑ 빈터 선물 — 첫 의뢰 빈터 문의 켬 막음을 걷는다
  const BON = LB.swap(ON, "const _fjLot = _fj && !s.lot_ok && !T1341;", 'const _fjLot = _fj && !s.lot_ok;'), onBait = BON.src;
  ok(evBait !== EV && onBait !== ON, '[상황] 미끼 사본 둘을 만들었다(제품 글자에서 그 줄만 걷음)');
  const fe = path.join(ROOT, 'server', `_t1341_bait_ev_${process.pid}.js`), fo = path.join(ROOT, 'server', `_t1341_bait_onb_${process.pid}.js`);
  fs.writeFileSync(fe, evBait); fs.writeFileSync(fo, onBait.replace("require('./events')", `require('./_t1341_bait_ev_${process.pid}')`));
  baits.push(fe, fo);
  const rb = child({ T1341_OWN_HOUSE: '1', T1341_BAIT_EVENTS: path.basename(fe) });
  const repayRed = !(rb.rew === 0 && rb.invStone === 0 && rb.stoStone === 80);   // ① 의 판정 그대로
  ok(BEV.n === 1 && repayRed, '★미끼 ⓐ 갚음을 되살린 사본 — ① 판정(가방 = 낸 것만 · 곳간 갚을 품목 그대로)이 빨갛다', `바꾼 자리 ${BEV.n} · ${JSON.stringify({ rew: rb.rew, invStone: rb.invStone, sto: rb.stoStone })}`);
  const lb = child({ T1341_OWN_HOUSE: '1', T1341_BAIT_ONB: path.basename(fo) });
  const giftRed = !(lb.lot === 0 && lb.vacant === false && lb.hook && !lb.hook.some((l) => /빈터/.test(l)));   // ③ 의 판정 그대로
  ok(BON.n === 1 && giftRed, '★미끼 ⓑ 첫 의뢰에 빈터를 선물하는 사본 — ③ 판정(빈터 0 · 빈터 말 0)이 빨갛다', `바꾼 자리 ${BON.n} · ${JSON.stringify({ lot: lb.lot, vacant: lb.vacant, hook: lb.hook })}`);
  const real = child({ T1341_OWN_HOUSE: '1' });
  ok(real.rew === 0 && real.invStone === 0 && real.stoStone === 80 && real.lot === 0 && real.vacant === false && !real.hook.some((l) => /빈터|밥/.test(l)), '제품 글자(켬)는 같은 판정이 초록(미끼만 빨강)', JSON.stringify({ rew: real.rew, lot: real.lot }));
} catch (e) { ok(false, '⑩ 예외: ' + (e && e.stack || e)); }
finally { for (const f of baits) { try { fs.unlinkSync(f); } catch (e) {} } }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
