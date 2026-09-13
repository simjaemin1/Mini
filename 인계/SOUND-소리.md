# 인계 — SOUND 소리 (세션9)

> 영역: `public/client/48-a-audio.js` · `public/assets/sfx/**` · `public/assets/audio/bgm/`(잇기만 · 음원 무변)
> · `CREDITS.md` 소리 절 · `scripts/test-audio.js` · 이 파일.
> 다른 영역에 쓸 말은 `인계/회부.md` 에 한 줄. `공통.md`·`README.md` 는 PM 만.
> 세운 카드: **T261**(2026-09-13 · 층 하나 · BGM · 첫 8종의 자리).

---

## 0. 한 줄

**소리가 난다.** 층·키 표·훅 4곳·하네스가 서고 BGM 은 실제로 울린다.
효과음 **8종 중 6종이 이어졌다**(`step_dirt`·`step_grass`·`fire`·`wind`·`eat`·`axe` —
음원은 T266·T269 가 확보해 뒀다). 미확보 둘(`wolf_growl`·`harvest`)은 **무음**이고 빨강이 아니다.

⚠**이 카드는 25 커밋 뒤에 착지했다.** T261 이 도는 동안 T262·T266·T269·T272 가 먼저 들어가
음원 13개와 `asset-lock`·`test-assets-audit` 확장을 이미 해 뒀다. 그래서 이 문서는
"세션9 가 붙인다"고 저쪽이 적어 둔 자리들을 **실제로 붙인 뒤**의 상태다.

## 1. §0 실측 — 카드의 전제 둘이 틀렸다

| 카드가 말한 것 | 실측 |
|---|---|
| "BGM 은 **음원 13곡 + 완성 재생기**다. 배선만 없다" | **재생기가 파일을 안 받는다.** `bgm.js` 는 `DurangoBGM.create/start/setScene/setMood/setIntensity/setDayPhase/setVolume` 인 **절차적 Web Audio 엔진**이다(악보·장단·아리랑 16마디가 코드 안에 있다). 디스크의 13곡(.ogg/.m4a)은 `compose.py` 가 그 엔진을 **오프라인으로 뽑아 둔 것**이고 **런타임이 한 장도 안 읽는다**. ⇒ "잇기"는 파일을 트는 것이 아니라 엔진을 부르는 것이다. |
| "`50-i-panel` 의 **있는 설정 자리**에 볼륨 칸 셋을 한 줄로" | **설정 자리가 없다.** `public/` 전수에 '설정'·'옵션'·'볼륨' 0곳. ⇒ 남의 파일에 패널을 짓지 않고 소리 층이 **제 칸을 제가** 만든다(오른쪽 아래 `소리` 단추 + `Shift+Y`). 다른 파일 0줄. |
| "수확·먹기·도끼질 훅은 **서버 동사 결과가 오는 `30-n-net.js` 핸들러**" | **그런 메시지가 없다.** `doEat`·`tryHarvest`·`gatherResource` 전수 — 서버는 동사별 결과 타입을 안 보내고 `notice`·`gauges`·`inventory`·`resource_removed` 같은 **공용** 메시지만 낸다. 공용 메시지에 붙이면 **남이 한 일에도 소리가 난다**. ⇒ 발신 정본 한 자리(`sendPrimary`)에 붙였다. 맞바꿈은 **거절당한 동사도 소리가 난다**는 것. ⇒ 회부. |

그리고 카드가 맞힌 것: 클라에 재생 문이 **0** 이었다(`AudioContext`·`<audio`·`.play(` 전부 0곳).
`회부/회부_낚시_다음층.md` A-6 의 "BGM 미배선 유지가 캐논"은 **재민이 09-13 T261 로 뒤집었다**(그 줄을 이 카드가 갱신했다).

## 2. 규약 — 남이 지켜야 할 것

### ★키 표가 정본이다 — `public/assets/sfx/manifest.json`
수는 **코드에 하나도 없다**. 볼륨·반경·반복·동시상한·쿨다운·감쇠식·버스 기본값·저장 키·BGM 페이드까지 전부 표다.
소리를 더하려면 **표에 키를 세우고 훅 한 줄**을 붙인다 — 코드를 고치는 것이 아니다.

