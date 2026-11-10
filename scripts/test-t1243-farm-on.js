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
o.grp=Object.fromEntries(C.IDS.map(id=>[id,C.get(id).group]));o.seed={food0:f0,ret:r,foodAfter:v1.storage.food,crops:(v1._t1243Seed||{}).crops||[],sum:((v1._t1243Seed||{}).crops||[]).reduce((a,id)=>a+v1.storage[id]*E.t368FoodPer(v1,id),0),days:f0/20,d0:C.daysToFirstHarvest(0)};
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
ok(S.crops.length > 0 && S.crops.every((id) => on.bron.includes(id) && (on.grp[id] === '곡물' || on.grp[id] === '콩류')) && on.seedSame, '③ 품목 = 마을 밭 철 곡식(청동기 묶음 안 · 곡물 · 콩류 — 박 · 들깨는 곡식이 아니다) · 같은 마을 = 같은 답(결정론)', S.crops.join(' · '));
ok(S.d0 > off.seed.d0, '③ 켬 = 첫 수확이 마을이 심는 작물(청동기 묶음)의 첫 수확 — 끔 = 34종 그대로', `켬 ${S.d0} · 끔 ${off.seed.d0} 날`);
ok(on.winter.days === on.winter.d && on.winter.d > S.d0, '③ 겨울 창설 = 다음 수확까지(봄 창설보다 길다)', `${on.winter.d} > ${S.d0}`);
ok(on.player.ret === 0 && on.player.food === 0, '③ 플레이어 마을(사람 0) = 빈 곳간');
ok(off.seed.ret === 0 && off.seed.foodAfter === off.seed.food0 && off.seed.crops.length === 0, '③ 끔 = 무동작(`food` 그대로)');
const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/ev\._world = world;\s*if \(!row\.econ_state\) _t1243Seed\(ev, row\.id\);/.test(VS) && /if \(row\.econ_state\) \{\s*ev = restoreEcon\(row\.econ_state, econ\);/.test(VS), '③ 서버 첫 시작만(`econ_state` 없는 행) — 재시작 · 이어받기(복원 갈래)는 다시 안 준다');
// ── ④ 797 ──
ok(!on.live0 && on.live1, '④ 라이브 = 존 주입(`zoneAwake`)이 있는 판 · 없으면(랩 · CLI · 하네스) 종전');
ok(/const _cut = _t1243On\(\) && _t1243Live\(\);/.test(VS) && /if \(T1224_ECON_FARM && !_cut\)/.test(VS) && /if \(_body && T1212_FARM_REST && !_cut\)/.test(VS), '④ 켬 + 라이브 = 몸 없는 econ 농부(T1224) · 몸이 못 한 몫(T1212 ②) 안 돈다');
//   ★[T1252] 주석 글자(`몸만 — 일괄 0`)로 갈래를 짚지 않는다 — `_cut` 갈래가 **코드 0**(주석만 · 빈 몸)이고 바로 뒤가 일괄(`else if (!_body) lifeFarmDay(`)인 꼴을 본다.
//     미끼: 그 갈래에 일괄 한 줄을 넣은 사본은 빨강이어야 한다(글자만 맞추는 자명 통과 금지).
const CUT_EMPTY = /if \(_cut\) \{\s*(?:\/\*[^*]*(?:\*(?!\/)[^*]*)*\*\/\s*)?\}\s*else if \(!_body\) lifeFarmDay\(/;
ok(/if \(!_body && !_cut\) _lifeClearDay\(vil, farmerN\);/.test(VS) && CUT_EMPTY.test(VS), '④ 켬 + 라이브 = 존이 잔 날의 개간 · 작물 일괄도 안 돈다(몸이 못 한 일은 0 · `_cut` 갈래 코드 0)');
{ const bait = VS.replace(/if \(_cut\) \{\s*(\/\*[^*]*(?:\*(?!\/)[^*]*)*\*\/)?\s*\}/, (m, c) => `if (_cut) { ${c || ''} lifeFarmDay(vil, _farmDay(vil, day), farmerN); }`);
  ok(bait !== VS && !CUT_EMPTY.test(bait), '④ 미끼 — `_cut` 갈래에 일괄(`lifeFarmDay`)을 넣은 사본은 잡힌다(빈 갈래만 지나간다)'); }
// ── ⑤ 추신 ──
const Q5 = `const E=require('./sim/economy-sim');const C=require('./server/crops');const V=require('./server/villages');const K=require('./server/kcal');
const o={g:['rice','wheat','barley'].map(r=>[E.rawGrainF(r),K.econUnitsOf(r,1),E.RAW_GRAIN_FOOD_FACTOR]),st:E.T1243_GRAIN_STATE,
gd:['barnyard_millet','millet','foxtail_millet'].map(i=>C.growDaysOf(i)),keep:C.keepDaysOf('barnyard_millet'),kh:C.T1221_KG_HA.barnyard_millet||null,k15:C.T1215_KG_HA.barnyard_millet||null};
const mk=(id,fert)=>{const fs=new Set(),ds=new Set();for(let i=0;i<12;i++){const k=(id*100+i)+',5';fs.add(k);if(i>=4)ds.add(k);}const st={};for(const c of C.T1201_BRONZE_SET)st[C.seedOf(c)]=100;return {dbId:id,name:'v'+id,_farmSet:fs,_drySet:ds,_crop:new Map(),econ:{land:{fertility:fert},storage:st}};};
const vs=[mk(1,0.3),mk(2,1.2),mk(3,0.8),mk(4,0.9)];const B=V.__p3Bind({villages:vs,world:{day:0}});const F=V.__farmBind();
let seedReturnV1=0;const log=[];for(let day=0;day<365*3;day++){B.state.world.day=day;for(const v of vs.slice(0,2))for(const k of v._farmSet){const e0=v._crop.get(k),sd0=Object.entries(v.econ.storage).filter(([k])=>k.startsWith('seed_')).reduce((n,[k,u])=>n+u,0);if(F._cellTask(v,k,day)>0&&F._lifeDoTask0(v,null,k,day)){const e=v._crop.get(k);if(!e0&&e)log.push([v.dbId,k,day,e.c]);else if(e0&&!e){log.push([v.dbId,k,day,'H:'+e0.c]);if(v.dbId===1)seedReturnV1+=Object.entries(v.econ.storage).filter(([k])=>k.startsWith('seed_')).reduce((n,[k,u])=>n+u,0)-sd0;}}}}
o.seedReturnV1=seedReturnV1;o.log=log;o.stat=B._t1243PStat;o.bron=[...C.T1201_BRONZE_SET];
const SD=new Set([...C.T1201_BRONZE_SET].map(c=>C.seedOf(c)));o.seedEnd=Object.fromEntries(Object.entries(vs[0].econ.storage).filter(([k,n])=>SD.has(k)&&n!==100));
const w=mk(7,0.5);for(const c of C.T1201_BRONZE_SET)w.econ.storage[C.seedOf(c)]=0;w.econ.storage[C.seedOf('millet')]=1;
o.noSeed=[];for(const k of w._farmSet){const d=40;if(F._cellTask(w,k,d)>0&&F._lifeDoTask0(w,null,k,d))o.noSeed.push(w._crop.get(k).c);}o.noSeedLeft=w.econ.storage[C.seedOf('millet')];
const v9=mk(9,0.5);v9._crop.set('900,5',{c:'soybean',p:0,td:0,w:0,wd:6,ps:0,q:1});v9._crop.set('904,5',{c:'foxtail_millet',p:0,td:0,w:0,wd:6,ps:0,q:1});
o.hc=[B._t1243HarvH?B._t1243HarvH(v9,'900,5'):null,B._t1243HarvH?B._t1243HarvH(v9,'904,5'):null];o.c5=[B._t1221Cost(5),B._t1221Cost(5,v9,'900,5')];
console.log(JSON.stringify(o));`;
const p5 = sub({ T1243_FARM_ON: '1' }, Q5), p50 = sub({}, Q5);
ok(p5.g.every(([f, u]) => Math.abs(f - u) < 1e-12) && p50.g.every(([f, , r]) => f === r && r === 0.72), '⑤ 추신 1 — 켬 = 생곡 셋 낱개 값 = 열량 정본 × 상태 몫(0.72 를 또 곱하지 않는다) · 끔 = 0.72', p5.g.map((x) => x[0].toFixed(3)).join(' · '));
ok(p5.st.rice.st === '확인' && p5.st.wheat.st === '미확인' && p5.st.barley.st === '미확인' && [p5.st.rice, p5.st.wheat, p5.st.barley].every((x) => x.ratio === 1), '⑤ 추신 1 — 상태 표(벼 확인 · 밀 · 보리 미확인 = 몫 1 · 새 수 0)');
ok(p5.hc[0] > 0 && p5.hc[1] > 0 && Math.abs(p5.c5[1] - p5.hc[0] * 60) < 1e-9 && p5.c5[0] !== p5.c5[1], '⑤ 추신 2 — 수확 + 털기 = 산물 t 당(칸을 주면) · 칸을 모르면 종전 h/ha', `콩 칸 ${p5.hc[0].toFixed(2)} h · 조 칸 ${p5.hc[1].toFixed(2)} h`);
const sown = p5.log.filter((x) => !String(x[3]).startsWith('H:')), reap = p5.log.filter((x) => String(x[3]).startsWith('H:'));
ok(sown.length > 0 && sown.every((x) => p5.bron.includes(x[3])), '⑤ 추신 6 — 고른 작물은 청동기 묶음 · 철(그 달 심을 수 있는 것)만', `심음 ${sown.length}`);
const byCell = {}; for (const x of p5.log) (byCell[x[0] + '|' + x[1]] = byCell[x[0] + '|' + x[1]] || []).push(x);
let yearOk = true;
for (const L of Object.values(byCell)) { const H = L.filter((x) => String(x[3]).startsWith('H:')); for (let i = 1; i < H.length; i++) if (H[i][2] - H[i - 1][2] < 365) yearOk = false; }
ok(yearOk && reap.length > 0, '⑤ 추신 3 — 한 칸 두 수확 사이 ≥ 한 해(365날)', `거둠 ${reap.length}`);
const v1M = sown.filter((x) => x[0] === 1 && +x[1].split(',')[0] < 104 && x[2] < 200).map((x) => x[3]), v2M = sown.filter((x) => x[0] === 2 && +x[1].split(',')[0] < 204 && x[2] < 200).map((x) => x[3]);
ok(v1M[0] === 'barnyard_millet' && v2M[0] === 'rice', '⑤ 추신 6 — 땅을 본다: 가장 척박한 마을 논의 첫 작물 = 피 · 가장 비옥한 마을 = 벼(번호 홀짝이 아니다)', `척박 ${v1M.join(',')} · 비옥 ${v2M.join(',')}`);
ok(new Set(v1M).size > 1, '⑤ 추신 6 — 나눠 심기(한 작물이 그 자리 칸의 1/후보 수를 넘지 않는다)');
const p5b = sub({ T1243_FARM_ON: '1' }, Q5);
ok(JSON.stringify(p5b.log) === JSON.stringify(p5.log), '⑤ 추신 6 — 결정론(같은 입력 = 같은 답)');
ok(/if \(_t1243On\(\)\) return _t1243Pick\(vil, k, day\) \? 2 : 0;/.test(VS) && /const cr = _P \? _t1243Pick\(vil, k, day\) : _villageCropFor\(/.test(VS), '⑤ 추신 6 — 끔 = `_villageCropFor` 해시 그대로');
ok(p5.gd[0] === 123 && p5.gd[1] === 83 && p50.gd[0] === 60 && p50.gd[1] === 48 && p5.gd[0] >= 100 && p5.gd[0] <= 140 && p5.gd[1] >= 75 && p5.gd[1] <= 90, '⑤ 추신 7 — 켬 = 피 · 기장 자라는 날 고증(S10 100 ~ 140 · R13 75 ~ 90 안) · 끔 = 카탈로그(60 · 48)', `켬 ${p5.gd[0]} · ${p5.gd[1]}`);
ok(p5.keep === p50.keep && p5.keep >= 180, '⑤ 추신 8 — 피 저장성 5(xlsx → crops.json) · 켬 · 끔 같은 값', `${p5.keep}일`);
ok(JSON.stringify(p5.kh) === '[747,1020]' && p5.k15 === 883.5, '⑤ 추신 9 — 피 747 ~ 1,020 kg/ha(T1221 범위) · 칸 넓이 갈래는 그 가운데');
ok(p5.bron.includes('perilla') && p5.bron.includes('gourd') && p5.bron.length === 12, '⑥ 추신 4 · 12 — 청동기 묶음에 들깨 · 박(근거 하나라도 있으면 넣는다)', `${p5.bron.length}종`);
ok(p5.noSeed.length === 1 && p5.noSeed[0] === 'millet' && p5.noSeedLeft === 0, '⑥ 추신 14 — 씨가 없는 작물은 후보에서 빠진다 · 심으면 곳간 씨 하나(씨 하나뿐이면 한 칸만)', JSON.stringify(p5.noSeed));
{ const sown1 = p5.log.filter((x) => x[0] === 1 && !String(x[3]).startsWith('H:')).length, reap1 = p5.log.filter((x) => x[0] === 1 && String(x[3]).startsWith('H:')).length;
  const used = Object.values(p5.seedEnd).reduce((a, n) => a + (100 - n), 0);
  ok(used === sown1 - p5.seedReturnV1, '⑥ T1245 씨 셈: 심은 씨 − 실제 부족분 반환 = 곳간 씨가 준 수(재고 충분이면 반환 0)', `심음 ${sown1} · 거둠 ${reap1} · 줄어든 씨 ${used}`); }
ok(/if \(!row\.econ_state\) _t1243SeedCells\(state\.villages\[state\.villages\.length - 1\]\);/.test(VS), '⑥ 추신 14 — 첫 해 씨는 서버 첫 시작만(곳간 첫 곡식과 같은 자리)');
// ── ⑦ 추신 5 — 밭 내기 ──
const Q7 = `const T=require('./server/terr-cost');const V=require('./server/villages');const B=V.__p3Bind({villages:[]});
const v={_t1243Cl:new Set(['3,4'])};console.log(JSON.stringify({f0:T.fieldClearMin(0),f1:T.fieldClearMin(1),map:T.cellM2('map'),fld:T.cellM2('field'),rate:T.clearMinPerM2(),a:B._t1221ClearS(v,'3,4'),b:B._t1221ClearS(v,'9,9'),c:B._t1221ClearS()}));`;
const c7 = sub({ T1243_FARM_ON: '1' }, Q7), c70 = sub({}, Q7);
ok(c7.f0 === c7.rate * c7.fld && Math.abs(c7.f0 - 360) < 1e-9 && Math.abs(c7.f1 - (360 - c7.rate * c7.map)) < 1e-9 && c7.map === 1 && c7.fld === 250, '⑦ 추신 5 — 밭 내기 = 개간 1.44 사람·분/m² × (밭 250 m² − 이미 개간한 넓이) · 영토 칸은 지도 1 m²', `${c7.f0} · ${c7.f1.toFixed(2)} 분`);
ok(Math.abs(c7.a - c7.f1) < 1e-9 && Math.abs(c7.b - 360) < 1e-9 && Math.abs(c7.c - 360) < 1e-9, '⑦ 추신 5 — 켬: NPC 칸 개간 = 같은 정본(영토 넓히기에서 몸이 개간한 칸은 그 넓이를 뺀다 · 칸을 모르면 뺄 것 없음)');
ok(Math.abs(c70.a - 250 / (5000 * 0.09290304 / 12) * 60) < 1e-9 && c70.a === c70.c, '⑦ 추신 5 — 끔: T1221 그대로(38.7 m²/사람-시간 · 387.5 분)');
ok(/if \(T1207_TERR_REAL && _t1243On\(\)\) \{ if \(!vil\._t1243Cl\) vil\._t1243Cl = new Set\(\); for \(const k of keys\) vil\._t1243Cl\.add\(k\); \}/.test(VS) && /'_t1243Prev', '_t1243Cl'\];/.test(VS), '⑦ 추신 5 — 몸이 개간해 넓힌 칸 표식은 영토 넓히기 문(`_terrAdd` · 영토 실물화 켬) 한 곳 · 재기동 곁 칸');
const ZS = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
ok(/if \(Crops\.T1243_FARM_ON\) \{   \/\/ ★\[T1243 추신 5\] 켬 = 새 밭은 몸으로 먼저 일군다/.test(ZS) && /if \(b\.data && b\.data\.clr\) continue;/.test(ZS) && /if \(Crops\.T1243_FARM_ON\) \{ const _cb = _t1243ClrNear\(player\); if \(_cb\) \{ _t1243ClrWork\(player, _cb\); return; \} \}/.test(ZS) && /SimVillages\.t1243FieldClearMinAt\(cx, cy\)/.test(ZS), '⑦ 추신 5 — 플레이어 같은 규칙: 새 밭 = 일굴 밭(씨 안 씀) · 곁에서 E 손짓 시간이 쌓여야 빈 밭 · 같은 정본 · 끔 = 종전');
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
