#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 6   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1459-raid-ground.js — 도적 싸움 둘째: 버린 짐은 땅에 · 존 지형 위 싸움(T1459 · 손잡이 `T1459_LOOT_GROUND` · `T1459_LIVE` 끔 기본) ==========
//
// ★왜 [지시 T1459 · T1431 회부 2 · 3 · 6 · ★재민 11-22 판정 35 "전투실험실처럼 물리적인 전투" · 약탈 비전 "물리적 노획 → 운반 → 귀가 저장"]
//   T1431: 진 캐러밴이 버린 짐은 곧장 장물 환산 몫이 되어 싸운 단의 몸 짐에 나눠 실렸다(땅 0 · 무게 상한 0 · 걸음 0) · 싸움은 빈 들판 한 판.
//   이제 ① 버린 짐(품목 그대로)은 만난 자리 더미 → 단 몸이 걸어와 몸마다 `CAP_KG` 만큼 싣고 → 남은 몫은 존 땅 꾸러미(누구나 줍는다) → 은거지에서 장물 환산.
//        ② 보는 사람이 곁에 있으면 판을 존 지형 위에 놓는다(표준 배치를 만난 자리로 옮겨 돌림 · 막힘 · 시야 · 엄폐만 존 술어 — 식 · 씨는 그대로).
// 판(운영 함수 그대로 · 사본 0): 도적 층 `onBanditLoot` · 길목 만남 · 하루(`daily`) · 몸 걸음(`tickBodyExits`) · 노획 싣기(`t1104Load` = `_warLootLoad`) ·
//   T1404 하네스의 꾸민 세계(`test-t1404-bandit-live.js --child` — 길목 단 5명 ↔ 하루 길 캐러밴 · 그 판을 손잡이만 켜서 빌린다 · 사본 0) ·
//   땅 꾸러미 문(아이 판의 존 대신 — 운영 zone `_spawnGroundItems` 의 꼴: 꾸러미 id · 품목 · 낱개 수 · kg) · `caravan-battle` `raidBattle` · `zoneWorld`.
//   ① 끔 — 땅 문이 안 선다(더미 0 · 종전 T1431 장부 줄 그대로) · 손잡이 끔 기본
//   ② 땅 더미(혼자 행상 ↔ 단 5 · 돌 100 = 400kg) — ②a 더미 하나 · 품목 그대로 400kg(만난 자리) ②b 짐이 땅을 거친다(은거지 더미에 든 장물 = 실어 온 몫의 환산만 —
//      끔 판과의 차 = 못 진 몫의 환산 · 두 번 0) ②c 몸마다 `CAP_KG` 밑(판 내내) ②d 셈 맞음(놓인 kg = 실은 kg + 땅 꾸러미 kg + 낱개 밑 몫) · 땅 꾸러미 kg = 남은 몫
//      ②e 몸이 걸었다(순간이동 0 — T1404 하네스 걸음 살핌) ②f 가벼운 짐(낟알 40)은 다 진다(땅 꾸러미 0)
//   ③ 누구나 줍는다 — 땅 꾸러미가 존에서 사라지면 살핌(`_t1459Watch`)이 까닭을 가른다(10분 청소 시각 전 = 남이 주움 · 뒤 = 청소)
//   ④ 죽은 사람의 짐 — 은거지로 나르던 몸이 쓰러지면 그 몸 짐(돌)이 죽음 낙하 문(`deathDrop`)으로 간다
//   ⑤ 존 위 싸움 — ⑤a 빈 땅 존 판 = 머리 없는 판(200씨 · 같은 답 — 보는 판 ↔ 안 보는 판 같은 분포) ⑤b 지형 판(강 · 숲 · 다리) 분포 표 · 달아남 몫(붙기 전 판단)은 같다
//      ⑤c 몸은 막힌 칸(물)에 서지 않는다(강 · 다리 판 200씨 걸음마다) ⑤d 서버: 보는 사람이 곁에 있을 때만 존 판(꾸민 세계 · 관측자 있음 = 존 판 1 · 없음 = 0)
//   ⑥ 정적 — 손잡이 끔 기본 · T1431 · T1104 걷기 안에서만 · 새 수 0(상한 = `carry.js CAP_KG` · 환산 = `BDT_FENCE_*`)
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): 짐이 땅을 안 거치는 사본(= 지금) · 짐이 두 번 생기는 사본(더미 + 단 짐) · 한 사람이 상한 넘게 지는 사본 ·
//     보는 판과 안 보는 판의 분포가 다른 사본 · 달아난 사람이 물 위에 서는 사본 · 죽은 사람의 짐이 사라지는 사본
// 실행: node scripts/test-t1459-raid-ground.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BF = path.join(ROOT, 'server', 'bandits.js'), CBF = path.join(ROOT, 'sim', 'caravan-battle.js'), VF = path.join(ROOT, 'server', 'villages.js');
const BAITS = {
  noGround: { f: BF, at: ["if (!(T1459_LOOT_GROUND && _t1459Add(g, res, amt / gs.length, day, victim, other))) _t1104Carry(g, 'food', gain / gs.length);", "_t1104Carry(g, 'food', gain / gs.length); /* 미끼 — 짐이 땅을 안 거친다(= T1431) */"] },
  twice: { f: BF, at: ["if (!(T1459_LOOT_GROUND && _t1459Add(g, res, amt / gs.length, day, victim, other))) _t1104Carry(g, 'food', gain / gs.length);", "if (T1459_LOOT_GROUND) _t1459Add(g, res, amt / gs.length, day, victim, other); _t1104Carry(g, 'food', gain / gs.length); /* 미끼 — 더미 + 단 짐(두 번) */"] },
  overCap: { f: BF, at: ['  if (bodies.length && H.t1104Load) H.t1104Load(bodies, src);', '  if (bodies.length) for (const r of Object.keys(src)) { const each = src[r] / bodies.length; for (const p of bodies) { const inv = p.inventory || (p.inventory = {}); inv[r] = (+inv[r] || 0) + each; } src[r] = 0; }   // 미끼 — 상한 없이 다 진다'] },
  liveDiff: { f: CBF, at: ['  if (world) { h.ctx.world = world; if (world.settle) world.settle(h.ctx); }', '  if (world) { h.ctx.world = world; if (world.settle) world.settle(h.ctx); h.ctx.sides.A.armyMrl = (mrlA == null ? 1 : mrlA) * 0.8; } /* 미끼 — 보는 판만 사기가 낮다 */'] },
  water: { f: CBF, at: ['    blocked(x, y) { return !!at(x, y).b; },', '    blocked(x, y) { return false; },   // 미끼 — 물 · 벽을 안 본다'] },
  deadVanish: { f: VF, at: ["  try { if (state.deps.deathDrop) state.deps.deathDrop(p); } catch (e) {}   // 낙하 — 플레이어 죽음 캐논의 그 문(짐 kg 절반 · 입은 것은 몸에)\n  _setHp(p, 0, 'died');", "  /* 미끼 — 죽은 몸의 짐이 땅에 안 간다(사라진다) */\n  _setHp(p, 0, 'died');"] },
};
const short = (x) => JSON.stringify(x).slice(0, 420);
function patchCompile(bait) {
  const Module = require('module'), _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (bait && filename === bait.f) {
      const n = content.split(bait.at[0]).length - 1;
      if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ baitErr: `미끼 자리 ${n}번` }) + '\n'); process.exit(3); }
      content = content.replace(bait.at[0], bait.at[1]);
    }
    return _c.call(this, content, filename);
  };
}

