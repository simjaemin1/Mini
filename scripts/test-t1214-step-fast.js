#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1214-step-fast.js — NPC 한 걸음마다 같은 답을 다시 짓는 셋을 같은 값으로 [T1214 µs 줄기] ===
//   잰다(손잡이 `T1214_STEP_FAST` — 끔 기본 · `'1'` 켬 · `'verify'` 대조(답은 종전) — 모듈 상수라 팔마다 아이 프로세스):
//   ① 짓기 크루 명부 — `_t1214CrewHas` = `_t435Crew` · `_t527Crew` 배열 + `some`(명부 차례 · 빠진 몸 · 같은 pid 두 번 · pid 가 다른 몸 ·
//      집터 · 곳간 터 · `T400_BUILD_ACT` 끔/켬) 전수 · `_t1181Task` 답(곳간 · 다리 크루 · 목표 · 키)이 끔 = 켬 = verify.
//   ② 실물 채석 바위 고르기 — 결정론 퍼즈(바위 목록: 거리 같음 · 같은 바위 두 번 · hp 0 · 바위 아님 · 전쟁 반경 · ∞ 좌표 · NaN 좌표) ×
//      닿음 모형(닿음 · 안 닿음 섞임 · 아직 — 멈춤) × 짐(빈 손 · 돌 가득) → `_physicalStoneWork` 답 · 몸 칸 · **존 문 부름 차례 전부**
//      (지형 · 벽 · 닿음 묻기 인자)가 끔 = 켬 = verify. 켬 차례(`_t1214RockOrder`) = 종전 안정 정렬 차례(바위 객체가 칸마다 같다).
//   ③ 짐 무게 표 — `weights.kgOf` · `fish-goods.bodyKg` 가 품목 전부(카탈로그 · 물고기 종 · 건어물 · 절임 · 광석 · 모르는 id · 빈 id)에서
//      끔 = 켬 = verify(`Object.is`) · `carry.npcTotalKg` 몸 짐 지문 같음 · 모듈 칸 = `require` 객체.
//   ④ verify 아이 — 셋 다 견줌 수 > 0 · 어긋남 0. 끔 아이 — 새 길 셈 0(새 길을 안 탄다).
//   ⑤ 미끼 — (가) 같은 거리에서 **뒤 차례**를 고르는 길 (나) 건너뜀 없이 앞 둘을 크루로 치는 길은 이 자의 퍼즈에서 종전과 갈린다(자가 문다).
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const enc = (x) => (typeof x === 'number' ? (Object.is(x, -0) ? '-0' : Number.isNaN(x) ? 'NaN' : x === Infinity ? 'Inf' : x === -Infinity ? '-Inf' : x) : x);
const H = (s) => require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 12);

