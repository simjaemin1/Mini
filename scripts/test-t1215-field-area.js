#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1215-field-area.js — 칸 넓이 캐논: 밭 칸 하나 = 실제 땅 250 m² · 칸당 수확 = 고증 kg/ha(T1215 · ★재민 11-07 문 34 ㄱ) ==================
//
// 지키는 것:
//   ① `T1215_FIELD_M2` 끔(미설정 · '0' · 그 밖 값) = 종전 — 칸 수확 낱개 = 작물 표 등급 × 물 × 발아율 · 켬(`1`) = 칸당 kg ÷ 낱개 무게 × 물 × 발아율
//   ② 칸 넓이 = 사람당 심는 밭 3,000 m² ÷ `LAND_NEED`(village-layout 정본 — 하네스가 다시 나눠 대조) · 출처 작물 셋(조 · 기장 · 벼 · 콩)은 kg/ha ÷ 10,000 × 칸 넓이
//   ③ 미확인 작물은 같은 분류 확인 작물(곡물 → 조 · 콩류 → 콩 · 그 밖 → 조)에 작물 표 kg 비(등급 × 낱개 무게)로 잇는다 — ★자명 통과 금지: 보리 ≠ 조 · 채소 ≠ 0
//   ④ 한 정본 — 서버 마을 밭(`villages._t368Item`) · 플레이어 밭(`zone.js`) · 번들(랩)이 같은 함수(`harvestUnits`)를 부른다 · 번들에 켬 갈래가 실렸다
//
// 실행: node scripts/test-t1215-field-area.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const sub = (env) => {
  const e = Object.assign({}, process.env); delete e.NODE_OPTIONS; delete e.T1215_FIELD_M2; Object.assign(e, env);
  const code = `const C=require('./server/crops');const L=require('./server/village-layout');const o={on:C.T1215_FIELD_M2,m2:C.FIELD_CELL_M2,need:L.LAND_NEED,src:C.T1215_KG_HA,u:{},kg:{},g:{},w:{},per:{}};
for(const id of C.IDS){o.u[id]=[C.harvestUnits(id,{supply:5}),C.harvestUnits(id,{supply:1}),C.harvestUnits(id,{supply:5,seedFresh:0.5})];o.kg[id]=C.cellKgOf(id);const c=C.get(id);o.g[id]=[c.group,c.yield];o.w[id]=[C.waterMult(id,5),C.waterMult(id,1)];o.per[id]=C.kgOf(id);}
console.log(JSON.stringify(o));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 }).trim().split('\n').filter((l) => l.startsWith('{')).pop());
};
console.log('\n=== T1215 — 칸 넓이 캐논 ===');
const off = sub({}), z = sub({ T1215_FIELD_M2: '0' }), x = sub({ T1215_FIELD_M2: 'yes' }), on = sub({ T1215_FIELD_M2: '1' });
// ── ① ──
ok(!off.on && !z.on && !x.on && on.on, '① 미설정 · 0 · 그 밖 값 = 끔 · `1` = 켬');
const legacy = Object.keys(off.u).every((id) => { const [g, w] = [off.g[id][1], off.w[id]]; return off.u[id][0] === Math.floor(g * w[0] + 1e-9) && off.u[id][1] === Math.floor(g * w[1] + 1e-9) && off.u[id][2] === Math.floor(g * w[0] * 0.5 + 1e-9); });
ok(legacy && JSON.stringify(off.u) === JSON.stringify(z.u), '① 끔 = 종전 — 등급 × 물 × 발아율(34종 전수)');
const neu = Object.keys(on.u).every((id) => { const per = on.per[id]; if (!(per > 0)) return on.u[id][0] === 0; return on.u[id][0] === Math.floor(on.kg[id] / per * on.w[id][0] + 1e-9) && on.u[id][1] === Math.floor(on.kg[id] / per * on.w[id][1] + 1e-9) && on.u[id][2] === Math.floor(on.kg[id] / per * on.w[id][0] * 0.5 + 1e-9); });
ok(neu, '① 켬 = 칸당 kg ÷ 낱개 무게 × 물 × 발아율(34종 전수)');
// ── ② ──
ok(on.m2 === 3000 / on.need, '② 칸 넓이 = 사람당 심는 밭 3,000 m² ÷ LAND_NEED', `${on.m2} = 3000 ÷ ${on.need}`);
const srcOk = Object.entries(on.src).every(([id, kh]) => Math.abs(on.kg[id] - kh / 10000 * on.m2) < 1e-9);
ok(srcOk && on.src.foxtail_millet === 650 && on.src.rice === 1000 && on.src.soybean === 760, '② 출처 작물 — kg/ha ÷ 10,000 × 칸 넓이(조 · 기장 650 · 벼 1,000 · 콩 760)', `조 ${on.kg.foxtail_millet} kg · 벼 ${on.kg.rice} kg`);
// ── ③ ──
const ref = (id) => on.src[id] != null ? null : (on.g[id][0] === '콩류' ? 'soybean' : 'foxtail_millet');
const gk = (id) => on.g[id][1] * on.per[id];
const bridgeOk = Object.keys(on.kg).filter((id) => ref(id)).every((id) => Math.abs(on.kg[id] - on.kg[ref(id)] * gk(id) / gk(ref(id))) < 1e-9);
ok(bridgeOk, '③ 미확인 — 같은 분류 확인 작물(곡물 조 · 콩류 콩 · 그 밖 조)에 작물 표 kg 비로');
ok(on.kg.barley !== on.kg.foxtail_millet && on.kg.lettuce > 0 && on.kg.azuki !== on.kg.soybean, '③ ★자명 통과 금지 — 보리 ≠ 조 · 상추 > 0 · 팥 ≠ 콩', `보리 ${on.kg.barley.toFixed(2)} · 상추 ${on.kg.lettuce.toFixed(2)} · 팥 ${on.kg.azuki.toFixed(2)}`);
ok(JSON.stringify(on.kg) === JSON.stringify(off.kg), '③ 칸당 kg(`cellKgOf`)는 켬 · 끔 같은 답(표 · 계측이 읽는다)');
// ── ④ ──
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const BUN = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
ok(/C\.harvestUnits\(e\.c, \{ supply: vil\._drySet\.has\(k\) \? 1 : 5, seedFresh: 1 \}\)/.test(V), '④ 서버 마을 밭이 같은 함수');
ok((Z.match(/Crops\.harvestUnits\(/g) || []).length >= 5, '④ 플레이어 밭(존) 다섯 자리가 같은 함수', `${(Z.match(/Crops\.harvestUnits\(/g) || []).length}`);
ok(/const FIELD_CELL_M2 = 250;/.test(BUN) && /if \(T1215_FIELD_M2\) \{ const per = kgOf\(id\)/.test(BUN), '④ 번들(랩)에 같은 정본이 실렸다(다시 굽기)');
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
