#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-fell-loot.js — 벤 그루의 잔가지 · 도토리(T733 ①) · 채집 손 "그날 새로 땄나"(T733 ②) — 손잡이 `T733_FELL_LOOT`(기본 끔) ==========
//
// ★왜 [지시 T733 · T717 회부 ⑤⑥]
//   ① 존 문(`t325CutTreeAt` → `lootOfResource`)은 한 그루에 `{ wood, twig: 1 [, acorn: 1] }` 를 돌려준다(묘목 `{ wood, twig: 1 }`).
//      종전: 헤드리스 하루는 **단만** 읽었다(잔가지 · 도토리는 아무 데도 안 갔다) · 몸 갈래는 손에 든 채 곳간엔 안 들었다(`_t325Deliver` 는 통나무만).
//      켬: 몸 = 통나무와 같은 문 · 같은 때(`_t325Deliver`)에 손의 두 칸도 곳간 그 칸에 · 헤드리스 = 같은 그루의 두 칸을 통나무 입구 바로 뒤에서 ·
//          곳간이 안 받은 몫은 손(몸) · 마을 짐(`econ._t733Pack` — 헤드리스)에.
//      지키는 것: ⓐ 끔 = 옛 줄 · ⓑ 켬 = 벤 두 칸 = 곳간 + 손 + 짐(항등 · 소멸 0) · ⓒ 통나무 쪽 수는 켬 · 끔 같다 · ⓓ 나무꾼이 벤 잔가지는 통나무 문으로(채집 문이 먼저 안 받는다) ·
//               ⓔ econ 이 두 칸을 이미 안다(전수) · 존 표의 통나무 밖 칸 = 이 카드의 두 칸 · 바닥 0 · 새 수 0.
//   ② 채집 손 — 곳간이 안 받은 몫은 손에 남는다(T544). 종전 세 자리(틱 앞 손 입고 · 하루 손 · T720 해 질 녘 정산)는 남긴 몫만 든 손도 "그날 걸은 몸"으로 셌다.
//      켬: 남긴 걷는 몫(`_t733F`)보다 많이 든 손만(나무꾼 `_t717L` 꼴) · 새 몸 필드는 `zone.js _t671Shape` 에(test-body-fields 규약).
//      지키는 것: ⓐ 끔 = 옛 줄 · ⓑ 세 자리 모두 같은 술어 · ⓒ 새로 딴 손은 켬 · 끔 같다 · ⓓ 남긴 몫의 행방(사흘 — 끔은 손에서 빠지고 · 켬은 일괄이 그날 몫을 채운다).
//
// ⚠존을 부팅하지 않는다 — 생활층 정본 함수를 `__labProbe._t733Probe` 로 그대로 부른다(규칙 사본 0). 존 전리품 표는 소스 줄을 읽는다.
// 실행: node scripts/test-fell-loot.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const V2SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
const probe = (env, js) => {
  const e = Object.assign({}, process.env);
  for (const k of Object.keys(env)) { if (env[k] === undefined) delete e[k]; else e[k] = env[k]; }
  return JSON.parse(execFileSync(process.execPath, ['-e', js], { env: e, stdio: 'pipe' }).toString().trim().split('\n').pop());
};
const EP = JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'));
const VP = JSON.stringify(path.join(ROOT, 'server', 'villages.js'));
const VC = codeOf(VSRC), ZC = codeOf(ZSRC), C = codeOf(SRC);
const body = (name) => (VC.match(new RegExp('function\\*? ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}')) || [''])[0];
//   그 함수에 이 카드가 더한 상수가 없나 — 0 · 소수 자리(6) · 0 비교(1e-9)만 남는다
const noNum = (s) => !/[^\w.](?:[1-9]|\d{2,})(?:\.\d+)?(?![\w])/.test(s.replace(/toFixed\(6\)/g, '').replace(/1e-9/g, ''));
const ON = '1';
//   손잡이 다섯은 기본값 그대로(T717 ② · T720 · T374 켬) · 행위 층(T325 · T347)은 판마다 연다 · 몸 명부 손잡이들은 끔
const BASE = { T733_FELL_LOOT: '0', T325_WOOD_ACT: '1', T347_FORAGE_ACT: '', T374_DEMAND_STOP: '1', T449_BODY_DAY: '', T491_BATCH_FROM_BODY: '', T561_ROSTER_BODY: '',
  T717_WOOD_HAND: undefined, T720_LON_DAY: undefined, T490_FORAGE_REACH: '0' };
const env = (o) => Object.assign({}, BASE, o || {});

console.log('\n=== 벤 그루의 잔가지 · 도토리(T733 ①) · 채집 손 "그날 새로 땄나"(T733 ②) ===');

