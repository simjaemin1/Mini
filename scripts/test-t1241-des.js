#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1241-des.js — 사건 기반 시뮬 시제품(T1241): 낱장 셋 · 손잡이 끔 글자 · 사건 판 ↔ 틱 판 짧은 대조 ===
//
// ★무엇을 보나
//   ① 사건 대기열 — (시각 · 넣은 차례) 차례가 정렬 오라클과 같다 · 같은 시각은 먼저 넣은 것이 먼저(틱 순서 대신 결정론)
//   ② facility — 자리 수 · 대기 줄 차례(요청 시각 · 넣은 차례) · 놓으면 줄 머리가 받는다 · 같은 몸 두 번 줄 안 섬
//   ③ 걸음 토막 — 도착 시각 = Σ 조각 길이 ÷ 그 자리 빠르기 · posAt 은 길 위 · 시각이 오르면 길도 오른다 · 다리 번호
//   ④ 해 몫 사건 시각 — `nextPhaseAt` 이 존 정본(`phaseAdd(worldPhase(t), off)`)으로 문턱을 넘는 첫 시각과 1ms 안에서 같다
//   ⑤ 끔 = 종전 글자 — 존의 사건 갈래 부름 자리가 모두 손잡이 뒤(`T1241_DES` · `T1241_PROBE`)
//   ⑥ 판 — 마을 하나 · 몸 전부 · 3날(가상 시계) 틱 판 ↔ 사건 판: econ 지문(곳간 · 작물 장부 · 인구) 같음 · 사건 갈래가 실제로 몸을 쥐었다(자명 통과 금지)
// 실행: node scripts/test-t1241-des.js   (⑥ 이 판 둘 — 2 ~ 4분) · `--quick` = ① ~ ⑤ 만
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DES = require(path.join(ROOT, 'server', 'des.js'));
const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

console.log('\n=== ① 사건 대기열 ===');
{
  const Q = new DES.EventQueue(); const ref = [];
  for (let i = 0; i < 5000; i++) { const t = Math.floor(rnd() * 300); Q.push(t, i); ref.push([t, i]); }
  ref.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let same = 0; for (let i = 0; i < ref.length; i++) { const e = Q.pop(); if (e.time === ref[i][0] && e.item === ref[i][1]) same++; }
  ok(same === ref.length && Q.size === 0, '꺼낸 차례 = (시각 · 넣은 차례) 정렬', `${same}/${ref.length}`);
  const ties = ref.filter((r, i) => i && ref[i - 1][0] === r[0]).length;
  ok(ties > 1000, '자명 통과 금지 — 같은 시각 사건이 실제로 많다', `같은 시각 ${ties}`);
  const Q2 = new DES.EventQueue(); const got = []; for (let i = 0; i < 50; i++) Q2.push(i % 7, i);
  const n = Q2.runUntil(3, (t, it) => got.push([t, it]));
  ok(n === got.length && got.every((g, i) => !i || got[i - 1][0] < g[0] || (got[i - 1][0] === g[0] && got[i - 1][1] < g[1])) && got.every((g) => g[0] <= 3) && Q2.peekTime() === 4, 'runUntil — 시각 ≤ 끝 만 · 차례대로', `${n}건`);
}

console.log('\n=== ② facility(서버 수 + 대기 줄) ===');
{
  const F = new DES.Facility('곳간 문', 2);
  const a = F.request('a', 10), b = F.request('b', 11), c = F.request('c', 12), d = F.request('d', 12), c2 = F.request('c', 13);
  ok(a && b && !c && !d && !c2 && F.q.length === 2, '자리 둘 — 셋째부터 줄 · 같은 몸 두 번 줄 안 섬', `줄 ${F.q.map((e) => e.who).join(',')}`);
  const n1 = F.release('a'), n2 = F.release('b');
  ok(n1 === 'c' && n2 === 'd' && F.busy.has('c') && F.busy.has('d') && !F.q.length, '놓으면 줄 머리가 받는다(요청 시각 · 넣은 차례)', `${n1} → ${n2}`);
  const G = new DES.Facility('밭 칸', 1); G.request('x', 5); G.request('z', 9); G.request('y', 7);
  ok(G.release('x') === 'y' && G.queuePos('z') === 1, '줄은 요청 시각 차례(넣은 차례가 아니다)', '');
}

