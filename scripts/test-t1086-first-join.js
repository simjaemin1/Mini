#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1086-first-join.js — T1086 첫 의뢰 뒤 바로 · 마을 가입 · 사유지 터 잡기 ====================
//
// ★왜 [★재민 11-01 "마을 가입과 개인 사유지 건설은 강하게 유도" · 카드 T1086 "첫 의뢰 뒤 바로"]
//   종전(K-2)은 빈터 = 의뢰 3건 · 마을 사람 = 의뢰 12건이었고, 가입은 채팅 `/소속` 한 줄뿐이었다(화면 어디에도 길이 없다).
//   고침: 손잡이 `T1086_FIRST_JOIN`(켬 기본 후보) — 시작 마을 의뢰 하나를 다 채운 순간 빈터 권리 + 마을 사람 권함 · 촌장 하게체 한 통 ·
//   「지금 할 일」 칸이 마을 가입 → 사유지 터 잡기 → 내 집 짓기를 단추 하나와 함께 낸다.
//
// ★이 하네스가 재는 것 — **제품 파일 원문**을 그대로 올린다(서버 모듈 셋 · 클라 70-lobby.js 통째 · 실서버 0 · 몇 초):
//   ① 켬 · 시작 마을 첫 의뢰 — 빈터 권리 · 권함 자리 · 촌장 한 통(밥 · 쉼터 · 권함 · 빈터) · 칸 형편 · 종전 권함 알림 0 · 계량기 그대로 ·
//      `/소속` 이 문턱 아래에서 앉힌다 · 받아들인 말(빈터 줄은 터가 없을 때만)
//   ② 첫 납품이 다른 마을이면 종전 훅 그대로 → 시작 마을 의뢰를 채우는 순간 권함 · 빈터 한 통('offer')
//   ③ 초대제 마을 · 이미 다른 마을 사람 — 권함 0(빈터만)
//   ④ 종전 문 그대로 — 대본 밖 사람은 K-2(12) · 문턱을 넘은 사람의 권함은 종전 `accept` 가 받는다
//   ⑤ 다시 접속 — 권함(몸의 메모리 칸)을 빈터 권리로 다시 건다 · 탈퇴 뒤 다음 의뢰에 다시 권한다 · 칸 갱신 한 통(arrive 없음)
//   ⑥ 끔(`T1086_FIRST_JOIN=0` · 자식 프로세스) — 종전 K-2 · 종전 훅 · `join` 칸 0 · 문 셋 무동작
//   ⑦ 칸 — 단계 셋(가입 · 터 잡기 · 집 짓기) · 차례 · 목표 · 재료 · 단추 · 끔이면 T1064 칸 그대로
//   ⑧ 말투 · 새 수 0 · 먹선 · 서버 손잡이 줄
//   ⑨ 돌연변이 — 고침의 뼈를 걷어 낸 글자면 위 판정이 빨갛다(자명 통과 금지)
//
// 실행: node scripts/test-t1086-first-join.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const R = (p) => require(path.join(ROOT, p));

// ── 세계 한 벌(서버 쪽) ──────────────────────────────────────────────────────────
const ARR = {
  1: { vid: 1, name: '광산1', kind: 'dock', cx: 2063, cy: 2093, x: 2063 * 32 + 16, y: 2093 * 32 + 16, faceX: 1, faceY: 0, centerX: 2120 * 32 + 16, centerY: 2117 * 32 + 16 },
  2: { vid: 2, name: '어촌2', kind: 'road', cx: 1900, cy: 300, x: 1900 * 32 + 16, y: 300 * 32 + 16, faceX: 0, faceY: 1, centerX: 1910 * 32 + 16, centerY: 320 * 32 + 16 },
  3: { vid: 3, name: '임업3', kind: 'road', cx: 900, cy: 900, x: 900 * 32 + 16, y: 900 * 32 + 16, faceX: -1, faceY: 0, centerX: 880 * 32 + 16, centerY: 900 * 32 + 16 },
};
const VILS = { 1: { dbId: 1, name: '광산1' }, 2: { dbId: 2, name: '어촌2' }, 3: { dbId: 3, name: '임업3', _kin: { joinMode: 'invite' } } };
const DONE = { ok: true, done: true, req: { item: 'wood' } };

// 서버 모듈 셋을 이 프로세스(손잡이 = 지금 env)에 올린다 — 하네스는 판정을 다시 짜지 않고 정본 함수를 부른다.
function boot() {
  const Database = require('better-sqlite3');
  const Onb = R('server/onboarding'), M = R('server/membership'), VK = R('server/village-kin');
  const SimV = { clientVillages: () => Object.values(VILS).map((v) => ({ id: v.dbId, name: v.name })), villageByDbId: (id) => VILS[id] || null };
  const sent = [];
  const W = { claimed: false };
  VK.init({ SimVillages: SimV, players: new Map(), send: () => {} });   // 마을 칸(초대제) 읽기만
  M.init({ SimVillages: SimV, ZONE_ID: 'lab', players: new Map(), gameDay: () => 7, send: (ws, m) => sent.push({ ws, m }), lotClaimed: () => W.claimed });
  Onb.init({ db: new Database(':memory:'), gameDay: () => 7, send: (ws, m) => sent.push({ ws, m }), warm: false,
    shelterOf: (vid) => (vid === 1 ? { x: ARR[1].centerX + 200, y: ARR[1].centerY - 200 } : null),
    offerJoin: (p, vid) => M.offerFirst(p, vid), joinOf: (p) => M.joinOf(p) });
  Onb.__probe.setArrivals(new Map(Object.entries(ARR).map(([k, v]) => [k | 0, v])));
  const mk = (id, start) => {
    const p = { playerId: id, pid: id, name: id, ws: { id }, x: ARR[1].x, y: ARR[1].y, inventory: {}, member: null, isNpc: false };
    if (start != null) { const s = Onb.stateOf(id); s.start_vid = start; s.arrived = 1; Onb.__probe.save(id, s); }
    return p;
  };
  let seen = 0;
  const take = (p) => { const out = sent.slice(seen).filter((x) => x.ws === p.ws).map((x) => x.m); seen = sent.length; return out; };
  //   ★존의 납품 문과 같은 차례(`zone.js tryVillageDeliver`): 온보딩 훅 → (초대제가 아니면) 소속 훅
  const deliver = (p, vid) => { Onb.onDeliver(p, DONE, vid); if (VK.joinModeOfVid(vid) !== 'invite') M.onDeliver(p, DONE, vid); };
  return { Onb, M, VK, sent, W, mk, take, deliver };
}