// ── ① 정적 ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n① 잔가지 · 도토리 → 곳간 — 정적');
{
  ok(/const T733_FELL_LOOT = process\.env\.T733_FELL_LOOT === '1';/.test(VC), 'ⓐ 손잡이 `T733_FELL_LOOT` — 기본 끔(`1` 만 켬)');
  //   존 전리품 표(나무 · 묘목 갈래)의 통나무 밖 칸 = 이 카드의 두 칸(표에 새 칸이 서면 여기가 빨강 — 그 칸을 곳간에 넣을지는 econ 이 아나부터)
  const lf = ZC.slice(ZC.indexOf('function lootOfResource('), ZC.indexOf("if (t === 'rock')"));
  const keys = new Set();
  for (const m of lf.matchAll(/\{([^{}]*)\}/g)) for (const k of m[1].matchAll(/(\w+):/g)) keys.add(k[1]);
  for (const m of lf.matchAll(/\bl\.(\w+) = /g)) keys.add(m[1]);
  keys.delete('wood');
  const K = (VC.match(/const _T733_KEYS = \[([^\]]*)\];/) || ['', ''])[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
  ok(lf.length > 0 && /if \(t === 'tree'\)/.test(lf) && /if \(t === 'sapling'\)/.test(lf) && [...keys].sort().join() === K.slice().sort().join() && K.join() === 'twig,acorn',
    'ⓔ ★★존 전리품 표(나무 · 묘목)의 통나무 밖 칸 = `_T733_KEYS`(잔가지 · 도토리) — 표에 새 칸이 서면 빨강', `표 ${[...keys].join('·')} · 카드 ${K.join('·')}`);
  //   econ 전수 — 두 칸을 econ 이 이미 아나(그리고 무엇이 그것을 쓰나)
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const mix = E.foragerYieldsFor({ land: { fertility: 1, wood: 1, stone: 1 } });
  const low = /for \(const _lf of \['twig', 'bark'\]\)/.test(C) && /_u \* LOW_FUEL_EQ/.test(C);
  const cook = /const COOK_SIDE_INGREDIENTS = \[[^\]]*'twig'[^\]]*\];/.test(C);
  const t86 = /const T86_GROUP = Object\.assign\(\{\}, FOOD_GROUP, \{[\s\S]*?acorn: 'forage'[\s\S]*?\}\);/.test(C);
  const dec = /const DECAY_V2 = \{[\s\S]*?twig: [\d.]+[\s\S]*?acorn: [\d.]+[\s\S]*?\};/.test(codeOf(V2SRC));
  const dep = /acorn: 'acorn'/.test(VC.slice(VC.indexOf('const PV_DEPOSIT_MAP = {'), VC.indexOf('};', VC.indexOf('const PV_DEPOSIT_MAP = {'))));
  const twigCensus = { RESOURCES: E.RESOURCES.includes('twig'), lowFuel: low, cookSide: cook, forageMix: mix.twig > 0, RESERVE_PC: E.RESERVE_PC.twig, BASE_VALUE: E.BASE_VALUE.twig };
  const acornCensus = { FORAGE_FOOD_FACTOR: E.FORAGE_FOOD_FACTOR.acorn, T86: t86, depositMap: dep };
  ok(twigCensus.RESOURCES && low && cook && twigCensus.forageMix && twigCensus.RESERVE_PC > 0 && twigCensus.BASE_VALUE > 0 && dec,
    'ⓔ ★★econ 이 **잔가지 칸**을 안다 — 재화 목록 · 하급 연료(`_lowFuel` × `LOW_FUEL_EQ`) · 요리 곁재료 · 채집 수식 품목 · 목표 재고 · 값 · v2 썩음', JSON.stringify(twigCensus));
  ok(acornCensus.FORAGE_FOOD_FACTOR > 0 && t86 && dep && !E.RESOURCES.includes('acorn'),
    'ⓔ ★★econ 이 **도토리 칸**을 안다 — 식량 등가(`FORAGE_FOOD_FACTOR` · 구황 소비) · T86 채집 군 · 플레이어 곳간 표 · v2 썩음(재화 목록 `RESOURCES` 밖 — 특산 품목)', JSON.stringify(acornCensus));
  //   몸 · 헤드리스 · 짐 — 세 자리가 손잡이 뒤 · 입구는 econ 정본 몸통 하나
  const del = body('_t325Deliver'), gran = body('_t733Gran'), hin = body('_t733HandIn'), lin = body('_t733LootIn'), put = body('_t733PackPut'), pin = body('_t733PackIn');
  const daily = body('_lifeDailySteps'), hands = body('_lifeHandsIn'), settle = body('_t720Settle');
  ok(/^function _t325Deliver\(vil, npc\) \{\n\s*if \(T733_FELL_LOOT\) _t733HandIn\(vil, npc\);/.test(del),
    'ⓐ ★★몸 — `_t325Deliver` 첫 줄(통나무와 같은 문 · 같은 때: 곳간 사다리 · 해 질 녘 정산 · 경계)에서 손의 두 칸도 · 끔 = 옛 줄');
  ok(/const g = _lifeEcon\(\)\.actToGranary\(vil\.econ, k, u, null, null\) \|\| 0;/.test(gran) && !/ToGranary/.test(hin + lin + pin) && /_t733Gran\(vil, k, u\)/.test(hin + lin + pin),
    'ⓐ ★입구는 econ 정본 몸통 하나(`actToGranary` — 세금 · 곳간) · 오늘치 · 건수 칸 없음(두 품목엔 수식 몫이 없다) · 세 자리가 같은 함수를 부른다');
  ok(/const r = \+\(u - g\)\.toFixed\(6\); inv\[k\] = r > 1e-9 \? r : 0;/.test(hin) && /_t733PackPut\(vil, k, u - g\);/.test(lin)
     && /if \(r > 1e-9\) P\[k\] = r; else delete P\[k\];/.test(pin),
    'ⓑ ★★곳간이 안 받은 몫 — 몸은 손에 · 헤드리스는 마을 짐에 · 짐은 받은 만큼만 뺀다(T544 · T717 ② 문법)');
  ok(/if \(T717_WOOD_HAND\) _t717PackPut\(vil, u - \(_g \|\| 0\)\);\s*if \(T733_FELL_LOOT\) _t733LootIn\(vil, loot\);/.test(daily)
     && /if \(T717_WOOD_HAND && _on\) _t717PackIn\(vil\);\s*if \(T733_FELL_LOOT && _on\) _t733PackIn\(vil\);/.test(daily)
     && daily.indexOf('_t733PackIn(vil)') < daily.indexOf('for (let k = 0; k < _tr.length * 8'),
    'ⓐ ★★헤드리스 — 같은 그루(`loot`)의 두 칸을 통나무 입구 바로 뒤에서 · 짐은 베기 전(통나무 짐 옆)');
  ok(/if \(T733_FELL_LOOT\) _wood\(\);\s*if \(E\.T347_FORAGE_ACT && E\.forageActOn\(vil\.econ\)\) \{[\s\S]*?\}\s*if \(!T733_FELL_LOOT\) _wood\(\);/.test(hands)
     && settle.indexOf('_t325Deliver(vil, npc)') < settle.indexOf('_t347Deliver(vil, npc)'),
    'ⓓ ★틱 앞 손 입고 — 켬이면 통나무 손(두 칸 함께)이 채집 손보다 **먼저**(끔 = 옛 차례) · 해 질 녘 정산은 이미 통나무가 먼저');
  ok(!/Ground|Drop/.test(hin + lin + put + pin + gran), 'ⓔ 바닥에 놓는 문은 안 불린다(손 · 짐뿐)');
  ok(noNum(gran + hin + lin + put + pin), 'ⓔ ★새 수 0 — 넣는 줄 · 남기는 줄에 상수가 없다(0 · 소수 자리 · 0 비교만)');
}