console.log('\n=== ③ 걸음 토막 ===');
{
  const pts = [0, 0, 100, 0, 100, 50, 30, 50];
  const r = new DES.Route(pts, () => 50, 1000, 16);
  ok(Math.abs(r.t1 - (1000 + (100 + 50 + 70) / 50 * 1000)) < 1e-6 && Math.abs(r.len - 220) < 1e-9, '고른 빠르기 — 도착 = 출발 + 길이 ÷ 빠르기', `${r.t1.toFixed(3)}`);
  let mono = true, onPath = true, prevS = -1; const o = {};
  for (let t = 1000; t <= r.t1 + 100; t += 37) {
    r.posAt(t, o);
    const s = o.y === 0 ? o.x : (o.x === 100 ? 100 + o.y : 150 + (100 - o.x));
    if (!(o.y === 0 || o.x === 100 || o.y === 50)) onPath = false;
    if (s < prevS - 1e-9) mono = false; prevS = s;
  }
  ok(mono && onPath, 'posAt — 길 위 · 시각이 오르면 길도 오른다', '');
  r.posAt(1000 + 2500, o); const k2 = r.L[o.k + 1];
  ok(k2 === 2 && Math.abs(o.x - 100) < 1e-9 && Math.abs(o.y - 25) < 1e-9, '다리 번호 — 2.5초 = 둘째 다리 가운데', `다리 ${k2} · (${o.x}, ${o.y})`);
  r.posAt(1100, o); const back = o.x;
  ok(Math.abs(back - 5) < 1e-9, '시각이 되돌아가도 커널은 처음부터 다시 찾는다', `x ${back}`);
  const slow = new DES.Route([0, 0, 64, 0, 128, 0], (x) => (x < 64 ? 64 : 32), 0, 16);
  ok(Math.abs(slow.t1 - (1000 + 2000)) < 1e-6, '칸마다 빠르기 — 앞 64px 64px/s · 뒤 64px 32px/s = 3초', `${slow.t1}`);
}

console.log('\n=== ④ 해 몫 사건 시각 = 존 정본 문턱 ===');
{
  const L = ZC.WORLD.dayLengthMs, E = ZC.WORLD.worldEpoch;
  const fv = (t, off) => ZC.phaseAdd(ZC.worldPhase(t), off);
  let good = 0, N = 2000, worst = 0;
  for (let i = 0; i < N; i++) {
    const now = 1767225600000 + Math.floor(rnd() * L * 50), off = rnd() * 1.5 - 0.75, target = [0.7, 0.03 * rnd(), 0.7 * 0.501, 0.7 * 0.137][i % 4];
    const t = DES.nextPhaseAt(now, E, L, off, target);
    // 정본으로 문턱 넘는 첫 ms 를 찾는다(t 앞뒤 3ms)
    let first = null; for (let u = Math.floor(t) - 3; u <= Math.floor(t) + 3; u++) { const a = fv(u - 1, off), b = fv(u, off); const crossed = (a < target && b >= target) || (a > b && b >= target && target < a); if (crossed) { first = u; break; } }
    if (first != null && Math.abs(first - t) <= 1 && t > now) good++;
    if (first != null) worst = Math.max(worst, Math.abs(first - t));
  }
  ok(good === N, 'nextPhaseAt — 정본 fv 가 문턱을 넘는 첫 ms 와 1ms 안(+1ms 를 더해 넘은 첫 틱을 연다)', `${good}/${N} · 가장 먼 ${worst.toFixed(3)} ms`);
}

