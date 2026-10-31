#!/usr/bin/env node
// @regress
// === scripts/test-moment-lot.js — T732: 로트 = 얻은 순간 · 모든 길에서 로트가 따라간다 (손잡이 T732_MOMENT_LOT · ★[T778] 켬 기본 — `=0` 이 끔 = 종전 바이트) ===
//
// ★왜 [T732 · 재민 10-12 · 10-14 재확인(족보 631 ①)] 신선도는 아이템마다다 — 같은 순간에 얻은 것만 합친다 · 곳간 포함.
//   종전 로트 열쇠는 **날**이었고(0시 것과 23시 것이 한 로트) · econ 곳간은 날짜 없는 총량이라 넣은 음식이 녹고 나온 음식은 '오늘 것'이었다
//   · 캐러밴 짐 · 전쟁 군량도 곳간에서 곳간으로 갈 때 나이를 버렸다(받는 쪽에서 '지금 얻은 것').
//   이 하네스는 세 층을 **정본 모듈 그대로** 잰다(서버 포트 0 — 존을 안 띄운다 · 시계는 하네스가 꽂는다):
//
//  ① 순간 열쇠 — 같은 순간만 합친다 · 옛 꼴(`{d,n}` · `{d,n,e,t,m,w}`)은 그 날 0시 순간으로 읽는다(지우지 않는다 · 정산 전후 절벽 0)
//  ② 상한 뭉개기 — 품목당 12 는 남긴다(몸 크기) · 뭉갤 때 **더 이른 순간 · 큰 노출**(싱싱해 보이는 일 0) · 센다
//  ③ 근사 셈 — 맞추기가 남는 몫을 '지금 얻은 것'으로 잡으면 센다 · 지목 소비는 맞춘 뒤 고른다
//  ④ NPC 곁 장부 — NPC 몸엔 `lots` 칸이 안 생긴다(몸 필드 0) · 장부는 몸 밖
//  ⑤ 곳간 장부 — 늘면 그 순간의 로트(마감 = 한 순간) · 줄면 오래된 것부터 · 옮김은 레코드째 · 견적 멈춤 · 실패 되돌림 · 사람의 문 · 새 칸 · 저장/복원
//  ⑥ 캐러밴 — 랩 econ v2(5마을 · 200일)에 훅을 꽂고 매일 불변식(장부 합 = 곳간) · 짐 레코드의 순간이 내릴 때 그대로
//  ⑦ 전쟁 군량 — 팩 싣기 · 환급(오래된 것부터 먹힌 꼬리) · 항복 공납(곳간 → 곳간 레코드째)
//  ⑧ 끔 — 손잡이 '1' 하나만 켬 · 끄면 시계를 안 꽂고 장부가 안 붙는다(아이 판)
//  ⑨ [T748] 켬 전용 일곱 길 — 어부 · 채집(손 · 짐) · 농부(손 · 고르게 대기) · 짐이 몸에 · 노획 운반 · 소굴 토벌 · 존 경계 캐러밴이
//     로트를 그대로 넘긴다(그 길의 손잡이를 켠 아이 판 · 운영 함수 그대로) · 끈 판과 곳간 값이 같다(장부는 관측자)
//  ⑩ [T748] 거래소 받기 — 열량 짝(꺼내기 · 게시판 보상과 같은 `kcal.itemsOf`) · 끔 = 종전 1개 = 1단위
//  ⑪ [T748] 배선 — 켬일 때만 닿는 줄(글자)
//
// 실행: node scripts/test-moment-lot.js
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 아이 판 — 끔/켬 손잡이만 본다 ══════════════════════════════════════════════════
if (process.env.T732_SUB === 'knob') {
  const Lots = require(SV('lots.js'));
  const GL = require(SV('granary-lots.js'));
  Lots.setClock(() => 5 * 1440000 + 1000, 1440000);   // 존이 하는 그 꽂기(끄면 lots 가 안 받는다)
  const p = { inventory: { berry: 2 } };
  Lots.note(p, 'berry', 2, 5);
  const v = { name: 'x', storage: { food: 3 } };
  const att = GL.attach(v, null, null);
  console.log(JSON.stringify({ on: Lots.T732_MOMENT, momentOn: Lots.momentOn(), lot: (p.lots && p.lots.berry && p.lots.berry[0]) || null, att, getter: !!(Object.getOwnPropertyDescriptor(v.storage, 'food') || {}).get }));
  process.exit(0);
}

