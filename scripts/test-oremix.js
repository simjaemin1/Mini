#!/usr/bin/env node
// === scripts/test-oremix.js — 유효 제련 조성(_oreMixEff) 하네스 ==============
//
// ★[재민 확정 2026-08-02b] 수입 원석에 광종을 싣는다.
//   전에는 econ 의 `ore` 가 **조성 없는 스칼라**였고 조성은 땅(land.oreMix)에만 있었다.
//   그래서 남이 실어다 준 원석은 "무엇이 든지 모르는 돌"이라 영원히 못 녹였다
//   (실측: 어촌2 281 · 임업3 404 가 그렇게 묶여 썩고 있었다).
//
// 검증
//   ① 폴드 산술 — 가중 평균이 정확한가 · 정규화 · 잔부스러기 절단
//   ② 우선순위 — _oreMixEff 있으면 그것, 없으면 land.oreMix, 손잡이 끄면 항상 land
//   ③ ★수입 원석이 실제로 녹는가 — 광종 없는 마을(land.oreMix={})에 조성만 실어 주면
//      smeltTarget > 0 이 되고 _trySmelt 가 금속을 낸다(이게 이 변경의 전부다)
//   ④ 조성은 **들어올 때만** 바뀐다 — 제련·부패는 비례 소모라 조성 불변
//   ⑤ 직렬화 왕복 — serializeEcon 이 자동으로 실어 나르는가(SERIALIZE_SKIP 미등재 확인)
//   ⑥ 가격 상한이 유효 조성을 본다(원석은 그것이 될 금속보다 비쌀 수 없다)
//
// 실행: node scripts/test-oremix.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const econ = require(path.join(ROOT, 'sim', 'economy-sim.js'));

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const near = (a, b, e, m) => ok(Math.abs(a - b) < (e || 1e-4), `${m} (${(+a).toFixed(4)} ≈ ${(+b).toFixed(4)})`);
const say = (...a) => console.log(...a);

const mkV = (oreMix, opts = {}) => econ.createVillage({
  fertility: 1.0, water: 1.0, wood: 1.0, stone: 1.0, ore: opts.ore != null ? opts.ore : 1.0,
  game: 1.0, size: 60, arable: 40, initialPop: 8, name: opts.name || 't', oreMix,
});

say('=== 유효 제련 조성(_oreMixEff) 하네스 ===');

// ══ ① 폴드 산술 ════════════════════════════════════════════════════════════
say('\n[① 폴드 산술 — 무게 가중 평균]');
{
  const v = mkV({ copper: 0.9, gold: 0.1 });
  v.storage.ore = 0; delete v._oreMixEff;
  econ.foldOreMix(v, 0, 100, { copper: 0.9, gold: 0.1 });
  const m1 = econ.oreMixOf(v);
  near(m1.copper, 0.9, 1e-4, '자기 땅 100 → 구리 0.9');

  econ.foldOreMix(v, 100, 100, { lead: 0.85, silver: 0.15 });
  const m2 = econ.oreMixOf(v);
  near(m2.copper, 0.45, 1e-4, '수입 100 폴드 → 구리 0.45');
  near(m2.lead, 0.425, 1e-4, '  납 0.425');
  near(m2.silver, 0.075, 1e-4, '  은 0.075');
  let tot = 0; for (const k in m2) tot += m2[k];
  near(tot, 1.0, 1e-3, '  정규화 합 = 1');

  econ.foldOreMix(v, 200, 200, { lead: 0.85, silver: 0.15 });
  const m3 = econ.oreMixOf(v);
  ok(m3.lead > m2.lead, '더 실어 오면 그 광종 비중이 오른다');
  ok(m3.copper < m2.copper, '  상대적으로 원래 광종은 묽어진다');

  // 잔부스러기 절단 — 1e-4 미만은 버린다(직렬화 비대 방지)
  const w = mkV({ copper: 1 });
  w.storage.ore = 0; delete w._oreMixEff;
  econ.foldOreMix(w, 0, 1000000, { copper: 1 });
  econ.foldOreMix(w, 1000000, 1, { gold: 1 });
  ok(!(econ.oreMixOf(w).gold > 0), `100만:1 의 티끌은 버린다(키 ${Object.keys(econ.oreMixOf(w)).length}개)`);

  // 안전 — 모르는 건 안 섞는다
  const z = mkV({ copper: 1 }); const before = JSON.stringify(econ.oreMixOf(z));
  econ.foldOreMix(z, 10, 10, null);
  econ.foldOreMix(z, 10, 10, {});
  econ.foldOreMix(z, 10, 0, { gold: 1 });
  ok(JSON.stringify(econ.oreMixOf(z)) === before, '조성 없는 화물/0량은 폴드하지 않는다(기존 조성 유지)');
}

