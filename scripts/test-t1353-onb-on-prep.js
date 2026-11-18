#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1353-onb-on-prep.js — T1353 온보딩 켬 준비: 의뢰를 거는 문 · 거래소 잠금 (T1341 회부 2 · 3) ====================
//
// ★왜 [T1341 회부 2 · 3 · 재민 11-16 "마을이 정말 필요한 물건은 구해오면 받아들임 수치가 오르는 것뿐이고 보상 없음"]
//   T1341 켬은 갚음을 0 으로 했지만 의뢰를 **거는** 문(B-1 "갚을 잉여가 있어야 건다")은 그대로였다 — 잉여 없는 마을은 정말 필요한 것이 있어도
//   의뢰를 못 걸었다(사람 0 판 400날 1020: 못갚아미게시 3,796번). 그리고 걸린 의뢰의 약속 품목(`rewItem`)이 거래소 매도를 잠갔다
//   (`trade.js lockedRewards` — 날마다 평균 60.5 품목 · 치르지 않을 약속).
//   고침(켬 `T1341_OWN_HOUSE=1` 에서만 · 끔 = B-1 그대로): 부족이 서면 잉여를 안 보고 건다 · 약속 칸은 비운다(→ 잠금이 서지 않는다).
//
// ★이 하네스가 재는 것 — 정본 장부(`events.createLedger`)를 econ 세계 하나 위에 세워 **실제로 밟는다**(실서버 0 · 몇 초):
//   ① 잉여 0 마을 · 부족 하나 — 켬이면 의뢰가 선다(양 = 소비EMA × REQ_DAYS · 약속 칸 비움) · 끔이면 안 선다(B-1 ⓒ · 장부 `reqNoPay` +1)
//   ② 거래소 잠금(`trade.js lockedRewards` 그 함수) — 켬 0 · 끔(잉여 넉넉한 판)은 약속 품목 하나
//   ③ 하루 재검증 — 켬 의뢰는 곳간이 비어도 거둬지지 않는다
//   ④ 납품(정본 `deliverToVillage`) — 켬 의뢰에 내면 짐 = 낸 것만 · 다 채움
//   ⑤ 장부 DB(`zone-local-db` · 메모리 DB) — 켬 의뢰의 약속 칸이 'null' 글자가 아니라 빈 칸으로 남고 다시 읽으면 잠금 0
//   ⑥ 미끼 둘(이 파일 안 · 자식 프로세스 · 바꾼 자리 정확히 1곳) — ⓐ 거는 문을 B-1 로 되돌린 사본 → ① 켬 줄이 빨강 ·
//      ⓑ 약속 칸에 품목을 남긴 사본 → ② 켬 줄이 빨강. 제품 글자는 같은 판정이 초록.
// ★날짜 · 벽시계 0 — 세계 날은 econ 이 센다(씨 고정).
//
// 실행: node scripts/test-t1353-onb-on-prep.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

