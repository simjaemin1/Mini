#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 4   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1431-raid-battle.js — 도적과 캐러밴은 몸으로 싸운다(T1431 · 손잡이 `T1431_RAID_BATTLE` 끔 기본) =========================
//
// ★왜 [지시 T1431 · ★재민 11-22 판정 35 "도적과 npc의 싸움도 전투실험실처럼 물리적인 전투가 일어나야 해 … 캐러밴이 도적과 일정 거리 안에 들어오면 전투 모드..
//      전력 차이+낮은 행복(사기)면 바로 짐 버리고 도주.. 그렇지 않으면 싸움.."]
//   T1404 켠 세계: 털릴 때마다 행상 한 사람이 그 자리에서 쓰러졌다(econ `_raidScrum` — 식이 정한 값). 이제 econ 약탈 판이 호스트 문 `world.raidFight` 를 부르고
//   서버 도적 층이 `sim/caravan-battle.js` `raidBattle`(battle-core 한 판 — 전투실험실 그 코어)로 치른다.
// 판(운영 함수 그대로 · 사본 0): `caravan-battle` `decide` · `raidBattle` · `inRange` · battle-core · econ `_raidOut`(`_t1104Probe.raidOut`) · `_raidScrum`(`_t1079Probe`) ·
//   서버 길목 만남(T1404 하네스의 꾸민 세계 — `test-t1404-bandit-live.js --child` 그 판을 손잡이만 켜서 빌린다 · 사본 0).
//   ① 달아남 · 싸움 가름 — ①a 혼자 행상 ↔ 든 도적 1 = 달아남(죽음 0 · 짐 1) · ①b 밀리고 사기 낮음(호위 2 ↔ 도적 5 · 행복 0.3) = 달아남 · ①c 밀려도 사기 높음(행복 1) = 싸움 ·
//      ①d 안 밀리면 사기가 낮아도 싸움(호위 6 ↔ 도적 2 · 행복 0.2) · ①e 식(세기 = 편 공격 합 × 편 hp 합 · 사기 = battle-core 목표 × 행복 · 문턱 `M_BREAK`)을 따로 셈과 견줌 ·
//      ①f 결정론(같은 씨 두 번 같은 답 · 씨 = (날 · 캐러밴 · 단)) · ①g 거리(`ENGAGE_R` = 전쟁 층 `WAR_ENGAGE_R` 글자 = battle-core 표준 배치 두 편 간격 · 50칸 안 · 밖)
//   ② econ 문 — ②a 달아남: 짐 다 도적에게(넘김 + 배달 = 실은 짐 · 사라짐 0) · 행상 · 호위 산다 · ②b 이긴 싸움에서 쓰러진 행상만 명부에서 빠진다(캐러밴은 간다 · 짐 넘김 0) ·
//      ②c 끔(문 없음) = `_raidScrum` 판 그대로(같은 씨 · 같은 답) · ②d 진 싸움: 짐 1 · 쓰러진 호위만큼 마을 전사가 준다
//   ③ 서버 — ③a 정적(손잡이 끔 기본 · 켬일 때만 문 · 만남은 거리 문) · ③b T1404 꾸민 세계(길목 단 ↔ 하루 길 캐러밴 · 호위 둘)에서 켬 = 만남이 몸 전투로(손실 0 또는 1) · 두 번 같은 답 ·
//      ③c 몸 없는 단(판 자)도 같은 한 판
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): 거리 밖에서도 전투가 서는 사본 · 밀리고 사기 낮은데 싸우는 사본 · 달아난 사람이 죽는 사본 · 짐이 사라지는 사본
// 실행: node scripts/test-t1431-raid-battle.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CBF = path.join(ROOT, 'sim', 'caravan-battle.js'), V2F = path.join(ROOT, 'sim', 'economy-sim-v2.js');
const R = (p) => require(path.join(ROOT, p));
const BAITS = {
  noRange: { f: CBF, at: ['function inRange(dx, dy) { return dx * dx + dy * dy <= ENGAGE_R * ENGAGE_R; }', 'function inRange(dx, dy) { return true; }   // 미끼 — 거리 밖에서도 전투'] },
  fightLow: { f: CBF, at: ['return { flee: outmatched && low, outmatched, low,', 'return { flee: false, outmatched, low,   // 미끼 — 밀리고 사기 낮아도 싸운다\n   '] },
  fleeDie: { f: CBF, at: ["if (d.flee) return { fled: true, repel: false, banditsKilled: 0, escKilled: 0, traderDead: false,", "if (d.flee) return { fled: true, repel: false, banditsKilled: 0, escKilled: 0, traderDead: true,   // 미끼 — 달아난 사람이 죽는다\n   "] },
  cargoGone: { f: V2F, at: ['          if (world.onBanditLoot && _loot > 0) world.onBanditLoot(c.from, c.to, c.giveRes, _loot, day, gangO);', '          // 미끼 — 버린 짐이 도적에게 안 간다(사라진다)'] },
};
const short = (x) => JSON.stringify(x).slice(0, 420);

