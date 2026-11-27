#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @bait 7
// === scripts/test-t1503-day-close.js — 첫 하루 마감이 거리표를 통째로 다시 세지 않는다 · 평소 마감도 틱 몫 안으로 (T1503) =============
//
// ★이 하네스가 지키는 계약(카드 지시_T1503 "정해진 것" · 손잡이 둘 다 끔 기본):
//   ① `T1503_DIST_KEEP` — 환호(도랑) 적재 뒤 거리표 = 끔(통째로 다시 센 표)과 값이 같다: ⓐ 도랑이 답을 안 바꾸면 BFS 0(같은 표 사본 · 같은 주입 자리)
//      ⓑ 답을 바꾸면 다시 세되 표는 끔과 같다 · 메모 칸은 지금 지형의 답(다시 판 것과 같다) ⓒ 부팅 적재 뒤 다음 날이 가까우면 부팅 중에 다 세어 둔다(주입은 마감 ⑪ — 종전 자리)
//      ⓓ 사본 일이 서 있는데 다리가 끊기면(무효화) 옛 표를 주지 않는다 — 끔과 같은 새 표
//   ② `T1503_CLOSE_SLICE` — 마감 조각을 틱 몫(T687 `TB`)으로 나눠 담는다: 한 틱에 다 닫지 않는다 · 지난번에 컸던 조각은 남은 몫이 모자라면 다음 틱 머리로
//      · 다음 날이 왔는데 남았으면 그 틱에 다 닫고 센다
//   ③ 닫는 동안 마을 몸 결정이 얼어 있다(닫기 시작한 순간의 곳간 · 칸 — T698 ① 그 문)
//   ④ 끔 = main 그대로(메모 통째 비움 · 사본 일 0 · 부팅 셈 0 · 조각 담기 종전 · 몸 결정 안 얼림 · /perf 칸 0)
//   판 없이(서버 · DB 0) 작은 지도(64×64 칸 · 물 띠 · 다리 둘 · 마을 넷)를 아이 프로세스에 세운다 — 손잡이는 모듈을 읽을 때 정해져 팔마다 아이 하나.
// 실행: node scripts/test-t1503-day-close.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const VF = path.join(ROOT, 'server', 'villages.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const lastJson = (s) => JSON.parse(s.toString().split('\n').filter((l) => l.startsWith('{')).pop());
//   미끼 — 아이가 villages.js 를 바꾼 글자로 싣는다(같은 파일 이름 · 바꾼 자리 수를 센다 · 제품 파일 손 0)
const PRE = `
const __B = process.env.T1503_BAIT ? JSON.parse(process.env.T1503_BAIT) : null;
if (__B) { const M = require('module'), fs = require('fs'), _l = M._extensions['.js'];
  M._extensions['.js'] = function (m, f) { if (f === __B.file) { const s = fs.readFileSync(f, 'utf8'); const n = s.split(__B.a).length - 1; if (n !== 1) { process.stdout.write(JSON.stringify({ baitN: n }) + '\\n'); process.exit(0); } m._compile(s.split(__B.a).join(__B.b), f); return; } return _l(m, f); }; }
`;
const kid = (env, js, bait) => {
  const e = Object.assign({}, process.env, { ENABLE_VILLAGES: '0', T1503_DIST_KEEP: '', T1503_CLOSE_SLICE: '', T698_BOUNDARY_SLICE: '', T731_LOCAL_MIDNIGHT: '0', T1440_ROAD_RULE: '', T598_ROUTE_COST: '' }, env);
  if (bait) e.T1503_BAIT = JSON.stringify(Object.assign({ file: VF }, bait));
  try { return lastJson(execFileSync(process.execPath, ['-e', PRE + js], { env: e, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26, timeout: 120000 })); }
  catch (er) { return { err: String(er.stderr || er.message).slice(-600) }; }
};
const ON1 = { T1503_DIST_KEEP: '1' }, ON2 = { T1503_CLOSE_SLICE: '1' };

