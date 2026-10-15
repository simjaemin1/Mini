#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-dusk-stamp.js — 해 질 녘 통나무 도장 = T717 ② 셈(T743 ①) — 손잡이 `T743_DUSK_STAMP`(기본 끔) ==========
//
// ★왜 [지시 T743 ① · T733 회부 2]
//   "그날 걸은 몸" 수는 헤드리스 일괄을 막는 문이다(T475 `_t325PreWalked` · 몸 XOR 일괄).
//   통나무 손을 세는 세 자리 — 틱 앞 손 입고 `_lifeHandsIn`(T720 끔) · 하루 손 `_lifeDaily`(경계 셈) · T720 해 질 녘 정산 `_t720Settle`.
//   종전: 앞의 둘은 T717 ② 술어(`_t717NewWood` — 남긴 몫 `_t717L` 보다 많이 들었나)로 셌는데 해 질 녘 도장(`_t561Walked`)만 손에 통나무가
//   있기만 하면 찍었다 ⇒ 곳간이 안 받아 손에 남긴 몫만 든 나무꾼이 경계 셈엔 안 걸은 몸 · 해 질 녘엔 걸은 몸(한 몸 두 뜻).
//   켬: 해 질 녘도 같은 술어 — 그날 새로 벤 손만 도장 · 넣기는 그대로.
//   지키는 것: ⓐ 끔 = 종전 글자 · ⓑ 세 자리 모두 같은 술어 · ⓒ 새로 벤 손 · 넣는 몫은 켬 · 끔 같다 · 새 수 0 · 새 몸 필드 0 ·
//             ⓓ 대가 — 남긴 몫이 손에 머무는 날(정본 `_lifeDaily` + 해 질 녘 엿새 표) · ⓔ 행위 층 · T717 ② 를 끈 세계는 켬 = 끔.
//
// ⚠존을 부팅하지 않는다 — 생활층 정본 함수를 `__labProbe._t743Probe` 로 그대로 부른다(규칙 사본 0).
// 실행: node scripts/test-dusk-stamp.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
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
const VC = codeOf(VSRC), ZC = codeOf(ZSRC);
const body = (name) => (VC.match(new RegExp('function\\*? ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}')) || [''])[0];
const noNum = (s) => !/[^\w.](?:[1-9]|\d{2,})(?:\.\d+)?(?![\w])/.test(s);
const ON = '1';
//   손잡이는 기본값 그대로(T717 ② · T720 · T733 켬) · 행위 층(T325)은 연다 · 몸 명부 손잡이들은 끔(test-fell-loot 와 같은 바탕)
const BASE = { T743_DUSK_STAMP: undefined, T325_WOOD_ACT: '1', T347_FORAGE_ACT: '', T374_DEMAND_STOP: '1', T449_BODY_DAY: '', T491_BATCH_FROM_BODY: '', T561_ROSTER_BODY: '',
  T717_WOOD_HAND: undefined, T720_LON_DAY: undefined, T733_FELL_LOOT: undefined, T490_FORAGE_REACH: '0' };
const env = (o) => Object.assign({}, BASE, o || {});

console.log('\n=== 해 질 녘 통나무 도장 = T717 ② 셈(T743 ①) ===');

