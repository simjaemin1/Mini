#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-claim-v2.js — 사유지 v2 [재민 확정 2026-09-02 · T45] ==========
//
// ★설계 정본 `설계/소속_사유지_기여_설계안.md` §3 · 구현 정본 `server/claims.js`.
//   확정 L-1 S0=9 유지 · L-2 길드 땅 위 개인 선언 기본 개방 · L-3 임시 3일 ·
//   L-4 `pref` 14+14 · L-5 인접 **소급 안 함**.
//
// ★★이 하네스가 재는 것 — 카드의 합격 기준 순서 그대로
//   ⓪ **검사 상황 assert** — 실서버의 정본 함수를 쥐고 있나(랩을 새로 짓지 않았나).
//   ① **종류가 재시작을 넘어 산다.** ★**현재 실패하는 것을 먼저 보인다** — 옛 `insertClaim`
//      (일곱 열)으로 넣은 행을 읽으면 종류가 `undefined` 다. 새 경로는 살아남는다.
//   ② **부활 지점이 재시작을 넘어 산다.** ★실측이 문서보다 나빴다 — `listRespawnOptions` 가
//      `c.ownerId` 를 봤는데 클레임엔 `ownerPid` 밖에 없다 ⇒ **처음부터 한 번도 안 잡혔다.**
//   ③ **인접**: 떨어진 자리 거절 · 변 공유 허용 · **대각 거절** · 첫 셀 예외.
//   ④ **연결성**: ㄷ 자의 **목**을 포기하면 거절 · **끝**은 허용(일부러 갈라지는 픽스처).
//   ⑤ **부재 상태기**: T1 이전/직후/T1+T2 직후 셋으로 `active/held/pref` 3분기 ·
//      임시는 더 짧다(L-3) · `held_by` 3분기(길드/마을/무주)가 **각각 다른 픽스처**에서 나온다.
//   ⑥ **시설 승계**: 이어받은 셀 위의 노를 새 주인이 `_furnaceCanUse` 로 쓴다.
//      ★**새 권한 술어를 안 만들었음을 소스로 확인**한다.
//   ⑦ **econ 무접촉** — 이 배치가 만진 파일에 `sim/` 이 0건.
//   ⑧ ★**검사기 자가 검사** — 일부러 틀린 것을 넣으면 위 판정이 실제로 실패하는가.
//   ⑨ ★[T1305 → T1332] 사유지 돌봄(`T1305_DEEDS=1` — 손잡이가 모듈 상수라 **아이 판**으로 띄운다 · 이 판(끔)의 ①~⑧ 은 종전 그대로):
//      미가입자 영토 밖 선포 ○ · 영토 안 비구성원 ✗ · 인정 구성원 ○ · 숫자 상한 없음 · 안전판 · ★청크 문 · 접속한 날만 낡음 ·
//      ★흐림은 청크째 · ★헛손질은 돌봄 아님 · ★한 청크에서 쓰면 그 청크 내 칸 전부 새것 · ★옆 청크 그대로 · ★걸어 지나가기 아님 · ★머묾 ·
//      영속(`deed_chunks`) · 몸 칸 · ★청크 수 2배 = 풀림 날 절반 · 풀림 · 이어받음 · 다시 잡기 · 이행 · 존 넘어옴. 시각은 주입(`_t1332SetClock` — 날짜를 박지 않는다).
//      미끼 넷 — 존 사본(`server/_t1305bait-*.js` · 판 끝에 지운다)을 같은 아이 검사로 띄워 빨강을 본다: 마을 문 되살림 · 숫자 상한 되살림 ·
//      ★칸마다 낡는 사본 · ★청크 수를 안 보는 사본.
//
// 실행: node scripts/test-claim-v2.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(require('./lib-port').port(37100));
process.env.DB_PATH = `/tmp/test-claim-${process.pid}.db`;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
process.env.CLAIM_ABSENCE = '0';           // 배치 타이머는 끈다 — 상태기는 아래에서 **정본 함수로** 직접 밟는다
for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

// ★[T1305] 아이 판(⑨) — 켬 손잡이 · 손보는 시간 1초 · 존 파일은 정본 또는 미끼 사본(`__T1305_ZONE`)
const T1305_SUB = process.env.__T1305_SUB === '1';
if (T1305_SUB) { process.env.T1305_DEEDS = '1'; process.env.T1305_CARE_S = '1'; }
const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(process.env.__T1305_ZONE || path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const { claims, buildings, players, BUILDING_SIZE: SZ, Claims, db } = H;
const DAY = 24 * 60 * 60 * 1000;
// ★[T786] T785 켬(`T785_VILLAGE_ONLY=1`) — 길드 사유지는 **마을 땅**으로 접혔다(개인 사유지 자리 = 내 마을 땅 · 술어 = 몸 `member`).
//   그래서 켬 판에선 같은 땅을 **마을 땅으로도** 깐다(랩 마을 · `_terrSet` 정본 칸 · 끔이면 아무것도 안 깐다 = 종전 판 그대로).
const KIN = require(path.join(ROOT, 'server', 'village-kin.js')).ON;
const _labVils = [];
const LABV = (tribeId) => 8000 + (tribeId | 0);
function join(p, tribeId) {   // 그 땅의 무리에 든다 — 끔 = 길드(`tribeId`) · 켬 = 그 땅의 랩 마을 사람(몸 `member`)
  p.tribeId = tribeId;
  if (KIN) p.member = { vid: LABV(tribeId), zone: 'hanbando' };
  //   ★[T1137] 켬 — 영토 안 개인 사유지는 **인정 구성원**만(기여 ≥ `MEMBER_N` · 계량기 = 온보딩 정본 하나). 이 하네스는 T45 땅 규칙(인접 · 겹침 · 승계)을 재므로
  //     드는 사람을 인정 구성원으로 세운다(그 문 자체는 `test-member-open` 이 잰다).
  if (KIN && H.Membership && H.Membership.T1137) {
    const Onb = require(path.join(ROOT, 'server', 'onboarding.js'));
    const st = Onb.stateOf(p.playerId); st.contrib = Math.max(st.contrib | 0, H.Membership.CFG.N_MEMBER); Onb.__probe.save(p.playerId, st);
  }
}

function mkPlayer(name, inv) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = { pid: 'p_' + name, playerId: 'tcl_' + name, name, persistent: false, ws,
    x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: Object.assign({ wood: 999, stone: 999 }, inv), equipment: [], equipSlots: {}, craftSkill: {} };
  p._msgs = msgs;
  players.set(p.pid, p);
  return p;
}
const lastNote = (p) => (p._msgs.filter((m) => m.type === 'notice').map((m) => m.text).slice(-1)[0] || '');
const clearNotes = (p) => { p._msgs.length = 0; };
// ★셀 하나를 **정본 경로**(`tryClaim`)로 선언한다 — 손으로 `claims.set` 하면 그게 사본이다.
function claimAt(p, cx, cy, kind) {
  p.x = cx * SZ + SZ / 2; p.y = cy * SZ + SZ / 2;
  clearNotes(p);
  H.tryClaim(p, kind || 'personal');
  return lastNote(p);
}
const myCells = (p) => [...claims.values()].filter((c) => c.ownerPid === p.playerId && c.kind !== 'guild')
  .map((c) => `${Math.floor(c.x / SZ)},${Math.floor(c.y / SZ)}`).sort();
