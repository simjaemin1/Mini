#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// === scripts/test-t1333-alloy-order.js — 청동 길: 합금 발주(ⓐ `T1333_ALLOY_ORDER`) · 수출 주조(ⓑ `T1333_EXPORT_CAST`) — 끔 기본 둘(T1333 · T1313 회부 1) ===
//
// ★지키는 것(존을 부팅하지 않는다 — econ 정본 함수 · v2 값 함수를 그대로 부른다 · 아이 판: 끔 · ⓐ · ⓑ · 옛 구리 파생(`COPPER_DERIV=1`) · 미끼):
//   ① 손잡이 — `'1'` 만 켬(없음 · '0' · '' · 'true' = 끔) · 끔이면 합금 재료 파생수요 0 · 수출 주조 문 안 선다
//   ② 합금 발주가 선다 — 주석만 든 대장장이 마을은 구리를, 구리만 든 마을은 주석을 값표 목표에 올린다
//      양 = "그 재료가 있다면"(1회 주조분) 그 마을 최선 배합의 그 재료 × 30날 — 주조가 쓰는 탐색(`_alloyMelt`)으로 따로 셈 · 구리 · 주석 같은 날 수
//   ③ 조리법 밖 0 — 배합이 남지 않는 재료(금) · 합금 재료 표 밖(철 · 돌) · 기지(구리)가 없는 마을의 주석 · 납 · 무기 노동 0 마을 · 이미 그 품질을 내는 마을 · 순동뿐인 마을의 구리
//   ④ 값표 — 켬이면 모자란 재료 값이 오른다 · 곳간이 목표에 닿으면 기준가로 내린다 · 넘치면 기준가 밑 · 흐름 목표와 **큰 쪽**(더하지 않는다 — 주조가 돌면 같은 쓰임)
//   ⑤ 옛 구리 파생(`COPPER_DERIV=1` · 끔 기본)과 같은 함수 — 구리 칸은 같은 수(사본 0) · 옛 손잡이는 주석을 모른다
//   ⑥ 수출 주조 — 이웃이 사 줄 값(순수출가 `netExportFn`)으로 한 번 주조의 이윤이 양수면 참 · 무기 값 0 · 순수출가 없음 · 구리 없음 · 순동뿐(기준가)이면 거짓
//      주조 문 · 무기장 자리 문이 같은 판정 함수를 부른다(글자) · 끔이면 두 문 다 종전 글자
//   ⑦ 미끼(사본 — 정본 파일 무변 · 한 줄만 바꿔 싣는다) — 각각 빨강:
//      `outside`(합금 재료 표 밖 재료에도 1회 주조분 발주) · `addflow`(합금 발주를 흐름 목표에 더함 — 두 번 셈) · `market`(문을 시장가로 봄 — 값이 오르면 발주가 꺼지는 자기 꼬리 물기) ·
//      `expfree`(수출 주조가 이윤을 안 보고 무기 값만 보면 참)
//
// 실행: node scripts/test-t1333-alloy-order.js
'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = process.env.T1333_HARNESS_ARM || '', MUT = process.env.T1333_MUTANT || '';

