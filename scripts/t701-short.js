// (@regress 없음 — 러너 밖 · T701 관찰자 · 제품 무변)
// === scripts/t701-short.js — "통나무가 모자라 못 한 일" 하루 장부(서버 판 T650 자의 아이 존에 얹는다) ==========
//   쓰는 법:
//     NODE_OPTIONS="--require $PWD/scripts/t701-short.js" VILLAGE_CARAVAN_MAX=0 T400_BUILD_ACT=0 T577_DIR=<dir> T577_TAG=<팔> \
//       node scripts/t577-server-run.js 400 1020,7,42
//     ⇒ 판마다 `<T577_OUT>.t701.jsonl` — econ 하루 한 줄(장부 `scanDay` 문 · 원래 함수를 부르기 **전**)
//   ★못 한 일 넷 — 전부 econ 이 그날 **스스로 견주는 그 비교**를 읽는다(새 셈 0 · 새 문턱 0):
//     · 땔감 못 땜 — `v._fuelCov < 1`(econ `tickVillage` 가 그날 적는 연료 충족률: (짚 + 하급 연료 + 통나무) ÷ 연료 수요.
//                   통나무가 곳간에 남아 있으면 모자란 몫을 다 통나무로 채우므로 1 미만 = 그날 통나무가 바닥났다)
//     · 집 못 섬   — 집 짓는 자리(`tickVillage` 의 `built = min(houseDayBuild(…), 통나무 ÷ 집 단가)`)에서 **통나무 쪽이 작았다**.
//                   `houseDayBuild` 를 감싸 그 자리(부른 함수 `tickVillage`)에서만 같은 두 값을 견준다(생활층 크루 마을 `buildActOn` 은 뺀다 — 통나무 제약이 크루에 있다)
//     · 노 못 땜   — econ 이 적는 누계 `_smeltShort`(연료가 원하는 만큼 못 댐) · `_smeltNoFuel`(하나도 못 댐)의 그날 증분(`smeltFuelTake`)
//     · 숯가마 못 섬 — `kilnDay` 를 감싸 부르기 직전에 같은 문을 읽는다: 가마가 있고 숯이 목표 밑(`furnaceCharcoalTarget`)인데
//                   통나무 잉여(`woodSpare`)가 한 번 굽기(`CHARCOAL_KILN_WOOD`)에 못 미침 · 가마가 없고 지을 뜻(`kilnWant`)이 있는데 통나무가 짓는 재료(`kilnBuildCost`)에 못 미침
//     · 땔감 못 땐 사람-날 — 그날 못 땐 마을의 인구 × (1 − `_fuelCov`)(깊이 · 같은 값에서)
//   ★종전 자도 같은 줄에: 0 마을(사람 있는 마을 중 곳간 통나무 0 · `< 1`) · 인구.
//   ★읽기만 한다 — 감싼 함수는 같은 인수로 원래 함수를 부르고 그 값을 그대로 돌려준다. 먼저 부르는 읽기 함수(`woodSpare` 등)는 v 에 쓰지 않는다.
'use strict';
const OUT0 = process.env.T577_OUT || '';
if (OUT0) {
  const path = require('path');
  const fs = require('fs');
  const Module = require('module');
  const OUT = OUT0 + '.t701.jsonl';
  try { fs.unlinkSync(OUT); } catch (e) {}
  const isEcon = (f) => /[\\/]sim[\\/]economy-sim\.js$/.test(f);
  const _load = Module._extensions['.js'];
  const TAIL = `
;(function () {
  const _hdb = houseDayBuild;
  houseDayBuild = function (v, N, fe) {
    const r = _hdb(v, N, fe);
    try {
      if (r > 0 && v && v.storage && !buildActOn(v)) {
        const st = String(new Error().stack || '').split('\\n')[2] || '';
        if (/tickVillage/.test(st)) {
          const hw = T400_BUILD_ACT ? houseCostPerCap('wood') : HOUSE_WOOD;
          if (r > (v.storage.wood || 0) / hw) globalThis.__t701mark(v, 'h');
        }
      }
    } catch (e) {}
    return r;
  };
  const _kd = kilnDay;
  kilnDay = function (v) {
    try {
      const S = _smeltUses();
      if (S && v && v.storage) {
        if (v._kiln) {
          const gap = furnaceCharcoalTarget(v) - (v.storage.charcoal || 0);
          if (gap > 0 && !(woodSpare(v) >= S.CHARCOAL_KILN_WOOD)) globalThis.__t701mark(v, 'k');
        } else if (kilnWant(v)) {
          const c = S.kilnBuildCost();
          if ((v.storage.wood || 0) < (c.wood || 0)) globalThis.__t701mark(v, 'k');
        }
      }
    } catch (e) {}
    return _kd(v);
  };
})();
`;
  Module._extensions['.js'] = function (m, filename) {
    if (isEcon(filename)) return m._compile(fs.readFileSync(filename, 'utf8') + '\n' + TAIL, filename);
    return _load(m, filename);
  };
  const marks = new WeakMap();   // 마을 객체에 칸을 달지 않는다(저장·키 순회에 안 섞이게)
  globalThis.__t701mark = (v, k) => { let o = marks.get(v); if (!o) { o = {}; marks.set(v, o); } o[k] = 1; };
  const prevSm = new Map();
  let last = -1;
  const Ev = require(path.join(process.cwd(), 'server', 'events'));   // 아이 존의 cwd = 그 판 작업 트리(t577 자가 cwd: ROOT 로 띄운다) — 어느 트리에 붙여도 그 트리의 장부
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last) {
          last = d;
          let live = 0, pop = 0, z0 = 0, z1 = 0, fuel = 0, fuelPd = 0, house = 0, smelt = 0, kiln = 0, any = 0, ev = 0;
          for (const v of (world.villages || [])) {
            const n = (v.npcs || []).length, w = (v.storage && v.storage.wood) || 0;
            const sm = (v._smeltShort || 0) + (v._smeltNoFuel || 0), p = prevSm.has(v.name) ? prevSm.get(v.name) : sm;
            prevSm.set(v.name, sm);
            const f = (n > 0 && v._fuelCov != null && v._fuelCov < 1) ? 1 : 0;
            const mo = marks.get(v) || {}; marks.delete(v);
            const h = mo.h ? 1 : 0, s = sm > p ? 1 : 0, k = mo.k ? 1 : 0;
            pop += n;
            if (n > 0) { live++; if (!(w > 0)) z0++; if (w < 1) z1++; }
            if (f) fuelPd += n * (1 - v._fuelCov);   // 땔감 못 땐 사람-날(인구 × 모자란 몫 — econ 이 적은 충족률 그대로)
            fuel += f; house += h; smelt += s; kiln += k; ev += f + h + s + k; if (f || h || s || k) any++;
          }
          fs.appendFileSync(OUT, JSON.stringify({ d, live, pop, z0, z1, fuel, fuelPd: Math.round(fuelPd * 10) / 10, house, smelt, kiln, any, ev }) + '\n');
        }
      } catch (e) { /* 관찰 실패는 세계에 아무것도 안 한다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
}