// ══ 아이 판 — [T748] 켬 전용 일곱 길 · 거래소 받기(그 길의 손잡이를 켠 판 · 운영 함수 그대로 · 마지막 줄 = JSON) ══════════
//   부모(⑨)가 손잡이(`T732_MOMENT_LOT` 있음/없음 · 그 길의 손잡이)를 env 로 주고 `T748_PART` 하나를 돌린다. 끈 판도 같은 줄을 돌려
//   곳간 값이 같은지(장부는 관측자) 견준다 — 끄면 시계를 안 받고 장부가 안 붙으니 훅 줄이 전부 무동작이다.
if (process.env.T732_SUB === 't748') {
  const PART = process.env.T748_PART || '';
  const out = { part: PART };
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};   // 모듈 부팅 줄을 막는다(마지막 줄만 JSON)
  try {
    const Lots = require(SV('lots.js'));
    const GL = require(SV('granary-lots.js'));
    const E = require(path.join(ROOT, 'sim', 'economy-sim'));
    const DAY = 1440000, MIN = DAY / 1440;
    let NOW = 900 * DAY + 180 * MIN;
    Lots.setClock(() => NOW, DAY);   // 존이 하는 그 꽂기(끄면 lots 가 안 받는다)
    out.on = !!(GL.ON && Lots.momentOn());
    const dOf = () => Math.floor(NOW / DAY);
    const R6 = (x) => +(+x).toFixed(6);
    const recs = (a) => (a || []).map((r) => [r.k, R6(r.u)]);
    const led = (v, res) => recs(GL.ledger(v, res));
    const hand = (p, it) => Lots.of(p, it).map((l) => [l.k == null ? null : l.k, R6(l.n)]);
    const zero = (e) => { for (const k of Object.keys(e.storage)) e.storage[k] = 0; if (e.treasury) for (const k of Object.keys(e.treasury)) e.treasury[k] = 0; return e; };
    const mkE = (name) => zero(E.createVillage({ initialPop: 0, name, fertility: 1 }));
    const stor = (...vs) => JSON.stringify(vs.map((v) => Object.keys(v.storage).sort().map((k) => [k, R6(v.storage[k] || 0)])));
    const bagOf = (p) => { const B = GL.bagOf(p) || {}; const o = {}; for (const k of Object.keys(B)) if (B[k].length) o[k] = recs(B[k]); return o; };
    const mkV = (name) => ({ name, econ: { name, npcs: Array.from({ length: 10 }, (_, i) => ({ id: i })), counts: {}, storage: { food: 0 }, _warFatigue: 0 } });   // ⑦ 과 같은 꼴(곳간 한 칸)
    const V = () => require(SV('villages.js'));

    if (PART === 'fish') {   // ── T312 어부 귀환(손 → 곳간) ──
      const H = V().__p3Bind({});
      const F = require(SV('freshfish.js')), K = require(SV('kcal.js'));
      const ev = mkE('어촌'); Object.assign(ev, { _fishOutLast: 10, _t312InflowToday: 0, _t312Cells: 1 });   // 그날 수요(수요 문 켬 기본 — 다 받는 몫)
      out.att = GL.attach(ev, null, null);
      const vil = { name: '어촌', econ: ev };
      const sp = F.ids().find((id) => Lots.isLot(id)), np = F.ids().find((id) => !Lots.isLot(id));   // 로트 종 하나(잉어) · 로트 아닌 종 하나(표 밖 — 손에서 안 늙는다)
      const per = (id) => +K.econUnitsOf('fish', 1, F.kgOf(id)) || 0;
      const npc = { isNpc: true, inventory: {} };
      const k1 = NOW; npc.inventory[sp] = 2; Lots.note(npc, sp, 2, dOf(), 'carry', k1);   // 낚은 순간(곁 장부 — 존 낚시 줄이 하는 그 적기)
      NOW += 90 * MIN; const k2 = NOW; npc.inventory[sp] += 1; Lots.note(npc, sp, 1, dOf(), 'carry', k2);
      NOW += 60 * MIN;
      const u = R6(3 * per(sp)); npc._t312U = u;
      const s0 = ev.storage.fish || 0, nr0 = GL.stats().doorNoRec;
      const got = H._t312Deliver(vil, npc);
      const a = { u, got: R6(got), ds: R6((ev.storage.fish || 0) - s0), led: led(ev, 'fish'), hand: Lots.of(npc, sp).length, inv: npc.inventory[sp] || 0, noRec: GL.stats().doorNoRec - nr0 };
      //   로트 아닌 종만 든 손 — 손에 레코드가 없다(그 순간의 새 로트 · 센다 · 보고 재민 칸)
      NOW += DAY; npc.inventory[np] = 1; npc._t312U = R6(per(np));
      const s1 = ev.storage.fish || 0, nr1 = GL.stats().doorNoRec;
      const got2 = H._t312Deliver(vil, npc);
      const b = { got: R6(got2), ds: R6((ev.storage.fish || 0) - s1), led: led(ev, 'fish'), noRec: GL.stats().doorNoRec - nr1, kNow: NOW };
      out.fish = { sp, np, k1, k2, a, b, bad: GL.check([ev]).bad.length, stor: stor(ev) };
    }
    if (PART === 'forage') {   // ── T347 채집 귀환(손 → 곳간 · 수요 문이 그날 몫까지만 받는다) ──
      const VV = V(), H = VV.__p3Bind({});
      VV.__labProbe._t475Probe.setDeps({ players: new Map(), t347LootOf: () => ({ berry: 2 }) });   // 덤불 berry = econ fruit(같은 물건 · 걷는 짝이 선다)
      const ev = mkE('채집촌'); Object.assign(ev, { _forageActItems: ['fruit'], _t347MixShare: 1, _forageOutLast: 3, _t347InflowToday: 0, _t347Cells: 1 });
      out.att = GL.attach(ev, null, null);
      const vil = { name: '채집촌', econ: ev };
      const npc = { isNpc: true, inventory: { berry: 0 } };
      const k1 = NOW; npc.inventory.berry += 3; Lots.note(npc, 'berry', 3, dOf(), 'carry', k1);   // 딴 순간(존 채집 줄 `gather` 가 하는 그 적기)
      NOW += 120 * MIN; const k2 = NOW; npc.inventory.berry += 2; Lots.note(npc, 'berry', 2, dOf(), 'carry', k2);
      NOW += 60 * MIN;
      const g1 = H._t347Deliver(vil, npc);
      const a = { g: R6(g1), led: led(ev, 'fruit'), hand: hand(npc, 'berry'), inv: R6(npc.inventory.berry), st: R6(ev.storage.fruit) };
      NOW += DAY; ev._t347InflowToday = 0;   // 이튿날(econ 틱이 오늘치를 장부에 옮기고 비웠다)
      const g2 = H._t347Deliver(vil, npc);
      const b = { g: R6(g2), led: led(ev, 'fruit'), hand: hand(npc, 'berry'), inv: R6(npc.inventory.berry), st: R6(ev.storage.fruit) };
      out.forage = { k1, k2, a, b, bad: GL.check([ev]).bad.length, stor: stor(ev) };
    }
    if (PART === 'pack') {   // ── T544 채집 짐(날짜 없던 대기 칸 `_t544Pack`) ──
      const VV = V(), H = VV.__p3Bind({});
      VV.__labProbe._t475Probe.setDeps({ players: new Map(), t347LootOf: () => ({ berry: 2 }) });
      const ev = mkE('짐촌'); Object.assign(ev, { _forageActItems: ['fruit'], _t347MixShare: 1, _forageOutLast: 2.5, _t347InflowToday: 0, _t347Cells: 1 });
      out.att = GL.attach(ev, null, null);
      const vil = { name: '짐촌', econ: ev };
      out.keep = VV.__labProbe._t475Probe.keepOf(vil);   // 걷는 목록(세계 목록을 먼저 — 손 이름 짝 berry → fruit 가 거기서 선다 · 채집 절 머리가 하는 그 순서)
      const k1 = NOW; H._t544PackPut(vil, 'berry', 2);
      NOW += 30 * MIN; const k2 = NOW; H._t544PackPut(vil, 'berry', 1.5);
      const p0 = recs(GL.pock(ev, '_t544Pack', 'berry'));
      NOW += DAY;
      const g = H._t544PackIn(vil, ['fruit']);
      const p1 = recs(GL.pock(ev, '_t544Pack', 'berry')), pv = ev._t544Pack ? R6(ev._t544Pack.berry || 0) : 0, l1 = led(ev, 'fruit'), st = R6(ev.storage.fruit);
      //   저장 → 복원(재기동) — 대기 칸 줄도 econ 줄에 실린다
      const d = JSON.parse(JSON.stringify(GL.dump(ev) || null));
      const ev2 = { name: ev.name, storage: JSON.parse(JSON.stringify(ev.storage)), _t544Pack: JSON.parse(JSON.stringify(ev._t544Pack || {})) };
      GL.attach(ev2, d, null);
      const p2 = recs(GL.pock(ev2, '_t544Pack', 'berry'));
      //   끔에서 켬으로(저장 줄 없음) — 지금 칸 값을 그 순간 레코드 하나로(나이 모름 · 센다)
      const sd0 = GL.stats().pockSeed;
      const ev3 = { name: '끔에서', storage: { fruit: 0 }, _t544Pack: { berry: 4 } }; GL.attach(ev3, null, null);
      const seed = { n: GL.stats().pockSeed - sd0, p: recs(GL.pock(ev3, '_t544Pack', 'berry')), kNow: NOW };
      //   맞대기 — 길을 다 막았으면 어긋남 0 · 줄 밖에서 칸을 바꾸면 센다(자명 통과 금지)
      const dr0 = GL.stats().pockDrift; GL.sync([ev, ev2, ev3]); const dr1 = GL.stats().pockDrift;
      const bad = GL.check([ev, ev2, ev3]).bad.length;
      if (ev._t544Pack) ev._t544Pack.berry = R6((ev._t544Pack.berry || 0) + 1);
      GL.sync([ev]); const dr2 = GL.stats().pockDrift;
      out.pack = { k1, k2, p0, g: R6(g), p1, pv, l1, st, dP: !!(d && d.P), p2, seed, drift: [dr0, dr1, dr2], bad, stor: stor(ev2) };
    }
    if (PART === 'farm' || PART === 'farm227') {   // ── T368 농부 귀환 · T227 고르게 대기(`_t368Pend` · `_t100Pend`) ──
      const B = V().__farmBind();
      if (out.on) E.setLotHook(GL.hooks);   // 존 부팅(`_t732Boot`)이 하는 그 꽂기(끄면 안 꽂는다 — econ 훅 줄 무동작)
      const ev = mkE('농촌'); ev._world = {};
      out.att = GL.attach(ev, null, null);
      const vil = { name: '농촌', econ: ev, _drySet: new Set(['1,1']) };
      const C = 'foxtail_millet', it = B._t368Item(vil, '1,1', { c: C, q: 1 });
      const npc = { isNpc: true, inventory: {} };
      const k1 = NOW; B._t368Hold(npc, it);
      NOW += 120 * MIN; const k2 = NOW; B._t368Hold(npc, it);
      NOW += 60 * MIN;
      const hand0 = hand(npc, C);
      const got = B._t368Deliver(vil, npc, 'gran');
      const a = { u: it && it.u, hand0, got, led: led(ev, C), pock: recs(GL.pock(ev, '_t368Pend', C)), pend: ev._t368Pend ? R6(ev._t368Pend[C] || 0) : null, st: R6(ev.storage[C] || 0), hand: Lots.of(npc, C).length, inv: npc.inventory[C] || 0 };
      let b = null, f = null;
      if (PART === 'farm227') {
        NOW += DAY; const r1 = E.t368EvenRelease(ev);
        b = { r1: R6(r1), led: led(ev, C), pock: recs(GL.pock(ev, '_t368Pend', C)), pend: R6(ev._t368Pend[C] || 0), st: R6(ev.storage[C] || 0) };
        NOW += 60 * MIN; const k4 = NOW; const h4 = E.harvestToGranary(ev, 3, 1);   // 추상 농부(작물 없음) — 그 순간 거둔 것이 `_t100Pend` 로
        const pf = recs(GL.pock(ev, '_t100Pend', 'food'));
        NOW += DAY; const r2 = E.t100EvenRelease(ev);
        f = { k4, h4: R6(h4), pf, r2: R6(r2), led: led(ev, 'food'), pock: recs(GL.pock(ev, '_t100Pend', 'food')), pend: R6(ev._t100Pend || 0), st: R6(ev.storage.food || 0) };
      }
      const dr0 = GL.stats().pockDrift; GL.sync([ev]);
      out.farm = { k1, k2, a, b, f, drift: GL.stats().pockDrift - dr0, bad: GL.check([ev]).bad.length, stor: stor(ev) };
    }
    if (PART === 'war') {   // ── T423 짐이 몸에(팩 → 병사 몸 → 먹기 → 내려놓기) · T466 노획 운반 · 전장 더미 ──
      const WarCore = require(path.join(ROOT, 'sim', 'war-core'));
      if (out.on) WarCore.setLotHook(GL.hooks);
      const players = new Map();
      const A = mkV('공격'), D = mkV('방어');
      const world = { villages: [A.econ, D.econ], day: 900 };
      let H = null;
      const war = WarCore.createWar({ villages: [A, D], world, seed: 1, log: () => {},   // 운영과 같은 세 훅(villages `createWar` 인자 그대로)
        rationEat: (w, day) => H._warRationEat(w, day), rationCollect: (w) => H._warRationCollect(w),
        lootCarry: (w, items, kind, lots) => H._warLootAccept(w, items, kind, lots) });
      H = V().__p3Bind({ deps: { players }, war, warCore: WarCore, world, warBodies: new Map() });
      out.att = [GL.attach(A.econ, null, null), GL.attach(D.econ, null, null)];
      const k1 = NOW; A.econ.storage.food += 30; NOW += DAY;
      const k2 = NOW; A.econ.storage.food += 30; NOW += DAY;
      const kd = NOW; D.econ.storage.food += 600; NOW += DAY;
      const mkS = (pid) => { const p = { pid, isNpc: true, hp: 100, inventory: {} }; players.set(pid, p); return p; };
      const s1 = mkS('s1'), s2 = mkS('s2'), s3 = mkS('s3');
      const k0 = NOW - 20 * MIN; s1.inventory.food = 1; Lots.note(s1, 'food', 1, Math.floor(k0 / DAY), 'carry', k0);   // 끌려 나오기 전 손에 든 곡식 하나(짐 거울이 그것도 짐으로 본다)
      const w = { id: 1, atk: A, def: D, force: 4, warriors: 4, phase: 'march', op: 'march', born: 900 };
      w._packDays = w._packRem = war._opPackLoad(A, 4, 8, w);
      const pk = w._packLots && w._packLots.food ? recs(w._packLots.food) : null;
      const body = { w, pids: ['s1', 's2'], phase: 'march' };
      H.state.warBodies.set(w.id, body);
      const cb = (p) => GL.checkBag(p, w._packKeys || []).length;
      const nb = H._warRationLoad(body);
      const L = { nb, pk, keys: (w._packKeys || []).slice(), s1: bagOf(s1), s2: bagOf(s2), inv: [R6(s1.inventory.food || 0), R6(s2.inventory.food || 0)], cb: [cb(s1), cb(s2)], hand1: Lots.of(s1, 'food').length };
      NOW += DAY;
      H._warRationEat(w, 901);
      const Et = { s1: bagOf(s1), s2: bagOf(s2), inv: [R6(s1.inventory.food || 0), R6(s2.inventory.food || 0)], cb: [cb(s1), cb(s2)] };
      NOW += 60 * MIN;
      const t = war._opDoSurrender(A, D, 901, w);   // 공납 = 노획 — 켬이면 몸에 맡긴다(같은 문 `_warLootMove` · 뗀 레코드째)
      const P = { t: R6(t), pend: w._lootPend ? R6(w._lootPend.food || 0) : 0, pendL: w._lootPendLots && w._lootPendLots.food ? recs(w._lootPendLots.food) : null };
      const s2b = bagOf(s2);
      H._warBagDrop(w, s2); s2.hp = 0;   // s2 쓰러짐 — 짐이 전장 더미로
      const pileL = w._lootPileLots && w._lootPileLots.food ? recs(w._lootPileLots.food) : null;
      const dFood0 = D.econ.storage.food;
      H._warLootPickup(w, ['s1'], 'A');   // 이긴 쪽(공격) 산 몸이 줍는다 — 곳간 몫 · 더미(짐 상한까지) · 못 실은 곳간 몫은 그 곳간에
      const Pk = { s1: bagOf(s1), inv: R6(s1.inventory.food || 0), cb: cb(s1), dBack: R6(D.econ.storage.food - dFood0), dLed: led(D.econ, 'food') };
      NOW += DAY;
      const a0 = R6(A.econ.storage.food), aK0 = new Set((GL.ledger(A.econ, 'food') || []).map((r) => r.k));
      const back = war._rationLayDownAll(w);   // war-core 귀환 도착 → 호스트 `rationCollect` → 내려놓기(레코드째)
      const Rt = { back: R6(back), dA: R6(A.econ.storage.food - a0), aLed: led(A.econ, 'food'), aNew: (GL.ledger(A.econ, 'food') || []).filter((r) => !aK0.has(r.k)).map((r) => r.k), bag1: !!GL.bagOf(s1), layLots: !!w._layLots, inv: R6(s1.inventory.food || 0) };
      //   두 번째 원정 — 몸이 걸어 돌아와 내려놓는다(`_warRationLayDownBody` · 호스트 줄)
      const w2 = { id: 2, atk: A, def: D, force: 2, warriors: 2, phase: 'march', op: 'march', born: 903 };
      w2._packDays = w2._packRem = war._opPackLoad(A, 2, 4, w2);
      const pk2 = w2._packLots && w2._packLots.food ? recs(w2._packLots.food) : null;
      const body2 = { w: w2, pids: ['s3'], phase: 'return' };
      H.state.warBodies.set(w2.id, body2);
      H._warRationLoad(body2);
      const b3 = bagOf(s3);
      NOW += DAY;
      const a1 = R6(A.econ.storage.food), aK1 = new Set((GL.ledger(A.econ, 'food') || []).map((r) => r.k));
      const back2 = H._warRationLayDownBody(body2);
      const R2 = { pk2, b3, back: R6(back2), dA: R6(A.econ.storage.food - a1), aNew: (GL.ledger(A.econ, 'food') || []).filter((r) => !aK1.has(r.k)).map((r) => r.k), bag3: !!GL.bagOf(s3) };
      out.war = { k0, k1, k2, kd, L, Et, P, s2b, pileL, Pk, Rt, R2, now: NOW, bad: GL.check([A.econ, D.econ]).bad.length, stor: stor(A.econ, D.econ), inv: [s1, s2, s3].map((p) => JSON.stringify(p.inventory)) };
    }
    if (PART === 'den') {   // ── T476 소굴 토벌 노획 — 갱 비축 줄 · 소굴 어댑터 ──
      const WarCore = require(path.join(ROOT, 'sim', 'war-core'));
      if (out.on) WarCore.setLotHook(GL.hooks);
      const A = mkV('토벌촌');
      const world = { villages: [A.econ], day: 900 };
      const war = WarCore.createWar({ villages: [A], world, seed: 1, log: () => {} });
      const H = V().__p3Bind({ deps: { players: new Map() }, war, warCore: WarCore, world, warBodies: new Map() });
      out.att = GL.attach(A.econ, null, null);
      const g = { id: 9, camp: { cx: 3, cy: 3 }, n: 5, food: 0, den: 1, lootN: 0 };
      //   갱 비축 — 결성(씨앗) · 장물아비 몫 · 유지비(bandits 의 세 훅이 부르는 그 함수)
      const k1 = NOW; g.food = 30; GL.gangIn(g, 30, true);
      NOW += DAY; const k2 = NOW; g.food += 10; GL.gangIn(g, 10);
      NOW += DAY; g.food -= 5; GL.gangOut(g, 5);
      const g0 = recs(GL.gangOf(g));
      const den = H._t476DenVil(g);   // 소굴 어댑터(econ 꼴) — 비춤이 갱 줄을 곳간 줄로 붙인다
      const d0 = led(den.econ, 'food');
      NOW += DAY;
      const t = war._opDoSurrender(A, den, 902, null);   // 소굴 곳간 → 공격 곳간(같은 문 `_warLootMove` → `_warFoodMove` · 레코드째)
      const aLed = led(A.econ, 'food');
      H._t476DenSync({ def: den });   // 싸운 뒤 — 어댑터 → 갱(비축 · 줄)
      const g1 = recs(GL.gangOf(g)), gf = R6(g.food);
      H._t476DenRefresh(den);   // 다음 싸움 — 다시 비춘다(갱 줄 그대로)
      const d1 = led(den.econ, 'food');
      //   저장 → 복원(bandits `save` · `lotsBoot` 가 부르는 둘) · 맞대기 어긋남(자명 통과 금지 — 줄 밖에서 비축을 바꾸면 센다)
      const dump = JSON.parse(JSON.stringify(GL.gangDump(g) || null));
      const g2 = { id: 9, food: g.food }; GL.gangLoad(g2, dump);
      const cg = out.on ? GL.checkGang(g) : null;
      const gd0 = GL.stats().gangDrift; GL.gangSync(g); const gd1 = GL.stats().gangDrift;
      g.food += 2; GL.gangSync(g); const gd2 = GL.stats().gangDrift;
      out.den = { k1, k2, g0, d0, t: R6(t), aLed, g1, gf, d1, dump: !!dump, g2: recs(GL.gangOf(g2)), cg, drift: [gd0, gd1, gd2], bad: GL.check([A.econ]).bad.length, stor: stor(A.econ, den.econ) };
    }
    if (PART === 'xzone') {   // ── T525 존 경계 캐러밴 — 짐 레코드가 기록에 실려 이웃 존으로 · 되사 온 짐이 돌아온다 ──
      const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
      const WA = V2.createWorldV2({ seed: 7, villageCount: 3, picker: 'rational', infoRange: 5000, raidPer100: 0 });
      const WB = V2.createWorldV2({ seed: 11, villageCount: 3, picker: 'rational', infoRange: 5000, raidPer100: 0 });
      for (let d = 0; d < 20; d++) { V2.tickWorldV2(WA); V2.tickWorldV2(WB); }
      for (const v of WA.villages.concat(WB.villages)) GL.attach(v, null, null);
      if (out.on) V2.setLotHook(GL.hooks);
      WA.xzone = { zone: 'A', out: [], inbox: [] }; WB.xzone = { zone: 'B', out: [], inbox: [] };   // 호스트가 꽂는 문(존 서버 안 문 · 자 워커 — 기록만 옮긴다)
      const vA = WA.villages[0], vB = WB.villages[0];
      const fA = vA.storage.food, fB = vB.storage.fish || 0;
      vA.storage.food = 0; vB.storage.fish = 0;
      NOW += DAY; const kA = NOW; vA.storage.food = fA; NOW += 3 * MIN; const kB = NOW; vB.storage.fish = fB + 40; NOW += DAY;
      const day = WA.day;
      const c = { id: 9001, trader: null, from: vA, to: { name: vB.name, zone: 'B' }, giveRes: 'food', giveAmt: 10, giveRes2: null, giveAmt2: 0, pFrom_at_depart: 1, pTo_at_depart: 2,
        returnRes: 'fish', distance: 300, travelDays: 3, escort: 0, arriveDay: day + 1, departDay: day - 2, state: 'outbound' };
      //   짐 싣기 — econ 출발이 훅으로 하는 그 셋(뗀 레코드를 모아 짐에) · 하네스는 그 훅을 그대로 부른다
      const HK = out.on ? GL.hooks : null;   // econ 은 켬일 때만 훅을 꽂는다(끄면 `_LOTH` null — 아래 둘 무동작)
      if (HK) HK.capBegin(vA, 'food'); vA.storage.food -= 10; if (HK) HK.cargo(c, 'give', HK.capEnd(vA, 'food'));
      WA.caravans.push(c);
      V2._xzProbe.handOff(WA, c, day);
      const m = JSON.parse(JSON.stringify(WA.xzone.out[0]));
      V2._xzProbe.arrive(WB, JSON.parse(JSON.stringify(m)), WB.day);
      const cB = WB.caravans.find((x) => String(x.id).indexOf('xz:') === 0);
      V2._xzProbe.arriveLoop(WB, cB, WB.day);
      //   ★[T1030] 켬(`T1030_XZ_MARKET=1`)이면 받는 존이 장을 연다 — 'return' 은 정산 뒤다: econ 이 그다음 하는 둘(다음 틱 머리 정산 · 귀환 갈래의 'return')을 같은 함수로 부른다(끔 = 이 줄 무동작)
      if (cB._t707) { V2.settleMarketsV2(WB); V2._xzProbe.handBack(WB, cB, WB.day, cB._xzRow || null, cB._xzBack.remain); }
      const r = JSON.parse(JSON.stringify(WB.xzone.out[0] || null));
      const bLed = out.on ? recs(GL.ledger(vB, 'food')).filter((x) => x[0] === kA) : null;
      V2._xzProbe.ret(WA, r, WA.day);
      const fishA0 = vA.storage.fish || 0;
      GL.tickBegin(); V2.tickWorldV2(WA); GL.sync(WA.villages); GL.tickEnd();
      const strip = (o) => { const x = Object.assign({}, o); delete x.lots; return JSON.stringify(x); };
      out.xzone = { kA, kB, m: strip(m), r: r ? strip(r) : null, mLots: m.lots || null, rLots: (r && r.lots) || null, bLed, ret: [cB._returningRes, R6(cB._returningAmt || 0), !!cB._abandoned],
        cState: c.state, cDone: !!c._done, dFishA: R6((vA.storage.fish || 0) - fishA0), aLed: out.on ? recs(GL.ledger(vA, 'fish')).filter((x) => x[0] === kB) : null,
        bad: [GL.check(WA.villages).bad.length, GL.check(WB.villages).bad.length], stor: stor(...WA.villages, ...WB.villages) };
    }
    if (PART === 'trade') {   // ── 거래소 받기 — 종전(1개 = 1단위) · 열량 짝(`takeKcal` = 꺼내기 · 게시판 보상과 같은 `kcal.itemsOf`) ──
      const VV = V(), Events = require(SV('events.js')), Trade = require(SV('trade.js')), K = require(SV('kcal.js'));
      const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
      const TK = process.env.T748_TK === '1' ? K : undefined;   // 부모가 두 판(종전 · 열량 짝)을 같은 세계로 돌린다
      const fresh = () => {   // 판마다 같은 세계(결정론 · 앞 교환이 값을 움직이지 않게)
        const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
        for (let d = 0; d < 250; d++) econV2.tickWorldV2(world);   // ★[T955] 200 → 250날(⑩ 머리 주석)
        const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: VV.playerVillageDepositMap() });
        L.prime(world);
        return { L, vil: { name: '랩마을0', ccx: 100, ccy: 100, dbId: 0, econ: world.villages[0] } };
      };
      const W0 = fresh(), D = W0.L.deliverable, v0 = W0.vil.econ;
      //   받을 것 — 낱개 열량이 1단위(하루치)와 다른 식량 중 재고가 가장 많은 것 · 낱개 = 1단위인 곡식 · 열량 없는 돌
      const cand = ['salmon', 'rice', 'wheat', 'shrimp', 'crab', 'oyster', 'seaweed', 'fish', 'meat', 'fruit'].filter((r) => D.toEcon.get(r) && (+v0.storage[r] || 0) > 5);
      cand.sort((a, b) => (+v0.storage[b] || 0) - (+v0.storage[a] || 0));
      const res = cand[0] || null, item = res ? D.toEcon.get(res) : null;
      let give = 'wood', gItem = D.toEcon.get(give);
      const run = (takeRes, qty, want) => {
        const { L, vil } = fresh(), v = vil.econ, inv = { [gItem]: 400 };
        const opts = TK ? { want: want || 0, perItem: 1, takeKcal: TK } : { want: want || 0, perItem: 1 };
        const q = Trade.quote(L, econV2, vil, 0, give, takeRes, qty || 1, opts);
        const s0 = +v.storage[takeRes] || 0;
        const x = Trade.exchange(Object.assign({ ledger: L, econV2, vil, vid: 0, inventory: inv, giveRes: give, takeRes, giveQty: qty, want: want || 0, deposit: VV.playerVillageDeposit }, TK ? { takeKcal: TK } : {}));
        return { q: q && { take: q.take, cap: q.cap, capU: q.capU, avg: q.avgRatio, give: q.give, giveNeeded: q.giveNeeded, err: q.err }, x: x && { ok: x.ok, err: x.err, give: x.give, take: x.take, takeUnits: x.takeUnits, item: x.tookItem },
          dStock: R6(s0 - (+v.storage[takeRes] || 0)), got: R6(inv[D.toEcon.get(takeRes)] || 0) };
      };
      //   ★[T795] 낼 것 — 종전 나무. 나무가 귀한 세계(T784 켬 기본 — 시드 7 · 200일 마을0 나무 한 개 값 > 내줄 밀 전부)에선 거래소가 규칙대로
      //     거절해 표본이 안 선다 ⇒ 받기가 서는 첫 재료(차례 고정 · 결정론 · 나무가 서면 종전 그대로).
      for (const g of ['wood', 'stone', 'flint', 'hide', 'bone', 'clay', 'fiber', 'leather']) {
        if (!D.toEcon.get(g)) continue;
        give = g; gItem = D.toEcon.get(g);
        const t = res ? run(res, 6, 0) : null;
        if (!t || (t.x && t.x.ok)) break;
      }
      const b = Trade.board(W0.L, econV2, W0.vil, 0, null, null, TK);
      const row = (r) => { const o = (b.rows || []).find((x) => x.res === r); return o ? { sell: o.sell, stock: o.stock } : null; };
      //   열량 없는 것(광물 · 가죽 · 도구 …) — 종전 그대로 1개 = 1단위(`itemsOf` 가 다루지 않는다) · 재고가 넉넉하고 값이 닿는 것 하나
      const nk = (b.rows || []).filter((o) => o.res !== give && D.toEcon.get(o.res) && !(K.kcalOf(D.toEcon.get(o.res)) > 0) && o.sell >= 5).sort((x, y) => (x.num || 0) - (y.num || 0) || y.sell - x.sell)[0];
      const nres = nk ? nk.res : null;
      out.trade = { give, res, item, kcal: item ? K.kcalOf(item) : 0, DAY: K.DAY_KCAL, nres, board: { res: row(res), food: row('food'), nk: nres ? row(nres) : null },
        a: res ? run(res, 6, 0) : null, food: run('food', 12, 0), nk: nres ? run(nres, 6, 0) : null, want: res ? run(res, 0, 5) : null };
    }
    out.gl = GL.stats();
    out.lots = Lots.stats();
  } catch (e) { out.err = String(e && e.stack || e); }
  console.log = _log;
  console.log(JSON.stringify(out));
  process.exit(0);
}