if (process.argv[2] === '--fix') {   // ── 아이 판 — T1404 꾸민 세계에 땅 꾸러미 문 · 캐러밴 짐 · 관측자를 꽂는다 ──────────────────────────
  patchCompile(process.argv[3] && process.argv[3] !== '-' ? BAITS[process.argv[3]] : null);
  const V = require(VF), V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2')), W8 = require(path.join(ROOT, 'server', 'weights')), CAP = require(path.join(ROOT, 'server', 'carry')).CFG.CAP_KG;
  const G = new Map(); let seq = 1, DEPS = null, VH = null; const drops = []; let maxKg = 0, killed = null;
  const kgOf = (inv) => { let k = 0; for (const r of Object.keys(inv || {})) k += (+inv[r] || 0) * W8.kgOfOrDefault(r); return k; };
  const _b = V.__p3Bind;
  V.__p3Bind = function (st) {
    DEPS = st.deps;
    st.deps.t1459Ground = (x, y, item, n, kg) => { const gi = { id: 'g' + (seq++), x, y, item, count: n, kg }; G.set(gi.id, gi); return [gi]; };
    st.deps.t1459GroundHas = (id) => G.has(id); st.deps.t1459GroundLife = 600000;
    st.deps.deathDrop = (p) => { drops.push({ pid: p.pid, inv: Object.assign({}, p.inventory || {}) }); return 0; };
    if (process.env.T1459H_VIEW === '1') st.deps.anyViewerNear = () => true;
    VH = _b.apply(this, arguments); return VH;
  };
  const P = V2._t1104Probe, _m = P.meet; let once = false;
  P.meet = function (W, k, d) { if (!once) { once = true; k.escort = +(process.env.T1459H_ESC || 0); k.giveRes = process.env.T1459H_RES || 'stone'; k.giveAmt = +(process.env.T1459H_AMT || 100); } return _m.apply(this, arguments); };
  const B = require(BF);
  const _d = B._t1039Probe.daily;
  B._t1039Probe.daily = function (d) {
    const r = _d.apply(this, arguments);
    for (const p of DEPS.players.values()) if (p._bdtGid != null && !p.isDown) { const k = kgOf(p.inventory); if (k > maxKg) maxKg = k; }
    if (process.env.T1459H_KILL === '1' && !killed) for (const g of B._t1039Probe.gangs()) { const t = g.t1104; if (!t || t.st !== 'back') continue;
      for (const p of DEPS.players.values()) if (p._bdtGid === g.id && !p.isDown && p._t1459Bag) { killed = { pid: p.pid, inv: Object.assign({}, p.inventory) }; VH.banditHost().t1078Die(p, 'test'); break; } }
    return r;
  };
  const _w = process.stdout.write.bind(process.stdout);
  process.stdout.write = function (s) {
    if (typeof s === 'string' && s.startsWith('@@')) {
      const t9 = B.t1459(), gi = [...G.values()];
      let watch = null;
      if (gi.length && B._t1459Probe) { G.delete(gi[0].id); B._t1459Probe.watch(); const a = B.t1459().st; const Z = B._t1459Probe.state(); const now = Date.now(); Z.gi.set('gx', { kg: 1, at: now - 700000, pile: 0 }); B._t1459Probe.watch(); const b = B.t1459().st; watch = { other: a.goneOther, otherKg: a.goneOtherKg, clean: b.goneClean, cleanKg: b.goneCleanKg }; }
      const piles = (B.t1079().piles || []).map((x) => ({ gid: x.gid, food: +(+x.food || 0).toFixed(6) }));
      _w('@@G' + JSON.stringify({ t1459: t9, ground: gi, maxKg, cap: CAP, drops, killed, watch, piles, live: t9.st ? { live: t9.st.live || 0, fled: t9.st.liveFled || 0, lost: t9.st.liveLost || 0 } : null }) + '\n');
    }
    return _w(s);
  };
  process.argv[2] = '--child'; process.argv[3] = '-';
  require(path.join(ROOT, 'scripts', 'test-t1404-bandit-live.js'));
} else if (process.argv[2] === '--live') {   // ── 아이 판 — 존 지형 판 분포(머리 없는 판과 같은 씨 · 같은 식) ─────────────────────────────
  patchCompile(process.argv[3] && process.argv[3] !== '-' ? BAITS[process.argv[3]] : null);
  const CB = require(CBF), BC = require(path.join(ROOT, 'sim', 'battle-core'));
  //   지형(칸 술어) — 캐러밴(100,100) ↔ 단(140,100) · 판 상자 가운데 (120,100) · 판 x 축 = +x
  const TER = {
    빈땅: () => ({}),
    강가: (cx) => (cx <= 72 ? { b: 1 } : {}),   // 캐러밴 뒤 28칸 — 강(물 · 막힘 · 화살은 지난다)
    숲: (cx, cy) => (((cx * 7 + cy * 13) % 97 === 0) && cx > 85 && cx < 155 ? { b: 1, l: 1, c: 1 } : {}),   // 성긴 숲 — 나무 아흔일곱 칸에 하나(막힘 · 시야 · 엄폐)
    다리: (cx, cy) => (cx > 60 && cx < 110 && Math.abs(cy - 100) > 3 ? { b: 1 } : {}),   // 캐러밴 쪽 50칸 — 폭 7칸 다리 · 양옆 물
  };
  const SC = [['호위 2 ↔ 도적 5', { esc: 2, gangN: 5, armed: 5 }], ['호위 1 ↔ 도적 3', { esc: 1, gangN: 3, armed: 1 }], ['혼자 ↔ 맨손 1', { esc: 0, gangN: 1, armed: 0 }]];
  const out = { same: 0, n: 0, tab: [], inWater: 0, steps: 0 };
  for (const [nm, a] of SC) for (const [tn, cell] of Object.entries(TER)) {
    const R = { fled: 0, fight: 0, lost: 0, escD: 0, banD: 0, trD: 0 };
    for (let s = 1; s <= 200; s++) {
      const base = Object.assign({ qA: 0.42, qB: 0.42, happy: 1, seed: s * 7 + 1 }, a);
      const w = CB.zoneWorld(100, 100, 140, 100, cell), r = CB.raidBattle(Object.assign({ world: w }, base));
      if (tn === '빈땅') { out.n++; if (JSON.stringify(r) === JSON.stringify(CB.raidBattle(base))) out.same++; }
      if (r.fled) R.fled++; else { R.fight++; if (!r.repel) R.lost++; R.escD += r.escKilled | 0; R.banD += r.banditsKilled | 0; R.trD += r.traderDead ? 1 : 0; }
    }
    out.tab.push({ sc: nm, ter: tn, ...R });
  }
  //   ⑤c 물 위 — 강 · 다리 판을 걸음마다 따라가며 산 몸이 막힌 칸에 선 걸음 수(battle-core 몸 클램프 — 어댑터 `blocked`)
  for (const tn of ['강가', '다리']) for (let s = 1; s <= 200; s++) {
    const w = CB.zoneWorld(100, 100, 140, 100, TER[tn]);
    const h = BC.createBattle({ A: { militia: 3, form: 'line' }, B: { dagger: 6, form: 'line' }, terrain: 'plain' }, { rng: ((q) => () => { q ^= q << 13; q >>>= 0; q ^= q >>> 17; q ^= q << 5; q >>>= 0; return q / 4294967296; })(s * 31 + 7) });
    h.ctx.world = w; w.settle(h.ctx); h.ctx.sides.A.armyMrl = 0.6;
    for (let t = 0; t < 1200 && !h.result; t++) { h.step(0.1); BC._judge(h.ctx); for (const u of h.units) { if (u.hp <= 0) continue; out.steps++; const [cx, cy] = w.toZone(u.x, u.y); if ((TER[tn](cx, cy) || {}).b) out.inWater++; /* 지형 술어로 직접(어댑터를 거치지 않는다) */ } }
  }
  process.stdout.write('@@L' + JSON.stringify(out) + '\n');
  process.exit(0);
} else {
// ── 부모 판 ─────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const KN = ['T1431_RAID_BATTLE', 'T1459_LOOT_GROUND', 'T1459_LIVE', 'T1404_RAID_LURK', 'T1404_DEN_ROUTE', 'T1404_GANG_FORAGE', 'T1404_GANG_SIZE', 'BANDIT_BODIES', 'T1459H_ESC', 'T1459H_RES', 'T1459H_AMT', 'T1459H_KILL', 'T1459H_VIEW'];
function fix(knobs, bait) {
  const env = Object.assign({}, process.env); for (const k of KN) delete env[k];
  Object.assign(env, { T1404H_SUB: 'lurk', T1404_RAID_LURK: '1', T1431_RAID_BATTLE: '1' }, knobs || {});
  const r = spawnSync(process.execPath, [__filename, '--fix', bait || '-'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const L = (r.stdout || '').split('\n'), g = L.find((l) => l.startsWith('@@G')), m = L.find((l) => l.startsWith('@@{'));
  try { return Object.assign(JSON.parse(m.slice(2)), { G: g ? JSON.parse(g.slice(3)) : null }); } catch (e) { return { err: `rc ${r.status} · ${(r.stderr || '').slice(-300)}` }; }
}
function live(bait) {
  const r = spawnSync(process.execPath, [__filename, '--live', bait || '-'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const l = (r.stdout || '').split('\n').find((x) => x.startsWith('@@L'));
  try { return JSON.parse(l.slice(3)); } catch (e) { return { err: `rc ${r.status} · ${(r.stderr || '').slice(-300)}` }; }
}
const FENCE = (res, q) => q * ((res === 'food' || res === 'fish' || res === 'meat' || res === 'cooked_food' || res === 'vegetable') ? 0.5 : 0.25);
function checks(bait) {
  const L = [];
  const on = fix({ T1459_LOOT_GROUND: '1' }, bait), off = fix({}, bait), light = fix({ T1459_LOOT_GROUND: '1', T1459H_RES: 'grain', T1459H_AMT: '40' }, bait);
  const kill = fix({ T1459_LOOT_GROUND: '1', T1459H_KILL: '1' }, bait), view = fix({ T1459_LIVE: '1', T1459H_VIEW: '1' }, bait), noview = fix({ T1459_LIVE: '1' }, bait);
  const LV = live(bait);
  const err = [on, off, light, kill, view, noview].find((x) => x.err || !x.G) || (LV.err ? LV : null);
  if (err) { L.push(['0', false, '[전제] 아이 판이 돌았다', short(err.err || err)]); return L; }
  const S = on.G.t1459.st || {}, So = off.G.t1459.st, raid = on.raids[0] || {}, raidO = off.raids[0] || {};
  L.push(['①', !So && !off.G.ground.length && off.G.t1459.on === false && raidO.loss && raidO.loss.outbound === 1 && Math.abs((off.G.piles[0] ? off.G.piles[0].food : 0) - (on.G.piles[0] ? on.G.piles[0].food : 0) - FENCE('stone', ((S.leftKg || 0) + (S.dust || 0)) / 4)) < 1e-6,
    '① 끔(T1431 켬 · T1459 끔) — 더미 0 · 땅 꾸러미 0 · 버린 짐은 종전 장부 줄(은거지 더미에 장물)', short({ st: So, ground: off.G.ground.length, loss: raidO.loss, pileOff: off.G.piles, pileOn: on.G.piles })]);
  L.push(['②a', S.piles === 1 && Math.abs(S.kg - 400) < 1e-6 && raid.loss && raid.loss.outbound === 1,
    '②a 혼자 행상 ↔ 단 5(돌 100 = 400kg) — 달아남 · 더미 하나 · 품목 그대로 400kg', short({ piles: S.piles, kg: S.kg, loss: raid.loss })]);
  const hOn = on.G.piles[0] ? on.G.piles[0].food : null, hOff = off.G.piles[0] ? off.G.piles[0].food : null, left = (S.leftKg || 0) + (S.dust || 0);
  const wantGap = FENCE('stone', left / 4);   // 끔 판은 100 낱개를 다 환산 · 켬 판은 실어 온 몫만 — 차 = 못 진 몫의 환산
  L.push(['②b', hOn != null && hOff != null && Math.abs((hOff - hOn) - wantGap) < 1e-6 && Math.abs(S.fenceFood - FENCE('stone', S.pickKg / 4)) < 1e-6,
    '②b 짐이 땅을 거친다 — 은거지 장물 = 실어 온 몫의 환산(돌 25 %)만 · 끔 판과의 차 = 못 진 몫의 환산(두 번 0)', short({ homeOn: hOn, homeOff: hOff, gap: hOff != null && hOn != null ? +(hOff - hOn).toFixed(6) : null, want: wantGap, fence: S.fenceFood })]);
  L.push(['②c', on.G.maxKg <= on.G.cap + 1e-6 && on.G.maxKg > 0, `②c 몸마다 짐 ≤ CAP_KG(${on.G.cap}kg) — 판 내내(날마다 산 단 몸)`, short({ maxKg: +on.G.maxKg.toFixed(3), cap: on.G.cap })]);
  const gKg = on.G.ground.reduce((a, g) => a + g.kg, 0);
  L.push(['②d', Math.abs(S.kg - (S.pickKg + S.leftKg + S.dust)) < 1e-6 && Math.abs(gKg - S.leftKg) < 1e-6 && S.leftKg > 0 && S.pickKg > 0,
    '②d 셈 맞음 — 놓인 kg = 실은 kg + 땅 꾸러미 kg + 낱개 밑 몫 · 땅 꾸러미 kg = 남은 몫', short({ kg: S.kg, pick: S.pickKg, left: S.leftKg, dust: S.dust, groundKg: gKg, items: on.G.ground.map((g) => [g.item, g.count]) })]);
  L.push(['②e', on.A.jumps === 0 && S.walk === 1 && on.A.ev.meet && on.A.ev.meet.st === 'pick', '②e 몸이 더미까지 걸었다(순간이동 0 · 만난 다음 날 상태 = 더미로 걷는 중)', short({ jumps: on.A.jumps, walk: S.walk, st: on.A.ev.meet && on.A.ev.meet.st })]);
  const SL = light.G.t1459.st || {};
  L.push(['②f', SL.piles === 1 && SL.leftKg === 0 && !light.G.ground.length && Math.abs(SL.pickKg + SL.dust - SL.kg) < 1e-6, '②f 가벼운 짐(낟알 40)은 다 진다 — 땅 꾸러미 0', short({ kg: SL.kg, pick: SL.pickKg, left: SL.leftKg, dust: SL.dust })]);
  const W = on.G.watch;
  L.push(['③', !!W && W.other === 1 && W.clean === 1, '③ 누구나 줍는다 — 땅 꾸러미가 10분 청소 전에 사라지면 "남이 주움" · 뒤면 "청소"(살핌 `_t1459Watch`)', short(W)]);
  const kd = kill.G.killed, dr = kd && kill.G.drops.find((d) => d.pid === kd.pid);
  L.push(['④', !!kd && (+kd.inv.stone || 0) > 0 && !!dr && (+dr.inv.stone || 0) > 0, '④ 짐을 나르던 몸이 쓰러지면 그 몸 짐(돌)이 죽음 낙하 문으로 간다(사라짐 0)', short({ killed: kd, drop: dr || null })]);
  L.push(['⑤a', LV.n === 600 && LV.same === 600, '⑤a 빈 땅 존 판 = 머리 없는 판(꼴 셋 × 200씨 · 답 바이트 같음 — 보는 판 ↔ 안 보는 판 같은 분포)', `${LV.same}/${LV.n}`]);
  const byS = {}; for (const r of LV.tab) (byS[r.sc] || (byS[r.sc] = [])).push(r);
  const fledSame = Object.values(byS).every((a) => a.every((r) => r.fled === a[0].fled));
  L.push(['⑤b', fledSame && LV.tab.length === 12, '⑤b 지형 판(강가 · 숲 · 다리) — 붙기 전 판단(달아남)은 지형과 무관하게 같다 · 싸움 몫만 지형을 탄다(표)', short(LV.tab.map((r) => [r.sc, r.ter, r.fled, r.fight, r.lost, r.escD, r.banD])) ]);
  L.push(['⑤c', LV.steps > 0 && LV.inWater === 0, '⑤c 몸은 막힌 칸(물 · 다리 양옆)에 서지 않는다(강가 · 다리 200씨 걸음마다)', `막힌 칸 걸음 ${LV.inWater} / ${LV.steps}`]);
  const lv = view.G.live || {}, ln = noview.G.live;
  L.push(['⑤d', lv.live === 1 && (!ln || !ln.live), '⑤d 서버 — 보는 사람이 곁에 있을 때만 존 판(꾸민 세계 · 관측자 있음 = 1 · 없음 = 0)', short({ view: lv, noview: ln })]);
  return L;
}
console.log('\n=== T1459 — 버린 짐은 땅에 · 존 지형 위 싸움(`T1459_LOOT_GROUND` · `T1459_LIVE` 끔 기본) ===');
const MAIN = checks(null);
for (const [, c, m, d] of MAIN) ok(c, m, d);
//   ⑥ 정적
{
  const src = fs.readFileSync(BF, 'utf8'), cb = fs.readFileSync(CBF, 'utf8');
  const knobOff = /const T1459_LOOT_GROUND = T1431_RAID_BATTLE && T1104_WALK && !!process\.env && process\.env\.T1459_LOOT_GROUND === '1';/.test(src) && /const T1459_LIVE = T1431_RAID_BATTLE && T1104_WALK && !!process\.env && process\.env\.T1459_LIVE === '1';/.test(src);
  const calls = (src.match(/_t1459Add\(|_t1459Go\(|_t1459PickDay\(|_t1459Fence\(|_t1459Watch\(\)|_t1459World\(/g) || []).length;
  const guarded = src.split('\n').filter((l) => /_t1459(Add|Go|PickDay|Fence|World)\(/.test(l) && !/^function /.test(l.trim())).every((l) => /T1459_(LOOT_GROUND|LIVE)/.test(l));
  const capOne = /H\.t1104Load\(bodies, src\)/.test(src) && !/CAP_KG\s*=\s*\d/.test(src);
  ok(knobOff && guarded && capOne && /if \(world\) \{ h\.ctx\.world = world; if \(world\.settle\) world\.settle\(h\.ctx\); \}/.test(cb), '⑥ 정적 — 손잡이 둘 끔 기본(T1431 · T1104 걷기 안) · 부르는 줄마다 손잡이 · 상한은 `t1104Load`(carry `CAP_KG`) 한 곳 · 존 판은 어댑터 한 줄', short({ knobOff, guarded, calls, capOne }));
}
//   미끼
console.log('\n  ── 미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언)');
const RED = (L) => L.filter((x) => !x[1]).map((x) => x[0]);
const BR = {}; for (const k of Object.keys(BAITS)) BR[k] = RED(checks(k));
const WANT = { noGround: ['②a', '②b', '②d', '②e', '②f', '③', '④'], twice: ['①', '②b'], overCap: ['②c', '②d', '③'], liveDiff: ['⑤a'], water: ['⑤c'], deadVanish: ['④'] };
const same = (k) => JSON.stringify(BR[k]) === JSON.stringify(WANT[k]);
ok(same('noGround'), `미끼 — 짐이 땅을 안 거치는 사본(= T1431) → 빨강 줄이 꼭 {${WANT.noGround.join(', ')}}`, `바꾼 자리 1 · 빨강 {${BR.noGround.join(', ')}}`);
ok(same('twice'), `미끼 — 짐이 두 번 생기는 사본(더미 + 단 짐) → 빨강 줄이 꼭 {${WANT.twice.join(', ')}}`, `바꾼 자리 1 · 빨강 {${BR.twice.join(', ')}}`);
ok(same('overCap'), `미끼 — 한 사람이 상한 넘게 지는 사본 → 빨강 줄이 꼭 {${WANT.overCap.join(', ')}}`, `바꾼 자리 1 · 빨강 {${BR.overCap.join(', ')}}`);
ok(same('liveDiff'), `미끼 — 보는 판과 안 보는 판의 분포가 다른 사본 → 빨강 줄이 꼭 {${WANT.liveDiff.join(', ')}}`, `바꾼 자리 1 · 빨강 {${BR.liveDiff.join(', ')}}`);
ok(same('water'), `미끼 — 달아난 사람이 물 위에 서는 사본 → 빨강 줄이 꼭 {${WANT.water.join(', ')}}`, `바꾼 자리 1 · 빨강 {${BR.water.join(', ')}}`);
ok(same('deadVanish'), `미끼 — 죽은 사람의 짐이 사라지는 사본 → 빨강 줄이 꼭 {${WANT.deadVanish.join(', ')}}`, `바꾼 자리 1 · 빨강 {${BR.deadVanish.join(', ')}}`);
console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
}
