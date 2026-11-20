#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @bait 2   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1393-hunt-chase.js — 사냥꾼이 짐승 몸을 걸어가 잡는다(T1393 · 사냥판) =====================================
//
// 지키는 것(가짜 존 · 몸 표 하나 · 게임분 단위 · 서버 0 · 몇 초):
//   ① 손잡이 `T1393_HUNT_CHASE` — 끔 기본 · `'1'` 만 · 몸 판(`T1331_BEAST_BODY`) 켬 안에서만 뜻(villages `t1393On` · wildlife `T1393`)
//   ② 사냥판 — 사냥꾼 하나 24게임시간 · 사슴 무리터(몸 58 · 서식 2,923칸 · 환율 5,000):
//      사냥꾼이 몸을 깨워 쫓아 잡는다(죽음 ≥ 1 · 사냥꾼 몫 `_huntKil` = 몸 표 사냥 죽음 = 종 기록 합) · 보존(살아 있는 몸 = 처음 − 죽음 = 셈식) ·
//      깬 몸 ≤ `MOB_CAP` · 블록이 덜어 낸 몸 0 · 같은 씨 두 번 = 같은 몸 지문
//   ③ 깨어남 ↔ 표 왕복 — 다친 몸(hp 12) 곁에 사람이 서면 깨고(`mat` 1 · 랩 hp 1.2) · 떠나면 그 자리 · 그 상처 그대로 표로(`mat` 0 · hp 12 · 몸 수 같음)
//   ④ 두 길 0 — 몸 판 하루(`_t1331DaySteps`)가 켬에서 하루 규칙(`beast-body.hunt`)을 안 부른다(몸 하나 = 한 마리 `T1359_HUNT_BODY` 를 같이 켜도 사냥 죽음 0 ·
//      몫 0) · 끔 = 종전(사흘 셋 — 자명 통과 금지 앵커)
//   ⑤ 고기가 곳간에 — 쫓아 잡은 마리(`_huntKil` · 종 `_t1195Sp`)가 하루 경계(`_t1195HuntIn` ①)에 정본 드롭 kg 그대로 곳간 고기로 · 켬 = 읽은 마리를 비운다(끔 = 남는다)
//   ⑥ 깨어남 반경 글자 — 사냥꾼 두뇌 방심 포착 반경 216 이 두뇌 줄 글자와 같다(`calm3 ? 216 :`)
//   ⑦ 미끼(이 파일 안 · 둘) — ⓐ wildlife 잠듦의 `hideAt` 줄을 뺀 사본 → ③ 빨강(몸이 표로 안 돌아간다)
//                            ⓑ villages 하루 규칙 문(`_t1393On() ? null : B.hunt(`)을 `B.hunt(` 로 바꾼 사본 → ④ 빨강(두 길)
//   날짜 · 벽시계를 쓰지 않는다(게임분 · 날 수만).
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
console.log('\n=== T1393 — 사냥꾼이 짐승 몸을 걸어가 잡는다(사냥판) ===');
const KN = ['T1331_BEAST_BODY', 'T1393_HUNT_CHASE', 'T1359_HUNT_BODY', 'T1195_HUNT_REAL', 'T1331_BEAST_SCALE', 'NODE_OPTIONS', 'ENABLE_VILLAGES', 'T1243_FARM_ON'];
const kid = (env, code) => { const e = Object.assign({}, process.env); for (const k of KN) delete e[k]; Object.assign(e, env);
  const out = execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 });
  return JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop()); };
