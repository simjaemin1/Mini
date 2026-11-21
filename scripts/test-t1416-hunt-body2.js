#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @bait 4   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1416-hunt-body2.js — 짐승 몸 판의 뒷일 넷(T1416 · 사냥판 `T1393` 켬 안 손잡이 넷) =====================================
//
// 지키는 것(가짜 존 · 몸 표 하나 · 게임분 단위 · 서버 0):
//   ① 손잡이 넷 `T1416_WAKE_PRE` · `T1416_FIELD_UNIT` · `T1416_BEAST_WALL` · `T1416_CARRY_HOME` — 끔 기본 · `'1'` 만 · 사냥판(`T1393`) 켬 안에서만 뜻
//   ② 첫 깨움 — 미리 훑기 켬: 사람이 무리터에 들기 전에 그 청크를 다 훑어 두고(틱마다 종전 `_stepScans` 한 번) 깨움 틱은 훑지 않는다.
//      한 틱에 훑은 칸 수 ≤ 4줄 × 32칸(종전 틱당 4 ms 상환 — 이 하네스는 부를 때마다 1씩 가는 셈 시계로 잰다 · 벽시계 0) · 끔 = 깨움 틱이 무리터 청크를 다 훑는다(≥ 1,024칸) ·
//      몸 표 지문이 켬 · 끔 같다(미리 훑은 칸은 종전 판이 훑었을 차례에 격자로 — 값 같음)
//   ③ 1유닛 걸음 — 보는 이 없는 판 = 1유닛씩만(유닛 걸음 수 = 지난 게임분 · 1/30 걸음 0) · 보는 판(켜진 청크) = 종전 1/30 걸음 · 끔 = 셈 0 · 켬에서도 사냥꾼이 판에서 돈다
//   ④ 건물 — 짐승이 집채 발자국 · 큰집을 못 지난다: 깬 몸의 걸음 선분이 발자국 칸을 지난 수 0 · 발자국 안에 선 수 0(1/30 걸음 · 1유닛 걸음 둘 다) · 끔 = 지난다(> 0 · 자명 통과 금지 앵커) ·
//      발자국 칸 = 랩 `_insideBldgV`(집채 bbox · 회관 · 다 지은 곳간) 칸 · 플레이어 벽 · 울은 존 벽 콜라이더 문(변)으로 — 넘은 변 0 · 막다른 곳 셋(곧은 벽 · ㄱ자 · 옆 열린 U — 사람이 동쪽에서 다가온다)에서 달아나던 몸이 선 채 흐른 분 ≤ 15(블록 도주 박자 `fT` 글자)
//   ⑤ 걸어 나르기 — 도살 끝난 마리의 정본 드롭이 사냥꾼 손에(손 ≤ 짐 정본 `CAP_KG`) · 못 실은 몫은 그 자리 · 다음 길에 회수 · 곳간에 든 kg = 손에 실은 kg + 회수한 kg − 아직 손에 든 kg ·
//      둔 몫 = 회수 + 두고 옴 + 아직 둔 몫 · 곳간 고기 = 넣은 품목의 열량 단위 합 · 잡은 수(`_huntKil`)는 0(두 길 0) · 끔 = 종전(잡은 수가 선다) ·
//      T720 곳간 길(`_t720Step`) — 손이 찬 사냥꾼이 사다리로 걸어가('운반') 머문 뒤 넣는다 · 끔 = 손을 안 센다(길 안 섬)
//   ⑥ 미끼(이 파일 안 · 넷) — ⓐ 깨움 문이 미리 훑은 청크를 안 쓰는 사본 → ② 빨강 ⓑ 1유닛 걸음을 끈 사본 → ③ 빨강
//                            ⓒ 판 걸음 동안 지나는 칸 검사를 끈 사본 → ④ 빨강 ⓓ T720 정산에서 사냥꾼 손 넣기 줄을 뺀 사본 → ⑤ 빨강
//   날짜 · 벽시계를 쓰지 않는다(게임분 · 틱 수 · 셈 시계만).
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
console.log('\n=== T1416 — 짐승 몸 판의 뒷일 넷(첫 깨움 · 1유닛 걸음 · 건물 · 걸어 나르기) ===');
const KN = ['T1331_BEAST_BODY', 'T1393_HUNT_CHASE', 'T1416_WAKE_PRE', 'T1416_FIELD_UNIT', 'T1416_BEAST_WALL', 'T1416_CARRY_HOME', 'T1359_HUNT_BODY', 'T1195_HUNT_REAL', 'T1331_BEAST_SCALE', 'NODE_OPTIONS', 'ENABLE_VILLAGES', 'T1243_FARM_ON'];
const kid = (env, code) => { const e = Object.assign({}, process.env); for (const k of KN) delete e[k]; Object.assign(e, env);
  const out = execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 });
  return JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop()); };
