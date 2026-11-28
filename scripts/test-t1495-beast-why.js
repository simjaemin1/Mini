#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @bait 5
// === scripts/test-t1495-beast-why.js — 보는 사람 없이도 짐승이 사람을 치는 세계의 값 덜기(T1495 · T1461 회부 2 · 3 · 4 · 판정 32 · 족보 937) ======
//
// ★이 하네스가 지키는 계약(가짜 존 · 몸 표 · 서버 0 · 날짜 · 벽시계 0):
//   ① 손잡이 `T1495_BEAST_LEAN` — 끔 기본 · '1' 만 · T1461(`T1461_BEAST_UNSEEN` · `T1432_NPC_DEATH` · 사냥판 T1393) 켬 위에서만 뜻 · 새 확률 식 0
//   ② 같은 답 — 사냥판 작은 세계(사냥꾼 하나 · 무리터 밖을 들락날락하는 마을 밖 몸 둘 · 멧돼지 · 사슴 무리터 둘) 두 게임날:
//      LEAN 켬 = 끔(넉 시간마다 몸 지문 · 짐승 몸 표 · 굴림 수 · 맞은 타 · 깨움 · 잠듦) · 메모를 실제로 썼다(맞음 > 0 · 비움 ≥ 1)
//   ③ 보는 사람이 있을 때와 없을 때 같다 — 같은 세계에 보는 사람(켜진 청크 · 활성 자리)을 두어도 몸 지문이 같다(LEAN 켬)
//   ④ 몸 표 메모 — 집 무리터(`homeAt`) 답이 신탁(무리터 칸 집합에서 바로 센 답)과 칸마다 같다: 처음 · 두 번째(메모에서) · 벌채로 무리터가 바뀐 뒤(메모 비움) ·
//      바뀐 뒤 답이 실제로 달라진 칸이 있다(자명 통과 금지)
//   ⑤ 끔 — 메모 없음(종전 훑기) · 답이 신탁과 칸마다 같다
//   ⑥ 다리만 켠 세계(`T1455_BRIDGE_DECAY` 켬 · `T1440_ROAD_RULE` 끔 · 족보 937) — 진짜 존 DB(임시 파일)로 끊김 → 그 쌍만 지워지고(다른 쌍 남음) ·
//      다리 몫 다시 센 거리행렬 = 전쌍 · 되살림 → 처음 값 · T1440 표(`t1440_first`)가 안 선다(끔 = 표 0)
//   ⑦ 미끼(이 파일 안 · 다섯 — 원문 한 곳씩 메모리에서만 바꾼다 · 제품 손 0):
//      ㉠ 무리터가 바뀌어도 메모를 안 비우는 사본(답이 달라지는 빠른 길) → ④ 빨강
//      ㉡ 메모를 무리터 다시 짓기 전에 읽는 사본(답이 달라지는 빠른 길 둘째) → ④ 빨강
//      ㉢ 마을 밖 몸이 보는 사람이 있을 때만 깨우는 이인 사본(보는 사람이 있을 때와 없을 때 짐승이 다르게 군다) → ③ 빨강
//      ㉣ 메모 자리의 끔 갈래가 칸 하나를 다르게 답하는 사본(끔에서 한 칸이라도 다르다) → ⑤ 빨강
//      ㉤ 쌍 하나 지우기가 T1440 표를 여는 사본(고치기 전 글자 — 다리만 켠 세계에 빈 T1440 표) → ⑥ 빨강
// 실행: node scripts/test-t1495-beast-why.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path'), fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const T = require('./lib-tmp');
const TMP = T.dir('t1495');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const KN = ['T1331_BEAST_BODY', 'T1393_HUNT_CHASE', 'T1195_HUNT_REAL', 'T1432_NPC_DEATH', 'T1461_BEAST_UNSEEN', 'T1495_BEAST_LEAN', 'T1495_VIEW', 'T1440_ROAD_RULE', 'T1455_BRIDGE_DECAY',
  'T1438_DECAY', 'T527_BRIDGE_ACT', 'NODE_OPTIONS', 'ENABLE_VILLAGES', 'DB_PATH', 'ZONE_ID', 'T1359_HUNT_BODY', 'T1243_FARM_ON', 'T1331_BEAST_SCALE', 'MEMO'];
