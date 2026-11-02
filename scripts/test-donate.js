#!/usr/bin/env node
// @regress
// === scripts/test-donate.js — 기부 문(누구나 · 상시 · 보상 0) · 꺼내기 = 촌장만 · 겨울 프로젝트 없음 (T769 · ★T779 켬 기본 — 손잡이 T769_DONATE='0' 만 끔) ===
//
// ★왜 [재민 10-15 판정 · T732 §8 ⑥ "거래로만 넣는다"와 회관 넣기 · 겨울 몫] *"기부는 가능해. 마음대로 빼는 건 안 돼. 그러니까 거래와 기부를
//   따로 둬야 하고, 관리자만 뺄 수 있어."* · *"겨울 프로젝트 없어. 기부는 상시 되고 보상도 없음."*
// ★[T779 2026-10-18] 새 세계 — 기부 상시(기본 켬) · 꺼내기 촌장만(손잡이 밖 — 옛 기여 한도 인출은 걷었다) · 겨울 프로젝트 걷음(`server/winter.js` 없음).
//
//  기본(손잡이 없음) — ① 비관리자 회관 기부 ok(근접 200 · 관리자 게이트 없음) ② NPC 마을 `/기부 <품목> [양]` ok(게시판과 같은 근접 게이트 · 우리말 품목 이름)
//       · 거래소 패널 한 줄(`village_donate`) ok · 먼 곳 거절 ③ 기여 안 오름(계량기 = 온보딩 정본 하나 · 대조: 게시판 납품 훅은 올린다)
//       ④ 꺼내기 = 촌장만 — 비관리자 · 마을 사람(촌장 아님) 거절 · 촌장(창설자) 한도 없음 · 길드 마을 = central `leader_id` · central 불가 = 거절 ·
//       NPC 마을 = 사람 꺼내기 0 · `/곳간 열기|잠금` 한 줄 · `/곳간` 형편 줄 · 채팅 꺼내기(`/곳간 <품목>` · `/인출`)
//       ⑤ 겨울 프로젝트 없음(파일 · 게시판 머리줄 · 납품 안 겨울 갈래 · 한도 함수) ⑥ 화면 칸(회관 `inv.donate` · 거래소 `member.chief`·`donate`)
//  끔('0') — ⑦ 기부 문 셋만 닫힌다(비관리자 회관 거절 · `/기부` 는 명령이 아니다 · 패널 문 닫힘 · 기부 말 없음) · 꺼내기는 그대로 촌장만.
//
// 포트 0: 존을 하위 실행에서 `PORT=0`(임시 포트)으로 적재한다 — 하네스가 포트를 쥐지 않는다(밤 러너 포트 충돌 교훈 · `test-terraincache` 꼴).
// 실행: node scripts/test-donate.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 하위 실행 — 존 하나(가벼운 판) + 랩 econ 마을 다섯(정본 진입점 · test-granary-age 꼴) ═══════════════════════
if (process.env.T769_SUB === 'zone') {
  const TMP = `/tmp/t769-donate-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = '0';
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.ONB_ENABLE = '1';
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const done = (o) => { _log(JSON.stringify(o)); try { for (const f of [TMP, TMP + '-wal', TMP + '-shm']) fs.unlinkSync(f); } catch (e) {} process.exit(0); };
  const Zone = require(SV('zone.js'));
  const H = Zone.__testBind();
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const Events = require(SV('events.js'));
  const Onb = require(SV('onboarding.js'));
  const V = H.SimVillages, M = H.Membership;
  const out = { knob: process.env.T769_DONATE == null ? null : process.env.T769_DONATE, on: H.T769, mOn: M.T769, errs: [] };
  (async () => {
    const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
    const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
    L.prime(world);
    const P = V.__labProbe._memberProbe;
    const vils = world.villages.map((e, i) => ({ name: `랩마을${i}`, ccx: 100 + i * 40, ccy: 100, dbId: i, econ: e }));
    P.setup(L, vils);
    //   회관 화면 갱신(`playerVillageInventory`)이 부르는 econ 정본 — 랩은 `Villages.init` 을 안 불러 비어 있다(test-hall-units ⚠ 그 자리).
    //   `_distProbe.setup` 이 꽂는 그 칸 하나만(세계 · 격자 문맥은 null 그대로 = 지금 값).
    V.__labProbe._distProbe.setup(null, null, null, require(path.join(ROOT, 'sim', 'economy-sim')));
    // 마을 넷 — 0 사람 마을(창설자 · 길드 없음 · 회관) · 1 길드 마을(77 · central 이 아는 촌장) · 2 길드 마을(78 · central 불가) · 3 NPC 마을
    const CHIEF = 'anon_t769_chief', GLEAD = 'anon_t769_glead';
    vils[0].econ.founder = CHIEF;
    vils[1].econ.founder = 'anon_t769_f1'; vils[1]._tribeId = 77;
    vils[2].econ.founder = 'anon_t769_f2'; vils[2]._tribeId = 78;
    //   ★[T786] T785 켬 — 사람 마을의 촌장은 **마을 칸**(부팅 복원 · 창설이 붙이는 칸 `VillageKin.attach` · 촌장 = 창설자). 랩은 `Villages.init` 을
    //     안 불러 칸이 비어 있다 ⇒ 정본 함수로 같은 칸을 붙인다(회관 행 data 없음 = 기본값 · 끔이면 안 붙인다 = 종전 판 그대로).
    const VK = require(SV('village-kin.js'));
    out.kin = VK.ON;
    if (VK.ON) for (const v of vils) VK.attach(v, {}, null);
    const AT = vils.map((v) => P.anchorPx(v));
    for (const v of vils) { v.econ.storage.food = 4000; v.econ.storage.wood = 500; }
    const HALL = 'b_t769_hall';
    H.buildings.set(HALL, { id: HALL, type: 'village_hall', x: AT[0].x, y: AT[0].y, data: { x0: vils[0].ccx, y0: vils[0].ccy, villageDbId: 0, owner: CHIEF } });
    // central — 길드 77 만 안다(촌장 GLEAD) · 그 밖은 못 묻는다(던진다)
    let cAsk = 0;
    H.central.request = async (m, p) => { cAsk++; if (m === 'GET' && p === '/tribe/77') return { status: 200, data: { tribe: { leader_id: GLEAD } } }; throw new Error('central down'); };
    const msgs = new Map();   // pid → 받은 메시지
    const mkP = (playerId, vid) => {
      const p = { pid: `p_${playerId}`, playerId, name: playerId.replace('anon_t769_', ''), persistent: false,
        x: AT[vid].x, y: AT[vid].y, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
        inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
        isNpc: false, isDown: false, vx: 0, vy: 0, member: null };
      const box = []; msgs.set(playerId, box);
      p.ws = { readyState: 1, send: (s) => { try { box.push(JSON.parse(s)); } catch (e) {} } };
      const s = Onb.stateOf(playerId); s.start_vid = vid; s.arrived = 1; s.contrib = 0; s.lot_ok = 0; Onb.__probe.save(playerId, s);
      return p;
    };
    const notes = (p) => (msgs.get(p.playerId) || []).filter((o) => o.type === 'notice').map((o) => o.text);
    const last = (p) => { const n = notes(p); return n[n.length - 1] || ''; };
    const st = (vid, res) => +(Number(vils[vid].econ.storage[res || 'food']) || 0).toFixed(4);
    const safe = (tag, fn) => { try { return fn(); } catch (e) { out.errs.push(`${tag}:${String(e && e.message || e)}`); return null; } };
    let lastProm = false;   // 방금 꺼내기 문이 Promise 를 냈나(central 을 물었나)
    const wd = async (p, vid, q) => { const s0 = st(vid); const r = safe('wd', () => H.tryVillageWithdraw(p, vid, 'food', q)); lastProm = !!(r && typeof r.then === 'function'); if (lastProm) await r; return +(s0 - st(vid)).toFixed(4); };

    // ① 비관리자 회관 기부
    const p1 = mkP('anon_t769_p1', 0);
    p1.inventory.wood = 5;
    const w0 = st(0, 'wood');
    safe('hall', () => H.tryVillageDeposit(p1, HALL, { wood: 5 }));
    out.hall = { stockUp: +(st(0, 'wood') - w0).toFixed(4), invLeft: p1.inventory.wood || 0, note: last(p1) };
    // ② NPC 마을 `/기부` — 앞에 선 마을(브리핑 · 거래소가 적어 두는 자리) · 키 이름 · 우리말 이름
    const p2 = mkP('anon_t769_p2', 3);
    p2.inventory.wood = 4; p2._memberNearVid = 3;
    const n0 = st(3, 'wood');
    out.chatKey = safe('chat1', () => M.handleChat(p2, '/기부 wood 3'));
    out.npc = { stockUp: +(st(3, 'wood') - n0).toFixed(4), invLeft: p2.inventory.wood || 0, note: last(p2) };
    const lbl = String((H.ITEM_LABEL_SERVER || {}).wood || '');
    out.woodKo = require(SV('itemlabel.js')).koOfLabel(lbl);
    const n1 = st(3, 'wood');
    out.chatKo = safe('chat2', () => M.handleChat(p2, `/기부 ${out.woodKo} 1`));
    out.npcKo = { stockUp: +(st(3, 'wood') - n1).toFixed(4), invLeft: p2.inventory.wood || 0, note: last(p2) };
    // 거래소 패널의 기부 메시지(`village_donate`) — 기부 문이 열린 판에서만
    p2.inventory.wood = (p2.inventory.wood || 0) + 2;
    const n2 = st(3, 'wood');
    safe('msg', () => H.tryVillageDonate(p2, 3, { wood: 2 }));
    out.panel = { stockUp: +(st(3, 'wood') - n2).toFixed(4), invLeft: p2.inventory.wood || 0, note: last(p2) };
    // 먼 곳 — 근접 게이트
    const pf = mkP('anon_t769_far', 3); pf.inventory.wood = 2; pf.x += 10000;
    const n3 = st(3, 'wood');
    safe('far', () => H.tryVillageDonate(pf, 3, { wood: 2 }));
    out.far = { stockUp: +(st(3, 'wood') - n3).toFixed(4), note: last(pf) };
    // ③ 기여 — 기부한 사람의 계량기 · 대조(게시판 납품 훅은 올린다)
    out.contrib = { p1: M.contribOf(p1.playerId), p2: M.contribOf(p2.playerId) };
    const pc = mkP('anon_t769_ctrl', 0);
    Onb.onDeliver(pc, { ok: true, done: true, req: { item: 'food' } }, 0);
    out.contribCtrl = M.contribOf(pc.playerId);
    // ④ 비관리자 · 비소속 꺼내기
    out.wdP1 = { took: await wd(p1, 0, 3), note: last(p1) };
    // 촌장(창설자) — 한도 없음 · 하루 여러 번
    const pC = mkP(CHIEF, 0);
    M.seatFounder(pC, 0);
    out.wdC1 = { took: await wd(pC, 0, 5), note: last(pC) };
    out.wdC2 = { took: await wd(pC, 0, 5), note: last(pC) };
    //   창설자 판정은 그 자리에서 선다 — 문이 Promise 를 안 내고, 돌아온 그때 곳간이 이미 줄었다(기다림 0)
    { const s0 = st(0); const r = safe('sync', () => H.tryVillageWithdraw(pC, 0, 'food', 1)); out.sync = { prom: !!(r && typeof r.then === 'function'), took: +(s0 - st(0)).toFixed(4) }; }
    // 마을 사람(촌장 아님) — 기여 12 로 든 사람 · 드는 길 = 채팅 `/소속`(촌장이 권한 뒤)
    const pM = mkP('anon_t769_member', 0);
    for (let i = 0; i < M.CFG.N_MEMBER; i++) { Onb.onDeliver(pM, { ok: true, done: true, req: { item: 'food' } }, 0); M.onDeliver(pM, { ok: true, done: true, req: { item: 'food' } }, 0); }
    out.acceptNote = { r: safe('acc', () => M.handleChat(pM, '/소속')), note: last(pM) };
    out.accept = { ok: !!M.isMemberHere(pM, 0) };
    out.wdM = { took: await wd(pM, 0, 1), note: last(pM), member: M.isMemberHere(pM, 0) };
    // 길드 마을 — central 이 아는 촌장 · 아닌 사람 · 캐시 창
    const pG = mkP(GLEAD, 1); const pX = mkP('anon_t769_x', 1);
    out.wdG = { took: await wd(pG, 1, 2), note: last(pG), prom: lastProm };
    out.wdX = { took: await wd(pX, 1, 2), note: last(pX), prom: lastProm };
    out.wdG2 = { took: await wd(pG, 1, 1), prom: lastProm };   // 캐시 창 안 — 다시 안 묻는다
    if (out.kin) { const pF1 = mkP('anon_t769_f1', 1); out.wdF1 = { took: await wd(pF1, 1, 2), note: last(pF1), prom: lastProm }; }   // ★[T786] 켬 = 촌장은 창설자(마을 칸)
    // central 불가
    const pH = mkP('anon_t769_f2', 2);
    out.wdH = { took: await wd(pH, 2, 2), note: last(pH) };
    // NPC 마을 꺼내기
    const pN = mkP('anon_t769_npcw', 3);
    out.wdN = { took: await wd(pN, 3, 2), note: last(pN) };
    // `/곳간 잠금` · `/곳간`(형편 한 줄)
    out.lock = { r: safe('lock', () => M.handleChat(pC, '/곳간 잠금')), note: last(pC) };
    pC._memberNearVid = 0;
    out.look = { r: safe('look', () => M.handleChat(pC, '/곳간')), note: last(pC) };
    // 채팅 꺼내기(촌장) — `/곳간 <품목> [양]` · `/인출 [양]` — 같은 촌장 문 · 같은 뒷정리
    { const s0 = st(0); safe('chatwd', () => M.handleChat(pC, '/곳간 food 2')); await new Promise((r) => setTimeout(r, 50)); out.chatWd = { took: +(s0 - st(0)).toFixed(4), note: last(pC) }; }
    { const s0 = st(0); safe('chatwd2', () => M.handleChat(pC, '/인출 3')); await new Promise((r) => setTimeout(r, 50)); out.chatWd2 = { took: +(s0 - st(0)).toFixed(4), note: last(pC) }; }
    //   마을 사람의 `/인출` 도 같은 촌장 문에서 막힌다(옛 "오늘 몫" 갈래 없음)
    { const s0 = st(0); safe('chatwdM', () => M.handleChat(pM, '/인출')); await new Promise((r) => setTimeout(r, 50)); out.chatWdM = { took: +(s0 - st(0)).toFixed(4), note: last(pM) }; }
    // ⑤ 겨울 프로젝트 없음 — 파일 · 게시판 머리줄 · 납품 안 겨울 갈래 · 한도 함수
    out.winterFile = fs.existsSync(SV('winter.js'));
    out.winterReq = (() => { try { require(SV('winter.js')); return 'loaded'; } catch (e) { return e && e.code; } })();
    //   게시판 소식 줄이 오늘 날짜(`state.world.day`)를 읽는다 — 랩은 그 칸이 비어 있다. 이 한 번만 econ 세계를 꽂고 곧 되돌린다(⑥ 은 지금 값 그대로).
    const E1 = require(path.join(ROOT, 'sim', 'economy-sim'));
    V.__labProbe._distProbe.setup(null, null, world, E1);
    const bd = safe('board', () => V.villageBoard(0, AT[0].x, AT[0].y));
    V.__labProbe._distProbe.setup(null, null, null, E1);
    out.board = bd ? { ok: !!bd.ok, keys: Object.keys(bd).sort(), head: Object.prototype.hasOwnProperty.call(bd, 'head') } : null;
    //   납품 — 품목 미지정 길(서버가 고른다)을 그대로 부른다. 품목 지정 길은 곧장 장부 정본(`Events.deliverToVillage`)으로 가는데
    //   랩은 villages.js 의 장부 모듈 칸을 안 세운다(`_initLedger` = 존 부팅) ⇒ 그 길은 본문(소스)으로 본다: 겨울 갈래 · 겨울 표지 0.
    { const inv2 = { food: 5 }; const r2 = safe('deliver2', () => V.villageDeliver(3, AT[3].x, AT[3].y, inv2, null, null));
      const src = String(V.villageDeliver);
      out.deliver = { err2: r2 && r2.err, left2: inv2.food, winter2: !!(r2 && r2.winter), foodReq: (L.board(3) || []).filter((x) => x.item === 'food').length,
        srcWinter: /Winter\.|winter\s*:\s*true|goalRes/.test(src), srcLedger: /Events\.deliverToVillage\(/.test(src) }; }
    out.limitFns = [typeof M.limitOf, typeof M.remainOf, typeof M.granaryOpen];
    // ⑥ 화면 칸 — 회관 재고(관리자) · 거래소 소속 줄
    safe('inv', () => H.tryVillageInventory(pC, HALL));
    const inv = (msgs.get(CHIEF) || []).filter((o) => o.type === 'village_inventory').pop();
    out.invDonate = inv && inv.inv ? (inv.inv.donate === undefined ? 'undefined' : inv.inv.donate) : 'none';
    const ms = M.publicState(pC, vils[0]);
    const mm = M.publicState(pM, vils[0]);
    out.pub = { keys: Object.keys(ms).sort(), chief: ms.chief === undefined ? 'undefined' : ms.chief, donateN: Array.isArray(ms.donate) ? ms.donate.length : 'undefined',
      memberChief: mm.chief, hasLimit: ('limit' in ms) || ('remain' in ms) };
    out.cAsk = cAsk;
  })().then(() => done(out)).catch((e) => { out.errs.push('top:' + String(e && e.stack || e).slice(0, 400)); done(out); });
  return;
}

// ══ 본 실행 — 기본(손잡이 없음) · 끔('0') · 다른 값('true') 세 판을 같은 하위 실행으로 ═══════════════════════
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const BASE_ENV = (() => { const e = Object.assign({}, process.env); delete e.T769_DONATE; delete e.T769_SUB; return e; })();
const sub = (env) => {
  const txt = execFileSync(process.execPath, [__filename], { env: Object.assign({}, BASE_ENV, env, { T769_SUB: 'zone' }), stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim();
  return JSON.parse(txt.split('\n').filter((l) => l.startsWith('{')).pop());
};
console.log('\n=== T769 · T779 — 기부(누구나 · 상시 · 보상 0) · 꺼내기 = 촌장만 · 겨울 프로젝트 없음 ===');
const ON = sub({});
const OFF = sub({ T769_DONATE: '0' });
const KNOB = sub({ T769_DONATE: 'true' });

console.log('\n① 손잡이 — 켬 기본(T779) · `0` 만 끔');
ok(ON.on === true && ON.mOn === true && OFF.on === false && OFF.mOn === false, "없음 = 켬 · '0' = 끔(존 · membership 같은 손잡이)", `없음 ${ON.on}/${ON.mOn} · '0' ${OFF.on}/${OFF.mOn}`);
ok(KNOB.on === true && KNOB.mOn === true, "다른 값('true')도 켬 — 끄는 값은 '0' 하나", `${KNOB.on}/${KNOB.mOn}`);
ok(!ON.errs.length && !OFF.errs.length && !KNOB.errs.length, '하위 실행 오류 0', JSON.stringify({ on: ON.errs, off: OFF.errs, t: KNOB.errs }).slice(0, 300));

console.log('\n② 기부 문 셋(회관 · `/기부` · 거래소 패널) · 누구나 · 받는 것 없음');
ok(ON.hall.stockUp > 0 && ON.hall.invLeft === 0 && /내놓았습니다/.test(ON.hall.note) && /대가는 없습니다/.test(ON.hall.note),
  '★비관리자 회관 기부 ok — 곳간이 늘고 손이 비었다 · "기부했다 … 받는 것 없음"', `${ON.hall.stockUp} · ${ON.hall.note}`);
ok(ON.chatKey === true && ON.npc.stockUp > 0 && ON.npc.invLeft === 1 && /내놓았습니다/.test(ON.npc.note),
  '★NPC 마을 `/기부 wood 3` ok — 3 낸다(1 남음) · 곳간이 는다', `${ON.npc.stockUp} · 남음 ${ON.npc.invLeft} · ${ON.npc.note}`);
ok(ON.chatKo === true && ON.npcKo.stockUp > 0 && ON.npcKo.invLeft === 0, `우리말 품목 이름 \`/기부 ${ON.woodKo} 1\` 도 같은 풀이(\`/곳간\` 의 표 — 사본 0)`, `${ON.npcKo.stockUp} · ${ON.npcKo.note}`);
ok(ON.panel.stockUp > 0 && ON.panel.invLeft === 0, '거래소 패널의 기부 메시지(`village_donate`) ok', `${ON.panel.stockUp} · ${ON.panel.note}`);
ok(ON.far.stockUp === 0 && /멀|멉|가까이|떨어/.test(ON.far.note), '먼 곳은 거절 — 게시판과 같은 근접 게이트', ON.far.note);