//   글자 사본 하나 — 그 파일을 읽을 때 메모리에서만 needle 을 바꾼다(바꾼 자리 수를 `__baitN` 에) · 제품 파일 손 0
const BAIT = (file, needle, rep) => `const __M=require('module'),__c=__M.prototype._compile,__F=require('path').join(process.cwd(),${JSON.stringify(file)});globalThis.__baitN=-1;
__M.prototype._compile=function(c,f){if(f===__F){globalThis.__baitN=c.split(${JSON.stringify(needle)}).length-1;if(globalThis.__baitN===1)c=c.replace(${JSON.stringify(needle)},${JSON.stringify(rep)});}return __c.call(this,c,f);};`;
const ON = { T1331_BEAST_BODY: '1', T1393_HUNT_CHASE: '1', T1195_HUNT_REAL: '1', ENABLE_VILLAGES: '0' };
const run = (env, code) => { try { return kid(env, code); } catch (e) { return { err: String(e).slice(0, 400) }; } };

// ── ① 손잡이 넷 ──
const KC = `const W=require('./server/wildlife'),V=require('./server/villages');console.log(JSON.stringify({w:W.T1416||null,v:V.T1416_CARRY_HOME}));`;
const ALL1 = { T1416_WAKE_PRE: '1', T1416_FIELD_UNIT: '1', T1416_BEAST_WALL: '1', T1416_CARRY_HOME: '1' };
const K0 = run(ON, KC), K1 = run({ ...ON, ...ALL1 }, KC), K2 = run({ ...ALL1, T1331_BEAST_BODY: '1', ENABLE_VILLAGES: '0' }, KC), K3 = run({ ...ON, T1416_WAKE_PRE: 'yes', T1416_FIELD_UNIT: 'true', T1416_BEAST_WALL: '2', T1416_CARRY_HOME: 'on' }, KC);
const allF = (r) => r.w && !r.w.pre && !r.w.unit && !r.w.wall && !r.w.carry && r.v === false;
ok(allF(K0) && K1.w && K1.w.pre && K1.w.unit && K1.w.wall && K1.w.carry && K1.v === true && allF(K2) && allF(K3),
  '① 손잡이 넷 — 끔 기본 · `1` 만 · 사냥판(T1393) 켬 안에서만 뜻', JSON.stringify({ K0, K1, K2, K3 }));

