#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2
// === scripts/test-t1368-onb-newbie.js — T1368 검사 카드(T1354) 빨강 둘의 부품: 바위 곁 자갈 · 새 사람이 낼 수 있는 의뢰 ====================
//
// ★왜 [검사 카드 T1354 Q16 · Q19 — S11 이 구현을 안 보고 짠 `test-onb-blackbox` 가 켬 판에서 찾았다]
//   Q16: 「지금 할 일」이 가리킨 바위 곁에서 맨손 E 가 숲 마을에선 잔가지만 줬다(줍기 차례: 숲 바닥 ② 가 바위 곁 ③′ 보다 앞) — 새 사람이 조잡한 도구(자갈)를 못 만든다.
//   Q19: 마을 의뢰판에 새 사람이 맨손 · 조잡한 도구로 낼 것이 없는 마을이 있었다(부족 래치가 선 품목만 걸려서 — 광석 · 빈 판).
//   고침(켬 `T1341_OWN_HOUSE` 에서만 · 끔 = 바이트 같음): 바위 덩이 곁은 숲 바닥보다 자갈이 먼저 · 새 사람 의뢰가 하나도 없으면 그 마을이 날마다 쓰는
//   새 사람 품목 하나를 건다(남아도는 품목은 안 건다 · 다 채우거나 남아돌면 거둔다 · 날마다 거두고 다시 거는 되풀이 0).
// ★이 하네스는 검사 하네스와 겹치지 않는 **부품** 쪽을 잰다 — 줍기 정본(`forage.sourceAt`)과 장부(`events.createLedger`)를 econ 세계 위에서 실제로 밟는다.
//   검사 하네스(`test-onb-blackbox` — 실서버 · 봇)는 결과를 잰다 · 이 파일은 그 결과를 만드는 두 문이 맞게 서는지 · 끔이 그대로인지.
// ★날짜 · 벽시계 0 — 세계 날은 econ 이 센다(씨 고정).
//
//   ① 줍기 차례 — 숲 칸(숲 배수 > 1.5) · 바위 덩이 곁: 켬 = 자갈 '바위 곁' · 끔(ctx 칸 없음) = 잔가지 '숲 바닥' · 켬이어도 바위 곁이 아니면 잔가지(숲 바닥은 그대로)
//   ② 장부 — 새 사람 품목이 남아돌면(glut) 안 건다 · 남아돌지 않고 날마다 쓰면 건다(양 = 소비EMA × REQ_DAYS · 'daily' · 약속 칸 비움) ·
//      다음 날 부족이 아니어도 머문다(되풀이 0) · 다 채우면 거둔다 · 끔이면 안 건다(대조군)
//   ③ 첫 의뢰 고르기 — 켬이면 새 사람이 낼 수 있는 줄이 먼저(장부 `newbieHas`)
//   ④ 존 배선(글자) — 새 사람 품목 = 자연물 전리품 정본(`lootOfResource`) × 맨손 · 조잡한 도구 거리 + 줍기 · 줍기 ctx 의 `rockFirst` 는 켬일 때만
//   ⑤ 미끼 둘(이 파일 안 · 바꾼 자리 정확히 1곳) — ⓐ 줍기 차례 줄을 걷은 사본 → ① 켬 줄 빨강 · ⓑ 남아도는 품목 막음을 걷은 사본 → ② glut 줄 빨강
//
// 실행: node scripts/test-t1368-onb-newbie.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

