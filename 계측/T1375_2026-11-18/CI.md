# T1375 — 판 기록 (2026-11-18 · S6)

## 1. 여전히 초록 셋 — 옛 코드 빨강 다시

T1369 판(`보고/T1369_2026-11-18.md` · 가지 `batch/old-code-red-2-1118`)에서 고침 앞 제품에서도 초록이던 셋. 이 판은 `pm-old-code-red.sh`(T1375 고침 — `@old-red-also`) 로 다시 돌렸다.

| 하네스 | T1369 의 옛 판 | 까닭 | 이 판(옛 ref) | 결과 |
|---|---|---|---|---|
| `test-t1292-t952-axis` | `811489dd8^`(T1292 — 하네스가 태어난 커밋) | 재는 고침은 **T1289**(`aeb9d6180` — `_t1289ToE` 축 옮김 · land1071)다. T1292 커밋 앞 제품엔 T1289 가 이미 들어 있었다(하네스 머리말에 적혀 있음). 하네스는 문다 — 옛 판을 잘못 짚었다. | `aeb9d6180^` | **빨강 ○** ✓ 1 · ✗ 5(⓪ 축 옮김 줄 · ① E · L 머묾 끝) |
| `test-live-lag-net` | `811489dd8^` | 재는 고침이 `scripts/live-lag.sh`(운영 스크립트)다 — 자가 제품 자리(server · sim · public · lab)만 옛 판으로 돌리고 `scripts/` 는 지금 것 그대로라 초록. | `811489dd8^` + 머리 `// @old-red-also scripts/live-lag.sh` | **빨강 ○** ✓ 3 · ✗ 9("도쿄 nippon = https 443 …") |
| `test-lint-harness-words` | `dcb4ebd01^`(T1112) | 재는 것이 하네스 자 `scripts/lint-harness-words.js`(가짜 레포 · 제품 부름 0). 같은 까닭. | 머리 `// @old-red-also scripts/lint-harness-words.js` · `2dfe17c8a^`(T1257) · `dcb4ebd01^` · `22a6a74c3^`(T1097 — 자 없음) | **빨강 ○ 셋 다** — ✗ 4 · ✗ 3 · ✗ 9 |

⇒ 무는 단언을 더할 하네스 0 · 제품 회부 0. 고친 것은 자(`pm-old-code-red.sh` — 표지 `// @old-red-also <경로…>`)와 두 하네스의 머리 표지 한 줄씩.

## 2. 이 가지 CI

| 판 | 커밋 | 결과 |
|---|---|---|
| 가지 | `dda3e2c53` | **잡 12 다 초록 · `CI 문` 초록** — 바뀐 자리 code=true(새 가지 = origin/main 과 갈림점) · 6분 25초 — https://github.com/simjaemin1/Mini/actions/runs/44369268636 |
| 미끼 가지 `batch/ci-docs-bait-1118` | `3ee7538c1`(`보고/` 한 파일만) | **`CI 문` 초록** — 바뀐 자리 `code=false · why=문서만 1` · 무거운 잡 여섯 skipped · 판 1분 38초 — https://github.com/simjaemin1/Mini/actions/runs/44369392242 (앞 판 `dda3e2c53` 은 같은 가지 둘째 push 로 취소) |

미끼 가지 판에서 건너뛴 matrix 잡 이름은 `단위 회귀 ${{ matrix.shard }}` · `서버 하네스 ${{ matrix.srv }}` 로 풀리지 않은 채 보인다 — 잡 이름을 필수 체크로 걸면 문서만 판에서 그 이름이 안 서서 Pending 이 된다. 필수 체크는 `CI 문` 하나여야 하는 까닭(문서/CI_main보호_안.md §2).

## 3. 분류표

`ci-class.js` — 417종 · core 304 → **307**(+ `test-t1246-food-price` 1.7초 · `test-ci-changes` 1.2초 · `test-harness-bite` 0.4초) · 서버 잡 46 그대로.
다시 잰 줄: `test-wood-act` 8.6 ~ 9.7초 · `test-lab-hunt` 1.0 ~ 1.3 · `test-t1152-market` 8.4 ~ 9.2 → core 그대로 · `test-onb-blackbox` 150초 상한 빨강(구현 카드 T1368 이 main 에 아직 없다 — land1084 앞) → CI 밖 그대로 · 바꾼 넷(`t952-axis` · `xz-esc` · `xz-hide` · `t1087`) · 표지 단 둘(`live-lag-net` 52.8 ~ 53.2초 · `lint-harness-words`) core.
