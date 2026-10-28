#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-npc-hp-door.js — **마을 몸(NPC) HP 를 쓰는 문도 하나다**(T942 · `e2e-hp ⓪` 꼴 · 존 안 띄움 · 1초 안) ===
//   T109 "HP 를 바꾸는 문 하나"(`zone.js setHp`)는 사람 hp 를 모았지만 마을 층(`server/villages.js`) 아홉 줄이 NPC 몸 hp 를 문 밖에서 썼다(T930 회부 1).
//   T942 가 그 아홉 줄을 존의 그 문(deps `setHp` · 사본 0)으로 돌렸다. 이 하네스가 지키는 것:
//     ⓪ 전제 — 존의 문 `setHp(p, v, why)` · 마을의 넘김 한 줄 `_setHp`(deps 의 문을 그대로 부른다 — 다른 일 0)
//     ① 소스(주석 걷음) — 마을 층에서 몸 hp 를 **직접 쓰는 자리 0**(남는 `.hp` 쓰기는 전투 단위 `bu` · 교전 `A[i]` — 판의 칸 · war-live · battle-core 소유)
//     ② 자명 통과 금지 — 옛 직접 대입 한 줄을 되살린 사본은 잡히고 · 전투 단위 줄은 안 잡힌다(거름망이 몸만 본다)
//     ③ 문을 부르는 자리 아홉 · 낱말 일곱(방송 낱말 `HP_PEER` 과 겹침 0 · 요양은 조용한 낱말 `regen`)
//     ④ 존 배선 — `SimVillages.init` 이 문을 넘긴다 · 낱말 표 둘이 그 init 보다 위(다시 뜬 판 몸 복원이 init 안에서 문을 부른다 — TDZ) · 미끼
//     ⑤ 실행(존 없이 · `__p3Bind` 목 세계 · 문은 **존 소스의 글자 그대로** 떼어 세운다) — 풀림 · 원정 굶음(ㄱ 판)이 문을 지나 값 · 메시지가 그대로인가
//   ★[T973] ⓪ ~ ④ 는 `lib-hp-src.js` `npcSourceChecks` 를 부른다(hp 문 셋의 소스 검사 한 벌 · `test-hp-src` ⑤ 와 같은 함수).
// 실행: node scripts/test-npc-hp-door.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
// ★[T973] ⓪ ~ ④(소스만 보는 절)의 몸통은 `scripts/lib-hp-src.js` `npcSourceChecks`(칸 `SPECS.npc`) 한 벌로 옮겼다 — 이 하네스와
//   `test-hp-src` ⑤(미끼 판)가 같은 함수를 부른다(사본 0 · 글자 · 말 무변). ⑤ 실행만 여기 제 것이다.
const L = require('./lib-hp-src');
const WANT = L.SPECS.npc.whys;

console.log('\n=== 마을 몸(NPC) HP 를 쓰는 문 — T942 ===');
L.npcSourceChecks(ok, { zone: ZSRC, villages: VSRC }, console.log);

