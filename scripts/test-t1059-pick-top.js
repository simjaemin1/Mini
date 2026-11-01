#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1059-pick-top.js — T1059 겹친 사람 위 누름 → 그림에서 위에 그려진 사람 =================
//
// ★왜 [PM 판정 2026-11-01 = 제품 결함 · 보고/T1035 회부 1]
//   `pickAt`(public/client/46-h-verbs.js) 사람 층은 `others` 차례로 ±18 상자 안 **첫** 사람을 냈다 —
//   가장 가까운 사람도, 그림에서 위에 그려진 사람도 아니다. 사람이 겹친 자리에서 누른 사람과 다른 사람에게 말이 갔다.
//   고침(손잡이 `T1059_PICK_TOP` · welcome `uiCfg.pickTop` · 켬 기본 후보 · `=0` 종전):
//     상자(±18 · 명부 자리 — 종전 그대로) 안의 사람(남 · 나) 중 그 프레임 렌더 목록(`_lastPeopleDrawn`)의 정렬 키 `z` 가 가장 큰
//     (= 그리는 차례 마지막 = 위에 그려진) 사람 → `z` 가 같으면 누른 점에서 가장 가까운 사람. 안 그린 사람은 그린 사람 밑.
//
// ★이 하네스가 재는 것 — **제품 파일 원문**(46-h-verbs.js 통째)을 vm 에 올려 진짜 `pickAt` · 진짜 우클릭 처리(`bindVerbMenu`)를 부른다:
//   ① 고르기 규칙 — 켬 = 위에 그려진 사람 · 끔 = 첫 사람(종전) · 같은 z = 가까운 사람 · 나도 같은 규칙 · 안 그린 사람은 그린 사람 밑
//      (혼자면 종전처럼) · 상자는 명부 자리 그대로 · 낡은 그린 항목은 후보가 아니다 · 사람이 없으면 종전처럼 자연물 · 좌클릭 사슬 무변
//   ② 누름 — 가짜 캔버스에 mousedown(2) → auxclick(2) 를 쏘아 메뉴가 열리고, "말 걸기"를 누르면 **그 사람**(`_npcAsk`)에게 묻는다
//      · 켬 = 위 사람 · 끔 = 첫 사람 · T813 켬이면 **누른 순간**의 그린 목록 · 끔이면 뗄 때의 목록
//   ③ 정본 하나 — 렌더가 그린 사람만 목록에 싣고(안개 · 위층 · 시야 문 뒤) · 정렬 키가 곧 `z` · `pickAt` 은 `z` 를 다시 셈하지 않는다 · welcome 손잡이
// ★자명 통과 금지: 판마다 "두 사람이 다 상자 안 · 첫 사람 ≠ 위 사람 · 위 사람 ≠ 가까운 사람"을 먼저 세운다(아니면 그 판은 빨강).
//
// 실행: node scripts/test-t1059-pick-top.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);

// ── 세계 하나(존 하나 · 존 오프셋 있음) ─────────────────────────────────────────
const OX = 1000, OY = 2000;               // 존 원점(절대 px) — 명부 x·y 는 존 로컬이다
const C = { x: 5000, y: 6000 };           // 누르는 점(절대)
const HALF = 18;                          // 제품 `PICK_PLAYER_HALF` — 아래 ③ 에서 제품 글자와 같은지 잰다
const VID = 7;

const VERBS_SRC = rd('public/client/46-h-verbs.js');

