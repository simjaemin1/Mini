#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 19
// === scripts/test-t1441-village-rules.js — 마을 쪽 규칙(★T1441 · 판정 43 · 46 · 47 · 52 · 53 · 54) — 존 정본 경로 · 아이 판 ==========
//
// ★지키는 것(존 `__testBind` · 마을은 판이 세운 시험 마을 셋 — `SimVillages.villageOfCell` · `villageByDbId` 를 판 동안만 갈아 끼운다 · 손은 정본 함수)
//   갑마을(9001 · 플레이어 마을 · 촌장 'chief') = 칸 [X, X+20) × [Y, Y+20) · 을마을(9002 · NPC 마을) = [X+40, X+60) · 병마을(9003 · 플레이어 마을 · 적 'enemy')
//   ① 짓기 — 마을 없는 사람이 갑마을 땅에 울타리 · 벽(변을 낀 칸 하나만 땅이어도) · 임시 사유지 · 움집터 → 거절 · 갑마을 사람 → 섬 · 마을 밖 → 섬 · 미리보기 답 같음 · 첫 집터 까닭 '남의 마을 땅'
//   ② 문 — 마을 땅 위 마을 사람이 단 문 = 마을 문(찍힘) · 남은 못 열고 마을 사람은 연다 · 개인 문(내 사유지 위) = 주인만 · 주인 없는 땅 문 = 누구나 · 걷는 NPC: 제 마을 문 지남 · 남의 마을 문 = 벽
//   ③ 선전포고 — 갑마을 땅 위 사유지 칸의 울타리를 병마을 사람이 → 싸우지 않으면 거절 · 싸우면 친다 · 길을 닫는 조각 · 풀린 칸은 싸우지 않아도
//   ④ 촌장 — 촌장은 구성원 울타리를 친다(내구 0 → 헐리고 재료 바닥 · 벌점 0) · 구성원끼리는 못 친다
//   ⑤ NPC 추방 — 을마을 사람 · 벌점 45 → 을마을 길을 닫는 조각으로 +8 → 53 → 그 자리에서 내보냄 · 다시 들기 = 2시간 + 벌점 50 아래 · 벌점 60 이어도 길 막기 기록이 없으면 안 내보냄 ·
//      접속 안 한 사이 받은 몫은 들어오는 순간
//   ⑥ 말미 — 사유지가 갑마을 땅 위인 구성원이 탈퇴 → 3일 잠김(촌장이 못 친다 · 길을 닫는 조각은 예외) · 주인은 갑마을 문을 연다 · 새로 짓지는 못한다 ·
//      몸을 저장했다 다시 읽어도 시계 그대로 · 말미 뒤 = 문 닫힘 · 촌장이 친다 · 다시 들면 말미가 닫힌다
//   ⑦ 겹치면 마을 우선 — 주인 벌점 60(접속 중)이어도 갑마을 땅 위 사유지의 작물은 벌점이 붙는다 · 마을 밖 사유지는 풀린다 · 추방 2시간 · 탈퇴 1시간
//   ⑧ 영토가 사유지를 만나면 — 갑마을 사람 사유지 = 덮음 · 남의 사유지 = 비켜 감 · 주인이 나간 뒤에도 소속 사본이 덮는 쪽을 바꾸지 않는다(덮인 칸은 마을 땅 그대로 — 영토 집합에서 안 빠진다)
//   끔 판 — 손잡이 다 끔: 남의 마을 땅에 울타리 섬 · 남이 문을 연다 · 몸 칸에 `t1441` 없음 · 집계 0
//   ★미끼 열아홉(이 파일 안 · 사본은 `server/_t1441bait-*` · 판 끝에 지움) — 맨 아래 `BAITS`.
// ★박힌 날짜 0 — 시각은 `Date.now()` 에서 빼고 더하기만.
//   node scripts/test-t1441-village-rules.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.__T1441_MODE || '';
const put = (R, k, c, x) => { R[k] = !!c; if (x !== undefined) R[k + '#'] = String(x).slice(0, 300); };
const ON_KNOBS = { T1441_NO_OUTSIDER_BUILD: '1', T1441_DOOR_OWNER: '1', T1441_WAR_GATE: '1', T1441_CHIEF_BREAK: '1', T1441_NPC_EXPEL: '1', T1441_EXIT_GRACE: '1', T1441_VIL_FIRST: '1', T1441_TERR_CLAIM: '1', T1441_EXPEL_2H: '1' };