// ── 가짜 존 하나 — 사슴 무리터(몸 58 · 서식 2,923칸 · 환율 5,000) · 운영 시계(틱 = 1/30 게임분) ──
//   F = 집채 발자국 칸(`_vbFootprint` — 실체화 · 콜라이더가 같이 쓰는 한 곳) · 서식 칸에서 뺀다(실제 세계 — 개발된 칸은 서식이 아니다 · T1053)
const WORLD = (pre, body) => `${pre || ''}
let __clk=0;Date.now=()=>(__clk+=1);   // 셈 시계 — 부를 때마다 1(벽시계 0 · 종전 4 ms 상환 = 부름 넷)
const BB=require('./server/beast-body'),Wl=require('./server/wildlife'),V=require('./server/villages'),FP=V.__p3Bind({})._vbFootprint;
let seed=7;const rng=()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const F=new Set(),add=(R)=>{for(let y=R[1];y<=R[3];y++)for(let x=R[0];x<=R[2];x++)F.add(y*65536+x)};
const B=BB.create({L_GAMEMAX:100,L_GAMER:0.002,huntTake:()=>0,species:['deer'],scale:5000});
const mobs=new Map(),players=new Map(),cm={chunkSize:1024,keyOf:(cx,cy)=>cx+'_'+cy,insertMob:()=>{},removeMob:()=>{},updateMobChunk:()=>{}};
const act=new Set();let fmN=0;
const habit=(cx0,cy0,r)=>{const led=new Map();for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++){const cx=cx0+x,cy=cy0+y;if((r>18?x*x+y*y<=r*r:true)&&!F.has(cy*65536+cx))led.set(cx+','+cy,0);}const ks=[...led.keys()];for(const k of ks)led.set(k,58*5000/ks.length);B.migrate('V',led,1);};
const init=()=>Wl.init({ZONE_ID:'hanbando',ZONE:{zoneWidth:40000,zoneHeight:40000},TICK_HZ:30,chunkManager:cm,mobs,players,isTerrainBlockedLocal:()=>false,isRockTileLocal:()=>false,
 terrainMod:{getForestMultiplier:()=>{fmN++;return 2;}},getActiveChunkKeys:()=>act,isPositionActive:()=>true,spawnCorpse:()=>null,damagePlayer:(p,d)=>{p.hp=Math.max(1,p.hp-d);},broadcast:()=>{},
 WORLD:{dayLengthMs:1440000,dayPhaseRatio:0.7,worldEpoch:0},setMobHp:(m,v)=>{m.hp=v;},simVillages:()=>[],legacyVillages:[],rng,huntBudgetOf:()=>Infinity,t1393Put:(p,x,y)=>{p.x=x;p.y=y;},
 t1416Bldg:()=>(x,y)=>F.has(y*65536+x),...(typeof EDGE==='function'?{t1416Edge:EDGE}:{})});
const sig=()=>{const a=[];for(const b of B.W.bodies.values())a.push(b.id,b.cx,b.cy,b.hp|0,b.mat);return require('crypto').createHash('sha1').update(a.join(',')).digest('hex').slice(0,16);};
const crossF=(x0,y0,x1,y1)=>{let cx=Math.floor(x0),cy=Math.floor(y0);const ex=Math.floor(x1),ey=Math.floor(y1);if(cx===ex&&cy===ey)return false;const dx=x1-x0,dy=y1-y0,sx=dx>0?1:-1,sy=dy>0?1:-1,tdx=dx?Math.abs(1/dx):Infinity,tdy=dy?Math.abs(1/dy):Infinity;let tmx=dx?((sx>0?cx+1-x0:x0-cx)*tdx):Infinity,tmy=dy?((sy>0?cy+1-y0:y0-cy)*tdy):Infinity;for(let n=0;n<4096&&(cx!==ex||cy!==ey);n++){if(tmx<tmy){cx+=sx;tmx+=tdx;}else{cy+=sy;tmy+=tdy;}if(F.has(cy*65536+cx))return true;}return false;};
let now=9*3600*1000;const tick=()=>{now+=1000/30;const f0=fmN;Wl.tick(now);return fmN-f0;};
let r={};
${body}
r.baitN=globalThis.__baitN;console.log(JSON.stringify(r));`;

// ── ② 첫 깨움 ──
const PRE = `habit(500,500,31);init();
const h={pid:'h1',isNpc:true,simJob:'hunter',_huntOn:0,hp:100,x:500*32,y:470*32,_workSite:{x:500*32,y:480*32},_huntWk:{cx:500,cy:480},vx:0,vy:0};players.set('h1',h);
let preMax=0,n=0;for(;n<400;n++){const c=tick();if(c>preMax)preMax=c;}const preLeft=Wl.t1416Stat().preLeft;   // 같은 틱 수를 비워 둔다(켬 · 끔 같은 시각에 사냥꾼이 든다)
h._huntOn=1;let wakeMax=0;for(let i=0;i<30*240;i++){const c=tick();if(c>wakeMax)wakeMax=c;}
const st=Wl.t1393Stat(),s16=Wl.t1416Stat();r={preTicks:n,preLeft,preMax,wakeMax,wake:st.wake,scanChunks:st.scanChunks,pub:s16.pub||0,preQ:s16.preQ,kills:B.W.st.died.hunt,sig:sig()};`;
const P0 = run(ON, WORLD('', PRE)), P1 = run({ ...ON, T1416_WAKE_PRE: '1' }, WORLD('', PRE));
const preOk = (a, b) => !a.err && !b.err && b.preQ > 0 && b.preLeft === 0 && b.pub > 0 && b.pub === a.scanChunks && b.preMax <= 4 * 32 && b.wakeMax <= 4 * 32 && a.wakeMax >= 1024 && a.sig === b.sig && a.wake === b.wake && a.wake > 0;
ok(preOk(P0, P1), '② 첫 깨움 — 미리 훑기 켬 = 한 틱 훑은 칸 ≤ 4줄 × 32칸(깨움 틱 포함) · 끔 = 깨움 틱이 무리터 청크를 다 훑는다(≥ 1,024칸) · 몸 지문 같음',
  JSON.stringify({ off: P0, on: P1 }));

