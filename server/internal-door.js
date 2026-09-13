// === server/internal-door.js — 안 문의 자격 판정 **하나** =======================
//
// ★★[T225 2026-09-13] T217 이 central 에 세운 그 판정을 **존도 써야 한다**(디버그 문 여덟).
//   같은 규칙을 두 파일에 적으면 그게 사본이고, 한쪽이 느슨해지는 날 그게 다음 구멍이다.
//   ⇒ 규칙은 여기 한 곳에 산다. `central.js` 도 `zone.js` 도 이 함수를 부른다.
//
// ★규약 — 문이 둘이다(N-문둘):
//   · 바깥 문(브라우저) : 투영·수(數)만. 남의 것은 안 나간다.
//   · 안  문(존↔central·관측창) : 행 전체·쓰기·내부 상태.
//
// ⚠**비밀이 없으면 되돌이가 아니라 "사설 주소"다.** 배포는 docker 두 통이라 존→central 의
//   출발지가 브리지 사설 IP(172.17.x)다 — 되돌이만 열면 라이브의 저장이 그 자리에서 끊긴다.
// ⚠`x-forwarded-for` 가 붙어 있으면 판단을 **취소**한다 — 프록시 뒤에서는 바깥이 사설로 보인다.
'use strict';
const crypto = require('crypto');

const SECRET = String(process.env.CENTRAL_SECRET || '').trim();
const HEADER = 'x-zone-secret';

function isPrivateAddr(req) {
  let a = String((req && req.socket && req.socket.remoteAddress) || '');
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === '::1' || a.startsWith('127.')) return true;
  if (a.startsWith('10.') || a.startsWith('192.168.')) return true;
  const m = /^172\.(\d+)\./.exec(a);
  if (m) { const n = +m[1]; if (n >= 16 && n <= 31) return true; }   // docker 브리지가 여기 산다
  if (/^f[cd]/i.test(a)) return true;                                // IPv6 ULA
  return false;
}

/** 이 요청이 **안 문**을 지날 자격이 있나. 비밀 값은 어디에도 안 찍는다. */
function isInternal(req) {
  const given = String((req && req.headers && req.headers[HEADER]) || '');
  if (SECRET) {
    if (given.length !== SECRET.length) return false;
    try { return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(SECRET)); } catch (e) { return false; }
  }
  if (req && req.headers && req.headers['x-forwarded-for']) return false;   // 프록시 뒤 — 출발지를 못 믿는다
  return isPrivateAddr(req);
}

/** 바깥에서 온 요청은 **그 문이 있는지도** 모르게 한다(404 · 존재를 안 알린다). */
function denyOutside(res) {
  try { res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'not found' })); }
  catch (e) {}
  return true;
}

module.exports = { isInternal, isPrivateAddr, denyOutside, SECRET_SET: !!SECRET, HEADER };
