#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-build-act.js — 집도 행위다 1층 (T400) ======================================
//
// ★왜 [지시 T400 · T361 설계 표 넷 · 재민 #51 ⓐ "집도 행위" · PM 권고 #61(서버 `HUT_STAGES` 정본)·#62(크루 그대로)]
//   *"크루가 곳간에서 자재를 손에 들고 집터로 걸어가 놓는 순간 단계가 오른다."* 이 하네스가 지키는 조각:
//     ⓐ 정본 하나   — 집 자재는 `server/hut-stages.js` 한 표다. zone(플레이어 움집)·econ(마을 수요)·하네스가 **그 표를 읽는다**
//                     (표 한 줄을 바꾸면 econ 이 따라온다 — 사본이면 안 따라온다 · 이 하네스가 실제로 바꿔 본다)
//     ⓑ 곳간 → 손   — 꺼내는 것은 econ 정본 한 함수(`actFromGranary` = `actToGranary` 의 역)이고, 손(`inventory`)은 날을 넘겨 들지 않는다
//     ⓒ 놓는 순간   — `_lifeAdvanceSite` 는 **자재가 찬 순간에만** 불린다(곳간이 비면 단계가 안 오른다)
//     ⓓ 걸음·짐     — 한 짐 = `carry.CAP_KG ÷ weights.kgOf`(통나무 8 · 나무꾼 `_t341TreesPerLoad` 와 같은 수) · 통나무 22 = 3짐
//     ⓔ 시공 그대로 — 하루 전진 = `min(LIFE_CREW, 인구) × LIFE_STAGE_PDAY`(헤드리스 절과 같은 수)
//     ⓕ 헤드리스 0  — 켬이면 `_lifeHeadlessDay` 집 절이 **안 돈다**(호출 0 · 이중 진척 0)
//     ⓖ 관측자 무관 — 관측자 0 팔 ↔ 1 팔 집 수·단계 시각 **비트 동일**(끈 판은 갈린다 — 미끼)
//     ⓗ 주사위 0    — `Math.random` 을 던지게 바꿔도 하루가 돈다
//   그리고 **끄면 비트 동일**(손잡이 규약 — 3시드 800일은 보고가 댄다 · 여기는 끈 판 문이 하나도 안 열리는지).
//
// ⚠존을 부팅하지 않는다 — 존·villages 소스는 **글자로**(정적), 함수는 **불러서**(기능 · `__labProbe._t400Probe` 최소 주입구).
//   켠 판은 자식 프로세스에서 잰다(env 는 모듈 적재 때 읽힌다 — `test-wood-act.js` 의 `probe` 문법).
//
// 실행: node scripts/test-build-act.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
const fnBody = (src, name) => {   // `function name(` 부터 다음 최상위 `function ` 전까지(주석 제거본)
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const j = src.indexOf('\nfunction ', i + 10);
  return codeOf(src.slice(i, j < 0 ? src.length : j));
};
const probe = (env, js) => JSON.parse(execFileSync(process.execPath, ['-e', js],
  { env: Object.assign({}, process.env, { ENABLE_VILLAGES: '0' }, env), stdio: ['ignore', 'pipe', 'pipe'] }).toString().split('\n').filter((l) => l.startsWith('{') || l.startsWith('[')).pop());
const EP = JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'));
const VP = JSON.stringify(path.join(ROOT, 'server', 'villages.js'));
const HP = JSON.stringify(path.join(ROOT, 'server', 'hut-stages.js'));