// ── ③ 1유닛 걸음 ──
const UNIT = (seen) => `habit(500,500,31);init();${seen ? "for(let x=14;x<=16;x++)for(let y=14;y<=16;y++)act.add(x+'_'+y);" : ''}
const h={pid:'h1',isNpc:true,simJob:'hunter',_huntOn:1,hp:100,x:500*32,y:470*32,_workSite:{x:500*32,y:480*32},_huntWk:{cx:500,cy:480},vx:0,vy:0};players.set('h1',h);
for(let i=0;i<30*600;i++)tick();
const st=Wl.t1393Stat(),s16=Wl.t1416Stat();r={steps:st.steps,unit:s16.unitSteps,frac:s16.fracSteps,obs:s16.obsFields,ticks:st.ticks,wake:st.wake,huntMin:+st.huntMin.toFixed(1),kills:B.W.st.died.hunt};`;
const U0 = run(ON, WORLD('', UNIT(false))), U1 = run({ ...ON, T1416_FIELD_UNIT: '1' }, WORLD('', UNIT(false))), U2 = run({ ...ON, T1416_FIELD_UNIT: '1' }, WORLD('', UNIT(true)));
//   판 시계는 게임분을 낮 · 밤 꼴로 셈한다(틱-분 600 = 게임분 674 안팎) — 1유닛 걸음 수 = 지난 게임분(내림) ≤ 틱 수 ÷ 15 · 종전 = 틱마다 한 걸음
const unitOk = (a, b, c) => !a.err && !b.err && !c.err && a.unit === 0 && a.frac === 0 && a.steps === a.ticks && b.frac === 0 && b.unit === b.steps && b.steps > 0 && b.steps * 15 <= b.ticks && b.wake > 0 && b.huntMin > 0 &&
  c.obs > 0 && c.frac > 30 * c.unit;   // 보는 판 — 몸 · 사냥꾼이 켜진 청크를 잠깐 벗어난 틱만 1유닛
ok(unitOk(U0, U1, U2), '③ 1유닛 걸음 — 보는 이 없는 판 = 1유닛씩만(걸음 수 = 지난 게임분 · 사냥꾼이 판에서 돈다) · 보는 판(켜진 청크) = 종전 틱마다 1/30 걸음 · 끔 = 셈 0', JSON.stringify({ off: U0, unseen: U1, seen: U2 }));