```
keys.<key> = {
  file,        // 파일 이름(`public/assets/sfx/` 기준) 또는 null(=미확보 · 무음 · 빨강 아님)
  volume,      // 0..1 (효과음 버스 앞단)
  radius,      // 월드 px (32px = 1셀) · 0 = 위치 없는 소리
  loop,        // true = 환경음(개체마다 하나 · 화면 밖이면 멎는다)
  maxSame,     // 같은 키가 동시에 겹칠 수 있는 수(발자국 겹침 방지)
  cooldownMs,  // 같은 키의 최소 간격
  source,      // sources 의 id 또는 null
  gainK?       // 세기를 볼륨으로 옮기는 계수(바람만 씀 · 1.4 = WX_TILT_K 와 같은 수)
}
sources.<id> = { license, url, author, received }   // 네 칸 전부 — 하나라도 비면 하네스가 문다
```

* **감쇠는 `linear` 하나**다: `g = volume × max(0, 1 − d/radius)`. 역제곱을 안 고른 이유는 표에 적혀 있다
  (반경 밖이 **정확히 0** 이라 값이 하나다 — 역제곱은 컷오프를 또 정해야 해서 값이 둘이 된다).
* **미확보(`file: null`)는 빨강이 아니다.** "출처 없는 소리 0" 은 *나는* 소리에 걸린 규약이다.
  안 나는 키를 빨갛게 하면 음원이 들어오기 전까지 CI 가 계속 빨간데, 그건 결함이 아니라 순서다
  (`test-assets-audit ③` 의 "고아 표는 빨강이 아니다"와 같은 사고).

### ★음원 꼴 (T262·T266·T269 가 이미 이 꼴로 넣었다 — 다음 묶음도 같다)
* `.ogg` + `.m4a` **쌍** · 자리는 `public/assets/sfx/<key>.{ogg,m4a}`
* 단발 ≤ **3초** · 반복 ≤ **10초**(이음새) · 파일당 ≤ **150KB** (실측 최대 `water.ogg` 127.6KB)
* ★표는 **파일 이름을 그대로** 적는다(`"file": "wind.ogg"` — 어간 `wind` 가 아니다). 두 이유가 겹친다:
  ⓐ `asset-lock.keyOf` 가 소리만 **파일 이름을 키로** 쓴다(한 소리에 두 파일 — T266 이 거짓 빨강 둘로 배웠다).
  ⓑ `test-assets-audit` 이 `ogg`·`m4a` 를 **어간 대조에서 뺐다**(`wind`·`fire`·`eat`·`axe` 는 짧은 영단어라
     코드 아무 데나 걸려 "쓰는 데 없는데 쓰임 있음"이 됐다). **이름이나 URL 로 불러야** 고아가 풀린다.
* ★`.m4a` 는 `fileAlt` 로 같이 적는다. 장식이 아니다 — **사파리는 Ogg Vorbis 를 안 튼다.**
  층이 `canPlayType` 으로 **브라우저에게 물어보고** 고른다(짐작 0 · `test-audio ④` 가 그 한 줄이 있는지 본다).
* `sources.<id>` 네 칸(라이선스·URL·작성자·받은 날)을 채우고 **같은 값을 `CREDITS.md` §2-b 에** 둔다
  (크레딧 절은 세션8/ART 몫 — T261 은 안 건드렸다. 표 둘이 어긋나면 사람이 본다).
* 코드 수정은 **0** 이다. 파일이 들어오면 그대로 난다 — 6종이 실제로 그렇게 이어졌다.

### ★훅 규약 — 남의 파일엔 줄 하나 · 로직 0
훅은 `window.__sfx && window.__sfx.<메서드>(…)` 한 줄이고, **무엇이 울릴지는 소리 층이 고른다**.
`scripts/test-audio.js ③` 이 **파일당 두 줄 이상이면 문다**.

| 파일 | 줄 | 메서드 | 키 |
|---|---|---|---|
| `public/client/30-n-net.js` | `sendPrimary` 안 | `verb(obj.type)` | `eat` · `harvest` · `axe` |
| `public/client/42-r2-char.js` | `drawCharSprite` 안 | `step(clip, frame)` (`isMe` 일 때만) | `step_dirt` · `step_grass` |
| `public/client/34-m-renderloop.js` | `renderables.sort` 다음 | `scan(renderables, worldCx, worldCy)` | `wolf_growl` · `fire` |
| `public/client/37-r1-weather.js` | `drawWeather` 안 | `ambient('wind', w.wind, {indoor})` | `wind` |
| `public/client/99-main.js` | `boot()` 다음 | `initAudio()` — **입구 한 줄** | — |