// ── ① 실행 — 몸(`_t325Deliver`) ───────────────────────────────────────────────────────────────────────────
console.log('\n① 잔가지 · 도토리 → 곳간 — 실행(정본 함수 · 행위 층 켬 · 수요 문 켬)');
{
  const js = `const E=require(${EP}); const V=require(${VP}); const P=V.__labProbe._t733Probe;
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); ev._woodOutLast=2; ev._t325InflowToday=0;
    const tot=(k)=>(ev.storage[k]||0)+((ev.treasury&&ev.treasury[k])||0); const t0={w:tot('wood'),t:tot('twig'),a:tot('acorn')};
    const vil={econ:ev}; const npc={inventory:{wood:9,twig:3,acorn:1}};
    const g=P.deliver(vil,npc); const inv=npc.inventory;
    console.log(JSON.stringify({on:P.ON,g:+g.toFixed(6),wood:inv.wood,twig:inv.twig,acorn:inv.acorn,
      gw:+(tot('wood')-t0.w).toFixed(6),gt:+(tot('twig')-t0.t).toFixed(6),ga:+(tot('acorn')-t0.a).toFixed(6),gr:vil._t733Gr||null}))`;
  const off = probe(env(), js), on = probe(env({ T733_FELL_LOOT: ON }), js);
  ok(off.on === false && off.g === 2 && off.wood === 7 && off.twig === 3 && off.acorn === 1 && off.gt === 0 && off.ga === 0 && off.gr === null,
    'ⓐ ★★끔 — 통나무만 든다(2 · 손 7 — T717 ②) · 잔가지 3 · 도토리 1 은 **손에 그대로**(옛 줄)', JSON.stringify(off));
  ok(on.on === true && on.g === 2 && on.wood === 7 && on.gw === off.gw && on.twig === 0 && on.acorn === 0 && on.gt === 3 && on.ga === 1
     && on.gr && on.gr.twig === 3 && on.gr.acorn === 1,
    'ⓑ ★★★켬 — 같은 문에서 잔가지 3 · 도토리 1 이 **곳간 그 칸에**(곳간 + 국고 = 든 몫 · 손 0) · 통나무 쪽은 끔과 같다(2 · 손 7)', JSON.stringify(on));
}