if (MODE) {
  Object.assign(process.env, { ZONE_ID: 'hanbando', ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CLAIM_ABSENCE: '0', T1065_TOOL_GATE: '0', T1392_FIRST_LOT: '0', T1305_DEEDS: '0' });
  if (MODE === 'on') Object.assign(process.env, ON_KNOBS);
  const _l = console.log, _w = console.warn, _e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const ZP = process.env.__T1441_ZONE || path.join(ROOT, 'server', 'zone.js');
  const H = require(ZP).__testBind();
  const Membership = require(path.join(path.dirname(ZP), process.env.__T1441_MEMB || 'membership.js'));
  console.log = _l; console.warn = _w; console.error = _e;
  const SV = H.SimVillages, SZ = H.BUILDING_SIZE, R = {};
  const X = 70000, Y = 70000;
  const PV = { dbId: 9001, name: '갑마을', econ: { founder: 't1441_chief' }, _kin: { chief: 't1441_chief', wars: new Set() } };
  const NV = { dbId: 9002, name: '을마을', econ: {} };
  const EV = { dbId: 9003, name: '병마을', econ: { founder: 't1441_enemy' }, _kin: { chief: 't1441_enemy', wars: new Set() } };
  const VB = { 9001: PV, 9002: NV, 9003: EV };
  SV.villageOfCell = (cx, cy) => (cy >= Y && cy < Y + 20 ? (cx >= X && cx < X + 20 ? PV : (cx >= X + 40 && cx < X + 60 ? NV : null)) : null);
  SV.villageByDbId = (id) => VB[id | 0] || null;
  SV.clientVillages = () => [{ id: 9001, name: '갑마을' }, { id: 9002, name: '을마을' }, { id: 9003, name: '병마을' }];
  let n = 0;
  const mk = (name, vid) => { const msgs = []; const p = { pid: 'p_v' + n, playerId: 't1441_' + name, name, persistent: false, lastSeen: Date.now() + 864e5, ws: { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } }, msgs,
    x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, vp: 0, lastAttackAt: 0, inventory: { wood: 9999, stone: 9999, plank: 999 }, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {} }; n++;
    if (vid) p.member = { zone: 'hanbando', vid, name: VB[vid].name, since: 0 };
    H.players.set(p.pid, p); return p; };
  const last = (p) => (p.msgs.filter((m) => m.type === 'notice').map((m) => m.text).pop() || '');
  const at = (p, cx, cy, dx, dy) => { p.x = cx * SZ + SZ / 2 + (dx || 0); p.y = cy * SZ + SZ / 2 + (dy || 0); };
  let cid = 0;
  const put1 = (p, x, y, st) => { const id = 'c_v' + (cid++); H.claims.set(id, { id, ownerPid: p.playerId, ownerName: p.name, x: x * SZ, y: y * SZ, w: SZ, h: SZ, kind: 'personal', state: st || 'active' }); return id; };
  const bAt = (type, cx, cy) => [...H.buildings.values()].find((b) => b.type === type && Math.floor(b.x / SZ) === cx && Math.floor(b.y / SZ) === cy && (b.floor || 0) === 0);
  const fence = (p, cx, cy) => { at(p, cx, cy); p.msgs.length = 0; const ok = H._tryBuildAt(p, 'fence', 0, null, 'N', { skipCost: true }); return { ok: !!ok, b: bAt('fence', cx, cy), note: last(p) }; };
  const door = (p, cx, cy) => { at(p, cx, cy, 0, -10); p.msgs.length = 0; const ok = H._tryBuildAt(p, 'door', 0, 'N', null, { skipCost: true }); return { ok: !!ok, b: [...H.buildings.values()].find((b) => b.type === 'door' && Math.floor(b.x / SZ) === cx && Math.floor(b.y / SZ) === cy), note: last(p) }; };
  const toggle = (p, b) => { p.x = b.x + 8; p.y = b.y + 8; p.msgs.length = 0; const o = !!b.data.open; H.doDoorToggle(p, b.id); return { moved: !!b.data.open !== o, note: last(p) }; };
  const hit = async (p, b) => { p.x = b.x - 4; p.y = b.y + 6;   // 울타리는 칸 가운데에 산다 — 그 몸 바로 곁(이웃 칸 것보다 가깝게)
    p.lastAttackAt = 0; p.msgs.length = 0; const hp0 = (b.data && typeof b.data.hp === 'number') ? b.data.hp : null; await H.tryAttack(p); const hp1 = (b.data && typeof b.data.hp === 'number') ? b.data.hp : null; return { hurt: hp1 !== hp0 || !H.buildings.has(b.id), gone: !H.buildings.has(b.id), note: last(p) }; };
  (async () => {
    try {
      const chief = mk('chief', 9001), m1 = mk('m1', 9001), m2 = mk('m2', 9001), out = mk('out', 0), enemy = mk('enemy', 9003), n1 = mk('n1', 9002), n2 = mk('n2', 9002);
      // ── ① 짓기 ──
      const f1 = fence(out, X + 5, Y + 5), f2 = fence(m1, X + 6, Y + 5), f3 = fence(out, X - 5, Y + 5);
      at(out, X, Y + 5, -12, 0); out.msgs.length = 0; const w1 = !!H._tryBuildAt(out, 'wall', 0, 'E', null, { skipCost: true });   // 변: (X-1,Y+5) E → 칸 X-1(밖) · X(갑마을 땅)
      at(out, X + 7, Y + 7); out.msgs.length = 0; const c0 = [...H.claims.keys()].length; H.tryClaim(out, 'temporary'); const t1 = [...H.claims.keys()].length > c0, t1n = last(out);
      out.msgs.length = 0; H._t1441Peek && H._t1441Peek(out, { cx: X + 3, cy: Y + 3, key: 'k1' }); const pk1 = out.msgs.find((m) => m.type === 't1441_peek');
      out.msgs.length = 0; H._t1441Peek && H._t1441Peek(out, { cx: X - 3, cy: Y + 3, key: 'k2' }); const pk2 = out.msgs.find((m) => m.type === 't1441_peek');
      const lot = H._t1392Cells ? H._t1392Cells(out.playerId, X + 10, Y + 10) : [];
      if (MODE === 'on') {
        put(R, 'b1_outsider', !f1.ok && /갑마을 땅/.test(f1.note) && !w1 && !t1 && /갑마을 땅/.test(t1n), `남 울타리 ${f1.ok ? '섬' : '거절(' + f1.note + ')'} · 남 벽(변 한쪽이 땅) ${w1 ? '섬' : '거절'} · 남 임시 사유지 ${t1 ? '섬' : '거절(' + t1n + ')'}`);
        put(R, 'b1_member', f2.ok && f3.ok, `구성원 울타리 ${f2.ok ? '섬' : '거절 ' + f2.note} · 마을 밖 울타리 ${f3.ok ? '섬' : '거절 ' + f3.note}`);
        put(R, 'b1_preview', pk1 && pk1.vil === '갑마을' && pk2 && pk2.vil === '' && lot.length === 9 && lot.every((c) => c.why === 'foreign'), `미리보기 땅 안 '${pk1 && pk1.vil}' · 밖 '${pk2 && pk2.vil}' · 첫 집터 까닭 ${[...new Set(lot.map((c) => c.why))].join(',')}`);
      } else {
        put(R, 'b0_off', f1.ok && w1 && t1 && !(H._t1441Z.peek > 2), `끔 — 남 울타리 ${f1.ok ? '섬' : '거절'} · 남 벽 ${w1 ? '섬' : '거절'} · 남 임시 사유지 ${t1 ? '섬' : '거절'}`);
      }
      // ── ② 문 ──
      const dV = door(m1, X + 10, Y + 12);                          // 마을 땅 · 사유지 밖 → 마을 문
      put1(m1, X + 12, Y + 12); const dP = door(m1, X + 12, Y + 12);   // m1 사유지 위 → 개인 문
      const dW = door(out, X - 10, Y + 12);                          // 주인 없는 땅 → 누구나
      if (MODE === 'on') {
        const a = toggle(out, dV.b), b = toggle(m2, dV.b), c = toggle(chief, dP.b), d = toggle(m1, dP.b), e = toggle(n1, dW.b);
        put(R, 'd2_owner', dV.b && dV.b.data.t1441v === 9001 && !a.moved && b.moved && !c.moved && d.moved && e.moved, `마을 문 찍힘 ${dV.b && dV.b.data.t1441v} · 남 ${a.moved ? '엶' : '못 엶(' + a.note + ')'} · 구성원 ${b.moved ? '엶' : '못 엶'} · 개인 문: 촌장 ${c.moved ? '엶' : '못 엶(' + c.note + ')'} · 주인 ${d.moved ? '엶' : '못 엶'} · 주인 없는 땅 문 남 ${e.moved ? '엶' : '못 엶'}`);
        // 걷는 NPC — 닫힌 문(dV 를 다시 닫는다)
        if (dV.b.data.open) toggle(m2, dV.b);
        const cx = Math.floor(dV.b.x / SZ), cy = Math.floor(dV.b.y / SZ);
        H._t1441SetWv(9001); const p1 = H._edgeScan(cx, cy, 'N', 0, false); H._t1441SetWv(9002); const p2 = H._edgeScan(cx, cy, 'N', 0, false); H._t1441SetWv(null); const p3 = H._edgeScan(cx, cy, 'N', 0, false);
        put(R, 'd2_npc', !p1 && p2 && p3, `닫힌 갑마을 문 — 갑마을 몸 ${p1 ? '막힘' : '지남'} · 을마을 몸 ${p2 ? '막힘' : '지남'} · 사람 ${p3 ? '막힘' : '지남'}`);
      } else {
        const a = toggle(out, dV.b), c = toggle(chief, dP.b);
        put(R, 'd0_off', a.moved && c.moved && !(dV.b.data && dV.b.data.t1441v != null), `끔 — 남이 마을 문 ${a.moved ? '엶' : '못 엶'} · 촌장이 남의 집 문 ${c.moved ? '엶' : '못 엶'} · 찍힘 ${dV.b.data.t1441v}`);
      }
      if (MODE !== 'on') { console.log('@@T1441 ' + JSON.stringify(R)); process.exit(0); }
      // ── ③ 선전포고 ──
      put1(m1, X + 3, Y + 15); const fW = fence(m1, X + 3, Y + 15).b;            // m1 사유지 위 울타리
      put1(m1, X + 5, Y + 15); const fC = fence(m1, X + 5, Y + 15).b; fC.data.t1440c = { why: 'mark', vil: 9001 };   // 길을 닫는 조각
      put1(m2, X + 7, Y + 15, 'free'); const fF = fence(m2, X + 7, Y + 15).b;     // 풀린 칸
      const h1 = await hit(enemy, fW);
      EV._kin.wars.add(9001); const h2 = await hit(enemy, fW); EV._kin.wars.delete(9001);
      const h3 = await hit(enemy, fC), h4 = await hit(enemy, fF);
      put(R, 'w3_war', !h1.hurt && /싸우는 중/.test(h1.note) && h2.hurt && h3.hurt && h4.hurt, `안 싸울 때 ${h1.hurt ? '침' : '거절(' + h1.note + ')'} · 싸울 때 ${h2.hurt ? '침' : '거절 ' + h2.note} · 길을 닫는 조각 ${h3.hurt ? '침' : '거절'} · 풀린 칸 ${h4.hurt ? '침' : '거절 ' + h4.note}`);
      // ── ④ 촌장 ──
      const fM = fence(m1, X + 9, Y + 9).b;
      const g1 = await hit(m2, fM);
      let k = 0, gc = null, vp0 = chief.vp; while (k++ < 20 && H.buildings.has(fM.id)) gc = await hit(chief, fM);
      const drop = [...(H.groundItems ? H.groundItems.values() : [])].some((g) => Math.abs(g.x - (fM.x + SZ / 2)) < 64 && Math.abs(g.y - fM.y) < 64);
      put(R, 'c4_chief', !g1.hurt && !H.buildings.has(fM.id) && drop && chief.vp === vp0, `구성원끼리 ${g1.hurt ? '침' : '못 침(' + g1.note + ')'} · 촌장 ${k - 1}번 → ${H.buildings.has(fM.id) ? '안 헐림' : '헐림'} · 재료 바닥 ${drop} · 촌장 벌점 ${chief.vp}`);
      // ── ⑤ NPC 추방 ──
      n1.vp = 45; H._t1423Hostile(n1.playerId, n1.name, '을마을', '시험', 9002);
      const ex1 = !n1.member && n1.t1441x === 1, cool1 = Membership.coolLeft(n1);
      n2.vp = 60; const ex2 = H._t1441ExpelCheck(n2);
      put(R, 'e5_expel', ex1 && !ex2 && !!n2.member, `벌점 ${n1.vp.toFixed(0)} · 을마을 길 막기 → ${ex1 ? '내보냄' : '남음'} · 벌점 60 · 길 막기 없음 → ${ex2 ? '내보냄' : '남음'}`);
      const coolMin = Math.round((n1.memberCool - Date.now()) / 60000);
      n1.memberCool = Date.now() - 1; const coolVp = Membership.coolLeft(n1);   // 2시간이 지났다 · 벌점은 아직 53
      n1.vp = 49; const coolOk = Membership.coolLeft(n1);
      put(R, 'e5_rejoin', coolMin >= 119 && coolMin <= 121 && coolVp > 0 && coolOk === 0 && cool1 > 0, `다시 들기 ${coolMin}분 · 2시간 뒤 벌점 53 → ${coolVp > 0 ? '막힘' : '열림'} · 벌점 49 → ${coolOk === 0 ? '열림' : '막힘'}`);
      // 접속 안 한 사이
      const n3 = mk('n3', 9002); n3.vp = 46; H.players.delete(n3.pid);
      H._t1423Hostile(n3.playerId, n3.name, '을마을', '시험', 9002);
      H.players.set(n3.pid, n3); const before = !!n3.member; H._t1423Collect(n3);
      put(R, 'e5_offline', before && !n3.member, `접속 안 한 사이 길 막기 → 들어오는 순간 ${n3.member ? '남음' : '내보냄'}(벌점 ${Math.round(n3.vp)})`);
      // 봇 줄 — 을마을 사람이 을마을 길을 닫는 조각을 일곱 번(캐러밴이 칠 때마다 +8) → 일곱째에 내보내짐 → 가입 거절 → 벌점 49 · 2시간 뒤 가입
      SV.villageWithdrawGate = (vid, x, y) => ({ vil: VB[vid | 0] || NV });
      const bot = mk('bot', 9002); const seq = [];
      for (let k = 1; k <= 7; k++) { H._t1423Hostile(bot.playerId, bot.name, '을마을', '시험', 9002); seq.push(Math.round(bot.vp) + (bot.member ? '' : '✕')); }
      const j1 = Membership.join(bot, 9002);
      bot.vp = 49; bot.memberCool = Date.now() - 1; const j2 = Membership.join(bot, 9002);
      put(R, 'e5_bot', seq.slice(0, 6).every((x) => !/✕/.test(x)) && /✕/.test(seq[6]) && !j1.ok && j2.ok, `벌점 차례 ${seq.join(' · ')} · 바로 가입 ${j1.ok ? '됨' : '거절(' + j1.err + ')'} · 벌점 49 · 2시간 뒤 가입 ${j2.ok ? '됨' : '거절 ' + j2.err}`);
      // ── ⑥ 말미 ──
      const g = mk('g1', 9001); put1(g, X + 14, Y + 3); const gF = fence(g, X + 14, Y + 3).b; put1(g, X + 15, Y + 3); const gC = fence(g, X + 15, Y + 3).b; gC.data.t1440c = { why: 'mark', vil: 9001 };
      const lv = Membership.leave(g, 'self');
      const gs = g.t1441g, gNote = g.msgs.filter((m) => m.type === 'notice').map((m) => m.text).join(' | ');
      const l1 = await hit(chief, gF), l2 = await hit(chief, gC);
      if (dV.b.data.open) toggle(m2, dV.b);
      const o1 = toggle(g, dV.b); if (dV.b.data.open) toggle(m2, dV.b);
      const nb = fence(g, X + 16, Y + 3);
      const body = H.parseBody(JSON.parse(JSON.stringify(H.serializeBody(g)))); const g2 = {}; try { H._bodyInto(g2, body, null); } catch (e) {}   // 다시 접속한 몸
      put(R, 'g6_lock', lv.ok && gs && gs.vid === 9001 && !l1.hurt && /말미/.test(l1.note) && l2.hurt && o1.moved && !nb.ok, `탈퇴 → 말미 ${gs ? gs.vid : '-'} · 촌장이 칸 울타리 ${l1.hurt ? '침' : '못 침(' + l1.note.slice(0, 30) + '…)'} · 길을 닫는 조각 ${l2.hurt ? '침' : '못 침'} · 주인이 마을 문 ${o1.moved ? '엶' : '못 엶 ' + o1.note} · 새 울타리 ${nb.ok ? '섬' : '거절'}`);
      put(R, 'g6_clock', g2.t1441g && g2.t1441g.at === gs.at && /3일|72시간/.test(gNote), `몸 저장 → 다시 접속한 몸의 시계 ${g2.t1441g ? (g2.t1441g.at === gs.at ? '그대로' : '바뀜') : '없음'} · 나갈 때 알림 '${gNote.slice(0, 60)}…'`);
      g.t1441g.at = Date.now() - 3 * 86400000 - 1000;   // 말미 뒤
      const o2 = toggle(g, dV.b); const l3 = await hit(chief, gF);
      g.memberCool = 0; const back = Membership.seatByInvite(g, 9001);
      put(R, 'g6_after', !o2.moved && l3.hurt && back.ok && !g.t1441g, `말미 뒤 — 주인 마을 문 ${o2.moved ? '엶' : '못 엶'} · 촌장 ${l3.hurt ? '침' : '못 침 ' + l3.note} · 다시 듦 ${back.ok ? '됨' : back.err} · 말미 ${g.t1441g ? '남음' : '닫힘'}`);
      // ── ⑦ 겹치면 마을 우선 · 2시간 / 1시간 ──
      const own = mk('own', 9001); put1(own, X + 2, Y + 2); put1(own, X - 8, Y + 2); own.vp = 60;
      const s1 = H._t1238StealCheck(out, X + 2, Y + 2), s2 = H._t1238StealCheck(out, X - 8, Y + 2);
      put(R, 'v7_first', s1 && s1.vp > 0 && !s1.lifted && s2 && s2.lifted, `주인 벌점 60 — 마을 땅 위 사유지 작물 ${s1 && s1.lifted ? '풀림' : '벌점 ' + (s1 && s1.vp)} · 마을 밖 ${s2 && s2.lifted ? '풀림' : '벌점'}`);
      const q1 = mk('q1', 9001), q2 = mk('q2', 9001);
      Membership.expel(chief, q1); Membership.leave(q2, 'self');
      const qm1 = Math.round((q1.memberCool - Date.now()) / 60000), qm2 = Math.round((q2.memberCool - Date.now()) / 60000);
      put(R, 'v7_2h', qm1 >= 119 && qm1 <= 121 && qm2 >= 59 && qm2 <= 61, `촌장 추방 ${qm1}분 · 탈퇴 ${qm2}분`);
      // ── ⑧ 영토가 사유지를 만나면 ──
      const tm = mk('tm', 9001), to = mk('to', 0); put1(tm, X + 20, Y + 1); put1(to, X + 20, Y + 2);
      const T = SV.__t1441; if (T && T.setDep) T.setDep((vid, cx, cy) => H._t1441ClaimOwner(vid, cx, cy));
      const tb1 = T ? T.block(PV, X + 20, Y + 1) : null, tb2 = T ? T.block(PV, X + 20, Y + 2) : null;
      Membership.leave(tm, 'self'); const tb3 = T ? T.block(PV, X + 20, Y + 1) : null;
      put(R, 't8_terr', tb1 === false && tb2 === true && tb3 === true, `갑마을 사람 사유지 ${tb1 === false ? '덮음' : '비켜 감'} · 남 사유지 ${tb2 ? '비켜 감' : '덮음'} · 주인이 나간 뒤 다음 넓히기 ${tb3 ? '비켜 감(아직 안 덮인 칸)' : '덮음'}`);
      R['@Z'] = JSON.stringify(H._t1441Z);
    } catch (e) { R.err = false; R['err#'] = String(e && e.stack || e).slice(0, 400); }
    console.log('@@T1441 ' + JSON.stringify(R));
    process.exit(0);
  })();
  return;
}

