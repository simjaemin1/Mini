// @regress
// @bait 22
// === scripts/test-t1447-grudge.js — T1447 마을이 사람에게 품는 원한(★재민 판정 55 · 56 · 57 · 58 · 59 · 61 · 손잡이 `T1447_PERSON_GRUDGE`) ==================
// 판(운영 함수 그대로 · 사본 0):
//   ㉮ 셈(`server/grudge.js` 순수) — ①a 사람 열쇠(마을 이름과 안 부딪힘 · econ JSON 왕복) ①b 길 막기 한 번 = 8 ÷ 50 × 0.45(일곱 번째에 문턱) · 주인 없는 땅 ½
//      ①c 막힌 칸 = 사유지가 없었다면 그날 고른 위 want 칸 가운데 사유지 칸 ①d 명분 = 막힌 칸 ≥ min(⌈사유지 ½⌉, N) · 지금도 그 사유지 칸인 것만
//      ①e 토벌 뒤 푸는 칸 = 마을 영토에 가까운 칸부터 30 %(올림 · 적어도 한 칸 · 결정론) ①f 해코지 원한 = 값 ÷ 원한 1 의 값 · 갚기 = 같은 식
//   ㉯ 마을(아이 · 마을 층 함수 그대로 · 꾸민 땅 · 꾸민 마을):
//      ②a 넓힘이 소속 아닌 사람 사유지 칸을 못 가진다 · 막힌 칸을 센다(한 칸 한 번) · 처음 막힌 날 가입 권유(한 번)
//      ②b 그 마을 사람 사유지는 덮는다(막힌 칸 0) ②c 토벌 — 명분 · 비용이 서면 몸이 걸어간다(가는 날 ≥ 걸음) · 닿으면 부숨 · 가까운 쪽 30 % 풂 · 땅 원한 0 ·
//         해코지 원한이 있으면 짐(값 상한) · 집에 와서야 곳간 · 그 값만큼 원한이 풀린다 ②d 비용 · 몸 · 땅 모자람 · 쿨이 막는다 ②e 해코지 원한만으로는 토벌 0(명분 = 땅)
//      ②f 가는 사이 주인이 그 마을에 들면 닿은 날 치지 않고 돌아간다 ②g 플레이어 마을은 저절로 안 간다 · 촌장 단추는 명분이 선 상대에게만(서버 술어)
//   ㉰ 존(아이 · zone.js 그대로 · 꾸민 마을 둘을 마을 층에 넣음):
//      ③a 길 막기 → 소식이 닿은 그 마을만 해코지 원한(벌점 0) · 주인 없는 땅의 것 ½ · 접속 안 한 주인은 들어올 때 한 줄
//      ③b 마을 땅에서 거두기 — 그 마을 몸이 보았으면 값만큼 · 안 보았으면 0 ③c 마을 밭 작물 — 벌점 0 · 원한 ③d 마을 벽을 치면 깎은 몫의 값만큼
//      ③e 문 — 해코지 원한 ≥ 문턱이면 거래 · 가입 거절 · 땅 원한만이면 가입 받음 · 들면 땅 원한 지움 · 해코지 원한은 남음
//      ③f 그 마을 사람이 문턱을 넘으면 추방 ③g 권유 — 그 자리(그 마을 땅 · 제 사유지)에 왔을 때 한 번
//      ③h 토벌 손 — 살피기 · 건물 전부 부숨(상자 짐은 바닥) · 고른 칸만 풂 · 짐은 값 · 무게 상한 · 바닥 짐만 ③i 플레이어 마을 촌장 알림은 접속 안 했어도 쌓여 남는다
//   ㉱ 끔(손잡이 끔) — 사유지 칸 표 0 · 넓힘은 사유지를 덮는다(종전) · 마을 작물 = 벌점 3(종전) · 원한 0
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언) 스물둘 — 카드 · 덧붙임 둘 · 셋 · 다섯 · 여섯의 미끼 줄 그대로(아래 `BAITS`).
// 실행: node scripts/test-t1447-grudge.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다
const path = require('path');
const { spawnSync } = require('child_process');
const LB = require('./lib-bait');   // [T1383] 미끼 사본의 바꾼 자리를 센다
const ROOT = path.join(__dirname, '..');
const ZFILE = path.join(ROOT, 'server', 'zone.js'), VFILE = path.join(ROOT, 'server', 'villages.js'), GFILE = path.join(ROOT, 'server', 'grudge.js');
const W = require(path.join(ROOT, 'sim', 'war-core'));
const BAITS = {
  far: { file: ZFILE, at: ["  const d = SimVillages.t1447Harm ? SimVillages.t1447Harm(vil, ownerId, g, onClaim ? 'block' : 'blockFree') : 0;", "  let d = 0; for (const v2 of SimVillages.t1447Villages()) d = SimVillages.t1447Harm(v2, ownerId, g, 'block');   // 미끼 — 소식이 안 닿은 마을도 안다"] },
  both: { file: ZFILE, at: ["  _t1447Z.harm++; _t1447Z.harmG += d; if (onClaim) _t1447Z.block++; else _t1447Z.blockFree++;", "  _t1447Z.harm++; _t1447Z.harmG += d; { const _p = _t1447Player(ownerId); if (_p) _p.vp = (_p.vp || 0) + VP_BREAK_FENCE; }   // 미끼 — 벌점에도"] },
  zone: { file: GFILE, at: ["  W.warAddGrudge(econ, pkey(pid), g);\n  return harmOf(econ, pid) - b;", "  if (!econ._gTmp) Object.defineProperty(econ, '_gTmp', { value: new Map(), enumerable: false }); econ._gTmp.set(pid, (econ._gTmp.get(pid) || 0) + g);   // 미끼 — 장부가 몸 쪽(저장 · 존 넘기에 안 따라간다)\n  return g;"] },
  member: { file: VFILE, at: ["if (_gA) { const o = _gA(nx, ny); if (o && o.vid !== vil.dbId) {", "if (_gA) { const o = _gA(nx, ny); if (o) {   /* 미끼 — 제 마을 사람 것도 막는다 */"] },
  teleport: { file: VFILE, at: ["      if (!alive.every((pid) => _t1423Arrived(state.bodyExits && state.bodyExits.get(pid)))) continue;\n      job.arriveDay = d; S.arrive++;\n      for (const pid of alive) {", "      job.arriveDay = d; S.arrive++;   // 미끼 — 걷지 않고 그날 닿는다\n      for (const pid of alive) {"] },
  nocost: { file: VFILE, at: ["  if (out.feAfter < CR) return Object.assign(out, { ok: false, why: 'food' });", "  // 미끼 — 비용을 안 따진다"] },
  landjoin: { file: ZFILE, at: ["  if (!vil || !vil.econ || !Grudge.harmShut(vil.econ, player.playerId)) return null;\n  _t1447Z.join++;", "  if (!vil || !vil.econ || !(Grudge.harmShut(vil.econ, player.playerId) || Grudge.landCount(vil.econ, player.playerId) > 0)) return null;   // 미끼 — 땅 원한도 가입을 막는다\n  _t1447Z.join++;"] },
  landstay: { file: ZFILE, at: ["  if (vil && vil.econ && Grudge.landClear(vil.econ, player.playerId)) _t1447Z.clear++;", "  // 미끼 — 들어도 땅 원한이 남는다"] },
  harmclear: { file: ZFILE, at: ["  if (vil && vil.econ && Grudge.landClear(vil.econ, player.playerId)) _t1447Z.clear++;", "  if (vil && vil.econ && Grudge.landClear(vil.econ, player.playerId)) _t1447Z.clear++; if (vil && vil.econ) Grudge.harmPay(vil.econ, player.playerId, 1);   // 미끼 — 들면 해코지 원한도 지운다"] },
  nooffer: { file: VFILE, at: ["      else if (dp && dp.t1447Offer) { Grudge.landOf(vil.econ, o.pid).off = d; dp.t1447Offer(o.pid, vil.dbId); }", "      // 미끼 — 권유 없이 바로 쌓는다"] },
  partial: { file: ZFILE, at: ["  for (const b of L) {\n    const e = _t1423Ent(b), by =", "  for (const b of L.slice(0, 1)) {   // 미끼 — 건물을 일부만\n    const e = _t1423Ent(b), by ="] },
  farside: { file: GFILE, at: ["  rows.sort((a, b) => (a.d - b.d) || (a.c - b.c) || (a.y - b.y) || (a.x - b.x));", "  rows.sort((a, b) => (b.d - a.d) || (b.c - a.c) || (a.y - b.y) || (a.x - b.x));   // 미끼 — 먼 쪽부터"] },
  landloot: { file: VFILE, at: ["      if (harm > 0 && dp.t1447Loot) {", "      if (dp.t1447Loot) {   // 미끼 — 땅 원한뿐이어도 짐을 가져간다"] },
  overcarry: { file: ZFILE, at: ["    n = Math.min(n, Math.floor((kgCap - kg) / Math.max(1e-6, r.kg1)));     // 무게 상한 — 낱개 내림(질 수 있는 만큼)", "    // 미끼 — 질 수 있는 양보다 많이"] },
  warp: { file: VFILE, at: ["      job.breakDay = d; job.st = 'home';\n      if (S.log.length < 200) S.log.push(`d${d} ${job.vname} 토벌 닿음", "      job.breakDay = d; job.st = 'home'; if (vil && vil.econ && job.carry) { for (const [k, q] of Object.entries(job.carry)) vil.econ.storage[k] = (vil.econ.storage[k] || 0) + q; job.carry = null; }   // 미끼 — 짐이 곳간에 순간이동\n      if (S.log.length < 200) S.log.push(`d${d} ${job.vname} 토벌 닿음"] },
  landkeep: { file: VFILE, at: ["      if (vil && vil.econ) Grudge.landClear(vil.econ, job.pid);   // 판정 57 PM 결정", "      if (false) Grudge.landClear(vil.econ, job.pid);   // 미끼 — 토벌 뒤에도 땅 원한이 남는다 · 판정 57 PM 결정"] },
  nocasus: { file: VFILE, at: ["  if (!P.casus) return { ok: false, err: '명분이 없습니다. 그 땅이 우리 넓힘을 충분히 막고 있지 않습니다.', plan: P };", "  // 미끼 — 명분 없이도 서버가 받는다"] },
  nochief: { file: VFILE, at: ["    const e = vil.econ; if (!e || !e._grudgeLand || e.founder) continue;\n    for (const pid of Object.keys(e._grudgeLand)) {\n      if (_t1447Jobs", "    const e = vil.econ; if (!e || !e._grudgeLand) continue;   // 미끼 — 플레이어 마을 주민이 촌장 없이 간다\n    for (const pid of Object.keys(e._grudgeLand)) {\n      if (_t1447Jobs"] },
  harmraid: { file: GFILE, at: ["  return { ok: blk.length > 0 && blk.length >= need, n: blk.length, size, need, cells };", "  return { ok: (blk.length > 0 && blk.length >= need) || harmShut(econ, pid), n: blk.length, size, need, cells };   // 미끼 — 해코지 원한만으로도 명분"] },
  chiefgone: { file: ZFILE, at: ["  const o = _t1447Owe.get(pid) || { lines: [], expel: [] }; if (o.lines.length < 12) o.lines.push(text); _t1447Owe.set(pid, o); _t1447Z.queued++;", "  _t1447Z.queued++;   // 미끼 — 촌장이 없는 동안 알림이 사라진다"] },
  freesame: { file: GFILE, at: ["const FREE_MUL = 0.5;", "const FREE_MUL = 1;   // 미끼 — 주인 없는 땅의 것도 같은 크기"] },
  nobuilder: { file: ZFILE, at: ["  const g = Grudge.BLOCK_G * (onClaim ? 1 : Grudge.FREE_MUL);", "  const g = onClaim ? Grudge.BLOCK_G : 0;   // 미끼 — 주인 없는 땅의 것은 세운 사람을 못 찾는다(원한 0)"] },
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
const FAKE_PRICE = { food: 2, wood: 1, stone: 0.5, wheat: 1.5, fruit: 1 };
const fakeE2 = { shadowPricesOf: (e, keys) => { const o = {}; for (const k of keys) o[k] = FAKE_PRICE[k] || 0; return o; }, computeShadowPrices: () => Object.assign({}, FAKE_PRICE) };

// ── ㉯ 마을 아이 ─────────────────────────────────────────────────────────────
function vilChild(bait, mode) {
  if (mode === 'voff') delete process.env.T1447_PERSON_GRUDGE; else process.env.T1447_PERSON_GRUDGE = '1';
  process.env.T1447_VALUE = 'shadow';   // 값 축 — 꾸민 값표를 그림자 값 자리로 준다(기본 축 '시세'는 마을 곳간 형편이 드는 econ 이 필요하다)
  Object.assign(process.env, { ENABLE_VILLAGES: '1' });
  baitHook(bait);
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  process.on('uncaughtException', (e) => { process.stdout.write('@@' + JSON.stringify({ err: String(e && e.stack).slice(0, 900) }) + '\n'); process.exit(4); });
  const SV = require(VFILE), G = require(GFILE);
  console.log = _log;
  const out = { on: SV.T1447_GRUDGE };
  const ta = { isBlocked: () => false, fert: () => 0.5, isWater: () => false };
  const mkVil = (dbId, ccx, ccy, R, pop, founder) => {
    const T = new Set(); for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R) T.add((ccx + dx) + ',' + (ccy + dy));
    return { dbId, name: '시험' + dbId, ccx, ccy, _terrSet: T, npcPids: [], _houseCells: [], housesPx: [], _granList: [],
      econ: { name: '시험' + dbId, land: { size: 1000 }, housing: pop, npcs: Array.from({ length: pop }, (_, i) => ({ id: i })), storage: { food: 3000, wood: 50 }, counts: { warrior: 4, hunter: 2 }, founder: founder || null } };
  };
  const players = new Map(), npcs = new Set(), calls = { offer: [], raze: [], unclaim: [], loot: [], depart: [], done: [], chief: [] };
  const claimRows = [];
  const ci = () => G.ciBuild(claimRows, 'k' + claimRows.length + '|' + claimRows.map((r) => r.vid).join(','));
  const deps = { players, npcs, moveSpeed: 64, broadcast: () => {},
    t1447ClaimIdx: () => ci(), t1447Offer: (pid, vid) => { calls.offer.push([pid, vid]); return 'queued'; }, t1447ChiefSay: (v, t) => { calls.chief.push([v.dbId, t]); },
    t1447Survey: () => ({ bld: 2, hits: 6 }), t1447Raze: (pid, cells) => { calls.raze.push([pid, cells.length]); return { razed: 2, hits: 6, drops: 1 }; },
    t1447Unclaim: (pid, keys) => { calls.unclaim.push([pid, keys.slice()]); for (const r of claimRows) if (r.pid === pid) r.cells = r.cells.filter(([x, y]) => !keys.includes(x + ',' + y)); return { n: keys.length, split: false }; },
    t1447Loot: (pid, cells, vil, cap, bodies) => { calls.loot.push([pid, +cap.toFixed(4), bodies.length]); return { items: { wood: 5 }, value: 5, kg: 5 }; },
    t1447Depart: (pid, v, job) => calls.depart.push([pid, job.pids.length]), t1447Done: (pid, v, job) => calls.done.push([pid, job.razed, job.unclaimed]), t1447Day: () => {} };
  const world = { day: 100 }, bodyExits = new Map();
  const V1 = mkVil(1, 200, 200, 8, 60), V2 = mkVil(2, 400, 200, 8, 60, 'chiefP');
  for (const V of [V1, V2]) for (let i = 0; i < 6; i++) { const pid = 'n' + V.dbId + '_' + i; players.set(pid, { pid, x: V.ccx * 32 + 16, y: V.ccy * 32 + 16, hp: 100, simJob: i < 4 ? 'warrior' : 'hunter' }); npcs.add(pid); V.npcPids.push(pid); }
  SV.__t1447.setup({ deps, villages: [V1, V2], byDbId: new Map([[1, V1], [2, V2]]), byEcon: new Map([[V1.econ, V1], [V2.econ, V2]]), econV2: fakeE2, ta, world, zoneId: 'test', warCore: W, bodyExits, dayMs: 1000 });
  deps.moveSpeed = 1; deps.moveSpeed = 64 / SV.__t1447.ppd();   // 하루 걸음 = 64px(두 칸) — 가는 날이 여럿이 되게(순간이동 미끼가 갈리게)
  const sq = (x0, y0, s) => { const c = []; for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) c.push([x, y]); return c; };
  const advance = () => { const d = world.day; for (const r of bodyExits.values()) if (r.ppd != null) r.L = Math.min(r.len, Math.max(0, (d - r.d0) * r.ppd)); };
  const DAY = (n) => { for (let i = 0; i < n; i++) { world.day++; for (const V of [V1, V2]) SV.__t1447.grow(V); advance(); SV.__t1447.day(world.day * 1000); } };

  // ②a · ②b — 소속 아닌 사람(pA · V1 동쪽 붙음) · 그 마을 사람(pM · V1 서쪽 붙음)
  claimRows.push({ cid: 'cA', pid: 'pA', name: 'A', kind: 'personal', state: 'active', cells: sq(209, 199, 3), vid: null });
  claimRows.push({ cid: 'cM', pid: 'pM', name: 'M', kind: 'personal', state: 'active', cells: sq(189, 199, 3), vid: 1 });
  if (mode === 'voff') {   // ㉱ 끔 — 넓힘은 사유지를 덮는다(종전) · 장부 0
    for (let i = 0; i < 3; i++) { world.day++; SV.__t1447.grow(V1); }
    out.off = { takenA: sq(209, 199, 3).filter(([x, y]) => V1._terrSet.has(x + ',' + y)).length, land: !!V1.econ._grudgeLand, grudge: !!V1.econ._grudge };
    process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
  }
  ci();
  if (G.harmAdd) G.harmAdd(V1.econ, 'pA', 0.2);   // 해코지 원한(짐 갈래) — 땅 명분과 따로
  const takenA = () => sq(209, 199, 3).filter(([x, y]) => V1._terrSet.has(x + ',' + y)).length;
  const takenM = () => sq(189, 199, 3).filter(([x, y]) => V1._terrSet.has(x + ',' + y)).length;
  const t0 = world.day;
  // 하루씩 — 명분이 서는 날 · 토벌이 나서는 날 · 닿는 날 · 돌아오는 날
  const trace = [];
  for (let i = 0; i < 40; i++) {
    DAY(1);
    const L = V1.econ._grudgeLand && V1.econ._grudgeLand.pA, J = SV.__t1447.jobs.find((j) => j.pid === 'pA' && j.vid === 1);
    trace.push([world.day - t0, takenA(), L ? L.c.length : -1, G.landCount(V1.econ, 'pA'), J ? J.st : '-', J ? J.pids.length : 0]);
    if (J && J.st === 'done') break;
  }
  const L = V1.econ._grudgeLand || {};
  const JA = SV.__t1447.jobs.find((j) => j.pid === 'pA' && j.vid === 1);
  out.a = { takenA: takenA(), takenM: takenM(), landM: !!L.pM, offer: calls.offer.slice(), trace: trace.slice(0, 40) };
  out.c = JA ? { st: JA.st, d0: JA.d0 - t0, arrive: JA.arriveDay != null ? JA.arriveDay - JA.d0 : null, walkDays: JA.plan.walkDays, len: JA.len, ppd: SV.__t1447.ppd(), pids: JA.pids.length, razed: JA.razed, unclaimed: JA.unclaimed, carry: JA.carry, carryVal: JA.carryVal,
    paid: JA.paid, home: JA.homeDay != null ? JA.homeDay - JA.d0 : null, plan: JA.plan } : null;
  out.c2 = { raze: calls.raze.slice(), unclaim: calls.unclaim.map(([p, k]) => [p, k]), loot: calls.loot.slice(), done: calls.done.slice(), depart: calls.depart.slice(),
    landAfter: L.pA ? { c: L.pA.c.length, raid: L.pA.raid != null } : null, harmAfter: +G.harmOf(V1.econ, 'pA').toFixed(4), wood: V1.econ.storage.wood, unit: SV.t1447Unit(V1) };
  //   그 사이 곳간 — 닿은 날과 집에 온 날 사이의 곳간 나무(순간이동이면 닿은 날 이미 들어 있다)
  process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
}
// ── ㉯ 마을 아이 둘 — 비용 · 몸 · 쿨 · 땅 모자람 · 해코지만 · 주인이 들어옴 · 촌장 마을 ──
function vilChild2(bait) {
  process.env.T1447_PERSON_GRUDGE = '1'; process.env.T1447_VALUE = 'shadow';
  baitHook(bait);
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  process.on('uncaughtException', (e) => { process.stdout.write('@@' + JSON.stringify({ err: String(e && e.stack).slice(0, 900) }) + '\n'); process.exit(4); });
  const SV = require(VFILE), G = require(GFILE);
  console.log = _log;
  const out = {};
  const mkVil = (dbId, ccx, ccy, R, pop, founder) => {
    const T = new Set(); for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R) T.add((ccx + dx) + ',' + (ccy + dy));
    return { dbId, name: '시험' + dbId, ccx, ccy, _terrSet: T, npcPids: [], _houseCells: [], housesPx: [], _granList: [],
      econ: { name: '시험' + dbId, land: { size: 1000 }, housing: pop, npcs: Array.from({ length: pop }, (_, i) => ({ id: i })), storage: { food: 3000, wood: 50 }, counts: {}, founder: founder || null } };
  };
  const sq = (x0, y0, s) => { const c = []; for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) c.push([x, y]); return c; };
  const run = (opt) => {
    const players = new Map(), npcs = new Set(), calls = { raze: 0, chief: 0, loot: 0 };
    const rows = [{ cid: 'c', pid: 'pX', name: 'X', kind: 'personal', state: 'active', cells: sq(209, 199, 3), vid: null }];
    const deps = { players, npcs, moveSpeed: 64, broadcast: () => {}, t1447ClaimIdx: () => G.ciBuild(rows, 's' + rows[0].vid + rows[0].cells.length), t1447Offer: () => 'q', t1447ChiefSay: () => { calls.chief++; },
      t1447Survey: () => ({ bld: 1, hits: 3 }), t1447Raze: () => { calls.raze++; return { razed: 1, hits: 3 }; }, t1447Unclaim: (pid, k) => ({ n: k.length }), t1447Loot: () => { calls.loot++; return { items: {}, value: 0, kg: 0 }; }, t1447Day: () => {} };
    const world = { day: 100 }, bodyExits = new Map();
    const V = mkVil(1, 200, 200, 8, opt.pop || 60, opt.founder);
    if (opt.food != null) V.econ.storage.food = opt.food;
    for (let i = 0; i < (opt.fighters == null ? 6 : opt.fighters); i++) { const pid = 'n' + i; players.set(pid, { pid, x: V.ccx * 32, y: V.ccy * 32, hp: 100, simJob: 'warrior' }); npcs.add(pid); V.npcPids.push(pid); }
    SV.__t1447.setup({ deps, villages: [V], byDbId: new Map([[1, V]]), byEcon: new Map([[V.econ, V]]), econV2: fakeE2, ta: { isBlocked: () => false, fert: () => 0.5, isWater: () => false }, world, zoneId: 't', warCore: W, bodyExits, dayMs: 1000 });
    deps.moveSpeed = 1; deps.moveSpeed = 64 / SV.__t1447.ppd();
    SV.__t1447.jobs.length = 0;
    //   막힌 칸 — 땅 장부를 바로 채운다(②a 가 센 길과 같은 칸 · 같은 장부 문)
    { let n = 0; for (const [x, y] of sq(209, 199, 3)) if (!(x === 210 && y === 200) && n < (opt.landN == null ? 8 : opt.landN)) { G.landAdd(V.econ, 'pX', x + ',' + y, 90); n++; } }   // 막힌 칸(명분 = 5 이상)
    if (opt.harm) G.harmAdd(V.econ, 'pX', opt.harm);
    if (opt.cool) G.landOf(V.econ, 'pX').raid = 95;
    if (opt.big) for (let i = 0; i < 30000; i++) V._terrSet.add((5000 + (i % 200)) + ',' + (5000 + Math.floor(i / 200)));   // 영토가 넓힘 목표보다 크다(땅이 안 모자람 — 먼 땅 3만 칸)
    const advance = () => { for (const r of bodyExits.values()) if (r.ppd != null) r.L = Math.min(r.len, Math.max(0, (world.day - r.d0) * r.ppd)); };
    let go = null;
    for (let i = 0; i < (opt.days || 1); i++) {
      world.day++; advance();
      if (opt.joinOn === i) rows[0].vid = 1;   // 가는 사이 주인이 그 마을에 들었다
      SV.__t1447.day(world.day * 1000);
      const J = SV.__t1447.jobs[0]; if (J && !go) go = world.day;
    }
    const J = SV.__t1447.jobs[0];
    const P = SV.t1447Plan(V, 'pX');
    return { go: !!J, why: P.why, casus: P.casus, plan: { fighters: P.fighters, feAfter: P.feAfter, labor: P.labor, short: P.short }, st: J ? J.st : null, abort: J ? J.abort || null : null, raze: calls.raze, chief: calls.chief, loot: calls.loot,
      chiefTry: opt.founder ? SV.t1447ChiefRaid(1, 'pX', false) : null, chiefGo: opt.founder && opt.chiefGo ? SV.t1447ChiefRaid(1, 'pX', true) : null };
  };
  out.base = run({});
  out.food = run({ food: 10 });
  out.fight = run({ fighters: 2 });
  out.cool = run({ cool: true });
  out.need = run({ big: true });
  out.harmOnly = run({ landN: 2, harm: 0.9 });   // 막힌 칸 2(명분 5 밑) + 해코지 원한 0.9
  out.landOnly = run({ days: 30 });   // 땅 명분만(해코지 0) — 닿아도 짐 0
  out.join = run({ days: 30, joinOn: 3 });
  out.chief = run({ founder: 'chiefP', days: 3 });
  out.chiefNo = run({ founder: 'chiefP', landN: 2, harm: 0.9, chiefGo: true });
  out.chiefOk = run({ founder: 'chiefP', chiefGo: true });
  process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
}

