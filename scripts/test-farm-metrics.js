#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-farm-metrics.js — 밭 계측기 자체를 검사한다 (T117) =============
//
// ★계측기도 사본 금지 대상이고(족보 ㉒), **계측기가 틀리면 그 위의 판단이 전부 틀린다.**
//   T112 가 그걸 비싸게 배웠다 — 여덟 수 계측기가 밭을 안 돈다는 걸 세 카드가 모르고 지나갔다.
//   ⇒ 이 하네스가 재는 것 넷: ①결정론 ②밭이 실제로 돈다 ③계측기가 econ 을 안 흔든다 ④사본 0.
//
// 실행: node scripts/test-farm-metrics.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

process.env.ENABLE_VILLAGES = '0';
const Villages = require(path.join(ROOT, 'server', 'villages.js'));
const P = Villages.__labProbe;
const CACHE = `/tmp/test-farm-metrics-${process.pid}.json`;
const DAYS = parseInt(process.env.TFM_DAYS || '40', 10);   // 짧게 — 재는 것은 값이 아니라 **성질**이다

function run(seed) {
  return execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'farm-metrics.js'), String(DAYS), String(seed)],
    { env: Object.assign({}, process.env, { LAB_SEEDCACHE: CACHE }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
}
const num = (s, re) => { const m = s.match(re); return m ? Number(String(m[1]).replace(/,/g, '')) : null; };

console.log('\n=== 밭 계측기 검사 (T117) ===');

// ── ① 주입구 — 정본 함수를 내주는가(계측기가 다시 짤 필요가 없는가) ──────────
{
  console.log('\n① 주입구 — `__labProbe._cropProbe`');
  pre(!!P._cropProbe, '주입구가 있다');
  const CP = P._cropProbe;
  for (const k of ['setup', 'attach', 'tickDay', 'cellTask']) ok(typeof CP[k] === 'function', `★① \`_cropProbe.${k}\` 가 있다`);
  ok(CP.TASKS_PER_FARMER > 0, '★★① 농부 1인 하루 처리 칸을 **제품이 답한다**(계측기가 안 적는다)', String(CP.TASKS_PER_FARMER));
  ok(CP.L_WATERGAP > 0, '★① 물때도 제품 상수다', String(CP.L_WATERGAP));
  // 껍데기가 부팅 복원과 **같은 필드**를 갖는가
  const v = CP.attach({ dbId: 1, name: 'v', ccx: 100, ccy: 100, econ: null,
    layout: { farmland: [{ cx: 1, cy: 1 }], dryfield: [{ cx: 2, cy: 2 }], nongZone: [], territory: [[1, 1], [2, 2]], houses: [] } });
  for (const k of ['_terrSet', '_farmSet', '_drySet', '_crop', '_cropClaim', '_potSet']) ok(!!v[k], `★① 껍데기에 \`${k}\` 가 있다(부팅 복원과 같은 모양)`);
  ok(v._farmSet.size === 2 && v._drySet.size === 1, '★★① 논·밭이 갈린다(논 1 · 밭 1)', `farmSet ${v._farmSet.size} · drySet ${v._drySet.size}`);
}

// ── ② 결정론 — 두 번 = 같은 표 ────────────────────────────────────────────
console.log('\n② 결정론 — 두 번 돌리면 같은 표다');
const a = run(1020);
const b = run(1020);
{
  // ★**표만** 견준다 — 시딩 부트 로그(`[seed] …`)는 캐시를 굽는 첫 판에만 찍힌다.
  //   첫 판이 그걸 표로 오인해 빨갛게 나왔다(캐시가 결정론을 깬 줄 알았다 · 족보).
  //   재는 것은 "계측기가 같은 답을 내는가"이지 "같은 말을 하는가"가 아니다.
  const table = (s) => { const i = s.indexOf('=== 밭 계측'); return (i < 0 ? s : s.slice(i)).replace(/[0-9]+(\.[0-9]+)?ms/g, '<ms>'); };
  pre(table(a).startsWith('=== 밭 계측'), '표 머리를 찾았다(견줄 자리가 있다)');
  ok(table(a) === table(b), '★★★② 같은 시드 두 번 = **표가 글자 하나 안 다르다**',
    table(a) === table(b) ? '' : `길이 ${table(a).length} vs ${table(b).length}`);
  const c = run(7);
  ok(table(a) !== table(c), '★★② 다른 시드는 다른 표다(자명 통과 금지)');
  // 캐시가 값을 안 바꾼다 — 첫 판(캐시 굽기)과 둘째 판(캐시 읽기)이 같은 표다
  ok(a.includes('[seed]') && !b.includes('[seed]'), '★② 캐시가 실제로 먹었다(둘째 판은 시딩을 안 한다)');
}

// ── ③ 밭이 실제로 돈다 — 0 이면 계측기가 아무것도 안 잰 것이다 ──────────────
console.log('\n③ 밭이 실제로 돈다');
{
  const cells = num(a, /밭 칸 ([\d,]+) →/);
  const sow = num(a, /파종 ([\d,]+)/);
  const harv = num(a, /수확 ([\d,]+) ·/);
  const units = num(a, /ⓑ 산출 — ([\d,]+)단위/);
  const foodEq = num(a, /\*\*식량등가 ([\d,]+)\*\*/);
  ok(cells > 0, '★★★③ 밭 칸 합 > 0 — **밭이 서 있다**', `${cells}칸`);
  ok(sow > 0, '★★★③ 파종 > 0 — **상태기가 돈다**', `${sow}건`);
  ok(harv > 0, '★★★③ 수확 > 0 — **한 바퀴가 돈다**', `${harv}회`);
  ok(units > 0 && foodEq > 0, '★★③ 산출이 식량등가로 환산된다', `${units}단위 · ${foodEq}`);
  ok(/qMean/.test(a) && /econFood/.test(a) && /ratio/.test(a), '★★③ PM 지정 열이 표에 있다(vid·…·ratio)');
  for (const col of ['vid', 'name', 'fert', 'fN', 'cells0', 'cleared', 'perFarmer', 'need', 'harvestN', 'foodEq', 'tasksWater', 'tasksWeed'])
    ok(new RegExp('\\b' + col + '\\b').test(a), `★③ 열 \`${col}\``);
}

// ── ④ 계측기가 econ 을 안 흔든다 — 같은 판의 여덟 수가 t17 과 같은 자리다 ────
console.log('\n④ 계측기가 econ 을 안 흔든다');
{
  const src = codeOnly(fs.readFileSync(path.join(ROOT, 'scripts', 'farm-metrics.js'), 'utf8'));
  const t17 = codeOnly(fs.readFileSync(path.join(ROOT, 'scripts', 't17-metrics.js'), 'utf8'));
  // econ 을 **쓰는** 자리가 없다(읽기만)
  ok(!/\.storage\s*\[[^\]]*\]\s*=|\.storage\.\w+\s*[+\-]?=|\.npcs\s*=|\.pop\s*=/.test(src),
    '★★★④ 계측기가 econ 상태에 **아무것도 안 쓴다**(읽기만)');
  // 여덟 수를 t17 과 **같은 자리**에서 읽는다
  for (const r of [/\(v\.npcs \|\| \[\]\)\.length/, /v\._everPop/, /v\.storage\.weapon/, /v\._weapQ/, /v\.expansions/])
    ok(r.test(src) && r.test(t17), `★★④ 여덟 수를 t17 과 같은 자리에서 읽는다  ${r.source.slice(0, 24)}`);
  // 노동 루프·우선순위를 **다시 안 적는다**
  ok(!/budget\s*=|while \(budget/.test(src), '★★★④ 노동 루프를 계측기가 **다시 안 적는다**(정본 `lifeFarmDay`)');
  ok(!/L_WATERGAP\s*=|TASKS_PER_FARMER\s*=\s*\d/.test(src), '★★★④ 노동 예산·물때를 **손으로 안 적는다**(T58b `farm-q-metrics` 가 100 이라 적었던 자리)');
  // ★표는 **둘째 줄**에만 뜻이 있다(러너가 거기를 본다) — 본문 주석에 그 글자가 있는 건 무관하다.
  const head3 = fs.readFileSync(path.join(ROOT, 'scripts', 'farm-metrics.js'), 'utf8').split('\n').slice(0, 3).join('\n');
  ok(!/^\s*\/\/\s*@regress/m.test(head3), '★★④ 계측기라 러너 표를 안 붙였다(머리에 `@regress` 없음)');
  const h3t = fs.readFileSync(path.join(ROOT, 'scripts', 'test-farm-metrics.js'), 'utf8').split('\n').slice(0, 3).join('\n');
  ok(/^\s*\/\/\s*@regress/m.test(h3t), '★② 반대로 **이 하네스는** 러너 표를 달았다(대조)');
}

// ── ⑤ 개간 정본 — 세션1 T100 이 서면 그걸 부른다(다시 안 짠다) ──────────────
console.log('\n⑤ 개간은 T100 정본을 부른다(다시 안 짠다)');
{
  const src = codeOnly(fs.readFileSync(path.join(ROOT, 'scripts', 'farm-metrics.js'), 'utf8'));
  ok(/_clearProbe/.test(src), '★★⑤ `_clearProbe`(세션1 T100)를 부른다');
  ok(!/_lifeFrontier|LIFE_CLEAR_PDAY\s*=|프론티어[^\n]*정렬/.test(src), '★★★⑤ 개간 산수를 **다시 안 적는다**');
  ok(/개간 정본/.test(a), '★⑤ 표가 개간 정본의 유무를 **스스로 말한다**',
    (a.match(/개간 정본[^\n]*/) || [''])[0].slice(0, 60));
}

try { fs.unlinkSync(CACHE); } catch (e) {}
console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