if (process.argv[2] === '--child') {   // ── 아이 판(미끼는 모듈을 읽을 때 갈아 끼운다) ─────────────────────────────
  const Module = require('module');
  const bait = process.argv[3] && process.argv[3] !== '-' ? BAITS[process.argv[3]] : null;
  const _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (bait && filename === bait.f) {
      const n = content.split(bait.at[0]).length - 1;
      if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ baitErr: `미끼 자리 ${n}번` }) + '\n'); process.exit(3); }
      content = content.replace(bait.at[0], bait.at[1]);
    }
    return _c.call(this, content, filename);
  };
  const _log = console.log; console.log = () => {};
  const CB = R('sim/caravan-battle.js'), BC = R('sim/battle-core.js'), v1 = R('sim/economy-sim'), V2 = R('sim/economy-sim-v2');
  const L = [];
  // ① 가름
  {
    const a = CB.raidBattle({ esc: 0, gangN: 1, armed: 1, happy: 1, seed: CB.seedOf(5, 1, 1) });
    L.push(['①a', a.fled === true && a.loss === 1 && !a.traderDead && a.escKilled === 0 && a.banditsKilled === 0 && a.d.outmatched && a.d.low,
      '①a 혼자 행상(호위 0) ↔ 든 도적 1 — 밀리고(세기) 사기가 궤주 문턱 밑 → 짐을 버리고 달아난다(죽음 0 · 버린 짐 1)', short({ fled: a.fled, loss: a.loss, td: a.traderDead, d: a.d })]);
    const b = CB.raidBattle({ esc: 2, gangN: 5, armed: 5, happy: 0.3, seed: CB.seedOf(5, 2, 1) });
    L.push(['①b', b.fled === true && b.loss === 1 && !b.traderDead && b.escKilled === 0 && b.d.outmatched && b.d.low,
      '①b 호위 2 ↔ 도적 5 · 집 마을 행복 0.3 — 밀리고 사기 낮음 → 달아난다(호위 · 행상 산다)', short({ fled: b.fled, d: b.d })]);
    const c = CB.raidBattle({ esc: 2, gangN: 3, armed: 3, happy: 1, seed: CB.seedOf(5, 3, 1) });
    L.push(['①c', c.fled === false && c.d.outmatched && !c.d.low && c.secs > 0 && (c.win === 'A' || c.win === 'B' || c.win === '무'),
      '①c 호위 2 ↔ 도적 3 · 행복 1 — 밀려도 사기가 문턱 위 → 싸운다(battle-core 한 판 · 걸린 초 > 0)', short({ fled: c.fled, win: c.win, secs: c.secs, d: c.d })]);
    const d = CB.raidBattle({ esc: 6, gangN: 2, armed: 2, happy: 0.2, seed: CB.seedOf(5, 4, 1) });
    L.push(['①d', d.fled === false && !d.d.outmatched && d.d.low && d.secs > 0,
      '①d 호위 6 ↔ 도적 2 · 행복 0.2 — 사기는 낮아도 안 밀리면 싸운다(판정 글자 "전력 차이 + 낮은 행복" — 둘 다일 때만 달아남 · 싸움 안 사기 칸도 같은 행복을 타 궤주할 수 있다)', short({ fled: d.fled, win: d.win, d: d.d })]);
    //   ①e 식 — 따로 셈(battle-core 표 · 품질 배수 · 사기 목표)
    const qm = (q) => 0.85 + 0.3 * (q - 0.5), U = BC.UNITS;
    const sA = (U.spear.atk * qm(0.6) * 3) * (U.spear.hp * 3), sB = (U.dagger.atk * qm(0.42) * 2 + U.militia.atk * qm(0.42) * 2) * (U.dagger.hp * 2 + U.militia.hp * 2);
    const tg = Math.max(0, Math.min(1, (BC.MRL0.spear + BC.M_KODDS * (2 - 4) / (2 + 4 + 1)) * 0.7));
    const e = CB.decide({ A: [['spear', 3]], B: [['dagger', 2], ['militia', 2]], qA: 0.6, qB: 0.42, happy: 0.7 });
    const near = (x, y) => Math.abs(x - y) < 1e-9 * Math.max(1, Math.abs(y));
    L.push(['①e', near(e.sA, sA) && near(e.sB, sB) && near(e.mrl, tg) && e.low === (tg < BC.M_BREAK) && e.outmatched === (sA < sB),
      '①e 식 — 세기 = (편 공격 합 × 품질 배수) × (편 hp 합)(battle-core 병종 표) · 사기 = (MRL0 + M_KODDS × (fN − eN) ÷ (fN + eN + 1)) × 행복 · 낮음 = `M_BREAK` 밑 — 따로 셈과 같다', short({ e, sA, sB, tg })]);
    const s1 = CB.raidBattle({ esc: 3, gangN: 4, armed: 3, happy: 0.9, seed: CB.seedOf(77, 12, 3) }), s2 = CB.raidBattle({ esc: 3, gangN: 4, armed: 3, happy: 0.9, seed: CB.seedOf(77, 12, 3) });
    const seeds = new Set([CB.seedOf(77, 12, 3), CB.seedOf(78, 12, 3), CB.seedOf(77, 13, 3), CB.seedOf(77, 12, 4)]);
    L.push(['①f', JSON.stringify(s1) === JSON.stringify(s2) && seeds.size === 4,
      '①f 결정론 — 같은 씨 두 번 같은 답(전 칸) · 씨 = (날 · 캐러밴 · 단) 해시 — 셋 중 하나만 달라도 다른 씨(주사위 0)', short({ s1: { win: s1.win, secs: s1.secs, ek: s1.escKilled, bk: s1.banditsKilled }, seeds: seeds.size })]);
    const wl = fs.readFileSync(path.join(ROOT, 'server', 'war-live.js'), 'utf8').match(/const WAR_ENGAGE_R = (\d+);/);
    const h = BC.createBattle({ A: { spear: 1, form: 'line' }, B: { dagger: 1, form: 'line' }, terrain: 'plain' }, { rng: () => 0.5 });
    const ua = h.units.find((u) => u.side === 'A'), ub = h.units.find((u) => u.side === 'B'), gap = ub && ua ? ub.x - ua.x : null;
    L.push(['①g', !!wl && +wl[1] === CB.ENGAGE_R && gap === CB.ENGAGE_R && CB.inRange(30, 40) && CB.inRange(0, 50) && !CB.inRange(30, 41) && !CB.inRange(0, 51) && !CB.inRange(120, 0),
      '①g 거리 — `ENGAGE_R` = 전쟁 층 `WAR_ENGAGE_R` 글자 = battle-core 표준 배치 두 편 앞줄 간격(새 수 0) · 50칸 안(30,40 · 0,50) 전투 · 밖(30,41 · 0,51 · 120,0) 아님', short({ wl: wl && wl[1], gap, R: CB.ENGAGE_R })]);
  }
  // ② econ 문 — 꾸민 두 마을 · 캐러밴 하나(가는 길 · 짐 40)
  {
    const E = v1;
    const mkV = (name) => { const v = E.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 12, name }); v.tradeStats = v.tradeStats || {}; v._weapQ = 0.42; v.lastStats = v.lastStats || {}; return v; };
    const setW = (v, n) => { let k = 0; for (const p of v.npcs) { if (k < n) { p.currentJob = 'warrior'; k++; } else if (p.currentJob === 'warrior') p.currentJob = 'farmer'; } v.counts = v.counts || {}; v.counts.warrior = k; };
    const warriors = (v) => v.npcs.filter((p) => p.currentJob === 'warrior').length;
    const run = (opt) => {
      const A = mkV('가'), B = mkV('나'); setW(A, opt.w | 0); A.lastStats.happiness = opt.happy == null ? 1 : opt.happy;
      const tr = A.npcs.find((p) => p.currentJob !== 'warrior');
      const c = { id: 9, from: A, to: B, state: 'outbound', departDay: 10, arriveDay: 12, returnArriveDay: 14, giveRes: 'grain', giveAmt: 40, escort: opt.esc | 0, trader: tr };
      const g = { id: 3, n: opt.g, camp: { cx: 0, cy: 0 } };
      const loot = []; const W = { onBanditLoot: (v, o, res, amt, day, gang) => loot.push({ v: v.name, res, amt, gang: gang && gang.id }) };
      let last = null;
      if (opt.fight === 'real') W.raidFight = (cc, gg, leg, day) => last = CB.raidBattle({ esc: cc.escort | 0, gangN: gg.n | 0, armed: null, qA: cc.from._weapQ, qB: 0.42, happy: cc.from.lastStats.happiness, seed: CB.seedOf(day, cc.id, gg.id) });
      else if (opt.fight) W.raidFight = () => opt.fight;
      if (opt.seed != null) E.setSeed(opt.seed);
      const n0 = A.npcs.length, w0 = warriors(A), g0 = g.n;
      const loss = V2._t1104Probe.raidOut(W, c, 11, g);
      return { R: last ? { fled: last.fled, win: last.win, ek: last.escKilled, bk: last.banditsKilled } : null, loss, loot: loot.reduce((s, x) => s + x.amt, 0), lootN: loot.length, trIn: A.npcs.indexOf(tr) >= 0, n0, n1: A.npcs.length, w0, w1: warriors(A), g0, g1: g.n, done: !!c._done, killed: A.tradeStats.tradersKilled | 0, raided: A.tradeStats.caravansRaided | 0, rep: A.tradeStats.banditsRepelled | 0 };
    };
    const a = run({ esc: 0, g: 3, fight: 'real', happy: 1 });
    L.push(['②a', a.loss === 1 && Math.abs(a.loot - 40) < 1e-9 && Math.abs(a.loot + 40 * (1 - a.loss) - 40) < 1e-9 && a.trIn && a.n1 === a.n0 && !a.done && a.killed === 0 && a.g1 === a.g0,
      '②a 달아남(호위 0 ↔ 도적 3) — 손실 몫 1 · 짐 40 이 다 도적에게(넘김 + 배달 = 실은 짐 · 사라짐 0) · 행상은 명부에 산다 · 캐러밴은 빈손으로 간다 · 도적 죽음 0', short(a)]);
    const b = run({ esc: 2, w: 2, g: 2, fight: { repel: true, traderDead: true, loss: 0, banditsKilled: 2, escKilled: 0, escStart: 2 } });
    L.push(['②b', b.loss === 0 && b.loot === 0 && !b.trIn && b.n1 === b.n0 - 1 && b.killed === 1 && !b.done && b.rep === 1 && b.w1 === b.w0 && b.g1 === 0,
      '②b 이긴 싸움에서 쓰러진 행상 — 그 사람만 명부에서 빠진다(셈 +1) · 캐러밴은 간다(짐 넘김 0) · 격퇴 셈 · 도적 2 쓰러짐', short(b)]);
    const o1 = run({ esc: 1, w: 1, g: 2, seed: 4242 });
    E.setSeed(4242); const sc = V2._t1079Probe.raidScrum(1, V2._t1079Probe.escAtk({ _weapQ: 0.42 }), 2, null);
    const exp = sc.repel ? 0 : sc.traderDead ? 1 : Math.min(0.85, 0.25 + 0.5 * Math.min(1, sc.escKilled / Math.max(1, sc.escStart + 1)));
    L.push(['②c', Math.abs(o1.loss - exp) < 1e-12 && o1.g1 === Math.max(0, 2 - sc.banditsKilled) && o1.w1 === o1.w0 - sc.escKilled,
      '②c 끔(문 없음) — `_raidScrum` 판 그대로(같은 씨 · 손실 몫 · 도적 사상 · 호위 사상이 스크럼 셈과 같다)', short({ o1, sc, exp })]);
    const d = run({ esc: 3, w: 3, g: 8, fight: 'real', happy: 1 });
    L.push(['②d', d.loss === 1 && Math.abs(d.loot - 40) < 1e-9 && d.raided === 1 && !!d.R && !d.R.fled && d.R.win === 'B' && d.R.ek > 0 && d.w1 === d.w0 - d.R.ek && d.g1 === 8 - d.R.bk,
      '②d 진 싸움(호위 3 ↔ 도적 8 · 행복 1 — 밀려도 사기 높아 싸웠다) — 짐 1 이 도적에게 · 쓰러진 호위만큼 마을 전사가 준다', short(d)]);
  }
  console.log = _log;
  process.stdout.write('@@' + JSON.stringify(L) + '\n');
  process.exit(0);
}