function makeWorld(src) {
  const listeners = {};
  const ctx = {
    console, Math, Map, Set, Array, Object, JSON, Number, String, Date,
    conns: new Map(), downStates: new Map(), myPid: 'p-me', myAbsPredicted: { x: C.x + 400, y: C.y + 400 },
    uiCfg: {}, _lastPeopleDrawn: null, _lastCamIso: { x: 0, y: 0 },
    placementMode: null, buildMode: false, buildAction: null, inventory: {}, foodEffects: {}, plantSeeds: [],
    resourceVerbs: { tree: '벌목' }, resourceVerbsAlt: {}, treeFruitKo: {}, npcVerbs: { talk: '말 걸기', trade: '거래' },
    itemKo: (k) => k, showNotice: () => {}, openSide: () => {}, startBuildAction: () => {},
    sent: [], menus: [], camAt: [],
    perfNow: 0,
  };
  ctx.window = { __evNearVid: VID };
  ctx.performance = { now: () => ctx.perfNow };
  ctx.sendPrimary = (m) => ctx.sent.push(m);
  ctx.showContextMenu = (x, y, items) => ctx.menus.push({ x, y, items });
  // 화면 → 월드: 이 하네스의 화면은 절대 px 를 그대로 옮긴 판(캔버스 = css 크기) — 부른 원점은 적어 둔다(T813 대조)
  ctx.screenToWorldAbs = (px, py, camAt) => { ctx.camAt.push(camAt || null); return { wx: px, wy: py }; };
  ctx.canvas = {
    width: 100000, height: 100000,
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100000, height: 100000 }),
  };
  ctx.fire = (t, e) => { for (const f of (listeners[t] || [])) f(e); };
  ctx.zone = { meta: { worldOffsetX: OX, worldOffsetY: OY }, others: new Map(), resources: new Map(), groundItems: new Map(), buildings: new Map(), simVillages: [{ id: VID, name: '광산7' }] };
  ctx.conns.set('hanbando', ctx.zone);
  vm.createContext(ctx);
  vm.runInContext(src || VERBS_SRC, ctx, { filename: 'public/client/46-h-verbs.js' });
  vm.runInContext('bindVerbMenu();', ctx);
  return ctx;
}
// 명부에 사람을 넣는다(절대 자리 → 존 로컬) · 그린 목록 항목은 렌더가 싣는 꼴 그대로(wx·wy = 그린 자리 · z = 정렬 키)
const addNpc = (w, pid, ax, ay) => { w.zone.others.set(pid, { pid, x: ax - OX, y: ay - OY, npc: true, name: pid, tribeName: '광산7' }); };
const drawnOf = (pid, ax, ay, z, isMe) => ({ kind: 'player', pid, wx: ax, wy: ay, ax, ay, z, ...(isMe ? { isMe: true } : {}) });
const zKey = (ax, ay) => (ax + ay) * 0.5 + 500;   // 렌더(34-m-renderloop 사람 renderable)의 그 키 — 픽스처를 세울 때만 쓴다(③ 에서 제품 글자와 같은지 잰다)
const pick = (w, x, y, opts) => vm.runInContext(`pickAt(${x}, ${y}, ${JSON.stringify(opts || { live: true })})`, w);
const inBox = (ax, ay) => Math.abs(ax - C.x) <= HALF && Math.abs(ay - C.y) <= HALF;

