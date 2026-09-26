# 두랑고 BGM — 정본 한 장 [T430 2026-09-26]

13곡이 **어디서 · 어떻게 구워졌고 · 무엇을 다시 구워도 되나**를 이 한 장에 적는다.
근거는 보고 T353 · T391(복원) · T401(11곡) · T411(문턱) · T422(보관소)다. 옛 문서는 맨 아래에 있다(지우지 않았다).

## 한눈에
| | |
|---|---|
| 게임이 트는 것 | **`bgm.js` 절차 엔진**(파일 0장 · `public/client/48-a-audio.js` 가 부른다). 아래 13곡 파일은 게임이 **안 튼다** |
| 13곡 파일을 트는 곳 | 브금판 `/bgm-board.html`(`bgm-loops.js` — Ogg 를 못 트는 브라우저는 `.m4a`) · 소리판 `/sfx-board.html` |
| 정본 코드가 있는 곡 | **2/13** — `village_day_trad` · `village_day_jeongak`. 다시 구우면 파일 바이트까지 같다(T391) |
| 정본 코드가 없는 곡 | **11/13** — 지금 배포 11곡은 **정본 코드가 없는 굽기 결과물**이다(07-30 판 `tracks2.py` · 레포에 없다 · 07-31 코드로 다시 구우면 같은 곡 0/11 — 반주 9/11 은 같은 파형이지만 선율은 0/11 · T401) |

## 입력
| 무엇 | 어디 | 적어 둘 것 |
|---|---|---|
| 샘플 뱅크 `bk_*` 12묶음 | 맥 `durango-mini/public/assets/audio/bgm/`(gitignore) | **격리 복원**해서 쓴다(원본 무변). 대금 4묶음은 `tools/bgm-samples/restore_backups.py --verify` 가 해시로 잰다(121파일 · T422) |
| 조각 스캔 | **12:22판** `sampler.py`(`코드백업_최신.zip` · `split_notes(max_len=4.0)`) | ⚠레포 `sampler.py`(13:01판 · `max_len=9.0`)로 풀면 **다른 조각**이 나온다. 정악(`jdae`·`jgaya`)은 이미 잘린 조각이다 |
| 악보·굽기 코드 | 이 폴더 `render_score.py` · `render_jeongak.py` · `score_village_day.py` · `gugak.py` · `sampler.py` | `tools/score-expression` 은 **굽기 입력이 아니다** — 표현 층 R&D 컴파일러다(정본 옆 · T422) |

## 굽는 명령 — 두 곡, 한 줄
    python3 render_score.py && python3 render_jeongak.py    # → out_samples/village_day_{score,jeongak}.wav
    # 그 뒤 ffmpeg -c:a libvorbis -q:a 4  ·  ffmpeg -c:a aac -b:a 128k   (numpy 2.3 이상 · AVX-512)
* `village_day_score.wav` 가 `village_day_trad` 다. 기본값은 T391 복원값(붙은 음 자동 이음)이다.
* GPT 의 **무표기 재발음** 규칙은 손잡이 `ARTICULATION_CONTRACT`(`render_score.py` · 기본 `False` · `render_jeongak.py` 도 같은 값을 읽는다)다. **#70** 이 켜면 한 낱말이고, 켜면 두 곡이 다른 소리가 된다.
* ⚠옛 "다시 만들려면"(`render_samples.py`)은 배포 경로가 아니다 — 지금 `TypeError` 로 죽는다(T391).

## 출력 — 배포 13곡 (`.ogg` + `.m4a` · sha256 앞 16자)
| 곡 | .ogg | .m4a | 굽힌 코드 | 다시 구우면 |
|---|---|---|---|---|
| `village_day_trad` | `1c2e033b29776089` | `9752f3a3241498bc` | `render_score.py` | ○ 바이트 동일 |
| `village_day_jeongak` | `134f172b941fb11f` | `70a0834e078e41a8` | `render_jeongak.py` | ○ 바이트 동일 |
| `village_day_amb` | `87f17862665bce10` | `92c3d9b6e610c4e7` | 07-30 `tracks2.py`(레포 밖) | ✗ 코드 없음 |
| `village_day_ari` | `dc6009aed584fd84` | `db6a7101132c96db` | 〃 | ✗ |
| `village_night_trad` | `78224907c71ecdda` | `f8a21d31f83d7a60` | 〃 | ✗ |
| `village_night_amb` | `e082857110121ec1` | `14f9febeb3711ada` | 〃 | ✗ |
| `village_night_ari` | `dfea7829f78af61a` | `4c5155d6b7df86a7` | 〃 | ✗ |
| `battle_trad` | `3e49b528e88993a7` | `c85a76140f71240e` | 〃 | ✗ |
| `battle_amb` | `62f271a6e8543395` | `d4307af479ef6453` | 〃 | ✗ |
| `battle_ari` | `44bf96f58168110f` | `d1a399f8baa05305` | 〃 | ✗ |
| `journey_trad` | `f8d07443a3d551f3` | `872a0f11a1275914` | 〃 | ✗ |
| `journey_amb` | `de1feb24924b4bf5` | `e9096ef6900ea367` | 〃 | ✗ |
| `journey_ari` | `4286940b2a9991aa` | `89989dac41366ecf` | 〃 | ✗ |