// ══ ② 우선순위와 손잡이 ═════════════════════════════════════════════════════
say('\n[② 우선순위 — _oreMixEff > land.oreMix, 손잡이 끄면 항상 land]');
{
  const v = mkV({ copper: 0.9, gold: 0.1 });
  ok(econ.oreMixOf(v).copper === 0.9, '유효 조성이 없으면 땅 조성');
  econ.foldOreMix(v, 0, 10, { lead: 1 });
  ok(econ.oreMixOf(v).lead === 1, '유효 조성이 생기면 그것을 본다');
  // 손잡이는 모듈 로드 시점에 읽히므로 자식 프로세스로 확인
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, ['-e',
    `const e=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'))});
     const v={land:{oreMix:{copper:0.9,gold:0.1}},storage:{ore:0}};
     e.foldOreMix(v,0,100,{lead:1});
     process.stdout.write(JSON.stringify({mix:e.oreMixOf(v),eff:v._oreMixEff||null}));`],
    { env: { ...process.env, ORE_MIX_EFF: '0' }, encoding: 'utf8' });
  let out = null; try { out = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) {}
  ok(out && out.mix && out.mix.copper === 0.9, `ORE_MIX_EFF=0 → 땅 조성만 (${out ? JSON.stringify(out.mix) : r.stderr.slice(0, 120)})`);
  ok(out && out.eff === null, '  꺼져 있으면 폴드 자체를 안 한다(상태 오염 0)');
}

// ══ ③ ★수입 원석이 실제로 녹는가 ═══════════════════════════════════════════
say('\n[③ ★광종 없는 마을이 수입 원석을 녹인다 — 이 변경의 전부]');
{
  // 실측에서 묶여 있던 형태: 광맥 없는 마을(land.oreMix 비어 있음)에 원석만 400 쌓임
  const stuck = mkV({}, { ore: 0.1, name: '임업3형' });
  stuck.storage.ore = 400;
  stuck.storage.copper = 0; stuck.storage.tin = 0; stuck.storage.gold = 0;
  // ★막혀 있던 자리는 **채용 게이트**다(제련 행위 자체가 아니라). smeltTarget 이 0 이면
  //   대장장이가 한 명도 안 뽑히고, 그러면 _trySmelt 는 애초에 안 불린다.
  //   (_trySmelt 를 손으로 부르면 하천 사철·사금 폴백[SMELT_PLACER]이 돌긴 한다 — 그건 별개 경로다.
  //    첫 판에서 이걸 "녹지도 않는다"로 잘못 단언했다가 하네스가 없는 결함을 보고했다.)
  ok(!(econ.smeltTarget(stuck) > 0), '조성 없는 원석 400 → **제련 목표 0** = 대장장이 미채용 (묶여 있던 그 상태)');

  // 캐러밴이 구리 광산에서 원석을 싣고 왔다 = 조성이 함께 왔다
  econ.foldOreMix(stuck, 0, 400, { copper: 0.9, gold: 0.1 });
  const t1 = econ.smeltTarget(stuck);
  ok(t1 > 0, `조성이 실려 오자 제련 목표 ${t1} (>0) — 이제 대장장이가 뽑힌다`);
  const cu0 = stuck.storage.copper || 0, au0 = stuck.storage.gold || 0;
  const used = econ._trySmelt(stuck, 1);
  ok(used > 0, `  실제로 녹는다 — 원석 ${used.toFixed(1)} 소모`);
  const cuGain = (stuck.storage.copper || 0) - cu0, auGain = (stuck.storage.gold || 0) - au0;
  ok(cuGain > 0, `  구리 산출 ${cuGain.toFixed(2)}`);
  // 산출 비율이 실린 조성을 따르는가 (★증분으로 잰다 — 총량으로 재면 앞선 호출의 산출이 섞인다)
  near(cuGain / (cuGain + auGain), 0.9, 0.02, '  산출 비율 = 실린 조성(구리 90%)');
  near(used * 0.33, cuGain + auGain, 1e-3, '  총 산출 = 소모 × SMELT_YIELD(질량 정합)');
}