const kid = (env, code) => {
  const e = Object.assign({}, process.env); for (const k of KN) delete e[k]; Object.assign(e, env);
  try { const out = execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
    return JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop()); }
  catch (er) { return { err: String(er.stderr || er.message).slice(-500) }; }
};
//   글자 사본 하나 — 그 파일을 읽을 때 메모리에서만 needle 을 바꾼다(바꾼 자리 수를 `__baitN` 에) · 제품 파일 손 0
const BAIT = (file, needle, rep) => `const __M=require('module'),__c=__M.prototype._compile,__F=require('path').join(process.cwd(),${JSON.stringify(file)});globalThis.__baitN=-1;
__M.prototype._compile=function(c,f){if(f===__F){globalThis.__baitN=c.split(${JSON.stringify(needle)}).length-1;if(globalThis.__baitN===1)c=c.replace(${JSON.stringify(needle)},()=>${JSON.stringify(rep)});}return __c.call(this,c,f);};`;
const BF = 'server/beast-body.js', WF = 'server/wildlife.js', DF = 'server/zone-local-db.js';
const BAITS = {
  a: [BF, '    if (_t1495Hm) { _t1495Hm.clear(); _t1495HmSt.clr++; }', '    if (_t1495Hm) { _t1495HmSt.clr++; }'],
  b: [BF, '    if (adjDirty) _adjBuild();\n    const c = KEY(cx, cy), o = owner.get(c); if (o && o.length) return o[0];\n    if (_t1495Hm && _t1495Hm.has(c)) { _t1495HmSt.hit++; return _t1495Hm.get(c); }',
    '    const c = KEY(cx, cy);\n    if (_t1495Hm && _t1495Hm.has(c)) { _t1495HmSt.hit++; return _t1495Hm.get(c); }\n    if (adjDirty) _adjBuild();\n    const o = owner.get(c); if (o && o.length) return o[0];'],
  c: [WF, 'return T1461 && p.isNpc && !hunter && !p._bxExit &&', 'return T1461 && p.isNpc && !hunter && !p._bxExit && !!(Hh && Hh.isPositionActive && Hh.isPositionActive(p.x, p.y)) &&'],
  d: [BF, '    if (_t1495Hm) { _t1495Hm.set(c, best); _t1495HmSt.miss++; }', '    if (_t1495Hm) { _t1495Hm.set(c, best); _t1495HmSt.miss++; } else if (c === KEY(400, 500)) best = \'U\';'],
  e: [DF, 'function deleteTradeRoute(zone, pair) { return stmtDelRoute.run(', 'function deleteTradeRoute(zone, pair) { _t1440Db(); return stmtDelRoute.run('],
};
const ON = { T1331_BEAST_BODY: '1', T1393_HUNT_CHASE: '1', T1195_HUNT_REAL: '1', T1432_NPC_DEATH: '1', T1461_BEAST_UNSEEN: '1' };