if (process.argv[2] === '--child') {
  // 생산 셋 켬 판(실물 채석 길이 선다 — land1048 끔 기본 · 이 자는 그 길을 잰다) · 마을 부팅 0
  for (const k of ['T312_FISH_ACT', 'T325_WOOD_ACT', 'T347_FORAGE_ACT']) if (process.env[k] == null) process.env[k] = '1';
  process.env.ENABLE_VILLAGES = '0';
  const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  const V = require(path.join(ROOT, 'server', 'villages'));
  const W = require(path.join(ROOT, 'server', 'weights'));
  const FG = require(path.join(ROOT, 'server', 'fish-goods'));
  const C = require(path.join(ROOT, 'server', 'carry'));
  const api = V.__p3Bind({}), state = api.state, LP = V.__labProbe, P14 = LP._t1214Probe;
  const out = { mode: process.env.T1214_STEP_FAST || '', T400: E.T400_BUILD_ACT, crew: {}, task: [], rock: [], kg: null, body: null, bait: {} };
  const world = {}; E.bindProductionActs(world);

  // ── ① 크루 명부(다리 크루 문) — `_t1181Task` 답 · 다리 터 목록 셋(빈 목록 · 이 마을 터 · 남의 마을 터만) ──
  const crewFix = [];
  { const R = lcg(1214), tasks = []; let baitHit = 0;
    for (let t = 0; t < 3000; t++) {
      const k = Math.floor(R() * 9), pids = [], pl = new Map();
      for (let i = 0; i < k; i++) { const pid = 'c' + t + '_' + i; pids.push(pid); if (R() < 0.8) pl.set(pid, { pid: R() < 0.04 ? 'x' + i : pid, x: 100, y: 100, inventory: {} }); }
      if (k && R() < 0.2) pids.splice(Math.floor(R() * pids.length), 0, pids[Math.floor(R() * k)]);   // 같은 pid 두 번
      const vil = { name: 'v' + (t % 7), ccx: 5, ccy: 5, npcPids: pids, _site: R() < 0.5 ? { cx: 1 } : null, _granPend: R() < 0.5 ? { cx: 3, cy: 4, day: 9, mat: {} } : null, econ: { _world: world, storage: {}, treasury: {}, npcs: [] }, _granList: [] };
      const mode = t % 3;   // 0 빈 목록(한반도 기본) · 1 이 마을 터(끝난 터 섞임) · 2 남의 마을 터만
      const sites = mode === 0 ? [] : [{ i: 0, v: [mode === 1 ? vil.name : 'other'], span: 3, cells: [7, 7, 8, 7, 9, 7, 10, 8], stage: 0, mat: {}, done: R() < 0.2, day: null, adv: [], sum: null, added: null }];
      state.deps = { players: pl, isTerrainBlockedLocal: (x, y) => ((x * 7 + y * 13) % 5) === 0 };
      state._t527Sites = sites;
      for (const p of pl.values()) {
        const r = LP._t1181Probe.task(vil, p);
        tasks.push(r ? [r.kind, r.key, enc(r.target.x), enc(r.target.y)] : null);
        if (mode === 1 && r && r.kind === 'bridge') baitHit++;   // 미끼 (나) — 목록이 있어도 명부를 건너뛰는 문은 이 답을 놓친다
      }
      crewFix.push({ vil, pl, sites });
      state._t527Sites = null;
    }
    out.task = H(JSON.stringify(tasks)); out.taskN = tasks.length; out.taskHit = tasks.filter(Boolean).length;
    out.taskKinds = [...new Set(tasks.filter(Boolean).map((x) => x[0]))].sort(); out.bait.crewSkipAlways = baitHit; }

  // ── ② 바위 고르기 ──
  { const R = lcg(7121), fps = []; let orderN = 0, orderBad = 0, baitTie = 0, ties = 0; const kinds = { stop: 0, pick: 0, none: 0, full: 0 };
    for (let t = 0; t < 2400; t++) {
      const mode = t % 7;   // 0 닿음 · 1 안 닿음 섞임 · 2 아직(멈춤) · 3 NaN 바위 · 4 ∞ 바위 둘 · 5 돌 가득(짐 상한) · 6 몸 자리 NaN(설 자리 거리도 NaN)
      const vil = { name: 'rv' + t, ccx: 10, ccy: 10, npcPids: ['f' + t], _maxRPx: 800, _granList: [], econ: { _world: world, storage: { stone: 0 }, treasury: {}, npcs: new Array(6).fill({}), _warThreat: R() < 0.3 ? R() * 0.8 : 0 } };
      const npc = { pid: 'f' + t, simJob: 'forager', x: 336 + Math.floor(R() * 8) * 16, y: 336 + Math.floor(R() * 8) * 16, inventory: mode === 5 ? { stone: 6 } : {}, hp: 100, maxHp: 100 };
      const nx0 = npc.x;
      const rows = [], k = Math.floor(R() * 36);
      for (let i = 0; i < k; i++) {
        if (rows.length && R() < 0.08) { rows.push(rows[Math.floor(R() * rows.length)]); continue; }   // 같은 바위 두 번
        let x, y;
        if (R() < 0.55) { const a = Math.floor(R() * 8), d = (1 + Math.floor(R() * 6)) * 32, s = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]][a]; x = npc.x + s[0] * d; y = npc.y + s[1] * d; }   // 대칭 자리 — 거리 같음
        else { x = 16 + Math.floor(R() * 40) * 32; y = 16 + Math.floor(R() * 40) * 32; }
        rows.push({ id: 'r' + t + '_' + i, type: R() < 0.88 ? 'rock' : 'tree', hp: R() < 0.12 ? 0 : 1 + Math.floor(R() * 200), x, y });
      }
      if (mode === 3) rows.splice(Math.floor(R() * (rows.length + 1)), 0, { id: 'rN' + t, type: 'rock', hp: 9, x: NaN, y: npc.y });
      if (mode === 4) { rows.push({ id: 'rI' + t, type: 'rock', hp: 9, x: Infinity, y: 0 }); rows.splice(Math.floor(R() * (rows.length + 1)), 0, { id: 'rJ' + t, type: 'rock', hp: 9, x: 0, y: -Infinity }); }
      const calls = [];
      const blk = (x, y) => ((Math.floor(x / 32) * 31 + Math.floor(y / 32) * 17 + t) % (mode === 1 ? 3 : 11)) === 0;
      const reachable = (x, y) => (t & 1) ? ((Math.floor(x / 192) + Math.floor(y / 192) + t) % 3) !== 0 : ((Math.floor(x / 32) * 5 + Math.floor(y / 32) * 3 + t) % 4) !== 0;   // 구역째 안 닿음(바위 하나 곁 자리 전부) · 칸마다 섞임
      state.deps = {
        players: new Map([[npc.pid, npc]]), gatherRange: 40,
        isTerrainBlockedLocal: (x, y) => { calls.push(['t', x, y]); return blk(x, y); },
        isBlockedByWall: (x, y) => { calls.push(['w', x, y]); return ((x + y + t) % 97) === 0; },
        qtResources: () => ({ queryCircle: (cx, cy, Rr) => { calls.push(['q', cx, cy, Rr]); return rows; } }),
        npcCanReach: (ox, oy, x, y) => { calls.push(['r', ox, oy, x, y]); return mode === 1 ? reachable(x, y) : true; },
        ...(mode === 2 ? { npcReachBegin: (x, y) => ({ done: false, ax: x, ay: y }), npcReachStep: () => { calls.push(['s']); return false; }, collGenAround: () => 1, npcReachHas: () => true } : {}),
      };
      // 켬 차례 = 종전 안정 정렬 차례(제품 거르개 그대로 거른 목록에서)
      { const out0 = Math.max(0, 1 - (vil.econ._warThreat || 0)), R0 = Math.max(vil._maxRPx || 800, 800) + 400, lim = out0 >= 1 ? null : R0 * out0, cx = vil.ccx * 32 + 16, cy = vil.ccy * 32 + 16;
        const rocks = rows.filter((r) => r.type === 'rock' && r.hp > 0 && (lim == null || Math.hypot(r.x - cx, r.y - cy) <= lim));
        const ord = P14.order(rocks, npc);
        if (ord) {
          const old = rocks.slice().sort((a, b) => Math.hypot(a.x - npc.x, a.y - npc.y) - Math.hypot(b.x - npc.x, b.y - npc.y));
          orderN++; if (ord.length !== old.length || ord.some((i, j) => rocks[i] !== old[j])) orderBad++;
          // 미끼 (가) — 같은 거리에서 뒤 차례
          const dd = rocks.map((a) => Math.hypot(a.x - npc.x, a.y - npc.y));
          const late = rocks.map((_, i) => i).sort((a, b) => (dd[a] - dd[b]) || (b - a));
          if (new Set(dd).size < dd.length) ties++;
          if (late.some((i, j) => rocks[i] !== old[j])) baitTie++;
        }
      }
      if (mode === 6) npc.x = NaN;   // 바위 차례 · 설 자리 차례 둘 다 NaN → 종전 길
      const ret = LP._t1146Probe.stoneWork(vil, npc, 100000 + t, 0.3, 0.7, 3);
      const fp = [enc(ret), npc.behavior || null, enc(npc.targetX), enc(npc.targetY), npc.gatherTarget || null, enc(npc._jobT), npc._t720 ? npc._t720.k : null, H(JSON.stringify(calls.map((c) => c.map(enc))))];
      fps.push(fp);
      if (mode === 2 && ret === true && !npc.gatherTarget) kinds.stop++; else if (npc.gatherTarget) kinds.pick++; else if (mode === 5 && npc._t720) kinds.full++; else kinds.none++;
    }
    out.rock = H(JSON.stringify(fps)); out.rockN = fps.length; out.rockKinds = kinds; out.order = { n: orderN, bad: orderBad, ties }; out.bait.rockLateTie = baitTie; }

  // ── ③ 짐 무게 표 ──
  { const ids = new Set([...W.allIds(), ...FG.species(), ...Object.keys(FG.items()), ...require(path.join(ROOT, 'server', 'ore-goods')).ids, ...(require(path.join(ROOT, 'server', 'seafish')).TABLE || []).map((r) => r.id),
      'fish', 'dried_fish', 'pickled_fish', 'stone', 'pebble', 'wood', 'twig', 'ore_chunk', '없는품목', 'nan', '', null, undefined, 0, NaN]);
    const kg = [], body = [];
    for (const id of ids) { kg.push([String(id), enc(W.kgOf(id)), enc(W.kgOf(id, true)), enc(W.kgOfOrDefault(id))]); body.push([String(id), enc(FG.bodyKg(id)), enc(FG.bodyKg(id, 7)), FG.isItem(id)]); }
    out.kg = H(JSON.stringify(kg)); out.kgN = kg.length; out.bodyKg = H(JSON.stringify(body));
    const R = lcg(99), its = [...ids].filter((x) => typeof x === 'string' && x), loads = [];
    for (let t = 0; t < 600; t++) { const p = { isNpc: true, inventory: {} }; const m = 1 + Math.floor(R() * 6); for (let i = 0; i < m; i++) { const it = its[Math.floor(R() * its.length)]; p.inventory[it] = (p.inventory[it] || 0) + 1 + Math.floor(R() * 4); } if (R() < 0.3) p.inventory.ore_chunk = +(R() * 9).toFixed(3); loads.push(enc(C.npcTotalKg(p))); }
    out.body = H(JSON.stringify(loads));
    out.mod = { carry: P14.carry() === C, weights: P14.weights() === W }; }

  out.stat = { villages: P14.stat(), weights: W.t1214Stat(), fishGoods: FG.t1214Stat(), on: P14.ON, verify: P14.VERIFY };
  // ① 문 전수(제품 문 뒤 — 셈을 위 표에 안 섞는다) — 빈 목록 = 거짓 · 목록이 있으면 = 종전 명부 + some
  { let n = 0, bad = 0;
    for (const f of crewFix) { state.deps = { players: f.pl }; state._t527Sites = f.sites;
      for (const p of f.pl.values()) { const ref = f.sites.length === 0 ? false : P14.crew527(f.vil).includes(p.pid); const got = P14.crew527Gate(f.vil, p); n++; if ((P14.VERIFY ? P14.crew527(f.vil).includes(p.pid) : ref) !== got) bad++; }
      state._t527Sites = null; }
    out.crew = { n, bad }; }
  process.stdout.write('\n@@T1214@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 어른: 팔마다 아이 ──
let pass = 0, fail = 0;
const ok = (n, c, why) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (why ? ' — ' + why : '')); } };
function child(mode, extra) {
  const env = Object.assign({}, process.env, extra || {});
  if (mode == null) delete env.T1214_STEP_FAST; else env.T1214_STEP_FAST = mode;
  const s = execFileSync(process.execPath, [__filename, '--child'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
  const i = s.lastIndexOf('@@T1214@@');
  if (i < 0) throw new Error('아이 출력에 표가 없다: ' + s.slice(-400));
  return JSON.parse(s.slice(i + 9).trim());
}
const FP = ['task', 'taskN', 'rock', 'rockN', 'kg', 'kgN', 'bodyKg', 'body'];
for (const [lab, extra] of [['T400 기본(켬)', {}], ['T400_BUILD_ACT=0(기준선 판 조건)', { T400_BUILD_ACT: '0' }]]) {
  console.log(`── ${lab} ──`);
  const off = child(null, extra), on = child('1', extra), vf = child('verify', extra);
  ok(`끔 아이 — 새 길 셈 0 · 손잡이 끔(villages · weights · fish-goods)`, off.stat.on === false && off.stat.villages.crewQ === 0 && off.stat.villages.rockQ === 0 && off.stat.villages.ptQ === 0 && off.stat.weights.on === false && off.stat.fishGoods.on === false, JSON.stringify(off.stat));
  ok(`① 다리 크루 문 전수 — 빈 목록 = 거짓 · 목록이 있으면 종전 명부(${off.crew.n} 물음 · 어긋남 ${off.crew.bad}/${on.crew.bad}/${vf.crew.bad})`, off.crew.n > 5000 && off.crew.bad === 0 && on.crew.bad === 0 && vf.crew.bad === 0);
  ok(`① 켬 아이 — 빈 목록 판에서 명부를 건너뛰었다(${on.stat.villages.crewSkip}/${on.stat.villages.crewQ})`, on.stat.villages.crewSkip > 0 && on.stat.villages.crewQ > on.stat.villages.crewSkip);
  ok(`① _t1181Task 답 끔 = 켬 = verify(${off.taskN} 몸 · 크루 답 ${off.taskHit} · ${off.taskKinds.join('/')})`, off.task === on.task && off.task === vf.task && off.taskHit > 0 && off.taskKinds.length === 2, `${off.task} ${on.task} ${vf.task}`);
  ok(`② 켬 차례 = 종전 안정 정렬 차례(${off.order.n} 목록 · 거리 같음 낀 목록 ${off.order.ties} · 어긋남 ${off.order.bad})`, off.order.n > 1000 && off.order.ties > 100 && off.order.bad === 0);
  ok(`② _physicalStoneWork 답 · 몸 칸 · 존 문 부름 차례 끔 = 켬 = verify(${off.rockN} 판 · ${JSON.stringify(off.rockKinds)})`, off.rock === on.rock && off.rock === vf.rock && off.rockKinds.stop > 0 && off.rockKinds.pick > 0 && off.rockKinds.full > 0 && off.rockKinds.none > 0, `${off.rock} ${on.rock} ${vf.rock}`);
  { const V0 = on.stat.villages; ok(`② 켬 아이 — 바위 · 설 자리 둘 다 첫째 길 · 나머지 정렬 길 · NaN 종전 길이 섰다(${JSON.stringify({ rock: [V0.rockFirst, V0.rockRest, V0.rockNaN], pt: [V0.ptFirst, V0.ptRest, V0.ptNaN] })})`, V0.rockFirst > 0 && V0.rockRest > 0 && V0.rockNaN > 0 && V0.ptFirst > 0 && V0.ptRest > 0 && V0.ptNaN > 0); }
  ok(`③ weights.kgOf · fish-goods.bodyKg · isItem 끔 = 켬 = verify(${off.kgN} 품목)`, off.kg === on.kg && off.kg === vf.kg && off.bodyKg === on.bodyKg && off.bodyKg === vf.bodyKg, `${off.kg} ${on.kg} ${vf.kg}`);
  ok(`③ carry.npcTotalKg 몸 짐 600 개 끔 = 켬 = verify`, off.body === on.body && off.body === vf.body);
  ok(`③ 모듈 칸 = require 객체(carry · weights)`, on.mod.carry && on.mod.weights && vf.mod.carry && vf.mod.weights);
  ok(`④ verify 아이 — 견줌 > 0 · 어긋남 0(명부 ${vf.stat.villages.crewVq} · 바위 ${vf.stat.villages.rockVq} · 설 자리 ${vf.stat.villages.ptVq} · 모듈 ${vf.stat.villages.modVq} · 무게 ${vf.stat.weights.vq} · 바다 표 ${vf.stat.fishGoods.vq})`,
    vf.stat.villages.crewVq > 0 && vf.stat.villages.rockVq > 0 && vf.stat.villages.ptVq > 0 && vf.stat.villages.modVq > 0 && vf.stat.weights.vq > 0 && vf.stat.fishGoods.vq > 0
    && (vf.stat.villages.crewBad | 0) === 0 && (vf.stat.villages.rockBad | 0) === 0 && (vf.stat.villages.ptBad | 0) === 0 && (vf.stat.villages.modBad | 0) === 0 && vf.stat.weights.bad === 0 && vf.stat.fishGoods.bad === 0, JSON.stringify(vf.stat));
  ok(`⑤ 미끼 — 같은 거리 뒤 차례 길은 종전과 갈린다(${off.bait.rockLateTie} 목록) · 목록이 있어도 명부를 건너뛰는 문은 다리 답을 놓친다(${off.bait.crewSkipAlways} 답)`, off.bait.rockLateTie > 0 && off.bait.crewSkipAlways > 0);
}
console.log(`\nT1214 step-fast: ${pass}/${fail}`);
process.exitCode = fail ? 1 : 0;