// ── 부모 — 아이 판 둘 + 미끼 ──
const runChild = (mode, extra) => {
  const db = require('./lib-tmp').file('t1441_' + mode, '.db');
  let o = '';
  try { o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1441_MODE: mode, DB_PATH: db, PORT: String(require('./lib-port').port(38410)) }, extra || {}), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 }); }
  catch (e) { o = String((e && e.stdout) || ''); }
  const m = /@@T1441 (\{.*\})/.exec(o); return m ? JSON.parse(m[1]) : { err: false, 'err#': '결과줄 없음' };
};
let pass = 0, fail = 0;
const ok = (c, name, x) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${name}${x ? '  — ' + x : ''}`); };
const show = (R, keys) => { for (const [k, name] of keys) ok(R[k] === true, name, R[k + '#']); if (R.err === false) ok(false, '판이 끝까지 돌았다', R['err#']); };
const KEYS = [['b1_outsider', '① 남은 갑마을 땅에 울타리 · 벽(변 한쪽) · 임시 사유지를 못 세운다'], ['b1_member', '① 그 마을 사람 · 마을 밖은 선다'], ['b1_preview', '① 미리보기 · 첫 집터가 같은 답'],
  ['d2_owner', '② 마을 문 = 그 마을 사람 · 개인 문 = 주인 · 주인 없는 땅 문 = 누구나'], ['d2_npc', '② 걷는 NPC — 제 마을 문은 지나고 남의 마을 문은 벽'],
  ['w3_war', '③ 마을 땅 위 사유지 건물 — 싸울 때만 · 길을 닫는 조각 · 풀린 칸은 예외'], ['c4_chief', '④ 촌장은 구성원 건물을 헌다(재료 바닥 · 벌점 0) · 구성원끼리는 못 친다'],
  ['e5_expel', '⑤ 벌점 50 + 그 마을 길 막기 → 내보냄 · 벌점만으로는 안 내보냄'], ['e5_rejoin', '⑤ 다시 들기 = 2시간 + 벌점 50 아래'], ['e5_offline', '⑤ 접속 안 한 사이 받은 몫 — 들어오는 순간'], ['e5_bot', '⑤ 봇 줄 — 길 닫는 조각 일곱 번 → 추방 → 가입 거절 → 49 · 2시간 뒤 가입'],
  ['g6_lock', '⑥ 말미 — 잠김(길을 닫는 조각 빼고) · 주인은 마을 문을 연다 · 새로 짓지는 못한다'], ['g6_clock', '⑥ 말미 시계는 몸에 실려 그대로 · 나갈 때 알림'], ['g6_after', '⑥ 말미 뒤 — 문 닫힘 · 촌장이 친다 · 다시 들면 말미가 닫힌다'],
  ['v7_first', '⑦ 겹치면 마을 우선 — 마을 땅 위 사유지는 벌점으로 안 풀린다'], ['v7_2h', '⑦ 추방 2시간 · 탈퇴 1시간'], ['t8_terr', '⑧ 영토는 제 마을 사람 사유지만 덮는다']];
if (require.main === module) {
  console.log('=== T1441 마을 쪽 규칙 — 켬 판 ===');
  const RON = runChild('on'); show(RON, KEYS);
  if (RON['@Z']) console.log('    집계 ' + RON['@Z'].slice(0, 400));
  console.log('=== 끔 판(손잡이 다 끔 = 종전) ===');
  const ROFF = runChild('off'); show(ROFF, [['b0_off', '끔 — 남이 마을 땅에 울타리 · 벽 · 임시 사유지를 세운다 · 미리보기 답 없음'], ['d0_off', '끔 — 누구나 문을 연다 · 찍힘 없음']]);
  // ── 미끼 — 제품 사본 한 곳을 바꾸면 그 판정이 빨개야 한다 ──
  const BAITS = [
    { f: 'zone', rep: [["  if (!v || _t1441IsMem(player, v)) return null;\n  return v;\n}", "  return null;\n}"]], key: 'b1_outsider', name: '① 남의 마을 땅에 벽이 서는 사본' },
    { f: 'zone', rep: [["  if (k.p) { _t1441Z.door.personal++; return k.p === player.playerId ? null : '남의 집 문입니다. 주인만 열 수 있습니다.'; }", "  if (k.p) { _t1441Z.door.personal++; return null; }"]], key: 'd2_owner', name: '② 남의 개인 문이 열리는 사본' },
    { f: 'zone', rep: [["      if (!(await isAtWar(_warKeyOf(player), _vk))) {", "      if (false) {"]], key: 'w3_war', name: '③ 전쟁 중이 아닌데 치는 사본' },
    { f: 'zone', rep: [["  if (T1441_CHIEF_BREAK && mine && VillageKin.ON && VillageKin.isChief(player, vil)) {", "  if (T1441_CHIEF_BREAK && mine) {"]], key: 'c4_chief', name: '④ 구성원이 부수는 사본(촌장 표지를 안 본다)' },
    { f: 'zone', rep: [["  if (!Array.isArray(player.t1441c) || player.t1441c.indexOf(vil.dbId | 0) < 0) return null;\n", ""]], key: 'e5_expel', name: '⑤ 벌점 50 만 보고 내보내는 사본' },
    { f: 'zone', rep: [["  if (k && k.vid != null && (k.vid | 0) === (_t1441Wv | 0)) { _t1441Z.door.npcPass++; return true; }", "  if (k && k.vid != null) { _t1441Z.door.npcPass++; return true; }"]], key: 'd2_npc', name: '⑥ 걷는 NPC 가 남의 마을 문도 지나는 사본' },
    { f: 'zone', rep: [["  if (T1441_NPC_EXPEL && o.c41) { for (const v of o.c41) _t1441CloseMark(player, v); _t1441ExpelCheck(player); }", ""]], key: 'e5_offline', name: '⑦ 접속 안 한 사이 받은 길 막기를 들어올 때 안 얹는 사본' },
    { f: 'zone', rep: [["    if (g && g.vid === (vil.dbId | 0) && g.left > 0) { _t1441Z.grace.lock++;", "    if (false) { _t1441Z.grace.lock++;"]], key: 'g6_lock', name: '⑧ 말미 중 촌장이 부수는 사본' },
    { f: 'zone', rep: [["  if (!v || _t1441IsMem(player, v)) return null;", "  if (!v || _t1441IsMem(player, v) || (player.t1441g && player.t1441g.vid === v.dbId)) return null;"]], key: 'g6_lock', name: '⑨ 말미 중 주인이 새 벽을 세우는 사본' },
    { f: 'zone', rep: [["  const g = _t1441GraceOf(player.playerId); if (g && g.vid === k.vid && g.left > 0) { _t1441Z.door.grace++; return null; }", "  const g = _t1441GraceOf(player.playerId); if (g && g.vid === k.vid) { _t1441Z.door.grace++; return null; }"]], key: 'g6_after', name: '⑩ 말미 뒤에도 문이 열리는 사본' },
    { f: 'zone', rep: [["if (_q.g && _q.g.vid != null) p.t1441g = Object.assign({}, _q.g);", "if (_q.g && _q.g.vid != null) p.t1441g = Object.assign({}, _q.g, { at: Date.now() + 1 });"]], key: 'g6_clock', name: '⑪ 말미 시계가 재접속 때 다시 감기는 사본' },
    { f: 'zone', rep: [["  if (T1441_EXIT_GRACE && mine && c && !closing && c.ownerPid !== player.playerId) {", "  if (T1441_EXIT_GRACE && mine && c && c.ownerPid !== player.playerId) {"]], key: 'g6_lock', name: '⑫ 길을 닫는 조각까지 잠그는 사본' },
    { f: 'zone', rep: [["if (ownerOnline && (ownerOnline.vp ?? 0) >= VP_THRESHOLD && !(T1441_VIL_FIRST && _t1441VilAt(cx, cy) && ++_t1441Z.vilFirst))", "if (ownerOnline && (ownerOnline.vp ?? 0) >= VP_THRESHOLD)"]], key: 'v7_first', name: '⑬ 벌점 50 넘은 주인의 마을 안 사유지가 풀리는 사본' },
    { f: 'memb', rep: [["CFG.REJOIN_MS * ((T1441_EXPEL_2H && why === 'expel') ? 2 : 1)", "CFG.REJOIN_MS"]], key: 'v7_2h', name: '⑭ 추방 뒤 1시간에 다시 드는 사본' },
    { f: 'memb', rep: [["CFG.REJOIN_MS * ((T1441_EXPEL_2H && why === 'expel') ? 2 : 1)", "CFG.REJOIN_MS * (T1441_EXPEL_2H ? 2 : 1)"]], key: 'v7_2h', name: '⑮ 탈퇴까지 2시간이 되는 사본' },
    { f: 'zone', rep: [["  if ((player.vp ?? 0) < VP_THRESHOLD) { delete player.t1441x; return 0; }", "  delete player.t1441x; return 0;"]], key: 'e5_rejoin', name: '⑯ NPC 마을에서 벌점 50 위인데 2시간 뒤 들어가는 사본' },
    { f: 'vil', rep: [["  if (o.member) { _t1441TS.take++; return false; }\n  _t1441TS.skip++; return true;", "  return false;"]], key: 't8_terr', name: '⑰ 소속이 아닌 사람 사유지를 덮는 사본' },
    { f: 'vil', rep: [["  if (o.member) { _t1441TS.take++; return false; }\n  _t1441TS.skip++; return true;", "  return true;"]], key: 't8_terr', name: '⑱ 제 마을 사람 사유지를 비켜 가는 사본' },
    { f: 'zone', rep: [["  const mv = _t1441VidOfId(c.ownerPid);\n  return { owner: c.ownerPid, member: mv != null && (mv | 0) === (vid | 0) };", "  return { owner: c.ownerPid, member: true };"]], key: 't8_terr', name: '⑲ 영토가 소속을 안 묻는 사본(나간 사람 · 남의 땅도 덮는다)' },
  ];
  const SRC = { zone: path.join(ROOT, 'server', 'zone.js'), memb: path.join(ROOT, 'server', 'membership.js'), vil: path.join(ROOT, 'server', 'villages.js') };
  const made = [];
  console.log('=== 미끼(사본 한 곳 — 그 판정이 빨개야 한다) ===');
  const BR = [];
  try {
    BAITS.forEach((b, i) => {
      const src = fs.readFileSync(SRC[b.f], 'utf8');
      let s = src, nRep = 0;
      for (const [from, to] of b.rep) { const k = s.split(from).length - 1; if (k !== 1) { nRep = -1; break; } s = s.replace(from, to); nRep++; }
      if (nRep < 1) { ok(false, `미끼 ${b.name} — 고칠 곳이 한 곳이 아님`); return; }
      const tag = '_t1441bait-' + (i + 1);
      const env = {};
      if (b.f === 'zone') { const p = path.join(ROOT, 'server', tag + '.js'); fs.writeFileSync(p, s); made.push(p); env.__T1441_ZONE = p; }
      else {
        const mod = path.join(ROOT, 'server', tag + '-' + b.f + '.js'); fs.writeFileSync(mod, s); made.push(mod);
        const req = b.f === 'memb' ? "require('./membership')" : "require('./villages')";
        let z = fs.readFileSync(SRC.zone, 'utf8'); const k = z.split(req).length - 1;
        z = z.split(req).join(`require('./${tag}-${b.f}')`);
        const zp = path.join(ROOT, 'server', tag + '.js'); fs.writeFileSync(zp, z); made.push(zp); env.__T1441_ZONE = zp; if (b.f === 'memb') env.__T1441_MEMB = tag + '-' + b.f + '.js';
        if (!k) { ok(false, `미끼 ${b.name} — 존이 그 모듈을 부르는 자리를 못 찾음`); return; }
      }
      const R = runChild('on', env);
      BR[i] = { red: R[b.key] === false, n: nRep, x: R[b.key + '#'] };
    });
  } finally { for (const p of made) { try { fs.unlinkSync(p); } catch (e) {} } }
  const bk = (i) => BR[i] || { red: false, n: 0, x: '돌지 않음' };
  ok(bk(0).red, `미끼 ① 남의 마을 땅에 벽이 서는 사본 → b1_outsider 빨강(바꾼 자리 ${bk(0).n})`, bk(0).x);
  ok(bk(1).red, `미끼 ② 남의 개인 문이 열리는 사본 → d2_owner 빨강(바꾼 자리 ${bk(1).n})`, bk(1).x);
  ok(bk(2).red, `미끼 ③ 전쟁 중이 아닌데 치는 사본 → w3_war 빨강(바꾼 자리 ${bk(2).n})`, bk(2).x);
  ok(bk(3).red, `미끼 ④ 구성원이 부수는 사본(촌장 표지를 안 본다) → c4_chief 빨강(바꾼 자리 ${bk(3).n})`, bk(3).x);
  ok(bk(4).red, `미끼 ⑤ 벌점 50 만 보고 내보내는 사본 → e5_expel 빨강(바꾼 자리 ${bk(4).n})`, bk(4).x);
  ok(bk(5).red, `미끼 ⑥ 걷는 NPC 가 남의 마을 문도 지나는 사본 → d2_npc 빨강(바꾼 자리 ${bk(5).n})`, bk(5).x);
  ok(bk(6).red, `미끼 ⑦ 접속 안 한 사이 받은 길 막기를 들어올 때 안 얹는 사본 → e5_offline 빨강(바꾼 자리 ${bk(6).n})`, bk(6).x);
  ok(bk(7).red, `미끼 ⑧ 말미 중 촌장이 부수는 사본 → g6_lock 빨강(바꾼 자리 ${bk(7).n})`, bk(7).x);
  ok(bk(8).red, `미끼 ⑨ 말미 중 주인이 새 벽을 세우는 사본 → g6_lock 빨강(바꾼 자리 ${bk(8).n})`, bk(8).x);
  ok(bk(9).red, `미끼 ⑩ 말미 뒤에도 문이 열리는 사본 → g6_after 빨강(바꾼 자리 ${bk(9).n})`, bk(9).x);
  ok(bk(10).red, `미끼 ⑪ 말미 시계가 재접속 때 다시 감기는 사본 → g6_clock 빨강(바꾼 자리 ${bk(10).n})`, bk(10).x);
  ok(bk(11).red, `미끼 ⑫ 길을 닫는 조각까지 잠그는 사본 → g6_lock 빨강(바꾼 자리 ${bk(11).n})`, bk(11).x);
  ok(bk(12).red, `미끼 ⑬ 벌점 50 넘은 주인의 마을 안 사유지가 풀리는 사본 → v7_first 빨강(바꾼 자리 ${bk(12).n})`, bk(12).x);
  ok(bk(13).red, `미끼 ⑭ 추방 뒤 1시간에 다시 드는 사본 → v7_2h 빨강(바꾼 자리 ${bk(13).n})`, bk(13).x);
  ok(bk(14).red, `미끼 ⑮ 탈퇴까지 2시간이 되는 사본 → v7_2h 빨강(바꾼 자리 ${bk(14).n})`, bk(14).x);
  ok(bk(15).red, `미끼 ⑯ NPC 마을에서 벌점 50 위인데 2시간 뒤 들어가는 사본 → e5_rejoin 빨강(바꾼 자리 ${bk(15).n})`, bk(15).x);
  ok(bk(16).red, `미끼 ⑰ 소속이 아닌 사람 사유지를 덮는 사본 → t8_terr 빨강(바꾼 자리 ${bk(16).n})`, bk(16).x);
  ok(bk(17).red, `미끼 ⑱ 제 마을 사람 사유지를 비켜 가는 사본 → t8_terr 빨강(바꾼 자리 ${bk(17).n})`, bk(17).x);
  ok(bk(18).red, `미끼 ⑲ 영토가 소속을 안 묻는 사본(나간 사람 · 남의 땅도 덮는다) → t8_terr 빨강(바꾼 자리 ${bk(18).n})`, bk(18).x);
  console.log(`\n=== T1441 마을 쪽 규칙: ${pass} 통과 / ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
}