// ── 자식 — 손잡이 · 사본은 모듈을 올릴 때 정한다 ─────────────────────────────────────────────────────
if (process.env.T1368_CHILD) {
  const out = {};
  //   ① 줍기 — 숲 칸 · 바위 덩이 곁(ctx 는 존이 넘기는 꼴 그대로 · 켬이면 `rockFirst`)
  const Forage = require(process.env.T1368_FORAGE ? path.join(ROOT, 'server', process.env.T1368_FORAGE) : path.join(ROOT, 'server', 'forage'));
  const KON = process.env.T1341_OWN_HOUSE === '1';
  const ctx = (near) => Object.assign({ forestMult: () => 3, isRock: () => false, isWater: () => false, rockNear: () => near }, KON ? { rockFirst: true } : {});
  const a = Forage.sourceAt(1000, 1000, ctx(true)), b = Forage.sourceAt(1000, 1000, ctx(false));
  out.forage = { near: a ? [a.kind, a.where] : null, far: b ? [b.kind, b.where] : null };
  //   ② 장부 — econ 세계 하나 · 마을 0 의 새 사람 품목 W(소비 > 0)를 통제한다
  const econV2 = R('sim/economy-sim-v2');
  const Events = require(process.env.T1368_EVENTS ? path.join(ROOT, 'server', process.env.T1368_EVENTS) : path.join(ROOT, 'server', 'events'));
  const Villages = R('server/villages');
  const DEPMAP = Villages.playerVillageDepositMap();
  const quiet = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };
  const world = econV2.createWorldV2({ seed: 9, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  quiet(() => { for (let d = 0; d < 120; d++) econV2.tickWorldV2(world); });
  const v = world.villages[0];
  const NEWBIE_PLAYER = ['wood', 'stone', 'pebble', 'twig', 'fiber', 'berry', 'herb'];   // 존이 넘기는 꼴(맨손 · 조잡한 도구 거리) — 장부는 econ 대응 정본으로 econ 품목을 고른다
  const L = Events.createLedger({ econV2, vidOf: (x, i) => i, depositMap: DEPMAP, newbieItems: NEWBIE_PLAYER });
  L.prime(world);
  const nb = Object.keys(v._consEMA || {}).filter((k) => L.newbieHas(k) && (+v._consEMA[k]) > 0);
  out.newbieEcon = nb;
  //   새 사람 품목 전부를 남아돌게(소비 × GLUT_DAYS × 2) → 그날 장부
  for (const k of nb) v.storage[k] = (+v._consEMA[k]) * L.cfg.GLUT_DAYS * 2;
  const glutRun = () => { L.scanDay(world, world.day + 1, {}); world.day += 1; return L.board(0).filter((q) => L.newbieHas(q.item)); };
  out.glut = glutRun().map((q) => q.item);
  //   하나(W)만 남아돌지 않게(소비 × GLUT_DAYS ÷ 3 — 부족 문턱 위 · 과잉 문턱 아래)
  const W = nb.slice().sort((p, q) => (+v._consEMA[q]) - (+v._consEMA[p]))[0];
  out.W = W;
  if (W) {
    v.storage[W] = (+v._consEMA[W]) * L.cfg.GLUT_DAYS / 3;
    for (let k = 0; k < 4; k++) glutRun();   // 과잉 래치가 풀리는 데 며칠(HYST)
    const r1 = L.board(0).find((q) => q.item === W) || null;
    out.daily = r1 ? { fit: r1.fit, qty: r1.qty, want: Math.max(1, Math.round((+v._consEMA[W]) * L.cfg.REQ_DAYS)), rewItem: r1.rewItem, rewQty: r1.rewQty } : null;
    const o0 = L.stats.reqOpened;
    for (let k = 0; k < 3; k++) glutRun();
    out.stay = { still: !!L.board(0).find((q) => q.item === W), reopened: L.stats.reqOpened - o0 };
    //   다 채운다(정본 몫 확정) → 다음 날 거둔다
    const req = L.board(0).find((q) => q.item === W);
    if (req) { L.claim(0, W, req.remain); glutRun(); out.filled = { closed: !L.board(0).find((q) => q.item === W && q.filled > 0) }; }
  }
  process.stdout.write('\n@@T1368@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);
const child = (env) => { const o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1368_CHILD: '1' }, env), encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); const i = o.lastIndexOf('@@T1368@@'); return JSON.parse(o.slice(i + 9).split('\n')[0]); };
//   판정 한 벌 — 켬 · 미끼가 같은 자를 지난다(줄마다 이름)
const judge = (o) => ({
  forageOn: !!(o.forage && o.forage.near && o.forage.near[0] === 'pebble' && o.forage.near[1] === '바위 곁'),
  forageFar: !!(o.forage && o.forage.far && o.forage.far[0] === 'twig'),
  glut: Array.isArray(o.glut) && o.glut.length === 0,
  daily: !!(o.daily && o.daily.fit === 'daily' && o.daily.qty === o.daily.want && o.daily.rewItem === null && o.daily.rewQty === 0),
  stay: !!(o.stay && o.stay.still && o.stay.reopened === 0),
  filled: !!(o.filled && o.filled.closed),
});

sec('① ② 켬(`T1341_OWN_HOUSE=1`) — 줍기 차례 · 새 사람 의뢰');
let ON = null;
try {
  ON = child({ T1341_OWN_HOUSE: '1' });
  const J = judge(ON);
  ok(Array.isArray(ON.newbieEcon) && ON.newbieEcon.length > 0 && !!ON.W, '[상황] 장부가 새 사람 econ 품목을 안다(econ 대응 정본) · 마을 0 이 그중 날마다 쓰는 것이 있다', JSON.stringify({ nb: ON.newbieEcon, W: ON.W }));
  ok(J.forageOn, '★① 숲 칸 · 바위 덩이 곁 — 맨손 E 가 자갈(바위 곁)', JSON.stringify(ON.forage));
  ok(J.forageFar, '① 바위 곁이 아닌 숲 칸은 그대로 잔가지(숲 바닥)', JSON.stringify(ON.forage && ON.forage.far));
  ok(J.glut, '★② 새 사람 품목이 다 남아돌면 안 건다(지어내지 않는다)', JSON.stringify(ON.glut));
  ok(J.daily, '★② 하나가 남아돌지 않고 날마다 쓰이면 건다 — 양 = 소비EMA × REQ_DAYS · daily · 약속 칸 비움', JSON.stringify(ON.daily));
  ok(J.stay, '② 다음 날들 부족이 아니어도 머문다 — 거두고 다시 걸기 0', JSON.stringify(ON.stay));
  ok(J.filled, '② 다 채우면 거둔다', JSON.stringify(ON.filled));
} catch (e) { ok(false, '켬 판 예외: ' + (e && e.stack || e)); }

