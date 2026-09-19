#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === 곳간② 서버 이식 검증 하네스 ===
// server/villages.js 의 곳간 물리 함수를 **원문 그대로 잘라내** 스텁 위에서 실행한다.
// 랩 검증(gran_harness 11항)과 같은 항목 + 서버 고유의 상태 진행(_granTask 2단계)까지 본다.
//
// 실행: node scripts/test-granary-haul.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');

function cut(name) {
  const st = src.indexOf('function ' + name + '(');
  if (st < 0) throw new Error('함수 없음: ' + name);
  let d = 0, i = src.indexOf('{', st);
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(st, j + 1); }
  }
}
const consts = src.match(/const G_CARRY = \d+;[\s\S]*?const G_STOCK_CAP = \d+;/)[0];
const SZ = 32;
const acts = [];
const _lifeAct = (npc, s) => { npc._lifeAct = s; acts.push(s); };
const state = { deps: { worldPhase: () => 0.3, dayPhaseRatio: 0.7, players: new Map() } };

// ★★[T316 2026-09-19] **손이 `npc._carry`(품목 없는 칸 수) → `inventory.grain_sheaf`(품목) 로 흡수됐다.**
//   이 하네스는 원문을 잘라 쓰므로 **손 술어 넷도 원문에서 잘라 온다**(사본 0 — 여기서 다시 쓰지 않는다).
//   `_carryCfg`/`_weights` 는 실제 모듈을 물린다 ⇒ kg 상한이 진짜 정본값으로 걸린다.
const GRAIN_ITEM = (src.match(/const GRAIN_ITEM = '([a-z_]+)';/) || [])[1];
if (!GRAIN_ITEM) throw new Error('GRAIN_ITEM 정본을 못 찾았다');
const _carryCfg = () => require(path.join(__dirname, '..', 'server', 'carry'));
const _weights = () => require(path.join(__dirname, '..', 'server', 'weights'));

const ctx = vm.createContext({ SZ, _lifeAct, state, GRAIN_ITEM, _carryCfg, _weights,
  Math, Map, Set, Array, Object, JSON, console });
vm.runInContext([consts, cut('_handOf'), cut('_handSet'), cut('_handAdd'), cut('_handFull'),
  cut('_granStockOf'), cut('_granStockAdd'), cut('_granLadder'),
  cut('_granPick'), cut('_granGo'), cut('_lifeGranStep'),
  'globalThis.__api = { _granStockOf, _granStockAdd, _granLadder, _granPick, _granGo, _lifeGranStep, '
  + '_handOf, _handSet, _handAdd, _handFull, GRAIN_ITEM, G_CARRY, G_STOREW, G_DRAWW, G_DRAW, G_STOCK_CAP };'].join('\n'), ctx);
const A = ctx.__api;
// 손에 n 칸을 들린 주민 — 품목 꼴 하나로만 만든다(이 파일에 `_carry` 를 남기지 않는다)
const hand = (npc, n) => { A._handSet(npc, n); return npc; };

let fail = 0;
const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
console.log('=== 곳간② 서버 이식 검증 (원문 함수 직접 실행) ===');
console.log(`G_CARRY=${A.G_CARRY} G_STOREW=${A.G_STOREW}ms G_DRAWW=${A.G_DRAWW}ms G_DRAW=${A.G_DRAW} G_STOCK_CAP=${A.G_STOCK_CAP}`);

console.log('\n[① 사다리 자리 = 곳간 5×3 남쪽 인접칸(문 없음)]');
{
  const L = A._granLadder({ cx: 100, cy: 200 });
  chk(L.x === 100 * SZ + 16 && L.y === 202 * SZ + 16, `(cx, cy+2) 셀 중심 px = (${L.x}, ${L.y})`);
}

console.log('\n[② 곳간 선택 — 저장은 여유·인출은 재고]');
{
  const vil = { _granList: [{ cx: 0, cy: 0 }, { cx: 20, cy: 0 }], _granStock: new Map() };
  A._granStockAdd(vil, vil._granList[0], A.G_STOCK_CAP);      // 0번 가득
  const npc = { x: 0, y: 0 };
  chk(A._granGo(vil, npc, false) === true && npc._granTask.cx === 20, '저장: 가득 찬 곳간 건너뛰고 여유 곳간');
  const npc2 = { x: 0, y: 0 };
  chk(A._granGo(vil, npc2, true) === true && npc2._granTask.cx === 0, '인출: 재고 있는 곳간 선택');
  chk(A._granGo({ _granList: [], _granStock: new Map() }, { x: 0, y: 0 }, false) === false, '곳간 없음 → false(기존 흐름 보존)');
  chk(A._granGo(vil, { x: 0, y: 0 }, true) !== false, '재고 있으면 인출 가능');
  const empty = { _granList: [{ cx: 5, cy: 5 }], _granStock: new Map() };
  chk(A._granGo(empty, { x: 0, y: 0 }, true) === false, '전 곳간 재고 0인데 인출 → false');
}