process.env.T732_MOMENT_LOT = '1';
const Lots = require(SV('lots.js'));
const Spoil = require(SV('spoil.js'));
const GL = require(SV('granary-lots.js'));
const DAY = 1440000;                 // 존의 `_SEASON_DAY_MS`(실시간 24분 = 게임 하루) — 시계 단위는 그 ms
const MIN = DAY / 1440;              // 게임 1분
let NOW = 900 * DAY + 180 * MIN;     // 게임 900일 03:00(하네스 시계 — 존의 `zoneGameMs` 자리)
Lots.setClock(() => NOW, DAY);

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);
const today = () => Math.floor(NOW / DAY);
const fOf = (item, l) => Spoil.freshnessOf(item, Spoil.exposureOf(l, today()));
const mkP = (inv) => ({ inventory: Object.assign({}, inv || {}), isNpc: false });

say('\n=== 로트 = 얻은 순간 · 모든 길에서 로트가 따라간다 (T732 · 손잡이 T732_MOMENT_LOT=1) ===');

say('\n① 순간 열쇠 · 같은 순간만 합친다 · 옛 꼴');
{
  ok(Lots.momentOn() === true && Lots.T732_MOMENT === true, '① 켬 · 시계가 꽂혔다');
  const p = mkP({ berry: 6 });
  const t1 = NOW;
  Lots.note(p, 'berry', 2, today());
  NOW += 7 * MIN;     // 7분 뒤(같은 날)
  Lots.note(p, 'berry', 3, today());
  Lots.note(p, 'berry', 1, today(), 'carry', t1);   // 첫 순간에 얻은 것을 하나 더(같은 순간 = 합친다)
  const L = Lots.of(p, 'berry');
  ok(L.length === 2 && L[0].k === t1 && near(L[0].n, 3) && L[1].k === t1 + 7 * MIN && near(L[1].n, 3),
    '★★① 같은 날이라도 순간이 다르면 다른 로트 · 같은 순간이면 합친다(평균 0)', JSON.stringify(L.map((l) => [l.k, l.n])));
  ok(L[0].d === Math.floor(t1 / DAY) && L[0].d === L[1].d, '① `d` 는 그 순간의 날(화면 "N일 전" · 날 문법 호환)');
  ok(L[0].e === 0 && near(L[0].t, t1 / DAY, 1e-9), '① 새 로트는 정산된 채로 태어난다(노출 0 · 정산 순간 = 얻은 순간 · 소수 날)');
  // 옛 꼴 — 그 날 0시 순간으로 읽는다(지우지 않는다) · 정산 전후 같은 값(절벽 0)
  const q = mkP({ berry: 4, fish: 2 });
  const D = today() - 2;
  q.lots = { berry: [{ d: D, n: 4 }], fish: [{ d: D, n: 2, e: 0.5, t: D, m: 1, w: 0 }] };
  const f0b = fOf('berry', q.lots.berry[0]), f0f = fOf('fish', q.lots.fish[0]);
  Lots.settle(q, 'berry', today(), 0); Lots.settle(q, 'fish', today(), 0);
  const b = q.lots.berry[0], f = q.lots.fish[0];
  ok(b.k === D * DAY && f.k === D * DAY && b.n === 4 && f.n === 2, '★① 옛 레코드 둘 — 열쇠 = 그 날 0시 순간 · 개수 그대로(지우지 않는다)', JSON.stringify({ b: [b.k, b.n], f: [f.k, f.n] }));
  ok(near(b.e, NOW / DAY - D, 1e-5), '① 옛 `{d,n}` 의 나이 = 그 날 0시부터 지금까지(소수 날)', `${b.e} ≈ ${(NOW / DAY - D).toFixed(6)}`);
  ok(near(fOf('berry', b), f0b, 1e-6) && near(fOf('fish', f), f0f, 1e-6), '★① 정산 전후 신선도 같다 — 절벽 0(켬이면 옛 꼴도 같은 시계로 읽는다)', `${f0b} → ${fOf('berry', b)} · ${f0f} → ${fOf('fish', f)}`);
  // 저장 → 복원(JSON) — 같은 레코드
  const q2 = mkP({});
  const back = Lots.fromSave(q2, JSON.parse(JSON.stringify(Lots.toSave(q))));
  ok(back && back.berry && back.berry[0].k === b.k && near(back.berry[0].e, b.e) && near(back.berry[0].t, b.t, 1e-9), '① 저장 꼴에 `k` 가 실린다 · 복원하면 같은 순간 · 같은 정산(소수 날)', JSON.stringify(back && back.berry && back.berry[0]));
}

