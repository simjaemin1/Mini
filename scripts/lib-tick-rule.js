// === scripts/lib-tick-rule.js — **틱 자의 규약**의 코드 쪽 (T433 ②) ==========================================
//   정본 문서: `인계/Z-존서버.md` 절 "틱 자의 규약"(ⓐ~ⓔ). 여기엔 **자가 같이 쓰는 두 조각**만 둔다(사본 0):
//   ⓐ 부팅 뒤 **첫 하루 경계 뒤**부터 잰다 — 틀 DB 존은 그 경계에서 틱이 한 칸 오른다(T410 §2-⓪ · 틀 존 +49 %).
//      경계 = 세계 phase 가 1 → 0 으로 넘어가는 순간(실제 날 길이에선 마을 하루 경계와 같은 순간 · 둘 다 1,440,000ms).
//   ⓔ 사람당 µs 의 **분모가 어느 명부인가**를 값 옆에 적는다 — 명부가 둘이다:
//      `npcs.size`(존의 NPC 몸 전부 — 도적·캐러밴 포함) ↔ `/lifedbg totals.pop`(마을 명부 Σ`npcPids`). 같은 판에서 1,651 ↔ 1,642.
'use strict';
const DENOM = { npcs: '분모 = npcs.size(존의 NPC 몸 전부 · 도적·캐러밴 포함)', village: '분모 = /lifedbg totals.pop(마을 명부 Σnpc)' };
// phase 를 물어 **경계를 한 번 넘을 때까지** 기다린다. 경계 = 앞서 본 phase 보다 0.5 넘게 작아진 순간(1 → 0 넘김).
//   getPhase: async () => number|null · 돌려주는 값: { crossed, phase, waitedMs }
async function waitDayBoundary(getPhase, opts = {}) {
  const pollMs = opts.pollMs || 5000, maxMs = opts.maxMs || (1440000 + 180000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = Date.now(); let hi = null, ph = null;
  for (;;) {
    ph = await getPhase();
    if (ph != null && hi != null && ph + 0.5 < hi) return { crossed: true, phase: ph, waitedMs: Date.now() - t0 };
    if (ph != null) hi = hi == null ? ph : Math.max(hi, ph);
    if (Date.now() - t0 > maxMs) return { crossed: false, phase: ph, waitedMs: Date.now() - t0 };
    await sleep(pollMs);
  }
}
module.exports = { waitDayBoundary, DENOM };
