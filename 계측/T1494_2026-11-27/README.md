# 계측/T1494_2026-11-27 — 원한이 보인다(판 · 표 · 도구 · 지키기)

보고 `보고/T1494_2026-11-27.md` · 그림 `보고/T1494_2026-11-27/그림/`(맥 `~/Mini/산그림/T1494/` 에도 같은 그림) · 회부 `인계/회부.md` 의 `## T1494` 절.

## 판(`판/`)

| 자리 | 자 | 설정 | 무엇 |
|---|---|---|---|
| `스무판/run<n>.json` · `run<n>_log.txt` | `scripts/t1494-cycle-run.js --out <json> --run <n> [--restart --day-ms 6000]` | central + 존 · `VILLAGE_MAX=3` · 하루 1.5초(재기동 판 5 · 10 · 15 · 20 은 6초) · `E2E_GIVE=1` · `T1447_PERSON_GRUDGE=1` | 봇 넷(H 해치는 · C 촌장 · S 구경 · R 다시 접속)이 한 바퀴(쌓임 → 보임 → 가입 거절 → 촌장 칸 → 다시 접속 → 모르는 땅 원한 → 토벌 → 떠났다는 소문 → 친 뒤 풂 → 풀림) · 새어 보임 셈(`leaks` · `leakN`) |
| `그림/크롬_그림판.json` · `그림/웹킷_그림판.json` | `scripts/t1494-shots.js --out-dir <폴더> --json <json> [--browser webkit]` | central + 존 · 하루 5초 · 클라 셋(촌장 1440 · 구경꾼 390 · 해치는 사람 1440 — WebKit 은 차례로 · 휴대폰 폭 447) | 보고 그림 다섯(크롬 153) · Safari 넷(WebKitGTK 2.52.6 — 소문 그림은 크롬만) · 판마다 DOM 검사(`checks` — 줄 · 단추 · 찍은 뒤 줄 · 휴대폰 폭 판 밖 칸 · 이모지). 그림 자를 고치며 크롬 여덟 · WebKit 다섯 판을 돌렸고(찍는 때 · 판 하루 · WebKit 첫 판은 세션 셋을 한꺼번에 열어 WebKitWebDriver 가 거절) 마지막 판을 실었다 |
| `그림/크롬_탭못누름_판.json` | 같은 자(옛 차례) | — | 휴대폰 폭 구경꾼이 구성원 탭을 누르기 전에 찍힌 판(대시보드 판 1,045px 잘림 — 회부 10 증거) |
| `그림/크롬_쳤다는소문_판.json` | 같은 자(하루 2.5초) | — | 떠났다는 소문 뒤 하루 만에 쳤다는 소문이 닿아 내 창에서 농촌1 이 내려간 판(`표/쳤다는소문_뒤_내창.png`) |

## 표(`표/`)
`판스물.md`(스무 판 한 바퀴 표 — `도구/runs-table.js` 가 `판/스무판/*.json` 에서 만든다) · `휴대폰폭_대시보드판_잘림.png`(이 카드 전부터 · 회부 10) · `쳤다는소문_뒤_내창.png`(소문으로 땅 원한이 풀린 것을 안다).

## 도구(`도구/`)
`one-run.sh`(판 하나) · `lane2.sh`(t17 머리 · 게이트 셋 · 옛 코드 빨강 첫 시도 — 하네스를 `scripts/…` 길로 줘 겹 길로 크래시 → `post2.sh` 에서 이름만으로 다시 · 스무 판 · 첫 그림 판) · `runs-table.js`(표) · `spotprobe.js`(자리 찾기 시험) · `shots*.sh` · `shots5wk.sh`(그림 판 — 마지막은 `shots7.sh`(WebKit) · `shots8.sh`(크롬)) · `harn2.sh`(이 카드 하네스 둘 마지막 나무에서 다시) · `apt-webkit.sh`(WebKitGTK MiniBrowser · WebKitWebDriver · Xvfb 깔기) · `baseline.sh`(끈 판) · `t17base.sh`(t17 베이스 나무) · `lane1.sh` · `hrun.sh`(만진 하네스 두 줄 — 이어 도는 꼴) · `post1.sh` · `chunkrun.sh`(다시 · core · 서버 잡 — 러너 e2e-first30 은 `post1.sh` 끝) · `first30d.sh`(e2e-first30 러너 상한 뒤 직접) · `coreback*.sh`(core 뒤 덩이를 먼저 — 무거운 일 둘까지) · `post2.sh`(옛 코드 빨강 · 배선 베이스 · CI 분류 · 그림) · `lint2.sh`(린트 다시). 스크래치 길(`/tmp/claude-0/…/scratchpad/t1494/`)이 박혀 있다 — 다시 쓰려면 앞머리 길만 바꾼다.

## 지키기(`지키기/`)
끈 판(`기준선1118_끔.txt` · `기준선1118_끔_머리해시.txt` — 최종 코드 커밋 `19057ce1d`) · t17(`t17_머리_<시드>.txt` · `t17_베이스_<시드>.txt` — 셈 시간 줄만 다름) · 게이트 셋(`게이트셋.txt` · `배선_베이스.txt`) · 린트(`하네스린트.txt` · `판정글자린트.txt`) · 하네스(`t1494.txt` 31/31 · `t1447.txt` 47/47) · 옛 코드 빨강(`옛코드빨강.txt`) · 만진 하네스(`만진_목록.txt` · `만진_A.txt` · `만진_B.txt` · `만진_로그.tgz` · `다시.txt` · `다시_e2e-inv_TMPDIR긴길.txt` · `다시_e2e-inv_TMPDIR없음.txt`) · core · 서버 잡(`core.txt` 258/258 · `서버잡.txt` 10/10) · e2e-first30(`first30_러너.txt` — 러너 2,400초 상한 RC=124 · `first30_직접.txt` · `first30_out.json` — 직접 RC=0 · 2,819초 · 막힘 0) · CI 표(`CI_분류_static.txt` · `CI_분류_measure.txt` · `CI_yml.txt` · `CI_목록검사.txt`).
