#!/usr/bin/env node
// === scripts/lab-wiring-check.js — 랩이 본 게임과 같은 것을 재고 있는지 기계로 검사한다 ===
//
// ★[2026-08-01] 이 세션에 계측기가 여섯 번 틀렸다. 전부 같은 병이다 —
//   **본 게임이 이미 갖고 있는 것을 랩에서 손으로 다시 짰다.** 사람 눈으로는 안 잡힌다.
//   틀린 랩은 조용히 그럴듯한 숫자를 내놓기 때문이다. 그래서 기계가 본다.
//
//     ① 랩이 부존 스캔을 손으로 재구현      → 광맥 4~7배 오차
//     ② 회귀 하네스가 stale dump 를 읽음     → 거짓 통과
//     ③ 랩 루프에 교역이 없음                → 교역 없는 세계
//     ④ 폐지된 tickMigration 호출            → 본 게임과 반대 동역학
//     ⑤ v1 tickWorld + legacy picker + coord 없음 → 다른 엔진
//     ⑥ CLI main() 에 picker·priceFn 누락    → 세 번째 기계
//
// 검사 항목
//   A. 진입점   — 랩은 본 게임과 같은 틱 함수를 부르는가 (tickWorldV2)
//   B. 옵션     — createWorldV2 옵션(picker·infoRange·raidPer100)이 본 게임과 같은가
//   C. coord    — econ 마을에 좌표를 붙이는가 (없으면 거리·운반비·약탈이 전부 무의미)
//   D. 폐지된 것 — tickMigration 을 부르지 않는가 (본 게임은 2026-07 폐지)
//   E. CLI      — sim/economy-sim.js main() 이 picker·priceFn·priceBase 를 갖췄는가
//   F. 번들     — economy-engine.browser.js 가 엔진 소스와 같은가(손으로 기웠는지 포함)
//   G. 인라인   — 랩 HTML 의 인라인 엔진이 그 번들과 같은가
//
// 실행: node scripts/lab-wiring-check.js [랩HTML...]
//   HTML 을 안 주면 ../../마을실험실.html · ../../전쟁실험실.html 을 찾아본다(없으면 건너뜀).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let fail = 0, warn = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { fail++; console.log('  ❌ ' + m); };
const wrn = (m) => { warn++; console.log('  ⚠ ' + m); };

