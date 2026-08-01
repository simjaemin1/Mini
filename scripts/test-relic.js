#!/usr/bin/env node
// === scripts/test-relic.js — 철제 위세품(iron_relic) 하네스 ==================
//
// ★[재민 확정 2026-08-02b] "세계 최초의 철검"의 값. **유령 수요 재발 금지**가 이 기능의 제약이다.
//   2026-08-01 에 걷어낸 것: "안 쓰는 철을 사오는" 무조건 비축 바닥.
//   여기서 여는 것: **보유 자체가 효용인** 위세재(옥·호피와 같은 프레임).
//   둘의 차이가 코드에 실재하는지를 기계로 확인한다.
//
// 검증
//   ① 주괴·정광엔 프리미엄 0 — iron·iron_ore·meteoric_iron 은 위세재가 아니다(완성품만)
//   ② iron_relic 은 ORNAMENTAL 이고 prestige 기여가 있다(보유가 효용)
//   ③ ★NPC 는 생산하지 않는다 — 어떤 직업 산출·부산물·폴백에도 iron_relic 이 없다
//   ④ 희소 감쇠 — 세계 재고가 늘수록 유효수요 목표가 준다(별도 장치 없이 _worldStockOf 가 한다)
//   ⑤ 판매 계약 — econ 접점이 lifeSellIronRelic 하나뿐이고, 쓰기는 storage 두 줄뿐
//   ⑥ 재질 판정 — 철/운철 완성품만. 청동검은 위세품이 아니다(주조 배합 과반 규칙)
//
// 실행: node scripts/test-relic.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const S = require(path.join(ROOT, 'server', 'specialty'));
const econ = require(path.join(ROOT, 'sim', 'economy-sim.js'));
const v2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const say = (...a) => console.log(...a);
const SRC = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

say('=== 철제 위세품(iron_relic) 하네스 ===');

// ══ ① 주괴·정광엔 프리미엄 0 ═══════════════════════════════════════════════
say('\n[① 완성품만 — 주괴·정광은 위세재가 아니다]');
{
  const orn = SRC('sim/economy-sim-v2.js').match(/const ORNAMENTAL = \{[^}]*\}/)[0];
  for (const k of ['iron', 'iron_ore', 'meteoric_iron', 'ore', 'copper', 'tin']) {
    ok(!new RegExp(`\\b${k}\\s*:`).test(orn), `  ${k} 은 ORNAMENTAL 이 아니다`);
  }
  ok(/iron_relic\s*:/.test(orn), 'iron_relic 만 ORNAMENTAL 에 있다');
  // 완성품이 아닌 것에 prestige 기여가 붙지 않았는지도 본다
  for (const k of ['iron', 'iron_ore', 'meteoric_iron']) {
    const r = S.RESOURCES[k];
    ok(!r || !r.contributes || !r.contributes.prestige, `  ${k} 에 prestige 기여 없음`);
  }
}

// ══ ② 보유가 효용 ══════════════════════════════════════════════════════════
say('\n[② iron_relic — 보유 자체가 효용(유령 수요가 아닌 근거)]');
{
  const r = S.RESOURCES.iron_relic;
  ok(!!r, 'specialty 에 등재');
  ok(r && r.contributes && r.contributes.prestige > 0, `  prestige 기여 ${r && r.contributes ? r.contributes.prestige : '—'}`);
  ok(r && !(r.contributes && r.contributes.subsistence), '  생존필수 기여는 없다(식량이 아니다)');
  ok(r && r.baseValue >= 30, `  기준가 ${r && r.baseValue} — 위세재 급`);
  // v2 자동 통합이 먹었는지
  ok((v2.SUBSISTENCE_PER_NPC || {}).iron_relic === undefined, 'SUBSISTENCE 에는 안 들어갔다(자동 통합이 오작동 안 함)');
}

