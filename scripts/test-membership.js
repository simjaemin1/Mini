#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-membership.js — 마을 소속 · 곳간 꺼내기 [재민 확정 2026-09-02 · T11 · ★T779 새 세계: 꺼내기 = 촌장만] ===
//
// ★설계 정본: `설계/소속_사유지_기여_설계안.md` §4·§2. 구현 정본: `server/membership.js`.
// ★[T779 2026-10-18 · 재민 10-15 "마음대로 빼는 건 안 돼 · 관리자만 뺄 수 있어"] 옛 기여 한도 인출(`limitOf` · 하루 몫)은 걷었다 —
//   꺼내기 = 촌장 한 사람 · 한도 없음(T769 판정이 유일한 길). 소속 · 기여 · 추방 · 브리핑은 그대로다.
//
// ★★이 하네스가 재는 것 — 순서가 곧 카드다
//   ⓪ **검사 상황 assert** — 랩이 라이브와 같은 것을 보고 있나(곳간에 실물이 있고, 게이트가 살아 있나).
//   ① 전이 게이트: 11회는 거절 · 12회에 제안 · 수락하면 소속.
//   ② ★[T787] 무리는 마을 하나(길드 = 마을 · 재민 10-18 ⓑ — T11 의 M-1 "직교"는 PM 오판으로 걷혔다):
//      소속의 정본은 몸 `member` 하나 · 옛 길드 칸(`tribeId`)은 소속을 정하지도 바꾸지도 못한다 · 켬 기본 · 길드 → 마을 다리 0.
//   ③ 꺼내기 판정 자리 = 촌장 도장 하나 — 옛 한도 함수 · 손잡이 없음 · 도장 없는 실물 문은 막힌다.
//   ④ 꺼내기: 비소속 · 마을 사람(촌장 아님) 거절 · 촌장은 한도 없이 · 같은 날 또 · 멀면 거절 · 남의 마을 거절.
//   ⑤ **사본 0**: 곳간 차감이 정본 장부에서 일어나고, 납품의 **정확한 역연산**이다
//      (넣은 만큼 꺼내면 곳간이 **비트 그대로** 돌아온다).
//   ⑥ 취득일 = 출고일 (`Lots.reconcile` 규약 — 새 규약 없음).
//   ⑦ 재접속·존이동: `serializeBody`/`parseBody` 왕복에 소속이 살아남는다.
//   ⑧ 탈퇴해도 **기여는 남는다**(이력서 캐논) · 추방도 같다.
//   ⑨ 복귀 브리핑: 소속 마을 사건이 앞줄로 온다(가시성은 안 바뀐다 — 같은 집합).
//   ⑩ ★검사기 자가 검사 — 일부러 틀린 것을 넣으면 위 판정이 실제로 **실패하는가**.
//   ⑪ 굶는 마을 막음(촌장에게도) · 품목 이름 · 길드 곳간 잠금 걷음.
//
// 실행: node scripts/test-membership.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/test-member-${process.pid}.db`;
process.env.ONB_ENABLE = process.env.ONB_ENABLE || '1';

const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));

const econV2 = R('sim/economy-sim-v2');
const Events = R('server/events');
const Villages = R('server/villages');
const Onb = R('server/onboarding');
const M = R('server/membership');
const Lots = R('server/lots');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

// ── 세계·장부 — **본 게임 진입점 그대로**(랩을 새로 만들지 않는다) ──────────
const world = (() => {
  const w = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  const _log = console.log; console.log = () => {};
  try { for (let d = 0; d < 200; d++) econV2.tickWorldV2(w); } finally { console.log = _log; }
  return w;
})();
const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap() });
L.prime(world);

// `villages.js` 가 보는 자리에 마을을 꽂는다 — 판정 함수는 라이브의 것을 그대로 부른다.
const P = Villages.__labProbe._memberProbe;
const vils = world.villages.map((e, i) => ({ name: `랩마을${i}`, ccx: 100 + i * 40, ccy: 100, dbId: i, econ: e }));
const nVil = P.setup(L, vils);
const VID = 0, VID2 = 1;
const VIL = vils[VID];
const AT = P.anchorPx(VIL);                       // 마을 중심(게이트 안)
const FAR = { x: AT.x + P.BRIEF_PX * 3, y: AT.y };  // 게이트 밖

// 온보딩 계량기 — 라이브와 같은 DB 를 쓴다(하네스가 상태를 손으로 빚지 않는다)
const _db = new (require('better-sqlite3'))(process.env.DB_PATH);
Onb.init({ db: _db, gameDay: () => (world.day | 0) });