// ── ① 실행 — 헤드리스 하루(정본 `_lifeDaily` 나흘) ──────────────────────────────────────────────────────────
{
  //   숲 12셀 × 3그루 · 한 그루 6단 + 잔가지 1 · 셋째 그루마다 도토리 1 · 하루 몫 2 · 나무꾼 1(T717 ② 켬 — 짐이 이틀을 댄다)
  const dayJs = `const E=require(${EP}); const V=require(${VP}); const P=V.__labProbe;
    const SZ=32, ccx=400, ccy=400; const players=new Map();
    players.set(1,{pid:1,isNpc:true,simJob:'lumberjack',hp:100,maxHp:100,inventory:{}});
    const trees=new Map(); for(let i=0;i<12;i++) trees.set((ccx+10)+','+(ccy+i),3); let cut=0, cutU=0, cutT=0, cutA=0;
    const deps={players,broadcast(){},moveSpeed:64,dayPhaseRatio:0.7,worldPhase:()=>0.3,anyViewerNear:()=>false,
      t325TreesAtCell:(cx,cy)=>{const n=trees.get(cx+','+cy)||0; return n>0?Array.from({length:n},(_,j)=>({id:cx+'_'+cy+'_'+j,seedKey:'s'+cx+'_'+cy+'_'+j})):[];},
      t325CutTreeAt:(cx,cy)=>{const k=cx+','+cy; const n=trees.get(k)||0; if(!n) return null; trees.set(k,n-1); cut++; cutU+=6; cutT+=1; const l={wood:6,twig:1}; if(cut%3===0){l.acorn=1; cutA++;} return l;},
      t325LootOf:()=>({wood:6,twig:1}), t341Unharvest:()=>0};
    P._t400Probe.setup({deps,db:{insertVillageBuilding:()=>1},dayMs:60000,epoch:0,zoneId:'t733',tickCtx:{now:60*60000}});
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); ev.counts=ev.counts||{}; ev.counts.lumberjack=1;
    const tot=(k)=>(ev.storage[k]||0)+((ev.treasury&&ev.treasury[k])||0); const t0={w:tot('wood'),t:tot('twig'),a:tot('acorn')};
    const terr=new Set(); for(let dx=-3;dx<=3;dx++) for(let dy=-3;dy<=3;dy++) terr.add((ccx+dx)+','+(ccy+dy));
    const vil={dbId:7,name:'x',ccx,ccy,econ:ev,npcPids:[1],_terrSet:terr,_farmSet:new Set(),_drySet:new Set(),_potSet:new Set(),_crop:new Map(),_cropClaim:new Set(),_claim:new Set(),_site:null,_houseCells:[],_granList:[],_maxRPx:200};
    for (let d=0; d<4; d++) { P._t400Probe.setup({tickCtx:{now:(60+d)*60000}}); ev._woodOutLast=2; ev._t325InflowToday=0; P._t449Probe.daily(vil); }
    const pk=ev._t733Pack||{}, gw=+(tot('wood')-t0.w).toFixed(6), gt=+(tot('twig')-t0.t).toFixed(6), ga=+(tot('acorn')-t0.a).toFixed(6);
    console.log(JSON.stringify({cut,cutU,cutT,cutA,gw,wpk:ev._t717Pack||0,gt,ga,pkT:pk.twig||0,pkA:pk.acorn||0,
      lostT:+(cutT-gt-(pk.twig||0)).toFixed(6),lostA:+(cutA-ga-(pk.acorn||0)).toFixed(6),gr:vil._t733Gr||null}))`;
  const dOff = probe(env(), dayJs), dOn = probe(env({ T733_FELL_LOOT: ON }), dayJs);
  ok(dOff.cut === 2 && dOff.cutT === 2 && dOff.cutA === 0 && dOff.gt === 0 && dOff.lostT === 2,
    'ⓐ ★★끔 — 나흘 2그루(T717 ② 짐이 이틀을 댄다) · 잔가지 2 가 **사라진다**(곳간 0 · 짐 0 — 옛 줄)', `벤 ${dOff.cut}그루 · 잔가지 ${dOff.cutT} → 곳간 ${dOff.gt} · 사라짐 ${dOff.lostT}`);
  ok(dOn.cut === dOff.cut && dOn.gw === dOff.gw && dOn.wpk === dOff.wpk && dOn.gt === 2 && dOn.lostT === 0 && dOn.lostA === 0 && dOn.pkT === 0,
    'ⓑ ★★★켬 — 같은 2그루 · 같은 통나무(곳간 · 짐) · 잔가지 2 가 **곳간에**(사라짐 0 · 짐 0 — 입구가 다 받는다)', `통나무 곳간 ${dOn.gw} = ${dOff.gw} · 잔가지 곳간 ${dOn.gt}`);
  //   도토리 — 셋째 그루마다(사흘 안에 세 그루를 베게 하루 몫을 키운다)
  const accJs = dayJs.replace('ev._woodOutLast=2;', 'ev._woodOutLast=9;');
  const aOff = probe(env(), accJs), aOn = probe(env({ T733_FELL_LOOT: ON }), accJs);
  ok(aOff.cutA >= 1 && aOff.ga === 0 && aOff.lostA === aOff.cutA && aOn.cut === aOff.cut && aOn.gw === aOff.gw && aOn.ga === aOn.cutA && aOn.gt === aOn.cutT && aOn.lostA === 0 && aOn.lostT === 0,
    'ⓑ ★★도토리 달린 그루 — 끔: 도토리가 사라진다 · 켬: 곳간에(통나무 쪽은 같다)', `벤 ${aOn.cut}그루 · 도토리 ${aOn.cutA}(끔 사라짐 ${aOff.lostA} · 켬 곳간 ${aOn.ga}) · 잔가지 ${aOn.cutT}(켬 곳간 ${aOn.gt})`);
  //   행위 층 끔 세계 — 켜도 부르는 자리가 없다(기본 세계 = main 바이트의 근거)
  const noAct = probe(env({ T733_FELL_LOOT: ON, T325_WOOD_ACT: '' }), dayJs);
  ok(noAct.cut === 0 && noAct.gt === 0 && noAct.ga === 0 && noAct.gr === null,
    'ⓐ ★행위 층(`T325_WOOD_ACT`) 끔 세계 — 켜도 아무것도 안 한다(벰 0 · 곳간 0 · 계측 칸 0) ⇒ 기본 세계는 main 그대로', JSON.stringify({ cut: noAct.cut, gt: noAct.gt, gr: noAct.gr }));
}

