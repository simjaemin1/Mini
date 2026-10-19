#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-arms-body.js — 2층: 몸이 무기를 든다(T811 · 손잡이 `T811_ARMS_BODY` · '1' 만 켬) ==========
//
// ★왜 [지시 T811 · T764 회부 2 · T781 · T790 §3] T403 무기 반출 켬이면 원정 짐(`w._arms.weapon`)에 무기가 있지만 몸 손은 빈다.
//   켜면 그 짐이 병사 몸 짐 칸(T423 그 칸 = `inventory.weapon`)에 실린다 — 정본은 장부(ⓐ 장부 도착 · 결정론), 몸 짐은 그 거울이다.
//   지키는 것: ⓐ 정적(손잡이 문 · war-core 한 줄 · 호스트 다섯 자리 · 끔이면 무동작) ·
//             ⓑ 호스트 문(아이 프로세스 · 켬/끔) — 싣기(몸 합 = 장부 · 몸이 원래 든 무기 무접촉) · 결판 공격 패(쓰러진 몸 = 죽음 캐논 낙하 문 ·
//                땅 ≤ 장부가 잃은 몫 · 산 몸 합 = 결판 뒤 장부) · 공격 승(Δ 0 — 낙하 0) · 포로(몸에서만) · 귀환 거둠 · 끔 = 몸 · 표 무접촉 ·
//             ⓒ war-core 장부 도착 — 몸 짐 표가 선 원정만 `armsCollect` 를 부른다(곳간 = 장부 · 끔 = 안 부른다 · 로그 글자 그대로)
// ⚠존을 부팅하지 않는다 — 호스트 정본(`__p3Bind`)과 war-core 정본(`createWar`)을 그대로 부른다(규칙 사본 0).
// 실행: node scripts/test-arms-body.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const SRC_V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'), CV = codeOf(SRC_V);
const SRC_C = fs.readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8'), CC = codeOf(SRC_C);
const fnBody = (C, name) => { const i = C.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = C.indexOf('{', i); for (let k = j; k < C.length; k++) { if (C[k] === '{') d++; else if (C[k] === '}') { d--; if (!d) return C.slice(i, k + 1); } } return ''; };
const near = (a, b) => Math.abs(a - b) <= 1e-9;

console.log('\n=== 2층 — 몸이 무기를 든다(T811) ===');