// ── ① 고르기 규칙 ─────────────────────────────────────────────────────────────
sec('① 고르기 규칙 — 겹친 두 사람(첫 사람이 아래 · 가까운 사람이 아래)');
{
  // 첫 사람 P1(명부 차례 앞) = 누른 점에서 가깝고 아래에 그려졌다 · P2 = 멀고 위에 그려졌다(z 가 크다)
  const P1 = { x: C.x - 2, y: C.y - 2 }, P2 = { x: C.x + 10, y: C.y + 12 };
  const mk = (on) => {
    const w = makeWorld();
    if (on) w.uiCfg.pickTop = true;
    addNpc(w, 'p1', P1.x, P1.y); addNpc(w, 'p2', P2.x, P2.y);
    w._lastPeopleDrawn = [drawnOf('p1', P1.x, P1.y, zKey(P1.x, P1.y)), drawnOf('p2', P2.x, P2.y, zKey(P2.x, P2.y))]
      .sort((a, b) => a.z - b.z);
    return w;
  };
  const dz = zKey(P2.x, P2.y) - zKey(P1.x, P1.y);
  const d1 = Math.hypot(P1.x - C.x, P1.y - C.y), d2 = Math.hypot(P2.x - C.x, P2.y - C.y);
  ok(inBox(P1.x, P1.y) && inBox(P2.x, P2.y) && dz > 0 && d1 < d2,
     '전제 — 두 사람이 다 상자(±18) 안 · 첫 사람(p1)이 아래(z 작음) · 위 사람(p2)이 멀다 (아니면 아래 판은 자명 통과다)',
     `z 차 ${dz} · 거리 ${d1.toFixed(1)} < ${d2.toFixed(1)}`);
  const off = pick(mk(false), C.x, C.y), on = pick(mk(true), C.x, C.y);
  ok(off && off.kind === 'player' && off.id === 'p1', '★끔(`pickTop` 없음) — 종전 그대로 **상자 안 첫 사람**(p1)', JSON.stringify(off && [off.kind, off.id]));
  ok(on && on.kind === 'player' && on.id === 'p2', '★★켬 — **그림에서 위에 그려진 사람**(p2 · 가까운 p1 이 아니다)', JSON.stringify(on && [on.kind, on.id]));
  ok(on && on.absX === P2.x && on.absY === P2.y && on.obj && on.obj.pid === 'p2' && on.npc === true,
     '켬 — 돌려주는 대상은 **명부의 그 사람**(자리 · obj · npc — 동사 · 이름 · 쓰러짐은 명부가 정본)', JSON.stringify(on && [on.absX, on.absY, on.npc]));
  // 명부 차례를 뒤집어도 켬은 같은 사람이다(차례가 아니라 그림이 정한다)
  const w3 = makeWorld(); w3.uiCfg.pickTop = true;
  addNpc(w3, 'p2', P2.x, P2.y); addNpc(w3, 'p1', P1.x, P1.y);
  w3._lastPeopleDrawn = [drawnOf('p1', P1.x, P1.y, zKey(P1.x, P1.y)), drawnOf('p2', P2.x, P2.y, zKey(P2.x, P2.y))];
  ok(pick(w3, C.x, C.y).id === 'p2', '켬 — 명부 차례를 뒤집어도 같은 사람(p2)');
  // z 를 따른다 — 자리로 다시 셈하지 않는다(그린 목록의 z 를 뒤집으면 답도 뒤집힌다)
  const w4 = makeWorld(); w4.uiCfg.pickTop = true;
  addNpc(w4, 'p1', P1.x, P1.y); addNpc(w4, 'p2', P2.x, P2.y);
  w4._lastPeopleDrawn = [drawnOf('p2', P2.x, P2.y, 100), drawnOf('p1', P1.x, P1.y, 200)];
  ok(pick(w4, C.x, C.y).id === 'p1', '★켬 — 고르는 키는 **렌더의 z**(목록의 z 를 뒤집으면 p1) · 자리로 다시 셈하지 않는다');
}
sec('① z 가 같으면 누른 점에서 가장 가까운 사람');
{
  const A = { x: C.x + 12, y: C.y - 12 }, B = { x: C.x - 3, y: C.y + 3 };   // x + y 같다(같은 z) · B 가 가깝다
  const w = makeWorld(); w.uiCfg.pickTop = true;
  addNpc(w, 'pa', A.x, A.y); addNpc(w, 'pb', B.x, B.y);
  w._lastPeopleDrawn = [drawnOf('pa', A.x, A.y, zKey(A.x, A.y)), drawnOf('pb', B.x, B.y, zKey(B.x, B.y))];
  ok(zKey(A.x, A.y) === zKey(B.x, B.y) && inBox(A.x, A.y) && inBox(B.x, B.y), '전제 — 두 사람 z 같음 · 둘 다 상자 안 · 먼 사람이 명부 · 목록 앞');
  ok(pick(w, C.x, C.y).id === 'pb', '★켬 — 같은 z 면 **누른 점에서 가까운** 사람(pb)');
  const w2 = makeWorld();
  addNpc(w2, 'pa', A.x, A.y); addNpc(w2, 'pb', B.x, B.y);
  ok(pick(w2, C.x, C.y).id === 'pa', '끔 — 종전 첫 사람(pa)');
}
sec('① 나도 같은 규칙 — 그린 목록에 나도 있다');
{
  const P1 = { x: C.x - 2, y: C.y - 2 }, ME = { x: C.x + 6, y: C.y + 6 };
  const mk = (on) => {
    const w = makeWorld(); if (on) w.uiCfg.pickTop = true;
    w.myAbsPredicted = { x: ME.x, y: ME.y };
    addNpc(w, 'p1', P1.x, P1.y);
    w._lastPeopleDrawn = [drawnOf('p1', P1.x, P1.y, zKey(P1.x, P1.y)), drawnOf('p-me', ME.x, ME.y, zKey(ME.x, ME.y), true)];
    return w;
  };
  ok(inBox(ME.x, ME.y) && inBox(P1.x, P1.y) && zKey(ME.x, ME.y) > zKey(P1.x, P1.y), '전제 — 나와 p1 이 겹치고 내가 위에 그려졌다');
  const off = pick(mk(false), C.x, C.y), on = pick(mk(true), C.x, C.y);
  ok(off && off.kind === 'player' && off.id === 'p1', '끔 — 종전(남이 먼저 · 나는 상자에 남이 없을 때만)', JSON.stringify(off && [off.kind, off.id]));
  ok(on && on.kind === 'me' && on.id === 'p-me', '★켬 — **위에 그려진 나**(보이는 것 = 누른 것)', JSON.stringify(on && [on.kind, on.id]));
  // 내가 아래면 남이다
  const w = makeWorld(); w.uiCfg.pickTop = true; w.myAbsPredicted = { x: C.x - 6, y: C.y - 6 };
  addNpc(w, 'p2', C.x + 4, C.y + 4);
  w._lastPeopleDrawn = [drawnOf('p-me', C.x - 6, C.y - 6, zKey(C.x - 6, C.y - 6), true), drawnOf('p2', C.x + 4, C.y + 4, zKey(C.x + 4, C.y + 4))];
  ok(pick(w, C.x, C.y).id === 'p2', '켬 — 내가 아래에 그려졌으면 위의 남(p2)');
}
sec('① 안 그린 사람은 그린 사람 밑 · 상자는 명부 자리 그대로 · 낡은 그린 항목은 후보가 아니다');
{
  // 안 그린 사람 — 명부엔 있고 자리도 상자 안인데 그 프레임에 안 그렸다(시야 뒤 · 안개 · 지붕 밑 · 위층)
  //   ph(안 그림 · 명부 앞 · 가깝다) · pv(그림 · 멀다) — 켬이면 그린 pv 가 위다
  const H = { x: C.x + 1, y: C.y + 1 }, Vv = { x: C.x - 9, y: C.y - 9 };
  const mk = (on) => { const w = makeWorld(); if (on) w.uiCfg.pickTop = true; addNpc(w, 'ph', H.x, H.y); addNpc(w, 'pv', Vv.x, Vv.y);
    w._lastPeopleDrawn = [drawnOf('pv', Vv.x, Vv.y, zKey(Vv.x, Vv.y))]; return w; };
  ok(inBox(H.x, H.y) && inBox(Vv.x, Vv.y) && zKey(Vv.x, Vv.y) < zKey(H.x, H.y), '전제 — 둘 다 상자 안 · 안 그린 ph 가 명부 앞 · 자리로 치면 ph 가 아래쪽(z 큼)');
  const off = pick(mk(false), C.x, C.y), on = pick(mk(true), C.x, C.y);
  ok(off && off.id === 'ph', '끔 — 종전은 명부 첫 사람(안 그린 ph)', JSON.stringify(off && [off.kind, off.id]));
  ok(on && on.id === 'pv', '★켬 — **그린 사람(pv)이 안 그린 사람 위**(보이는 것 = 누른 것 · 자리로 다시 셈하지 않는다)', JSON.stringify(on && [on.kind, on.id]));
  // 혼자면 종전처럼 잡힌다(안 보이는 사람을 아예 빼는 것은 이 카드 밖 — 보고/T1059 회부)
  const w1 = makeWorld(); w1.uiCfg.pickTop = true; addNpc(w1, 'ph', H.x, H.y); w1._lastPeopleDrawn = [];
  ok(pick(w1, C.x, C.y).id === 'ph', '켬 — 안 그린 사람도 상자에 혼자면 종전처럼 잡힌다');
  // 상자는 명부 자리 — 그린 자리(보간)가 상자 안이어도 명부 자리가 밖이면 후보가 아니다(종전 상자 그대로)
  const M = { x: C.x + 30, y: C.y + 30 }, Md = { x: C.x + 5, y: C.y + 5 };
  ok(!inBox(M.x, M.y) && inBox(Md.x, Md.y), '전제 — 명부 자리는 상자 밖 · 그린 자리는 상자 안');
  for (const f of [false, true]) {
    const w = makeWorld(); if (f) w.uiCfg.pickTop = true; addNpc(w, 'pm', M.x, M.y);
    w._lastPeopleDrawn = [drawnOf('pm', Md.x, Md.y, zKey(Md.x, Md.y))];
    ok(pick(w, C.x, C.y).kind === 'ground', `${f ? '켬' : '끔'} — 상자는 명부 자리(종전 그대로 · 빈 땅)`);
  }
  // 낡은 그린 항목 — 그린 목록엔 있는데(위) 명부에서 빠졌다 → 후보가 아니다
  const w3 = makeWorld(); w3.uiCfg.pickTop = true;
  addNpc(w3, 'p1', C.x - 2, C.y - 2);
  w3._lastPeopleDrawn = [drawnOf('p1', C.x - 2, C.y - 2, zKey(C.x - 2, C.y - 2)), drawnOf('gone', C.x + 8, C.y + 8, zKey(C.x + 8, C.y + 8))];
  ok(pick(w3, C.x, C.y).id === 'p1', '켬 — 그린 뒤 떠난 사람(gone)은 후보가 아니다(명부의 p1)');
}
sec('① 다른 층 무변 — 사람이 없으면 자연물 · 좌클릭 사슬 · 첫 프레임 전');
{
  const mk = (on) => {
    const w = makeWorld(); if (on) w.uiCfg.pickTop = true;
    w.zone.resources.set('t1', { id: 't1', type: 'tree', x: C.x - OX + 3, y: C.y - OY + 3, r: 10, hp: 5, maxHp: 5 });
    w.zone.groundItems.set('g1', { id: 'g1', item: 'stone', x: C.x - OX, y: C.y - OY });
    addNpc(w, 'p1', C.x + 40, C.y + 40);   // 상자 밖 사람
    w._lastPeopleDrawn = [drawnOf('p1', C.x + 40, C.y + 40, zKey(C.x + 40, C.y + 40))];
    return w;
  };
  const on = pick(mk(true), C.x, C.y);
  ok(on && on.kind === 'nature' && on.id === 't1', '켬 — 상자 안에 사람이 없으면 종전처럼 **자연물**', JSON.stringify(on && [on.kind, on.id]));
  for (const f of [false, true]) {
    const l = pick(mk(f), C.x, C.y, {});   // 좌클릭(live 아님)
    ok(l && l.kind === 'item' && l.id === 'g1', `좌클릭 사슬(live 아님) 무변 — 바닥 물건(${f ? '켬' : '끔'})`, JSON.stringify(l && [l.kind, l.id]));
  }
  const w0 = makeWorld(); w0.uiCfg.pickTop = true; w0._lastPeopleDrawn = null;
  addNpc(w0, 'p1', C.x - 2, C.y - 2); addNpc(w0, 'p2', C.x + 10, C.y + 12);
  ok(pick(w0, C.x, C.y).id === 'p1', '켬 · 그린 목록 없음(첫 프레임 전) — 종전 그대로(첫 사람)');
}

