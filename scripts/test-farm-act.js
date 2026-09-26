#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-farm-act.js — 농부 행위 완성 (T368) ======================================
//
// ★왜 [설계/설계_생산_실체.md §0 농부 행 · 재민 09-23 · 지시 T368 + 추신]
//   *"농부가 직접 밭 갈고 수확하는 순간 해당 작물이 플러스되기로 했잖아. 우리 모든 추상을 없애기로 했잖아."*
//   남은 추상이 둘이었다 — 이 하네스가 둘을 지킨다:
//     ① 품목 — 수확이 **그 밭의 작물**로, **작물 표의 수확량**으로 곳간에 든다(`T100_K` 식량등가 대신 · 캐논 0-b)
//     ② 몸   — 관측자 없는 마을의 밭도 **몸이 한다**(헤드리스의 농부 몫 두 절이 안 돈다 · 농부가 걷는다)
//              ⚠존이 **통째로** 자면(사람 0 · 관측자 0) 존 틱이 NPC 루프 앞에서 돌아가 몸이 안 걷는다 ⇒ 그날은 일괄(몸 XOR 일괄)
//   카드 새 절 셋: ⓐ 품목 합 항등 · ⓑ 켬이면 헤드리스 농부 절 호출 0 · ⓒ 끔 비트 동일.
//
// ★★이 카드의 고유한 어려움 — **econ 이 작물 34종 중 셋만 안다**(생곡 `wheat·rice·barley`).
//   나머지의 식량 값은 **열량 정본**(`kcal.econUnitsOf`)이 답하고 생활층이 세계에 **주입**한다(`world.cropFoodEq`).
//   그래서 여기엔 다른 행위 카드에 없던 절이 있다: ③ **값이 어디서 오나**(econ 이 아는 것은 econ 정본 · 모르는 것은 주입 ·
//   이중 0) · 그 값으로 **먹고(사다리) 세고(재고·생산 환산)** 가 선다.
//
// ⚠존을 부팅하지 않는다 — 존 소스는 **글자로** 읽고(정적), 생활층·엔진은 **불러서** 잰다(기능).
//   손잡이는 모듈 머리에서 읽히므로 켠 판은 **자식 프로세스**로 잰다(`probe` — forage·wood·fish 하네스와 같은 문법).
//
// 실행: node scripts/test-farm-act.js
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
const probe = (env, js) => JSON.parse(execFileSync(process.execPath, ['-e', js],
  { env: Object.assign({}, process.env, { T100_FIELD_YIELD: '', T368_FARM_ACT: '', T227_EVEN: '' }, env), stdio: 'pipe' }).toString().trim().split('\n').pop());
const EP = JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'));
const VP = JSON.stringify(path.join(ROOT, 'server', 'villages.js'));
const KP = JSON.stringify(path.join(ROOT, 'server', 'kcal.js'));
const CRP = JSON.stringify(path.join(ROOT, 'server', 'crops.js'));
const ON = { T100_FIELD_YIELD: '1', T368_FARM_ACT: '1' };
const C = codeOf(SRC), VC = codeOf(VSRC), ZC = codeOf(ZSRC);
const bodyOf = (code, name) => (code.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}')) || [''])[0];

console.log('\n=== 농부 행위 완성 (T368) ===');