function claimIdAt(pid, cx, cy) {
  for (const [id, c] of claims) if (c.ownerPid === pid && Math.floor(c.x / SZ) === cx && Math.floor(c.y / SZ) === cy) return id;
  return null;
}
function wipe(p) { for (const [id, c] of [...claims]) if (c.ownerPid === p.playerId) { if (c.dbId) db.deleteClaim(c.dbId); claims.delete(id); } }
// ★개인 사유지는 **내 길드 영토 안에만** 선다(종전 규칙 — T45 가 안 바꿨다).
//   그래서 인접·연결성을 재려면 먼저 땅을 깔아야 한다. NPC 마을 영토와 **같은 모양**으로 만든다
//   (메모리 전용 · `cells` 를 갖는 유기적 폴리곤 — `spawnGuildClaimsForVillage` 가 그렇게 만든다).
let _gn = 0;
function guildLand(cx, cy, half, tribeId) {
  const id = `gland${_gn++}`;
  const cells = [];
  for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) cells.push([cx + dx, cy + dy]);
  claims.set(id, { id, dbId: null, ownerPid: `village_lab${_gn}`, ownerName: '랩 길드 영토',
    x: (cx - half) * SZ, y: (cy - half) * SZ, w: (half * 2 + 1) * SZ, h: (half * 2 + 1) * SZ,
    kind: 'guild', cells, guildTribeId: tribeId, guildTribeName: '랩길드', state: 'active' });
  if (KIN) {   // ★[T786] 켬 — 같은 칸을 랩 마을 땅으로(마을 정본 칸 `_terrSet` · 그 마을은 사람 마을 = 창설자 있음)
    const vid = LABV(tribeId);
    const v = _labVils.find((x) => x.dbId === vid) || (() => { const n = { name: `랩마을${tribeId}`, dbId: vid, econ: { founder: `lab_f${tribeId}` }, _terrSet: new Set() }; _labVils.push(n); return n; })();
    for (const [x, y] of cells) v._terrSet.add(x + ',' + y);
    H.SimVillages.__labProbe._t740Probe.setup({ villages: _labVils.slice(), byDbId: new Map(_labVils.map((x) => [x.dbId, x])) });
  }
  return id;
}

