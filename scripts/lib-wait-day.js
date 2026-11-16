'use strict';
// (@regress 없음 — 러너 밖 · 공용 자 · 제품 무변)
// === scripts/lib-wait-day.js — 게임일 기다림 문 하나 (T1339 · T1328 회부 4) ============================================
//
// ★왜: e2e 몇이 "벽시계로 N초 기다린 뒤 게임일이 지났나"를 물었다(`e2e-rumor` ⑦a · ⑦d2 · `e2e-winter` ③ …). 상자가 붐비면(전수 8시간 · 2코어)
//   같은 N초에 게임일이 덜 가서 혼자 초록 · 전수 빨강이 났다(T1328 전수 — 빨강 7 중 넷). 흔들리는 빨강은 진짜 빨강을 가린다.
// ★이 문 — "게임일이 D 에 닿을 때까지" 기다린다. 벽시계 상한은 **안전망**이다:
//   · 닿음(`reached`) — 판정은 종전 그대로 연다.
//   · 느림(`slow`) — 상한에 닿았는데 게임일은 그동안 앞으로 갔다 = 상자가 느린 판. 그 판정은 **빨강이 아니라 유보**다(`yubo` 줄 · RC `YUBO_RC`).
//   · 멈춤(`stalled`) — `stallMs` 동안 게임일이 한 칸도 안 갔다(본문이 날을 얼렸다 푸는 판은 `bodyPauses: true` — 본문 시간은 멈춤 셈 밖) = 멈춘 시계.
//     이건 판이 느린 게 아니라 결함이다 — **빨강**.
// ★RC: 빨강이 하나라도 있으면 1 · 빨강 0 이고 유보가 있으면 `YUBO_RC`(75) · 둘 다 0 이면 0 — `rc(fail)` 하나로 낸다.
//   러너(`run-regress.sh`)는 75 를 "⚠ RC=75 · 유보"로 따로 센다(실패 목록 밖 · 통과 목록 밖) — `nightly-report.js` 도 같은 줄을 유보로 읽는다.
// 쓰는 법:
//   const WD = require('./lib-wait-day');
//   const r = await WD.waitDay(() => gameDay(), d0 + 10, { capMs: 120000, body: async (d) => { … }, until: () => found });
//     (`until` — 조건이 먼저 서면 닿음 · 목표 날은 "이 날까지 안 서면 빨강"의 날 · 그 전에 벽시계 상한이면 유보)
//   WD.judge(ok, r, cond, '③ 전제: …', detail)   // cond 참 = 통과 · 거짓이면 r 이 느림 = 유보 · 아니면 빨강(멈춤이면 그 이름을 붙인다)
//   process.exit(WD.rc(fail))
const http = require('http');
const YUBO_RC = 75;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const _yubo = [];

//   존 `/perf` 의 econ 날(`econTick.last.day` — 하루 마감이 끝난 `state.world.day` · 클라 `__evGameDay` 와 같은 시계).
//   몸이 없는 동안(창을 닫은 부재 판)에도 게임일을 읽는 길 — 안 문(루프백)만 연다.
function perfDay(port, host) {
  return new Promise((res) => {
    const rq = http.get({ host: host || '127.0.0.1', port, path: '/perf', timeout: 5000 }, (rs) => {
      let b = ''; rs.setEncoding('utf8'); rs.on('data', (c) => { b += c; });
      rs.on('end', () => { try { const j = JSON.parse(b); const d = j && j.econTick && j.econTick.last ? j.econTick.last.day : null; res(Number.isFinite(d) ? d : null); } catch (e) { res(null); } });
    });
    rq.on('timeout', () => { rq.destroy(); res(null); });
    rq.on('error', () => res(null));
  });
}

