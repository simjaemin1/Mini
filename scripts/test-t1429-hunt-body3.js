#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @bait 3   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1429-hunt-body3.js — 짐승 몸 셋째(T1429 · 사냥판 `T1393` 켬): 도살이 끝난다 · 손 · 둔 몫 저장 · 분리 이웃 격자 · 두고 온 몫 =================
//
// 지키는 것(가짜 존 · 몸 표 하나 · 게임분 단위 · 서버 0):
//   ① 도살이 끝난다 — 사냥판 켬 · 걸어 나르기 끔: 사냥꾼 셋 · 하루 · 사슴 무리터 — 쏜 사체마다 도살 끝(블록 '수확') · 잃은 사체 0
//      (종전: 블록 실행층이 사체 있는 사냥꾼을 조준 자세 리셋 줄 앞에서 넘겨 0.02 배속이 남았다 — 회수가 사체 썩기 전에 못 닿는다)
//   ② 손 · 둔 몫 저장 — 몸 저장 줄(`_t747Pack` · 날마다 저장 길 = `T1340_RESUME_EXACT=0` · 종료 저장 길 = 켬 둘 다)에 손(`_t1416H`) · 둔 몫(`_t1416C` — 자리 · kg · 날 ·
//      처음 게임분) · 곳간 길 표지 · 실은 종이 들고 되살림(`_t747Restore`)이 그대로 놓는다 · 칸이 없던 옛 저장 = 빈 손
//   ③ 분리 이웃 격자 — 블록 `updateMobs` 의 분리(무리 밀어냄)를 둘레 3×3 칸만 몸 줄 차례로 — 전수 고리와 같은 값(몸 표 · 그림자 자리 지문 같음 · 보는 판 · 안 보는 판) ·
//      몸 한 걸음이 견준 이웃 평균 ≤ 몸 수의 반(전수 = 몸 수)
//   ④ 두고 온 몫 · 코너 — 손 · 둔 몫을 가진 몸이 사라지거나 · 죽거나 · 직업이 바뀌거나 · 마을이 바뀌면 그 자리에 땅 더미로(kg 그대로 · 사라짐 0) ·
//      땅 더미는 날이 지나면 썩는다(센다) · 다시 뜬 판에서 저장된 몸이 없으면 그 손 · 둔 몫도 땅 더미로
//   ⑤ 미끼(이 파일 안 · 셋) — ⓐ 조준 자세 리셋 줄을 뺀 wildlife 사본 → ① 빨강 ⓑ 저장 키 줄을 뺀 villages 사본 → ② 빨강
//                            ⓒ 이웃 훑기를 전수 고리로 되돌린 wildlife 사본 → ③ 빨강(값은 같고 견준 이웃이 몸 수)
//   날짜 · 벽시계를 쓰지 않는다(게임분 · 틱 수만).
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
console.log('\n=== T1429 — 짐승 몸 셋째(도살 끝남 · 손 · 둔 몫 저장 · 분리 이웃 격자 · 두고 온 몫) ===');
const KN = ['T1331_BEAST_BODY', 'T1393_HUNT_CHASE', 'T1416_WAKE_PRE', 'T1416_FIELD_UNIT', 'T1416_BEAST_WALL', 'T1416_CARRY_HOME', 'T1359_HUNT_BODY', 'T1195_HUNT_REAL', 'T1331_BEAST_SCALE', 'NODE_OPTIONS', 'ENABLE_VILLAGES', 'T1243_FARM_ON', 'T1340_RESUME_EXACT'];
const kid = (env, code) => { const e = Object.assign({}, process.env); for (const k of KN) delete e[k]; Object.assign(e, env);
  const out = execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 });
  return JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop()); };