let _day = world.day | 0;
const sent = [];
M.init({ SimVillages: Villages, ZONE_ID: 'lab', players: new Map(), gameDay: () => _day,
  send: (ws, m) => sent.push(m) });

function mkPlayer(id) {
  const p = { playerId: id, name: id, x: AT.x, y: AT.y, ws: { __lab: 1 }, inventory: {}, member: null, isNpc: false };
  const s = Onb.stateOf(id);
  s.start_vid = VID; s.arrived = 1; s.contrib = 0; s.lot_ok = 0;
  Onb.__probe.save(id, s);
  return p;
}
// ★기여는 **정본 훅**으로 올린다(`Onboarding.onDeliver`) — 손으로 숫자를 쓰면 그게 사본이다.
function deliver(p, n) {
  for (let i = 0; i < n; i++) {
    Onb.onDeliver(p, { ok: true, done: true, req: { item: 'food' } }, VID);
    M.onDeliver(p, { ok: true, done: true, req: { item: 'food' } }, VID);
  }
}
const stockOf = (res) => Villages.playerVillageWithdrawStock(VIL, res || 'food');
// ★[T769 · T779] 꺼내기는 **촌장 문**(`withdrawChief` — 존 · 채팅이 부르는 그 문) 하나로 잰다.
//   촌장 = 이미 있는 표지(길드 칸 없는 마을 = 창설자 `econ.founder`) — 그 칸 하나만 그 사람으로 앉혔다가 되돌린다(회관 하네스가 `owner` 를 앉히는 꼴).
//   ★[T809] T785 켬 기본 — 촌장은 **마을 칸 하나**(`VillageKin.isChief` · T786 ②)다 ⇒ 같은 자리에서 그 칸도 그 사람으로 앉혔다가 되돌린다(창설자 = 촌장 · 이행 뒤 모양).
const asChief = (p, fn) => {
  const had = Object.prototype.hasOwnProperty.call(VIL.econ, 'founder'), f0 = VIL.econ.founder;
  const hadK = Object.prototype.hasOwnProperty.call(VIL, '_kin'), k0 = VIL._kin;
  VIL.econ.founder = p.playerId;
  if (R('server/village-kin').ON) VIL._kin = Object.assign({ wars: new Map(), joinMode: 'open', intro: '' }, k0 || {}, { chief: String(p.playerId) });
  try { const r = fn(); return (r && typeof r.then === 'function') ? { ok: false, err: '(랩 마을은 길드 마을이 아니다 — 판정이 그 자리에서 서야 한다)' } : r; }
  finally { if (had) VIL.econ.founder = f0; else delete VIL.econ.founder; if (hadK) VIL._kin = k0; else delete VIL._kin; }
};
const wdChief = (p, vid, res, q) => asChief(p, () => M.withdrawChief(p, vid, res, q));
const lastNote = () => { const m = sent.filter((x) => x && x.type === 'notice').pop(); return m ? m.text : ''; };