// ── 본 게임 배선을 **소스에서 읽어온다** (여기에 상수를 적어두면 그것도 사본이 된다) ──
const LIVE = rd('server/villages.js');
const liveTick = /econV2\.tickWorldV2\(/.test(LIVE) ? 'tickWorldV2' : null;
const liveOptsM = LIVE.match(/createWorldV2\(\{[\s\S]{0,400}?\}\)/);
const liveOpts = liveOptsM ? liveOptsM[0] : '';
const pick = (src, k) => { const m = src.match(new RegExp(k + "\\s*:\\s*'?([\\w.]+)'?")); return m ? m[1] : null; };
const LIVE_WIRE = {
  tick: liveTick,
  picker: pick(liveOpts, 'picker'),
  infoRange: pick(liveOpts, 'infoRange'),
  raidPer100: pick(liveOpts, 'raidPer100'),
};
console.log('\n[본 게임 배선] server/villages.js');
console.log(`  틱=${LIVE_WIRE.tick} · picker=${LIVE_WIRE.picker} · infoRange=${LIVE_WIRE.infoRange} · raidPer100=${LIVE_WIRE.raidPer100}`);
if (!LIVE_WIRE.tick) bad('본 게임에서 tickWorldV2 호출을 못 찾았다 — 이 검사기가 낡았다');

// ── A~D: 실지도 랩이 같은 배선인가 ────────────────────────────────────────────
console.log('\n[A~D] scripts/econ-lab-real.js — 실지도 랩');
{
  const S = rd('scripts/econ-lab-real.js');
  const call = (f) => new RegExp('(?<![\\w.])(?:econV2|econ|E)\\.' + f + '\\s*\\(').test(S);
  if (call('tickWorldV2')) ok('진입점 tickWorldV2 — 본 게임과 같다');
  else bad('진입점이 다르다 — 본 게임은 tickWorldV2 인데 랩은 안 부른다');
  if (call('tickWorld') && !call('tickWorldV2')) bad('v1 tickWorld 를 부른다 — 본 게임은 v2 다');
  for (const k of ['picker', 'infoRange', 'raidPer100']) {
    const v = pick(S, k);
    if (v === LIVE_WIRE[k]) ok(`${k}=${v} — 일치`);
    else bad(`${k}=${v} — 본 게임은 ${LIVE_WIRE[k]}`);
  }
  if (/\.coord\s*=\s*\{[^}]*\*\s*2\.5/.test(S)) ok('coord = 셀×2.5 — 일치');
  else bad('coord 를 안 붙인다 — 교역 거리·운반비·약탈확률이 전부 무의미해진다');
  if (/tickMigration/.test(S) && !/폐지|abolish/.test(S)) bad('폐지된 tickMigration 을 부른다');
  else ok('tickMigration 미사용 — 본 게임과 같다(2026-07 폐지)');
  if (/__labProbe/.test(S) && /extractLandParamsApprox/.test(S)) ok('부존 추출 = 본 게임 extractLandParamsApprox 직접 호출');
  else bad('부존 추출을 랩이 자체 구현하고 있다 — 4~7배 오차의 재발 경로다');
}

// ── E: 회귀 하네스가 어느 기계를 재는가 ───────────────────────────────────────
//   ★[재민 확정 2026-08-01 "후자로 가자"] 회귀 대상은 **v2 CLI** 다.
//     v1 CLI(createWorld)는 priceFn 을 안 심어서 rational picker 의 한계가치 가중 w() 가
//     전부 1.0 으로 죽는다 — 프로덕션에 없는 키메라. v2 CLI 는 createWorldV2 + tickWorldV2 라
//     프로덕션과 같은 기계다.
console.log('\n[E] scripts/econ-regress.js — 회귀 하네스가 재는 기계');
{
  const S = rd('scripts/econ-regress.js');
  if (/economy-sim-v2\.js/.test(S)) ok('대상 = sim/economy-sim-v2.js (createWorldV2 + tickWorldV2 — 프로덕션 동형)');
  else bad('대상이 v2 CLI 가 아니다 — v1 CLI 는 priceFn 이 없어 rational picker 의 가격 신호가 죽는다');
  if (/simv2-/.test(S)) ok('덤프 파일명이 v1(sim-*)과 분리됨 — 옛 덤프 오독 방지');
  else wrn('덤프 파일명이 v1 과 겹칠 수 있다 — 거짓 통과 경로');
  const V2 = rd('sim/economy-sim-v2.js');
  if (/simv2-\$\{seed\}/.test(V2)) ok('v2 main 이 sim/out 덤프를 쓴다');
  else bad('v2 main 에 덤프가 없다 — 회귀가 읽을 게 없다');
  // v1 CLI 는 이제 프로덕션 대변자가 아니다. picker 가 뭐든 상관없지만, 그렇다고 주장하면 안 된다.
  const V1 = rd('sim/economy-sim.js');
  const m = V1.match(/const world = \{ villages[^\n]*\n(?:[^\n]*\n){0,3}/);
  if (m && /picker:\s*'rational'/.test(m[0]) && !/priceFn/.test(m[0]))
    wrn("v1 CLI main 이 아직 rational+priceFn없음 조합이다 — 회귀 대상은 아니지만 직접 돌리면 오해를 부른다(legacy 복귀 권장)");
}

// ── F: 번들이 엔진 소스와 같은가(손으로 기웠는지 포함) ────────────────────────
console.log('\n[F] sim/economy-engine.browser.js — 번들 신선도');
{
  // ★검사는 부작용을 남기지 않는다 — build 가 실제 번들 파일을 덮어쓰므로 원본을 보관했다가
  //   **항상** 되돌린다. (되돌리지 않으면 동시에 도는 다른 프로세스가 반쯤 쓰인 번들을 읽는다.)
  const bundleP = path.join(root, 'sim/economy-engine.browser.js');
  const cur = fs.readFileSync(bundleP);
  try {
    execFileSync(process.execPath, [path.join(root, 'sim/build-econ-bundle.js')], { stdio: 'ignore' });
    const rebuilt = fs.readFileSync(bundleP);
    const same = rebuilt.equals(cur);
    fs.writeFileSync(bundleP, cur);
    if (same) ok('번들 = 엔진 소스(specialty + economy-sim + -v2)');
    else bad('번들이 소스와 다르다 — 낡았거나 **손으로 기웠다**. node sim/build-econ-bundle.js 로 재생성해야 한다');
  } catch (e) { try { fs.writeFileSync(bundleP, cur); } catch (_) {} bad('번들 재생성 실패: ' + e.message); }
}

// ── G: 랩 HTML 인라인 엔진이 그 번들과 같은가 ─────────────────────────────────
console.log('\n[G] 랩 HTML 인라인 엔진');
{
  const args = process.argv.slice(2);
  const labs = args.length ? args
    : ['마을실험실.html', '전쟁실험실.html'].map(f => path.join(root, '..', f)).filter(f => fs.existsSync(f));
  if (!labs.length) wrn('랩 HTML 을 못 찾음 — 건너뜀 (디바이스 파일이라 컨테이너엔 없을 수 있다)');
  else {
    try {
      execFileSync(process.execPath, [path.join(root, 'sim/inline-engine.js'), '--check', ...labs], { stdio: 'inherit' });
      ok('랩 인라인 엔진 = 번들');
    } catch (e) { bad('랩 인라인 엔진이 번들과 다르다 — node sim/inline-engine.js 로 갱신해야 한다'); }
  }
}

console.log(`\n=== 배선 검사: 실패 ${fail} · 경고 ${warn} ===`);
process.exit(fail ? 1 : 0);