// 자식 프로세스에 심는 작은 세계 — 마을 하나 · 곳간 하나 · 집터 하나(stage 1 = ①굴착을 마친 터 · 기존 그대로).
//   값은 전부 정본 함수가 정한다. 여기 적은 수는 **세계의 배치**(좌표·재고·명부)뿐이다.
const WORLD = (opt) => `
const V=require(${VP}), E=require(${EP}), P=V.__labProbe._t400Probe;
const players=new Map(); const jobs=${JSON.stringify(opt.jobs || ['fisher', 'farmer', 'lumberjack'])};
jobs.forEach((j,i)=>players.set('n'+i,{pid:'n'+i,simJob:j,inventory:${JSON.stringify(opt.inv || {})}}));
const DAY=600000; let now=DAY*10+1;
const db={insertVillageBuilding(){return 1},updateBuildingData(){},deleteBuilding(){},db:{prepare:()=>({run(){}})}};
P.setup({deps:{players,moveSpeed:120,dayPhaseRatio:0.7,broadcast(){},liveBuildRow:null,anyViewerNear:()=>${opt.near ? 'true' : 'false'}},db,dayMs:DAY,epoch:0,zoneId:'t',tickCtx:{get now(){return now}}});
const mk=(id,wood)=>({dbId:id,name:'마'+id,ccx:100,ccy:100,npcPids:[...players.keys()],econ:{storage:{wood}},_granList:[{cx:110,cy:100}],
  _site:{cx:104,cy:112,stage:1,bo:null},_houseCells:[],housesPx:[],_terrSet:new Set(),_farmSet:new Set(),_crop:new Map()});
`;

console.log('\n=== 집도 행위다 1층 (T400) ===');