// ── 부모 판 ─────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const child = (bait) => {
  const env = Object.assign({}, process.env); delete env.T1431_RAID_BATTLE;
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  try { const o = JSON.parse(line.slice(2)); return Array.isArray(o) ? o : [['0', false, '[전제] ' + JSON.stringify(o), '']]; } catch (e) { return [['0', false, '[전제] 아이 판이 돌았다', `rc ${r.status} · ${(r.stderr || '').slice(-400)}`]]; }
};
//   T1404 꾸민 세계(길목 단 ↔ 하루 길 캐러밴) — 그 하네스 아이 판을 손잡이만 켜서 빌린다
const t1404 = (knobs, sub) => {
  const env = Object.assign({}, process.env, { T1404H_SUB: sub || 'lurk', T1404_RAID_LURK: '1' }, knobs || {});
  for (const k of ['T1431_RAID_BATTLE', 'T1404_DEN_ROUTE', 'T1404_GANG_FORAGE', 'T1404_GANG_SIZE', 'BANDIT_BODIES']) if (!(knobs && k in knobs)) delete env[k];
  const r = spawnSync(process.execPath, [path.join(__dirname, 'test-t1404-bandit-live.js'), '--child', '-'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  try { return JSON.parse(line.slice(2)); } catch (e) { return { err: `rc ${r.status} · ${(r.stderr || '').slice(-300)}` }; }
};
console.log('\n=== T1431 — 도적과 캐러밴은 몸으로 싸운다(`T1431_RAID_BATTLE` 끔 기본) ===');
const MAIN = child();
for (const [, c, m, d] of MAIN) ok(c, m, d);
//   ③ 서버
{
  const src = fs.readFileSync(path.join(ROOT, 'server', 'bandits.js'), 'utf8');
  ok(/const T1431_RAID_BATTLE = !!process\.env && process\.env\.T1431_RAID_BATTLE === '1';/.test(src) && /if \(T1431_RAID_BATTLE\) world\.raidFight = \(c, g, leg, day\) => _t1431Fight\(c, g, leg, day\);/.test(src)
    && /if \(T1431_RAID_BATTLE\) \{ if \(!_cb\(\)\.inRange\(/.test(src) && /else if \(Math\.floor\(C\.x \/ SZ\) !== cx \|\| Math\.floor\(C\.y \/ SZ\) !== cy\) continue;/.test(src),
    '③a 정적 · 손잡이 끔 기본(`=== \'1\'`) · 켬일 때만 econ 문(`world.raidFight`) · 길목 만남은 켬 = 거리 문(`inRange`) · 끔 = 종전 "같은 칸" 줄 그대로');
  const on1 = t1404({ T1431_RAID_BATTLE: '1' }), on2 = t1404({ T1431_RAID_BATTLE: '1' }), off = t1404({});
  const r1 = on1.raids && on1.raids[0], r2 = on2.raids && on2.raids[0], rf = off.raids && off.raids[0];
  const L1 = r1 && r1.loss ? r1.loss.outbound : null;
  ok(!on1.err && !!r1 && r1.at === 'meet' && (L1 === 0 || L1 === 1) && JSON.stringify(on1.raids) === JSON.stringify(on2.raids) && !off.err && !!rf,
    '③b T1404 꾸민 세계(길목 단 ↔ 하루 길 캐러밴 · 호위 둘) — 켬 = 같은 만남이 몸 전투로 치러진다(손실 몫 0 또는 1 — 식의 부분 몫 없음) · 두 번 같은 답 · 끔도 만남은 선다', short({ on: on1.raids, off: off.raids, err: on1.err || off.err }));
  const nb = t1404({ T1431_RAID_BATTLE: '1', BANDIT_BODIES: '0' }, 'lurkB'), rb = nb.raids && nb.raids[0];
  ok(!nb.err && !!rb && !!r1 && rb.day === r1.day && JSON.stringify(rb.loss) === JSON.stringify(r1.loss) && rb.n1 === r1.n1,
    '③c 몸 없는 단(판 자 — `BANDIT_BODIES=0` · 단원이 장부로 선다) — 같은 날 · 같은 손실 몫 · 같은 남은 단원 = 몸 판과 같은 한 판(같은 식 · 같은 씨)', short({ body: r1, bodiless: rb, err: nb.err }));
}
console.log('\n  ── 미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언)');
const RED = { noRange: ['①g'], fightLow: ['①a', '①b', '②a'], fleeDie: ['①a', '①b', '②a'], cargoGone: ['②a', '②d'] };
const BR = {};
for (const [name, Bt] of Object.entries(BAITS)) {
  const n = fs.readFileSync(Bt.f, 'utf8').split(Bt.at[0]).length - 1;
  const red = n === 1 ? child(name).filter((r) => !r[1]).map((r) => r[0]).sort() : null;
  BR[name] = { n, red, same: !!red && JSON.stringify(red) === JSON.stringify(RED[name].slice().sort()) };
}
ok(BR.noRange.n === 1 && BR.noRange.same, `미끼 — 거리 밖에서도 전투가 서는 사본 → 빨강 줄이 꼭 {${RED.noRange.join(', ')}}`, `바꾼 자리 ${BR.noRange.n} · 빨강 {${(BR.noRange.red || []).join(', ')}}`);
ok(BR.fightLow.n === 1 && BR.fightLow.same, `미끼 — 밀리고 사기 낮은데 싸우는 사본 → 빨강 줄이 꼭 {${RED.fightLow.join(', ')}}`, `바꾼 자리 ${BR.fightLow.n} · 빨강 {${(BR.fightLow.red || []).join(', ')}}`);
ok(BR.fleeDie.n === 1 && BR.fleeDie.same, `미끼 — 달아난 사람이 죽는 사본 → 빨강 줄이 꼭 {${RED.fleeDie.join(', ')}}`, `바꾼 자리 ${BR.fleeDie.n} · 빨강 {${(BR.fleeDie.red || []).join(', ')}}`);
ok(BR.cargoGone.n === 1 && BR.cargoGone.same, `미끼 — 버린 짐이 사라지는 사본 → 빨강 줄이 꼭 {${RED.cargoGone.join(', ')}}`, `바꾼 자리 ${BR.cargoGone.n} · 빨강 {${(BR.cargoGone.red || []).join(', ')}}`);
console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