// ────────────────────────────────────────────────────────────────────────
// ★[T1305] 아이 판 — 켬 세계에서 돌봄 · 선포 문을 정본 경로(`tryClaim` · `tryClaimCare` · `_t1305Day` · `_t1305CareEnd`)로 잰다.
//   결과는 `@@T1305 {이름: 참거짓}` 한 줄로 부모(⑨)에 넘긴다(부모가 같은 이름으로 ✓/✗ 를 찍고 · 미끼 판은 어느 칸이 빨개졌나를 본다).
function Deeds_setOther(p, n) { H.Deeds.setZone(p, 'nippon', n); }
if (T1305_SUB) {
  const R = {};
  const put = (k, c, x) => { R[k] = !!c; if (x !== undefined) R[k + '#'] = String(x).slice(0, 160); };
  // ★[T1332 ⑦ · T1343] 시각은 주입 — 고정 시각(실제 날짜와 무관)을 존 돌봄 시계로 준다(`_t1332SetClock`). 셈 · 쓰기 · 선포가 같은 시계를 본다.
  const now0 = Date.UTC(2031, 0, 1, 12);
  let T = now0;
  const D = H.Deeds, F = D.CFG, DM = F.DAY_MS;
  put('on', D.ON === true && typeof H._t1343Advance === 'function' && typeof H._t1332Use === 'function' && typeof H._t1332SetClock === 'function');
  H._t1332SetClock(() => T);
  const at = (days) => { T = now0 + days * DM; return T; };
  const K = F.CHUNK;
  try {   // 미끼 사본은 중간에 넘어질 수 있다 — 그때까지 잰 칸은 넘긴다(넘어진 뒤 칸은 없음 = 빨강)
  const cellOf = (p, cx, cy) => { for (const [id, c] of claims) if (c.ownerPid === p.playerId && c.kind === 'personal' && Math.floor(c.x / SZ) === cx && Math.floor(c.y / SZ) === cy) return [id, c]; return [null, null]; };
  const row = (p, cx, cy) => { const [kx, ky] = D.chunkOf(cx, cy); return H.deedChunks.get(p.playerId + '|' + kx + ',' + ky); };
  const fresh = (nm) => { const p = mkPlayer(nm); p.tribeId = null; p.member = null; p.deeds = null; return p; };
  const line = (p, x0, y0, n) => { let okA = true; for (let i = 0; i < n; i++) if (!/사유지를 두었습니다/.test(claimAt(p, x0 + i, y0))) okA = false; return okA; };
  const block = (p, x0, y0, w, h) => { let okA = true; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!/사유지를 두었습니다/.test(claimAt(p, x0 + i, y0 + j))) okA = false; return okA; };
  const send = (p, m) => H.handlePlayerInput(p, JSON.stringify(m));
  const offline = (p) => { players.delete(p.pid); };   // 나간 몸(계량기는 실제 시간으로 흐른다)
  const freeDay = (p, X, Y, step) => { const [, c] = cellOf(p, X, Y); for (let d = 0; d < 200; d += step) { at(d); H._t1343Advance(p.playerId, T); if ((c.state || 'active') === 'free') return d; } return -1; };
  // ① 미가입자 — 영토 밖 빈 들은 누구나
  const a = fresh('t13a'); T = now0;
  const AX = 20000, AY = 20000;   // 20000 = 청크 경계(K 의 배수)
  put('outsideAny', /사유지를 두었습니다/.test(claimAt(a, AX, AY)), lastNote(a));
  // ② 숫자 상한 없음 — 붙여서 12칸(종전 9 한도 너머) · 알림에 "/9" 없음 · 버티는 날 n일 → m일
  let okAll = true, lastTxt = '';
  for (let i = 1; i < 12; i++) { lastTxt = claimAt(a, AX + i, AY); if (!/사유지를 두었습니다/.test(lastTxt)) { okAll = false; break; } }
  put('noCap', okAll && myCells(a).length === 12 && !/\/\s*9\b|한도/.test(lastTxt) && /버티는 날 .+일 → .+일/.test(lastTxt), `${myCells(a).length}칸 · ${lastTxt}`);
  wipe(a);
  // ③ 영토 안 — 비구성원 거절 · 인정 구성원 허용
  const BX = 21000, BY = 21000;
  const gl = guildLand(BX, BY, 6, 931);
  const b = fresh('t13b');
  const tb = claimAt(b, BX, BY);
  put('insideNonMember', !/사유지를 두었습니다/.test(tb) && /구성원|땅 안/.test(tb), tb);
  const c2 = mkPlayer('t13c'); join(c2, 931);
  put('insideMember', /사유지를 두었습니다/.test(claimAt(c2, BX + 1, BY)), lastNote(c2));
  wipe(b); wipe(c2); claims.delete(gl);
  // ④ 안전판 — 숨은 수(이 판에서만 3 으로 내려 문이 사는지 본다 · 화면 문구에 숫자 0)
  const s0 = F.SAFETY; F.SAFETY = 3;
  const sp = fresh('t13s');
  claimAt(sp, 22000, 22000); claimAt(sp, 22001, 22000); claimAt(sp, 22002, 22000);
  const st = claimAt(sp, 22003, 22000);
  put('safety', myCells(sp).length === 3 && /더 넓힐 수 없습니다/.test(st) && !/\d/.test(st), st);
  F.SAFETY = s0; wipe(sp);
  // ⑤ D(N) 식 — 15 × (40 ÷ N)²: 40칸 15일 · 70칸 4.9일(식) · 실제로 40칸을 쥔 사람이 안 돌보면 15일째에 풀린다(그 앞날은 남는다)
  put('dFormula', D.daysOf(40) === 15 && Math.abs(D.daysOf(70) - 4.898) < 0.01 && Math.abs(D.daysOf(24) - 41.667) < 0.01 && Math.abs(D.daysOf(155) - 0.999) < 0.01, `40 ${D.daysOf(40)} · 70 ${D.daysOf(70).toFixed(2)} · 24 ${D.daysOf(24).toFixed(2)} · 155 ${D.daysOf(155).toFixed(2)}`);
  const f40 = fresh('t13f'); T = now0; block(f40, 30000, 30000, 8, 5); offline(f40);   // 40칸(청크 둘 × 16 + 8)
  const [, f40c] = cellOf(f40, 30000, 30000);
  at(14.9); H._t1343Advance(f40.playerId, T); const alive149 = (f40c.state || 'active') !== 'free';
  at(15.01); H._t1343Advance(f40.playerId, T);
  put('d40', myCells(f40).length === 40 && alive149 && (f40c.state || 'active') === 'free', `14.9일 ${alive149 ? '남음' : '풀림'} · 15.01일 ${f40c.state}`);
  wipe(f40);
  // ⑥ 청크 3칸 = 상한 300 · 10칸 = 1,000 · 같은 날 수에 빈다(같은 사람 — N 같음)
  const g = fresh('t13g'); T = now0;
  const GX = 32000, GY = 32000;   // 청크 A = (8000, 8000) 밑줄에 3칸 · 청크 B = (8000, 8001) 에 10칸(변으로 이어진 한 덩이)
  claimAt(g, GX + 3, GY + 4);                                                     // B 첫 칸
  claimAt(g, GX + 3, GY + 3); claimAt(g, GX + 2, GY + 3); claimAt(g, GX + 1, GY + 3);   // A 3칸
  for (const x of [2, 1, 0]) claimAt(g, GX + x, GY + 4);                           // B 줄 1(4칸 — 이어 붙는 차례)
  for (const x of [0, 1, 2, 3]) claimAt(g, GX + x, GY + 5);                        // B 줄 2(4칸)
  claimAt(g, GX + 1, GY + 6); claimAt(g, GX, GY + 6);                              // B 줄 3(2칸)
  const rA = row(g, GX + 1, GY + 3), rB = row(g, GX, GY + 4);
  const MC = H._t1332MyChunks(g.playerId);
  const nA = (MC.get(g.playerId + '|' + D.chunkOf(GX + 1, GY + 3).join(',')) || { cells: [] }).cells.length;
  const nB = (MC.get(g.playerId + '|' + D.chunkOf(GX, GY + 4).join(',')) || { cells: [] }).cells.length;
  put('cap', nA === 3 && nB === 10 && rA.m === 300 && rB.m === 1000 && D.capOf(3) === 300 && D.capOf(10) === 1000, `A ${nA}칸 m=${rA.m} · B ${nB}칸 m=${rB.m}`);
  offline(g);
  const Ng = myCells(g).length;
  at(D.daysOf(Ng) * 0.5); H._t1343Advance(g.playerId, T);
  put('sameDays', Math.abs(rA.m / 300 - 0.5) < 1e-6 && Math.abs(rB.m / 1000 - 0.5) < 1e-6, `반 날(${(D.daysOf(Ng) * 0.5).toFixed(1)}일)에 A ${rA.m.toFixed(1)}/300 · B ${rB.m.toFixed(1)}/1000`);
  // ⑦ 청크 안 어느 칸을 돌봐도 그 청크가 오른다 · 옆 청크는 안 오른다(같은 시각)
  const a0 = rA.m, b0 = rB.m;
  H._t1332Use(g, GX * SZ + SZ / 2, (GY + 6) * SZ + SZ / 2, 'test', 50);   // B 의 구석 칸
  put('neighborSame', Math.abs(rA.m - a0) < 1e-6, `B 를 돌봄 → A ${a0.toFixed(1)} → ${rA.m.toFixed(1)}`);
  const upB = rB.m - b0;
  H._t1332Use(g, (GX + 3) * SZ + SZ / 2, (GY + 3) * SZ + SZ / 2, 'test', 50);   // A 의 다른 끝 칸
  put('anyCell', Math.abs(upB - 50) < 1e-6 && Math.abs(rA.m - a0 - 50) < 1e-6, `B +${upB.toFixed(1)} · A +${(rA.m - a0).toFixed(1)}`);
  put('capClamp', (() => { H._t1332Use(g, (GX + 1) * SZ + SZ / 2, (GY + 3) * SZ + SZ / 2, 'test', 10000); return rA.m === 300; })(), `넘치면 가득에서 멈춤 m=${rA.m}`);
  wipe(g);
  // ⑧ 헛손질은 관리 아님 · 쓴 일 + 일하는 시간(점수 'b')이 그 청크를 올린다 · 걸어 지나가기 0 · 머묾(서 있기)
  const w = fresh('t13w'); players.set(w.pid, w); T = now0;
  const WX = 23000, WY = 23000;   // 칸 WX..WX+1 = 청크 P · WX-1 = 옆 청크 Q
  claimAt(w, WX, WY); claimAt(w, WX + 1, WY); claimAt(w, WX - 1, WY);
  at(3); H._t1343Advance(w.playerId, T);
  const rP = row(w, WX, WY), rQ = row(w, WX - 1, WY);
  w.x = (WX - 1) * SZ + SZ / 2; w.y = WY * SZ + SZ / 2; w.inventory.ore_chunk = 0; w.oreLedger = {}; delete w._t1343Work;
  send(w, { type: 'sort_ore' });
  put('useNoChange', !w._t1343Work, '헛손질 → 일하는 중 표시 없음');
  w.x = (WX + 1) * SZ + SZ / 2; w.inventory.ore_chunk = 7; w.oreLedger = { copper: 7 };
  send(w, { type: 'sort_ore' });
  rP.m = rP.m / 2; rQ.m = rQ.m / 2;   // 시험 준비 — 반으로 둬서 더한 점수가 가득에 안 잘린다
  const p0 = rP.m; delete w._t1332Dw;
  const tk = (ms) => { T += ms; H._t1332Dwell(w, T); };   // 재는 타이머 칸 — 시계와 함께 민다
  H._t1332Dwell(w, T); tk(F.DWELL_MS / 2);   // 일한 뒤 머묾의 반(아직 "일하는 중")
  const gotP = rP.m - p0, wantP = F.DWELL_MS / 2000 * F.Q_WORK;
  put('workTime', F.SCORE === 'b' && Math.abs(gotP - wantP) < 1e-3, `일한 뒤 ${F.DWELL_MS / 2000}초 → P +${gotP.toFixed(3)}(초당 ${F.Q_WORK})`);
  const q0 = rQ.m; delete w._t1343Work; delete w._t1332Dw;
  w.x = (WX - 1) * SZ + SZ / 2; H._t1332Dwell(w, T); tk(F.DWELL_MS * 0.6);
  w.x = (WX + 1) * SZ + SZ / 2; tk(F.DWELL_MS * 0.3);
  put('walkThrough', Math.abs(rQ.m - q0) < 1e-6, `Q ${q0.toFixed(3)} → ${rQ.m.toFixed(3)}`);
  delete w._t1332Dw; w.x = (WX - 1) * SZ + SZ / 2;
  H._t1332Dwell(w, T); tk(F.DWELL_MS); tk(F.DWELL_MS); tk(F.DWELL_MS);
  const gotQ = rQ.m - q0;
  put('dwell', gotQ > 0 && Math.abs(gotQ - 3 * F.DWELL_MS / 1000 * F.Q_IDLE) < 1e-3, `그냥 서 있기 ${3 * F.DWELL_MS / 1000}초 → Q +${gotQ.toFixed(3)}(초당 ${F.Q_IDLE} · 머묾 초를 넘긴 뒤 그 시간 전부)`);
  // ⑨ 영속 — DB 청크 줄(m · t) · 몸 칸(존마다 내 칸 수)
  const dr = db.getDeedChunks().find((r) => r.owner_id === w.playerId && r.cx === D.chunkOf(WX, WY)[0] && r.cy === D.chunkOf(WX, WY)[1]) || {};
  put('persist', Math.abs(dr.m - rP.m) < 1e-6 && dr.t === rP.t, `m ${dr.m} · t ${dr.t}`);
  const sb = H.serializeBody(w), pb = H.parseBody(JSON.parse(JSON.stringify(sb)));
  put('body', sb.deeds && pb.deeds && pb.deeds.z && pb.deeds.z.hanbando === 3, JSON.stringify(sb.deeds));
  // ⑩ 꺼져 있던(나가 있던) 시간도 흐른다 — 나간 뒤 다시 보면 그 사이만큼 줄어 있다 · 0 을 넘긴 청크는 그 시각에 풀렸다
  offline(w); const pBefore = rP.m, tBefore = rP.t; at(30); const dOff = (T - tBefore) / DM; H._t1343Advance(w.playerId, T);
  const off1 = rP.m;
  const N3 = 3, rate = D.rateOf(2, N3) * DM;   // P = 2칸 · 하루 줄어듦
  put('offlineFlows', off1 < pBefore && Math.abs(pBefore - off1 - rate * dOff) < 1e-6, `${dOff.toFixed(3)}일 나가 있다 → P ${pBefore.toFixed(3)} → ${off1.toFixed(3)}(하루 ${rate.toFixed(3)})`);
  // ⑪ 존 넘어옴 — 다른 존의 내 칸도 N 에 든다(몸 칸 z) · 그만큼 빨리 준다
  players.set(w.pid, w); Deeds_setOther(w, 37);
  H._t1305Day(w, T);
  const rateX = (() => { const r1 = rP.m; at(31); H._t1343Advance(w.playerId, T); return r1 - rP.m; })();
  put('crossZoneN', Math.abs(rateX - D.rateOf(2, 40) * DM) < 0.5 && D.rateOf(2, 40) > D.rateOf(2, 3), `N = 3 + 다른 존 37 = 40 → 하루 ${rateX.toFixed(1)}(N 3 이면 ${(D.rateOf(2, 3) * DM).toFixed(2)})`);
  wipe(w); offline(w);
  // ⑫ 풀린 칸 — 남이 값을 내고 이어받는다(부재 상태기 승계 그대로) · 새 주인의 가득 · 풀린 내 칸 다시 잡기
  const v = fresh('t13v'); T = now0; claimAt(v, 25000, 25000); claimAt(v, 25001, 25000); offline(v);
  const [, vc] = cellOf(v, 25000, 25000), [, vc1] = cellOf(v, 25001, 25000);
  at(D.daysOf(2) + 0.01); H._t1343Advance(v.playerId, T);
  put('free', (vc.state || 'active') === 'free' && (vc1.state || 'active') === 'free', `${vc.state}/${vc1.state}`);
  const t2 = fresh('t13t');
  const tt = claimAt(t2, 25000, 25000);
  put('takeover', /이어받았습니다/.test(tt) && vc.ownerPid === t2.playerId && (vc.state || 'active') === 'active' && row(t2, 25000, 25000) && row(t2, 25000, 25000).m === F.PT, tt);
  players.set(v.pid, v);
  const re = claimAt(v, 25001, 25000);
  put('retake', /이어받았습니다/.test(re) && (vc1.state || 'active') === 'active' && vc1.ownerPid === v.playerId, re);
  wipe(t2); wipe(v);
  // ⑬ 부재 상태기와 — 24칸은 계량기가 먼저(41.7일 < 42일) · 20칸은 부재가 먼저(42일 < 60일)
  const o24 = fresh('t13o'); T = now0; block(o24, 26000, 26000, 6, 4); offline(o24);
  const [, oc] = cellOf(o24, 26000, 26000);
  at(41.7); H._t1343Advance(o24.playerId, T);
  const meterFirst = (oc.state || 'active') === 'free' && H.Claims.stageFor(oc, 41.7 * 86400000) !== 'free';
  wipe(o24);
  const o20 = fresh('t13q'); T = now0; block(o20, 27000, 27000, 5, 4); offline(o20);
  const [, oc2] = cellOf(o20, 27000, 27000);
  at(42.01); H._t1343Advance(o20.playerId, T);
  const absFirst = (oc2.state || 'active') !== 'free' && H.Claims.stageFor(oc2, 42.01 * 86400000) === 'free' && row(o20, 27000, 27000).m > 0;
  put('absenceOrder', meterFirst && absFirst, `24칸 41.7일 계량기 풀림 · 부재 ${H.Claims.stageFor(oc, 41.7 * 86400000)} / 20칸 42.01일 부재 ${H.Claims.stageFor(oc2, 42.01 * 86400000)} · 계량기 m ${row(o20, 27000, 27000).m.toFixed(0)}`);
  wipe(o20);
  // ⑭ 칸을 버리면 상한이 내려간다(넘는 몫 버림) — 4칸 청크 가득 400 → 칸 하나 버리면 300
  const u = fresh('t13u'); players.set(u.pid, u); T = now0; line(u, 28000, 28000, 4);
  const [uid] = cellOf(u, 28003, 28000); H.tryUnclaim(u, uid);
  put('unclaimCap', row(u, 28000, 28000).m === 300, `m ${row(u, 28000, 28000).m}`);
  wipe(u); offline(u);
  // ⑮ 이행 — 켜기 앞의 옛 칸(청크 줄 없음)은 켜는 순간 가득(줄지 않는다)
  const m = fresh('t13m');
  const oid = db.insertClaim({ owner_id: m.playerId, owner_name: m.name, x: 24000 * SZ, y: 24000 * SZ, w: SZ, h: SZ, kind: 'personal' });
  claims.set('cold', { id: 'cold', dbId: oid, ownerPid: m.playerId, ownerName: m.name, x: 24000 * SZ, y: 24000 * SZ, w: SZ, h: SZ, kind: 'personal', state: 'active' });
  T = now0; H._t1343Advance(m.playerId, T);
  put('migrate', row(m, 24000, 24000) && row(m, 24000, 24000).m === F.PT && claims.get('cold').state === 'active', `켠 순간 m=${row(m, 24000, 24000) ? row(m, 24000, 24000).m : '없음'}`);
  claims.delete('cold');
  // ⑯ 화면 설정 — welcome 칸
  put('ui', F.CHUNK === 4 && F.D0 === 15 && F.N0 === 40 && F.PT === 100 && F.DWELL_MS === 1000, `청크 ${F.CHUNK} · D0 ${F.D0} · N0 ${F.N0} · PT ${F.PT} · 점수 ${F.SCORE} · 머묾 ${F.DWELL_MS / 1000}초`);
  } catch (e) { R.err = String((e && e.stack) || e).slice(0, 300); }
  console.log('@@T1305 ' + JSON.stringify(R));
  for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

