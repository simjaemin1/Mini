// ★★[T1334 2026-11-15 · T1319 회부 3] 켬 기본 묶음 손잡이 `T1334_BUNDLE`(끔 기본 · `'1'` 만 켬)
//   T1319 가 목표 넷(1020 끔비 ≥ 1.10 · 세 시드 끔비 ≥ 0.98 · 꼭대기 뒤 내림 ≤ 10% · 굶어 죽음 ≤ 같은 시드 끔)을 세 세계에 걸쳐
//   다 넘은 첫 줄 — 묶음(나무꾼 몸 + 영토 v2 + 나무 수요) + 출생 문 + 이주 문 + 무리 셈 + K 문 + 가을 문 `mig` — 을 손잡이 하나로 켠다.
//   켜면 아래 일곱 갈래(아홉 글자)를 **부르는 쪽이 안 준 것만** 존 프로세스 env 에 채운다 — 모듈이 env 를 읽기 전에.
//     ⇒ 묶음 켬 = 낱 아홉 켬과 env 가 같다 = 바이트 같음(새 갈래 0 · 각 모듈은 종전 글자 그대로 읽는다).
//   낱 손잡이는 `'0'` 으로 되돌린다(준 값이 먼저 — 묶음 켬 + `T1319_RECV_K=0` = K 문만 끔 · 빈 글자 `''` 는 안 준 것으로 본다).
//   K 문은 가을 문 `mig` 와 함께다 — K 문 하나만 켜면 v2 만 세계 굶어 죽음이 는다(205 · 341 · 200 → 234 · 360 · 233명 · 보고 T1319 §1).
//   채우는 자리는 둘뿐이다: 서버 존 맨 위(`server/zone.js` — villages · econ 을 읽기 전)와 판 자 아이 env(`scripts/t577-server-run.js` `kidEnv`
//     — 판 자는 econ 을 먼저 읽는 프리로드(`t577-server-hook` · 계측 훅)가 있어 존 맨 위로는 늦다).
//   랩(브라우저 번들 · 헤드리스 t17 · t176)은 이 파일을 안 읽는다 — 랩 무접촉.
//   T1302(영토를 몸이)는 안 든다 — 묶음에 넣으면 끔비가 1.39 → 1.06(T1318 중간 · T1329 가 고치는 중 · 카드 T1334 ⑤).
'use strict';

// ★[T1334 ④ · 가지 `batch/bundle-on-prep-1115-on`] **켬 기본** — 빈 값 = 켬 · `T1334_BUNDLE=0` = 끔(낱 손잡이 종전 글자 그대로 · 종전 세계 기준선 11-14 와 견줄 땐 `0` 을 준다).
//   착지는 재민 "켜" 뒤 PM — 끔 기본 가지(`batch/bundle-on-prep-1115`)와 다른 글자는 이 한 줄뿐(하네스 `0` · 기준선 후보는 이 커밋에 함께).
const DEFAULT_ON = true;

// [글자, 켬 값, 갈래] — 차례는 읽는 쪽 의존 차례(T1238 은 T1207 위 · T1306 · T1312 · T1319 K 는 T1297 위 · 가을 문은 T1297 위)
const KNOBS = Object.freeze([
  ['T325_WOOD_ACT', '1', '나무꾼 몸'],
  ['T1207_TERR_REAL', '1', '영토(몸이 넓힌다)'],
  ['T1238_TERR_V2', '1', '영토 v2'],
  ['T1283_WOOD_DEMAND', '1', '나무 모자람 → 직업 고르기'],
  ['T1297_BIRTH_FOOD', '1', '출생 문(곳간 · 겨울)'],
  ['T1306_MIGRATE_FOOD', '1', '이주 문(들은 곳간)'],
  ['T1312_HERD', '1', '무리 셈 · 들은 행복 · 침상'],
  ['T1319_RECV_K', '1', 'K 문(들은 부양력)'],
  ['T1319_AUTUMN_LOOK', 'mig', '가을 문 — 이주 문만'],
].map((x) => Object.freeze(x)));

function active(env) { const v = env ? env.T1334_BUNDLE : undefined; return DEFAULT_ON ? v !== '0' : v === '1'; }

// env 를 그 자리에서 채운다 → 채운 글자 목록(끔이면 [] · env 무변)
function fill(env) {
  const set = [];
  if (!env || !active(env)) return set;
  for (const [k, v] of KNOBS) if (env[k] == null || env[k] === '') { env[k] = v; set.push(k); }
  return set;
}

module.exports = { DEFAULT_ON, KNOBS, active, fill };
