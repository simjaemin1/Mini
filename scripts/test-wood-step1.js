#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-wood-step1.js — 통나무 1단계(T717) 손잡이 둘: ② 손·짐에 남는 통나무 · ③ 기근 문 안의 땔감 한 명 ==========
//
// ★왜 [지시 T717 · 재민 10-12 "그러자" — 통나무 다섯 단계 중 ①④ 와 곁 결함 하나]
//   ② **손에서 사라지는 통나무**(T712 회부 3) — 곳간 입구(`woodToGranary` → `actDemandCap`)는 그날 몫(수식 하루 몫 `_woodOutLast`)까지만 받는다.
//      종전: 몸 갈래(`_t325Deliver`)는 손을 0 으로 비웠고 · 헤드리스 하루는 벤 그루의 단을 통째로 내밀고 받은 몫을 안 읽었다 ⇒ 나머지가 세계에서 없어졌다.
//      켬(`T717_WOOD_HAND=1`): 몸 갈래는 남은 몫을 **손에** · 헤드리스는 **마을 짐**(`econ._t717Pack`)에 — 이튿날 베기 전에 같은 입구로 먼저 든다(T544 채집 문법).
//      지키는 것: ⓐ 끔 = 옛 줄(손 0 · 버림) · ⓑ 켬 = 벤 단 = 곳간 + 손 + 짐(항등 · 소멸 0) · ⓒ 짐이 먼저 든다(그날 몫만큼) ⇒ 같은 곳간에 덜 벤다 ·
//               ⓓ 남긴 몫만 든 손은 "그날 걸은 몸"이 아니다(일괄을 안 막는다) · ⓔ 바닥에 놓는 문 0 · 새 수 0.
//   ③ **나무꾼 30일 문** — `pickDeficitJob_rational` 기근 블록(식량 30일치 밑)은 식량 넷만 고른다(T702: 판단 955번 중 나무꾼 27).
//      켬(`T717_FUEL_GATE`): 그날 땔감이 모자랐고(`_fuelCov < 1`) 나무꾼이 0 이면 **한 명** — 이 블록의 하드 플로어(N×6) 위 · 숲 자리가 있을 때만.
//      지키는 것: ⓐ 끔 = 옛 줄(식량 직) · ⓑ 켬 문의 다섯 조건이 각각 문다(충당률 · 0 명 · 플로어 · 자리 · 기근 블록 안) · ⓒ 랩 번들 · 두 실험실에 같은 줄.
//
// ⚠존을 부팅하지 않는다 — 생활층은 정본 함수를 `__labProbe` 로 그대로 부르고(②), 피커는 정본 소스를 그대로 컴파일해 부른다(③ — 내보내기 한 줄만 덧붙인다 · 규칙 사본 0).
// 실행: node scripts/test-wood-step1.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
const probe = (env, js) => {
  const e = Object.assign({}, process.env);
  for (const k of Object.keys(env)) { if (env[k] === undefined) delete e[k]; else e[k] = env[k]; }
  return JSON.parse(execFileSync(process.execPath, ['-e', js], { env: e, stdio: 'pipe' }).toString().trim().split('\n').pop());
};
const EP = JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'));
const VP = JSON.stringify(path.join(ROOT, 'server', 'villages.js'));

console.log('\n=== 통나무 1단계(T717) — ② 손·짐에 남는 통나무 · ③ 기근 문 안의 땔감 한 명 ===');