// ── ① 정적 ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n① 정적');
{
  const settle = body('_t720Settle'), gap = body('_t743Gap'), hands = body('_lifeHandsIn'), daily = body('_lifeDailySteps'), ladder = body('_t561Ladder');
  ok(/const T743_DUSK_STAMP = process\.env\.T743_DUSK_STAMP === '1';/.test(VC), 'ⓐ 손잡이 `T743_DUSK_STAMP` — 기본 끔(`1` 만 켬)');
  ok(/if \(!T743_DUSK_STAMP\) \{ _t325Deliver\(vil, npc\); _t561Walked\(vil, npc, now\); \}/.test(settle),
    'ⓐ ★★끔 = 종전 글자 그대로(`_t325Deliver(vil, npc); _t561Walked(vil, npc, now);` — 손에 통나무가 있으면 도장)');
  const on = (settle.match(/else \{ const nw = _t717NewWood\(npc\); _t325Deliver\(vil, npc\); if \(nw\) _t561Walked\(vil, npc, now\); else _t743Gap\(vil, npc, now\); \}/) || [''])[0];
  ok(on.length > 0, 'ⓑ ★★켬 — 넣기 **전에** T717 ② 술어(`_t717NewWood`)로 묻고 새로 벤 손만 도장 · 넣기는 그대로(같은 `_t325Deliver`)');
  ok(/const nw = _t717NewWood\(p\); _t325Deliver\(vil, p\); if \(nw\) n\+\+;/.test(hands) && /const nw = _t717NewWood\(p\); if \(!T720_LON_DAY\) _t325Deliver\(vil, p\); if \(nw\) _walked\+\+;/.test(daily) && on.length > 0,
    'ⓑ ★★★세 자리(틱 앞 손 입고 · 하루 손 경계 셈 · 해 질 녘 도장) 모두 같은 술어 `_t717NewWood`(켬)');
  ok(/if \(T720_LON_DAY && _t720Step\(vil, npc, now, fv, dayR, bday\)\) return true;/.test(VC)
     && /if \(E\.T325_WOOD_ACT && E\.woodActOn\(vil\.econ\) && _t720Logger\(vil, npc\) && npc\.inventory && \(npc\.inventory\.wood \|\| 0\) > 0\) \{/.test(settle),
    'ⓔ 부르는 자리는 T720 해 질 녘 정산 하나(T720 켬 · 행위 층 켬 · 나무꾼 손 — 문은 종전 그대로)');
  ok(!/(?:npc|p)\._t743\w* =/.test(VC) && /if \(npc\._t561Wd !== d\) vil\._t743G = \(vil\._t743G \| 0\) \+ 1;/.test(gap)
     && !new RegExp('_t743').test((ZC.match(/function _t671Shape\(p\) \{[\s\S]*?\n\}/) || [''])[0]),
    'ⓒ ★새 몸 필드 0 — 도장은 몸의 `_t561Wd` 그대로 · 계측 칸(`_t743G` · `_t743W`)은 켠 팔 마을에만');
  ok(/vil\._t325Dbg\.t743 = \[_walked \+ g, _walked\];/.test(daily) && /if \(T743_DUSK_STAMP\) \{/.test(daily),
    'ⓒ 계측 칸 — 하루 손이 그날 셈과 함께 거둔다([옛 글자 · 새] · 켠 팔만)');
  ok(noNum(on) && noNum(gap.replace(/\| 0\) \+ 1/, '')), 'ⓒ ★새 수 0 — 도장 줄 · 계측 줄에 상수가 없다');
  ok(/const got = _t325Deliver\(vil, npc\);\s*_t561Walked\(vil, npc, now\);/.test(ladder),
    'ⓓ T561 사다리(켠 팔만 · 기본 끔)는 안 만졌다 — T561 의 걸은 몸은 "그날 나섰나"(다른 술어 · 보고 회부)');
}

// ── ② 실행 — 해 질 녘 한 번(정본 `_t720Settle`) ─────────────────────────────────────────────────────────────
console.log('\n② 실행 — 해 질 녘 한 번(정본 함수 · 행위 층 켬 · T720 켬)');
{
  const st = (b, extra) => `const E=require(${EP}); const V=require(${VP}); const P=V.__labProbe; const T=P._t743Probe;
    P._t400Probe.setup({dayMs:60000,epoch:0,zoneId:'t743',tickCtx:{now:60*60000}});
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); ev._t325Cells=3; ev._woodOutLast=10; ev._t325InflowToday=0;
    const tot=(k)=>(ev.storage[k]||0)+((ev.treasury&&ev.treasury[k])||0); const w0=tot('wood');
    const vil={name:'x',econ:ev,npcPids:[1]}; const npc=Object.assign({pid:1,simJob:'lumberjack'},${JSON.stringify(b)});
    ${extra || ''}
    const nw=T.newWood(npc); T.settle(vil,npc,60*60000+40000,{fw:-1});
    console.log(JSON.stringify({on:T.ON,t717:T.T717,t720:T.T720,nw,pw:vil._t325PreWalked||0,g:vil._t743G||0,wd:npc._t561Wd===undefined?null:npc._t561Wd,hand:npc.inventory.wood,L:npc._t717L,gw:+(tot('wood')-w0).toFixed(6)}))`;
  const left = { inventory: { wood: 6 }, _t717L: 6 }, fresh = { inventory: { wood: 9 }, _t717L: 6 };
  const lOff = probe(env(), st(left)), lOn = probe(env({ T743_DUSK_STAMP: ON }), st(left));
  ok(lOff.on === false && lOff.t717 === true && lOff.t720 === true && lOff.nw === false && lOff.pw === 1 && lOff.wd === 60,
    'ⓐ ★★끔 — 남긴 몫(6)만 든 손: T717 ② 술어는 "새로 안 벴다"인데 해 질 녘 도장은 찍힌다(걸은 몸 1 — 한 몸 두 뜻)', JSON.stringify(lOff));
  ok(lOn.on === true && lOn.nw === false && lOn.pw === 0 && lOn.wd === null && lOn.g === 1 && lOn.hand === lOff.hand && lOn.gw === lOff.gw && lOn.L === lOff.L,
    'ⓑ ★★★켬 — 같은 손: 도장 없음(걸은 몸 0 · 계측 칸 갈린 몸 1) · 넣기는 끔과 같다(곳간 +6 · 손 0)', JSON.stringify(lOn));
  const nOff = probe(env(), st(fresh)), nOn = probe(env({ T743_DUSK_STAMP: ON }), st(fresh));
  ok(nOff.nw === true && nOff.pw === 1 && nOn.pw === 1 && nOn.g === 0 && nOn.wd === nOff.wd && nOn.gw === nOff.gw && nOn.hand === nOff.hand,
    'ⓒ ★새로 벤 손(남긴 6 → 9) — 켬 · 끔 같다(도장 1 · 넣는 몫 같다)', `끔 ${JSON.stringify(nOff)} ↔ 켬 ${JSON.stringify(nOn)}`);
  //   그날 이미 도장이 있는 몸(T561 ⓓ 처럼 다른 자리가 먼저 찍었다) — 옛 글자도 아무것도 안 했을 몸 = 갈린 몸이 아니다
  const pre = probe(env({ T743_DUSK_STAMP: ON }), st(left, 'npc._t561Wd=60;'));
  ok(pre.pw === 0 && pre.g === 0 && pre.wd === 60, 'ⓒ 그날 이미 도장 있는 몸 — 갈린 몸으로 안 센다(옛 글자도 0 을 더했을 몸)', JSON.stringify(pre));
  //   T717 ② 를 끈 세계(`T717_WOOD_HAND=0`) — 술어가 "손에 있나"라 켬 = 끔
  const k0 = { inventory: { wood: 6 } };
  const t0Off = probe(env({ T717_WOOD_HAND: '0' }), st(k0)), t0On = probe(env({ T717_WOOD_HAND: '0', T743_DUSK_STAMP: ON }), st(k0));
  ok(t0Off.t717 === false && t0On.nw === true && t0On.pw === 1 && t0Off.pw === 1 && t0On.g === 0 && t0On.hand === t0Off.hand && t0On.gw === t0Off.gw,
    'ⓔ ★T717 ② 끈 세계 — 술어 = 손에 있나 ⇒ 켬 = 끔(도장 1 · 손 0)', `끔 ${t0Off.pw} · 켬 ${t0On.pw}`);
  //   나무꾼이 아닌 손(집 크루 등 `_t720Logger` 밖) — 종전 문 그대로(통나무 정산 0)
  const crew = probe(env({ T743_DUSK_STAMP: ON }), st(left, "npc.simJob='builder';"));
  ok(crew.pw === 0 && crew.g === 0 && crew.hand === 6 && crew.gw === 0, 'ⓔ 나무꾼 손이 아니면 — 켜도 통나무 정산 0(문은 종전 그대로)', JSON.stringify(crew));
}

// ── ③ 실행 — 여러 날(정본 `_lifeDaily` 경계 셈 · 일괄 + 해 질 녘 정산) ─────────────────────────────────────────────
console.log('\n③ 실행 — 엿새(정본 `_lifeDaily` + 해 질 녘 · 숲 12셀 × 3그루 · 한 그루 6단 · 하루 몫 2 · 나무꾼 1 · 몸 하나가 남긴 몫 6 만 든다)');
let tbl = null;
{
  const dd = (days) => `const E=require(${EP}); const V=require(${VP}); const P=V.__labProbe; const T=P._t743Probe;
    const ccx=400, ccy=400; const players=new Map();
    const b={pid:1,isNpc:true,simJob:'lumberjack',hp:100,maxHp:100,inventory:{wood:6},_t717L:6}; players.set(1,b);
    const trees=new Map(); for(let i=0;i<12;i++) trees.set((ccx+10)+','+(ccy+i),3); let cut=0;
    const deps={players,broadcast(){},moveSpeed:64,dayPhaseRatio:0.7,worldPhase:()=>0.3,anyViewerNear:()=>false,
      t325TreesAtCell:(cx,cy)=>{const n=trees.get(cx+','+cy)||0; return n>0?Array.from({length:n},(_,j)=>({id:cx+'_'+cy+'_'+j,seedKey:'s'+cx+'_'+cy+'_'+j})):[];},
      t325CutTreeAt:(cx,cy)=>{const k=cx+','+cy; const n=trees.get(k)||0; if(!n) return null; trees.set(k,n-1); cut++; return {wood:6,twig:1};},
      t325LootOf:()=>({wood:6,twig:1}), t341Unharvest:()=>0};
    P._t400Probe.setup({deps,db:{insertVillageBuilding:()=>1},dayMs:60000,epoch:0,zoneId:'t743',tickCtx:{now:60*60000}});
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); ev.counts=ev.counts||{}; ev.counts.lumberjack=1;
    const tot=(k)=>(ev.storage[k]||0)+((ev.treasury&&ev.treasury[k])||0); const w0=tot('wood');
    const terr=new Set(); for(let dx=-3;dx<=3;dx++) for(let dy=-3;dy<=3;dy++) terr.add((ccx+dx)+','+(ccy+dy));
    const vil={dbId:7,name:'x',ccx,ccy,econ:ev,npcPids:[1],_terrSet:terr,_farmSet:new Set(),_drySet:new Set(),_potSet:new Set(),_crop:new Map(),_cropClaim:new Set(),_claim:new Set(),_site:null,_houseCells:[],_granList:[],_maxRPx:200};
    const out=[]; let S={fw:-1};
    for (let d=0; d<${days}; d++) {
      P._t400Probe.setup({tickCtx:{now:(60+d)*60000}}); ev._woodOutLast=2; ev._t325InflowToday=0;      // 그날 econ 틱(오늘치를 비우고 몫 2)
      const c0=cut, g0=tot('wood'); T.daily(vil); const D=vil._t325Dbg||{}; const gB=+(tot('wood')-g0).toFixed(4);   // 경계 — 하루 손 셈 · 짐 · 일괄
      const h0=b.inventory.wood, g1=tot('wood'); T.settle(vil,b,(60+d)*60000+40000,S);                        // 해 질 녘 — 몸이 곳간에 닿는다
      out.push({walked:D.walked,cut:cut-c0,batch:gB,dusk:+(tot('wood')-g1).toFixed(4),hand:b.inventory.wood,pack:+((ev._t717Pack||0)).toFixed(4),t743:D.t743||null});
    }
    console.log(JSON.stringify({on:T.ON,days:out,cut,gran:+(tot('wood')-w0).toFixed(4),W:vil._t743W||null}))`;
  const N = 6;
  const dOff = probe(env(), dd(N)), dOn = probe(env({ T743_DUSK_STAMP: ON }), dd(N));
  const col = (o, k) => o.days.map((x) => x[k]).join('·');
  //   손에 머문 날 — 남긴 몫 6 이 손에서 다 빠진 날(없으면 판 끝까지 머문다)
  const stay = (o) => { const i = o.days.findIndex((x) => !(x.hand > 0)); return i < 0 ? `${N}일 넘게(끝까지 ${o.days[N - 1].hand})` : `${i + 1}일째 비었다`; };
  ok(dOff.on === false && col(dOff, 'walked') === '0·1·1·1·1·1' && col(dOff, 'cut') === '1·0·0·0·0·0' && col(dOff, 'hand') === '6·6·6·4·2·0' && dOff.gran === 12,
    'ⓓ ★★끔(종전 글자) — 경계 셈은 그 몸을 안 센다(날 1: 0) · 해 질 녘 도장이 이튿날부터 일괄을 막는다 ⇒ 짐(4)이 이틀 · 손이 사흘 곳간 몫을 댄다(손 6 → 0)',
    `걸음 ${col(dOff, 'walked')} · 벤 그루 ${col(dOff, 'cut')} · 손 ${col(dOff, 'hand')} · 곳간 ${dOff.gran}`);
  ok(dOn.on === true && col(dOn, 'walked') === '0·0·0·0·0·0' && col(dOn, 'cut') === '1·0·0·1·0·0' && col(dOn, 'hand') === '6·6·6·6·6·6' && dOn.gran === dOff.gran
     && dOn.days.slice(1).every((x) => x.t743 && x.t743[0] === 1 && x.t743[1] === 0) && dOn.W && dOn.W.d === N - 1 && dOn.W.un === N - 1 && dOn.W.n === N - 1,
    'ⓓ ★★★켬 — 그 몸은 엿새 내내 안 걸은 몸 ⇒ 일괄(짐 · 숲)이 매일 그날 몫(2)을 채우고 해 질 녘 손은 곳간이 안 받는다(손 6 그대로 · 곳간은 같은 12 · 벤 그루 +1) · 계측 칸: 갈린 날 5 · 옛 글자면 막혔을 일괄 5',
    `걸음 ${col(dOn, 'walked')} · 벤 그루 ${col(dOn, 'cut')} · 손 ${col(dOn, 'hand')} · 곳간 ${dOn.gran} · ${JSON.stringify(dOn.W)}`);
  tbl = { off: dOff, on: dOn, stayOff: stay(dOff), stayOn: stay(dOn) };
  ok(true, `ⓓ 손에 머문 날 — 끔 ${tbl.stayOff} · 켬 ${tbl.stayOn}(T733 회부 2 의 대가가 나무꾼 손에도 선다 · 소멸 0 — 곳간 + 짐 + 손 = 벤 몫 + 처음 손)`);
  //   항등 — 두 팔 모두 벤 몫 + 처음 손 = 곳간 + 짐 + 손(통나무 · 소멸 0)
  const bal = (o) => +(o.cut * 6 + 6 - o.gran - o.days[N - 1].pack - o.days[N - 1].hand).toFixed(6);
  ok(bal(dOff) === 0 && bal(dOn) === 0, 'ⓓ ★통나무 항등(두 팔) — 벤 몫 + 처음 손 = 곳간 + 짐 + 손(사라짐 0)', `끔 ${bal(dOff)} · 켬 ${bal(dOn)}`);
  //   행위 층 끔 세계 — 켜도 아무것도 안 한다
  const noAct = probe(env({ T743_DUSK_STAMP: ON, T325_WOOD_ACT: '' }), dd(3));
  ok(noAct.cut === 0 && noAct.days.every((x) => x.hand === 6 && x.t743 === null && x.dusk === 0) && noAct.W === null,
    'ⓔ ★행위 층(`T325_WOOD_ACT`) 끔 세계 — 켜도 세는 자리 · 넣는 자리가 안 돈다(손 그대로 · 계측 칸 0)', JSON.stringify(noAct.days[0]));
}

// ── ④ 실행 — T720 끈 세계(틱 앞 손 입고 `_lifeHandsIn`) — 해 질 녘 정산이 없다 ⇒ 켬 = 끔 ─────────────────────────────
console.log('\n④ 실행 — T720 끈 세계');
{
  const hi = `const V=require(${VP}); const P=V.__labProbe; const T=P._t743Probe;
    const pl=new Map([[1,{pid:1,simJob:'lumberjack',inventory:{wood:6},_t717L:6}],[2,{pid:2,simJob:'lumberjack',inventory:{wood:9},_t717L:6}]]);
    P._t475Probe.setDeps({players:pl});
    const vil={npcPids:[1,2],econ:{storage:{},treasury:{},_t325Cells:3,_woodOutLast:20,_t325InflowToday:0}};
    T.handsIn(vil);
    console.log(JSON.stringify({t720:T.T720,pw:vil._t325PreWalked||0,win:vil.econ._t325InflowToday,h1:pl.get(1).inventory.wood,h2:pl.get(2).inventory.wood}))`;
  const off = probe(env({ T720_LON_DAY: '0' }), hi), on = probe(env({ T720_LON_DAY: '0', T743_DUSK_STAMP: ON }), hi);
  ok(off.t720 === false && off.pw === 1 && JSON.stringify(on) === JSON.stringify(off),
    'ⓔ T720 끔 — 틱 앞 손 입고는 이미 T717 ② 술어(남긴 몫만 든 몸 0 · 새로 벤 몸 1) · 켬 = 끔(같은 셈 · 같은 넣기)', `끔 ${JSON.stringify(off)} ↔ 켬 ${JSON.stringify(on)}`);
}

if (tbl && process.env.T743_TABLE) {
  const r = (o) => o.days.map((x, i) => `| ${i + 1} | ${x.walked} | ${x.cut} | ${x.batch} | ${x.dusk} | ${x.hand} | ${x.pack} |`).join('\n');
  fs.writeFileSync(process.env.T743_TABLE, JSON.stringify({ off: tbl.off, on: tbl.on, stayOff: tbl.stayOff, stayOn: tbl.stayOn, md: { off: r(tbl.off), on: r(tbl.on) } }, null, 1));
}
console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