// ── ㉰ 존 아이 ───────────────────────────────────────────────────────────────
function zoneChild(bait, mode) {
  const TMP = require('./lib-tmp').file('t1447z', '.db');   // [T1400] 제 DB 는 판 끝에 지운다
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(39860)), DB_PATH: TMP,
    ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', T1065_TOOL_GATE: '0' });
  if (mode === 'zoff') delete process.env.T1447_PERSON_GRUDGE; else process.env.T1447_PERSON_GRUDGE = '1';
  process.env.T1447_VALUE = 'shadow';
  baitHook(bait);
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  process.on('uncaughtException', (e) => { process.stdout.write('@@' + JSON.stringify({ err: String(e && e.stack).slice(0, 900) }) + '\n'); process.exit(4); });
  const Zone = require(ZFILE);
  console.log = _log;
  const H = Zone.__testBind(), BS = H.BUILDING_SIZE, G = H.Grudge, SV = H.SimVillages, out = { on: H.T1447_PERSON_GRUDGE };
  const notes = [];
  const mkP = (id, cx, cy, inv) => ({ pid: 'p_' + id, playerId: id, name: id, ws: { readyState: 1, send: (s) => { try { const m = JSON.parse(s); m._to = id; notes.push(m); } catch (e) {} } },
    x: cx * BS + BS / 2, y: cy * BS + BS / 2, floor: 0, inventory: Object.assign({}, inv || {}), vp: 0, hunger: 100, thirst: 100, hp: 100, toolItems: [], tribeId: null, isDown: false, member: null });
  const noteOf = (id) => notes.filter((m) => m.type === 'notice' && m._to === id).map((m) => m.text);
  //   꾸민 마을 둘(영토 네모 41×41) · 마을 몸 하나씩(V1 가운데)
  const mkVil = (dbId, ccx, ccy, founder) => { const T = new Set(); for (let dy = -20; dy <= 20; dy++) for (let dx = -20; dx <= 20; dx++) T.add((ccx + dx) + ',' + (ccy + dy));
    return { dbId, name: '시험' + dbId, ccx, ccy, _terrSet: T, npcPids: [], econ: { name: '시험' + dbId, land: { size: 300 }, housing: 30, npcs: Array.from({ length: 30 }, (_, i) => ({ id: i })), storage: { food: 900 }, founder: founder || null } }; };
  const V1 = mkVil(1, 1000, 1000), V2 = mkVil(2, 1300, 1000), V3 = mkVil(3, 1000, 1300, 'chiefC');
  const world = { day: 100 };
  SV.__t1447.setup({ villages: [V1, V2, V3], byDbId: new Map([[1, V1], [2, V2], [3, V3]]), byEcon: new Map([[V1.econ, V1], [V2.econ, V2], [V3.econ, V3]]), econV2: fakeE2, world, zoneId: 'hanbando', warCore: W,
    deps: { players: H.players, npcs: H.npcs, t1447ClaimIdx: () => H._t1447ClaimIdx(), t1447Survey: (p, c) => H._t1447Survey(p, c), t1447Offer: (p, v) => H._t1447Offer(p, v), t1447ChiefSay: (v, t) => H._t1447ChiefSay(v, t) } });
  const body = { pid: 'npc_v1', playerId: null, name: '주민', x: 1000 * BS, y: 1000 * BS, hp: 100, isNpc: true, simVillageId: 1, floor: 0 };
  H.players.set(body.pid, body); H.npcs.add(body.pid);
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  if (mode === 'zoff') {   // ㉱ 끔
    const P = mkP('offP', 1005, 1005); H.players.set(P.pid, P);
    const pen = H._t1238StealCheck(P, 1005, 1005);
    out.off = { idx: H._t1447ClaimIdx(), pen: { vp: pen.vp, kind: pen.kind, g: !!pen.t1447 }, grudge: !!V1.econ._grudge };
    process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
  }
  // ③a 길 막기 — 소식이 닿은 V1 만 · 벌점 0 · 주인 없는 땅의 것 ½ · 접속 안 한 주인
  const A = mkP('pA', 1500, 1500); H.players.set(A.pid, A);
  const h1 = H._t1447Hostile('pA', 'pA', 1, true);
  out.a = { h1, g1: r4(G.harmOf(V1.econ, 'pA')), g2: r4(G.harmOf(V2.econ, 'pA')), vp: A.vp, note: noteOf('pA').length };
  H._t1447Hostile('pB', 'pB', 1, false);   // 접속 안 한 사람 · 주인 없는 땅의 것
  out.a.free = r4(G.harmOf(V1.econ, 'pB')); out.a.queued = !!H._t1447Owe.get('pB');
  const B = mkP('pB', 1500, 1500); H.players.set(B.pid, B); H._t1447Collect(B);
  out.a.collected = noteOf('pB').length; out.a.oweAfter = !!H._t1447Owe.get('pB');
  // ③b 마을 땅에서 거두기 — 본 몸(V1 가운데 몸 · AOI 안) · 안 본 몸(V1 귀퉁이 밖 — 몸에서 AOI 밖)
  const C = mkP('pC', 1003, 1003); H.players.set(C.pid, C);
  const gs = H._t1447LandTake(C, C.x, C.y, { wood: 3 }, 'gather');
  const C2 = mkP('pC2', 1019, 1019); H.players.set(C2.pid, C2);
  const body2far = Math.hypot(C2.x - body.x, C2.y - body.y);
  const gu = H._t1447LandTake(C2, C2.x, C2.y, { wood: 3 }, 'gather');
  out.b = { seen: r4(gs), unseen: r4(gu), far: Math.round(body2far), unit: SV.t1447Unit(V1), harmC: r4(G.harmOf(V1.econ, 'pC')), harmC2: r4(G.harmOf(V1.econ, 'pC2')), wild: r4(H._t1447LandTake(C, 2000 * BS, 2000 * BS, { wood: 3 }, 'gather')) };
  // ③c 마을 밭 작물 — 벌점 0 · 원한(값)
  const pen = H._t1238StealCheck(C, 1002, 1002);
  const vp0 = C.vp; H._t1238StealApply(C, pen, { wheat: 4 });
  out.c = { vp: pen.vp, kind: pen.kind, g: !!pen.t1447, vpAfter: C.vp - vp0, harmC: r4(G.harmOf(V1.econ, 'pC')) };
  // ③d 마을 벽을 친다(NPC 마을 행 `npc_simvil_1`)
  const wall = H._liveBuildRow('wall', 1001 * BS, 1001 * BS, { floor: 0, side: 'N' }, 'npc_simvil_1', '시험1');
  const hb0 = G.harmOf(V1.econ, 'pC');
  H._t1447BldHit(C, wall, 10, 80);
  out.d = { vil: !!H._t1447VilOfB(wall), dg: r4(G.harmOf(V1.econ, 'pC') - hb0), raw: H._t1447Raw('item_wall', 1) };
  // ③e 문 — pD 해코지 원한 문턱 위 · pE 땅 원한만 · pF 해코지 원한 문턱 밑 + 땅 원한
  const D = mkP('pD', 1500, 1500), E = mkP('pE', 1500, 1500), F = mkP('pF', 1500, 1500); for (const p of [D, E, F]) H.players.set(p.pid, p);
  G.harmAdd(V1.econ, 'pD', 0.5);
  for (const [pid, y] of [['pE', 1000], ['pF', 1001]]) { const id = `ec_${pid}`; H.claims.set(id, { id, ownerPid: pid, ownerName: pid, x: 979 * BS, y: y * BS, w: BS, h: BS, kind: 'personal', state: 'active', createdAt: 0 }); }   // V1 서쪽 바깥 한 칸씩(막힌 칸이 지금도 그 사유지 칸)
  H._t1447ClaimIdx();
  G.landAdd(V1.econ, 'pE', '979,1000', 100);
  G.harmAdd(V1.econ, 'pF', 0.2); G.landAdd(V1.econ, 'pF', '979,1001', 100);
  const landE0 = G.landCount(V1.econ, 'pE');
  const jD = H.Membership.seatByInvite(D, 1), jE = H.Membership.seatByInvite(E, 1), jF = H.Membership.seatByInvite(F, 1);
  out.e = { landE0, trade: !!H._t1447TradeErr(D, 1), tradeE: !!H._t1447TradeErr(E, 1), joinD: jD.ok, joinE: jE.ok, joinF: jF.ok, landE: !!G.landOf(V1.econ, 'pE'), landF: !!G.landOf(V1.econ, 'pF'), harmF: r4(G.harmOf(V1.econ, 'pF')), errD: jD.err || null };
  // ③f 추방 — 그 마을 사람이 문턱을 넘는다(길 막기 일곱 번)
  const M = mkP('pM', 1500, 1500); M.member = { zone: 'hanbando', vid: 1, name: '시험1', since: 90 }; H.players.set(M.pid, M);
  const seq = []; for (let i = 0; i < 7; i++) { H._t1447Hostile('pM', 'pM', 1, true); seq.push(!!M.member); }
  out.f = { seq, harm: r4(G.harmOf(V1.econ, 'pM')), cool: Number(M.memberCool) > 0 };
  // ③g 권유 — 그 자리 아닐 때 미룸 · 그 마을 땅에 오면 한 번
  const O = mkP('pO', 1500, 1500); H.players.set(O.pid, O);
  const r1 = H._t1447Offer('pO', 1);
  const before = O._memberOfferVid;
  O.x = 1010 * BS; O.y = 1010 * BS; H._t1447OfferTick();
  const after = O._memberOfferVid, n1 = noteOf('pO').length;
  H._t1447Offer('pO', 1); H._t1447OfferTick();
  out.g = { r1, before: before == null ? null : before, after, n1, n2: noteOf('pO').length };
  // ③h 토벌 손 — pT 사유지 3×3(V1 동쪽 바깥) · 울타리 · 상자(짐) 하나씩 · 땅에 돌 · 살피기 · 부숨 · 풂 · 짐
  const cells = []; for (let y = 999; y < 1002; y++) for (let x = 1021; x < 1024; x++) { const id = `tc_${x}_${y}`; H.claims.set(id, { id, ownerPid: 'pT', ownerName: 'pT', x: x * BS, y: y * BS, w: BS, h: BS, kind: 'personal', state: 'active', createdAt: 0 }); cells.push(x + ',' + y); }
  const f1 = H._liveBuildRow('fence', 1021 * BS + BS / 2, 999 * BS + BS / 2, { floor: 0 }, 'pT', 'pT');
  const ch = H._liveBuildRow('chest', 1022 * BS + BS / 2, 1000 * BS + BS / 2, { floor: 0, wood: 40, stone: 10 }, 'pT', 'pT');
  const sv = H._t1447Survey('pT', cells);
  const bodies = [{ pid: 'b1', x: 0, y: 0, inventory: {} }, { pid: 'b2', x: 0, y: 0, inventory: {} }];
  const rz = H._t1447Raze('pT', cells, '시험1', bodies);
  const left = [...H.buildings.values()].filter((b) => b.ownerId === 'pT').length;
  const pick = G.unclaimPick(cells, V1._terrSet, V1.ccx, V1.ccy);
  const uc = H._t1447Unclaim('pT', pick);
  const leftClaims = [...H.claims.values()].filter((c) => c.ownerPid === 'pT').length;
  const gi0 = [...H.groundItems.values()].filter((g) => cells.includes(Math.floor(g.x / BS) + ',' + Math.floor(g.y / BS))).map((g) => [g.item, g.count]);
  const lt = H._t1447Loot('pT', cells, V1, 25, bodies);   // 값 상한 25(나무 1 · 돌 0.5) · 무게 상한 몸 둘
  out.h = { sv, rz, left, pick, uc, leftClaims, gi0, loot: lt };
  // ③i 플레이어 마을 촌장 알림 — 접속 안 했어도 들어오면 받는다
  SV.__t1447.blocked(V3, new Map(), new Map([['1021,1300', [10, { pid: 'pZ', name: 'pZ', vid: null }]]]), 1);
  const CH = mkP('chiefC', 1000, 1300); H.players.set(CH.pid, CH); H._t1447Collect(CH);
  out.i = { notes: noteOf('chiefC') };
  process.stdout.write('@@' + JSON.stringify(out) + '\n'); process.exit(0);
}

