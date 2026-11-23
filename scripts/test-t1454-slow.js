// @regress
// @bait 8
// === scripts/test-t1454-slow.js — T1454 낡은 시설은 느려진다(★재민 11-22 판정 69 · 70 · 74 · 손잡이 `T1454_SLOW` — `T1438_DECAY` 켬 안에서만) ==================
// 판(운영 함수 그대로 · 사본 0):
//   ㉮ 셈(`server/decay.js` 순수) — ①a 식 m(x) = (1 + a) ÷ (x + a) · a = 0.25 — 새것 1배 · 절반 1.67 · ¼ 2.5 · 0 바로 위 5배에서 멎음 · 0 = 고장(Infinity)
//      ①b 식은 한 자리(decay.js `t1454Slow` · `SLOW_A`) ①c 짓는 중인 터(움집 · 노 · 가마 · 우물 · 마을 · 쉼터 터)는 안 낡는다(판정 74)
//   ㉯ 존 켬(아이 · zone.js 그대로 · 낡음 시계 주입):
//      ②a 작업대 대기열 — 남은 몫 ½ 이면 1.67배 · ¼ 2.5배 · 새것 1배 · 나오는 것 그대로 ②b 고장(0) — 대기열 거절 · 숯가마는 통나무를 안 삼키고 거절
//      ②c 진행 중 일은 넣을 때 정한 시간 그대로 끝난다(도중에 더 낡아도 안 늘어남) ②d 노 녹이기 · 숯가마 굽기도 같은 식(시설마다 a 같음)
//      ②e 헐기 — 낡았으면 재료 × 남은 몫(낱개 내림) · 새것은 종전 물건 하나 ②f 고장 난 우물은 물이 안 나온다 ②g 우클릭 "손질…" 줄 · 제작 창 머리 시간 = 배수
//      ②h 돌아온 사람 한 줄(비운 사이 절반 밑으로 내려간 제 구조물 · 고칠 재료 수) ②i 마을 장인 몸의 작업 자리 — 고장이면 안 고른다 · 고른 시설의 배수(같은 식)
//   ㉰ 존 끔(`T1454_SLOW` 없음 · 낡음은 켬) — 종전: 낡아도 1배 · 0 이어도 쓴다 · 헐면 물건 하나 · 우클릭 줄에 배수 칸 없음
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언) 여덟 — 카드 할 일 8 의 일곱 + 덧붙임 둘(짓는 중인 터가 낡는 사본).
// 실행: node scripts/test-t1454-slow.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다
const path = require('path');
const { spawnSync } = require('child_process');
const LB = require('./lib-bait');   // [T1383] 미끼 사본의 바꾼 자리를 센다
const ROOT = path.join(__dirname, '..');
const ZFILE = path.join(ROOT, 'server', 'zone.js'), DFILE = path.join(ROOT, 'server', 'decay.js'), FFILE = path.join(ROOT, 'server', 'facility.js');
const BAITS = {
  inv: { file: DFILE, at: ['  return (1 + SLOW_A) / (v + SLOW_A);', '  return 1 / v;   // 미끼 — 종전 PM 안 1/x(0 근처에서 끝없이 는다)'] },
  new1: { file: DFILE, at: ['  return (1 + SLOW_A) / (v + SLOW_A);', '  return 1 / (v + SLOW_A);   // 미끼 — 새것이 1배가 아니다'] },
  site: { file: DFILE, at: ['  if (!type || EXCLUDE[type]) return null;', "  if (!type || (EXCLUDE[type] && !/_site$/.test(type))) return null; if (/_site$/.test(type)) return { type, multi: false, parts: [part('body', '몸', { wood: 1 }, null)], maxHp: 50 };   // 미끼 — 짓는 중인 터도 낡는다"] },
  used: { file: ZFILE, at: ['  if (!(x > 0)) { if (!peek) _t1454S.broken++; return { broken: true,', '  if (false) { if (!peek) _t1454S.broken++; return { broken: true,   /* 미끼 — 0 인데 쓰인다 */'] },
  output: { file: FFILE, at: ['  const rec = Object.assign({}, job, { startAt, doneAt: startAt + ms, ms });', '  const rec = Object.assign({}, job, mult > 1 && job.items ? { items: Object.fromEntries(Object.entries(job.items).map(([k, n]) => [k, Math.floor(n / mult)])) } : {}, { startAt, doneAt: startAt + ms, ms });   // 미끼 — 산출이 준다'] },
  mid: { file: FFILE, at: ['  while (q.length && q[0].doneAt <= now) {', '  while (q.length && q[0].startAt + q[0].ms * ((_slow && _slow(b) && _slow(b).mult) || 1) / (q[0].mult || 1) <= now) {   // 미끼 — 진행 중 일이 도중에 다시 셈'] },
  raze: { file: ZFILE, at: ['  const _rz = (T1454_SLOW && itemType) ? _t1454RazeBack(b) : null;', '  const _rz = null;   // 미끼 — 헐고 다시 세우면 새것'] },
  perA: { file: ZFILE, at: ['    const dur = _sl ? Math.round(_smeltDurationMs(kind) * _sl.mult) : _smeltDurationMs(kind);', '    const dur = _sl ? Math.round(_smeltDurationMs(kind) * (1.5 / (_sl.x + 0.5))) : _smeltDurationMs(kind);   // 미끼 — 노만 a 가 다르다(0.5)'] },
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
const SITES = ['hut_site', 'furnace_site', 'kiln_site', 'well_site', 'village_site', 'shelter_site'];
function pureOf(D) {   // ㉮ — 본 판과 미끼 사본 아이가 같은 줄을 잰다
  const m = [1, 0.5, 0.25, 1e-9, 0, -1, 1.5].map((x) => { const v = D.t1454Slow(x); return Number.isFinite(v) ? v : null; });   // Infinity(고장) = null(JSON 왕복과 같은 꼴)
  return { m, a: D.SLOW_A, sites: SITES.map((t) => !!D.kindOf(t, {})) };
}
function pureChild(bait) {
  baitHook(bait);
  process.stdout.write('@@' + JSON.stringify(pureOf(require(DFILE))) + '\n'); process.exit(0);
}

// ── ㉯ ㉰ 존 아이 ───────────────────────────────────────────────────────────────
function zoneChild(mode, bait) {
  const TMP = require('./lib-tmp').file('t1454z', '.db');   // [T1400] 제 DB 는 판 끝에 지운다
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(39780)), DB_PATH: TMP,
    ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', T1065_TOOL_GATE: '0', T1438_DECAY: '1', E2E_GIVE: '1' });
  if (mode === 'zoff') delete process.env.T1454_SLOW; else process.env.T1454_SLOW = '1';
  baitHook(bait);
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  process.on('uncaughtException', (e) => { process.stdout.write('@@' + JSON.stringify({ err: String(e && e.stack).slice(0, 900) }) + '\n'); process.exit(4); });
  const Zone = require(ZFILE);
  console.log = _log;
  const H = Zone.__testBind(), BS = H.BUILDING_SIZE, D = H.Decay, F = H.Facility, out = { on: !!H.T1454_SLOW };
  const notes = [];
  const mkP = (id, b, inv) => ({ playerId: id, pid: 'p_' + id, name: id, ws: { readyState: 1, send: (s) => { try { notes.push(JSON.parse(s)); } catch (e) {} } }, x: b.x + 8, y: b.y, floor: 0,
    inventory: Object.assign({}, inv || {}), vp: 0, hunger: 100, thirst: 100, hp: 100, toolItems: [], lastAttackAt: 0, tribeId: null, isDown: false });
  const note = () => { const n = notes.filter((m) => m.type === 'notice'); return n.length ? n[n.length - 1].text : null; };
  const meta = H._t1438Meta ? H._t1438Meta() : null;
  const DAYMS = H._t1438DayMs(), OFF = H._t1402Stat().off, EP = meta ? meta.epoch : 0;
  let T = EP + 1000; H._t1332SetClock(() => T);
  const DAY = (n) => { T = EP + n * DAYMS; return H._t1438Now(); };
  DAY(0);
  let cx = 1000;
  const mk = (type, owner, extra) => { cx += 6; const b = H._liveBuildRow(type, cx * BS + BS / 2, 1000 * BS + BS / 2, Object.assign({ floor: 0 }, extra || {}), owner, owner); b._born = T + OFF; return b; };
  const setX = (b, x) => { const M = H._t1438Hp(b).max; b.data = b.data || {}; b.data.hp = x * M; b.data.dkT = H._t1438Now(); delete b.data.damaged; };
  const xOf = (b) => { const h = H._t1438Hp(b); return h ? h.hp / h.max : null; };
  const job = (id) => ({ id, kind: 'tool', label: '시험', owner: 'p1', items: { axe: 1 } });
  const base = F.CRAFT_MS.tool;
  // ②a 작업대 — 남은 몫 ½ · ¼ · 새것
  const WB1 = mk('workbench', 'p1'); setX(WB1, 0.5);
  const WB2 = mk('workbench', 'p1'); setX(WB2, 0.25);
  const WB0 = mk('workbench', 'p1');
  const r1 = F.enqueue(WB1, job('j1'), 1000), r2 = F.enqueue(WB2, job('j2'), 1000), r0 = F.enqueue(WB0, job('j0'), 1000);
  const got1 = F.collect(WB1, 'p1', r1.job ? r1.job.doneAt : 0);
  out.a = { base, x1: xOf(WB1), ms1: r1.job && r1.job.ms, ms2: r2.job && r2.job.ms, ms0: r0.job && r0.job.ms, got1: got1.map((j) => j.items) };
  // ②b 고장 — 대기열 거절 · 숯가마는 통나무를 안 삼킨다
  const WB3 = mk('workbench', 'p1'); WB3.data.damaged = true; WB3.data.hp = 0;
  const r3 = F.enqueue(WB3, job('j3'), 1000);
  const K1 = mk('charcoal_kiln', 'p2', { owner: 'p2' }); K1.data.damaged = true; K1.data.hp = 0;
  const P2 = mkP('p2', K1, { wood: 9 }); H.players.set(P2.playerId, P2);
  notes.length = 0; H.tryKilnBurn(P2, K1.id);
  out.b = { ok: r3.ok, broken: !!r3.broken, err: r3.err || null, kilnWood: P2.inventory.wood, kilnJob: !!(K1.data && K1.data.job), kilnNote: note() };
  //   고친다 — 통나무 하나(몫 ⅙)를 넣으면 0 을 벗어나 바로 다시 쓴다(가장 느린 배수부터 · 부서짐 표지는 종전 수리 문대로 절반까지 남는다)
  const P1 = mkP('p1', WB3, { wood: 1 }); H.players.set(P1.playerId, P1);
  H._t1438Repair(P1, { buildingId: WB3.id, part: 'body', item: 'wood' });
  const r3b = F.enqueue(WB3, job('j3b'), 1000);
  out.b.fix = { x: xOf(WB3), damaged: !!WB3.data.damaged, ok: r3b.ok, ms: r3b.job ? r3b.job.ms : null, wood: P1.inventory.wood };
  // ②c 진행 중 일 — 넣은 뒤 더 낡아도 넣을 때 정한 시간에 끝난다
  const WB4 = mk('workbench', 'p1'); setX(WB4, 0.5);
  const r4 = F.enqueue(WB4, job('j4'), 1000);
  setX(WB4, 0.25);
  const got4 = F.collect(WB4, 'p1', r4.job ? r4.job.doneAt : 0);
  out.c = { ms: r4.job && r4.job.ms, got: got4.length, xNow: xOf(WB4) };
  // ②d 노 녹이기 · 숯가마 굽기 — 같은 식
  const K2 = mk('charcoal_kiln', 'p3', { owner: 'p3' }); setX(K2, 0.5);
  const P3 = mkP('p3', K2, { wood: 3 }); H.players.set(P3.playerId, P3);
  notes.length = 0; H.tryKilnBurn(P3, K2.id);
  const FU = mk('furnace', 'p4', { owner: 'p4', kind: 'crucible' }); setX(FU, 0.5);
  const P4 = mkP('p4', FU, { iron_ore: 1, charcoal: 30 }); H.players.set(P4.playerId, P4);
  notes.length = 0; H.tryFurnaceSmelt(P4, FU.id);
  out.d = { kiln: K2.data.job ? K2.data.job.until - K2.data.job.startedAt : null, kilnBase: H.KILN_BURN_MS, kx: xOf(K2),
    smelt: FU.data.job ? FU.data.job.until - FU.data.job.startedAt : null, smeltBase: H._smeltDurationMs('crucible'), fx: xOf(FU), fnote: note() };
  // ②e 헐기 — 낡았으면 재료 × 남은 몫(내림) · 새것은 물건 하나
  const WB5 = mk('workbench', 'p5'); setX(WB5, 0.5);
  const P5 = mkP('p5', WB5, {}); H.players.set(P5.playerId, P5);
  H.doDismantleBuilding(P5, WB5.id);
  const WB6 = mk('workbench', 'p6');
  const P6 = mkP('p6', WB6, {}); H.players.set(P6.playerId, P6);
  H.doDismantleBuilding(P6, WB6.id);
  out.e = { worn: P5.inventory, fresh: P6.inventory, cost: D.costOf('workbench') };
  // ②f 우물 — 고장이면 물이 안 나온다
  const WL = mk('well', 'p7', {}); WL.data.x0 = Math.floor(WL.x / BS); WL.data.y0 = Math.floor(WL.y / BS); setX(WL, 0.5);   // 2×2 발자국 왼위 칸 = 선 칸
  const wOk = H._wellCellAt(WL.x, WL.y); WL.data.damaged = true; WL.data.hp = 0;
  const wBroken = H._wellCellAt(WL.x, WL.y);
  out.f = { ok: wOk, broken: wBroken };
  // ②g 우클릭 "손질…" · 제작 창 머리
  const WB7 = mk('workbench', 'p8'); setX(WB7, 0.5);
  const P8 = mkP('p8', WB7, {}); H.players.set(P8.playerId, P8);
  notes.length = 0; H._t1438Peek(P8, WB7.id);
  const info = notes.find((m) => m.type === 't1438_info');
  out.g = { slow: info ? info.slow || null : 'none', craftMs: H._t1454CraftMs ? H._t1454CraftMs(WB7, base) : null };
  // ②h 돌아온 사람 — 비운 사이 절반 밑으로 내려간 제 작업대 한 줄
  if (mode !== 'zoff') {
    const WB8 = mk('workbench', 'p9'); setX(WB8, 0.6);
    const P9 = mkP('p9', WB8, {}); H.players.set(P9.playerId, P9);
    const rate = D.partRate(D.kindOf('workbench', null).parts[0]), dd = Math.ceil(0.2 / rate) + 2;
    H.handlePlayerInput(P9, JSON.stringify({ type: '__e2e_clock', day: 300, quiet: true }));
    P9.lastSeenDay = 300;
    DAY(dd + 1);   // 낡음 시계도 같은 날만큼(꺼진 시간 0 · 판은 낡음 날 0 에서 시작했다)
    H.handlePlayerInput(P9, JSON.stringify({ type: '__e2e_clock', day: 300 + dd, quiet: true }));
    notes.length = 0;
    const n = H._t1454Back(P9);
    out.h = { n, x: xOf(WB8), dd, text: note(), gd: H.gameDayNow ? H.gameDayNow() : null, seen: P9.lastSeenDay };
  }
  // ②i 마을 장인 몸의 작업 자리
  const WB9 = mk('workbench', 'p10'); setX(WB9, 0.5);
  const f1 = H._facilityNearDep('tool', WB9.x, WB9.y, BS);
  WB9.data.damaged = true; WB9.data.hp = 0;
  const f2 = H._facilityNearDep('tool', WB9.x, WB9.y, BS);
  out.i = { f1, f2 };
  out.s = Object.assign({}, H._t1454S);
  process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
}
if (process.argv[2] === '--zone') return zoneChild(process.argv[4] || 'on', process.argv[3]);
if (process.argv[2] === '--pure') return pureChild(process.argv[3]);