//   글자 사본 하나 — 그 파일을 읽을 때 메모리에서만 needle 을 바꾼다(바꾼 자리 수를 `__baitN` 에) · 제품 파일 손 0
const BAIT = (file, needle, rep) => `const __M=require('module'),__c=__M.prototype._compile,__F=require('path').join(process.cwd(),${JSON.stringify(file)});globalThis.__baitN=-1;
__M.prototype._compile=function(c,f){if(f===__F){globalThis.__baitN=c.split(${JSON.stringify(needle)}).length-1;if(globalThis.__baitN===1)c=c.replace(${JSON.stringify(needle)},${JSON.stringify(rep)});}return __c.call(this,c,f);};`;
// ── ① 손잡이 ──
const K = kid({}, `const V=require('./server/villages'),W=require('./server/wildlife');console.log(JSON.stringify({v:V.T1393_HUNT_CHASE,on:V.t1393On(),w:W.T1393}));`);
const K1 = kid({ T1393_HUNT_CHASE: '1' }, `const V=require('./server/villages'),W=require('./server/wildlife');console.log(JSON.stringify({v:V.T1393_HUNT_CHASE,on:V.t1393On(),w:W.T1393}));`);
const K2 = kid({ T1393_HUNT_CHASE: '1', T1331_BEAST_BODY: '1' }, `const V=require('./server/villages'),W=require('./server/wildlife');console.log(JSON.stringify({v:V.T1393_HUNT_CHASE,on:V.t1393On(),w:W.T1393}));`);
const K3 = kid({ T1393_HUNT_CHASE: 'yes', T1331_BEAST_BODY: '1' }, `const V=require('./server/villages'),W=require('./server/wildlife');console.log(JSON.stringify({v:V.T1393_HUNT_CHASE,on:V.t1393On(),w:W.T1393}));`);
ok(K.v === false && K.on === false && K.w === false && K1.v === true && K1.on === false && K1.w === false && K2.on === true && K2.w === true && K3.on === false,
  '① T1393_HUNT_CHASE — 끔 기본 · `1` 만 · 몸 판 켬 안에서만 뜻', JSON.stringify({ K, K1, K2, K3 }));
// ── ② · ③ 사냥판(가짜 존) ──
const FIELD = (pre, mode) => `${pre || ''}
const BB=require('./server/beast-body'),Wl=require('./server/wildlife');
let seed=7;const rng=()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const B=BB.create({L_GAMEMAX:100,L_GAMER:0.002,huntTake:()=>0,species:['deer'],scale:5000});
const led=new Map();const R=Math.sqrt(2923/Math.PI);for(let x=-31;x<=31;x++)for(let y=-31;y<=31;y++)if(x*x+y*y<=R*R)led.set((500+x)+','+(500+y),0);
const ks=[...led.keys()];for(const k of ks)led.set(k,58*5000/ks.length);B.migrate('V',led,1);
const mobs=new Map(),players=new Map(),cm={chunkSize:1024,keyOf:(cx,cy)=>cx+'_'+cy,insertMob:()=>{},removeMob:()=>{},updateMobChunk:()=>{}};
Wl.init({ZONE_ID:'hanbando',ZONE:{zoneWidth:40000,zoneHeight:40000},TICK_HZ:30,chunkManager:cm,mobs,players,isTerrainBlockedLocal:()=>false,isRockTileLocal:()=>false,
 terrainMod:{getForestMultiplier:()=>2},getActiveChunkKeys:()=>new Set(),isPositionActive:()=>true,spawnCorpse:()=>null,damagePlayer:(p,d)=>{p.hp-=d;},broadcast:()=>{},
 WORLD:{dayLengthMs:1440000,dayPhaseRatio:0.7,worldEpoch:0},setMobHp:(m,v)=>{m.hp=v;},simVillages:()=>[],legacyVillages:[],rng,huntBudgetOf:()=>Infinity,t1393Put:(p,x,y)=>{p.x=x;p.y=y;}});
const n0=B.alive();let now=7*3600*1000;const T=(min)=>{for(let m=0;m<min;m+=6){now+=6000;Wl.tick(now);}};
const sig=()=>{const a=[];for(const b of B.W.bodies.values())a.push(b.id,b.cx,b.cy,b.hp|0,b.mat);return require('crypto').createHash('sha1').update(a.join(',')).digest('hex').slice(0,16);};
let r={};
if(${JSON.stringify(mode)}==='hunt'){
  const h={pid:'h1',isNpc:true,simJob:'hunter',_huntOn:1,hp:100,x:500*32,y:470*32,_workSite:{x:500*32,y:480*32},_huntWk:{cx:500,cy:480},vx:0,vy:0};players.set('h1',h);
  T(1440);const st=Wl.t1393Stat();const sp=h._t1195Sp||{};
  r={n0,alive:B.alive(),expect:B.expect(),died:B.W.st.died,kil:h._huntKil|0,spN:Object.values(sp).reduce((a,c)=>a+c,0),wake:st.wake,peak:st.awakePeak,cut:st.cut,own:st.ownPeak,sig:sig()};
}else{
  let b0=null,bd=1e9;for(const b of B.W.bodies.values()){const d=Math.hypot(b.cx-500,b.cy-500);if(d<bd){bd=d;b0=b;}}b0.hp=12;
  const P={pid:'p1',isNpc:false,hp:100,x:(b0.cx+150)*32,y:b0.cy*32,vx:0,vy:0};players.set('p1',P);
  T(30);const st1=Wl.t1393Stat();const lm=Wl._debug&&null;const mat1=b0.mat;
  P.x=(b0.cx+5000)*32;T(600);const st2=Wl.t1393Stat();
  r={n0,alive:B.alive(),expect:B.expect(),mat1,mat2:b0.mat,hp2:b0.hp,alive0:B.W.bodies.has(b0.id),wake:st1.wake,sleep:st2.sleep,awakeEnd:[...B.W.bodies.values()].filter(b=>b.mat).length,sig:sig(),baitN:globalThis.__baitN};
}
console.log(JSON.stringify(r));`;
const ON = { T1331_BEAST_BODY: '1', T1393_HUNT_CHASE: '1', T1195_HUNT_REAL: '1' };
let H1 = {}, H2 = {}, W1 = {};
try { H1 = kid(ON, FIELD('', 'hunt')); H2 = kid(ON, FIELD('', 'hunt')); } catch (e) { H1 = H2 = { err: String(e).slice(0, 300) }; }
ok(H1.died && H1.died.hunt >= 1 && H1.kil === H1.died.hunt && H1.spN === H1.died.hunt && H1.wake > 0 && H1.own === 1,
  '② 사냥꾼 하나가 몸을 깨워 쫓아 잡는다 — 사냥 죽음 = 사냥꾼 몫 = 종 기록 합', JSON.stringify({ died: H1.died, kil: H1.kil, spN: H1.spN, wake: H1.wake, own: H1.own, err: H1.err }));