// ── ④ 건물 ──
const WALLS = `add(FP('hall',500,500));for(const [dx,dy] of [[-12,-12],[12,-12],[-12,12],[12,12],[0,-15],[0,15],[-15,0],[15,0]])add(FP('house',500+dx,500+dy));add(FP('granary',488,500));`;
const WALL = `${WALLS}habit(500,500,31);init();
const h={pid:'h1',isNpc:true,simJob:'hunter',_huntOn:1,hp:100,x:500*32,y:470*32,_workSite:{x:500*32,y:480*32},_huntWk:{cx:500,cy:480},vx:0,vy:0};players.set('h1',h);
let cross=0,inside=0,obs=0;const last=new Map();
for(let i=0;i<30*720;i++){tick();for(const o of Wl._t1416Mobs()){if(o.x<-50)continue;obs++;if(F.has(Math.floor(o.y)*65536+Math.floor(o.x)))inside++;const q=last.get(o.b);if(q&&crossF(q.x,q.y,o.x,o.y))cross++;last.set(o.b,{x:o.x,y:o.y});}
  if(h._t1416Go){h._t1416Go=0;h._t1416H=null;}}
r={cross,inside,obs,wallHit:(Wl.t1416Stat()||{}).wallHit,rev:(Wl.t1416Stat()||{}).cross};`;
const W0 = run(ON, WORLD('', WALL)), W1 = run({ ...ON, T1416_BEAST_WALL: '1' }, WORLD('', WALL)), W2 = run({ ...ON, T1416_BEAST_WALL: '1', T1416_FIELD_UNIT: '1' }, WORLD('', WALL)), W3 = run({ ...ON, T1416_FIELD_UNIT: '1' }, WORLD('', WALL));
const wallOk = (r) => !r.err && r.obs > 1000 && r.cross === 0 && r.inside === 0 && r.wallHit > 0;
ok(wallOk(W1) && wallOk(W2) && W0.cross + W0.inside > 0 && W3.cross + W3.inside > 0, '④ 건물 — 깬 몸 걸음 선분이 발자국 칸을 지난 수 0 · 발자국 안 0(1/30 걸음 · 1유닛 걸음) · 끔 = 지난다',
  JSON.stringify({ off: W0, on: W1, onUnit: W2, offUnit: W3 }));
