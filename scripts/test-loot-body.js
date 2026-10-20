#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-loot-body.js — 노획을 몸이 옮긴다(T826 · 손잡이 `T826_LOOT_BODY` · '1' 만 켬 · T811 몸 짐 위) ==========
//
// ★왜 [지시 T826 · T811 회부 2] 공격이 이기면 결판 흐름(`warWeaponFlow`)의 회수 몫이 결판 순간 공격 마을 곳간에 섰다.
//   켬 ∧ 그 원정 무기가 몸 짐에 실렸으면(`w._armsOnBodies`) 그 몫은 원정 장부(`w._arms.weapon`)에 얹혀 몸 짐으로 귀환하고 장부 도착에 곳간에 선다.
//   지키는 것: ⓐ 정적(손잡이 문 · 조건 다섯 · 곳간은 결판 앞 값으로 · 새 수 0) ·
//             ⓑ war-core 판(같은 씨) — 끔 = 결판 순간 곳간 · 켬(몸 짐 없음) = 끔 · 켬(몸 짐) = 곳간 그대로 · 장부 + 회수 · 거울 = 장부 ·
//                귀환 뒤 곳간 = 끔 귀환 뒤 곳간(소멸 · 생성 0) · 품질 = 끔 · 다시 뜸 — 길 위 노획도 곳간으로 ·
//             ⓒ 호스트 문 — T811 결판 계획: 장부가 늘었으니 땅 0 · 산 몸 짐 합 = 장부(노획 포함)
// ⚠존을 부팅하지 않는다 — war-core 정본(`createWar`)과 호스트 정본(`__p3Bind`)을 그대로 부른다(규칙 사본 0).
// 실행: node scripts/test-loot-body.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const CC = codeOf(fs.readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8'));
const near = (a, b) => Math.abs(a - b) <= 1e-9;

console.log('\n=== 노획을 몸이 옮긴다(T826) ===');