console.log('\n[③ 저장 사이클 — 이동 → 체류 → 정산 → 소유권 반납]');
{
  const vil = { _granList: [{ cx: 10, cy: 10 }], _granStock: new Map() };
  const L = A._granLadder(vil._granList[0]);
  const npc = hand({ x: L.x - 900, y: L.y }, 3);
  A._granGo(vil, npc, false);
  let t = 1000;
  chk(A._lifeGranStep(vil, npc, t) === true, '① 이동 구간 소유권 보유');
  chk(npc._lifeAct === '운반' && npc.targetX === L.x && npc.targetY === L.y, `라벨 '운반' + 목표=사다리 (act=${npc._lifeAct})`);
  npc.x = L.x - 10; npc.y = L.y;                       // 도착
  t += 1000; A._lifeGranStep(vil, npc, t);
  chk(npc._lifeAct === '저장' && npc._granTask.at === t, `도착 → 라벨 '저장' + 체류 시작 (act=${npc._lifeAct})`);
  t += A.G_STOREW - 500;
  chk(A._lifeGranStep(vil, npc, t) === true, '체류 중 소유권 유지(정산 전)');
  chk(A._handOf(npc) === 3 && A._granStockOf(vil, vil._granList[0]) === 0, '체류 중엔 아직 미정산');
  t += 1000;                                            // 체류 완료
  chk(A._lifeGranStep(vil, npc, t) === false, '체류 완료 → 소유권 반납(false)');
  chk(A._handOf(npc) === 0 && A._granStockOf(vil, vil._granList[0]) === 3, `정산: 손 3 → 곳간 stock ${A._granStockOf(vil, vil._granList[0])}`);
  chk(npc.inventory && npc.inventory[GRAIN_ITEM] === 0 && npc._carry === undefined,
      `★[T316] 손은 **품목 칸**이다 — \`inventory.${GRAIN_ITEM}\` 하나 · \`_carry\` 라는 필드는 없다`);
  chk(npc._granTask === null, '_granTask 정리');
}

console.log('\n[④ 인출 사이클 — 재고에서 G_DRAW 만큼]');
{
  const vil = { _granList: [{ cx: 30, cy: 30 }], _granStock: new Map() };
  A._granStockAdd(vil, vil._granList[0], 5);
  const L = A._granLadder(vil._granList[0]);
  const npc = hand({ x: L.x, y: L.y }, 0);
  A._granGo(vil, npc, true);
  let t = 1000;
  A._lifeGranStep(vil, npc, t);                         // 도착(이미 사다리)
  chk(npc._lifeAct === '인출', `라벨 '인출' (act=${npc._lifeAct})`);
  t += A.G_DRAWW + 100;
  chk(A._lifeGranStep(vil, npc, t) === false, '체류 완료 → 반납');
  chk(A._handOf(npc) === A.G_DRAW && A._granStockOf(vil, vil._granList[0]) === 5 - A.G_DRAW,
      `인출 ${A.G_DRAW}: 손 ${A._handOf(npc)} · 곳간 ${A._granStockOf(vil, vil._granList[0])} (합 5 보존)`);
}

console.log('\n[⑤ 장부 보존 · 하한]');
{
  const vil = { _granList: [{ cx: 1, cy: 1 }], _granStock: new Map() };
  A._granStockAdd(vil, vil._granList[0], 4);
  A._granStockAdd(vil, vil._granList[0], -10);
  chk(A._granStockOf(vil, vil._granList[0]) === 0, '음수 방지(하한 0)');
}

console.log('\n[⑥ 곳간 소멸(재배치) 방어 — 참조 사라져도 폴스루]');
{
  const vil = { _granList: [{ cx: 7, cy: 7 }], _granStock: new Map() };
  const npc = hand({ x: 0, y: 0 }, 1);
  A._granGo(vil, npc, false);
  vil._granList.length = 0;                             // 곳간이 사라짐
  chk(A._lifeGranStep(vil, npc, 5000) === false && npc._granTask === null, '곳간 소멸 → 작업 취소 + false(정지 없음)');
}