// ── ① 자재 정본 하나 ───────────────────────────────────────────────────────────
console.log('\n① 자재 정본 하나 — `server/hut-stages.js`');
{
  const H = require(path.join(ROOT, 'server', 'hut-stages.js'));
  ok(H.HUT_STAGES.length === 4 && H.HUT_STAGES[1].need.pillar === 6 && H.HUT_STAGES[2].need.rafter === 8 && H.HUT_STAGES[2].need.fiber === 6 && H.HUT_STAGES[3].need.thatch === 8,
    '① 공정 표 그 수 — 기둥 6 · 서까래 8·풀 6 · 이엉 8(T361 §1)');
  ok(JSON.stringify(H.hutRaw()) === JSON.stringify({ wood: 22, fiber: 38 }), '① 원자재 = 통나무 22 · 풀 38(레시피로 **유도** · T361 §ⓐ)', JSON.stringify(H.hutRaw()));
  ok(/const HutStages = require\('\.\/hut-stages'\)/.test(ZSRC) && /const HUT_STAGES = HutStages\.HUT_STAGES;/.test(ZSRC) && /const PSITE_COST = HutStages\.PSITE_COST;/.test(ZSRC),
    '① ★zone(플레이어 움집)이 **그 표를 읽는다**(사본 0)');
  ok(!/const HUT_STAGES = \[/.test(codeOf(ZSRC)) && !/pillar:\s*\{\s*from:\s*\{\s*wood:\s*3\s*\}/.test(codeOf(ZSRC)), '① zone 에 옛 표 글자가 **남지 않았다**');
  ok(/require\('\.\.\/server\/hut-stages'\)/.test(SRC), '① ★econ 도 **그 표를 읽는다**(`_hutStages` 게으른 적재 · 번들은 `build-econ-bundle` 이 싣는다)');
  const B = fs.readFileSync(path.join(ROOT, 'sim', 'build-econ-bundle.js'), 'utf8');
  ok(/rd\('server\/hut-stages\.js'\)/.test(B) && /rd\('server\/village-layout\.js'\)/.test(B), '① 브라우저 번들이 표와 정원을 싣는다(랩이 같은 수를 본다)');
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  ok(E.T400_BUILD_ACT === false, '① ★★기본이 **끔**이다', String(E.T400_BUILD_ACT));
  ok(E.houseCostPerCap('wood') === E.HOUSE_WOOD && E.houseCostPerCap('stone') === 2.5, '① ★끈 판 단가 = 종전 상수 그대로(`HOUSE_WOOD` · `HOUSE_STONE` — 대조 자로 남는다)');
  ok(/const HOUSE_STONE = 2\.5/.test(SRC), '① `HOUSE_STONE` 은 지우지 않았다(대조 자 · 카드 ①)');
  const on = probe({ T400_BUILD_ACT: '1' },
    `const E=require(${EP});process.stdout.write(JSON.stringify({k:E.T400_BUILD_ACT,m:E.hutEconMaterials(),s:[0,1,2,3].map(E.hutEconStage),n:E.hutStageCount(),cap:E.hutCapPerHut(),w:E.houseCostPerCap('wood'),st:E.houseCostPerCap('stone')}));`);
  ok(on.k === true && JSON.stringify(on.m) === '{"wood":22}', '① 켜면 econ 집 자재 = 표의 econ 재화만(통나무 22 · 풀은 econ 재화가 아니다)', JSON.stringify(on.m));
  ok(JSON.stringify(on.s) === '[{},{"wood":18},{"wood":4},{}]' && on.n === 4, '① 단계별 = [0 · 18 · 4 · 0](기둥 6×3 · 서까래 8÷2)', JSON.stringify(on.s));
  ok(on.cap === 6 && Math.abs(on.w - 22 / 6) < 1e-12 && on.st === 0, '① 켜면 단가 = 표 ÷ 정원(22÷6 · 석재 0 — 집에서 석재 수요가 사라진다)', `${on.w.toFixed(4)} · ${on.st}`);
  //   ★표 한 줄을 바꾸면 따라오나 — 자식에서 표를 고쳐 본다(사본이면 안 따라온다)
  const mut = probe({ T400_BUILD_ACT: '1' },
    `const H=require(${HP});H.HUT_STAGES[1].need.pillar=7;H.HUT_STAGES[1].need.stone=5;const E=require(${EP});process.stdout.write(JSON.stringify({m:E.hutEconMaterials(),s1:E.hutEconStage(1),st:E.houseCostPerCap('stone')}));`);
  ok(mut.m.wood === 25 && mut.s1.wood === 21 && mut.s1.stone === 5 && Math.abs(mut.st - 5 / 6) < 1e-12,
    '① ★★표 한 줄(기둥 7 · 석재 5)을 바꾸면 econ 이 **따라온다** — 사본 0 의 기능 증명', JSON.stringify(mut));
}

// ── ② 행위 1층 ─────────────────────────────────────────────────────────────────
console.log('\n② 행위 1층 — 곳간 → 손 → 걸음 → 집터');
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const v = { storage: { wood: 50 } };
  ok(E.actFromGranary(v, 'wood', 8) === 0 && v.storage.wood === 50, '② ★끈 판 `actFromGranary` 는 **한 톨도 안 꺼낸다**');
  ok(E.buildActOn({ _t400Live: true }) === false, '② 끈 판은 `_t400Live` 가 있어도 추상 차감을 **안 끈다**');
  const r = probe({ T400_BUILD_ACT: '1' }, WORLD({}) + `
const vil=mk(1,100); const d1=P.buildDay(vil); const st1=vil._site?vil._site.stage:null; const w1=vil.econ.storage.wood;
now+=DAY; const d2=P.buildDay(vil);
const hands=[...players.values()].map(p=>p.inventory.wood||0);
process.stdout.write(JSON.stringify({pl:P.perLoad('wood'),tl:P.treesPerLoad(1),crew:P.LIFE_CREW,pd:P.LIFE_STAGE_PDAY,d1,st1,w1,d2,w2:vil.econ.storage.wood,houses:vil._houseCells.length,site:vil._site,log:vil._t400Log,live:vil.econ._t400Live,hands,sum:vil._t400Sum,cons:vil.econ.flowCons||null}));`);
  ok(r.pl === 8 && r.pl === r.tl, '② ★한 짐 = 통나무 8(`CAP_KG ÷ kgOf(wood)`) — 나무꾼 `_t341TreesPerLoad` 와 **같은 수**', `${r.pl} · ${r.tl}`);
  ok(r.d1.crew === Math.min(r.crew, 3) && r.d1.trips === 3 && r.d1.took === 22, '② ★첫날 — 크루 2 가 **3짐**(8·8·6 = 22)을 날랐다(T361 §ⓑ "3짐")', `trips ${r.d1.trips} · took ${r.d1.took}`);
  ok(r.w1 === 78, '② 곳간(econ 재고)이 나른 만큼 줄었다 100 → 78');
  ok(r.d1.adv === r.crew * r.pd && r.st1 === 3, '② ★시공 그대로 — 첫날 전진 = 크루 × `LIFE_STAGE_PDAY` = 2 (단계 1→3)', `adv ${r.d1.adv} · stage ${r.st1}`);
  ok(r.d2.adv === 1 && r.houses === 1 && r.site === null, '② 둘째 날 ④이엉(econ 자재 0)을 올려 **완공**(집 1 · 집터 없음)');
  ok(r.w2 === 78 && r.d2.trips === 0, '② 둘째 날은 나를 것이 없다(남은 통나무 0 — 첫날 짐을 꽉 채워 들었다)');
  ok(JSON.stringify(r.hands) === '[0,0,0]', '② ★손은 날을 넘겨 들지 않는다(놓으면 빈다 — 나무꾼 절이 곳간에 **다시** 넣는 일 0)', JSON.stringify(r.hands));
  ok(r.live === true, '② 켠 마을은 econ 에 `_t400Live` 를 남긴다(추상 차감을 끄는 한 비트)');
  ok(r.sum && r.sum.days === 2 && r.sum.trips === 3 && r.sum.took === 22 && r.sum.adv === 3, '② 누계(계측 전용 · `/lifedbg` `t400`)가 장부와 맞다', JSON.stringify(r.sum && { d: r.sum.days, t: r.sum.trips, k: r.sum.took, a: r.sum.adv }));
  ok(r.d1.jobs && r.d1.jobs.fisher === 1 && r.d1.jobs.farmer === 1, '② ★직업 무관 — 명부 앞 두 사람(어부·농부)이 지었다(`builder` 0 · #62)', JSON.stringify(r.d1.jobs));
  // 들고 있던 것은 그대로 — 행위는 제가 든 만큼만 더하고 뺀다
  const r2 = probe({ T400_BUILD_ACT: '1' }, WORLD({ inv: { wood: 5 } }) + `
const vil=mk(1,100); P.buildDay(vil); process.stdout.write(JSON.stringify({hands:[...players.values()].map(p=>p.inventory.wood)}));`);
  ok(JSON.stringify(r2.hands) === '[5,5,5]', '② 나무꾼이 들고 있던 통나무는 **건드리지 않는다**(더한 만큼 뺀다)', JSON.stringify(r2.hands));
  // ⓒ 놓는 순간 — 곳간이 비면 단계가 안 오른다
  const r3 = probe({ T400_BUILD_ACT: '1' }, WORLD({}) + `
const a=mk(1,0); const da=P.buildDay(a); const b=mk(2,10); const db2=P.buildDay(b);
process.stdout.write(JSON.stringify({sa:a._site.stage,da,wa:a.econ.storage.wood,sb:b._site.stage,db:db2,wb:b.econ.storage.wood,mb:b._site.mat}));`);
  ok(r3.sa === 1 && r3.da.adv === 0 && r3.da.stall === 1 && r3.wa === 0, '② ★★곳간이 비면 **단계가 안 오른다**(자재 없이 오르는 길 0 · 기다린다)', JSON.stringify({ s: r3.sa, adv: r3.da.adv, stall: r3.da.stall }));
  ok(r3.sb === 1 && r3.db.took === 10 && r3.wb === 0 && r3.mb.wood === 10, '② 모자라면 있는 만큼 집터에 놓고(10) 기둥(18)이 찰 때까지 단계는 그대로', JSON.stringify({ s: r3.sb, took: r3.db.took, mat: r3.mb }));
  // ⓓ 걸음 — 하루 왕복 상한은 걸음이 정한다(나무꾼 식)
  const r4 = probe({ T400_BUILD_ACT: '1' }, WORLD({}) + `
const vil=mk(1,100); vil._granList=[{cx:110+400,cy:100}]; const d=P.buildDay(vil);
const F=V._t400From(vil,{cx:104,cy:112}); process.stdout.write(JSON.stringify({d,tp:P.tripsPerDay(vil,F.d),dist:F.d}));`);
  ok(r4.d.perTrip === r4.tp && r4.tp >= 1, '② 한 사람 하루 왕복 상한 = `_t341TripsPerDay`(걸음이 정한다 · 새 수 0)', `${r4.d.perTrip} · 거리 ${Math.round(r4.dist)}px`);
  ok(Math.abs(r4.d.walkS - r4.d.trips * 2 * r4.dist / 120) < 1e-2, '② 걸음초 = 왕복 수 × 2 × 거리 ÷ 걸음(③ 표의 입력)', `${r4.d.walkS}s`);
}

// ── ③ 헤드리스 0 · 이중 진척 0 ───────────────────────────────────────────────────
console.log('\n③ 헤드리스 집 절 — 켬이면 호출 0');
{
  const hl = fnBody(VSRC, '_lifeHeadlessDay');
  ok(/if \(vil\._site && !_lifeEcon\(\)\.T400_BUILD_ACT\)/.test(hl), '③ `_lifeHeadlessDay` 집 절이 손잡이에 묶였다(집 절만 · 농부 절 무접촉)');
  const on = probe({ T400_BUILD_ACT: '1' }, WORLD({}) + `
const vil=mk(1,100); P.headlessDay(vil); process.stdout.write(JSON.stringify({st:vil._site.stage,w:vil.econ.storage.wood}));`);
  const off = probe({}, WORLD({}) + `
const vil=mk(1,100); P.headlessDay(vil); process.stdout.write(JSON.stringify({st:vil._site.stage,w:vil.econ.storage.wood}));`);
  ok(on.st === 1 && on.w === 100, '③ ★켬 — 헤드리스 하루가 집을 **한 단계도** 안 올린다(호출 0)', JSON.stringify(on));
  ok(off.st === 3, '③ 미끼 — 끔이면 같은 하루가 종전대로 2단계 올린다(이 자가 문다)', JSON.stringify(off));
  const tick = fnBody(VSRC, 'npcLifeTick');
  ok(/t\.k === 'build' && !t\.ps && _lifeEcon\(\)\.T400_BUILD_ACT\) \{ _lifeDropTask\(vil, npc\); return true; \}/.test(tick),
    '③ 켬이면 몸의 시공 진척 0 — 마을 집터 과업은 내려놓는다(하루 장부가 진다 · 이중 진척 금지)');
  ok(/if \(vil\._site && !_lifeEcon\(\)\.T400_BUILD_ACT\) \{ vil\._buildCrew\+\+/.test(tick), '③ 켬이면 반일 징발 0(짓는 이는 크루 둘)');
  ok(/if \(_lifeEcon\(\)\.T400_BUILD_ACT\) \{ if \(_t400BodyStep\(vil, npc, now\)\) return true; \}\s*\n\s*else if \(vil\._site && vil\._buildCrew < LIFE_CREW\)/.test(tick), '③ 켬이면 몸은 곳간 ↔ 집터를 **보여 주기만** 한다(배정 갈래 대체)');
  const body = fnBody(VSRC, '_t400BodyStep');
  ok(body && !/_lifeAdvanceSite|actFromGranary|inventory|storage/.test(body), '③ ★몸 갈래는 회계·단계·손을 **안 만진다**(라벨·목표만)');
  ok(/_lifeAct\(npc, leg\.to === 'g' \? '인출' : '건축'\)/.test(body), '③ 몸 라벨은 기존 것만(인출·운반·건축·출근 — `_lifeAct`)');
  const psite = /t\.k === 'build' && t\.prog >= dayMs \/ LIFE_STAGE_PDAY\) \{\s*\n\s*t\.prog = 0; _lifeAdvanceSite\(vil, t\.ps \? 'p' : null\);/.test(tick);
  ok(psite, '③ 플레이어 의뢰 집터(`ps`)는 종전 길 그대로(회부 — 같은 표인지 실기는 재민)');
}

// ── ④ 관측자 게이트 ─────────────────────────────────────────────────────────────
console.log('\n④ 관측자 게이트 — 관측자 0 ↔ 1 비트 동일');
{
  const bd = fnBody(VSRC, '_t400BuildDay');
  ok(bd && !/anyViewerNear|anyNear|observer/.test(bd), '④ ★`_t400BuildDay` 는 관측자를 **읽지 않는다**');
  const daily = VSRC.slice(VSRC.indexOf('function _lifeDaily('), VSRC.indexOf('function npcLifeTick('));
  const iCall = daily.indexOf('_t400BuildDay(vil)'), iGate = daily.indexOf('const anyNear = state.deps.anyViewerNear');
  ok(iCall > 0 && iGate > 0 && iCall < iGate, '④ 부르는 자리는 `_lifeDaily` 의 관측자 문 **앞**이다(모든 마을이 같은 줄을 지난다)');
  ok(!/function _t400Crew[\s\S]{0,400}_rest/.test(VSRC), '④ 크루 고르기는 요양·관측 상태를 안 본다(명부 순서 · 틱이 도는 마을만 바뀌는 칸 0)');
  //   T297 자 문법 — 같은 씨·같은 세계를 두 팔로. 관측자 없는 팔은 `_lifeDaily` 처럼 헤드리스 하루도 부른다.
  const RUN = (near) => `
const out=[]; const vs=[mk(1,60),mk(2,15),mk(3,200)];
for(let d=0; d<12; d++){ for(const v of vs){ if(!v._site){ v._site={cx:104+2*d,cy:112,stage:1,bo:null}; v.econ.storage.wood+=9; }
  P.buildDay(v); if(!(${near})) P.headlessDay(v); } now+=DAY; }
for(const v of vs) out.push([v._houseCells.length, v._t400Log||[], v.econ.storage.wood, v._site&&v._site.stage]);
process.stdout.write(JSON.stringify(out));`;
  const on0 = JSON.stringify(probe({ T400_BUILD_ACT: '1' }, WORLD({ near: false }) + RUN('false')));
  const on1 = JSON.stringify(probe({ T400_BUILD_ACT: '1' }, WORLD({ near: true }) + RUN('true')));
  const H = JSON.parse(on0).map((x) => x[0]);
  ok(H.reduce((a, b) => a + b, 0) >= 3, '④ [전제] 판 안에서 집이 실제로 선다(0 이면 아래가 자명 통과다)', `집 ${H.join('·')}`);
  ok(on0 === on1, '④ ★★켬 — 관측자 0 팔 ↔ 1 팔 **집 수·단계 시각·곳간 비트 동일** (3/3 마을)', on0 === on1 ? '3/3' : `${on0.slice(0, 80)} ≠ ${on1.slice(0, 80)}`);
  const off0 = JSON.stringify(probe({}, WORLD({ near: false }) + RUN('false')));
  const off1 = JSON.stringify(probe({}, WORLD({ near: true }) + RUN('true')));
  ok(off0 !== off1, '④ 미끼 — 끔이면 두 팔이 **갈린다**(헤드리스가 관측자 문 뒤에 있다 · 이 자가 문다)');
}

// ── ⑤ 주사위 0 · 새 수 0 · builder 0 ─────────────────────────────────────────────
console.log('\n⑤ 주사위 0 · 새 수 0 · `builder` 0');
{
  const r = probe({ T400_BUILD_ACT: '1' }, `Math.random=()=>{throw new Error('Math.random')};` + WORLD({}) + `
const vil=mk(1,100); let e=null; try{ P.buildDay(vil); now+=DAY; P.buildDay(vil); }catch(x){ e=String(x.message) } process.stdout.write(JSON.stringify({e,h:vil._houseCells.length}));`);
  ok(r.e === null && r.h === 1, '⑤ ★`Math.random` 을 던지게 바꿔도 이틀이 돈다(주사위 0)', r.e || '');
  const T4 = ['_t400Crew', '_t400PerLoad', '_t400From', '_t400BuildDay', '_t400BodyStep'].map((n) => fnBody(VSRC, n)).join('\n');
  ok(T4.length > 500 && !/Math\.random/.test(T4), '⑤ T400 함수 다섯에 `Math.random` 0');
  ok(!/\b(22|18|25)\b/.test(T4.replace(/_t341|_t400|T400/g, '')), '⑤ ★자재·짐 수를 옮겨 적지 않았다(22·18·25 글자 0 — 표·carry·weights 에서 읽는다)');
  ok(!/['"]builder['"]/.test(codeOf(VSRC)) && !/['"]builder['"]/.test(codeOf(SRC)), '⑤ `builder` 직업 신설 0(#62)');
  ok((SRC.match(/process\.env\.T400_BUILD_ACT/g) || []).length === 1, '⑤ 손잡이 하나 — `T400_BUILD_ACT` 를 읽는 자리 한 곳(econ · villages 는 그 값을 쓴다)');
  ok(!/process\.env\.T400_BUILD_ACT/.test(VSRC) && !/process\.env\.T400_BUILD_ACT/.test(ZSRC), '⑤ villages·zone 은 env 를 따로 안 읽는다');
}

console.log(`\n=== ${pass}/${pass + fail} ${fail ? '✗' : '✓'} ===`);
process.exit(fail ? 1 : 0);
