#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-membership.js — 마을 소속 · 곳간 인출 [재민 확정 2026-09-02 · T11] ===
//
// ★설계 정본: `설계/소속_사유지_기여_설계안.md` §4·§2. 구현 정본: `server/membership.js`.
//
// ★★이 하네스가 재는 것 — 순서가 곧 카드다
//   ⓪ **검사 상황 assert** — 랩이 라이브와 같은 것을 보고 있나(곳간에 실물이 있고, 게이트가 살아 있나).
//   ① 전이 게이트: 11회는 거절 · 12회에 제안 · 수락하면 소속.
//   ② 직교(M-1): 길드 가입·탈퇴가 소속을 건드리지 않는다(양방향).
//   ③ 한도: 기여에 대해 **단조** · 곳간이 비면 줄어든다(자명 통과 금지).
//   ④ 거절: 비소속 거절 · 한도 초과는 **깎여서** 나가고 그 다음은 0 · 멀면 거절.
//   ⑤ **사본 0**: 곳간 차감이 정본 장부에서 일어나고, 납품의 **정확한 역연산**이다
//      (넣은 만큼 꺼내면 곳간이 **비트 그대로** 돌아온다).
//   ⑥ 취득일 = 출고일 (`Lots.reconcile` 규약 — 새 규약 없음).
//   ⑦ 재접속·존이동: `serializeBody`/`parseBody` 왕복에 소속이 살아남는다.
//   ⑧ 탈퇴해도 **기여는 남는다**(이력서 캐논) · 추방도 같다.
//   ⑨ 복귀 브리핑: 소속 마을 사건이 앞줄로 온다(가시성은 안 바뀐다 — 같은 집합).
//   ⑩ ★검사기 자가 검사 — 일부러 틀린 것을 넣으면 위 판정이 실제로 **실패하는가**.
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

