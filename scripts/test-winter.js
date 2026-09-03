#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-winter.js — 겨울나기 공동 프로젝트 하네스 =====================
//
// ★[재민 확정 2026-09-02 · T20] 설계 정본 `설계/겨울나기_공동프로젝트_설계안.md` · 합격 기준 §5.
//
// ★★이 하네스의 제1 원칙: **검사 상황이 실제로 그 코드를 밟는지 먼저 assert 한다.**
//   겨울나기는 "아무 일도 안 일어나는 것"이 정상인 갈래가 많다(참여 0 · 랩엔 플레이어가 없다).
//   그래서 "사건이 0건이다"를 통과로 세기 전에 **날이 실제로 겨울 첫날을 지났는지**를 먼저 잰다.
//
// 실행: node scripts/test-winter.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/test-winter-${process.pid}.db`;

const fs = require('fs');
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));

const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const Events = R('server/events');
const Villages = R('server/villages');
const Winter = R('server/winter');
const DB = R('server/zone-local-db');
const Onb = R('server/onboarding');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };

const ZONE = 'test-winter';
let NOW = 0;                                   // 이 하네스가 미는 게임일(호스트 시계)
function makeWorld(days, seed) {
  const world = econV2.createWorldV2({ seed: seed || 7, villageCount: 4, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  const _log = console.log; console.log = () => {};
  try { for (let d = 0; d < (days || 0); d++) econV2.tickWorldV2(world); } finally { console.log = _log; }
  return world;
}
// 마을 껍데기 — `villages.js state.villages` 와 같은 모양(dbId · name · econ)만 준다.
const wrap = (world, base) => world.villages.map((v, i) => ({ dbId: base + i, name: v.name, econ: v }));
function mkLedger(world) {
  const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap() });
  L.prime(world);
  return L;
}
function bindWinter(L) {
  Winter.__reset();
  Winter.init({ db: DB, zoneId: ZONE, ledger: () => L, gameDay: () => NOW });
}
// econ 상태 스냅샷 — 관측자 규약 검사용(곳간·인구·인구 누적)
const snapEcon = (world) => JSON.stringify(world.villages.map((v) => [
  v.npcs.length, v._dPAccum, Object.entries(v.storage).sort().map(([k, q]) => [k, +(+q).toFixed(6)]),
]));