// ── 아이 판: 손잡이를 고른 채 정본을 싣고 잰 수를 JSON 한 줄로 낸다 ─────────────────────────────
if (ARM) {
  for (const k of ['T1333_ALLOY_ORDER', 'T1333_EXPORT_CAST', 'COPPER_DERIV', 'COPPER_DERIV_DAYS']) delete process.env[k];
  if (ARM === 'alloy') process.env.T1333_ALLOY_ORDER = '1';
  if (ARM === 'export') process.env.T1333_EXPORT_CAST = '1';
  if (ARM === 'cuderiv') process.env.COPPER_DERIV = '1';
  process.env.ENABLE_VILLAGES = '0';
  if (MUT) {   // 미끼 — 정본 파일을 읽어 한 줄만 바꾼 사본으로 싣는다(파일 무변)
    const M = require('module'), old = M._extensions['.js'];
    const R = {
      outside: ['sim/economy-sim.js', "return (best.take[r] || (r === 'copper' ? _MELT_TOTAL : 0)) * COPPER_DERIV_DAYS;", 'return (best.take[r] || _MELT_TOTAL) * COPPER_DERIV_DAYS;',
        'if (T1333_ALLOY_ORDER && _MELT_METALS.includes(r) && v && v.storage) {', 'if (T1333_ALLOY_ORDER && v && v.storage && r !== \'stone\' && r !== \'wood\') {'],
      addflow: ['sim/economy-sim-v2.js', 'target = _fishTarget(v,r,Math.max(subs * 30, buffer, flowT, derivT) + buildT);\n    // ★식량 다양성',
        'target = _fishTarget(v,r,Math.max(subs * 30, buffer, flowT, derivT) + buildT + (v1.T1333_ALLOY_ORDER && derivT > 0 ? flowT : 0));\n    // ★식량 다양성'],
      market: ['sim/economy-sim.js', "  const basePrice = (k) => (BASE_VALUE[k] > 0 ? BASE_VALUE[k] : 1);\n  const best = _meltSearch(stHypo, basePrice);", '  const basePrice = (k) => ((v._priceCache && v._priceCache[k] > 0) ? v._priceCache[k] : (BASE_VALUE[k] > 0 ? BASE_VALUE[k] : 1));\n  const best = _meltSearch(stHypo, basePrice);'],   // 그날 값표(시장가)로 문을 본다
      expfree: ['sim/economy-sim.js', '  return !!(best && best.score > 0);\n}', '  return !!best;\n}'],
    }[MUT];
    assert(R, '미끼 모름 ' + MUT);
    M._extensions['.js'] = function (m, f) {
      if (f !== path.join(ROOT, R[0])) return old(m, f);
      let x = fs.readFileSync(f, 'utf8');
      for (let i = 1; i < R.length; i += 2) { assert(x.includes(R[i]), '미끼 자리 없음 ' + MUT + ' · ' + R[i].slice(0, 60)); x = x.replace(R[i], R[i + 1]); }
      m._compile(x, f);
    };
  }
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js')), V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
  const r6 = (x) => (x == null ? null : +(+x).toFixed(6));
  const MET = ['copper', 'tin', 'lead', 'silver', 'gold', 'iron', 'obsidian', 'stone'];   // 합금 재료 표(구리 · 주석 · 납 · 은 · 금) + 표 밖 셋(철 — 시대 문 · 흑요석 — 석기 재료 · 돌 — 제 줄)
  const mk = (st, cnt, q) => ({ storage: Object.assign({}, st), counts: Object.assign({}, cnt), npcs: [1, 2, 3], _weapQ: q });
  const FX = {
    tinV: mk({ tin: 5 }, { smith: 2 }, 0.5),                 // 광산5 꼴 — 주석 · 대장장이 · 구리 없음 · 석검 품질
    cuV: mk({ copper: 5 }, { smith: 2 }, 0.5),               // 광산6 꼴 — 구리 · 대장장이 · 주석 없음
    cuTinV: mk({ copper: 5, tin: 5 }, { smith: 2 }, 0.5),    // 둘 다 · 아직 석검 품질
    topV: mk({ copper: 5, tin: 5 }, { smith: 2 }, 1.2),      // 둘 다 · 품질 상한(1.2)을 이미 낸다
    noLabor: mk({ tin: 5 }, {}, 0.5),                        // 무기 노동 0
    empty: mk({}, { smith: 2 }, 0.5),                        // 아무 금속도 없음(순동 0.466 < 석검 0.5)
    masonTin: mk({ tin: 5 }, { mason: 1 }, 0.5),             // 석공만(무기 노동은 있다)
  };
  const D = {};
  for (const [n, v] of Object.entries(FX)) { D[n] = {}; for (const r of MET) D[n][r] = r6(E.derivedInputTarget(v, r)); }
  // 따로 셈 — 주조가 쓰는 탐색(`_alloyMelt` · 월드 없음 = 기준가) · "그 재료가 있다면" 1회 주조분
  const hypo = (v, r) => { const st = Object.assign({}, v.storage); st[r] = Math.max(st[r] || 0, E._MELT_TOTAL); const m = E._alloyMelt({ storage: st }); return m ? { take: m.take, grade: m.grade } : null; };
  const X = { tinCu: hypo(FX.tinV, 'copper'), cuTin: hypo(FX.cuV, 'tin'), cuTinLead: hypo(FX.cuTinV, 'lead'), cuGold: hypo(FX.cuV, 'gold') };
  // 값표 — 마을 셋 월드(세계 공급 캐시가 서는 판) · 주석 마을 a · 구리 마을 b · 빈 마을 c
  const w = V2.createWorldV2({ seed: 42, villageCount: 3, infoRange: 5000 }), [a, b, c] = w.villages;
  for (const v of [a, b, c]) { v.counts = Object.assign(v.counts || {}, { smith: 2, mason: 1 }); v._weapQ = 0.5; v._consEMA = {}; }
  a.storage.tin = 5; a.storage.copper = 0; b.storage.copper = 30; b.storage.tin = 0; c.storage.copper = 0; c.storage.tin = 0;
  w.day = 2;
  const P = (v, r) => { v._priceCache = null; const px = V2.computeShadowPrices(v); const T = V2._targetV2(v, r, V2._targetCtxV2(v)); return { p: r6(px[r]), t: T ? r6(T.target) : null, s: T ? r6(T.sEff) : null }; };
  const V = {};
  V.a0 = P(a, 'copper');                                   // 주석 마을 구리 — 곳간 0
  const dA = E.derivedInputTarget(a, 'copper');
  a.storage.copper = dA; V.aFull = P(a, 'copper');          // 곳간 = 발주 양
  a.storage.copper = dA * 2; V.aOver = P(a, 'copper');      // 넘침
  a.storage.copper = 0; a._consEMA = { copper: (dA * 2) / 30 }; V.aFlow = P(a, 'copper');   // 흐름 목표(발주의 두 배)와 함께 — 큰 쪽
  a._consEMA = {}; a.storage.copper = 0;
  V.b0 = P(b, 'tin');                                      // 구리 마을 주석 — 곳간 0
  V.base = { copper: E.BASE_VALUE.copper, tin: E.BASE_VALUE.tin };
  V.dA = r6(dA); V.dB = r6(E.derivedInputTarget(b, 'tin'));
  // 시장가가 오른 날(값표 캐시 · 구리 40) — 문은 기준가로 본다(자기 꼬리 물기 없음)
  const hi = mk({ tin: 5 }, { smith: 2 }, 0.5); hi._priceCache = { copper: 40, tin: 40, weapon: 12 };   // 그날 값표에 구리 40(발주가 값을 올린 날 꼴)
  V.hiDeriv = r6(E.derivedInputTarget(hi, 'copper'));
  // ⑥ 수출 주조 판정 — 순수출가(이웃이 사 줄 값)를 주는 월드 꼴
  const W = (pw) => ({ netExportFn: (v, res) => (res === 'weapon' ? pw : 0) });
  const ex = (st, pw, world) => { const v = mk(st, { smith: 2 }, 0.5); if (world !== undefined) v._world = world; else v._world = W(pw); return E._t1333ExportCast(v); };
  const XC = {
    bronze12: ex({ copper: 5, tin: 5 }, 12), bronze0: ex({ copper: 5, tin: 5 }, 0), noNef: ex({ copper: 5, tin: 5 }, 12, {}),
    noCu: ex({ tin: 5 }, 12), pureCu12: ex({ copper: 5 }, 12), pureCu60: ex({ copper: 5 }, 60),
  };
  const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
  const smithT = SRC.slice(SRC.indexOf('function smithTarget(v)'), SRC.indexOf('function warriorTarget(v)'));
  const G = {
    castGate: (SRC.match(/if \(_melt && \(_smSwordStock < _bronzeArmoryCap \|\| \(T1333_EXPORT_CAST && _t1333ExportCast\(v\)\)\)\) \{/g) || []).length,
    jobGate: (smithT.match(/\(\(cuRich && weapThin\) \|\| \(T1333_EXPORT_CAST && _t1333ExportCast\(v\)\)\)/g) || []).length,
    oneFn: (SRC.match(/function _t1333ExportCast\(v\)/g) || []).length, oneDeriv: (SRC.match(/function _alloyDeriv\(v, r\)/g) || []).length,
    derivCalls: (SRC.match(/return _alloyDeriv\(v, (?:r|'copper')\);/g) || []).length,
  };
  process.stdout.write(JSON.stringify({ knobs: { alloy: E.T1333_ALLOY_ORDER, exp: E.T1333_EXPORT_CAST, cd: E.COPPER_DERIV_ON }, D, X, V, XC, G, MELT: E._MELT_TOTAL }) + '\n');
  process.exit(0);
}

// ── 어미 판: 아이 판들을 돌리고 잰 수를 맞춰 본다 ─────────────────────────────────────────────
function child(arm, mut, extra) {
  const env = Object.assign({}, process.env, { T1333_HARNESS_ARM: arm, T1333_MUTANT: mut || '' }, extra || {});
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.strictEqual(r.status, 0, (r.stderr || '') + (r.stdout || ''));
  return JSON.parse(r.stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop());
}
const near = (x, y, e) => Math.abs(x - y) <= (e == null ? 1e-6 : e);
function checks(P, out) {
  let pass = 0, fail = 0; const failed = [];
  const ok = (c, m, x) => { if (c) pass++; else { fail++; failed.push(m); } if (out) console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); };
  const { off: O, alloy: A, export: X, cuderiv: C } = P;
  if (out) console.log('\n① 손잡이 — 끔이면 두 갈래가 안 선다');
  ok(O.knobs.alloy === false && O.knobs.exp === false && A.knobs.alloy === true && A.knobs.exp === false && X.knobs.exp === true && X.knobs.alloy === false, '★손잡이 둘 — 끔 기본 · 제 팔만 켬', [O.knobs, A.knobs, X.knobs]);
  ok(Object.values(O.D).every((o) => Object.entries(o).every(([r, x]) => r === 'stone' || x === 0)), '★끔 — 일곱 마을 · 재료 일곱 파생수요 다 0(종전 — 옛 구리 파생도 끔)', O.D.tinV);
  ok(JSON.stringify(X.D) === JSON.stringify(O.D), 'ⓑ 만 켠 판의 파생수요 = 끔 판(ⓑ 는 값표를 안 건드린다)');
  ok(near(O.V.a0.p, X.V.a0.p) && O.V.a0.t === 0, '끔 — 주석 마을 구리 값표 목표 0 · 값 바닥(ⓑ 판 같은 값)', [O.V.a0, X.V.a0]);

  if (out) console.log('\n② 합금 발주가 선다 — 모자란 재료를 그 마을 값표 목표에');
  const days = A.X.tinCu ? A.D.tinV.copper / A.X.tinCu.take.copper : NaN;
  ok(A.X.tinCu && A.D.tinV.copper > 0 && near(A.D.tinV.copper, A.X.tinCu.take.copper * 30, 1e-4), `★주석 마을 구리 ${A.D.tinV.copper} = 1회 주조분 배합의 구리 ${A.X.tinCu && A.X.tinCu.take.copper} × 30날(주조 탐색 \`_alloyMelt\` 로 따로 셈)`, A.X.tinCu);
  ok(A.X.cuTin && A.D.cuV.tin > 0 && near(A.D.cuV.tin, A.X.cuTin.take.tin * 30, 1e-4), `★구리 마을 주석 ${A.D.cuV.tin} = 배합의 주석 ${A.X.cuTin && A.X.cuTin.take.tin} × 30날`, A.X.cuTin);
  ok(near(days, 30, 1e-6) && A.X.tinCu.grade > 0.5 && A.X.cuTin.grade > 0.5, '구리 · 주석 같은 날 수(30 — 대장장이 한 명의 한 달 조업 재고) · 두 배합 다 석검(0.5)보다 낫다', [days, A.X.tinCu.grade, A.X.cuTin.grade]);
  ok(A.D.masonTin.copper > 0 && near(A.D.masonTin.copper, A.D.tinV.copper), '석공만 있는 주석 마을도 같은 발주(무기 노동이면 문 ① 이 선다 — 옛 구리 파생 그대로)', A.D.masonTin.copper);
  ok(A.D.cuTinV.lead > 0 && A.X.cuTinLead && A.X.cuTinLead.take.lead > 0 && near(A.D.cuTinV.lead, A.X.cuTinLead.take.lead * 30, 1e-4), `구리 · 주석이 다 있고 아직 석검 품질인 마을은 주조성의 납도 발주한다(배합이 고른다 · ${A.D.cuTinV.lead})`, A.X.cuTinLead);

  if (out) console.log('\n③ 조리법 밖 0');
  ok(['tinV', 'cuV', 'cuTinV', 'topV'].every((n) => A.D[n].gold === 0) && A.X.cuGold && A.X.cuGold.take.gold > 0, '★배합이 남지 않는 재료(금 — 기준가 100)는 0 — 순동보다 덜 밑지는 배합(구리 + 금 3 %)을 골라도 채산 문이 닫는다', [A.D.cuV.gold, A.X.cuGold && A.X.cuGold.take]);
  ok(A.D.cuV.silver > 0 && A.D.cuTinV.silver > 0, `은 — 정본 합금 표가 은을 무기 첨가재로 친다(구리 + 은 10 % 등급 1.116 > 순동 · 기준가 30) → 구리 마을 ${A.D.cuV.silver} · 구리 + 주석 마을 ${A.D.cuTinV.silver} 발주(배합이 고른다 — 판에서 잰다)`, [A.D.cuV.silver, A.D.cuTinV.silver]);
  ok(['tinV', 'cuV', 'cuTinV', 'topV'].every((n) => A.D[n].iron === 0 && A.D[n].obsidian === 0 && A.D[n].stone === O.D[n].stone), '★합금 재료 표 밖(철 · 흑요석 · 돌)은 0 · 돌은 종전 줄 그대로', [A.D.cuTinV.iron, A.D.cuTinV.obsidian, A.D.cuTinV.stone]);
  ok(A.D.tinV.tin === 0 && A.D.tinV.lead === 0 && A.D.tinV.silver === 0, '★기지(구리)가 없는 마을의 주석 · 납 · 은은 0 — 붓지 못할 재료는 발주 안 한다', A.D.tinV);
  ok(Object.values(A.D.noLabor).every((x) => x === 0), '무기 노동(석공 · 대장장이) 0 마을은 다 0', A.D.noLabor);
  ok(['copper', 'tin', 'lead', 'silver'].every((r) => A.D.topV[r] === 0), '이미 품질 상한(1.2)을 내는 마을은 0(품질 문)', A.D.topV);
  ok(A.D.empty.copper === 0, '아무 금속도 없는 마을의 구리는 0 — 순동(0.466)은 석검(0.5)보다 못하다(첫 구리 한 덩이는 살 값어치가 없다)', A.D.empty);
  ok(A.D.cuV.copper === 0 && A.D.cuV.lead === 0, '구리만 든 마을의 구리 · 납은 0(구리는 있다 · 구리 + 납은 등급 0.333 — 석검보다 못하다)', [A.D.cuV.copper, A.D.cuV.lead]);

  if (out) console.log('\n④ 값표 — 오르고 · 차면 내리고 · 흐름과는 큰 쪽');
  ok(A.V.a0.t > 0 && near(A.V.a0.t, A.V.dA, 1e-6) && A.V.a0.p > O.V.a0.p * 100, `★켬 — 주석 마을 구리 목표 ${A.V.a0.t} · 값 ${O.V.a0.p} → ${A.V.a0.p}(세계 공급이 넉넉한 판 — 몫 상한이 안 깎는다)`, [O.V.a0, A.V.a0]);
  ok(A.V.b0.t > 0 && near(A.V.b0.t, A.V.dB, 1e-6) && A.V.b0.p > O.V.b0.p, `★켬 — 구리 마을 주석 목표 ${A.V.b0.t} · 값 ${O.V.b0.p} → ${A.V.b0.p}`, [O.V.b0, A.V.b0]);
  ok(near(A.V.aFull.p, A.V.base.copper, 1e-6) && A.V.aFull.p < A.V.a0.p, `★곳간이 발주 양에 닿으면 기준가(${A.V.base.copper})로 내린다`, A.V.aFull);
  ok(A.V.aOver.p < A.V.base.copper, `넘치면 기준가 밑(${A.V.aOver.p})`, A.V.aOver);
  ok(near(A.V.aFlow.t, A.V.dA * 2, 1e-6), `★흐름 목표(${A.V.dA * 2})와 함께면 큰 쪽 — 더하지 않는다(${A.V.aFlow.t} · 주조가 돌면 같은 쓰임 — 두 번 세지 않는다)`, A.V.aFlow);
  ok(A.V.hiDeriv > 0 && near(A.V.hiDeriv, A.D.tinV.copper), `★시장가(구리 40)가 올라도 발주는 그대로(문은 기준가 — 자기 꼬리 물기 없음) ${A.V.hiDeriv}`, A.V.hiDeriv);

  if (out) console.log('\n⑤ 옛 구리 파생(`COPPER_DERIV=1`)과 같은 함수');
  ok(C.knobs.cd === true && C.knobs.alloy === false && near(C.D.tinV.copper, A.D.tinV.copper) && near(C.D.masonTin.copper, A.D.masonTin.copper), `★구리 칸 같은 수(${C.D.tinV.copper}) — 옛 손잡이와 합금 발주가 한 몸통(\`_alloyDeriv\`)`, [C.D.tinV.copper, A.D.tinV.copper]);
  ok(C.D.cuV.tin === 0 && C.D.cuTinV.lead === 0, '옛 손잡이는 구리만 안다(주석 · 납 0 — 종전)', [C.D.cuV.tin, C.D.cuTinV.lead]);
  ok(A.G.oneDeriv === 1 && A.G.derivCalls === 2, '몸통 하나 · 부르는 자리 둘(합금 발주 · 옛 구리 파생) — 사본 0', A.G);

  if (out) console.log('\n⑥ 수출 주조 — 이웃이 사 줄 값으로 한 번 주조가 남나');
  ok(X.XC.bronze12 === true, '★구리 · 주석 든 마을 · 무기 순수출가 12(기준가) → 참', X.XC);
  ok(X.XC.bronze0 === false && X.XC.noNef === false, '★무기 순수출가 0 · 순수출가 주입 없음 → 거짓', [X.XC.bronze0, X.XC.noNef]);
  ok(X.XC.noCu === false, '구리 없는 마을 → 거짓(기지 없음)', X.XC.noCu);
  ok(X.XC.pureCu12 === false && X.XC.pureCu60 === true, '★순동뿐인 마을 — 기준가 무기 값이면 남지 않는다(거짓) · 무기 값 60 이면 남는다(참 — 값이 정한다)', [X.XC.pureCu12, X.XC.pureCu60]);
  ok(X.G.castGate === 1 && X.G.jobGate === 1 && X.G.oneFn === 1, '★주조 문 · 무기장 자리 문이 같은 판정 함수 하나를 부른다(글자 — 끔이면 앞 항만 = 종전)', X.G);
  return { pass, fail, failed };
}