say('\n② 상한 뭉개기 — 남긴다(몸 크기) · 더 이른 순간 · 큰 노출 · 센다');
{
  const p = mkP({ fish: 14 });
  const c0 = Lots.stats().coalesced;
  const ks = [];
  for (let i = 0; i < 14; i++) { ks.push(NOW); Lots.note(p, 'fish', 1, today()); NOW += 40 * MIN; }   // 40분마다 한 마리(날을 넘는다)
  const L = Lots.of(p, 'fish');
  const c1 = Lots.stats().coalesced;
  ok(L.length === Lots.CFG.MAX_LOTS && c1 - c0 === 2, `★② 품목당 ${Lots.CFG.MAX_LOTS} 은 남긴다 — 14 순간 → ${L.length} 로트 · 뭉개기 ${c1 - c0}`, `상한 ${Lots.CFG.MAX_LOTS}`);
  const m = L[0];
  ok(m.coalesced === true && m.k === ks[0] && near(m.n, 3), '★★② 뭉친 로트 = 가장 오래된 셋 · 열쇠는 **더 이른 순간**', JSON.stringify({ k: m.k, n: m.n }));
  const fm = fOf('fish', m), fNext = fOf('fish', L[1]);
  ok(fm <= fNext + 1e-12, '★★② 뭉친 로트는 다음 로트보다 싱싱하지 않다(음식이 실제보다 싱싱해 보이는 일 0)', `${fm} ≤ ${fNext}`);
  const fTrue = Spoil.freshnessOf('fish', Spoil.exposureAt({ k: ks[0], e: 0, t: ks[0] / DAY, m: 1, w: 0 }, NOW / DAY, 0));
  ok(near(fm, fTrue, 1e-6), '② 그 신선도 = 가장 이른 순간에 얻은 한 마리의 것(정산한 뒤 견줬다)', `${fm} = ${fTrue}`);
}

say('\n③ 근사 셈 · 지목 소비');
{
  const p = mkP({ berry: 0 });
  const a0 = Lots.stats().approx;
  Lots.note(p, 'berry', 2, today());
  p.inventory.berry = 5;                      // 로트를 안 거친 몫 3
  Lots.reconcile(p, 'berry', p.inventory, today());
  const st = Lots.stats();
  ok(st.approx - a0 === 1 && st.approxBy.berry >= 1 && near(Lots.sum(p, 'berry'), 5), '★③ 맞추기가 남는 몫을 지금 얻은 것으로 잡으면 **센다**(근사 한 번)', `approx +${st.approx - a0}`);
  // 지목 소비 — 맞춘 뒤 고른다(종전엔 안 맞추고 골라 갓 얻은 몫이 지워질 수 있었다)
  const q = mkP({ fish: 0 });
  const k1 = NOW; Lots.note(q, 'fish', 2, today()); NOW += MIN;
  const k2 = NOW; Lots.note(q, 'fish', 2, today());
  q.inventory.fish = 4;
  const r = Lots.consumeFrom(q, 'fish', today(), 1, q.inventory, k2);
  const L = Lots.of(q, 'fish');
  ok(r.taken === 1 && L.length === 2 && near(L[0].n, 2) && L[0].k === k1 && near(L[1].n, 1) && q.inventory.fish === 3, '★③ 지목(`k`) 소비 — 그 순간 로트에서만 뗀다', JSON.stringify(L.map((l) => [(l.k - k1) / MIN, l.n])));
  const a1 = Lots.stats().approx;
  Lots.reconcile(q, 'fish', q.inventory, today());
  ok(Lots.stats().approx === a1, '③ 길을 다 거친 판은 맞추기가 근사를 안 센다');
}

say('\n④ NPC 곁 장부 — 몸 필드 0');
{
  const npc = { isNpc: true, inventory: { fish: 0 } };
  npc.inventory.fish += 2; Lots.note(npc, 'fish', 2, today());
  ok(!('lots' in npc) && Lots.sum(npc, 'fish') === 2, '★④ NPC 몸엔 `lots` 칸이 안 생긴다 — 장부는 몸 밖(곁 장부)', Object.keys(npc).join(','));
  const recs = Lots.moveOut(npc, 'fish', 1, npc.inventory, today(), 0);
  npc.inventory.fish -= 1;
  ok(recs.length === 1 && recs[0].k === Lots.of(npc, 'fish')[0].k && near(Lots.sum(npc, 'fish'), 1), '④ 곁 장부도 같은 문(꺼내기 · 맞추기 — 죽음 드롭이 이 레코드를 바닥에 싣는다)');
}

