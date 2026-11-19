# main 보호 규칙 안 — "CI 가 초록일 때만 main 이 움직인다" (T1367 · S6 · 2026-11-18)

> **설정은 바꾸지 않았다**(재민 몫). 이 장은 재민이 GitHub 에서 누를 자리 · 필수 체크 이름 · 부딪치는 자리 · PM 푸시 길을 적는다.
> 왜: main 은 지금 **빨강이어도 올라간다**(보호 규칙 0). PM 이 CI 를 안 보고 올린 일이 있었다(족보 867 · land1082 글자 핀 빨강 셋 — 족보 869).

## 1. 지금 상태 (11-18 · API 로 확인)

| 무엇 | 값 |
|---|---|
| 저장소 | `simjaemin1/Mini` · **공개**(public) — 보호 규칙은 GitHub Free 에서도 된다(공개 저장소) |
| main 보호 | `protected: false` · 저장소 규칙 세트(rulesets) 0 |
| 세션 · PM 이 쓰는 PAT | 재민 계정(`simjaemin1` · 저장소 admin)의 fine-grained 토큰 — 보호 설정을 **읽지도 못한다**(`GET …/branches/main/protection` → 403 "Resource not accessible by personal access token"). 켠 뒤 확인은 재민이 화면에서 한다. |

## 2. 필수 체크 이름 — 하나

**`CI 문 (필수 체크 하나)`** — 워크플로 `regress-unit` 의 `gate` 잡(이 가지에서 더함). 다음을 모아 하나로 낸다:

| 모으는 잡(이름 그대로) | 초록 조건 |
|---|---|
| `러너 자가 검사 · 게이트 셋 · 하네스 규약` | success |
| `단위 회귀 1/5 (반드시 초록)` … `단위 회귀 5/5 (반드시 초록)` | 모든 잡 success |
| `서버 하네스 1/2 (차례로 · 반드시 초록)` · `서버 하네스 2/2 (차례로 · 반드시 초록)` | 모든 잡 success |
| `옛 코드 빨강 (새 하네스는 옛 제품 위에서 빨강)` | success, 또는 skipped(main 에 직접 민 판 — 그 SHA 는 착지 가지에서 이미 돌았다) |
| `지켜보는 하나 (배지 안 깸)` | 안 본다 |

왜 하나로: core · 서버 잡 수(`ci-class.js --write-yml --shards N --srv-shards K`)나 잡 이름이 바뀔 때마다 GitHub 설정을 다시 고치지 않게. 잡마다 이름을 필수로 걸고 싶으면 위 표의 이름을 그대로 넣으면 된다(그때는 `--shards` 를 바꿀 때 설정도 같이 고친다).

★이 이름은 **한 번 돈 뒤에야** 설정 화면 검색에 뜬다(최근 7일 안에 돈 체크). 이 가지가 main 에 들어간 뒤 첫 push 판이 돌고 나서 켠다.

## 3. 재민이 누를 자리 (classic 보호 규칙 기준)

1. 저장소 → **Settings** → **Branches** → **Add branch protection rule**(또는 Settings → Rules → Rulesets → New branch ruleset — 같은 칸이 있다).
2. Branch name pattern: `main`
3. ☑ **Require status checks to pass before merging**
   - 검색 칸에 `CI 문` → **`CI 문 (필수 체크 하나)`** 고름(출처 GitHub Actions).
   - ☑ **Require branches to be up to date before merging**(strict · 기본값) — PM 길은 빨리감기(fast-forward)라 늘 서 있다.
4. ☐ Require a pull request before merging — **켜지 않는다**(PM 은 PR 없이 착지 SHA 를 main 에 민다 · 켜면 그 길이 막힌다).
5. ☑ **Do not allow bypassing the above settings** — ★꼭. 기본값은 "admin 에게는 규칙이 안 걸린다"이고, PM · 세션이 미는 토큰은 **재민(admin) 토큰**이다. 이 칸이 꺼져 있으면 보호 규칙을 켜도 PM 푸시에는 아무것도 안 걸린다.
6. ☐ Allow force pushes · ☐ Allow deletions(기본 그대로 — force 0 규약과 같다).
7. Create / Save.

되돌림: 같은 화면에서 규칙을 지우거나 3 의 칸을 끈다(급한 배포 고침이 막히면 — 끄는 것도 재민 몫).

## 4. 부딪치는 자리 ① — 문서만 바뀐 커밋(`paths-ignore`)

지금 워크플로는 `paths-ignore: ['지시/**', '보고/**', '인계/**', '회부/**']` — 카드 · 보고만 바뀐 커밋은 **워크플로가 아예 안 돈다**.
GitHub 문서: 경로 거름으로 워크플로가 건너뛰어지면 그 체크는 **"Pending" 으로 남아 막는다**(`Waiting for status to be reported`).
⇒ 보호를 켜면 PM 의 카드만 올리는 커밋(하루 여러 번)이 main 에 **못 올라간다**.

