#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @bait 3   ← [T1502] 미끼 셋 — 닿지 않고 거둔 사본 · 거둔 것보다 많이 곳간에 든 사본 · 끈 판 지문 한 칸이 다른 사본
// === scripts/test-t1502-funnel.js — 채집꾼 몸 일터 · 곳간 듦 손잡이(T1502_ACT_FIX) + 깔때기 탐침(lib-act-funnel) =========
//
// ★왜 [지시 T1502 · 2026-11-27]
//   "몸이 한 일만"(T347_FORAGE_ACT)을 켜면 세계가 열에 하나로 준다. 깔때기(몸-날 → 틱 → 나섬 → 닿음 → 일함 → 거둠 → 들고 옴 → 곳간)로
//   새는 자리를 찾았고, 채집꾼 몸은 일터(채집 색인 셀)를 아예 못 받아 레거시 폴스루로 흘렀다(닿음 0.5 % · 거둠 0).
//   손잡이 `T1502_ACT_FIX`(끔 기본)가 몸을 색인 셀로 **걸어가** 따게 하고, 곳간에 **닿는 순간** 일괄과 같은 문(`_t347Deliver`)으로 넣는다.
// 이 하네스가 지키는 것:
//   ① 손잡이 — 제품이 그 손잡이를 한 자리에서만 읽고 · 두 호출부가 모두 그 손잡이(와 T347 켬) 뒤에 있다(끔 = 한 줄도 안 돈다)
//   ② 걸음 · 장부 — 몸은 44 px 안에 닿기 전엔 안 딴다 · 몸 좌표를 쓰지 않는다(순간 이동 0) · 곳간을 장부로 메우지 않는다(곳간 문은 `_t347Deliver` 하나)
//   ③ 탐침 자 — funnelOf · check · fpDiff 가 맞게 답한다
//   ④ 판 — 끈 판(이 가지 + 탐침)의 지문이 main 끈 판(탐침 없음)과 한 칸도 안 다르다(끔 = 바이트 같음 · 관찰기 무변) ·
//          켠 판(채집 + T1499 + T1502)의 깔때기가 불변식을 지키고 채집꾼 몸이 실제로 닿아 거둔다
//   ⑤ 미끼 셋(카드 6) — 같은 자가 각각을 문다
// ⚠존을 부팅하지 않는다 — 제품은 글자로(정적) · 판은 `계측/T1502_2026-11-27/` 에 남긴 지문 · 깔때기로 잰다.
// 실행: node scripts/test-t1502-funnel.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const LB = require('./lib-bait');
const CO = require('./code-only.js');
const AF = require('./lib-act-funnel.js');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, '계측', 'T1502_2026-11-27');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const gz = (f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR, f))).toString());
const VSRC = CO(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
const bodyOf = (src, name) => {   // 함수 본문(여는 중괄호부터 짝 닫는 중괄호까지) — 글자 셈
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) return src.slice(j, k + 1); } }
  return null;
};

console.log('\n=== T1502 채집꾼 몸 일터 · 곳간 듦 + 깔때기 탐침 ===');