const run = (env, code) => { try { return kid(env, code); } catch (e) { return { err: String(e).slice(0, 400) }; } };
//   글자 사본 하나 — 그 파일을 읽을 때 메모리에서만 needle 을 바꾼다(바꾼 자리 수를 `__baitN` 에) · 제품 파일 손 0
const BAIT = (file, needle, rep) => `const __M=require('module'),__c=__M.prototype._compile,__F=require('path').join(process.cwd(),${JSON.stringify(file)});globalThis.__baitN=-1;
__M.prototype._compile=function(c,f){if(f===__F){globalThis.__baitN=c.split(${JSON.stringify(needle)}).length-1;if(globalThis.__baitN===1)c=c.replace(${JSON.stringify(needle)},${JSON.stringify(rep)});}return __c.call(this,c,f);};`;
const ON = { T1331_BEAST_BODY: '1', T1393_HUNT_CHASE: '1', T1195_HUNT_REAL: '1', ENABLE_VILLAGES: '0' };

// ── 가짜 존 하나 — 무리터 51(봇 자 꼴) 또는 사슴 무리터 하나 · 운영 시계(틱 = 1/30 게임분) ──
const WORLD = (pre, body) => `${pre || ''}
const BB=require('./server/beast-body'),Wl=require('./server/wildlife');
let seed=7;const rng=()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const mobs=new Map(),players=new Map(),cm={chunkSize:1024,keyOf:(cx,cy)=>cx+'_'+cy,insertMob:()=>{},removeMob:()=>{},updateMobChunk:()=>{}};const act=new Set();
let B=null;const init=(sp)=>{B=BB.create({L_GAMEMAX:100,L_GAMER:0.002,huntTake:()=>0,species:sp,scale:5000});return B;};
const home=(id,cx,cy)=>{const R=Math.sqrt(2923/Math.PI),led=new Map();for(let x=-31;x<=31;x++)for(let y=-31;y<=31;y++)if(x*x+y*y<=R*R)led.set((cx+x)+','+(cy+y),0);const ks=[...led.keys()];for(const k of ks)led.set(k,58*5000/ks.length);B.migrate(id,led,1);};
const go=()=>Wl.init({ZONE_ID:'hanbando',ZONE:{zoneWidth:4000*32,zoneHeight:4000*32},TICK_HZ:30,chunkManager:cm,mobs,players,isTerrainBlockedLocal:()=>false,isRockTileLocal:()=>false,
 terrainMod:{getForestMultiplier:()=>2},getActiveChunkKeys:()=>act,isPositionActive:()=>true,spawnCorpse:()=>null,damagePlayer:(p,d)=>{p.hp=Math.max(1,p.hp-d);},broadcast:()=>{},
 WORLD:{dayLengthMs:1440000,dayPhaseRatio:0.7,worldEpoch:0},setMobHp:(m,v)=>{m.hp=v;},simVillages:()=>[],legacyVillages:[],rng,huntBudgetOf:()=>Infinity,t1393Put:(p,x,y)=>{p.x=x;p.y=y;}});
const sig=()=>{const a=[];for(const b of B.W.bodies.values())a.push(b.id,b.cx,b.cy,b.hp|0,b.mat);for(const m of mobs.values())a.push(m.mid,Math.round(m.x*1000),Math.round(m.y*1000));return require('crypto').createHash('sha1').update(a.join(',')).digest('hex').slice(0,16);};
let now=9*3600*1000;const tick=()=>{now+=1000/30;Wl.tick(now);};
let r={};
${body}
r.baitN=globalThis.__baitN;console.log(JSON.stringify(r));`;

// ── ① 도살이 끝난다 ──
const BUTCH = `init(['deer']);home('V',500,500);go();
for(let i=0;i<3;i++){const a=i/3*6.283,wx=500+Math.round(Math.cos(a)*20),wy=500+Math.round(Math.sin(a)*20);players.set('h'+i,{pid:'h'+i,isNpc:true,simJob:'hunter',_huntOn:1,hp:100,x:wx*32,y:wy*32,_workSite:{x:wx*32,y:wy*32},_huntWk:{cx:wx,cy:wy},vx:0,vy:0});}
for(let m=0;m<1440;m+=6){now+=6000;Wl.tick(now);for(const p of players.values())p.hp=100;}
const st=Wl.t1393Stat();r={kills:B.W.st.died.hunt,butch:st.butch,lost:st.carcLost,hunt:st.hunt};`;
const U0 = run(ON, WORLD('', BUTCH));
const butchOk = (r) => !r.err && r.kills >= 3 && r.lost === 0 && r.butch >= r.kills - 1 && r.butch >= 3;   // 판 끝 도살 중인 한 마리는 아직(셈 — 끝 마리)
ok(butchOk(U0), '① 도살이 끝난다(사냥판 켬 · 걸어 나르기 끔 · 사냥꾼 셋 하루) — 쏜 사체마다 도살 끝 · 잃은 사체 0', JSON.stringify(U0));

