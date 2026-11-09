#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1221-farm-labor.js — 칸 일 시간 = 고증 사람-시간 × 칸 넓이 · 수확 = 비옥 자리의 고증 범위(T1221 · ★재민 11-07 문 37) ==================
//
// 지키는 것:
//   ① `T1221_FARM_LABOR` 끔(미설정 · '0' · 그 밖 값) = 종전 — econ · 작물 정본 둘 다 끔 · 비옥 자리를 줘도 칸당 kg = T1215 값
//   ② 칸 일 시간(초 = 게임 분) = 고증 h/ha × 칸 넓이 ha × 60 — 파종(갈이 300 + 파종 80) · 김매기(350 ÷ 게임 차례 수) · 수확(210 + 탈곡 75) · 물대기 · 방제 = 종전 5 초 · 개간 = 칸 넓이 ÷ 38.7 m²/사람-시간
//   ③ 수확 범위 — 비옥 자리 0 = 아래 끝 · 1 = 위 끝(조 500 ~ 800 · 벼 320 ~ 1,130 · 콩 760) · 미확인은 T1215 다리 · 끈 판 = T1215 값 · ★자명 통과 금지: 0 ≠ 1
//   ④ 비옥 자리 = 세계 안 순위(가장 척박 0 · 가장 비옥 1 · 같으면 가운데)
//   ⑤ 일괄 — 켬이면 하루 몫이 초 · 일 하나의 시간이 남은 초보다 크면 그 일은 안 한다(더 짧은 일은 한다) · 끔 = 일감 1 ·
//      켬이면 급한 일부터(수확 > 방제 > 물대기 > 파종 > 김매기) · 끔 = 종전 칸 차례
//
// 실행: node scripts/test-t1221-farm-labor.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const sub = (env, code) => {
  const e = Object.assign({}, process.env); delete e.NODE_OPTIONS; delete e.T1221_FARM_LABOR; delete e.T1215_FIELD_M2; Object.assign(e, env);
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 }).trim().split('\n').filter((l) => l.startsWith('{')).pop());
};
console.log('\n=== T1221 — 농사 일손 · 비옥 범위 ===');
const Q = `const E=require('./sim/economy-sim');const C=require('./server/crops');const V=require('./server/villages');const B=V.__p3Bind({});
const o={e:E.T1221_FARM_LABOR,c:C.T1221_FARM_LABOR,m2:C.FIELD_CELL_M2,k:{},u:{},cost:[1,2,3,4,5].map(t=>B._t1221Cost(t)),clear:B._t1221ClearS(),wn:V.lifeTuning?null:null};
for(const id of ['foxtail_millet','millet','rice','soybean','barley','azuki','lettuce']){o.k[id]=[C.cellKgAt(id,0),C.cellKgAt(id,0.5),C.cellKgAt(id,1),C.cellKgOf(id)];o.u[id]=[C.harvestUnits(id,{supply:5,fert:0}),C.harvestUnits(id,{supply:5,fert:1}),C.harvestUnits(id,{supply:5})];}
console.log(JSON.stringify(o));`;
const off = sub({ T1215_FIELD_M2: '1' }, Q), z = sub({ T1215_FIELD_M2: '1', T1221_FARM_LABOR: '0' }, Q), x = sub({ T1215_FIELD_M2: '1', T1221_FARM_LABOR: 'yes' }, Q), on = sub({ T1215_FIELD_M2: '1', T1221_FARM_LABOR: '1' }, Q);
// ── ① ──
ok(!off.e && !off.c && !z.e && !x.e && on.e && on.c, '① 미설정 · 0 · 그 밖 값 = 끔 · `1` = 켬(econ · 작물 정본 같은 손잡이)');
ok(Object.keys(off.u).every((id) => off.u[id][0] === off.u[id][2] && off.u[id][1] === off.u[id][2]), '① 끔 — 비옥 자리를 줘도 칸 수확 = T1215 값');
// ── ② ──
const ha = on.m2 / 10000, S = (h) => h * ha * 60;
ok(Math.abs(on.cost[1] - S(300 + 80)) < 1e-9 && Math.abs(on.cost[0] - S(350 / 6)) < 1e-9 && Math.abs(on.cost[4] - S(210 + 75)) < 1e-9, '② 파종 · 김매기 · 수확 = 고증 h/ha × 칸 넓이 × 60', `${on.cost[1]} · ${on.cost[0].toFixed(1)} · ${on.cost[4]} 초`);
ok(on.cost[2] === 5 && on.cost[3] === 5, '② 물대기 · 방제 = 미확인 → 종전 5 초');
ok(Math.abs(on.clear - on.m2 / (5000 * 0.09290304 / 12) * 60) < 1e-9, '② 개간 칸 = 칸 넓이 ÷ 38.7 m²/사람-시간', `${on.clear.toFixed(1)} 초`);
// ── ③ ──
const R = { foxtail_millet: [500, 800], millet: [500, 800], rice: [320, 1130], soybean: [760, 760] };
ok(Object.entries(R).every(([id, r]) => Math.abs(on.k[id][0] - r[0] / 10000 * on.m2) < 1e-9 && Math.abs(on.k[id][2] - r[1] / 10000 * on.m2) < 1e-9 && Math.abs(on.k[id][1] - (r[0] + r[1]) / 2 / 10000 * on.m2) < 1e-9), '③ 출처 작물 — 자리 0 = 아래 끝 · 1 = 위 끝 · 0.5 = 가운데');
ok(on.u.foxtail_millet[0] < on.u.foxtail_millet[1] && on.u.rice[0] < on.u.rice[1] && on.k.barley[0] < on.k.barley[2], '③ ★자명 통과 금지 — 척박 < 비옥(조 · 벼 · 보리)', `조 ${on.u.foxtail_millet[0]} → ${on.u.foxtail_millet[1]} 낱`);
ok(Math.abs(on.k.barley[2] / on.k.foxtail_millet[2] - on.k.barley[3] / on.k.foxtail_millet[3]) < 1e-9, '③ 미확인(보리)은 T1215 다리 비 그대로');
ok(on.u.foxtail_millet[2] === off.u.foxtail_millet[2], '③ 비옥 자리를 안 준 부름(플레이어 밭)은 T1215 값');
// ── ④ ⑤ 글자 ──
const Vs = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/r = A\.length > 1 \? \(\(lo \+ hi - 1\) \/ 2\) \/ \(A\.length - 1\) : 0\.5;/.test(Vs), '④ 비옥 자리 = 세계 안 순위(같으면 가운데)');
ok(/if \(_L && _c > budget\) continue;/.test(Vs) && /budget -= _c; did\+\+; total\+\+;/.test(Vs) && /const _c = _L \? _t1221Cost\(t\) : 1;/.test(Vs), '⑤ 일괄 — 초를 일 시간만큼 쓴다 · 모자라면 그 일은 건너뛴다 · 끔 = 1');
ok(/let _ks = vil\._farmSet;\s*if \(_L\) \{ const a = \[\]; for \(const k of vil\._farmSet\) \{ const t = _cellTask\(vil, k, day\); if \(t > 0\) a\.push\(\[k, t\]\); \} a\.sort\(\(x, y\) => y\[1\] - x\[1\]\); _ks = a\.map\(\(x\) => x\[0\]\); \}\s*for \(const k of _ks\)/.test(Vs), '⑤ 켬 = 급한 일부터(`_cellTask` 차례 큰 것 먼저 · 안정 정렬) · 끔 = 종전 칸 차례');
ok(/npc\._jobT = \(_L && _ok\) \? now \+ _c \* _t1243MinMs\(\) : now \+ 9000 \+ \(_pidHash\(npc\.pid\) % 7\) \* 1500;/.test(Vs) && /function _t1243MinMs\(\) \{ return \(\(state\.dayMs > 0\) \? state\.dayMs : 1440000\) \/ 1440; \}/.test(Vs) && /t\.prog >= \(_t1221On\(\) \? _t1221ClearS\(\) \* dayMs \/ 1440 : dayMs \/ LIFE_CLEAR_PDAY\)/.test(Vs), '⑤ 몸 — 켬이면 일 시간(게임 분 × 하루 ÷ 1,440 ms)만큼 머문다 · 개간 칸도 같은 단위 · 끔 = 종전 9 ~ 18 초(T1243 고침 — 1,000 ms 박음은 판 자 하루에서 일 하나 2,280날)');
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
