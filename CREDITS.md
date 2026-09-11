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

## 2. 빌린 것

| 항목 | 무엇을 | 어디에 들어갔나 | 라이선스 | 요구 | 카드 |
|---|---|---|---|---|---|
| **CMU Graphics Lab Motion Capture Database** | 모션 캡처 다섯 클립(07_01 walk · 09_01 run · 80_71 chopping wood · 113_24 Throw · 77_02 standing) | `assets-src/mocap/*.bvh` → 리타깃 포즈표 → `public/assets/char/` 시트 192장 | 연구 자유 · **상업 제품에 포함 가능** · **데이터 자체의 재판매 금지**(변환본도) | **문구**(§1 첫 줄) | T96 · T155 |
| **cgspeed BVH 변환본** (Bruce Hahne, 2010 "Motionbuilder-friendly BVH conversion release") | 위 CMU 원본(ASF/AMC)을 BVH 로 옮긴 판 | 같은 파일 | 변환자가 **추가 제한을 두지 않는다**("I (Bruce) place no additional restrictions on the use of this particular BVH conversion") | 없음 — CMU 문구로 충분 | T96 |
| **una-dinosauria/cmu-mocap** (미러) | 위 변환본을 담은 GitHub 사본 — 이 저장소가 실제로 받은 자리(커밋 `09a07f54`) | 같은 파일 | 미러 · 위 둘을 따른다 | 없음 | T96 |
| **국립국악원 국악기 디지털 음원 — 「단음 다운로드」** | 실제 악기 녹음: 산조가야금(원본 21파일 → 조각 262) · 정악가야금 · 정악대금(5파일 → 조각 113) | `public/assets/audio/bgm/*.ogg`·`*.m4a` 12곡(가야금 음 1574개 · 합성 대체 0) | **공공누리 제1유형(출처표시)** — 상업 이용 가능 · 변형 가능 | **문구**(§1 둘째 줄) | 배치 시절(2026-07-29~31) |
| **npm 실행 의존성 다섯** | `express` 4 · `ws` 8 · `better-sqlite3` 12 · `pngjs` 7 · `acorn` 8 | 서버(`server/`) · 하네스 | 전부 **MIT** (각 패키지 `LICENSE` 실측) | 배포 시 라이선스 전문 동봉 | — |
| **SQLite** | `better-sqlite3` 가 품고 있는 엔진 | 서버 DB | **퍼블릭 도메인** | 없음 | — |
| **폰트** | `Noto Sans KR`·`IBM Plex Mono` 를 **이름으로만** 부른다 | `public/style.css` `--font`/`--mono` | — | **없음 — 파일을 배포하지 않는다** (`@font-face` 0 · 웹폰트 로드 0 · 없으면 시스템 글꼴로 떨어진다) | — |

### 그림은 전부 이 집에서 굽는다

배포 이미지 **612장 중 611장**이 이 저장소의 Blender 스크립트 산물이고 잠금표가 그 해시를 붙들고
있다(`public/assets/icons.lock.json` 419키 + `char/char_sheets.lock.json` 192키). 남은 한 장은
`public/assets/char/probeall_walk.png` — 탐침이 남긴 부스러기다(그림 자산이 아니다).
⇒ **지금 배포되는 그림 중 밖에서 온 것은 없다.**

---

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