// ── ⑥ 끔 — 자식 프로세스(손잡이는 모듈을 올릴 때 읽는다) ────────────────────────────────
if (process.env.T1086_CHILD === 'off') {
  const B = boot();
  const p = B.mk('off1', 1);
  B.deliver(p, 1);
  const o = B.take(p);
  const hook = o.find((m) => m.kind === 'hook');
  const fc = B.M.firstJoinChat(p, '/소속');
  const of = B.M.offerFirst(p, 1);
  const ps = B.Onb.pushState(p);
  B.Onb.handleMsg(p, { type: 'onboarding_state' });
  const o2 = B.take(p);
  const out = { knobOnb: B.Onb.T1086, knobMem: B.M.T1086, hookLast: hook ? hook.lines[hook.lines.length - 1] : null, hookN: hook ? hook.lines.length : 0,
    joinKey: o.concat(o2).some((m) => Object.prototype.hasOwnProperty.call(m, 'join')), lot: B.Onb.stateOf('off1').lot_ok | 0, offer: p._memberOfferVid == null ? null : p._memberOfferVid,
    fc, of, ps, kinds: o.map((m) => m.type + ':' + (m.kind || '')).join(',') };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);

const B = boot();
const { Onb, M } = B;
const JOIN = Onb.T1086_JOIN_LINE, LOT = Onb.T1086_LOT_LINE;
const OLD_HOOK = '며칠 일손을 보태면 마을 끝 빈터 하나 내어줌세.';