say('\n⑤ 곳간 장부');
{
  GL.stats(true);
  const v = { name: '갑', storage: { food: 10, wood: 5, fish: 0 } };
  const kSeed = NOW;
  ok(GL.attach(v, null, null) === true, '⑤ 붙이기');
  const dw = Object.getOwnPropertyDescriptor(v.storage, 'wood'), df = Object.getOwnPropertyDescriptor(v.storage, 'food');
  ok(!!df.get && !dw.get && dw.value === 5, '⑤ 로트 재화만 감싼다(나무는 값 그대로 · 칸 순서 무변)', Object.keys(v.storage).join(','));
  ok(JSON.stringify(v.storage) === '{"food":10,"wood":5,"fish":0}', '⑤ econ 이 보는 값 그대로(직렬화 · 열거 순서)');
  let Lg = GL.ledger(v, 'food');
  ok(Lg.length === 1 && Lg[0].k === kSeed && Lg[0].u === 10 && GL.stats().seeded === 1, '⑤ 첫 붙이기 — 지금 곳간 값을 지금 순간 로트 하나로(나이 모름 · 센다)');
  // 마감 = 한 순간
  NOW += DAY; const kT = NOW;
  GL.tickBegin();
  NOW += 2 * MIN; v.storage.food += 3;
  NOW += 2 * MIN; v.storage.food += 2;      // 마감 조각이 프레임을 넘겨도 같은 순간
  GL.tickEnd();
  Lg = GL.ledger(v, 'food');
  ok(Lg.length === 2 && Lg[1].k === kT && near(Lg[1].u, 5), '★⑤ 하루 마감 = 한 순간 — 그 동안 얻은 것은 그 순간 레코드 하나(같은 순간만 합친다)', JSON.stringify(Lg.map((r) => [r.k - kSeed, r.u])));
  // 줄면 오래된 것부터
  v.storage.food -= 11;
  Lg = GL.ledger(v, 'food');
  ok(Lg.length === 1 && Lg[0].k === kT && near(Lg[0].u, 4), '★⑤ 줄면 오래된 것부터(NPC 는 오래된 것부터 먹는다) — 씨앗 10 다 · 마감 몫 1', JSON.stringify(Lg.map((r) => [r.k - kSeed, r.u])));
  // 빚 — 곳간이 0 아래로(장부가 줄 수 없는 몫) → 다음 늘어남이 먼저 갚는다
  v.storage.food -= 6;                        // 4 → −2
  ok(!GL.ledger(v, 'food').length && GL.check([v]).bad.length === 0, '⑤ 0 아래 — 빚으로 적는다(장부 합 − 빚 = 곳간)', `food ${v.storage.food}`);
  v.storage.food += 3;
  Lg = GL.ledger(v, 'food');
  ok(Lg.length === 1 && near(Lg[0].u, 1) && GL.check([v]).bad.length === 0, '⑤ 다음 늘어남이 빚부터 갚는다', JSON.stringify(Lg.map((r) => r.u)));
  // 견적 멈춤 — 잠깐 바꿨다 되돌리는 동안 장부 무변
  const before = JSON.stringify(GL.ledger(v));
  GL.suspend(true); v.storage.food += 50; v.storage.food -= 50; GL.suspend(false);
  ok(JSON.stringify(GL.ledger(v)) === before, '★⑤ 견적 멈춤(`gluttedAt` · `planSliced` 의 잠깐 바꾸기) — 장부 무변(오래된 것이 새것으로 갈리지 않는다)');
  // 실패 되돌림
  GL.txBegin(v); v.storage.food -= 1; v.storage.food += 1; GL.txEnd(v, false);
  ok(JSON.stringify(GL.ledger(v)) === before && GL.check([v]).bad.length === 0, '★⑤ 교환 실패 되돌림 — 장부도 그 순간으로(새 로트 0)');
  // 옮김 — 다른 곳간으로 레코드째(캐러밴 짐 문법) · 받는 쪽에 그 칸이 없으면 대기 레코드로 감싼다(새 칸의 첫 몫 = 옮겨 온 것)
  const w2 = { name: '을', storage: { food: 0 } };
  GL.attach(w2, null, null);
  NOW += DAY;
  v.storage.fish += 4;                        // 갑이 생선을 얻었다(지금)
  const kFish = GL.ledger(v, 'fish')[0].k;
  GL.capBegin(v, 'fish'); v.storage.fish -= 3; const recs = GL.capEnd(v, 'fish');
  const car = {};
  GL.cargo(car, 'give', recs);
  NOW += 2 * DAY;                             // 길 위 이틀
  GL.unload(car, 'give', w2, 'fish', 3);
  w2.storage.fish = (w2.storage.fish || 0) + 3;   // econ 이 처음 쓰는 칸(접근자 없음)
  GL.clearIn(w2, 'fish');
  const Lw = GL.ledger(w2, 'fish');
  ok(Lw.length === 1 && Lw[0].k === kFish && near(Lw[0].u, 3) && GL.isWrapped(w2, 'fish'), '★★⑤ 옮김은 레코드째 — 받는 곳간의 새 칸도 그 순간(지금 얻은 것이 아니다)', JSON.stringify(Lw.map((r) => [r.k - kFish, r.u])));
  const fRoad = Spoil.freshnessOf('fish', Spoil.exposureOf(Lw[0], today()));
  const fHome = Spoil.freshnessOf('fish', Spoil.exposureOf(GL.ledger(v, 'fish')[0], today()));
  ok(fRoad < fHome, '⑤ 길 위에서는 몸에 지님 배율로 늙었다(곳간에 남은 같은 순간 것보다 덜 싱싱 — 늙힘은 조회 함수)', `${fRoad} < ${fHome}`);
  // 사람의 문 — 늘어남은 잡아 두고 사람 쪽 레코드로 채운다 · 줄어듦은 모은다 · 실패면 되돌림
  const pl = mkP({ fish: 3 });
  const kp = NOW - 300 * MIN; Lots.note(pl, 'fish', 3, Math.floor(kp / DAY), 'carry', kp);   // 다섯 시간 전에 낚은 생선(시들기 전)
  const pr = Lots.peek(pl, 'fish', 3, pl.inventory, today());
  const fP = Spoil.freshnessOf('fish', Spoil.exposureOf(pr[0], today()));
  GL.doorBegin();
  v.storage.fish += 1.2;                      // 문(정본 넣기)이 단위로 올렸다
  v.storage.food -= 0.5;                      // 같은 문에서 곡식을 내줬다
  const d = GL.doorEnd(true);
  GL.doorIn(d, v, 'fish', GL.recsFromPlayer(pr, 'fish', 1.2, true, today()));
  const got = GL.doorCap(d, v, 'food');
  GL.doorRest(d);
  const Lf = GL.ledger(v, 'fish'), last = Lf.find((r) => r.k === kp);
  ok(fP > 0 && fP < 1 && !!last && near(last.u, 1.2) && near(last.f0, fP, 1e-6), '★★⑤ 사람의 문 — 낸 것은 사람의 순간 · 단위 무게 · 접힌 신선도(f0)째 곳간에', JSON.stringify(last));
  ok(got.length === 1 && near(got[0].u, 0.5), '⑤ 문이 뗀 곡식 레코드를 모았다(사람에게 실을 것)', JSON.stringify(got.map((r) => r.u)));
  const pIn = GL.recsToPlayer([Object.assign({}, last, { u: 0.6 })], 2);
  ok(pIn.length === 1 && near(pIn[0].n, 2 / fP, 1e-5) && pIn[0].k === kp, '★⑤ 꺼낼 때 접힌 신선도를 편다 — 낱개 = 문 몫 ÷ f0(두 번 깎으면 소멸)', `${pIn[0].n} = 2 ÷ ${fP}`);
  const pIn2 = GL.recsToPlayer([{ k: 1, u: 0.3333333, f0: 1, e: 0, t: 1 / DAY, m: 0.7, w: 0.55 }, { k: 2, u: 0.6666667, f0: 1, e: 0, t: 2 / DAY, m: 0.7, w: 0.55 }], 7);
  ok(near(pIn2.reduce((a, r) => a + r.n, 0), 7, 1e-9), '⑤ 접힘이 없으면 낱개 합 = 문이 정한 낱개(끝수 0 — 6.999999 로 떨어지지 않는다)', JSON.stringify(pIn2.map((r) => r.n)));
  const snap = JSON.stringify(GL.ledger(v));
  GL.doorBegin();
  v.storage.food -= 0.2; v.storage.fish += 0.4;     // 문 안(내주기 · 받기)
  v.storage.food += 0.2; v.storage.fish -= 0.4;     // econ 이 실패로 곳간을 되돌렸다(교환 ⑤ 되돌림)
  GL.doorEnd(false);
  ok(JSON.stringify(GL.ledger(v)) === snap && GL.check([v]).bad.length === 0, '★⑤ 실패한 문 — 장부가 문 앞으로(되돌린 곳간 값과 맞는다 · 새 로트 0)');
  // 안 닫힌 문(문 사이에서 던져 닫는 줄을 못 탔다) — 다음 문(또는 마감)이 그 문을 닫고 잡아 둔 늘어남을 적는다(센다 · econ 늘어남을 영영 삼키지 않는다)
  {
    const s0 = GL.stats().doorStale;
    GL.doorBegin(); v.storage.food += 2;      // 닫는 줄 없이 끝났다
    const held = GL.check([v]).bad.length;    // 문이 열린 동안은 장부가 늘어남을 모른다
    GL.doorBegin(); GL.doorRest(GL.doorEnd(true));
    ok(held === 1 && GL.stats().doorStale - s0 === 1 && GL.check([v]).bad.length === 0, '⑤ 안 닫힌 문 — 다음 문이 닫고 잡아 둔 몫을 그 순간의 로트로 적는다(센다 · 불변식 되돌아옴)', `stale +${GL.stats().doorStale - s0}`);
  }
  // 맞대기 — 새 칸(econ 이 처음 만든 재화)은 마감 끝에 감싼다 · 어긋남 0
  GL.tickBegin(); const kT2 = NOW;
  v.storage.meat = 7;                          // 접근자 없는 새 칸(econ 생산)
  const s = GL.sync([v, w2]);
  GL.tickEnd();
  ok(s.late === 1 && s.drift === 0 && GL.ledger(v, 'meat')[0].k === kT2 && GL.check([v, w2]).bad.length === 0, '★⑤ 마감 끝 맞대기 — 새 칸은 그 마감의 순간 · 어긋남 0 · 불변식(장부 합 − 빚 = 곳간)', JSON.stringify(s));
  // 저장 → 복원 — 같은 장부(재기동)
  const dump = JSON.parse(JSON.stringify(GL.dump(v)));
  const v2 = { name: '갑', storage: JSON.parse(JSON.stringify(v.storage)) };
  GL.attach(v2, dump, null);
  ok(JSON.stringify(GL.ledger(v2)) === JSON.stringify(GL.dump(v).L) && GL.check([v2]).bad.length === 0, '★⑤ 저장 → 복원 — 같은 레코드 · 불변식 그대로(재기동 뒤)');
  const st = GL.stats();
  ok(st.doorNoRec === st.doorStale && st.drift === 0, '⑤ 문 표 · 맞대기 — 레코드 없이 든 몫 = 안 닫힌 문의 몫뿐 · 어긋남 0', JSON.stringify({ doorNoRec: st.doorNoRec, doorStale: st.doorStale, drift: st.drift, adopted: st.adopted, moved: st.moved }));
}

say('\n⑥ 캐러밴 — 랩 econ v2(5마을 · 200일) · 매일 불변식 · 짐 레코드의 순간');
{
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  GL.stats(true);
  NOW = 2000 * DAY;
  for (const v of world.villages) GL.attach(v, null, null);
  const seen = { out: 0, in: 0, kOk: 0, kBad: 0, maxRec: 0 };
  const H = Object.assign({}, GL.hooks);
  H.cargo = (c, slot, recs) => { seen.out++; return GL.hooks.cargo(c, slot, recs); };
  H.unload = (c, slot, v, res, amt) => {
    const K = GL.cargoDump(c); const recs = (K && K[slot]) || [];
    for (const r of recs) { if (r.k < NOW) seen.kOk++; else seen.kBad++; }   // 길은 하루 이상 — 짐의 순간은 오늘 마감보다 이르다
    seen.in++;
    return GL.hooks.unload(c, slot, v, res, amt);
  };
  econV2.setLotHook(H);
  let bad = 0, firstBad = null, drift = 0;
  try {
    for (let d = 0; d < 200; d++) {
      NOW += DAY;
      GL.tickBegin();
      econV2.tickWorldV2(world);
      const s = GL.sync(world.villages);
      GL.tickEnd();
      if (d > 0) drift += s.drift;
      const c = GL.check(world.villages, 1e-6);
      if (c.bad.length) { bad++; if (!firstBad) firstBad = { d, b: c.bad.slice(0, 3) }; }
      for (const v of world.villages) { const L = GL.ledger(v); for (const r of Object.keys(L)) seen.maxRec = Math.max(seen.maxRec, L[r].length); }
    }
  } finally { econV2.setLotHook(null); }
  const st = GL.stats();
  ok(bad === 0, '★★⑥ 200일 매일 — 감싼 칸마다 장부 합 − 빚 = 곳간 값(불변식)', firstBad ? JSON.stringify(firstBad) : `칸 ${GL.check(world.villages).cells}`);
  ok(drift === 0, '★⑥ 맞대기 어긋남 0 — econ 이 장부 모르게 곳간을 바꾼 길이 없다(새 칸 감싸기는 별개)', `drift ${drift} · 늦게 감싼 칸 ${st.wrappedLate}`);
  ok(seen.out > 0 && seen.in > 0 && st.moved > 0, '⑥ 캐러밴이 실제로 오갔다 — 짐 싣기 · 내리기 · 레코드 넘김', JSON.stringify({ 싣기: seen.out, 내리기: seen.in, 넘김: st.moved }));
  ok(seen.kBad === 0 && seen.kOk > 0, '★★⑥ 내린 짐 레코드의 순간 < 오늘 마감 — 받는 곳간에서 "지금 얻은 것"이 되지 않는다', `${seen.kOk} 레코드`);
  // 끔 바이트 — 훅을 안 꽂은 같은 세계와 곳간 값이 같다(훅은 관측자)
  const w0 = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  for (let d = 0; d < 200; d++) econV2.tickWorldV2(w0);
  const sig = (w) => JSON.stringify(w.villages.map((v) => [v.name, Object.keys(v.storage).map((k) => [k, +(+v.storage[k]).toFixed(9)]), (v.npcs || []).length]));
  ok(sig(world) === sig(w0), '★★⑥ 훅은 관측자 — 장부를 붙인 세계와 안 붙인 세계의 곳간 · 인구가 200일 같다', `레코드 최대(칸 하나) ${seen.maxRec}`);
}