sec('끔(자식 · env 없음) — 종전 그대로(대조군)');
try {
  const OFF = child({ T1341_OWN_HOUSE: '' });
  ok(!!OFF.forage && OFF.forage.near && OFF.forage.near[0] === 'twig', '★끔 — 숲 칸이면 바위 곁이어도 잔가지(종전 차례)', JSON.stringify(OFF.forage));
  ok(Array.isArray(OFF.newbieEcon) && OFF.newbieEcon.length === 0 && !OFF.daily, '★끔 — 장부가 새 사람 품목을 안 본다 · 날마다 쓰는 것 의뢰 0', JSON.stringify({ nb: OFF.newbieEcon, daily: OFF.daily }));
} catch (e) { ok(false, '끔 판 예외: ' + (e && e.stack || e)); }

sec('③ 첫 의뢰 고르기 · ④ 존 배선(글자)');
try {
  const SRC = (n) => fs.readFileSync(path.join(ROOT, 'server', n + '.js'), 'utf8');   // 글자만 읽는다(존을 띄우지 않는다)
  const z = SRC('zone'), on = SRC('onboarding');
  ok(/const newbie = \(T1341 && typeof ledger\.newbieHas === 'function'\) \? rows\.filter\(\(r\) => ledger\.newbieHas\(r\.item\)\) : \[\];\n  const pool = edible\.length \? edible : newbie\.length \? newbie : rows;/.test(on),
    '③ 첫 의뢰 — 켬이면 새 사람이 낼 수 있는 줄이 먼저(장부 `newbieHas`) · 없으면 종전 차례');
  ok(/for \(const t of \['tree', 'sapling', 'rock', 'berry_bush', 'herb'\]\) \{ try \{ for \(const k of Object\.keys\(lootOfResource\(/.test(z) && /newbieItems: _T1368_NEWBIE,/.test(z),
    '④ 새 사람 품목 = 자연물 전리품 정본(`lootOfResource`) × 맨손 · 조잡한 도구 거리 + 줍기 — 마을 층에 넘긴다(사본 0)');
  ok(/\.\.\.\(_T1341_ON \? \{ rockFirst: true \} : \{\}\),/.test(z), '④ 줍기 ctx 의 `rockFirst` 는 켬일 때만(끔 = 칸 없음 = 종전 바이트)');
} catch (e) { ok(false, '③④ 예외: ' + (e && e.stack || e)); }

sec('⑤ 미끼 — 이 파일 안 · 바꾼 자리 정확히 1곳 · 어느 줄이 빨강인지 단언');
const baits = [];
try {
  const FO = fs.readFileSync(path.join(ROOT, 'server', 'forage.js'), 'utf8'), EV = fs.readFileSync(path.join(ROOT, 'server', 'events.js'), 'utf8');
  const cnt = (s, x) => s.split(x).length - 1;
  const LA = 'if (ctx.rockFirst && ctx.rockNear && ctx.rockNear(x, y, RING_PX)) {';
  const LB = '          if (d && d.glut) continue;\n          if (d && d.reqClosedDay != null && (day - d.reqClosedDay) < cfg.REQ_COOLDOWN) continue;\n          best = item; be = e;';
  const fa = path.join(ROOT, 'server', `_t1368_bait_a_${process.pid}.js`), fb = path.join(ROOT, 'server', `_t1368_bait_b_${process.pid}.js`);
  const foA = FO.replace(LA, 'if (false) {'), evB = EV.replace(LB, LB.replace('          if (d && d.glut) continue;\n', ''));
  fs.writeFileSync(fa, foA); fs.writeFileSync(fb, evB); baits.push(fa, fb);
  const JA = judge(child({ T1341_OWN_HOUSE: '1', T1368_FORAGE: path.basename(fa) }));
  ok(cnt(FO, LA) === 1 && cnt(foA, LA) === 0 && !JA.forageOn && JA.forageFar && JA.glut && JA.daily,
    '★미끼 ⓐ 줍기 차례 줄을 걷은 사본(바꾼 자리 1곳) — ① 켬 줄(바위 곁 자갈)만 빨강', JSON.stringify(JA));
  const JB = judge(child({ T1341_OWN_HOUSE: '1', T1368_EVENTS: path.basename(fb) }));
  ok(cnt(EV, LB) === 1 && cnt(evB, LB) === 0 && !JB.glut && JB.forageOn,
    '★미끼 ⓑ 남아도는 품목 막음을 걷은 사본(바꾼 자리 1곳) — ② glut 줄(다 남아돌면 안 건다)이 빨강', JSON.stringify(JB));
  const JR = ON ? judge(ON) : null;
  ok(!!JR && Object.values(JR).every(Boolean), '제품 글자(켬)는 같은 자가 전부 초록(미끼만 빨강)', JSON.stringify(JR));
} catch (e) { ok(false, '⑤ 예외: ' + (e && e.stack || e)); }
finally { for (const f of baits) { try { fs.unlinkSync(f); } catch (e) {} } }

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