ok(H1.alive === H1.expect && H1.alive === H1.n0 - (H1.died ? H1.died.hunt + H1.died.seen : 0) && H1.peak <= 50 && H1.cut === 0,
  '② 보존 — 살아 있는 몸 = 처음 − 죽음 = 셈식 · 깬 몸 ≤ MOB_CAP 50 · 블록이 덜어 낸 몸 0', `${H1.alive} = ${H1.expect} · 처음 ${H1.n0} · 꼭대기 ${H1.peak} · 덜어 냄 ${H1.cut}`);
ok(H1.sig && H1.sig === H2.sig, '② 같은 씨 두 번 = 같은 몸 지문(주사위 0 — 존 흐름 주입)', `${H1.sig} · ${H2.sig}`);
try { W1 = kid(ON, FIELD('', 'wake')); } catch (e) { W1 = { err: String(e).slice(0, 300) }; }
const tripOk = (r) => r.mat1 === 1 && r.mat2 === 0 && r.hp2 === 12 && r.alive0 && r.alive === r.n0 && r.alive === r.expect && r.awakeEnd === 0 && r.sleep >= 1;
ok(tripOk(W1), '③ 깨어남 ↔ 표 왕복 — 사람 곁에서 깨고(mat 1) 떠나면 그 자리 · 그 상처 그대로 표로(mat 0 · hp 12 · 몸 수 같음)', JSON.stringify(W1));
// ── ④ 두 길 0 — 몸 판 하루(`_t1331Probe.day`) · 사냥꾼 하나 · 몸 하나 = 한 마리(T1359)를 같이 켜 몫이 날마다 서게 ──
const DAY = (pre) => `${pre || ''}const V=require('./server/villages'),BB=require('./server/beast-body'),S=V.__p3Bind({}).state;
const p={pid:'h1',simJob:'hunter',_huntWk:{cx:10,cy:10}};S.deps={players:new Map([['h1',p]])};S.zoneId='hanbando';
const vil={name:'T',dbId:7,ccx:10,ccy:10,npcPids:['h1'],econ:{land:{game:1}}};
const run=(d)=>{const g=V._t1331Probe.day(vil,d);let n=0;while(!g.next().done&&n<1e5)n++;};
run(1);const B=BB.current;const led=new Map();for(let x=0;x<100;x++)for(let y=0;y<50;y++)led.set((x*2)+','+(y*2),100);B.migrate(7,led,1);
for(let d=2;d<=4;d++)run(d);console.log(JSON.stringify({hunt:B.W.st.died.hunt,acc:B.W.st.huntAcc,alive:B.alive(),baitN:globalThis.__baitN}));`;
let D0 = {}, D1 = {};
try { D0 = kid({ T1331_BEAST_BODY: '1', T1359_HUNT_BODY: '1', T1195_HUNT_REAL: '1', ENABLE_VILLAGES: '0' }, DAY()); D1 = kid({ ...ON, T1359_HUNT_BODY: '1', ENABLE_VILLAGES: '0' }, DAY()); } catch (e) { D0 = D1 = { err: String(e).slice(0, 300) }; }
const twoOk = (r) => r.hunt === 0 && r.acc === 0 && r.alive === 100;
ok(D0.hunt === 3 && twoOk(D1), '④ 두 길 0 — 켬 = 하루 규칙 안 부름(사냥 죽음 0 · 몫 0) · 끔 = 종전(사흘 셋)', JSON.stringify({ off: D0, on: D1 }));
// ── ⑤ 고기가 곳간에 ──
const MEAT = `const E=require('./sim/economy-sim'),E2=require('./sim/economy-sim-v2'),V=require('./server/villages'),S=V.__p3Bind({}).state,A=require('./server/animals'),Kc=require('./server/kcal');
const w=E2.createWorldV2({seed:42,villageCount:1}),v=w.villages[0];E.bindProductionActs(w);v.storage={meat:0};v.treasury={};v._t1195Bal=0;
const p={pid:'h',simJob:'hunter',_huntBud:0,_huntKil:2,_t1195Open:1,_t1195At:0,_t1195Sp:{deer:2},_huntWk:{cx:1,cy:1}};S.deps={players:new Map([['h',p]])};S.zoneId='hanbando';
const vil={name:'T',ccx:0,ccy:0,econ:v,npcPids:['h'],_gameRich:null};V._t1195HuntIn(vil);
const u=Kc.econUnitsOf('meat_game',A.dropsOf('deer','hanbando').meat_game);console.log(JSON.stringify({meat:+((v.storage.meat||0)+(v.treasury.meat||0)).toFixed(6),want:+(2*u).toFixed(6),kil:p._huntKil,got:vil._t1195Got||0}));`;
let M0 = {}, M1 = {};
try { M0 = kid({ T1331_BEAST_BODY: '1', T1195_HUNT_REAL: '1', ENABLE_VILLAGES: '0' }, MEAT); M1 = kid({ ...ON, ENABLE_VILLAGES: '0' }, MEAT); } catch (e) { M0 = M1 = { err: String(e).slice(0, 300) }; }
ok(M1.meat > 0 && Math.abs(M1.meat - M1.want) < 1e-6 && M1.got === 2 && M1.kil === 0 && M0.kil === 2 && Math.abs(M0.meat - M0.want) < 1e-6,
  '⑤ 쫓아 잡은 두 마리 = 곳간 고기 2 × 사슴 정본 드롭 kg · 켬 = 읽은 마리를 비운다(끔 = 남는다)', JSON.stringify({ off: M0, on: M1 }));
