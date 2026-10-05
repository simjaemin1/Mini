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
//   K. 대조     — 서버에만 있던 여섯(T569·T570·T577 추신·T578·T579 추신·T590)이 랩에도 같은 식으로 섰나(T599)
//   L. 대조 2차 — 서버 env 손잡이 문(같은 이름 · 같은 기본) · 작물 철 월동 셈(T594 거울 = 서버 T99 readyDay)(T641)
//   M. 밭 겨울 휴면 — 서버 T99 ②③ 술어(crops.dormantAt)를 번들로 싣고 랩 상태기 세 자리가 그 문 하나만 부르나(T648)
//
// 실행: node scripts/lab-wiring-check.js [랩HTML...]
//   HTML 을 안 주면 lab/마을실험실.html · lab/전쟁실험실.html 을 잰다(랩은 2026-09-05 레포 안으로 들어왔다).
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
  // ★[2026-08-02] 시딩 선별 인자 — 1744e0e 의 부유 시딩은 `pickSeedVillages(hard, ta)` 로 **땅 품질**을
  //   본다. 랩이 ta 를 빼고 부르면 조용히 옛 타입 prior 시딩으로 돌아가 **다른 20곳**을 재게 된다.
  const seedCall = S.match(/pickSeedVillages\(([^)]*)\)/);
  if (seedCall && /,\s*ta\b/.test(seedCall[1])) ok('시딩 선별 = pickSeedVillages(hard, ta) — 땅 품질 인자 전달');
  else bad(`시딩 선별에 지형 어댑터(ta)가 안 간다 — 부유 시딩이 죽어 다른 마을 20곳을 잰다 (${seedCall ? seedCall[0] : '호출 없음'})`);
  // ★[배치 16] 선별 **정책**(존 설정)도 같이 가야 한다. hanbando 는 seedAllVillages:true 로 50곳인데
  //   랩이 이 인자를 빼면 19곳을 재게 된다 — 위 ta 누락과 정확히 같은 종류의 오진이다.
  if (seedCall && /_seedOpts|seedAll/.test(seedCall[1])) ok('시딩 정책 = 존 설정 전달(seedAllVillages/villageMax) — 랩이 프로덕션과 같은 마을 수를 잰다');
  else bad(`시딩 정책(존 설정)이 랩에 안 간다 — 프로덕션 50곳인데 랩은 19곳을 잰다 (${seedCall ? seedCall[0] : '호출 없음'})`);
  // ★랩 전용 A/B 손잡이가 **기본값에서 꺼져 있는가** — 켜진 채 커밋되면 회귀가 딴 세계를 잰다.
  for (const [k, re] of [['LAB_CU', /LAB_CU\s*=\s*parseFloat\(process\.env\.LAB_CU\s*\|\|\s*'0'\)/]]) {
    if (re.test(S)) ok(`A/B 손잡이 ${k} 기본 OFF`);
    else wrn(`A/B 손잡이 ${k} 의 기본값을 확인 못 했다 — 켜진 채 커밋되면 회귀가 딴 세계를 잰다`);
  }
}

// ── A2: 엔진 A/B 손잡이가 기본값(=채택값)인가 ────────────────────────────────
//   ★[2026-08-02] LANDFIT·SMELT_CAP 처럼 env 로 흔들 수 있는 손잡이는 **기본이 채택값**이어야 한다.
//     기본을 바꿔 커밋하면 회귀는 통과하는데 라이브는 다른 세계가 된다.
console.log('\n[A2] 엔진 A/B 손잡이 기본값');
{
  const E = rd('sim/economy-sim.js');
  //   ★2026-08-02b 추가: BOOMFIT 0(실측 기각) · ORE_MIX_EFF 는 '0' 비교라 별도 검사(아래).
  for (const [name, want] of [['LANDFIT', '1'], ['SMELT_CAP', '0.05'], ['PEACE_W', '0.03'], ['BOOMFIT', '0']]) {
    const m = E.match(new RegExp('process\\.env\\.' + name + '[\\s\\S]{0,120}?:\\s*([\\d.]+)'));
    if (!m) { wrn(`${name} 손잡이를 못 찾음 — 검사기가 낡았거나 손잡이가 사라졌다`); continue; }
    if (m[1] === want) ok(`${name} 기본 ${m[1]} (채택값)`);
    else bad(`${name} 기본이 ${m[1]} 다 — 채택값은 ${want}. 라이브가 딴 세계가 된다`);
  }
  // 불리언 손잡이 — 기본값의 방향까지 본다(=== '0' 이면 기본 ON, === '1' 이면 기본 OFF)
  if (/ORE_MIX_EFF === '0'/.test(E)) ok('ORE_MIX_EFF 기본 ON (채택 — 유효 제련 조성)');
  else bad('ORE_MIX_EFF 기본이 OFF 다 — 채택값은 ON');
  if (/process\.env\.BOOMGATE === '1'/.test(E)) ok('BOOMGATE 기본 OFF (실측 기각)');
  else bad('BOOMGATE 기본이 ON 이다 — 실측이 기각한 동작이 켜져 있다');
  //   ★2026-08-02c 소멸 0 튜닝: STONE_NET·PRODK_CAP 채택(기본 ON) · TOOLBOOT/SWITCH2 실측 무효(기본 OFF)
  for (const [name, why] of [['STONE_NET', '채택 — 소멸 1.33→0'], ['PRODK_CAP', '채택 — STONE_NET 과 함께 좀비 0.67→0'],
                             ['ALLOY_OPP', '채택 — 배합↔교역 한 단위 통합, 합금 등급 0.79→1.21']]) {
    if (new RegExp(name + " === '0'").test(E)) ok(`${name} 기본 ON (${why})`);
    else bad(`${name} 기본이 OFF 다 — 채택값은 ON(꺼지면 소멸·좀비가 돌아온다)`);
  }
  //   ★2026-08-02d: SHIELD_AGE·SHIELD_SOFT 채택(기본 ON) · STONE_MAINT 은 이월(현행 0.02 유지)
  for (const [name, why] of [['SHIELD_AGE', '채택 — 보호막을 마을 나이 기준으로(랩 비트 동일)'],
                             ['SHIELD_SOFT', '채택 — 보호막이 삼키지 않고 감쇠(절벽→경사)']]) {
    if (new RegExp(name + " === '0'").test(E)) ok(`${name} 기본 ON (${why})`);
    else bad(`${name} 기본이 OFF 다 — 채택값은 ON`);
  }
  {
    const m = E.match(/process\.env\.STONE_MAINT[\s\S]{0,120}?:\s*([\d.]+)/);
    if (m && m[1] === '0.02') ok('STONE_MAINT 기본 0.02 (이월 — 이중차감 수리는 회부 중)');
    else bad(`STONE_MAINT 기본이 ${m ? m[1] : '?'} 다 — 회부 결론 전 채택값은 0.02`);
  }
  for (const [name, why] of [['TOOLBOOT', '실측 무효(기준선과 비트 동일)'], ['SWITCH2', '실측 무효(함께 켜면 되레 좀비 +0.67)']]) {
    if (new RegExp('process\\.env\\.' + name + " === '1'").test(E)) ok(`${name} 기본 OFF (${why})`);
    else bad(`${name} 기본이 ON 이다 — ${why} 인 손잡이가 켜져 있다`);
  }
  const V = rd('server/villages.js');
  const bm = V.match(/process\.env\.BOOMTOWN[\s\S]{0,80}?:\s*(\d+)/);
  if (bm && bm[1] === '0') ok('BOOMTOWN 기본 0 (실측 기각)');
  else bad(`BOOMTOWN 기본이 ${bm ? bm[1] : '?'} 다 — 실측 기각값은 0`);
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
  // ★[2026-08-02] 번들 내용물 검사 — "소스와 같다"만으로는 **무엇이 들었는지** 모른다.
  const B = fs.readFileSync(bundleP, 'utf8');
  //   ① era.js — 시대 게이트(npcKnows·smeltYield)가 econ 안에 있다. 빠지면 브라우저 랩만 시대를 모른다.
  if (/function\s+npcKnows|const npcKnows\s*=/.test(B) && /function\s+smeltYield/.test(B)) ok('번들에 era 축 포함(npcKnows·smeltYield)');
  else bad('번들에 era 축이 없다 — 브라우저 랩만 시대를 모르는 상태가 된다(CLI 하네스는 못 잡는 지뢰)');
  //   ② process shim — 엔진에 process.env 손잡이(PEACE_W·LANDFIT·SMELT_CAP)가 늘 때마다
  //      브라우저에서 ReferenceError 로 즉사한다. 2026-08-01 warriorTarget 이 실제로 그렇게 죽었다.
  if (/(^|[^.\w])process\s*=|typeof process|globalThis\.process/.test(B.slice(0, 4000))) ok('번들 프렐류드에 process shim 존재(브라우저 랩 즉사 방지)');
  else bad('번들에 process shim 이 없다 — 엔진에 process.env 손잡이가 하나만 늘어도 브라우저 랩이 ReferenceError 로 죽는다');
  //   ③ 손잡이가 실제로 번들에 실렸는가(=엔진과 랩이 같은 기본값을 본다)
  for (const k of ['LANDFIT', 'SMELT_CAP', 'PEACE_W', 'TREASURY_BUY']) {
    if (B.includes(k)) ok(`  손잡이 ${k} 번들에 포함`);
    else wrn(`  손잡이 ${k} 가 번들에 없다 — 랩과 서버가 다른 기본값을 볼 수 있다`);
  }
  //   ④ ★[2026-08-03a] **채택 손잡이는 기본값이 채택값이어야 한다** — 이걸 안 보면 "코드엔 있는데
  //      기본이 OFF"인 채로 채택 보고가 나간다(=랩·서버·회귀가 전부 채택 전 세계를 잰다).
  //      채택분은 `!(env === '0')`(기본 ON), 기각분은 `(env === '1')`(기본 OFF) 꼴이어야 한다.
  for (const k of ['STONE_NET', 'PRODK_CAP', 'ALLOY_OPP', 'SHIELD_AGE', 'SHIELD_SOFT', 'ORE_MIX_EFF', 'TREASURY_BUY']) {
    const re = new RegExp(`process\\.env\\.${k}\\s*===\\s*'0'`);
    if (re.test(B)) ok(`  채택 손잡이 ${k} 기본 ON (=== '0' 으로 되돌림)`);
    else bad(`  채택 손잡이 ${k} 의 기본값이 채택값이 아니다 — 랩·회귀가 채택 전 세계를 재고 있다`);
  }
}

// ── G: 랩 HTML 인라인 엔진이 그 번들과 같은가 ─────────────────────────────────
console.log('\n[G] 랩 HTML 인라인 엔진');
{
  const args = process.argv.slice(2);
  const labs = args.length ? args
    // ★[T123 2026-09-05] 랩이 레포 안(`lab/`)으로 들어왔다(PM c7778a49) — 기본 대상을 거기로.
    //   종전 기본값은 저장소 **밖**(`../`)이라 컨테이너에선 늘 "못 찾음 — 건너뜀"이었다.
    //   건너뜀은 검사가 아니다(이 파일이 `inline-path` 에 대해 스스로 적어 둔 그 말이다).
    : ['마을실험실.html', '전쟁실험실.html'].map(f => path.join(root, 'lab', f)).filter(f => fs.existsSync(f));
  if (!labs.length) wrn('랩 HTML 을 못 찾음 — 건너뜀 (디바이스 파일이라 컨테이너엔 없을 수 있다 · 인자로 경로를 주면 잰다)');
  else {
    try {
      execFileSync(process.execPath, [path.join(root, 'sim/inline-engine.js'), '--check', ...labs], { stdio: 'inherit' });
      ok('랩 인라인 엔진 = 번들');
    } catch (e) { bad('랩 인라인 엔진이 번들과 다르다 — node sim/inline-engine.js 로 갱신해야 한다'); }
    // ★★[T89 2026-09-04] **path-core 사본도 같이 잰다.** 3사본 규약의 대상은 econ 번들 하나가 아니다 —
    //   `sim/path-core.js` 도 랩 HTML 안에 사본으로 산다(`PATH-CORE-START` 마커).
    //   여기 없었던 탓에 T85 가 정본을 고친 뒤 **랩 사본이 T85 전 판인 채로 남았고**(정본 247줄 vs 사본 180줄)
    //   그 어긋남을 아무 검사도 말하지 않았다. 문이 하나면 다른 하나도 있어야 한다.
    try {
      execFileSync(process.execPath, [path.join(root, 'sim/inline-path.js'), '--check', ...labs], { stdio: 'inherit' });
      ok('랩 인라인 path-core = 정본');
    } catch (e) { bad('랩 인라인 path-core 가 정본과 다르다 — node sim/inline-path.js 로 갱신해야 한다 (랩이 다른 길을 판다)'); }
  }
}

