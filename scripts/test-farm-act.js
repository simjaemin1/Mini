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
//              ★[T410] 존의 idle 문을 열었다(`ZONE_IDLE_SKIP` 기본 끔) — 판정은 존의 `zoneAwake` 하나(주입) · 열면 늘 참 ⇒ 몸 하나
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
console.log('\n⑤ ⓑ 헤드리스 — 켜면 이 마을 밭은 **몸이 한다**(농부 몫 두 절 호출 0) · 존이 통째로 자면 일괄이 그 몫(몸 XOR 일괄) · ★T410 문을 열면(기본) 존이 안 잔다');
{
  const hl = bodyOf(VC, '_lifeHeadlessDay');
  ok(/const _body = _t368Walk\(\) && _t368ZoneAwake\(vil\);/.test(hl) && /if \(!_body\) _lifeClearDay\(vil, farmerN\);/.test(hl) && /if \(!_body\) lifeFarmDay\(vil, day, farmerN\);/.test(hl),
    '⑤ ★★두 절이 **같은 한 판정**(`_t368Walk() && _t368ZoneAwake`) 뒤에 선다 — 개간 · 작물');
  //   ★[T400] 집 절에 집 행위 손잡이 가드(`&& !_lifeEcon().T400_BUILD_ACT`)가 붙었다 — 농부 판정(`_body`)과 무관한 것은 그대로다.
  ok(/if \(vil\._site(?: && !_lifeEcon\(\)\.T400_BUILD_ACT)?\) \{ let st = Math\.min\(LIFE_CREW, popN\) \* LIFE_STAGE_PDAY;/.test(hl) && !/_body[^\n]*LIFE_STAGE_PDAY/.test(hl),
    '⑤ ② 신축은 **그대로**다(농부 몫이 아니다 — 직업 무관 크루 · T361 칸)');
  //   ★★[T410] 깨어 있나 = **존의 idle 문 그 함수**(`zone.js zoneAwake` 주입) — 종전(T368)엔 반경 무한 `anyViewerNear` 로 같은 두 명부를 따로 물었다.
  ok(/function _t368ZoneAwake\(vil\) \{ const f = state\.deps && state\.deps\.zoneAwake; return !!\(f && f\(\)\); \}/.test(VC),
    '⑤ ★존이 깨어 있나 = 주입된 `zoneAwake` **한 번**(존의 idle 문과 같은 판정 · 사본 0 · 주입이 없으면 거짓 = 일괄)');
  const ZC2 = fs.readFileSync(path.join(ROOT, 'server/zone.js'), 'utf8');
  const za = bodyOf(ZC2, 'zoneAwake');
  ok(/^const ZONE_IDLE_SKIP = process\.env\.ZONE_IDLE_SKIP === '1';$/m.test(ZC2) && (ZC2.match(/process\.env\.ZONE_IDLE_SKIP/g) || []).length === 1,
    '⑤ ★[T410] 손잡이 `ZONE_IDLE_SKIP` 는 **한 자리**에서 읽힌다 · 기본 끔(= 안 건너뜀) · `=1` 만 종전');
  ok(/if \(!ZONE_IDLE_SKIP\) return true;/.test(za) && /for \(const p of players\.values\(\)\) \{ if \(!p\.isNpc\) return true; \}/.test(za) && /return observers\.size > 0;/.test(za),
    '⑤ ★[T410] `zoneAwake` — 문이 열려 있으면 **늘 참** · 닫혀 있으면 종전 두 명부(사람 · 비NPC player · 관측자)');
  ok((ZC2.match(/if \(!zoneAwake\(\)\) \{/g) || []).length === 1 && !/hasHuman|hasObserver/.test(ZC2.replace(/\/\/.*$/gm, '')),
    '⑤ ★[T410] 틱의 idle 문은 **그 함수 하나**를 본다(`if (!zoneAwake())` · 종전 지역 변수 둘은 코드에서 사라졌다 — 판정 둘 0)');
  ok(/SimVillages\.init\(\{[^}]*\n\s*zoneAwake,/.test(ZC2), '⑤ ★[T410] 생활층에 **그 함수**를 주입한다(`deps.zoneAwake` · 새 문 0)');
  //   정본 글자 그대로 돌린다(존을 안 띄운다) — 문 열림(기본)은 사람 0 · 관측자 0 에서도 참 · 닫힘(`=1`)은 종전 그대로
  {
    const run = (skip, humans, npcs, obs) => new Function('ZONE_IDLE_SKIP', 'players', 'observers', za + '\nreturn zoneAwake();')(
      skip, new Map([...Array(humans)].map((_, i) => [i, { isNpc: false }]).concat([...Array(npcs)].map((_, i) => [100 + i, { isNpc: true }]))), new Map([...Array(obs)].map((_, i) => [i, {}])));
    const t = [run(false, 0, 5, 0), run(false, 1, 5, 0), run(true, 0, 5, 0), run(true, 1, 5, 0), run(true, 0, 5, 1), run(true, 0, 0, 0)];
    ok(t.join() === 'true,true,false,true,true,false',
      '⑤ ★★[T410 · 실행] 문 열림 = 사람 0 · 관측자 0 · 주민만 있어도 **참** · 닫힘 = 종전(사람 또는 관측자가 있어야 참 · 주민은 안 센다)', `[${t}]`);
  }
  //   awake: undefined = 주입 없음(랩·하네스) · true/false = 존이 깨어 있음/잠듦(주입된 판정이 불린 횟수를 적는다)
  const js = (env, awake) => probe(env, `const V=require(${VP}); const E=require(${EP}); const B=V.__farmBind(), P=V.__labProbe;
    const pl=new Map([[1,{pid:1,simJob:'farmer'}],[2,{pid:2,simJob:'farmer'}],[3,{pid:3,simJob:'fisher'}]]); const rs=[];
    const deps={players:pl}; ${awake === undefined ? '' : `deps.zoneAwake=()=>{rs.push('z');return ${awake};};`} P._t374Probe.setDeps(deps);
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); const farm=new Set(); for(let i=0;i<30;i++) farm.add((100+i)+',100');
    const vil={dbId:7,ccx:100,ccy:100,econ:ev,npcPids:[1,2,3],_farmSet:farm,_drySet:new Set(farm),_potSet:new Set(),_crop:new Map(),_cropClaim:new Set(),_terrSet:new Set(['100,100']),_site:null,_claim:new Set()};
    B._lifeHeadlessDay(vil); console.log(JSON.stringify({tasks:vil._mTk||0, crops:vil._crop.size, rs:rs.map(String), hl:[vil._t368HlBody===undefined?null:vil._t368HlBody, vil._t368HlBatch===undefined?null:vil._t368HlBatch]}))`);
  const off = js({}, true), on = js({ T368_FARM_ACT: '1' }, true), idle = js({ T368_FARM_ACT: '1' }, false), bare = js({ T368_FARM_ACT: '1' }, undefined);
  ok(off.tasks > 0 && off.crops > 0 && off.rs.length === 0, '⑤ [자명 통과 금지] 끈 판은 헤드리스가 **밭을 실제로 돈다**(파종 30) · 존 술어에 **안 닿는다**(끈 팔 무변)', `${off.tasks}건 · 술어 ${off.rs.length}회`);
  ok(on.tasks === 0 && on.crops === 0 && on.rs.join() === 'z', '⑤ ★★★[실행] 켠 판 · 존 깸 — 헤드리스 **작물 절 호출 0** — 같은 마을 · 같은 날 파종 0 · 판정은 한 번', `${on.tasks}건 · 판정 ${on.rs.length}회`);
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
  // ★[T499 ⓪] 넷째 글자는 **이동 문의 거울**이다 — T461 WASM 팔의 앞문(`_wwPre`)이 이동 문과 **같은 거름을 같은 차례로 먼저** 돌고
  //   켬이면 이동 문은 그 답(갈래 표)을 읽는다(같은 몸에 문이 둘이 되지 않는다 · 끔이면 `_WW` 가 없어 앞문 자체가 안 돈다).
  //   ⇒ 문은 여전히 **둘**(결정 · 이동). 셈은 글자 넷 = 정의 1 + 결정 1 + 이동 1 + 이동의 거울 1. 거울은 **글자로** 건다:
  //     이동 문의 거름 식이 앞문 안에 **글자 그대로** 있고, 그 밖 어디에도 셋째 문이 없다.
  const _gate = '!p.canadiaVillage && !_t316WalkAlways(p) && !isPositionActive(p.x, p.y)';
  const _pre = bodyOf(ZC, '_wwPre');
  ok((ZC.match(/_t316WalkAlways\(/g) || []).length === 4 && (_pre.match(/_t316WalkAlways\(/g) || []).length === 1 && _pre.includes(_gate)
     && ZC.split(_gate).length - 1 === 2,
     '⑦ 그 술어를 부르는 **문**은 그대로 **둘**(결정 · 이동 — 셋째 문 0) · 넷째 글자는 이동 문의 **거울**(`_wwPre` · 같은 거름 식 글자 그대로 · T499)');
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

// ── ⑫ [T449] 결산 문을 산다 — 관측 마을의 하루는 **팔 켜진 직업은 몸 · 나머지는 일괄** · 끔 = 종전(늘 거짓) 비트 동일 ─────
//   `_lifeDaily` 의 관측자 문은 `767b827e` 부터 수 셋을 넘겨(`anyViewerNear(x, y, r)`) **늘 거짓**이었다 — 정본은 `(점, r)`.
//   켜면 그 술어를 그 꼴로 묻고: ⓐ 헤드리스 결산은 그대로 부른다(그 함수가 팔로 직업을 가른다 — ⑤)
//   ⓑ 나무꾼·채집의 헤드리스 갈래는 관측 마을이면 **몸 명부**(일괄 명부 0 · T423 이중 식사 문법 — 한 몸이 두 번 안 한다).
//   ★실행 절은 정본 `_lifeDaily` 를 그대로 돈다(`__labProbe._t449Probe` · 존 술어는 zone.js 글자 그대로 — 사본 0).
console.log('\n⑫ [T449] 결산 문 — 켬이면 관측 마을은 팔 켜진 직업을 **몸이** 한다 · 끔 = 종전(늘 거짓) 비트 동일');
{
  const daily = bodyOf(VC, '_lifeDaily');
  ok(/^const T449_BODY_DAY = process\.env\.T449_BODY_DAY === '1';$/m.test(VC) && (VC.match(/process\.env\.T449_BODY_DAY/g) || []).length === 1,
    '⑫ ★손잡이 `T449_BODY_DAY` 는 **한 자리**에서 읽힌다 · `=== \'1\'` 이라야 켜진다(기본 끔)');
  //   ★점과 반경은 옛 줄의 두 식 **그대로**다(새 술어 0 · 새 수 0) — 옛 줄은 끈 팔을 위해 남는다
  ok(/return !!\(f && f\(\{ x: vil\.ccx \* SZ \+ SZ \/ 2, y: vil\.ccy \* SZ \+ SZ \/ 2 \}, \(vil\._maxRPx \|\| 800\) \+ 1600\)\);/.test(VC)
     && /if \(T449_BODY_DAY \|\| !\(anyNear && anyNear\(vil\.ccx \* SZ \+ SZ \/ 2, vil\.ccy \* SZ \+ SZ \/ 2, \(vil\._maxRPx \|\| 800\) \+ 1600\)\)\) \{/.test(daily),
    '⑫ ★★켬 = 그 술어를 **점 · 반경 그 수**로 묻는다(옛 줄의 두 식 그대로) · 끔 = 옛 줄 그대로(수 셋 — 늘 거짓)');
  ok(/const _t449S = T449_BODY_DAY && _t449Seen\(vil\);/.test(daily) && (daily.match(/_t449Seen\(vil\)/g) || []).length === 1,
    '⑫ 관측 마을인가는 하루 경계에 **한 번** 묻는다(끔이면 묻지도 않는다 — `&&` 앞이 거짓)');
  ok(/const _ln = _t449S \? 0 : _lnE;/.test(daily) && /const _fg = _t449S \? 0 : _fgE;/.test(daily),
    '⑫ ★★나무꾼·채집 — 관측 마을은 **일괄 명부에서 빠진다**(명부 한 칸 · 절의 글자는 그대로 — `test-wood-act ⑦`)');
  ok(!/_t449/.test(bodyOf(VC, '_lifeHeadlessDay')), '⑫ 헤드리스 결산 함수는 **무변**(팔로 직업을 이미 가른다 — ⑤ 글자 그대로)');
  //   ① 옛 줄이 왜 늘 거짓인가 — zone.js 의 정본 술어를 글자 그대로 돌린다(사람을 마을 한가운데 세워도 거짓)
  {
    const ZS2 = fs.readFileSync(path.join(ROOT, 'server/zone.js'), 'utf8');
    const aSrc = (ZS2.match(/function anyViewerNear\(center, r\) \{[\s\S]*?\n\}/) || [''])[0];
    const mk = (hx, hy) => new Function('players', 'observers', aSrc + '\nreturn anyViewerNear;')(new Map([['h', { isNpc: false, x: hx, y: hy }]]), new Map());
    const f = mk(1000, 1000);
    const r = [f({ x: 1000, y: 1000 }, 2400), f(1000, 1000, 2400), f({ x: 9000, y: 9000 }, 2400)];
    ok(aSrc.length > 200 && r.join() === 'true,false,false',
      '⑫ ★★★[실행] 존의 술어는 **점**을 받는다 — `(점, r)` 은 참 · 옛 호출 `(x, y, r)` 은 사람이 한가운데 서 있어도 **거짓**(767b827e 부터 죽은 문) · 먼 점은 거짓', `[${r}]`);
  }
  //   ② 정본 `_lifeDaily` 를 도는 판 — 나무꾼 둘(손이 빈 채 — 오늘 몸이 든 통나무 0) · 셀 12 × 3그루 · 관측자 = 마을 가운데 300px 사람
  const PX = JSON.stringify(path.join(ROOT, 'server/zone.js'));
  const day = (env, o) => probe(Object.assign({ T325_WOOD_ACT: '1', T347_FORAGE_ACT: '', T449_BODY_DAY: '', T374_DEMAND_STOP: '0' }, env),   // ★[T544 추신 ⓐ] 수요 문 기본 켬 — 이 판은 수요 문 없는 일괄을 잰다(끔 `'0'` 을 박는다)
   `const E=require(${EP}); const V=require(${VP}); const fs=require('fs'); const P=V.__labProbe;
    const aSrc=(fs.readFileSync(${PX},'utf8').match(/function anyViewerNear\\(center, r\\) \\{[\\s\\S]*?\\n\\}/)||[''])[0];
    const SZ=32, ccx=400, ccy=400; const players=new Map(), observers=new Map();
    ${o.obs ? 'players.set("h",{isNpc:false,x:ccx*SZ+16+300,y:ccy*SZ+16});' : ''}
    const anyViewerNear=new Function('players','observers',aSrc+'\\nreturn anyViewerNear;')(players,observers);
    players.set(1,{pid:1,isNpc:true,simJob:'lumberjack',inventory:{wood:${o.hand || 0}}}); players.set(2,{pid:2,isNpc:true,simJob:'lumberjack',inventory:{}});
    ${o.farm ? "players.set(3,{pid:3,isNpc:true,simJob:'farmer',inventory:{}});" : ''}
    const trees=new Map(); for(let i=0;i<12;i++) trees.set((ccx+10)+','+(ccy+i),3); let cut=0;
    const deps={players,broadcast(){},moveSpeed:64,dayPhaseRatio:0.7,worldPhase:()=>0.3,anyViewerNear,
      t325TreesAtCell:(cx,cy)=>{const n=trees.get(cx+','+cy)||0; return n>0?Array.from({length:n},(_,j)=>({id:cx+'_'+cy+'_'+j,seedKey:'s'+cx+'_'+cy+'_'+j})):[];},
      t325CutTreeAt:(cx,cy)=>{const k=cx+','+cy; const n=trees.get(k)||0; if(!n) return null; trees.set(k,n-1); cut++; return {wood:3};},
      t325LootOf:()=>({wood:3}), t341Unharvest:()=>0};
    P._t400Probe.setup({deps,db:{insertVillageBuilding:()=>1},dayMs:1440000,epoch:0,zoneId:'t449',tickCtx:{now:60*1440000}});   // ★[T491 ⓪] 시계 고정 — 게임일 60(5월 · 밭 파종창) · 벽시계를 따라가면 겨울(12~2월)엔 밭 일감이 0 이라 ④ 가 빨갛다
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); ev.counts=ev.counts||{}; ev.counts.lumberjack=2; const w0=ev.storage.wood||0;
    const terr=new Set(); for(let dx=-3;dx<=3;dx++) for(let dy=-3;dy<=3;dy++) terr.add((ccx+dx)+','+(ccy+dy));
    const farm=new Set(); ${o.farm ? 'for(let i=0;i<20;i++) farm.add((ccx-2+(i%5))+","+(ccy-2+Math.floor(i/5)));' : ''}
    const vil={dbId:7,name:'x',ccx,ccy,econ:ev,npcPids:[1,2${o.farm ? ',3' : ''}],_terrSet:terr,_farmSet:farm,_drySet:new Set(farm),_potSet:new Set(),_crop:new Map(),_cropClaim:new Set(),_claim:new Set(),_site:null,_houseCells:[],_granList:[],_maxRPx:200};
    P._t449Probe.daily(vil);
    console.log(JSON.stringify({seen:P._t449Probe.seen(vil),cut,wood:+((ev.storage.wood||0)-w0).toFixed(6),walked:vil._t325Dbg&&vil._t325Dbg.walked,tk:vil._mTk||0,t449:vil._t449||null}))`);
  const off0 = day({}, {}), off1 = day({}, { obs: true }), on0 = day({ T449_BODY_DAY: '1' }, {}), on1 = day({ T449_BODY_DAY: '1' }, { obs: true });
  ok(off0.seen === false && off1.seen === true && off0.cut > 0,
    '⑫ [전제 · 자명 통과 금지] 판이 실제로 벤다(일괄이 **나무를 쓰러뜨린다**) · 관측자를 세운 판은 새 술어로 **관측 마을**이다', `일괄 ${off0.cut}그루`);
  ok(off1.cut === off0.cut && off1.wood === off0.wood,
    '⑫ ★★[실행] 끔 · 관측 마을 = 비관측과 **같은 일괄**(결산 문이 죽어 있다 — 보는 앞에서 새벽에 나무가 쓰러진다 · 종전 그대로)', `${off1.cut}그루`);
  ok(on0.cut === off0.cut && on0.wood === off0.wood && on0.t449 && on0.t449.seen === 0 && off0.t449 === null,
    '⑫ ★★[실행] 켬 · 비관측 마을 = 끔과 **비트 동일**(몸 XOR 일괄 그대로) · 누계 칸은 켠 판에만 생긴다', `${on0.cut}그루 = ${off0.cut}`);
  ok(on1.cut === 0 && on1.wood === 0 && on1.t449 && on1.t449.seen === 1 && on1.t449.woodBody === 1,
    '⑫ ★★★[실행] 켬 · 관측 마을 = **일괄 0**(나무꾼은 몸 명부 — 그 마을의 하루는 몸이 오늘 한 만큼이다) · "일괄이었을 날" 1 을 센다', `${on1.cut}그루 · 몸 명부로 넘긴 날 ${on1.t449 && on1.t449.woodBody}`);
  //   ③ 이중 0 — 몸이 오늘 통나무를 들고 왔으면(손 > 0) 네 판 모두 일괄 0 · 손은 곳간으로(한 몸이 두 번 안 한다)
  const h = [day({}, { hand: 6 }), day({}, { hand: 6, obs: true }), day({ T449_BODY_DAY: '1' }, { hand: 6 }), day({ T449_BODY_DAY: '1' }, { hand: 6, obs: true })];
  ok(h.every((x) => x.cut === 0 && x.walked === 1 && x.wood > 0) && h.every((x) => x.wood === h[0].wood),
    '⑫ ★★[실행] 이중 0 — 몸이 든 통나무가 있으면 **네 판 모두** 일괄 0 · 곳간엔 몸이 든 그 몫만(한 몸이 두 번 안 한다)', h.map((x) => `${x.cut}/${x.wood}`).join(' · '));
  //   ④ 나머지 직업은 일괄 그대로 — 관측 마을 · 켬 · 농부 팔 끔이면 헤드리스 작물 절이 돈다 · 농부 팔 켬(존 깸)이면 몸
  const zAw = "deps.zoneAwake=()=>true;";
  const fa = (env) => day(Object.assign({ T449_BODY_DAY: '1', T325_WOOD_ACT: '' }, env), { obs: true, farm: true });
  const fOff = fa({}), fOn = probe(Object.assign({ T449_BODY_DAY: '1', T325_WOOD_ACT: '', T368_FARM_ACT: '1' }), `const V=require(${VP}); const E=require(${EP}); const B=V.__farmBind(), P=V.__labProbe;
    const pl=new Map([[3,{pid:3,simJob:'farmer'}]]); const deps={players:pl}; ${zAw} P._t374Probe.setDeps(deps);
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1}); const farm=new Set(); for(let i=0;i<20;i++) farm.add((100+i)+',100');
    const vil={dbId:7,ccx:100,ccy:100,econ:ev,npcPids:[3],_farmSet:farm,_drySet:new Set(farm),_potSet:new Set(),_crop:new Map(),_cropClaim:new Set(),_terrSet:new Set(['100,100']),_site:null,_claim:new Set()};
    B._lifeHeadlessDay(vil); console.log(JSON.stringify({tk:vil._mTk||0}))`);
  ok(fOff.tk > 0 && fOff.t449 && fOff.t449.hlFarm === 1,
    '⑫ ★★[실행] 나머지 직업은 **일괄 그대로** — 관측 마을 · 켬 · 농부 팔 끔 = 헤드리스 작물 절이 돈다(밭 일 ' + fOff.tk + ') · "관측 마을 일괄" 1 을 센다');
  ok(fOn.tk === 0, '⑫ [실행] 농부 팔 켬 · 존 깸 = 몸(작물 절 0 — ⑤ 의 그 판정 · 관측 마을은 언제나 존 깸)');
  ok(/t449: vil\._t449 \|\| null,/.test(VC), '⑫ `/lifedbg` 에 마을마다 누계 한 칸(끔이면 `null`)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