// ── 아이 세계 — 64×64 칸(코스 칸 4 → 16×16) · 세로 물 띠 x 28..35 · 가까운 다리 y 30..31 · 먼 다리 y 60..61 · 마을 A(20,30) B(44,30) C(20,4) D(44,56)
//   도랑 둘: 'water' = 물 띠 위 칸(이미 막힘 — 답이 안 바뀐다) · 'ring' = A 둘레 고리(동쪽 문 · 이웃 잇기가 바뀐다)
const WORLD = `
const V=require(${JSON.stringify(VF)}), E=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'))});
const Q=V.__t1503; console.log=()=>{};
const W=64, H=64, BR=new Set(), FAR=new Set(), DT=new Set(); let ditchOn=false;
for(let x=26;x<=37;x++) for(const y of [30,31]) BR.add(x+'_'+y);
for(let x=26;x<=37;x++) for(const y of [60,61]) FAR.add(x+'_'+y);
const wat=(x,y)=>x>=28&&x<=35;
const ta={isWater:(x,y)=>wat(x,y), isBlocked:(x,y)=>x<0||y<0||x>=W||y>=H||(wat(x,y)&&!BR.has(x+'_'+y)&&!FAR.has(x+'_'+y))||(ditchOn&&DT.has(x+'_'+y)), isBridgeCell:(x,y)=>BR.has(x+'_'+y)||FAR.has(x+'_'+y)};
const ev=(name,cx,cy)=>({name,coord:{x:cx*2.5,y:cy*2.5},npcs:[],storage:{},land:{},counts:{}});
const EA=ev('A',20,30), EB=ev('B',44,30), EC=ev('C',20,4), ED=ev('D',44,56);
const world={day:10,villages:[EA,EB,EC,ED],tradeLog:[]};
const ditch=[];
function setDitch(kind){ DT.clear(); ditch.length=0;
  if(kind==='water'){ for(let y=8;y<=14;y++) for(const x of [29,30]) { DT.add(x+'_'+y); ditch.push({cx:x,cy:y}); } }
  if(kind==='ring'){ for(let dx=-3;dx<=3;dx++) for(let dy=-3;dy<=3;dy++){ if(Math.max(Math.abs(dx),Math.abs(dy))!==3) continue; if(dx===3&&Math.abs(dy)<=1) continue; const x=20+dx,y=30+dy; DT.add(x+'_'+y); ditch.push({cx:x,cy:y}); } } }
const vil=(dbId,e)=>({dbId,name:e.name,econ:e,ccx:e.coord.x/2.5,ccy:e.coord.y/2.5,_ditch:dbId===1?ditch:[],npcPids:[],_lonMid:0});
Q.setup({zoneId:'t1503z',econ:Object.assign({},E,{setDistMatrix:(w,m)=>{w._distMatrix=m;}}),villages:[vil(1,EA),vil(2,EB),vil(3,EC),vil(4,ED)],world,_distCtx:{ta,ZONE:{zoneWidth:W*32,zoneHeight:H*32}},
  _distBlk:null,routeCache:new Map(),walkCache:new Map(),ready:true,epoch:Date.now(),dayMs:1000,lastGameDay:0,deps:{}});
const M=()=>JSON.stringify(world._distMatrix.map(r=>r.map(d=>isFinite(d)?+d.toFixed(3):null)));
`;
// 거리 판 — 처음 표 → 도랑 적재(+ 다리 끊김) → 마감 ⑪(다 셀 때까지) · 표 · 메모 참말 · 셈
const DJS = (kind, brk, far) => WORLD + `
setDitch(${JSON.stringify(kind)}); Q.dist('처음'); const M0=M();
${far ? 'Q.setup({dayMs:1e9,epoch:Date.now()});' : ''}
ditchOn=true; Q.ditch(); const st1=Q.st();
${brk ? "for(let x=26;x<=37;x++) for(const y of [30,31]) BR.delete(x+'_'+y); Q.inval();" : ''}
const n=Q.stage(); const st2=Q.st(), M1=M(), ea=Q.edgeAll();
process.stdout.write(JSON.stringify({M0,M1,st1,st2,n,ea,keep:Q.T1503_DIST_KEEP}));`;
// 마감 조각 판 — 가짜 시계(조각이 제 몫만큼 시각을 민다 · 결정론) · 몫 16ms(T687 TB 틱 머리) · 이틀(둘째 날은 지난번 CPU 를 안다)
const CJS = WORLD + `
let T=1e12; const RD=Date; Date.now=()=>T; const TB=require(${JSON.stringify(path.join(ROOT, 'server', 'tick-budget.js'))});
const mk=()=>{ const J=[]; for(let i=0;i<7;i++) J.push({n:'econ',s:'s'+i,f:()=>{T+=3;}}); J.push({n:'roads',f:()=>{T+=40;}}); for(let i=0;i<12;i++) J.push({n:'life',s:'l'+i,f:()=>{T+=3;}}); return J; };
const day=()=>{ const C={now:T,t0:T,stg:{},chunks:0,maxChunk:0,maxChunkAt:'',order:[],vils:[],t731mini:true}; Q.setup({tickCtx:C,tickJobs:mk()}); const fr=[]; let g=0;
  while(Q.setup({}).tickJobs && g++<200){ TB.begin(16); const a=T; Q.drain(T); fr.push(T-a); TB.end(); T+=33; } return fr; };
const d1=day(), d2=day();
// 다음 날이 왔는데 남았다 — 그 틱에 다 닫는다(센다)
Q.setup({tickCtx:{now:T,t0:T,stg:{},chunks:0,maxChunk:0,maxChunkAt:'',order:[],vils:[],t731mini:true},tickJobs:mk(),epoch:T-5000,dayMs:1000,lastGameDay:0});
TB.begin(16); const a=T; const forced=Q.due(T); const fd=T-a; TB.end(); const left=(Q.setup({}).tickJobs||[]).length;
// 몸 결정 얼림 — 닫는 동안 npcLifeTick 이 몸을 안 만진다(손댄 칸 셈)
const touched=[]; const npc=new Proxy({simVillageId:1},{get(t,k){touched.push(String(k)); return t[k];},set(t,k,v){touched.push('set:'+String(k)); t[k]=v; return true;}});
Q.setup({tickJobs:[{n:'x',f:()=>{}}],byDbId:new Map()}); let fz=null; try { fz=V.npcLifeTick(npc,T); } catch(e) { fz='err'; } const tClose=touched.length;
touched.length=0; Q.setup({tickJobs:null}); try { V.npcLifeTick(npc,T); } catch(e) {} const tOpen=touched.length;
process.stdout.write(JSON.stringify({d1,d2,forced,fd,left,fz,tClose,tOpen,st:Q.st(),T698:Q.T698}));`;
// T731 창 꼬리 — 마을을 다 냈는데(`list` 빔) 꼬리 마감이 남았다 · 동쪽 끝 마을이 다음 날로 넘으면 그 틱에 다 닫는다
const TJS = WORLD + `
let T=1e12; Date.now=()=>T;
for (const v of Q.setup({}).villages) v._lonMid=0;
const J=[]; for(let i=0;i<5;i++) J.push({n:'econ',s:'t'+i,f:()=>{T+=10;}});
Q.setup({epoch:T-5500,dayMs:1000,_t731:{D:5,list:[]},tickCtx:{now:T,t0:T,stg:{},chunks:0,maxChunk:0,maxChunkAt:'',order:[],vils:[],t731mini:true},tickJobs:J});
const a1=Q.due(T), n1=(Q.setup({}).tickJobs||[]).length; T+=600; const a2=Q.due(T), n2=(Q.setup({}).tickJobs||[]).length;
process.stdout.write(JSON.stringify({a1,n1,a2,n2,f:Q.st().s.forced}));`;
const mx = (a) => (a && a.length ? Math.max(...a) : null);