console.log('\n③ 기여 — 기부는 계량기를 안 올린다');
ok(ON.contrib.p1 === 0 && ON.contrib.p2 === 0, '★기부한 두 사람의 기여 0 그대로', JSON.stringify(ON.contrib));
ok(ON.contribCtrl === 1, '대조 — 게시판 납품 훅(`Onboarding.onDeliver`)은 같은 계량기를 1 올린다(자명 통과 금지)', String(ON.contribCtrl));

console.log('\n④ 꺼내기 = 촌장만(한도 없음)');
ok(ON.wdP1.took === 0 && /촌장/.test(ON.wdP1.note), '★비관리자 꺼내기 거절', ON.wdP1.note);
ok(ON.wdC1.took === 5 && ON.wdC2.took === 5 && /한도가 없습니다/.test(ON.wdC1.note), '★촌장(창설자) 꺼내기 ok — 같은 날 5 · 5(하루 몫 없음)', `${ON.wdC1.took} · ${ON.wdC2.took} · ${ON.wdC1.note}`);
ok(ON.sync.prom === false && ON.sync.took > 0, '창설자 촌장 판정은 그 자리에서 선다(동기 — 기다림 0)', JSON.stringify(ON.sync));
ok(ON.accept.ok && ON.wdM.member && ON.wdM.took === 0 && /촌장/.test(ON.wdM.note), '★마을 사람(촌장 아님) 꺼내기 거절 — 소속은 그대로', ON.wdM.note);
ok(ON.acceptNote.r === true && /오늘부터 자네는/.test(ON.acceptNote.note) && !/곳간을 열어|\/인출/.test(ON.acceptNote.note), '마을 사람에게 "곳간을 열어 두겠네(/인출)" 말이 안 간다(걷음)', ON.acceptNote.note);
//   ★[T786 ②] T785 켬 — 촌장은 **마을 칸 하나**(이행 뒤 촌장 = 창설자 · 넘기기는 `/촌장`) · central `leader_id` 조회 · 캐시 창이 없다.
//   ★[T809] T779(main) 의 단정과 T785~T787 의 켬 갈래를 같이 산다 — 길드 · central 갈래는 끔(`T785_VILLAGE_ONLY=0`)에서만.
if (ON.kin) {
  ok(ON.wdG.took === 0 && /촌장/.test(ON.wdG.note) && ON.wdX.took === 0 && ON.wdF1 && ON.wdF1.took > 0,
    '★[켬 T785] 옛 길드 마을 — 촌장 = 마을 칸(창설자) · 옛 길드장(central `leader_id`)은 촌장이 아니다', `길드장 ${ON.wdG.took} · 남 ${ON.wdX.took} · 창설자 ${ON.wdF1 && ON.wdF1.took}`);
  ok(ON.wdH.took > 0, '★[켬 T785] central 불가여도 촌장(창설자)은 꺼낸다 — 촌장 판정이 central 을 안 묻는다', `${ON.wdH.took} · ${ON.wdH.note}`);
} else {
ok(ON.wdG.took > 0 && ON.wdX.took === 0 && /촌장/.test(ON.wdX.note), '★길드 마을 — central `leader_id` 가 촌장(맞으면 ok · 아니면 거절)', `${ON.wdG.took} · ${ON.wdX.note}`);
ok(ON.wdH.took === 0 && /확인하지 못했다/.test(ON.wdH.note), '★central 불가 = 거절(빼는 문은 닫힌 쪽)', ON.wdH.note);
}
if (ON.kin) ok(ON.wdG.prom === false && ON.wdX.prom === false && ON.wdG2.prom === false && ON.wdF1 && ON.wdF1.prom === false && ON.cAsk === 0,
  '★[켬 T785] 촌장 판정은 늘 그 자리에서(동기) — central 묻기 0 · 캐시 창 없음',
  `묻기 ${ON.cAsk} · ${[ON.wdG, ON.wdX, ON.wdG2, ON.wdF1].map((x) => x && x.prom).join('/')}`);