console.log('\n[⑦ econ 무접촉 — 물리 장부만 변한다]');
{
  const econ = { storage: { food: 1234 } };
  const vil = { _granList: [{ cx: 2, cy: 2 }], _granStock: new Map(), econ };
  const L = A._granLadder(vil._granList[0]);
  const npc = hand({ x: L.x, y: L.y }, 2);
  A._granGo(vil, npc, false);
  A._lifeGranStep(vil, npc, 1000);
  A._lifeGranStep(vil, npc, 1000 + A.G_STOREW + 100);
  chk(econ.storage.food === 1234, `econ storage.food 불변 (${econ.storage.food})`);
  chk(A._granStockOf(vil, vil._granList[0]) === 2, '물리 장부만 증가');
}

console.log('\n[⑧ 왕복 방어 — 인출 완료에만 "오늘 용무 종료" 도장(_granD)]');
{
  // 실구동 A/B로 확정된 회귀: 도장이 없으면 퇴근 훅이 저장(짐>0)↔인출(빈손)을 무한 왕복시켜 집에 못 간다.
  //   실측 — 수정본 왕복 4회/23표본, 도장 제거본 22회/30표본(4.2배). 아래는 그 도장의 단위 계약.
  const vil = { _granList: [{ cx: 9, cy: 9 }], _granStock: new Map() };
  A._granStockAdd(vil, vil._granList[0], 5);
  const L = A._granLadder(vil._granList[0]);
  const s = hand({ x: L.x, y: L.y }, 2);              // 저장
  A._granGo(vil, s, false); A._lifeGranStep(vil, s, 1000); A._lifeGranStep(vil, s, 1000 + A.G_STOREW + 100);
  chk(s._granD === undefined, '저장 완료엔 도장 없음(오후에 계속 일한다 — 랩 toWork 복귀 동형)');
  const d = hand({ x: L.x, y: L.y }, 0);              // 인출
  A._granGo(vil, d, true); A._lifeGranStep(vil, d, 1000); A._lifeGranStep(vil, d, 1000 + A.G_DRAWW + 100);
  chk(d._granD !== undefined, `인출 완료엔 도장(_granD=${d._granD}) — 그날 곳간 용무 종료 → 귀가`);
}

// ★★[T316 2026-09-19] ⑨ **흡수가 행동을 안 바꾼다 — 자를 두 개 대서 본다.**
//   `_handFull` 은 이제 두 문턱의 OR 다: 칸(`G_CARRY`) ∨ kg(`carry.js CAP_KG` ÷ 볏단 kg).
//   흡수 전 코드에는 칸 문턱 하나뿐이었으므로, **kg 쪽이 언제나 더 늦게 문다**는 것이
//   곧 "행동 무변"의 증명이다(반례: 상한을 바꾸면 이 절이 빨개진다 — 카드가 요구한 그 반례).
console.log('\n[⑨ 손 문턱 — 칸 ∨ kg 중 먼저 걸리는 쪽(T316 흡수 · 행동 무변)]');
{
  const CAP = _carryCfg().CFG.CAP_KG;
  const KG = _weights().kgOfOrDefault(GRAIN_ITEM);
  const nKg = Math.ceil(CAP / KG);                    // kg 상한이 처음 무는 칸 수
  console.log(`  · CAP_KG=${CAP} · ${GRAIN_ITEM} ${KG}kg/칸 ⇒ kg 문턱 ${nKg}칸 · 칸 문턱 ${A.G_CARRY}칸`);
  chk(A.G_CARRY < nKg, `★★칸 문턱(${A.G_CARRY})이 kg 문턱(${nKg})보다 **먼저** 문다 ⇒ 흡수 전후 판정 동일`);
  for (let n = 0; n <= A.G_CARRY + 1; n++) {
    const npc = hand({}, n);
    const want = n >= A.G_CARRY;                      // 흡수 전 판정: `npc._carry >= G_CARRY`
    chk(A._handFull(npc) === want, `  손 ${n}칸 → ${A._handFull(npc) ? '참' : '거짓'} (흡수 전과 같다)`);
  }
  const npc = hand({}, 0);
  A._handAdd(npc, 1); A._handAdd(npc, 1);
  chk(A._handOf(npc) === 2 && npc.inventory[GRAIN_ITEM] === 2, '수확 +1 이 품목 칸을 올린다(칸 수 그대로)');
  A._handAdd(npc, -5);
  chk(A._handOf(npc) === 0, '손은 음수로 안 간다(하한 0 — 종전 `Math.max(0, …)` 와 같다)');
}

console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
process.exit(fail === 0 ? 0 : 1);