console.log('\n=== 마을 소속 · 곳간 인출 (T11) ===');

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
  const r2 = M.accept(p, VID2);
  ok(!r2.ok, `한 사람은 한 마을 — 두 번째 소속은 거절된다(K-1)`, r2.err);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n② 직교 — 길드와 마을은 서로를 건드리지 않는다 (M-1)');
{
  const p = mkPlayer('mb_orth');
  deliver(p, M.CFG.N_MEMBER);
  p.tribeId = 'guild_A'; p.tribeName = '길드A';       // 길드 가입 = 소속 판정에 영향 없다
  ok(M.accept(p, VID).ok, `길드원이어도 마을 사람이 될 수 있다`);
  p.tribeId = null; p.tribeName = null;               // 길드 탈퇴
  ok(M.isMemberHere(p, VID), `길드를 나가도 마을 소속은 그대로다`);
  const r = M.leave(p);
  ok(r.ok, `마을을 나간다`);
  p.tribeId = 'guild_A';
  ok(!M.memberOf(p) && p.tribeId === 'guild_A', `마을을 나가도 길드는 그대로다`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n③ 한도 — 기여의 단조 함수 · 곳간의 함수');
{
  const big = 1e9;
  const curve = [];
  for (let k = 0; k <= 40; k += 2) curve.push([k, M.limitOf(k, big)]);
  let mono = true, grew = 0;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i][1] < curve[i - 1][1]) mono = false;
    if (curve[i][1] > curve[i - 1][1]) grew++;
  }
  ok(mono, `기여가 늘 때 한도가 **줄지 않는다**(단조)`, curve.map(([k, w]) => `${k}:${w}`).join(' '));
  ok(grew >= 3, `자명하지 않다 — 실제로 ${grew}번 늘어난다(상수가 아니다)`);
  // 곳간이 비면 한도도 준다 — 두 인자가 **둘 다 살아 있다**
  const rich = M.limitOf(40, 1e9), poor = M.limitOf(40, 10);
  ok(poor < rich, `곳간이 비면 한도가 준다 — 기여만으로 곳간을 넘지 못한다`, `${rich} → ${poor}`);
  ok(M.limitOf(M.CFG.N_MEMBER, 0) === 0, `곳간이 비면 마을 사람이라도 0 — 없는 것은 못 꺼낸다`);
  ok(M.limitOf(M.CFG.N_MEMBER, 1e9) >= M.CFG.WD_MIN, `마을 사람에겐 **바닥 몫**이 있다 — 못 꺼내는 사람은 마을 사람이 아니다`,
     `바닥 ${M.CFG.WD_MIN}`);
  console.log(`    한도표(곳간 넉넉): ${curve.map(([k, w]) => `기여${k}→${w}`).join(' · ')}`);
  console.log(`    곳간 곡선(기여 ${M.CFG.N_MEMBER}): ` +
    [50, 100, 200, 500, 1000, 4000].map((s) => `재고${s}→${M.limitOf(M.CFG.N_MEMBER, s)}`).join(' · '));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n④ 인출 — 누가 · 얼마나 · 어디서');
{
  VIL.econ.storage.food = 4000;
  const out = mkPlayer('mb_out');
  deliver(out, M.CFG.N_MEMBER);
  const rNon = M.withdraw(out, VID, 'food', 1);
  ok(!rNon.ok, `비소속은 곳간을 못 연다`, rNon.err);
  M.accept(out, VID);
  const lim = M.limitOf(M.contribOf(out.playerId), stockOf());
  ok(lim > 0, `상황 assert — 오늘 한도가 0이 아니다(아래가 자명 통과가 아니다)`, `한도 ${lim}`);
  const r1 = M.withdraw(out, VID, 'food', 1);
  ok(r1.ok && r1.qty === 1, `마을 사람은 1 꺼낸다`, `남은 몫 ${r1.remain}/${r1.limit}`);
  const r2 = M.withdraw(out, VID, 'food', lim * 100);
  ok(r2.ok && r2.qty === lim - 1, `한도를 넘겨 달라 하면 **남은 몫만큼만** 나간다`, `요청 ${lim * 100} → ${r2.qty}`);
  const r3 = M.withdraw(out, VID, 'food', 1);
  ok(!r3.ok, `오늘 몫을 다 쓰면 거절`, r3.err);
  _day += 1;                                     // 날이 바뀐다
  const r4 = M.withdraw(out, VID, 'food', 1);
  ok(r4.ok, `하루가 지나면 다시 열린다`);
  out.x = FAR.x; out.y = FAR.y;
  const r5 = M.withdraw(out, VID, 'food', 1);
  ok(!r5.ok, `마을에서 멀면 거절 — 곳간은 걸어가서 여는 것이다`, r5.err);
  out.x = AT.x; out.y = AT.y;
  // 남의 마을 곳간
  const r6 = M.withdraw(out, VID2, 'food', 1);
  ok(!r6.ok, `남의 마을 곳간은 못 연다`, r6.err);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑤ ★사본 0 — 인출은 납품의 정확한 역연산이다');
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
  // 꺼낸다 — 한도를 우회하지 않고 **실물 이동 정본**만 직접 부른다(역연산 검사이므로)
  const wd = Villages.playerVillageWithdraw(VIL, p.inventory, 'food', 7);
  ok(wd.ok, `인출 정본으로 7 꺼냈다`);
  ok(+VIL.econ.storage.food === before, `곳간이 **비트 그대로** 돌아왔다 — 같은 표·같은 환산율`,
     `${before} → ${mid} → ${+VIL.econ.storage.food}`);
  ok((p.inventory[item] | 0) === ((invBefore[item] | 0) + 7), `내 짐도 그대로 돌아왔다`,
     `${invBefore[item] | 0} → ${p.inventory[item] | 0}`);
  // 없는 재화는 안 나온다
  ok(!Villages.playerVillageWithdraw(VIL, p.inventory, '__nope', 1).ok, `곳간이 안 다루는 재화는 거절`);
  ok(!Villages.playerVillageWithdraw(VIL, p.inventory, 'food', 999999).ok, `곳간에 없는 양은 거절`);
  // 소스 검사 — membership.js 는 econ 재고를 **직접 만지지 않는다**
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'membership.js'), 'utf8');
  ok(!/storage\s*\[/.test(src), `membership.js 에 econ 재고 직접 접근이 0곳이다(판정과 실물 이동이 갈려 있다)`);
  ok(/payableQty/.test(src), `한도가 정본 `+ '`Events.payableQty`' + ` 를 부른다(비율 산수 사본 0)`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ 취득일 = 출고일 — 새 규약을 만들지 않았다');
{
  VIL.econ.storage.food = 3000;
  const p = mkPlayer('mb_lot');
  deliver(p, M.CFG.N_MEMBER);
  M.accept(p, VID);
  const today = 500;
  const r = M.withdraw(p, VID, 'food', 1);
  ok(r.ok, `상황 assert — 인출이 실제로 났다`, `${r.item} ${r.qty}`);
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
  ok(M.publicState(q, stockOf()).name === p.member.name, `마을 이름도 따라간다`, q.member.name);
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
  // ⑩-a 게이트를 무시하는 가짜 인출은 ④가 잡는가 — 먼 곳에서 정본 게이트가 실제로 err 를 낸다
  const g = Villages.villageWithdrawGate(VID, FAR.x, FAR.y);
  ok(!!g.err, `⑩-a 통제 실험: 먼 곳에서 게이트가 거절한다(④의 거절이 우연이 아니다)`, g.err);
  // ⑩-b 단조 검사가 **역주행을 잡는가** — 일부러 감소하는 곡선을 같은 검사에 통과시켜 본다
  const bad = [[0, 5], [2, 4], [4, 6]];
  let badMono = true;
  for (let i = 1; i < bad.length; i++) if (bad[i][1] < bad[i - 1][1]) badMono = false;
  ok(!badMono, `⑩-b 통제 실험: 감소하는 곡선은 ③의 단조 검사에 걸린다`);
  // ⑩-c 역연산 검사가 **환산율 어긋남을 잡는가** — 한쪽만 2배로 빼면 곳간이 안 돌아온다
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

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
try { _db.close(); fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
process.exit(fail ? 1 : 0);
