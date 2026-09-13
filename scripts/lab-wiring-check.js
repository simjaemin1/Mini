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
    for (const k of ['L_ALLOC_REAL', 'L_HAPPY_FLOOR1', 'L_HAPPYWORK']) delete env[k];
    const probe = `const E=require(${JSON.stringify(path.join(root, 'sim', 'economy-sim.js'))});` +
      `console.log(JSON.stringify({alloc:E.allocRealOn?E.allocRealOn():null,floor:E.happyFloor1On(),H:E.happyWorkWOf({}),CONST:E.T157_HAPPYWORK_H}));`;
    let srv = null;
    try { srv = JSON.parse(String(execFileSync(process.execPath, ['-e', probe], { env, encoding: 'utf8' })).trim()); }
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
        else ok(`랩은 ${k} 을(를) 심지 않는다(미설정 = **켬** = 서버 기본 · T244)`);
      }
      // ★자명 통과 금지 — 랩이 끈 채 뜨는 판을 만들면 이 검사가 실제로 문다
      const mut3 = warLab + '\nwindow.L_HAPPY_FLOOR1 = 0;\n';
      const re3 = /window\.L_HAPPY_FLOOR1\s*=\s*['"]?0['"]?/;
      if (re3.test(mut3.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n'))) ok('[자명 통과 금지] 랩이 끈 채 뜨는 판을 만들면 이 검사가 **문다**');
      else bad('[자명 통과 금지] 끈 채 뜨는 판을 만들어도 안 문다 — 검사기가 죽었다');
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
  const extra = inj.filter((x) => !['world.villages', 'world.events', 'world.day'].includes(x));   // 상태(목록·장부·날짜)는 주입이 아니다
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
    // 집 간격 — 랩 L_HGAP 과 서버 `HG`
    const hg = H.match(/L_HGAP\s*=\s*([0-9]+)/), sg = LIVE.match(/HG\s*=\s*([0-9]+)/);
    if (!hg || !sg) wrn(`집 간격 상수를 한쪽에서 못 찾았다(랩 ${!!hg} · 서버 ${!!sg})`);
    else if (hg[1] !== sg[1]) bad(`랩 ${f} L_HGAP ${hg[1]} ≠ 서버 HG ${sg[1]} — 기하가 갈렸다`);
    else ok(`랩 ${f} L_HGAP ${hg[1]} = 서버 집 간격 HG ${sg[1]}`);
    // 영토 목표 — 랩이 쓰는 세 수가 정본과 같나(T230 손잡이가 켜질 때 이 셋이 그 값이어야 한다)
    const pl = H.match(/\)\s*\)\s*\*\s*(\d+)\s*\+\s*(\d+)/);
    const hl = H.match(/_hLots\s*=[^;]*?\*\s*(\d+)\s*\+\s*(\d+)/);
    if (!hl) wrn(`랩 ${f} growTerritory 의 주택 압력 두 수를 못 찾았다`);
    else if (+hl[1] !== VL.TERR_PER_LOT || +hl[2] !== VL.TERR_CORE)
      bad(`랩 ${f} 주택 압력 ${hl[1]}·${hl[2]} ≠ 정본 TERR_PER_LOT ${VL.TERR_PER_LOT}·TERR_CORE ${VL.TERR_CORE}`);
    else ok(`랩 ${f} 주택 압력 ${hl[1]}·${hl[2]} = 정본 territoryTarget 의 그 수`);
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

console.log(`\n=== 배선 검사: 실패 ${fail} · 경고 ${warn} ===`);
process.exit(fail ? 1 : 0);
