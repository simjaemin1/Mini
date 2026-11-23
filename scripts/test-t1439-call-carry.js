#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @bait 4   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1439-call-carry.js — 잡은 짐승은 사람을 불러 한 번에 나른다(T1439) =====================================
//
// 지키는 것(서버 0 · 몇 초 · 운영 문 그대로 부른다):
//   ① 손잡이 `T1439_CALL_CARRY` — 끔 기본 · `'1'` 만 · 걸어 나르기(`T1416_CARRY_HOME`) 켬 안에서만 · wildlife · villages 같은 env
//   ② 몰이 → 나르기 — 사체가 앉는 순간 몰이 반경(해제 18 · 맨해튼) 안 살아 있는 사냥꾼 대리가 명단에 오르고(먼 몸 · 죽은 몸 · 사냥꾼 아닌 몸 빠짐) ·
//      한 손에 다 못 실은 몫은 명단 몸마다 제 손 빈 자리만큼 그 몸의 둔 몫으로 나뉜다(합 보존 · 제 둔 몫이 있는 몸 · 판을 떠난 몸 건너뜀) · 그 몸은 지고 곧장 곳간 길(글자)
//   ③ 마을에서 데려가기 — 남은 kg 60 · 짐 25 → ⌈60 ÷ 25⌉ − 1 = 2 명(쏜 몸이 한 짐) · 쉬는 몸('휴식') 먼저 · 판에 든 사냥꾼 · 일감 몸 · 누운 몸 건너뜀 ·
//      조각마다 짐 상한 이하 · 합 보존 · **불린 몸은 제자리**(일감 목표만 사체 자리 — 순간이동 0)
//   ④ 불려 온 몸의 하루 — 멀면 걷기만('고기 가지러' · 손 0) · 닿으면 그날 몫을 손에(상한까지) · 곳간 사다리에서 넣는다(그 마을 곳간 kg 누계) · 날이 바뀌어 닿으면 헛걸음(센다 · 빈손)
//   ⑤ 불려 간 몸은 제 일을 같이 안 한다 — 생활층 일감 갈래가 직업 갈래 앞에서 `return` 한다(글자 차례)
//   ⑥ 미끼(이 파일 안 · 넷) — ⓐ 몰이 몸 나눔을 안 실음 → ② 빨강(빈손으로 흩어짐) · ⓑ 불린 몸을 사체 자리에 세움 → ③ 빨강(순간이동) ·
//                            ⓒ 조각 짐 상한 → 늘 참 → ③ 빨강(짐 상한 넘김) · ⓓ 일감 갈래 `return` 뺌 → ⑤ 빨강(제 일도 같이)
//   날짜 · 벽시계를 쓰지 않는다(판 게임 분 · 가짜 now 만).
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
console.log('\n=== T1439 — 잡은 짐승은 사람을 불러 한 번에 나른다 ===');
const KN = ['T1439_CALL_CARRY', 'T1331_BEAST_BODY', 'T1393_HUNT_CHASE', 'T1416_WAKE_PRE', 'T1416_FIELD_UNIT', 'T1416_BEAST_WALL', 'T1416_CARRY_HOME', 'T1195_HUNT_REAL', 'NODE_OPTIONS', 'ENABLE_VILLAGES'];
const kid = (env, code) => { const e = Object.assign({}, process.env); for (const k of KN) delete e[k]; Object.assign(e, { ENABLE_VILLAGES: '0' }, env);
  const out = execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 16 << 20 });
  return JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop()); };
const run = (env, code) => { try { return kid(env, code); } catch (e) { return { err: String(e).slice(0, 300) }; } };
const BAIT = (file, needle, rep) => `const __M=require('module'),__c=__M.prototype._compile,__F=require('path').join(process.cwd(),${JSON.stringify(file)});globalThis.__baitN=-1;
__M.prototype._compile=function(c,f){if(f===__F){globalThis.__baitN=c.split(${JSON.stringify(needle)}).length-1;if(globalThis.__baitN===1)c=c.replace(${JSON.stringify(needle)},${JSON.stringify(rep)});}return __c.call(this,c,f);};`;
const ON = { T1331_BEAST_BODY: '1', T1393_HUNT_CHASE: '1', T1416_CARRY_HOME: '1', T1439_CALL_CARRY: '1' };
// ── ① ──
const KC = `const W=require('./server/wildlife'),V=require('./server/villages');console.log(JSON.stringify({w:!!(W.T1439&&W.T1439.on),v:!!V.T1439_CALL_CARRY}));`;
const K0 = run({}, KC), K1 = run(ON, KC), K2 = run({ T1439_CALL_CARRY: '1' }, KC), K3 = run({ ...ON, T1439_CALL_CARRY: 'yes' }, KC);
ok(K0.w === false && K0.v === false && K1.w === true && K1.v === true && K2.w === false && K2.v === false && K3.w === false,
  '① 손잡이 — 끔 기본 · `1` 만 · 걸어 나르기 켬 안에서만 · 두 모듈 같은 env', JSON.stringify({ K0, K1, K2, K3 }));
