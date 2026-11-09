#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1243-farm-on.js — 밭 세계 한 손잡이 · 한 번 거둔 식량 = 작물 낱개 값 · NPC 마을 첫 곳간 · 밭 일괄 걷음(T1243 · ★재민 11-09 족보 796 · 797) ==========
//
// 지키는 것:
//   ① `T1243_FARM_ON` 끔(미설정 · '0' · 그 밖 값) = 묶음 다섯 각자 손잡이 그대로 · 켬(`1`) = 다섯 다 켬(econ `T100_FIELD_YIELD` · `T368_FARM_ACT` · `T1221_FARM_LABOR` ·
//      작물 `T1215_FIELD_M2` · `T1201_BRONZE_CROPS` · `T1221_FARM_LABOR`) + 텃밭 하한 걷음(`T100_GARDEN` 거짓)
//   ② ⓑ 켬 — 작물을 단 수확은 낱개 × 그 작물 식량 값(`t368FoodPer` — 열량 정본 주입 · 생곡은 econ 정본) · 작물 없는 수확(`n × T100_K`)은 0 ·
//      ★자명 통과 금지: 끈 판의 작물 없는 수확은 `T100_K` 그대로(0 이 아니다)
//   ③ ⓒ 첫 곳간 — 식량 = 창설 곳간(사람 × 첫 수확까지) 그대로 · 품목 = 마을 밭 철 작물(청동기 묶음 안 · 식량 값 > 0) · Σ 낱개 × 값 = 그 식량(질량 보존) ·
//      첫 수확 = 청동기 묶음의 첫 수확(`crops.daysToFirstHarvest` 켬 갈래) · 겨울 창설은 다음 수확까지(더 길다) · 플레이어 마을(사람 0) 0 · 끔 = 무동작 · 복원 갈래는 안 부른다(서버 첫 시작만)
//   ④ 797 — 켬 + 라이브(존 주입) = 밭 일괄 셋(몸이 못 한 몫 · 몸 없는 econ 농부 · 존이 잔 날) 안 돈다 · 존 없는 판(랩 · CLI)은 종전
//
// 실행: node scripts/test-t1243-farm-on.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const KNOBS = ['T1243_FARM_ON', 'T100_FIELD_YIELD', 'T368_FARM_ACT', 'T1201_BRONZE_CROPS', 'T1215_FIELD_M2', 'T1221_FARM_LABOR', 'T100_GARDEN', 'T227_EVEN'];
const sub = (env, code) => {
  const e = Object.assign({}, process.env); delete e.NODE_OPTIONS; for (const k of KNOBS) delete e[k]; Object.assign(e, env);
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 }).trim().split('\n').filter((l) => l.startsWith('{')).pop());
};
console.log('\n=== T1243 — 밭 세계 켬 ===');
const Q = `const E=require('./sim/economy-sim');const C=require('./server/crops');const V=require('./server/villages');const B=V.__p3Bind({});
const o={on:E.T1243_FARM_ON,con:C.T1243_FARM_ON,fy:E.T100_FIELD_YIELD,fa:E.T368_FARM_ACT,el:E.T1221_FARM_LABOR,g:E.T100_GARDEN,m2:C.T1215_FIELD_M2,br:C.T1201_BRONZE_CROPS,cl:C.T1221_FARM_LABOR,K:E.T100_K,bron:[...C.T1201_BRONZE_SET]};
const W={villages:[]};
const mk=(pop,born)=>{const v=E.createVillage({initialPop:pop,name:'h'+pop+'_'+born,bornDay:born});v._world=W;return v;};
const v1=mk(20,0);const f0=v1.storage.food;const r=B._t1243Seed(v1,7);
o.seed={food0:f0,ret:r,foodAfter:v1.storage.food,crops:(v1._t1243Seed||{}).crops||[],sum:((v1._t1243Seed||{}).crops||[]).reduce((a,id)=>a+v1.storage[id]*E.t368FoodPer(v1,id),0),days:f0/20,d0:C.daysToFirstHarvest(0)};
const v1b=mk(20,0);B._t1243Seed(v1b,7);o.seedSame=JSON.stringify((v1b._t1243Seed||{}).crops)===JSON.stringify(o.seed.crops)&&o.seed.crops.every(id=>v1b.storage[id]===v1.storage[id]);
const v2=mk(20,250);o.winter={days:v2.storage.food/20,d:C.daysToFirstHarvest(250)};
const v3=mk(0,0);o.player={ret:B._t1243Seed(v3,9),food:v3.storage.food};
const h=mk(20,0);const s0=h.storage.food||0;const u=E.harvestToGranary(h,1,1);o.noCrop={ret:u,dFood:(h.storage.food||0)-s0+((h._t100Pend)||0),cnt:h._t1243NoCrop||0};
const h2=mk(20,0);B._t1243Seed(h2,7);const id='foxtail_millet';const a0=(h2.storage[id]||0)+((h2.treasury||{})[id]||0);const u2=E.harvestToGranary(h2,10,1,id);o.crop={ret:u2,per:E.t368FoodPer(h2,id),kc:require('./server/kcal').econUnitsOf(id,1),fe:h2._t368FoodTot||0,got:(h2.storage[id]||0)+((h2.treasury||{})[id]||0)-a0+((h2._t368Pend||{})[id]||0)};
o.live0=B._t1243Live();V.__p3Bind({deps:Object.assign({},B.state.deps||{},{zoneAwake:()=>true})});o.live1=B._t1243Live();
console.log(JSON.stringify(o));`;
const off = sub({}, Q), z = sub({ T1243_FARM_ON: '0' }, Q), x = sub({ T1243_FARM_ON: 'yes' }, Q), on = sub({ T1243_FARM_ON: '1' }, Q);
// ── ① ──
ok(!off.on && !z.on && !x.on && on.on && on.con && !off.con, '① 미설정 · 0 · 그 밖 값 = 끔 · `1` = 켬(econ · 작물 정본 같은 env 칸)');
ok(on.fy && on.fa && on.el && on.m2 && on.br && on.cl && !on.g, '① 켬 = 묶음 다섯 켬 + 텃밭 하한 걷음');
ok(!off.fy && !off.fa && !off.el && !off.m2 && !off.br && !off.cl && off.g && JSON.stringify(off) === JSON.stringify(z), '① 끔 = 각 손잡이 글자 그대로(다섯 끔 · 하한 켬 — 미설정과 `0` 같은 답)');
const one = sub({ T100_FIELD_YIELD: '1' }, Q);
ok(one.fy && !one.fa && !one.on, '① 끔이어도 각 손잡이 `=1` 은 종전대로 홀로 켜진다');
// ── ② ⓑ ──
ok(on.noCrop.ret === 0 && on.noCrop.cnt === 1 && on.noCrop.dFood === 0, '② 켬 — 작물 없는 수확 = 0(`n × T100_K` 갈래 닫힘 · 계측 칸만 하나)');
ok(off.noCrop.ret === 0 && one.noCrop.ret > 0 && Math.abs(one.noCrop.ret - one.K) < 1e-9, '② ★자명 통과 금지 — 끈 묶음 + 밭 산출만 켠 판의 작물 없는 수확 = `T100_K` 그대로', `${one.noCrop.ret.toFixed(3)} = K ${one.K.toFixed(3)}`);
ok(on.crop.ret === 10 && Math.abs(on.crop.per - on.crop.kc) < 1e-9 && Math.abs(on.crop.got - 10) < 1e-9 && Math.abs(on.crop.fe - 10 * on.crop.per) < 1e-9, '② 켬 — 작물 단 수확 = 낱개 그대로(곳간 + 세금 · 고르게면 대기 칸) · 식량 = 낱개 × 값 · 낱개 값 = 열량 정본(`kcal.econUnitsOf`)', `조 낱개 ${on.crop.per.toFixed(4)}`);
// ── ③ ⓒ ──
const S = on.seed;
ok(S.ret > 0 && S.foodAfter === 0 && Math.abs(S.sum - S.food0) < 1e-6 && S.days === S.d0, '③ 첫 곳간 — 식량 = 사람 × 첫 수확까지(정본) · `food` → 곡식 품목 · Σ 낱개 × 값 = 그 식량', `${S.food0} = 20 × ${S.d0} · 품목 ${S.crops.length}`);
ok(S.crops.length > 0 && S.crops.every((id) => on.bron.includes(id)) && on.seedSame, '③ 품목 = 마을 밭 철 작물(청동기 묶음 안) · 같은 마을 = 같은 답(결정론)', S.crops.join(' · '));
ok(S.d0 > off.seed.d0, '③ 켬 = 첫 수확이 마을이 심는 작물(청동기 묶음)의 첫 수확 — 끔 = 34종 그대로', `켬 ${S.d0} · 끔 ${off.seed.d0} 날`);
ok(on.winter.days === on.winter.d && on.winter.d > S.d0, '③ 겨울 창설 = 다음 수확까지(봄 창설보다 길다)', `${on.winter.d} > ${S.d0}`);
ok(on.player.ret === 0 && on.player.food === 0, '③ 플레이어 마을(사람 0) = 빈 곳간');
ok(off.seed.ret === 0 && off.seed.foodAfter === off.seed.food0 && off.seed.crops.length === 0, '③ 끔 = 무동작(`food` 그대로)');
const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/ev\._world = world;\s*if \(!row\.econ_state\) _t1243Seed\(ev, row\.id\);/.test(VS) && /if \(row\.econ_state\) \{\s*ev = restoreEcon\(row\.econ_state, econ\);/.test(VS), '③ 서버 첫 시작만(`econ_state` 없는 행) — 재시작 · 이어받기(복원 갈래)는 다시 안 준다');
// ── ④ 797 ──
ok(!on.live0 && on.live1, '④ 라이브 = 존 주입(`zoneAwake`)이 있는 판 · 없으면(랩 · CLI · 하네스) 종전');
ok(/const _cut = _t1243On\(\) && _t1243Live\(\);/.test(VS) && /if \(T1224_ECON_FARM && !_cut\)/.test(VS) && /if \(_body && T1212_FARM_REST && !_cut\)/.test(VS), '④ 켬 + 라이브 = 몸 없는 econ 농부(T1224) · 몸이 못 한 몫(T1212 ②) 안 돈다');
ok(/if \(!_body && !_cut\) _lifeClearDay\(vil, farmerN\);/.test(VS) && /if \(_cut\) \{ \/\* ★\[T1243\] 몸만 — 일괄 0 \*\/ \}\s*else if \(!_body\) lifeFarmDay\(/.test(VS), '④ 켬 + 라이브 = 존이 잔 날의 개간 · 작물 일괄도 안 돈다(몸이 못 한 일은 0)');
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
