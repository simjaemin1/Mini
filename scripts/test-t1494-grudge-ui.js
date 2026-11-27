// @regress
// @bait 10
// === scripts/test-t1494-grudge-ui.js — T1494 원한을 플레이어가 볼 수 있게(마을 창 "원한 품은 사람" · 내 창 "나를 미워하는 마을" · 촌장 토벌 단추 · 일감 저장 · `_grudgeMax`) ==========
// 판(운영 함수 그대로 · 사본 0 · 손잡이 `T1447_PERSON_GRUDGE`):
//   ㉮ 셈(아이 · `server/grudge.js` · `sim/war-core.js`) — ①a 단계 = 문턱까지의 몫(⅓ · ⅔ · 1) · 말 넷 ①b 소문은 단계가 오른 날만(내림 = 조용히) · 토벌 소문 ①c 까닭 한 줄
//      ①d `_grudgeMax`(T1187 호전 가중)는 마을끼리 원한만(사람 열쇠 U+0001 빼고 · 목책은 종전 그대로)
//   ㉯ 존(아이 · zone.js 그대로 · 꾸민 마을 셋 — 1 · 2 NPC 마을 · 3 사람이 세운 마을):
//      ②a 마을 창 = 그 마을 장부만(이웃 마을 창엔 0) · 이름 · 단계 말 · 까닭 · 마지막 일 ②b 본 사람이 있을 때 쌓인 순간 한 줄(단계 말) + 내 창 'seen'
//      ②c 가입이 원한으로 거절 → 내 창 'join' ②d 본 사람이 없는 쌓임(길 막기 소식)은 그 자리 줄 0 · 내 창 0 — 소문이 닿는 날(일 난 날 + 도달 날)에야 'rumor'
//      ②e 그 마을이 더 미워해도 소문이 닿기 전엔 내 창은 아는 그대로 ②f 그 마을에 가면 지금 그대로 안다(풀린 것도) · 옛 소문이 새 앎을 덮지 않는다
//      ②g 촌장에게만 정확한 수 · 토벌 줄(명분이 섰을 때만 켜짐) — 구경꾼 칸엔 키조차 없다 ②h 촌장이 누르면(`/토벌 사람 확인`) 몸이 걷는다 ·
//         그 자리에 없던 주인은 떠났다는 소문이 닿는 날 한 줄(한 번) · 그 자리에 있던 주인은 그 자리 줄만(소문 줄 0)
//      ②i 몸 저장 — 아는 원한이 저장 · 되읽기 · 다시 들어옴(`_t1494Login`)을 넘는다 ②j 박자(마을 화면 박자)로 돈다
//   ㉰ 마을(아이 · 마을 층 함수 그대로 · 꾸민 땅) — ③a 토벌 일감이 재기동을 넘는다(T742 칸 → 되살림 · 같은 몸 · 지금 자리에서 다시 걷는다 · 굳은 표지 몸은 일과로) · 끝까지 닿아 친다
//   ㉱ 클라(vm · 그리는 함수 그대로) — ④a 마을 창 판(이름 · 단계 · 까닭) · 촌장 표지가 있을 때만 단추 · 묻는 줄 ④b 끔 자료면 판 0(구성원 판 글자가 칸 없는 판과 같다) · 내 창 0
//   ㉲ 끔 — ⑤ 존 아이: 마을 화면에 칸을 안 준다 · 내 창 메시지 0 · 박자 0 · 몸 저장 칸 0 · 쌓임 0
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언) 열 — 아래 `BAITS`(카드 할 일 6 의 다섯 + 다섯).
// 하네스 안 날짜 · 벽시계 0 — 날 = 꾸민 세계 날(100 부터) · 박자 판은 손잡이 박자 1초 그대로를 기다린다(값을 안 본다 — 돌았나만).
// 실행: node scripts/test-t1494-grudge-ui.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다
const path = require('path'), fs = require('fs'), vm = require('vm');
const { spawnSync } = require('child_process');
const LB = require('./lib-bait');
const ROOT = path.join(__dirname, '..');
const ZFILE = path.join(ROOT, 'server', 'zone.js'), VFILE = path.join(ROOT, 'server', 'villages.js'), GFILE = path.join(ROOT, 'server', 'grudge.js');
const WFILE = path.join(ROOT, 'sim', 'war-core.js'), VVFILE = path.join(ROOT, 'server', 'village-view.js');
const CVV = path.join(ROOT, 'public', 'client', '52-v-village-view.js'), CIP = path.join(ROOT, 'public', 'client', '50-i-panel.js');
const BAITS = {
  rumorNow: { file: ZFILE, at: ['      const heard = here ? eday + lag : Infinity, kk = String(X.dbId), o = (p.t1494k || {})[kk];', '      const heard = eday, kk = String(X.dbId), o = (p.t1494k || {})[kk];   // 미끼 — 소문이 바로 닿는다(시각표 · 선 자리 무시)'] },
  liveMe: { file: ZFILE, at: ["    out.push({ vid: +k, name: v.name, stage: o.s, stageKo: Grudge.STAGE_KO[o.s],", "    const _l = SimVillages.t1494Live(v, p.playerId); /* 미끼 — 그 마을 장부를 그대로 */ out.push({ vid: +k, name: v.name, stage: _l.stage, stageKo: Grudge.STAGE_KO[_l.stage],"] },
  otherVil: { file: ZFILE, at: ['  const rows = SimVillages.t1494Rows(vil).map((r) => {', '  const rows = [].concat(...SimVillages.t1447Villages().map((v2) => SimVillages.t1494Rows(v2))).map((r) => {   // 미끼 — 이웃 마을 장부까지'] },
  chiefAll: { file: ZFILE, at: ['function _t1447IsChief(player, vil) {\n  if (!player || !vil || !vil.econ || !vil.econ.founder) return false;', 'function _t1447IsChief(player, vil) {\n  if (player) return true;   // 미끼 — 아무나 촌장'] },
  clientBtn: { file: CVV, at: ['    if (G.chief && R) {', '    if (R) {   // 미끼 — 촌장 표지 없이 단추'] },
  warp: { file: VFILE, at: ['    for (const pid of pids) { const r = _t1423Walk(players.get(pid), to.x, to.y, job.id, vil);', '    for (const pid of pids) { const _w = players.get(pid); _w.x = to.x; _w.y = to.y; /* 미끼 — 그 자리로 순간 이동 */ const r = _t1423Walk(_w, to.x, to.y, job.id, vil);'] },
  lost: { file: VFILE, at: ["  const live = _t1447Jobs.filter((j) => j.st !== 'done'); if (!live.length) return null;", "  return null;   // 미끼 — 일감을 싣지 않는다"] },
  offLogin: { file: ZFILE, at: ['function _t1494Login(p) { if (!T1447_PERSON_GRUDGE || !p) return;', 'function _t1494Login(p) { if (!p) return; /* 미끼 — 끔에서도 내 창 메시지 */'] },
  offPlate: { file: CVV, at: ["function vvGrudge(G) {\n  if (!G) return '';", "function vvGrudge(G) {\n  if (!G) G = { rows: [] };   // 미끼 — 끔에서도 빈 판"] },
  maxAll: { file: WFILE, at: ['if (g > mv && k.charCodeAt(0) !== 1) mv = g;', 'if (g > mv) mv = g;   /* 미끼 — 사람 원한도 센다 */'] },
};
function baitHook(name) {
  const bait = name && name !== '-' ? BAITS[name] : null; if (!bait) return;
  const Module = require('module'), _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename === bait.file) {
      const n = LB.count(content, bait.at[0]);
      if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ baitErr: `미끼 자리 ${n}번` }) + '\n'); process.exit(3); }
      content = content.replace(bait.at[0], bait.at[1]);
    }
    return _c.call(this, content, filename);
  };
}
const quiet = () => { const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {}; return _log; };
const crash = () => process.on('uncaughtException', (e) => { process.stdout.write('@@' + JSON.stringify({ err: String(e && e.stack).slice(0, 900) }) + '\n'); process.exit(4); });
const FAKE_PRICE = { food: 2, wood: 1, stone: 0.5, wheat: 1.5, fruit: 1 };
const fakeE2 = { shadowPricesOf: (e, keys) => { const o = {}; for (const k of keys) o[k] = FAKE_PRICE[k] || 0; return o; }, computeShadowPrices: () => Object.assign({}, FAKE_PRICE) };