// ★★[T100 4판 2026-09-07] **인당 기준 경작칸의 정본은 하나다.**
//   `server/village-layout.js LAND_NEED` 가 정본이고, `server/villages.js` 는 `_lifeVL().LAND_NEED` 로 읽는다.
//   랩(`lab/전쟁실험실.html`)만은 **손 사본**이다 — village-layout 을 넣어 주는 인라인 스크립트가 없다
//   (`inline-engine`·`inline-path`·`inline-battle` 셋뿐). 그래서 여기서 두 값을 대조한다.
console.log('\n[T100] 인당 기준 경작칸 — 정본 하나인가');
{
  const VL = require(path.join(root, 'server', 'village-layout.js'));
  const canon = VL.LAND_NEED;
  if (canon == null) bad('village-layout.js 가 LAND_NEED 를 안 내준다 — 정본이 없다');
  // ★랩은 **둘 다** 본다(마을실험실·전쟁실험실). 그리고 한 랩에 사본이 **둘**이다:
  //   ⓐ `L_LAND_BASE`(개간 목표가 읽는 값) ⓑ 인라인 village-layout 의 폴백 `?L_LANDNEED:<수>`.
  //   ⓑ 를 안 보면 죽은 8 이 파일에 남아 다음 사람이 그걸 정본으로 읽는다(T100 4판 §0-ⓐ 실측).
  for (const f of ['마을실험실.html', '전쟁실험실.html']) {
    const labSrc = fs.readFileSync(path.join(root, 'lab', f), 'utf8');
    const m = labSrc.match(/L_LAND_BASE\s*=\s*([0-9.]+)/);
    const labV = m ? +m[1] : null;
    if (labV == null) bad(`랩 ${f} 에서 L_LAND_BASE 를 못 찾았다`);
    else if (Math.abs(labV - canon) > 1e-9) bad(`랩 ${f} L_LAND_BASE ${labV} ≠ 정본 LAND_NEED ${canon} — 손으로 맞춰라`);
    else ok(`랩 ${f} L_LAND_BASE ${labV} = 정본 village-layout.js LAND_NEED ${canon}`);
    const fb = labSrc.match(/typeof L_LANDNEED!=='undefined'\)\?L_LANDNEED:([0-9.]+)/);
    const fbV = fb ? +fb[1] : null;
    if (fbV == null) bad(`랩 ${f} 인라인 layout 의 LAND_NEED 폴백을 못 찾았다`);
    else if (Math.abs(fbV - canon) > 1e-9) bad(`랩 ${f} 인라인 layout 폴백 ${fbV} ≠ 정본 ${canon} — 죽은 사본이 남았다`);
    else ok(`랩 ${f} 인라인 layout 폴백 ${fbV} = 정본 ${canon}`);
  }
  const vsrc = fs.readFileSync(path.join(root, 'server', 'villages.js'), 'utf8')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  if (/const\s+L_LANDNEED\s*=\s*\d/.test(vsrc)) bad('villages.js 에 L_LANDNEED 사본이 다시 생겼다 — 정본에서 읽어라');
  else ok('villages.js 에 사본이 없다 — `_lifeVL().LAND_NEED` 로 읽는다');
}

