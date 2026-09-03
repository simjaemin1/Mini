#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-msy.js — 어장 MSY 눈금 · 낚시 양방향 · 캐러밴 시계 =============
//
// ★왜 [재민 확정 2026-09-03 · T60]
//   T17 §5 가 남긴 것: MSY 를 켜면 인구 −48~−61% · 소멸 0 → 14·16곳. "상한이 너무 낮다"였는데
//   **몇 배 낮은지**를 아무도 몰랐다. §0-ⓐ 가 그 배수를 찾았다 — **정확히 4배**다.
//   랩 원본은 어장 K 를 **물 셀 전수**로 세는데(`for dy++ / dx++` · 24×24 버킷에 `e.K++`),
//   `server/sustain.js` 의 `scanLabor` 는 **2칸 간격**으로 세고 4배로 되돌리지 않았다.
//   (그 함수 머리 주석은 *"랩도 샘플 수를 그대로 쓴다"* 고 적어 뒀지만, 랩의 2칸 샘플은
//    `forestRich`·`gameRich` 전용이다 — 랩 주석이 그렇게 못 박아 뒀다.)
//
// ★★이 하네스가 지키는 것 — **눈금은 유도이지 발명이 아니다**
//   ① 유도 재현 : `lab` 눈금이 랩 식(Σ L_FISHR·K/4 × FISH_ECON_PER_STOCK)과 **한 자리도 안 다르다**
//   ② 정본 합류 : `fishv2` 는 `server/fishing.js` 의 `stockToEcon` 을 **불러서** 같은 값에 도달한다
//                 (수식을 여기서 다시 적으면 그게 사본이다 — 두 길이 같은 값에서 만나는지를 본다)
//   ③ 되돌림   : `T60_MSY_MODE=legacy` 는 T17 까지의 그 값 그대로(비트 동일)
//   ④ 양방향   : **NPC 어획이 자원을 깎는다.** 대조군 — 안 했으면 안 움직인다
//   ⑤ 시계     : 존 서버 세 자리가 `travelDays` 를 같이 민다(소스 계약 · econ 정본과 교차 대조)
//
// 실행: node scripts/test-msy.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

console.log('\n=== 어장 MSY 눈금 · 낚시 양방향 · 캐러밴 시계 ===');

// ── ① 눈금 유도 재현 ────────────────────────────────────────────────────────
console.log('\n① 눈금은 유도다 — 랩 식과 한 자리도 안 다르다');
{
  const S = R('server/sustain');
  const scan = { forest: 800, water: 6400, rockEdge: 0, forageSum: 900 };
  // 랩 원본 식을 **이 하네스가 다시 적지 않는다** — 정본이 export 한 상수로 조립한다.
  const expect = +(scan.water * (S.L_FISHR / 4) * S.FISH_ECON_PER_STOCK).toFixed(2);
  const got = S.sustainOf(scan, 1).fishSustain;
  ok(got === expect, '① 랩 식 Σ(L_FISHR·K/4)×FISH_ECON_PER_STOCK 그대로', `${got} = ${expect}`);
  ok(S.L_FISHR === 0.02 && S.FISH_ECON_PER_STOCK === 2.5,
    '① [상황] 랩 상수가 그대로다(눈금을 바꾼 게 아니라 **세는 법**을 고쳤다)', `L_FISHR=${S.L_FISHR} · PER_STOCK=${S.FISH_ECON_PER_STOCK}`);
  ok(scan.water > 0 && expect > 0, '① [자명 통과 금지] 물이 있는 표본이다', `물 ${scan.water}셀 → ${expect}`);
}

// ── ② 두 길이 같은 값에서 만난다(사본 0) ───────────────────────────────────
console.log('\n② `fishv2` 는 낚시 v2 정본을 불러 같은 값에 닿는다');
{
  const out = require('child_process').execFileSync(process.execPath, ['-e', `
    const S = require('${path.join(ROOT, 'server', 'sustain')}');
    const F = require('${path.join(ROOT, 'server', 'fishing')}');
    const scan = { forest: 800, water: 6400, rockEdge: 0, forageSum: 900 };
    console.log(JSON.stringify({ fish: S.sustainOf(scan, 1).fishSustain, mode: S.MSY_MODE,
      viaFishing: +F.stockToEcon(scan.water * F.CFG.CELL_K).toFixed(2), cellK: F.CFG.CELL_K }));
  `], { env: Object.assign({}, process.env, { T60_MSY_MODE: 'fishv2' }), encoding: 'utf8' });
  const j = JSON.parse(out.trim().split('\n').pop());
  ok(j.mode === 'fishv2', '② [상황] 모드가 실제로 `fishv2` 다', j.mode);
  ok(j.fish === j.viaFishing, '② ★★두 길이 **같은 값**에서 만난다 — 지리 눈금과 낚시 v2 정본',
    `sustain ${j.fish} = fishing.stockToEcon ${j.viaFishing} (CELL_K ${j.cellK})`);
  const src = fs.readFileSync(path.join(ROOT, 'server', 'sustain.js'), 'utf8');
  ok(/require\('\.\/fishing'\)\.stockToEcon/.test(src),
    '② ★`fishv2` 는 수식을 **다시 적지 않고 부른다**(사본 금지 — 소스 계약)');
}

