#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-one-target.js — 목표 식 하나 `T726_ONE_TARGET`(기본 끔) ================================
//
// ★왜 [T726 · T718 회부 1 · 재민 08-01 "모든 기본 비축 목표 없애라"]
//   그림자가격의 목표 식이 넷이었다 — 결정(`computeShadowPrices`) · 정산(`_priceParamsV2` — 캐러밴 사고팔기 적분) ·
//   부패(`tickDecay`) · 출발 직후 가격(`tickTradeV2Steps` 두 자리). 정산 · 부패엔 08-01 에 결정층에서만 지운 보유 수요
//   `N × util × 1.2` 가, 출발 직후엔 `N × max(0.5, util × 1.2)` 가 남아 있었고 정산 곡선엔 위신재 웃돈 상한 · 원석 상한이 없었다.
//   T726 은 결정층 식을 함수 하나(`_targetCtxV2` · `_targetV2` · `_oreCapV2` · `_priceFromV2`)로 뺐다. 결정층은 늘 그것을 부르고
//   (옮겼을 뿐 — 끔 비트 동일), 손잡이를 켜면 세 자리도 같은 함수를 부른다.
//
// ★★이 하네스가 지키는 것
//   ⓐ 끔(기본): 손잡이 거짓 · 정산 목표 = 종전 식(안 쓰는 품목에 보유 수요가 남아 정산 값 ≠ 결정 값 — 고친 것이 실재했다)
//   ⓑ 켬(아이 프로세스): 마을 × 품목 전부에서 정산 곡선의 유효 재고 자리 값(한계값) = 결정층 값 · 평평한 곡선(목표 0) ·
//      원석 상한(조성 붙인 마을 — 걸린 상한 · 못 뽑는 금속만이라 0) · 위신재 웃돈 상한 3 이 정산에도 선다 · 사기 적분 = 값 × 양(평평)
//   ⓒ 켬: 출발 직후 값 문(`_priceNowV2`) = 결정층 값(원석 상한까지) · 부패 목표 = 결정층 목표(안 쓰는 구리 — 부패율 비가 식대로)
//   ⓓ 한 함수: 손잡이를 읽는 자리 하나 · 결정층 식(유효수요 상한 · 원석 상한)은 함수 한 곳 · 켬 문 넷이 그 함수를 부른다(글자)
//   ⓔ 3사본: 번들이 같은 줄을 싣고 브라우저 꼴(process 심 env 빈 판)에선 끔 · 랩 두 벌 인라인 = 번들
//   ⓕ 미끼: 정산 문 줄을 뺀 사본은 켬에서도 정산 ≠ 결정 ⇒ ⓑ 가 빨개진다(자명 통과 금지)
//
// 실행: node scripts/test-one-target.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

const V2_PATH = path.join(ROOT, 'sim', 'economy-sim-v2.js');
const SRC = fs.readFileSync(V2_PATH, 'utf8');
const SETTLE_DOOR = '  if (T726_ONE_TARGET) return _settleParamsV2(v, r);';