// ── H: 랩 부팅 기본 = 서버 기본 (T221 · ★T244 갱신) ──────────────────────────
//   ★왜 [T209 → T221] 랩이 손잡이를 서버와 **다른 자리**에서 뜨면 "랩 팔"이 서버 팔이 아니다.
//     실제로 그랬다: `L_HAPPYWORK` 가 0.24 로 떠서 T196 의 랩 표가 켠 판이었다(랩 기준선 인구 +17.6%).
//   ★★[T244 2026-09-13] **불변식은 그대로, 값이 옮겨갔다.** 재민 확정으로 손잡이 셋
//     (`L_ALLOC_REAL` 실현 배분 · `L_HAPPY_FLOOR1` 행복 배수 하한 1 · `L_HAPPYWORK` 행복→작업량 H=0.24)의
//     **서버 기본이 켬**이 되었다 ⇒ 랩도 그 셋을 **켠 채** 떠야 같은 기계다. 검사는 "0 이냐"가 아니라
//     **"랩 기본 = 서버 기본이냐"** 를 묻는다. 그래서 아래는 두 갈래다:
//       ⓐ 아직 서버가 안 심는 손잡이들(석재·귀환화물·마모·경작칸·사냥/목재 소득) → 종전대로 "문 안 여는 값"
//       ⓑ T244 로 켜진 셋 → **엔진 기본을 자식 프로세스에서 실측**하고(족보 128 · env 청소) 랩이 그것과 같은지
//     그리고 ⓑ 의 값은 랩에 **적지 않는다** — 랩은 `EconEngine.T157_HAPPYWORK_H` 를 읽는다(사본 0).
console.log('\n[H] 랩 부팅 기본 = 서버 기본(주입 없음)');
{
  // 각 줄: [이름, 기본값을 읽는 정규식, 서버와 같은 값(=문을 안 여는 값), 왜]
  const LABKNOBS = [
    // ★[T244] `L_HAPPYWORK`·`L_ALLOC_REAL` 은 이 표에서 **뺐다** — 서버 기본이 켬이 되어 "0 이어야 한다"가 거짓이 됐다.
    //   둘(과 `L_HAPPY_FLOOR1`)은 아래 ⓑ 절에서 **엔진 실측값과 대조**한다. 여기 ⓐ 는 아직 서버가 안 심는 것들뿐이다.
    // ★[T263 · ★T362] `L_ALLOC_REAL` 과 같은 꼴 — 랩에 `window.…` 기본줄이 없고 econ 정본이 `_allocKnob` 으로 직접 읽는다.
    //   그래서 인라인 사본의 **그 함수 줄**을 읽어 "'0' 이면 끔"을 확인한다(랩이 `=1` 을 심으면 아래 별도 검사가 문다).
    ['T263_FOOD_CONS', /function foodConsOn\(\) \{ const x = _allocKnob\('T263_FOOD_CONS'\); return x !== null && x !== '([0-9])'; \}/, '0', 'T263 식사 흐름-EMA — 끔이 곧 2026-07-12 판정(수출 억압 회피)'],
    ['L_STONEREAL',  /window\.L_STONEREAL\s*===\s*undefined\)\s*window\.L_STONEREAL\s*=\s*([0-9.]+)/,   '0', 'T163 석재 실물 — 서버는 stoneBudgetFn 을 안 심는다'],
    ['L_STONE_TRADE',/window\.L_STONE_TRADE\s*===\s*undefined\)\s*window\.L_STONE_TRADE\s*=\s*([0-9.]+)/,'0', 'T173 귀환 화물 — 서버는 returnPullFn 을 안 심는다'],
    ['L_TOOL_WEAR',  /window\.L_TOOL_WEAR\s*===\s*undefined\)\s*window\.L_TOOL_WEAR\s*=\s*([0-9.]+)/,   '1', 'T180 도구 마모 — 배수 1 이면 문을 안 연다(서버도 toolWearMul 없음)'],
    ['L_LANDMUL',    /let\s+L_LANDMUL\s*=\s*\(typeof window[^;]*?:\s*([0-9.]+)\s*;/,           '1',        'T138 경작칸 배수 — 1 이면 정본 LAND_NEED 그대로'],
  ];
  const MODES = [
    ['L_HUNTINCOME', /function _huntIncomeMode\(\)\{return \(typeof window[^;]*?:\s*'([a-z]+)'/, 'abstract', 'T154 사냥 소득 — 서버는 huntIncomeFn 을 안 심는다'],
    ['L_WOODINCOME', /function _woodIncomeMode\(\)\{return \(typeof window[^;]*?:\s*'([a-z]+)'/, 'abstract', 'T166 목재 소득 — 서버는 woodIncomeFn 을 안 심는다'],
  ];
  const scan = (src) => {
    const out = [];
    for (const [name, re, want, why] of LABKNOBS.concat(MODES)) {
      const m = src.match(re);
      if (!m) { out.push([name, null, want, why]); continue; }
      if (String(m[1]) !== want) out.push([name, m[1], want, why]);
    }
    return out;
  };
  const warLab = fs.readFileSync(path.join(root, 'lab', '전쟁실험실.html'), 'utf8');
  const bad0 = scan(warLab);
  for (const [name, got, want, why] of bad0) {
    if (got === null) bad(`랩 손잡이 ${name} 기본값을 못 찾았다 — 검사기가 낡았거나 손잡이가 사라졌다`);
    else bad(`랩 ${name} 기본 ${got} ≠ 서버 기본 ${want} — 랩이 켠 채 뜬다(${why})`);
  }
  if (!bad0.length) ok(`랩 부팅 기본이 서버 기본과 같다 — 손잡이 ${LABKNOBS.length + MODES.length}개 전수(${LABKNOBS.concat(MODES).map((k) => k[0]).join(' · ')})`);
  // ★[T263 · ★T362] 같은 자리 — 식사 흐름-EMA 도 랩이 `window.T263_FOOD_CONS = 1` 을 심으면 켠 채 뜬다.
  {
    const lines = warLab.split('\n').filter((l) => /window\.T263_FOOD_CONS\s*=\s*[1-9]/.test(l) && !/^\s*\/\//.test(l));
    if (lines.length) bad(`랩이 T263_FOOD_CONS 를 켠 채 뜬다 — ${lines.length}줄`);
    else ok('랩은 T263_FOOD_CONS 를 심지 않는다(미설정 = 끔 = 서버 기본)');
  }
  // ★자명 통과 금지 — ⓐ 표의 손잡이 하나를 켠 채 뜨게 만들면 이 검사가 실제로 문다
  const mut = warLab.replace(/(window\.L_STONEREAL\s*===\s*undefined\)\s*window\.L_STONEREAL\s*=\s*)0/, '$1' + '1');
  if (mut === warLab) bad('[자명 통과 금지] 변조판을 못 만들었다 — 검사기가 읽는 자리가 그 자리가 아니다');
  else if (scan(mut).length > 0) ok('[자명 통과 금지] 켠 채 뜨는 판(L_STONEREAL=1)을 만들면 이 검사가 **문다**');
  else bad('[자명 통과 금지] 켠 채 뜨는 판을 만들어도 검사가 통과한다 — 검사기가 죽었다');

  // ── ⓑ [T244] 서버 기본이 **켬**이 된 손잡이 셋 — 엔진 실측 ↔ 랩 부팅 ─────────
  //   ★왜 자식 프로세스인가: 이 검사기를 부른 셸에 `L_*` 가 남아 있으면(A/B 하다 만 자리) 엔진 기본이
  //     그 값으로 보인다. 족보 128 — 변조·측정은 자식으로, env 는 손으로 지운다.
  {
    const { execFileSync } = require('child_process');
    const env = Object.assign({}, process.env);
    for (const k of ['L_ALLOC_REAL', 'L_HAPPY_FLOOR1', 'L_HAPPYWORK', 'L_CARGO_TWO', 'L_CARGO_TWO_GATE', 'L_CARGO_TWO_BEST']) delete env[k];
    // ★[T299] 둘째 화물·관문은 `sim/economy-sim-v2.js` 가 읽는다 — 같은 자식 프로세스에서 같이 실측한다.
    const probe = `const E=require(${JSON.stringify(path.join(root, 'sim', 'economy-sim.js'))});` +
      `const E2=require(${JSON.stringify(path.join(root, 'sim', 'economy-sim-v2.js'))});` +
      `console.log(JSON.stringify({alloc:E.allocRealOn?E.allocRealOn():null,floor:E.happyFloor1On(),H:E.happyWorkWOf({}),CONST:E.T157_HAPPYWORK_H,` +
      `cargo2:E2.cargoTwoOn?E2.cargoTwoOn({}):null,cargo2g:E2.cargoTwoGateOn?E2.cargoTwoGateOn({}):null,` +
      `cargo2off:E2.cargoTwoOn?E2.cargoTwoOn({cargoTwo:false}):null,` +
      // ★[T299 정정] 기본이 끔이면 "끔이다" 만으로는 자명 통과다 — **켤 길이 있는지도** 같은 자식에서 잰다.
      `cargo2on:(function(){process.env.L_CARGO_TWO='1';const r=E2.cargoTwoOn?E2.cargoTwoOn({}):null;delete process.env.L_CARGO_TWO;return r;})()}));`;
    let srv = null;
    //   ⚠`economy-sim-v2` 는 적재할 때 머리글을 찍는다 — **마지막 줄**만 JSON 이다(전문을 파싱하면 빨강).
    try { const _o = String(execFileSync(process.execPath, ['-e', probe], { env, encoding: 'utf8' })).trim().split('\n');
          srv = JSON.parse(_o[_o.length - 1]); }
    catch (e) { bad(`엔진 기본 실측 실패 — ${String(e.message || e).split('\n')[0]}`); }
    if (srv) {
      // ⓑ-1 엔진 기본 셋이 **켬**인가(재민 확정 T244)
      if (srv.floor === true) ok('서버 기본 `L_HAPPY_FLOOR1` = 켬(하한 1) — T209 길 ⓐ · T244 확정');
      else bad(`서버 기본 L_HAPPY_FLOOR1 이 ${srv.floor} 다 — T244 확정은 켬`);
      if (srv.alloc === true) ok('서버 기본 `L_ALLOC_REAL` = 켬(실현 배분) — T161/T164/T184 · T244 확정');
      else if (srv.alloc === null) bad('`allocRealOn` 이 export 안 됐다 — 검사기가 엔진 기본을 못 본다');
      else bad(`서버 기본 L_ALLOC_REAL 이 ${srv.alloc} 다 — T244 확정은 켬`);
      if (srv.H > 0 && Math.abs(srv.H - srv.CONST) < 1e-12) ok(`서버 기본 \`L_HAPPYWORK\` = 켬 H=${srv.H} = 정본 상수 T157_HAPPYWORK_H — T157 · T244 확정`);
      else bad(`서버 기본 happyWorkWOf({}) ${srv.H} ≠ 정본 상수 ${srv.CONST}(또는 0) — T244 확정은 켬`);

      // ⓑ-1b ★★[T299 · ★재민 판정 2026-09-19] 둘째 화물(`L_CARGO_TWO`)과 그 관문(`L_CARGO_TWO_GATE`)은 **끔**이다.
      //   T299 가 하루 켬으로 앉혔고 같은 날 재민이 되돌렸다(보고/T299 §7). 이 절이 그 값을 지킨다 —
      //   **자리는 ⓑ 에 남긴다**(ⓐ 의 정규식 표는 "랩이 심는 값"을 읽는데 이 둘은 랩이 **안 심는다**).
      //   `L_CARGO_TWO_BEST`(수익 최대 선택)도 **끔** — T265 가 15시드에서 `twogate` 와 못 가름이라 냈다.
      if (srv.cargo2 === false) ok('서버 기본 `L_CARGO_TWO` = **끔** — T299 정정(재민 09-19) · 켜는 것은 명시 `1`');
      else if (srv.cargo2 === null) bad('`cargoTwoOn` 이 export 안 됐다 — 검사기가 엔진 기본을 못 본다');
      else bad(`서버 기본 L_CARGO_TWO 가 ${srv.cargo2} 다 — 재민 09-19 판정은 끔`);
      if (srv.cargo2g === false) ok('서버 기본 `L_CARGO_TWO_GATE` = **끔** — 둘째 화물과 한 처방이라 같이 끈다');
      else if (srv.cargo2g === null) bad('`cargoTwoGateOn` 이 export 안 됐다 — 검사기가 엔진 기본을 못 본다');
      else bad(`서버 기본 L_CARGO_TWO_GATE 가 ${srv.cargo2g} 다 — 재민 09-19 판정은 끔`);
      if (srv.cargo2on === true) ok('손잡이 `L_CARGO_TWO=1` 이 **실제로 켠다**(문이 죽어 있지 않다 · 자명 통과 금지)');
      else bad(`\`L_CARGO_TWO=1\` 인데 ${srv.cargo2on} 다 — 켤 길이 없으면 손잡이가 아니다`);
      if (srv.cargo2off === false) ok('명시 주입 `cargoTwo:false` 도 존중한다(A/B·계측기의 끔 팔이 거기 산다)');
      else bad(`\`cargoTwo:false\` 주입이 ${srv.cargo2off} 다 — 끔 팔이 켠 판이 된다`);

      // ⓑ-2 랩 부팅이 그 셋과 **같은 자리**에서 뜨는가
      //   `L_HAPPYWORK`: 랩은 수를 적지 않고 `EconEngine.T157_HAPPYWORK_H` 를 읽는다(사본 0).
      const boot = warLab.match(/let\s+L_HAPPYWORK\s*=\s*\(typeof window[^;]*?\)\s*\?\s*\+window\.L_HAPPYWORK\s*:\s*([^;]+);/);
      if (!boot) bad('랩 L_HAPPYWORK 부팅 줄을 못 찾았다 — 검사기가 낡았거나 손잡이가 사라졌다');
      else {
        const fb = boot[1];
        if (!/EconEngine\s*(\.|&&\s*EconEngine\.)?\s*T157_HAPPYWORK_H/.test(fb))
          bad(`랩 L_HAPPYWORK 기본이 정본 상수를 안 읽는다 — \`${fb.trim()}\`(사본이 생겼다)`);
        else if (/:\s*[0-9.]+\s*$/.test(fb) && !/\|\|\s*0\s*\)?\s*$/.test(fb))
          bad(`랩 L_HAPPYWORK 기본에 수가 박혔다 — \`${fb.trim()}\``);
        else ok(`랩 L_HAPPYWORK 기본 = 정본 상수 \`EconEngine.T157_HAPPYWORK_H\`(=${srv.CONST}) — 사본 0 · 서버 기본과 같은 자리`);
      }
      //   `L_ALLOC_REAL`·`L_HAPPY_FLOOR1`: 엔진이 `_allocKnob`/env·window 로 **직접** 읽는다 ⇒ 랩이 **안 심으면** 켬(= 서버 기본).
      //   ★T244 로 뒤집혔다: 종전엔 "1 을 심으면 빨강"이었고 이제는 **"0 을 심으면 빨강"**(랩만 끈 채 뜬다).
      for (const k of ['L_ALLOC_REAL', 'L_HAPPY_FLOOR1']) {
        const re = new RegExp('window\\.' + k + "\\s*=\\s*['\"]?0['\"]?");
        const lines = warLab.split('\n').map((l) => l.replace(/\/\/.*$/, '')).filter((l) => re.test(l));
        if (lines.length) bad(`랩이 ${k} 을(를) **끈 채** 뜬다 — ${lines.length}줄(서버 기본은 켬)`);
        else ok(`랩은 ${k} 을(를) 심지 않는다(미설정 = **켬** = 서버 기본 · T244 · T299)`);
      }
      // ★★[T299 정정] 둘째 화물 손잡이 둘은 **값이 아니라 자리**를 문다. 서버 기본이 끔이고 랩이 안 심으면
      //   미설정 = 끔 = 서버 기본이다. 랩이 `0` 을 심으면 사본(같은 값이라 안 들킨다)이고 `1` 이면 랩만 켠 채 뜬다 —
      //   **어느 쪽이든 빨강.** 기본이 하루 만에 두 번 뒤집힌 자리라 검사기에 값을 안 적는다.
      for (const k of ['L_CARGO_TWO', 'L_CARGO_TWO_GATE']) {
        const re = new RegExp('window\\.' + k + "\\s*=\\s*['\"]?[0-9]");
        const lines = warLab.split('\n').map((l) => l.replace(/\/\/.*$/, '')).filter((l) => re.test(l));
        if (lines.length) bad(`랩이 ${k} 에 값을 **심는다** — ${lines.length}줄(엔진이 window 를 직접 읽으므로 사본이다)`);
        else ok(`랩은 ${k} 에 **아무 값도 안 심는다**(미설정 = 끔 = 서버 기본 · T299 정정)`);
      }
      { // ★자명 통과 금지 — 값을 심은 판을 만들면 위 검사가 실제로 문다(0 이든 1 이든)
        const reC = /window\.L_CARGO_TWO\s*=\s*['"]?[0-9]/;
        const mutC = warLab.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n') + '\nwindow.L_CARGO_TWO = 0;\n';
        if (reC.test(mutC)) ok('[자명 통과 금지] 랩이 `L_CARGO_TWO=0` 을 심은 판을 만들면 이 검사가 **문다**');
        else bad('[자명 통과 금지] 값을 심은 판을 만들어도 안 문다 — 검사기가 죽었다');
      }
      // ★자명 통과 금지 — 랩이 끈 채 뜨는 판을 만들면 이 검사가 실제로 문다
      const mut3 = warLab + '\nwindow.L_HAPPY_FLOOR1 = 0;\n';
      const re3 = /window\.L_HAPPY_FLOOR1\s*=\s*['"]?0['"]?/;
      if (re3.test(mut3.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n'))) ok('[자명 통과 금지] 랩이 끈 채 뜨는 판을 만들면 이 검사가 **문다**');
      else bad('[자명 통과 금지] 끈 채 뜨는 판을 만들어도 안 문다 — 검사기가 죽었다');
    }
  }
  // ── ⓒ [T298] 서버 기본이 **켬**이 된 손잡이 둘 — 랩엔 대응이 아예 없다(생활층이 랩에 없다) ──────
  //   ★왜 ⓐ·ⓑ 어느 표에도 안 들어가나:
  //     `T230_TERR_HOUSING`(영토 주택 압력)·`T219_HOUSE_TRIGGER`(집터 방아쇠)는 **생활층 손잡이**다.
  //     생활층(`_terrGrow`·`_lifeAddHouseSite`)은 `server/villages.js` **밖에 없다** — 랩(브라우저)엔
  //     그 파일이 없고 제 `growTerritory`·인라인 방아쇠를 따로 갖는다. 그래서 "랩이 0 을 심었나"를
  //     물을 수 없다. 대신 두 갈래로 묻는다:
  //       ⓒ-1 서버 기본이 **켬**이냐 — 소스 정규식이 아니라 **실측문**(`__probe.handles()`)으로,
  //            env 를 지운 자식 프로세스에서(족보 128). 극성을 정규식으로 읽으면 규약이 또 뒤집힐 때
  //            하네스만 빨강이 된다(T298 §0ⓒ 가 실제로 밟았다).
  //       ⓒ-2 랩엔 **끄는 문이 없다** ⇒ 랩은 늘 켠 쪽 = 서버 기본과 같은 기계다.
  //            (값이 같으냐는 [I] 절이 42,000점 전수로 이미 본다 — 여기서 다시 적지 않는다.)
  {
    const { execFileSync } = require('child_process');
    const doorSrc = `console.log(JSON.stringify(require(${JSON.stringify(path.join(root, 'server', 'villages.js'))}).__probe.handles()));`;
    const askDoor = (over) => {
      const env = Object.assign({}, process.env);
      for (const k of ['T230_TERR_HOUSING', 'T219_HOUSE_TRIGGER']) delete env[k];
      Object.assign(env, over || {});
      return JSON.parse(String(execFileSync(process.execPath, ['-e', doorSrc], { env, encoding: 'utf8' })).trim());
    };
    let dflt = null, off = null;
    try { dflt = askDoor(null); off = askDoor({ T230_TERR_HOUSING: '0', T219_HOUSE_TRIGGER: '0' }); }
    catch (e) { bad(`생활층 손잡이 실측 실패 — ${String(e.message || e).split('\n')[0]} (실측문 \`__probe.handles\` 가 사라졌나)`); }
    if (dflt && off) {
      for (const k of ['T230_TERR_HOUSING', 'T219_HOUSE_TRIGGER']) {
        if (dflt[k] === true) ok(`서버 기본 \`${k}\` = **켬**(미설정 · 자식 프로세스 실측 · 정규식 0) — T298 재민 #22`);
        else bad(`서버 기본 ${k} 이 ${dflt[k]} 다 — T298 확정은 켬`);
        if (off[k] === false) ok(`  끄는 문은 명시 \`${k}=0\` 하나 — 그 판만 종전 경로(되돌림 자리 하나)`);
        else bad(`  ${k}=0 인데 ${off[k]} 다 — 되돌림 문이 막혔다`);
      }
      // ★자명 통과 금지 — 같은 주장을 **끈 판**에 대고 물으면 거짓이어야 한다(검사가 실제로 문다)
      if (off.T230_TERR_HOUSING !== true && off.T219_HOUSE_TRIGGER !== true)
        ok('[자명 통과 금지] 끈 판(`=0` 둘)에 ⓒ-1 의 주장을 대면 **거짓**이다 — 이 검사는 문다');
      else bad('[자명 통과 금지] 끈 판에서도 ⓒ-1 이 참이다 — 실측문이 손잡이를 안 읽는다');
    }
    // ⓒ-2 랩엔 이 둘을 끄는 문이 없다(랩은 늘 켠 쪽)
    for (const f of ['lab/마을실험실.html', 'lab/전쟁실험실.html']) {
      const H = rd(f).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
      const knob = H.match(/window\.(L_(?:TERR|HOUSESITE|HOUSE_TRIGGER)[A-Z_]*)\s*=/g);
      if (knob) bad(`랩 ${f} 에 생활층 손잡이 흉내가 생겼다(${Array.from(new Set(knob)).join(' · ')}) — 끌 수 있으면 서버 기본과 갈린다`);
      else ok(`랩 ${f} 엔 영토·집터를 **끄는 문이 없다** — 랩은 늘 켠 쪽 = 서버 기본(T298)`);
    }
  }

  // ★★[T226] **나무 층은 랩에 얹지 않는다 — 얹으면 죽은 층이 된다.**
  //   `server/trees.js attachToWorld` 는 econ 문 둘(`forageRealItems`·`forageTakeFn`)을 심지만 그 값은
  //   `treeCountOf(v)` → `livelihood`·`chunk`·`villages`·`zone-config` 에 묶여 있고, 브라우저엔 그 넷이 없어
  //   `treeCountOf` 첫 줄이 **0** 을 낸다. 그런데 econ 은 `forageRealItems` 에 든 품목의 **추상 산출을 걷어내고**
  //   그 자리를 `forageTakeFn` 이 채우게 한다(`sim/economy-sim.js` T135 접점) ⇒ 걷어내기만 하고 아무도 안 채운다.
  //   랩은 **제 실물 나무**(칸별 `forestRich`·`fruitRich`·`fruitSettle`)로 같은 품목 넷을 곳간에 직접 넣는다 —
  //   그게 서버 표의 **원천**이다(`scripts/build-trees.js`). 그래서 랩은 그 문을 **안 연다**. 전문 `보고/T226_*.md`.
  {
    const labSrc = warLab.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const opens = /ECON_WORLD\.forage(TakeFn|RealItems)\s*=/.test(labSrc);
    if (opens) bad('랩이 `ECON_WORLD.forageTakeFn/RealItems` 를 연다 — 브라우저엔 나무 층 의존(chunk·livelihood·villages)이 없어 **죽은 층**이 된다(T226)');
    else ok('랩은 나무 층 문(`forageTakeFn`·`forageRealItems`)을 **안 연다** — 랩은 제 실물 나무로 같은 품목 넷을 곳간에 직접 넣는다(T226)');
    const mut2 = labSrc + '\nECON_WORLD.forageTakeFn = 1;\n';
    if (/ECON_WORLD\.forage(TakeFn|RealItems)\s*=/.test(mut2)) ok('[자명 통과 금지] 그 문을 여는 판을 만들면 이 검사가 **문다**');
    else bad('[자명 통과 금지] 문을 여는 판을 만들어도 안 문다 — 검사기가 죽었다');
    // 랩의 실물 열매 품목 넷 ↔ 서버 표의 열매 품목 넷이 같은가(정본 하나)
    const TR = require(path.join(root, 'server', 'trees.js'));
    const srvItems = TR.fruitItems().slice().sort();
    const labItems = Array.from(new Set((warLab.match(/fruit:'([a-z_]+)'/g) || []).map((x) => x.replace(/^fruit:'|'$/g, '')))).sort();
    if (srvItems.join('|') === labItems.join('|')) ok(`랩 표와 서버 표의 열매 품목이 같다(${srvItems.join(' · ')}) — 서버 표는 랩에서 굽는다`);
    else bad(`랩 열매 품목 [${labItems.join(' · ')}] ≠ 서버 [${srvItems.join(' · ')}] — 굽기가 낡았거나 표가 갈렸다`);
  }

  // 서버가 심는 것은 나무 층 둘뿐 — 그 목록이 늘면 이 절도 늘어야 한다
  const V2 = fs.readFileSync(path.join(root, 'server', 'villages.js'), 'utf8');
  const inj = (V2.match(/world\.[A-Za-z_]+\s*=/g) || []).map((x) => x.replace(/\s*=$/, ''));
  //   ★★[T347 2026-09-22] **표를 갱신했다** — 서버가 세계에 다는 것이 **하나 늘었다**:
  //     `_world.forageActItems`(채집 행위가 걷을 품목 목록 · `server/villages.js` `_t347ActItems`).
  //     나무 층처럼 `attachToWorld` 에서 못 심는다: 목록이 `state.deps.t347LootOf`(존 전리품 표)를
  //     지나야 나오고 그 deps 는 세계 생성 **뒤**에 선다 ⇒ 하루 경계에서 한 번 심는다(멱등).
  //     ⚠**랩은 이 문도 안 연다**(T226 과 같은 이유 — 브라우저엔 군락·청크가 없다). 아래 절이 그것을 잰다.
  //   ⚠이름은 위 정규식이 잡는 그 꼴이다(`world.` 부터 잡는다 — 코드에선 `vil.econ._world.forageActItems`).
  const T347_INJ = 'world.forageActItems';
  const extra = inj.filter((x) => !['world.villages', 'world.events', 'world.day', T347_INJ].includes(x));   // 상태(목록·장부·날짜)는 주입이 아니다
  if (inj.includes(T347_INJ)) ok('서버가 채집 걷는 목록을 심는다(`' + T347_INJ + '` · T347) — [H] 표에 적혀 있다');
  else wrn('`' + T347_INJ + '` 주입이 사라졌다 — T347 이 걷어졌으면 이 줄도 지워라');
  {
    const labSrc2 = warLab.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    if (/forageActItems\s*=/.test(labSrc2)) bad('랩이 `forageActItems` 를 연다 — 브라우저엔 군락·청크가 없어 **걷어내기만 하고 아무도 안 채운다**(T226 과 같은 사고)');
    else ok('랩은 채집 행위 문(`forageActItems`)을 **안 연다** — 걷어내기만 하는 판이 안 생긴다(T347)');
  }
  if (!extra.length) ok('서버가 세계에 직접 다는 주입 함수 0개(나무 층은 `trees.attachToWorld` 한 곳) — 랩이 맞출 대상이 그대로다');
  else wrn(`서버가 세계에 다는 것이 늘었다: ${extra.join(' · ')} — [H] 표를 갱신해라`);
}

// ══════════════════════════════════════════════════════════════════════════════
// [I] ★★[T230] 집터 방아쇠 — 랩과 서버가 **같은 함수**를 부르나 (사본 0)
// ══════════════════════════════════════════════════════════════════════════════
//   T219 가 규칙을 `server/village-layout.js houseSiteWant` 하나에 세웠고, T230 이 랩 세 줄을
//   그 함수 호출로 바꿨다. 랩은 village-layout 을 **손 사본**으로 인라인하므로(그 파일 `LAND_NEED`
//   주석의 규약) 기계가 대조해야 한다 — 안 그러면 조용히 갈라진다.
console.log('\n[I] 집터 방아쇠 — 정본 하나(T230)');
{
  const VL = require(path.join(root, 'server', 'village-layout.js'));
  const canonSrc = rd('server/village-layout.js');
  // 정본 함수의 **본문**(공백 제거)을 뽑는다 — 이 문자열이 랩 인라인 사본과 같아야 한다.
  const grab = (src) => {
    const i = src.indexOf('const houseSiteWant');
    if (i < 0) return null;
    const j = src.indexOf('};', i);
    return j < 0 ? null : src.slice(i, j + 2).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
  };
  const canonFn = grab(canonSrc);
  if (!canonFn) bad('village-layout.js 에 houseSiteWant 가 없다 — 정본이 사라졌다');
  if (typeof VL.houseSiteWant !== 'function') bad('village-layout.js 가 houseSiteWant 를 안 내준다');
  for (const f of ['lab/마을실험실.html', 'lab/전쟁실험실.html']) {
    const H = rd(f);
    const labFn = grab(H);
    if (!labFn) { bad(`랩 ${f} 인라인 layout 에 houseSiteWant 가 없다 — 손 동기가 안 됐다`); continue; }
    if (labFn !== canonFn) bad(`랩 ${f} 인라인 houseSiteWant 본문이 정본과 다르다 — 손으로 맞춰라`);
    else ok(`랩 ${f} 인라인 houseSiteWant 본문 = 정본 village-layout.js 와 한 글자도 안 다르다`);
    // 방아쇠가 **그 함수를 부르나** · 규칙을 다시 적지 않나
    const callN = (H.match(/VillageLayout\.houseSiteWant\(/g) || []).length;
    if (callN < 1) bad(`랩 ${f} 생활층 방아쇠가 houseSiteWant 를 안 부른다`);
    else ok(`랩 ${f} 방아쇠가 정본 함수를 부른다(${callN}곳)`);
    if (/builtFl\s*\+\s*sites\s*<\s*targetFloors/.test(H)) bad(`랩 ${f} 에 옛 방아쇠 수식이 남아 있다 — 사본 둘`);
    else ok(`랩 ${f} 에 옛 방아쇠 수식이 없다(사본 0)`);
    // 층 상한 — 랩 L_MAXFL 과 모듈 HOUSE_MAX_FLOORS
    const mf = H.match(/L_MAXFL\s*=\s*([0-9]+)/);
    if (!mf) wrn(`랩 ${f} L_MAXFL 을 못 찾았다`);
    else if (+mf[1] !== VL.HOUSE_MAX_FLOORS) bad(`랩 ${f} L_MAXFL ${mf[1]} ≠ 정본 HOUSE_MAX_FLOORS ${VL.HOUSE_MAX_FLOORS}`);
    else ok(`랩 ${f} L_MAXFL ${mf[1]} = 정본 HOUSE_MAX_FLOORS ${VL.HOUSE_MAX_FLOORS}`);
    // 집 간격 — ★[T326] **양쪽 다 리터럴이 없다.** 랩은 `VillageLayout.LIFE_HOUSE_GAP` 을 읽고, 서버 `HG` 는
    //   `_lifeVL().LIFE_HOUSE_GAP`(기본) / `LIFE_HOUSE_GAP_AISLE`(되돌림)을 읽는다. 그래서 묻는 것이 셋으로 바뀐다:
    //     ⓘ-1 랩에 간격 **리터럴이 없다**(정본 심볼을 읽는다)
    //     ⓘ-2 서버 `HG` 의 **기본 분기가 `LIFE_HOUSE_GAP`**(= 통로 항 버린 값 · PM #52)이고 되돌림이 `LIFE_HOUSE_GAP_AISLE`
    //     ⓘ-3 랩 인라인 사본의 `LIFE_HOUSE_GAP` **식 본문**이 정본과 한 글자도 안 다르다(손 동기 규약 · 값이 아니라 식을 본다)
    if (/L_HGAP\s*=\s*[0-9]/.test(H)) bad(`랩 ${f} L_HGAP 에 수가 박혔다 — 정본 \`VillageLayout.LIFE_HOUSE_GAP\` 을 읽어야 한다(T326)`);
    else if (!/L_HGAP\s*=\s*VillageLayout\.LIFE_HOUSE_GAP\b/.test(H)) bad(`랩 ${f} L_HGAP 이 정본 심볼을 안 읽는다 — 검사기가 낡았거나 손잡이가 사라졌다`);
    else ok(`랩 ${f} L_HGAP = \`VillageLayout.LIFE_HOUSE_GAP\` — 리터럴 0(T326 · 기본 ${VL.LIFE_HOUSE_GAP})`);
    const sg = /HG\s*=\s*T315_HOUSE_GAP\s*===\s*'0'\s*\?\s*_lifeVL\(\)\.LIFE_HOUSE_GAP_AISLE\s*:\s*_lifeVL\(\)\.LIFE_HOUSE_GAP\b/.test(LIVE);
    if (!sg) bad('서버 `HG` 가 기본=`LIFE_HOUSE_GAP` · 되돌림=`LIFE_HOUSE_GAP_AISLE` 꼴이 아니다 — 기본이 뒤집혔거나 검사기가 낡았다(T326)');
    else ok(`서버 \`HG\` 기본 = 정본 \`LIFE_HOUSE_GAP\`(${VL.LIFE_HOUSE_GAP}) · 되돌림 \`=0\` = \`LIFE_HOUSE_GAP_AISLE\`(${VL.LIFE_HOUSE_GAP_AISLE}) — 문 하나(T326 PM #52)`);
    {
      const pick = (src) => { const m = src.match(/LIFE_HOUSE_GAP\s*=\s*LOT_R\s*\+\s*\(\s*LOT_R\s*\+\s*FARM_GAP\s*\)/); return m ? m[0].replace(/\s+/g, '') : null; };
      const a = pick(canonSrc), b = pick(H);
      if (!a || !b) bad(`집 간격 유도식을 한쪽에서 못 찾았다(정본 ${!!a} · 랩 ${!!b}) — 손 동기가 안 됐다`);
      else if (a !== b) bad(`랩 ${f} LIFE_HOUSE_GAP 식이 정본과 다르다 — 손으로 맞춰라`);
      else ok(`랩 ${f} 인라인 \`LIFE_HOUSE_GAP\` 식이 정본과 한 글자도 안 다르다(\`${a}\` = ${VL.LIFE_HOUSE_GAP})`);
    }
    // 영토 목표 — ★★[T599 ← T579 추신] 랩은 이제 목표·상한을 **정본 `territoryTarget` 호출**로 낸다(번들이 내놓는 `EconEngine.Layout` — 손 사본 0).
    //   종전엔 랩 줄(`_hLots` — 집 압력 두 수를 옮겨 적은 식)이 정본의 두 수와 같은지만 핀했다. 그 줄은 걷혔다 — 남아 있으면 사본 둘이다.
    if (/_hLots\s*=/.test(H)) bad(`랩 ${f} growTerritory 에 옛 집 압력 줄(_hLots)이 남아 있다 — 정본 territoryTarget 과 사본 둘(T599)`);
    else ok(`랩 ${f} growTerritory 에 옛 집 압력 줄(_hLots)이 없다 — 사본 0(T599)`);
    {
      const tt = (H.match(/EconEngine\.Layout\.territoryTarget\(/g) || []).length;
      if (tt < 2) bad(`랩 ${f} 영토 목표·상한이 정본 territoryTarget 을 안 부른다(${tt}곳 — 목표·상한 둘이어야 한다 · T599)`);
      else ok(`랩 ${f} 영토 목표·상한 = 정본 \`EconEngine.Layout.territoryTarget\` 호출 ${tt}곳(서버 \`_terrCap\` '2' = 집 압력 항 · T599)`);
    }
  }
  // ★판정 동등 — 옛 랩 수식과 정본 함수가 **모든 점에서 같은 답**인가(호출로 바꾼 것이 행동을 안 바꿨다)
  const oldRule = (pop, housing, builtFl, sites) => {
    const targetFloors = Math.ceil(Math.max(pop, housing || 0) / VL.HOUSE_CAP_PER_FLOOR);
    return builtFl + sites < targetFloors && sites < Math.max(2, Math.round(pop / 25));
  };
  let n = 0, diff = 0, trueN = 0;
  for (let pop = 0; pop <= 300; pop += 1) for (const housing of [0, 1, 7, pop, pop * 1.15, pop * 3])
    for (const builtFl of [0, 1, 2, 4, 9, 40]) for (const sites of [0, 1, 2, 5]) {
      n++; const a = oldRule(pop, housing, builtFl, sites), b = VL.houseSiteWant(pop, housing, builtFl, sites);
      if (a) trueN++; if (a !== b) diff++;
    }
  ok(`판정 동등 — 옛 랩 수식 vs 정본 함수: ${n.toLocaleString()}점 전수 비교 · 다른 점 **${diff}** (참 ${trueN.toLocaleString()}점 — 자명 통과 아님)`);
  if (diff !== 0) bad(`판정이 갈린다 — 다른 점 ${diff}`);
  // ★자명 통과 금지 — 정본을 비틀면 이 비교가 문다
  {
    const mutated = (pop, housing, builtFl, sites) => {
      const t = Math.ceil(Math.min(pop, housing || 0) / VL.HOUSE_CAP_PER_FLOOR);   // max → min
      return builtFl + sites < t && sites < Math.max(2, Math.round(pop / 25));
    };
    let d2 = 0;
    for (let pop = 0; pop <= 300; pop += 1) for (const housing of [0, 1, 7, pop, pop * 1.15, pop * 3])
      for (const builtFl of [0, 1, 2, 4, 9, 40]) for (const sites of [0, 1, 2, 5])
        if (oldRule(pop, housing, builtFl, sites) !== mutated(pop, housing, builtFl, sites)) d2++;
    if (d2 > 0) ok(`[자명 통과 금지] 정본을 \`max\`→\`min\` 으로 비틀면 ${d2.toLocaleString()}점이 갈린다 — 비교가 실제로 문다`);
    else bad('[자명 통과 금지] 비틀어도 같은 답이 나온다 — 비교가 죽었다');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// [J] ★★[T315] 집 간격 18 — **값이 아니라 유도인가** (두 경로가 같은 답을 내나 · 사본 0)
// ══════════════════════════════════════════════════════════════════════════════
//   T298 이 켠 세계에서 집터 거부의 66% 가 이 수였다. 그 수는 리터럴이었고 출처 주석이 없었다.
//   T315 가 유도를 심었다 — 이 절은 그 유도가 **살아 있나**(상수를 비틀면 답이 따라 움직이나) 를 본다.
//   묻는 것 넷:
//     ⓐ 닫힌식이 정본 세 항으로만 서 있나 — `2 × (LOT_R + FARM_GAP) + AISLE`
//     ⓑ **셀 집합**으로 재도 같은 수인가(독립 경로: `LOT_GUARD` 원판 둘 · 짝수 격자 · 8방 한 칸 팽창)
//     ⓒ 켠 판(`houseGap(1)`)이 끔값과 같은가 ⇒ "리터럴이 유도값이었다" 의 기계 증명
//     ⓓ [자명 통과 금지] `FARM_GAP` 을 비틀면 두 경로가 **같이** 움직이나(둘 다 상수를 실제로 읽는다)
console.log('\n[J] 집 간격 유도 — 값이 아니라 식(T315)');
{
  const VLj = require(path.join(root, 'server', 'village-layout.js'));
  // ⓐ 닫힌식 둘 — 종전(통로 포함)과 ★기본(통로 버림 · PM #52)
  const closedA = 2 * (VLj.LOT_R + VLj.FARM_GAP) + VLj.AISLE;
  const closedD = VLj.LOT_R + (VLj.LOT_R + VLj.FARM_GAP);
  if (closedA === VLj.LIFE_HOUSE_GAP_AISLE)
    ok(`ⓐ-1 종전 닫힌식 = 2 × (LOT_R ${VLj.LOT_R} + FARM_GAP ${VLj.FARM_GAP}) + AISLE ${VLj.AISLE} = **${closedA}** = \`LIFE_HOUSE_GAP_AISLE\`(되돌림 값)`);
  else bad(`ⓐ-1 닫힌식 ${closedA} ≠ LIFE_HOUSE_GAP_AISLE ${VLj.LIFE_HOUSE_GAP_AISLE} — 유도가 값과 갈렸다`);
  if (closedD === VLj.LIFE_HOUSE_GAP)
    ok(`ⓐ-2 ★**기본** 닫힌식 = LOT_R ${VLj.LOT_R} + (LOT_R + FARM_GAP ${VLj.LOT_R + VLj.FARM_GAP}) = **${closedD}** = \`LIFE_HOUSE_GAP\` — 통로 항을 뺀 것(PM #52 · 새 수 0)`);
  else bad(`ⓐ-2 닫힌식 ${closedD} ≠ LIFE_HOUSE_GAP ${VLj.LIFE_HOUSE_GAP} — 기본 유도가 값과 갈렸다`);
  if (VLj.LIFE_HOUSE_GAP < VLj.LIFE_HOUSE_GAP_AISLE)
    ok(`  기본이 종전보다 **좁다** — ${VLj.LIFE_HOUSE_GAP} < ${VLj.LIFE_HOUSE_GAP_AISLE}(통로 한 칸 + 완충 한쪽만큼)`);
  else bad(`  기본 ${VLj.LIFE_HOUSE_GAP} 이 종전 ${VLj.LIFE_HOUSE_GAP_AISLE} 보다 안 좁다 — PM #52 와 다르다`);
  // ⓑ 셀 집합 — 정본 원판을 그대로 쥐고 센다(수를 다시 적지 않는다)
  //   ★[T326] 일반화: 한쪽 집합 `A`(원점) ↔ 다른쪽 집합 `B`(오프셋) 이 안 닿는 최소 중심거리.
  //     `aisle=true` 면 A 를 8방 한 칸 팽창시켜(= 사이에 통로 한 칸을 요구) 잰다. 둘 다 정본 셀집합을 그대로 쥔다.
  const cellGap = (A0, B0, aisle) => {
    const guardB = B0 || A0, wantAisle = aisle === undefined ? true : !!aisle;
    const setOf = (cells, ox, oy) => { const S = new Set(); for (const [dx, dy] of cells) S.add((ox + dx) + ',' + (oy + dy)); return S; };
    const dil = (S) => { const o = new Set(); for (const k of S) { const i = k.indexOf(','), x = +k.slice(0, i), y = +k.slice(i + 1);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) o.add((x + a) + ',' + (y + b)); } return o; };
    const hit = (S, T) => { for (const k of S) if (T.has(k)) return true; return false; };
    const base = setOf(A0, 0, 0), d0 = wantAisle ? dil(base) : base;
    let maxFail = 0;
    const R = Math.ceil(Math.max(...A0.concat(guardB).map(([a, b]) => Math.hypot(a, b))));
    const B = 2 * R + 6;
    for (let dx = -B; dx <= B; dx += 2) for (let dy = -B; dy <= B; dy += 2) {   // ★짝수 격자 — 집터 규약(villages.js · 랩 동일)
      if (!dx && !dy) continue;
      if (hit(d0, setOf(guardB, dx, dy))) { const h = Math.hypot(dx, dy); if (h > maxFail) maxFail = h; }
    }
    return { need: Math.floor(maxFail) + 1, maxFail };   // 통과 조건은 `hypot ≥ HG` ⇒ 깨지는 최대 hypot 을 넘는 최소 정수
  };
  const cg = cellGap(VLj.LOT_GUARD);
  if (cg.need === VLj.LIFE_HOUSE_GAP_AISLE)
    ok(`ⓑ-1 셀 집합으로도 **${cg.need}** — \`LOT_GUARD\`(${VLj.LOT_GUARD.length}셀) 원판 둘이 겹치거나 한 칸 팽창으로 닿는 최대 hypot ${cg.maxFail.toFixed(3)} ⇒ 종전 닫힌식과 같다(독립 경로)`);
  else bad(`ⓑ-1 셀 집합 ${cg.need} ≠ 닫힌식 ${VLj.LIFE_HOUSE_GAP_AISLE} — 두 경로가 갈린다(유도 해석이 틀렸다)`);
  // ★[T326] **기본값도 셀 집합으로 확인한다** — 한 집의 완충 원판이 다른 집의 **부지 원판**을 먹지 않는 최소 중심거리(팽창 없음)
  const cgD = cellGap(VLj.LOT_GUARD, VLj.LOT_CELLS, false);
  if (cgD.need === VLj.LIFE_HOUSE_GAP)
    ok(`ⓑ-2 ★기본도 셀 집합으로 **${cgD.need}** — 완충 원판(${VLj.LOT_GUARD.length}셀) ↔ 부지 원판(${VLj.LOT_CELLS.length}셀) 침범의 최대 hypot ${cgD.maxFail.toFixed(3)} ⇒ 닫힌식 ${VLj.LIFE_HOUSE_GAP} 과 같다`);
  else bad(`ⓑ-2 기본 셀 집합 ${cgD.need} ≠ 닫힌식 ${VLj.LIFE_HOUSE_GAP} — HALL_CLEAR 문법 해석이 틀렸다`);
  // ⓒ ★[T326] 기본 극성 — **실측문**에 물어본다(정규식으로 극성을 읽지 않는다 · T298 ⓞ 문법 · 족보 128)
  {
    const { execFileSync } = require('child_process');
    const door = `console.log(JSON.stringify(require(${JSON.stringify(path.join(root, 'server', 'villages.js'))}).__probe.handles()));`;
    const ask = (over) => {
      const env = Object.assign({}, process.env);
      for (const k of ['T315_HOUSE_GAP', 'T315_MAPBEDS']) delete env[k];
      Object.assign(env, over || {});
      return JSON.parse(String(execFileSync(process.execPath, ['-e', door], { env, encoding: 'utf8' })).trim());
    };
    let d0 = null, d1 = null;
    try { d0 = ask(null); d1 = ask({ T315_HOUSE_GAP: '0', T315_MAPBEDS: '0' }); }
    catch (e) { bad(`ⓒ 손잡이 실측 실패 — ${String(e.message || e).split('\n')[0]}`); }
    if (d0 && d1) {
      if (d0.T315_HOUSE_GAP !== '0' && d0.T315_MAPBEDS === true)
        ok(`ⓒ-1 서버 기본 — 간격 **켬**(미설정 ⇒ \`LIFE_HOUSE_GAP\` ${VLj.LIFE_HOUSE_GAP}) · \`_mapBeds\` 살리기 **켬** (자식 프로세스 실측 · PM #52)`);
      else bad(`ⓒ-1 서버 기본이 켬이 아니다 — 간격 ${d0.T315_HOUSE_GAP} · 살리기 ${d0.T315_MAPBEDS}`);
      if (d1.T315_HOUSE_GAP === '0' && d1.T315_MAPBEDS === false)
        ok('ⓒ-2 되돌림은 명시 `=0` 둘 — 그 판만 종전(간격 `LIFE_HOUSE_GAP_AISLE` 18 · 살리기 안 적음)');
      else bad(`ⓒ-2 =0 판이 종전으로 안 간다 — ${JSON.stringify(d1)}`);
      if (d1.T315_MAPBEDS !== true) ok('[자명 통과 금지] ⓒ-1 의 주장을 **끈 판**에 대면 거짓이다 — 실측문이 손잡이를 실제로 읽는다');
      else bad('[자명 통과 금지] 끈 판에서도 ⓒ-1 이 참이다 — 실측문이 손잡이를 안 읽는다');
    }
  }
  // ⓓ 자명 통과 금지 — 상수를 비틀면 두 경로가 같이 움직여야 한다
  {
    const src = fs.readFileSync(path.join(root, 'server', 'village-layout.js'), 'utf8');
    const mut = src.replace(/const HALL_YARD = 10, LOT_R = 6\.5, FARM_GAP = 2,/, 'const HALL_YARD = 10, LOT_R = 6.5, FARM_GAP = 3,');
    if (mut === src) bad('ⓓ [자명 통과 금지] 변조판을 못 만들었다 — 검사기가 읽는 자리가 그 자리가 아니다');
    else {
      const tmp = path.join(require('os').tmpdir(), `t315-vl-${process.pid}.js`);
      fs.writeFileSync(tmp, mut);
      let M = null; try { M = require(tmp); } catch (e) { bad(`ⓓ 변조판 적재 실패 — ${String(e.message).split('\n')[0]}`); }
      if (M) {
        const cg2 = cellGap(M.LOT_GUARD);
        // ★두 경로가 **같이 움직이나** 를 본다. 같은 수까지는 요구하지 않는다 —
        //   닫힌식은 연속 원 기준 **하한**이고 셀 집합은 반 칸 어긋난 이산 원판이라 상수에 따라 1 이 붙는다.
        //   (실측: FARM_GAP 0·1·2·4 에서 차 0 · 3·5 에서 차 1 — 정본 2 에서는 **정확히 같다**, 위 ⓑ.)
        const moved = M.LIFE_HOUSE_GAP_AISLE !== VLj.LIFE_HOUSE_GAP_AISLE && M.LIFE_HOUSE_GAP !== VLj.LIFE_HOUSE_GAP && cg2.need !== cg.need;
        const bound = M.LIFE_HOUSE_GAP_AISLE <= cg2.need;
        if (moved && bound)
          ok(`ⓓ [자명 통과 금지] \`FARM_GAP\` 2→3 으로 비틀면 기본 ${VLj.LIFE_HOUSE_GAP}→${M.LIFE_HOUSE_GAP} · 종전 ${VLj.LIFE_HOUSE_GAP_AISLE}→${M.LIFE_HOUSE_GAP_AISLE} · 셀 집합 ${cg.need}→${cg2.need} — **전부 움직인다**(셋 다 상수를 실제로 읽는다)`);
        else bad(`ⓓ [자명 통과 금지] 비틀어도 안 움직이거나 하한 관계가 깨진다(기본 ${M.LIFE_HOUSE_GAP} · 종전 ${M.LIFE_HOUSE_GAP_AISLE} · 셀 ${cg2.need}) — 유도가 죽었다`);
      }
      try { fs.unlinkSync(tmp); } catch (e) {}
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// [K] ★★[T599 2026-10-03] 랩 ↔ 서버 대조 — **서버에만 있던 여섯이 랩에도 같은 식으로 섰나**
// ══════════════════════════════════════════════════════════════════════════════
//   재민 캐논(09-03): "랩에서 만든 것이 목표 · 서버가 랩보다 얕으면 결함". 10-03 착지분 여섯이 서버에만 있었다 —
//   T599 가 랩으로 옮겼다(대조표 = `lab/README.md` '랩 ↔ 서버 대조' 절). 이 절은 그 '같다' 줄이 **계속 같은지** 기계로 본다.
//   묻는 것: ⓐ 번들이 두 정본(달력·마을 꼴)을 랩에 내놓나 ⓑ 식을 손으로 옮긴 곳은 서버 본문과 한 글자도 안 다른가
//            ⓒ 랩 생활층이 그 문을 실제로 부르나(부르는 자리 수) ⓓ [자명 통과 금지] 본문 비교가 실제로 문다.
console.log('\n[K] 랩 ↔ 서버 대조 — 서버에만 있던 여섯(T599)');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
  const fnBody = (src, sig) => {   // `function <sig>(...){...}` 한 덩이(중괄호 짝) — 공백·주석 제거
    const i = src.indexOf(sig); if (i < 0) return null;
    const j = src.indexOf('{', i); if (j < 0) return null;
    let d = 0, k = j;
    for (; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) break; } }
    return strip(src.slice(j, k + 1));
  };
  // ⓐ 번들 — 이미 실려 있던 두 모듈을 그대로 내놓는다(사본 0)
  const B = rd('sim/economy-engine.browser.js');
  if (/root\.EconEngine\.Calendar=modules\.cal;/.test(B) && /root\.EconEngine\.Layout=modules\.vlayout;/.test(B))
    ok('ⓐ 번들이 `EconEngine.Calendar`(= server/calendar.js) · `EconEngine.Layout`(= server/village-layout.js)을 내놓는다');
  else bad('ⓐ 번들이 달력·마을 꼴 정본을 안 내놓는다 — 랩이 다시 손으로 옮겨 적게 된다(sim/build-econ-bundle.js)');
  const BAN = rd('server/bandits.js'), VIL = rd('server/villages.js');
  // 서버 쪽 본문(비교 기준)
  const sHash = fnBody(BAN, 'function _t577Hash(');
  const sRng = fnBody(BAN, 'function denRng(');
  const sCat = (VIL.match(/const BX_CAT\s*=\s*(\{[^}]*\})/) || [])[1];
  if (!sHash || !sRng || !sCat) bad('서버 쪽 비교 기준을 못 찾았다(_t577Hash · denRng · BX_CAT) — 검사기가 낡았다');
  const catOf = (lit) => { try { return JSON.stringify(Function('return ' + lit)()); } catch (e) { return null; } };
  for (const f of ['lab/마을실험실.html', 'lab/전쟁실험실.html']) {
    const H = rd(f), war = /전쟁/.test(f);
    // T577 추신 — 보호기 끝 = 마을마다 다른 날(해시·결정론 RNG 본문이 서버와 같다)
    const lHash = fnBody(H, 'function _t577Hash(');
    const lRng = fnBody(H, 'function bdtDenRng(');
    if (!lHash) bad(`${f} [T577] _t577Hash 가 없다`);
    else if (lHash !== sHash) bad(`${f} [T577] _t577Hash 본문이 서버와 다르다 — 손으로 맞춰라`);
    else ok(`${f} [T577] _t577Hash 본문 = 서버 bandits.js 와 한 글자도 안 다르다`);
    if (!lRng || lRng.replace('_denSeed', 'S.denSeed') !== sRng) bad(`${f} [T577] bdtDenRng 본문이 서버 denRng 와 다르다(시드 변수 이름만 다를 수 있다)`);
    else ok(`${f} [T577] bdtDenRng 본문 = 서버 denRng(시드 변수 이름만 다르다)`);
    if (!/_eday>=_open/.test(H) || !/_open=_bdtOpenDay\(vil\)/.test(H)) bad(`${f} [T577] banditDaily 가 마을별 보호기 끝(_bdtOpenDay)을 안 본다`);
    else ok(`${f} [T577] banditDaily 결성 문 = econ 날 ≥ 마을별 보호기 끝(_bdtOpenDay)`);
    // T569 — 영토가 남의 영토로 안 자람 · 집터가 남의 집·영토를 봄
    const fo = (H.match(/if\(_t569Foreign\(s,x,y\)\)/g) || []).length;
    if (fo < (war ? 2 : 1)) bad(`${f} [T569] 집터 거름(_t569Foreign) 부르는 자리 ${fo} — ${war ? '마을 집터·플레이어 집터 둘' : '마을 집터 하나'}이어야 한다`);
    else ok(`${f} [T569] 집터가 남의 집·영토를 본다(_t569Foreign ${fo}곳 · 서버 '남의 마을' 거부 그 꼴)`);
    if (!/const _o=_claimedAll\.get\(kk\);if\(_o&&_o!==s\)continue;/.test(H)) bad(`${f} [T569] growTerritory 가 남의 영토 칸을 후보에서 안 뺀다`);
    else ok(`${f} [T569] growTerritory — 남의 영토 칸은 후보가 아니다(서버 _terrGrow 그 줄)`);
    // T570 — 달력 정본 호출
    const cl = (H.match(/EconEngine\.Calendar\.(labelOf|dateOf|springYearOf)\(/g) || []).length;
    if (cl < 2) bad(`${f} [T570] 화면 날짜가 달력 정본을 안 부른다(${cl}곳)`);
    else ok(`${f} [T570] 화면 날짜·달·해 = 달력 정본 호출 ${cl}곳(EconEngine.Calendar)`);
    // T590 — 줄어드는 몸(까닭 표가 서버와 같다 · lifeSync 가 그 문을 부른다)
    const lCat = (H.match(/const BX_CAT\s*=\s*(\{[^}]*\})/) || [])[1];
    if (!lCat || catOf(lCat) !== catOf(sCat)) bad(`${f} [T590] BX_CAT 표가 서버와 다르다`);
    else ok(`${f} [T590] BX_CAT 표 = 서버 villages.js(까닭 여덟 → 죽음·걸음·그 밖)`);
    if ((H.match(/\bbxSync\(s,\[/g) || []).length < 1 || (H.match(/\)bxEmptied\(vil\);/g) || []).length < 1) bad(`${f} [T590] lifeSync·마을 소멸이 몸 문(bxSync·bxEmptied)을 안 부른다`);
    else ok(`${f} [T590] lifeSync → bxSync · 비는 마을 → bxEmptied(몸이 econ 수의 그림자가 아니다)`);
    // T578 — 캐러밴 걸음(1/16칸 직선 검사) · 다시 파기(전쟁실험실 — 답압 길 층이 있는 랩)
    const wl = fnBody(H, 'function _walkLineClear(');
    if (!wl || !/Math\.ceil\(L\*16\)/.test(wl)) bad(`${f} [T578] 캐러밴 직선 검사(_walkLineClear · 1/16칸 보폭)가 없다`);
    else ok(`${f} [T578] 캐러밴 직선 검사 = 1/16칸 보폭(서버 _walkLineClear 그 보폭)`);
    const sc = (H.match(/_smoothCaravan\(jn[01]\)|_smoothCaravan\(_rt\)/g) || []).length;
    if (sc < 3) bad(`${f} [T578] dispatchTrades 교역 다리가 캐러밴 걸음 검사를 안 쓴다(${sc}곳 — 셋이어야 한다)`);
    else ok(`${f} [T578] dispatchTrades 교역 다리 세 토막 = _smoothCaravan`);
    if (war) {
      if (!/roadShadowDaily\(\);tpRedigDaily\(\);/.test(H) || !/hScale:hS/.test(H)) bad(`${f} [T578 ④] 교역로 다시 파기(tpRedigDaily) · h 축소(hScale)가 없다`);
      else ok(`${f} [T578 ④] 등급 지도가 바뀐 날 다닌 쌍을 다시 판다(tpRedigDaily) · h = 스텝 비용 최저값(hScale)`);
    }
  }
  // ⓓ 자명 통과 금지 — 본문 비교가 실제로 문다(서버 해시의 곱수를 비틀면 갈린다)
  {
    const mut = sHash ? sHash.replace('Math.imul(h,31)', 'Math.imul(h,37)') : null;
    const lab = fnBody(rd('lab/전쟁실험실.html'), 'function _t577Hash(');
    if (mut && mut !== sHash && lab && lab !== mut) ok('ⓓ [자명 통과 금지] 서버 해시 곱수 31→37 로 비틀면 랩 본문과 갈린다 — 비교가 실제로 문다');
    else bad('ⓓ [자명 통과 금지] 비틀어도 같은 답 — 본문 비교가 죽었다');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// [L] ★★[T641 2026-10-04] 랩 ↔ 서버 대조 2차 — **서버 env 손잡이 문** · **작물 철 월동 셈**(T594 거울 = 서버 T99)
// ══════════════════════════════════════════════════════════════════════════════
//   대조표 = `lab/README.md` '랩 ↔ 서버 대조 2차' 절. 이 절은 그 '옮김' 두 줄이 **계속 같은지** 기계로 본다.
//   ⓐ 문(`▼T641-ENV-DOOR`)이 두 랩에 하나씩 · 번들 시작 표시 **앞**(번들이 처음 실행될 때 env 가 이미 서 있어야 한다) ·
//      문 본문을 떠서 돌리면 URL **대문자 칸만** env 로 가고(랩 소문자 칸 `seed`·`cropcal` 은 안 샌다) · 칸이 없으면
//      `window.process` 를 **안 만든다**(= 종전 랩 그대로)
//   ⓑ 번들 shim 이 `root.process` 를 읽는다 · 서버와 같은 손잡이 줄(`T602_NEW_FISH` — server/specialty.js 의 그 줄)이 번들에 실려 있다
//   ⓒ [자명 통과 금지] 문 정규식을 풀어 소문자도 받게 비틀면 랩 손잡이 칸이 env 로 샌다 — 검사가 문다
//   ⓓ 작물 철 켬 — 랩 `cropGrowAt`(구운 블록 · `scripts/t594-lab-cropcal.js`) = 서버 `crops.readyDay`(T594_CROP_CAL=1)
//      거울 16종 × econ 날 0..1460(윤년 하나 포함) 전수 — 심는 날부터 익는 날까지 날수가 같은가
//   ⓔ [자명 통과 금지] T641 전 옛 줄(랩 1월 기점 365일 달력의 3월 1일 = econ 12월 30일)을 넣으면 월동 셋이 갈린다
console.log('\n[L] 랩 ↔ 서버 대조 2차 — 서버 env 손잡이 문 · 작물 철 월동 셈(T641)');
{
  const vm = require('vm');
  const LABS_L = ['lab/마을실험실.html', 'lab/전쟁실험실.html'];
  const doorOf = (H) => {
    const a = H.indexOf('▼T641-ENV-DOOR'), b = H.indexOf('▲T641-ENV-DOOR');
    if (a < 0 || b < a) return null;
    const s = H.indexOf('<script>', a), e = H.indexOf('</script>', s);
    return (s > a && e > s && e < b) ? H.slice(s + 8, e) : null;
  };
  const runDoor = (code, search) => {
    const win = {};
    vm.runInNewContext(code, { window: win, location: { search }, URLSearchParams, console: { info() {} }, document: { addEventListener() {} } });
    return win;
  };
  const probe = (code) => {
    const w1 = runDoor(code, '?T602_NEW_FISH=1&seed=7&cropcal=1&PEACE_W=0.3&stream=gorge');
    const w0 = runDoor(code, '?seed=7&cropcal=1'), wE = runDoor(code, '');
    return { env: w1.process ? JSON.stringify(w1.process.env) : null, none: !('process' in w0) && !('process' in wE) };
  };
  const WANT = '{"T602_NEW_FISH":"1","PEACE_W":"0.3"}';
  let door0 = null;
  for (const f of LABS_L) {
    const H = rd(f);
    const n = (H.match(/▼T641-ENV-DOOR/g) || []).length, a = H.indexOf('▼T641-ENV-DOOR'), s = H.indexOf('<!-- ENGINE-BUNDLE-START');
    if (n !== 1) { bad(`${f} [T641 ⓐ] 문 표시 ${n}개 — 하나여야 한다`); continue; }
    if (!(s > a)) { bad(`${f} [T641 ⓐ] 문이 번들 시작 표시 뒤에 있다 — 번들이 env 없이 먼저 돈다`); continue; }
    ok(`${f} [T641 ⓐ] 문 하나 · 번들 시작 표시 앞(번들이 처음 돌 때 env 가 서 있다)`);
    const code = doorOf(H); if (!code) { bad(`${f} [T641 ⓐ] 문 본문을 못 떴다`); continue; }
    door0 = door0 || code;
    try {
      const p = probe(code);
      if (p.env === WANT && p.none) ok(`${f} [T641 ⓐ] 대문자 칸만 같은 이름으로 env(${WANT}) · 소문자 칸(seed·cropcal·stream) 안 샘 · 칸 없으면 window.process 안 만듦`);
      else bad(`${f} [T641 ⓐ] 문 동작이 다르다 — env ${p.env} · 칸 없음에 process ${p.none ? '안 만듦' : '만듦'}`);
    } catch (e) { bad(`${f} [T641 ⓐ] 문 본문이 돌지 않는다 — ${e.message}`); }
  }
  // ⓐ′ 작물 철 손잡이 — 서버 이름(`?T594_CROP_CAL=`)도 받는다(구운 블록 바로 뒤 한 줄 · 서버 `crops.js` `_num` 과 같은 읽기)
  for (const f of LABS_L) {
    const H = rd(f), end = H.indexOf('// ▲T594-CROPCAL\n');
    const line = end < 0 ? '' : H.slice(end + '// ▲T594-CROPCAL\n'.length).split('\n')[0];
    if (!/LAB_ENV\.T594_CROP_CAL/.test(line)) { bad(`${f} [T641 ⓐ′] 작물 철 서버 이름 줄이 구운 블록 바로 뒤에 없다`); continue; }
    const code = line.replace(/\s+\/\/ ★\[T641\][^\n]*$/, '');
    const run = (v, cc0) => { const ctx = { LAB_ENV: v === undefined ? undefined : { T594_CROP_CAL: v }, L_CROPCAL: cc0, document: { getElementById() { return null; } } };
      vm.runInNewContext('var LAB_ENV=this.LAB_ENV;var L_CROPCAL=this.L_CROPCAL;' + code + ';this.out=L_CROPCAL;', ctx); return ctx.out; };
    const got = [run('1', false), run('0', true), run('2.5', false), run('x', true), run('x', false), run(undefined, true), run(undefined, false)];
    const want = [true, false, true, true, false, true, false];   // 수 → 0 이 아니면 켬 · 수가 아니거나 없으면 그대로(서버 `_num(k, 기본)` 의 기본 자리)
    if (JSON.stringify(got) === JSON.stringify(want)) ok(`${f} [T641 ⓐ′] 작물 철 손잡이 — 서버 이름 \`?T594_CROP_CAL=\` 도 받는다(1 켬 · 0 끔 · 수가 아니면 그대로 = 서버 _num)`);
    else bad(`${f} [T641 ⓐ′] 작물 철 서버 이름 줄 동작이 다르다 — ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
  }
  // ⓑ 번들 — shim 이 root.process 를 읽고 · 서버와 같은 손잡이 줄이 실려 있다
  {
    const B = rd('sim/economy-engine.browser.js'), SP = rd('server/specialty.js');
    const LINE = "if (process.env.T602_NEW_FISH === '1') {";
    if (!/var process=\(typeof root\.process!=='undefined'&&root\.process\)\?root\.process:\{env:\{\}\};/.test(B)) bad('ⓑ 번들 process shim 이 root.process 를 안 읽는다 — 문이 닿지 않는다');
    else ok('ⓑ 번들 process shim = `root.process` 가 있으면 그것(문이 심은 env 를 번들이 읽는다)');
    if (SP.includes(LINE) && B.includes(LINE)) ok('ⓑ 서버와 같은 손잡이 줄 — `T602_NEW_FISH` 줄이 server/specialty.js 와 번들에 같은 글자로 있다(랩도 이 줄을 읽는다)');
    else bad('ⓑ `T602_NEW_FISH` 줄이 서버·번들 중 한쪽에 없다 — 대조표 줄이 낡았다');
  }
  // ⓒ 자명 통과 금지 — 정규식을 풀면(소문자 허용) 랩 칸이 샌다
  if (door0) {
    const mut = door0.replace('/^[A-Z][A-Z0-9_]*$/', '/^[A-Za-z][A-Za-z0-9_]*$/');
    let leak = false; try { leak = mut !== door0 && probe(mut).env !== WANT; } catch (e) { leak = true; }
    if (leak) ok('ⓒ [자명 통과 금지] 문 정규식을 소문자까지 풀면 랩 칸(seed·cropcal)이 env 로 샌다 — 검사가 문다');
    else bad('ⓒ [자명 통과 금지] 비틀어도 같은 답 — 문 검사가 죽었다');
  }
  // ⓓ 작물 철 월동 셈 — 랩 cropGrowAt(켬) = 서버 readyDay(T594_CROP_CAL=1)
  {
    const Cal = require(path.join(root, 'server/calendar'));
    const DAYS_L = 1461;   // 네 해(첫 2월 29일 = 4년 — 달력 정본 머리말) — 날마다 심어 본다
    let srv = null;
    try {
      const code = `process.env.T594_CROP_CAL='1';const C=require(${JSON.stringify(path.join(root, 'server/crops'))}),K=require(${JSON.stringify(path.join(root, 'server/crop-cal'))});`
        + `const o={};for(const id of K.ids()){const ko=String(C.koOf(id)||''),a=[];for(let e=0;e<${DAYS_L};e++)a.push(C.readyDay(id,e)-e);o[id]={ko,a};}process.stdout.write(JSON.stringify(o));`;
      srv = JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: root, maxBuffer: 64 << 20, env: Object.assign({}, process.env, { T594_CROP_CAL: '1' }) }).toString());
    } catch (e) { bad(`ⓓ 서버 readyDay 표를 못 만들었다 — ${e.message.slice(0, 120)}`); }
    const blockOf = (H) => { const a = H.indexOf('// ▼T594-CROPCAL'), b = H.indexOf('// ▲T594-CROPCAL'); return (a >= 0 && b > a) ? H.slice(a, b) : null; };
    const mk = (blk) => new Function('EconEngine', 'L_START', 'L_SEASONS', 'L_YEAR', 'L_MOSTART',
      blk.replace(/let L_CROPCAL=[^\n]*/, 'let L_CROPCAL=true;') + '\nreturn { cropGrowAt, T: L_CROPCAL_T };');
    const constsOf = (H) => {   // 그 랩의 실제 자리 차·계절 표·옛 달력(옛 줄이 읽던 것)을 그대로
      const m = H.match(/const L_YEAR=(\d+), L_MOSTART=(\[[^\]]*\]), L_SEASONS=(\[[^\]]*\]), L_START=(\d+);/);
      return m ? { year: +m[1], mostart: JSON.parse(m[2]), seasons: JSON.parse(m[3].replace(/'/g, '"')), start: +m[4] } : null;
    };
    const cmp = (fn, T) => {
      let n = 0, same = 0, winterBad = 0; const ex = [];
      for (const lid of Object.keys(T)) {
        const sid = Object.keys(srv).find((id) => { const ko = srv[id].ko, inner = (/\(([^)]*)\)/.exec(ko) || [])[1]; return [ko, ko.replace(/\(.*\)/, ''), inner].filter(Boolean).includes(lid); });
        if (!sid) { ex.push(lid + ':서버 짝 없음'); continue; }
        for (let e = 0; e < DAYS_L; e++) {
          n++; const g = fn.call(null, { id: lid, grow: -1 }, e + CONSTS.start);
          if (g === srv[sid].a[e]) same++; else { if (T[lid].v) winterBad++; if (ex.length < 3) ex.push(`${lid}@${e}:${g}≠${srv[sid].a[e]}`); }
        }
      }
      return { n, same, winterBad, ex };
    };
    let CONSTS = null;
    if (srv) for (const f of LABS_L) {
      const H = rd(f), blk = blockOf(H); CONSTS = constsOf(H);
      if (!blk || !CONSTS) { bad(`${f} [T594 ⓓ] 구운 블록·랩 달력 상수를 못 찾았다`); continue; }
      const L = mk(blk)({ Calendar: Cal }, CONSTS.start, CONSTS.seasons, CONSTS.year, CONSTS.mostart);
      const r = cmp(L.cropGrowAt, L.T);
      if (r.n > 0 && r.same === r.n) ok(`${f} [T594 ⓓ] 작물 철 켬 — 랩 cropGrowAt = 서버 readyDay ${r.same}/${r.n}(거울 ${Object.keys(L.T).length}종 × econ 날 0..${DAYS_L - 1} · 월동 = 그 겨울이 끝난 다음 날부터)`);
      else bad(`${f} [T594 ⓓ] 작물 철 켬 — 랩 ≠ 서버 ${r.n - r.same}/${r.n}(월동 ${r.winterBad}) · ${r.ex.join(' · ')}`);
    }
    // ⓔ 자명 통과 금지 — T641 전 옛 줄(랩 1월 기점 달력)을 넣으면 월동이 갈린다
    if (srv && CONSTS) {
      const H = rd('lab/전쟁실험실.html'), blk = blockOf(H);
      const OLD = "function cropGrowAt(cr,day){const t=L_CROPCAL&&L_CROPCAL_T[cr.id];if(!t)return cr.grow;if(!t.v)return t.g;const y=Math.floor(day/L_YEAR),doy=day-y*L_YEAR,m3=L_MOSTART[2];return (doy<m3?y*L_YEAR+m3:(y+1)*L_YEAR+m3)-day+t.g;}";
      const mut = blk ? blk.replace(/function cropGrowAt\(cr,day\)\{[^\n]*?\}(?=   \/\/)/, OLD) : null;
      if (!mut || mut === blk) bad('ⓔ [자명 통과 금지] 옛 줄을 끼우지 못했다 — 구운 블록 꼴이 바뀌었다');
      else {
        const L = mk(mut)({ Calendar: Cal }, CONSTS.start, CONSTS.seasons, CONSTS.year, CONSTS.mostart);
        const r = cmp(L.cropGrowAt, L.T);
        if (r.winterBad > 0) ok(`ⓔ [자명 통과 금지] T641 전 옛 줄(랩 1월 기점 달력)은 월동 셋에서 ${r.winterBad}날 갈린다 — 비교가 실제로 문다`);
        else bad('ⓔ [자명 통과 금지] 옛 줄도 같은 답 — 비교가 죽었다');
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// [M] ★★[T648 2026-10-05] 랩 밭 겨울 휴면 — **서버 T99 ②③ 술어를 번들로 싣고 랩 상태기 세 자리가 그것만 부르나**
// ══════════════════════════════════════════════════════════════════════════════
//   ⓐ 번들이 서버 작물 정본을 **글자 그대로** 싣고(`server/crops.js` · `crops.json` · `crop-cal.js` · `events.js`) `EconEngine.Crops` 로 내놓는다
//   ⓑ 두 랩 — 문(`cropDormant`)은 구운 블록 안 하나 · 본문이 `EconEngine.Crops.dormantAt` 을 부른다 · 상태기 세 자리(cellTask · doTask · 하루 작물 진화)가
//      그 문을 부른다 · 번들 밖 랩 글에 휴면 술어를 손으로 다시 짠 자리(`function dormantAt` · `_dormantKind` · `_dormant(`)가 없다
//   ⓒ [자명 통과 금지] 세 자리 중 하나를 뺀 사본은 자리 수가 갈리고 · 번들에서 `Crops` 내놓기를 뺀 사본은 ⓐ 가 갈린다
//   (값 대조 — 문 = 서버 dormantAt 30종 × 1,461날 · 겨울 하루 일감 0 · 품질 무변 — 은 `scripts/test-crop-cal.js` ⑪)
console.log('\n[M] 랩 밭 겨울 휴면 — 서버 T99 ②③ 술어를 번들로(T648)');
{
  const B = rd('sim/economy-engine.browser.js');
  const stripSb = (t) => t.replace(/^#!.*\n/, '');
  const exportsCrops = (b) => /root\.EconEngine\.Crops=modules\.crops;/.test(b);
  const srcs = ['server/crops.js', 'server/crop-cal.js', 'server/events.js'].map((f) => [f, B.includes(stripSb(rd(f)))]);
  const jsonIn = B.includes(`modules["cropsData"]=${rd('server/crops.json').trim()};`);
  if (exportsCrops(B) && srcs.every(([, x]) => x) && jsonIn) ok('ⓐ 번들이 서버 작물 정본을 글자 그대로 싣고(crops.js · crops.json · crop-cal.js · events.js) `EconEngine.Crops` 로 내놓는다(사본 0)');
  else bad(`ⓐ 번들 작물 정본 — 내놓기 ${exportsCrops(B) ? '○' : '✗'} · ${srcs.map(([f, x]) => `${path.basename(f)} ${x ? '○' : '✗'}`).join(' · ')} · crops.json ${jsonIn ? '○' : '✗'} (sim/build-econ-bundle.js T648)`);
  const SITE = /if\(cropDormant\(e,day\)\)return 0;|if\(cropDormant\(e,day\)\)return false;|else if\(!cropDormant\(e,day\)\)\{/g;
  const outsideBundle = (H) => { const a = H.indexOf('<!-- ENGINE-BUNDLE-START'), b = H.indexOf('<!-- ENGINE-BUNDLE-END'); return (a >= 0 && b > a) ? H.slice(0, a) + H.slice(b) : H; };
  let H0 = null;
  for (const f of ['lab/마을실험실.html', 'lab/전쟁실험실.html']) {
    const H = rd(f), O = outsideBundle(H); H0 = H0 || H;
    const defs = (O.match(/function cropDormant\(e,day\)\{[^\n]*/g) || []);
    const blkA = H.indexOf('// ▼T594-CROPCAL'), blkB = H.indexOf('// ▲T594-CROPCAL'), di = H.indexOf('function cropDormant(e,day){');
    if (defs.length !== 1 || !(di > blkA && di < blkB)) { bad(`${f} [T648 ⓑ] 문 cropDormant 정의 ${defs.length}개(구운 블록 안 하나여야 한다)`); continue; }
    if (!/EconEngine\.Crops\.dormantAt\(sid,day-L_START\)/.test(defs[0])) bad(`${f} [T648 ⓑ] 문이 번들의 서버 정본(EconEngine.Crops.dormantAt)을 안 부른다`);
    else ok(`${f} [T648 ⓑ] 문 하나(구운 블록) — 번들의 서버 정본 EconEngine.Crops.dormantAt(서버 id, econ 날)을 부른다`);
    const sites = (H.match(SITE) || []).length;
    if (sites !== 3) bad(`${f} [T648 ⓑ] 상태기에서 문을 부르는 자리 ${sites} — 셋(cellTask · doTask · 하루 작물 진화)이어야 한다`);
    else ok(`${f} [T648 ⓑ] 상태기 세 자리(cellTask 일감 · doTask 수행 · 하루 작물 진화 감점)가 문 하나로 들어간다`);
    const hand = /function\s+dormantAt\s*\(|_dormantKind|function\s+_dormant\s*\(/.test(O);
    if (hand) bad(`${f} [T648 ⓑ] 번들 밖 랩 글에 휴면 술어를 손으로 짠 자리가 있다 — 사본이다`);
    else ok(`${f} [T648 ⓑ] 번들 밖 랩 글에 휴면 술어 사본 0(dormantAt · _dormantKind · _dormant 정의 없음)`);
  }
  // ⓒ 자명 통과 금지
  {
    const mutSite = H0 ? H0.replace('if(cropDormant(e,day))return false;', '') : null;
    const mutB = B.replace('root.EconEngine.Crops=modules.crops;', '');
    const bite1 = !!mutSite && (mutSite.match(SITE) || []).length === 2;
    const bite2 = !exportsCrops(mutB);
    if (bite1 && bite2) ok('ⓒ [자명 통과 금지] doTask 자리를 뺀 사본은 자리 셋 → 둘 · 번들에서 Crops 내놓기를 뺀 사본은 ⓐ 가 갈린다 — 검사가 문다');
    else bad(`ⓒ [자명 통과 금지] 비틀어도 같은 답 — 자리 ${bite1 ? '문다' : '죽음'} · 번들 ${bite2 ? '문다' : '죽음'}`);
  }
}

console.log(`\n=== 배선 검사: 실패 ${fail} · 경고 ${warn} ===`);
process.exit(fail ? 1 : 0);