console.log('\n=== ⑤ 끔 = 종전 글자 ===');
{
  const z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8').split('\n');
  //   부르는 자리(함수 몸 밖)는 손잡이 문 뒤에만 있어야 한다 — 함수 몸 안의 부름은 그 함수가 손잡이 뒤에서만 불린다.
  const sites = z.filter((l) => /^\s{4}if \(T1241_DES && npc\._des && _desHold|^\s{4}if \(T1241_DES\) _desTry|^\s{4}if \(T1241_PROBE && _desClk\) \{ _desTimed|^\s{2}if \(T1241_DES && p\._des\) return;|^\s{6}if \(p\.simWar \|\| \(T1241_DES && p\._des\)\) continue;|^\s{2}if \(_T1241\) \{ .*_desStat\.ticks\+\+/.test(l));
  ok(sites.length === 6, '부르는 자리 여섯이 모두 손잡이 뒤(결정 문 셋 · 걸음 문 둘 · 틱 끝 하나)', `${sites.length}`);
  ok(/const T1241_DES = process\.env\.T1241_DES === '1' \|\| process\.env\.T1241_DES === 'sleep';/.test(z.join('\n')) && /const _DES = T1241_DES \? require\('\.\/des'\) : null;/.test(z.join('\n')), '손잡이 끔 기본(`=== \'1\'`) · 모듈은 켬에서만 싣는다', '');
}

console.log('\n=== ⑦ T1248 작업 구간 · 대기열 · 재시작 ===');
{
  const { WorkSpan, BodyQueue, Store } = require('../server/des-work');
  const entries = new DES.Route([-80,0,80,0],()=>32,0,16).cellEntries(32);
  ok(entries.map(e=>e.cx).join(',') === '-2,-1,0,1,2' && entries.every(e=>(e.x/32|0)===e.cx), '답압은 셀 진입만 · 음수 셀도 같은 키');
  const w = new WorkSpan({ start: 100, progress: 10, target: 110, rate: 2 });
  ok(w.end === 150 && w.at(125) === 60 && w.at(200) === 110, '일 끝 = 남은 양 / 몸 빠르기 · 완료 이상 진척 없음');
  ok(w.cut(120) === 50 && w.end === 150, 'AOI/부상/밤 끊김은 그 순간까지 진척만 남긴다');
  const stopped = new WorkSpan({ start: 120, progress: 50, target: 110, rate: 0 });
  ok(stopped.end === Infinity && stopped.at(200) === 50, '막힌 동안 진척 0');
  let rejected = false; try { new WorkSpan({ start: 0, target: 10, rate: -1 }); } catch (e) { rejected = true; }
  ok(rejected, '음수 빠르기 거부');
  const q = new BodyQueue(), actors = new Map([['a', {}], ['b', {}], ['c', {}]]), order = [];
  for (const [id, body] of actors) q.add(id, body);
  q.hold('b', actors.get('b'), 100, { kind: 'ore' }); q.hold('a', actors.get('a'), 100, { kind: 'clear' });
  ok(q.ready.size === 1 && q.owned.size === 2, '사건 몸은 틱용 awake 집합에서 빠진다');
  q.cancel('a'); q.hold('a', actors.get('a'), 90, { kind: 'crop' });
  q.run(100, id => actors.get(id), (b, st, at) => order.push([st.kind, at]));
  ok(JSON.stringify(order) === JSON.stringify([['crop',90],['ore',100]]) && q.stats.stale === 1, '취소된 이전 사건은 몸을 다시 깨우지 않는다');
  const tie = new BodyQueue(), ids = []; tie.hold('b', {}, 1, { id: 1 }); tie.hold('a', {}, 1, { id: 2 });
  tie.run(1, id => actors.get(id), (b, st) => ids.push(st.id)); ok(ids.join(',') === '1,2', '동시 사건 = 사건 id(넣은 차례) 순');
  const f = new BodyQueue();
  for (const kind of ['clear','crew','crop','granary','artisan']) {
    ok(f.request('a',kind,1,5) && !f.request('b',kind,1,6), kind + ' 자원: 하나만 허용 · 둘째는 FIFO 줄');
    ok(f.release('a') === 'b', kind + ' 자원: 반납 때 줄 머리가 받는다'); f.release('b');
  }
  const side = new BodyQueue(), effects=[];side.hold('a',actors.get('a'),100,{kind:'walk'});side.side('a',50,{kind:'road'});side.run(60,id=>actors.get(id),()=>effects.push('wake'),(b,s)=>effects.push(s.kind));ok(effects.join(',')==='road'&&side.owned.has('a'),'답압 보조 사건은 몸을 틱 갈래로 깨우지 않는다');
  const save = new BodyQueue(); save.request('a','crop:1',1,5); save.request('b','crop:1',1,6); save.hold('a',actors.get('a'),200,{kind:'crop'});
  const snap = save.save(); save.cancel('a'); const restored = BodyQueue.restore(snap);
  ok(restored.owned.has('a') && restored.facilities.get('crop:1').queuePos('b') === 1, '저장 사본은 원본 취소와 독립 · FIFO 차례 유지');
  const { DatabaseSync } = require('node:sqlite'), db = new DatabaseSync(':memory:'), store = new Store(db,'test');
  store.save(restored,[{id:'a',progress:60}]); const disk = store.load(), again = BodyQueue.restore(disk.queue);
  ok(again.owned.get('a').time === 200 && disk.bodies[0].progress === 60, 'DB에 사건·줄·몸 진척을 같은 행으로 저장/재기동');
  const out = []; again.run(200,()=>null,()=>out.push('bad'));
  ok(out.length === 0 && again.owned.has('a'), '아직 바인딩 안 된 재시작 몸을 고아로 지우지 않는다');
  again.heap.push(200,{id:'a',generation:again.owned.get('a').generation}); again.run(200,id=>actors.get(id),()=>out.push('ok'));
  ok(out.join(',') === 'ok', '몸이 다시 붙으면 완료 사건 한 번');
  again.hold('c', actors.get('c'), 300, {kind:'transport'}); again.remove('c'); again.run(400,id=>actors.get(id),()=>out.push('dead'));
  ok(!out.includes('dead'), '사건 사이 죽음/존 이동은 취소 · 뒤에 효과 없음'); db.close();
  const prevMode=process.env.T1241_DES;process.env.T1241_DES='1';
  const V=require('../server/villages'),H=V.__p3Bind({});H.state.dayMs=1440000;H.state.byDbId=new Map([[1,{dbId:1}]]);
  const body={pid:'fixture',simVillageId:1,x:0,y:0,vx:0,vy:0,_lifeAct:'개간',simJob:'farmer',_lifeTask:{k:'clear',cx:0,cy:0,px:0,py:0,prog:10}};
  const plan=V.t1248WorkPlan(body,100);V.t1248SettleWork(body,plan,150,100);
  ok(plan.kind==='clear'&&body._lifeTask.prog===60&&body._workT===150,'실제 개간 진척은 완료 함수에 복제하지 않고 한 번 정산');
  body._lifeAct='취침';ok(V.t1248WorkPlan(body,200)===null,'밤에는 남은 개간 일을 사건으로 계속하지 않는다');
  body._lifeTask=null;body._lifeAct='수확';body._jobT=500;body.targetX=0;body.targetY=0;
  const crop=V.t1248WorkPlan(body,200);const other=V.t1248WorkPlan({...body,pid:'other'},200);ok(crop.key!==other.key,'셀을 모르는 농부 둘을 공통 dwell 키에 가두지 않는다');ok(crop.kind==='crop'&&crop.precommitted&&crop.target===300,'수확은 기존 시작 반영/체류 구조임을 명시(완료 반영으로 위장하지 않음)');
  body._jobT=0;body._lifeAct='채광';body._t724T=100;body._t724Site={cx:1,cy:2};
  const ore=V.t1248WorkPlan(body,200);ok(ore.kind==='ore'&&ore.target===require('../server/specialty').MINE_SWING_MS,'원석 타수 시간은 광맥 정본을 그대로 읽는다');
  if(prevMode===undefined)delete process.env.T1241_DES;else process.env.T1241_DES=prevMode;
  const z = fs.readFileSync(path.join(ROOT,'server/zone.js'),'utf8');
  ok(z.includes(': (_desQ ? _desTickIds : npcs);') && z.includes('_desIds.forEach') && z.includes('(_desQ ? _desBodies : players).forEach(_moveOne)'), '존의 결정/이동 고리가 사건 소유 몸을 열거하지 않는다');
}

console.log('\n=== ⑧ 존의 실제 넘김 함수 — 격리된 어댑터 검사 ===');
{
  // 실제 함수 본문을 실행한다. 네트워크/전체 세계 재시작 증명과는 구분한다.
  const vm=require('vm'), {BodyQueue}=require('../server/des-work');
  const z=fs.readFileSync(path.join(ROOT,'server/zone.js'),'utf8');
  const fn=name=>{const start=z.indexOf('function '+name+'('),end=z.indexOf('\nfunction ',start+1);if(start<0||end<0)throw Error('missing '+name);return z.slice(start,end);};
  let day=1,now=150,reads=0;const players=new Map(),settled=[];
  const get=players.get.bind(players);players.get=id=>{reads++;return get(id);};
  const c={process:{env:{}},Date:{now:()=>now},Map,Set,Number,Math,
    players,npcs:new Set(['a']),buildings:new Map(),activeChunkKeys:new Set(),
    _desQ:new BodyQueue(),_desBodies:new Map(),_desTickIds:new Set(),_desPending:new Map(),
    _desSaved:null,_desView:'',_desDay:1,_desClk:null,_desTmp:{},T1145_XY_COLS:false,
    _desStat:{end:{due:0,intr:0},intrWhy:{},workMs:0,walkMs:0,sleepMs:0,restMs:0},
    _DW:{BodyQueue},_DES:DES,_t670Stuck:()=>{},Roads:{stampEntityPx:()=>{}},
    SimVillages:{econDay:()=>day,t1248SettleWork:(b,w,t,start)=>settled.push([b.pid,t,start])}};
  vm.createContext(c);
  for(const name of ['_desWatch','_desApplySaved','_desRestore','_desPut','_desEnd','_desPulse'])vm.runInContext(fn(name),c);
  const actor=id=>({pid:id,isNpc:true,x:0,y:0,hp:100,behavior:'wander',handingOff:false});
  const hold=(b,until=200)=>{b._des={k:'work',t0:100,until,work:{kind:'clear'}};players.set(b.pid,b);c._desQ.hold(b.pid,b,until,{});};
  const a=actor('a');hold(a);c._desQ.request('a','clear:1',1,90);c._desQ.request('b','clear:1',1,95);
  c.activeChunkKeys.add('observer-aoi');c._desPulse(now);
  ok(!a._des&&c._desTickIds.has('a')&&settled.at(-1)[1]===150,'AOI 변경은 실제 pulse에서 부분 정산 후 틱 집합으로 넘긴다');
  ok(c._desQ.facilities.get('clear:1').queuePos('b')===1&&c._desQ.tickets.get('a')==='clear:1','AOI 넘김 자체가 기존 FIFO 표를 재발급하지 않는다');
  hold(a,300);c._desWatch(a);now=175;a.hp=90;
  ok(!a._des&&settled.at(-1)[1]===175,'실제 hp setter가 사건 사이 부상을 즉시 정산한다');
  hold(a,300);now=180;a.handingOff=true;
  ok(!a._des&&settled.at(-1)[1]===180,'존 넘김 setter가 남은 일을 취소한다');
  a.handingOff=false;hold(a,300);day=2;now=190;c._desPulse(now);
  ok(!a._des&&c._desStat.intrWhy.boundary===2,'econ/철 경계 알림이 소유 몸을 틱으로 돌린다');
  c._desQ=new BodyQueue();reads=0;for(let i=0;i<50;i++)c._desPulse(195);
  ok(reads===0,'기한/경계가 없는 pulse 50회는 몸 Map 조회 0');
  const r=new DES.Route([0,0,100,0],()=>100,1000,16);a._des={k:'walk',t0:1000,until:2000,r,P:[{},{}],pi:0};c._desQ.hold('a',a,2000,{});now=1500;
  const anchor="  for (const op of ['set', 'delete']) { const original = buildings[op].bind(buildings);";
  const line=z.split('\n').find(l=>l.startsWith(anchor));if(!line)throw Error('missing building invalidation');vm.runInContext(line,c);c.buildings.set('wall',{});
  ok(!a._des&&Math.abs(a.x-50)<1e-9,'건물 변경은 실제 무효화 어댑터에서 걸음을 보간하고 끊는다');
  const q=new BodyQueue();q.hold('a',a,2000,{});q.request('a','crop:1',1,10);q.request('b','crop:1',1,11);
  c._desSaved={queue:q.save(),bodies:[{id:'a',x:25,y:0,_des:{k:'walk',t0:1000,until:2000,r:JSON.parse(JSON.stringify(r)),P:[{},{}],pi:0}}]};c._desRestore();
  ok(a._des.r instanceof DES.Route&&c._desQ.owned.has('a')&&!c._desTickIds.has('a')&&c._desQ.facilities.get('crop:1').queuePos('b')===1,'존 복원 함수가 Route 원형·소유권·FIFO 차례를 복구한다');
}

if (!process.argv.includes('--quick')) {
  console.log('\n=== ⑥ 판 — 마을 하나 · 몸 전부 · 3날 · 틱 ↔ 사건 ===');
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 't1241-'));
  const run = (mode) => {
    const env = Object.assign({}, process.env, {
      NODE_OPTIONS: `--require ${path.join(ROOT, 'scripts', 't1241-hook.js')} --require ${path.join(ROOT, 'scripts', 't745-vclock.js')} --require ${path.join(ROOT, 'scripts', 'server-baseline-check.js')}`,
      T745_VCLOCK: '1', T1241_PROBE: '1', T1241_OUT: path.join(tmp, mode), T1241_DES: mode === 'tick' ? '0' : '1', T1241_DES_QUEUE: mode === 'des' ? '0' : '1', SBC_HOOK: '1',
      VILLAGE_MAX: '1', VILLAGE_DAY_MS: '1440000', VILLAGE_NPC_CAP: 'Infinity', T577_DIR: path.join(tmp, 'runs-' + mode), T577_PAR: '1' });
    spawnSync(process.execPath, [path.join(ROOT, 'scripts', 't577-server-run.js'), '3', '1020'], { env, cwd: ROOT, stdio: 'ignore', timeout: 900000 });
    try { const rows=fs.readFileSync(path.join(tmp, `${mode}.1020.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((o) => o.d != null && o.d >= 0); rows.sbc=JSON.parse(fs.readFileSync(path.join(tmp,'runs-'+mode,'base-1020.json.sbc.json'),'utf8')).days; return rows; } catch (e) { return []; }
  };
  const A = run('tick'), B = run('des');
  ok(A.length >= 2 && B.length === A.length, '두 판 다 날마다 줄을 남겼다', `틱 ${A.length} · 사건 ${B.length}`);
  const same = A.filter((a, i) => B[i] && a.d === B[i].d && a.sto === B[i].sto && a.crop === B[i].crop && a.pop === B[i].pop && a.farm === B[i].farm).length;
  ok(A.length && same === A.length, 'econ 지문 날마다 같음(곳간 정확 지문 · 작물 장부 · 인구 · 밭 칸)', `${same}/${A.length}`);
  const lb = B[B.length - 1] || { st: {} }, la = A[A.length - 1] || { st: {} };
  ok((lb.st.held || 0) > 0 && (lb.st.begin && lb.st.begin.sleep > 0) && (lb.st.steps || 0) < (la.st.steps || 0), '자명 통과 금지 — 사건 갈래가 몸을 실제로 쥐었다(잠 토막 · 걸린 npcStep 이 줄었다)', `쥔 몸-틱 ${lb.st.held || 0} · npcStep ${la.st.steps || 0} → ${lb.st.steps || 0}`);
  ok((la.st.held || 0) === 0, '틱 판(끔)은 사건 갈래가 몸을 안 쥔다', `${la.st.held || 0}`);
  const C = run('queue'), cq = C[C.length-1] || {st:{}};
  ok(A.sbc && A.sbc.length===3 && JSON.stringify(A.sbc)===JSON.stringify(C.sbc), 'T1248 힙 판 — 공식 곳간/사람/집/금고 지문 3일 일치');
  ok((cq.st.enqueued||0)>0 && (cq.st.holdChecks||0)===0 && (cq.st.steps||0)<(la.st.steps||0), 'T1248 사건 몸은 틱별 hold 검사 0 · 힙 깨움만');
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
