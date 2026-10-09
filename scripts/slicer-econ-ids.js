'use strict';
// === scripts/slicer-econ-ids.js — `test-tick-slicer` ⑨ 의 증인(존에 `--require` 로 싣는다 · 제품 무접촉) [T645 · 2026-10-04] =========
//
// ★왜: ⑨ "켬이 econ 을 마을 수만큼 더 나눴다" 를 종전엔 **조각 수**(`chunks ≥ 되돌림 + 마을 수`)로 봤다.
//   조각 수엔 생활층(T523)·캐러밴(T85)의 `'retry'` 조각이 들어 있고, 그 수는 **예산 안에 몇 번 끊겼나 = 시간**이 정한다
//   ⇒ main 그대로 혼자 돌려도 379 ↔ 400(문턱 429) 으로 빨강·초록이 갈렸다(T645 카드).
//   뜻("econ 이 마을 경계에서 나뉘었나")은 시간과 무관하다 — **econ 정본 조각의 마을 칸(`P.village(v)`)이 하루에 몇 번 · 어느 마을로 따로 불렸나** 를 본다.
// ★어떻게: `sim/economy-sim-v2` 의 `tickWorldV2Parts` 를 적재 순간 감싼다(값은 그대로 · 부른 마을 이름만 적는다).
//   `tail()` 이 불리는 순간(그날 econ 마감) 한 줄을 `SLICER_ECON_OUT` 에 덧붙인다: `{day, vil: 따로 불린 마을 수, ids: 이름 해시}`.
//   되돌림(`T513_DAY_SLICE=0`)은 `tickWorldV2Parts` 를 안 부른다 → 줄 0(= 마을 칸 조각 0).
const fs = require('fs');
const crypto = require('crypto');
const Module = require('module');
const OUT = process.env.SLICER_ECON_OUT || '';
const _load = Module._load;
let done = false;
Module._load = function (request, parent, isMain) {
  const m = _load.apply(this, arguments);
  if (!done && /economy-sim-v2(\.js)?$/.test(String(request)) && m && typeof m.tickWorldV2Parts === 'function') {
    done = true;
    const orig = m.tickWorldV2Parts;
    m.tickWorldV2Parts = function (world) {
      const P = orig.apply(this, arguments);
      const seen = []; let calls = 0;
      const v0 = P.village, t0 = P.tail;
      //   ★[T665] 미끼 — `SLICER_BAIT=skip-trade` 이면 이 팔의 econ 정본 조각에서 교역 단계를 빼먹는다(조각내기가 일을 빠뜨린 꼴).
      //     ⑧ 의 경제 크기 판정이 이걸 못 잡으면 그 판정은 아무것도 못 지킨다(하네스가 그 팔에만 준다 · 기본 무동작).
      if (process.env.SLICER_BAIT === 'skip-trade') P.trade = function () {};
      P.village = function (v) { calls++; seen.push(String(v && (v.name || v.id))); return v0.apply(this, arguments); };
      P.tail = function () {
        const r = t0.apply(this, arguments);
        if (OUT) { try { const ids = [...new Set(seen)].sort(); fs.appendFileSync(OUT, JSON.stringify({ day: world && world.day, calls, vil: ids.length, ids: crypto.createHash('sha1').update(ids.join('|')).digest('hex').slice(0, 12) }) + '\n'); } catch (e) {} }
        return r;
      };
      return P;
    };
  }
  return m;
};