say('\n⑦ 전쟁 군량 — 팩 싣기 · 환급 꼬리 · 항복 공납');
{
  const WarCore = require(path.join(ROOT, 'sim', 'war-core'));
  WarCore.setLotHook(GL.hooks);
  try {
    const mkV = (name, food) => ({ name, econ: { name, npcs: Array.from({ length: 10 }, (_, i) => ({ id: i })), counts: {}, storage: { food }, _warFatigue: 0 } });
    const A = mkV('공격', 0), Dv = mkV('방어', 0);
    const world = { villages: [A.econ, Dv.econ], day: 10 };
    const war = WarCore.createWar({ villages: [A, Dv], world, seed: 1, log: () => {} });
    GL.attach(A.econ, null, null); GL.attach(Dv.econ, null, null);
    const k1 = NOW; A.econ.storage.food += 30; NOW += DAY;
    const k2 = NOW; A.econ.storage.food += 30; NOW += DAY;
    const w = { id: 1, atk: A, def: Dv, force: 5 };
    const days = war._opPackLoad(A, 5, 8, w);
    const pk = w._packLots && w._packLots.food;
    ok(days > 0 && pk && pk.length === 2 && pk[0].k === k1 && pk[1].k === k2 && near(pk[0].u + pk[1].u, w._packLoad), '★⑦ 팩 싣기 — 곳간에서 뗀 레코드째(오래된 것부터 · 전쟁 객체 곁 칸)', JSON.stringify(pk && pk.map((r) => [r.k - k1, r.u])));
    NOW += 2 * DAY;
    const back = war._opPackRefund(A, 5, days * 0.25, w);   // 4분의 1 남았다(원정 동안 오래된 것부터 먹혔다)
    const L = GL.ledger(A.econ, 'food');
    ok(back > 0 && L.length >= 1 && L.every((r) => r.k === k2 || r.k === k1) && L[L.length - 1].k === k2, '★⑦ 환급 — 남은 몫은 새 쪽 꼬리(오래된 것부터 먹혔다) · 그 순간째', JSON.stringify(L.map((r) => [r.k - k1, +r.u.toFixed(3)])));
    ok(GL.check([A.econ, Dv.econ]).bad.length === 0, '⑦ 불변식 그대로');
    // 항복 공납 — 방어 곳간 → 공격 곳간 레코드째
    const kd = NOW; Dv.econ.storage.food += 40; NOW += DAY;
    war._opDoSurrender(A, Dv, 20, null);
    const got = GL.ledger(A.econ, 'food').filter((r) => r.k === kd);
    ok(got.length === 1 && got[0].u > 0, '★⑦ 항복 공납(곳간 → 곳간) — 받는 쪽에 방어 곳간의 순간 그대로(지금 얻은 것이 아니다)', JSON.stringify(got.map((r) => +r.u.toFixed(3))));
    ok(GL.check([A.econ, Dv.econ]).bad.length === 0, '⑦ 불변식 그대로');
  } finally { WarCore.setLotHook(null); }
}

say('\n⑧ 손잡이 — ★[T778] 켬 기본 · \'0\' 하나만 끔');
{
  const run = (val) => {
    const env = Object.assign({}, process.env, { T732_SUB: 'knob' });
    if (val === undefined) delete env.T732_MOMENT_LOT; else env.T732_MOMENT_LOT = val;
    return JSON.parse(execFileSync(process.execPath, [__filename], { env, stdio: 'pipe' }).toString().trim().split('\n').pop());
  };
  const dflt = run(undefined), on = run('1'), off = run('0'), t = run('true'), e = run('');
  ok(off.on === false && off.momentOn === false && off.att === false && off.getter === false && off.lot && off.lot.k === undefined,
    "★⑧ 끔('0') — 시계를 안 받는다 · 곳간 장부 안 붙는다 · 로트는 날 꼴 그대로(종전 바이트)", JSON.stringify(off.lot));
  ok([dflt, t, e].every((x) => x.on === true && x.momentOn === true && x.att === true), "⑧ 없음 · 빈 값 · 'true' 도 켬([T778] 켬 기본)");
  ok(on.on === true && on.momentOn === true && on.att === true && on.getter === true && on.lot && Number.isFinite(on.lot.k) && JSON.stringify(dflt) === JSON.stringify(on), "⑧ '1' = 없음(기본) — 순간 열쇠 · 곳간 장부(두 판 같은 줄)");
}

// ══ [T748] 켬 전용 일곱 길 · 거래소 받기 ══════════════════════════════════════════════════
//   그 길의 손잡이를 켠 아이 판(위 `T732_SUB=t748`)을 켬 · 끔 두 번 돌린다 — 켬은 레코드가 그 순간째 건너가는지,
//   끔은 같은 줄이 곳간 값 · 몸 인벤을 한 자리도 안 바꾸는지(장부는 관측자) 본다.
const T748_KNOBS = ['T732_MOMENT_LOT', 'T732_SUB', 'T748_PART', 'T748_TK', 'T312_FISH_ACT', 'T347_FORAGE_ACT', 'T368_FARM_ACT', 'T100_FIELD_YIELD', 'T227_EVEN',
  'T423_RATION_ACT', 'T466_LOOT_ACT', 'T476_PUNITIVE', 'T525_CROSS_ZONE', 'T441_FORAGE_MARCH', 'T374_DEMAND_STOP', 'T502_ODDS_REAL', 'T521_GANG_ARMS'];
