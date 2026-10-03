'use strict';
// === scripts/t577-server-hook.js — 서버 판 자(`t577-server-run.js`)의 프리로드 ================
//
// ★★[T577 2026-10-03] 제품을 한 글자도 안 고치고 **실서버 호스트**를 재는 자리.
//   `node -r scripts/t577-server-hook.js server/zone.js` 로만 쓴다(부르는 쪽이 env 를 준다).
//   하는 일 셋 — 전부 이미 있는 문 앞에 서서 읽는다:
//   ① econ 시드 — `econV2.createWorldV2` 의 `seed` 한 칸만 바꾼다(t17 이 시드를 바꾸는 그 자리 · 지도·소굴·전쟁 시드는 그대로).
//   ② 하루 관측 — 서버 장부(`Events.createLedger`)의 `scanDay(world, day)` 가 받는 그 world 로 마을마다
//      [인구 · 해체 표 · 죽음 누계 · 행상 피살 누계] 한 줄. 장부는 econ 하루 끝에 불린다(서버 하루 마감과 같은 순간).
//   ③ 끝 — `T577_DAYS` 에 닿으면 여덟 수(t17 ⓚ 와 같은 이름 · 같은 합) + 해체 · 빈 마을 · 첫 빈 날 · 도적 누계를 JSON 으로 쓰고 나간다.
//   ⚠관측은 세계에 아무것도 안 쓴다(읽기만) — 시드 한 칸이 유일한 개입이고, 그건 시드가 원래 하는 일이다.
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

const SEED = parseInt(process.env.T577_SEED || '', 10) || 0;
const DAYS = parseInt(process.env.T577_DAYS || '', 10) || 800;
const OUT = process.env.T577_OUT || '';

const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
if (SEED) {
  const cw = V2.createWorldV2;
  V2.createWorldV2 = function (opts) { return cw.call(this, Object.assign({}, opts || {}, { seed: SEED })); };
}

const Ev = require(path.join(ROOT, 'server', 'events'));
const mk = Ev.createLedger;
let names = null;
const rows = [];   // [day, npcs[], banditized[], deadTot[], tradersKilled[]]
let done = false;
let diag365 = null;