// ── ② 몰이 → 나르기 ──
const SH = (pre) => `${pre || ''}const W=require('./server/wildlife').T1439;
const mk=(id,x,y,o)=>Object.assign({job:'hunter',px:x,py:y,_real:{pid:id}},o||{});
const a=mk('a',100,100),o1=mk('o1',104,108),o2=mk('o2',95,96,{_real:{pid:'o2',_t1416H:{kg:20,it:{meat:20}}}}),far=mk('far',130,100),dead=mk('d',101,101,{_dead:1}),fisher=mk('f',100,102,{job:'fisher'}),own=mk('own',99,99,{_real:{pid:'own',_t1416C:{kg:3}}});
const s={agents:[a,o1,o2,far,dead,fisher,own]};W.coOf(a,s);const co=(a._t1439Co||[]).map(x=>x._real.pid);
const Wt=require('./server/weights'),IT={meat:8,hide:3,antler:1};let K=0;for(const k in IT)K+=IT[k]*(Wt.kgOf(k)||0);const left={x:100,y:100,d:5,kg:+K.toFixed(3),it:IT};const K0=left.kg;const F={gm:7000,ag:new Set([a,o1,o2,own])};W.share(a,left,F);
const p1=o1._real._t1416C,p2=o2._real._t1416C;console.log(JSON.stringify({co,p1,p2,left,K0,ownC:own._real._t1416C,baitN:globalThis.__baitN}));`;
const S0 = run(ON, SH());
const shOk = (r) => !r.err && JSON.stringify(r.co) === '["o1","o2","own"]' && r.p1 && r.p1.kg > 0 && r.p1.co === 1 && (!r.p2 || r.p2.kg <= 5 + 1e-9) && Math.abs((r.p1.kg + (r.p2 ? r.p2.kg : 0) + r.left.kg) - r.K0) < 1e-6 && r.left.kg >= -1e-9 && r.K0 > 0 && r.ownC.kg === 3;
const WS = fs.readFileSync(path.join(ROOT, 'server', 'wildlife.js'), 'utf8'), VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(shOk(S0) && /if \(T1439_CALL_CARRY && C\.co\) \{ a\._t1416Go = 1;/.test(WS),
  '② 몰이 → 나르기 — 명단 = 몰이 반경 안 산 사냥꾼(먼 몸 · 죽은 몸 · 어부 빠짐) · 남은 몫(고기 8 · 가죽 3 · 뿔 1 — 무게 정본)을 빈 자리만큼 나눔(합 보존 · 손 20 kg 몸은 5 kg 까지 · 제 둔 몫 있는 몸 건너뜀) · 지고 곧장 곳간 길',
  JSON.stringify({ K0: S0.K0, co: S0.co, p1: S0.p1 && S0.p1.kg, p2: S0.p2 && S0.p2.kg, left: S0.left && S0.left.kg, err: S0.err }));
// ── ③ 마을에서 데려가기 ──
const CALL = (pre) => `${pre || ''}const V=require('./server/villages');const players=new Map();V.__p3Bind({dayMs:250,epoch:0,deps:{dayPhaseRatio:0.7,players}});
const mk=(pid,o)=>{const p=Object.assign({pid,isNpc:true,hp:100,maxHp:100,x:1000,y:1000,simJob:'farmer',_lifeAct:'경작'},o||{});players.set(pid,p);return p;};
const killer=mk('k',{simJob:'hunter',_t1416C:{x:200,y:300,d:4,kg:60,it:{meat:60},t0:1,trips:1,sp:'deer'}});
const rest=mk('r1',{_lifeAct:'휴식'}),hunt=mk('h1',{simJob:'hunter'}),inField=mk('h2',{simJob:'hunter',_huntOn:1}),busy=mk('b1',{_lifeTask:{k:'build'}}),down=mk('dn',{isDown:true}),other=mk('o1');
const vil={npcPids:[...players.keys()],econ:{},_granList:[],ccx:30,ccy:30};
const n=V._t1439Probe.call(vil,killer,5000);const by=[...players.values()].filter(p=>p._lifeTask&&p._lifeTask.k==='meat');
console.log(JSON.stringify({n,who:by.map(p=>p.pid),parts:by.map(p=>p._lifeTask.C.kg),pos:by.map(p=>[p.x,p.y]),tgt:by.map(p=>[p._lifeTask.px,p._lifeTask.py]),left:killer._t1416C?killer._t1416C.kg:0,stat:V.t1439Stat(),baitN:globalThis.__baitN}));`;
const C0 = run(ON, CALL());
const callOk = (r) => !r.err && r.n === 2 && JSON.stringify(r.who) === '["r1","h1"]' && r.parts.every((k) => k <= 25 + 1e-9) && Math.abs(r.parts.reduce((x, y) => x + y, 0) + r.left - 60) < 1e-6
  && r.pos.every((q) => q[0] === 1000 && q[1] === 1000) && r.tgt.every((q) => q[0] === 6400 && q[1] === 9600);
ok(callOk(C0), '③ 마을에서 데려가기 — 60 kg · 짐 25 → 2 명(쉬는 몸 → 판 밖 사냥꾼 · 판 안 사냥꾼 · 일감 · 누운 몸 빠짐) · 조각 ≤ 25 · 합 보존 · 불린 몸은 제자리(목표만 사체)',
  JSON.stringify({ n: C0.n, who: C0.who, parts: C0.parts, left: C0.left, pos: C0.pos, err: C0.err }));
// ── ④ 불려 온 몸의 하루 ──
const STEP = `const V=require('./server/villages'),Wl=require('./server/wildlife');const players=new Map();
Wl.init({ZONE_ID:'hanbando',ZONE:{zoneWidth:4000*32,zoneHeight:4000*32},TICK_HZ:30,chunkManager:{chunkSize:1024,keyOf:(a,b)=>a+'_'+b,insertMob:()=>{},removeMob:()=>{},updateMobChunk:()=>{}},mobs:new Map(),players,isTerrainBlockedLocal:()=>false,isRockTileLocal:()=>false,
 terrainMod:{getForestMultiplier:()=>2},getActiveChunkKeys:()=>new Set(),isPositionActive:()=>true,spawnCorpse:()=>null,damagePlayer:()=>{},broadcast:()=>{},WORLD:{dayLengthMs:1440000,dayPhaseRatio:0.7,worldEpoch:0},setMobHp:()=>{},simVillages:()=>[],legacyVillages:[],rng:Math.random,huntBudgetOf:()=>Infinity,t1393Put:()=>{}});
const E=require('./sim/economy-sim');V.__p3Bind({dayMs:1440000,epoch:0,deps:{dayPhaseRatio:0.7,players}});
const now0=3*1440000+600000;const day=Math.floor(now0/1440000);
const mkv=()=>({econ:E.createVillage({initialPop:6,name:'v'}),_granList:[],ccx:30,ccy:30});
const go=(dd)=>{const vil=mkv();const p={pid:'r',x:0,y:0,simJob:'farmer'};const t={k:'meat',px:3200,py:3200,C:{x:100,y:100,d:dd,kg:40,it:{meat:40},t0:1,trips:1},at:now0,w0:now0,home:0};p._lifeTask=t;
 const r0=V._t1439Probe.step(vil,p,now0,t);const far={act:p._lifeAct,hand:p._t1439H?p._t1439H.kg:0,home:t.home};
 p.x=3200;p.y=3200;V._t1439Probe.step(vil,p,now0+10,t);const at={hand:p._t1439H?p._t1439H.kg:0,home:t.home,left:t.C.kg,task:!!p._lifeTask};
 if(p._lifeTask){p.x=t.px;p.y=t.py;V._t1439Probe.step(vil,p,now0+20,t);}return {far,at,end:{hand:p._t1439H?p._t1439H.kg:0,task:!!p._lifeTask,kg:vil._t1416Kg||0}};};
const dd=require('./server/wildlife').T1439.load?null:null;
// 그날 = 둔 몫 날 축(몸 시계 날) — 같은 날 / 지난 날
const W=require('./server/wildlife').T1439;const probe={_t1439H:null,pid:'q'};const C1={x:0,y:0,d:-1,kg:1,it:{meat:1}};W.load(probe,C1,now0);
const today=(()=>{for(let d=0;d<10;d++){const q={pid:'z'};const c={x:0,y:0,d,kg:1,it:{meat:1}};const r=W.load(q,c,now0);if(!r.miss)return d;}return null;})();
const same=go(today),past=go(today-1);console.log(JSON.stringify({today,same,past,stat:V.t1439Stat()}));`;
const T0 = run(ON, STEP);
ok(!T0.err && T0.same && T0.same.far.act === '고기 가지러' && T0.same.far.hand === 0 && T0.same.at.hand === 25 && T0.same.at.home === 1 && T0.same.at.left === 15 && T0.same.end.task === false && T0.same.end.kg === 25 && T0.same.end.hand === 0
  && T0.past.at.hand === 0 && T0.past.at.task === false && T0.past.end.kg === 0 && T0.stat.miss >= 1,
  '④ 불려 온 몸 — 멀면 걷기만(손 0) · 닿으면 그날 몫 25 kg(상한)을 지고 곳간 길 · 곳간에서 넣음(누계 25) · 지난날 몫이면 헛걸음(빈손 · 셈)', JSON.stringify(T0));
// ── ⑤ 제 일을 같이 안 한다 ──
const tick = VS.slice(VS.indexOf('function npcLifeTick(npc, now) {'));
const iMeat = tick.indexOf("if (T1439_CALL_CARRY && t.k === 'meat') return _t1439Step(vil, npc, now, t);"), iJob = tick.indexOf('const job = npc.simJob;');
ok(iMeat > 0 && iJob > iMeat, '⑤ 불려 간 몸은 제 일을 같이 안 한다 — 일감 갈래가 직업 갈래 앞에서 `return`(글자 차례)', JSON.stringify({ iMeat, iJob }));
// ── ⑥ 미끼 ──
const Ba = run(ON, SH(BAIT('server/wildlife.js', '    if (part.kg > 0) { for (const k in part.it) { left.it[k]', '    if (false) { for (const k in part.it) { left.it[k]')));
ok(Ba.baitN === 1 && !Ba.err && !shOk(Ba), '⑥ 미끼 ⓐ — 바꾼 자리 1곳(몰이 몸 나눔 안 실음)인 wildlife 사본은 ② 빨강(빈손으로 흩어짐)', JSON.stringify({ baitN: Ba.baitN, p1: Ba.p1 || null }));
const Bb = run(ON, CALL(BAIT('server/villages.js', "    p._lifeTask = { k: 'meat', px: C.x * 32, py: C.y * 32, C: part, at: now, w0: now, home: 0 };", "    p._lifeTask = { k: 'meat', px: C.x * 32, py: C.y * 32, C: part, at: now, w0: now, home: 0 }; p.x = C.x * 32; p.y = C.y * 32;")));
ok(Bb.baitN === 1 && !Bb.err && !callOk(Bb), '⑥ 미끼 ⓑ — 바꾼 자리 1곳(불린 몸을 사체 자리에 세움)인 villages 사본은 ③ 빨강(순간이동)', JSON.stringify({ baitN: Bb.baitN, pos: Bb.pos }));
const Bc = run(ON, CALL(BAIT('server/villages.js', 'while (n < C.it[k] && part.kg + w <= cap + 1e-9)', 'while (n < C.it[k] && true)')));
ok(Bc.baitN === 1 && !Bc.err && !callOk(Bc), '⑥ 미끼 ⓒ — 바꾼 자리 1곳(조각 짐 상한 → 늘 참)인 villages 사본은 ③ 빨강(짐 상한 넘김)', JSON.stringify({ baitN: Bc.baitN, parts: Bc.parts }));
const VSb = VS.replace("if (T1439_CALL_CARRY && t.k === 'meat') return _t1439Step(vil, npc, now, t);", "if (T1439_CALL_CARRY && t.k === 'meat') _t1439Step(vil, npc, now, t);");
const tickB = VSb.slice(VSb.indexOf('function npcLifeTick(npc, now) {')), iMeatB = tickB.indexOf("if (T1439_CALL_CARRY && t.k === 'meat') return _t1439Step(vil, npc, now, t);");
ok(VSb !== VS && !(iMeatB > 0 && tickB.indexOf('const job = npc.simJob;') > iMeatB), '⑥ 미끼 ⓓ — 바꾼 자리 1곳(일감 갈래 `return` 뺌 — 제 일로 떨어짐)인 글자 사본은 ⑤ 빨강', JSON.stringify({ iMeatB }));
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