* 전역은 `window.__sfx` **하나**다. `test-client-globals` 는 **기준선을 안 늘렸다**(아래 §3).
* `48-a-audio.js` 는 **최상위 실행문 0** 이다 — 실려도 아무 일이 안 난다. 실행은 `99-main` 한 자리(T0-b).
* **`AudioContext` 는 첫 사용자 제스처(pointerdown·keydown·touchstart)에서만 난다.**
  `test-audio ④` 가 정적으로 검사한다(`new AC()` 는 `sfxWake` 안에만 있어야 한다).

### ★사본 금지 — 이 층이 부르는 정본들
| 알고 싶은 것 | 부르는 정본 | 지어내지 않은 것 |
|---|---|---|
| 발밑이 흙이냐 풀이냐 | `window.__tileStateAt(lcx,lcy)` + `SoilBase.biomeOf(존 바이옴).grass` 램프 | 문턱을 새로 짓지 않았다 — 클라가 **땅을 그릴 때 쓰는 그 자**다 |
| 내 자리 | `myAbsPredicted` | — |
| 밤이냐 | `isNight()` (20-r2-visibility) | — |
| 마을 안이냐 | `window.__evNearVid` (41-h-bubble · 260px) | 마을 술어를 새로 짓지 않았다 |
| 바람 | `wxState().wind` (server/wind.js `seasonWind` 의 부호 있는 계절풍) | 계수 1.4 는 빗줄기가 이미 쓰는 `WX_TILT_K` 와 **같은 수** |
| 발 딛는 판 | `char_meta.json` 의 clip frames (판 0 과 판 n/2) | 새 타이머 0 — 간격은 애니 fps 가 정한다 |

### ★BGM — 엔진을 부른다(재구현 0 · 재생기 수정 0)
* `DurangoBGM.create({ context: <소리 층의 AudioContext>, volume })` → `start()` → `setScene(s, fade)`.
  컨텍스트를 넘기므로 **AudioContext 는 여전히 하나**다.
* 장면은 **두 축**이다: 마을 안/밖 × 낮/밤 → `village_day` · `village_night` · `journey`.
* `battle` 은 **미배선**이다 — 클라에 '전쟁 중' 술어가 없다(`warActive`·`inWar` 0곳). 회부.
* `mood`(trad/amb/ari)는 **안 고른다** — `render-meta.json` 에 **태그 칸이 없다**(`seconds`·`rms_db`·`peak_db` 뿐).
  카드가 "표에 이미 있는 태그로 · 없으면 낮/밤만 · **지어내지 않는다**" 고 못 박았다.
  곡 이름의 `_trad`·`_amb`·`_ari` 는 표의 칸이 아니라 파일 이름이다.
* "곡 사이 무음 2~3초"는 **이 엔진에 자리가 없다** — 곡이 끝나는 순간이 없는 연속 엔진이다.
  대응값은 장면 전환 페이드 `bgm.sceneFadeSec = 4.0` 이다. 무음을 넣으려면 엔진을 고쳐야 하는데
  이 카드는 '재생기 수정 0' 이다 ⇒ 회부.

## 3. 실측 표 — 카드가 예고한 수와 실제

