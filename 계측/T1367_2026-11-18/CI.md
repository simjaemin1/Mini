# T1367 — CI 판 기록 (2026-11-18 · S6)

## 1. 진단 — main(land1083 `da9dd53af`) CI 판

https://github.com/simjaemin1/Mini/actions/runs/44257890460 — 초록. 잡마다 걸린 시간(초 · 설치 포함):

| 잡 | 초 |
|---|---|
| 러너 자가 검사 · 게이트 셋 · 하네스 규약 | 270 |
| 단위 회귀 1/5 · 2/5 · 3/5 · 4/5 · 5/5 | 308 · 336 · 219 · 308 · 350 |
| 지켜보는 하나 | 262 |
| 옛 코드 빨강 | skipped(main push) |

잡이 나란히 돌아 벽시계 약 6분.

main 분류표(`scripts/ci-class.json` · 407줄)의 core 밖 까닭 수: 서버(다) **80** · 브라우저(라) 10 · 60초 넘음 16 · 다섯 판 다 빨강 6(`test-wood-act` · `test-lab-hunt` · `test-t1152-market` — PM land1083 이 고침 · `test-t1156` · `test-t1157` — 결과 줄 꼴 아님 · `test-t1246` — 진짜 빨강) · 다섯 판 갈림 1(`test-lib-port`). 표에 아직 없던 하네스 8(land1083 이 같이 실은 새 하네스).

## 2. 이 가지 CI

| 판 | 커밋 | 결과 |
|---|---|---|
| 첫 판 | `e3e1a8e8e` | 서버 2/2 빨강 — `test-xhost-env` Ⓐ①~⑥(가짜 docker 의 `recreate … /srv/durango/central` — 러너 일반 사용자라 못 씀 · 분류 상자는 root) → **`CI 문` 빨강**(4초 · 결과 모음이 서버 잡 실패를 잡음) · 그 판은 둘째 push 로 취소 — https://github.com/simjaemin1/Mini/actions/runs/44326636751 |
| 둘째 판 | `85a704380`(서버 잡에 `/srv/durango` 쓰기 자리 — core 잡의 T1350 걸음과 같은 것) | **잡 11 다 초록 · `CI 문` 초록** — https://github.com/simjaemin1/Mini/actions/runs/44327764044 |

둘째 판 잡 시간(초): 게이트 271 · core 210 · 348 · 257 · 364 · 324 · **서버 1/2 316 · 2/2 257** · 옛 코드 빨강 40 · 지켜보기 201 · CI 문 3. 판 전체 14:45:26 → 14:51:46 = **6분 20초**.

서버 잡을 둘로 나눈 까닭: 이 상자 가장 긴 판 합 707초 — 서버 1/2(이 상자 353초)가 GitHub 에서 316초(설치 포함)였으니 한 잡이면 약 10.5분(카드 "전체 10분 안" 넘음). 잡마다 다른 러너 기계라 고정 포트를 안 나눈다 — 잡 안은 차례로(러너 -j 1).

## 3. 분류표

`분류표.md`(`node scripts/ci-class.js --table`) — 415종 · 가 93(core 90) · 나 231(core 214) · 다 81(서버 잡 46) · 라 10. core 294 → **304** · 서버 잡 0 → **46**.
서버(다) 81 = 서버 잡 46 + 혼자 60초 넘음 5(`test-nippon-boot` 71.4 · `test-seed-hp` 61.3 · `test-t1342-gate-home` 61.8 · `test-onb-blackbox` 120(빨강 · 검사 카드 · 구현 대기) · `test-t1334-bundle` 120) + 러너 로그 한 판이 60초 넘어 안 잰 30.

## 4. 자 하나로 다시

* 서버 줄 재기: `node scripts/ci-class.js --measure --server --only a.js,b.js`(판마다 `setsid` 제 무리 · 끝나면 무리째 내림)
* yml: `node scripts/ci-class.js --write-yml --shards 5 --srv-shards 2` → `node scripts/test-ci-list.js`
