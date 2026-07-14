// sim/caravan-battle.js — 캐러밴 약탈 전투를 battle-core로 해결(병종·대형·사기).
//   기존 flat 스크럼(hp100·atk=10+무기×0.2·병종X) → 전쟁과 같은 급의 병종 전투.
//   호위 = 창병(spear, 마을 전사) + 궁수(archer, 활 든 사냥꾼) + 상인(militia 1) 원형 방어(캐러밴 라거).
//   도적 = 석검(dagger) 산개 접근. battle-core가 사격·방패벽·사기붕괴·궤주를 결정.
//   ★econ 무접촉: 순수 계산. 결과(repelled/화물손실)만 호출측이 econ에 반영.
'use strict';
const BC = require('./battle-core.js');
function mkRng(s) { s = (s >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// resolveRaid — 호위 병종 구성 vs 도적. battle-core 인스턴스 1회전.
//   spear/archer = 호위 병종 수 · banditN = 도적 수 · weapQ = 마을 무기품질(호위 atk 배수)
//   반환: { repelled, win, escStart, escAlive, traderAlive, banditStart, banditAlive, ticks }
function resolveRaid({ spear = 0, archer = 0, banditN = 6, weapQ = 0.5, banditWeapQ = 0.46, seed = 1, dt = 0.1, maxT = 6000 } = {}) {
  const spec = {
    A: { spear, archer, form: 'circle' },   // 호위 원형 방어(창병 외곽·궁수 내부). 상인은 비전투 — 호위 격퇴 시 안전
    B: { dagger: Math.max(1, banditN | 0), form: 'line' },
    terrain: 'plain',
    quality: { A: { weapQ }, B: { weapQ: banditWeapQ } },
  };
  const h = BC.createBattle(spec, { rng: mkRng(seed) });
  let t = 0;
  for (; t < maxT && !h.result; t++) h.step(dt);
  const A = h.units.filter(u => u.side === 'A'), B = h.units.filter(u => u.side === 'B');
  const escAlive = A.filter(u => u.hp > 0).length;
  const banditAlive = B.filter(u => u.hp > 0).length;
  const win = (h.result && h.result.win) || '무';
  const repelled = win === 'A';
  return { repelled, win, escStart: spear + archer, escAlive, traderAlive: repelled, banditStart: Math.max(1, banditN | 0), banditAlive, ticks: t };
}

module.exports = { resolveRaid };