푸는 법(보호를 켤 때 같이 — PM 착지):
- **(가 · 권함) 거름을 워크플로 안으로.** `on:` 의 `paths-ignore` 두 줄을 지우고, 맨 앞에 바뀐 파일을 보는 작은 잡 하나 + 무거운 잡에 `if:` 를 단다. GitHub 문서: **조건(`if`)으로 건너뛴 잡은 "Success" 로 보고된다** — 그래서 `CI 문` 이 문서만 커밋에서도 1분 안에 초록이 된다.
  ```yaml
  jobs:
    changes:
      runs-on: ubuntu-latest
      outputs:
        code: ${{ steps.d.outputs.code }}
      steps:
        - uses: actions/checkout@v4
          with: { fetch-depth: 0 }
        - id: d
          run: |
            BASE="${{ github.event.before }}"; [ -n "$BASE" ] && [ "$BASE" != 0000000000000000000000000000000000000000 ] || BASE="$(git merge-base HEAD origin/main)"
            if git diff --name-only "$BASE" HEAD | grep -vqE '^(지시|보고|인계|회부)/'; then echo code=true >> "$GITHUB_OUTPUT"; else echo code=false >> "$GITHUB_OUTPUT"; fi
    gates:
      needs: changes
      if: needs.changes.outputs.code == 'true'
      …   # core · server · old-code-red 도 같은 두 줄
    gate:   # CI 문 — 지금 글자에 `changes` 를 needs 에 더하고, 결과 비교를 success|skipped 로
  ```
  (경로 글자는 지금 `paths-ignore` 와 같다 · 한글 경로는 `git diff --name-only` 가 따옴표로 감쌀 수 있으니 `git -c core.quotepath=off diff --name-only` 로.)
- (나) 문서 경로만 받는 두 번째 워크플로에 같은 이름의 잡(`CI 문 (필수 체크 하나)` — 늘 초록)을 둔다. 글자는 적지만 이름이 같은 체크가 둘 생기고(코드+문서 섞인 커밋), 하나가 늘 초록이라 헷갈린다 — 권하지 않는다.

## 5. 부딪치는 자리 ② — PM 의 번들 푸시 길

지금 길: PM 이 맥 VM 에서 재민 토큰으로 `git push … <착지 SHA>:refs/heads/main`(공통 규약 ⑧ — 착지 가지 `batch/land<번호>` 를 먼저 올려 CI 를 본다).

보호를 켜면:
- **막히지 않는 판** — main 에 미는 SHA 가 **이미 다른 가지(`batch/land<번호>` · `land/**`)에서 돌아 `CI 문` 이 초록**이고, main 의 빨리감기다. GitHub 문서: 필수 체크가 다 지난 커밋은 다른 가지에 밀어 합치거나 보호 가지에 바로 밀 수 있다. 체크는 커밋(SHA)에 붙으므로 같은 SHA 면 된다.
- **막히는 판**
  - 착지 가지 초록을 본 뒤 PM 이 손으로 한 커밋을 더 얹거나(족보 · 카드 줄) main 을 다시 합쳐 **SHA 가 바뀐** 판 → `GH006: Protected branch update failed … Required status check "CI 문 (필수 체크 하나)" is expected.` ⇒ 그 SHA 를 착지 가지에 다시 밀고 초록을 본 뒤 민다.
  - 카드만 올리는 커밋도 같다 — 착지 가지(또는 `land/cards`)에 먼저 밀어 `CI 문` 이 서는 것(위 4(가)면 약 1분)을 보고 main 에 민다. 한 걸음 는다.
  - CI 가 빨강인 SHA — **막히는 것이 목적이다**.
- 세션 가지(`batch/**` · `claude/**`)는 그대로 — 보호는 main 만.
- 야간(망고링고)은 main 을 받기만 한다 — 무관.

## 6. 켠 뒤 확인 (재민 · 한 번)

1. 설정 화면에서 규칙이 `main` 에 걸리고 필수 체크 `CI 문 (필수 체크 하나)` · bypass 금지가 보이는지.
2. PM 의 다음 착지 때: 착지 가지 초록 → 같은 SHA main 푸시 성공 · (일부러 하지 않아도) 다른 SHA 를 밀면 GH006 으로 거절되는 것을 PM 보고에 한 줄로.

## 근거

- GitHub Docs — About protected branches(상태 체크 strict/loose · 체크가 지난 커밋은 보호 가지에 바로 밀 수 있음 · admin 기본 면제와 "Do not allow bypassing the above settings" · 공개 저장소는 Free 에서도): https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- GitHub Docs — Troubleshooting required status checks(경로 · 가지 거름으로 건너뛴 워크플로의 체크는 Pending 으로 남아 막음 · 조건으로 건너뛴 잡은 Success): https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
- 저장소 상태: GitHub REST `GET /repos/simjaemin1/Mini` · `…/branches/main` · `…/rulesets`(11-18 · 세션 토큰 — 읽기만)