// ── ⓐ 정적 ──────────────────────────────────────────────────────────────────
console.log('\n[ⓐ] 정적 — 손잡이 문 · 조건 · 곳간 되돌림 · 새 수 0');
{
  ok(/function _lootBodyOn\(\) \{ return typeof process !== 'undefined' && !!process\.env && process\.env\.T826_LOOT_BODY === '1'; \}/.test(CC), "ⓐ 손잡이 하나 — `T826_LOOT_BODY === '1'`(기본 끔)");
  const i = CC.indexOf('const _w0 = winnerE.storage.weapon;'), line = i >= 0 ? CC.slice(i, CC.indexOf('\n', i)) : '';
  ok(/if \(_wf && atkWin && _wf\.gain > 0 && w\._arms && !w\._arms\.done && w\._armsOnBodies && _lootBodyOn\(\)\)/.test(line),
    'ⓐ 조건 — 결판 흐름이 있고 · 공격 승 · 회수 > 0 · 원정 장부가 열렸고 · 몸 짐(T811)일 때만(그 밖은 종전 글자)');
  ok(/\{ winnerE\.storage\.weapon = _w0 \|\| 0; w\._arms\.weapon \+= _wf\.gain; w\._arms\.loot = \(w\._arms\.loot \|\| 0\) \+ _wf\.gain;/.test(line)
    && line.indexOf('_lootBodyOn()') < line.indexOf('_syncArmsToEcon(w.atk)'),
    'ⓐ 옮김 — 곳간은 결판 앞 값으로(더하고 빼지 않는다) · 장부 + 회수 · 그 뒤 거울(같은 줄 · 종전 자리)');
  ok(!/[^\w.](?:[1-9]|\d{2,})(?:\.\d+)?(?![\w])/.test(line.slice(line.indexOf('const _w0'), line.indexOf('if (_wf) outcome'))), 'ⓐ 새 수 0');
}

// ── ⓑ war-core 판 ─────────────────────────────────────────────────────────────
console.log('\n[ⓑ] war-core 판 — 같은 씨 · 공격 승 · 끔 / 켬(몸 짐 없음) / 켬(몸 짐)');
{
  process.env.T403_ARMS_LEDGER = '1';
  const econ = require(path.join(ROOT, 'sim', 'economy-sim.js')), WarCore = require(path.join(ROOT, 'sim', 'war-core.js'));
  const seeded = (seed) => { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  const mkW = () => {
    const R0 = Math.random; Math.random = seeded(7);
    const mk = (name, pop, wep) => { const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name }); e.storage.weapon = wep; e.storage.stone = 400; return e; };
    const atk = { name: '대가A', econ: mk('대가A', 60, 200), ccx: 0, ccy: 0 }, def = { name: '대가B', econ: mk('대가B', 8, 20), ccx: 0, ccy: 0 };   // 존망 명분 · 큰 병력 — 공격이 이긴다
    Math.random = R0;
    const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 1 }, logs = [];
    const war = WarCore.createWar({ villages: [atk, def], world, seed: 7, infoRange: 5000, centerOf: (v) => ({ cx: v === atk ? 0 : 200, cy: 0 }), territoryOf: () => 2800,
      log: (d, m) => logs.push(m), food: { consumeFood: econ.consumeFood, totalFoodEquivalent: econ.totalFoodEquivalent } });
    def.econ._warCd = 1e9;
    return { atk, def, world, war, logs };
  };
  //   결판 날 — 결판 주사위는 (날 · 전쟁 번호) 씨다(`_battleRng`) · 끔 판에서 공격이 이기고 회수가 서는 첫 날을 골라 판 넷이 같은 날에 결판한다
  let D = null;
  for (let d = 400; d < 460 && D == null; d++) {
    delete process.env.T826_LOOT_BODY;
    const W = mkW(); W.war.warMobilize(W.atk, W.def, 'existential', 300, W.world.day);
    const w = W.world._warWars[0], g = W.atk.econ.storage.weapon; W.war.warResolveBattle(w, d);
    if (((W.world._warStats || {}).atkWin | 0) > 0 && W.atk.econ.storage.weapon > g) D = d;
  }
  const run = (knob, bodies, reboot) => {
    if (knob) process.env.T826_LOOT_BODY = '1'; else delete process.env.T826_LOOT_BODY;
    const W = mkW(), A = W.atk.econ;
    W.war.warMobilize(W.atk, W.def, 'existential', 300, W.world.day);
    const w = W.world._warWars[0]; if (bodies) w._armsOnBodies = 1;
    const g0 = A.storage.weapon, l0 = w._arms.weapon;
    W.war.warResolveBattle(w, D);
    const st = W.world._warStats || {};
    const r = { atkWin: (st.atkWin | 0) > 0, g0, l0, gSettle: A.storage.weapon, lSettle: w._arms.weapon, loot: w._arms.loot || 0, mirror: A._warArmsOut, q: A._weapQ, lootBody: st.lootBody };
    if (reboot) {
      const e2 = JSON.parse(JSON.stringify(A)), d2 = JSON.parse(JSON.stringify(W.def.econ));
      const atk = { name: '대가A', econ: e2, ccx: 0, ccy: 0 }, def = { name: '대가B', econ: d2, ccx: 0, ccy: 0 };
      const war2 = WarCore.createWar({ villages: [atk, def], world: { day: 401, seed: 7, _warWars: [], _warTributes: [], _warSeq: 9 }, seed: 7, infoRange: 5000, centerOf: () => ({ cx: 0, cy: 0 }), territoryOf: () => 2800, log: null });
      war2.rebuildFromEcon();
      r.gReboot = e2.storage.weapon; r.mirrorReboot = e2._warArmsOut;
      return r;
    }
    w.phase = 'return'; w.eta = W.world.day; W.war.daily(W.world.day);
    r.gHome = A.storage.weapon; r.left = W.world._warWars.length; r.mirrorHome = A._warArmsOut;
    r.log = W.logs.find((m) => m.indexOf('무기 반납') >= 0) || '';
    return r;
  };
  ok(D != null, 'ⓑ 결판 날 — 끔 판에서 공격이 이기고 회수가 서는 날(같은 씨 · 판 넷 공통)', String(D));
  const off = run(false, true), onNo = run(true, false), on = run(true, true), onRb = run(true, true, true);
  delete process.env.T826_LOOT_BODY;
  const gain = off.gSettle - off.g0;
  ok(off.atkWin && gain > 0 && near(off.lSettle, off.l0) && off.lootBody === undefined, 'ⓑ 끔 — 공격 승 · 회수 몫이 결판 순간 곳간에(종전) · 장부 그대로 · 셈 칸 0', `회수 ${gain.toFixed(3)} · 장부 ${off.l0}`);
  ok(near(onNo.gSettle, off.gSettle) && near(onNo.lSettle, off.lSettle) && onNo.lootBody === undefined && near(onNo.gHome, off.gHome), 'ⓑ 켬이어도 몸 짐이 없으면(T811 끔 · 헤드리스) 끔과 같다', `곳간 ${onNo.gSettle.toFixed(3)}`);
  ok(on.atkWin && on.gSettle === on.g0 && near(on.lSettle, on.l0 + gain) && near(on.loot, gain) && near(on.mirror, on.lSettle) && near(on.lootBody, gain),
    'ⓑ 켬(몸 짐) — 결판 순간 곳간 그대로(결판 앞 값) · 장부 + 회수 · 거울 = 장부 · 셈 칸 = 회수', `곳간 ${on.g0} · 장부 ${on.l0} → ${on.lSettle.toFixed(3)} · 거울 ${on.mirror}`);
  ok(on.q != null && near(on.q, off.q), 'ⓑ 켬 — 품질(`_weapQ`)은 결판 흐름이 섞은 그대로(끔과 같다)', `${on.q} · ${off.q}`);
  ok(on.left === 0 && near(on.gHome, off.gHome) && on.mirrorHome === undefined, 'ⓑ 켬 귀환 — 장부 도착에 곳간 = 끔 귀환 뒤 곳간(소멸 · 생성 0) · 거울 칸 지움', `곳간 ${on.gHome.toFixed(6)} · 끔 ${off.gHome.toFixed(6)}`);
  ok(/· 노획 \d/.test(on.log) && off.log.indexOf('노획') < 0, 'ⓑ 귀환 로그 — 켬만 "· 노획 n"(끔 글자 그대로)', on.log);
  ok(near(onRb.gReboot, off.gHome) && onRb.mirrorReboot === undefined, 'ⓑ 켬 다시 뜸(길 위) — 거울(노획 포함)이 곳간으로(T764 ⓕ 문 그대로 · 잃는 것 0)', `곳간 ${onRb.gReboot.toFixed(6)}`);
}