else ok(ON.wdG.prom === true && ON.wdX.prom === false && ON.wdG2.prom === false && ON.wdG2.took > 0 && ON.cAsk === 2,
  '길드 촌장 — 캐시가 비면 central 을 묻고 그 뒤(비동기) · 캐시 창(`GRAN_TTL_MS`) 안이면 그 자리에서 · 묻는 수 = 빈 캐시 둘(77 · 78)',
  `묻기 ${ON.cAsk} · 첫 ${ON.wdG.prom} · 남 ${ON.wdX.prom} · 둘째 ${ON.wdG2.prom}/${ON.wdG2.took}`);
ok(ON.wdN.took === 0 && /사람이 열지 않습니다/.test(ON.wdN.note), 'NPC 마을 = 사람 꺼내기 0', ON.wdN.note);
ok(ON.lock.r === true && /촌장만 열 수 있습니다/.test(ON.lock.note), '`/곳간 잠금` 은 한 줄로 답한다(길드 곳간 잠금 걷음)', ON.lock.note);
ok(/꺼내는 것은 촌장만/.test(ON.look.note) && /내놓는 것은 누구나/.test(ON.look.note) && !/남은 몫|누적 기여/.test(ON.look.note), '`/곳간` 형편 한 줄 — 한도 말 없음 · 기부 꼬리', ON.look.note);
ok(ON.chatWd.took === 2 && ON.chatWd2.took === 3, '채팅 꺼내기(촌장 `/곳간 food 2` · `/인출 3`) — 같은 촌장 문 · 같은 뒷정리', `${ON.chatWd.took} · ${ON.chatWd2.took} · ${ON.chatWd2.note}`);
ok(ON.chatWdM.took === 0 && /촌장/.test(ON.chatWdM.note), '마을 사람의 `/인출` 도 촌장 문에서 막힌다(옛 "오늘 몫" 갈래 없음)', ON.chatWdM.note);