// ── ① 손잡이 — 기본 끔 · 끄면 종전 호출 그대로 ─────────────────────────────────
console.log('\n① 손잡이 — 기본 끔 · 끄면 곳간 입구가 **종전 호출 그대로**다');
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  ok(E.T368_FARM_ACT === false, '① ★★손잡이 `T368_FARM_ACT` 가 **기본 끔**이다');
  ok(/const T368_FARM_ACT = process\.env\.T368_FARM_ACT === '1';/.test(C), '① `=== \'1\'` 이라야 켜진다(되돌림이 기본)');
  const off = probe({ T100_FIELD_YIELD: '1' }, `const E=require(${EP}); const V=require(${VP}); const B=V.__farmBind();
    const mk=()=>{ const v=E.createVillage({initialPop:0,name:'x',fertility:1}); v._world={}; return v; };
    const a=mk(), b=mk(); const vil={econ:a,_drySet:new Set(['1,1'])};
    const r1=B._farmGranary(vil,null,B._t368Item(vil,'1,1',{c:'foxtail_millet',q:1}));
    const r2=E.harvestToGranary(b,1);
    console.log(JSON.stringify({r1,r2,f1:a.storage.food,f2:b.storage.food,m1:a.storage.foxtail_millet||0,att:!!a._world.cropFoodEq}))`);
  ok(off.r1 === off.r2 && off.f1 === off.f2 && off.m1 === 0 && off.att === false,
    '① ★★★끈 팔은 **종전 호출 그대로**다 — 건수 1 × `T100_K` · 작물 0 · 주입 0(`_farmGranary(…, null)` ≡ `harvestToGranary(v, 1)`)',
    `${off.r1} = ${off.r2}`);
  const half = probe({ T368_FARM_ACT: '1' }, `const V=require(${VP}); const B=V.__farmBind(); const vil={econ:{_world:{}},_drySet:new Set()};
    console.log(JSON.stringify({it:B._t368Item(vil,'1,1',{c:'rice',q:1})}))`);
  ok(half.it === null, '① ★`T100_FIELD_YIELD` 가 꺼져 있으면 품목도 없다(밭이 곳간에 안 닿는 세계 — 두 손잡이가 다 켜져야 선다)');
}

// ── ② ⓐ 품목 합 항등 — 넣은 낱개 = 곳간 + 금고(세금) · 대조 자는 `T100_K` ───────
console.log('\n② ⓐ 품목 합 항등 — 곳간에 든 낱개가 거둔 낱개와 **한 톨도 안 어긋난다**');
{
  const r = probe(ON, `const E=require(${EP}); const K=require(${KP}); const C=require(${CRP});
    const v=E.createVillage({initialPop:0,name:'x',fertility:1}); for(const k in v.storage) v.storage[k]=0; if(v.treasury) for(const k in v.treasury) v.treasury[k]=0;
    const t={}; for(const id of C.IDS) t[id]=K.econUnitsOf(id,1)||0; v._world={cropFoodEq:t};
    const calls=[['rice',9,1,1],['foxtail_millet',5,1.5,2],['radish',4,1,1],['tea',4,1,1]];
    for (const [c,n,m,e] of calls) E.harvestToGranary(v,n,m,c,e);
    const out={}; for (const [c] of calls) out[c]={s:v.storage[c],t:v.treasury[c]};
    console.log(JSON.stringify({out, by:v._t368InByItem, fe:v._t368InflowToday, cred:v._t368CredTot, food:v._t368FoodTot, K:v._t368KTot, n:v._t100HarvestN, T100_K:E.T100_K,
      f:{rice:E.RAW_GRAIN_FOOD_FACTOR, millet:t.foxtail_millet, radish:t.radish, tea:t.tea}, tfood:v.storage.food||0, t100in:v._t100InflowToday||0}))`);
  const want = { rice: 9, foxtail_millet: 7.5, radish: 4, tea: 4 };
  let cons = true;
  for (const c in want) cons = cons && Math.abs((r.out[c].s + r.out[c].t) - want[c]) < 1e-9 && Math.abs(r.by[c] - want[c]) < 1e-9;
  ok(cons, '② ★★★곳간 + 금고(세금) = 거둔 낱개 × 배율 — 품목마다(쌀 9 · 조 5×1.5 · 무 4 · 차 4) · 장부 다리 오늘치도 같은 수', JSON.stringify(r.by));
  const feWant = 9 * r.f.rice + 7.5 * r.f.millet + 4 * r.f.radish + 4 * r.f.tea;
  ok(Math.abs(r.fe - feWant) < 1e-9 && Math.abs(r.food - feWant) < 1e-9 && r.f.tea === 0,
    '② ★★식량등가 = Σ 낱개 × 그 품목의 값(econ 정본 · 주입 정본) — 특용(차)은 **품목은 들고 식량은 0**', `${r.fe.toFixed(6)}`);
  ok(Math.abs(r.K - (1 + 2 * 1.5 + 1 + 1) * r.T100_K) < 1e-9 && r.n === 5,
    '② ★★대조 자 — 같은 수확(건수 5 · 배율 그대로)을 종전 입구가 냈을 식량등가(`T100_K`)를 **따로** 센다(`_t368KTot`)', `${r.K.toFixed(4)}`);
  ok(r.tfood === 0 && r.t100in === 0, '② ★★켠 갈래는 `food` 에 **한 톨도 안 넣는다**(뭉뚱그린 품목 0) — 종전 입구의 오늘치도 0');
  ok(Math.abs(r.fe / r.K - 1) > 0.05,
    '② [자명 통과 금지] 작물 표 ↔ 앵커 비가 **1 이 아니다**(같은 수로 만든 항등이 아니다 — 그 차가 보고의 발견이다)', `${(r.fe / r.K).toFixed(4)}`);
  const ev = probe(Object.assign({ T227_EVEN: '1' }, ON), `const E=require(${EP});
    const v=E.createVillage({initialPop:0,name:'x',fertility:1}); for(const k in v.storage) v.storage[k]=0; v._world={cropFoodEq:{azuki:0.6}};
    E.harvestToGranary(v,30,1,'azuki',1); const p0=v._t368Pend.azuki; let rel=0; for(let d=0;d<500;d++) rel+=E.t368EvenRelease(v);
    console.log(JSON.stringify({p0, pend:v._t368Pend.azuki, rel, s:v.storage.azuki+(v.treasury.azuki||0)}))`);
  ok(ev.p0 === 30 && Math.abs(ev.pend + ev.rel - 30) < 1e-9 && Math.abs(ev.s - ev.rel) < 1e-9 && ev.rel > 0,
    '② ★[T227] 고르게 켠 판도 품목별로 **질량 누수 0**(대기 + 푼 것 = 거둔 것 · 푼 것 = 곳간 + 금고)', `대기 ${ev.pend.toExponential(2)} · 푼 ${ev.rel.toFixed(4)}`);
}

