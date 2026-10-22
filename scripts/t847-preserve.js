// === scripts/t847-preserve.js — T847 곳간 생선은 말려야 남는다 — 조사 계측(읽기만 · 제품 무접촉) =======================
//
// ★왜 [T847 ② · T803 회부 1] T789 켬(곳간 장부가 상한 레코드를 버린다)에서 버린 생선 · 고기 · 해산물 몫과,
//   그 마을의 보존 가공(econ 요리사 갈무리 — T17 ② · `sim/economy-sim.js` 요리사 블록)이 그 몫을 얼마나 메우나.
//
// 어떻게(세계에 쓰는 것 0):
//   ① `sim/economy-sim.js` 를 **적재할 때 메모리 사본만** 고친다(디스크 무변 · t749-decay 와 같은 문법) — 두 줄:
//      · 갈무리 문턱 `if (totalFoodEquivalent(v) > … ) {` → 같은 식의 값을 관측 훅에 넘기고 그 값을 그대로 돌려받는다(평가 횟수 · 값 무변)
//      · 갈무리 한 걸음 `v.storage[_fr] -= _take; …` 앞에 관측 훅(그 마을 · 들인 칸 · 뗀 양 · 그 칸 잉여 · 남은 손)
//   ② 곳간 장부 `granary-lots.tickBegin`(econ 하루 마감 머리 — T789 켬이면 여기서 버린다)을 감싸 그 앞뒤 econ 칸 차이를 마을 · 칸마다 센다
//      (마감 머리는 켬이면 버림만 칸을 바꾼다 · 끔이면 차이 0).
//   훅은 값을 돌려주지 않거나(②) 받은 값을 그대로 돌려준다(①) — 검산: 이 훅을 단 판의 t17 JSON = 안 단 판(보고 §0).
//
// 쓰는 법(이 문이 t749-decay 보다 **앞**이어야 한다 — t749 가 적재 때 economy-sim.js 를 부른다):
//   NODE_OPTIONS="--require <레포>/scripts/t847-preserve.js --require <레포>/scripts/t749-decay.js" T847_OUT=/tmp/p.json \
//     T749_OUT=/tmp/d.json T749_LEDGER=1 T789_DISCARD=1 node scripts/t17-metrics.js 800 1020
// 결정론 — 새 수 0.
'use strict';
const OUT = process.env.T847_OUT || '';
if (OUT) {
  const Module = require('module'), fs = require('fs'), path = require('path');
  const ROOT = path.join(__dirname, '..');
  const GATE = 'if (totalFoodEquivalent(v) > _N * DAILY_FOOD_CONSUMPTION * (RESERVE_PC.food || 30)) {';
  const STEP = 'v.storage[_fr] -= _take; _cons(v, _fr, _take);';
  const PATCH = [
    [GATE, 'if (globalThis.__T847_G(v, totalFoodEquivalent(v) > _N * DAILY_FOOD_CONSUMPTION * (RESERVE_PC.food || 30), jdef.base * skillMul)) {'],
    [STEP, 'globalThis.__T847_P(v, _fr, _take, _sur, _pBudget); ' + STEP],
  ];
  const prev = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, f) {
    if (path.basename(f) === 'economy-sim.js' && path.basename(path.dirname(f)) === 'sim') {
      const orig = m._compile;
      m._compile = function (c, fn) {
        for (const [a, b] of PATCH) {
          const n = c.split(a).length - 1;
          if (n !== 1) throw new Error(`t847-preserve: 고칠 줄이 ${n}개 — 하나여야 한다(제품이 바뀌었다): ${a}`);
          c = c.replace(a, b);
        }
        return orig.call(this, c, fn);
      };
    }
    return prev(m, f);
  };

  // 마을 → 칸
  const vidx = new Map(); const rows = [];
  const R = (v) => {
    const k = v && v.name != null ? String(v.name) : null; if (k == null) return null;
    let i = vidx.get(k);
    if (i == null) { i = rows.length; vidx.set(k, i); rows.push({ name: k, days: 0, cookDays: 0, gateOpen: 0, budget: 0, used: 0, take: {}, sur: {}, rot: {}, rotDays: 0, rotDaysGateOpen: 0, gateOpenToday: 0, rotToday: 0 }); }
    return rows[i];
  };
  let today = new Set();
  globalThis.__T847_G = function (v, open, budget) {
    const r = R(v); if (r) { r.cookDays++; if (open) { r.gateOpen++; r.budget += budget; r.gateOpenToday = 1; } }
    return open;
  };
  globalThis.__T847_P = function (v, fr, take, sur, left) {
    const r = R(v); if (!r) return;
    r.take[fr] = (r.take[fr] || 0) + take; r.sur[fr] = (r.sur[fr] || 0) + sur; r.used += take;
  };

  // 장부 마감 머리 — 그 앞뒤 칸 차이 = 버림
  const G = require(path.join(ROOT, 'server', 'granary-lots.js'));
  const _tb = G.tickBegin;
  let prevList = null;
  G.tickBegin = function (list) {
    // 어제 하루를 닫는다(어제 버렸고 어제 문턱이 열렸나)
    if (prevList) for (const v of prevList) { const r = R(v); if (!r) continue; if (r.rotToday > 1e-9) { r.rotDays++; if (r.gateOpenToday) r.rotDaysGateOpen++; } r.rotToday = 0; r.gateOpenToday = 0; }
    const snap = [];
    for (const v of (list || [])) { if (!v || !v.storage) continue; const s = {}; for (const k in v.storage) s[k] = +v.storage[k] || 0; snap.push([v, s]); }
    const out = _tb.apply(this, arguments);
    for (const [v, s] of snap) {
      const r = R(v); if (!r) continue; r.days++;
      for (const k in s) { const d = s[k] - (+v.storage[k] || 0); if (d > 1e-12) { r.rot[k] = (r.rot[k] || 0) + d; r.rotToday += d; } }
    }
    prevList = list;
    return out;
  };

  process.on('exit', () => {
    try {
      for (const r of rows) { delete r.gateOpenToday; delete r.rotToday; }
      fs.writeFileSync(OUT, JSON.stringify({ meta: { T789: process.env.T789_DISCARD || '', ledger: process.env.T749_LEDGER || '' }, rows }));
    } catch (e) { process.stderr.write('[t847-preserve] 쓰기 실패 ' + e.message + '\n'); }
  });
}