// ── 자식: 손잡이 · 사본을 모듈을 올릴 때 정한다 — 사실 한 벌을 JSON 으로 ─────────────────────────────
if (process.env.T1353_CHILD) {
  process.env.DB_PATH = ':memory:';
  const econV2 = R('sim/economy-sim-v2');
  const Events = require(process.env.T1353_EVENTS ? path.join(ROOT, 'server', process.env.T1353_EVENTS) : path.join(ROOT, 'server', 'events'));
  const Villages = R('server/villages');
  const Trade = R('server/trade');
  const DB = R('server/zone-local-db');
  const vidOf = (v, i) => i;
  const DEPMAP = Villages.playerVillageDepositMap();
  const DELIV = new Set(Object.values(DEPMAP));
  const quiet = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };
  //   마을 하나를 통제한다(test-events ⑭ 그 꼴): 부족 품목 W · 그 밖 낼 수 있는 품목 재고는 rewStock
  function stage(seed, rewStock) {
    const world = econV2.createWorldV2({ seed, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    quiet(() => { for (let d = 0; d < 120; d++) econV2.tickWorldV2(world); });
    const v = world.villages[0];
    let W = null;
    for (const [r, e] of Object.entries(v._consEMA || {})) if (DELIV.has(r) && e > 0.3) { W = r; break; }
    if (!W) return null;
    for (const r of DELIV) if (r !== W) v.storage[r] = rewStock;
    v.storage[W] = (+v._consEMA[W]) * 5 * 0.1;   // 문턱 아래 = 부족
    const L = Events.createLedger({ econV2, vidOf, depositMap: DEPMAP });
    L.prime(world);
    const np0 = L.stats.reqNoPay | 0;
    L.scanDay(world, world.day + 1, {});
    const req = L.board(0).find((q) => q.item === W) || null;
    return { world, v, W, L, req, noPay: (L.stats.reqNoPay | 0) - np0 };
  }
  const out = { knob: !!Events.T1341_OWN_HOUSE };
  const A = stage(9, 0);   // ① 잉여 0
  out.zero = A ? { W: A.W, posted: !!A.req, rewItem: A.req ? A.req.rewItem : undefined, rewQty: A.req ? A.req.rewQty : undefined, qty: A.req ? A.req.qty : null,
    want: Math.max(1, Math.round((+A.v._consEMA[A.W]) * A.L.cfg.REQ_DAYS)), noPay: A.noPay, fit: A.req ? A.req.fit : null } : null;
  //   ② 잠금 — 잉여 넉넉(끔이면 약속이 선다) · 거래소 정본 함수 그대로
  const B = stage(9, 100000);
  out.lock = B ? { posted: !!B.req, locked: [...Trade.lockedRewards(B.L, 0)], lockedZero: A ? [...Trade.lockedRewards(A.L, 0)] : null } : null;
  //   ③ 재검증 — 곳간을 비우고 하루
  if (A && A.req) {
    for (const r of Object.keys(A.v.storage)) if (r.charCodeAt(0) !== 95 && r !== A.W) A.v.storage[r] = 0;
    A.L.scanDay(A.world, A.world.day + 2, {});
    out.reval = { still: !!A.L.board(0).find((q) => q.item === A.W) };
    //   ④ 납품 — 정본 함수(실물 이동 = 마을 곳간 정본 · 짐 = 낸 것만)
    const items = (A.L.deliverable.items.get(A.W) || []);
    const it = items[0];
    const inv = { [it]: A.req.qty + 2 };
    const inv0 = Object.assign({}, inv);
    const dep = (vil, inventory, give) => { const taken = {}; for (const [k, n] of Object.entries(give)) { inventory[k] -= n; vil.econ.storage[A.W] = (vil.econ.storage[A.W] || 0) + n; taken[k] = n; } return { ok: true, taken, moved: give }; };
    const r = Events.deliverToVillage({ ledger: A.L, vil: { econ: A.v }, vid: 0, inventory: inv, item: A.W, want: A.req.qty, deposit: dep });
    const gained = Object.keys(inv).filter((k) => (inv[k] || 0) > (inv0[k] || 0));
    out.deliver = { ok: !!r.ok, done: !!r.done, rew: r.rew, gained, took: (inv0[it] || 0) - (inv[it] || 0), qty: A.req.qty };
    //   ⑤ 장부 DB — 거는 훅이 쓰는 그 함수(메모리 DB)
    DB.upsertVillageRequest('t1353', A.req);
    const row = DB.getVillageRequests('t1353').find((x) => x.item === A.W);
    out.db = row ? { rewItem: row.rew_item, rewQty: row.rew_qty } : null;
  }
  process.stdout.write('\n@@T1353@@' + JSON.stringify(out) + '\n');   // 모듈이 찍는 말과 가르는 표지
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);
const child = (env) => { const o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1353_CHILD: '1' }, env), encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); const i = o.lastIndexOf('@@T1353@@'); return JSON.parse(o.slice(i + 9).split('\n')[0]); };
//   판정 한 벌 — 켬 · 미끼가 같은 자를 지난다(미끼에서 어느 줄이 빨강인지 단언하려고 줄마다 이름을 둔다)
function judge(o) {
  return {
    posted: !!(o.zero && o.zero.posted && o.zero.qty === o.zero.want && o.zero.noPay === 0),
    empty: !!(o.zero && o.zero.posted && o.zero.rewItem === null && o.zero.rewQty === 0),
    lock: !!(o.lock && o.lock.posted && o.lock.locked.length === 0 && Array.isArray(o.lock.lockedZero) && o.lock.lockedZero.length === 0),
    reval: !!(o.reval && o.reval.still),
    deliver: !!(o.deliver && o.deliver.ok && o.deliver.done && o.deliver.rew === 0 && o.deliver.gained.length === 0 && o.deliver.took === o.deliver.qty),
    db: !!(o.db && o.db.rewItem === '' && o.db.rewQty === 0),
  };
}