| 카드 | 실제 | 왜 |
|---|---|---|
| `test-client-globals ③` 허용 목록 **14 → 15** | **등록 0 · 기준선 118 그대로** | 소리 층에 최상위 실행문을 **0개**로 지었다(입구는 `99-main` 한 줄). 늘릴 것이 없다. |
| 훅 **8곳** | **4곳**(+ 입구 1) | 키 8개가 훅 8곳을 뜻하지 않는다: 흙/풀은 한 줄이 지형으로 가르고, 늑대·모닥불은 `scan` 한 줄이 개체 목록에서 가르고, 먹기·수확·도끼질은 `sendPrimary` 한 줄이 가른다. 파일당 한 줄 규약이 그렇게 만든다. |
| 오디오 자산을 `asset-lock` 잠금표에 | **이미 돼 있다(T266)** | 이 카드가 더한 음원은 0장이고, 잠금은 **T266 이 먼저 열었다**(`ASSET_EXT` 에 `ogg|m4a` · `keyOf` 는 소리만 파일 이름 그대로). 실측 `--check` 478장 · 어긋남 0. ⇒ 회부할 것이 없어졌다. |
| — | **고아 82 → 66** | 매니페스트가 이름으로 부르자 `sfx` 26 → **14**(줄어든 12 = 이어진 6종 × 두 파일) · `audio/bgm` 55 → **51**(index.html·매니페스트가 `bgm.js`·`render-meta.json` 등을 부른다). 남은 `sfx` 14 = T272 둘째 묶음 일곱 × 2 — **아직 키가 없는 것이 맞다**(다음 카드). |

## 4. 길이 자 — `test-audio` 안에 **하나**

ogg 길이는 마지막 `OggS` 페이지의 granulepos ÷ 표본율로 잰다(Vorbis/Opus 공통).
**자를 먼저 검증했다**(족보: 자가 틀리면 없는 결함을 본다): 레포가 ffmpeg 로 직접 잰 단 하나의 값
`village_day_trad = 108.28초`(`render-meta.json _T257` 주석)를 **정확히 맞힌다**.

⚠**`render-meta.json` 의 `seconds` 에 이 자를 대지 마라.** 그 수는 `compose.py:676` 이 합성한 float 배열에서
잰 값이고 배포된 ogg 에서 잰 값이 아니다(레포가 이미 *"12곡 전부 안 맞는다"* 고 적어 뒀다).
1차 판이 그 표에 자를 대고 **없는 결함 9건**을 봤다.

★13곡 실측(초 · 배포 ogg):

| 장면 | trad | amb | ari | jeongak |
|---|---|---|---|---|
| village_day | **108.28** | 114.02 | 114.02 | 137.00 |
| village_night | 113.00 | 113.00 | 113.00 | — |
| battle | 112.88 | 112.88 | 112.88 | — |
| journey | 112.86 | 112.86 | 112.86 | — |

★읽히는 것 하나: **장면이 같으면 길이가 같다**(같은 마디를 편성만 바꿔 굽는다). 표의 수는 그렇지 않다 — 그게 위 경고의 증거다.
★그리고 `village_day_jeongak` 의 빈 세 칸(T257 이 "지어내지 않는다"고 비워 둔 것) 중 `seconds` 는
이 자로 **137.00** 이 나온다. 다만 그 표의 다른 12줄은 합성기 자로 적혀 있어 섞으면 자가 두 벌이 된다 ⇒ 회부.

## 5. 다음 층에게

* **미확보 둘** — `wolf_growl`(CC0 늑대라는 것들이 늑대가 아니다) · `harvest`(세 출처에 작물 뜯기가 없다).
  T269 가 그 이유를 `인계/ART-자산.md` §1-b-3 에 적어 뒀다. 음원이 생기면 표의 `file`/`fileAlt`/`source` 세 칸이 전부다.
* **T272 둘째 묶음 일곱이 디스크에 이미 있다** — `water` `rain` `bird` `bronze_hit` `cast` `bite` `hook`.
  **키도 훅도 아직 없다**(그래서 고아 14장). 붙이는 값은 **표에 키 + 훅 한 줄**이다:
  `rain` 은 `37-r1-weather` 의 `precip` 이 이미 있는 자리이고(바람 훅 바로 옆), `cast`·`bite`·`hook` 은
  `30-n-net` 의 `fish_state`/`fish_catch` 이고(`회부_낚시_다음층 A-6` 이 부른 그 셋), `water`·`bird` 는 환경이다.
  ⚠새 키를 더할 때는 매니페스트 `_헤드룸` 의 곱을 **다시 세라**(동시 합 × 0.8 × 0.7 < 1.0).
* `harvest`·`eat` 이 **발신**에 붙어 있다(성사가 아니다) — 서버가 동사별 결과를 보내는 날 옮긴다(회부 ①).
* 실기는 **재민 귀**다 — 세션은 못 듣는다. 하네스가 잴 수 있는 것은 표·파일·훅·정적 구조까지다.