// ── ② 누름 — 진짜 우클릭 처리(mousedown → auxclick) → 메뉴 → 말 걸기 → 그 사람에게 묻는다 ──
sec('② 누름 — 겹친 두 NPC 위 우클릭 탭 → 메뉴 → "말 걸기" → 묻는 사람');
const press = (w, frameAtDown, frameAtUp) => {
  w._lastPeopleDrawn = frameAtDown;
  w.perfNow = 1000;
  w.fire('mousedown', { button: 2, clientX: C.x, clientY: C.y });
  w._lastPeopleDrawn = frameAtUp;   // 누른 동안 한 프레임이 돌았다(사람이 움직였다)
  w.perfNow = 1080;                 // 80ms — 탭(문턱 400ms 안)
  w.fire('auxclick', { button: 2, clientX: C.x, clientY: C.y });
  const m = w.menus[w.menus.length - 1] || null;
  if (!m) return { menu: null, ask: null };
  const labels = m.items.map((i) => i.label);
  const talk = m.items.find((i) => i.label === '말 걸기');
  if (talk) talk.onClick();
  const ask = vm.runInContext(`npcAskTake(${VID})`, w);
  return { menu: labels, ask: ask ? ask.pid : null, brief: w.sent.filter((s) => s.type === 'village_brief').length };
};
{
  const P1 = { x: C.x - 2, y: C.y - 2 }, P2 = { x: C.x + 10, y: C.y + 12 };
  const F = [drawnOf('p1', P1.x, P1.y, zKey(P1.x, P1.y)), drawnOf('p2', P2.x, P2.y, zKey(P2.x, P2.y))];
  const mk = (cfg) => { const w = makeWorld(); Object.assign(w.uiCfg, cfg); addNpc(w, 'p1', P1.x, P1.y); addNpc(w, 'p2', P2.x, P2.y); return w; };
  const rOff = press(mk({ rmbPress: true }), F, F);
  const rOn = press(mk({ rmbPress: true, pickTop: true }), F, F);
  ok(!!rOff.menu && rOff.menu[0] === '말 걸기' && rOn.menu && rOn.menu[0] === '말 걸기' && rOn.brief === 1,
     '전제 — 두 판 다 **메뉴가 열렸고** 말 걸기가 서버로 갔다(아니면 아래가 자명하다)', JSON.stringify([rOff.menu, rOn.menu, rOn.brief]));
  ok(rOff.ask === 'p1', '★끔 — 누른 자리의 **첫 사람**(p1)에게 묻는다(종전 · 보고/T1035 의 그 결함)', String(rOff.ask));
  ok(rOn.ask === 'p2', '★★켬 — **위에 그려진 사람**(p2)에게 묻는다', String(rOn.ask));
  // 누른 순간 — 누른 동안 p1 이 앞으로 걸어 나와 위에 그려졌다(다음 프레임) · 화면에서 누른 것은 p2 였다
  const F2 = [drawnOf('p2', P2.x, P2.y, zKey(P2.x, P2.y)), drawnOf('p1', P1.x, P1.y, zKey(P2.x, P2.y) + 5)];
  const rPress = press(mk({ rmbPress: true, pickTop: true }), F, F2);
  const rRel = press(mk({ pickTop: true }), F, F2);
  ok(rPress.ask === 'p2', '★켬 · T813 켬 — **누른 순간**에 그려져 있던 그대로(p2 · 원점과 사람이 같은 프레임)', String(rPress.ask));
  ok(rRel.ask === 'p1', '켬 · T813 끔 — 뗄 때의 직전 프레임(p1 · 원점도 그 프레임 — 종전 T813 끔과 같은 뜻)', String(rRel.ask));
  const w = mk({ rmbPress: true, pickTop: true });
  w._lastCamIso = { x: 11, y: 22 };
  press(w, F, F);
  ok(w.camAt.length > 0 && w.camAt[w.camAt.length - 1] && w.camAt[w.camAt.length - 1].x === 11, 'T813 원점 붙잡기 무변(누른 순간의 원점을 그대로 넘긴다)');
}