// ── ① 실행 — 짐(곳간이 안 받을 때) · 해 질 녘 정산(T720) · 틱 앞 손 입고 차례 ───────────────────────────────────
{
  const pk = probe(env({ T733_FELL_LOOT: ON }), `const V=require(${VP}); const P=V.__labProbe._t733Probe;
    const vil={econ:{}};                                                          // 곳간 칸(storage)이 없다 — 입구가 0 을 돌려준다
    const g1=P.lootIn(vil,{wood:6,twig:1,acorn:1}); const p1=JSON.parse(JSON.stringify(vil.econ._t733Pack||null));
    const z=P.put(vil,'twig',0), neg=P.put(vil,'twig',-1);
    vil.econ.storage={}; vil.econ.treasury={}; const g2=P.packIn(vil);
    console.log(JSON.stringify({g1,p1,z,neg,g2:+g2.toFixed(6),pk:vil.econ._t733Pack===undefined?'없음':vil.econ._t733Pack,st:vil.econ.storage,tr:vil.econ.treasury}))`);
  ok(pk.g1 === 0 && pk.p1 && pk.p1.twig === 1 && pk.p1.acorn === 1 && pk.z === 0 && pk.neg === 0 && pk.g2 === 2 && pk.pk === '없음'
     && +((pk.st.twig || 0) + (pk.tr.twig || 0)).toFixed(6) === 1 && +((pk.st.acorn || 0) + (pk.tr.acorn || 0)).toFixed(6) === 1,
    'ⓑ ★★곳간이 안 받으면 — 두 칸은 **마을 짐**에(사라짐 0) · 이튿날 같은 입구로 들고 빈 짐은 칸을 지운다 · 0 · 음수는 안 넣는다', JSON.stringify({ p1: pk.p1, g2: pk.g2 }));
  //   T720 켬(기본) — 해 질 녘 곳간에 닿는 순간: 나무꾼 몸의 통나무 · 잔가지 · 도토리
  const st = `const E=require(${EP}); const V=require(${VP}); const P=V.__labProbe; const T=P._t733Probe;
    P._t400Probe.setup({dayMs:60000,epoch:0,zoneId:'t733',tickCtx:{now:60*60000}});
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); ev._t325Cells=3; ev._woodOutLast=10; ev._t325InflowToday=0;
    const tot=(k)=>(ev.storage[k]||0)+((ev.treasury&&ev.treasury[k])||0); const t0={w:tot('wood'),t:tot('twig'),a:tot('acorn')};
    const vil={name:'x',econ:ev,npcPids:[1]}; const npc={pid:1,simJob:'lumberjack',inventory:{wood:5,twig:2,acorn:1}};
    T.settle(vil,npc,60*60000+40000,{fw:-1});
    console.log(JSON.stringify({t720:T.T720,wood:npc.inventory.wood,twig:npc.inventory.twig,acorn:npc.inventory.acorn,gw:+(tot('wood')-t0.w).toFixed(6),gt:+(tot('twig')-t0.t).toFixed(6),ga:+(tot('acorn')-t0.a).toFixed(6)}))`;
  const sOff = probe(env(), st), sOn = probe(env({ T733_FELL_LOOT: ON }), st);
  ok(sOff.t720 === true && sOff.wood === 0 && sOff.gw === 5 && sOff.twig === 2 && sOff.acorn === 1 && sOn.wood === 0 && sOn.gw === 5 && sOn.twig === 0 && sOn.acorn === 0 && sOn.gt === 2 && sOn.ga === 1,
    'ⓐ ★★T720(기본 켬) 해 질 녘 정산 — 끔: 통나무만 든다(잔가지 2 · 도토리 1 손에) · 켬: 같은 순간 곳간 그 칸에', `끔 손 ${sOff.twig}·${sOff.acorn} ↔ 켬 곳간 ${sOn.gt}·${sOn.ga}`);
  //   T720 끔 — 틱 앞 손 입고(`_lifeHandsIn`): 채집 마을(걷는 목록에 잔가지)의 나무꾼 손
  const hi = `const V=require(${VP}); const P=V.__labProbe; const T=P._t733Probe;
    const pl=new Map([[1,{pid:1,simJob:'lumberjack',inventory:{wood:2,twig:1}}]]);
    P._t475Probe.setDeps({players:pl,t347LootOf:()=>({berry:3,fiber:1,twig:1})});
    const vil={npcPids:[1],econ:{storage:{},treasury:{},_t347Cells:2,_forageOutLast:20,_t347MixShare:0.5,_t347InflowToday:0,_t325Cells:3,_woodOutLast:10,_t325InflowToday:0,_forageActItems:['fruit','twig']}};
    T.handsIn(vil); const e=vil.econ;
    console.log(JSON.stringify({fin:e._t347InflowToday,win:e._t325InflowToday,pwF:vil._t347PreWalked||0,pwW:vil._t325PreWalked||0,twig:pl.get(1).inventory.twig,gt:+((e.storage.twig||0)+(e.treasury.twig||0)).toFixed(6)}))`;
  const hOff = probe(env({ T347_FORAGE_ACT: '1', T720_LON_DAY: '0' }), hi), hOn = probe(env({ T347_FORAGE_ACT: '1', T720_LON_DAY: '0', T733_FELL_LOOT: ON }), hi);
  ok(hOff.fin === 1 && hOff.pwF === 1 && hOff.twig === 0 && hOn.fin === 0 && hOn.pwF === 0 && hOn.gt === 1 && hOn.twig === 0 && hOn.win === hOff.win && hOn.pwW === hOff.pwW,
    'ⓓ ★★T720 끔 틱 앞 손 입고 — 끔: 나무꾼이 벤 잔가지를 **채집 문**이 받고(채집 오늘치 1) 그 나무꾼이 채집 걸은 몸 1 · 켬: 통나무 문이 먼저(채집 오늘치 0 · 채집 걸은 몸 0)',
    `끔 ${JSON.stringify(hOff)} ↔ 켬 ${JSON.stringify(hOn)}`);
}

