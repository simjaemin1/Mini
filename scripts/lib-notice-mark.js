'use strict';
// (@regress 없음 — 러너 밖 · e2e 공용 자 · 제품 무변)
// === scripts/lib-notice-mark.js — "마지막 알림 N줄" 대신 표지 뒤 알림 (T1367 · T1339 회부 1) ==========================================
//
// ★왜: e2e 여럿이 "고정 sleep 뒤 `window.__notices.slice(-N)`"으로 판정했다. 상자가 붐비면 ⓐ 답이 sleep 보다 늦게 와서 빨강,
//   ⓑ 그 사이 다른 알림 N줄이 밀어내 빨강, ⓒ 앞 판이 남긴 같은 글자를 읽어 초록(낡은 알림)이 났다. T1339 가 `e2e-events` 둘에
//   한 꼴(진단 배열에 표지 한 칸 → 그 뒤에 온 알림만 · 조건 기다림)을 이 자 하나로 모은다(사본 0).
// ★표지: `window.__notices`(클라 `50-i-panel.js` — 글자만 · 40칸 고리)에 `__nm:<n>` 한 칸을 넣는다. 화면 무변(배열은 진단용).
//   표지 뒤 = 표지 다음 칸부터. 표지가 40칸 고리에서 밀려났거나 배열이 비워졌으면 **남은 것 전부가 표지 뒤**다(고리는 앞에서만 빠진다).
//   돌려줄 때 표지 칸(`__nm:`)은 뺀다.
// ★기다림: `waitSince(page, tag, test, {capMs})` — 표지 뒤 알림이 조건을 세울 때까지(상한은 안전망 · 판정은 부른 쪽이 그대로 연다).
//   없음을 재는 자리(거절 알림이 **없다**)는 기다림으로 바꾸지 않는다 — 종전 sleep 그대로 두고 `since` 로 **표지 뒤 전부**를 본다(N줄 자름 0 = 더 엄함).
// 쓰는 법:
//   const NM = require('./lib-notice-mark');
//   const t = await NM.mark(page); await send(...);
//   const r = await NM.waitSince(page, t, (l) => l.some((x) => /놓쳤습니다/.test(x)), { capMs: 15000 });
//   ok(r.hit, '…', JSON.stringify(r.list.slice(-1)));
const PREFIX = '__nm:';
let _seq = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mark(page) {
  const tag = PREFIX + (++_seq);
  await page.evaluate((t) => { (window.__notices = window.__notices || []).push(t); }, tag);
  return tag;
}
async function since(page, tag) {
  return page.evaluate(([t, P]) => {
    const a = window.__notices || []; const i = a.lastIndexOf(t);
    return (i >= 0 ? a.slice(i + 1) : a.slice()).filter((x) => !String(x).startsWith(P));
  }, [tag, PREFIX]);
}
async function waitSince(page, tag, test, o) {
  o = o || {};
  const capMs = o.capMs != null ? o.capMs : 15000, pollMs = o.pollMs != null ? o.pollMs : 200;
  const t0 = Date.now();
  for (;;) {
    const list = await since(page, tag);
    if (test(list)) return { hit: true, list, ms: Date.now() - t0 };
    if (Date.now() - t0 >= capMs) return { hit: false, list, ms: Date.now() - t0 };
    await sleep(pollMs);
  }
}
//   조건이 "글자 하나가 맞는 줄"일 때 — 그 줄(마지막)을 돌려준다(없으면 '')
async function waitLine(page, tag, re, o) {
  const r = await waitSince(page, tag, (l) => l.some((x) => re.test(x)), o);
  const m = r.list.filter((x) => re.test(x));
  return Object.assign(r, { line: m.length ? m[m.length - 1] : '' });
}
module.exports = { mark, since, waitSince, waitLine, PREFIX };