console.log('\n=== 마을 소속 · 곳간 꺼내기 (T11 · T779 꺼내기 = 촌장만) ===');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⓪ 검사 상황 — 랩이 라이브와 같은 것을 보고 있나');
{
  ok(nVil >= 3, `마을 ${nVil}곳이 정본 자리에 꽂혔다`);
  VIL.econ.storage.food = 4000;
  ok(stockOf('food') > 100, `곳간에 실물이 있다 — 곡물 ${stockOf('food')}`, `환산율 ${P.RATE}`);
  ok(!Villages.villageWithdrawGate(VID, AT.x, AT.y).err, `근접 게이트가 마을 중심을 통과시킨다`);
  ok(!!Villages.villageWithdrawGate(VID, FAR.x, FAR.y).err, `게이트가 먼 곳을 **거절한다** — 게이트가 상수가 아니다`,
     `${P.BRIEF_PX}px`);
  ok(!!L.deliverable.toEcon.get('food'), `재화→아이템 대응이 정본 표에서 나온다(사본 0)`,
     `food → ${L.deliverable.toEcon.get('food')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n① 전이 — 누적 기여 12회에 촌장이 권한다');
{
  const p = mkPlayer('mb_gate');
  deliver(p, M.CFG.N_MEMBER - 1);
  ok(M.contribOf(p.playerId) === M.CFG.N_MEMBER - 1, `기여가 **하나의 계량기**에 쌓인다`, `contrib=${M.contribOf(p.playerId)}/${M.CFG.N_MEMBER}`);
  ok(p._memberOfferVid == null, `${M.CFG.N_MEMBER - 1}회 — 촌장은 아직 권하지 않는다`);
  const r0 = M.accept(p, VID);
  ok(!r0.ok, `${M.CFG.N_MEMBER - 1}회 — 스스로 우겨도 거절된다`, r0.err);
  deliver(p, 1);
  ok(p._memberOfferVid === VID, `${M.CFG.N_MEMBER}회 — 촌장이 권한다`);
  const r1 = M.accept(p, null);
  ok(r1.ok && M.isMemberHere(p, VID), `수락하면 그 마을 사람이다`, `since=${r1.ok ? r1.member.since : '-'}`);
  ok(r1.ok && !('wdDay' in r1.member) && !('wdUsed' in r1.member), `★[T779] 몸에 하루 몫 장부 칸이 없다(소속 = 그 마을 사람 표지)`, JSON.stringify(r1.member));
  const r2 = M.accept(p, VID2);
  ok(!r2.ok, `한 사람은 한 마을 — 두 번째 소속은 거절된다(K-1)`, r2.err);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n② ★[T787] 무리는 마을 하나 — 길드 = 마을(재민 10-18 ⓑ · M-1 "직교"는 걷혔다)');
{
  //   ⓐ 켬 기본 — 손잡이를 안 주면 마을이 유일한 무리다('0' 만 옛 길). 이 프로세스의 env 와 무관하게 **자식으로** 잰다.
  const { execFileSync } = require('child_process');
  const onOf = (v) => { const env = Object.assign({}, process.env); if (v === undefined) delete env.T785_VILLAGE_ONLY; else env.T785_VILLAGE_ONLY = v;
    try { return execFileSync(process.execPath, ['-e', "process.stdout.write(String(require('./server/village-kin').ON))"], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' }).trim(); } catch (e) { return 'err'; } };
  ok(onOf(undefined) === 'true', `ⓐ 손잡이 없음 = **켬**(마을이 유일한 무리)`, onOf(undefined));
  ok(onOf('0') === 'false' && onOf('1') === 'true', `ⓐ' '0' 만 끔(옛 길드 길 · 되돌림) · '1' 켬`, `${onOf('0')} · ${onOf('1')}`);
  //   ⓑ 소속의 정본은 몸 \`member\` 하나 — 옛 길드 칸이 있어도 없어도 소속 판정은 같다(옛 칸은 소속을 **정하지 못한다**)
  const p = mkPlayer('mb_one');
  deliver(p, M.CFG.N_MEMBER);
  p.tribeId = 'guild_A'; p.tribeName = '길드A';       // 옛 몸 칸(켬이면 존이 런타임에 안 싣는다 — 여기선 일부러 얹어 본다)
  ok(M.accept(p, VID).ok && M.isMemberHere(p, VID), `ⓑ 옛 길드 칸이 있어도 소속은 기여 문 하나로 선다`);
  p.tribeId = null; p.tribeName = null;
  ok(M.isMemberHere(p, VID), `ⓑ' 옛 칸을 지워도 소속은 그대로 — 소속을 바꾸는 문은 마을 문(가입 · 탈퇴 · 추방)뿐`);
  const r = M.leave(p);
  ok(r.ok && !M.memberOf(p), `ⓑ" 마을을 나가면 무리가 없다(따로 남는 길드가 없다)`);
  //   ⓒ 길드 → 마을 다리 0(켬) — 존이 길드원을 마을에 앉히지 않는다 · 창설이 길드를 싣지 않는다 · 사람 몸에 길드가 없다(소스로 못 박는다)
  const zsrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'zone.js'), 'utf8');
  ok(/if \(!VillageKin\.ON\) \{ try \{ Membership\.seatGuildMember\(player\)/.test(zsrc), `ⓒ 켬 — 길드원 앉히기(D2) 안 부른다`);
  ok(/tribeId: VillageKin\.ON \? null : \(ctx\.tribeId \|\| player\.tribeId \|\| null\)/.test(zsrc), `ⓒ' 켬 — 창설이 길드를 싣지 않는다(D1)`);
  ok(/tribeId: VillageKin\.ON \? null : initTribeId/.test(zsrc), `ⓒ" 켬 — 사람 몸의 런타임 길드 칸 = null(옛 칸은 \`_tribe0\` 로 실어 나르기만)`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n③ ★[T779] 꺼내기 판정 자리 — 촌장 도장 하나(옛 기여 한도 걷음)');
{
  ok(M.limitOf === undefined && M.remainOf === undefined, `기여 한도 함수 둘(\`limitOf\` · \`remainOf\`)이 없다`);
  ok(!('WD_PER' in M.CFG) && !('WD_FRAC' in M.CFG) && !('WD_MIN' in M.CFG), `한도 손잡이 셋(\`MEMBER_WD_*\`)이 설정표에 없다`, Object.keys(M.CFG).join(' '));
  VIL.econ.storage.food = 4000;
  const p = mkPlayer('mb_stamp');
  deliver(p, M.CFG.N_MEMBER);
  M.accept(p, VID);
  const s0 = stockOf();
  const r0 = M.withdraw(p, VID, 'food', 1);      // 도장 없이 — 마을 사람이라도
  ok(M.isMemberHere(p, VID) && !r0.ok && /촌장만/.test(r0.err || '') && stockOf() === s0,
     `★실물 문(\`withdraw\`)은 촌장 도장(\`chiefOk\`) 없이 부르면 막는다 — 마을 사람이라도 · 곳간 그대로`, r0.err);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'membership.js'), 'utf8');
  const stamps = (src.match(/withdraw\(player, vid, res, qty, true\)/g) || []).length;
  ok(stamps === 2, `도장을 찍는 자리 = 촌장 문(\`withdrawChief\`) 안 둘(그 자리 판정 · central 판정) — 다른 길 0`, `${stamps}곳`);
  const callers = [];
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'server')).filter((n) => n.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'server', f), 'utf8');
    if (/Membership\.withdraw\s*\(/.test(s)) callers.push(f);
  }
  ok(callers.length === 0, `서버 어디서도 실물 문을 곧장 안 부른다(존 · 채팅 = 촌장 문)`, callers.join(' ') || '0곳');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n④ 꺼내기 — 누가 · 얼마나 · 어디서');
{
  VIL.econ.storage.food = 4000;
  const out = mkPlayer('mb_out');
  deliver(out, M.CFG.N_MEMBER);
  const rNon = asChief({ playerId: 'mb_chief_other' }, () => M.withdrawChief(out, VID, 'food', 1));
  ok(!rNon.ok && /촌장만/.test(rNon.err || ''), `비소속은 곳간을 못 연다`, rNon.err);
  M.accept(out, VID);
  const m1 = asChief({ playerId: 'mb_chief_other' }, () => M.withdrawChief(out, VID, 'food', 1));   // 촌장은 딴 사람
  ok(!m1.ok && /촌장만/.test(m1.err || '') && M.isMemberHere(out, VID), `★마을 사람(촌장 아님)도 못 꺼낸다 — 소속은 그대로`, m1.err);
  const c1 = wdChief(out, VID, 'food', 1);
  ok(c1.ok && c1.qty === 1 && c1.chief === true && c1.limit == null && c1.remain == null, `촌장은 1 꺼낸다 — 남은 몫 · 한도 칸 없음`, `${c1.qty} · ${c1.remain}/${c1.limit}`);
  const s1 = stockOf();
  const big = Math.floor(s1 / 4);
  const c2 = wdChief(out, VID, 'food', big);
  ok(c2.ok && c2.qty === big && stockOf() < s1, `★한도 없음 — 재고의 4분의 1을 달라 해도 그만큼 나간다(재고 안에서)`, `재고 ${s1} · 요청 ${big} → ${c2.qty}`);
  const c3 = wdChief(out, VID, 'food', 1);
  ok(c3.ok, `같은 날 또 꺼내도 막지 않는다(하루 몫 장부 없음)`, c3.ok ? `${c3.qty}` : c3.err);
  _day += 1;                                     // 날이 바뀐다
  const c4 = wdChief(out, VID, 'food', 1);
  ok(c4.ok, `하루가 지나도 그대로 열린다`);
  out.x = FAR.x; out.y = FAR.y;
  const c5 = wdChief(out, VID, 'food', 1);
  ok(!c5.ok, `마을에서 멀면 거절 — 촌장도 곳간은 걸어가서 연다`, c5.err);
  const AT2 = P.anchorPx(vils[VID2]);
  out.x = AT2.x; out.y = AT2.y;                // 남의 마을 앞에 선다(근접 게이트가 아니라 촌장 판정이 막는지 본다)
  const c6 = wdChief(out, VID2, 'food', 1);    // 촌장 표지는 VID 에만 앉았다
  ok(!c6.ok && !Villages.villageWithdrawGate(VID2, out.x, out.y).err, `남의 마을 곳간은 못 연다(제 마을 촌장이라도 — 그 마을 앞에서)`, c6.err);
  out.x = AT.x; out.y = AT.y;
  //   채팅 문도 같은 촌장 문이다 — 마을 사람의 `/인출` · `/곳간 <품목>`(옛 "오늘 몫" 갈래 0)
  //   (촌장은 딴 사람으로 앉힌다 — 촌장이 없는 마을이면 "사람이 꺼내지 않는다" 로 막혀 이 절이 재는 것이 달라진다)
  const s2 = stockOf();
  asChief({ playerId: 'mb_chief_other' }, () => M.handleChat(out, '/인출 1'));
  const n1 = lastNote();
  asChief({ playerId: 'mb_chief_other' }, () => M.handleChat(out, '/곳간 식량 1'));
  const n2 = lastNote();
  ok(stockOf() === s2 && /촌장만/.test(n1) && /촌장만/.test(n2), `채팅 꺼내기(\`/인출\` · \`/곳간 식량\`)도 같은 촌장 문에서 막힌다`, `${n1} · ${n2}`);
  const s3 = stockOf();
  asChief(out, () => M.handleChat(out, '/인출 2'));
  ok(+(s3 - stockOf()).toFixed(6) > 0, `대조 — 같은 사람이 촌장이면 같은 \`/인출 2\` 가 곳간을 연다(자명 통과 금지)`, `${s3} → ${stockOf()}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑤ ★사본 0 — 꺼내기는 납품의 정확한 역연산이다');
{
  VIL.econ.storage.food = 3000;
  const p = mkPlayer('mb_inv');
  deliver(p, M.CFG.N_MEMBER);
  M.accept(p, VID);
  const item = L.deliverable.toEcon.get('food');
  const before = +VIL.econ.storage.food;
  const invBefore = { ...p.inventory };
  // 넣는다 — **정본 함수**(게시판 납품·거래소가 쓰는 그 함수)
  p.inventory[item] = (p.inventory[item] || 0) + 7;
  const dep = Villages.playerVillageDeposit(VIL, p.inventory, { [item]: 7 });
  ok(dep.ok, `납품 정본으로 7 넣었다`, `+${JSON.stringify(dep.moved)}`);
  const mid = +VIL.econ.storage.food;
  ok(mid > before, `곳간이 실제로 늘었다`, `${before} → ${mid}`);
  // 꺼낸다 — 촌장 판정을 거치지 않고 **실물 이동 정본**만 직접 부른다(역연산 검사이므로)
  const wd = Villages.playerVillageWithdraw(VIL, p.inventory, 'food', 7);
  ok(wd.ok, `꺼내기 정본으로 7 꺼냈다`);
  ok(+VIL.econ.storage.food === before, `곳간이 **비트 그대로** 돌아왔다 — 같은 표·같은 환산율`,
     `${before} → ${mid} → ${+VIL.econ.storage.food}`);
  ok((p.inventory[item] | 0) === ((invBefore[item] | 0) + 7), `내 짐도 그대로 돌아왔다`,
     `${invBefore[item] | 0} → ${p.inventory[item] | 0}`);
  // 없는 재화는 안 나온다
  ok(!Villages.playerVillageWithdraw(VIL, p.inventory, '__nope', 1).ok, `곳간이 안 다루는 재화는 거절`);
  ok(!Villages.playerVillageWithdraw(VIL, p.inventory, 'food', 999999).ok, `곳간에 없는 양은 거절`);
  // 소스 검사 — membership.js 는 econ 재고를 **직접 만지지 않는다** · 비율 산수가 없다(한도를 걷었다)
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'membership.js'), 'utf8');
  ok(!/storage\s*\[/.test(src), `membership.js 에 econ 재고 직접 접근이 0곳이다(판정과 실물 이동이 갈려 있다)`);
  ok(!/payableQty\s*\(/.test(src), `★[T779] membership.js 에 곳간 비율 산수가 없다(옛 한도 \`Events.payableQty\` 부름 0)`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ 취득일 = 출고일 — 새 규약을 만들지 않았다');
{
  VIL.econ.storage.food = 3000;
  const p = mkPlayer('mb_lot');
  deliver(p, M.CFG.N_MEMBER);
  M.accept(p, VID);
  const today = 500;
  const r = wdChief(p, VID, 'food', 1);                // 촌장 문(취득일 규약은 같다)
  ok(r.ok, `상황 assert — 꺼내기가 실제로 났다`, `${r.item} ${r.qty}`);
  ok(Lots.isLot(r.item), `꺼낸 것이 로트 품목이다(아니면 아래는 자명 통과다)`, r.item);
  Lots.reconcile(p, r.item, p.inventory, today);        // ★zone.js `_afterWithdraw` 가 하는 그 한 줄
  const arr = Lots.of(p, r.item);
  ok(arr.length > 0 && arr[arr.length - 1].d === today, `곳간에서 나온 곡식의 취득일 = 출고일`,
     `d=${arr.length ? arr[arr.length - 1].d : '-'} (오늘 ${today})`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑦ 재접속 · 존이동 — 소속이 몸을 따라간다');
{
  const p = mkPlayer('mb_body');
  deliver(p, M.CFG.N_MEMBER);
  M.accept(p, VID);
  // `zone.js` 의 직렬화 계약을 **소스에서** 확인한다(필드 수를 세면 다음 필드에 조용히 늙는다)
  const zsrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'zone.js'), 'utf8');
  const ser = zsrc.slice(zsrc.indexOf('function serializeBody'), zsrc.indexOf('function parseBody'));
  ok(/member:\s*p\.member/.test(ser), `소속이 \`serializeBody\` 에 실린다 — 저장·핸드오프·재접속이 한 함수다`);
  ok(/out\.member\s*=\s*o\.member/.test(zsrc), `\`parseBody\` 가 소속을 되돌린다`);
  ok(/_takeover\.member/.test(zsrc), `같은 존 인계(takeover)도 소속을 잇는다`);
  // JSON 왕복(=DB blob 왕복) 뒤에도 판정이 같은가
  const blob = JSON.parse(JSON.stringify({ member: p.member }));
  const q = { playerId: p.playerId, x: AT.x, y: AT.y, ws: p.ws, inventory: {}, member: blob.member };
  ok(M.isMemberHere(q, VID), `blob 왕복 뒤에도 그 마을 사람이다`);
  ok(M.publicState(q, VIL).name === p.member.name, `마을 이름도 따라간다`, q.member.name);
  //   옛 몸(하루 몫 칸이 실린 blob)도 그대로 읽힌다 — 그 칸은 안 읽는다
  const old = { playerId: 'mb_body_old', x: AT.x, y: AT.y, ws: p.ws, inventory: {}, member: Object.assign({ wdDay: 3, wdUsed: 9 }, blob.member) };
  ok(M.isMemberHere(old, VID) && M.publicState(old, VIL).name === p.member.name, `옛 몸(하루 몫 칸 실린 blob)도 같은 마을 사람으로 읽힌다`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑧ 탈퇴 · 추방 — 기여는 남는다 (이력서 캐논)');
{
  const p = mkPlayer('mb_quit');
  deliver(p, M.CFG.N_MEMBER + 3);
  M.accept(p, VID);
  const k0 = M.contribOf(p.playerId);
  const r = M.leave(p);
  ok(r.ok && !M.memberOf(p), `스스로 나간다`);
  ok(M.contribOf(p.playerId) === k0, `나가도 누적 기여는 그대로다`, `${k0} → ${M.contribOf(p.playerId)}`);
  // 다시 들어올 수 있다(기여가 남아 있으니 문턱은 이미 넘었다)
  ok(M.accept(p, VID).ok, `기여가 남아 있어 다시 들어올 수 있다`);
  // 추방 — 촌장(같은 마을 사람)만
  const chief = mkPlayer('mb_chief');
  deliver(chief, M.CFG.N_MEMBER);
  const outsider = mkPlayer('mb_outsider');
  ok(!M.expel(outsider, p).ok, `이 마을 사람이 아니면 못 내보낸다`);
  M.accept(chief, VID);
  const e = M.expel(chief, p);
  ok(e.ok && !M.memberOf(p), `같은 마을 사람이면 내보낼 수 있다`);
  ok(M.contribOf(p.playerId) === k0, `추방당해도 누적 기여는 그대로다`, `${M.contribOf(p.playerId)}`);
  ok(!M.expel(chief, outsider).ok, `우리 마을 사람이 아닌 자를 '추방'할 수는 없다`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑨ 복귀 브리핑 — 소속 마을 사건이 앞줄');
{
  const p = mkPlayer('mb_brief');
  deliver(p, M.CFG.N_MEMBER);
  M.accept(p, VID);
  // 남의 마을 사건이 앞에, 내 마을 사건이 뒤에 있는 브리핑을 만든다
  //   ★사건은 **정본 타입**으로 만든다 — 가짜 타입을 쓰면 `Events.briefLine` 이 빈 줄을 내고,
  //     그러면 이 절이 재는 것은 순서가 아니라 "빈 줄을 못 그린다"가 된다(자명 실패).
  const T = Object.fromEntries(Events.TYPES.map((t) => [t, t]));   // ★타입 이름을 옮겨 적지 않는다(정본 목록에서 파생)
  const rows = [
    { ev: { vid: VID2, type: T.STOCK_SHORTAGE, item: 'wood', day: 1 } },
    { ev: { vid: VID2, type: T.PRICE_SPIKE, item: 'stone', day: 2 } },
    { ev: { vid: VID, type: T.STOCK_GLUT, item: 'food', day: 3 } },
  ];
  ok(rows.every((r) => !!Events.briefLine(r.ev)), `상황 assert — 세 사건 모두 정본이 줄로 그린다`);
  const brief = { returned: true, lines: ['5일 만이군. 그새 이런 일이 있었네.'].concat(rows.map((r) => Events.briefLine(r.ev))), rows };
  const before = brief.rows.map((r) => r.ev.vid).join(',');
  const moved = M.orderBrief(p, brief);
  const after = brief.rows.map((r) => r.ev.vid).join(',');
  ok(moved && after !== before, `순서가 실제로 바뀐다`, `${before} → ${after}`);
  ok(brief.rows[0].ev.vid === VID, `내 마을 사건이 맨 앞이다`);
  ok(/만이군/.test(brief.lines[0]) && brief.lines[1] === Events.briefLine(rows[2].ev),
     `촌장의 첫 마디("…만이군")는 그대로 두고 그 아래가 재배열된다`, brief.lines[1]);
  // ★가시성은 안 바뀐다 — **같은 집합**이어야 한다(순서만 바꾸는 함수다)
  const setBefore = rows.map((r) => r.ev.type).sort().join(',');
  const setAfter = brief.rows.map((r) => r.ev.type).sort().join(',');
  ok(setBefore === setAfter, `보이는 사건 집합은 그대로다(술어를 안 건드렸다)`, setAfter);
  // 무소속이면 손대지 않는다
  const q = mkPlayer('mb_brief2');
  const b2 = { returned: true, lines: ['x'], rows: rows.slice() };
  ok(!M.orderBrief(q, b2), `무소속의 브리핑은 그대로 둔다`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑩ ★이 하네스가 실패할 줄 아는가 — 일부러 틀린 것을 넣는다');
{
  // ⑩-a 게이트를 무시하는 가짜 꺼내기는 ④가 잡는가 — 먼 곳에서 정본 게이트가 실제로 err 를 낸다
  const g = Villages.villageWithdrawGate(VID, FAR.x, FAR.y);
  ok(!!g.err, `⑩-a 통제 실험: 먼 곳에서 게이트가 거절한다(④의 거절이 우연이 아니다)`, g.err);
  // ⑩-b 도장 검사가 **도장 하나에 걸려 있는가** — 같은 사람 · 같은 자리 · 같은 곳간에서 도장만 바꾼다
  VIL.econ.storage.food = 1000;
  const pb = mkPlayer('mb_ctl_b');
  const s0 = stockOf();
  const nb = M.withdraw(pb, VID, 'food', 1);
  const yb = M.withdraw(pb, VID, 'food', 1, true);
  ok(!nb.ok && yb.ok && stockOf() < s0, `⑩-b 통제 실험: 도장(\`chiefOk\`)만 바꾸면 결과가 바뀐다 — ③의 거절이 도장 하나 때문이다(상수 거절이 아니다)`, `${nb.err} · ${yb.ok ? yb.qty : yb.err}`);
  // ⑩-c 역연산 검사가 **환산율 어긋남을 잡는가** — 한쪽만 덜 빼면 곳간이 안 돌아온다
  VIL.econ.storage.food = 1000;
  const p = mkPlayer('mb_ctl');
  const item = L.deliverable.toEcon.get('food');
  p.inventory[item] = 5;
  const b0 = +VIL.econ.storage.food;
  Villages.playerVillageDeposit(VIL, p.inventory, { [item]: 5 });
  Villages.playerVillageWithdraw(VIL, p.inventory, 'food', 4);   // 일부러 하나 덜 꺼낸다
  ok(+VIL.econ.storage.food !== b0, `⑩-c 통제 실험: 넣은 만큼 안 꺼내면 ⑤의 '비트 그대로'가 깨진다`,
     `${b0} → ${+VIL.econ.storage.food}`);
}

// ═══ ⑪ ★★[T159 2026-09-07] 기근 · 품목 이름 · ★[T779] 길드 곳간 잠금 걷음 ═════════════════════════
//   이 절이 재는 것: 촌장 판정과 재고(실물) **위에** 마을의 형편이 하나 더 있다는 것.
{
  console.log('\n⑪ ★[T159] 굶는 마을은 곳간을 안 연다(촌장에게도) · 사람 말로 부른다 · ★[T779] 길드 곳간 잠금 걷음');
  const p = mkPlayer('mb_famine');
  const s = Onb.stateOf(p.playerId); s.contrib = M.CFG.N_MEMBER; Onb.__probe.save(p.playerId, s);
  const acc = M.accept(p, VID);
  ok(acc.ok, '⑪ 전제: 문턱을 채워 마을 사람이 됐다', acc.ok ? `기여 ${acc.contrib}` : acc.err);
  VIL.econ.storage.food = Math.max(50, +VIL.econ.storage.food || 0);
  const before = +VIL.econ.storage.food;
  //   ⓐ 굶지 않는 날 — 꺼내진다(자명 통과 금지의 앞면)
  delete VIL.econ._dpDebug;
  ok(!Villages.villageFamine(VIL), '⑪a 전제: 아직 굶는다는 판단이 없다(모르면 막지 않는다)');
  const w0 = wdChief(p, VID, 'food', 1);     // 촌장 문 — 굶는 마을 막음은 촌장에게도 그대로다(남는 막음 = 근접 · 굶는 마을 · 재고)
  ok(w0.ok, '⑪a2 전제: 평시엔 꺼내진다', w0.ok ? `${w0.item} ${w0.qty}` : w0.err);
  ok(+VIL.econ.storage.food < before, '⑪a3 전제: 그때 곳간이 실제로 줄었다', `${before} → ${+VIL.econ.storage.food}`);
  //   ⓑ 굶는 날 — 엔진이 제 판단을 적어 두면(`_dpDebug.hunger < 0`) 곳간이 안 열린다
  VIL.econ._dpDebug = { hunger: -0.42, dP: -0.4 };
  ok(Villages.villageFamine(VIL), '⑪b 전제: 엔진의 판단을 **읽었다**(다시 세지 않았다)', VIL.econ._dpDebug.hunger);
  const mid = +VIL.econ.storage.food;
  const w1 = wdChief(p, VID, 'food', 1);
  ok(!w1.ok && /굶고 있/.test(w1.err || ''), '★★⑪b2 굶는 마을은 **곳간을 안 연다**(촌장에게도)', w1.err);
  ok(+VIL.econ.storage.food === mid, '★⑪b3 그리고 곳간은 **한 톨도 안 줄었다**(거절이 진짜다)', `${mid} → ${+VIL.econ.storage.food}`);
  //   ⓒ 판단이 양수면(굶지 않는다) 다시 열린다 — 부호 하나가 문이다
  VIL.econ._dpDebug = { hunger: 0, dP: 0.1 };
  ok(!Villages.villageFamine(VIL), '⑪c 굶주림 항이 0 이면 기근이 아니다(부호 하나가 문이다)');
  const w2 = wdChief(p, VID, 'food', 1);
  ok(w2.ok, '⑪c2 ★★그러면 다시 열린다 — 이 게이트는 **그 판단만** 본다', w2.ok ? `${w2.item} ${w2.qty}` : w2.err);

  //   ⓓ 품목 이름 — 사람이 부르는 말로 재화를 찾는다(표는 남의 정본 셋)
  ok(M.resolveRes('food') === 'food', '⑪d 재화 키 그대로');
  ok(M.resolveRes('식량') === 'food', '⑪d2 ★재화의 우리말(`ItemLabel.CATEGORY_KO`)', M.resolveRes('식량'));
  ok(M.resolveRes('wood') === 'wood' && M.resolveRes('나무') === 'wood', '⑪d3 ★나무도 같은 길로 풀린다', M.resolveRes('나무'));
  ok(M.resolveRes('berry') === 'fruit', '⑪d4 ★품목 키는 **납품 대응표**로 재화가 된다(`playerVillageDepositMap`)', M.resolveRes('berry'));
  ok(M.resolveRes('없는것') === null, '★⑪d5 자명 통과 금지 — 모르는 말은 **null** 이다(아무거나 안 준다)');

  //   ⓔ 길드 곳간 잠금(T159 `granaryOpen` · `granaryBust`)은 걷었다 — 촌장 혼자 꺼내니 정할 문이 없다 · 명령은 한 줄로 답한다
  ok(M.granaryOpen === undefined && M.granaryBust === undefined, '★⑪e 길드 곳간 잠금 함수 둘이 없다(걷음)');
  const n0 = sent.length;
  const lk = M.handleChat(p, '/곳간 잠금');
  const op = M.handleChat(p, '/곳간 열기');
  const said = sent.slice(n0).filter((x) => x && x.type === 'notice').map((x) => x.text);
  ok(lk === true && op === true && said.length === 2 && said.every((t) => /촌장만 열 수 있습니다/.test(t)), '⑪e2 `/곳간 잠금|열기` 는 명령으로 받아 한 줄로 답한다(말로 안 흘러간다)', said.join(' · '));
}

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
try { _db.close(); fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
process.exit(fail ? 1 : 0);