// ── ② 정적 ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n② 채집 손 "그날 새로 땄나" — 정적');
{
  const nf = body('_t733NewForage'), del = body('_t347Deliver'), hands = body('_lifeHandsIn'), daily = body('_lifeDailySteps'), settle = body('_t720Settle');
  ok(/return T733_FELL_LOOT \? u > \(\(p && p\._t733F\) \|\| 0\) \+ 1e-9 : u > 0;/.test(nf),
    'ⓐ ★술어 — 켬 = 남긴 걷는 몫(`_t733F`)보다 많이 들었나 · 끔 = 손에 걷는 품목이 있나(옛 줄) — 나무꾼 `_t717NewWood` 와 같은 꼴');
  ok(/left \+= npc\.inventory\[h\];/.test(del) && /if \(T733_FELL_LOOT\) npc\._t733F = left;/.test(del),
    'ⓐ 남긴 몫은 `_t347Deliver` 가 적는다(넣은 뒤 손에 남은 걷는 몫의 합 · 켬만)');
  ok(/if \(u > 0\) \{ const nf = _t733NewForage\(p, u\); _t347Deliver\(vil, p\); if \(nf\) n\+\+;/.test(hands)
     && /if \(u > 0\) \{ const nf = _t733NewForage\(p, u\); if \(!T720_LON_DAY\) _t347Deliver\(vil, p\); if \(nf\) _walked\+\+;/.test(daily)
     && /if \(u > 0\) \{ const nf = _t733NewForage\(npc, u\); _t347Deliver\(vil, npc\); const d = _bodyDay\(npc, now\); if \(S\.fw !== d\) \{[^}]*if \(nf\) \{ S\.fw = d; vil\._t347PreWalked = \(vil\._t347PreWalked \| 0\) \+ 1; \} \} \}/.test(settle),
    'ⓑ ★★세 자리(틱 앞 손 입고 · 하루 손 · T720 해 질 녘 도장) 모두 같은 술어 — 넣기는 그대로 · 세기만 바뀐다');
  ok(/p\._t733F = undefined;/.test((ZC.match(/function _t671Shape\(p\) \{[\s\S]*?\n\}/) || [''])[0])
     && (VSRC.match(/npc\._t733F = /g) || []).length === 1,
    'ⓐ ★새 몸 필드 `_t733F` 는 `zone.js _t671Shape` 에(test-body-fields 규약) · 쓰는 자리는 하나');
  ok(noNum(nf), 'ⓐ 새 수 0');
}

// ── ② 실행 ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n② 채집 손 "그날 새로 땄나" — 실행(정본 함수)');
{
  //   틱 앞 손 입고(T720 끔) — 남긴 몫만 든 손 · 새로 딴 손 · 넣은 뒤 남긴 몫(수요 1)
  const hi = (b) => `const V=require(${VP}); const P=V.__labProbe; const T=P._t733Probe;
    const pl=new Map([[1,Object.assign({pid:1,simJob:'forager'},${JSON.stringify(b)})]]);
    P._t475Probe.setDeps({players:pl,t347LootOf:()=>({berry:3,fiber:1,twig:1})});
    const vil={npcPids:[1],econ:{storage:{},treasury:{},_t347Cells:2,_forageOutLast:2,_t347MixShare:0.5,_t347InflowToday:0,_forageActItems:['fruit','twig']}};
    T.handsIn(vil); const p=pl.get(1);
    console.log(JSON.stringify({pw:vil._t347PreWalked||0,po:vil._t733PreO||0,berry:p.inventory.berry,L:p._t733F===undefined?null:p._t733F,fin:vil.econ._t347InflowToday}))`;
  const E2 = { T347_FORAGE_ACT: '1', T720_LON_DAY: '0' };
  const lOff = probe(env(E2), hi({ inventory: { berry: 2 } })), lOn = probe(env(Object.assign({ T733_FELL_LOOT: ON }, E2)), hi({ inventory: { berry: 2 }, _t733F: 2 }));
  const nOff = probe(env(E2), hi({ inventory: { berry: 3 } })), nOn = probe(env(Object.assign({ T733_FELL_LOOT: ON }, E2)), hi({ inventory: { berry: 3 }, _t733F: 2 }));
  ok(lOff.pw === 1 && lOn.pw === 0 && lOn.po === 1 && lOff.fin === 1 && lOn.fin === 1,
    'ⓐⓒ ★★남긴 몫(2)만 든 손 — 끔: 걸은 몸 1(옛 줄) · 켬: 0(옛 셈 1 은 계측 칸에만) · 넣기는 둘 다 같다(오늘치 1)', `끔 ${lOff.pw} · 켬 ${lOn.pw}(옛 ${lOn.po})`);
  ok(nOff.pw === 1 && nOn.pw === 1 && nOff.berry === 2 && nOn.berry === 2 && nOn.L === 2 && nOff.L === null,
    'ⓒ ★새로 딴 손(남긴 2 → 3) — 켬 · 끔 같다(걸은 몸 1 · 수요 1 만 받고 손 2) · 켬은 넣은 뒤 남긴 몫(2)을 몸에 적는다', `${nOff.pw} · ${nOn.pw} · 남긴 몫 ${nOn.L}`);
  //   T720 해 질 녘 도장(기본 켬)
  const st = (b) => `const V=require(${VP}); const P=V.__labProbe; const T=P._t733Probe;
    P._t400Probe.setup({dayMs:60000,epoch:0,zoneId:'t733',tickCtx:{now:60*60000}});
    const pl=new Map([[1,Object.assign({pid:1,simJob:'forager'},${JSON.stringify(b)})]]); P._t475Probe.setDeps({players:pl,t347LootOf:()=>({berry:3,fiber:1,twig:1})});
    const vil={name:'x',npcPids:[1],econ:{storage:{},treasury:{},_t347Cells:2,_forageOutLast:2,_t347MixShare:0.5,_t347InflowToday:0,_forageActItems:['fruit','twig']}};
    const S={fw:-1}; T.settle(vil,pl.get(1),60*60000+40000,S);
    console.log(JSON.stringify({fw:S.fw,pw:vil._t347PreWalked||0,po:vil._t733PreO||0,fin:vil.econ._t347InflowToday}))`;
  const sOff = probe(env({ T347_FORAGE_ACT: '1' }), st({ inventory: { berry: 2 } })), sOn = probe(env({ T347_FORAGE_ACT: '1', T733_FELL_LOOT: ON }), st({ inventory: { berry: 2 }, _t733F: 2 }));
  const sNew = probe(env({ T347_FORAGE_ACT: '1', T733_FELL_LOOT: ON }), st({ inventory: { berry: 3 }, _t733F: 2 }));
  ok(sOff.pw === 1 && sOff.fw !== -1 && sOn.pw === 0 && sOn.fw === -1 && sOn.po === 1 && sOff.fin === sOn.fin && sNew.pw === 1 && sNew.fw === sOff.fw,
    'ⓑ ★★T720 해 질 녘 — 남긴 몫만 든 손: 끔 도장(걸은 몸 1) · 켬 도장 없음(넣기는 같다) · 새로 딴 손은 켬도 도장', `끔 ${sOff.pw} · 켬 ${sOn.pw} · 켬 새로 ${sNew.pw}`);
  //   ⓓ 남긴 몫의 행방 — 정본 `_lifeDaily` 채집 절 + 해 질 녘 정산 사흘(덤불 40 포기 · 그날 몫 2 · 몸 하나가 남긴 몫 6 만 든다 · 수요 문 켬 — 그 몸은 안 딴다)
  const dd = `const E=require(${EP}); const V=require(${VP}); const P=V.__labProbe; const T=P._t733Probe;
    const ccx=100, ccy=100; const players=new Map();
    const b={pid:1,isNpc:true,simJob:'forager',hp:100,maxHp:100,inventory:{berry:6}}; if (T.ON) b._t733F=6; players.set(1,b);
    const now={}; for (let i=0;i<40;i++) now[(ccx+25)+','+(ccy-20+i)]=[{type:'berry_bush',seedKey:'b'+i}];
    let picks=0;
    const deps={players,broadcast(){},moveSpeed:64,dayPhaseRatio:0.7,worldPhase:()=>0.3,anyViewerNear:()=>false,
      t347LootOf:()=>({berry:3,fiber:1,twig:1}), t347GrovesAtCell:(x,y,raw)=>now[x+','+y]||null,
      t347PickAt:(cx,cy)=>{const k=cx+','+cy; const a=now[k]; if(!a||!a.length) return null; a.pop(); if(!a.length) delete now[k]; picks++; return {berry:3,fiber:1,twig:1};},
      t341Unharvest:()=>0};
    P._t400Probe.setup({deps,db:{insertVillageBuilding:()=>1},dayMs:60000,epoch:0,zoneId:'t733',tickCtx:{now:60*60000}});
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); ev.counts=ev.counts||{}; ev.counts.forager=1;
    const terr=new Set(); for(let dx=-3;dx<=3;dx++) for(let dy=-3;dy<=3;dy++) terr.add((ccx+dx)+','+(ccy+dy));
    const vil={dbId:7,name:'x',ccx,ccy,econ:ev,npcPids:[1],_terrSet:terr,_farmSet:new Set(),_drySet:new Set(),_potSet:new Set(),_crop:new Map(),_cropClaim:new Set(),_claim:new Set(),_site:null,_houseCells:[],_granList:[],_maxRPx:200};
    const fr=()=>(ev.storage.fruit||0)+((ev.treasury&&ev.treasury.fruit)||0)+(ev.storage.twig||0)+((ev.treasury&&ev.treasury.twig)||0); const f0=fr();
    const days=[]; let S={fw:-1};
    for (let d=0; d<3; d++) {
      P._t400Probe.setup({tickCtx:{now:(60+d)*60000}}); ev._forageOutLast=4; ev._t347MixShare=0.5; ev._t347InflowToday=0;   // 그날 econ 틱(오늘치를 비우고 몫 2 를 다시 낸다)
      const p0=picks, g0=fr(); P._t449Probe.daily(vil); const D=vil._t347Dbg||{}; const gB=+(fr()-g0).toFixed(4);
      T.settle(vil,b,(60+d)*60000+40000,S);                                                                                    // 해 질 녘 — 몸이 곳간에 닿는다
      days.push({walked:D.walked,picks:picks-p0,batch:gB,hand:b.inventory.berry,gran:+(fr()-f0).toFixed(4),t733:D.t733||null});
    }
    console.log(JSON.stringify({on:T.ON,days,W:vil._t733Wf||null}))`;
  const E3 = { T347_FORAGE_ACT: '1', T325_WOOD_ACT: '' };
  const dOff = probe(env(E3), dd), dOn = probe(env(Object.assign({ T733_FELL_LOOT: ON }, E3)), dd);
  const col = (o, k) => o.days.map((x) => x[k]).join('·');
  ok(dOff.on === false && col(dOff, 'walked') !== '0·0·0' && col(dOff, 'picks') === '0·0·0' && col(dOff, 'hand') === '4·2·0' && dOff.days[2].gran === 6,
    'ⓓ ★★끔 — 남긴 몫만 든 몸을 걸은 몸으로 센다 ⇒ 일괄 0 · 해 질 녘마다 손에서 그날 몫(2)이 든다(손 6 → 4 → 2 → 0 · 곳간 6)',
    `걸음 ${col(dOff, 'walked')} · 일괄 ${col(dOff, 'picks')} · 손 ${col(dOff, 'hand')}`);
  ok(dOn.on === true && col(dOn, 'walked') === '0·0·0' && dOn.days.every((x) => x.batch === 2) && col(dOn, 'hand') === '6·6·6' && dOn.days[2].gran === 6
     && dOn.days.every((x) => x.t733 && x.t733[0] >= 1 && x.t733[1] === 0) && dOn.W && dOn.W.d === 3 && dOn.W.un === 3,
    'ⓓ ★★★켬 — 그 몸은 걸은 몸이 아니다 ⇒ 일괄(짐 · 덤불)이 그날 몫(2)을 채우고 · 해 질 녘 손은 곳간이 안 받는다(손 6 그대로 · 곳간은 같은 6) · 계측 칸: 갈린 날 3 · 옛 셈이면 막혔을 일괄 3',
    `걸음 ${col(dOn, 'walked')} · 일괄 딴 개체 ${col(dOn, 'picks')} · 일괄 곳간 ${col(dOn, 'batch')} · 손 ${col(dOn, 'hand')} · ${JSON.stringify(dOn.W)}`);
  //   채집 층 끔 세계 — 켜도 아무것도 안 한다
  const noF = probe(env({ T733_FELL_LOOT: ON, T347_FORAGE_ACT: '', T325_WOOD_ACT: '' }), dd);
  ok(noF.days.every((x) => x.walked === undefined && x.picks === 0 && x.hand === 6) && noF.W === null,
    'ⓐ ★채집 층(`T347_FORAGE_ACT`) 끔 세계 — 켜도 세는 자리 · 넣는 자리가 안 돈다(손 그대로 · 계측 칸 0)', JSON.stringify(noF.days[0]));
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