// ── ㉮ 셈 아이 ─────────────────────────────────────────────────────────────
function pureChild(bait) {
  process.env.T1447_PERSON_GRUDGE = '1';
  baitHook(bait); crash();
  const G = require(GFILE), W = require(WFILE);
  const out = {};
  out.st = [0, 0.01, 0.3333, 1 / 3, 0.66, 2 / 3, 0.99, 1, 1.5].map((f) => G.stageOf(f));
  out.fr = [G.fracOf(0.225, 0, Infinity), G.fracOf(0, 3, 5), G.fracOf(0.3, 4, 5), G.fracOf(0, 0, 5)].map((x) => +x.toFixed(4));
  out.ko = G.STAGE_KO.slice();
  const e = {};
  G.noteTouch(e, 'p1', 'gather', 100, 1, '나무'); G.noteTouch(e, 'p1', 'gather', 101, 1, '나무'); G.noteTouch(e, 'p1', 'bld', 102, 3, '벽');
  G.noteSet(e, 'p1', 2); G.noteTouch(e, 'p1', 'gather', 103, 2, null); G.noteTouch(e, 'p1', 'gather', 104, 3, null);
  G.newsAdd(e, 'p1', 105, 3, 'raid', 't1447_1');
  out.note = JSON.parse(JSON.stringify(G.noteOf(e, 'p1')));
  out.why = G.whyLine(out.note); out.last = G.lastLine(G.noteOf(e, 'p1'));
  for (let i = 0; i < 12; i++) G.newsAdd(e, 'p2', 100 + i, 1, 'raid', 'j' + i);
  out.cap = G.noteOf(e, 'p2').e.length;
  out.drop = [G.noteDrop(e, 'p1'), G.noteDrop(e, 'p2'), '_grudgeNote' in e];
  //   ①d `_grudgeMax` — 마을끼리 원한(B 0.3)과 사람 원한(0.9) — 마을만 센다 · 사람 원한만 있는 마을은 0 · 목책은 종전 그대로(사람 원한도 위협)
  const mk = (n) => ({ name: n, center: { cx: 0, cy: 0 }, econ: { name: n, npcs: Array.from({ length: 10 }, (_, i) => ({ id: i, job: 'farmer', age: 30 })), storage: { food: 500, wood: 10 }, counts: { warrior: 2 }, land: { size: 100 } } });
  const A = mk('A'), B = mk('B');
  A.econ._grudge = { B: 0.3, [G.pkey('pX')]: 0.9 }; B.econ._grudge = { [G.pkey('pY')]: 0.7 };
  W.createWar({ villages: [A, B], world: { day: 1, villages: [A.econ, B.econ] }, seed: 1 }).daily(1);
  out.gmax = [+(A.econ._grudgeMax || 0).toFixed(4), +(B.econ._grudgeMax || 0).toFixed(4), +(A.econ._grudge.B).toFixed(4)];
  process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
}