async function waitDay(readDay, target, o) {
  o = o || {};
  const capMs = o.capMs != null ? o.capMs : 120000, pollMs = o.pollMs != null ? o.pollMs : 250, stallMs = o.stallMs != null ? o.stallMs : 30000;
  const valid = o.valid || ((d) => Number.isFinite(d) && d > 0);   // 0 = 아직 틱을 못 받음(e2e `gameDay` 꼴) — 날로 안 친다
  const t0 = Date.now();
  let d0 = null, day = null, moveAt = t0, polls = 0, bodyMs = 0;
  const out = (state) => {
    const ms = Date.now() - t0, gone = (d0 != null && day != null) ? day - d0 : 0;
    return { state, reached: state === 'reached', slow: state === 'slow', stalled: state === 'stalled', d0, day, target, ms, bodyMs, polls,
      rate: ms > 0 ? +(gone / (((o.bodyPauses ? ms - bodyMs : ms) / 1000) || 1)).toFixed(3) : null };
  };
  for (;;) {
    let d = null; try { d = await readDay(); } catch (e) { d = null; }
    polls++;
    if (valid(d)) { if (d0 == null) d0 = d; if (day == null || d > day) { day = d; moveAt = Date.now(); } }
    if (o.body) { const b0 = Date.now(); await o.body(day); const bm = Date.now() - b0; bodyMs += bm; if (o.bodyPauses) moveAt += bm; }   // `bodyPauses` = 본문이 날을 얼렸다 푼다(그 시간은 멈춤 셈 밖)
    if ((day != null && day >= target) || (o.until && o.until())) return out('reached');   // `until` = 날 말고 조건으로 닿음(본문이 세운 값)
    const now = Date.now();
    if (now - moveAt >= stallMs) return out('stalled');
    if (now - t0 >= capMs) return out((d0 != null && day > d0) ? 'slow' : 'stalled');
    await sleep(pollMs);
  }
}

//   얼린 뒤 날이 가라앉기를 기다린다 — 얼림이 닿기 전에 연 하루 마감은 얼려도 끝까지 돈다(villages 하루 일 목록 · 마감은 틱을 나눠 돈다).
//   붐비는 판에선 그 마감이 얼림 응답보다 늦게 끝나 "언 뒤에 하루가 갔다"로 보인다 — `quietMs` 동안 날이 그대로면 그 날을 돌려준다(상한 `capMs` · 판정 0).
async function settleDay(readDay, quietMs, capMs) {
  quietMs = quietMs || 1500; capMs = capMs || 15000;
  const t0 = Date.now(); let d = null, at = t0;
  for (;;) {
    let x = null; try { x = await readDay(); } catch (e) { x = null; }
    if (x !== d) { d = x; at = Date.now(); }
    if (Date.now() - at >= quietMs || Date.now() - t0 >= capMs) return d;
    await sleep(100);
  }
}
function desc(r) {
  if (!r) return '';
  return `게임일 ${r.d0} → ${r.day}(목표 ${r.target}) · ${(r.ms / 1000).toFixed(1)}초(본문 ${(r.bodyMs / 1000).toFixed(1)}초) · ${r.rate}일/초 · ${r.state}`;
}
function yubo(msg, detail) {
  _yubo.push(msg);
  console.log('  ⚠ 유보 — ' + msg + (detail != null && detail !== '' ? '  ' + detail : ''));
}
//   판정 하나 — 조건이 서면 통과 · 안 서면: 판이 느렸으면(r.slow) 유보 · 아니면 빨강(멈춘 시계면 그 이름을 덧붙인다)
function judge(ok, r, cond, msg, detail) {
  const d = detail == null ? '' : String(detail);
  if (cond) return ok(true, msg, d);
  if (r && r.slow) return yubo(msg, `${d} · 판이 느림(빨강 아님) — ${desc(r)}`);
  return ok(false, msg, `${d}${r && r.stalled ? ' · ★멈춘 시계 — ' + desc(r) : ''}`);
}
function count() { return _yubo.length; }
function rc(fail) {
  if (_yubo.length) console.log(`  (유보 ${_yubo.length} — 느린 판 · 기계 의존(게임일 상한 · 같은 조건 잡음 안) · 빨강 아님 · RC ${YUBO_RC}${fail ? ' — 빨강이 있어 RC 1' : ''})`);
  return fail ? 1 : (_yubo.length ? YUBO_RC : 0);
}
module.exports = { waitDay, settleDay, perfDay, judge, yubo, desc, rc, count, YUBO_RC };