// ── ②-b 돌연변이 — 고침을 걷어 낸 글자면 이 하네스가 빨갛다(자명 통과 금지) ─────────────────
sec('②-b 돌연변이 — 사람 층을 종전 고리로 되돌린 글자면 켬 판이 첫 사람을 낸다');
{
  const SWAP = [
    ['const p = _t1059PickPerson(wx, wy, _drawn);', 'const p = null;'],
    ['if (!_drawn) for (const c of conns.values()) {', 'for (const c of conns.values()) {'],
    ['if (!_drawn && Math.abs(myAbsPredicted.x - wx) <= PICK_PLAYER_HALF', 'if (Math.abs(myAbsPredicted.x - wx) <= PICK_PLAYER_HALF'],
  ];
  const seen = SWAP.map(([a]) => VERBS_SRC.split(a).length - 1);
  const MUT = SWAP.reduce((s, [a, b]) => s.split(a).join(b), VERBS_SRC);
  ok(seen.every((n) => n === 1), '돌연변이 글자를 세웠다(제품 글자에 세 자리가 하나씩 있고 다 바꿨다)', JSON.stringify(seen));
  const P1 = { x: C.x - 2, y: C.y - 2 }, P2 = { x: C.x + 10, y: C.y + 12 };
  const w = makeWorld(MUT); w.uiCfg.pickTop = true; w.uiCfg.rmbPress = true;
  addNpc(w, 'p1', P1.x, P1.y); addNpc(w, 'p2', P2.x, P2.y);
  const F = [drawnOf('p1', P1.x, P1.y, zKey(P1.x, P1.y)), drawnOf('p2', P2.x, P2.y, zKey(P2.x, P2.y))];
  w._lastPeopleDrawn = F;
  const r = pick(w, C.x, C.y), pr = press(w, F, F);
  ok(r && r.id === 'p1' && pr.ask === 'p1', '★돌연변이(종전 고리) — 켬이어도 첫 사람(p1) → 위 ①② 의 "p2" 판정이 이 결함을 잡는다', JSON.stringify([r && r.id, pr.ask]));
}

