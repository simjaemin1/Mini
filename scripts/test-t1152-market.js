#!/usr/bin/env node
// @regress
// === scripts/test-t1152-market.js — 바구니가 서는 값 곡선: 시장 깊이 · 운반비 (T1152 · 손잡이 `T1152_MARKET` · 끔 기본) ===
//
// ★왜 [★재민 11-04 T1136 ㄱ "교역 바구니는 최종적으로 도달해야 할 목표"] 식량 값 = 1.0 × (목표 ÷ 재고)^1.2 · 목표 = 인구 × 30날 —
//   두 수(30 · 1.2)와 낱개당 운반비 2/1,000 거리는 근거가 적힌 적이 없다. 켬: 식량 곡선의 두 수를 지금 세계의 곳간에서 유도한다 —
//   H = 달력의 고비(봄 기점 한 해의 밭 배수로 1 − m/m̄ 를 쌓은 가장 깊은 구간 = 겨울) · 반값 재고 X = ∫_H^X ρ = ln 2(ρ = 정본 `tickDecay` 의 하루 손실률) ·
//   탄력 e = ln 2 ÷ ln(X ÷ H) · 적자 선반영 × H. 운반비 = 상인 하루 몫 × 다리 날 × 낱개 kg ÷ 몸 짐 × 말 시대 배수.
//   측정 갈래: `T1152_SRC=life`(밭 달력 · 길 위 신선도) · `T1152_POOL=1`(열량 하나의 시장) · `T1152_CAL_LEGACY=1`(H 30 · 탄력 1.2) · `T1152_ONLY=cal|tc`.
//
//  ① 손잡이 — 끔(기본 · '1' 밖의 값)이면 갈래 0 · 식량 곡선 훅은 같은 객체를 그대로 돌려준다
//  ② 달력의 고비 — 하네스가 정본 표(밭 배수 · 달력)로 따로 센 값과 같다 · 평년 = 겨울 한 덩이 · 윤년이면 겨울이 하루 길다
//  ③ 반값 재고 — 정본 `tickDecay` 로 하네스가 따로 적분한 X 와 같다 · 과잉 가속 문턱(목표 30날 × 2) 아래 손실률 = 정본 기본 손실률
//  ④ 식량 곡선(켬 판 · 실제 마을) — 결정층 · 정산 종전 식 둘 다 목표 = 인구 × H · 탄력 = e · 적자 선반영 × H · 그림자가격 = 그 곡선 · 다른 품목 무변
//  ⑤ 생활층 읽기(`T1152_SRC=life`) — H = 다음 거둠까지 날(수명 상한) · 반값 배수 = 1 + 반감 ÷ H · 반감 = 신선도 0.5 인 나이
//  ⑥ 열량 시장(`T1152_POOL=1`) — 같은 곳간에서 곡식 값 = φ × 식량 값(같은 열량 곡선)
//  ⑦ 운반비 — 상인 하루 몫 × 다리 날 × kg ÷ 몸 짐 × 말 시대 배수(정본 무게 · 몸 짐 · 걸음) · `T1152_ONLY` 가르기
//  ⑧ 출발 직후 값 · 계측 — 종전 축약식 두 자리 뒤에 결정층 한 함수 줄(끔 무동작) · 랩 자의 그날 죽음 = 정본 `lib-day-deaths`
//  ⑨ 번들 — 브라우저 꼴(env 빈 판)에선 끔 · 랩 두 벌 인라인 = 번들
// 실행: node scripts/test-t1152-market.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const KNOBS = ['T1152_MARKET', 'T1152_ONLY', 'T1152_SRC', 'T1152_POOL', 'T1152_CAL_LEGACY', 'T1152_DEF30', 'T1136_BASKET', 'T726_ONE_TARGET', 'T859_FOOD_HUNGER'];
const mkWorld = (V2, seed, n) => V2.createWorldV2({ seed, villageCount: n || 8, picker: 'rational', infoRange: 5000, raidPer100: 0 });