// ── ② 정적 — 세 자리(몸 갈래 · 헤드리스 · 짐 입고)가 손잡이 뒤에 있다 · 끔 = 옛 줄 ───────────────────────────
console.log('\n② 손·짐에 남는 통나무 — 정적');
{
  const VC = codeOf(VSRC);
  const body = (name) => (VC.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}')) || [''])[0];
  const del = body('_t325Deliver'), pin = body('_t717PackIn'), put = body('_t717PackPut'), nw = body('_t717NewWood');
  const daily = (VC.match(/function\* _lifeDailySteps\(vil\) \{[\s\S]*?\n\}/) || [''])[0];
  const hin = body('_lifeHandsIn');
  ok(/const T717_WOOD_HAND = process\.env\.T717_WOOD_HAND === '1';/.test(VC), 'ⓐ 손잡이 `T717_WOOD_HAND` — `=1` 만 켬(미설정 = 끔)');
  ok(/if \(T717_WOOD_HAND\) \{ const r = \+\(u - got\)\.toFixed\(6\); npc\.inventory\.wood = r > 1e-9 \? r : 0; npc\._t717L = npc\.inventory\.wood; \}/.test(del)
     && /else npc\.inventory\.wood = 0;/.test(del),
    'ⓐ ★★몸 갈래(`_t325Deliver`) — 켬 = 넣은 만큼만 손에서 뺀다(남긴 몫 `_t717L`) · 끔 = 옛 줄(손 0)');
  ok(/const _g = _lifeEcon\(\)\.woodToGranary\(vil\.econ, u\);\s*if \(T717_WOOD_HAND\) _t717PackPut\(vil, u - \(_g \|\| 0\)\);/.test(daily),
    'ⓐ ★★헤드리스 하루 — 입구가 돌려준 받은 몫을 읽고 나머지(`u − 받은 몫`)는 켬이면 마을 짐에(끔 = 옛 줄 · 안 읽고 버림)');
  ok(/if \(T717_WOOD_HAND && _on\) _t717PackIn\(vil\);/.test(daily) && daily.indexOf('_t717PackIn(vil)') < daily.indexOf('for (let k = 0; k < _tr.length * 8')
     && daily.indexOf('_t717PackIn(vil)') > daily.indexOf('_t325Deliver(vil, p)'),
    'ⓐ ★짐은 **베기 전** · 손 입고 뒤에 든다(채집 `_t544PackIn` 과 같은 자리) · 켬 ∧ 행위 마을만');
  ok(/vil\.econ\._t717Pack = \+\(\(vil\.econ\._t717Pack \|\| 0\) \+ u\)\.toFixed\(6\);/.test(put) && /woodToGranary\(vil\.econ, u\)/.test(pin)
     && /if \(r > 1e-9\) vil\.econ\._t717Pack = r; else delete vil\.econ\._t717Pack;/.test(pin),
    'ⓐ 짐 = econ 마을 칸 하나(단) · 입고는 같은 입구(`woodToGranary`) · 받은 만큼만 뺀다');
  ok(/return T717_WOOD_HAND \? w > \(p\._t717L \|\| 0\) \+ 1e-9 : w > 0;/.test(nw)
     && /const nw = _t717NewWood\(p\); _t325Deliver\(vil, p\); if \(nw\) n\+\+;/.test(hin)
     && /const nw = _t717NewWood\(p\); _t325Deliver\(vil, p\); if \(nw\) _walked\+\+;/.test(daily),
    'ⓐ ★걸은 몸 세기(두 자리 — 틱 앞 손 입고 · 하루 손 입고) — 켬 = 남긴 몫보다 많이 든 손만 · 끔 = 손에 통나무가 있나(옛 줄)');
  ok(!/Ground|Drop/.test(del + pin + put), 'ⓔ 바닥에 놓는 문은 안 불린다(짐 · 손뿐)');
  //   새 수 0 — 이 카드가 더한 줄의 수는 1e-9(0 비교) · 6(소수 자리 — 옆 줄들의 그 규약)뿐
  const added = [del, pin, put, nw].join('\n').replace(/toFixed\(6\)/g, '').replace(/1e-9/g, '');
  ok(!/[^\w.](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w])/.test(added.replace(/\b0\b/g, '')), 'ⓔ ★새 수 0 — 남기는 줄에 상수가 없다(0 · 소수 자리 · 0 비교만)');
}

