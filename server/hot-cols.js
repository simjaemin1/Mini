// === server/hot-cols.js — 몸 칸 열(SoA) 첫 걸음 — 걸음 머리 칸 다섯 (T1314 · 2026-11-14) =================================
//
// ★손잡이 `T1314_HOT_COLS` — `'1'` 켬 · `'verify'` 켬 + 틱마다 전원 견줌 · 그 밖(없음 포함) 끔.
//   끔이면 이 모듈은 아무것도 안 만든다(`ON` 거짓 — 부르는 자리가 전부 `ON` 뒤 = 종전 글자 · 종전 값).
// ★무엇 — 주민 몸의 걸음 머리 칸 다섯(`FIELDS` — 결정 문 시각 · 길 번호 · 길 거울 셋)을 열(값 `Float64Array` + 꼴 `Uint8Array`)에도 둔다.
//   ⓐ 몸 번호 = 칸(`p._hcS`) — 낳을 때 받는다(`install` — 돌려주지 않는다 · 낳은 몸 수만큼 · 몸당 5 × 9 바이트).
//   ⓑ 쓰기 길 하나 — `w(p, 이름, 값)` 이 몸 칸(데이터 칸 그대로)과 열에 같은 값을 쓴다.
//   ⓒ 걸음 머리의 읽기 `nda` · `pi` · `pn` · `px` · `py` — 칸 번호 하나만 몸에서 · 값은 열에서.
//   ★★[T1314 결론] 존 걸음 문에 배선한 판(쓰는 자리 22 곳 · 머리 읽기 둘 · 커밋 `5c042c81`)을 같은 상자 자로 재니 **느렸다**(낮 +5 % · 밤 닫힘 앞 +15 % — 보고 T1314 §3).
//     몸 객체 첫 짚기는 그대로 남고(칸 번호를 몸에서 읽는다) 쓰기가 두 곳이 된다. 그래서 존은 이 모듈을 부르지 않는다 — 이 글자는 다음 걸음(걸음 머리 전체를 열로 · 몸 안 짚기)의 바탕과 하네스 몫으로 둔다.
//   ⚠접근자 꼴이 아니다 — 제자리에서 데이터 칸을 접근자로 바꾸면 몸이 사전 모드로 떨어진다(이 카드 미세 판 · T738 +11 % 의 까닭).
//     낳을 때 새 객체로 다시 지어도 칸이 120 개를 넘으면 사전 모드다(같은 미세 판). 그래서 몸 칸은 데이터 그대로 · 열은 거울이 아니라 같은 값의 두 번째 자리다.
// ★값 같음 — 수는 binary64 그대로(−0 · NaN 보존) · 수 아닌 값은 꼴 칸(1 undefined · 2 null · 3 그 밖 → 곁 배열).
//   `verify` 는 틱마다 칸 받은 몸 전원 · 다섯 칸을 `Object.is(몸[이름], 열 값)` 로 견준다(`stat.bad` · 처음 다섯 `ex`).
'use strict';
const MODE = (typeof process !== 'undefined' && process.env && process.env.T1314_HOT_COLS || '').trim();
const ON = MODE === '1' || MODE === 'verify', VERIFY = MODE === 'verify';
const FIELDS = ['nextDecisionAt', 'pathIndex', '_t791Pn', '_t791Px', '_t791Py'];
const K = FIELDS.map(() => ({ F: new Float64Array(0), T: new Uint8Array(0), O: [] }));
const IX = Object.fromEntries(FIELDS.map((f, i) => [f, i]));
const own = [];
let cap = 0, n = 0;
const stat = { installed: 0, writes: 0, other: 0, checks: 0, bad: 0, ex: [] };
function _grow(need) {
  let c = cap || 1024; while (c < need) c *= 2;
  for (const k of K) { const F = new Float64Array(c), T = new Uint8Array(c); F.set(k.F); T.set(k.T); k.F = F; k.T = T; }
  cap = c;
}
function _put(k, s, v) { if (typeof v === 'number') { k.F[s] = v; k.T[s] = 0; } else if (v === undefined) k.T[s] = 1; else if (v === null) k.T[s] = 2; else { k.O[s] = v; k.T[s] = 3; stat.other++; } }
function _val(k, s) { const t = k.T[s]; return t === 0 ? k.F[s] : t === 1 ? undefined : t === 2 ? null : k.O[s]; }
// 몸이 칸을 받는다 — 지금 몸 칸 값 다섯을 열에 옮긴다
function install(p) {
  const s = n++; if (s >= cap) _grow(s + 1);
  p._hcS = s; own[s] = p;
  for (let i = 0; i < FIELDS.length; i++) _put(K[i], s, p[FIELDS[i]]);
  stat.installed++;
  return s;
}
// 쓰기 길 — 몸 칸 · 열에 같은 값(몸 칸 쓰기가 먼저 · 돌려주는 값 = 쓴 값 · 칸 없는 몸은 몸 칸만)
function w(p, f, v) { p[f] = v; const s = p._hcS; if (s >= 0) { _put(K[IX[f]], s, v); stat.writes++; } return v; }
// 걸음 머리 읽기(칸 번호 하나로 열에서) — 칸 없는 몸은 몸 칸
function nda(p) { const s = p._hcS; return s >= 0 ? _val(K[0], s) : p.nextDecisionAt; }
function pi(p) { const s = p._hcS; return s >= 0 ? _val(K[1], s) : p.pathIndex; }
function pn(p) { const s = p._hcS; return s >= 0 ? _val(K[2], s) : p._t791Pn; }
function px(p) { const s = p._hcS; return s >= 0 ? _val(K[3], s) : p._t791Px; }
function py(p) { const s = p._hcS; return s >= 0 ? _val(K[4], s) : p._t791Py; }
// `verify` — 칸 받은 몸 전원 · 다섯 칸
function check() {
  for (let s = 0; s < n; s++) { const p = own[s]; if (!p) continue;
    for (let i = 0; i < FIELDS.length; i++) { stat.checks++; const a = p[FIELDS[i]], b = _val(K[i], s); if (!Object.is(a, b)) { stat.bad++; if (stat.ex.length < 5) stat.ex.push(`${p.pid}.${FIELDS[i]} 몸 ${String(a)} · 열 ${String(b)}`); } } }
  return stat.bad;
}
module.exports = { ON, VERIFY, FIELDS, install, w, nda, pi, pn, px, py, check, stat };