function finish(world, L, day) {
  if (done) return; done = true;
  const V = world.villages;
  // ── 여덟 수 — t17 ⓚ 와 **같은 이름 · 같은 합**(계측기 두 벌이 같은 칸을 같은 식으로 센다)
  let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0, toolQ = 0;
  for (const v of V) {
    const n = (v.npcs || []).length; pop += n;
    if (v._everPop) ever++;
    if (v._everPop && n <= 0) dead++;
    weapQ += ((v.storage && v.storage.weapon) || 0) * (v._weapQ != null ? v._weapQ : 1);
    expand += v.expansions || 0;
    toolQ += ((v.storage && v.storage.tool) || 0) * (v._toolQ != null ? v._toolQ : 1);
  }
  const stockOf = (r) => V.reduce((a, v) => a + ((v.storage && v.storage[r]) || 0), 0);
  const presStock = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'].reduce((a, r) => a + stockOf(r), 0);
  const grain = ['wheat', 'rice', 'barley', 'millet'].reduce((a, r) => a + stockOf(r), 0);
  const S = (L && L.stats) || {};
  // ── 해체 · 빈 마을 · 첫 빈 날(관측 줄에서)
  const firstOf = (pred) => names.map((_, i) => { for (const r of rows) if (pred(r, i)) return r[0]; return null; });
  const bdtDay = firstOf((r, i) => r[2][i] === 1);
  const emptyDay = names.map((_, i) => { let had = false; for (const r of rows) { if (r[1][i] > 0) had = true; else if (had) return r[0]; } return null; });
  let B = null; try { B = require(path.join(ROOT, 'server', 'bandits')).stats(); } catch (e) { B = null; }
  // ★[T590] 줄어든 몸 — 까닭별(그 자리 죽음 · 걸어 나감 · 그 밖) · 누운 몸 · 걷는 몸 · 순간 소멸(읽기만 · 몸 층 계수기)
  let BX = null; try { const V = require(path.join(ROOT, 'server', 'villages')); BX = V.bodyExitStats ? V.bodyExitStats() : null; } catch (e) { BX = null; }
  const out = {
    seed: SEED || null, days: day, villages: V.length,
    env: { T315_MAPBEDS: process.env.T315_MAPBEDS || null, VILLAGE_DAY_MS: process.env.VILLAGE_DAY_MS || null,
           VILLAGE_NPC_CAP: process.env.VILLAGE_NPC_CAP || null, ENABLE_BANDITS: process.env.ENABLE_BANDITS || null,
           cand: Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(T577_(?!SEED$|DAYS$|OUT$|DIR$|PAR$|TAG$)|VILLAGE_LIFE$|ENABLE_BANDITS$|VILLAGE_CARAVAN_MAX$|T513_DAY_SLICE$|WAR_MINDAY$)/.test(k))) },
    eight: { pop, dead, ever, weapQ: +weapQ.toFixed(0), expand, board: S.reqOpened || 0,
             toolQ: +toolQ.toFixed(1), preserve: +presStock.toFixed(1), grain: +grain.toFixed(1) },
    dissolved: bdtDay.filter((x) => x != null).length,
    empty: 0,   // 아래에서 끝 날 기준으로 센다
    firstEmpty: emptyDay.filter((x) => x != null).sort((a, b) => a - b)[0] ?? null,
    deadTot: V.reduce((a, v) => a + (v._deadTot || 0), 0),
    tradersKilled: V.reduce((a, v) => a + ((v.tradeStats && v.tradeStats.tradersKilled) || 0), 0),
    bandit: B ? { conv: B.conv, exo: B.exo, starve: B.starve, disband: B.disband, denForm: B.denForm, loot: B.loot, peak: B.peak } : null,
    bodyExit: BX,
    names, bdtDay, emptyDay,
    seedPop: rows.length ? rows[0][1] : null,
    diag365,
    rows,
  };
  // 빈 마을 수는 **끝 날 인구 0** 인 마을(한 번 비었다 다시 사람이 찬 곳은 빼고 센다)
  out.empty = names.filter((_, i) => rows[rows.length - 1][1][i] === 0 && V[i]._everPop).length;
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(out));
  process.exit(0);
}

Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    const r = sd.apply(this, arguments);
    try {
      const V = world.villages;
      if (!names) names = V.map((v) => v.name);
      rows.push([day | 0, V.map((v) => (v.npcs || []).length), V.map((v) => (v._banditized ? 1 : 0)),
        V.map((v) => v._deadTot || 0), V.map((v) => (v.tradeStats && v.tradeStats.tradersKilled) || 0)]);
      // ★d365 단면 — 보호기 끝 그날 마을마다 [인구 · 주거 · K · 허기 항 · 비옥 · 물 · 확장 · 확장 게이트에 닿았나(`_expandMBMC`)]
      //   (보고 §3-ⓒ "왜 확장 0 인가"의 재료 — 읽기만)
      if ((day | 0) === 365 && !diag365) diag365 = V.map((v) => ({ name: v.name, n: (v.npcs || []).length, housing: +(v.housing || 0).toFixed(1),
        K: v._dpDebug ? v._dpDebug.K : null, hunger: v._dpDebug ? v._dpDebug.hunger : null,
        fert: v.land ? v.land.fertility : null, water: v.land ? v.land.water : null, size: v.land ? +(+v.land.size).toFixed(1) : null,
        expand: v.expansions || 0, mbmc: !!v._expandMBMC }));
      if ((day | 0) >= DAYS) finish(world, L, day | 0);
    } catch (e) { console.error('[t577-hook] 관측 실패:', e.message); }
    return r;
  };
  return L;
};