// ── ㉯ 존 아이 ─────────────────────────────────────────────────────────────
function zoneChild(bait, mode) {
  const TMP = require('./lib-tmp').file('t1494z', '.db');   // [T1400] 제 DB 는 판 끝에 지운다
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(39880)), DB_PATH: TMP, VILLAGE_VIEW_MS: '1000',
    ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', T1065_TOOL_GATE: '0' });
  if (mode === 'zoff') delete process.env.T1447_PERSON_GRUDGE; else process.env.T1447_PERSON_GRUDGE = '1';
  process.env.T1447_VALUE = 'shadow';
  baitHook(bait);
  const _log = quiet(); crash();
  const VVm = require(VVFILE), cap = {}; const _vi = VVm.init; VVm.init = function (h) { cap.h = h; return _vi.apply(this, arguments); };   // 존이 마을 화면 모듈에 준 손(칸을 주나)
  const Zone = require(ZFILE);
  console.log = _log;
  const H = Zone.__testBind(), BS = H.BUILDING_SIZE, G = H.Grudge, SV = H.SimVillages, out = { on: H.T1447_PERSON_GRUDGE };
  const msgs = [];
  const mkP = (id, cx, cy, member) => ({ pid: 'p_' + id, playerId: id, name: '이' + id, ws: { readyState: 1, send: (s) => { try { const m = JSON.parse(s); m._to = id; msgs.push(m); } catch (e) {} } },
    x: cx * BS + BS / 2, y: cy * BS + BS / 2, floor: 0, inventory: {}, vp: 0, hunger: 100, thirst: 100, hp: 100, toolItems: [], tribeId: null, isDown: false, member: member || null });
  const noteOf = (id) => msgs.filter((m) => m.type === 'notice' && m._to === id).map((m) => m.text);
  const meOf = (id) => msgs.filter((m) => m.type === 'grudge_me' && m._to === id);
  const at = (p, cx, cy) => { p.x = cx * BS + BS / 2; p.y = cy * BS + BS / 2; };
  //   꾸민 마을 셋(영토 네모 41×41) — 1 · 2 NPC 마을 · 3 사람이 세운 마을(촌장 chiefC) · 몸: 1 가운데 주민 하나(본 사람) · 3 전사 넷
  const mkVil = (dbId, ccx, ccy, founder) => { const T = new Set(); for (let dy = -20; dy <= 20; dy++) for (let dx = -20; dx <= 20; dx++) T.add((ccx + dx) + ',' + (ccy + dy));
    return { dbId, name: '시험' + dbId, ccx, ccy, _terrSet: T, npcPids: [], econ: { name: '시험' + dbId, land: { size: 300 }, housing: 30, npcs: Array.from({ length: 30 }, (_, i) => ({ id: i })), storage: { food: 900 }, founder: founder || null } }; };
  const V1 = mkVil(1, 1000, 1000), V2 = mkVil(2, 1300, 1000), V3 = mkVil(3, 1000, 1300, 'chiefC');
  const world = { day: 100 };
  SV.__t1447.setup({ villages: [V1, V2, V3], byDbId: new Map([[1, V1], [2, V2], [3, V3]]), byEcon: new Map([[V1.econ, V1], [V2.econ, V2], [V3.econ, V3]]), econV2: fakeE2, world, zoneId: 'hanbando', warCore: require(WFILE), dayMs: 1000,
    deps: { players: H.players, npcs: H.npcs, moveSpeed: 64, t1447ClaimIdx: () => H._t1447ClaimIdx(), t1447Survey: (p, c) => H._t1447Survey(p, c), t1447Offer: (p, v) => H._t1447Offer(p, v), t1447ChiefSay: (v, t) => H._t1447ChiefSay(v, t),
      t1447Depart: (p, v, j) => H._t1447Depart(p, v, j), t1447Done: (p, v, j) => H._t1447Done(p, v, j) } });
  //   도달표(T7 소문 시각표 꼴 — 마을 쌍 날 · 무향): 1–2 사흘 · 1–3 닷새 · 3–2 이틀
  const DL = { '1-2': 3, '2-1': 3, '1-3': 5, '3-1': 5, '3-2': 2, '2-3': 2 };
  if (SV.__t1494) SV.__t1494.setLedger({ delayTo: (a, b) => (a === b ? 0 : (DL[a + '-' + b] != null ? DL[a + '-' + b] : Infinity)) });
  const body = { pid: 'npc_v1', playerId: null, name: '주민', x: 1000 * BS, y: 1000 * BS, hp: 100, isNpc: true, simVillageId: 1, floor: 0 };
  H.players.set(body.pid, body); H.npcs.add(body.pid);
  for (let i = 0; i < 8; i++) { const b = { pid: 'npc_v3_' + i, playerId: null, name: '전사' + i, x: 1000 * BS + 16, y: 1300 * BS + 16, hp: 100, isNpc: true, simVillageId: 3, simJob: 'warrior', floor: 0 }; H.players.set(b.pid, b); H.npcs.add(b.pid); V3.npcPids.push(b.pid); }
  const pS = mkP('pS', 1004, 1004); H.players.set(pS.pid, pS);   // 구경꾼(1 의 땅 · 소속 없음)
  if (mode === 'zoff') {   // ㉲ 끔 — 칸 · 메시지 · 박자 · 몸 칸 0
    const P = mkP('offP', 1003, 1003); H.players.set(P.pid, P);
    const g = H._t1447LandTake(P, P.x, P.y, { wood: 50 }, 'gather');
    H._t1494Login(P); H._t1494Check(P);
    setTimeout(() => {
      out.off = { slotFn: typeof (cap.h && cap.h.t1494Slot), slot: H._t1494Slot(pS, V1), g, me: meOf('offP').length + meOf('pS').length, ticks: H._t1494Z.ticks, body: Object.keys(H.serializeBody(P)).includes('t1494'), note: !!V1.econ._grudgeNote, grudge: !!V1.econ._grudge };
      process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
    }, 1300);
    return;
  }
  const day = (d) => { world.day = d; };
  //   ②a · ②b — 해치는 사람 pA(1 의 땅 · 주민 곁) 가 나무를 거둔다(그 마을 몸이 본다)
  const pA = mkP('pA', 1003, 1003); H.players.set(pA.pid, pA);
  H._t1447LandTake(pA, pA.x, pA.y, { wood: 3 }, 'gather');
  const s1 = H._t1494Slot(pS, V1), s2 = H._t1494Slot(pS, V2);
  out.a = { n1: noteOf('pA').slice(), rows1: s1 && s1.rows, rows2: s2 && s2.rows, keysS: s1 && s1.rows[0] ? Object.keys(s1.rows[0]).sort() : null, me: H._t1494MeRows(pA), meMsg0: meOf('pA').length };
  setImmediate(() => { out.a.meMsg = meOf('pA').length; });   // 내 창 한 통은 그 차례 뒤(알림 줄이 먼저)
  //   ②c — 문턱을 넘긴다(큰 짐) → 가입 거절 → 내 창 'join'
  H._t1447LandTake(pA, pA.x, pA.y, { wood: 400 }, 'gather');
  const jErr = H._t1447JoinErr(pA, 1);
  out.c = { jErr, me: H._t1494MeRows(pA), n: noteOf('pA').slice(-1)[0] };
  //   ②d — 본 사람이 없는 쌓임(길 막기 소식 · 주인 pE 는 마을 밖) → 그 자리 줄 0 · 내 창 0 → 2 의 땅에서 기다리면 사흘째 'rumor'
  const pE = mkP('pE', 1150, 1150); H.players.set(pE.pid, pE);
  H._t1447Hostile('pE', '이pE', 1, true);
  H._t1494Check(pE);
  const d0 = { line: noteOf('pE').length, rows: H._t1494MeRows(pE).length };
  at(pE, 1300, 1003); const dd = [];
  for (const d of [100, 101, 102, 103]) { day(d); H._t1494Check(pE); const R = H._t1494MeRows(pE); dd.push([d, R.length, R[0] ? R[0].src : null, R[0] ? R[0].stage : null]); }
  out.d = { d0, dd, lines: noteOf('pE').length };
  //   ②e — 1 의 땅에 와서 안다(here) → 2 로 돌아간 뒤 1 이 더 미워한다(소식 다섯 번 더) → 닿기 전엔 아는 그대로 · 닿은 날(105 + 3) 'rumor'
  day(104); at(pE, 1005, 1005); H._t1494Check(pE); const eHere = H._t1494MeRows(pE)[0];
  at(pE, 1300, 1003); day(105); for (let i = 0; i < 5; i++) H._t1447Hostile('pE', '이pE', 1, true);
  const live = SV.t1494Live(V1, 'pE'), ee = [];
  for (const d of [105, 106, 107, 108]) { day(d); H._t1494Check(pE); const R = H._t1494MeRows(pE)[0]; ee.push([d, R ? R.stage : 0, R ? R.src : null]); }
  out.e = { here: eHere ? { src: eHere.src, stage: eHere.stage } : null, live: live.stage, ee };
  //   ②f — 1 이 다 풀어 준다(갚음) → 1 의 땅에 가면 지운다(안 날 표지) → 2 로 가도 옛 소문(단계 3)이 다시 안 선다
  G.harmPay(V1.econ, 'pE', 1); SV.t1494Settle(V1, 'pE');
  day(109); at(pE, 1005, 1005); H._t1494Check(pE); const fHere = H._t1494MeRows(pE).length;
  day(110); at(pE, 1300, 1003); H._t1494Check(pE); const fAfter = H._t1494MeRows(pE).length;
  out.f = { fHere, fAfter, tomb: pE.t1494k ? JSON.parse(JSON.stringify(pE.t1494k)) : null };
  //   ②g — 3 의 촌장(chiefC · 3 의 사람) · 땅으로 막는 pD(3 동쪽 붙은 3×3) · 막힌 칸 다섯(넓힘 길은 T1447 이 잰다 — 여기선 장부에 바로) → 명분
  const pC = mkP('chiefC', 1001, 1301, { zone: 'hanbando', vid: 3, name: '시험3', since: 0 }); H.players.set(pC.pid, pC);
  const pD = mkP('pD', 1300, 1003); H.players.set(pD.pid, pD);
  for (let y = 1299; y < 1302; y++) for (let x = 1021; x < 1024; x++) { const id = `dc_${x}_${y}`; H.claims.set(id, { id, ownerPid: 'pD', ownerName: '이pD', x: x * BS, y: y * BS, w: BS, h: BS, kind: 'personal', state: 'active', createdAt: 0 }); }
  day(111); H._t1447ClaimIdx();
  const gC0 = H._t1494Slot(pC, V3);
  for (const k of ['1021,1299', '1021,1300', '1021,1301', '1022,1299', '1022,1301']) G.landAdd(V3.econ, 'pD', k, 111);
  SV.__t1494.touch(V3, 'pD', 'land');
  const gC = H._t1494Slot(pC, V3), gS = H._t1494Slot(pS, V3);
  out.g = { chief0: gC0 && gC0.rows.length, chief: gC, spect: gS, isChief: [H._t1447IsChief(pC, V3), H._t1447IsChief(pS, V3), H._t1447IsChief(pC, V1)] };
  //   ②h — 촌장이 누른다 → 몸 · 떠났다는 소문은 2 에 이틀 뒤(113) 한 번 · pD 는 그 자리에 없다 · 그 자리에 있던 pF 는 그 자리 줄만
  const pF = mkP('pF', 1001, 1324); H.players.set(pF.pid, pF);   // 3 남쪽 붙은 한 칸 사유지 위에 선 주인
  { const id = 'fc_1001_1321'; H.claims.set(id, { id, ownerPid: 'pF', ownerName: '이pF', x: 1001 * BS, y: 1321 * BS, w: BS, h: BS, kind: 'personal', state: 'active', createdAt: 0 }); }
  at(pF, 1001, 1321); H._t1447ClaimIdx(); G.landAdd(V3.econ, 'pF', '1001,1321', 111); SV.__t1494.touch(V3, 'pF', 'land');
  H._t1447Chat(pC, '/토벌 pD 확인'); H._t1447Chat(pC, '/토벌 pF 확인');
  const jobs = SV.t1447Stat().jobs.filter((j) => j.vid === 3).map((j) => ({ pid: j.pid, st: j.st, n: j.pids.length }));
  const hh = [];
  for (const d of [111, 112, 113, 114]) { day(d); H._t1494Check(pD); H._t1494Check(pF); hh.push([d, noteOf('pD').filter((t) => /떠났다는 소문/.test(t)).length, noteOf('pF').filter((t) => /오고 있습니다/.test(t)).length, noteOf('pF').filter((t) => /떠났다는 소문/.test(t)).length, H._t1494MeRows(pD).length]); }
  const gBusy = H._t1494Slot(pC, V3);
  out.h = { jobs, hh, chiefNote: noteOf('chiefC').slice(-2), busy: (gBusy.rows.find((r) => r.pid === 'pD') || {}).raid, meD: H._t1494MeRows(pD) };
  //   ②i — 몸 저장 · 되읽기 · 다시 들어옴
  const sb = H.serializeBody(pA), pb = H.parseBody(JSON.parse(JSON.stringify(sb))), nb = H._bodyInto({}, pb, null);
  const pA2 = Object.assign(mkP('pA', 1150, 1150), { t1494k: nb.t1494k }); msgs.length = 0;
  H.players.delete(pA.pid); H.players.set(pA2.pid, pA2); H._t1494Login(pA2);
  out.i = { saved: !!sb.t1494, same: JSON.stringify(nb.t1494k) === JSON.stringify(pA.t1494k), login: meOf('pA').map((m) => m.rows.map((r) => [r.vid, r.stage, r.src])) };
  //   ②j — 박자(1초)
  const t0 = H._t1494Z.ticks;
  setTimeout(() => { out.j = { ticks: H._t1494Z.ticks - t0, slotFn: typeof (cap.h && cap.h.t1494Slot) }; process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0); }, 1300);
}

