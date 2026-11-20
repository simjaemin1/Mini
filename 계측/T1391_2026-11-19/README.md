# 계측/T1391_2026-11-19 — 불행한 사람이 이주가 아니라 도적이 되면(세 팔 판 + 부자 곁 팔)

보고 `보고/T1391_2026-11-19.md`. 코드 커밋 `d92a7cf06`(가지 `batch/unhappy-bandit-1119`). 판은 다 그 커밋의 나무(worktree)에서 돌았다.

## 판

| 묶음 | 조건 | 판 |
|---|---|---|
| 서버 자(sbc) | `t577-server-run.js 730 <시드>` · `VILLAGE_CARAVAN_MAX=0` · `T400_BUILD_ACT=0` · 가상 시계(`T745_VCLOCK=1` + `--require scripts/t745-vclock.js`) · 교역로 캐시 | 끔 · nohome · all · all + 부자 곁 × 1020 · 7 · 42 + 부자 곁만 1020 |
| 전쟁 기준선 조건(war) | `t577-server-run.js 800 1020` · 위 둘 + `VILLAGE_NPC_CAP=Infinity` · 벽시계 · 아이 힙 4,608MB — 세 판 다 360날에서 멈춤(`도구/warcut.js` · 보고 회부 13 · 판 JSON 없음 · 수는 관찰기 줄) | 끔 · nohome · all |
| 몸 세계(body) | `t577-server-run.js 100 1020` · `T577_BODY=1`(하루 1,440,000ms · 몸 상한 Infinity · 집 켬) · 가상 시계 | 끔 · nohome · all |

손잡이: 끔 = 없음 · nohome = `T1391_UNHAPPY_BANDIT=nohome` · all = `T1391_UNHAPPY_BANDIT=all` · 부자 곁 = `T1391_DEN_RICH=1`.
ALL_7 은 첫 판이 상자 메모리 한도(≈ 6GB · 판 셋 겹침)에 날 ~620 에서 죽어(OOM — `dmesg` memcg) 혼자 다시 돌았다(`도구/s3.json`).

## 파일

* `판/<판>.json` — 판 자 판 JSON(여덟 수 · 날 줄) · `판/<판>.t1391.json` — 관찰기 줄(아래).
* `표/*.md` — 보고 표(`도구/mk.py` 가 만든다) · `표/sum.json` — 판마다 셈 · `표/마을달_OFF_<시드>.csv` — 할 일 1 마을-달 줄(끔 세계).
* `도구/` — `t1391hook.js`(관찰기) · `chain.js`(판 사슬) · `waiter.js`(사슬 잇기) · `ana.py` · `mk.py`(표) · 판 목록 `s2.json` · `s3.json` · `wB.json` · `wW.json` · `wW2.json` · `q1a.json` · `q1b.json` · `warcut.js`(전쟁 판 360날 멈춤) · `warphase.sh` · `vals.py` · `assemble.py`(보고 조립) · `cmpbase.py`(기준선 둘 견주기) · `pack.sh`(이 폴더 꾸리기).
* `지키기/` — 끈 판(끈 판 같음 1/1 · 경제 400/400 · 생활층 400/400) · t17 · 게이트 셋 · 전쟁 기준선 11-03 30날 · 전쟁 판 main ↔ 가지(30날 · 120날 벽시계 · 120날 가상 시계 — `전쟁_main*.json` 은 main 나무로 뜬 기준선) · 360날 OOM 두 줄 · touched 러너 · 하네스 · 옛 코드 빨강.

## 관찰기(`도구/t1391hook.js` — 세계 0 · 읽기만)

아이 존 프리로드(`NODE_OPTIONS=--require …`) · `T577_OUT` 이 있을 때만 깬다 · 장부 `scanDay`(econ 하루 끝)마다:
* 세계-날 줄 `w`(칸 `wcols`) — 인구 · 산 마을 · 죽음 · 굶어 죽음 · 불행 마을 수(0.25 · 0.32 밑) · 단 · 단원 · 모이는 단 · 캐러밴 · 짐 · 식량 수입 · 행상 피살 · 털림 · 약탈 · 호위 · 토벌 · 단 굶어 죽음 · 해산 · 절망 이탈 · 불행 이탈 문(번 · 이웃 · 도적 · 남음).
* 마을-달 줄 `vm`(칸 `vcols` · 달 = 30날) — 위 셈의 마을 몫 + 평균 행복 · 부담 B · 사람당 식량 · 전사 · 위험 · 목책 · 0.25 밑 날의 까닭 합(좋은 것 G · 겪은 일 E · 부담 B · 느린 S · 굶는 몫).
* 단 줄 `gangs` · 토벌 출정 `sorties` · 도적 전환 줄 `conv`(bandits `t1391().log`) · 나이 칸 `ages`.
* 겉싸개 둘(같은 인자로 그대로 부른다 · 값 · 차례 무변): econ `onBanditLoot`(약탈) · 불행 이탈 문 `world.t1075Emigrate`(번 · 갈래).

## 다시 도는 법

```
git worktree add --detach /tmp/t1391-wt d92a7cf06 && ln -s $PWD/node_modules /tmp/t1391-wt/node_modules
cp 계측/T1391_2026-11-19/도구/{t1391hook.js,chain.js,s2.json} <작업 폴더>/
T1391_ROOT=/tmp/t1391-wt node <작업 폴더>/chain.js <작업 폴더>/s2.json 2     # 판은 <작업 폴더>/runs/<판>/ · 상자 메모리 ≈ 6GB 면 동시 둘까지
python3 <작업 폴더>/mk.py                                                     # 표
```