// ── ② 실행 — 몸 갈래 · 짐 · 하루(정본 `_lifeDaily`) ───────────────────────────────────────────────────────
console.log('\n② 손·짐에 남는 통나무 — 실행(정본 함수 · 행위 층 켬 · 수요 문 켬)');
{
  const base = { T325_WOOD_ACT: '1', T347_FORAGE_ACT: '', T374_DEMAND_STOP: '1', T449_BODY_DAY: '', T491_BATCH_FROM_BODY: '', T561_ROSTER_BODY: '' };
  //   ⓑ 몸 갈래 — 손 9 단 · 그날 몫 2
  const bodyJs = `const E=require(${EP}); const V=require(${VP}); const P=V.__labProbe._t717Probe;
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); ev._woodOutLast=2; ev._t325InflowToday=0;
    const tot=()=>(ev.storage.wood||0)+((ev.treasury&&ev.treasury.wood)||0); const w0=tot();
    const vil={econ:ev}; const npc={inventory:{wood:9}};
    const g1=P.deliver(vil,npc); const h1=npc.inventory.wood, L1=npc._t717L;
    ev._t325InflowToday=0;                                         // 이튿날(틱이 오늘치를 장부에 옮기고 비웠다)
    const nw=P.newWood(npc); const g2=P.deliver(vil,npc); const h2=npc.inventory.wood;
    console.log(JSON.stringify({on:P.ON,g1:+g1.toFixed(6),h1,L1:L1==null?null:L1,nw,g2:+g2.toFixed(6),h2,gran:+(tot()-w0).toFixed(6)}))`;
  const bOff = probe(base, bodyJs), bOn = probe(Object.assign({ T717_WOOD_HAND: '1' }, base), bodyJs);
  ok(bOff.on === false && bOff.g1 === 2 && bOff.h1 === 0 && bOff.L1 === null && bOff.g2 === 0,
    'ⓐ ★★끔 — 손 9 · 몫 2 → 곳간 2 · **손 0**(7 단이 세계에서 없어진다 — 옛 줄 그대로)', JSON.stringify(bOff));
  ok(bOn.on === true && bOn.g1 === 2 && bOn.h1 === 7 && bOn.L1 === 7 && bOn.nw === false && bOn.g2 === 2 && bOn.h2 === 5 && bOn.gran === 4,
    'ⓑ ★★★켬 — 곳간 2 · **손 7**(벤 9 = 곳간 2 + 손 7) · 이튿날 손이 먼저 든다(2 · 손 5) · 남긴 몫만 든 손은 새로 벤 손이 아니다', JSON.stringify(bOn));
  //   ⓒ 짐 — 4.5 단 · 하루 몫 2
  const packJs = `const E=require(${EP}); const V=require(${VP}); const P=V.__labProbe._t717Probe;
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); ev._woodOutLast=2; ev._t325InflowToday=0; const vil={econ:ev};
    P.put(vil,4.5); const out=[]; for (let d=0; d<4; d++) { ev._t325InflowToday=0; const g=P.packIn(vil); out.push([+g.toFixed(6), ev._t717Pack==null?null:ev._t717Pack]); }
    const z=P.put(vil,0); const neg=P.put(vil,-1);
    console.log(JSON.stringify({out,z,neg,pk:ev._t717Pack==null?null:ev._t717Pack,acc:+(vil._t717PkIn||0).toFixed(6)}))`;
  const pk = probe(Object.assign({ T717_WOOD_HAND: '1' }, base), packJs);
  ok(JSON.stringify(pk.out) === JSON.stringify([[2, 2.5], [2, 0.5], [0.5, null], [0, null]]) && pk.z === 0 && pk.neg === 0 && pk.pk === null && pk.acc === 4.5,
    'ⓒ ★★짐 4.5 · 하루 몫 2 — 2 · 2 · 0.5 로 나뉘어 든다(나머지는 짐에) · 빈 짐은 칸을 지운다 · 0 · 음수는 안 넣는다', JSON.stringify(pk));
  //   ⓒ 하루 — 정본 `_lifeDaily` 나흘(숲 12셀 × 3그루 · 한 그루 6단 · 하루 몫 2 · 나무꾼 1)
  const dayJs = (hand) => `const E=require(${EP}); const V=require(${VP}); const P=V.__labProbe;
    const SZ=32, ccx=400, ccy=400; const players=new Map();
    players.set(1,Object.assign({pid:1,isNpc:true,simJob:'lumberjack',hp:100,maxHp:100,inventory:{}},${JSON.stringify(hand || {})}));
    const trees=new Map(); for(let i=0;i<12;i++) trees.set((ccx+10)+','+(ccy+i),3); let cut=0, cutU=0;
    const deps={players,broadcast(){},moveSpeed:64,dayPhaseRatio:0.7,worldPhase:()=>0.3,anyViewerNear:()=>false,
      t325TreesAtCell:(cx,cy)=>{const n=trees.get(cx+','+cy)||0; return n>0?Array.from({length:n},(_,j)=>({id:cx+'_'+cy+'_'+j,seedKey:'s'+cx+'_'+cy+'_'+j})):[];},
      t325CutTreeAt:(cx,cy)=>{const k=cx+','+cy; const n=trees.get(k)||0; if(!n) return null; trees.set(k,n-1); cut++; cutU+=6; return {wood:6};},
      t325LootOf:()=>({wood:6}), t341Unharvest:()=>0};
    P._t400Probe.setup({deps,db:{insertVillageBuilding:()=>1},dayMs:60000,epoch:0,zoneId:'t717',tickCtx:{now:60*60000}});
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); ev.counts=ev.counts||{}; ev.counts.lumberjack=1;
    const tot=()=>(ev.storage.wood||0)+((ev.treasury&&ev.treasury.wood)||0); const w0=tot();
    const terr=new Set(); for(let dx=-3;dx<=3;dx++) for(let dy=-3;dy<=3;dy++) terr.add((ccx+dx)+','+(ccy+dy));
    const vil={dbId:7,name:'x',ccx,ccy,econ:ev,npcPids:[1],_terrSet:terr,_farmSet:new Set(),_drySet:new Set(),_potSet:new Set(),_crop:new Map(),_cropClaim:new Set(),_claim:new Set(),_site:null,_houseCells:[],_granList:[],_maxRPx:200};
    const h0=(players.get(1).inventory.wood||0); const days=[];
    for (let d=0; d<4; d++) {
      P._t400Probe.setup({tickCtx:{now:(60+d)*60000}}); ev._woodOutLast=2; ev._t325InflowToday=0;   // 그날 econ 틱(오늘치를 비우고 몫을 다시 낸다)
      const c0=cut; P._t449Probe.daily(vil);
      days.push({cut:cut-c0, walked:vil._t325Dbg&&vil._t325Dbg.walked, gran:+(tot()-w0).toFixed(6), pk:ev._t717Pack==null?0:ev._t717Pack, hand:players.get(1).inventory.wood||0});
    }
    const hand=players.get(1).inventory.wood||0, pkEnd=ev._t717Pack||0;
    console.log(JSON.stringify({days,cut,cutU,h0,gran:+(tot()-w0).toFixed(6),pk:pkEnd,hand,lost:+(cutU+h0-(tot()-w0)-pkEnd-hand).toFixed(6)}))`;
  const dOff = probe(base, dayJs()), dOn = probe(Object.assign({ T717_WOOD_HAND: '1' }, base), dayJs());
  ok(dOff.cut === 4 && dOff.gran === 8 && dOff.pk === 0 && dOff.lost === 16,
    'ⓐ ★★끔 — 나흘 4그루(24단) · 곳간 8 · **16 단이 사라진다**(하루 몫 2 를 넘는 4 단씩 — 옛 줄 그대로)', `벤 ${dOff.cut}그루 · 곳간 ${dOff.gran} · 사라짐 ${dOff.lost}`);
  ok(dOn.cut === 2 && dOn.gran === 8 && dOn.pk === 4 && dOn.lost === 0 && dOn.days.map((x) => x.cut).join() === '1,0,0,1' && dOn.days.map((x) => x.pk).join() === '4,2,0,4',
    'ⓑ ★★★켬 — 같은 곳간 8 에 **2그루**(12단 = 곳간 8 + 짐 4 · 사라짐 0) · 짐이 이틀을 댄다(1 · 0 · 0 · 1그루)', `벤 ${dOn.cut}그루 · 짐 ${dOn.days.map((x) => x.pk).join('→')} · 사라짐 ${dOn.lost}`);
  //   ⓓ 남긴 몫만 든 손 — 켬: 일괄을 안 막는다 · 끔: 손에 통나무가 있으면 그날은 몸이 걸은 날(옛 줄)
  const lOn = probe(Object.assign({ T717_WOOD_HAND: '1' }, base), dayJs({ inventory: { wood: 1 }, _t717L: 1 }));
  const lOff = probe(base, dayJs({ inventory: { wood: 1 } }));
  ok(lOn.days[0].walked === 0 && lOn.days[0].cut === 1 && lOn.lost === 0 && lOff.days[0].walked === 1 && lOff.days[0].cut === 0,
    'ⓓ ★★남긴 몫(1단)만 든 손 — 켬: 그날 걸은 몸이 아니다(일괄이 1그루 · 사라짐 0) · 끔: 손 입고가 걸은 몸으로 세어 일괄 0(옛 줄)',
    `켬 걸음 ${lOn.days[0].walked} · 벰 ${lOn.days[0].cut} ↔ 끔 걸음 ${lOff.days[0].walked} · 벰 ${lOff.days[0].cut}`);
  //   ⓐ 행위 층 끔 — 켜도 부르는 자리가 없다(곳간 입구가 0 을 돌려주고 손도 짐도 안 생긴다 · 기본 세계 = main 바이트의 근거)
  const noAct = probe(Object.assign({ T717_WOOD_HAND: '1' }, base, { T325_WOOD_ACT: '' }), dayJs({ inventory: { wood: 3 } }));
  ok(noAct.cut === 0 && noAct.gran === 0 && noAct.pk === 0 && noAct.hand === 3,
    'ⓐ ★행위 층(`T325_WOOD_ACT`) 끔 세계 — 켜도 아무것도 안 한다(벰 0 · 곳간 0 · 짐 0 · 손 그대로) ⇒ 기본 세계는 main 그대로', JSON.stringify({ cut: noAct.cut, gran: noAct.gran, pk: noAct.pk, hand: noAct.hand }));
}