// ── 부모 ───────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else fail++; console.log(`${c ? '  ✓' : '  ✗'} ${name}${info ? ' — ' + info : ''}`); };
const run = (args) => {
  const r = spawnSync(process.execPath, ['--experimental-sqlite', __filename, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20,
    env: Object.assign({}, process.env, { T1438_DECAY: '', T1454_SLOW: '', T1438_DECAY_SET: '' }) });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return { err: `rc ${r.status} · ${String(r.stderr || '').slice(-800)}` };
  return JSON.parse(line.slice(2));
};
const near = (a, b, e) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= (e == null ? 1e-6 : e);
const m = (x) => 1.25 / (Math.min(1, x) + 0.25);   // 카드 식 그대로(판정 69 · PM 읽기 (1 + a) · a = 0.25) — 하네스가 정본을 베끼지 않고 카드 글자로 잰다

console.log('[㉮ 셈 — decay.js]');
let D = null; try { D = require(DFILE); } catch (e) { D = null; }
const P0 = D && D.t1454Slow ? pureOf(D) : null;
const pureOk = (p) => !!p && p.m && near(p.m[0], 1) && near(p.m[1], m(0.5)) && near(p.m[2], 2.5) && p.m[3] <= 5 && p.m[3] > 4.99 && p.m[4] === null && p.m[5] === null && near(p.m[6], 1);
ok(pureOk(P0), '①a 식 m(x) = (1 + a) ÷ (x + a) · a 0.25 — 새것 1배 · 절반 1.67 · ¼ 2.5 · 0 바로 위 5배에서 멎음 · 0 · 음수 = 고장 · 1 넘음 = 1배', P0 ? JSON.stringify(P0.m.map((v) => (v == null ? '∞' : +v.toFixed(4)))) : 'decay.js t1454Slow 없음');
ok(!!P0 && P0.a === 0.25, '①b 식은 한 자리(decay.js `t1454Slow` · `SLOW_A` 0.25 — 시설마다 다른 a 0)', P0 ? 'a ' + P0.a : 'decay.js t1454Slow 없음');
ok(!!P0 && P0.sites.every((v) => !v), '①c 짓는 중인 터(움집 · 노 · 가마 · 우물 · 마을 · 쉼터 터)는 안 낡는다(판정 74)', P0 ? JSON.stringify(P0.sites) : 'decay.js t1454Slow 없음');

