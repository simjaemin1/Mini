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

// ── E: CLI 계측기 ─────────────────────────────────────────────────────────────
console.log('\n[E] sim/economy-sim.js main() — CLI 5시드 계측기');
{
  const S = rd('sim/economy-sim.js');
  const m = S.match(/const world = \{ villages[^\n]*\n(?:[^\n]*\n){0,3}/);
  const blk = m ? m[0] : '';
  const rational = /picker:\s*'rational'/.test(blk);
  if (/_world\s*=\s*world/.test(blk)) ok('_world 백참조 있음 — picker 판별부가 world 를 본다');
  else bad('_world 백참조가 없다 — picker 판별이 영영 legacy 로 떨어진다');
  // ★★rational picker 는 world.priceFn 을 전제로 설계됐다 — 없으면 한계가치 가중 w() 가 **전부 1.0**
  //   으로 떨어지고(가격에 따른 노동 이동 = rational 의 핵심 기제가 죽는다) 생산 포만(satMul) 판정도 꺼진다.
  //   그런데 **v1 createWorld 는 priceFn 을 심지 않는다** — 가격은 v2(createWorldV2 → computeShadowPrices)
  //   에서 들어온 기능이다. 그래서 "v1 세계 + rational picker" 는 프로덕션에 존재하지 않는 **키메라**다.
  //   프로덕션은 언제나 v2 다(central.js · villages.js 둘 다 tickWorldV2).
  //   ⇒ 이건 한 줄로 못 고친다. 선택지가 둘이고 회귀 기준선이 바뀌므로 **회부 대상**이다:
  //       (가) v1 CLI 를 legacy 로 되돌린다 — v1 은 순수 안정성 회귀로만 쓰고 프로덕션 대변은 안 시킨다
  //       (나) 회귀를 v2 CLI(sim/economy-sim-v2.js main — 이미 createWorldV2+tickWorldV2 다)로 옮긴다.
  //            v2 main 이 sim/out 덤프를 안 써서 econ-regress 가 읽을 게 없다 → 덤프 추가가 필요하다
  if (rational && !/priceFn/.test(blk)) {
    wrn("CLI 가 rational 인데 priceFn 이 없다 — w() 전부 1.0(가격 신호 죽음)·satMul 꺼짐. "
      + "v1 은 priceFn 을 못 심으므로(v2 기능) 이건 **회부 항목**이다: (가) v1→legacy 복귀 / (나) 회귀를 v2 CLI 로 이전");
    console.log('     ↳ 지금 CLI 회귀 수치는 "프로덕션에 없는 기계"의 값이다. 안정성 비교로만 읽을 것.');
  } else if (rational) ok("picker='rational' + priceFn — 가격 신호 살아 있음");
  else ok("picker=legacy — v1 순수 안정성 회귀(프로덕션 대변 아님, 명시적)");
}

// ── F: 번들이 엔진 소스와 같은가(손으로 기웠는지 포함) ────────────────────────
console.log('\n[F] sim/economy-engine.browser.js — 번들 신선도');
{
  const cur = rd('sim/economy-engine.browser.js');
  try {
    execFileSync(process.execPath, [path.join(root, 'sim/build-econ-bundle.js')], { stdio: 'ignore' });
    const rebuilt = rd('sim/economy-engine.browser.js');
    if (rebuilt === cur) ok('번들 = 엔진 소스(specialty + economy-sim + -v2)');
    else {
      fs.writeFileSync(path.join(root, 'sim/economy-engine.browser.js'), cur);   // 검사는 부작용을 남기지 않는다
      bad('번들이 소스와 다르다 — 낡았거나 **손으로 기웠다**. node sim/build-econ-bundle.js 로 재생성해야 한다');
    }
  } catch (e) { bad('번들 재생성 실패: ' + e.message); }
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