// ── ① 손잡이 ─────────────────────────────────────────────────────────────────────
console.log('\n① 손잡이 `T1502_ACT_FIX` — 끔 기본 · 두 호출부 모두 손잡이 뒤');
{
  ok(/const T1502_ACT_FIX = process\.env\.T1502_ACT_FIX === '1';/.test(VSRC), '① ★손잡이는 `=1` 일 때만 켬(끔 기본)');
  ok(LB.knob('T1502_ACT_FIX') === 1, '① 제품(server · sim)이 그 손잡이를 꼭 한 자리에서 읽는다', `읽는 자리 ${LB.knob('T1502_ACT_FIX')}`);
  const lines = VSRC.split('\n');
  const calls = (fn) => lines.filter((l) => l.includes(fn + '(') && !l.includes('function ' + fn + '('));
  const st = calls('_t1502ForageStep'), gi = calls('_t1502ForageIn');
  ok(st.length === 1 && gi.length === 1, '① 호출부는 채집꾼 갈래 하나 · 곳간 도착 하나', `걸음 ${st.length} · 듦 ${gi.length}`);
  const guarded = (l, fn) => { const k = l.indexOf(fn + '('), g = l.lastIndexOf('T1502_ACT_FIX &&', k); return g >= 0 && g < k; };
  ok(st.length === 1 && guarded(st[0], '_t1502ForageStep') && /T347_FORAGE_ACT/.test(st[0]) && /forageActOn\(/.test(st[0]),
    '① ★★채집꾼 갈래 호출은 `T1502_ACT_FIX &&` · `T347_FORAGE_ACT` · `forageActOn` 뒤(끄면 안 돈다 · 채집 켬 위에서만)');
  ok(gi.length === 1 && guarded(gi[0], '_t1502ForageIn') && /npc\._t1502F/.test(gi[0]),
    '① ★★곳간 도착 호출은 `T1502_ACT_FIX &&` 뒤 · 손잡이 걸음을 탄 몸(`npc._t1502F`)만');
  ok(gi.length === 1 && gi[0].indexOf('_handSet(npc, 0)') >= 0 && gi[0].indexOf('_handSet(npc, 0)') < gi[0].indexOf('_t1502ForageIn('),
    '① 곳간 도착 줄의 차례 — 종전 손(`_granStockAdd` · `_handSet 0`)을 먼저 넣고 그다음 채집 손(종전 차례 무변)');
}

// ── ② 걸음 · 장부 ──────────────────────────────────────────────────────────────────
console.log('\n② 몸은 실제로 걸어가 실제로 딴다(순간 이동 0 · 장부 메우기 0)');
{
  const S = bodyOf(VSRC, '_t1502ForageStep') || '', I = bodyOf(VSRC, '_t1502ForageIn') || '';
  ok(S.length > 500 && I.length > 100, '② [전제] 두 함수 본문을 읽었다(0 이면 아래가 자명 통과다)', `${S.length} · ${I.length} 글자`);
  const walk = S.indexOf('> 44) { npc.behavior = \'wander\'; npc.targetX = s.x; npc.targetY = s.y;');
  const p1 = S.indexOf('t495PickAt('), p2 = S.indexOf('t347PickAt(');
  ok(walk > 0 && p1 > walk && p2 > walk, '② ★★따기 두 문(`t495PickAt` · `t347PickAt`)은 44 px 걸음 되돌림 **뒤**에만 — 닿기 전엔 안 딴다', `걸음 ${walk} · 따기 ${p1} · ${p2}`);
  ok(!/npc\.(x|y)\s*=[^=]/.test(S + I), '② 몸 좌표를 쓰지 않는다(걸음은 `targetX/Y` + `wander` — 순간 이동 0)');
  ok(!/_granStockAdd|addProduce|forageToGranary/.test(S), '② 따는 자리는 곳간 · 장부를 안 만진다(손에만 든다)');
  ok(/_t347Deliver\(vil, npc\)/.test(I) && !/_granStockAdd|addProduce/.test(I), '② 곳간 듦은 일괄 · 해질녘과 같은 문 `_t347Deliver` 하나(새 입구 0)');
  ok(/_t347PreWalked\+\+/.test(I) && /S\.fw = d|S\.fw=d/.test(I.replace(/\s+/g, ' ').replace(/S\.fw = d/g, 'S.fw=d')),
    '② 걸은 몸 도장(`_t347PreWalked` · `S.fw`) — 일괄 명부가 그 몸을 뺀다(몸 XOR 일괄 · 두 번 0)');
  ok(/_t347PerLoad\(/.test(S) && /forageDemandLeft\(/.test(S) && !/\b(0\.\d+|[2-9]\d{2,})\s*\*/.test(S.replace(/6000 \+ \(h % 5\) \* 1000/, '')),
    '② 한 짐 · 수요 문은 일괄의 그 식(`_t347PerLoad` · `forageDemandLeft`) — 새 곱수 0');
}

// ── ③ 탐침 자 ─────────────────────────────────────────────────────────────────────
console.log('\n③ 탐침 자 — funnelOf · check · fpDiff');
const good = () => {
  const r = AF.newRow();
  Object.assign(r, { bd: 100, tick: 90, out: 60, reach: 50, work: 40, harv: 30, carry: 25, gran: 20, harvU: 12, carryU: 10, granU: 9 });
  return { rows: { forager: r } };
};
{
  const F = AF.funnelOf(good().rows.forager);
  ok(F.stages.length === AF.STAGES.length && F.worst && F.worst.stage === 'out', '③ funnelOf — 가장 크게 새는 단계(틱 → 나섬 33 %)를 고른다', F.worst && `${F.worst.stage} ${F.worst.leak}`);
  ok(AF.check(good()).length === 0, '③ check — 바른 깔때기는 위반 0', AF.check(good()).join(' / '));
  const fp = gz('fp-off-1020.json.gz');
  ok(AF.fpDiff(fp, fp).length === 0, '③ fpDiff — 같은 지문 둘은 다른 칸 0');
}

// ── ④ 판 ─────────────────────────────────────────────────────────────────────────
console.log('\n④ 판 — 끔 = 바이트 같음 · 켠 판 깔때기');
{
  const A = gz('fp-moff-1020.json.gz'), B = gz('fp-off-1020.json.gz');
  const sa = A.byseed['1020'], sb = B.byseed['1020'];
  ok(sa && sb && sa.days.length >= 400 && sb.days.length >= 400, '④ [전제] 끈 판 둘 다 400날(main · 이 가지)', `${sa && sa.days.length} · ${sb && sb.days.length}`);
  const d = AF.fpDiff(A, B);
  ok(d.length === 0 && sa.runHash === sb.runHash, '④ ★★끈 판(이 가지 + 탐침 켬) = main 끈 판(탐침 없음) — runHash · 날마다 칸 모두 같음(끔 = 바이트 같음 · 관찰기 무변)',
    `${sa.runHash} · ${sb.runHash} · 다른 칸 ${d.length}`);
  const fx = gz('funnel-ffx-1020.json.gz'), pre = gz('funnel-forage-1020.json.gz');
  const v = AF.check(fx);
  ok(!fx.err && fx.lastDay >= 400, '④ [전제] 켠 판(채집 + T1499 + T1502) 깔때기가 400날 끝까지 · 탐침 오류 0', `${fx.lastDay}날 · ${fx.err || '오류 0'}`);
  ok(v.length === 0, '④ ★켠 판 깔때기 불변식(닿지 않고 거둠 0 · 곳간 ≤ 거둠 · 단계는 줄기만)', v.slice(0, 3).join(' / ') || '위반 0');
  const a = fx.rows.forager, b = pre.rows.forager;
  ok(b.harv === 0 && a.reach > 0 && a.harv > 0 && a.gran > 0 && a.granU > 0,
    '④ ★★채집꾼 몸이 실제로 닿아 거두고 곳간에 넣는다(고치기 전 판: 거둠 0)', `전 닿음 ${b.reach} · 거둠 ${b.harv} → 후 닿음 ${a.reach} · 거둠 ${a.harv} · 곳간 ${a.gran}몸-날 ${a.granU.toFixed(1)}`);
}

// ── ⑤ 미끼 ───────────────────────────────────────────────────────────────────────
console.log('\n⑤ 미끼 — 같은 자가 문다');
{
  const pretty = (o) => JSON.stringify(o, null, 1);
  // 미끼 1: 닿지 않은 몸이 거둔 사본(한 칸: harvNoReach 0 → 1)
  const g1 = good(), b1 = good(); b1.rows.forager.harvNoReach = 1;
  const n1 = LB.spots(pretty(g1), pretty(b1)), v1 = AF.check(b1);
  ok(n1 === 1 && v1.length === 1 && /닿지 않고/.test(v1[0]), '⑤ 미끼 1 — 닿지 않은 몸이 거두는 사본은 check 가 문다', `바꾼 자리 ${n1} · ${v1.join(' / ')}`);
  // 미끼 2: 거둔 것보다 많이 곳간에 드는 사본(한 칸: granU 9 → 13 > harvU 12)
  const b2 = good(); b2.rows.forager.granU = 13;
  const n2 = LB.spots(pretty(g1), pretty(b2)), v2 = AF.check(b2);
  ok(n2 === 1 && v2.length === 1 && /곳간에 든/.test(v2[0]), '⑤ 미끼 2 — 거둔 것보다 많이 곳간에 드는 사본은 check 가 문다', `바꾼 자리 ${n2} · ${v2.join(' / ')}`);
  // 미끼 3: 끈 판 지문 한 칸이 다른 사본(마지막 날 첫 마을 칸 하나)
  const B = gz('fp-off-1020.json.gz'), C = JSON.parse(JSON.stringify(B));
  const last = C.byseed['1020'].days[C.byseed['1020'].days.length - 1];
  last[3][0] = last[3][0].replace(/^./, (c) => (c === '0' ? '1' : '0'));
  const n3 = LB.spots(pretty(B), pretty(C)), v3 = AF.fpDiff(B, C);
  ok(n3 === 1 && v3.length === 1, '⑤ 미끼 3 — 끈 판에서 한 칸이라도 다른 사본은 fpDiff 가 문다', `바꾼 자리 ${n3} · ${v3.join(' / ')}`);
}

console.log(`\n${fail ? '✗' : '✓'} T1502: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