console.log('\n⑤ 겨울 프로젝트 없음(T779 걷음) — 손잡이와 상관없다');
for (const [tag, z] of [['켬', ON], ['끔', OFF]]) {
  ok(z.winterFile === false && z.winterReq === 'MODULE_NOT_FOUND', `[${tag}] ★\`server/winter.js\` 가 없다(불러도 못 찾는다)`, `${z.winterFile} · ${z.winterReq}`);
  ok(z.board && z.board.ok && !z.board.head, `[${tag}] ★게시판에 머리줄 칸이 없다(의뢰 · 소식 둘)`, JSON.stringify(z.board));
  ok(z.deliver.foodReq === 0 && /부탁/.test(z.deliver.err2 || '') && z.deliver.left2 === 5 && !z.deliver.winter2,
    `[${tag}] ★의뢰 없는 곡식은 안 받는다 — 품목 미지정 납품이 겨울 몫을 고르지 않는다(손 5 그대로)`, JSON.stringify(z.deliver));
  ok(z.deliver.srcWinter === false && z.deliver.srcLedger === true,
    `[${tag}] 납품 본문 — 겨울 갈래 · 겨울 표지 0 · 품목 지정은 곧장 장부 정본(의뢰 납품 하나)`, `겨울 ${z.deliver.srcWinter} · 장부 ${z.deliver.srcLedger}`);
  ok(z.limitFns.every((t) => t === 'undefined'), `[${tag}] 기여 한도 · 길드 곳간 잠금 함수가 없다(걷음)`, z.limitFns.join(' '));
}