sec('① 켬 · 시작 마을 첫 의뢰 — 빈터 + 권함이 그 자리에서 선다');
try {
  ok(Onb.T1086 === true && M.T1086 === true, '★손잡이 켬 기본 후보 — env 를 안 주면 켜져 있다(`T1086_FIRST_JOIN` · `=0` 만 끔)');
  const p = B.mk('a1', 1);
  ok(!Onb.vacantLotAllows(p, ARR[1].x, ARR[1].y) && p._memberOfferVid == null, '[상황] 의뢰 전 — 빈터 권리 없음 · 권함 없음(아래가 자명 통과가 아니다)');
  B.deliver(p, 1);
  const o = B.take(p);
  const hook = o.find((m) => m.type === 'onboarding_quest' && m.kind === 'hook');
  ok(!!hook && hook.lines[0] === '잘했네. 오늘은 밥이라도 들게.' && /쉼터/.test(hook.lines[1] || '') && hook.lines[2] === JOIN && hook.lines[3] === LOT && hook.lines.length === 4,
    '★촌장 한 통 — 밥 · 쉼터(종전 둘 그대로) · 권함 · 빈터(종전 "며칠 일손을 보태면 …" 대신)', JSON.stringify(hook && hook.lines));
  ok(Onb.stateOf('a1').lot_ok === 1 && Onb.vacantLotAllows(p, ARR[1].x, ARR[1].y), '★빈터 권리가 첫 의뢰에 섰다(종전은 의뢰 3건 · 구역은 종전 그대로)', `contrib=${Onb.stateOf('a1').contrib}`);
  ok(p._memberOfferVid === 1 && p._t1086Offer === 1, '★권함 자리 — 시작 마을(종전 문턱 12 대신)', JSON.stringify([p._memberOfferVid, p._t1086Offer]));
  ok(!!hook && hook.join && hook.join.member === null && hook.join.offer === 1 && hook.state && hook.state.lotOk === true, '훅 한 통에 가입 형편 · 대본 상태(칸이 바로 다음 단계)', JSON.stringify(hook && hook.join));
  const st = o.find((m) => m.type === 'onboarding_state');
  ok(!!st && st.join && st.join.offer === 1 && !('arrive' in st), '칸 갱신 한 통 — 가입 형편 · 도착 칸 없음(몸을 다시 안 돌린다)', JSON.stringify(st && st.join));
  ok(!o.some((m) => m.type === 'notice') && !o.some((m) => m.kind === 'lot'), '종전 권함 알림 · 종전 빈터 한 통은 안 간다(같은 말을 두 번 안 한다)', o.map((m) => m.type + ':' + (m.kind || '')).join(','));
  ok(M.contribOf('a1') === 1, '계량기는 그대로 하나 — 1(기여를 지어내지 않는다)', M.contribOf('a1'));
  ok(M.firstJoinChat(p, '/소속') === true && !!M.memberOf(p) && M.memberOf(p).vid === 1 && M.memberOf(p).name === '광산1', '★`/소속` — 문턱 12 아래에서도 시작 마을 사람이 된다', JSON.stringify(M.memberOf(p)));
  const j = B.take(p).find((m) => m.kind === 'joined');
  ok(!!j && j.lines[0] === '오늘부터 자네는 우리 마을 사람일세.' && j.lines[1] === LOT && j.lines.length === 2 && j.vid === 1 && j.name === '광산1',
    '받아들인 말 — "오늘부터 …"(종전 수락 말 그 문장) + 빈터 줄(아직 터가 없다)', JSON.stringify(j && j.lines));
  ok(!!j && j.join && j.join.member && j.join.member.vid === 1 && j.join.offer === null && p._memberOfferVid == null && p._t1086Offer == null, '받아들이면 권함 자리를 비운다 · 칸 형편 = 마을 사람', JSON.stringify(j && j.join));
  ok(M.firstJoinChat(p, '/소속') === false && M.firstJoinChat(B.mk('a1x', 1), '/마을') === false, '이미 마을 사람 · 다른 명령은 이 문이 안 받는다(종전 문이 답한다)');
  // 터를 이미 잡았으면 빈터 줄은 헛말 — 안 한다
  const p2 = B.mk('a2', 1);
  B.deliver(p2, 1); B.take(p2);
  B.W.claimed = true;
  M.firstJoinChat(p2, '/소속');
  const j2 = B.take(p2).find((m) => m.kind === 'joined');
  B.W.claimed = false;
  ok(!!j2 && j2.lines.length === 1 && j2.lines[0] === '오늘부터 자네는 우리 마을 사람일세.', '빈터에 이미 터를 잡았으면 빈터 줄을 안 한다(헛말 0)', JSON.stringify(j2 && j2.lines));
} catch (e) { ok(false, '① 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

sec('② 첫 납품이 다른 마을이면 — 종전 훅 그대로 · 시작 마을 의뢰를 채우는 순간 권함 + 빈터 한 통');
try {
  const q = B.mk('b1', 1);
  B.deliver(q, 2);
  let o = B.take(q);
  const h = o.find((m) => m.kind === 'hook');
  ok(!!h && h.lines[h.lines.length - 1] === OLD_HOOK && !Onb.stateOf('b1').lot_ok && q._memberOfferVid == null, '다른 마을 의뢰 — 종전 훅("며칠 일손을 보태면 …") · 빈터 · 권함 0', JSON.stringify(h && h.lines));
  B.deliver(q, 1);
  o = B.take(q);
  const of = o.find((m) => m.kind === 'offer');
  ok(!!of && of.lines.length === 2 && of.lines[0] === JOIN && of.lines[1] === LOT && of.vid === 1 && of.join && of.join.offer === 1, '★시작 마을 의뢰를 채운 순간 — 권함 · 빈터 한 통(\'offer\')', JSON.stringify(of && of.lines));
  ok(Onb.stateOf('b1').lot_ok === 1 && q._memberOfferVid === 1, '빈터 권리 · 권함 자리가 섰다');
  B.deliver(q, 1);
  o = B.take(q);
  const sts = o.filter((m) => m.type === 'onboarding_state');
  ok(!o.some((m) => m.kind === 'offer' || m.kind === 'hook' || m.kind === 'lot') && sts.length === 1 && sts[0].state.contrib === 3 && sts[0].join && sts[0].join.offer === 1,
    '다음 의뢰 — 이미 권했고 빈터도 섰으면 같은 말을 또 안 한다(앵무새 0) · 계량기는 대본 상태 한 통으로 바로 선다(3)', o.map((m) => m.type + ':' + (m.kind || '')).join(','));
} catch (e) { ok(false, '② 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

sec('③ 권함이 안 서는 자리 — 초대제 마을 · 이미 다른 마을 사람');
try {
  const r3 = B.mk('c1', 3);
  B.deliver(r3, 3);
  const h3 = B.take(r3).find((m) => m.kind === 'hook');
  ok(!!h3 && !h3.lines.includes(JOIN) && h3.lines[h3.lines.length - 1] === LOT && r3._memberOfferVid == null && Onb.stateOf('c1').lot_ok === 1,
    '초대제 마을 — 기여로 권하지 않는다(T785) · 빈터는 선다', JSON.stringify(h3 && h3.lines));
  ok(M.firstJoinChat(r3, '/소속') === false && !M.memberOf(r3), '초대제 마을 — `/소속` 을 이 문이 안 받는다');
  const s4 = B.mk('d1', 1);
  s4.member = { zone: 'lab', vid: 2, name: '어촌2', since: 1 };
  B.deliver(s4, 1);
  const h4 = B.take(s4).find((m) => m.kind === 'hook');
  ok(!!h4 && !h4.lines.includes(JOIN) && s4._memberOfferVid == null && M.memberOf(s4).vid === 2, '이미 다른 마을 사람 — 권함 0 · 소속 그대로(한 사람은 한 마을 · K-1)', JSON.stringify(h4 && h4.lines));
} catch (e) { ok(false, '③ 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

sec('④ 종전 문 그대로 — 대본 밖 사람은 K-2 · 문턱을 넘은 사람은 종전 accept');
try {
  const e1 = B.mk('e1', null);
  for (let i = 0; i < M.CFG.N_MEMBER - 1; i++) B.deliver(e1, 2);
  let o = B.take(e1);
  ok(e1._memberOfferVid == null && !Onb.stateOf('e1').start_vid, `대본 밖(시작 마을 없음) — ${M.CFG.N_MEMBER - 1}건에도 권함 0(종전 그대로)`, M.contribOf('e1'));
  B.deliver(e1, 2);
  o = B.take(e1);
  ok(e1._memberOfferVid === 2 && e1._t1086Offer == null && o.some((m) => m.type === 'notice' && /이만하면 우리 마을 사람일세/.test(m.text)), `${M.CFG.N_MEMBER}건 — 종전 권함 알림`, JSON.stringify(o.filter((m) => m.type === 'notice').map((m) => m.text)));
  ok(M.firstJoinChat(e1, '/소속') === false, '종전 권함은 이 문이 안 받는다');
  ok(M.handleChat(e1, '/소속') === true && M.memberOf(e1) && M.memberOf(e1).vid === 2, '종전 문(`accept`)이 받는다 — 종전 말');
  const f1 = B.mk('f1', 1);
  const sf = Onb.stateOf('f1'); sf.contrib = M.CFG.N_MEMBER; Onb.__probe.save('f1', sf);
  B.deliver(f1, 1);
  B.take(f1);
  ok(f1._memberOfferVid === 1 && f1._t1086Offer === 1, '[상황] 문턱을 넘은 사람도 시작 마을 첫 의뢰에 권함이 선다');
  ok(M.firstJoinChat(f1, '/소속') === false && M.handleChat(f1, '/소속') === true && M.memberOf(f1).vid === 1, '문턱을 넘은 사람 — 종전 문(accept · 종전 말)이 받는다(같은 결과)');
} catch (e) { ok(false, '④ 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

sec('⑤ 다시 접속 · 탈퇴 · 칸 갱신');
try {
  const g = B.mk('g1', 1);
  B.deliver(g, 1); B.take(g);
  const g2 = { playerId: 'g1', pid: 'g1b', name: 'g1', ws: { id: 'g1b' }, x: 0, y: 0, inventory: {}, member: null, isNpc: false };   // 새 몸(권함은 메모리 칸 — 사라졌다)
  ok(g2._memberOfferVid == null, '[상황] 다시 접속한 몸에는 권함이 없다');
  Onb.handleMsg(g2, { type: 'onboarding_state' });
  const s = B.take(g2).find((m) => m.type === 'onboarding_state');
  ok(g2._memberOfferVid === 1 && g2._t1086Offer === 1 && !!s && s.join && s.join.offer === 1 && !!s.arrive, '★접속해 대본 상태를 물으면 빈터 권리로 권함을 다시 건다(도착 칸은 그대로 실린다)', JSON.stringify(s && s.join));
  const h = B.mk('h1', 1);
  B.deliver(h, 1); B.take(h);
  M.firstJoinChat(h, '/소속'); B.take(h);
  M.handleChat(h, '/탈퇴'); B.take(h);
  ok(!M.memberOf(h) && h._memberOfferVid == null, '[상황] 탈퇴 — 소속 · 권함이 비었다');
  B.deliver(h, 1);
  const of = B.take(h).find((m) => m.kind === 'offer');
  ok(!!of && of.lines.length === 1 && of.lines[0] === JOIN && h._memberOfferVid === 1, '탈퇴 뒤 시작 마을 의뢰를 또 채우면 다시 권한다(빈터는 이미 있어 권함 한 줄)', JSON.stringify(of && of.lines));
  ok(Onb.pushState(h) === true, 'pushState — 켬이면 보낸다');
  const ps = B.take(h).find((m) => m.type === 'onboarding_state');
  ok(!!ps && ps.join && ps.join.offer === 1 && !('arrive' in ps), '칸 갱신 한 통 — 가입 형편 · 도착 칸 없음', JSON.stringify(ps));
} catch (e) { ok(false, '⑤ 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

sec('⑥ 끔(`T1086_FIRST_JOIN=0`) — 종전 K-2 · 종전 훅 · 칸 형편 0 · 문 셋 무동작');
try {
  const env = Object.assign({}, process.env, { T1086_FIRST_JOIN: '0', T1086_CHILD: 'off' });
  const j = JSON.parse(execFileSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8' }));
  ok(j.knobOnb === false && j.knobMem === false, '손잡이 끔 — 두 모듈 다', JSON.stringify([j.knobOnb, j.knobMem]));
  ok(j.hookLast === OLD_HOOK && j.lot === 0 && j.offer === null, '★끔 — 첫 의뢰 뒤 종전 훅("며칠 일손을 보태면 …") · 빈터 0 · 권함 0', JSON.stringify(j));
  ok(j.joinKey === false && /onboarding_quest:hook/.test(j.kinds) && !/offer|joined/.test(j.kinds), '끔 — 메시지에 `join` 칸이 없다(옛 바이트) · 새 한 통 0', j.kinds);
  ok(j.fc === false && j.of === false && j.ps === false, '끔 — `firstJoinChat` · `offerFirst` · `pushState` 무동작', JSON.stringify([j.fc, j.of, j.ps]));
} catch (e) { ok(false, '⑥ 절이 끝까지 못 돌았다(예외)', String(e && e.message || e).slice(0, 200)); }

// ── 클라 — 70-lobby.js 원문 ─────────────────────────────────────────────────────
const SRC = rd('public/client/70-lobby.js');
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
      for (const m of el._html.matchAll(/<(\w+) id="([^"]+)"(?: type="[^"]*")?(?: class="([^"]*)")?/g)) { const k = mk(m[1]); k.id = m[2]; if (m[3]) k.className = m[3]; byId.set(m[2], k); }
    } });
    return el;
  };
  const doc = { getElementById: (id) => byId.get(id) || null, createElement: (t) => mk(t), body: null };
  doc.body = mk('body');
  const game = mk('div'); game.id = 'game'; byId.set('game', game);
  const mini = mk('div'); mini.id = 'minimap'; byId.set('minimap', mini);
  mini.getBoundingClientRect = () => ({ left: 1086, top: 12, right: 1428, bottom: 250, width: 342, height: 238 });
  return { doc, byId };
}
const OFF = { x: 409984, y: 0 };
const HOME = { x: OFF.x + 2120 * 32 + 16, y: 2117 * 32 + 16, name: '광산1' };
const ARRC = { vid: 1, name: '광산1', kind: 'dock', x: 66000, y: 67000, centerX: HOME.x - OFF.x, centerY: HOME.y - OFF.y };
const LOTC = { x: 66000, y: 67000, r: 320 };
const ST1 = { vid: 1, firstItem: 'wood', firstDone: true, contrib: 1, need: 3, lotOk: true, lot: LOTC, day: { day: 1, deliv: 1, fish: 0 } };
const COST = { wood: 3, stone: 2 };
const LOTABS = { x: LOTC.x + OFF.x, y: LOTC.y + OFF.y };
function load(src, cfg) {
  const D = fakeDom();
  const sentC = [];
  const ctx = { console, Math, JSON, Map, Set, Array, Object, String, Number, isFinite, document: D.doc, innerWidth: 1440, innerHeight: 900,
    uiCfg: cfg || {}, window: {}, conns: new Map(), primaryZoneId: 'hanbando', evNearVid: null, myAbsPredicted: { x: OFF.x + 64000, y: 64000 },
    inventory: { wood: 0, stone: 0 }, myPlayerId: 'u1', myUsername: 'u1', sendPrimary: (m) => sentC.push(m),
    uiIcon: (n) => `<svg data-i="${n}"></svg>`, itemKo: (k) => ({ wood: '나무' }[k] || k) };
  ctx.window.__w2s = (x, y) => ({ px: (x - y), py: (x + y) / 2 });
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'public/client/70-lobby.js' });
  return { ctx, D, sentC };
}
const anchor = (vid) => (vid === 1 ? HOME : null);
const Ib = (o) => Object.assign({ state: ST1, arrive: ARRC, greet: null, nearVid: null, me: { x: OFF.x + 64000, y: 64000 }, off: OFF, anchor,
  itemKo: (k) => k, join: { member: { vid: 1, name: '광산1' }, offer: null }, firstJoin: { cost: COST }, inv: { wood: 0, stone: 0 }, myLot: null }, o || {});
const flat = (p) => p ? p.guide.map((x) => (x && x.k != null) ? `[${x.k}]` : x).join('') : '';
const CL = load(SRC, { nextStep: true, firstJoin: { cost: COST } });
const HAS = typeof CL.ctx.onbJoinPlan === 'function';
const plan = (I) => (HAS ? CL.ctx.onbNextPlan(I) : undefined);

sec('⑦ 칸 — 마을 가입 → 사유지 터 잡기 → 내 집 짓기(켬 · 서버 형편 그대로)');
const CASES = [];
try {
  ok(HAS && typeof CL.ctx.onbMyLot === 'function' && typeof CL.ctx.onbNextPress === 'function', '제품 글자에 T1086 함수 셋이 있다(onbJoinPlan · onbMyLot · onbNextPress)');
  const jn = plan(Ib({ join: { member: null, offer: 1 }, state: Object.assign({}, ST1, { lotOk: true }) }));
  ok(jn && jn.stage === 'join' && jn.item === '마을 가입' && jn.btn === 'join' && jn.target === null, '★권함이 걸려 있으면 "마을 가입" — 단추 · 화살 없음(어디서나 든다)', JSON.stringify(jn && [jn.stage, jn.item, jn.btn]));
  ok(jn && /마을 가입 단추를 누르거나 채팅에 \/소속 이라고 적으십시오/.test(flat(jn)), '가입 — 단추 · 채팅 두 길을 다 말한다', flat(jn));
  const jnPre = plan(Ib({ join: { member: null, offer: 1 }, state: Object.assign({}, ST1, { lotOk: false }), greet: null, nearVid: 1 }));
  ok(jnPre && jnPre.stage === 'join', '차례 — 권함이 다른 모든 단계보다 앞(종전 문턱 권함도 같은 칸)', jnPre && jnPre.stage);
  const out = plan(Ib());
  ok(out && out.stage === 'claim' && out.item === '사유지 터 잡기' && out.target && out.target.x === LOTABS.x && out.target.y === LOTABS.y && !out.btn,
    '★마을 사람 · 빈터 밖 — "사유지 터 잡기" · 목표 = 서버 빈터 + 존 오프셋 · 단추 없음', JSON.stringify(out && out.target));
  const inNo = plan(Ib({ me: { x: LOTABS.x + 40, y: LOTABS.y } }));
  ok(inNo && inNo.stage === 'claim' && !inNo.btn && inNo.target === null && /나무 3개와 돌 2개가 있어야 합니다\. 지금 나무 0개와 돌 0개가 있습니다\./.test(flat(inNo)),
    '빈터 안 · 재료 모자람 — 단추 없음 · 무엇이 몇 개 있어야 하고 지금 몇 개인지(서버 터 값 · 짐)', flat(inNo));
  const inYes = plan(Ib({ me: { x: LOTABS.x + 40, y: LOTABS.y }, inv: { wood: 3, stone: 2 } }));
  ok(inYes && inYes.stage === 'claim' && inYes.btn === 'claim' && /터 잡기 단추를 누르거나 \[C\] 키로 선 자리에 터를 잡으십시오\. 나무 3개와 돌 2개가 듭니다\./.test(flat(inYes)),
    '★빈터 안 · 재료 됨 — "터 잡기" 단추 · C 키 · 드는 재료', flat(inYes));
  const inv5 = plan(Ib({ me: { x: LOTABS.x + 40, y: LOTABS.y }, inv: { wood: 9, stone: 1 } }));
  ok(inv5 && !inv5.btn && /지금 나무 9개와 돌 1개가 있습니다/.test(flat(inv5)), '하나라도 모자라면 단추 없음(돌 1 · 2 필요)', flat(inv5));
  const bOut = plan(Ib({ myLot: { x: LOTABS.x + 48, y: LOTABS.y + 16, inside: false } }));
  ok(bOut && bOut.stage === 'build' && bOut.item === '내 집 짓기' && bOut.target && bOut.target.x === LOTABS.x + 48 && !bOut.btn && /\[Shift B\] 에서 움집 터파기를 고르십시오/.test(flat(bOut)),
    '★빈터에 제 터가 있으면 "내 집 짓기" — 터 밖이면 그 터 쪽 화살 · 건축 판 키', flat(bOut));
  const bIn = plan(Ib({ myLot: { x: LOTABS.x + 48, y: LOTABS.y + 16, inside: true } }));
  ok(bIn && bIn.stage === 'build' && bIn.target === null, '제 터 안이면 화살 없음(닿았다)');
  const noJ = plan(Ib({ join: undefined })), offOut = plan(Ib({ firstJoin: null }));
  ok(noJ && noJ.stage === 'lot' && noJ.item === '빈터로 가기' && offOut && offOut.stage === 'lot' && !noJ.btn && !offOut.btn,
    '서버가 형편을 안 보냈거나 끔이면 종전(T1064) 차례 — 빈터 밖 = 종전 "빈터로 가기"', JSON.stringify([noJ && noJ.stage, offOut && offOut.stage]));
  const t1064 = plan(Ib({ firstJoin: null, me: { x: LOTABS.x + 40, y: LOTABS.y } }));
  ok(t1064 && /\[C\] 키로 땅을 걸고/.test(flat(t1064)) && !t1064.btn, '끔 — T1064 칸 글자 그대로(단추 0)', flat(t1064));
  const notLot = plan(Ib({ state: Object.assign({}, ST1, { lotOk: false }), join: { member: { vid: 1, name: '광산1' }, offer: null } }));
  ok(notLot && notLot.stage === 'more', '마을 사람이어도 빈터 권리가 없으면 종전 차례(의뢰 더)', notLot && notLot.stage);
  CASES.push(jn, out, inNo, inYes, bOut);
  // 빈터 안 제 터 고르기 — 클라가 받은 사유지(존 로컬)를 읽기만
  const c = CL.ctx;
  vm.runInContext(`onbState = ${JSON.stringify(ST1)};`, c);
  const cl = new Map([['c1', { id: 'c1', ownerPid: 'u1', kind: 'personal', x: LOTC.x + 32, y: LOTC.y, w: 32, h: 32 }], ['c2', { id: 'c2', ownerPid: 'other', kind: 'personal', x: LOTC.x, y: LOTC.y, w: 32, h: 32 }],
    ['c3', { id: 'c3', ownerPid: 'u1', kind: 'temporary', x: LOTC.x - 64, y: LOTC.y, w: 32, h: 32 }], ['c4', { id: 'c4', ownerPid: 'u1', kind: 'personal', x: LOTC.x + 4000, y: LOTC.y, w: 32, h: 32 }]]);
  const conn = { meta: { worldOffsetX: OFF.x, worldOffsetY: OFF.y }, claims: cl };
  const ml = c.onbMyLot(conn, OFF, { x: LOTABS.x + 40, y: LOTABS.y + 10 });
  ok(!!ml && ml.x === LOTABS.x + 48 && ml.y === LOTABS.y + 16 && ml.inside === true, '빈터 안 제 개인 사유지 — 남의 것 · 임시 · 빈터 밖 것은 안 센다 · 안에 서 있다', JSON.stringify(ml));
  const ml2 = c.onbMyLot(conn, OFF, { x: LOTABS.x, y: LOTABS.y });
  ok(!!ml2 && ml2.inside === false, '제 터 밖이면 inside 거짓');
  cl.delete('c1');
  ok(c.onbMyLot(conn, OFF, { x: LOTABS.x, y: LOTABS.y }) === null, '빈터 안 제 개인 사유지가 없으면 null');
} catch (e) { ok(false, '⑦ 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

sec('⑦b 그리기 — 단추 하나 · 이름 · 보내는 메시지(이미 있는 두 길)');
try {
  const L = load(SRC, { nextStep: true, firstJoin: { cost: COST } });
  const c = L.ctx;
  c.conns.set('hanbando', { meta: { worldOffsetX: OFF.x, worldOffsetY: OFF.y }, claims: new Map() });
  c._evVillageAnchorAbs = (vid) => { const a = anchor(vid); return a ? { x: a.x, y: a.y, v: { name: a.name } } : null; };
  vm.runInContext(`onbState = ${JSON.stringify(ST1)}; onbArrive = ${JSON.stringify(ARRC)}; onbJoin = { member: null, offer: 1 };`, c);
  vm.runInContext('onbNextRender()', c);
  const bt = L.D.byId.get('onbNextBtn'), el = L.D.byId.get('onbNext');
  ok(!!bt && bt.tagName === 'BUTTON' && el.dataset.stage === 'join' && bt.textContent === '마을 가입' && bt.dataset.act === 'join' && !bt.classList.contains('hidden'), '★가입 단계 — 단추 "마을 가입"이 보인다', JSON.stringify([el.dataset.stage, bt && bt.textContent]));
  ok(c.onbNextPress(bt.dataset.act) === true && L.sentC.length === 1 && L.sentC[0].type === 'chat' && L.sentC[0].text === '/소속', '단추 = 채팅 `/소속` 그 한 줄(서버 문은 하나 · 새 메시지 0)', JSON.stringify(L.sentC));
  ok(vm.runInContext('onbNextLast.btn', c) === 'join', '하네스 읽기 훅에 단추가 실린다');
  vm.runInContext(`onbJoin = { member: { vid: 1, name: '광산1' }, offer: null }; inventory = { wood: 3, stone: 2 };`, c);
  c.myAbsPredicted = { x: LOTABS.x + 40, y: LOTABS.y };
  vm.runInContext('onbNextRender()', c);
  ok(el.dataset.stage === 'claim' && bt.textContent === '터 잡기' && bt.dataset.act === 'claim' && !bt.classList.contains('hidden'), '★터 잡기 단계(빈터 안 · 재료 됨) — 단추 "터 잡기"', JSON.stringify([el.dataset.stage, bt.textContent]));
  L.sentC.length = 0;
  ok(c.onbNextPress('claim') === true && L.sentC.length === 1 && L.sentC[0].type === 'claim' && L.sentC[0].kind === 'personal', '단추 = C 키 그 메시지(개인 사유지)', JSON.stringify(L.sentC));
  vm.runInContext(`inventory = { wood: 0, stone: 0 };`, c);
  vm.runInContext('onbNextRender()', c);
  ok(bt.classList.contains('hidden') && bt.dataset.act === '', '재료가 모자라면 단추가 숨는다(누를 수 없는 단추 0)');
  ok(c.onbNextPress('') === false && c.onbNextPress('x') === false, '빈 이름 · 모르는 이름은 아무것도 안 보낸다');
  // 게시판 판(`#boardPane` · 납품하면 저절로 열린다)이 칸 자리를 덮으면 — 판 밑으로(자리가 있으면) · 없으면 판 왼쪽으로
  //   ★[T1169 · K18] 이 절은 **끔 갈래**(`?T1070_VILLAGE_VIEW=0` — Shift+G = 게시판 판)의 것이다. 켬 기본(T1137)의 마을 화면 `#vvPane` 은
  //   전체 화면 판(`position:fixed · inset:0`)이라 칸을 비켜 세울 자리가 없다 — 판을 닫으면 칸이 그대로 보인다(비켜 서기 대상 아님 · 제품 글자 무변).
  c.getComputedStyle = () => ({ marginTop: '8px' });
  const bp = L.D.doc.createElement('div'); bp.id = 'boardPane'; L.D.byId.set('boardPane', bp);
  bp.getBoundingClientRect = () => ({ left: 904, right: 1424, top: 64, bottom: 443, width: 520, height: 379 });
  vm.runInContext('onbNextRender()', c);
  const below = [el.style.top, el.style.right];
  bp.getBoundingClientRect = () => ({ left: 904, right: 1424, top: 64, bottom: 896, width: 520, height: 832 });
  vm.runInContext('onbNextRender()', c);
  const left = [el.style.top, el.style.right];
  bp.classList.add('hidden');
  vm.runInContext('onbNextRender()', c);
  const back = [el.style.top, el.style.right];
  ok(below[0] === '443px' && below[1] === '12px' && left[0] === '250px' && left[1] === `${1440 - 904 + 8}px` && back[0] === '250px' && back[1] === '12px',
    '★게시판 판이 칸 자리를 덮으면 판 밑으로 · 판이 길면 판 왼쪽으로 · 판을 닫으면 제자리(단추가 판 밑에 깔리지 않는다)', JSON.stringify({ below, left, back }));
  // 촌장 한 통이 넷째 줄까지 말풍선에 선다(첫 의뢰 훅 = 밥 · 쉼터 · 권함 · 빈터)
  const vb = new Map();
  Object.assign(c, { showNotice: () => {}, speechBubbles: new Map(), villageBubbles: vb, performance: { now: () => 0 }, updateHud: () => {}, needsRedraw: false });
  vm.runInContext(`onbOnMessage({ type: 'onboarding_quest', kind: 'hook', vid: 1, name: '광산1', quest: null, lines: ['a', 'b', 'c', 'd'], join: { member: null, offer: 1 } })`, c);
  ok(vb.get(1) && vb.get(1).lines.length === 4 && vm.runInContext('onbJoin && onbJoin.offer', c) === 1, '말풍선 넷째 줄까지 · 한 통에 실린 가입 형편을 칸이 든다', JSON.stringify(vb.get(1) && vb.get(1).lines));
  c.uiCfg.firstJoin = undefined;
  bp.classList.remove('hidden');
  bp.getBoundingClientRect = () => ({ left: 904, right: 1424, top: 64, bottom: 443, width: 520, height: 379 });
  vm.runInContext('onbNextRender()', c);
  ok(el.dataset.stage === 'build' && bt.classList.contains('hidden'), '끔(welcome 에 firstJoin 없음) — T1064 칸 그대로 · 단추 숨김', el.dataset.stage);
  ok(el.style.top === '250px' && el.style.right === '12px', '끔 — 게시판 판이 열려도 종전(T1064) 자리 그대로(비켜 서기는 켬에서만)', JSON.stringify([el.style.top, el.style.right]));
} catch (e) { ok(false, '⑦b 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

sec('⑧ 말투 · 새 수 0 · 먹선 · 서버 손잡이 줄');
try {
  const EMO = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  const items = CASES.map((p) => p.item), guides = CASES.map((p) => p.guide.filter((x) => typeof x === 'string').join(''));
  ok(CASES.length === 5 && new Set(CASES.map((p) => p.stage)).size === 3, '단계 셋(가입 · 터 잡기 · 집 짓기)이 다 섰다', CASES.map((p) => p.stage).join(' '));
  ok(items.every((t) => !/[다요]\.?$/.test(t)) && items.join('|') === '마을 가입|사유지 터 잡기|사유지 터 잡기|사유지 터 잡기|내 집 짓기', '할 일은 명사형(카드의 이름 그대로 — 마을 가입 · 사유지 터 잡기 · 내 집 짓기)', JSON.stringify(items));
  ok(guides.every((t) => /(니다|십시오)\.\s*$/.test(t.trim()) && !/요\.|요$/.test(t)), '설명은 하십시오체 · 해요체 0', JSON.stringify(guides.map((t) => t.trim().slice(-8))));
  const allTxt = items.join('|') + '|' + CASES.map(flat).join('|');
  ok(!/[·→←↑↓()!！]/.test(allTxt) && !EMO.test(allTxt), '칸 글자 — 가운뎃점 · 화살표 · 괄호 · 느낌표 · 이모지 0', (allTxt.match(/[·→←↑↓()!！]/g) || []).join(''));
  ok(CASES.every((p) => p.guide.every((x, i) => !(x && x.k != null) || /^ 키로|^ 에서/.test(String(p.guide[i + 1] || '')))), '단축키 뒤 조사는 "키로"(또는 "에서")');
  const npc = [JOIN, LOT, '오늘부터 자네는 우리 마을 사람일세.'];
  ok(npc.every((l) => l.split(/(?<=\.)\s+/).every((u) => /(게|네|세|일세)\.$/.test(u.trim()))) && !/[·→←↑↓()!！]/.test(npc.join('')) && !EMO.test(npc.join('')),
    '촌장 말 — 하게체(…게 · …네 · …일세) · 기호 · 이모지 0', JSON.stringify(npc));
  const body = SRC.slice(SRC.indexOf('function onbJoinPlan('), SRC.indexOf('function onbNextPress('));
  const nums = [...body.replace(/\/\/[^\n]*/g, '').matchAll(/(?<![\w$.])(\d+(?:\.\d+)?)(?![\w$])/g)].map((m) => m[1]);
  ok(body.length > 0 && nums.every((n) => n === '0' || n === '1' || n === '2'), '새 수 0 — 고르기 · 제 터 함수 몸의 수 글자 = 0 · 1 · 2 뿐(터 값 · 반경 · 문턱은 서버)', JSON.stringify([...new Set(nums)]));
  const p1 = plan(Ib({ firstJoin: { cost: { wood: 5, stone: 4 } }, me: { x: LOTABS.x + 40, y: LOTABS.y }, inv: { wood: 5, stone: 3 } }));
  ok(p1 && !p1.btn && /나무 5개와 돌 4개가 있어야/.test(flat(p1)), '터 값을 바꾸면 글자 · 단추가 따라간다(서버 정본 하나)', flat(p1).slice(0, 40));
  const css = rd('public/style.css');
  const i0 = css.indexOf('.onb-next-btn {'), i1 = css.indexOf('.onb-next-btn:hover');
  const block = (i0 >= 0 && i1 > i0) ? css.slice(i0, css.indexOf('\n', i1)) : '';
  ok(block.length > 0 && !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(block) && /var\(--line-2\)/.test(block) && /var\(--accent\)/.test(block) && /pointer-events: auto/.test(block) && !/border-radius|box-shadow/.test(block),
    '먹선 — 단추 CSS 는 토큰만 · 단추만 눌림을 먹는다 · 모서리 · 그림자 0', block.replace(/\s+/g, ' ').slice(0, 80));
  const zn = rd('server/zone.js');
  ok(/\.\.\.\(process\.env\.T1086_FIRST_JOIN !== '0' \? \{ firstJoin: \{ cost: CLAIM_COST\.personal \} \} : \{\}\)/.test(zn), '서버 손잡이 — welcome `uiCfg.firstJoin` · 터 값 = `CLAIM_COST.personal`(클라 상수 0)');
  //   ★[T1137] 채팅 갈래의 세 줄이 `_t1137Chat` 한 함수로 옮겨 갔다(차례 · 칸 갱신 무변 · 마을 화면 칸 갱신이 켬에서 붙는다) — 같은 차례를 그 자리에서 잰다
  ok(/if \(Membership\.firstJoinChat\(player, text\)\) (return;|\{[^\n]*return true; \})[^\n]*\n\s*if \(Membership\.handleChat\(player, text\)\) \{ Onboarding\.pushState\(player\);[^\n]*(return;|return true;) \}/.test(zn), '채팅 길 — 첫 의뢰 권함 문이 종전 소속 문 바로 앞 · 소속 명령 뒤 칸 갱신');
  ok(/offerJoin: \(p, vid\) => Membership\.offerFirst\(p, vid\)/.test(zn) && /joinOf: \(p\) => Membership\.joinOf\(p\)/.test(zn) && /lotClaimed: \(player\) => _t1086LotClaimed\(player\)/.test(zn),
    '존은 부르는 법만 넘긴다(권함 · 형편 · 빈터 터 — 정본은 membership · onboarding · claims)');
  const bub = rd('public/client/41-h-bubble.js'), rl = rd('public/client/34-m-renderloop.js');
  const stack = (rl.match(/(?:by|y) -= bubbleStep\(drawSpeechBubble\(/g) || []).length;
  const i9 = bub.indexOf('function bubbleStep('), fsrc = i9 >= 0 ? bub.slice(i9, bub.indexOf('\n', i9)) : '';
  const stepOn = fsrc ? vm.runInContext(fsrc + '; bubbleStep', vm.createContext({ uiCfg: { firstJoin: { cost: COST } } })) : null;
  const stepOff = fsrc ? vm.runInContext(fsrc + '; bubbleStep', vm.createContext({ uiCfg: {} })) : null;
  ok(/ctx\.textAlign = 'start';\n\s*return bubH;/.test(bub) && stack === 2 && !/drawSpeechBubble\([^)]*\); (?:by|y) -= 26;/.test(rl) && !!stepOn
    && stepOn(27) === 26 && stepOn(42) === 41 && stepOn(undefined) === 26 && stepOff(42) === 26 && stepOff(27) === 26,
    '말풍선 쌓기 — 켬이면 판 높이만큼(두 자리 · 한 줄 판 27 → 종전 26 · 두 줄 판 42 → 41) · 끔이면 종전 26 그대로', `${stack}곳 · ${stepOn && [stepOn(27), stepOn(42), stepOff(42)].join(',')}`);
  const blobb = SRC.slice(SRC.indexOf('// ★[T1086] 게시판 판(`#boardPane`'), SRC.indexOf("} else { el.style.top = ''; el.style.right = ''; el.style.width = ''; }"));
  const nb = [...blobb.replace(/\/\/[^\n]*/g, '').matchAll(/(?<![\w$.])(\d+(?:\.\d+)?)(?![\w$])/g)].map((m) => m[1]);
  ok(blobb.length > 0 && nb.every((n) => n === '0'), '새 수 0 — 판 비켜 서기의 틈은 CSS 칸 위 틈 그대로(수 글자 0)', JSON.stringify([...new Set(nb)]));
} catch (e) { ok(false, '⑧ 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

sec('⑨ 돌연변이 — 고침의 뼈를 걷어 낸 글자면 위 판정이 빨갛다(자명 통과 금지)');
try {
  // 클라: 가입 단계 · 빈터 밖 화살을 걷는다
  const M1 = SRC.replace('if (!J.member && J.offer != null) {', 'if (false) {');
  const M2 = SRC.replace('  if (!inLot) {\n    return { stage: \'claim\'', '  if (false) {\n    return { stage: \'claim\'');
  ok(M1 !== SRC && M2 !== SRC, '클라 돌연변이 글자를 세웠다(두 자리 다 제품 글자에 있다)');
  const c1 = load(M1, { nextStep: true, firstJoin: { cost: COST } }).ctx, c2 = load(M2, { nextStep: true, firstJoin: { cost: COST } }).ctx;
  const a = c1.onbNextPlan(Ib({ join: { member: null, offer: 1 } })), b = c2.onbNextPlan(Ib());
  ok(a && a.stage !== 'join' && b && !(b.target && b.target.x === LOTABS.x), '클라 돌연변이 — 가입 단계가 사라지고(⑦ "마을 가입"이 잡는다) · 빈터 밖 화살이 사라진다(⑦ "목표 = 서버 빈터"가 잡는다)', JSON.stringify([a && a.stage, b && b.target]));
  // 서버: 첫 의뢰 빈터 권리 한 줄을 걷는다 — 격리된 모듈 하나(같은 파일 이름 · 같은 상대 require)로 올린다
  const OS = rd('server/onboarding.js');
  const MS = OS.replace('  if (_fjLot) s.lot_ok = 1;\n', '');
  ok(MS !== OS, '서버 돌연변이 글자를 세웠다(그 줄이 제품 글자에 있다)');
  const fn = path.join(ROOT, 'server', 'onboarding.js');
  const mod = new Module(fn, null); mod.filename = fn; mod.paths = Module._nodeModulePaths(path.dirname(fn));
  mod._compile(MS, fn);
  const OnbX = mod.exports;
  const sentX = [];
  OnbX.init({ db: new (require('better-sqlite3'))(':memory:'), gameDay: () => 7, send: (ws, m) => sentX.push(m), warm: false, offerJoin: () => true, joinOf: () => ({ member: null, offer: 1 }) });
  OnbX.__probe.setArrivals(new Map([[1, ARR[1]]]));
  const px = { playerId: 'mx', pid: 'mx', name: 'mx', ws: {}, x: 0, y: 0, inventory: {}, member: null };
  const sx = OnbX.stateOf('mx'); sx.start_vid = 1; sx.arrived = 1; OnbX.__probe.save('mx', sx);
  OnbX.onDeliver(px, DONE, 1);
  ok(!OnbX.stateOf('mx').lot_ok && !OnbX.vacantLotAllows(px, ARR[1].x, ARR[1].y), '서버 돌연변이 — 첫 의뢰에 빈터 권리가 안 선다(① "빈터 권리가 첫 의뢰에 섰다"가 잡는다)', `lot_ok=${OnbX.stateOf('mx').lot_ok}`);
} catch (e) { ok(false, '⑨ 절이 끝까지 못 돌았다(예외)', String(e && e.stack || e).slice(0, 200)); }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
