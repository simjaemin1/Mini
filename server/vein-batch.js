'use strict';
// === server/vein-batch.js — 광맥 장부 모아 쓰기 [T735 · 2026-10-14] ============================================
//
// ★왜: T724(채굴 행위 층 · 10-14 켬 기본) 회부 3 — 광부 몸이 칠 때마다 존의 광맥 장부(`minedCells`)가 **한 줄씩 DB 에 쓴다**
//   (`_oreSave` → `upsertMinedCell` · 자동 커밋 한 번). 실측 한 번 치기 155 µs(`t724us` · 1,315번) — 광부 몸이 수십이면 결정 문에 초당 수 ms.
// ★무엇: 손잡이 `T735_VEIN_BATCH=1`(기본 끔 = 종전 글자 그대로 — 이 모듈을 안 부른다).
//   **메모리 장부는 칠 때마다 그대로 깎는다**(값 · 차례 · 리젠 적분 무변 — 세계가 읽는 것은 메모리다).
//   DB 는 **더러워진 셀만** 모아 두었다가 한 트랜잭션으로 쓴다 — 언제: 이미 있는 저장 주기(`SAVE_INTERVAL_MS` · 사람 주기 저장의 그 수)와
//   종료 flush(SIGTERM · T728 경계 저장 뒤). 쓰는 값은 **쓰는 순간의 메모리 행**이다(셀이 지워졌으면 행도 지운다) ⇒ 저장 뒤 DB = 메모리.
// ★크래시(SIGKILL)에 잃는 몫 = 마지막 쓰기 뒤에 친 몫(저장 주기 하나 안 · 메모리가 DB 보다 앞서 있던 셀들). 소멸 · 생성 0 은 부르는 쪽 규약이다:
//   플레이어 1타가 **덩이를 떨군 순간**(재고가 깎인 순간 — 손 · 몸 저장이 같은 순간 central 로 간다)은 부르는 쪽이 `now` 로 바로 쓴다.
//   모으는 것은 덩이를 떨구지 않은 타수 진척(rec.w)과 몸 없는 손(광부 몸 · 일괄 — 그 손 · 곳간도 경계 저장 전에는 영속이 아니다)뿐이다.
// 새 수 0.

function create(opts) {
  const db = opts.db, map = opts.map;
  const dirty = new Set();
  const S = { marks: 0, flushes: 0, rows: 0, upserts: 0, deletes: 0, ms: 0, msMax: 0, now: 0, last: 0, fail: 0, why: {} };
  function mark(key) { dirty.add(key); S.marks++; }
  function size() { return dirty.size; }
  // 더러워진 셀 전부를 한 트랜잭션으로 — 쓰는 순간의 메모리 행 그대로(없으면 지운다).
  function flush(why) {
    if (!dirty.size) return 0;
    const t0 = process.hrtime.bigint();
    let n = 0;
    try {
      db.db.exec('BEGIN');
      for (const key of dirty) {
        const rec = map.get(key);
        if (rec) { db.upsertMinedCell(key, rec.s, rec.t, rec.w, rec.kg || 0); S.upserts++; }
        else { db.deleteMinedCell(key); S.deletes++; }
        n++;
      }
      db.db.exec('COMMIT');
    } catch (e) {
      try { db.db.exec('ROLLBACK'); } catch (_) { }
      S.fail++;
      return -1;   // 더러운 셀은 그대로 둔다 — 다음 주기에 다시 쓴다(잃지 않는다)
    }
    dirty.clear();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    S.flushes++; S.rows += n; S.ms += ms; if (ms > S.msMax) S.msMax = ms; S.last = Date.now();
    if (why) S.why[why] = (S.why[why] || 0) + 1;
    return n;
  }
  // 바로 쓰기(덩이가 떨어진 플레이어 1타 등) — 그 셀만 · 종전 두 줄 그대로
  function now(key) {
    const rec = map.get(key);
    if (rec) db.upsertMinedCell(key, rec.s, rec.t, rec.w, rec.kg || 0); else db.deleteMinedCell(key);
    dirty.delete(key); S.now++;
  }
  function stats() { return Object.assign({ dirty: dirty.size }, S, { ms: +S.ms.toFixed(3), msMax: +S.msMax.toFixed(3), why: Object.assign({}, S.why) }); }
  return { mark, flush, now, size, stats };
}

module.exports = { create };
