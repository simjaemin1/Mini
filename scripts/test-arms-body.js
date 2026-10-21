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
  ok(/if \(!T811_ARMS_BODY \|\| !w \|\| !w\._arms/.test(fnBody(CV, '_warArmsLoad')) && /const _t811 = T811_ARMS_BODY && w\._armsPack \?/.test(fnBody(CV, '_warEndFight')),
    'ⓐ 끔 문 — 싣기 · 결판 갈래가 손잡이를 먼저 본다(끔이면 표 `_armsPack` 이 안 선다 → 나머지 자리는 표가 없어 무동작)');
  const inst = fnBody(CV, '_warInstantiateAttackers');
  ok(inst.indexOf('_warRationLoad(body);') >= 0 && inst.indexOf('_warArmsLoad(body);') > inst.indexOf('_warRationLoad(body);'), 'ⓐ ① 싣기 — 징발 몸이 서는 자리 · T423 팩 바로 뒤');
  const end = fnBody(CV, '_warEndFight');
  ok(/if \(_t811\) _t811\.field \+= _t811Fall\(w, p\);/.test(end) && /for \(const pid of deadA\) \{ const p = players\.get\(pid\); const q = _t811Fall\(w, p\); _t811\.field \+= q;/.test(end)
    && /_t857Pick\(w, winner, atkSurv, defSurv, _t811\.field, _t811\.dead\);\s*_t811Sync\(w, 'settle'\);\s*if \(state\.war && state\.war\.syncArmsMirror\) state\.war\.syncArmsMirror\(w\.atk\);/.test(end)
    && end.indexOf('_t857Pick(') < end.indexOf('_warDespawnPid(pid)'),
    'ⓐ ② 결판(★T857) — 끌려간 · 쓰러진 몸 짐 → 결판 자리 더미 · 이긴 쪽이 줍고 · 그 뒤 산 몸 = 장부 · 거울 — 전사자가 사라지기 전에');
  ok(/w\._arms\.weapon = Math\.max\(0, \(w\._arms\.weapon \|\| 0\) - mine\);/.test(fnBody(CV, '_t811Fall')), 'ⓐ ② 장부 −같은 몫(떨어진 몸 짐 그대로)');
  const pk = fnBody(CV, '_t857Pick');
  ok(/state\.deps\.deathDrop\(deadP\)/.test(pk) && /WC\.weaponGive\(w\.def\.econ,/.test(pk) && /w\._arms\.weapon = \(w\._arms\.weapon \|\| 0\) \+ field;/.test(pk),
    'ⓐ ② 줍기 — 공격 승 = 장부 · 방어 승 = 방어 곳간(결판 흐름의 그 문 `weaponGive`) · 주울 몸이 없으면 죽음 캐논 낙하 문(`deps.deathDrop`)');
  ok(/const _bodyLose = !atkWin && w\._arms && !w\._arms\.done && w\._armsOnBodies; const _wf = _bodyLose \? null : warWeaponFlow\(/.test(CC),
    'ⓐ ② 묶음 하나 — 몸 짐 판의 공격 패는 war-core 결판 흐름이 공격 짐을 안 건드린다(회수 몫 즉시 곳간 0 · 잃는 몫 = 쓰러진 몸 짐)');
  ok(/_warArmsUnload\(body\);/.test(fnBody(CV, '_warCleanupBody')) && /armsCollect: \(w\) => _warArmsCollect\(w\),/.test(CV), 'ⓐ ③ 귀환 — war-core 훅 `armsCollect` · 몸이 먼저 끝나면 `_warCleanupBody` 가 몸 짐만 내린다');
  ok(/const _armsBody = \(w\._armsOnBodies && typeof opts\.armsCollect === 'function'\)/.test(CC) && CC.indexOf('const _armsBody') < CC.indexOf('const _armsBack = warArmsReturn(w);'),
    'ⓐ ③ war-core — 장부 도착(무기 반납 바로 앞)에 표가 선 원정만 거둔다 · 반납 수는 장부 그대로');
  ok(fnBody(CC, 'warArmsReturn').indexOf('_armsOnBodies') < 0 && fnBody(CC, 'warWeaponFlow').indexOf('_armsOnBodies') < 0 && fnBody(CC, '_syncArmsToEcon').indexOf('_armsOnBodies') < 0,
    'ⓐ 장부 무접촉 — 반납 · 결판 흐름 · 거울 셋 다 그대로(몸 짐은 거울의 거울)');
  const blk = ['_t811Sync', '_warArmsLoad', '_t811Fall', '_warArmsCollect'].map((n) => fnBody(CV, n)).join('\n') + pk;
  ok(!/[^\w.](?:[1-9]|\d{2,})(?:\.\d+)?(?![\w])/.test(blk.replace(/1e-9/g, '')), 'ⓐ 새 수 0 — 0 만(1e-9 = 짐 칸 지우기 문턱 · `_warBagWrite` 그 값)');
}

// ── ⓑ 호스트 문(아이 프로세스 — 손잡이는 모듈을 싣는 순간 읽는다) ─────────────────────
console.log('\n[ⓑ] 호스트 문 — 싣기 · 결판(패 · 승 · 포로 · 주울 몸 없음) · 귀환 거둠(켬 · 끔)');
const child = (knob) => {
  const env = Object.assign({}, process.env); if (knob) env.T811_ARMS_BODY = '1'; else delete env.T811_ARMS_BODY;
  const js = `const V=require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))}),WC=require(${JSON.stringify(path.join(ROOT, 'sim', 'war-core.js'))});`
    + `const players=new Map();let drops=0;`
    //   낙하 목 — 죽음 캐논의 자리(짐 kg 절반 · 낱개 · 무거운 것부터 — 여기선 손 무기 낱개의 절반(적어도 하나)만 본다 · 부른 수를 센다)
    + `const deathDrop=(p)=>{drops++;const q=(p.inventory&&p.inventory.weapon)||0;const c=Math.floor(q);if(c<1)return;const d=Math.max(1,Math.floor(c/2));p.inventory.weapon=q-d;};`
    + `const H=V.__p3Bind({deps:{players,npcs:new Set(),broadcast(){},deathDrop},_warStat:{},war:{weaponGive:WC.weaponGive,syncArmsMirror(){}}});`
    + `const mk=(own)=>{const out=[];for(let i=0;i<3;i++){const p={pid:'p'+i,hp:100,inventory:{}};if(own&&i===0)p.inventory.weapon=own;players.set(p.pid,p);out.push(p);}return out;};`
    + `const inv=(p)=>(p.inventory&&p.inventory.weapon)||0,sum=(w)=>w._armsPack?[...w._armsPack.values()].reduce((a,x)=>a+x,0):null;`
    + `const def=()=>({econ:{storage:{weapon:10},_weapQ:0.5}});const D=(ds)=>ds.map(k=>{const p={pid:k,hp:100};players.set(k,p);return k;});`
    + `const out={};`
    //   싣기 — 장부 15 · 몸 셋(첫 몸은 제 무기 2 를 들고 있다)
    + `{const B=mk(2),w={id:1,_arms:{weapon:15,out:15,done:false},def:def(),weapQ:0.8,atk:{econ:{}}},body={w,pids:B.map(p=>p.pid)};out.load={n:H._warArmsLoad(body),hand:B.map(inv),sum:sum(w),on:w._armsOnBodies==null?null:w._armsOnBodies};`
    //     결판(공격 패 · 방어 산 몸 있음) — 셋째 몸(짐 5) 쓰러짐 → 결판 자리 5 · 장부 15 → 10 · 방어가 주워 곳간 10 → 15 · 산 몸 둘 = 5 씩
    + `B[2].hp=0;let f=H._t811Fall(w,B[2]);H._t857Pick(w,'B',['p0','p1'],D(['d1']),f,B[2]);H._t811Sync(w,'settle');const st0=H.state._warStat.t811==null;const st=Object.assign({},H._t811Stat());`
    + `out.lose={st0,field:f,ledger:w._arms.weapon,defG:w.def.econ.storage.weapon,defQ:w.def.econ._weapQ,hand:B.map(inv),sum:sum(w),drops,st};`
    //     귀환 거둠 — 몸 짐 합을 돌려주고 손은 제 무기만
    + `const back=H._warArmsCollect(w);out.back={back,hand:B.map(inv),pack:w._armsPack,on:w._armsOnBodies};}`
    //   결판(공격 승) — 셋째 몸 짐 5 → 결판 자리 → 공격 산 몸이 주워 장부로 돌아온다(15) · 산 몸 둘 = 7.5 씩 · 낙하 0
    + `{players.clear();const B=mk(0),w={id:2,_arms:{weapon:15,out:15,done:false},def:def(),atk:{econ:{}}},body={w,pids:B.map(p=>p.pid)};H._warArmsLoad(body);const d0=drops,s0=Object.assign({},H._t811Stat());`
    + `B[2].hp=0;const f=H._t811Fall(w,B[2]);H._t857Pick(w,'A',['p0','p1'],[],f,B[2]);H._t811Sync(w,'settle');const s1=H._t811Stat();out.win={field:f,drops:drops-d0,hand:B.map(inv),sum:sum(w),ledger:w._arms.weapon,pickA:s1.pickA-s0.pickA,fall:s1.fall-s0.fall};`
    //     포로(공격 몸) — 몸 짐 → 결판 자리 · 이긴 방어가 줍는다 · 남은 산 몸 하나 = 장부
    + `const g0=w.def.econ.storage.weapon,d1=drops;B[1].simCaptive=1;const f2=H._t811Fall(w,B[1]);H._t857Pick(w,'B',['p0'],D(['d2']),f2,null);H._t811Sync(w,'settle');out.cap={field:f2,drops:drops-d1,hand:B.map(inv),sum:sum(w),ledger:w._arms.weapon,defGot:w.def.econ.storage.weapon-g0};`
    //     몸이 장부보다 먼저 끝남 — 몸 짐만 내리고 표가 닫힌다(장부는 그대로)
    + `const L=w._arms.weapon;H._warArmsUnload(body);out.orphan={hand:B.map(inv),pack:w._armsPack,ledger:w._arms.weapon,L};}`
    //   주울 산 몸이 없다(공격 패 · 방어 몸 0) — 죽음 캐논 낙하(낱개) · 남은 몫은 땅 장부 · 몸이 든 다른 것은 그대로
    + `{players.clear();const B=mk(0),w={id:4,_arms:{weapon:12.5,out:13,done:false},def:def(),atk:{econ:{}}},body={w,pids:B.map(p=>p.pid)};H._warArmsLoad(body);B[2].inventory.fish=3;const s0=Object.assign({},H._t811Stat()),d0=drops;`
    + `B[2].hp=0;const f=H._t811Fall(w,B[2]);H._t857Pick(w,'B',['p0','p1'],[],f,B[2]);const s1=H._t811Stat();out.none={field:f,drops:drops-d0,ground:s1.ground-s0.ground,items:s1.groundItems-s0.groundItems,deadInv:B[2].inventory,ledger:w._arms.weapon,defG:w.def.econ.storage.weapon};}`
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
  ok(off.lose.field === 0 && off.lose.drops === 0 && off.lose.ledger === 15 && off.lose.defG === 10 && off.lose.hand.join() === '2,0,0' && off.lose.st0 === true && off.back.back === null,
    'ⓑ 끔 — 결판 · 귀환도 무동작(떨어짐 0 · 장부 · 방어 곳간 그대로 · 셈 칸 0 · 거둠 null) = main 바이트', JSON.stringify({ lose: off.lose, back: off.back.back }));
  ok(on.knob === true && on.load.n === 3 && near(on.load.sum, 15) && near(on.load.hand[0], 2 + 5) && near(on.load.hand[1], 5) && near(on.load.hand[2], 5) && on.load.on === 3,
    'ⓑ ① 켬 싣기 — 몸 합 = 장부 15(몫 = 장부 ÷ 몸) · 몸이 원래 든 무기 2 는 그대로 위에', JSON.stringify(on.load));
  const L = on.lose;
  ok(near(L.field, 5) && near(L.ledger, 10) && near(L.defG, 15) && near(L.sum, 10) && near(L.hand[0], 2 + 5) && near(L.hand[1], 5) && L.drops === 0 && near(L.st.fall, L.st.pickA + L.st.pickB + L.st.ground) && near(L.st.pickB, 5) && L.st.gap <= 1e-9,
    'ⓑ ② 켬 공격 패 — 쓰러진 몸 짐 5 통째로 결판 자리 · 장부 15 → 10 · 방어 산 몸이 주워 곳간 10 → 15 · 산 몸 합 = 장부 · 땅 = 주움 + 남음', JSON.stringify(L));
  ok(near(L.defQ, (0.5 * 10 + 0.8 * 5) / 15), 'ⓑ ② 켬 방어가 주운 무기 — 곳간 품질에 섞인다(결판 흐름의 그 문 `weaponGive` · 가중평균)', String(L.defQ));
  ok(near(on.back.back, 10) && on.back.hand[0] === 2 && on.back.hand[1] === 0 && on.back.pack === null && on.back.on === 0,
    'ⓑ ③ 켬 귀환 거둠 — 몸 짐 합(= 장부 10)을 돌려주고 손엔 제 무기만 · 표 닫힘', JSON.stringify(on.back));
  ok(near(on.win.field, 5) && on.win.drops === 0 && near(on.win.ledger, 15) && near(on.win.sum, 15) && near(on.win.hand[0], 7.5) && near(on.win.hand[1], 7.5) && near(on.win.pickA, on.win.fall),
    'ⓑ ② 켬 공격 승 — 전사자 짐 5 도 결판 자리에 떨어지고(장부 −5) 공격 산 몸이 주워 장부로(+5) · 산 몸 둘이 15 를 나눠 진다 · 낙하 0', JSON.stringify(on.win));
  ok(near(on.cap.field, 7.5) && on.cap.drops === 0 && near(on.cap.defGot, 7.5) && near(on.cap.ledger, 7.5) && near(on.cap.hand[0], 7.5) && on.cap.hand[1] === 0,
    'ⓑ ② 켬 포로 — 끌려간 몸 짐 7.5 → 결판 자리 → 이긴 방어가 줍는다 · 남은 산 몸 하나 = 장부 7.5', JSON.stringify(on.cap));
  ok(on.orphan.pack === null && on.orphan.hand.join() === '0,0,0' && on.orphan.ledger === on.orphan.L, 'ⓑ 켬 몸이 먼저 끝남 — 몸 짐만 내린다 · 장부 그대로(war-core 가 혼자 들고 간다)', JSON.stringify(on.orphan));
  const N = on.none;
  ok(N.drops >= 1 && near(N.field, 12.5 / 3) && near(N.ground, N.field) && N.items === Math.floor(N.field) && N.deadInv.fish === 3 && near(N.defG, 10) && near(N.ledger, 12.5 - N.field),
    'ⓑ ② 켬 주울 산 몸이 없다 — 죽음 캐논 낙하 문으로 낱개를 다 떨군다(낱개 = 내림) · 땅 장부 = 떨어진 몫 전부 · 몸이 든 다른 것(생선 3) 그대로 · 방어 곳간 무변', JSON.stringify(N));
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
  //   ★[T857] 묶음 하나 — 몸 짐 판의 공격 패는 결판 흐름이 공격 짐 · 방어 곳간을 안 건드린다(잃는 몫 = 쓰러진 몸 짐 · 회수 = 이긴 몸이 주운 몫 — 호스트)
  const battle = (bodies) => {
    const R0 = Math.random; Math.random = seeded(7);
    const mk = (name, pop) => { const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name }); e.storage.weapon = 40; e.storage.stone = 400; return e; };
    const atk = { name: '대가A', econ: mk('대가A', 30), ccx: 0, ccy: 0 }, def = { name: '대가B', econ: mk('대가B', 24), ccx: 0, ccy: 0 };
    Math.random = R0;
    const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 1 };
    const war = WarCore.createWar({ villages: [atk, def], world, seed: 7, infoRange: 5000, centerOf: (v) => ({ cx: v === atk ? 0 : 200, cy: 0 }), territoryOf: () => 2800, log: null,
      food: { consumeFood: econ.consumeFood, totalFoodEquivalent: econ.totalFoodEquivalent } });
    def.econ._warCd = 1e9; war.warMobilize(atk, def, 'feud', 300, world.day);
    const w = world._warWars[0]; if (bodies) w._armsOnBodies = 1;
    const l0 = w._arms.weapon, d0 = def.econ.storage.weapon; war.warResolveBattle(w, world.day);
    return { defWin: ((world._warStats || {}).defWin | 0) > 0, l0, l1: w._arms.weapon, d0, d1: def.econ.storage.weapon, mirror: atk.econ._warArmsOut };
  };
  const bl = battle(true), hl = battle(false);
  ok(hl.defWin && hl.l1 < hl.l0 && hl.d1 > hl.d0, 'ⓒ 몸 짐 없는 공격 패(헤드리스 · 끔) — 결판 흐름이 짐에서 빼고 방어 곳간에 회수(종전)', JSON.stringify(hl));
  ok(bl.defWin && bl.l1 === bl.l0 && bl.d1 === bl.d0 && bl.mirror === bl.l0, 'ⓒ ★T857 몸 짐 판의 공격 패 — 결판 흐름이 짐 · 방어 곳간을 안 건드린다(몸이 정한다 · 거울 = 장부)', JSON.stringify(bl));
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
