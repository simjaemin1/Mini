'use strict';
// === scripts/gap-ruler-hook.js — 격차 자(T1101)의 프리로드 — 서버 판 자(`t577-server-run`)의 아이에게 `NODE_OPTIONS=--require` 로 얹힌다 ===
//
// ★제품을 한 글자도 안 고친다. 서버 장부의 하루 끝(`Events.createLedger().scanDay(world, day)` — t577 훅이 서는 그 문)에서
//   마을마다 [인구 · 곳간 식량 등가 · 행복 · 해체 표]를 읽어 적는다(읽기만).
// ★충격 판(`GAP_SHOCK=1`) — 개입은 한 번 · 한 마을뿐이다:
//   보호기 끝(`GAP_SHOCK_AFTER` · 기본 365 = t577 훅의 d365 단면 그 날) 뒤 **세계가 처음 풍흉을 굴린 날**(어느 마을에 새 `_yearShock` 이 선 날),
//   그날 흉년을 받은 마을의 그 흉년 객체를 **그대로 복사해** 그날 풍흉이 없던 사람 있는 마을 중 인구 가운데 마을 하나에 세운다.
//   ⇒ 흉년의 세기 · 길이는 econ 이 그해 스스로 굴린 그것이다(숫자를 베끼지 않는다 · 새 수 0). 그날 흉년이 아무 데도 안 났으면 다음 풍흉 날을 기다린다.
//   대조 판(`GAP_SHOCK` 없음)도 같은 날 같은 셈으로 고른 마을을 적는다(세우지는 않는다) — 같은 시드면 같은 마을이다(그날까지 같은 세계).
// 출력: `T577_OUT` 옆 `<이름>.gap.json`(프로세스가 나갈 때 — t577 훅이 끝 날에 `process.exit` 한다).
if (!/zone\.js$/.test(process.argv[1] || '')) return;   // 판 자 본체(부모)에도 NODE_OPTIONS 가 얹힌다 — 존 아이에서만 선다
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = (process.env.T577_OUT || '').replace(/\.json$/, '') + '.gap.json';
const SHOCK = process.env.GAP_SHOCK === '1';
const AFTER = parseInt(process.env.GAP_SHOCK_AFTER || '365', 10);
const E1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const D = { names: null, rows: [], shock: null, pick: null, mode: SHOCK ? 'shock' : 'base', seed: parseInt(process.env.T577_SEED || '0', 10) || null };
const prev = new Map();   // 마을 → 어제 본 `_yearShock` 객체(오늘 새로 선 것을 가린다)
const r2 = (x) => Math.round(x * 100) / 100;
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    const r = sd.apply(this, arguments);
    try {
      const V = world.villages, d = day | 0;
      if (!D.names) D.names = V.map((v) => v.name);
      // 오늘 새로 선 풍흉
      const fresh = V.map((v) => { const y = v._yearShock || null; const f = !!(y && prev.get(v) !== y && y.untilDay > d); prev.set(v, y); return f ? y : null; });
      if (!D.pick && d > AFTER && fresh.some((y) => y && /흉년/.test(y.name || ''))) {
        const donor = fresh.findIndex((y) => y && /흉년/.test(y.name || ''));
        const cand = V.map((v, i) => i).filter((i) => !fresh[i] && (V[i].npcs || []).length > 0)
          .sort((a, b) => ((V[a].npcs.length - V[b].npcs.length) || (a - b)));
        if (cand.length) {
          const idx = cand[(cand.length - 1) >> 1];
          const y = fresh[donor];
          D.pick = { idx, day: d, until: y.untilDay, name: y.name, donor: V[donor].name, pop: V[idx].npcs.length };
          if (SHOCK) { V[idx]._yearShock = Object.assign({}, y); prev.set(V[idx], V[idx]._yearShock); D.shock = D.pick; }
        }
      }
      D.rows.push([d, V.map((v) => (v.npcs || []).length), V.map((v) => r2(E1.totalFoodEquivalent(v) || 0)),
        V.map((v) => (v.lastStats && Number.isFinite(v.lastStats.happiness) ? +v.lastStats.happiness.toFixed(3) : null)),
        V.map((v) => (v._banditized ? 1 : 0))]);
    } catch (e) { console.error('[gap-ruler-hook] 관측 실패:', e.message); }
    return r;
  };
  return L;
};
process.on('exit', () => { try { if (OUT && D.names) fs.writeFileSync(OUT, JSON.stringify(D)); } catch (e) {} });