// 아이 프로세스 — env 를 바꿔 v2 를 새로 적재하고(손잡이는 적재 때 읽는다) 작은 세계 90일 뒤를 잰다.
//   mutate: 적재 때 v2 사본 글자만 바꾼다(미끼 — 디스크 무변 · test-wood-flow 그 문법)
function child(env, mutate) {
  const code = `
    process.env.ENABLE_VILLAGES = '0';
    const fs = require('fs'), Module = require('module');
    const MUT = ${JSON.stringify(mutate || null)};
    if (MUT) { const _l = Module._extensions['.js']; Module._extensions['.js'] = function (m, f) {
      if (f === ${JSON.stringify(V2_PATH)}) { const c = fs.readFileSync(f, 'utf8'); if (!c.includes(MUT[0])) throw new Error('MUT_MISS'); m._compile(c.replace(MUT[0], MUT[1]), f); return; }
      return _l(m, f); }; }
    const l = console.log; console.log = () => {};
    const v1 = require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim'))}), v2 = require(${JSON.stringify(V2_PATH)});
    const W = v2.createWorldV2({ seed: 7, villageCount: 12 });
    for (let d = 0; d < 90; d++) v2.tickWorldV2(W);
    console.log = l;
    // 원석 상한 고정물 — 조성을 붙이고 원석을 쓰는 흐름을 준다(둘째 마을은 시대가 모르는 철뿐 = 상한 0)
    const fx = W.villages.slice(0, 2);
    fx[0].land.oreMix = { copper: 0.5, tin: 0.2, iron: 0.3 }; fx[0]._oreMixEff = null;
    fx[1].land.oreMix = { iron: 1 }; fx[1]._oreMixEff = null;
    for (const v of fx) { v._consEMA = Object.assign({}, v._consEMA, { ore: 5 }); v.storage.ore = 1; }
    // 첫 마을 — 구리에 흐름을 주고 곳간을 바꿔 가며 상한이 바닥 위 · 상한 앞 값 밑에 서는 자리를 찾는다(곡선 천장 = 상한)
    fx[0]._consEMA.copper = 0.5;
    for (const cu of [0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000, 3000]) { fx[0].storage.copper = cu;
      const PR = v2.computeShadowPrices(fx[0]), u = v2._priceOfV2(fx[0], 'ore', v2._targetCtxV2(fx[0]));
      if (PR.ore > 0.0101 && PR.ore < u * 0.99) break; }
    const marg = (v, r) => { const P = v2._priceParamsV2(v, r), S = v2._impactSegs(P), s = P.sEff, dl = 1e-7 * Math.max(1, s);
      return { p: (v2._impactF(P, S, s + dl) - v2._impactF(P, S, s)) / dl, flat: S.flat != null, P }; };
    let cells = 0, worst = 0, mism = 0, flat = 0, ornCap = 0, ornWorst = 0; const ex = [];
    for (const v of W.villages) {
      const PR = v2.computeShadowPrices(v);
      for (const r of Object.keys(PR)) {
        const m = marg(v, r); cells++; if (m.flat) flat++;
        const rel = Math.abs(m.p - PR[r]) / Math.max(1e-12, Math.abs(PR[r]));
        if (rel > worst) worst = rel; if (rel > 1e-5) { mism++; if (ex.length < 3) ex.push(r + ' ' + PR[r].toPrecision(4) + ' vs ' + m.p.toPrecision(4)); }
        const T = v2._targetV2(v, r, v2._targetCtxV2(v));
        if (T.maxAdj === 3 && Math.pow(T.target / T.sEff, T.e) > 3) { ornCap++; if (rel > ornWorst) ornWorst = rel; }
      }
    }
    const ore = fx.map((v) => { const PR = v2.computeShadowPrices(v), ctx = v2._targetCtxV2(v), m = marg(v, 'ore');
      const buy = v2._impactBuyV2(v, 'ore', 1, 0);
      return { dec: PR.ore, unc: v2._priceOfV2(v, 'ore', ctx), settle: m.p, flat: m.flat, now: v2._priceNowV2(v, 'ore'), buyQty: buy.qty, buyCost: buy.cost }; });
    // 출발 직후 값 문 — 전 품목
    let nowWorst = 0; for (const v of W.villages) { const PR = v2.computeShadowPrices(v); for (const r of Object.keys(PR)) { const a = v2._priceNowV2(v, r); const rel = Math.abs(a - PR[r]) / Math.max(1e-12, Math.abs(PR[r])); if (rel > nowWorst) nowWorst = rel; } }
    // 부패 — 안 쓰는 구리(흐름 0 · 세계 문맥 없는 고정 마을 = 유효수요 상한 없음)
    const mk = () => { const q = console.log; console.log = () => {}; const v = v1.createVillage({ initialPop: 8, name: 'fixture' }); console.log = q;
      v.storage = { copper: 50 }; v._consEMA = {}; return v; };
    const dv = mk(); const Tpp = v2._priceParamsV2(dv, 'copper').target, Tdec = v2._targetV2(dv, 'copper', v2._targetCtxV2(dv)).target;
    v2.tickDecay(dv);
    // 정산 사기(평평한 곡선 · 목표 0 품목) — 값 × 양
    const fv = W.villages[2]; let flatBuy = null;
    for (const r of Object.keys(v2.computeShadowPrices(fv))) { const P = v2._priceParamsV2(fv, r); if (P.flat != null && P.flat > 0 && P.physical > 2) {
      const b = v2._impactBuyV2(fv, r, P.flat * 1.5, 0); flatBuy = { r, flat: P.flat, qty: b.qty, cost: b.cost, sell: v2._impactSellV2(fv, r, 2) }; break; } }
    process.stdout.write(JSON.stringify({ knob: v2.T726_ONE_TARGET, cells, worst, mism, flat, ornCap, ornWorst, ex, ore, nowWorst,
      decay: { Tpp, Tdec, after: dv.storage.copper }, flatBuy }));`;
  const e = Object.assign({}, process.env, env);
  for (const k of Object.keys(env)) if (env[k] == null) delete e[k];
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { env: e, cwd: ROOT, maxBuffer: 1 << 24 }).toString());
}