console.log('\n=== 첫 하루 마감 · 거리표 · 틱 몫 (T1503) ===');
console.log('\n① 거리표 — 도랑 적재 뒤 표 = 끔(통째로 다시 센 표)');
const R = {};
for (const [k, kind, brk, far] of [['w', 'water', false, true], ['r', 'ring', false, false], ['rf', 'ring', false, true], ['b', 'water', true, true]]) {
  R[k + 'off'] = kid({}, DJS(kind, brk, far));
  R[k + 'on'] = kid(ON1, DJS(kind, brk, far));
  for (const a of ['off', 'on']) if (R[k + a].err) console.log(`  [${k}${a}] ${R[k + a].err}`);
}
{
  const f = R.woff, o = R.won;
  ok(f.M1 === f.M0 && o.M1 === f.M1, '①ⓐ 답을 안 바꾸는 도랑(물 위) — 켬 표 = 끔 표 = 처음 표', `${o.M1 === f.M1}`);
  ok(o.st1 && o.st1.keep === true && o.st1.s.changed === 0 && o.st1.s.rejudged > 0 && o.st2.s.inject === 1, '①ⓐ 켬 = 도랑 둘레만 다시 판정(바뀐 이웃 0) → 같은 표 사본 일(BFS 0) · 주입 1', JSON.stringify(o.st1 && { re: o.st1.s.rejudged, ch: o.st1.s.changed, inj: o.st2.s.inject }));
  ok(f.st1 && f.st1.edgeNodes === 0 && o.st1.edgeNodes > 0, '①ⓐ 끔 = 이웃 잇기 메모 통째 비움(종전) · 켬 = 도랑 둘레 밖 메모가 남는다', `끔 ${f.st1 && f.st1.edgeNodes} · 켬 ${o.st1 && o.st1.edgeNodes}`);
}
{
  const f = R.roff, o = R.ron, g = R.rfon;
  ok(o.st1 && o.st1.s.changed > 0 && o.st1.keep === false, '①ⓑ 답을 바꾸는 도랑(A 둘레 고리) — 바뀐 이웃 > 0 · 사본 일 없음(다시 센다)', `바뀐 이웃 ${o.st1 && o.st1.s.changed}`);
  ok(f.M1 !== f.M0 && o.M1 === f.M1 && g.M1 === f.M1, '①ⓑ 켬 표 = 끔 표(다시 센 표 · 처음 표와 다르다) — 부팅 셈 · 마감 밖 조각 두 길 다', `${o.M1 === f.M1} · ${g.M1 === f.M1}`);
  ok(o.ea && o.ea.n > 0 && o.ea.bad === 0 && g.ea && g.ea.bad === 0, '①ⓑ 켬 메모 칸 = 지금 지형으로 다시 판 답(어긋남 0)', JSON.stringify(o.ea));
  ok(o.st1.job && o.st1.job.ready === true && o.st1.s.boot === 'sync' && g.st1.s.boot === 'bg' && !(g.st1.job && g.st1.job.ready), '①ⓒ 다음 날이 가까우면 부팅 중에 다 센다(주입 앞에서 섬 · 주입은 마감 ⑪) · 멀면 마감 밖 조각(종전)', `${o.st1.s.boot} · ${g.st1.s.boot}`);
  ok(o.M1 !== o.M0 && o.st1 && JSON.stringify(R.ron.M0) === JSON.stringify(R.roff.M0), '①ⓒ 부팅 셈을 해도 주입 전 표는 처음 표 그대로(그 하루 econ 은 옛 표 — 종전과 같은 순간에 바뀐다)', '');
}
{
  const f = R.boff, o = R.bon;
  ok(f.M1 !== f.M0 && o.M1 === f.M1 && o.st2.s.inject === 0, '①ⓓ 사본 일이 서 있는데 다리가 끊겼다 — 옛 표를 안 준다(켬 표 = 끔 새 표 · 사본 주입 0)', `A↔B ${JSON.parse(f.M0)[0][1]} → ${JSON.parse(o.M1)[0][1]}`);
}
console.log('\n② 마감 조각 — 틱 몫 안으로 · 다음 날이 오면 그 틱에 다 닫는다');
const Coff = kid({}, CJS), Con = kid(ON2, CJS);
for (const r of [Coff, Con]) if (r.err) console.log('  ' + r.err);
{
  ok(Con.d1 && Con.d1.length >= 4 && Con.d2.length >= 4, '② 켬 — 한 틱에 다 닫지 않는다(틱 여럿)', `${Con.d1 && Con.d1.length} · ${Con.d2 && Con.d2.length}틱`);
  ok(Con.d2 && mx(Con.d2) <= 40 && mx(Coff.d2) > 40, '② 켬 둘째 날 — 지난번 40ms 조각은 남은 몫이 모자라면 다음 틱 머리로(가장 긴 틱 = 그 조각 하나) · 끔은 몫 + 조각', `켬 ${mx(Con.d2)} · 끔 ${mx(Coff.d2)} ms`);
  ok(Con.forced === true && Con.left === 0 && Con.fd >= 90 && Con.st.s.forced === 1, '② 다음 날이 왔는데 남았다 — 그 틱에 다 닫고 센다(forced 1 · 남은 조각 0)', `forced ${Con.st && Con.st.s.forced} · ${Con.fd}ms`);
}
{
  const t = kid(Object.assign({ T731_LOCAL_MIDNIGHT: '' }, ON2), TJS), t0 = kid({ T731_LOCAL_MIDNIGHT: '' }, TJS);
  if (t.err) console.log('  ' + t.err);
  ok(t.a1 === false && t.n1 === 5 && t.a2 === true && t.n2 === 0 && t.f === 1 && t0.a2 === false && t0.n2 === 5, '② T731 창 꼬리 — 마을을 다 낸 뒤 동쪽 끝 마을이 다음 날로 넘으면 남은 꼬리를 그 틱에 다 닫는다(넘기 전 0 · 끔 0)', JSON.stringify({ on: t, off: t0 }));
}
console.log('\n③ 닫는 동안 몸 결정 얼림 — 닫기 시작한 순간의 값');
ok(Con.T698 === true && Con.fz === true && Con.tClose === 0 && Con.tOpen > 0, '③ 켬 — 마감 중 npcLifeTick 이 몸을 안 만진다(손댄 칸 0) · 마감 밖은 만진다', `마감 중 ${Con.tClose} · 밖 ${Con.tOpen}`);
console.log('\n④ 끔 = main 그대로');
ok(Coff.T698 === false && Coff.tClose > 0 && Coff.forced === false && Coff.st.cost === 0 && Coff.st.perf.length === 0 && R.woff.st1.s.rejudged === 0 && R.roff.st1.s.boot == null && R.woff.st2.s.inject === 0,
  '④ 끔 — 몸 결정 안 얼림 · 다음 날 강제 0 · 조각 CPU 기억 0 · /perf 칸 0 · 도랑 다시 판정 0 · 부팅 셈 0 · 사본 주입 0', JSON.stringify({ T698: Coff.T698, forced: Coff.forced, perf: Coff.st && Coff.st.perf }));