if (process.argv[2] === '--vil') vilChild(process.argv[3], process.argv[4]);
else if (process.argv[2] === '--vil2') vilChild2(process.argv[3]);
else if (process.argv[2] === '--zone') zoneChild(process.argv[3], process.argv[4]);
else main();

function run(kind, bait, mode) {
  const r = spawnSync(process.execPath, [__filename, '--' + kind, bait || '-', mode || '-'], { encoding: 'utf8', timeout: 240000, maxBuffer: 64 * 1024 * 1024, env: Object.assign({}, process.env) });
  const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return { err: `아이 출력 없음(rc ${r.status}) ${String(r.stderr || '').slice(-600)}` };
  return JSON.parse(line.slice(2));
}
function main() {
  let pass = 0, fail = 0;
  const ok = (c, name, detail) => { if (c) { pass++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); } else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); } };
  let G = null; try { G = require(GFILE); } catch (e) { G = null; }   // 옛 코드(이 카드 전)엔 `server/grudge.js` 가 없다 — 셈 줄이 다 ✗ 로 선다(크래시 대신 빨강)
  console.log('[㉮ 셈 — grudge.js]');
  if (!G) { for (const n of ['①a', '①b', '①c', '①d', '①e', '①f']) ok(false, `${n} 셈`, 'server/grudge.js 없음'); }
  else {
  {
    const e = { name: '마을' }, k = G.pkey('홍길동');
    G.harmAdd(e, '홍길동', 0.3);
    const back = JSON.parse(JSON.stringify(e));
    ok(k.charCodeAt(0) === 1 && G.isPKey(k) && !G.isPKey('농촌9') && G.pidOf(k) === '홍길동' && Math.abs(G.harmOf(back, '홍길동') - 0.3) < 1e-12 && Object.keys(back._grudge).length === 1,
      '①a 사람 열쇠 — 머리 U+0001(사람이 적는 마을 이름에 안 선다) · econ JSON 왕복 그대로', JSON.stringify(Object.keys(back._grudge)));
  }
  {
    const e = {}; const seq = []; for (let i = 0; i < 7; i++) { G.harmAdd(e, 'p', G.BLOCK_G); seq.push(+G.harmOf(e, 'p').toFixed(3)); }
    ok(Math.abs(G.BLOCK_G - 8 / 50 * 0.45) < 1e-12 && G.TH === W.WAR_GRUDGE_BLOCK_TH && seq[5] < G.TH && seq[6] >= G.TH && G.FREE_MUL === 0.5,
      '①b 길 막기 한 번 = 8 ÷ 50 × 0.45 = 0.072 · 여섯 번 문턱 밑 · 일곱 번째에 문턱(종전 벌점 50 = 일곱 번) · 주인 없는 땅 ½', seq.join(' → '));
  }
  {
    const all = [['a', 5, null], ['b', 4, { pid: 'x' }], ['c', 4, null], ['d', 3, { pid: 'x' }], ['e', 2, null]];
    const B = G.pickBlocked(all, 3), B2 = G.pickBlocked(all, 10);
    ok(B.length === 1 && B[0][0] === 'b' && B2.length === 2, '①c 막힌 칸 = 그날 위 want 칸(사유지도 같은 값 · 같은 차례로 줄 세움) 가운데 사유지 칸', JSON.stringify(B.map((x) => x[0])) + ' · want 10 → ' + B2.length);
  }
  {
    const cells = []; for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push([x, y]);
    const big = []; for (let y = 10; y < 22; y++) for (let x = 0; x < 12; x++) big.push([x, y]);
    G.ciBuild([{ cid: 1, pid: 's', kind: 'personal', state: 'active', cells }, { cid: 2, pid: 'b', kind: 'personal', state: 'active', cells: big }], 'u1');
    const e = {};
    for (const k of ['0,0', '1,0', '2,0', '0,1']) G.landAdd(e, 's', k, 1);
    const c4 = G.casus(e, 's'); G.landAdd(e, 's', '2,1', 2); const c5 = G.casus(e, 's');
    for (let i = 0; i < 12; i++) G.landAdd(e, 'b', i + ',10', 3); for (let i = 0; i < 12; i++) G.landAdd(e, 'b', i + ',21', 3); for (let i = 0; i < 5; i++) G.landAdd(e, 'b', '0,' + (11 + i), 3);
    const cb = G.casus(e, 'b'); G.landAdd(e, 'b', '0,16', 3); const cb2 = G.casus(e, 'b');
    G.ciBuild([{ cid: 1, pid: 's', kind: 'personal', state: 'active', cells: cells.slice(3) }], 'u2');   // 앞줄 셋을 내놓았다 — 센 칸 가운데 지금도 그 사유지 칸인 것만
    const cr = G.casus(e, 's');
    ok(!c4.ok && c4.need === 5 && c5.ok && cb.need === 30 && !cb.ok && cb.n === 29 && cb2.ok && cr.n === 2 && !cr.ok,
      '①d 명분 = 막힌 칸 ≥ min(⌈사유지 ½⌉, N 30) — 9칸 = 5 · 144칸 = 30 · 내놓은 칸은 안 센다', `9칸 4→${c4.ok} 5→${c5.ok} · 144칸 29→${cb.ok} 30→${cb2.ok} · 내놓은 뒤 ${cr.n}`);
  }
  {
    const cells = []; for (let y = 0; y < 4; y++) for (let x = 10; x < 14; x++) cells.push(x + ',' + y);
    const terr = new Set(); for (let y = -5; y < 10; y++) for (let x = -5; x < 9; x++) terr.add(x + ',' + y);
    const p1 = G.unclaimPick(cells, terr, 0, 0), p2 = G.unclaimPick(cells.slice().reverse(), terr, 0, 0), one = G.unclaimPick(['30,30'], terr, 0, 0);
    ok(p1.length === 5 && p1.every((k) => k.startsWith('10,') || k === '11,0') && JSON.stringify(p1) === JSON.stringify(p2) && one.length === 1,
      '①e 토벌 뒤 푸는 칸 = 마을 영토에 가까운 칸부터 ⌈30 %⌉(16칸 → 5) · 넣은 차례와 무관(결정론) · 한 칸 사유지도 한 칸', JSON.stringify(p1));
  }
  {
    const e = {}; G.harmAdd(e, 'p', G.gOfValue(30, 60)); const a = G.harmOf(e, 'p'); const paid = G.harmPay(e, 'p', G.gOfValue(20, 60)); const b = G.harmOf(e, 'p'); G.harmPay(e, 'p', 1);
    ok(Math.abs(a - 0.5) < 1e-12 && Math.abs(paid - 1 / 3) < 1e-9 && Math.abs(b - 1 / 6) < 1e-9 && !(e._grudge && Object.keys(e._grudge).length),
      '①f 해코지 원한 = 값 ÷ 원한 1 의 값(30 ÷ 60 = 0.5) · 갚기 = 같은 식(20 ÷ 60) · 다 갚으면 칸이 없다', `${a} → ${b.toFixed(4)}`);
  }

  }
  console.log('\n[㉯ 마을 — 넓힘 · 막힌 칸 · 권유 · 토벌]');
  const v = run('vil');
  if (v.err) ok(false, '②a ~ ②c 마을 아이', v.err);
  else {
    const tr = v.a.trace, first = tr.find((t) => t[2] > 0);
    const pre = tr.filter((t) => t[4] === '-' || t[4] === 'go');
    ok(v.on && pre.length > 1 && pre.every((t) => t[1] === 0) && first && v.a.offer.length === 1 && v.a.offer[0][0] === 'pA' && pre.every((t, i) => i === 0 || t[2] >= pre[i - 1][2]),
      '②a 소속 아닌 사람 사유지 칸은 못 가진다 · 막힌 칸을 센다(한 칸 한 번 · 늘기만) · 처음 막힌 날 가입 권유 한 번', `첫 막힘 날 ${first ? first[0] : '-'} · 권유 ${JSON.stringify(v.a.offer)} · 날별 ${JSON.stringify(tr.slice(0, 6))}`);
    ok(v.a.takenM > 0 && !v.a.landM, '②b 그 마을 사람 사유지는 덮는다(가진 칸 > 0 · 막힌 칸 0)', `덮은 칸 ${v.a.takenM}`);
    const c = v.c, c2 = v.c2;
    const atHome = v.a.trace.find((t) => t[4] === 'home');
    const need = c ? Math.ceil(Math.max(...c.len) / c.ppd) : 0;
    ok(!!c && c.st === 'done' && need >= 2 && c.arrive >= need && c2.raze.length === 1 && c2.unclaim.length === 1 && c2.unclaim[0][1].length === 3 && atHome && atHome[2] === 0 && c2.landAfter && c2.landAfter.raid &&
      c2.loot.length === 1 && Math.abs(c2.loot[0][1] - 0.2 * c2.unit) < 1e-6 && c.home > c.arrive && c2.wood === 55 && Math.abs(c2.harmAfter - (0.2 - 5 / c2.unit)) < 1e-4,
      '②c 토벌 — 몸이 걸어간다(닿는 날 ≥ 가는 날) · 부숨 · 가까운 쪽 3칸 풂 · 땅 원한 0 · 짐 값 상한 = 해코지 원한 × 원한 1 의 값 · 집에 와서야 곳간(나무 50 → 55) · 그 값만큼 풂',
      c ? `나섬 ${c.d0}날 · 닿음 +${c.arrive}(걸음 ${Math.max(...c.len)}px ÷ 하루 ${c.ppd}px = ${need}날 · 결단 어림 ${c.walkDays}) · 집 +${c.home} · 부숨 ${c.razed} · 풂 ${c.unclaimed} · 닿은 날 땅 원한 ${atHome ? atHome[2] : '-'} · 짐 상한 ${c2.loot.length ? c2.loot[0][1] : '-'} · 원한 0.2 → ${c2.harmAfter} · 곳간 나무 ${c2.wood}` : JSON.stringify(c2));
  }
  const v2 = run('vil2');
  if (v2.err) ok(false, '②d ~ ②g 마을 아이 둘', v2.err);
  else {
    ok(v2.base.go && !v2.food.go && v2.food.why === 'food' && !v2.fight.go && v2.fight.why === 'noFight' && !v2.cool.go && v2.cool.why === 'cool' && !v2.need.go && v2.need.why === 'noNeed',
      '②d 비용을 따진다 — 먹을 것(나선 뒤 한 사람 식량 < 18날) · 몸(전사 · 사냥꾼 < 3) · 쿨(40날) · 땅이 안 모자람 → 안 간다', `기본 ${v2.base.go} · 먹을 것 ${v2.food.why}(${v2.food.plan.feAfter}) · 몸 ${v2.fight.why} · 쿨 ${v2.cool.why} · 땅 ${v2.need.why}(${v2.need.plan.short})`);
    ok(!v2.harmOnly.go && !v2.harmOnly.casus && v2.landOnly.go && v2.landOnly.raze === 1 && v2.landOnly.loot === 0, '②e 해코지 원한만(0.9 · 막힌 칸 2 < 5)으로는 명분이 없다 — 토벌 0 · 땅 명분만이면 가되 짐은 안 가져간다', `해코지만 명분 ${v2.harmOnly.casus} · 땅만 부숨 ${v2.landOnly.raze} 짐 ${v2.landOnly.loot}`);
    ok(v2.join.go && v2.join.abort === 'joined' && v2.join.raze === 0, '②f 가는 사이 주인이 그 마을에 들면 닿은 날 다시 센다 — 치지 않고 돌아간다', `${v2.join.st} · ${v2.join.abort} · 부숨 ${v2.join.raze}`);
    ok(!v2.chief.go && v2.chief.chiefTry && v2.chief.chiefTry.ok && v2.chiefNo.chiefGo && !v2.chiefNo.chiefGo.ok && v2.chiefOk.chiefGo && v2.chiefOk.chiefGo.ok,
      '②g 플레이어 마을은 저절로 안 간다 · 촌장 단추는 명분이 선 상대에게만(서버 술어 — 명분 없으면 거절)', `저절로 ${v2.chief.go} · 명분 있음 ${v2.chief.chiefTry && v2.chief.chiefTry.ok} · 해코지만 → ${v2.chiefNo.chiefGo && v2.chiefNo.chiefGo.err}`);
  }

  console.log('\n[㉰ 존 — 쌓는 자리 · 문 · 추방 · 권유 · 토벌 손]');
  const z = run('zone');
  if (z.err) ok(false, '③ 존 아이', z.err);
  else {
    ok(z.on && z.a.g1 === 0.072 && z.a.g2 === 0 && z.a.vp === 0 && z.a.note === 1 && z.a.free === 0.036 && z.a.queued && z.a.collected === 1 && !z.a.oweAfter,
      '③a 길 막기 → 소식이 닿은 마을만 해코지 원한(0.072 · 이웃 0) · 벌점 0 · 주인 없는 땅의 것 ½(0.036) · 접속 안 한 주인은 들어올 때 한 줄', JSON.stringify(z.a));
    ok(z.b.seen > 0 && Math.abs(z.b.seen - 3 / z.b.unit) < 1e-4 && z.b.unseen === 0 && z.b.harmC2 === 0 && z.b.wild === 0,
      '③b 마을 땅에서 거두기 — 그 마을 몸이 보면(AOI 안) 값 ÷ 원한 1 의 값 · 안 보면 0 · 마을 땅 밖 0', `본 ${z.b.seen} · 안 본 ${z.b.unseen}(몸에서 ${z.b.far}px) · 밖 ${z.b.wild}`);
    ok(z.c.vp === 0 && z.c.kind === 'terr' && z.c.g && z.c.vpAfter === 0 && z.c.harmC > z.b.harmC, '③c 마을 밭 작물 — 벌점 0 · 원한이 오른다', JSON.stringify(z.c));
    ok(z.d.vil && z.d.dg > 0 && Math.abs(z.d.dg - (1 * 10 / 80) / z.b.unit) < 1e-4, '③d 마을 벽을 치면 깎은 몫(10/80)의 값(판자 2 = 통나무 1)만큼', JSON.stringify(z.d));
    ok(z.e.landE0 === 1 && z.e.trade && !z.e.tradeE && !z.e.joinD && z.e.joinE && z.e.joinF && !z.e.landE && !z.e.landF && z.e.harmF === 0.2,
      '③e 문 — 해코지 원한 ≥ 0.45 면 거래 · 가입 거절 · 땅 원한만이면 받는다 · 들면 땅 원한 지움 · 해코지 원한은 남는다', JSON.stringify(z.e));
    ok(z.f.seq.slice(0, 6).every(Boolean) && !z.f.seq[6] && z.f.cool, '③f 그 마을 사람이 문턱을 넘는 순간 추방(일곱 번째) · 다시 들기 기다림', JSON.stringify(z.f));
    ok(z.g.r1 === 'queued' && z.g.before === null && z.g.after === 1 && z.g.n1 === 1 && z.g.n2 === 1, '③g 권유 — 그 자리가 아니면 미룸 · 그 마을 땅에 오면 한 번 · 다시 안 권한다', JSON.stringify(z.g));
    const L = z.h.loot;
    ok(z.h.sv.bld === 2 && z.h.rz.razed === 2 && z.h.left === 0 && z.h.uc.n === 3 && z.h.leftClaims === 6 && z.h.gi0.length >= 2 && L.value <= 25 + 1 && L.kg <= L.kgCap + 1e-9 && L.value > 0,
      '③h 토벌 손 — 건물 전부 부숨 · 상자 짐은 바닥 · 고른 3칸만 풂 · 짐은 값(25) · 무게(몸 둘) 상한 안', `살핌 ${JSON.stringify(z.h.sv)} · 남은 건물 ${z.h.left} · 남은 칸 ${z.h.leftClaims} · 바닥 ${JSON.stringify(z.h.gi0)} · 짐 ${JSON.stringify(L.items)} 값 ${L.value} kg ${L.kg}/${L.kgCap}`);
    ok(z.i.notes.length === 1 && /막고 있습니다/.test(z.i.notes[0]), '③i 플레이어 마을 — 주민이 촌장에게 알린다(접속 안 했어도 들어오면 받는다)', JSON.stringify(z.i.notes));
  }

  console.log('\n[㉱ 끔]');
  const zo = run('zone', '-', 'zoff'), vo = run('vil', '-', 'voff');
  ok(!zo.err && !vo.err && zo.off.idx === null && zo.off.pen.vp === 3 && !zo.off.pen.g && !zo.off.grudge && vo.off.takenA > 0 && !vo.off.land,
    '④ 손잡이 끔 — 사유지 칸 표 0 · 마을 작물 벌점 3(종전) · 넓힘은 사유지를 덮는다(종전) · 장부 0', zo.err || vo.err || JSON.stringify({ z: zo.off, v: vo.off }));

  console.log('\n[미끼 스물둘 — 사본마다 자리 꼭 한 번 · 빨강 줄]');
  const B = (name, kind, mode, red) => {   // 미끼 사본 한 판 — { n: 바꾼 자리 수, red: 빨강 줄이 섰나, why }
    const r = run(kind, name, mode);
    const n = (() => { const b = BAITS[name], src = require('fs').readFileSync(b.file, 'utf8'); return LB.count(src, b.at[0]); })();
    let isRed = false, why = '';
    try { isRed = !r.err && !r.baitErr && red(r); why = r.err || r.baitErr || ''; } catch (e) { why = e.message; }
    return { n, red: n === 1 && isRed, why: why ? ' · ' + String(why).slice(0, 200) : '' };
  };
  let b;
  b = B('far', 'zone', '-', (r) => r.a.g2 > 0); ok(b.red, '미끼 소식이 안 닿은 마을도 아는 사본 → ③a 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('both', 'zone', '-', (r) => r.a.vp > 0); ok(b.red, '미끼 벌점과 원한에 둘 다 쌓이는 사본 → ③a 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('zone', 'zone', '-', (r) => r.a.g1 === 0); ok(b.red, '미끼 장부가 몸 쪽(존을 넘으면 · 다시 뜨면 사라지는) 사본 → ③a 빨강(마을 장부 0)', `바꾼 자리 ${b.n}${b.why}`);
  b = B('member', 'vil', '-', (r) => r.a.takenM === 0 || r.a.landM); ok(b.red, '미끼 제 마을 사람 사유지에 막힌 칸이 쌓이는 사본 → ②b 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('teleport', 'vil', '-', (r) => r.c && r.c.arrive < Math.ceil(Math.max(...r.c.len) / r.c.ppd)); ok(b.red, '미끼 토벌대가 그날 닿는(순간이동) 사본 → ②c 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('nocost', 'vil2', '-', (r) => r.food.go); ok(b.red, '미끼 비용을 안 따지고 가는 사본 → ②d 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('landjoin', 'zone', '-', (r) => !r.e.joinE); ok(b.red, '미끼 땅 원한이 가입을 막는 사본 → ③e 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('landstay', 'zone', '-', (r) => r.e.landE); ok(b.red, '미끼 들어온 뒤에도 땅 원한이 남는 사본 → ③e 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('harmclear', 'zone', '-', (r) => r.e.harmF !== 0.2); ok(b.red, '미끼 해코지 원한이 가입으로 지워지는 사본 → ③e 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('nooffer', 'vil', '-', (r) => r.a.offer.length === 0); ok(b.red, '미끼 권유 없이 바로 쌓이는 사본 → ②a 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('partial', 'zone', '-', (r) => r.h.left > 0); ok(b.red, '미끼 건물을 일부만 부수는 사본 → ③h 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('farside', 'vil', '-', (r) => { const u = r.c2.unclaim[0] && r.c2.unclaim[0][1]; return !u || !u.every((k) => k.startsWith('209,')); }); ok(b.red, '미끼 먼 쪽 칸을 푸는 사본 → ②c 빨강(가까운 열 209 가 아니다)', `바꾼 자리 ${b.n}${b.why}`);
  b = B('landloot', 'vil2', '-', (r) => r.landOnly.loot > 0); ok(b.red, '미끼 땅 원한만인데 짐을 가져가는 사본 → ②e 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('overcarry', 'zone', '-', (r) => r.h.loot.kg > r.h.loot.kgCap + 1e-9); ok(b.red, '미끼 토벌대가 질 수 있는 양보다 많이 가져가는 사본 → ③h 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('warp', 'vil', '-', (r) => r.c2.wood !== 55 || !(r.c2.harmAfter < 0.2)); ok(b.red, '미끼 가져간 짐이 곳간에 순간이동하는 사본 → ②c 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('landkeep', 'vil', '-', (r) => { const h = r.a.trace.find((t) => t[4] === 'home'); return !h || h[2] > 0; }); ok(b.red, '미끼 토벌 뒤에도 땅 원한이 남는 사본 → ②c 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('nocasus', 'vil2', '-', (r) => r.chiefNo.chiefGo && r.chiefNo.chiefGo.ok); ok(b.red, '미끼 명분 없는 상대에게 토벌이 나가는 사본(서버가 받는다) → ②g 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('nochief', 'vil2', '-', (r) => r.chief.go); ok(b.red, '미끼 플레이어 마을 주민이 촌장 없이 스스로 가는 사본 → ②g 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('harmraid', 'vil2', '-', (r) => r.harmOnly.go || r.harmOnly.casus); ok(b.red, '미끼 해코지 원한만으로 토벌이 나가는 사본 → ②e 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('chiefgone', 'zone', '-', (r) => r.i.notes.length === 0); ok(b.red, '미끼 촌장이 없는 동안 알림이 사라지는 사본 → ③i 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('freesame', 'zone', '-', (r) => r.a.free === 0.072); ok(b.red, '미끼 주인 없는 땅의 것에 사유지 위 것과 같은 크기로 쌓이는 사본 → ③a 빨강', `바꾼 자리 ${b.n}${b.why}`);
  b = B('nobuilder', 'zone', '-', (r) => r.a.free === 0); ok(b.red, '미끼 세운 사람을 못 찾아 원한이 0 인 사본 → ③a 빨강', `바꾼 자리 ${b.n}${b.why}`);
  console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
}