//   플레이어 벽(변) — 존 벽 콜라이더 꼴(`edgeBlockedStep` — 칸 하나 걸음이 그 변을 넘나) · 무리터 가운데를 남북으로 가르는 벽 변 줄(x 499 | 500 사이 · y 470 ~ 530)
const EDGEW = `const EDGE=(cx,cy,sx,sy)=>sx!==0&&cy>=470&&cy<=530&&((sx>0&&cx===499)||(sx<0&&cx===500));
habit(500,500,31);init();const h={pid:'h1',isNpc:true,simJob:'hunter',_huntOn:1,hp:100,x:520*32,y:470*32,_workSite:{x:520*32,y:480*32},_huntWk:{cx:520,cy:480},vx:0,vy:0};players.set('h1',h);
let cross=0,obs=0;const last=new Map();
for(let i=0;i<30*720;i++){tick();for(const o of Wl._t1416Mobs()){if(o.x<-50)continue;obs++;const q=last.get(o.b);if(q){const a=Math.floor(q.x),b=Math.floor(o.x);if((a<=499&&b>=500)||(a>=500&&b<=499)){const t=(500-q.x)/(o.x-q.x),yy=Math.floor(q.y+t*(o.y-q.y));if(yy>=470&&yy<=530){cross++;if(globalThis.DBGE)console.error(q.x,q.y,o.x,o.y,yy);}}}last.set(o.b,{x:o.x,y:o.y});}}
r={cross,obs};`;
const E0 = run(ON, WORLD('', EDGEW)), E1 = run({ ...ON, T1416_BEAST_WALL: '1' }, WORLD('', EDGEW)), E2 = run({ ...ON, T1416_BEAST_WALL: '1', T1416_FIELD_UNIT: '1' }, WORLD('', EDGEW));
ok(!E0.err && !E1.err && !E2.err && E0.cross > 0 && E1.cross === 0 && E2.cross === 0 && E1.obs > 1000, '④ 플레이어 벽(변 — 존 벽 콜라이더 문) — 깬 몸 걸음이 벽 변을 넘은 수 0(1/30 · 1유닛 걸음) · 끔 = 넘는다', JSON.stringify({ off: E0, on: E1, onUnit: E2 }));
//   발자국 칸 = 랩 `_insideBldgV`(lab/마을실험실.html — 집채 [-5.5..0.5]×[-5.5..-1.5] · 회관 [-4.5..3.5]² · 다 지은 곳간 [-2.5..2.5]×[-1.5..1.5]) 칸
const FOOT = `const V=require('./server/villages'),S=V.__p3Bind({}).state;S.world={day:3};
S.villages=[{ccx:300,ccy:300,_houseCells:[{cx:320,cy:310},{cx:280,cy:290}],_granList:[{cx:305,cy:330}],_pHouses:[],_shelter:null}];
const F=V.t1416Foot();const lab=(x,y)=>{for(const hh of S.villages[0]._houseCells)if(x>=hh.cx-5.5&&x<=hh.cx+0.5&&y>=hh.cy-5.5&&y<=hh.cy-1.5)return true;const hl={cx:300,cy:300};if(x>=hl.cx-4.5&&x<=hl.cx+3.5&&y>=hl.cy-4.5&&y<=hl.cy+3.5)return true;for(const g of S.villages[0]._granList)if(x>=g.cx-2.5&&x<=g.cx+2.5&&y>=g.cy-1.5&&y<=g.cy+1.5)return true;return false;};
let same=0,diff=0,n=0;for(let x=260;x<=340;x++)for(let y=270;y<=350;y++){n++;(F.has(y*65536+x)===lab(x,y))?same++:diff++;}
S.villages[0]._houseCells.push({cx:330,cy:280});const F2=V.t1416Foot();console.log(JSON.stringify({same,diff,n,size:F.size,grew:F2.size-F.size}));`;
const FT = run({ ENABLE_VILLAGES: '0' }, FOOT);
ok(!FT.err && FT.diff === 0 && FT.size === 24 * 2 + 64 + 15 && FT.grew === 24, '④ 발자국 칸 = 랩 `_insideBldgV` 칸(움집 6×4 · 큰집 8×8 · 곳간 5×3) · 집이 늘면 다시 짓는다', JSON.stringify(FT));
//   막다른 곳 셋 — 사람이 동쪽에서 다가와(두 시간마다 입구에서 40칸 안으로) 몸이 서쪽 벽으로 달아난다 · 달아나던 몸이 선 채(분당 0.05 m 아래) 흐른 분 최대
const DEAD = (lay) => `const wallX=(x0,x1,y)=>{for(let x=x0;x<=x1;x+=6)add(FP('house',x+5,y+5));},wallY=(x,y0,y1)=>{for(let y=y0;y<=y1;y+=4)add(FP('house',x+5,y+5));};
${{ I: 'wallY(484,470,530);', L: 'wallY(484,470,510);wallX(484,516,510);', U: 'wallY(484,480,520);wallY(516,480,520);wallX(484,516,520);' }[lay]}
habit(500,500,18);init();const P={pid:'p1',isNpc:false,hp:100,x:560*32,y:500*32,vx:0,vy:0};players.set('p1',P);
const last=new Map(),run=new Map(),lt=new Map();let maxStall=0,flee=0,cross=0;
for(let m=0;m<360;m++){const d=Math.min(40,(m%120)*1.5);P.x=(560-d)*32;
  for(let t=0;t<30;t++){tick();for(const o of Wl._t1416Mobs()){if(o.x<-50)continue;const q=lt.get(o.b);if(q&&crossF(q.x,q.y,o.x,o.y))cross++;lt.set(o.b,{x:o.x,y:o.y});}}   // 관통 = 틱마다(걸음마다)
  for(const o of Wl._t1416Mobs()){if(o.x<-50)continue;const L=last.get(o.b);last.set(o.b,o);
    if(o.st==='flee'){flee++;if(L&&Math.hypot(o.x-L.x,o.y-L.y)<0.05){const k=(run.get(o.b)||0)+1;run.set(o.b,k);if(k>maxStall)maxStall=k;}else run.set(o.b,0);}else run.set(o.b,0);}}
r={lay:'${lay}',maxStall,flee,cross};`;
const DE = [];
for (const lay of ['I', 'L', 'U']) for (const u of ['0', '1']) DE.push(run({ ...ON, T1416_BEAST_WALL: '1', T1416_FIELD_UNIT: u }, WORLD('', DEAD(lay))));
const deadOk = (r) => !r.err && r.flee > 0 && r.maxStall <= 15 && r.cross === 0;
ok(DE.every(deadOk), '④ 막다른 곳 셋(곧은 벽 · ㄱ자 · 옆 열린 U × 1/30 · 1유닛 걸음) — 달아나던 몸이 선 채 흐른 분 ≤ 15(블록 도주 박자 `fT` — 고치기 전 106 ~ 357분) · 관통 0', JSON.stringify(DE));