// ── ⓒ 호스트 문 — T811 결판 계획 ──────────────────────────────────────────────────
console.log('\n[ⓒ] 호스트 문 — 장부가 늘면 땅 0 · 산 몸 짐 = 장부(노획 포함)');
{
  const env = Object.assign({}, process.env, { T811_ARMS_BODY: '1' });
  const js = `const V=require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))});const players=new Map();let drops=0;`
    + `const H=V.__p3Bind({deps:{players,npcs:new Set(),broadcast(){},deathDrop:()=>{drops++;}},_warStat:{}});`
    + `const B=[0,1,2].map(i=>{const p={pid:'q'+i,hp:100,inventory:{}};players.set(p.pid,p);return p;});const w={id:1,_arms:{weapon:12,out:12,done:false}};H._warArmsLoad({w,pids:B.map(p=>p.pid)});`
    //   결판(공격 승 · 노획 6) — 장부 12 → 18 · 셋째 몸 쓰러짐 → 땅 0 · 산 몸 둘 = 9 씩
    + `w._arms.weapon=18;w._arms.loot=6;B[2].hp=0;const pl=H._t811Plan(w,['q2']);H._t811Off(w,B[2],pl,true);H._t811Sync(w,'settle');`
    + `const inv=p=>(p.inventory&&p.inventory.weapon)||0;process.stdout.write(JSON.stringify({frac:pl.frac,drops,hand:B.map(inv),sum:[...w._armsPack.values()].reduce((a,x)=>a+x,0)}));`;
  const o = JSON.parse(execFileSync(process.execPath, ['-e', js], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  ok(o.frac === 0 && o.drops === 0 && near(o.sum, 18) && near(o.hand[0], 9) && near(o.hand[1], 9), 'ⓒ 노획으로 장부가 늘었다 → 땅 0(Δ ≤ 0) · 산 몸 둘이 장부 18(노획 6 포함)을 나눠 진다', JSON.stringify(o));
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