// ── ③ 기근 문 안의 땔감 한 명 — 정본 피커를 그대로 컴파일해 부른다 ───────────────────────────────────────────
console.log('\n③ 기근 문 안의 땔감 한 명 — 정본 `pickDeficitJob_rational`');
{
  const C = codeOf(SRC);
  const pick = (C.match(/function pickDeficitJob_rational\(v, world\) \{[\s\S]*?\n\}/) || [''])[0];
  const fam = pick.slice(pick.indexOf('if (foodEquiv < N * 30) {'), pick.indexOf('const foodOpts = ['));
  ok(/function fuelGateOn\(\) \{ const x = _allocKnob\('T717_FUEL_GATE'\); return x !== null && x !== '0'; \}/.test(C),
    'ⓐ 손잡이 `T717_FUEL_GATE` — 서버 env · 랩 `window` 같은 문(`_allocKnob`) · 미설정 · `0` = 끔');
  ok(/if \(fuelGateOn\(\) && v\._fuelCov !== undefined && v\._fuelCov < 1 && \(counts\.lumberjack \|\| 0\) < 1 && foodEquiv > N \* 6\s*&& hasSlot\(v, 'lumberjack', cap, counts\)\) return 'lumberjack';/.test(fam),
    'ⓑ ★★문은 **기근 블록 안** · 식량 넷 앞 한 줄 — 충당률 < 1 ∧ 나무꾼 0 ∧ 식량 > N×6(블록의 하드 플로어) ∧ 숲 자리');
  //   정본 소스 그대로 + 내보내기 한 줄(규칙 사본 0)
  const F = path.join(ROOT, 'sim', 'economy-sim.js');
  const m = new Module(F, null); m.filename = F; m.paths = Module._nodeModulePaths(path.dirname(F));
  m._compile(SRC + '\n;module.exports.__t717Pick = pickDeficitJob_rational;\n', F);
  const E = m.exports;
  const mk = (o) => {
    const v = E.createVillage(Object.assign({ initialPop: 20, name: 't717', fertility: 1, wood: 1, stone: 1, ore: 0.1, water: 0.3, game: 0.6 }, o.land || {}));
    for (const n of v.npcs) if (n.currentJob === 'lumberjack' && !(o.lj > 0)) { v.counts.lumberjack--; n.currentJob = 'farmer'; v.counts.farmer = (v.counts.farmer || 0) + 1; }
    if (o.lj > 0) { let k = (v.counts.lumberjack || 0); for (const n of v.npcs) { if (k >= o.lj) break; if (n.currentJob !== 'lumberjack' && n.currentJob !== 'farmer') continue; if (n.currentJob === 'farmer') { v.counts.farmer--; n.currentJob = 'lumberjack'; v.counts.lumberjack = (v.counts.lumberjack || 0) + 1; k++; } } }
    v.storage.tool = 1000; v.storage.stone = 1000;   // 도구 · 돌이 넉넉하다 — 기근 블록 앞 두 안전망(석공 · 채집꾼)이 안 선다
    const N = v.npcs.length; const f0 = E.totalFoodEquivalent(v); v.storage.food = (v.storage.food || 0) + (o.days * N - f0);
    if (o.fc !== null) v._fuelCov = o.fc === undefined ? 0.4 : o.fc;
    return v;
  };
  const W = { picker: 'rational' };
  const run = (gate, o) => { const k = process.env.T717_FUEL_GATE; if (gate == null) delete process.env.T717_FUEL_GATE; else process.env.T717_FUEL_GATE = gate;
    try { const v = mk(o); return { job: E.__t717Pick(v, W), lj: v.counts.lumberjack || 0, N: v.npcs.length, days: +(E.totalFoodEquivalent(v) / v.npcs.length).toFixed(2), fc: v._fuelCov }; }
    finally { if (k === undefined) delete process.env.T717_FUEL_GATE; else process.env.T717_FUEL_GATE = k; } };
  const on = run('1', { days: 15 }), off = run(null, { days: 15 }), zero = run('0', { days: 15 });
  ok(on.job === 'lumberjack' && on.lj === 0 && on.days === 15,
    'ⓑ ★★★켬 — 식량 15일치(기근 블록) · 땔감 충당률 0.4 · 나무꾼 0 ⇒ **나무꾼 한 명**', JSON.stringify(on));
  ok(off.job !== 'lumberjack' && zero.job === off.job && ['farmer', 'fisher', 'hunter', 'forager'].includes(off.job),
    'ⓐ ★★끔(미설정 · `0`) — 같은 마을이 식량 넷 중 하나(옛 줄 그대로)', `${off.job} · ${zero.job}`);
  const full = run('1', { days: 15, fc: 1 }), unk = run('1', { days: 15, fc: null }), one = run('1', { days: 15, lj: 1 }),
    floor = run('1', { days: 5 }), noSlot = run('1', { days: 15, land: { wood: 0 } }), fed = run('1', { days: 40 }), fedOff = run(null, { days: 40 });
  ok(full.job !== 'lumberjack' && unk.job !== 'lumberjack', 'ⓑ ★충당률 만점(1) · 아직 안 잰 날(연료 단계 전) — 문이 안 선다', `${full.job} · ${unk.job}`);
  ok(one.lj === 1 && one.job !== 'lumberjack', 'ⓑ ★★나무꾼이 이미 하나면 안 선다 — **한 명**까지만(식량 노동은 1/N 만 뺀다)', `나무꾼 ${one.lj} → ${one.job}`);
  ok(floor.days === 5 && floor.job !== 'lumberjack', 'ⓑ ★★식량 5일치(하드 플로어 N×6 밑) — 굶음이 먼저다(안 선다)', `${floor.days}일 → ${floor.job}`);
  ok(noSlot.job !== 'lumberjack', 'ⓑ ★숲 자리 0(land.wood 0 — `jobCapacity` 나무꾼 0) — 벨 나무가 없으면 안 선다', noSlot.job);
  ok(fed.days === 40 && fed.job === fedOff.job, 'ⓑ 기근 블록 밖(40일치) — 켬 · 끔 같은 판단(문은 기근 블록 안에만 있다)', `${fed.job} · ${fedOff.job}`);
  //   ⓒ 랩 — 번들 · 두 실험실이 같은 줄을 싣는다(구운 사본 — `build-econ-bundle --check` · `inline-engine --check` 가 최신을 본다)
  const B = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
  const L1 = fs.readFileSync(path.join(ROOT, 'lab', '마을실험실.html'), 'utf8'), L2 = fs.readFileSync(path.join(ROOT, 'lab', '전쟁실험실.html'), 'utf8');
  const line = "if (fuelGateOn() && v._fuelCov !== undefined && v._fuelCov < 1 && (counts.lumberjack || 0) < 1 && foodEquiv > N * 6";
  ok([B, L1, L2].every((s) => s.includes(line) && s.includes("_allocKnob('T717_FUEL_GATE')")), 'ⓒ 번들 · 마을실험실 · 전쟁실험실에 같은 문 · 같은 손잡이(랩 `window.T717_FUEL_GATE`)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