sec('① ~ ⑤ 켬(`T1341_OWN_HOUSE=1`) — 정본 장부를 실제로 밟는다');
let ON = null;
try {
  ON = child({ T1341_OWN_HOUSE: '1' });
  const J = judge(ON);
  ok(ON.knob === true && !!ON.zero, '[상황] 손잡이 켬 · 잉여 0 마을에 부족 하나를 세웠다', JSON.stringify(ON.zero && { W: ON.zero.W }));
  ok(J.posted, '★① 잉여 0 이어도 의뢰가 선다 — 양 = 소비EMA × REQ_DAYS · 못갚아미게시 +0', JSON.stringify(ON.zero));
  ok(J.empty, '① 약속 칸 비움 — rewItem null · rewQty 0', JSON.stringify(ON.zero && [ON.zero.rewItem, ON.zero.rewQty]));
  ok(J.lock, '★② 거래소 잠금 0 — 잉여 넉넉한 판 · 잉여 0 판 둘 다(`trade.js lockedRewards` 그 함수)', JSON.stringify(ON.lock));
  ok(J.reval, '③ 하루 재검증 — 곳간이 비어도 켬 의뢰는 거둬지지 않는다', JSON.stringify(ON.reval));
  ok(J.deliver, '④ 납품 — 다 채움 · 갚음 0 · 짐 = 낸 것만', JSON.stringify(ON.deliver));
  ok(J.db, '⑤ 장부 DB — 약속 칸 = 빈 칸(\'null\' 글자 0) · 갚음 0', JSON.stringify(ON.db));
} catch (e) { ok(false, '켬 판 예외: ' + (e && e.stack || e)); }

sec('⑥ 끔(자식 · env 없음) — B-1 그대로(대조군)');
try {
  const OFF = child({ T1341_OWN_HOUSE: '' });
  ok(OFF.knob === false, '손잡이 끔 기본');
  ok(!!OFF.zero && !OFF.zero.posted && OFF.zero.noPay >= 1, '★끔 — 잉여 0 이면 의뢰를 안 건다(B-1 ⓒ · 못갚아미게시 +1)', JSON.stringify(OFF.zero));
  ok(!!OFF.lock && OFF.lock.posted && OFF.lock.locked.length === 1, '★끔 — 잉여가 넉넉하면 약속 품목 하나가 거래소에서 잠긴다', JSON.stringify(OFF.lock));
} catch (e) { ok(false, '끔 판 예외: ' + (e && e.stack || e)); }

sec('⑦ 미끼 — 이 파일 안 · 바꾼 자리 정확히 1곳 · 어느 줄이 빨강인지 단언');
const baits = [];
try {
  const EV = fs.readFileSync(path.join(ROOT, 'server', 'events.js'), 'utf8');
  const LINE = "if (T1341_OWN_HOUSE) return { vid: s.vid, item, qty: wantQty, filled: 0, rewItem: null, rewQty: 0, day, fit: 'need' };";
  const count = (s, x) => s.split(x).length - 1;
  ok(count(EV, LINE) === 1, '[상황] 고친 줄이 제품 글자에 정확히 한 번 있다', `${count(EV, LINE)}곳`);
  //   ⓐ 거는 문을 B-1 로 되돌림 — 그 줄 하나를 걷는다
  const evA = EV.replace(LINE, '/* 미끼 ⓐ — 켬 거는 문 걷음 */');
  //   ⓑ 약속 칸에 품목을 남김(잠금이 선다) — 그 줄의 `rewItem: null` 하나만
  const evB = EV.replace(LINE, LINE.replace('rewItem: null', "rewItem: 'stone'"));
  ok(count(evA, LINE) === 0 && count(evB, LINE) === 0 && count(evA, '미끼 ⓐ') === 1 && count(evB, "rewItem: 'stone', rewQty: 0, day, fit: 'need'") === 1, '[상황] 미끼 사본 둘 — 각각 바꾼 자리 1곳');
  const fa = path.join(ROOT, 'server', `_t1353_bait_a_${process.pid}.js`), fb = path.join(ROOT, 'server', `_t1353_bait_b_${process.pid}.js`);
  fs.writeFileSync(fa, evA); fs.writeFileSync(fb, evB); baits.push(fa, fb);
  const JA = judge(child({ T1341_OWN_HOUSE: '1', T1353_EVENTS: path.basename(fa) }));
  ok(!JA.posted && !JA.empty, '★미끼 ⓐ(거는 문 B-1) — ① 줄 둘(의뢰가 선다 · 약속 칸 비움)이 빨강', JSON.stringify(JA));
  const JB = judge(child({ T1341_OWN_HOUSE: '1', T1353_EVENTS: path.basename(fb) }));
  ok(JB.posted && !JB.empty && !JB.lock, '★미끼 ⓑ(약속 칸에 품목) — ② 잠금 줄 · ① 약속 칸 줄이 빨강(거는 줄은 초록)', JSON.stringify(JB));
  const JR = ON ? judge(ON) : null;
  ok(!!JR && Object.values(JR).every(Boolean), '제품 글자(켬)는 같은 자가 전부 초록(미끼만 빨강)', JSON.stringify(JR));
} catch (e) { ok(false, '⑦ 예외: ' + (e && e.stack || e)); }
finally { for (const f of baits) { try { fs.unlinkSync(f); } catch (e) {} } }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