// ── ③ 되돌림 — legacy 는 T17 까지의 그 값 ──────────────────────────────────
console.log('\n③ 되돌리는 스위치');
{
  const run = (mode) => {
    const out = require('child_process').execFileSync(process.execPath, ['-e', `
      const S = require('${path.join(ROOT, 'server', 'sustain')}');
      let n = 0;
      const pred = { isWater: (x, y) => ((x * 31 + y * 17) % 7) === 0, isRock: () => false, isForest: () => false };
      const sc = S.scanLabor(pred, 1000, 1000);
      console.log(JSON.stringify({ water: sc.water, fish: S.sustainOf(sc, 1).fishSustain }));
    `], { env: Object.assign({}, process.env, { T60_MSY_MODE: mode }), encoding: 'utf8' });
    return JSON.parse(out.trim().split('\n').pop());
  };
  const leg = run('legacy'), lab = run('lab');
  ok(leg.water > 0 && lab.water > 0, '③ [자명 통과 금지] 두 판 다 물을 실제로 셌다', `legacy ${leg.water} · lab ${lab.water}`);
  const r = lab.water / leg.water;
  ok(r > 3.5 && r < 4.5, '③ ★★`lab` 이 `legacy` 의 **약 4배**를 센다(2칸 샘플 → 전수)', `×${r.toFixed(2)}`);
  ok(lab.fish > leg.fish, '③ 그래서 상한도 그만큼 올라간다', `${leg.fish} → ${lab.fish}`);
}

// ── ④ 낚시 양방향 — NPC 어획이 자원을 깎는다 ────────────────────────────────
console.log('\n④ 낚시가 양방향이다 — NPC 도 같은 물을 쓴다');
{
  const F = R('server/fishing');
  const now = Date.now();
  const before = F.deficitStock ? 0 : 0;
  // 대조군: 아무 것도 안 하면 결손 0
  const d0 = F.deficitBy(() => true, now);
  const took = F.drawStock(5000, 5000, 3, now, null);
  const d1 = F.deficitBy(() => true, now);
  ok(d0 === 0, '④ [대조군] **안 했으면 안 움직인다** — 긁기 전 결손 0', `${d0}`);
  ok(took > 0, '④ [상황] 실제로 긁혔다', `${took.toFixed(3)} stock`);
  ok(d1 > d0, '④ ★★긁은 만큼 어장 결손이 생긴다(정본 `drawStock` 하나)', `${d0} → ${d1.toFixed(3)}`);
  const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  ok(/function npcFishDraw[\s\S]{0,900}?F\.drawStock\(/.test(V),
    '④ ★NPC 어획도 **그 정본을 탄다**(`npcFishDraw` → `drawStock` · 소스 계약)');
  ok(/F\.stockToEcon\(1\)/.test(V),
    '④ ★환산은 낚시 v2 에게 묻는다(`stockToEcon(1)` — 상수를 옮겨 적지 않았다)');
  // ★★[T60 ② 수리 2026-09-03] **기본이 꺼짐이다.** 켠 채로 내면 존 루프가 수십 초 막힌다 —
  //   러너에서 `test-route-persist`·`test-site-memo`·`e2e-rtt` 셋이 같은 모양으로 죽어 잡았다.
  //   실측(`/tmp/t60/fishperf.js`): 앵커 첫 walk 12,469ms · `fishCells` 30일에 40만 칸 →
  //   `deficitBy×51` 3,395ms/일 · `diffuse` 1,315ms/일. 감당하는 법은 보고 §6-B 판단거리.
  //   이 줄은 그 수리가 **조용히 되돌아가지 못하게** 못을 박는다.
  ok(/const FISH2WAY = process\.env\.T60_FISH2WAY === '1'/.test(V),
    '④ ★★기본은 **꺼짐** — 켜는 스위치로만 열린다(`T60_FISH2WAY=1`)');
  ok(/if \(FISH2WAY\) \{[\s\S]{0,200}?npcFishDraw\(vil, _now\)/.test(V),
    '④ ★★존 틱의 그 자리가 **스위치 안에 있다** — 꺼져 있으면 한 마을도 안 돈다(비용 0)');
}

// ── ⑤ 캐러밴 시계 — 세 자리가 같이 민다 ────────────────────────────────────
console.log('\n⑤ 캐러밴 시계 — 존 서버 세 자리');
{
  const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const helper = /function _clockPush\(c, days, phase\)[\s\S]{0,500}?c\.travelDays \+= days;/.test(V);
  const n = (V.match(/_clockPush\(c, /g) || []).length;
  const giveup = /c\.distance = body\.len \/ PX_PER_ECON;[\s\S]{0,900}?c\.travelDays = days;/.test(V);
  ok(helper, '⑤ 시계를 미는 헬퍼가 `travelDays` 를 같이 민다');
  ok(n >= 2, '⑤ 지연 두 자리(로컬 우회 · 도착 임박 가드)가 그 헬퍼를 쓴다', `${n}곳`);
  ok(giveup, '⑤ ★고립 귀환은 **거리를 덮었으니 시계도 그 구간의 것**(econ 빈손귀환과 같은 규약)');
  const E = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
  ok(/c\.travelDays = extraDays;/.test(E) && /c\.travelDays = travelDaysForDistance\(c\.distance\);/.test(E),
    '⑤ ★econ 쪽 두 자리(T17 ④)도 그대로다 — 다섯 자리가 **한 규약**이다(교차 대조)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