console.log('\n=== 사유지 v2 — 종류·인접·연결성·부재 상태기 (T45) ===');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⓪ 검사 상황 — 실서버의 정본을 쥐고 있나');
{
  ok(typeof H.tryClaim === 'function' && typeof H.tryUnclaim === 'function' && typeof H.listRespawnOptions === 'function',
    '실서버 클레임 함수 셋을 정본 그대로 쥐었다');
  ok(!!Claims && typeof Claims.adjacencyOf === 'function', '`server/claims.js` 정본이 붙어 있다');
  ok(SZ === 32, `셀 크기 ${SZ}px — 사람 클레임은 정확히 1셀이다(문서 §0-ⓐ)`);
  ok(H.CLAIM_SLOT_PERSONAL_START === 9, `개인 슬롯 S0 = ${H.CLAIM_SLOT_PERSONAL_START} (L-1 확정: 9 유지)`);
  ok(Claims.CFG.HOLD_DAYS === 14 && Claims.CFG.HOLD_DAYS_TEMP === 3 && Claims.CFG.PREF_DAYS === 14,
    `시계 확정값 — 개인 T1 ${Claims.CFG.HOLD_DAYS}일 · 임시 ${Claims.CFG.HOLD_DAYS_TEMP}일(L-3) · T2 ${Claims.CFG.PREF_DAYS}일(L-4)`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n① 종류가 재시작을 넘어 산다 — ★고치기 전엔 무엇이 일어났는지 먼저 보인다');
{
  // ★★**옛 DB 마이그레이션은 별도 프로세스로 잰다.** 이 프로세스는 이미 새 스키마를 열어 뒀으니
  //   여기서 옛 행을 흉내 내면 그건 이행이 아니라 그냥 NULL 삽입이다(1차 판이 그렇게 틀렸다).
  //   ⇒ **옛 여덟 열 스키마 그대로의 DB 파일**을 만들고, 자식 프로세스가 `zone-local-db` 로 연다.
  {
    const LEG = `/tmp/test-claim-legacy-${process.pid}.db`;
    for (const f of [LEG, LEG + '-wal', LEG + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    const { DatabaseSync } = require('node:sqlite');
    const ldb = new DatabaseSync(LEG);
    ldb.exec(`CREATE TABLE claims (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
      created_at INTEGER NOT NULL)`);
    ldb.prepare('INSERT INTO claims (owner_id, owner_name, x, y, w, h, created_at) VALUES (?,?,?,?,?,?,?)')
      .run('tcl_old', '옛사람', 1000 * SZ, 1000 * SZ, SZ, SZ, Date.now());
    const cols0 = ldb.prepare('PRAGMA table_info(claims)').all().map((c) => c.name);
    ldb.close();
    ok(!cols0.includes('kind'), '★상황 assert — 옛 스키마에는 종류 열이 **없다**(이 DB 가 진짜 옛것이다)', cols0.join(','));
    const out = require('child_process').execFileSync(process.execPath, ['-e',
      "const d=require(process.argv[1]);console.log(JSON.stringify(d.getClaims()))",
      path.join(ROOT, 'server', 'zone-local-db.js')],
      { env: Object.assign({}, process.env, { DB_PATH: LEG }), encoding: 'utf8' });
    const rows0 = JSON.parse(out.trim().split('\n').pop());
    ok(rows0.length === 1 && rows0[0].kind === 'personal',
      '① 이행이 **옛 DB 의 행**을 `personal` 로 채운다 — 현행 부팅이 사실상 그렇게 취급해 왔다(`countMyClaims` 의 `else p++`)',
      JSON.stringify(rows0[0] && { kind: rows0[0].kind, state: rows0[0].state }));
    ok(rows0[0] && rows0[0].state === 'active', '① 이행된 행은 `active` 로 선다');
    for (const f of [LEG, LEG + '-wal', LEG + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  }

  // 새 경로 — 세 종류를 넣고 **DB 왕복**으로 읽는다(재시작이 곧 이 왕복이다)
  const ids = {};
  for (const k of ['personal', 'temporary', 'guild']) {
    ids[k] = db.insertClaim({ owner_id: 'tcl_r', owner_name: '왕복', x: (2000 + Object.keys(ids).length) * SZ, y: 2000 * SZ,
      w: SZ, h: SZ, kind: k, guild_tribe_id: k === 'guild' ? 77 : null });
  }
  const rows = db.getClaims();
  const got = {};
  for (const k of Object.keys(ids)) { const r = rows.find((x) => x.id === ids[k]); got[k] = r && r.kind; }
  ok(got.personal === 'personal' && got.temporary === 'temporary' && got.guild === 'guild',
    '① 개인·임시·길드 세 종류가 DB 왕복(=재시작)을 넘는다', JSON.stringify(got));
  const g = rows.find((x) => x.id === ids.guild);
  ok(g && g.guild_tribe_id === 77, '① 길드 id 도 같이 산다 — 이게 없으면 `findGuildClaimContaining` 이 늘 null 이다', `${g && g.guild_tribe_id}`);
  // 그리고 그 종류로 세면 슬롯이 갈린다(§0-ⓐ 파생 ⓐ 가 닫혔다)
  for (const k of Object.keys(ids)) claims.set(`t${k}`, { id: `t${k}`, dbId: ids[k], ownerPid: 'tcl_r', ownerName: '왕복',
    x: 2000 * SZ, y: 2000 * SZ, w: SZ, h: SZ, kind: k, guildTribeId: k === 'guild' ? 77 : null, state: 'active' });
  const cnt = H.countMyClaims('tcl_r');
  ok(cnt.personal === 1 && cnt.temporary === 1 && cnt.guild === 1,
    '① `countMyClaims` 가 `{personal:1, temporary:1, guild:1}` 을 낸다', JSON.stringify(cnt));
  // ★통제: 종류를 지우면 셋이 전부 개인 슬롯을 먹는다(고장의 모양)
  for (const k of Object.keys(ids)) claims.get(`t${k}`).kind = undefined;
  const bad = H.countMyClaims('tcl_r');
  ok(bad.personal === 3, '★①-b 통제 실험: 종류가 없으면 셋이 전부 **개인 슬롯**을 먹는다(고장의 모양)', JSON.stringify(bad));
  for (const k of Object.keys(ids)) { claims.delete(`t${k}`); db.deleteClaim(ids[k]); }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n② 부활 지점 — ★실측이 문서보다 나빴다');
{
  const src = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const fn = src.slice(src.indexOf('function listRespawnOptions'), src.indexOf('function listRespawnOptions') + 1800);
  ok(!/c\.ownerId\s*!==\s*p\.playerId/.test(fn), '② `listRespawnOptions` 가 더는 없는 필드(`ownerId`)를 안 본다');
  ok(/c\.ownerPid\s*!==\s*p\.playerId/.test(fn), '② 사유지의 진짜 주인 필드(`ownerPid`)를 본다');
  const p = mkPlayer('resp');
  const dbId = db.insertClaim({ owner_id: p.playerId, owner_name: p.name, x: 3000 * SZ, y: 3000 * SZ, w: SZ, h: SZ, kind: 'personal' });
  claims.set('cresp', { id: 'cresp', dbId, ownerPid: p.playerId, ownerName: p.name, x: 3000 * SZ, y: 3000 * SZ, w: SZ, h: SZ, kind: 'personal', state: 'active' });
  const opts = H.listRespawnOptions(p);
  ok(opts.some((o) => o.claimId === 'cresp'), '② 내 개인 사유지가 부활 지점으로 잡힌다', `${opts.length}곳`);
  // ★통제: 종류가 사라지면(=옛 결함) 다시 안 잡힌다 — 이 판정이 종류에 실제로 매달려 있다
  claims.get('cresp').kind = undefined;
  ok(!H.listRespawnOptions(p).some((o) => o.claimId === 'cresp'),
    '★②-b 통제 실험: 종류가 사라지면 부활 지점에서 빠진다 — ①의 수리가 이 판정을 떠받친다');
  claims.get('cresp').kind = 'personal';
  // 개방(free)된 땅은 더는 내 집이 아니다
  claims.get('cresp').state = 'free';
  ok(!H.listRespawnOptions(p).some((o) => o.claimId === 'cresp'), '② 개방된 땅은 부활 지점이 아니다');
  claims.delete('cresp'); db.deleteClaim(dbId);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n③ 인접 — 변은 되고 모서리는 안 된다');
{
  const p = mkPlayer('adj');
  join(p, 900); p.tribeName = '랩길드';
  const BX = 4000, BY = 4000;
  const gl = guildLand(BX + 20, BY, 40, 900);
  wipe(p);
  ok(KIN ? ((H.SimVillages.villageOfCell(BX, BY) || {}).dbId === LABV(900)) : !!H.findGuildClaimContaining(BX * SZ + SZ / 2, BY * SZ + SZ / 2, 900),
    KIN ? '③ 상황 assert(켬) — 검사 자리가 내 마을 땅 안이다(아니면 아래가 전부 "마을 땅 밖"으로 죽는다)'
        : '③ 상황 assert — 검사 자리가 내 길드 영토 안이다(아니면 아래가 전부 "길드 영토 밖"으로 죽는다)');
  ok(/사유지를 두었습니다/.test(claimAt(p, BX, BY)), '③ 첫 셀은 어디든 된다(내 셀 0개 — 예외)', `${myCells(p).length}칸`);
  ok(/붙여서만/.test(claimAt(p, BX + 5, BY)), '③ 떨어진 자리는 거절', '');
  ok(/모서리로만/.test(claimAt(p, BX + 1, BY + 1)), '③ **대각은 거절** — 모서리로만 닿는 땅은 걸어서 안 이어진다');
  ok(/사유지를 두었습니다/.test(claimAt(p, BX + 1, BY)), '③ 변을 공유하면 허용');
  ok(/사유지를 두었습니다/.test(claimAt(p, BX + 1, BY + 1)), '③ 이제 그 대각 자리도 된다 — 옆 셀이 생겨 **변으로** 닿기 때문이다');
  ok(myCells(p).length === 3, '③ 상황 assert — 실제로 3칸이 섰다(자명 통과가 아니다)', myCells(p).join(' '));
  // ★L-5 소급 안 함 — 흩뿌려진 옛 셀 옆에도 계속 이어 붙을 수 있다
  const far = db.insertClaim({ owner_id: p.playerId, owner_name: p.name, x: (BX + 40) * SZ, y: BY * SZ, w: SZ, h: SZ, kind: 'personal' });
  claims.set('cfar', { id: 'cfar', dbId: far, ownerPid: p.playerId, ownerName: p.name, x: (BX + 40) * SZ, y: BY * SZ, w: SZ, h: SZ, kind: 'personal', state: 'active' });
  ok(/사유지를 두었습니다/.test(claimAt(p, BX + 41, BY)), '③ L-5: 옛 흩뿌린 셀 옆에도 이어 붙는다(규칙을 소급하지 않는다)');
  wipe(p); claims.delete(gl);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n④ 연결성 — ㄷ 자의 목을 빼면 갈라진다');
{
  const p = mkPlayer('bfs');
  join(p, 901);
  //  (0,0) (1,0) (2,0)      ← 가로 막대. (1,0) 이 **목**이고 (0,0)·(2,0) 이 **끝**이다.
  const BX = 5000, BY = 5000;
  const gl = guildLand(BX + 15, BY, 40, 901);
  wipe(p);
  claimAt(p, BX, BY); claimAt(p, BX + 1, BY); claimAt(p, BX + 2, BY);
  ok(myCells(p).length === 3, '④ 상황 assert — 일부러 갈라질 수 있는 모양(막대 3칸)을 세웠다', myCells(p).join(' '));
  const neck = claimIdAt(p.playerId, BX + 1, BY), end = claimIdAt(p.playerId, BX + 2, BY);
  const spNeck = Claims.unclaimSplits(p.playerId, neck), spEnd = Claims.unclaimSplits(p.playerId, end);
  ok(spNeck.splits && spNeck.before === 1 && spNeck.after === 2, '④ 목을 빼면 1덩이 → 2덩이', JSON.stringify(spNeck));
  ok(!spEnd.splits, '④ 끝을 빼면 안 갈라진다', JSON.stringify(spEnd));
  clearNotes(p); H.tryUnclaim(p, neck);
  ok(/갈라집니다/.test(lastNote(p)) && claims.has(neck), '④ 목 포기는 **정본 경로에서 거절**된다', JSON.stringify(lastNote(p)));
  clearNotes(p); H.tryUnclaim(p, end);
  ok(/풀었습니다/.test(lastNote(p)) && !claims.has(end), '④ 끝 포기는 통과한다(★T1190 ① 알림 "사유지를 풀었습니다.")');
  // ★L-5 — 이미 갈라져 있는 사람도 버릴 수 있어야 한다(절대 기준이면 아무것도 못 버린다)
  const iso = db.insertClaim({ owner_id: p.playerId, owner_name: p.name, x: (BX + 30) * SZ, y: BY * SZ, w: SZ, h: SZ, kind: 'personal' });
  claims.set('ciso', { id: 'ciso', dbId: iso, ownerPid: p.playerId, ownerName: p.name, x: (BX + 30) * SZ, y: BY * SZ, w: SZ, h: SZ, kind: 'personal', state: 'active' });
  ok(Claims.components(Claims.mySet(p.playerId)) === 2, '④ 상황 assert — 지금 내 땅은 이미 2덩이다', '');
  clearNotes(p); H.tryUnclaim(p, 'ciso');
  ok(!claims.has('ciso'), '④ L-5: 이미 갈라진 사람도 외딴 셀을 버릴 수 있다(증분 기준이라서)');
  wipe(p); claims.delete(gl);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑤ 부재 상태기 — 3분기 · 임시는 더 짧다 · held_by 3갈래');
{
  const per = { kind: 'personal' }, tmp = { kind: 'temporary' };
  const T1 = Claims.CFG.HOLD_DAYS * DAY, T2 = Claims.CFG.PREF_DAYS * DAY, T3 = Claims.CFG.FREE_DAYS * DAY;
  ok(Claims.stageFor(per, T1 - DAY) === 'active', `⑤ T1 이전(${Claims.CFG.HOLD_DAYS - 1}일) → active`);
  ok(Claims.stageFor(per, T1 + DAY) === 'held', '⑤ T1 직후 → held (보관 — 몰수가 아니다)');
  ok(Claims.stageFor(per, T1 + T2 + DAY) === 'pref', '⑤ T1+T2 직후 → pref (우선권 창)');
  ok(Claims.stageFor(per, T1 + T2 + T3 + DAY) === 'free', '⑤ 창이 지나면 → free (세계의 것)');
  // L-3 — 임시는 더 짧다. **같은 부재에서 답이 갈려야** 그 손잡이가 살아 있는 것이다.
  const at = (Claims.CFG.HOLD_DAYS_TEMP + 1) * DAY;
  ok(Claims.stageFor(tmp, at) === 'held' && Claims.stageFor(per, at) === 'active',
    `⑤ L-3: 같은 ${Claims.CFG.HOLD_DAYS_TEMP + 1}일 부재에 임시는 held · 개인은 아직 active`,
    `${Claims.stageFor(tmp, at)} vs ${Claims.stageFor(per, at)}`);
  // held_by 3갈래 — **각각 다른 픽스처**에서 나온다
  ok(KIN ? Claims.heldByOf({ tribe_id: 12, tools_json: '{}' }) === null : Claims.heldByOf({ tribe_id: 12, tools_json: '{}' }) === 'guild:12',
    KIN ? '⑤ 켬 — 길드원 줄은 안 선다(길드 = 마을 · 맡는 쪽은 몸 `member` 하나)' : '⑤ 길드원 → `guild:<id>`');
  ok(Claims.heldByOf({ tribe_id: null, tools_json: JSON.stringify({ member: { zone: 'hanbando', vid: 5 } }) }) === 'village:5',
    '⑤ 마을 소속자(T11 이 몸에 실어 둔 그 필드) → `village:<vid>`');
  ok(Claims.heldByOf({ tribe_id: null, tools_json: '{}' }) === null, '⑤ 무소속 → 무주(null)');
  ok(Claims.heldByOf({ tribe_id: null, tools_json: JSON.stringify({ member: { zone: 'nippon', vid: 5 } }) }) === null,
    '⑤ 다른 존의 소속은 이 존에서 우선권이 아니다');
  // 우선권 — 누가 가져갈 수 있나
  const held = { kind: 'personal', ownerPid: 'x', state: 'held', heldBy: null };
  const prefG = { kind: 'personal', ownerPid: 'x', state: 'pref', heldBy: 'guild:12' };
  const prefV = { kind: 'personal', ownerPid: 'x', state: 'pref', heldBy: 'village:5' };
  const prefN = { kind: 'personal', ownerPid: 'x', state: 'pref', heldBy: null };
  const free = { kind: 'personal', ownerPid: 'x', state: 'free', heldBy: null };
  const mate = { playerId: 'y', tribeId: 12, member: null };
  const vill = { playerId: 'y', tribeId: null, member: { vid: 5 } };
  const nobody = { playerId: 'y', tribeId: null, member: null };
  ok(!Claims.takeableBy(nobody, held).ok, '⑤ `held` 는 아무도 못 가져간다 — 보관이 보관이다');
  ok(KIN ? (!Claims.takeableBy(mate, prefG).ok && !Claims.takeableBy(nobody, prefG).ok) : (Claims.takeableBy(mate, prefG).ok && !Claims.takeableBy(nobody, prefG).ok),
    KIN ? '⑤ 켬 — 옛 길드 보관 줄은 우선권이 아니다(맡은 길드가 없다 · 개방을 기다린다)' : '⑤ 길드 우선권은 그 길드원만');
  ok(Claims.takeableBy(vill, prefV).ok && !Claims.takeableBy(mate, prefV).ok, '⑤ 마을 우선권은 그 마을 사람만');
  ok(!Claims.takeableBy(nobody, prefN).ok, '⑤ 무주는 창 동안 아무도 못 가져간다(개방을 기다린다)');
  ok(Claims.takeableBy(nobody, free).ok, '⑤ 개방된 땅은 아무나');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ 승계 — 셀을 이어받으면 그 위 시설도 따라온다 (새 권한 술어 0)');
{
  const src = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const csrc = fs.readFileSync(path.join(ROOT, 'server', 'claims.js'), 'utf8');
  const n = (src.match(/_furnaceCanUse\(/g) || []).length;
  ok(n >= 3, `⑥ 상황 assert — `+'`_furnaceCanUse`'+` 호출부가 실제로 있다 (${n}곳)`);
  ok(!/function\s+\w*[Cc]anUse/.test(csrc) && !/tribeId\s*===\s*.*tribeId/.test(csrc),
    '⑥ ★`claims.js` 에 **권한 술어를 다시 적지 않았다** — 승계는 주인 필드를 바꿀 뿐이다');

  const owner = mkPlayer('own'), heir = mkPlayer('heir');
  join(owner, 902); join(heir, 902);
  const CX = 6000, CY = 6000;
  const gl = guildLand(CX + 10, CY, 40, 902);
  wipe(owner); wipe(heir);
  claimAt(owner, CX, CY);
  const cid = claimIdAt(owner.playerId, CX, CY);
  const c = claims.get(cid);
  const b = { id: 'bf1', dbId: null, type: 'furnace', ownerId: owner.playerId, ownerName: owner.name,
    x: CX * SZ + SZ / 2, y: CY * SZ + SZ / 2, data: { owner: owner.playerId, tribeId: null } };
  buildings.set('bf1', b);
  ok(H._furnaceCanUse(owner, b) && !H._furnaceCanUse(heir, b), '⑥ 상황 assert — 지금은 주인만 그 노를 쓴다');
  // 우선권 창을 열고 상속인이 이어받는다 — **정본 경로**(`tryClaim`)로
  Claims.setState(cid, c, 'pref', 'village:9', Date.now());
  heir.member = { vid: 9, zone: 'hanbando' };
  const note = claimAt(heir, CX, CY);
  ok(/이어받았습니다/.test(note), '⑥ 우선권이 있는 사람이 그 자리를 이어받는다', JSON.stringify(note));
  ok(claims.get(cid).ownerPid === heir.playerId, '⑥ 셀의 주인이 바뀌었다');
  ok(claims.get(cid).state === 'active' && !claims.get(cid).heldBy, '⑥ 이어받은 땅은 다시 active 다');
  ok(H._furnaceCanUse(heir, b) && !H._furnaceCanUse(owner, b),
    '⑥ ★그 위의 노를 **새 주인이** 쓴다 — 같은 술어 `_furnaceCanUse` 그대로');
  // 우선권이 없으면 못 가져간다
  const c2id = (() => { wipe(owner); claimAt(owner, CX + 20, CY); return claimIdAt(owner.playerId, CX + 20, CY); })();
  Claims.setState(c2id, claims.get(c2id), 'pref', 'guild:99', Date.now());
  const stranger = mkPlayer('stranger');
  join(stranger, 902);                          // 길드 영토(켬 = 마을 땅) 요건은 통과시키되(자리 문제 아님)
  const note2 = claimAt(stranger, CX + 20, CY); // 우선권은 `guild:99` 라 이 사람에겐 없다
  ok(KIN ? /옛 보관 줄은 이제 없습니다/.test(note2) : /마을 사람만/.test(note2), '⑥ 우선권이 없으면 거절', JSON.stringify(note2));
  ok(claims.get(c2id).ownerPid === owner.playerId, '⑥ 거절이 말뿐이 아니다 — 주인이 안 바뀌었다');
  buildings.delete('bf1'); wipe(owner); wipe(heir); wipe(stranger); claims.delete(gl);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑦ 복귀 · 상자 잠김 · econ 무접촉');
{
  const p = mkPlayer('back');
  join(p, 903);
  const gl = guildLand(7000, 7000, 10, 903);
  wipe(p);
  claimAt(p, 7000, 7000);
  const cid = claimIdAt(p.playerId, 7000, 7000);
  Claims.setState(cid, claims.get(cid), 'held', null, Date.now());
  const chest = { id: 'bch1', dbId: null, type: 'chest', ownerId: p.playerId, ownerName: p.name,
    x: 7000 * SZ + SZ / 2, y: 7000 * SZ + SZ / 2, data: { wood: 3 } };
  buildings.set('bch1', chest);
  const other = mkPlayer('thief');
  ok(!!Claims.chestLocked(other, chest), '⑦ 보관 중인 **무주** 사유지의 상자는 남에게 잠긴다', JSON.stringify(Claims.chestLocked(other, chest)));
  ok(!Claims.chestLocked(p, chest), '⑦ 주인 본인은 언제나 연다');
  Claims.setState(cid, claims.get(cid), 'held', 'guild:12', Date.now());
  ok(!Claims.chestLocked(other, chest), '⑦ 길드가 맡은 땅은 안 잠근다 — 그쪽이 쓰라고 맡은 것이다');
  Claims.setState(cid, claims.get(cid), 'held', null, Date.now());
  ok(Claims.onPlayerActive(p) === 1 && claims.get(cid).state === 'active', '⑦ 돌아오면 맡겨 둔 땅이 **전량** 돌아온다');
  Claims.setState(cid, claims.get(cid), 'free', null, Date.now());
  ok(Claims.onPlayerActive(p) === 0 && claims.get(cid).state === 'free', '⑦ 개방된 땅은 안 돌아온다 — 이미 세계의 것이다');
  buildings.delete('bch1'); wipe(p); claims.delete(gl);

  const csrc = fs.readFileSync(path.join(ROOT, 'server', 'claims.js'), 'utf8');
  ok(!/require\(.*sim\//.test(csrc) && !/economy-sim/.test(csrc), '⑦ econ 무접촉 — `claims.js` 가 `sim/` 을 안 부른다');
  ok(!/gameDay/.test(csrc.replace(/★[^\n]*gameDay[^\n]*/g, '')) || /일부러 안 넘긴다|gameDay` 를 아예 받지 않는다/.test(csrc),
    '⑦ 부재 시계는 **실시간**이다 — 게임일을 안 받는다(환산해 보여 주면 거짓말이 된다)');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑧ ★이 하네스가 실패할 줄 아는가 — 일부러 틀린 것을 넣는다');
{
  // ⑧-a 인접 검사가 **대각을 실제로 가르는가** — 같은 상태에서 두 답이 달라야 한다.
  //   ★정본 함수를 갈아 끼우지 않는다(1차 판이 `Claims.mySet` 을 monkey-patch 했는데
  //     `adjacencyOf` 는 모듈 안의 것을 부르므로 **아무 효과가 없었고 검사는 자명 통과**했다).
  //     실제 클레임을 하나 세우고 그 위에서 잰다.
  {
    const q = mkPlayer('ctl');
    const CX = 8000, CY = 8000;
    const gl = guildLand(CX, CY, 6, 904);
    join(q, 904); wipe(q);
    claimAt(q, CX, CY);
    ok(Claims.mySet(q.playerId).size === 1, '⑧-a 상황 assert — 실제로 한 칸을 세웠다(빈 집합이면 아래가 자명 통과다)');
    const side = Claims.adjacencyOf(q.playerId, CX + 1, CY), diag = Claims.adjacencyOf(q.playerId, CX + 1, CY + 1);
    ok(side.ok && !side.first && !diag.ok && diag.diag,
      '⑧-a 통제 실험: 같은 상태에서 변은 통과·모서리는 거절(상수가 아니다)',
      `변 ${side.ok} · 대각 ${diag.ok}(diag=${diag.diag})`);
    wipe(q); claims.delete(gl);
  }
  // ⑧-b 연결성 산수가 **실제로 덩이를 세는가**
  ok(Claims.components(new Set(['0,0', '1,0', '2,0'])) === 1 && Claims.components(new Set(['0,0', '2,0'])) === 2,
    '⑧-b 통제 실험: 이어진 3칸은 1덩이 · 떨어진 2칸은 2덩이');
  // ⑧-c 상태기가 **문턱 위아래에서 답을 바꾸는가**(상수면 여기서 걸린다)
  const T1 = Claims.CFG.HOLD_DAYS * DAY;
  ok(Claims.stageFor({ kind: 'personal' }, T1 - 1) !== Claims.stageFor({ kind: 'personal' }, T1 + 1),
    '⑧-c 통제 실험: T1 을 1ms 넘기면 답이 바뀐다');
}

// ────────────────────────────────────────────────────────────────────────
console.log('\n⑨ ★[T1305 → T1343] 사유지 돌봄(청크 계량기 · 실제 날짜 · D = 15 × (40 ÷ N)²) — 켬 아이 판(정본) · 미끼 다섯(존 · 수식 사본) · 이 판(끔)은 위 ①~⑧ 종전 그대로');
{
  const { execFileSync } = require('child_process');
  const sub = (zoneFile) => {
    let out = '';
    try { out = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1305_SUB: '1', __T1305_ZONE: zoneFile || '', DB_PATH: `/tmp/test-claim-t1305-${process.pid}-${Math.random().toString(36).slice(2, 8)}.db`, PORT: String(require('./lib-port').port(37400)) }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000 }); }
    catch (e) { out = String((e && e.stdout) || ''); }
    const m = /@@T1305 (\{.*\})/.exec(out); return m ? JSON.parse(m[1]) : null;
  };
  ok(!H.Deeds.ON && H.CLAIM_SLOT_PERSONAL_START === 9, '⑨ 끔(이 판) — 손잡이 꺼짐 · 숫자 상한 9 그대로(끈 판 = 종전)');
  const R = sub(null);
  ok(!!R && R.on, '⑨ 상황 assert — 켬 아이 판이 정본 함수를 쥐고 돌았다');
  const NAMES = {
    outsideAny: '⑨ 미가입자가 영토 밖 빈 들에 선포한다(마을 무관)', noCap: '⑨ 숫자 상한 없음 — 12칸(종전 9 너머) · 알림에 한도 숫자 0 · 버티는 날 n일 → m일',
    insideNonMember: '⑨ 마을 영토 안 — 비구성원은 거절', insideMember: '⑨ 마을 영토 안 — 인정 구성원은 된다',
    safety: '⑨ 숨은 안전판 — 문이 산다(이 판만 3) · 문구에 숫자 0',
    dFormula: '⑨ ★[T1343] D(N) = 15 × (40 ÷ N)² — 40칸 15일 · 70칸 4.9일 · 24칸 41.7일 · 155칸 1.0일',
    d40: '⑨ ★[T1343] 40칸을 쥐고 안 돌보면 15일째에 풀린다(14.9일엔 남는다)',
    cap: '⑨ ★[T1343] 청크 상한 = 칸 수 × 100(3칸 300 · 10칸 1,000) · 새로 잡은 칸은 가득',
    sameDays: '⑨ ★[T1343] 칸 수가 달라도 같은 날 수에 빈다(반 날에 둘 다 반)',
    anyCell: '⑨ ★[T1343] 청크 안 어느 칸을 돌봐도 그 청크 관리도가 오른다', neighborSame: '⑨ ★[T1343] 옆 청크는 안 오른다',
    capClamp: '⑨ ★[T1343] 넘치게 돌봐도 가득에서 멈춘다',
    useNoChange: '⑨ 헛손질(짐 안 바뀐 쓰는 사건)은 관리 아님', workTime: '⑨ ★[T1343] 쓴 일 뒤 그 청크에서 일하는 시간 = 초당 점수(점수 꼴 b)',
    walkThrough: '⑨ 걸어 지나가기는 관리 아님', dwell: '⑨ 머묾(그냥 서 있기)은 낮은 초당 점수',
    persist: '⑨ ★[T1343] 계량기 줄 DB 영속(`deed_chunks` m · t)', body: '⑨ ★[T1343] 몸 칸 `deeds.z`(존마다 내 칸 수) 저장 · 복원',
    offlineFlows: '⑨ ★[T1343] 나가 있던(꺼져 있던) 시간도 흐른다 — 실제 날짜로 낡음',
    crossZoneN: '⑨ ★[T1343] 다른 존의 내 칸도 N 에 든다(몸 칸) — 그만큼 빨리 준다',
    free: '⑨ 관리도 0 — 그 청크의 내 칸이 풀린다(빈 땅 · 부재 상태기의 `free`)',
    takeover: '⑨ 풀린 칸 — 남이 값을 내고 이어받는다(승계 규약 그대로 · 새 주인의 가득)', retake: '⑨ 풀린 내 칸 — 값을 내고 다시 잡는다',
    absenceOrder: '⑨ ★[T1343] 부재 상태기와 — 24칸은 계량기가 먼저(41.7 < 42일) · 20칸은 부재가 먼저(42 < 60일)',
    unclaimCap: '⑨ ★[T1343] 칸을 버리면 상한이 내려간다(넘는 몫 버림)',
    migrate: '⑨ 이행 — 켜기 앞의 옛 칸은 켜는 순간 가득(줄지 않는다)',
    ui: '⑨ 화면 설정 — 청크 4 · D0 15 · N0 40 · PT 100 · 점수 꼴 · 머묾 초',
  };
  for (const [k, msg] of Object.entries(NAMES)) ok(!!R && R[k] === true, msg, R ? (R[k + '#'] || '') : '아이 판 없음');
  // 미끼 — 존 사본을 같은 아이 검사로 띄운다(정본 무접촉 · 판 끝에 지운다)
  const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const BAITS = [
    ['gate', '마을 문을 되살린 사본(영토 밖도 마을 사람만)', 'if (_t1305P && !_onbLot) {', 'if (false && _t1305P && !_onbLot) {', ['outsideAny']],
    ['cap', '숫자 상한을 되살린 사본(9 한도)', 'if (!_t1305P && usedCount >= max) {', 'if (usedCount >= max) {', ['noCap']],
    ['online', '★[T1343] 접속해 있을 때만 줄이는 사본(접속한 날만 세는 꼴)', 'function _t1343Advance(pid, now) {\n', 'function _t1343Advance(pid, now) {\n  if (!_t1343Online(pid)) return { N: 0, chunks: _t1332MyChunks(pid), freed: 0 };\n', ['offlineFlows', 'd40']],
    ['flat', '★[T1343] 칸 수에 비례 안 하는 사본(청크 상한 100 고정)', 'const capOf = (n) => CFG.PT * Math.max(0, n | 0);', 'const capOf = (n) => CFG.PT * (n > 0 ? 1 : 0);', ['cap'], 'deeds'],
    ['all', '★[T1343] 전 청크를 한꺼번에 올리는 사본', '  Deeds.add(r, pts == null ? Deeds.CFG.P_USE : pts, n);', '  for (const ee of st.chunks.values()) Deeds.add(_t1343Row(pid, ee.cx, ee.cy), pts == null ? Deeds.CFG.P_USE : pts, ee.cells.length);', ['neighborSame']],
  ];
  for (const [tag, what, from, to, reds, mod] of BAITS) {
    const f = path.join(ROOT, 'server', `_t1305bait-${tag}-${process.pid}.js`);
    const fd = path.join(ROOT, 'server', `_t1305bait-${tag}-${process.pid}-deeds.js`);
    let n = 0, RB = null;
    try {
      if (mod === 'deeds') {   // 수식 사본 — 존 사본이 그 deeds 사본을 싣는다
        const DS = fs.readFileSync(path.join(ROOT, 'server', 'deeds.js'), 'utf8');
        n = DS.split(from).length - 1;
        fs.writeFileSync(fd, DS.split(from).join(to));
        fs.writeFileSync(f, Z.split("require('./deeds')").join(`require('./${path.basename(fd, '.js')}')`));
      } else { n = Z.split(from).length - 1; fs.writeFileSync(f, Z.split(from).join(to)); }
      RB = sub(f);
    } finally { try { fs.unlinkSync(f); } catch (e) {} try { fs.unlinkSync(fd); } catch (e) {} }
    ok(n === 1 && !!RB && RB.on && reds.every((k) => RB[k] === false), `⑨ 미끼 — ${what} → 빨강`, `바꾼 자리 ${n} · ${reds.map((k) => `${k}=${RB ? RB[k] : '?'}`).join(' ')}`);
  }

}

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
for (const f of [process.env.DB_PATH, process.env.DB_PATH + '-wal', process.env.DB_PATH + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.exit(fail ? 1 : 0);