if (process.env.T1152_SUB) {
  const _log = console.log; console.log = () => {}; console.warn = () => {};
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
  const P = V2._t1152Probe, out = { knob: V2.T1152_MARKET, flags: P.flags };
  const K = process.env.T1152_SUB;
  if (K === 'flags') { /* 손잡이 판 — 깃발만 */ }
  else if (K === 'curve') {   // ④ 실제 마을 — 켬 판 곡선 칸
    const w = mkWorld(V2, 7);
    for (let d = 0; d < 40; d++) V2.tickWorldV2(w);
    const C = P.cal(w.day);
    out.C = C; out.rows = [];
    // ★[T1208] 적자 갈래 고정물 — T1197(식사 = 몸 · 켬 기본) 판의 이 씨 40날 세계엔 식량 적자 마을이 없다(적자 선반영 갈래가 안 선다).
    //   세계 상태가 갈래를 안 열면 첫 마을 하나에 적자 EMA 를 심는다(인구 × 0.5 · 식 · 단언 무변 — 갈래를 여는 픽스처).
    out.planted = null;
    if (!w.villages.some((v) => v.npcs.length && v.surplusEMA && v.surplusEMA.food < 0)) {
      const v0 = w.villages.find((v) => v.npcs.length); v0.surplusEMA = v0.surplusEMA || {}; v0.surplusEMA.food = -v0.npcs.length * 0.5; out.planted = v0.id;
    }
    for (const v of w.villages) {
      const N = v.npcs.length; if (!N) continue;
      const D = V2._settleParamsV2(v, 'food'), S = V2._priceParamsV2(v, 'food'), px = V2.computeShadowPrices(v);
      const W0 = V2._settleParamsV2(v, 'wood'), wp = { ...W0 }, same = P.food(v, 'wood', wp) === wp && JSON.stringify(wp) === JSON.stringify(W0);
      out.rows.push({ N, st: +v.storage.food || 0, ema: (v.surplusEMA && v.surplusEMA.food) || 0, D: { t: D.target, e: D.e, s: D.sEff, b: D.base, mx: D.maxAdj }, S: { t: S.target, e: S.e, s: S.sEff },
        p: px.food, own: P.own(v, 'food'), ownW: P.own(v, 'wood'), woodSame: same });
    }
  } else if (K === 'life') {   // ⑤ 생활층 읽기
    const Cr = require(path.join(ROOT, 'server', 'crops')), Sp = require(path.join(ROOT, 'server', 'spoil'));
    out.days = [0, 45, 120, 200, 280, 330, 400].map((d) => ({ d, c: P.cal(d), next: Cr.daysToFirstHarvest(d) }));
    out.keep = Sp.shelfOf('food'); out.f50 = Sp.freshnessOf('food', out.days[0].c.half); out.f49 = Sp.freshnessOf('food', out.days[0].c.half - 0.01);
  } else if (K === 'pool') {   // ⑥ 열량 시장
    const w = mkWorld(V2, 7);
    for (let d = 0; d < 40; d++) V2.tickWorldV2(w);
    out.rows = [];
    for (const v of w.villages) {
      if (!v.npcs.length) continue;
      const px = V2.computeShadowPrices(v), F = V2._settleParamsV2(v, 'food'), R = V2._settleParamsV2(v, 'rice');
      out.rows.push({ food: px.food, rice: px.rice, wheat: px.wheat, phiR: P.foodPer(v, 'rice'), phiW: P.foodPer(v, 'wheat'), fe: +V1.totalFoodEquivalent(v) || 0, ema: (v.surplusEMA && v.surplusEMA.food) || 0,
        Ft: F.target, Fs: F.sEff, Rt: R.target, Rs: R.sEff, own: P.own(v, 'rice'), ownWood: P.own(v, 'wood') });
    }
  } else if (K === 'tc') {   // ⑦ 운반비
    const W = require(path.join(ROOT, 'server', 'weights')), CY = require(path.join(ROOT, 'server', 'carry'));
    out.speed = V2.CARAVAN_DAY_SPEED; out.haul = V2.haulMul(); out.cap = (CY.CFG && CY.CFG.CAP_KG) || CY.CAP_KG;
    out.rows = ['food', 'rice', 'stone', 'wood', 'dried_fish'].map((r) => ({ r, kg: W.kgOfOrDefault(r), d: P.tcD(2, 0.5, r), t: P.tc(2, 3600, r), t0: P.tc(0, 3600, r) }));
  }
  _log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const near = (a, b, tol) => Math.abs(a - b) <= (tol != null ? tol : 1e-9) * Math.max(1, Math.abs(a), Math.abs(b));
const sub = (kind, env) => { const e = Object.assign({}, process.env, { T1152_SUB: kind }); delete e.NODE_OPTIONS;
  for (const k of KNOBS) delete e[k];
  Object.assign(e, env || {});
  const t = execFileSync(process.execPath, [__filename], { env: e, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim(); return JSON.parse(t.split('\n').filter((l) => l.startsWith('{')).pop()); };

const _log = console.log; console.log = () => {}; console.warn = () => {};
for (const k of KNOBS) delete process.env[k];
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const CAL = require(path.join(ROOT, 'server', 'calendar'));
console.log = _log;
const P = V2._t1152Probe;
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');

console.log('① 손잡이');
{
  ok(V2.T1152_MARKET === false && Object.values(P.flags).every((x) => x === false), '끔(기본) — 갈래 깃발 전부 거짓', JSON.stringify(P.flags));
  const obj = { base: 1, e: 1.2, target: 300, sEff: 30, physical: 30, maxAdj: 1000 }, cp = { ...obj };
  ok(P.food({ _world: { day: 9 }, surplusEMA: { food: -3 }, storage: { food: 30 } }, 'food', obj) === obj && JSON.stringify(obj) === JSON.stringify(cp) && P.own({}, 'food') === false, '끔 — 식량 곡선 훅은 같은 객체를 손대지 않고 돌려준다 · 그 곡선이 선 품목 없음');
  const F2 = sub('flags', { T1152_MARKET: 'true' }), F1 = sub('flags', { T1152_MARKET: '1' }), Fc = sub('flags', { T1152_MARKET: '1', T1152_ONLY: 'cal' }), Ft = sub('flags', { T1152_MARKET: '1', T1152_ONLY: 'tc' });
  ok(F2.knob === false && F1.knob === true && F1.flags.cal && F1.flags.tc && !F1.flags.pool && !F1.flags.life && !F1.flags.legacy, "'1' 만 켬 — 켬 기본 = 곳간 읽기 식량 곡선 + 운반비(풀지 않음)", JSON.stringify(F1.flags));
  ok(Fc.flags.cal && !Fc.flags.tc && !Ft.flags.cal && Ft.flags.tc, '`T1152_ONLY=cal|tc` — 한 갈래만');
  const Fo = sub('flags', { T1152_POOL: '1', T1152_SRC: 'life' });
  ok(Fo.knob === false && !Fo.flags.pool && !Fo.flags.life, '측정 갈래는 손잡이 없이 안 선다(`T1152_POOL` · `T1152_SRC` 만으로는 끔)');
}

console.log('\n② 달력의 고비(곳간 읽기 H)');
{
  const SM = P.seasonMult;
  const lean = (y) => {   // 하네스 셈 — 봄 기점 한 해 · 날마다 밭 배수 · 평균 · (1 − m/m̄) 의 가장 깊은 구간 합(두 해 이어 붙임)
    const d0 = CAL.dayOf(y, 3, 1), d1 = CAL.dayOf(y + 1, 3, 1), m = [];
    for (let d = d0; d < d1; d++) m.push(SM[CAL.seasonOf(d)].fertility);
    const mean = m.reduce((a, b) => a + b, 0) / m.length;
    let best = 0, cur = 0; for (let k = 0; k < 2 * m.length; k++) { cur = Math.max(0, cur + 1 - m[k % m.length] / mean); best = Math.max(best, cur); }
    let win = 0; for (let d = d0; d < d1; d++) if (CAL.seasonOf(d) === 'winter') win += 1 - SM.winter.fertility / mean;
    return { H: best, win, len: m.length, mean };
  };
  const a = lean(1), b = lean(3), L1 = P.lean(0), L3 = P.lean(CAL.dayOf(3, 6, 1));
  ok(near(L1.H, a.H) && near(L3.H, b.H) && L1.y === 1 && L3.y === 3, '정본 표(밭 배수 · 달력)로 따로 센 고비와 같다', `1년 ${L1.H.toFixed(4)} · 3년(윤) ${L3.H.toFixed(4)}`);
  ok(near(a.H, a.win) && near(b.H, b.win), '평년 고비 = 겨울 한 덩이(봄 · 가을 남는 몫이 끊는다)', `겨울 합 ${a.win.toFixed(4)}`);
  ok(b.len === 366 && a.len === 365 && b.H > a.H && a.H > 10 && a.H < 30, '윤년(2월 29일)이면 겨울이 하루 길어 고비가 깊다 · 종전 30날과 다르다(자명 통과 아님)', `${a.H.toFixed(2)} < ${b.H.toFixed(2)}`);
  ok(P.lean(CAL.dayOf(1, 12, 15)) === L1 && P.lean(CAL.dayOf(2, 2, 10)) === L1 && P.lean(CAL.dayOf(2, 3, 1)) !== L1, '해의 열쇠 = 봄 기점(1·2월은 전해 — 한겨울에 해가 안 바뀐다)');
}

console.log('\n③ 반값 재고(곳간 손실 — 정본 tickDecay)');
{
  const rho = (x) => { const N = 100, v = { npcs: new Array(N).fill(null).map(() => ({})), storage: { food: x * N }, counts: {}, _consEMA: {}, surplusEMA: {}, dailyProductionBuf: {}, treasury: {} }; V2.tickDecay(v); return 1 - v.storage.food / (x * N); };
  const r10 = rho(10), r59 = rho(59.5), r90 = rho(90), r180 = rho(180);
  ok(near(P.rho(10), r10) && near(r10, r59) && r90 > r59 * 2 && r180 > r90, '손실률 — 과잉 문턱(목표 30날 × 2) 아래는 한 수(기본 손실률) · 넘으면 가속(정본 그대로)', `ρ(10) ${r10.toExponential(3)} · ρ(90) ${r90.toExponential(3)} · ρ(180) ${r180.toExponential(3)}`);
  const H = P.lean(0).H;
  let I = 0, x = H, a0 = rho(x); while (I < Math.LN2) { const b0 = rho(x + 0.25); I += (a0 + b0) / 2 * 0.25; x += 0.25; a0 = b0; }
  const X = P.half(H);
  ok(near(X, x) && X > 3 * H, '∫_H^X ρ = ln 2 — 하네스가 따로 적분한 X 와 같다', `X ${X.toFixed(2)}날 (H ${H.toFixed(2)})`);
  const F = sub('flags', { T1152_MARKET: '1' }), C = sub('curve', { T1152_MARKET: '1' }).C;
  ok(F.knob && C.src === 'granary' && near(C.H, H) && near(C.m, X / H) && near(C.e, Math.LN2 / Math.log(X / H)) && Math.abs(C.e - 1.2) > 0.1, '켬 판 곡선 = { H · m = X ÷ H · e = ln 2 ÷ ln m } · 종전 1.2 와 다르다', `H ${C.H.toFixed(2)} · m ${C.m.toFixed(3)} · e ${C.e.toFixed(4)}`);
}

console.log('\n④ 식량 곡선(켬 판 · 실제 마을 40날)');
{
  const R = sub('curve', { T1152_MARKET: '1' }), C = R.C;
  const rows = R.rows;
  ok(rows.length >= 4, '상황 — 인구 있는 마을', `${rows.length}`);
  const exp = (r) => { let s = Math.max(0.1, r.st); if (r.ema < 0) s = Math.max(0.1, s + r.ema * C.H); return { t: r.N * C.H, s }; };
  ok(rows.every((r) => near(r.D.t, exp(r).t) && near(r.S.t, exp(r).t)), '목표 = 인구 × H(결정층 · 정산 종전 식 둘 다)', rows.slice(0, 3).map((r) => `${r.N}명 → ${r.D.t.toFixed(1)}`).join(' · '));
  ok(rows.every((r) => near(r.D.e, C.e) && near(r.S.e, C.e)), '탄력 = 유도 e(두 식 다)');
  ok(rows.every((r) => near(r.D.s, exp(r).s) && near(r.S.s, exp(r).s)) && rows.some((r) => r.ema < 0), '유효 재고 = 곳간 + 적자 선반영 × H(바닥 → 선반영 → 바닥 · 종전 차례)', `적자 마을 ${rows.filter((r) => r.ema < 0).length}${R.planted != null ? ' (심은 적자 마을 ' + R.planted + ')' : ''}`);
  ok(rows.every((r) => near(r.p, r.D.b * Math.max(0.01, Math.min(r.D.mx, Math.pow(r.D.t / r.D.s, r.D.e))))), '그림자가격 = 그 곡선(기준값 × clamp(바닥 · 천장 · (목표 ÷ 유효 재고)^e))', rows.slice(0, 3).map((r) => r.p.toFixed(3)).join(' · '));
  ok(rows.every((r) => r.woodSame && r.own && !r.ownW), '다른 품목(나무)은 같은 객체 그대로 · 그 곡선이 선 품목 = 식량 하나');
}

console.log('\n⑤ 생활층 읽기(T1152_SRC=life)');
{
  const R = sub('life', { T1152_MARKET: '1', T1152_SRC: 'life' });
  ok(R.days.every((x) => x.c.src === 'life' && near(x.c.H, Math.max(1, Math.min(R.keep, x.next > 0 ? x.next : R.keep))) && near(x.c.m, 1 + x.c.half / x.c.H) && near(x.c.e, Math.LN2 / Math.log(x.c.m))), 'H = 다음 거둠까지 날(수명 상한) · m = 1 + 반감 ÷ H · e = ln 2 ÷ ln m', R.days.map((x) => `${x.d}:${x.c.H}`).join(' '));
  ok(Math.abs(R.f50 - 0.5) < 1e-5 && R.f49 > 0.5 && Math.abs(R.days[0].c.half - R.keep / 2) < 1e-3, '반감 = 길 위 신선도 0.5 인 나이(정본 곡선 이분법 · 정본은 6자리 반올림 — 곧은 곡선이라 수명의 반)', `${R.days[0].c.half.toFixed(3)}날`);
  ok(new Set(R.days.map((x) => x.c.H)).size > 2, '날마다 다르다(달력 — 자명 통과 아님)');
}

console.log('\n⑥ 열량 시장(T1152_POOL=1)');
{
  const R = sub('pool', { T1152_MARKET: '1', T1152_POOL: '1' });
  const inside = R.rows.filter((r) => r.food > 0.0101 && r.food < 999 && r.rice > 0 && r.wheat > 0);
  ok(inside.length >= 2, '상황 — 식량 값이 천장 · 바닥 사이인 마을', `${inside.length}`);
  ok(inside.every((r) => near(r.rice, r.phiR * r.food, 1e-9) && near(r.wheat, r.phiW * r.food, 1e-9)) && inside.every((r) => r.phiR > 0 && r.phiR < 1), '같은 곳간에서 곡식 값 = φ × 식량 값(같은 열량 곡선)', inside.slice(0, 2).map((r) => `${r.rice.toFixed(3)} = ${r.phiR} × ${r.food.toFixed(3)}`).join(' · '));
  ok(R.rows.every((r) => near(r.Rt * r.phiR, r.Ft) && near(r.Rs * r.phiR, r.Fs) && r.own && !r.ownWood), '낱개 좌표 = 열량 좌표 ÷ φ(목표 · 유효 재고) · 그 곡선이 선 품목 = 식량 환산 품목');
}

console.log('\n⑦ 운반비');
{
  const R = sub('tc', { T1152_MARKET: '1' });
  ok(R.rows.every((x) => near(x.d, 2 * 0.5 * x.kg / R.cap * R.haul) && near(x.t, 2 * (3600 / R.speed) * x.kg / R.cap * R.haul) && x.t0 === 0), '낱개 운반비 = 하루 몫 × 다리 날(거리 ÷ 몸 걸음) × kg ÷ 몸 짐 × 말 시대 배수 · 하루 몫 0 이면 0', R.rows.map((x) => `${x.r} ${x.t.toFixed(4)}`).join(' · '));
  const st = R.rows.find((x) => x.r === 'stone'), fo = R.rows.find((x) => x.r === 'food');
  ok(st.t > fo.t * 5 && R.speed > 1000, '무게를 안다(돌 4kg > 식량 0.7kg) · 몸 걸음(T474 켬 기본)', `돌 ${st.t.toFixed(4)} · 식량 ${fo.t.toFixed(4)} · 걸음 ${R.speed}`);
  const n = (re) => (SRC.match(re) || []).length;
  ok(n(/T1152_TC \? _t1152TcD\(risk\.mv, t(Out|Back), r\) : risk\.transportCostPerUnit/g) === 2 && n(/T1152_TC \? _t1152Tc\(/g) === 3, '쓰는 자리 — 바구니 두 다리 · 종전 첫 화물 · 돌리기 · 순수출값(끔 = 종전 식)');
}

console.log('\n⑧ 출발 직후 값 · 계측');
{
  const n = SRC.split('if (!T726_ONE_TARGET && _t1152Own(a.v, ').length - 1;
  ok(n === 2 && SRC.includes('if (T726_ONE_TARGET) a.prices[cand.res] = _priceNowV2(a.v, cand.res);') && SRC.includes('if (T726_ONE_TARGET) a.prices[_res2] = _priceNowV2(a.v, _res2);'), '종전 축약식 두 자리는 글자 그대로 · 그 뒤에 결정층 한 함수 줄(그 곡선이 선 품목만 · 끔 = 무동작)', `${n}곳`);
  const T = fs.readFileSync(path.join(ROOT, 'scripts', 't17-metrics.js'), 'utf8');
  const blk = T.slice(T.indexOf('const _T1152 = process.env.T17_MARKET'), T.indexOf('})() : null;', T.indexOf('const _T1152 = process.env.T17_MARKET')));
  ok(blk.includes("require('./lib-day-deaths')") && blk.includes('DD.dayDelta(lastDead, v, v)') && !blk.includes('v._deathsToday'), '랩 자 식량 흐름 표의 그날 죽음 = 정본 `lib-day-deaths`(빈 마을의 전날 값을 다시 세지 않는다)');
}

console.log('\n⑨ 번들');
{
  const B = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
  ok(B.includes("process.env.T1152_MARKET === '1'") && B.includes('function _t1152Food('), '번들이 같은 손잡이 · 같은 훅을 싣는다(사본 0 · 다시 굽기)');
  const win = {};
  try { vm.runInNewContext(B, { window: win, console: { log() {}, info() {}, warn() {}, error() {} } }); } catch (e) { win.err = e.message; }
  const E = win.EconEngine;
  ok(!!E && E.T1152_MARKET === false && E._t1152Probe && Object.values(E._t1152Probe.flags).every((x) => x === false), '브라우저 꼴(process 심 env 빈 판)에선 끔 — 랩 기본 = 종전', win.err || '');
  let inl = 0; try { execFileSync(process.execPath, [path.join(ROOT, 'sim', 'inline-engine.js'), '--check'], { cwd: ROOT, stdio: 'pipe' }); } catch (e) { inl = e.status || 1; }
  ok(inl === 0, '랩 두 벌 인라인 = 번들(`inline-engine --check`)');
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
