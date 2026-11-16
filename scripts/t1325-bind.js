'use strict';
// (@regress 없음 — 러너 밖 · T1325 가름 판 훅 · 제품 무변 · 한 입력만 랩 값에 묶는다)
// === scripts/t1325-bind.js — 몸 판에서 직업 고르기 입력 하나만 랩 값에 묶는 프리로드(T1325 ② 가름 판) ===
//   NODE_OPTIONS="-r $PWD/scripts/t1325-bind.js …" T1325_BIND=<갈래> — 존 서버(몸 판) 안에서만 선다(랩 · 하네스 무동작).
//   갈래:
//     wood  — ⓐ 몸 벌목 수확: 그날 수식 벌목(`_woodOutLast`) × (K − 1) 을 곳간 목재에 더해 나무꾼 한 사람 벌목을 랩 비율로(K = `T1325_BIND_K` · 기본 1.077
//             = 날 40 ~ 72 랩 0.881 : 몸 0.817 · T1325 기준 판 1020)
//     count — ⓓ 식량 합계: 장부 신선도(`granary-lots.freshOf`)를 null 로 — 합계가 곳간 통째(랩 글). 손잡이 `T1325_ONE_ROT=1` 과 같은 식(판 줄 같음 확인용)
//   주사위 0 · 새 수 0(K 는 기준 판 두 줄의 비).
const path = require('path');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const MODE = process.env.T1325_BIND || '';
const ROOT = path.join(__dirname, '..');
if (MODE === 'wood') {
  const K = +(process.env.T1325_BIND_K || 1.077);
  const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
  const _t = V1.tickVillage;
  V1.tickVillage = function (v) {
    const r = _t.apply(this, arguments);
    const add = (v && v._woodOutLast > 0) ? v._woodOutLast * (K - 1) : 0;
    if (add > 0 && v.storage) v.storage.wood = (Number(v.storage.wood) || 0) + add;
    return r;
  };
} else if (MODE === 'count') {
  const GL = require(path.join(ROOT, 'server', 'granary-lots.js'));
  GL.freshOf = () => null;
  if (GL.hooks) GL.hooks.freshOf = () => null;
}