// ══ ④ 조성은 들어올 때만 바뀐다 ════════════════════════════════════════════
say('\n[④ 제련·소모는 조성을 바꾸지 않는다(비례 소모)]');
{
  const v = mkV({ copper: 0.6, tin: 0.4 });
  v.storage.ore = 200;
  const m0 = JSON.stringify(econ.oreMixOf(v));
  econ._trySmelt(v, 1);
  ok(JSON.stringify(econ.oreMixOf(v)) === m0, '제련 후 조성 불변');
  v.storage.ore = Math.max(0, v.storage.ore - 50);   // 부패 흉내
  ok(JSON.stringify(econ.oreMixOf(v)) === m0, '재고 감소 후 조성 불변');
}

// ══ ⑤ 직렬화 왕복 ══════════════════════════════════════════════════════════
say('\n[⑤ 직렬화 — serializeEcon 이 자동으로 실어 나른다]');
{
  const src = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const skipBlock = src.slice(src.indexOf('const SERIALIZE_SKIP'), src.indexOf('const _serializeWarned'));
  ok(!/_oreMixEff/.test(skipBlock), 'SERIALIZE_SKIP 에 _oreMixEff 없음 → 자동 영속');
  ok(/for \(const k of Object\.keys\(v\)\)/.test(src), '  serializeEcon 이 전 키를 훑는다(화이트리스트 아님)');
  // 실제 왕복 — JSON 으로 나갔다 돌아와도 같은가
  const v = mkV({ copper: 0.9, gold: 0.1 });
  econ.foldOreMix(v, 0, 100, { lead: 0.85, silver: 0.15 });
  const round = JSON.parse(JSON.stringify({ _oreMixEff: v._oreMixEff }));
  ok(JSON.stringify(round._oreMixEff) === JSON.stringify(v._oreMixEff), '  JSON 왕복 동일');
  ok(Object.keys(v._oreMixEff).length <= 8, `  키 수가 유계 (${Object.keys(v._oreMixEff).length}) — 저장 비대 없음`);
}

// ══ ⑥ 가격 상한이 유효 조성을 본다 ═════════════════════════════════════════
say('\n[⑥ 중간재 상한 — 원석은 그것이 될 금속보다 비쌀 수 없다]');
{
  const v1src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
  const v2src = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
  const capV1 = v1src.slice(v1src.indexOf('// ★중간재 상한'), v1src.indexOf('// ★중간재 상한') + 400);
  ok(/oreMixOf\(v\)/.test(capV1), 'v1 가격 상한이 oreMixOf 를 쓴다');
  const capV2 = v2src.slice(v2src.indexOf('P(원석) ≤ 제련수율'), v2src.indexOf('P(원석) ≤ 제련수율') + 400);
  ok(/oreMixOf/.test(capV2), 'v2 가격 상한이 oreMixOf 를 쓴다(사본 금지 — v1 함수를 부른다)');
  // 광부 유인은 **땅** 조성이어야 한다(수입 금맥이 내 철광산 채굴 유인을 올리면 오류)
  const minerBlk = v1src.slice(v1src.indexOf("case 'miner': {"), v1src.indexOf("case 'miner': {") + 700);
  ok(/const _mix = v && v\.land && v\.land\.oreMix/.test(minerBlk),
    '★광부 한계가치만은 land.oreMix — 수입 원석이 채굴 유인을 왜곡하면 안 된다');
}

say(`\n=== 유효 제련 조성 하네스: ${fail ? '실패 ' + fail + '건 ❌' : 'PASS ✅'} ===`);
process.exit(fail ? 1 : 0);