// ── ⑤ 걸어 나르기 ──
const CARRY = `habit(500,500,31);init();
const E=require('./sim/economy-sim'),E2=require('./sim/economy-sim-v2'),Kc=require('./server/kcal'),C=require('./server/carry');
const w=E2.createWorldV2({seed:42,villageCount:1}),v=w.villages[0];E.bindProductionActs(w);v.storage={meat:0};v.treasury={};
const vil={name:'T',ccx:0,ccy:0,econ:v,npcPids:[],_granList:[]};
const hs=[];for(let i=0;i<3;i++){const a=i/3*6.283,wx=500+Math.round(Math.cos(a)*20),wy=500+Math.round(Math.sin(a)*20);const p={pid:'h'+i,isNpc:true,simJob:'hunter',_huntOn:1,hp:100,x:wx*32,y:wy*32,_workSite:{x:wx*32,y:wy*32},_huntWk:{cx:wx,cy:wy},vx:0,vy:0};players.set(p.pid,p);hs.push(p);}
let maxHand=0;
for(let i=0;i<30*1440*2;i++){tick();for(const p of hs){p.hp=100;if(p._t1416H&&p._t1416H.kg>maxHand)maxHand=p._t1416H.kg;if(p._t1416Go){V._t1416Deliver(vil,p);p.x=p._workSite.x;p.y=p._workSite.y;}}}   // 곳간 길(T720 — 아래 줄이 따로 잰다)을 넣기로 흉내 · 넣은 뒤 생활층이 일터로 돌려보낸다
const s=Wl.t1416Stat(),c=V.t1416Stat();let hand=0,cache=0,kil=0;for(const p of hs){hand+=p._t1416H?p._t1416H.kg:0;cache+=p._t1416C?p._t1416C.kg:0;kil+=p._huntKil||0;}
let want=0;for(const it in c.items){const mu=+Kc.econUnitsOf(it,c.items[it])||0;if(mu>0)want+=mu;}
r={kills:B.W.st.died.hunt,kil,load:s.load,loadKg:s.loadKg,fetchKg:s.fetchKg,cacheKg:s.cacheKg,leftKg:s.leftKg,lost:s.lostCarc,trips:c.trips,kg:c.kg,hand:+hand.toFixed(3),cache:+cache.toFixed(3),
  meat:+((v.storage.meat||0)+(v.treasury.meat||0)).toFixed(6),want:+want.toFixed(6),maxHand,cap:C.CFG.CAP_KG};`;
const C0 = run(ON, WORLD('', CARRY)), C1 = run({ ...ON, T1416_CARRY_HOME: '1' }, WORLD('', CARRY));
const near = (a, b) => Math.abs(a - b) < 1e-6;
const carryOk = (r) => !r.err && r.kills >= 1 && r.kil === 0 && r.load >= 1 && r.trips >= 1 && r.maxHand <= r.cap + 1e-9 && r.cacheKg > 0 && r.fetchKg > 0 &&
  near(r.kg + r.hand, r.loadKg + r.fetchKg) && near(r.cacheKg, r.fetchKg + r.leftKg + r.cache) && r.meat > 0 && near(r.meat, r.want);
ok(carryOk(C1) && !C0.err && C0.kil === C0.kills && C0.load === 0 && C0.trips === 0,
  '⑤ 걸어 나르기 — 손 ≤ 짐 정본 CAP_KG · 곳간에 든 kg = 실은 kg + 회수한 kg − 손에 남은 kg · 둔 몫 = 회수 + 두고 옴 + 아직 둔 몫 · 곳간 고기 = 넣은 품목 열량 단위 합 · 잡은 수 0(두 길 0) · 끔 = 종전',
  JSON.stringify({ off: C0, on: C1 }));