ok(Coff.d1 && JSON.stringify(Coff.d1) === JSON.stringify(Coff.d2) && Coff.d1.length >= 3, '④ 끔 — 조각 담기 = 종전 규칙(이틀이 같은 틱 꼴 · 몫 + 조각)', JSON.stringify(Coff.d1));

console.log('\n⑤ 미끼 — 바꾼 자리 하나씩(빨강을 잡아야 한다)');
const bait = (env, js, a, b) => kid(env, js, { a, b });
{
  const r = bait(ON1, DJS('water', true, true), '  if (T1503_DIST_KEEP) state._t1503Keep = null;   // ★[T1503] 지형이 바뀌었다 — 사본 일 취소(전쌍)\n', '\n');
  ok(r.baitN == null && !r.err && r.M1 !== R.boff.M1, '미끼 ㉠ 바꾼 자리 = 무효화가 사본 일을 안 지우는 사본 → 다리가 끊겼는데 옛 거리를 준다(①ⓓ 빨강)', `A↔B ${r.M1 && JSON.parse(r.M1)[0][1]} ↔ 끔 ${JSON.parse(R.boff.M1)[0][1]}`);
}
{
  const r = bait(ON1, DJS('ring', false, true), '      if (ok !== !!(k0 & (1 << b))) changed++; }', '      if (false) changed++; }');
  ok(r.baitN == null && !r.err && r.M1 !== R.roff.M1, '미끼 ㉡ 바꾼 자리 = 다시 판정한 답이 달라도 "같다"로 세는 사본 → 되살린(사본) 표가 다시 센 표와 다르다(①ⓑ 빨강)', `${r.M1 === R.roff.M1}`);
}
{
  const r = bait(ON2, CJS, '  if (T698_BOUNDARY_SLICE && state.tickJobs) return true;   // ★[T698] 마감 중 마을 몸 결정 얼림', '  if (T698_BOUNDARY_SLICE && state.tickJobs && !T1503_CLOSE_SLICE) return true;   // ★[T698] 마감 중 마을 몸 결정 얼림');
  ok(r.baitN == null && !r.err && r.tClose > 0, '미끼 ㉢ 바꾼 자리 = 나눠 닫되 몸 결정은 안 얼리는 사본 → 닫는 도중 바뀐 값을 읽는다(③ 빨강)', `마감 중 손댄 칸 ${r.tClose}`);
}
{
  const r = bait(ON2, CJS, '_B = (T1503_CLOSE_SLICE && state._t1503Force) ? Infinity', '_B = (T1503_CLOSE_SLICE) ? Infinity');
  ok(r.baitN == null && !r.err && r.d1 && r.d1.length === 1, '미끼 ㉣ 바꾼 자리 = 몫을 안 보는 사본 → 한 틱에 다 닫는다(② 빨강)', `${r.d1 && r.d1.length}틱 · ${mx(r.d1)}ms`);
}
{
  const r = bait(ON2, CJS, " && !(T1503_CLOSE_SLICE && _B !== Infinity && _t1503Late(J[0], _B - (Date.now() - f0))));", ');');
  ok(r.baitN == null && !r.err && mx(r.d2) > 40, '미끼 ㉤ 바꾼 자리 = 지난번 CPU 를 안 보는 사본 → 큰 조각이 몫 끝에서 시작해 틱이 몫 + 조각(② 빨강)', `${mx(r.d2)}ms`);
}
{
  const r = bait({}, CJS, "const T1503_CLOSE_SLICE = process.env.T1503_CLOSE_SLICE === '1';", "const T1503_CLOSE_SLICE = process.env.T1503_CLOSE_SLICE !== '0';");
  ok(r.baitN == null && !r.err && (r.T698 !== false || r.tClose === 0 || r.forced !== false), '미끼 ㉥ 바꾼 자리 = 끔 기본이 켜진 사본(한 글자) → 끔이 main 과 다르다(④ 빨강)', JSON.stringify({ T698: r.T698, forced: r.forced }));
}
{
  const r = bait({}, DJS('water', false, true), '  const _k1503 = T1503_DIST_KEEP ? _t1503Rejudge(D) : null;', '  const _k1503 = _t1503Rejudge(D);');
  ok(r.baitN == null && !r.err && (r.st1.edgeNodes > 0 || r.st1.s.rejudged > 0), '미끼 ㉦ 바꾼 자리 = 끔에서도 도랑 둘레만 다시 판정하는 사본 → 끔 메모가 main 과 다르다(④ 빨강)', `메모 칸 ${r.st1 && r.st1.edgeNodes}`);
}
console.log(`\n결과: ${fail ? 'FAIL' : 'PASS'} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