// ── ㉰ 마을 아이 — 토벌 일감이 재기동을 넘는다 ──────────────────────────────
function vilChild(bait) {
  process.env.T1447_PERSON_GRUDGE = '1'; process.env.T1447_VALUE = 'shadow'; process.env.ENABLE_VILLAGES = '1';
  baitHook(bait);
  const _log = quiet(); crash();
  const SV = require(VFILE), G = require(GFILE);
  console.log = _log;
  const out = {};
  const mkVil = (dbId, ccx, ccy, R, pop) => {
    const T = new Set(); for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R) T.add((ccx + dx) + ',' + (ccy + dy));
    return { dbId, name: '시험' + dbId, ccx, ccy, _terrSet: T, npcPids: [], _houseCells: [], housesPx: [], _granList: [],
      econ: { name: '시험' + dbId, land: { size: 1000 }, housing: pop, npcs: Array.from({ length: pop }, (_, i) => ({ id: i })), storage: { food: 3000, wood: 50 }, counts: { warrior: 4, hunter: 2 }, founder: null } };
  };
  const players = new Map(), npcs = new Set(), calls = { raze: [], unclaim: [] }, claimRows = [];
  const ci = () => G.ciBuild(claimRows, 'k' + claimRows.length + '|' + claimRows.map((r) => r.cells.length).join(','));
  const deps = { players, npcs, moveSpeed: 64, broadcast: () => {}, t1447ClaimIdx: () => ci(), t1447Offer: () => 'queued', t1447ChiefSay: () => {},
    t1447Survey: () => ({ bld: 1, hits: 3 }), t1447Raze: (pid, cells) => { calls.raze.push([pid, cells.length]); return { razed: 1, hits: 3, drops: 0 }; },
    t1447Unclaim: (pid, keys) => { calls.unclaim.push([pid, keys.length]); for (const r of claimRows) if (r.pid === pid) r.cells = r.cells.filter(([x, y]) => !keys.includes(x + ',' + y)); return { n: keys.length, split: false }; },
    t1447Loot: () => ({ items: {}, value: 0, kg: 0 }), t1447Depart: () => {}, t1447Done: () => {}, t1447Day: () => {} };
  const world = { day: 100 }, bodyExits = new Map();
  const V1 = mkVil(1, 200, 200, 8, 60);
  for (let i = 0; i < 8; i++) { const pid = 'n1_' + i; players.set(pid, { pid, x: V1.ccx * 32 + 16, y: V1.ccy * 32 + 16, hp: 100, simJob: i < 4 ? 'warrior' : i < 6 ? 'hunter' : 'farmer' }); npcs.add(pid); V1.npcPids.push(pid); }
  SV.__t1447.setup({ deps, villages: [V1], byDbId: new Map([[1, V1]]), byEcon: new Map([[V1.econ, V1]]), econV2: fakeE2, ta: { isBlocked: () => false, fert: () => 0.5, isWater: () => false }, world, zoneId: 'test', warCore: require(WFILE), bodyExits, dayMs: 1000 });
  deps.moveSpeed = 1; deps.moveSpeed = 64 / SV.__t1447.ppd();   // 하루 걸음 = 64px — 가는 날이 여럿
  const sq = (x0, y0, s) => { const c = []; for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) c.push([x, y]); return c; };
  claimRows.push({ cid: 'cA', pid: 'pA', name: 'A', kind: 'personal', state: 'active', cells: sq(209, 199, 3), vid: null });
  ci();
  const advance = () => { const d = world.day; for (const r of bodyExits.values()) if (r.ppd != null) r.L = Math.min(r.len, Math.max(0, (d - r.d0) * r.ppd)); };
  const DAY = () => { world.day++; SV.__t1447.grow(V1); advance(); SV.__t1447.day(world.day * 1000); };
  let J = null;
  for (let i = 0; i < 60 && !J; i++) { DAY(); J = SV.__t1447.jobs.find((j) => j.pid === 'pA' && j.st === 'go'); }
  if (!J) { out.err = '토벌이 안 섰다'; process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0); }
  DAY();   // 하루 걸었다(가는 중)
  //   ── 재기동 흉내: T742 칸을 꺼내 JSON 왕복 · 일감 표 · 걸음 표를 비운다 · 몸은 T747 이 되살린 그대로(자리 · 걷는 표지 · 캐러밴 몸 표지) ──
  const jid = J.id, pids = J.pids.slice(), raw = SV.__t1494.out(), saved = raw ? JSON.parse(JSON.stringify(raw)) : null;
  SV.__t1447.jobs.splice(0); bodyExits.clear();
  const pos = {};
  for (const [k, pid] of pids.entries()) { const p = players.get(pid); p.x = V1.ccx * 32 + 16 + 40 + k * 3; p.y = V1.ccy * 32 + 16 - 7; p._t1423W = jid; p.simCaravan = true; p._bxExit = 'other'; npcs.delete(pid); pos[pid] = [p.x, p.y]; }
  const dec = players.get(V1.npcPids.find((q) => !pids.includes(q))); dec._t1423W = 't1447_99'; dec.simCaravan = true; dec._bxExit = 'other'; npcs.delete(dec.pid);   // 굳은 표지 몸(되살릴 일감 없음)
  SV.__t1494.pend(saved); const nRes = SV.__t1494.resume();
  const J2 = SV.__t1447.jobs.find((j) => j.id === jid);
  const walk = pids.map((pid) => { const p = players.get(pid), r = bodyExits.get(pid); return { stay: p.x === pos[pid][0] && p.y === pos[pid][1], start: r && r.pts ? [r.pts[0].x === p.x && r.pts[0].y === p.y] : null, mark: p._t1423W === jid, len: r ? Math.round(r.len) : null }; });
  out.a = { saved: !!saved, nRes, st: J2 ? J2.st : null, same: J2 ? J2.pids.join() === pids.join() : false, walk, decoy: { mark: dec._t1423W === undefined, car: !dec.simCaravan, npc: npcs.has(dec.pid) }, JS: Object.assign({}, SV.__t1494.JS) };
  //   ── 끝까지: 닿으면 친다 · 푼다 · 집에 와서 끝 ──
  for (let i = 0; i < 40 && J2 && J2.st !== 'done'; i++) DAY();
  out.b = J2 ? { st: J2.st, raze: calls.raze.slice(), unclaim: calls.unclaim.slice(), arrive: J2.arriveDay != null ? J2.arriveDay - J2.d0 : null, resumed: J2.resumed } : null;
  process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
}