// ── ② 손 · 둔 몫 저장 ──
const SAVE = (pre, oldSave) => `${pre || ''}const V=require('./server/villages'),H=V.__p3Bind({}),S=H.state;
const mk=()=>({pid:'h1',simJob:'hunter',x:3200,y:6400,hp:80,maxHp:100,inventory:{}});
const b=mk();b._t1416H={kg:25,it:{meat_game:25}};b._t1416C={x:101.5,y:202.5,d:7,kg:14.5,it:{meat_game:8,leather:2,horn:1},t0:9876.5,trips:1,sp:'deer'};b._t1416Go=1;b._t1416Sp={deer:1};
const deps=(m)=>({players:m,setHp:(p,v)=>{p.hp=v;}});
S.deps=deps(new Map([['h1',b]]));const vil={name:'T',dbId:1,ccx:0,ccy:0,econ:{},npcPids:['h1']};S.villages=[vil];
const pk=JSON.parse(JSON.stringify(H._t747Pack(vil)));${oldSave ? "for(const k of ['_t1416H','_t1416C','_t1416Go','_t1416Sp'])delete pk.rows[0][k];" : ''}
const b2=mk();S.deps=deps(new Map([['h1',b2]]));vil.econ._t747Body=pk;H._t747Restore();
const want=JSON.stringify({H:b._t1416H,C:b._t1416C,Go:b._t1416Go,Sp:b._t1416Sp}),got=JSON.stringify({H:b2._t1416H,C:b2._t1416C,Go:b2._t1416Go,Sp:b2._t1416Sp});
console.log(JSON.stringify({same:want===got,empty:!b2._t1416H&&!b2._t1416C&&!b2._t1416Go,got,baitN:globalThis.__baitN}));`;
const S0 = run({ ENABLE_VILLAGES: '0', T1340_RESUME_EXACT: '0' }, SAVE()), S1 = run({ ENABLE_VILLAGES: '0' }, SAVE()), S2 = run({ ENABLE_VILLAGES: '0', T1340_RESUME_EXACT: '0' }, SAVE('', true));
const saveOk = (r) => !r.err && r.same === true;
ok(saveOk(S0) && saveOk(S1) && !S2.err && S2.empty === true, '② 손 · 둔 몫(자리 · kg · 날 · 처음 게임분) · 곳간 길 표지 · 실은 종 — 날마다 저장 길 · 종료 저장 길 둘 다 되살림이 그대로 · 옛 저장(칸 없음) = 빈 손',
  JSON.stringify({ daily: S0.same, exit: S1.same, old: S2.empty, err: S0.err || S1.err || S2.err }));