console.log('\nⓐ 끔(기본) = 종전 식');
const OFF = child({ T726_ONE_TARGET: null });
ok(OFF.knob === false, 'ⓐ 손잡이 미설정 = 거짓(기본 끔)');
ok(OFF.mism > 100 && OFF.worst > 10, `ⓐ 끔 — 정산 값 ≠ 결정 값인 칸이 실재한다(보유 수요 · 상한 밖 — 고친 것이 있었다)`, `${OFF.mism}/${OFF.cells} 칸 · 최대 상대차 ${OFF.worst.toExponential(2)}`);
ok(OFF.decay.Tpp > 1 && OFF.decay.Tdec === 0, 'ⓐ 끔 — 안 쓰는 구리: 정산 · 부패 목표 = 보유 수요 N × util × 1.2 · 결정 목표 = 0', `${OFF.decay.Tpp} · ${OFF.decay.Tdec}`);
const ZERO = child({ T726_ONE_TARGET: '0' });
ok(ZERO.knob === false && ZERO.mism === OFF.mism && ZERO.decay.after === OFF.decay.after, 'ⓐ `T726_ONE_TARGET=0` = 미설정과 같다');

console.log('\nⓑ 켬 — 정산 곡선 = 결정층 값');
const ON = child({ T726_ONE_TARGET: '1' });
ok(ON.knob === true, 'ⓑ `T726_ONE_TARGET=1` = 참');
ok(ON.cells > 1000 && ON.mism === 0 && ON.worst < 1e-5, `ⓑ 마을 × 품목 ${ON.cells} 칸 전부 — 유효 재고 자리 정산 한계값 = computeShadowPrices 값`, `최대 상대차 ${ON.worst.toExponential(2)}${ON.ex.length ? ' · ' + ON.ex.join(' | ') : ''}`);
ok(ON.flat > 100, 'ⓑ 목표 0 품목 = 평평한 곡선(결정층 바닥값 그대로) — 셈이 섰다', `${ON.flat} 칸`);
ok(ON.ornCap > 0 && ON.ornWorst < 1e-5, 'ⓑ 위신재 웃돈 상한(3)이 걸린 칸에서도 정산 = 결정', `${ON.ornCap} 칸`);
const [o0, o1] = ON.ore;
ok(o0.dec < o0.unc * 0.999 && o0.dec > 0.01 && Math.abs(o0.settle - o0.dec) / o0.dec < 1e-5 && !o0.flat, 'ⓑ 원석 상한이 걸린 마을(상한이 바닥 위) — 정산 값 = 상한 값 · 곡선 천장이 상한(상한 밖 곡선이 아니다)', `상한 ${o0.dec.toPrecision(4)} · 상한 앞 ${o0.unc.toPrecision(4)} · 정산 ${o0.settle.toPrecision(4)}`);
ok(o1.dec === 0 && o1.flat && o1.settle === 0 && o1.buyCost === 0, 'ⓑ 시대가 모르는 금속뿐인 광맥 — 결정 값 0 · 정산 곡선 0 에서 평평(사기 값 0)', `결정 ${o1.dec} · 정산 ${o1.settle} · 산 양 ${o1.buyQty.toFixed(2)} · 값 ${o1.buyCost}`);
ok(!!ON.flatBuy && Math.abs(ON.flatBuy.cost - ON.flatBuy.flat * ON.flatBuy.qty) < 1e-9 * Math.max(1, ON.flatBuy.cost) && Math.abs(ON.flatBuy.sell - ON.flatBuy.flat * 2) < 1e-9,
  'ⓑ 평평한 곡선의 사기 · 팔기 적분 = 값 × 양', ON.flatBuy ? `${ON.flatBuy.r} 값 ${ON.flatBuy.flat} · 산 양 ${ON.flatBuy.qty.toFixed(3)}` : '고정물 없음');

console.log('\nⓒ 켬 — 출발 직후 값 · 부패 목표');
ok(ON.nowWorst < 1e-12 && Math.abs(o0.now - o0.dec) < 1e-12 && o1.now === 0, 'ⓒ 출발 직후 값 문 `_priceNowV2` = 결정층 값(전 품목 · 원석 상한까지)', `최대 상대차 ${ON.nowWorst}`);
{
  const s0 = 50, kOff = 1 - OFF.decay.after / s0, kOn = 1 - ON.decay.after / s0;
  const exOff = Math.max(0, s0 / Math.max(1, OFF.decay.Tpp * 10) - 1), exOn = Math.max(0, s0 / Math.max(1, ON.decay.Tdec * 10) - 1);
  const want = (1 + exOn * 5) / (1 + exOff * 5), got = kOn / kOff;
  ok(ON.decay.Tdec === 0 && Math.abs(got - want) / want < 1e-9 && kOn > kOff * 10,
    'ⓒ 부패 목표 = 결정층 목표(안 쓰는 구리 목표 0 — 과잉 가속이 식대로: 켬 부패율 ÷ 끔 부패율 = (1+5·초과켬)/(1+5·초과끔))', `${got.toFixed(4)} = ${want.toFixed(4)}`);
}