// ── ㉱ 클라(vm — 그리는 함수 그대로) ──────────────────────────────────────────
function clientOut(bait) {
  const srcOf = (file) => { let s = fs.readFileSync(file, 'utf8'); const b = bait && BAITS[bait]; if (b && b.file === file) s = s.replace(b.at[0], b.at[1]); return s; };
  const ctx = vm.createContext({ location: { search: '' }, URLSearchParams, window: {}, console });
  vm.runInContext(srcOf(CVV) + '\n;this.__vv = { vvAdapt, vvMem, vvGrudge };', ctx, { filename: 'vv.js' });
  const { vvAdapt, vvMem } = ctx.__vv;
  const base = { head: { vid: 3, name: '시험3', cal: {} }, me: null, dash: {}, requests: { rows: [] }, news: { rows: [] }, projects: { now: [], done: [] },
    members: { n: 2, byJob: [{ job: 'warrior', ko: '전사', n: 2 }], people: [{ pid: 'n1', name: '갑돌', jobKo: '전사', act: '서 있는 중' }] }, store: { rows: [] }, prices: { rows: [] }, gate: { near: true } };
  const rowS = { pid: 'pD', name: '이pD', stage: 4, stageKo: '원수', why: '땅이 마을이 넓어지는 길을 막는 것', now: '토벌 명분이 섰습니다', last: { ago: 2, line: '넓히려다 그 땅에 막혔습니다' } };
  const rowC = Object.assign({}, rowS, { harm: 0, n: 5, need: 5, raid: { ok: true, fighters: 4, walkDays: 2, bld: 1, freed: 3, food: 20, labor: 20 } });
  const off = vvMem(vvAdapt(base));
  const spect = vvMem(vvAdapt(Object.assign({}, base, { grudge: { rows: [rowS] } })));
  const spectRaid = vvMem(vvAdapt(Object.assign({}, base, { grudge: { rows: [Object.assign({}, rowS, { raid: rowC.raid })] } })));   // 서버가 실수로 줄을 실어도 촌장 표지 없으면 단추 0
  const chief = vvMem(vvAdapt(Object.assign({}, base, { grudge: { chief: true, rows: [rowC] } })));
  vm.runInContext('vvRaidAsk = "pD";', ctx); const ask = vvMem(vvAdapt(Object.assign({}, base, { grudge: { chief: true, rows: [rowC] } }))); vm.runInContext('vvRaidAsk = null;', ctx);
  const noCasus = vvMem(vvAdapt(Object.assign({}, base, { grudge: { chief: true, rows: [Object.assign({}, rowC, { raid: { ok: false } })] } })));
  //   내 창(50-i-panel.js 의 두 함수만 — 파일 전체는 판 조각이라 이음매를 안 띄운다)
  const ip = srcOf(CIP), i0 = ip.indexOf('  let myGrudge = null;'), i1 = ip.indexOf('  async function renderTribePanel() {');
  const ctx2 = vm.createContext({ window: {}, activeSide: null, renderSide: () => {} });
  vm.runInContext(ip.slice(i0, i1) + '\n;this.__ip = { grudgeMeOnMessage, grudgeMeHtml };', ctx2, { filename: 'ip.js' });
  const ipOff = ctx2.__ip.grudgeMeHtml();
  ctx2.__ip.grudgeMeOnMessage({ rows: [] }); const ipNone = ctx2.__ip.grudgeMeHtml();
  ctx2.__ip.grudgeMeOnMessage({ rows: [{ vid: 1, name: '시험1', stage: 2, stageKo: '미움', src: 'seen', how: '그 마을 사람이 보았습니다', ago: 0, why: '마을 땅에서 거둔 것', fix: '날이 갈수록 옅어집니다' }] });
  const ipOne = ctx2.__ip.grudgeMeHtml();
  return { off, spect, spectRaid, chief, ask, noCasus, ipOff, ipNone, ipOne };
}
function clientOk(c0) {
  const tx = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');   // 판 글자는 낱말마다 칸 — 글로 읽을 때 띄어 잇는다
  const c = Object.assign({}, c0); for (const k of ['spect', 'chief', 'ask', 'noCasus']) c[k + 'T'] = tx(c0[k]);
  return {
    off: !/vvGrudge|원한/.test(c.off),
    spect: /id="vvGrudge"/.test(c.spect) && /이pD/.test(c.spectT) && /원수/.test(c.spectT) && /길을 막는 것/.test(c.spectT) && !/data-vv="raid/.test(c.spect),
    spectRaid: !/data-vv="raid/.test(c.spectRaid),
    chief: /data-vv="raid" data-pid="pD"/.test(c.chief) && /막힌 칸 5\/5/.test(c.chiefT) && !/vvRaidAsk/.test(c.chief),
    ask: /id="vvRaidAsk"/.test(c.ask) && /마을 사람 4명이 걸어갑니다/.test(c.askT) && /건물 1채를 부수고 땅 3칸을 풉니다/.test(c.askT) && /data-vv="raidgo" data-pid="pD"/.test(c.ask),
    noCasus: /data-vv="raid-off" disabled/.test(c.noCasus) && /명분이 아직 서지 않았습니다/.test(c.noCasusT),
    ip: c.ipOff === '' && /아는 것이 없습니다/.test(c.ipNone) && /시험1 <b style="color:var\(--accent\)">미움<\/b>/.test(c.ipOne) && /푸는 길/.test(c.ipOne),
  };
}