// ── ③ 값 — econ 이 아는 것은 econ 정본 · 모르는 것은 주입된 열량 정본 · 이중 0 ────
console.log('\n③ 값 — 작물의 식량 값은 **어디서 오나**(econ 정본 · 열량 정본 주입 · 이중 0)');
{
  const r = probe(ON, `const E=require(${EP}); const K=require(${KP}); const C=require(${CRP});
    const t={}; for(const id of C.IDS) t[id]=K.econUnitsOf(id,1)||0;
    const v=E.createVillage({initialPop:0,name:'x',fertility:1}); for(const k in v.storage) v.storage[k]=0; v._world={cropFoodEq:t};
    v.storage.foxtail_millet=10; v.storage.radish=100; v.storage.rice=5; v.storage.mushroom=50;
    const fe=E.totalFoodEquivalent(v); const own=(v._world._t368Own||[]).map(x=>x[0]);
    const left=E.consumeFood(v,12);
    const pe=E.totalFoodProductionEquivalent({foxtail_millet:10},v), pe0=E.totalFoodProductionEquivalent({foxtail_millet:10});
    console.log(JSON.stringify({fe, own, n:own.length, left, eaten:v._foodEaten, pe, pe0, millet:t.foxtail_millet, radish:t.radish, rg:E.RAW_GRAIN_FOOD_FACTOR, ids:C.IDS.length}))`);
  ok(r.n === r.ids - 3 - 4 && !r.own.includes('rice') && !r.own.includes('wheat') && !r.own.includes('barley') && !r.own.includes('tea'),
    '③ ★★★주입 표에서 econ 이 아는 생곡 셋과 열량 0 인 특용 넷을 **뺀다**(34 − 3 − 4 = 27 · 이중 0)', `${r.n}종`);
  const feWant = 10 * r.millet + 100 * r.radish + 5 * r.rg + 50 * 0.3;
  ok(Math.abs(r.fe - feWant) < 1e-9, '③ ★★재고 환산 — 조·무는 **주입 값**, 쌀은 **econ 정본(도정 수율)** 으로 센다', r.fe.toFixed(6));
  ok(r.left === 0 && r.eaten.rice === 5 && r.eaten.foxtail_millet > 0 && !r.eaten.mushroom,
    '③ ★★★사다리 — 생곡 **바로 뒤**, 채집물 **앞**에서 작물을 먹는다(쌀 5 → 조 → 버섯은 안 건드림)', JSON.stringify(r.eaten));
  ok(Math.abs(r.pe - 10 * r.millet) < 1e-9 && r.pe0 === 0,
    '③ ★생산 환산도 같은 자 — 둘째 인수(마을)가 있어야 센다(없으면 0 · 종전 호출 무변)', `${r.pe.toFixed(4)} / ${r.pe0}`);
  const off = probe({ T100_FIELD_YIELD: '1' }, `const E=require(${EP});
    const v=E.createVillage({initialPop:0,name:'x',fertility:1}); for(const k in v.storage) v.storage[k]=0; v._world={cropFoodEq:{foxtail_millet:1}};
    v.storage.foxtail_millet=10; v.storage.mushroom=50; const fe=E.totalFoodEquivalent(v); const left=E.consumeFood(v,5);
    console.log(JSON.stringify({fe, left, m:v.storage.foxtail_millet, own:v._world._t368Own||null}))`);
  ok(off.m === 10 && off.own === null && Math.abs(off.fe - 15) < 1e-9,
    '③ ★★끄면 표가 심겨 있어도 **안 센다 · 안 먹는다**(손잡이가 먼저다 — 끈 팔 비트 동일)', `fe ${off.fe}`);
  ok(/function _t368Crops\(v\) \{\s*const W = \(T368_FARM_ACT && v\) \? v\._world : null;/.test(C),
    '③ 값 표를 읽는 자리의 **첫 줄이 손잡이**다');
}

// ── ④ 장부 다리 — 넷째 적용(T312 어부 · T325 나무꾼 · T374 채집과 같은 꼴) ─────────
console.log('\n④ 장부 다리 — 밭 입고가 **품목으로** 잠재·실현 장부에 적힌다(넷째 적용)');
{
  ok(/const _t368By = T368_FARM_ACT \? \(v\._t368InByItem \|\| null\) : null;/.test(C)
     && /dailyProductionPotential\[c\] = \(dailyProductionPotential\[c\] \|\| 0\) \+ u;/.test(C)
     && /dailyProduction\[c\] = \(dailyProduction\[c\] \|\| 0\) \+ u;/.test(C),
    '④ ★★다리가 **그 품목으로** 적는다(`food` 로 접지 않는다 — 값은 환산이 품목마다 센다)');
  ok(C.indexOf('const _t368By') > C.indexOf("const _t347In = T347_FORAGE_ACT"),
    '④ 채집 다리(T374) **다음 자리**다 — 같은 틱 안 · 리셋 뒤 · 읽는 줄 앞');
  ok(/const got = \(v\._t100InflowToday \|\| 0\) \+ \(T368_FARM_ACT \? \(v\._t368InflowToday \|\| 0\) : 0\);/.test(C),
    '④ ★텃밭 하한이 켠 팔의 오늘치(식량등가)도 **밭이 낸 몫**으로 센다(안 세면 하한이 겹쳐 채운다)');
  ok(/totalFoodProductionEquivalent\(dailyProduction, v\)/.test(C) && /totalFoodProductionEquivalent\(dailyProductionPotential, v\)/.test(C),
    '④ 읽는 두 자리(실현 · 잠재)가 **마을을 넘긴다**(주입 값이 prodK·surplusEMA 에 닿는다)');
  const r = probe(ON, `const E=require(${EP}); const V2=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim-v2.js'))});
    const w=V2.createWorldV2({seed:5,villageCount:1,namePool:['가'],infoRange:5000,raidPer100:0}); const v=w.villages[0]; v._world=w; w.cropFoodEq={foxtail_millet:1.028571};
    E.harvestToGranary(v,5,1,'foxtail_millet',1); const b0=JSON.stringify(v._t368InByItem);
    const _l=console.log; console.log=()=>{}; V2.tickWorldV2(w); console.log=_l;
    console.log(JSON.stringify({b0, buf:v.dailyProductionBuf.foxtail_millet, left:v._t368InByItem, fe:v._t368InflowToday}))`);
  ok(r.buf === 5 && r.left === null && r.fe === 0,
    '④ ★★★[실행] 거둔 조 5 가 틱 안에서 장부에 **5 로** 적히고 오늘치가 비워진다(누적 누수 0)', `${r.b0} → 장부 ${r.buf}`);
}

// ── ⑤ ⓑ 헤드리스 — 켜면 농부 몫 두 절(① 개간 · ③ 작물)이 **안 돈다**(존이 깨어 있는 동안) ─────────────
console.log('\n⑤ ⓑ 헤드리스 — 켜면 이 마을 밭은 **몸이 한다**(농부 몫 두 절 호출 0) · 존이 통째로 자면 일괄이 그 몫(몸 XOR 일괄)');
{
  const hl = bodyOf(VC, '_lifeHeadlessDay');
  ok(/const _body = _t368Walk\(\) && _t368ZoneAwake\(vil\);/.test(hl) && /if \(!_body\) _lifeClearDay\(vil, farmerN\);/.test(hl) && /if \(!_body\) lifeFarmDay\(vil, day, farmerN\);/.test(hl),
    '⑤ ★★두 절이 **같은 한 판정**(`_t368Walk() && _t368ZoneAwake`) 뒤에 선다 — 개간 · 작물');
  ok(/if \(vil\._site\) \{ let st = Math\.min\(LIFE_CREW, popN\) \* LIFE_STAGE_PDAY;/.test(hl),
    '⑤ ② 신축은 **그대로**다(농부 몫이 아니다 — 직업 무관 크루 · T361 칸)');
  //   ★깨어 있나 = 반경 **무한**의 `anyViewerNear`(zone.js idle 판정이 보는 두 명부 — 사람 player · 관측자) · 새 문 0
  ok(/function _t368ZoneAwake\(vil\) \{ const f = state\.deps && state\.deps\.anyViewerNear; return !!\(f && f\(\{ x: vil\.ccx \* SZ \+ SZ \/ 2, y: vil\.ccy \* SZ \+ SZ \/ 2 \}, Infinity\)\); \}/.test(VC),
    '⑤ ★존이 깨어 있나 = 주입된 `anyViewerNear` 를 반경 **무한**으로 한 번(새 문 0 · 주입이 없으면 거짓 = 일괄)');
  const ZC2 = fs.readFileSync(path.join(ROOT, 'server/zone.js'), 'utf8');
  ok(/if \(!hasHuman && !hasObserver\) \{/.test(ZC2) && /for \(const p of players\.values\(\)\) \{\s*if \(p\.isNpc\) continue;/.test(bodyOf(ZC2, 'anyViewerNear')) && /for \(const d of observers\.values\(\)\)/.test(bodyOf(ZC2, 'anyViewerNear')),
    '⑤ ★그 두 명부가 zone.js idle 판정(`!hasHuman && !hasObserver`)이 보는 그 둘이다 — 사람(비NPC) player · 관측자');
  //   awake: undefined = 주입 없음(랩·하네스) · true/false = 존이 깨어 있음/잠듦(주입된 술어가 받은 반경을 적는다)
  const js = (env, awake) => probe(env, `const V=require(${VP}); const E=require(${EP}); const B=V.__farmBind(), P=V.__labProbe;
    const pl=new Map([[1,{pid:1,simJob:'farmer'}],[2,{pid:2,simJob:'farmer'}],[3,{pid:3,simJob:'fisher'}]]); const rs=[];
    const deps={players:pl}; ${awake === undefined ? '' : `deps.anyViewerNear=(c,r)=>{rs.push(r);return ${awake};};`} P._t374Probe.setDeps(deps);
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); const farm=new Set(); for(let i=0;i<30;i++) farm.add((100+i)+',100');
    const vil={dbId:7,ccx:100,ccy:100,econ:ev,npcPids:[1,2,3],_farmSet:farm,_drySet:new Set(farm),_potSet:new Set(),_crop:new Map(),_cropClaim:new Set(),_terrSet:new Set(['100,100']),_site:null,_claim:new Set()};
    B._lifeHeadlessDay(vil); console.log(JSON.stringify({tasks:vil._mTk||0, crops:vil._crop.size, rs:rs.map(String), hl:[vil._t368HlBody===undefined?null:vil._t368HlBody, vil._t368HlBatch===undefined?null:vil._t368HlBatch]}))`);
  const off = js({}, true), on = js({ T368_FARM_ACT: '1' }, true), idle = js({ T368_FARM_ACT: '1' }, false), bare = js({ T368_FARM_ACT: '1' }, undefined);
  ok(off.tasks > 0 && off.crops > 0 && off.rs.length === 0, '⑤ [자명 통과 금지] 끈 판은 헤드리스가 **밭을 실제로 돈다**(파종 30) · 존 술어에 **안 닿는다**(끈 팔 무변)', `${off.tasks}건 · 술어 ${off.rs.length}회`);
  ok(on.tasks === 0 && on.crops === 0 && on.rs.join() === 'Infinity', '⑤ ★★★[실행] 켠 판 · 존 깸 — 헤드리스 **작물 절 호출 0** — 같은 마을 · 같은 날 파종 0 · 술어는 반경 무한 한 번', `${on.tasks}건 · 반경 ${on.rs.join()}`);
  ok(idle.tasks === off.tasks && idle.crops === off.crops, '⑤ ★★[실행] 켠 판 · 존 잠 — 몸이 안 걷는 날은 **일괄이 그 몫**(끈 판과 같은 수 · 몸 XOR 일괄)', `${idle.tasks}건 = 끔 ${off.tasks}건`);
  ok(bare.tasks === off.tasks && bare.crops === off.crops, '⑤ [실행] 주입이 없으면(존이 없다 — 랩·하네스) 몸도 없다 ⇒ 일괄', `${bare.tasks}건`);
  ok(off.hl.join() === ',' && on.hl.join() === '1,' && idle.hl.join() === ',1',
    '⑤ ★관측 칸(`/perf farm.hlBody·hlBatch` — 실서버 표가 읽는다): 켠 판만 센다 — 존 깸 = 몸 1 · 존 잠 = 일괄 1 · 끈 판은 칸이 **안 생긴다**', `끔 [${off.hl}] · 깸 [${on.hl}] · 잠 [${idle.hl}]`);
}

// ── ⑥ 손 → 귀환 곳간 — 거두는 순간 손에 · 귀환하면 곳간에 ───────────────────────
console.log('\n⑥ 손 — 거두는 순간 **손에**(`inventory[작물]`) · 귀환하면 **곳간에**');
{
  const r = probe(ON, `const V=require(${VP}); const E=require(${EP}); const B=V.__farmBind();
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); for(const k in ev.storage) ev.storage[k]=0; ev._world={};
    const vil={econ:ev,_drySet:new Set(['1,1'])}; const i1=B._t368Item(vil,'1,1',{c:'foxtail_millet',q:1}), i2=B._t368Item(vil,'2,2',{c:'rice',q:0.5});
    const npc={inventory:{}}; B._t368Hold(npc,i1); B._t368Hold(npc,i2); B._t368Hold(npc,i1);
    const hand=JSON.stringify(npc.inventory), s0=ev.storage.foxtail_millet||0;
    const got=B._t368Deliver(vil,npc,'gran');
    const a={hand, s0, got, inv:npc.inventory, led:npc._t368H, m:ev.storage.foxtail_millet+ev.treasury.foxtail_millet, r:ev.storage.rice+ev.treasury.rice, n:ev._t100HarvestN, trips:vil._t368Trips};
    B._t368Hold(npc,i1); npc.inventory.foxtail_millet=0; const got2=B._t368Deliver(vil,npc,'day');
    console.log(JSON.stringify(Object.assign(a,{got2, n2:ev._t100HarvestN})))`);
  ok(r.hand === '{"foxtail_millet":10,"rice":4}' && r.s0 === 0, '⑥ ★★거둔 순간엔 **손에만** 있다(곳간 0) — 조 5×2 · 쌀 floor(9×0.5)', r.hand);
  ok(r.got === 14 && r.m === 10 && r.r === 4 && r.inv.foxtail_millet === 0 && r.inv.rice === 0 && r.led === null && r.n === 3 && r.trips === 1,
    '⑥ ★★★귀환하면 곳간에 — 손은 **그때 비운다**(이중 0) · 건수 3 · 곳간 왕복 1', `곳간 조 ${r.m} · 쌀 ${r.r}`);
  ok(r.got2 === 0 && r.n2 === 4, '⑥ ★도중에 손이 비었으면(낙하 정본) **넣을 것이 없다** — 없는 것을 만들지 않는다(건수만 는다)');
  ok(/_granStockAdd\(vil, g, _handOf\(npc\)\); _handSet\(npc, 0\); if \(npc\._t368H\) _t368Deliver\(vil, npc, 'gran'\);/.test(VC),
    '⑥ ★곳간행 정산(`_lifeGranStep`)이 **그 귀환**이다 — 볏단이 차서(`G_CARRY`) 다녀온 길에 작물도 넣는다');
  ok(/if \(p && p\._t368H\) _t368Deliver\(vil, p, 'day'\);/.test(VC), '⑥ 하루 경계(`_lifeDaily`)가 남은 손을 넣는다(어부 절과 같은 꼴)');
  ok(/if \(vil\.econ\) \{ if \(_it && npc\) _t368Hold\(npc, _it\); else _farmGranary\(vil, npc, _it\); \}/.test(VC),
    '⑥ ★수확 갈래 — 몸이 있으면 **손에**, 몸이 없으면(계측 자) 그 자리에서 곳간에');
}

// ── ⑦ 걷기 술어 — 농부도 관측자와 무관하게 걷는다(한 술어 · 한 항) ─────────────────
console.log('\n⑦ 걷기 술어 — `_t316WalkAlways` 에 **농부 항 하나**');
{
  const walk = bodyOf(ZC, '_t316WalkAlways');
  ok(/return !!\(_t316Econ && \(_t316Econ\.T312_FISH_ACT \|\| \(_t316Econ\.T368_FARM_ACT && npc\.simJob === 'farmer'\)\)\);/.test(walk),
    '⑦ ★★★술어는 **하나**이고 항은 둘 — T312(주민 전부) · ★T368(농부만 · 생활층이 심는 `simJob`)');
  ok(!/T325_WOOD_ACT|T347_FORAGE_ACT/.test(walk), '⑦ 나무꾼·채집꾼 항은 **없다**(그 카드들의 빚은 그대로)');
  ok((ZC.match(/_t316WalkAlways\(/g) || []).length === 3, '⑦ 그 술어를 부르는 자리는 그대로 **둘**(결정 · 이동 — 셋째 문 0)');
  ok(/farm: \(\(\) => \{ try \{ return SimVillages\.farmPerf \? SimVillages\.farmPerf\(\) : null; \} catch \(e\) \{ return null; \} \}\)\(\),/.test(ZC),
    '⑦ `/perf` 에 농부 관측 한 줄(끔이면 `null` — 끈 팔 페이로드 무변)');
}

// ── ⑧ 낱개 = 작물 표 × 품질 (자의 물 규칙 그대로) ───────────────────────────────
console.log('\n⑧ 낱개 — 밭 한 칸 한 수확 = **작물 표**(`harvestUnits`) × 그 칸의 품질');
{
  const r = probe(ON, `const V=require(${VP}); const C=require(${CRP}); const B=V.__farmBind(); const vil={econ:{_world:{}},_drySet:new Set(['1,1'])};
    const out=[]; for (const [k,c,q] of [['1,1','foxtail_millet',1],['1,1','cucumber',0.7],['2,2','rice',1],['2,2','rice',0.34],['1,1','wheat',1]]) {
      const it=B._t368Item(vil,k,{c,q}); const want=Math.floor(C.harvestUnits(c,{supply:vil._drySet.has(k)?1:5,seedFresh:1})*q+1e-9); out.push([c,it.u,want]); }
    console.log(JSON.stringify({out, att:vil.econ._world.cropFoodEq?Object.keys(vil.econ._world.cropFoodEq).length:0}))`);
  ok(r.out.every(([, u, w]) => u === w) && r.out[2][1] === 9,
    '⑧ ★★★정본 식 그대로 — `floor(harvestUnits(작물, {논 5 · 밭 1, 새 씨}) × q)`(쌀 논 9 · 품질 0.34 → 3)', JSON.stringify(r.out));
  ok(r.att === 34, '⑧ 첫 수확이 **값 표를 한 번 심는다**(34종 · 열량 정본 · 심는 줄 하나)', `${r.att}종`);
  ok(/for \(const id of C\.IDS\) t\[id\] = \+K\.econUnitsOf\(id, 1\) \|\| 0;/.test(VC) && /W\.cropFoodEq = t;/.test(VC),
    '⑧ ★표는 **정본 환산 짝**(`kcal.econUnitsOf` — 납품·보상·인출이 쓰는 그 함수)이 만든다 · 새 수 0');
}

// ── ⑨ 한 줄 — 생활층이 곳간에 닿는 자리는 하나다 ─────────────────────────────────
console.log('\n⑨ 한 줄 — 생활층이 곳간 입구를 부르는 줄이 **하나**다(산수 0)');
{
  const calls = VC.split('\n').filter((l) => l.indexOf('harvestToGranary') >= 0);
  ok(calls.length === 1 && /return _lifeEcon\(\)\.harvestToGranary\(vil\.econ, it \? it\.u : 1, _farmMul\(vil, npc\), it \? it\.c : undefined, ev\);/.test(calls[0]),
    '⑨ ★★★그 한 줄이 `_farmGranary` 안에 있고 **넘기기만** 한다(낱개 · 배율 · 작물 · 건수)', `${calls.length}줄`);
  ok(!/[*/+]/.test(calls[0].split('harvestToGranary')[1] || ''), '⑨ ★그 줄에 **산수가 없다**(배율은 econ 입구 안에서 한 번)');
  const users = VC.split('\n').filter((l) => /_farmGranary\(vil, /.test(l) && !/function _farmGranary/.test(l));
  ok(users.length === 2 && users.some((l) => /if \(did === 'harvest'\)/.test(l)) && users.some((l) => /got \+= _farmGranary/.test(l)),
    '⑨ 그 함수를 부르는 곳은 **둘** — 수확 갈래(몸 없는 자리) · 귀환(손)', `${users.length}곳`);
}

// ── ⑩ ⓒ 끔 비트 동일 — econ 단독 세계는 손잡이로 한 비트도 안 갈린다 ──────────────
console.log('\n⑩ ⓒ 끔 비트 동일 — 손잡이·주입이 없는 세계는 **한 비트도** 안 갈린다');
{
  const fp = (env) => probe(env, `const V2=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim-v2.js'))});
    const w=V2.createWorldV2({seed:42,villageCount:5,namePool:['가','나','다','라','마'],infoRange:5000,raidPer100:0.005,picker:'rational'});
    const _l=console.log; console.log=()=>{}; for(let d=0;d<200;d++) V2.tickWorldV2(w); console.log=_l;
    console.log(JSON.stringify({fp:w.villages.map(v=>v.name+':'+v.npcs.length+'/'+v.storage.food.toFixed(6)+'/'+(v.storage.rice||0).toFixed(6)).join(' ')}))`);
  const a = fp({ T100_FIELD_YIELD: '1' }), b = fp({ T100_FIELD_YIELD: '1', T368_FARM_ACT: '0' }), c = fp({ T100_FIELD_YIELD: '1', T368_FARM_ACT: '1' });
  ok(a.fp === b.fp, '⑩ ★★★미설정 = `=0` **비트 동일**(되돌림이 기본)', a.fp.slice(0, 48) + '…');
  ok(a.fp === c.fp, '⑩ ★★켜도 **주입이 없으면**(econ 단독 세계 · 생활층 없음) 한 비트도 안 갈린다 — 켠 팔의 값은 전부 생활층이 심는다');
  ok(!/T368_FARM_ACT/.test(bodyOf(C, 'totalFoodEquivalent')) && /const _own = _t368Crops\(v\);/.test(bodyOf(C, 'totalFoodEquivalent')),
    '⑩ 환산 자리는 손잡이를 직접 안 보고 **값 표 한 곳**(`_t368Crops`)을 본다(판정이 한 자리)');
}

// ── ⑪ 접점 심볼 — 카드가 지목한 이름이 전부 제자리에 ──────────────────────────────
console.log('\n⑪ 접점 심볼');
{
  const all = SRC + VSRC + ZSRC;
  for (const sym of ['harvestToGranary', 'T100_K', '_lifeHeadlessDay', 'cropAfterHarvest', '_crop', 'T227_EVEN', 'T368_FARM_ACT', 'actToGranary', '_lifeAct']) {
    ok(all.indexOf(sym) >= 0, `⑪ \`${sym}\` 가 제자리에 있다`);
  }
  ok(/require\('\.\/crops'\)/.test(VSRC) && /require\('\.\/kcal'\)/.test(VSRC) && /require\('\.\/weights'\)/.test(VSRC),
    '⑪ 생활층이 작물·열량·무게 정본을 **부른다**(`crops.js`·`kcal.js`·`weights.js` — 표를 옮겨 적지 않는다)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