// ══ ③ ★NPC 는 생산하지 않는다 ═══════════════════════════════════════════════
say('\n[③ ★NPC 생산 무접촉 — 세상에 들어오는 통로는 플레이어 판매뿐]');
{
  const e1 = SRC('sim/economy-sim.js'), e2 = SRC('sim/economy-sim-v2.js');
  // 산출 경로에 등장하지 않아야 한다
  ok(!/addProduce\(\s*['"]iron_relic/.test(e1), 'economy-sim: addProduce(iron_relic) 없음');
  ok(!/iron_relic/.test(e1), '  economy-sim 전체에 iron_relic 언급 0 (엔진은 이 재화를 만들 줄 모른다)');
  const e2Hits = (e2.match(/iron_relic/g) || []).length;
  ok(e2Hits <= 2, `  economy-sim-v2 언급 ${e2Hits}건 — ORNAMENTAL 등재(+주석)뿐`);
  ok(!/produceSpecial[\s\S]{0,4000}iron_relic/.test(e2), '  직업 산출 경로에 없음');
  // 부산물 폴백 dict 에도 없어야
  ok(!/bp0 = \{[^}]*iron_relic/.test(e1), '  광부 부산물 폴백에도 없음');
}

// ══ ④ 희소 감쇠 — 별도 장치 없이 유효수요 상한이 한다 ═══════════════════════
say('\n[④ 희소 감쇠 — 세계 재고가 늘면 값이 저절로 내린다]');
{
  const e2 = SRC('sim/economy-sim-v2.js');
  ok(/_worldStockOf/.test(e2), '_worldStockOf(세계 재고 기반 유효수요 상한) 실재');
  const gate = e2.slice(e2.indexOf('const _ws = _worldStockOf'), e2.indexOf('const _ws = _worldStockOf') + 700);
  ok(/!SUBSISTENCE_PER_NPC\[r\]/.test(gate) && /CAP_TARGET\[r\] === undefined/.test(gate),
    '  상한은 **필수재·자본재를 제외한** 것에만 걸린다 = 위세재는 걸린다');
  ok(/LUX_ADJ_MAX/.test(e2), '  위세재 웃돈 상한(LUX_ADJ_MAX) 실재 — "없으면 무한대"를 막는다');
  // 실제로 값이 재고에 반응하는가 — 같은 마을에 재고만 바꿔 가격을 재 본다
  const mk = (worldRelics) => {
    const vs = [];
    for (let i = 0; i < 3; i++) {
      const v = econ.createVillage({ fertility: 1, water: 1, wood: 1, stone: 1, ore: 0.3, game: 1, size: 60, arable: 40, initialPop: 20, name: 'v' + i });
      v.storage.iron_relic = worldRelics / 3;
      vs.push(v);
    }
    const w = { villages: vs, day: 100 };
    for (const v of vs) v._world = w;
    return { w, vs };
  };
  const price = (worldRelics) => {
    const { vs } = mk(worldRelics);
    const p = v2.computeShadowPrices ? v2.computeShadowPrices(vs[0]) : null;
    return p ? p.iron_relic : null;
  };
  const p0 = price(0.3), p1 = price(30), p2 = price(300);
  say(`   세계 재고 0.3 → ${p0 != null ? p0.toFixed(1) : '?'} · 30 → ${p1 != null ? p1.toFixed(1) : '?'} · 300 → ${p2 != null ? p2.toFixed(1) : '?'}`);
  if (p0 != null && p2 != null) {
    ok(p0 >= p1 && p1 >= p2, '  재고가 늘수록 값이 내린다(단조)');
    ok(p0 / Math.max(1e-9, p2) > 1.5, `  희소할 때가 흔할 때보다 확실히 비싸다 (${(p0 / Math.max(1e-9, p2)).toFixed(1)}배)`);
    ok(p0 < (S.RESOURCES.iron_relic.baseValue || 60) * 4, '  ★그래도 폭주하지 않는다(LUX 상한) — 마을이 식량을 쏟아붓지 않는다');
  } else ok(false, 'computeShadowPrices 를 못 불렀다');
}

// ══ ⑤ 판매 계약 — 접점이 하나뿐인가 ════════════════════════════════════════
say('\n[⑤ econ 접점 — lifeSellIronRelic 하나뿐, 쓰기는 storage 두 줄]');
{
  const vil = SRC('server/villages.js'), zone = SRC('server/zone.js');
  const fn = vil.slice(vil.indexOf('function lifeSellIronRelic'), vil.indexOf('// bnd 없는 구DB'));
  ok(fn.length > 200, 'lifeSellIronRelic 실재');
  ok(/storage\.iron_relic = \(e\.storage\.iron_relic \|\| 0\) \+ 1/.test(fn), '  쓰기① 위세품 +1');
  ok(/e\.storage\[r\] = Math\.max\(0, \(e\.storage\[r\] \|\| 0\) - pay\[r\]\)/.test(fn), '  쓰기② 대금 차감');
  ok(!/npcs\.push|counts\[|currentJob|addProduce/.test(fn), '  ★생산·직업·인구를 건드리지 않는다');
  ok(/priceFn/.test(fn), '  값은 v2 그림자가격을 그대로 쓴다(사본 금지)');
  ok(/RELIC_PAY_KEEP/.test(fn), '  대금은 마을이 **가진 것**에서만 — 곳간을 비워 굶기지 않는다');
  ok(/lifeSellIronRelic/.test(zone), 'zone.js 가 그 계약을 부른다');
  const zfn = zone.slice(zone.indexOf('function doSellIronRelic'), zone.indexOf('function doCraft(player'));
  ok(/RELIC_MATS/.test(zfn), '  서버가 재질을 검사한다');
  ok(/player\.equipment\.splice/.test(zfn), '  판 물건은 플레이어에게서 사라진다(복제 없음)');
}

// ══ ⑥ 재질 판정 ═══════════════════════════════════════════════════════════
say('\n[⑥ 재질 — 철·운철 완성품만. 청동검은 위세품이 아니다]');
{
  const zone = SRC('server/zone.js');
  const zfn = zone.slice(zone.indexOf('const RELIC_MATS'), zone.indexOf('function doCraft(player'));
  ok(/new Set\(\['iron', 'meteoric_iron'\]\)/.test(zfn), 'RELIC_MATS = { iron, meteoric_iron }');
  ok(/fe \/ tot > 0\.5/.test(zfn), '주조품은 철 비중 **과반**이어야 철기다');
  // 판정 로직을 그대로 재현해 표로 확인
  const RELIC = new Set(['iron', 'meteoric_iron']);
  const judge = (inst) => {
    if (RELIC.has(inst.mat)) return true;
    if (inst.mix) { let t = 0, f = 0; for (const k in inst.mix) { t += inst.mix[k]; if (RELIC.has(k)) f += inst.mix[k]; } return t > 0 && f / t > 0.5; }
    return false;
  };
  for (const [label, inst, want] of [
    ['순철 검', { mat: 'iron' }, true],
    ['운철 검', { mat: 'meteoric_iron' }, true],
    ['청동 검', { mat: 'bronze' }, false],
    ['돌 검', { mat: 'stone' }, false],
    ['주조 Cu83/Sn17', { mix: { copper: 83, tin: 17 } }, false],
    ['주조 Fe70/Cu30', { mix: { iron: 70, copper: 30 } }, true],
    ['주조 Fe40/Cu60', { mix: { iron: 40, copper: 60 } }, false],
  ]) ok(judge(inst) === want, `  ${label} → ${judge(inst) ? '위세품' : '아님'} (기대 ${want ? '위세품' : '아님'})`);
}

say(`\n=== 철제 위세품 하네스: ${fail ? '실패 ' + fail + '건 ❌' : 'PASS ✅'} ===`);
process.exit(fail ? 1 : 0);