// ── ⓐ 정적 ──────────────────────────────────────────────────────────────────
console.log('\n[ⓐ] 정적 — 손잡이 문 · war-core 한 줄 · 호스트 자리 · 새 수 0');
{
  ok(/const T811_ARMS_BODY = process\.env\.T811_ARMS_BODY === '1';/.test(CV), "ⓐ 손잡이 하나 — `T811_ARMS_BODY === '1'`(기본 끔)");
  ok(/if \(!T811_ARMS_BODY \|\| !w \|\| !w\._arms/.test(fnBody(CV, '_warArmsLoad')) && /if \(!T811_ARMS_BODY \|\| !M/.test(fnBody(CV, '_t811Plan')),
    'ⓐ 끔 문 — 싣기 · 결판 계획이 손잡이를 먼저 본다(끔이면 표 `_armsPack` 이 안 선다 → 나머지 자리는 표가 없어 무동작)');
  const inst = fnBody(CV, '_warInstantiateAttackers');
  ok(inst.indexOf('_warRationLoad(body);') >= 0 && inst.indexOf('_warArmsLoad(body);') > inst.indexOf('_warRationLoad(body);'), 'ⓐ ① 싣기 — 징발 몸이 서는 자리 · T423 팩 바로 뒤');
  const end = fnBody(CV, '_warEndFight');
  ok(/const _t811 = _t811Plan\(w, deadA\);/.test(end) && /if \(_t811\) _t811Off\(w, p, _t811, false\);/.test(end) && /if \(_t811\) \{ for \(const pid of deadA\) _t811Off\(w, players\.get\(pid\), _t811, true\); _t811Sync\(w, 'settle'\); \}/.test(end)
    && end.indexOf('_t811Off(w, players.get(pid), _t811, true)') < end.indexOf('_warDespawnPid(pid)'),
    'ⓐ ② 결판 — 계획(포로를 떼기 전 쓰러진 몸 전부) · 포로는 몸에서만 · 전사자는 사라지기 전에 낙하 · 그 뒤 산 몸 = 장부');
  ok(/state\.deps\.deathDrop\(p\)/.test(fnBody(CV, '_t811Off')), 'ⓐ ② 낙하 = 죽음 캐논 그 문(`deps.deathDrop` = zone `_deathDrop` · `_bxDie` 와 같은 자리)');
  ok(/_warArmsUnload\(body\);/.test(fnBody(CV, '_warCleanupBody')) && /armsCollect: \(w\) => _warArmsCollect\(w\),/.test(CV), 'ⓐ ③ 귀환 — war-core 훅 `armsCollect` · 몸이 먼저 끝나면 `_warCleanupBody` 가 몸 짐만 내린다');
  ok(/const _armsBody = \(w\._armsOnBodies && typeof opts\.armsCollect === 'function'\)/.test(CC) && CC.indexOf('const _armsBody') < CC.indexOf('const _armsBack = warArmsReturn(w);'),
    'ⓐ ③ war-core — 장부 도착(무기 반납 바로 앞)에 표가 선 원정만 거둔다 · 반납 수는 장부 그대로');
  ok(fnBody(CC, 'warArmsReturn').indexOf('_armsOnBodies') < 0 && fnBody(CC, 'warWeaponFlow').indexOf('_armsOnBodies') < 0 && fnBody(CC, '_syncArmsToEcon').indexOf('_armsOnBodies') < 0,
    'ⓐ 장부 무접촉 — 반납 · 결판 흐름 · 거울 셋 다 그대로(몸 짐은 거울의 거울)');
  const blk = ['_t811Sync', '_warArmsLoad', '_t811Plan', '_t811Off', '_warArmsCollect'].map((n) => fnBody(CV, n)).join('\n');
  ok(!/[^\w.](?:[1-9]|\d{2,})(?:\.\d+)?(?![\w])/.test(blk.replace(/1e-9/g, '')), 'ⓐ 새 수 0 — 0 만(1e-9 는 짐 칸 지우기 문턱 · `_warBagWrite` 그 값)');
}

// ── ⓑ 호스트 문(아이 프로세스 — 손잡이는 모듈을 싣는 순간 읽는다) ─────────────────────
console.log('\n[ⓑ] 호스트 문 — 싣기 · 결판(패 · 승 · 포로) · 귀환 거둠(켬 · 끔)');
const child = (knob) => {
  const env = Object.assign({}, process.env); if (knob) env.T811_ARMS_BODY = '1'; else delete env.T811_ARMS_BODY;
  const js = `const V=require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))});`
    + `const players=new Map();let drops=0;`
    //   낙하 목 — 죽음 캐논의 자리(짐 절반 · 여기선 손 무기의 절반만 본다 · 부른 수를 센다)
    + `const deathDrop=(p)=>{drops++;const q=(p.inventory&&p.inventory.weapon)||0;const d=Math.floor(q/2);if(d>0)p.inventory.weapon=q-d;};`
    + `const H=V.__p3Bind({deps:{players,npcs:new Set(),broadcast(){},deathDrop},_warStat:{}});`
    + `const mk=(own)=>{const out=[];for(let i=0;i<3;i++){const p={pid:'p'+i,hp:100,inventory:{}};if(own&&i===0)p.inventory.weapon=own;players.set(p.pid,p);out.push(p);}return out;};`
    + `const inv=(p)=>(p.inventory&&p.inventory.weapon)||0,sum=(w)=>w._armsPack?[...w._armsPack.values()].reduce((a,x)=>a+x,0):null;`
    + `const out={};`
    //   싣기 — 장부 15 · 몸 셋(첫 몸은 제 무기 2 를 들고 있다)
    + `{const B=mk(2),w={id:1,_arms:{weapon:15,out:15,done:false}},body={w,pids:B.map(p=>p.pid)};out.load={n:H._warArmsLoad(body),hand:B.map(inv),sum:sum(w),on:w._armsOnBodies==null?null:w._armsOnBodies};`
    //     결판(공격 패) — 장부 15 → 9(Δ 6) · 셋째 몸(짐 5) 쓰러짐 → 땅 ≤ 5 · 산 몸 둘 = 4.5 씩
    + `w._arms.weapon=9;B[2].hp=0;const pl=H._t811Plan(w,['p2']);H._t811Off(w,B[2],pl,true);H._t811Sync(w,'settle');const st0=H.state._warStat.t811==null;const st=H._t811Stat();`
    + `out.lose={frac:pl&&pl.frac,hand:B.map(inv),sum:sum(w),drops,st0,fall:st.fall,gone:st.gone,gap:st.gap};`
    //     귀환 거둠 — 몸 짐 합을 돌려주고 손은 제 무기만
    + `const back=H._warArmsCollect(w);out.back={back,hand:B.map(inv),pack:w._armsPack,on:w._armsOnBodies};}`
    //   결판(공격 승) — 장부 그대로(Δ 0) · 쓰러진 몸 짐은 땅에 안 간다(낙하 0) · 산 몸 둘 = 7.5 씩
    + `{players.clear();const B=mk(0),w={id:2,_arms:{weapon:15,out:15,done:false}},body={w,pids:B.map(p=>p.pid)};H._warArmsLoad(body);const d0=drops;`
    + `B[2].hp=0;const pl=H._t811Plan(w,['p2']);H._t811Off(w,B[2],pl,true);H._t811Sync(w,'settle');out.win={frac:pl&&pl.frac,drops:drops-d0,hand:B.map(inv),sum:sum(w)};`
    //     포로 — 몸에서만 내린다(낙하 0) · 산 몸 하나 = 장부
    + `const d1=drops;const pl2=H._t811Plan(w,[]);H._t811Off(w,B[1],pl2,false);B[1].simCaptive=1;H._t811Sync(w,'settle');out.cap={drops:drops-d1,hand:B.map(inv),sum:sum(w)};`
    //     몸이 장부보다 먼저 끝남 — 몸 짐만 내리고 표가 닫힌다(장부는 그대로)
    + `H._warArmsUnload(body);out.orphan={hand:B.map(inv),pack:w._armsPack,ledger:w._arms.weapon};}`
    //   T403 끔(짐 없음) — 아무것도 안 싣는다
    + `{players.clear();const B=mk(0),w={id:3},body={w,pids:B.map(p=>p.pid)};out.noArms={n:H._warArmsLoad(body),hand:B.map(inv),pack:w._armsPack==null};}`
    + `out.stat=H.state._warStat.t811==null?null:H.state._warStat.t811;out.knob=H.T811_ARMS_BODY;`
    + `process.stdout.write(JSON.stringify(out));`;
  const o = execFileSync(process.execPath, ['-e', js], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return JSON.parse(o.slice(o.indexOf('{')));
};
{
  const off = child(false), on = child(true);
  ok(off.knob === false && off.load.n === 0 && off.load.hand.join() === '2,0,0' && off.load.sum === null && off.load.on === null,
    'ⓑ 끔 — 싣기 0 · 손 그대로(제 무기 2 · 0 · 0) · 표 · 칸 0', JSON.stringify(off.load));
  ok(off.lose.frac == null && off.lose.drops === 0 && off.lose.hand.join() === '2,0,0' && off.lose.st0 === true && off.back.back === null,
    'ⓑ 끔 — 결판 · 귀환도 무동작(계획 null · 낙하 0 · 셈 칸 0 · 거둠 null) = main 바이트', JSON.stringify({ lose: off.lose, back: off.back.back }));
  ok(on.knob === true && on.load.n === 3 && near(on.load.sum, 15) && near(on.load.hand[0], 2 + 5) && near(on.load.hand[1], 5) && near(on.load.hand[2], 5) && on.load.on === 3,
    'ⓑ ① 켬 싣기 — 몸 합 = 장부 15(몫 = 장부 ÷ 몸) · 몸이 원래 든 무기 2 는 그대로 위에', JSON.stringify(on.load));
  ok(near(on.lose.frac, 1) && on.lose.drops === 1 && near(on.lose.sum, 9) && near(on.lose.hand[0], 2 + 4.5) && near(on.lose.hand[1], 4.5) && near(on.lose.fall + on.lose.gone, 5) && on.lose.fall <= 6 + 1e-9 && on.lose.gap <= 1e-9,
    'ⓑ ② 켬 공격 패 — 쓰러진 몸 = 낙하 문 한 번 · 땅 + 사라짐 = 그 몸 짐 5 · 땅 ≤ 장부가 잃은 6 · 산 몸 합 = 결판 뒤 장부 9 · 차 0', JSON.stringify(on.lose));
  ok(near(on.back.back, 9) && on.back.hand[0] === 2 && on.back.hand[1] === 0 && on.back.pack === null && on.back.on === 0,
    'ⓑ ③ 켬 귀환 거둠 — 몸 짐 합(= 장부 9)을 돌려주고 손엔 제 무기만 · 표 닫힘', JSON.stringify(on.back));
  ok(on.win.frac === 0 && on.win.drops === 0 && near(on.win.sum, 15) && near(on.win.hand[0], 7.5) && near(on.win.hand[1], 7.5),
    'ⓑ ② 켬 공격 승 — 장부가 안 잃었다(Δ 0) → 낙하 0 · 산 몸 둘이 장부 15 를 나눈다(땅에 새 무기 0)', JSON.stringify(on.win));
  ok(on.cap.drops === 0 && near(on.cap.sum, 15) && near(on.cap.hand[0], 15) && on.cap.hand[1] === 0,
    'ⓑ ② 켬 포로 — 몸에서만 내린다(낙하 0) · 남은 산 몸 하나 = 장부', JSON.stringify(on.cap));
  ok(on.orphan.pack === null && on.orphan.hand.join() === '0,0,0' && on.orphan.ledger === 15, 'ⓑ 켬 몸이 먼저 끝남 — 몸 짐만 내린다 · 장부 15 그대로(war-core 가 혼자 들고 간다)', JSON.stringify(on.orphan));
  ok(on.noArms.n === 0 && on.noArms.pack && on.noArms.hand.join() === '0,0,0', 'ⓑ 켬이어도 짐이 없으면(T403 끔) 아무것도 안 싣는다', JSON.stringify(on.noArms));
}

// ── ⓒ war-core 장부 도착 ──────────────────────────────────────────────────────────
console.log('\n[ⓒ] war-core 장부 도착 — 몸 짐 표가 선 원정만 거둔다 · 곳간 = 장부');
{
  process.env.T403_ARMS_LEDGER = '1';
  const econ = require(path.join(ROOT, 'sim', 'economy-sim.js')), WarCore = require(path.join(ROOT, 'sim', 'war-core.js'));
  const seeded = (seed) => { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  const run = (bodies) => {
    const R0 = Math.random; Math.random = seeded(7);
    const mk = (name, pop) => { const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name }); e.storage.weapon = 40; e.storage.stone = 400; return e; };
    const atk = { name: '대가A', econ: mk('대가A', 30), ccx: 0, ccy: 0 }, def = { name: '대가B', econ: mk('대가B', 24), ccx: 0, ccy: 0 };
    Math.random = R0;
    const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 1 }, calls = [], logs = [];
    const war = WarCore.createWar({ villages: [atk, def], world, seed: 7, infoRange: 5000, centerOf: (v) => ({ cx: v === atk ? 0 : 200, cy: 0 }), territoryOf: () => 2800,
      log: (d, m) => logs.push(m), food: { consumeFood: econ.consumeFood, totalFoodEquivalent: econ.totalFoodEquivalent },
      armsCollect: (w) => { calls.push([w._arms.weapon, w._arms.done]); w._armsOnBodies = 0; return w._arms.weapon; } });
    def.econ._warCd = 1e9;
    war.warMobilize(atk, def, 'feud', 300, world.day);
    const w = world._warWars[0]; const g0 = atk.econ.storage.weapon, n = w._arms.weapon;
    if (bodies) w._armsOnBodies = 1;
    w.phase = 'return'; w.eta = world.day; war.daily(world.day);
    return { calls, back: atk.econ.storage.weapon - g0, n, log: logs.find((m) => m.indexOf('무기 반납') >= 0) || '' };
  };
  const a = run(true), b = run(false);
  ok(a.calls.length === 1 && a.calls[0][0] === a.n && a.calls[0][1] === false && near(a.back, a.n),
    'ⓒ 표가 선 원정 — 반납 바로 앞에 한 번 부른다(그때 장부 = 짐 · 아직 안 닫힘) · 곳간 + 장부 그대로', JSON.stringify({ calls: a.calls, back: a.back, n: a.n }));
  ok(/· 몸 짐 \d/.test(a.log), 'ⓒ 귀환 로그에 몸 짐 합(켬 원정만)', a.log);
  ok(b.calls.length === 0 && near(b.back, b.n) && b.log.indexOf('몸 짐') < 0, 'ⓒ 표 없는 원정(끔) — 안 부른다 · 곳간 + 장부 · 로그 글자 그대로', JSON.stringify({ calls: b.calls.length, back: b.back, log: b.log }));
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