// ── ③ 분리 이웃 격자 ──
const SEP = (seen) => `init(['deer','deer','deer','wild_boar','arctic_hare','arctic_hare']);for(let i=0;i<12;i++)home('V'+i,300+(i%4)*400,300+Math.floor(i/4)*400);go();
for(let i=0;i<12;i++)players.set('bot'+i,{pid:'bot'+i,isNpc:false,hp:100,x:(300+(i%4)*400)*32,y:(300+Math.floor(i/4)*400)*32,vx:0,vy:0});
${seen ? "for(const p of players.values()){const kx=Math.floor(p.x/1024),ky=Math.floor(p.y/1024);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)act.add((kx+dx)+'_'+(ky+dy));}" : ''}
for(let t=0;t<30*90;t++)tick();
const sp=Wl.t1429Sep();r={sig:sig(),m:sp.m,p:sp.p,per:sp.m?+(sp.p/sp.m).toFixed(2):null,shadows:mobs.size,awake:[...B.W.bodies.values()].filter(b=>b.mat).length};`;
const NC = `{const bx=Math.floor(m.px/SG),by=Math.floor(m.py/SG),cand=_sgC;cand.length=0;for(let ix=bx-1;ix<=bx+1;ix++)for(let iy=by-1;iy<=by+1;iy++){const l=sgrid.get((ix+1048576)*2097152+(iy+1048576));if(l)for(let q=0;q<l.length;q++)cand.push(l[q]);}if(cand.length>1)cand.sort(_sgCmp);_sgN.m++;_sgN.p+=cand.length;`;
const NC_FULL = `{const cand=_sgC;cand.length=0;for(let q=0;q<s.mobs.length;q++)cand.push(q);_sgN.m++;_sgN.p+=cand.length;`;   // 전수 고리 — 몸 줄 전부(같은 차례)
const G0 = run(ON, WORLD('', SEP(false))), G1 = run(ON, WORLD('', SEP(true)));
const F0 = run(ON, WORLD(BAIT('server/wildlife.js', NC, NC_FULL), SEP(false))), F1 = run(ON, WORLD(BAIT('server/wildlife.js', NC, NC_FULL), SEP(true)));
const sepOk = (g, f) => !g.err && !f.err && g.sig === f.sig && g.awake >= 300 && g.m > 0 && g.per <= 25;   // g = 시험 받는 쪽 · f = 전수 고리 기준
ok(sepOk(G0, F0) && sepOk(G1, F1) && G1.shadows > 0 && F0.baitN === 1, '③ 분리 이웃 격자 — 전수 고리와 같은 값(몸 표 · 그림자 지문 · 안 보는 판 · 보는 판) · 몸 한 걸음이 견준 이웃 ≤ 25(전수 = 몸 수 50)',
  JSON.stringify({ unseen: [G0.sig, F0.sig, G0.per, F0.per], seen: [G1.sig, F1.sig, G1.per, F1.per], awake: G0.awake, shadows: G1.shadows }));

// ── ④ 두고 온 몫 · 코너 — 손 · 둔 몫 주인이 사라짐 · 죽음 · 직업 바뀜 · 마을 바뀜 → 땅 더미 · 날이 지나면 썩음 ──
const DROP = `init(['deer']);home('V',500,500);go();
const mkH=(id,vid)=>{const p={pid:id,isNpc:true,simJob:'hunter',simVillageId:vid,_huntOn:0,hp:100,x:(480+players.size*5)*32,y:480*32,vx:0,vy:0,_t1416H:{kg:20,it:{meat_game:20}},_t1416C:{x:490.5,y:470.5,d:0,kg:10,it:{meat_game:10}}};players.set(id,p);return p;};
const a=mkH('a',1),b=mkH('b',1),c=mkH('c',1),d=mkH('d',1),e=mkH('e',1);
players.set('w',{pid:'w',isNpc:true,simJob:'hunter',_huntOn:1,hp:100,x:500*32,y:470*32,_workSite:{x:500*32,y:480*32},_huntWk:{cx:500,cy:480},vx:0,vy:0});   // 판을 세울 사냥꾼(판 날)
for(let t=0;t<90;t++)tick();
const d0=Wl.t1429Stat().day;for(const p of [a,b,c,d,e])p._t1416C.d=d0;   // 둔 몫 = 오늘 둔 것
players.delete('a');b.hp=0;c.simJob='farmer';d.simVillageId=2;   // 사라짐 · 죽음 · 직업 · 이주 — e 는 그대로
for(let t=0;t<90;t++)tick();
const s1=Wl.t1429Stat();
for(let t=0;t<30*1440*2;t+=30){now+=1000;Wl.tick(now);}   // 이틀 — 땅 더미 썩음
const s2=Wl.t1429Stat();
r={day0:d0,day:s2.day,drop:s1.drop,dropKg:s1.dropKg,why:s1.why,gnd:s1.gnd,gndKg:s1.gndKg,eHand:e._t1416H?e._t1416H.kg:0,cleared:!b._t1416H&&!c._t1416C&&!d._t1416H,rot:s2.gndRot,rotKg:s2.gndRotKg,gnd2:s2.gnd};`;
const D1 = run({ ...ON, T1416_CARRY_HOME: '1' }, WORLD('', DROP)), D0 = run(ON, WORLD('', DROP));
ok(!D1.err && D1.drop === 8 && Math.abs(D1.dropKg - 120) < 1e-9 && D1.gndKg === 120 && D1.why && D1.why.gone === 1 && D1.why.dead === 1 && D1.why.job === 1 && D1.why.move === 1 && D1.eHand === 20 && D1.cleared &&
  D1.rot === 8 && Math.abs(D1.rotKg - 120) < 1e-9 && D1.gnd2 === 0 && !D0.err && D0.drop === 0,
  '④ 손 · 둔 몫 주인이 사라짐 · 죽음 · 직업 바뀜 · 마을 바뀜 → 그 자리 땅 더미(kg 그대로 · 사라짐 0 · 그대로인 몸은 손 그대로) · 날이 지나면 썩음 · 걸어 나르기 끔 = 셈 0',
  JSON.stringify({ on: D1, off: D0 }));