console.log('\n[㉯ 존 켬 — zone.js]');
const Z = run(['--zone', '-', 'on']);
if (Z.err || Z.baitErr) { ok(false, '존 켬 아이', Z.err || Z.baitErr); }
else {
  const a = Z.a;
  ok(Z.on && near(a.x1, 0.5, 1e-9) && a.ms1 === Math.round(a.base * m(0.5)) && a.ms2 === Math.round(a.base * 2.5) && a.ms0 === a.base && a.got1.length === 1 && a.got1[0].axe === 1,
    '②a 작업대 — 남은 몫 ½ 이면 1.67배 · ¼ 2.5배 · 새것 1배 · 나오는 것 그대로(도끼 하나)', `${a.base} → ${a.ms1} · ${a.ms2} · ${a.ms0} · 나옴 ${JSON.stringify(a.got1)}`);
  const b = Z.b;
  ok(b.ok === false && b.broken && /고장/.test(b.err || '') && b.kilnWood === 9 && !b.kilnJob && /고장/.test(b.kilnNote || '') && b.fix && b.fix.ok && b.fix.x > 0 && b.fix.ms === Math.round(a.base * m(b.fix.x)) && b.fix.wood === 0,
    '②b 고장(0) — 대기열 거절 · 숯가마는 통나무를 안 삼키고 "고장" 한 줄 · 통나무 하나로 고치면 0 을 벗어나 바로 다시 쓴다(가장 느린 배수부터)', `대기열 ${b.err} · 통나무 ${b.kilnWood}/9 · 고친 뒤 ${JSON.stringify(b.fix)}`);
  ok(Z.c.got === 1 && Z.c.ms === Math.round(Z.a.base * m(0.5)) && near(Z.c.xNow, 0.25, 1e-9), '②c 진행 중 일은 넣을 때 정한 시간 그대로 끝난다(넣은 뒤 ¼ 로 더 낡아도 그 시각에 꺼냄)', `ms ${Z.c.ms} · 꺼냄 ${Z.c.got}`);
  const d = Z.d;
  ok(d.kiln === Math.round(d.kilnBase * m(d.kx)) && d.smelt === Math.round(d.smeltBase * m(d.fx)) && near(d.kx, 0.5, 1e-9) && near(d.fx, 0.5, 1e-9),
    '②d 노 녹이기 · 숯가마 굽기도 같은 식(½ → 1.67배 · 시설마다 a 같음)', `숯가마 ${d.kilnBase} → ${d.kiln} · 노 ${d.smeltBase} → ${d.smelt} · ${d.fnote}`);
  const e = Z.e;
  ok(e.worn.wood === Math.floor(e.cost.wood * 0.5) && e.worn.stone === Math.floor(e.cost.stone * 0.5) && !e.worn.item_workbench && e.fresh.item_workbench === 1 && !e.fresh.wood,
    '②e 헐기 — 낡은 작업대(½)는 재료 × ½(내림 — 통나무 2 · 돌 1) · 새것은 종전 물건 하나(헐고 다시 세워 새것 0)', `낡음 ${JSON.stringify(e.worn)} · 새것 ${JSON.stringify(e.fresh)}`);
  ok(Z.f.ok === true && Z.f.broken === false, '②f 고장 난 우물은 물이 안 나온다(½ 은 그대로 긷는다 — 긷기는 시간이 없는 일)', JSON.stringify(Z.f));
  ok(!!Z.g.slow && near(Z.g.slow.x, 0.5, 1e-3) && near(Z.g.slow.mult, m(0.5), 1e-3) && Z.g.craftMs === Math.round(Z.a.base * m(0.5)),
    '②g 우클릭 "손질…" 줄에 남은 몫 · 걸리는 시간 배수 · 제작 창 머리 시간 = 배수(서버 셈)', JSON.stringify(Z.g));
  ok(!!Z.h && Z.h.n >= 1 && Z.h.x < 0.5 && /비운 사이/.test(Z.h.text || '') && /작업대/.test(Z.h.text || '') && /나무|돌/.test(Z.h.text || ''),
    '②h 돌아온 사람 — 비운 사이 절반 밑으로 내려간 제 작업대 한 줄 · 고칠 재료 수', Z.h ? `${Z.h.dd}날 · ${Z.h.text}` : '-');
  ok(!!Z.i.f1 && near(Z.i.f1.m, m(0.5), 1e-3) && Z.i.f2 === null, '②i 마을 장인 몸의 작업 자리 — 고른 시설의 배수(같은 식) · 고장이면 안 고른다', JSON.stringify(Z.i));
}