// ── ③ 정본 하나 — 렌더 · 고르기 · 손잡이 ─────────────────────────────────────
sec('③ 정본 하나 — 렌더가 그린 사람만 싣고 · 정렬 키 = z · 고르기는 z 를 읽기만');
{
  const rl = strip(rd('public/client/34-m-renderloop.js'));
  const vb = strip(VERBS_SRC);
  const cst = strip(rd('public/client/00-const.js'));
  const zn = rd('server/zone.js');
  ok(/let _lastPeopleDrawn = null;/.test(cst), '00-const — `_lastPeopleDrawn` 한 자리(최상위 let)');
  ok((rl.match(/_lastPeopleDrawn\s*=/g) || []).length === 1 && (vb.match(/_lastPeopleDrawn\s*=/g) || []).length === 0,
     '대입은 렌더 한 자리 · 고르기는 읽기만');
  // 사람 갈래에서 시야 문(`vis < 0.05`) 뒤 · 그리기 앞에 싣는다
  const br = rl.indexOf("} else if (item.kind === 'player') {");
  const seg = br >= 0 ? rl.slice(br, rl.indexOf("} else if (item.kind === 'building')", br)) : '';
  const iUp = seg.indexOf('pFloor > myFloor) continue'), iVis = seg.indexOf('if (vis < 0.05) continue'), iPush = seg.indexOf('_peopleNow.push(item)'), iDraw = seg.indexOf('ctx.globalAlpha = vis');
  ok(br >= 0 && iUp >= 0 && iVis > iUp && iPush > iVis && iDraw > iPush,
     '렌더 — 사람 갈래에서 위층 · 시야 문 **뒤**, 그리기 **앞**에 목록에 싣는다(안 그린 사람은 없다)', JSON.stringify([iUp, iVis, iPush, iDraw]));
  const iLoop = rl.indexOf('for (const item of renderables)'), iNew = rl.indexOf('const _peopleNow = []'), iSet = rl.indexOf('_lastPeopleDrawn = _peopleNow');
  ok(iNew >= 0 && iNew < iLoop && iSet > iPush + br, '렌더 — 프레임마다 새 목록 · 그리기 고리 **뒤**에 건다');
  ok(/renderables\.sort\(\(a, b\) => a\.z - b\.z\)/.test(rl), '렌더 — 그리는 차례 = `z` 오름차순(마지막 = 가장 큰 z = 위에 그려진)');
  ok(/kind: 'player', wx: ax, wy: ay, pid: o\.pid/.test(rl) && /kind: 'player', wx: _camAbs\.x, wy: _camAbs\.y, pid: myPid/.test(rl),
     '렌더 — 사람 항목은 그린 자리(`wx`·`wy`)와 pid 를 싣는다(남 · 나)');
  // 고르기 — z 를 다시 셈하지 않는다(렌더 키 사본 0) · 상자는 제품 반변 하나
  const fnS = vb.indexOf('function _t1059PickPerson'), fnE = vb.indexOf('function pickAt');
  const body = fnS >= 0 && fnE > fnS ? vb.slice(fnS, fnE) : '';
  ok(body.length > 0 && /r\.z/.test(body) && !/\*\s*0\.5/.test(body) && !/\+\s*500/.test(body), '고르기 — 키는 그린 목록의 `r.z`(렌더 식 사본 0)');
  ok(/PICK_PLAYER_HALF/.test(body) && /const PICK_PLAYER_HALF = 18;/.test(vb) && HALF === 18, '고르기 — 상자는 종전 `PICK_PLAYER_HALF`(18) 그대로 · 새 수 0');
  ok(/function t1059On\(\) \{ return !!\(typeof uiCfg !== 'undefined' && uiCfg && uiCfg\.pickTop === true\); \}/.test(vb), '클라 손잡이 — welcome `uiCfg.pickTop === true` 일 때만');
  ok(/\.\.\.\(process\.env\.T1059_PICK_TOP !== '0' \? \{ pickTop: true \} : \{\}\)/.test(zn), '서버 손잡이 — `T1059_PICK_TOP` 켬 기본 후보 · `=0` 이면 welcome 칸 없음(옛 welcome)');
  ok(/pickAt\(w\.wx, w\.wy, \{ live: true, drawn: _rmbPeople \}\)/.test(vb) && /_rmbPeople = t813On\(\) \? _lastPeopleDrawn : null;/.test(vb),
     '우클릭 — 누른 순간의 그린 목록(T813 켬) · 커서 이름표는 직전 프레임(같은 `pickAt`)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