//   다시 뜬 판 — 저장된 몸 줄이 지금 몸보다 많다(그 몸이 없다) → 그 손 · 둔 몫은 땅 더미로
const SPILL = `const V=require('./server/villages'),H=V.__p3Bind({}),S=H.state,W=require('./server/wildlife');
const deps=(m)=>({players:m,setHp:(p,v)=>{p.hp=v;}});const vil={name:'T',dbId:1,ccx:0,ccy:0,econ:{},npcPids:['h1','h2']};S.villages=[vil];
const h1={pid:'h1',simJob:'hunter',x:320,y:640,hp:80,inventory:{}},h2={pid:'h2',simJob:'hunter',x:3200,y:6400,hp:80,inventory:{},_t1416H:{kg:25,it:{meat_game:25}},_t1416C:{x:101.5,y:202.5,d:7,kg:14.5,it:{meat_game:14}}};
S.deps=deps(new Map([['h1',h1],['h2',h2]]));const pk=JSON.parse(JSON.stringify(H._t747Pack(vil)));
vil.npcPids=['h1'];S.deps=deps(new Map([['h1',{pid:'h1',simJob:'hunter',x:0,y:0,hp:80,inventory:{}}]]));vil.econ._t747Body=pk;H._t747Restore();
const s=W.t1429Stat();console.log(JSON.stringify({drop:s.drop,dropKg:s.dropKg,why:s.why}));`;
const SP = run({ ENABLE_VILLAGES: '0', T1340_RESUME_EXACT: '0' }, SPILL);
ok(!SP.err && SP.drop === 2 && Math.abs(SP.dropKg - 39.5) < 1e-9 && SP.why && SP.why.spill === 2, '④ 다시 뜬 판 — 저장된 몸이 없으면 그 손 · 둔 몫은 땅 더미로(39.5 kg · 사라짐 0)', JSON.stringify(SP));

// ── ⑤ 미끼 ──
const NA = '        if (a._carc) a._hold = 0;';
const BA = run(ON, WORLD(BAIT('server/wildlife.js', NA, ''), BUTCH));
ok(BA.baitN === 1 && !BA.err && !butchOk(BA), '⑤ 미끼 ⓐ — 바꾼 자리 1곳(조준 자세 리셋 줄을 뺌)인 wildlife 사본은 ① 이 빨강(도살이 안 끝난다)', JSON.stringify(BA));
const NB = "  '_t1416H', '_t1416C', '_t1416Go', '_t1416Sp'];";
const BB2 = run({ ENABLE_VILLAGES: '0', T1340_RESUME_EXACT: '0' }, SAVE(BAIT('server/villages.js', NB, '  ];')));
ok(BB2.baitN === 1 && !BB2.err && !saveOk(BB2), '⑤ 미끼 ⓑ — 바꾼 자리 1곳(몸 저장 키 줄을 뺌)인 villages 사본은 ② 가 빨강(되살림이 빈 손)', JSON.stringify(BB2));
ok(F0.baitN === 1 && !F0.err && !sepOk(F0, G0) && !sepOk(F1, G1) && F0.sig === G0.sig, '⑤ 미끼 ⓒ — 바꾼 자리 1곳(이웃 훑기를 전수 고리로)인 wildlife 사본은 ③ 이 빨강(값은 같고 견준 이웃이 몸 수)', JSON.stringify({ baitN: F0.baitN, per: F0.per }));
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
