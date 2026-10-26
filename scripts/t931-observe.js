'use strict';
// (@regress 없음 — 러너 밖 · T931 관찰기 · 읽기만 · 제품 손잡이 0)
// === scripts/t931-observe.js — T931 관찰기: 마을 × econ 날 죽음 · K 셋(관성 앞 그날 자리 포함) · 그날 항 — 서버 판 자 · 랩 두 자 곁 프리로드 ===
//
// ★[T931 2026-10-26 · T924 회부 2-ⓐ] "곳간에 식량이 있는데 죽는다" — 식량 자리 K 에 관성(`T931_SLOTK_EMA`)을 건 판과 안 건 판을 같은 잣대로 잰다.
//   쓰는 법:
//     서버: NODE_OPTIONS="-r $PWD/scripts/t931-observe.js" node scripts/t577-server-run.js 800 1020,7,42   (아이 존만 · 판 JSON 곁 `<판>-<시드>.t931.json`)
//     랩:   T931_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t931-observe.js" node scripts/t17-metrics.js 800 1020   (`t176-ab.js` 도 같다)
//   econ 이 부르는 `tickVillage`(v2 마을 조각이 `v1.tickVillage` 로 부른다 — 계절 땅 배수가 걸린 채) 를 감싸 **그 틱 뒤**를 읽는다:
//     [날 · 틱 머리 인구 · 틱 뒤 인구 · 그날 죽음(`_deadTot` 틱 앞뒤 차) · 곳간 식량 환산(`totalFoodEquivalent`) · K(`_dpDebug.K`) ·
//      K 에 든 식량 자리(`_kDbg.slot`) · 그날 자리(`totalFoodSlots` — 계절 배수가 걸린 그날 땅으로 다시 센다 · 끔이면 slot 과 같다) · 식량 흐름 · 땔감 ·
//      항(로지스틱 · 굶주림 · 건강 · 행복) · 주거 게이트 · 징발 · 짐꾼]
//   ★[T943 2026-10-27] 그날 죽음 칸을 `_deathsToday` → `_deadTot` 틱 앞뒤 차로 바꿨다(`rec.deathsSrc = 'deadTot'`). `_deathsToday` 는 틱이 기근 고리 앞
//     `v._deathsToday = 0` 줄까지 닿아야 다시 선다 — 빈 마을(틱 첫 줄 `if (v.npcs.length === 0) return;`) · T932 끔 판(열셋째 판까지)의 제련 날 `return` 은
//     전날 값이 그대로 남아 없는 죽음을 날마다 다시 셌다(T943 서버 판 24개: 옛 셈 52,728 · `_deadTot` 정본 48,939). 옛 파일은 `t931-table.js` 가 바로잡는다.
//   ⚠읽기만 — 마을 칸에 쓰지 않는다(`totalFoodSlots` · `totalFoodEquivalent` 는 읽기만 하는 함수 · RNG 무접촉).
//     `totalFoodSlots` → `jobCapacity` → `effectiveLandSize` 가 `v._effSizeCache` 를 다시 쓸 수 있다 — 그 캐시는 (size → 값) 순수 메모라 econ 이 같은 size 로
//     같은 값을 얻는다(값 무변). 이 관찰기를 건 판과 안 건 판의 판 JSON 이 같은지는 보고 §5 에서 바이트로 본다.
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T931_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T931_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t931.json' : '')) : process.env.T931_OUT;
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const COLS = ['day', 'pop0', 'pop', 'deaths', 'tfe', 'K', 'slot', 'slotRaw', 'prod', 'fuel', 'logi', 'hunger', 'healthT', 'happyT', 'gated', 'drafted', 'packers'];
const rec = { where: SERVER ? 'server' : path.basename(A1), knob: { T931_SLOTK_EMA: process.env.T931_SLOTK_EMA != null ? process.env.T931_SLOTK_EMA : null, DCTL_SKIP: process.env.DCTL_SKIP || null },
  engineKnob: V1.T931_SLOTK_EMA ? '1' : V1.T931_SLOTK_SEASON ? 'season' : '', deathsSrc: 'deadTot', cols: COLS, v: {}, errs: 0, err0: null };
const r1 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 10) / 10;
const r3 = (x) => (x == null || !Number.isFinite(+x)) ? null : Math.round(+x * 1000) / 1000;
function row(v, day, n0, d0) {
  const D = v._dpDebug || {}, k = v._kDbg || {};
  let dr = 0, pk = 0; for (const n of (v.npcs || [])) if (n._warDraft) { dr++; if (n._warPack) pk++; }
  let tfe = -1; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
  let raw = null; try { raw = typeof V1.totalFoodSlots === 'function' ? V1.totalFoodSlots(v) : null; } catch (e) { raw = null; }
  const R = [day, n0, (v.npcs || []).length, (+v._deadTot || 0) - d0, r1(tfe), D.K, k.slot, raw, k.prod, k.fuel, D.logi, D.hunger, D.health, D.happy, D.gated ? 1 : 0, dr, pk];
  (rec.v[v.name] || (rec.v[v.name] = [])).push(R);
}
const _tick = V1.tickVillage;
V1.tickVillage = function (v, day) {
  const n0 = (v && v.npcs) ? v.npcs.length : 0;
  const d0 = (v && +v._deadTot) || 0;   // ★[T943] 틱 앞 죽음 누계(읽기만)
  const r = _tick.apply(this, arguments);
  try { row(v, day | 0, n0, d0); } catch (e) { rec.errs++; if (!rec.err0) rec.err0 = String(e && e.stack || e).slice(0, 400); }
  return r;
};
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 관측 실패는 판을 안 건드린다 */ } });
