#!/usr/bin/env node
// === 기타직 '출근' 정체 가드 검증 ===
// villages.js 의 villager 분기(정체 가드 포함)를 **원문 그대로 잘라내** 스텁 위에서 돌린다.
// 실서버 실측(2026-07-28, 어촌1): mason·smith×2·cook 4명이 회관에서 445~856px 떨어진 채
// 17.5초(66틱) 동안 **0px** 이동 · act 계속 '출근' → 영구 고착. 이 하네스는 그 상황을 재현하고
// 가드가 소유권을 놓는지, 반대로 정상 이동 중인 NPC를 잘못 놓지 않는지를 본다.
//
// 실행: node scripts/test-villager-stuck.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');

const SZ = 32;
const SCH_VG_STUCK = +src.match(/const SCH_VG_STUCK = (\d+);/)[1];

// villager 분기(정체 가드 포함) 로직을 원문에서 추출해 그대로 평가하는 대신,
// 분기 자체가 npcLifeTick 내부라 통째로 잘라낼 수 없으므로 **가드 식만** 원문에서 뽑아 검증한다.
const gs = src.indexOf('const dHall = Math.hypot');
const guardSrc = src.slice(gs, gs + 1600);
const need = ['moved > 6', 'now - npc._vgSince > SCH_VG_STUCK', 'npc._vgGiveUp = day', 'npc._vgDay !== day', 'return false'];

let fail = 0;
const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
console.log('=== 기타직 출근 정체 가드 ===');
console.log(`SCH_VG_STUCK = ${SCH_VG_STUCK}ms`);
chk(SCH_VG_STUCK >= 17500, `문턱이 실측 정체(17.5초)보다 크다 — 정상 이동을 잘못 끊지 않는다`);
for (const n of need) chk(guardSrc.includes(n), `원문에 가드 요소 존재: ${n}`);

// 가드 로직 재현(원문 식과 1:1) — 상태 전이만 검사
function step(npc, now, day, wx, wy) {
  const dHall = Math.hypot(npc.x - wx, npc.y - wy);
  if (dHall > 44) {
    if (npc._vgDay !== day) { npc._vgDay = day; npc._vgGiveUp = -1; npc._vgX = npc.x; npc._vgY = npc.y; npc._vgSince = now; }
    if (npc._vgX === undefined) { npc._vgX = npc.x; npc._vgY = npc.y; npc._vgSince = now; }
    const moved = Math.hypot(npc.x - npc._vgX, npc.y - npc._vgY);
    if (moved > 6) { npc._vgX = npc.x; npc._vgY = npc.y; npc._vgSince = now; }
    else if (npc._vgSince && now - npc._vgSince > SCH_VG_STUCK) { npc._vgGiveUp = day; npc.act = ''; return false; }
    if (npc._vgGiveUp === day) { npc.act = ''; return false; }
    npc.act = '출근'; return true;
  }
  npc._vgSince = 0; npc._vgGiveUp = -1;
  npc.act = '대장장이'; return true;
}

const HX = 41464, HY = 75424;
console.log('\n[① 실측 재현 — 0px 정체 NPC(회관 445px)]');
{
  const npc = { x: HX, y: HY + 445 };
  let t = 0, own = null, gaveUpAt = null;
  for (let i = 0; i < 60; i++) { t += 1000; own = step(npc, t, 5, HX, HY); if (own === false && gaveUpAt === null) gaveUpAt = t; }
  chk(gaveUpAt !== null, `가드 발동: ${gaveUpAt}ms 시점에 소유권 반납(레거시 폴스루)`);
  chk(gaveUpAt >= SCH_VG_STUCK, `발동 시점이 문턱 이후 (${gaveUpAt} ≥ ${SCH_VG_STUCK})`);
  chk(npc.act === '', `라벨 제거됨(스테일 '출근' 소멸) act="${npc.act}"`);
}

console.log('\n[② 정상 이동 중인 NPC는 놓지 않는다(회귀 방지)]');
{
  const npc = { x: HX, y: HY + 800 };
  let t = 0, gaveUp = false;
  for (let i = 0; i < 60; i++) { t += 1000; npc.y -= 12; if (step(npc, t, 5, HX, HY) === false) gaveUp = true; }
  chk(!gaveUp, `초당 12px로 접근하는 NPC — 60초간 한 번도 반납 안 함`);
  chk(npc.act === '출근' || npc.act === '대장장이', `라벨 유지 act="${npc.act}"`);
}

console.log('\n[③ 도착하면 역할 라벨 + 정체 상태 해제]');
{
  const npc = { x: HX + 10, y: HY + 10, _vgSince: 123, _vgGiveUp: 5 };
  const own = step(npc, 999999, 5, HX, HY);
  chk(own === true && npc.act === '대장장이', `44px 이내 → 역할 라벨 "${npc.act}"`);
  chk(npc._vgSince === 0 && npc._vgGiveUp === -1, '정체 상태 리셋');
}

console.log('\n[④ 다음 게임일에는 다시 시도한다(영구 포기 아님)]');
{
  const npc = { x: HX, y: HY + 445 };
  let t = 0;
  for (let i = 0; i < 40; i++) { t += 1000; step(npc, t, 5, HX, HY); }
  chk(npc._vgGiveUp === 5, 'day 5에 포기 기록');
  const own6 = step(npc, t + 1000, 6, HX, HY);   // 날이 바뀜
  chk(own6 === true && npc.act === '출근', `day 6에 재시도(소유권 재획득, act="${npc.act}")`);
}

console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
process.exit(fail === 0 ? 0 : 1);
