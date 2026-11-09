#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1201-bronze-crops.js — 마을 밭 후보를 청동기 작물로(T1201 · ★재민 11-07 문 33 ㄴ) ==================
//
// 지키는 것:
//   ① `T1201_BRONZE_CROPS` 끔(미설정 · '0' · 그 밖 값) = 종전 — 마을 고르기가 그 달 파종 후보 전부에서 고른다(청동기 밖 작물도 나온다)
//   ② 켬(`1`) — 고른 작물은 늘 청동기 열 가지 ∩ 그 달 그 자리 파종 후보 · 그 교집합이 비면 `null`(안 심는다)
//   ③ 청동기 열두 가지(T1243 추신 12 — 들깨 · 박)는 모두 작물 표에 있고 먹을 것이다(오타 · 특용 0)
//   ④ 플레이어 쪽 파종 후보(`sowableMonth`)는 켜도 같다(마을 고르기만 바뀐다)
//
// 실행: node scripts/test-t1201-bronze-crops.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const sub = (env) => {
  const e = Object.assign({}, process.env); delete e.NODE_OPTIONS; delete e.T1201_BRONZE_CROPS;
  Object.assign(e, env);
  const code = `const C=require('./server/crops');const o={on:C.T1201_BRONZE_CROPS,set:[...C.T1201_BRONZE_SET],picks:[],sow:{}};
for(const f of ['논','밭'])for(let mo=1;mo<=12;mo++){o.sow[f+mo]=C.sowableMonth(f,mo);for(let s=0;s<60;s++)for(const p of [0,1])o.picks.push([f,mo,s,p,C.villageCropPick(s*7919+13,f,mo,p)])}
o.info=Object.fromEntries([...C.T1201_BRONZE_SET].map(id=>[id,{crop:!!C.get(id),food:C.isFood(id)}]));console.log(JSON.stringify(o));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 }).trim().split('\n').pop());
};
console.log('\n=== T1201 — 마을 밭 후보 = 청동기 작물 ===');
const off = sub({}), z = sub({ T1201_BRONZE_CROPS: '0' }), x = sub({ T1201_BRONZE_CROPS: 'yes' }), on = sub({ T1201_BRONZE_CROPS: '1' });
const SET = new Set(on.set);
ok(!off.on && !z.on && !x.on && on.on, '① 미설정 · 0 · 그 밖 값 = 끔 · `1` = 켬');
ok(JSON.stringify(off.picks) === JSON.stringify(z.picks) && JSON.stringify(off.picks) === JSON.stringify(x.picks), '① 끔 셋은 같은 고르기');
const offIn = off.picks.filter((r) => r[4] != null).every((r) => off.sow[r[0] + r[1]].includes(r[4]));
const offOut = off.picks.filter((r) => r[4] != null && !SET.has(r[4])).length;
ok(offIn && offOut > 0, '① 끔 — 고른 작물은 그 달 후보 안 · 청동기 밖 작물도 나온다(자명 통과 금지)', `청동기 밖 ${offOut}/${off.picks.length}`);
let bad = 0, nulls = 0, wrongNull = 0;
for (const r of on.picks) {
  const inter = on.sow[r[0] + r[1]].filter((id) => SET.has(id));
  if (r[4] == null) { nulls++; if (inter.length) wrongNull++; continue; }
  if (!inter.includes(r[4])) bad++;
}
ok(bad === 0 && wrongNull === 0, '② 켬 — 고른 작물 ⊂ 청동기 ∩ 그 달 후보 · 교집합이 빌 때만 null', `어긋남 ${bad} · 빈 달 null ${nulls}`);
ok(on.set.length === 12 && on.set.includes('perilla') && on.set.includes('gourd') && Object.values(on.info).every((i) => i.crop && i.food), '③ 청동기 열두 가지(T1243 추신 12 — 들깨 · 박 더함) — 작물 표에 있고 먹을 것', on.set.join(','));
ok(JSON.stringify(on.sow) === JSON.stringify(off.sow), '④ 파종 후보(`sowableMonth` — 플레이어 · 첫 수확일)는 켜도 같다');
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