console.log('\n=== T1495 — 보는 사람 없이도 짐승이 사람을 치는 세계의 값 덜기 · 다리만 켠 세계 ===');
// ── ① 손잡이 · 글자 ──
console.log('\n① 손잡이 · 글자');
{
  const w = rd(WF), b = rd(BF);
  ok(/const T1495_LEAN = T1461 && process\.env\.T1495_BEAST_LEAN === '1';/.test(w) && /if \(T1495_LEAN && B\._t1495L !== 1 && B\.t1495HomeMemo\) \{ _t1495Hm = B\.t1495HomeMemo\(\); B\._t1495L = 1; \}/.test(w),
    '① 손잡이 글자 — T1461 켬 위 · `1` 만 · 메모를 여는 줄 하나(사냥판 틱 머리)');
  const K = (env) => kid(Object.assign({}, env), `const W=require('./server/wildlife');console.log(JSON.stringify({lean:W.T1495_LEAN,t61:W.T1461,s:W.t1495Stat()}));`);
  const k0 = K(ON), k1 = K(Object.assign({}, ON, { T1495_BEAST_LEAN: '1' })), k2 = K({ T1331_BEAST_BODY: '1', T1393_HUNT_CHASE: '1', T1495_BEAST_LEAN: '1' }), k3 = K(Object.assign({}, ON, { T1495_BEAST_LEAN: 'yes' }));
  ok(k0.lean === false && k1.lean === true && k2.lean === false && k3.lean === false && k1.s.on === true && k0.s.on === false,
    '① 끔 기본 · `1` 만 · T1461 끔이면 LEAN 을 켜도 뜻 없음', JSON.stringify({ k0: k0.lean, k1: k1.lean, k2: k2.lean, k3: k3.lean, err: k0.err || k1.err }));
  const seg = b.slice(b.indexOf('  let _t1495Hm = null;'), b.indexOf('function audit(')) + w.slice(w.indexOf('const T1495_LEAN'), w.indexOf('const _t1461St'));
  ok(seg.length > 200 && !/Math\.random|_rw\(|rng\(/.test(seg), '① 새 확률 식 0 — 메모(칸 → 답)뿐 · 굴림 0');
  const src = { [BF]: b, [WF]: w, [DF]: rd(DF) };
  ok(Object.keys(BAITS).every((k) => src[BAITS[k][0]].split(BAITS[k][1]).length - 1 === 1), '① 미끼 자리 — 원문에 정확히 한 곳씩(다섯)', Object.keys(BAITS).map((k) => k + ':' + (src[BAITS[k][0]].split(BAITS[k][1]).length - 1)).join(' '));
}

// ── ② · ③ 사냥판 작은 세계 ──
const FIELD = (pre) => `${pre || ''}
const BB=require('./server/beast-body'),Wl=require('./server/wildlife');
let seed=11;const rng=()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
let rolls=0;const rngC=()=>{rolls++;return rng();};
const B=BB.create({L_GAMEMAX:100,L_GAMER:0.002,huntTake:()=>0,species:['wild_boar','deer'],scale:5000});
const disk=(v,cx,cy,area,n)=>{const led=new Map();const R=Math.sqrt(area/Math.PI);for(let x=-40;x<=40;x++)for(let y=-40;y<=40;y++)if(x*x+y*y<=R*R)led.set((cx+x)+','+(cy+y),0);const ks=[...led.keys()];for(const k of ks)led.set(k,n*5000/ks.length);B.migrate(v,led,1);};
disk('V',500,500,2923,58); disk('U',620,520,1500,30);
const mobs=new Map(),players=new Map(),cm={chunkSize:1024,keyOf:(cx,cy)=>cx+'_'+cy,insertMob:()=>{},removeMob:()=>{},updateMobChunk:()=>{}};
const VIEW=process.env.T1495_VIEW==='1';const hits=[];
Wl.init({ZONE_ID:'hanbando',ZONE:{zoneWidth:40000,zoneHeight:40000},TICK_HZ:30,chunkManager:cm,mobs,players,isTerrainBlockedLocal:()=>false,isRockTileLocal:()=>false,
 terrainMod:{getForestMultiplier:()=>2},getActiveChunkKeys:()=>new Set(VIEW?['15_15','16_15','17_16','17_14']:[]),isPositionActive:()=>VIEW,spawnCorpse:()=>null,damagePlayer:(p,d,src)=>{p.hp-=d;hits.push(p.pid+':'+d+':'+src);},broadcast:()=>{},
 WORLD:{dayLengthMs:1440000,dayPhaseRatio:0.7,worldEpoch:0},setMobHp:(m,v)=>{m.hp=v;},simVillages:()=>[],legacyVillages:[],rng:rngC,huntBudgetOf:()=>Infinity,t1393Put:(p,x,y)=>{p.x=x;p.y=y;},
 t1461Out:(p)=>p._out===1});
const h={pid:'h1',isNpc:true,simJob:'hunter',_huntOn:1,hp:100,x:500*32,y:470*32,_workSite:{x:500*32,y:480*32},_huntWk:{cx:500,cy:480},vx:0,vy:0,simVillageId:1};players.set('h1',h);
const o1={pid:'o1',isNpc:true,simJob:'gatherer',hp:100,x:540*32,y:500*32,vx:0,vy:0,_out:1,simVillageId:1};players.set('o1',o1);
const o2={pid:'o2',isNpc:true,simJob:'woodcutter',hp:100,x:575*32,y:470*32,vx:0,vy:0,_out:1,simVillageId:1};players.set('o2',o2);
let now=7*3600*1000;
const sig=()=>{const a=[];for(const b of B.W.bodies.values())a.push(b.id,b.cx,b.cy,b.hp|0,b.mat);for(const p of players.values())a.push(p.pid,Math.round(p.x),Math.round(p.y),p.hp);a.push(rolls);return require('crypto').createHash('sha1').update(a.join(',')).digest('hex').slice(0,16);};
const days=[];
for(let m=0;m<2*1440;m+=6){now+=6000;
  const ph=(m/6)%40;o1.x=(540+ph*2)*32;o2.y=(470+((m/6)%25))*32;   // 마을 밖 몸이 걷는다(둘레 문을 들락날락)
  if(o1.hp<60)o1.hp=100;if(o2.hp<60)o2.hp=100;   // 요양 귀가 뒤 다시 나온 몸(같은 몸)
  Wl.tick(now);if(m%240===0)days.push(sig());}
const st=Wl.t1393Stat(),s61=Wl.t1461Stat(),s95=Wl.t1495Stat();
console.log(JSON.stringify({sig:sig(),days,hits:hits.length,hitO:hits.filter(x=>x[0]==='o').length,wake:st.wake,sleep:st.sleep,out:s61.byKind.out,farSkip:s61.farSkip,s95,lean:Wl.T1495_LEAN,baitN:globalThis.__baitN}));`;
console.log('\n② 같은 답 — 사냥판 작은 세계(두 게임날 · LEAN 끔 ↔ 켬)');
const F0 = kid(ON, FIELD()), F1 = kid(Object.assign({}, ON, { T1495_BEAST_LEAN: '1' }), FIELD());
const same = (a, b) => !!(a && b && !a.err && !b.err && a.sig === b.sig && JSON.stringify(a.days) === JSON.stringify(b.days) && a.hits === b.hits && a.wake === b.wake && a.sleep === b.sleep);
ok(!F0.err && !F1.err && F0.hitO > 0 && F0.out > 0 && F0.farSkip > 0 && F0.wake > 0, '② 판이 선다 — 마을 밖 몸이 깨우는 이로 들고(둘레 문을 들락날락) 맞는다', JSON.stringify({ hits: F0.hits, hitO: F0.hitO, out: F0.out, farSkip: F0.farSkip, wake: F0.wake, err: F0.err || F1.err }));
ok(same(F0, F1), '★② LEAN 켬 = 끔 — 넉 시간마다 몸 지문 · 짐승 몸 표 · 굴림 수 · 맞은 타 · 깨움 · 잠듦 같음', `${F0.sig} · ${F1.sig}`);
ok(F1.s95 && F1.s95.on === true && F1.s95.hit > 0 && F1.s95.miss > 0 && F0.s95 && F0.s95.on === false && F0.s95.hit === 0, '② 메모를 실제로 썼다(켬 — 맞음 > 0) · 끔 = 메모 0', JSON.stringify({ on: F1.s95, off: F0.s95 }));
console.log('\n③ 보는 사람이 있을 때와 없을 때(LEAN 켬)');
const V1 = kid(Object.assign({}, ON, { T1495_BEAST_LEAN: '1', T1495_VIEW: '1' }), FIELD());
const viewSame = (a, b) => same(a, b) && a.hitO > 0;
ok(viewSame(F1, V1), '★③ 보는 사람(켜진 청크 · 활성 자리)이 곁에 있어도 마을 밖 몸 · 짐승 몸 지문이 같다', `${F1.sig} · ${V1.sig}`);

// ── ④ · ⑤ 몸 표 메모 ──
const MEMO = (pre) => `${pre || ''}
const BB=require('./server/beast-body');
const B=BB.create({L_GAMEMAX:100,L_GAMER:0.002,huntTake:()=>0,species:['wild_boar','deer'],scale:5000});
const disk=(v,cx,cy,area,n)=>{const led=new Map();const R=Math.sqrt(area/Math.PI);for(let x=-40;x<=40;x++)for(let y=-40;y<=40;y++)if(x*x+y*y<=R*R)led.set((cx+x)+','+(cy+y),0);const ks=[...led.keys()];for(const k of ks)led.set(k,n*5000/ks.length);B.migrate(v,led,1);};
disk('V',500,500,2923,58); disk('U',620,520,1500,30);
const st=process.env.MEMO==='1'?B.t1495HomeMemo():null;
const Q=[];for(let x=380;x<=760;x+=19)for(let y=380;y<=640;y+=13)Q.push([x,y]);Q.push([400,500]);
const oracle=(cx,cy)=>{const k=B.KEY(cx,cy);for(const [v,h] of B.W.hab)if(h.set.has(k))return v;let best=null,bd=Infinity;for(const [v,h] of B.W.hab)for(const kk of h.set){const d=(B.KX(kk)-cx)**2+(B.KY(kk)-cy)**2;if(d<bd){bd=d;best=v;}}return best;};
const pass=(rev)=>{let bad=0;const a=new Array(Q.length);for(let j=0;j<Q.length;j++){const i=rev?Q.length-1-j:j,[x,y]=Q[i];const r=B.homeAt(x,y);a[i]=r;if(r!==oracle(x,y))bad++;}return {bad,a};};
const p1=pass(),p2=pass();
B.deforest('U',620,520,22);   // 무리터 U 를 다 벤다 — U 가 가깝던 칸이 V 로 바뀐다
const p3=pass(true),p4=pass();   // 벤 뒤 첫 물음은 U 쪽 먼 칸부터(메모에 든 칸이 먼저 물린다)
let changed=0;for(let i=0;i<Q.length;i++)if(p1.a[i]!==p3.a[i])changed++;
console.log(JSON.stringify({n:Q.length,bad:[p1.bad,p2.bad,p3.bad,p4.bad],changed,st:st?Object.assign({},st):null,baitN:globalThis.__baitN}));`;
console.log('\n④ 몸 표 메모 — 집 무리터 답 = 신탁(처음 · 메모 · 벌채 뒤)');
const M1 = kid({ MEMO: '1' }, MEMO()), M0 = kid({}, MEMO());
const memoOk = (r) => !!(r && !r.err && r.bad.every((x) => x === 0) && r.changed > 0);
ok(memoOk(M1) && M1.st && M1.st.hit > 0 && M1.st.clr >= 2, '★④ 켬 — 칸마다 신탁과 같다(처음 · 두 번째 = 메모에서 · 벌채로 무리터가 바뀐 뒤 = 비우고 다시) · 바뀐 뒤 달라진 칸 있음', JSON.stringify(M1));
console.log('\n⑤ 끔 — 메모 없음');
ok(memoOk(M0) && M0.st === null, '★⑤ 끔 — 종전 훑기 · 칸마다 신탁과 같다', JSON.stringify(M0));

// ── ⑥ 다리만 켠 세계(족보 937) ──
const BRIDGE = (pre) => `${pre || ''}
const path=require('path'),ROOT=process.cwd();
const V=require(path.join(ROOT,'server','villages.js')),E=require(path.join(ROOT,'sim','economy-sim.js')),V2=require(path.join(ROOT,'sim','economy-sim-v2.js'));
const DB=require(path.join(ROOT,'server','zone-local-db.js'));
const P=V.__labProbe._t400Probe,Q=V.__t1455;
const W=64,H=64,CELLS=[];for(let x=26;x<=37;x++)for(const y of [30,31])CELLS.push(x,y);
const BR=new Set();for(let i=0;i<CELLS.length;i+=2)BR.add(CELLS[i]+'_'+CELLS[i+1]);
const FAR=new Set();for(let x=26;x<=37;x++)for(const y of [60,61])FAR.add(x+'_'+y);
const wat=(x,y)=>x>=28&&x<=35;
const ta={isWater:(x,y)=>wat(x,y),isBlocked:(x,y)=>wat(x,y)&&!BR.has(x+'_'+y)&&!FAR.has(x+'_'+y),isBridgeCell:(x,y)=>BR.has(x+'_'+y)||FAR.has(x+'_'+y)};
let cutAns=true,day=100;
const deps={players:new Map(),moveSpeed:120,broadcast(){},anyViewerNear:()=>false,t1438Now:()=>day,t1438EpochDay:()=>0,t1455Apply:()=>{},t1455Cut:(i,c,cut)=>{if(!cut)return true;return cutAns;},t1455Cross:()=>null};
const Z=process.env.ZONE_ID;
P.setup({deps,db:DB,dayMs:1000,epoch:0,zoneId:Z,tickCtx:{now:1},ta});
const ev=(name,cx,cy,wood)=>({name,coord:{x:cx*2.5,y:cy*2.5},npcs:[{currentJob:'farmer',skills:{}},{currentJob:'lumberjack',skills:{}}],storage:{wood},land:{},counts:{}});
const EA=ev('A',20,30,400),EB=ev('B',44,30,400),EC=ev('C',20,4,400),ED=ev('D',44,56,400);
const world={day:200,villages:[EA,EB,EC,ED],tradeLog:[]};
const vil=(dbId,e)=>({dbId,name:e.name,econ:e,ccx:e.coord.x/2.5,ccy:e.coord.y/2.5,_granList:[],npcPids:[]});
const px=(cx,cy)=>({x:cx*32+16,y:cy*32+16});
const RC=new Map([['1_2',[px(20,30),px(32,30),px(44,30)]],['3_4',[px(20,4),px(20,60),px(44,60),px(44,56)]]]);
for(const [k,v] of RC)DB.upsertTradeRoute(Z,k,'s1',JSON.stringify(v));
const site={i:0,v:['A'],span:8,cells:CELLS.slice(),stage:2,mat:{},done:true,day:10,adv:[],sum:null,added:CELLS.slice(),dk:{t:100,v:1}};
const V2s={t1217PricesOf:(e)=>e.name==='A'?{wood:1,food:1}:{wood:1,food:4},computeShadowPrices:()=>({wood:1,food:1}),TRANSPORT_COST_PER_1000:V2.TRANSPORT_COST_PER_1000,haulMul:()=>1,_legProfitPerUnit:V2._legProfitPerUnit,travelDaysForDistance:V2.travelDaysForDistance};
Q.setup({econ:Object.assign({},E,{setDistMatrix:(w,m)=>{w._distMatrix=m;}}),econV2:V2s,villages:[vil(1,EA),vil(2,EB),vil(3,EC),vil(4,ED)],routeCache:RC,walkCache:new Map(),world,_distCtx:{ta,ZONE:{zoneWidth:W*32,zoneHeight:H*32}},_distBlk:null,ready:true,_t527Sites:[site]});
const log=console.log;console.log=()=>{};
const tbl=()=>DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='t1440_first'").all().length;
const rows=()=>DB.getTradeRoutes(Z,'s1').map(r=>r.pair).sort();
const out={on1440:V.T1440_ROAD_RULE===true,on1455:V.T1455_BRIDGE_DECAY===true,tbl0:tbl(),rows0:rows()};
Q.dist('처음');const W0=JSON.stringify(world._distMatrix);
site.dk={t:day,v:0.001};day+=10;cutAns='pend';Q.worldDay();
for(let i=0;i<CELLS.length;i+=2)BR.delete(CELLS[i]+'_'+CELLS[i+1]);
V.t1455OnCut(0);
out.cut={cut:site.cut,legs:site._legsCut,rc:[...RC.keys()],rows:rows(),tbl:tbl()};
const job=Q.take();if(job)Q.dist('다리 몫',{t1455:job});const W1=JSON.stringify(world._distMatrix);
Q.setup({_distBlk:null});Q.dist('전쌍');const WF=JSON.stringify(world._distMatrix);
out.re={job:!!job,eq:W1===WF,moved:W1!==W0};
for(let i=0;i<CELLS.length;i+=2)BR.add(CELLS[i]+'_'+CELLS[i+1]);
RC.set('1_2',null);DB.upsertTradeRoute(Z,'1_2','s1',null);   // 끊긴 동안 못 닿던 쌍(길 없음)
const dn=V.t1455Donate(0,'plank',3);const job2=Q.take();if(job2)Q.dist('다리 몫',{t1455:job2});
out.rev={don:dn&&dn.q,cut:site.cut,rows:rows(),tbl:tbl(),back:JSON.stringify(world._distMatrix)===W0};
log(JSON.stringify(Object.assign(out,{baitN:globalThis.__baitN})));`;
console.log('\n⑥ 다리만 켠 세계 — T1455 켬 · T1440 끔 · 진짜 존 DB(족보 937)');
let dbn = 0;
const BENV = () => ({ ENABLE_VILLAGES: '0', T1438_DECAY: '1', T1455_BRIDGE_DECAY: '1', T527_BRIDGE_ACT: '1', DB_PATH: path.join(TMP, `w${++dbn}.db`), ZONE_ID: 't1495z' });
const R6 = kid(BENV(), BRIDGE());
const brOk = (r) => !!(r && !r.err && r.on1455 && !r.on1440 && r.cut && r.cut.cut === true && JSON.stringify(r.cut.rows) === '["3_4"]' && r.re.job && r.re.eq && r.re.moved && r.rev.cut === false && r.rev.back);
const noTbl = (r) => !!(r && !r.err && r.tbl0 === 0 && r.cut.tbl === 0 && r.rev.tbl === 0);
ok(brOk(R6), '★⑥ 끊김 → 그 다리를 지나던 쌍(A↔B)만 DB 에서 지워지고 다른 쌍 남음 · 다리 몫 다시 센 거리행렬 = 전쌍 · 되살림 → 처음 값', JSON.stringify(R6));
ok(noTbl(R6) && JSON.stringify(R6.rev.rows) === '["3_4"]', '★⑥ T1440 끔 = T1440 표 0(`t1440_first` 안 선다) · 되살림이 못 닿던 쌍도 DB 에서 지운다', JSON.stringify({ tbl: [R6.tbl0, R6.cut && R6.cut.tbl, R6.rev && R6.rev.tbl], rows: R6.rev && R6.rev.rows }));

// ── ⑦ 미끼 ──
console.log('\n⑦ 미끼 — 원문 한 곳씩 바꾼 사본(메모리에서만)');
const BA = kid({ MEMO: '1' }, MEMO(BAIT(...BAITS.a))), BB2 = kid({ MEMO: '1' }, MEMO(BAIT(...BAITS.b)));
ok(BA.baitN === 1 && !memoOk(BA), '★미끼 ㉠ 바꾼 자리 1곳(무리터가 바뀌어도 메모를 안 비우는 사본 — 답이 달라지는 빠른 길) → ④ 빨강', JSON.stringify({ baitN: BA.baitN, bad: BA.bad, err: BA.err }));
ok(BB2.baitN === 1 && !memoOk(BB2), '★미끼 ㉡ 바꾼 자리 1곳(메모를 무리터 다시 짓기 전에 읽는 사본 — 답이 달라지는 빠른 길 둘째) → ④ 빨강', JSON.stringify({ baitN: BB2.baitN, bad: BB2.bad, err: BB2.err }));
const LV = Object.assign({}, ON, { T1495_BEAST_LEAN: '1' });
const C0 = kid(LV, FIELD(BAIT(...BAITS.c))), C1 = kid(Object.assign({}, LV, { T1495_VIEW: '1' }), FIELD(BAIT(...BAITS.c)));
ok(C0.baitN === 1 && C1.baitN === 1 && !viewSame(C0, C1), '★미끼 ㉢ 바꾼 자리 1곳(마을 밖 몸이 보는 사람이 있을 때만 깨우는 이인 사본 — 보는 이 유무로 짐승이 다르게 군다) → ③ 빨강', JSON.stringify({ baitN: [C0.baitN, C1.baitN], sig: [C0.sig, C1.sig], hitO: [C0.hitO, C1.hitO], err: C0.err || C1.err }));
const DD = kid({}, MEMO(BAIT(...BAITS.d)));
ok(DD.baitN === 1 && !memoOk(DD), '★미끼 ㉣ 바꾼 자리 1곳(메모 자리의 끔 갈래가 칸 하나를 다르게 답하는 사본 — 끔에서 한 칸 다르다) → ⑤ 빨강', JSON.stringify({ baitN: DD.baitN, bad: DD.bad, err: DD.err }));
const EE = kid(BENV(), BRIDGE(BAIT(...BAITS.e)));
ok(EE.baitN === 1 && brOk(EE) && !noTbl(EE), '★미끼 ㉤ 바꾼 자리 1곳(쌍 하나 지우기가 T1440 표를 여는 사본 — 고치기 전 글자) → ⑥ 표 줄 빨강(다시 서기는 선다)', JSON.stringify({ baitN: EE.baitN, tbl: EE.cut && EE.cut.tbl, err: EE.err }));

console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