const T748_BASE = (() => { const e = Object.assign({}, process.env); for (const k of T748_KNOBS) delete e[k]; return e; })();
const sub748 = (part, knobs, on, extra) => {
  const env = Object.assign({}, T748_BASE, knobs || {}, extra || {}, { T732_SUB: 't748', T748_PART: part });
  env.T732_MOMENT_LOT = on ? '1' : '0';   // ★[T778] 켬 기본 — 끈 판은 명시 `=0`
  try { return JSON.parse(execFileSync(process.execPath, [__filename], { env, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop()); }
  catch (e) { return { err: String((e && e.message) || e).slice(0, 400) }; }
};
const pair748 = (part, knobs) => { const on = sub748(part, knobs, true), off = sub748(part, knobs, false); return { on, off, P: on[part === 'farm227' ? 'farm' : part] || {}, Q: off[part === 'farm227' ? 'farm' : part] || {} }; };
const ks = (L) => (L || []).map((r) => r[0]);
const su = (L) => (L || []).reduce((a, r) => a + r[1], 0);
const glz = (o) => !!(o && o.gl && o.gl.giveNoRec === 0 && o.gl.pockDrift === 0 && o.gl.gangDrift === 0 && o.lots && o.lots.approx === 0);
const pre748 = (X, name) => {
  const okk = !X.on.err && !X.off.err && X.on.on === true && X.off.on === false;
  ok(okk, `⑨ [상황] ${name} — 켬 · 끔 두 판이 돌았다(켬 = 시계 · 장부 · 끔 = 둘 다 없음)`, X.on.err || X.off.err || '');
  return okk;
};

say('\n⑨ [T748] 켬 전용 일곱 길 — 로트를 그대로 넘긴다(손잡이 T732_MOMENT_LOT 안 · 그 길의 손잡이를 켠 판)');
{
  // ── ① 어부 귀환(T312) ──
  const X = pair748('fish', { T312_FISH_ACT: '1' }), F = X.P;
  if (pre748(X, '어부 귀환(T312_FISH_ACT)')) {
    const a = F.a || {}, b = F.b || {};
    ok(JSON.stringify(ks(a.led)) === JSON.stringify([F.k1, F.k2]) && near(a.led[0][1], 2 * a.led[1][1], 1e-6) && near(su(a.led), a.ds, 1e-6) && a.hand === 0,
      '★★⑨① 어부 귀환 — 손의 생선 로트(낚은 순간 둘 · 2 : 1)가 곳간 레코드로 · 합 = 곳간이 받은 몫 · 손 장부 비움', JSON.stringify(a.led));
    ok(b.noRec === 1 && b.led.length === a.led.length + 1 && b.led[b.led.length - 1][0] === b.kNow,
      '⑨① 로트 아닌 종만 든 손(표 밖 — 손에서 안 늙는다)은 레코드가 없다 — 그 순간의 새 로트 · 센다(재민 칸)', `${F.np} · 문 레코드 없음 ${b.noRec}`);
    ok(F.stor === (X.Q || {}).stor && F.bad === 0, '⑨① 끈 판과 곳간 값 같다(장부는 관측자) · 불변식');
  }
  // ── ② 채집 귀환(T347) · 짐(T544) ──
  const Y = pair748('forage', { T347_FORAGE_ACT: '1' }), G = Y.P;
  if (pre748(Y, '채집 귀환(T347_FORAGE_ACT)')) {
    const a = G.a || {}, b = G.b || {};
    ok(a.g === 3 && JSON.stringify(ks(a.led)) === JSON.stringify([G.k1]) && near(su(a.led), a.st, 1e-6) && JSON.stringify(a.hand) === JSON.stringify([[G.k2, 2]]) && a.inv === 2,
      '★★⑨② 채집 귀환 — 수요 문이 받은 만큼(3)만 손의 오래된 로트에서 떼어 곳간에 · 안 받은 몫은 손에 그 순간째', `곳간 ${JSON.stringify(a.led)} · 손 ${JSON.stringify(a.hand)}`);
    ok(b.g === 2 && JSON.stringify(ks(b.led)) === JSON.stringify([G.k1, G.k2]) && near(su(b.led), b.st, 1e-6) && b.hand.length === 0 && b.inv === 0,
      '⑨② 이튿날 — 남은 손이 그 순간째 들어간다(손 장부 비움)', JSON.stringify(b.led));
    ok(G.stor === (Y.Q || {}).stor && G.bad === 0 && Y.on.gl.doorNoRec === 0, '⑨② 끈 판과 곳간 값 같다 · 불변식 · 문 레코드 없음 0');
  }
  const Z = pair748('pack', { T347_FORAGE_ACT: '1' }), K = Z.P;
  if (pre748(Z, '채집 짐(T544 `_t544Pack`)')) {
    ok(JSON.stringify(K.p0) === JSON.stringify([[K.k1, 2], [K.k2, 1.5]]) && K.g === 2.5 && JSON.stringify(ks(K.l1)) === JSON.stringify([K.k1, K.k2]) && near(su(K.l1), K.st, 1e-6)
      && JSON.stringify(K.p1) === JSON.stringify([[K.k2, 1]]) && near(su(K.p1), K.pv, 1e-9),
      '★★⑨② 날짜 없던 짐 칸에 줄 — 든 순간째 · 이튿날 입구가 받은 만큼 오래된 것부터 곳간에 · 남은 짐 = 줄 합', `짐 ${JSON.stringify(K.p0)} → ${JSON.stringify(K.p1)} · 곳간 ${JSON.stringify(K.l1)}`);
    ok(K.dP && JSON.stringify(K.p2) === JSON.stringify(K.p1) && K.seed.n === 1 && JSON.stringify(K.seed.p) === JSON.stringify([[K.seed.kNow, 4]]),
      '⑨② 저장 → 복원 같은 줄 · 끔에서 켬으로(저장 줄 없음)는 지금 칸 값을 그 순간 레코드 하나로(나이 모름 · 센다)');
    ok(K.drift[0] === 0 && K.drift[1] === 0 && K.drift[2] === 1 && K.bad === 0,
      '★⑨② 맞대기 — 길을 다 막았으니 어긋남 0 · 줄 밖에서 짐 칸을 바꾸면 센다(자명 통과 금지)', JSON.stringify(K.drift));
    ok(K.stor === (Z.Q || {}).stor, '⑨② 끈 판과 곳간 값 같다');
  }
  // ── ③ 농부 귀환(T368) · 고르게 대기(T227 `_t368Pend` · `_t100Pend`) ──
  const FA = pair748('farm', { T100_FIELD_YIELD: '1', T368_FARM_ACT: '1' }), A3 = FA.P;
  if (pre748(FA, '농부 귀환(T368_FARM_ACT)')) {
    const a = A3.a || {};
    ok(JSON.stringify(a.hand0) === JSON.stringify([[A3.k1, a.u], [A3.k2, a.u]]) && JSON.stringify(ks(a.led)) === JSON.stringify([A3.k1, A3.k2]) && near(su(a.led), a.st, 1e-6) && a.hand === 0,
      '★★⑨③ 농부 — 거둔 순간 손에(곁 장부) · 귀환하면 그 순간째 곳간에(새 작물 칸도 그 레코드로 감싼다)', JSON.stringify(a.led));
    ok(A3.stor === (FA.Q || {}).stor && A3.bad === 0, '⑨③ 끈 판과 곳간 값 같다 · 불변식');
  }
  const FB = pair748('farm227', { T100_FIELD_YIELD: '1', T368_FARM_ACT: '1', T227_EVEN: '1' }), B3 = FB.P;
  if (pre748(FB, '고르게 대기(T227_EVEN)')) {
    const a = B3.a || {}, b = B3.b || {}, f = B3.f || {};
    ok(a.led.length === 0 && JSON.stringify(a.pock) === JSON.stringify([[B3.k1, a.u], [B3.k2, a.u]]) && near(su(a.pock), a.pend, 1e-6),
      '★★⑨③ 고르게 켬 — 귀환한 작물이 대기 칸(`_t368Pend`)에 손의 순간째 줄로 선다(곳간엔 아직 안 든다)', JSON.stringify(a.pock));
    ok(JSON.stringify(ks(b.led)) === JSON.stringify([B3.k1]) && near(su(b.led), b.st, 1e-6) && near(su(b.pock), b.pend, 1e-6) && b.pock[0][0] === B3.k1,
      '★★⑨③ 하루치를 풀면 오래된 것부터 곳간 레코드로(지금 얻은 것이 아니다) · 남은 대기 = 줄 합', `${JSON.stringify(b.led)} · 대기 ${JSON.stringify(b.pock)}`);
    ok(JSON.stringify(f.pf) === JSON.stringify([[f.k4, f.h4]]) && JSON.stringify(ks(f.led)) === JSON.stringify([f.k4]) && near(su(f.led), f.st, 1e-6) && near(su(f.pock), f.pend, 1e-6),
      '⑨③ 추상 농부(`_t100Pend` · 곡식) — 거둔 순간의 레코드가 대기 칸을 지나 곳간에', JSON.stringify(f.led));
    ok(B3.drift === 0 && B3.bad === 0 && B3.stor === (FB.Q || {}).stor, '⑨③ 맞대기 어긋남 0 · 불변식 · 끈 판과 곳간 값 같다');
  }
  // ── ④ 짐이 몸에(T423) · ⑤ 노획 운반(T466) ──
  const W = pair748('war', { T423_RATION_ACT: '1', T466_LOOT_ACT: '1' }), R = W.P;
  if (pre748(W, '짐이 몸에 · 노획 운반(T423_RATION_ACT · T466_LOOT_ACT)')) {
    const L = R.L || {}, Et = R.Et || {}, P = R.P || {}, Pk = R.Pk || {}, Rt = R.Rt || {}, R2 = R.R2 || {};
    const s1k = ks((L.s1 || {}).food), s2k = ks((L.s2 || {}).food);
    ok(L.nb === 2 && L.cb.every((x) => x === 0) && s1k.includes(R.k0) && ks(L.pk).every((k) => k === R.k1 || k === R.k2) && s2k.every((k) => k === R.k1 || k === R.k2) && L.hand1 === 0,
      '★★⑨④ 팩 → 병사 몸 — 곳간에서 뗀 레코드를 몸마다 고르게 · 몸이 이미 든 같은 칸은 그 손의 순간째 · 짐 줄 합 = 짐', `s1 ${JSON.stringify(L.s1)} · s2 ${JSON.stringify(L.s2)}`);
    const e1 = (Et.s1 || {}).food || [], l1 = (L.s1 || {}).food || [];
    ok(Et.cb.every((x) => x === 0) && e1.length && l1.length && e1[0][0] === l1[0][0] && e1[0][1] < l1[0][1] && JSON.stringify(e1.slice(1)) === JSON.stringify(l1.slice(1)),
      '⑨④ 먹으면 오래된 것부터(같은 품목 안) · 짐 줄 합 = 짐', `${JSON.stringify(l1)} → ${JSON.stringify(e1)}`);
    ok(P.pend > 0 && P.pendL && P.pendL.every((r) => r[0] === R.kd) && near(su(P.pendL), P.pend, 1e-6),
      '★★⑨⑤ 노획(T466) — 적 곳간에서 뗀 레코드째 몸에 맡긴다', JSON.stringify(P.pendL));
    ok(JSON.stringify(R.pileL) === JSON.stringify((R.s2b || {}).food || null), '⑨⑤ 쓰러진 몸의 짐 — 그 레코드째 전장 더미로');
    ok(Pk.cb === 0 && ks((Pk.s1 || {}).food).includes(R.kd) && Pk.dBack > 0 && (Pk.dLed || []).filter((r) => r[0] === R.kd).length >= 1,
      '★⑨⑤ 줍기 — 산 몸이 실은 만큼 그 레코드 · 못 실은 곳간 몫은 그 곳간에 그 순간째', `몸 ${JSON.stringify(Pk.s1)} · 되돌림 ${Pk.dBack}`);
    const allowed = new Set([R.k0, R.k1, R.k2, R.kd]);
    ok(near(Rt.back, Rt.dA, 1e-6) && Rt.aNew.length > 0 && Rt.aNew.every((k) => allowed.has(k)) && !Rt.bag1 && !Rt.layLots && Rt.inv === 0,
      '★★⑨④ 귀환 도착(war-core `_rationLayDownAll` → 호스트 모으기) — 짐 레코드째 곳간에(노획 · 팩 · 손) · 짐 줄 · 곁 칸 비움', `새 순간 ${Rt.aNew.length} · ${JSON.stringify(Rt.aNew.map((k) => (k === R.kd ? 'kd' : k === R.k0 ? 'k0' : k === R.k1 ? 'k1' : 'k2')))}`);
    ok(near(R2.back, R2.dA, 1e-6) && JSON.stringify((R2.b3 || {}).food || null) === JSON.stringify(R2.pk2) && R2.aNew.every((k) => allowed.has(k)) && !R2.bag3,
      '⑨④ 걸어 돌아와 내려놓기(호스트 `_warRationLayDownBody`) — 그 레코드째', JSON.stringify(R2.pk2));
    ok(R.bad === 0 && glz(W.on) && R.stor === (W.Q || {}).stor && JSON.stringify(R.inv) === JSON.stringify((W.Q || {}).inv),
      '★⑨④⑤ 레코드 없는 줌 0 · 근사 0 · 불변식 · 끈 판과 곳간 · 몸 인벤 같다', JSON.stringify({ giveNoRec: W.on.gl.giveNoRec, bagIn: W.on.gl.bagIn, bagOut: W.on.gl.bagOut }));
  }
  // ── ⑥ 소굴 토벌 노획(T476) ──
  const DN = pair748('den', { T476_PUNITIVE: '1' }), N6 = DN.P;
  if (pre748(DN, '소굴 토벌(T476_PUNITIVE)')) {
    ok(JSON.stringify(N6.g0) === JSON.stringify([[N6.k1, 25], [N6.k2, 10]]) && JSON.stringify(N6.d0) === JSON.stringify(N6.g0),
      '★★⑨⑥ 갱 비축 줄 — 결성(씨앗) · 장물아비 몫은 그 순간 · 유지비는 오래된 것부터 · 소굴 어댑터가 그 줄을 곳간 줄로', JSON.stringify(N6.g0));
    ok(JSON.stringify(N6.aLed) === JSON.stringify([[N6.k1, N6.t]]) && near(su(N6.g1), N6.gf, 1e-6) && JSON.stringify(N6.d1) === JSON.stringify(N6.g1),
      '★★⑨⑥ 토벌 노획 — 소굴 곳간에서 뗀 레코드째(지금 얻은 것이 아니다) · 싸운 뒤 남은 줄을 갱에 · 다시 비춰도 같은 줄', `${JSON.stringify(N6.aLed)} · 갱 ${JSON.stringify(N6.g1)}`);
    ok(N6.dump && JSON.stringify(N6.g2) === JSON.stringify(N6.g1) && N6.cg === null && N6.drift[0] === 0 && N6.drift[1] === 0 && N6.drift[2] === 1,
      '⑨⑥ 저장 → 복원 같은 줄 · 줄 합 = 비축 · 줄 밖에서 비축을 바꾸면 센다(자명 통과 금지)', JSON.stringify(N6.drift));
    ok(N6.bad === 0 && DN.on.gl.giveNoRec === 0 && N6.stor === (DN.Q || {}).stor, '⑨⑥ 레코드 없는 줌 0 · 불변식 · 끈 판과 곳간 값 같다');
  }
  // ── ⑦ 존 경계 캐러밴(T525) ──
  const XZ = pair748('xzone', { T525_CROSS_ZONE: '1' }), Z7 = XZ.P, Q7 = XZ.Q || {};
  if (pre748(XZ, '존 경계 캐러밴(T525_CROSS_ZONE)')) {
    const g = ((Z7.mLots || {}).give) || [], rt = ((Z7.rLots || {}).ret) || [];
    ok(g.length === 1 && g[0].k === Z7.kA && JSON.stringify(Z7.bLed) === JSON.stringify([[Z7.kA, 10]]),
      '★★⑨⑦ 넘기는 기록에 짐 레코드가 실린다 — 이웃 존 곳간이 그 순간째 받는다(지금 얻은 것이 아니다)', JSON.stringify(Z7.bLed));
    ok(rt.length >= 1 && rt.every((r) => r.k === Z7.kB) && JSON.stringify(Z7.aLed) === JSON.stringify([[Z7.kB, Z7.dFishA]]) && Z7.cDone,
      '★★⑨⑦ 되사 온 짐 — 돌려보내는 기록에 그 존 곳간 레코드째 · 집 곳간이 그 순간째 받는다', JSON.stringify(Z7.aLed));
    ok(Z7.m === Q7.m && Z7.r === Q7.r && Q7.mLots === null && Q7.rLots === null && Z7.stor === Q7.stor && Z7.bad.every((x) => x === 0),
      '★⑨⑦ 끄면 기록에 칸이 안 선다 · 그 밖의 기록 글자 · 두 존 곳간 값 같다 · 불변식', `기록 ${Z7.m === Q7.m ? '같음' : '다름'}`);
  }
}

say('\n⑩ [T748] 거래소 받기 — 열량 짝(꺼내기 · 게시판 보상과 같은 `kcal.itemsOf`) · 끔 = 종전 1개 = 1단위');
{
  //   ★[T955 2026-10-27] 열다섯째 판(`T931_SLOTK_EMA` 켬 기본) 세계 그대로 돈다 — T943 의 `=0` 묶음을 지웠다(단언 무변). 픽스처 날만 다시 골랐다(`fresh` 200 → 250날).
  //     '계획 단위 → 낱개' 셈(`avg × 낼 것`)은 낼 것 6 이 재고 상한에 안 걸린 판의 식이다 — 시드 7 · 마을 5 의 200날은 켬 기본 세계에서 마을0 이
  //     돌을 내고 고기를 받아 상한에 걸린다(낼 것 6 → 실행 1). 둘레 날(100 ~ 300)에서 상한이 걸리는 날은 두 세계가 서로 다르다 — 250날은
  //     두 세계(켬 기본 · 되돌림 `=0`) 다 안 걸리고 245 · 255날도 두 세계 다 선다(보고 T955 §1 · 둘레 표 `계측/T955_픽스처둘레_2026-10-27.json`).
  const T0 = sub748('trade', {}, true, { T748_TK: '0' }), T1 = sub748('trade', {}, true, { T748_TK: '1' });
  const a = (T0.trade || {}), b = (T1.trade || {});
  ok(!T0.err && !T1.err && a.res && a.res === b.res && a.give === b.give && a.kcal > 0 && Math.abs(a.kcal - a.DAY) > 1, '⑩ [상황] 두 판 — 낱개 열량이 하루치와 다른 식량을 받는다(같은 것을 내고)', `${a.give} → ${a.res}(${a.kcal}kcal · 하루치 ${a.DAY})`);
  const A0 = a.a || {}, A1 = b.a || {};
  ok(A0.x && A0.x.ok && A0.q.take === A0.x.take && near(A0.dStock, A0.x.take, 2e-3), '⑩ 종전(`takeKcal` 없음) — 받는 낱개 = 곳간에서 나간 단위(1개 = 1단위) · 견적 = 실행', `${A0.x && A0.x.take}개 · ${A0.dStock}단위`);
  const per = b.kcal / b.DAY;
  ok(A1.x && A1.x.ok && A1.q.take === A1.x.take && near(A1.x.takeUnits, A1.x.take * per, 1e-3) && near(A1.dStock, A1.x.takeUnits, 2e-3),
    '★★⑩ 열량 짝 — 받는 낱개 × 낱개 열량 = 곳간에서 나간 단위(넣기 `_unitsOfFor` 와 같은 축) · 견적 = 실행', `${A1.x && A1.x.take}개 × ${per.toFixed(4)} = ${A1.x && A1.x.takeUnits}단위 · 곳간 −${A1.dStock}`);
  const took = A1.q.avg * A1.q.give;
  ok(A1.x && A1.x.take === Math.floor(took / per + 1e-6), '⑩ 낱개 = 그 단위에 드는 열량만큼(`itemsOf` · 남는 몫은 곳간에 — 소멸 0)', `계획 ${took.toFixed(4)}단위 → ${A1.x && A1.x.take}개`);
  ok(b.board.res && a.board.res && b.board.res.sell === Math.floor(a.board.res.sell / per + 1e-6) && b.board.food.sell === a.board.food.sell,
    '⑩ 시세표 "팔 재고"도 받을 낱개로(곡식은 하루치 = 1개라 그대로)', `${a.board.res.sell} → ${b.board.res.sell}개`);
  const F0 = a.food || {}, F1 = b.food || {}, N0 = a.nk || {}, N1 = b.nk || {};
  ok(F0.x && F1.x && F0.x.take === F1.x.take && F0.dStock === F1.dStock, '⑩ 곡식(낱개 = 하루치) — 두 판 같다');
  ok(a.nres && N0.x && N1.x && N0.x.ok === N1.x.ok && N0.x.take === N1.x.take && N0.dStock === N1.dStock && N1.x.takeUnits === undefined,
    '⑩ 열량 없는 것(광물 · 가죽 …) — 종전 그대로 1개 = 1단위', `${a.nres} ${N0.x && N0.x.take} = ${N1.x && N1.x.take}`);
  const W0 = a.want || {}, W1 = b.want || {};
  ok(W1.x && W1.x.ok && W1.x.take >= 5 && W1.x.give === W1.q.giveNeeded && W0.x && W0.x.give === W0.q.giveNeeded,
    '⑩ 받을 개수로 주문 — 견적의 올림 = 실행(두 판 · 열량 짝은 낱개 → 단위가 `econUnitsOf`)', `종전 ${W0.x && W0.x.give}개 내고 ${W0.x && W0.x.take} · 짝 ${W1.x && W1.x.give}개 내고 ${W1.x && W1.x.take}`);
}

say('\n⑪ [T748] 배선 — 켬일 때만 닿는 줄 · 끄면 안 꽂는다(글자)');
{
  const fs = require('fs');
  const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
  const VS = code('server/villages.js'), BS = code('server/bandits.js'), ES = code('sim/economy-sim.js'), WS = code('sim/war-core.js'), E2 = code('sim/economy-sim-v2.js'), TS = code('server/trade.js');
  ok(/_T732_ON \? Trade\.board\(state\.ledger, state\.econV2, g\.vil, vid \| 0, inventory, numeraire, _kcal\(\)\) : Trade\.board\(/.test(VS)
    && /_T732_ON \? \{ want: \(opts && opts\.want\) \|\| 0, perItem: per, takeKcal: _kcal\(\) \} : \{ want: \(opts && opts\.want\) \|\| 0, perItem: per \}/.test(VS)
    && /\.\.\.\(_T732_ON \? \{ takeKcal: _kcal\(\) \} : \{\}\)/.test(VS),
    '★⑩ 거래소 세 문(시세 · 견적 · 실행)이 켬일 때만 `takeKcal`(kcal 정본)을 넘긴다 · 끄면 종전 인수 그대로');
  ok(/function _takeConv\(K, item\) \{/.test(TS) && /K\.itemsOf\(item, u\)/.test(TS) && /K\.econUnitsOf\(item, n\)/.test(TS) && !/Math\.floor\(plan\.took\)\s*;/.test(TS.replace(/conv \? conv\.items\(plan\.took\)\.items : Math\.floor\(plan\.took\)/, '')),
    '⑩ 받는 쪽 환산은 정본 짝 둘(`itemsOf` · `econUnitsOf`) — 새 수 0 · 끔 갈래는 종전 `Math.floor`');
  ok(/if \(T227_EVEN && _LOTH\) _LOTH\.pendIn\(v, '_t368Pend', crop, units\);/.test(ES) && /if \(T227_EVEN && _LOTH\) _LOTH\.pendIn\(v, '_t100Pend', 'food', amt\);/.test(ES)
    && (ES.match(/if \(_LOTH\) _LOTH\.pendOut\(/g) || []).length === 2 && /let _LOTH = null;/.test(ES) && /setLotHook,/.test(ES),
    '⑨③ econ 고르게 대기 — 훅 줄 넷(들기 둘 · 풀기 둘) · 호스트가 안 꽂으면 무동작(랩 · CLI)');
  ok(/E1\.setLotHook\(G\.hooks\)/.test(VS) && /B\.lotsBoot\(G\)/.test(VS), '⑨ 존 부팅(`_t732Boot` — 켬만 도는 그 함수)이 econ 대기 칸 훅 · 갱 줄을 꽂는다');
  ok(/const _T748_ON = \(typeof process !== 'undefined' && !!process\.env && process\.env\.T732_MOMENT_LOT !== '0'\);/.test(BS)   // ★[T778] 켬 기본
    && /function _gl\(\) \{ if \(!_T748_ON\) return null;/.test(BS)
    && /if \(_G\) gs\.forEach\(\(g, i\) => \{ if \(g\.food > _f0\[i\]\) _G\.gangIn\(g, g\.food - _f0\[i\]\); \}\);/.test(BS)
    && (BS.match(/_G\.gangIn\(g, g\.food, true\)/g) || []).length === 2 && /_G\.gangOut\(g, _f0 - g\.food\)/.test(BS) && /gangs\[i\]\._t748Lots = L/.test(BS) && /lotsBoot\(_gl\(\)\);/.test(BS),
    '⑨⑥ 도적 — 비축이 바뀌는 네 자리(장물아비 · 결성 · 재결성 · 유지비) · 저장 · 복원 · 끄면 장부 모듈을 싣지도 않는다');
  ok(/_G\.gangOut\(den\._den\.gang, den\._den\.gang\.food \|\| 0\)/.test(VS) && /_G\.denAttach\(e, g\)/.test(VS) && /_G\.denSync\(den\.econ, g\)/.test(VS),
    '⑨⑥ 소굴 — 비춤(갱 줄 → 어댑터) · 싸운 뒤(어댑터 → 갱) · 흩어진 갱(줄도 같이)');
  ok(/opts\.lootCarry\(w, t\.items, kind, t\.lots \|\| null\)/.test(WS) && /w\._packSplitLots = o;/.test(WS) && /const _ll = \(_LOTH && w\._layLots\) \? w\._layLots : null;/.test(WS)
    && /function lootGive\(e, items, lots\)[^\n]*_warFoodGive\(e, items, 1, lots \|\| null\)/.test(WS),
    '⑨④⑤ war-core — 노획 레코드를 호스트에 · 팩 레코드를 몸으로 · 내려놓기 · 되돌림이 레코드째(끄면 `_LOTH` null)');
  ok((E2.match(/if \(_LOTH && _LOTH\.xzOut\) \{ const L = _LOTH\.xzOut\(c\); if \(L\) _m\.lots = L; \}/g) || []).length === 2
    && (E2.match(/if \(_LOTH && _LOTH\.xzIn && r\.lots\) _LOTH\.xzIn\(c, r\.lots\);/g) || []).length === 2,
    '⑨⑦ 존 경계 — 기록 둘(\'arrive\' · \'return\')에 짐 레코드 · 받는 둘이 다시 싣는다(끄면 칸이 안 선다)');
  ok(/const _d = _G \? _G\.doorOpen\(vil\.econ\) : false;\s*\n\s+const g = _lifeEcon\(\)\.forageToGranary\(vil\.econ, k, u\) \|\| 0;\s*\n\s+if \(_d\) _G\.doorShut\(vil\.econ, k, _G\.handRecs\(npc, h, g\)\);/.test(VS)
    && /const _d = _G \? _G\.doorOpen\(vil\.econ\) : false;\s*\n\s+const g = _lifeEcon\(\)\.forageToGranary\(vil\.econ, it, u\) \|\| 0;\s*\n\s+if \(_d\) _G\.doorShut\(vil\.econ, it, _G\.pockTake\(vil\.econ, '_t544Pack', h, g\)\);/.test(VS)
    && /const got = _lifeEcon\(\)\.fishToGranary\(vil\.econ, u\) \|\| 0;\s*\n\s+if \(_d\) _G\.doorShut\(vil\.econ, 'fish', _t748FishRecs\(_G, npc\)\);/.test(VS),
    '⑨①② 곳간 입구 줄은 글자 그대로 — 그 앞에서 문을 열고 뒤에서 받은 몫만큼 손 레코드로 닫는다');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