console.log('\nⓓ 한 함수 — 손잡이 한 자리 · 식 한 곳 · 문 넷');
const nRead = SRC.split('process.env.T726_ONE_TARGET').length - 1;
ok(nRead === 1, 'ⓓ 손잡이를 읽는 자리 하나', `${nRead}`);
const body = (name) => { const i = SRC.indexOf('function ' + name + '('); return i < 0 ? '' : SRC.slice(i, SRC.indexOf('\n}\n', i)); };
const tgt = body('_targetV2');
ok(SRC.split('= _worldStockOf(v, r)').length - 1 === 1 && tgt.includes('= _worldStockOf(v, r)') && tgt.includes('VARIETY_FOOD[r]') && tgt.includes('v1.derivedInputTarget(v, r)') && tgt.includes('LUX_ADJ_MAX'),
  'ⓓ 결정층 식(유효수요 상한 · 다양성 · 파생수요 · 웃돈 상한)은 `_targetV2` 한 곳');
ok(SRC.split('v1._SMELT_YIELD || 0.33').length - 1 === 1 && body('_oreCapV2').includes('v1._SMELT_YIELD || 0.33'), 'ⓓ 원석 상한 식은 `_oreCapV2` 한 곳');
const csp = body('computeShadowPrices');
ok(csp.includes('_priceFromV2(_targetV2(v, r, ctx))') && csp.includes('_oreCapV2(v,'), 'ⓓ 결정층 = 그 함수를 늘 부른다(손잡이 무관)');
ok(body('_priceParamsV2').includes(SETTLE_DOOR) && body('_settleParamsV2').includes('_targetV2(v, r, ctx)') && body('_settleParamsV2').includes('_oreCapV2(v,'), 'ⓓ 정산 문 — 켬이면 `_settleParamsV2`(같은 함수 · 원석 상한)');
ok(body('tickDecay').includes('if (_t726) target = _targetV2(v, r, _t726).target;'), 'ⓓ 부패 문 — 켬이면 `_targetV2` 의 목표');
ok(SRC.includes('if (T726_ONE_TARGET) a.prices[cand.res] = _priceNowV2(a.v, cand.res);') && SRC.includes('if (T726_ONE_TARGET) a.prices[_res2] = _priceNowV2(a.v, _res2);'), 'ⓓ 출발 직후 문 둘 — 켬이면 `_priceNowV2`');

console.log('\nⓔ 3사본 — 번들 · 랩');
const B = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
ok(B.includes('process.env.T726_ONE_TARGET') && B.includes(SETTLE_DOOR) && B.includes('function _targetV2('), 'ⓔ 번들이 같은 손잡이 줄 · 같은 함수를 싣는다');
{
  const win = {};
  try { vm.runInNewContext(B, { window: win, console: { log() {}, info() {}, warn() {}, error() {} } }); } catch (e) { win.err = e.message; }
  const E = win.EconEngine;
  ok(!!E && E.T726_ONE_TARGET === false && typeof E._targetV2 === 'function', 'ⓔ 브라우저 꼴(process 심 env 빈 판)에선 끔 — 랩 기본 = 종전', win.err || '');
}
let inl = 0; try { execFileSync(process.execPath, [path.join(ROOT, 'sim', 'inline-engine.js'), '--check'], { cwd: ROOT, stdio: 'pipe' }); } catch (e) { inl = e.status || 1; }
ok(inl === 0, 'ⓔ 랩 두 벌 인라인 = 번들(`inline-engine --check`)');

console.log('\nⓕ 미끼 — 정산 문 줄을 뺀 사본');
let BAIT = null; try { BAIT = child({ T726_ONE_TARGET: '1' }, [SETTLE_DOOR, '']); } catch (e) { BAIT = { err: String(e.message).slice(0, 120) }; }
ok(!!BAIT && BAIT.knob === true && BAIT.mism > 100, 'ⓕ [자명 통과 금지] 정산 문을 뺀 사본은 켬에서도 정산 ≠ 결정 ⇒ ⓑ 가 빨개진다',
  BAIT && BAIT.cells ? `${BAIT.mism}/${BAIT.cells} 칸` : (BAIT && BAIT.err));

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