## 다시 굽기 — 언제 되나
* **재민 #72 답 전엔 13곡 무변이다.** 11곡은 되찾을 코드가 없다 — 곡마다 "07-31 로 다시 굽기 / 지금 파이프라인 / 그대로"는 재민 귀가 정한다(브금판 #72 줄).
* 두 곡은 **같은 판 두 번의 차 안**일 때만 올린다. Python 굽기에서 그 차는 **0** 이다(바이트 동일 · Ogg 일련번호 한 칸만 배포 값으로 맞춘다 · T391). 브라우저 엔진의 같은 판 두 번 차는 이 상자의 떨림 바닥이다(RMS −93 ~ −85 dB · T411).
* 해시가 다른 새 소리는 올리지 않는다 — 표로만 남긴다.

## 아직 합성음인 악기
거문고 · 단소 · 피리 · 장구 채편 · **북** · 징 · 꽹과리 · 박.
* 장구 **궁편은 샘플**이다 — 배포 2곡은 궁편 실음원 6조각으로 84타씩 굽혔다(T411). 11곡은 미상이다.
* ⚠같은 증거가 거문고·단소·피리·장구 채편·(산조)대금에도 선다. 그 두 곡에서는 샘플이다(`render-meta.json` `_T391`). 이 목록은 아직 안 고쳤다.

## 게임에 반드시 표기할 것
    국악기 음원 제공 — 국립국악원 (공공누리 제1유형)

## R&D 보관소 · 지키는 시험
* `tools/_rnd_archive/`(14 폴더 · T422)는 **배포 밖**이다. 이미지는 `COPY server public sim` 만 싣고(`test-assets-audit ⑩`) `git archive` 에도 0 이다.
* 지키는 시험 — `test-bgm-phrase` 16 · `e2e-bgm-phrase` 12 · `test-daegeum-transition-bank` 8 · `test-assets-audit`(⑧ 바이트코드 · ⑨ legacy · ⑩ 보관소) · 그리고 `test-audio ⑨k·⑨l`(이 장의 합성음 목록 ↔ `render-meta.json`).

---

## 옛 문서 (T430 이전 — 지우지 않았다 · 제목 층만 내렸다)

### 두랑고 BGM — 실제 산조가야금 판

#### 무엇이 들어 있나
**13곡** × (.ogg + .m4a). 사파리는 ogg 를 못 열기 때문에 m4a 가 반드시 함께 있어야 한다.

    village_day_trad / village_day_amb / village_day_ari / village_day_jeongak
    village_night_trad / village_night_amb / village_night_ari
    battle_trad / battle_amb / battle_ari
    journey_trad / journey_amb / journey_ari

`_ari` 는 아리랑 선율이 들어간 판이고, `_jeongak` 은 **정악풍** 판이다(아래).

⚠이 문서가 오래 **12곡**이라 적고 있었다 — 커밋 `f75e8158`("정악대금 도입")이 곡은 넣고 문서·표를 안 고쳤다.
같은 결함의 흔적이 셋이다: 곡 수(T246 발견 · T257 수습) · `render-meta.json` 의 `seconds` 세 칸(T257) ·
악기 출처 칸(T292). ⇒ **`scripts/test-audio ⑨l` 이 이제 이 문서와 `render-meta.json` 을 맞대 놓는다.**