//   T720 곳간 길 — 손이 찬 사냥꾼(`_t1416Go`)이 곳간 사다리(곳간 없으면 회관)로 걸어가 머문 뒤 넣는다
const T720 = (pre) => `${pre || ''}const E=require('./sim/economy-sim'),E2=require('./sim/economy-sim-v2'),V=require('./server/villages'),P=V.__labProbe._t1180Probe,S=V.__p3Bind({}).state,Kc=require('./server/kcal');
S.deps={players:new Map()};const w=E2.createWorldV2({seed:42,villageCount:1}),v=w.villages[0];E.bindProductionActs(w);v.storage={meat:0};v.treasury={};
const vil={ccx:0,ccy:0,_granList:[],econ:v};const p={pid:'hh',simJob:'hunter',x:3000,y:16,_t1416H:{kg:25,it:{meat_game:22,leather:1}},_t1416Go:1};
const go=P.returnStep(vil,p,10000,.3,.7,1,true);const tx=p.targetX,lab=p._lifeAct;p.x=p.y=16;P.returnStep(vil,p,11000,.3,.7,1,true);const mid=p._t1416H?p._t1416H.kg:0;
P.returnStep(vil,p,11000+P.storeMs(),.3,.7,1,true);const want=Kc.econUnitsOf('meat_game',22);
console.log(JSON.stringify({go,tx,lab,mid,hand:p._t1416H?p._t1416H.kg:0,goLeft:p._t1416Go,meat:+((v.storage.meat||0)+(v.treasury.meat||0)).toFixed(6),want:+want.toFixed(6),leather:(v.storage.leather||0)+(v.treasury.leather||0),baitN:globalThis.__baitN}));`;
const T0 = run({ ...ON }, T720()), T1 = run({ ...ON, T1416_CARRY_HOME: '1' }, T720());
const t720Ok = (r) => !r.err && r.go === true && r.tx === 16 && r.lab === '운반' && r.mid === 25 && r.hand === 0 && !r.goLeft && near(r.meat, r.want) && r.leather === 1;
ok(t720Ok(T1) && !T0.err && T0.go === false && T0.hand === 25, '⑤ T720 곳간 길 — 손이 찬 사냥꾼이 사다리로 걸어가(운반) 머문 뒤 넣는다(고기 열량 · 가죽 낱개) · 끔 = 길 안 섬(손 그대로)', JSON.stringify({ off: T0, on: T1 }));

// ── ⑥ 미끼 ──
const NA = 'const pre = T1416_WAKE_PRE ? _t1416Rdy.get(k) : undefined;';
const BA = run({ ...ON, T1416_WAKE_PRE: '1' }, WORLD(BAIT('server/wildlife.js', NA, 'const pre = undefined;'), PRE));
ok(BA.baitN === 1 && !BA.err && !preOk(P0, BA), '⑥ 미끼 ⓐ — 바꾼 자리 1곳(깨움 문이 미리 훑은 청크를 안 쓴다)인 wildlife 사본은 ② 가 빨강', JSON.stringify({ baitN: BA.baitN, wakeMax: BA.wakeMax, err: BA.err }));
const NB = 'const unit = T1416_FIELD_UNIT && !_t1416Obs(s, act, on);';
const BB2 = run({ ...ON, T1416_FIELD_UNIT: '1' }, WORLD(BAIT('server/wildlife.js', NB, 'const unit = false;'), UNIT(false)));
ok(BB2.baitN === 1 && !BB2.err && !unitOk(U0, BB2, U2), '⑥ 미끼 ⓑ — 바꾼 자리 1곳(1유닛 걸음을 끔)인 wildlife 사본은 ③ 이 빨강', JSON.stringify(BB2));
const NC = 'TR.terrain.isBlocked = _t1416BlkW; _t1416Path = _t1416PathW; }';
const BC = run({ ...ON, T1416_BEAST_WALL: '1', T1416_FIELD_UNIT: '1' }, WORLD(BAIT('server/wildlife.js', NC, 'TR.terrain.isBlocked = _t1416BlkW; }'), WALL));
ok(BC.baitN === 1 && !BC.err && !wallOk(BC), '⑥ 미끼 ⓒ — 바꾼 자리 1곳(판 걸음 동안 지나는 칸 검사를 끔)인 wildlife 사본은 ④ 가 빨강(걸음이 집채를 건너뛴다)', JSON.stringify(BC));
const ND = '  if (T1416_CARRY_HOME && npc._t1416H) _t1416Deliver(vil, npc);';
const BD = run({ ...ON, T1416_CARRY_HOME: '1' }, T720(BAIT('server/villages.js', ND, '')));
ok(BD.baitN === 1 && !BD.err && !t720Ok(BD), '⑥ 미끼 ⓓ — 바꾼 자리 1곳(T720 정산에서 사냥꾼 손 넣기 줄을 뺌)인 villages 사본은 ⑤ 가 빨강', JSON.stringify(BD));
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
