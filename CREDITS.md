# 크레딧 — 이 프로젝트가 빌린 것

듀랑고 미니(durango-mini)가 **밖에서 가져다 쓴 것**의 목록이다. 원칙 셋:

1. **찾은 것만 적는다.** 출처를 못 찾은 것은 §3 에 "미상"으로 둔다 — 지어내지 않는다.
2. **요구 문구는 그대로 옮긴다.** 라이선스가 특정 문장을 요구하면 §1 에 **원문 그대로** 둔다.
3. **이 파일이 정본이다.** 게임 안 `/크레딧` 은 §1 블록을 **읽어서** 띄운다(클라·서버에 사본 0).

---

## 1. 요구 문구 — 게임 안에 그대로 떠야 하는 줄

⚠**아래 두 표식 사이가 기계가 읽는 자리다**(`server/credits.js`). `- ` 로 시작하는 줄이
한 줄씩 알림이 된다. 줄을 고치면 게임에 뜨는 글자가 바뀐다 — 옮겨 적지 말고 여기서 고쳐라.

<!-- 요구문구:시작 -->
- The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.
- 국악기 음원 제공 — 국립국악원 (공공누리 제1유형)
<!-- 요구문구:끝 -->

알림 스택은 **세 줄**이다(`server/notice.js NOTICE_MAX = 3` 이 정본 · 클라 `50-i-panel.js` 가 같은 수를
쓴다). 지금 요구 문구는 둘이라 머리말 없이 딱 들어간다 — **머리말을 붙이면 한 줄이 밀려 사라진다.**

---


* **`deer_call`(사슴 울음) — CC BY 2.0 · 표시 필요** [T358]
  > Briefer E, Vannoni E, McElligott A (2010), *Quality prevails over identity in the sexually selected
  > vocalisations of an ageing mammal*, BMC Biology 8:35 — CC BY 2.0
  ⚠**이 집 첫 CC-BY 소리다.** 여태 효과음은 전부 PD/CC0 라 §1 에 줄이 없었다. 지우려면 음원을 바꿔야 한다.
* **`arrow_shoot`(활 쏨) — CC BY 3.0 · 표시 필요** [T387]
  > "Battle Sound Effects" (Bow.wav) by artisticdude — https://opengameart.org/content/battle-sound-effects — CC BY 3.0
  ⚠이 집 **둘째 CC-BY 소리**다. 게임 안 알림 스택(3줄) 밖이라 `deer_call` 과 같은 회부(게임 크레딧 화면)에 묶인다.
  후보 2번(`arrow_shoot_b` · PD)으로 바꾸면 이 줄이 필요 없다 — 재민 귀 판정이 이 줄의 운명도 정한다.
## 2. 빌린 것

| 항목 | 무엇을 | 어디에 들어갔나 | 라이선스 | 요구 | 카드 |
|---|---|---|---|---|---|
| **CMU Graphics Lab Motion Capture Database** | 모션 캡처 다섯 클립(07_01 walk · 09_01 run · 80_71 chopping wood · 113_24 Throw · 77_02 standing) | `assets-src/mocap/*.bvh` → 리타깃 포즈표 → `public/assets/char/` 시트 192장 | 연구 자유 · **상업 제품에 포함 가능** · **데이터 자체의 재판매 금지**(변환본도) | **문구**(§1 첫 줄) | T96 · T155 |
| **cgspeed BVH 변환본** (Bruce Hahne, 2010 "Motionbuilder-friendly BVH conversion release") | 위 CMU 원본(ASF/AMC)을 BVH 로 옮긴 판 | 같은 파일 | 변환자가 **추가 제한을 두지 않는다**("I (Bruce) place no additional restrictions on the use of this particular BVH conversion") | 없음 — CMU 문구로 충분 | T96 |
| **una-dinosauria/cmu-mocap** (미러) | 위 변환본을 담은 GitHub 사본 — 이 저장소가 실제로 받은 자리(커밋 `09a07f54`) | 같은 파일 | 미러 · 위 둘을 따른다 | 없음 | T96 |
| **국립국악원 국악기 디지털 음원 — 「단음 다운로드」** | 실제 악기 녹음: 산조가야금(원본 21파일 → 조각 262) · 정악가야금 · 정악대금(5파일 → 조각 113) | `public/assets/audio/bgm/*.ogg`·`*.m4a` **13곡**(가야금 음 1574개 · 합성 대체 0) — 12곡이라 적혀 있던 것을 T257 이 고쳤다(`village_day_jeongak` 누락 · T246 발견) | **공공누리 제1유형(출처표시)** — 상업 이용 가능 · 변형 가능 | **문구**(§1 둘째 줄) | 배치 시절(2026-07-29~31) |
| **npm 실행 의존성 다섯** | `express` 4 · `ws` 8 · `better-sqlite3` 12 · `pngjs` 7 · `acorn` 8 | 서버(`server/`) · 하네스 | 전부 **MIT** (각 패키지 `LICENSE` 실측) | 배포 시 라이선스 전문 동봉 | — |
| **SQLite** | `better-sqlite3` 가 품고 있는 엔진 | 서버 DB | **퍼블릭 도메인** | 없음 | — |
| **폰트** | `Noto Sans KR`·`IBM Plex Mono` 를 **이름으로만** 부른다 | `public/style.css` `--font`/`--mono` | — | **없음 — 파일을 배포하지 않는다** (`@font-face` 0 · 웹폰트 로드 0 · 없으면 시스템 글꼴로 떨어진다) | — |