// ── 판 ────────────────────────────────────────────────────────────────────
if (process.argv[2] === '--child') {
  const kind = process.argv[3], bait = process.argv[4], mode = process.argv[5];
  if (kind === 'pure') pureChild(bait); else if (kind === 'zone') zoneChild(bait, mode); else if (kind === 'vil') vilChild(bait);
} else {
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? ` — ${String(x).slice(0, 700)}` : '')); };
  const run = (kind, bait, mode) => {
    const r = spawnSync(process.execPath, [__filename, '--child', kind, bait || '-', mode || '-'], { encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 26 });
    const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
    if (!line) return { err: `아이 출력 없음 rc=${r.status} ${String(r.stderr || '').slice(-400)}` };
    try { return JSON.parse(line.slice(2)); } catch (e) { return { err: 'JSON ' + e.message }; }
  };
  console.log('\n=== T1494 원한을 보이게 — 마을 창 · 내 창 · 촌장 토벌 단추 · 일감 저장 · `_grudgeMax` ===');
  console.log('\n[㉮ 셈]');
  const pu = run('pure');
  if (pu.err) ok(false, '① 셈 아이', pu.err);
  else {
    ok(JSON.stringify(pu.st) === '[0,1,1,2,2,3,3,4,4]' && JSON.stringify(pu.fr) === '[0.5,0.6,0.8,0]' && pu.ko.join(',') === ',눈총,미움,앙심,원수',
      '①a 단계 = 문턱까지의 몫(⅓ · ⅔ · 1 에서 넘어감) · 해코지 ÷ 문턱 · 막힌 칸 ÷ 명분 문턱 중 큰 쪽 · 말 넷', JSON.stringify({ st: pu.st, fr: pu.fr, ko: pu.ko }));
    const E = pu.note.e.map((x) => x.slice(0, 3).join('/'));
    ok(E.join(' ') === '100/1/gather 102/3/bld 104/3/gather 105/3/raid' && pu.note.s === 3 && pu.note.k.gather === 4 && pu.note.k.bld === 1 && pu.cap === 8 && JSON.stringify(pu.drop) === '[true,true,false]',
      '①b 소문은 단계가 오른 날만(같은 단계 · 내림 = 조용히 · 내린 뒤 다시 오르면 소문) · 토벌 소문 · 여덟 줄까지 · 지우면 칸도', JSON.stringify({ e: E, s: pu.note.s, k: pu.note.k, cap: pu.cap, drop: pu.drop }));
    ok(pu.why === '마을 땅에서 거둔 것 4번 · 마을 건물을 친 것 1번' && pu.last === '토벌대가 떠났습니다',
      '①c 까닭 한 줄(까닭마다 번) · 마지막 일(그 마을이 본 · 들은 마지막 것)', JSON.stringify({ why: pu.why, last: pu.last }));
    ok(pu.gmax[0] === 0.2985 && pu.gmax[1] === 0 && pu.gmax[2] === 0.2985, '①d `_grudgeMax` 는 마을끼리 원한만 — 사람 원한 0.9 가 있어도 0.2985(마을 B) · 사람 원한만 있는 마을은 0', JSON.stringify(pu.gmax));
  }
  console.log('\n[㉯ 존 — 마을 창 · 내 창 · 소문 · 촌장 단추]');
  const z = run('zone');
  if (z.err) ok(false, '② 존 아이', z.err);
  else {
    const r1 = (z.a.rows1 || [])[0];
    ok(z.on && r1 && r1.pid === 'pA' && r1.name === '이pA' && r1.stage === 1 && r1.stageKo === '눈총' && r1.why === '마을 땅에서 거둔 것 1번' && r1.last && r1.last.ago === 0 && r1.last.line === '마을 땅에서 거두는 것을 보았습니다(나무)' && (z.a.rows2 || []).length === 0,
      '②a 마을 창 = 그 마을이 아는 원한만(1 에 한 줄 · 이웃 2 의 창엔 0) · 이름 · 단계 말 · 까닭 · 마지막 일', JSON.stringify({ r1, rows2: z.a.rows2 }));
    ok(JSON.stringify(z.a.keysS) === JSON.stringify(['last', 'name', 'now', 'pid', 'stage', 'stageKo', 'why']), '②a 구경꾼 칸엔 수 · 토벌 키가 없다(이름 · 단계 · 까닭 · 마지막 일 · 지금만)', JSON.stringify(z.a.keysS));
    ok(z.a.n1.length === 1 && /시험1 사람이 보았습니다 — 시험1이\(가\) 당신을 미워합니다\(눈총\)\./.test(z.a.n1[0]) && z.a.me.length === 1 && z.a.me[0].src === 'seen' && z.a.me[0].stage === 1 && z.a.meMsg0 === 0 && z.a.meMsg >= 1,
      '②b 본 사람이 있을 때 쌓인 순간 — 한 줄(단계 말) · 내 창에 그 마을(그 마을 사람이 보았습니다 · 한 통은 알림 줄 뒤)', JSON.stringify({ n1: z.a.n1, me: z.a.me, m: [z.a.meMsg0, z.a.meMsg] }));
    ok(/받지 않습니다/.test(z.c.jErr || '') && z.c.me[0] && z.c.me[0].stage === 4 && z.c.me[0].src === 'join' && /거래하지 않고 받아들이지도 않습니다/.test(z.c.n || ''),
      '②c 문턱을 넘긴 순간 한 줄 → 가입이 원한으로 거절 → 내 창 원수 · 가입을 거절당했습니다', JSON.stringify(z.c));
    ok(z.d.d0.line === 0 && z.d.d0.rows === 0 && JSON.stringify(z.d.dd) === JSON.stringify([[100, 0, null, null], [101, 0, null, null], [102, 0, null, null], [103, 1, 'rumor', 1]]) && z.d.lines === 0,
      '②d 본 사람이 없는 쌓임(길 막기 소식) — 그 자리 줄 0 · 마을 밖 0 · 이웃 마을(사흘 길)에서 사흘째에야 소문으로', JSON.stringify(z.d));
    ok(z.e.here && z.e.here.src === 'here' && z.e.here.stage === 1 && z.e.live === 3 && JSON.stringify(z.e.ee) === JSON.stringify([[105, 1, 'here'], [106, 1, 'here'], [107, 1, 'here'], [108, 3, 'rumor']]),
      '②e 그 마을에 가면 안다(here) · 떠난 뒤 더 미워해도(지금 앙심) 소문이 닿기 전엔 아는 그대로(눈총) · 닿은 날(105 + 3) 앙심', JSON.stringify(z.e));
    ok(z.f.fHere === 0 && z.f.fAfter === 0 && z.f.tomb && z.f.tomb['1'] && z.f.tomb['1'].s === 0 && z.f.tomb['1'].e === 109,
      '②f 다 풀린 뒤 그 마을에 가면 지운다(안 날 표지 109) · 이웃에 옛 소문(앙심 · 105)이 닿아도 다시 안 선다', JSON.stringify(z.f));
    const gc = z.g.chief && z.g.chief.rows.find((r) => r.pid === 'pD'), gs = z.g.spect && z.g.spect.rows.find((r) => r.pid === 'pD');
    ok(z.g.chief0 === 0 && gc && z.g.chief.chief === true && gc.stage === 4 && gc.n === 5 && gc.need === 5 && gc.raid && gc.raid.ok && gc.raid.fighters === 6 && gc.now === '토벌 명분이 섰습니다' &&
      gs && gs.stage === 4 && !('raid' in gs) && !('n' in gs) && !('harm' in gs) && !z.g.spect.chief && JSON.stringify(z.g.isChief) === '[true,false,false]',
      '②g 촌장에게만 정확한 수(막힌 칸 5/5) · 토벌 줄(명분 · 나설 사람 6 — 도적 토벌 상한) — 구경꾼 칸엔 키조차 없다 · 촌장 술어(그 마을 사람 · 세운 사람)', JSON.stringify({ gc, gs, isChief: z.g.isChief }));
    const jd = z.h.jobs.find((j) => j.pid === 'pD'), jf = z.h.jobs.find((j) => j.pid === 'pF');
    ok(jd && jd.st === 'go' && jd.n === 6 && jf && jf.n === 2 && JSON.stringify(z.h.hh.map((x) => [x[0], x[1], x[4]])) === JSON.stringify([[111, 0, 0], [112, 0, 0], [113, 1, 1], [114, 1, 1]]) && z.h.hh.every((x) => x[2] === 1 && x[3] === 0) &&
      z.h.busy && z.h.busy.busy === 'go' && z.h.meD.length === 1 && z.h.meD[0].src === 'rumor' && z.h.meD[0].stage === 4,
      '②h 촌장이 누르면 몸이 걷는다(여섯 · 남은 둘) · 그 자리에 없던 주인은 떠났다는 소문이 이틀 뒤(113) 한 번 · 그날 내 창에 원수(소문) · 그 자리에 있던 주인은 그 자리 줄만(소문 줄 0) · 촌장 칸 = 가는 중', JSON.stringify(z.h));
    ok(z.i.saved && z.i.same && z.i.login.length === 1 && JSON.stringify(z.i.login[0]) === JSON.stringify([[1, 4, 'join']]),
      '②i 아는 원한이 몸 저장 · 되읽기를 넘고 다시 들어오면 그대로 한 통(마을 밖에서 들어와도 새로 안 것 0)', JSON.stringify(z.i));
    ok(z.j.ticks >= 1 && z.j.slotFn === 'function', '②j 켬 — 마을 화면에 칸을 준다 · 박자로 돈다', JSON.stringify(z.j));
  }
  console.log('\n[㉰ 마을 — 토벌 일감이 재기동을 넘는다]');
  const v = run('vil');
  if (v.err) ok(false, '③ 마을 아이', v.err);
  else {
    ok(v.a.saved && v.a.nRes === 1 && v.a.st === 'go' && v.a.same && v.a.walk.every((w) => w.stay && w.start && w.start[0] && w.mark && w.len > 0) && v.a.decoy.mark && v.a.decoy.car && v.a.decoy.npc,
      '③a 껐다 켜도 일감이 산다 — 같은 몸이 지금 선 자리에서 다시 걷는다(순간이동 0) · 되살릴 일감 없는 표지 몸은 일과로', JSON.stringify(v.a));
    ok(v.b && v.b.st === 'done' && v.b.raze.length === 1 && v.b.unclaim.length === 1 && v.b.arrive >= 2 && v.b.resumed === 1, '③a 되살린 토벌대가 끝까지 닿아 친다 · 풀고 돌아온다', JSON.stringify(v.b));
  }
  console.log('\n[㉱ 클라 — 그리는 함수 그대로]');
  let c = null; try { c = clientOk(clientOut(null)); } catch (e) { ok(false, '④ 클라', e.message); }
  if (c) {
    ok(c.spect && c.spectRaid, '④a 마을 창 판 — 이름 · 단계 · 까닭 · 지금 · 구경꾼은 단추 0(서버가 실수로 실어도 촌장 표지 없으면 0)', JSON.stringify(c));
    ok(c.chief && c.ask && c.noCasus, '④a 촌장 — 명분이 서면 「토벌」 · 누르면 무엇이 일어나는지 한 줄 묻기(보냄 · 그만둠) · 명분이 없으면 꺼진 단추', JSON.stringify(c));
    ok(c.off && c.ip, '④b 끔 자료(칸 없음) — 구성원 판에 원한 글자 0 · 내 창 0 · 켬 내 창은 마을 · 강조색 단계 · 푸는 길', JSON.stringify(c));
  }
  console.log('\n[㉲ 끔]');
  const zo = run('zone', '-', 'zoff');
  ok(!zo.err && zo.off && zo.off.slotFn === 'undefined' && zo.off.slot === null && zo.off.g === 0 && zo.off.me === 0 && zo.off.ticks === 0 && !zo.off.body && !zo.off.note && !zo.off.grudge,
    '⑤ 손잡이 끔 — 마을 화면 칸 손 0 · 내 창 메시지 0 · 박자 0 · 몸 저장 칸 0 · 쌓임 0', zo.err || JSON.stringify(zo.off));

  console.log('\n[미끼 열 — 사본마다 자리 꼭 한 번 · 빨강 줄]');
  const B = (name, kind, mode, red) => {
    const bt = BAITS[name], n = (() => { try { return LB.count(fs.readFileSync(bt.file, 'utf8'), bt.at[0]); } catch (e) { return 0; } })();
    let isRed = false, why = '';
    try {
      if (kind === 'client') { const cc = clientOk(clientOut(name)); isRed = red(cc); }
      else { const r = run(kind, name, mode); isRed = !r.err && !r.baitErr && red(r); why = r.err || r.baitErr || ''; }
    } catch (e) { why = e.message; }
    return { n, red: n === 1 && isRed, why: why ? ' · ' + String(why).slice(0, 200) : '' };
  };
  let b;
  b = B('rumorNow', 'zone', '-', (r) => r.d.dd[0][1] > 0 || r.d.d0.rows > 0); ok(b.red, '미끼 모르는 원한(소문이 아직 안 닿음)을 내 창에 보이는 사본 → ②d 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('liveMe', 'zone', '-', (r) => r.e.ee[0][1] === 3); ok(b.red, '미끼 내 창이 그 마을 장부를 그대로 읽는 사본(떠난 뒤 오른 원한이 바로 보임) → ②e 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('otherVil', 'zone', '-', (r) => (r.a.rows2 || []).length > 0); ok(b.red, '미끼 마을 창이 이웃 마을의 원한까지 보이는 사본 → ②a 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('chiefAll', 'zone', '-', (r) => { const s = r.g.spect && r.g.spect.rows.find((x) => x.pid === 'pD'); return !!(s && 'raid' in s); }); ok(b.red, '미끼 촌장 아닌 사람에게 수 · 토벌 단추가 보이는 사본 → ②g 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('clientBtn', 'client', '-', (cc) => !cc.spectRaid); ok(b.red, '미끼 클라가 촌장 표지 없이 단추를 그리는 사본 → ④a 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('warp', 'vil', '-', (r) => !r.a.walk.every((w) => w.stay)); ok(b.red, '미끼 되살린 토벌대가 그 자리로 순간 이동하는 사본 → ③a 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('lost', 'vil', '-', (r) => r.a.nRes === 0 || r.a.st !== 'go'); ok(b.red, '미끼 껐다 켠 뒤 일감이 사라지는 사본 → ③a 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('offLogin', 'zone', 'zoff', (r) => r.off.me > 0); ok(b.red, '미끼 끔에서 내 창 메시지가 가는 사본(화면에 새 칸) → ⑤ 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('offPlate', 'client', '-', (cc) => !cc.off); ok(b.red, '미끼 끔 자료에도 마을 창에 빈 판이 서는 사본 → ④b 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('maxAll', 'pure', '-', (r) => r.gmax[0] !== 0.2985 || r.gmax[1] !== 0); ok(b.red, '미끼 `_grudgeMax` 가 사람 원한까지 세는 사본 → ①d 빨강', `바꾼 자리 ${b.n}${b.why}`);
  console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
}