console.log('\n[㉰ 존 끔 — T1454_SLOW 없음 · 낡음 켬]');
const O = run(['--zone', '-', 'zoff']);
if (O.err || O.baitErr) ok(false, '존 끔 아이', O.err || O.baitErr);
else ok(!O.on && O.a.ms1 === O.a.base && O.a.ms2 === O.a.base && O.b.ok === true && O.b.kilnJob === true && O.e.worn.item_workbench === 1 && !O.e.worn.wood && O.g.slow === null && O.g.craftMs === O.a.base && O.f.broken === true && O.i.f2 && O.i.f2.m === undefined,
  '③ 끔 — 종전: 낡아도 1배 · 0 이어도 쓴다(대기열 · 숯가마 · 우물) · 헐면 물건 하나 · 우클릭 · 제작 창에 배수 칸 없음 · 장인 자리 배수 칸 없음', `ms ${O.a.ms1} · 고장 대기열 ${O.b.ok} · 헐기 ${JSON.stringify(O.e.worn)}`);

console.log('\n[미끼 — 바꾼 자리 하나 · 빨강 줄]');
const B = (name, kind, red) => {   // 미끼 사본 한 판 — { n: 바꾼 자리 수, red: 빨강 줄이 섰나, why }
  const r = kind === 'pure' ? run(['--pure', name]) : run(['--zone', name, 'on']);
  const n = (() => { const b = BAITS[name]; let src = ''; try { src = require('fs').readFileSync(b.file, 'utf8'); } catch (e) { return 0; } return LB.count(src, b.at[0]); })();
  let isRed = false, why = '';
  try { isRed = !r.err && !r.baitErr && red(r); why = r.err || r.baitErr || ''; } catch (e) { why = e.message; }
  return { n, red: n === 1 && isRed, why: why ? ' · ' + String(why).slice(0, 200) : '' };
};
let b;
b = B('inv', 'pure', (r) => !pureOk(r)); ok(b.red, '미끼 0 근처에서 시간이 끝없이 느는 사본(1/x) → ①a 빨강', `바꾼 자리 ${b.n}${b.why}`);
b = B('new1', 'pure', (r) => !pureOk(r)); ok(b.red, '미끼 새것이 1배가 아닌 사본(1/(x+a)) → ①a 빨강', `바꾼 자리 ${b.n}${b.why}`);
b = B('site', 'pure', (r) => r.sites.some(Boolean)); ok(b.red, '미끼 짓는 중인 터가 낡는 사본 → ①c 빨강', `바꾼 자리 ${b.n}${b.why}`);
b = B('used', 'zone', (r) => r.b.ok !== false || r.b.kilnWood !== 9); ok(b.red, '미끼 0 인데 쓰이는 사본(= 지금) → ②b 빨강', `바꾼 자리 ${b.n}${b.why}`);
b = B('output', 'zone', (r) => !(r.a.got1.length === 1 && r.a.got1[0].axe === 1)); ok(b.red, '미끼 산출이 주는 사본 → ②a 빨강', `바꾼 자리 ${b.n}${b.why}`);
b = B('mid', 'zone', (r) => r.c.got !== 1); ok(b.red, '미끼 진행 중 일이 도중에 늘어나는 사본 → ②c 빨강', `바꾼 자리 ${b.n}${b.why}`);
b = B('raze', 'zone', (r) => r.e.worn.item_workbench === 1); ok(b.red, '미끼 헐고 다시 세우면 새것이 되는 사본(= 지금) → ②e 빨강', `바꾼 자리 ${b.n}${b.why}`);
b = B('perA', 'zone', (r) => r.d.smelt !== Math.round(r.d.smeltBase * m(r.d.fx))); ok(b.red, '미끼 시설마다 a 가 다른 사본(노만 0.5) → ②d 빨강', `바꾼 자리 ${b.n}${b.why}`);

console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