### 그림은 전부 이 집에서 굽는다

배포 이미지 **612장 중 611장**이 이 저장소의 Blender 스크립트 산물이고 잠금표가 그 해시를 붙들고
있다(`public/assets/icons.lock.json` 419키 + `char/char_sheets.lock.json` 192키). 남은 한 장은
`public/assets/char/probeall_walk.png` — 탐침이 남긴 부스러기다(그림 자산이 아니다).
⇒ **지금 배포되는 그림 중 밖에서 온 것은 없다.**

---

## 2-b. 효과음 (`public/assets/sfx/`) [T262 조사 · T266·T269·T272·T282 확보 · **T354 재민 첫 귀 판정 뒤 재확보** · 2026-09-23]

**출처 없는 소리는 한 장도 없다.** 라이선스는 **파일마다 그 파일의 Commons 페이지에서 읽었다**(검색어의
"CC0" 는 안 믿는다 — T262 가 그렇게 검색된 늑대가 CC-BY 인 것을 잡았다).

| 키 | 출처(파일 페이지) | 작성자 | 라이선스 | 녹음/게시 | 받은 날 | 자른 구간 |
|---|---|---|---|---|---|---|
| `wind` | [Commons: 20090610 0 ambience.ogg](https://commons.wikimedia.org/wiki/File:20090610_0_ambience.ogg) (pdsounds #707 · 숲 나무둥치 녹음) | nille | **Public domain** | 2009-06-10 | 2026-09-23 | 123.43s 중 **29.0~41.0s** → 10.0s 반복(페이드 2s) · ★[T358] 재확보(재민 09-22 "그냥 공기 소리") · 까마귀 없는 창을 파고율로 골랐다(4.25 ↔ 까마귀 12.4) · 이음새 **−23.1 dB** |
| `fire` | [Commons: Dry grass burning in open fireplace.ogg](https://commons.wikimedia.org/wiki/File:Dry_grass_burning_in_open_fireplace.ogg) (pdsounds #3) | ezwa | **Public domain** | 2007-06-17 | 2026-09-23 | 25.50s 중 **12.48~24.48s** → 10.0s 반복 · ★[T358] **구간만 바뀌었다** — 옛 이음새 +5.3 dB(10초마다 탁) → **−41.6 dB** |
| `step_dirt` | [Kenney "RPG Audio"](https://kenney.nl/assets/rpg-audio) · `footstep07.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2023(팩) | 2026-09-23 | 통째(0.26s) · ★[T354] **파일이 바뀌었다** — 재민 09-22 가 옛 `step_grass` 를 흙이라 판정 |
| `step_grass` | [Kenney "RPG Audio"](https://kenney.nl/assets/rpg-audio) · `footstep05.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2023(팩) | 2026-09-23 | 통째(0.28s) · ★[T354] 새 파일 — 남은 여덟 중 가장 스치는 것(중심 2775Hz) |
| `axe` | [Kenney "RPG Audio"](https://kenney.nl/assets/rpg-audio) · `chop.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2023(팩) | 2026-09-13 | 통째(0.21s) |
| `eat` | [Commons: Chewing gum mouth close.ogg](https://commons.wikimedia.org/wiki/File:Chewing_gum_mouth_close.ogg) (pdsounds #159) | ezwa | **Public domain** | 2007-04-19 | 2026-09-23 | 14.92s 중 **2.00~2.35s** · ★[T354] 재확보(재민 09-22 — 옛 것은 합성 팩) |
| `water` | [Commons: 433589 jackthemurray stream-river-water-up-close.wav](https://commons.wikimedia.org/wiki/File:433589_jackthemurray_stream-river-water-up-close.wav) (원천 freesound 433589) | jackthemurray | **CC0 1.0** | 2018-06-22 | 2026-09-23 | 68.89s 중 **20.0~32.0s** → 이음새 겹쳐 10.0s 반복(페이드 2s · 이음새 실측 **−8.5 dB**) · ★[T354] 재확보(재민 09-22) |
| `rain` | [Commons: Rain (1).ogg](https://commons.wikimedia.org/wiki/File:Rain_(1).ogg) (pdsounds #6) | ezwa | **Public domain** | 2008-11-13 | 2026-09-13 | 44.96s 중 **30.0~41.0s** → 10.0s 반복 |
| `bird` | [Commons: Birds singing in garden.ogg](https://commons.wikimedia.org/wiki/File:Birds_singing_in_garden.ogg) (pdsounds #1) | ezwa | **Public domain** | 2007-04-18 | 2026-09-13 | 49.48s 중 **1.0~12.0s** → 10.0s 반복 |
| `bronze_hit` | [Commons: Dull thud.ogg](https://commons.wikimedia.org/wiki/File:Dull_thud.ogg) (pdsounds #7) | gregoryweir | **Public domain** | 2009-07-04 | 2026-09-13 | 통째(0.32s) · ⚠재료는 출처가 안 말한다(아래) |
| `cast` | [Commons: Bathtub water splashes.ogg](https://commons.wikimedia.org/wiki/File:Bathtub_water_splashes.ogg) (pdsounds #7) | gradha | **Public domain** | 2009-07-23 | 2026-09-13 | 48.12s 중 **7.0~8.2s** |
| `bite` | 〃 (같은 원본의 다른 사건) | gradha | **Public domain** | 2009-07-23 | 2026-09-13 | 48.12s 중 **37.9~38.9s** |
| `hook` | 〃 (같은 원본의 다른 사건) | gradha | **Public domain** | 2009-07-23 | 2026-09-13 | 48.12s 중 **24.8~26.2s** |
| `deer_call` | [Commons: …ageing-mammal…S3.ogg](https://commons.wikimedia.org/wiki/File:Quality-prevails-over-identity-in-the-sexually-selected-vocalisations-of-an-ageing-mammal-1741-7007-8-35-S3.ogg) (논문 부록 · 다마사슴) | Briefer E, Vannoni E, McElligott A | **CC BY 2.0** | 2010 | 2026-09-23 | 4.30s 중 **1.35~1.78s**(울음 하나) · ★[T358] 재확보 — 옛 것은 **와피티 울음**(재민 "울부짖는 거 말고") |
| `tiger_growl` | [Commons: 439280 schots angry-tiger.wav](https://commons.wikimedia.org/wiki/File:439280_schots_angry-tiger.wav) (원천 freesound 439280) | schots | **CC0** | 2018-08-31 | 2026-09-13 | 65.64s 중 **11.00~13.00s** · 출처가 `Panthera tigris` 라 적는다 |
| `wolf_howl` | [Commons: Wolf howls.ogg](https://commons.wikimedia.org/wiki/File:Wolf_howls.ogg) (원천 fws.gov) | U.S. Fish and Wildlife Service | **Public domain** (PD-USGov-FWS) | 날짜 미상(페이지가 안 적는다) | 2026-09-23 | 28.32s 중 **1.00~3.90s** · ★[T354] 재확보(재민 09-22 "최악") |
| `step_stone` | [Kenney "RPG Audio"](https://kenney.nl/assets/rpg-audio) · `footstep04.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2023(팩) | 2026-09-23 | 통째(0.32s) · ★[T354] 새 키 — 재민 09-22 "돌바닥 걷는 소리야"(옛 `step_dirt`) |
| `harvest` | [Kenney "RPG Audio"](https://kenney.nl/assets/rpg-audio) · `knifeSlice.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2023(팩) | 2026-09-23 | 통째(0.60s) · ★[T354] **T283 이후 무음이던 자리를 채웠다** |
| `drop` | [Kenney "RPG Audio"](https://kenney.nl/assets/rpg-audio) · `dropLeather.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2023(팩) | 2026-09-23 | 통째(0.42s) · ★[T354] 새 키 — 낙하가 곡괭이질과 **겸업을 끊었다**(#50) |
| `boar_grunt` | [OpenGameArt: 80 CC0 creature SFX](https://opengameart.org/content/80-cc0-creature-sfx) · `grunt_02.ogg` | rubberduck | **CC0** (페이지 License 칸) | — | 2026-09-23 | 통째(0.53s) · ★[T354] 무음이던 자리 · ⚠**합성 팩**(진짜 멧돼지 PD/CC0 녹음 없음 — 아래) |
| `rain_light` | [Commons: Listening to Raindrops (1035382 - drizzle loop).mp3](https://commons.wikimedia.org/wiki/File:Listening_to_Raindrops_(1035382_-_drizzle_loop).mp3) | NASA | **Public domain** (NASA) | 2000-06-14 게시 | 2026-09-23 | 49.08s 중 **5.0~17.0s** → 10.0s 반복(이음새 실측 **−15.5 dB**) · ★[T354] 새 키 — 재민 09-22 "가벼운 빗소리도" |
| `rock_hit` | [OpenGameArt: 75 CC0 breaking/falling/hit SFX](https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx) · `bfh1_rock_hit_01.ogg` | rubberduck | **CC0** (페이지 License 칸) | — | 2026-09-23 | 통째(0.13s) · ★[T358] 새 키 — 돌·광석·운석 때리기가 `bronze_hit`(둔탁한 쿵 · 저역 91%)에서 갈라져 나왔다(중심 4186Hz) |
| `tiger_growl2` | [Commons: 439280 schots angry-tiger.wav](https://commons.wikimedia.org/wiki/File:439280_schots_angry-tiger.wav) (**같은 원본의 다른 으르렁**) | schots | **CC0** | 2018-08-31 | 2026-09-23 | 65.64s 중 **3.90~5.15s** · ★[T358] 변주 |
| `tiger_growl3` | 〃 (같은 원본의 또 다른 으르렁) | schots | **CC0** | 2018-08-31 | 2026-09-23 | 65.64s 중 **9.60~10.75s** · ★[T358] 변주 — 다른 팩에서 뜨면 **다른 짐승**으로 들린다 |
| `ui_click` | [Kenney "RPG Audio"](https://kenney.nl/assets/rpg-audio) · `bookPlace1.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2023(팩) | 2026-09-13 | 0.30s 중 **0.020~0.280s**(선행 무음 잘라 냄) · **후보**(훅 없음) |
| `arrow_shoot` | [OpenGameArt: Battle Sound Effects](https://opengameart.org/content/battle-sound-effects) · `Bow.wav` | artisticdude | **CC BY 3.0** (페이지 라이선스 칸 · **표시 필요**) | 2012(게시) | 2026-09-25 | 0.55s 중 **0.099~0.337s**(머리 무음 잘라 냄) · ★[T387] 새 키 — 쏨(`arrow_spawn`) · 후보 1번 |
| `arrow_shoot_b` | [Commons: Deep twang of loose bow string.ogg](https://commons.wikimedia.org/wiki/File:Deep_twang_of_loose_bow_string.ogg) | stephan | **Public domain** (파일 페이지) | — | 2026-09-25 | 11.49s 중 **0.384~1.400s**(첫 튕김 · 꼬리 0.25s 페이드) · ★[T387] **후보 2번**(훅 없음) |
| `swing` | [OpenGameArt: Swish – bamboo stick weapon swhoshes](https://opengameart.org/content/swish-bamboo-stick-weapon-swhoshes) · `swosh-01.flac` | qubodup | **CC0** (페이지 라이선스 칸) | — | 2026-09-25 | 통째(0.27s) · ★[T387] 새 키 — 휘두름(`player_attacked` · 공격자) · 후보 1번 |
| `swing2` | 〃 · `swosh-07.flac`(**같은 녹음의 다른 휘두름**) | qubodup | **CC0** | — | 2026-09-25 | 통째(0.33s) · ★[T387] 변주 |
| `swing3` | 〃 · `swosh-25.flac` | qubodup | **CC0** | — | 2026-09-25 | 통째(0.26s) · ★[T387] 변주 |
| `swing_b` | [OpenGameArt: Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack) · `swish-9.wav` | artisticdude | **CC0** (페이지 라이선스 칸) | — | 2026-09-25 | 0.20s 중 **0.028~0.148s** · ★[T387] **후보 2번**(훅 없음) |
| `downed` | [Kenney "Impact Sounds"](https://kenney.nl/assets/impact-sounds) · `impactPunch_heavy_000.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2019(팩) | 2026-09-25 | 0.65s 중 **0.000~0.380s** · ★[T387] 새 키 — 쓰러짐(`player_downed`) · 후보 1번 |
| `downed_b` | 〃 · `impactSoft_heavy_000.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2019(팩) | 2026-09-25 | 0.51s 중 **0.000~0.406s** · ★[T387] **후보 2번** — 중심 90Hz(노트북 스피커에선 거의 안 난다 · 헤드폰 판정) |
| `wake_up` | [Kenney "RPG Audio"](https://kenney.nl/assets/rpg-audio) · `cloth1.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2023(팩) | 2026-09-25 | 0.66s 중 **0.030~0.554s** · ★[T387] 새 키 — 깨어남(`player_respawn` · 일어서는 옷 스침) · **후보 1개뿐** — 깨어나는 숨은 못 찾음(녹음 회부) |
| `hit_body` | [Kenney "Impact Sounds"](https://kenney.nl/assets/impact-sounds) · `impactPunch_medium_001.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2019(팩) | 2026-09-26 | 0.40s 중 **0.000~0.218s** · ★[T397] 맞음 1번 · ★[T402] **배선** — `hpWhy` arrow·mob·player·fall·wild |
| `hit_body_b` | 〃 · `impactPunch_medium_003.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2019(팩) | 2026-09-26 | **0.000~0.228s** · ★[T397] 맞음 2번 · 후보 |
| `step_floor` | [Kenney "Impact Sounds"](https://kenney.nl/assets/impact-sounds) · `footstep_carpet_003.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2019(팩) | 2026-09-26 | **0.000~0.067s** · ★[T397] 새 키 — 실내 바닥(`surface.floor`) · 1번 |
| `step_floor_b` | 〃 · `footstep_wood_003.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2019(팩) | 2026-09-26 | **0.000~0.074s** · ★[T397] 2번 · 후보 — 중심 171Hz(헤드폰 판정) |
| `step_yard` | [Kenney "Impact Sounds"](https://kenney.nl/assets/impact-sounds) · `footstep_concrete_000.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2019(팩) | 2026-09-26 | 통째(0.10s) · ★[T397] 새 키 — 마당 타일(`surface.vtile`) · 1번 |
| `step_yard_b` | [Kenney "RPG Audio"](https://kenney.nl/assets/rpg-audio) · `footstep02.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2023(팩) | 2026-09-26 | **0.010~0.212s** · ★[T397] 2번 · 후보 |
| `step_farm` | [Kenney "RPG Audio"](https://kenney.nl/assets/rpg-audio) · `footstep09.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2023(팩) | 2026-09-26 | **0.002~0.215s** · ★[T397] 새 키 — 밭(`surface.farmland`) · 1번 |
| `step_farm_b` | [Kenney "RPG Audio"](https://kenney.nl/assets/rpg-audio) · `footstep06.ogg` | Kenney Vleugels (Kenney.nl) | **CC0 1.0** (팩 안 `License.txt`) | 2023(팩) | 2026-09-26 | **0.000~0.208s** · ★[T397] 2번 · 후보 |
| `thunder` | [Commons: Thunder and rain on a v.ogg](https://commons.wikimedia.org/wiki/File:Thunder_and_rain_on_a_v.ogg) | ezwa | **Public domain** (파일 페이지) | — | 2026-09-26 | 30.17s 중 **5.800~8.800s** · ★[T397] 후보 — 훅 없음(세계가 천둥을 안 보낸다) |
| `thunder_b` | [Commons: Rain and thunder (1).ogg](https://commons.wikimedia.org/wiki/File:Rain_and_thunder_(1).ogg) | ezwa | **Public domain** (파일 페이지) | — | 2026-09-26 | 60.08s 중 **3.400~6.400s**(+20.7dB) · ★[T397] 후보 |
| `water_pool` | [Commons: Water bubbles chortling.ogg](https://commons.wikimedia.org/wiki/File:Water_bubbles_chortling.ogg) | stephan | **Public domain** (파일 페이지) | — | 2026-09-26 | **35.75~43.75s** + 1.0s 겹침 → 8.0s 반복(이음새 −49.8dB) · ★[T397] 후보 |
| `water_pool_b` | [Commons: Water over rocks as tide recedes.ogg](https://commons.wikimedia.org/wiki/File:Water_over_rocks_as_tide_recedes.ogg) | earthcalling | **Public domain** (파일 페이지) | — | 2026-09-26 | **1.50~9.50s** + 1.0s 겹침 → 8.0s 반복(−24.5dB) · ★[T397] 후보 |

* **요구 문구 없음** — 둘 다 퍼블릭 도메인이라 표시 의무가 없다(그래서 §1 에 안 들어간다). 예의로 여기 적는다.
* 가공: 단일 채널 유지 · 끝 1초를 머리에 `acrossfade`(삼각창)로 겹쳐 10.0초 반복 · 피크를 재고
  −1 dBFS 로 맞춘 뒤 `.ogg`(Vorbis q4) + `.m4a`(AAC 96k). 명령은 `보고/T266_2026-09-13.md` §0-ⓒ.
* ⚠**`step_dirt`/`step_grass` 의 지면은 가설이다.** Kenney 팩의 `footstep00~09` 에는 **무슨 바닥인지 적혀 있지 않다.**
  스펙트럴 중심(밝기)이 가장 낮은 `04`(1,007 Hz)를 흙, 가장 높은 `07`(2,189 Hz)을 풀로 잡았다 —
  둔한 소리가 흙, 서걱이는 소리가 풀이라는 **음향적 가정**이지 출처가 그렇게 말한 것이 아니다. **판정은 재민 귀.**
* ⚠**`bronze_hit` 의 재료도 가설이다.** 출처 제목은 *"Dull thud"* 이고 **무엇을 친 것인지 안 적혀 있다.**
  쇠의 긴 울림인지만 잤다 — 4kHz 이상이 정점에서 −20 dB 까지 **139 ms**(진짜 울리는 `metalPot1` 302 ms 의 절반 ·
  `axe` 58 ms 보다는 길다). "긴 울림"은 아니지만 청동이냐 돌이냐는 **자로 못 가른다. 판정은 재민 귀.**
* ⚠**낚시 셋(`cast`·`bite`·`hook`)은 한 원본의 서로 다른 물튀김 셋**이다. 어느 것이 던짐/입질/걸림인지
  **출처가 말하지 않는다** — 크기로 갈랐다(큰 것=걸림 −3.63 dB · 중간=던짐 −3.82 · 작은 것=입질 −7.53). 재민 귀.
* ⚠**`deer_call` 의 종은 와피티(엘크 · _Cervus canadensis_)다 — 바꿔 부르지 않는다.** 한반도 사슴은
  _Cervus nippon_(대륙사슴)·노루인데 Commons 의 그 둘은 PD/CC0 가 아니다(`Sika Deer (Cervus nippon) …` 는
  CC BY-SA 4.0). 사슴과(Cervidae)의 실제 울음이고 출처가 종을 적어 뒀다 — **울음이 이것으로 맞는지는 재민 귀.**
  ⚠원본이 이미 0 dBFS 에 붙어 있었고(0dB 표본 194개) 표본율이 11,025 Hz 다 — **깎아서** −1 로 맞췄고 올려 굽지 않았다.
* **`wolf_howl` 은 울부짖음(howl)이다 — 자로 갈랐고 [T303] 키 이름을 파일에 맞췄다.** 같은 자를 둘에 댔다:

  | | 중심주파수 | 평탄도(1=잡음·0=순음) | 500Hz 아래 |
  |---|---:|---:|---:|
  | `wolf_howl`(이 파일) | 1,100~1,240 Hz | 0.0002 | **0.4%** |
  | `tiger_growl`(이 파일) | **226~426 Hz** | 0.0020~0.016 | **71~97%** |

  종은 맞다(_Canis lupus_ · 유럽 늑대 · 녹음자 이름·날짜 있음) — **이름만 어긋났고 [T303 · 재민 위임 → PM 2026-09-18]
  키를 `wolf_howl` 로 바꿨다** — 파일 바이트는 **0 변경**이다(sha1 `d9176d70…`/`bede1a0f…` 그대로 · 잠금 값도 그대로). T262/T269 가 물린 것들과는 다르다: OGA "Wolf Monster Sound"(제 설명이 *말 콧김 가공*)와
  이 프로젝트가 쓰는 rubberduck 팩의 `howl.ogg`(페이지가 *"i created"* 라 적는 창작 괴물 소리)는 **늑대가 아니다.**
* ⚠**`tiger_growl` 의 잔향은 원본의 것이다.** 출처가 스스로 *"Tiger in a cage, ... Lots of reverb"* 라 적는다.
  빼지 않았다 — 잔향을 지우면 원본을 고치는 것이다.
* `ui_click` 은 **후보**다(훅 없음 · "있어야 하나"는 재민). 후보 셋을 **같은 자**로 재서 골랐다:
  `bookPlace1` 선행 6.0ms·SNR **38.8 dB** ← 골랐다 · `bookClose` 선행 72.9ms·SNR 29.6 · [`Woodpecker tapping`
  (USFWS · PD)](https://commons.wikimedia.org/wiki/File:Woodpecker_tapping.ogg) 선행 14.5ms·SNR **10.1 dB**.
  딱따구리가 "진짜 나무 두드림"이라 먼저 골랐다가 **자가 뒤집었다** — 숲 바닥이 같이 오고 정점이 116ms 뒤에 온다.
* `axe` 의 고증은 **쟀다** — 4kHz 이상 대역이 정점에서 −20 dB 로 떨어지는 데 **58 ms**(같은 팩의 `metalPot1` 은 **302 ms**).
  쇠처럼 울리지 않는다. 돌·청동 도끼인지까지는 자로 못 가른다.
* ⚠`wind` 원본에는 **새소리(Blackcap·Chaffinch)가 있다.** 그래서 자를 자리를 귀가 아니라 **자로** 골랐다 —
  2kHz 이상 대역 에너지 비율이 가장 낮은 10초 창(**0.02%** · 파일 평균 0.07% · 최악 창 0.40%).
  그래도 새가 아주 없다고는 못 한다 — **실기(듣기)는 재민**이다.

## 3. 출처 미상 — 회부(재민 판정)

지어내지 않는다. 아래 둘은 저장소에 있지만 **어디서 왔는지 기록이 없다.**

| 파일 | 무엇 | 지금 쓰이나 | 무엇이 없나 |
|---|---|---|---|
| `assets-src/rd-nature-sheet.png` (37.9 KB · 2026-07-27 커밋 `6ec41689` "브라우저 경유 업로드") | 자연물 스프라이트시트(바위·광맥·덤불·약초) | **안 쓴다** — 참조는 `40-r2-sprites.js` 주석 한 줄뿐이고, 배포 중인 `nature/` 44장은 T101 이 Blender 로 다시 구운 것이다 | 생성 도구·라이선스·저작자 |
| `assets-src/legacy_mac/leaf.png` (2026-06-24 · 맥에서 옮겨 옴) | 잎 텍스처 | **배포에는 안 쓴다** — 참조는 보관된 `legacy_mac/*.py` 뿐(그 스크립트가 굽던 바위 12장도 T101 이 대체했다) | 출처·라이선스 |

두 파일은 게임에 나가지 않는다. 다만 **저장소를 공개하면 같이 나간다** — 지울지 출처를 찾을지는 재민 몫.

---

## 4. 더는 안 쓰는 것 (기록으로만)

* **Kenney Nature Kit** — 나무 스프라이트 1판이 이 로우폴리 에셋의 recolor 였다. 재민 확정
  "전면 통일" 로 **Blender 정본 씬에서 12종을 전부 다시 구웠다**(배치19 · `nature_render.py`).
  ⇒ 배포본에 Kenney 파일은 **0장**이다. `public/client/40-r2-sprites.js:111` 의 괄호는 그때 남은
  낡은 주석이다(이 카드는 코드를 안 건드린다 — 회부).

## 5. 도구 — 배포하지 않는다

Blender / `bpy` 5.0.1(굽기) · numpy · scipy(BGM 합성) · Pillow(광맥 파생) · Playwright/Chromium(하네스).
산출물은 이 프로젝트 것이고, 도구 자체는 배포물에 들어가지 않는다.

## 6. 아직 아닌 것

* **MPFB / MakeHuman** — 소체 후보로 **재 보기만 했다**(T111 · 배포 0). 채택 판정이 나면 그때 §2 에 넣는다.

---

## 7. 라이선스 충돌 — 상업 배포 시

| 무엇 | 조항 | 지금 상태 | 판정 |
|---|---|---|---|
| CMU 모캡 | "you may not **resell this data directly**, even in converted form" | 이 저장소는 `assets-src/mocap/` 에 **원본 BVH 다섯을 그대로 담아** 배포한다. 게임이 파는 것은 시트(파생물)이지 데이터가 아니지만, **저장소 공개·유료 배포 시 BVH 자체가 함께 나간다** | ⚠**재민 판정** — 게임만 팔면 문제 없다(상업 제품 포함은 허용). 원본 BVH 를 뺄지(포즈표만 남긴다) 둘지가 결정할 일 |
| CMU 모캡 | 문구 표시 | `/크레딧` 이 §1 에서 읽어 띄운다 | ✅ |
| 국립국악원 | 공공누리 1유형 = 출처표시 | 같은 자리 | ✅ 상업·변형 모두 허용 |
| npm 다섯 | MIT = 라이선스·저작권 표시 동봉 | 지금은 `node_modules` 안에만 있다 | ⚠ 바이너리로 묶어 팔면 **전문 동봉**이 필요하다(소스 배포면 그대로 따라간다) |
| 폰트 | — | 파일을 안 배포한다 | ✅ 의무 없음 |
| 효과음 둘(§2-b) | 퍼블릭 도메인 = 조건 없음 | `public/assets/sfx/` 에 배포한다 | ✅ 상업·변형 모두 허용 · 표시 의무 없음 |
| 출처 미상 둘(§3) | 알 수 없다 | 배포 이미지에는 안 들어간다 | ⚠ 저장소 공개 전 정리 — 재민 |

---

## 8. 참고문헌 — **게임 크레딧이 아니다**

수치 앵커의 출처다. 라이선스가 아니라 **어디서 온 수인지**를 밝히는 자리이고, 정본은 각 코드
주석과 인계 문서다(여기 것은 목록일 뿐).

| 출처 | 무엇의 앵커 | 자리 |
|---|---|---|
| TB MED 508 *Prevention and Management of Cold-Weather Injuries* | 저체온·동상 | `server/body.js` · `인계/B-신체서버.md` |
| Havenith et al. 2008, *Eur J Appl Physiol* 103(1):23–31 | 같은 방향의 독립 실측(체열) | `server/body.js` |
| Oswald · Proto · Sgroi 2015 | 행복 → 작업량 계수 | `sim/economy-sim.js` · `lab/README.md` · T157 |
| Gregory Clark, *UC Davis Econ 210A · Ch.4 "The Malthusian Economy"* | 맬서스 경제 | `sim/economy-sim.js` |
| Mellish et al. 2014, *Southeastern Naturalist* 13(2):367–376 | 야생돼지 회복률 | T144 · T146 |
| Lee et al. 2018 | 소나무 그루터기 22 → 성목 52년 | T135 |
| Sheng & Cai 2019 | 혼효림 덮임 22% | `scripts/test-body.js` |
| 기상청 *Climatological Normals of Korea (1991~2020)* — https://data.kma.go.kr/normals/ | 월별 기온·강수 | `인계/K-달력온도.md` |

---

## 링크

* CMU Graphics Lab Motion Capture Database — http://mocap.cs.cmu.edu
* cgspeed BVH conversion release — https://sites.google.com/a/cgspeed.com/cgspeed/motion-capture/the-motionbuilder-friendly-bvh-conversion-release-of-cmus-motion-capture-database
* 미러 — https://github.com/una-dinosauria/cmu-mocap
* 국립국악원 국악기 디지털 음원 — https://www.gugak.go.kr/digitaleum
* 공공누리 이용조건 — https://www.kogl.or.kr/info/license.do