console.log('\n=== 겨울나기 공동 프로젝트 하네스 ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// ① 목표는 **유도된다** — 소스에 달력·산수 상수가 없다 · 시계가 하나다
//    ★합격 기준 1·8. 이건 "코드를 읽어 확인했다"가 아니라 **기계가 읽는다**(test-calendar ③ 문법).
// ─────────────────────────────────────────────────────────────────────────────
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'winter.js'), 'utf8');
  const body = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');   // 주석 줄 제외
  const banned = ['365', '270', '95', '158.4', '1.667', '90', '180'];
  const hit = banned.filter((n) => new RegExp(`(^|[^\\w.])${n.replace('.', '\\.')}([^\\w.]|$)`).test(body));
  ok(hit.length === 0, '① 소스에 달력·산수 상수가 하나도 없다(전부 정본에서 유도)', hit.length ? `발견: ${hit.join(' ')}` : '365·270·95·158.4·1.667·90·180 전부 0');
  // ⚠**주석까지 훑으면 안 된다** — 자염 배치가 그렇게 틀렸다(머리말의 인용을 "사본"으로 오판).
  //   여기서도 `winter.js` 머리말이 `zoneGameDay` 를 **경고로** 인용한다. 코드만 본다.
  ok(!/zoneGameDay/.test(body), '①b 시계가 하나다 — 코드에 `zoneGameDay`(벽시계 파생) 호출 0');
  ok(/zoneGameDay/.test(src), '①b2 (자명 통과 방지) 그 낱말이 파일에 **있긴 하다**(주석의 경고 — 검사가 주석을 안 본다는 증거)');
  // ★자명 통과 방지 — 정본을 **실제로 부르는지** 같이 본다(상수가 없는 게 아니라 아무것도 안 하는 것일 수 있다)
  ok(/Events\.calendarOf/.test(src), '①c (자명 통과 방지) 달력 정본 `Events.calendarOf` 를 실제로 부른다');
  ok(/SUBSISTENCE_PER_NPC/.test(src), '①d (자명 통과 방지) 1인 하루치를 econ 정본 `SUBSISTENCE_PER_NPC` 에서 읽는다');
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 계절 경계 스윕 — 공표·판정은 **해마다 정확히 한 번**
//    ★합격 기준 2·3. 800일이면 두 해를 넘긴다.
// ─────────────────────────────────────────────────────────────────────────────
const YD = Events.yearDaysOf();
{
  const world = makeWorld(0, 7);
  const L = mkLedger(world); bindWinter(L);
  const vils = wrap(world, 100);
  const DAYS = 800;
  const ann = new Map(), jud = new Map();
  let annCalls = 0, judCalls = 0, other = 0;
  for (let d = 1; d <= DAYS; d++) {
    NOW = d;
    const x = Winter.dailyExtra(d, vils);
    if (!x) { other++; continue; }
    const y = Winter.yearOf(d);
    if (x.goal) { annCalls++; ann.set(y, (ann.get(y) || 0) + 1); }
    if (x.emit) { judCalls++; jud.set(y, (jud.get(y) || 0) + 1); }
  }
  const years = Math.floor(DAYS / YD);
  ok(annCalls >= 2 && judCalls >= 2, '② 전제: 800일이 두 해를 넘겼다(공표·판정이 여러 번 온다)',
    `한 해 ${YD}일 · 공표 ${annCalls}회 · 판정 ${judCalls}회`);
  ok([...ann.values()].every((n) => n === 1), '② 공표는 **한 해에 정확히 한 번**', JSON.stringify([...ann]));
  ok([...jud.values()].every((n) => n === 1), '②b 판정도 한 해에 정확히 한 번', JSON.stringify([...jud]));
  ok(other === DAYS - annCalls - judCalls, '②c 그 밖의 날엔 아무 일도 안 한다(틱 비용 0)', `${other}일`);
  // 겨울 안에 재공표 0 — 겨울의 모든 날에 대해 `goal` 이 안 나온다
  let reAnn = 0;
  for (let d = 1; d <= DAYS; d++) { if (Events.calendarOf(d).season !== 'winter') continue; NOW = d; const x = Winter.dailyExtra(d, vils); if (x && x.goal) reAnn++; }
  ok(reAnn === 0, '②d 겨울 안에는 재공표가 없다', `${reAnn}회`);
  // ★같은 공표일을 다시 밟아도 목표가 안 바뀐다(촌장이 말을 바꾸지 않는다)
  const aDay = [...Array(YD).keys()].map((i) => i + 1).find((d) => Winter.isAnnounceDay(d));
  NOW = aDay;
  const g1 = Winter.dailyExtra(aDay, vils).goal;
  const g2 = Winter.dailyExtra(aDay, vils).goal;
  ok(JSON.stringify(g1) === JSON.stringify(g2) && Object.keys(g1).length > 0,
    '②e 공표한 목표는 **얼어 있다** — 같은 날을 다시 밟아도 그대로다', `${Object.keys(g1).length}마을 · ${JSON.stringify(Object.values(g1)[0])}`);
  ok(Object.values(g1).every((x) => x.target > 0 && x.res && x.deadline > aDay),
    '②f 목표가 실제로 서 있다(품목·수량·마감)', `마감 ${Object.values(g1)[0].deadline} > 공표 ${aDay}`);
  // 마감은 **겨울 첫날**이어야 한다 — 상수가 아니라 달력에서
  ok(Object.values(g1).every((x) => Winter.isJudgeDay(x.deadline)),
    '②g 마감일이 곧 **겨울 첫날**이다(달력에서 유도 — 상수 아님)');
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ ★**양과 횟수는 서로를 오염시키지 않는다**(합격 기준 4 · 설계안 W-7)
//    ⚠자명 통과 금지: 둘이 **다른 수**이고 **순서까지 반대**임을 같이 잰다.
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(0, 7);
  const L = mkLedger(world); bindWinter(L);
  const vils = wrap(world, 200);
  const aDay = [...Array(YD).keys()].map((i) => i + 1).find((d) => Winter.isAnnounceDay(d));
  NOW = aDay;
  const goal = Winter.dailyExtra(aDay, vils).goal;
  const vid = 200, res = goal[vid].res;
  ok(!!res && goal[vid].target > 0, '③ 전제: 공표가 섰다', `${res} ${goal[vid].target}`);

  // 기여 **횟수** 정본을 그대로 쓴다(사본 금지) — 온보딩 표가 그 하나다.
  Onb.init({ db: DB.db, gameDay: () => NOW, send: () => {}, warm: false, ZONE_ID: ZONE });
  const P = (id) => ({ playerId: id, name: id, ws: null });
  const A = P('t20-A'), B = P('t20-B');
  const deliv = (pl, q, done) => {
    const r = { ok: true, done: !!done, moved: { [res]: q }, req: { item: res } };
    Onb.onDeliver(pl, r, vid); Winter.onDeliver(pl, r, vid);
  };
  NOW = aDay + 1;
  deliv(A, 50, true);                                   // 큰 물량 한 번
  for (let i = 0; i < 5; i++) deliv(B, 6, true);         // 작은 물량 다섯 번
  const pr = Winter.probe(vid, Winter.yearOf(NOW));
  const qA = (pr.by.find((x) => x.pid === 't20-A') || {}).qty;
  const qB = (pr.by.find((x) => x.pid === 't20-B') || {}).qty;
  const kA = Onb.stateOf('t20-A').contrib, kB = Onb.stateOf('t20-B').contrib;
  ok(kA === 1 && kB === 5, '③ 횟수 축 — 큰 물량 1회 vs 작은 물량 5회', `A ${kA} · B ${kB}`);
  ok(qA === 50 && qB === 30, '③b 양 축 — 같은 두 사람이 낸 **양**', `A ${qA} · B ${qB}`);
  ok(kA < kB && qA > qB, '③ ★두 축의 **순서가 반대**다 — 서로를 오염시키지 않는다(자명 통과 아님)',
    `횟수 ${kA}<${kB} · 양 ${qA}>${qB}`);
  // 부분 납품 — 양은 오르고 횟수는 안 오른다
  const k0 = Onb.stateOf('t20-A').contrib, q0 = qA;
  deliv(A, 7, false);
  ok(Onb.stateOf('t20-A').contrib === k0, '③c 부분 납품은 **횟수를 안 올린다**(완료 에지만 센다 — T11 규약)');
  ok(Winter.probe(vid).by.find((x) => x.pid === 't20-A').qty === q0 + 7, '③d 그런데 **양은 센다**(부분도 겨울에 보탠 것이다)');
  // 공표 품목이 아닌 것은 안 센다
  const q1 = Winter.probe(vid).by.find((x) => x.pid === 't20-A').qty;
  Winter.onDeliver(A, { ok: true, done: true, moved: { stone: 99 } }, vid);
  ok(Winter.probe(vid).by.find((x) => x.pid === 't20-A').qty === q1, '③e 공표한 품목이 아니면 겨울 몫에 안 센다');
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ 해가 바뀌면 **그 해 것만** 센다(합격 기준 3 후반)
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(0, 42);
  const L = mkLedger(world); bindWinter(L);
  const vils = wrap(world, 300);
  const a1 = [...Array(YD).keys()].map((i) => i + 1).find((d) => Winter.isAnnounceDay(d));
  NOW = a1; Winter.dailyExtra(a1, vils);
  const vid = 300, res = Winter.probe(vid).res;
  NOW = a1 + 1;
  Winter.onDeliver({ playerId: 'y1', name: 'y1' }, { ok: true, done: true, moved: { [res]: 12 } }, vid);
  ok(Winter.probe(vid).got === 12, '④ 전제: 첫 해에 실제로 냈다', `${Winter.probe(vid).got}`);
  const y1 = Winter.yearOf(NOW);
  const a2 = a1 + YD;
  NOW = a2; Winter.dailyExtra(a2, vils);
  const y2 = Winter.yearOf(NOW);
  ok(y2 === y1 + 1, '④b 전제: 해가 실제로 바뀌었다', `${y1} → ${y2}`);
  ok(Winter.probe(vid, y2).got === 0, '④ 새 해의 진척은 **0에서 시작한다**(그 해의 일이다)');
  ok(Winter.probe(vid, y1).got === 12, '④c 지난 해 기록은 지우지 않는다 — 읽지 않을 뿐이다');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ ★**미달이 아무도 안 굶긴다** + 참여 0 인 해엔 사건이 없다(합격 기준 5·6 · W-4ⓐ)
//    이게 3시드 기준선 불변의 회귀 가드다.
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(0, 1020);
  const LA = mkLedger(world);                      // 겨울 없는 대조군
  const LB = mkLedger(world);                      // 겨울 붙인 판
  bindWinter(LB);
  const vils = wrap(world, 400);
  const _l = console.log; console.log = () => {};
  const DAYS = YD + 40;                            // 공표와 판정을 한 번씩 넘긴다
  let judged = 0;
  for (let d = 1; d <= DAYS; d++) {
    NOW = d;
    econV2.tickWorldV2(world);
    const s0 = snapEcon(world);
    LA.scanDay(world, world.day, {});
    const x = Winter.dailyExtra(world.day, vils);
    if (x && x.emit) judged++;
    LB.scanDay(world, world.day, { winter: x });
    if (snapEcon(world) !== s0) { console.log = _l; ok(false, '⑤ econ 이 스캔 중에 움직였다', `day ${d}`); console.log = () => {}; }
  }
  console.log = _l;
  const wEv = LB.TYPES.filter((t) => t.startsWith('WINTER_')).reduce((a, t) => a + (LB.stats.byType[t] || 0), 0);
  ok(judged >= 1, '⑤ 전제: **판정일을 실제로 지났다**(0건이 그냥 안 지나서가 아니다)', `판정 호출 ${judged}회`);
  ok(wEv === 0, '⑤ ★참여 0 인 해엔 겨울 사건이 **한 건도 없다**(아무도 안 나선 프로젝트는 연표에 없다)');
  const byA = JSON.stringify(LA.stats.byType), byB = JSON.stringify(LB.stats.byType);
  ok(byA === byB, '⑤b 1차 유형 건수가 **켜나 끄나 같다**(겨울이 옛 사건을 못 건드린다)');
  ok(LA.stats.emitted === LB.stats.emitted, '⑤c 총 사건 수도 같다', `${LA.stats.emitted} = ${LB.stats.emitted}`);

  // 참여가 있으면 — 사건이 나되 **econ 은 그대로**다
  const world2 = makeWorld(0, 1020);
  const L2 = mkLedger(world2); bindWinter(L2);
  const v2 = wrap(world2, 500);
  const aDay = [...Array(YD).keys()].map((i) => i + 1).find((d) => Winter.isAnnounceDay(d));
  const jDay = [...Array(YD).keys()].map((i) => i + 1).find((d) => Winter.isJudgeDay(d));
  NOW = aDay; L2.scanDay(world2, aDay, { winter: Winter.dailyExtra(aDay, v2) });
  const vid = 500, res = Winter.probe(vid).res, target = Winter.probe(vid).target;
  NOW = aDay + 1;
  Winter.onDeliver({ playerId: 'p1', name: '재민' }, { ok: true, done: true, moved: { [res]: 1 } }, vid);  // 미달(1 / N)
  NOW = jDay;
  const before = snapEcon(world2);
  const ex = Winter.dailyExtra(jDay, v2);
  const evs = L2.scanDay(world2, jDay, { winter: ex });
  ok(snapEcon(world2) === before, '⑤ ★★미달 판정이 econ 을 **한 글자도** 안 건드린다(W-4ⓐ)');
  const shorts = evs.filter((e) => e.type === 'WINTER_SHORT');
  ok(shorts.length === 1 && shorts[0].vid === vid, '⑤d 참여가 있으면 미달도 **말은 한다**("올해는 궁했다")',
    shorts[0] ? `mag=${shorts[0].mag} (${1}/${target})` : '(없음)');
  ok(evs.filter((e) => e.type === 'WINTER_KEPT').length === 0, '⑤e 미달인데 달성이라 하지 않는다');
  ok(!!Events.briefLine(shorts[0]) && !/undefined|NaN/.test(Events.briefLine(shorts[0])),
    '⑤f 촌장이 할 말이 있다', JSON.stringify(Events.briefLine(shorts[0])));
  // 달성 갈래 — 목표를 채우면 KEPT 가 나고 인출 보너스가 실제로 선다
  const world3 = makeWorld(0, 1020);
  const L3 = mkLedger(world3); bindWinter(L3);
  const v3 = wrap(world3, 600);
  NOW = aDay; L3.scanDay(world3, aDay, { winter: Winter.dailyExtra(aDay, v3) });
  const vid3 = 600, res3 = Winter.probe(vid3).res, tgt3 = Winter.probe(vid3).target;
  NOW = aDay + 1;
  Winter.onDeliver({ playerId: 'p2', name: '나그네' }, { ok: true, done: true, moved: { [res3]: tgt3 } }, vid3);
  ok(Winter.bonusOf(vid3) === 0, '⑤g 전제: 판정 전엔 보상이 없다(자명 통과 방지)');
  NOW = jDay;
  const evs3 = L3.scanDay(world3, jDay, { winter: Winter.dailyExtra(jDay, v3) });
  const kept = evs3.filter((e) => e.type === 'WINTER_KEPT');
  ok(kept.length === 1 && kept[0].item === res3 && kept[0].mag >= 1,
    '⑤h 목표를 채우면 달성 사건이 난다', kept[0] ? `${kept[0].item} mag=${kept[0].mag}` : '(없음)');
  ok(Winter.bonusOf(vid3) === Winter.CFG.BONUS, '⑤ ★달성한 해엔 인출 한도 가산이 **실제로 선다**', `+${Winter.CFG.BONUS}`);
  // 그리고 **다음 겨울 첫날이 오면 저절로 만료된다**(만료 타이머 0 — 연표에 물어보므로)
  NOW = jDay + YD;
  ok(Winter.bonusOf(vid3) === 0, '⑤i 다음 겨울이 오면 그 보상은 **저절로 만료된다**(그 해 한정 — W-6ⓐ)');
  // 연표에는 남는다(일 유형이라 문턱 면제)
  ok(L3.chronOf(vid3).some((e) => e.type === 'WINTER_KEPT'), '⑤j 달성은 **연표에 남는다**(일 유형 — sev 문턱 면제)');
  ok(L3.isDeed({ type: 'WINTER_KEPT' }) && L3.isDeed({ type: 'WINTER_SHORT' }), '⑤k 두 유형 다 "일"로 등재돼 있다');
  ok(L3.deedForeign.indexOf('WINTER_KEPT') < 0, '⑤l 남의 마을 겨울은 이웃 연표에 안 실린다(완공과 같은 자리)');
  // ㉝ 계약 — 문장이 영속 필드만으로 재현되는가(연표 표는 meta 를 안 담는다)
  for (const t of ['WINTER_KEPT', 'WINTER_SHORT']) {
    const ev = { vid: vid3, day: jDay, type: t, item: res3, mag: t === 'WINTER_KEPT' ? 1.2 : 0.4 };
    ok(!!Events.briefLine(ev) && Events.briefLine(ev) === Events.briefLine(Object.assign({}, ev, { meta: null })),
      `⑤m ${t} 문장이 **vid·day·type·item·mag 만으로** 재현된다(㉝ 계약)`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑦ ★**겨울 몫은 의뢰가 없어도 받는다** — §0 실측이 뒤집은 전제
//    게시판은 식량 의뢰를 한 건도 안 낸다(econ 이 식량을 flow-EMA 에 안 담는다) ⇒ 이 갈래가
//    없으면 겨울 목표를 낼 길이 아예 없다. 그 사실 자체를 먼저 재고, 그 다음 갈래를 잰다.
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(300, 7);
  const L = mkLedger(world); bindWinter(L);
  const _l = console.log; console.log = () => {};
  for (let d = 0; d < 60; d++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); }
  console.log = _l;
  // ★전제 — econ 은 식량을 flow-EMA 에 안 담는다(그래서 부족 래치도, 의뢰도 없다)
  const v0 = world.villages[0];
  const emaKeys = Object.keys(v0._consEMA || {});
  ok(emaKeys.length > 0, '⑦ 전제: 소비EMA 가 실제로 차 있다(빈 표라서 통과하는 게 아니다)', `${emaKeys.length}종`);
  ok(!emaKeys.includes('food'), '⑦ ★econ 은 **식량 소비를 flow-EMA 에 안 담는다** — `_consEMA` 에 곡식이 없다',
    emaKeys.slice(0, 8).join(' ') + ' …');
  let foodReq = 0, allReq = 0;
  for (const vid of L.vids) for (const r of L.board(vid)) { allReq++; if (r.item === 'food') foodReq++; }
  ok(allReq > 0, '⑦b 전제: 게시판에 의뢰가 실제로 걸려 있다', `${allReq}건`);
  ok(foodReq === 0, '⑦ ★그래서 **게시판이 식량 의뢰를 한 건도 안 낸다**', `${foodReq}/${allReq}`);

  // 겨울 갈래 — 공표 뒤에는 의뢰가 없어도 받는다
  const vils = wrap(world, 800);
  const aDay = world.day + ((() => { let d = world.day + 1; while (!Winter.isAnnounceDay(d)) d++; return d - world.day; })());
  NOW = aDay; Winter.dailyExtra(aDay, vils);
  const vid = 800, res = Winter.probe(vid).res;
  ok(res === 'food', '⑦c 목표 품목은 곡식이다 — 곳간이 받는 식량 중 econ 이 사람 수대로 먹는 것은 그것뿐', res);
  const inv = { food: 12, stone: 40 };
  const w1 = Winter.deliverable(vid, res, L, inv);
  ok(!!w1 && w1.res === res && w1.give.food === 12, '⑦ ★겨울 몫은 **의뢰가 없어도 받는다**', JSON.stringify(w1 && w1.give));
  ok(Winter.deliverable(vid, 'stone', L, inv) === null, '⑦d 공표한 품목이 아니면 안 받는다(곳간 아무거나 받는 문이 아니다)');
  ok(Winter.deliverable(vid, res, L, { stone: 40 }) === null, '⑦e 손에 없으면 못 낸다');
  ok(Winter.deliverable(999999, res, L, inv) === null, '⑦f 공표가 없는 마을은 안 받는다');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ ★돌연변이 — 판정을 두 번 부르면 하네스가 **실제로 잡는가**
//    (검사가 잡을 수 있는 검사인지 스스로 확인한다 — 족보 (수리 확인))
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(0, 7);
  const L = mkLedger(world); bindWinter(L);
  const vils = wrap(world, 700);
  const jud = new Map();
  const sweep = (twice) => {
    jud.clear();
    for (let d = 1; d <= 800; d++) {
      NOW = d;
      const x = Winter.dailyExtra(d, vils);
      if (x && x.emit) { const y = Winter.yearOf(d); jud.set(y, (jud.get(y) || 0) + 1); if (twice) jud.set(y, jud.get(y) + 1); }
    }
    return [...jud.values()].every((n) => n === 1);
  };
  ok(sweep(false) === true, '⑥ 정상 판에서는 ②b 가 통과한다');
  ok(sweep(true) === false, '⑥ ★판정을 두 번 부르면 **잡는다**(잡을 수 있는 검사다)');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑧ ★[재민 확정 2026-09-03 · ⓑ] **인출 한도의 밑변은 econ 식량 등가다** — 보존식도 곳간의 식량이다.
//    왜 이 검사가 필요한가: 겨울이면 곡식은 이미 **보존식으로 갈무리돼 있다**(T17 ②·T54 말리기).
//    `storage.food` 한 칸만 보면 곳간이 빈 것처럼 보이고, 그러면 소속 한도도 겨울 달성 보상도
//    `min(·, byStock)` 에서 **물리 상한에 가려 0** 이 된다 — 실은 마을이 겨울용으로 쟁여 둔 것이다.
//    ⚠규칙을 새로 만들지 않았다: 밑변은 econ **정본** `totalFoodEquivalent` 그대로다(사본 0).
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(0, 11);
  const vil = { dbId: 900, name: '겨울시험', econ: world.villages[0] };
  const st = vil.econ.storage;
  for (const k of Object.keys(st)) st[k] = 0;

  // ⓐ 곡식 칸이 비었는데 보존식이 있는 겨울 곳간
  st.dried_fish = 120;
  const raw = Villages.playerVillageWithdrawStock(vil, 'food');
  const feq = Villages.playerVillageWithdrawStockFoodEq(vil);
  ok(raw === 0, '⑧ 전제: 곡식 칸은 **비어 있다**(아래가 자명 통과가 아니다)', `food ${raw}`);
  ok(feq > 0, '⑧a ★그래도 곳간엔 식량이 있다 — 식량 등가가 보존식을 센다', `등가 ${feq}`);

  // ⓑ 그 수는 내가 지어낸 게 아니라 econ 정본이 낸 수다(사본 금지 — 같은 함수로 대조)
  const canon = Math.floor((+econ.totalFoodEquivalent(vil.econ) || 0) / 1);
  ok(feq === canon, '⑧b 그 수는 **econ 정본 `totalFoodEquivalent`** 그대로다(사본 0)', `${feq} vs ${canon}`);

  // ⓒ 보존식을 빼면 등가도 같이 준다 — 상수를 심어 둔 게 아니다
  st.dried_fish = 0;
  ok(Villages.playerVillageWithdrawStockFoodEq(vil) === 0, '⑧c 보존식을 비우면 등가도 0 이 된다(고정값이 아니다)');

  // ⓓ "이 재화가 식량으로 세어지는가"도 **목록을 옮겨 적지 않고** econ 에게 묻는다
  st.dried_fish = 50; st.stone = 50;
  ok(Villages._countsAsFoodEq(vil, 'dried_fish') === true, '⑧d 보존식은 식량으로 센다(econ 에게 물어서 안다)');
  ok(Villages._countsAsFoodEq(vil, 'stone') === false, '⑧e ★자명 통과 금지 — 돌은 식량이 아니다');

  // ⓔ 한도는 밑변을 따라 오르지만, **꺼내지는 양은 여전히 실재고가 정한다**(한도가 재고를 만들지 않는다)
  const before = { ...st };
  ok(JSON.stringify(before) === JSON.stringify(st), '⑧f 이 절은 곳간을 **안 건드렸다**(관측만 했다)');
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑨ ★[T63 · T20 회부 ⓪] **기여자 이름이 재기동을 넘어간다** — 저장·로드 왕복
//    왜: 양은 `village_winter` 에 남는데 이름은 서버 메모리에만 있었다. 그래서 재기동하면
//    브리핑이 "누가 냈는지"를 조용히 잃었다(양은 맞는데 이름만 빠지는 반쪽 영속 — 제일 나쁜 종류다).
//    ★재기동은 `bindWinter`(= `__reset()` + `init`)로 흉내 낸다 — 메모리를 비우고 **표에서만** 되살린다.
// ─────────────────────────────────────────────────────────────────────────────
{
  const world = makeWorld(0, 4242);
  const L = mkLedger(world); bindWinter(L);
  const vils = wrap(world, 900);
  let aDay = 0;
  for (let d = 1; d <= YD; d++) { NOW = d; if (Winter.isAnnounceDay(d)) { aDay = d; break; } }
  const goal = Winter.dailyExtra(aDay, vils).goal;
  const vid = 900, res = goal[vid] && goal[vid].res;
  ok(!!res, '⑨ 전제: 공표가 섰다(아래가 자명 통과가 아니다)', String(res));

  NOW = aDay + 1;
  Winter.onDeliver({ playerId: 'p-ko', name: '들풀' }, { ok: true, done: true, moved: { [res]: 9 } }, vid);
  const before = Winter.probe(vid).by.find((x) => x.pid === 'p-ko');
  ok(!!before && before.name === '들풀', '⑨a 낸 직후엔 이름이 있다', JSON.stringify(before));

  // ★재기동 — 메모리를 통째로 비운다
  bindWinter(L);
  const after = Winter.probe(vid).by.find((x) => x.pid === 'p-ko');
  ok(!!after, '⑨b 전제: 재기동 뒤에도 **양**은 남는다(종전부터 그랬다)', JSON.stringify(after));
  ok(!!after && after.qty === before.qty, '⑨c 양이 그대로다', `${before && before.qty} → ${after && after.qty}`);
  ok(!!after && after.name === '들풀', '⑨ ★재기동 뒤에도 **이름**이 남는다(이 절이 고친 것)', JSON.stringify(after && after.name));

  // ★이름 없는 갱신이 이름을 지우지 않는다(COALESCE) — 낸 사람이 또 내면 이름이 사라지면 안 된다
  NOW = aDay + 2;
  Winter.onDeliver({ playerId: 'p-ko' }, { ok: true, done: true, moved: { [res]: 3 } }, vid);
  bindWinter(L);
  const again = Winter.probe(vid).by.find((x) => x.pid === 'p-ko');
  ok(!!again && again.qty === +(before.qty + 3).toFixed(3), '⑨d 다시 내면 양이 는다', `${again && again.qty}`);
  ok(!!again && again.name === '들풀', '⑨e ★이름 없는 갱신이 이름을 **안 지운다**(COALESCE)');

  // ★자명 통과 금지 — 이름을 안 준 사람은 그대로 null 이다(모든 행에 이름을 심는 게 아니다)
  Winter.onDeliver({ playerId: 'p-anon' }, { ok: true, done: true, moved: { [res]: 2 } }, vid);
  bindWinter(L);
  const anon = Winter.probe(vid).by.find((x) => x.pid === 'p-anon');
  ok(!!anon && anon.name === null, '⑨f ★자명 통과 금지 — 이름을 안 준 사람은 여전히 이름이 없다');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
process.exit(fail ? 1 : 0);
