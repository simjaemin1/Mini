# T1350 — CI 판 기록 (2026-11-17 · S6)

## 1. main 빨강 둘 — 언제부터 · 왜

| 하네스 | 처음 빨강 | 까닭 | 고침 |
|---|---|---|---|
| `test-audio` | 09-23 `cf0131288` 부터(⑭b 를 심은 T358 `5674506df` 뒤 main CI 첫 판) | ⑭b 이음새 자가 ffmpeg 으로 잰다 — CI 러너에 ffmpeg 이 없어 "못 쟀다"로 빨강(조용히 넘어가지 않는 자 — 하네스는 옳다) | PM land1082 `296f6f045` 러너에 ffmpeg. 이 가지: core 잡에서 `test-audio.js` 가 든 잡만 ffmpeg 을 깐다(`if: contains(matrix.list, 'test-audio.js')`) |
| `test-nightly` | 11-11 `05b66c731` 부터 | `nightly-run.sh` 가 얕은 클론을 보면 "전체 이력을 받는다" 줄을 먼저 찍는다 — CI 체크아웃(깊이 1)에서 첫 줄이 어긋남 | PM land1082 `fetch-depth: 0`. 이 가지: 하네스 쪽도 클론 깊이에 안 기대게 — `ENV0.NIGHT_UNSHALLOW='0'` + ⑬(얕은 임시 클론에서 첫 줄 · 얕음 그대로 · 미끼 env 는 unshallow 줄) |

main 판(GitHub Actions `regress-unit`):

* 마지막 빨강 `222b6c287` — https://github.com/simjaemin1/Mini/actions/runs/44116543045
* 첫 초록 `1e2eb209f`(land1082) — https://github.com/simjaemin1/Mini/actions/runs/44131596956
* 그 앞 빨강 줄: `b1ba29379` 43993409881 · `53cc1e6ed` 43844136550 · `a420ca570` 43836298094 · `abf22a50c` 43827128907

## 2. 이 가지(batch/ci-gate-1117) CI

| 판 | 커밋 | 결과 |
|---|---|---|
| 첫 판 | `752b6fdd7` | 잡 8 중 빨강 2 — core 2/5 `test-redeploy-light`(러너 일반 사용자라 `/srv/durango` 못 씀 → 0줄) · core 5/5 `test-audio` ⑩(옛 yml 목록 블록을 읽음) — https://github.com/simjaemin1/Mini/actions/runs/44189294831 |
| 둘째 판 | `267720448`(`7ca56eedf` 고침 + main `4ab5ab2b4` 합침) | **잡 8 다 초록** — https://github.com/simjaemin1/Mini/actions/runs/44192341830 |

둘째 판 잡 시간(초): core 1/5 287 · 2/5 243 · 3/5 249 · 4/5 280 · 5/5 204 · 게이트 277 · 옛 코드 빨강 42 · 지켜보기 211 → 잡이 나란히 돌아 벽시계 약 5분(설치 포함).
옛 코드 빨강 잡 줄: `제품 무관 | test-ci-list.js | @harness-only — 건너뜀` · `# 합: 빨강 0 · 크래시 0 · 초록 0 · 모름 0 · 제품 무관 1`.

## 3. 미끼 가지 셋 — CI 빨강 3/3

| 가지 | 커밋 | 미끼 | 판 | 빨강 잡 |
|---|---|---|---|---|
| `batch/ci-bait-syntax` | `5f5e8499b` | `server/kcal.js` 끝에 `const __bait = (;` | https://github.com/simjaemin1/Mini/actions/runs/44189315549 | core 5/5 · 게이트 · 지켜보기(옛 코드 빨강은 새 하네스 0 이라 초록) |
| `batch/ci-bait-red` | `bb6b4e16e` | `DAY_KCAL` 기본 2451 → `_num('BODY_DAY_KCAL', 2451)` 자리 값 바꿈 | https://github.com/simjaemin1/Mini/actions/runs/44189321695 | core 4/5 · 게이트(`inline-engine --check` 마을 · 전쟁 실험실 "번들과 다르다") · 지켜보기 |
| `batch/ci-bait-trivial` | `bed8f8730` | 새 하네스 `test-ci-bait-trivial.js`(`typeof K === 'object'` — 옛 제품에서도 초록) | https://github.com/simjaemin1/Mini/actions/runs/44189323691 | **옛 코드 빨강**(`초록 ✗ test-ci-bait-trivial`) · core 2/5 · 5/5 는 `752b6fdd7` 위라 위 2 의 환경 둘 |

세 가지는 지우지 않았다(PM 몫).

## 4. 자 하나로 다시

* 분류표 `node scripts/ci-class.js --table > 계측/T1350_2026-11-17/분류표.md`
* 새 하네스 한 줄 넣기: `node scripts/ci-class.js --static` → `--measure --only test-x.js` → `--write-yml --shards 5` → `node scripts/test-ci-list.js`
* 판 목록 · 잡 시간: GitHub API `actions/runs?branch=…` · `runs/<id>/jobs`