#### 가야금 소리의 출처
국립국악원 **산조가야금** 실제 녹음(공공누리 제1유형).
원본 21파일 → 조각 262개(주법 8종 × 세기 3층 × 12현).
12곡에서 가야금 음 1574개가 쓰였고 합성음으로 대체된 것은 0개.

주법: 지속음 · 얕은 농현 · 깊은 농현 · 꺾는 농현 · 추성 · 퇴김 · 굴림 · 글리산도.
농현은 사인파로 흉내내지 않는다 — 연주자가 실제로 흔든 녹음을 그대로 쓴다.

##### 게임에 반드시 표기할 것
    국악기 음원 제공 — 국립국악원 (공공누리 제1유형)

#### 조(調)를 왜 바꿨나
산조가야금 12현은 `G2 C3 D3 G3 A3 C4 D4 E4 G4 A4 C5 D5` — C 평조다.
곡이 다른 조로 쓰여 있으면 다섯 음 중 셋이 줄에 없어 매번 음을 늘려 써야 하고,
현악기는 음을 늘리면 통 울림까지 같이 늘어나 다른 악기 소리가 된다.
그래서 평조 곡은 으뜸음 G, 계면조 곡은 으뜸음 A 로 옮겼다(그때 12현과 정확히 일치한다).
결과: 음정 이동 최대 2.32반음 → 0.52반음(평균율 보정분뿐).

#### 정악판 — `village_day_jeongak`
같은 악보를 정악풍으로 옮긴 한 곡. **대금·가야금 둘 다 진짜 정악 악기 녹음이다**(국립국악원 「단음 다운로드」).
정악대금 5파일 → 조각 113 · 정악가야금 7파일 → 조각 100. 음색 보정(EQ)은 안 걸었다 — 진짜 악기라 기울일 이유가 없다.
바꾼 것: 소박 0.395→0.50초 · 깊은 농현 대신 요성(±8센트) · 맺음은 퇴성 · 여운 2.0초 · 장단에서 굴림 제거.
자세한 것은 `render_jeongak.py` 머리말.

#### 아직 합성음인 악기
거문고 · 단소 · 피리 · 장구 채편 · **북** · 징 · 꽹과리 · 박.
전투 계열 두 곡(battle_trad, battle_amb)은 가야금 편성이 아니라 전부 합성음이다.

⚠**대금은 절반만 합성이다** — 12곡에서는 합성이고 `village_day_jeongak` 에서만 실제 정악대금 녹음이다.
이 문서가 오래 "대금"을 이 목록에 넣어 두고 있었는데, 정악판이 들어온 뒤로는 **반만 맞는 말**이 됐다.
그리고 **북이 이 목록에서 빠져 있었다**(`compose.py` 세 자리에서 실제로 쓰이고 합성이다) — T292 가 채웠다.
⇒ `render-meta.json` 의 `source` 표가 이 절과 **같은 말을 해야 한다**(`test-audio ⑨l` 이 지킨다).

⚠**장구 궁편은 합성이 아니다**(T411 정정 · T391 실측) — 이 목록이 오래 "장구" 하나로 적고 있었다.
배포 두 곡(`village_day_trad`·`village_day_jeongak`)은 궁편 **실음원 6조각**(덩·쿵 × 강·중·약)으로 **84타씩** 굽혔다 —
다시 구우면 파일 바이트까지 같고, 장구 뱅크 없이는 `compose.py` 가 TypeError 로 죽는다(합성 장구로는 안 구워진다).
나머지 11곡은 **미상**이다(07-30 판 · 코드 없음 — #72). 그래서 목록은 **채편**만 남기고, `render-meta.json` 의
`janggu_gung` 칸은 두 사실을 한 줄에 적는다. ⚠같은 증거가 거문고·단소·피리·장구 채편·(산조)대금에도 선다 —
그 두 곡에서는 샘플이다(`render-meta.json` `_T391`). 이 목록은 그 다섯을 아직 고치지 않았다(T411 은 궁편 한 칸 · 회부).

#### 다시 만들려면
    python3 sampler.py scan samples_gaya   # 음원 색인
    python3 check_use.py samples_gaya      # 어떤 녹음이 쓰였는지 확인
    python3 render_samples.py samples_gaya # 12곡 렌더 → out_samples/

R&D 도구 — 쓰는 것·참고 10 폴더는 `tools/`, 버림 14 폴더는 `tools/_rnd_archive/`(T422 · **정본 아님** · 까닭과 되살리는 법은 그 폴더 README).