console.log('\n⑥ 화면 칸');
ok(ON.invDonate === true && ON.pub.donateN > 0 && ON.pub.chief === true && ON.pub.memberChief === false && !ON.pub.hasLimit,
  '켬 — 회관 `inv.donate` · 거래소 소속 줄 `chief`(창설자 true · 마을 사람 false) · `donate` · 한도 칸 없음', JSON.stringify({ inv: ON.invDonate, pub: ON.pub }));
ok(OFF.invDonate === 'undefined' && OFF.pub.donateN === 'undefined' && OFF.pub.chief === true && !OFF.pub.hasLimit,
  "끔('0') — 기부 칸만 없다(촌장 칸은 그대로 · 한도 칸 없음)", JSON.stringify({ inv: OFF.invDonate, pub: OFF.pub }));

console.log("\n⑦ 끔('0') — 기부 문 셋만 닫힌다 · 꺼내기는 그대로 촌장만");
ok(OFF.hall.stockUp === 0 && /관리자가 아닙니다/.test(OFF.hall.note), '비관리자 회관 넣기 거절(관리자 게이트)', OFF.hall.note);
ok(OFF.chatKey === false && OFF.npc.stockUp === 0, '`/기부` 는 명령이 아니다(말로 흘러간다)', String(OFF.chatKey));
ok(OFF.panel.stockUp === 0, '`village_donate` 문이 닫혀 있다', String(OFF.panel.stockUp));
ok(OFF.wdP1.took === 0 && OFF.wdM.took === 0 && OFF.wdC1.took === 5 && OFF.chatWd2.took === 3 && OFF.wdN.took === 0,
  '★꺼내기는 손잡이 밖 — 끔에서도 촌장만(비관리자 · 마을 사람 거절 · 창설자 5 · `/인출 3` · NPC 0)', `${OFF.wdP1.note} · ${OFF.wdM.note} · ${OFF.wdC1.took}`);
ok(/꺼내는 것은 촌장만/.test(OFF.look.note) && !/기부/.test(OFF.look.note), '`/곳간` 형편 줄 — 기부 꼬리만 빠진다', OFF.look.note);
ok(OFF.lock.r === true && /촌장만 열 수 있습니다/.test(OFF.lock.note) && OFF.cAsk === (OFF.kin ? ON.cAsk : 2), `\`/곳간 잠금\` 한 줄 · central 묻기도 켬 판과 같은 수(꺼내기 판정은 손잡이 밖${OFF.kin ? ' · ★[T809] 마을 한 무리 = 묻기 0' : ''})`, `${OFF.lock.note} · 묻기 ${OFF.cAsk} / 켬 ${ON.cAsk}`);
ok(!/곳간을 열어|\/인출/.test(OFF.acceptNote.note) && /오늘부터 자네는/.test(OFF.acceptNote.note), '수락 말에 곳간 말 없음(걷음 — 끔에서도)', OFF.acceptNote.note);

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