// ── ⑥ 깨어남 반경 글자 ──
const WS = require('fs').readFileSync(path.join(ROOT, 'server', 'wildlife.js'), 'utf8');
ok(/calm3 \? 216 :/.test(WS) && /const T1393_SEE = 216;/.test(WS), '⑥ 깨어남 반경 216 = 사냥꾼 두뇌 방심 포착 반경 글자(`calm3 ? 216 :`)');
// ── ⑦ 미끼 ──
const NA = '  B.hideAt(b, lm._bx * 32, lm._by * 32, Math.max(1, Math.round(lm.hp * HP_SCALE)));';
let BA = {}; try { BA = kid(ON, FIELD(BAIT('server/wildlife.js', NA, ''), 'wake')); } catch (e) { BA = { err: String(e).slice(0, 300) }; }
ok(BA.baitN === 1 && !BA.err && !tripOk(BA), '⑦ 미끼 ⓐ — 바꾼 자리 1곳(잠듦의 `hideAt` 줄 뺌)인 wildlife 사본은 ③ 왕복 줄이 빨강', JSON.stringify(BA));
const NB = '_t1393On() ? null : B.hunt(';
let BD = {}; try { BD = kid({ ...ON, T1359_HUNT_BODY: '1', ENABLE_VILLAGES: '0' }, DAY(BAIT('server/villages.js', NB, 'B.hunt('))); } catch (e) { BD = { err: String(e).slice(0, 300) }; }
ok(BD.baitN === 1 && !BD.err && !twoOk(BD), '⑦ 미끼 ⓑ — 바꾼 자리 1곳(하루 규칙 문 → `B.hunt(`)인 villages 사본은 ④ 두 길 줄이 빨강', JSON.stringify(BD));
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