const ARMS = ['off', 'alloy', 'export', 'cuderiv'];
console.log('\n=== T1333 청동 길 — 합금 발주(ⓐ) · 수출 주조(ⓑ) ===');
console.log('\n⓪ 손잡이 글자 — `\'1\'` 만 켬');
let p0 = 0, f0 = 0;
for (const [k, prop] of [['T1333_ALLOY_ORDER', 'T1333_ALLOY_ORDER'], ['T1333_EXPORT_CAST', 'T1333_EXPORT_CAST']]) {
  for (const val of [undefined, '0', '', 'true', '1']) {
    const env = Object.assign({}, process.env, { ENABLE_VILLAGES: '0' }); delete env[k]; if (val !== undefined) env[k] = val;
    const r = spawnSync(process.execPath, ['-e', `process.stdout.write(JSON.stringify(require('./sim/economy-sim').${prop}))`], { cwd: ROOT, env, encoding: 'utf8' });
    const got = r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()) : null, c = got === (val === '1');
    c ? p0++ : f0++; console.log((c ? '  ✓ ' : '  ✗ ') + `${k}=${val === undefined ? '(없음)' : JSON.stringify(val)} → ${got}`);
  }
}
const P = {}; for (const a of ARMS) P[a] = child(a);
const main = checks(P, true);
console.log('\n⑦ 미끼(사본) — 빨강이어야 한다');
let pm = 0, fm = 0;
for (const [kind, name] of [['outside', '합금 재료 표 밖(철 · 흑요석 · 돌)'], ['addflow', '큰 쪽 — 더하지 않는다'], ['market', '시장가(구리 40)가 올라도'], ['expfree', '순동뿐인 마을']]) {
  let res = null, err = null;
  try { const Q = {}; for (const a of ARMS) Q[a] = child(a, kind); res = checks(Q, false); } catch (e) { err = String(e && e.message || e).slice(0, 300); }
  const red = !!res && res.fail > 0 && res.failed.some((m) => m.includes(name));
  red ? pm++ : fm++;
  console.log((red ? '  ✓ ' : '  ✗ ') + `미끼 ${kind} — 「${name}」 빨강` + (res ? `  (빨강 ${res.fail}: ${res.failed.map((m) => m.slice(0, 28)).join(' | ')})` : `  (아이 판 실패: ${err})`));
}
const pass = main.pass + p0 + pm, fail = main.fail + f0 + fm;
console.log(`\n=== ${pass}/${pass + fail} ${fail ? '✗' : '✓'} (미끼 ${pm}/${pm + fm}) ===`);
process.exit(fail ? 1 : 0);