console.log('\n⑤ 실행 — 존 소스의 문 글자 그대로 · 마을 함수 그대로(존 없이)');
const msgs = [], calls5 = [];
const realDoor = require('./lib-hp-door').makeSetHp((m) => msgs.push(['B', m]), (ws, m) => msgs.push(['S', m]), ZSRC);   // 존 소스의 문 글자 그대로(공용 · 사본 0)
const door = (p, v, why) => { calls5.push(why); return realDoor(p, v, why); };
{   // 문 자체 — NPC 몸(소켓 없음)에 마을 낱말 일곱 · 0 ~ 100 값이면 값은 그 값 그대로 · 메시지 0 / 사람(소켓)에 조용하지 않은 낱말이면 자기에게 간다(메시지 0 이 자명하지 않다)
  let same = 0, n = 0; msgs.length = 0;
  for (const why of WANT) for (const prev of [0, 1, 37, 99.5, 100]) for (const v of [0, 0.4, 1, 36.8, 40, 99.5, 100]) {
    const p = { pid: 'n', isNpc: true, ws: null, hp: prev, maxHp: 100 }; realDoor(p, v, why); n++; if (p.hp === v) same++;
  }
  ok(same === n && msgs.length === 0, '★★⑤ 문 — NPC 몸 · 0 ~ maxHp 값이면 **값 그대로 · 메시지 0**(낱말 일곱 × 앞 값 다섯 × 값 일곱)', `같음 ${same}/${n} · 메시지 ${msgs.length}`);
  const pc = { pid: 'u', ws: { id: 'w' }, hp: 50, maxHp: 100 }; msgs.length = 0; realDoor(pc, 40, 'war');
  ok(msgs.length === 1 && msgs[0][0] === 'S', '★⑤ 대조 — 소켓 있는 사람에 같은 낱말이면 자기에게 한 건(메시지 0 은 NPC 소켓 없음 · 방송 낱말 아님에서 온다)', JSON.stringify(msgs[0] || null));
  const lo = { pid: 'n', isNpc: true, ws: null, hp: 3, maxHp: 100 }; msgs.length = 0; realDoor(lo, -2.5, 'starve');
  ok(lo.hp === 0 && msgs.length === 0, '★⑤ 0 밑 값은 문이 0 으로 깎는다(원정 굶음 ㄱ 판의 잠깐 값 — 갈림 `<= 0` 은 같다)', `hp ${lo.hp}`);
}
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const V = require(path.join(ROOT, 'server', 'villages'));
{   // 풀림 — 결속을 풀면 만피로 돌아간다
  const players = new Map(), npcs = new Set();
  const p = { pid: 'n1', isNpc: true, ws: null, hp: 37, maxHp: 100, simVillageId: null, _muster: true };
  players.set('n1', p);
  const H = V.__p3Bind({ deps: { players, npcs, setHp: door, broadcast: (m) => msgs.push(['B', m]) }, byDbId: new Map(), war: null });
  msgs.length = 0; calls5.length = 0;
  H._warReleasePid('n1');
  ok(p.hp === 100 && npcs.has('n1') && msgs.length === 0 && calls5.join() === 'release', '★⑤ 풀림(`_warReleasePid`) — 문을 지나 만피 · 결정 문 다시 · 메시지 0', `hp ${p.hp} · 문 ${calls5.join()} · 메시지 ${msgs.length}`);
}
{   // 원정 굶음 ㄱ 판(`T906_ARMY_STARVE=die`) — 몸 하루마다 사다리 → 0 이 되는 날 true
  const H = V.__p3Bind({ deps: { players: new Map(), npcs: new Set(), setHp: door, broadcast: (m) => msgs.push(['B', m]) } });
  const p = { pid: 'n2', isNpc: true, ws: null, hp: 100, maxHp: 100 }, w = {};
  msgs.length = 0; calls5.length = 0;
  const hs = []; let dead = -1, mono = true, neg = false;
  for (let d = 0; d < 120 && dead < 0; d++) { const h0 = p.hp; const r = H._t906Step(w, null, p, 0, 'die'); hs.push(p.hp); if (p.hp > h0) mono = false; if (p.hp < 0) neg = true; if (r) dead = d; }
  ok(dead > 0 && p.hp === 0 && !neg && mono && msgs.length === 0 && calls5.length > 0 && calls5.every((c) => c === 'starve'),
    '★⑤ 원정 굶음(교전 단위 없는 몸 · `_t906Step`) — 날마다 문으로 깎이고 0 이 되는 날 true · 0 밑 0 · 메시지 0', `죽은 날 ${dead} · 문 ${calls5.length}번 · 끝 hp ${p.hp} · 앞 다섯 ${hs.slice(0, 5).map((x) => +x.toFixed(2)).join(',')}`);
  const q = { pid: 'n3', isNpc: true, ws: null, hp: 100, maxHp: 100 }, gu = { pid: 'n3', bu: { hp: 30, maxHp: 30 } }, body = { atkGroup: { units: [gu] } }, w2 = {};
  msgs.length = 0; calls5.length = 0;
  let r2 = false, k = 0; for (; k < 120 && !r2; k++) { r2 = H._t906Step(w2, body, q, 0, 'die'); if (!r2 && gu.bu.hp > 0 && q.hp !== Math.max(1, Math.round((gu.bu.hp / 30) * 100))) break; }
  ok(r2 && q.hp >= 1 && msgs.length === 0 && calls5.length > 0 && calls5.every((c) => c === 'starve'),
    '★⑤ 원정 굶음(교전 단위 있는 몸) — 몸 hp 는 단위 hp 비율의 거울(문으로) · 단위가 0 이 되는 날 true · 메시지 0', `날 ${k} · 거울 ${calls5.length}번 · 몸 hp ${q.hp} · 단위 ${+gu.bu.hp.toFixed(2)}`);
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
