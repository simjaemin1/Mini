# 모캡 원본 — CMU Graphics Lab Motion Capture Database (BVH 변환본)  [T96]

이 폴더는 **데이터 자산**이다. 코드가 아니라 원본이고, 여기서 `scripts/mocap_retarget.py` 가
`poses.json`(8프레임 포즈표)을 뽑는다. 굽기(`char_render.py`)는 그 표를 **읽기만** 한다.

## 파일

| 파일 | 출처 클립 | 무엇 |
|---|---|---|
| `cmu_07_01_walk.bvh` | CMU **07_01** — Subject #7 "walk" | 걷기. 317프레임 · 120fps · 한 보폭 주기 131프레임(1.092초) |
| `cmu_09_01_run.bvh` | CMU **09_01** — Subject #9 "run" | 달리기. 149프레임 · 120fps · 주기 90프레임(0.750초) |
| `cmu_80_71_chop.bvh` | CMU **80_71** — Subject #80 "chopping wood" | 도끼질. 1087프레임 · 120fps · 한 번 98프레임(0.817초) [T155] |
| `cmu_113_24_throw.bvh` | CMU **113_24** — Subject #113 "Throw" | 조준(겨눈 채 멈춤). 1106프레임 · 창 120프레임(1.0초) [T155] |
| `cmu_77_02_stand.bvh` | CMU **77_02** — Subject #77 "standing" | 서기. 938프레임 · 창 533프레임(4.44초) [T155] |
| `poses.json` | ↑ 다섯에서 생성 | `mocap_retarget.py` 산물. **손편집 금지** — 원본이 정본이다. |

## 어느 구간을 쓰나 — **고르지 않고 잰다** [T155]

클립마다 **창 규칙**이 다르다. 규칙은 그 동작의 뜻에서 나온다(`mocap_retarget.py` 의 `window_of`).

| 규칙 | 쓰는 클립 | 무엇을 재나 |
|---|---|---|
| `cycle` | walk · run | 넓적다리 시상각의 **상승 영교차** 간격 = 한 보폭 |
| `beat` | swing2 | **손 높이**가 평균을 위로 지나는 자리 사이 = 한 번의 도끼질. 시작은 손이 가장 낮은 자리(도끼가 박힌 쉼) · 길이는 **그 도끼질 제 길이**(중앙값이 아니다 — 80_71 은 박자가 48~150판으로 들쭉날쭉하다) |
| `reach` | aim2 | ⓐ **두 손**이 몸 앞으로 가장 멀리 나간 판 = 겨눈 순간 → ⓑ 그 판을 품은 창 중 **가장 조용한** 것 |
| `still` | idle2 | 각이 **가장 적게 움직이는** 창 |

창의 길이는 그 클립의 **재생 시간**에서 나온다(판 수 ÷ fps × 원본 fps) — 새 수 0.

클립 번호·설명은 배포본의 `cmu-mocap-index-text.txt` 에서 왔다 — 후보도 그 목록을 **동작 이름으로**
찾아 골랐다(T155 §0-ⓐ 표: 도끼질 셋 · 조준 셋 · 서기 셋을 재서 하나씩 채택).

## 출처

* 원 데이터: **CMU Graphics Lab Motion Capture Database** — http://mocap.cs.cmu.edu
* BVH 변환: **Bruce Hahne** 의 2010년 "Motionbuilder-friendly BVH conversion release"
  (cgspeed) — 원본 CMU 배포본은 ASF/AMC 라 BVH 가 아니다.
* 이 저장소가 받은 사본: `https://github.com/una-dinosauria/cmu-mocap` (`data/007/07_01.bvh`,
  `data/009/09_01.bvh` · 위 변환본을 그대로 담은 미러). 커밋 `09a07f54`.

## 저작

배포본 `READMEFIRST.txt` 원문:

> CMU places no restrictions on the use of the original dataset, and I (Bruce) place no
> additional restrictions on the use of this particular BVH conversion.
>
> Use this data!  This data is free for use in research and commercial projects worldwide.
> If you publish results obtained using this data, we would appreciate it if you would send
> the citation to your published paper to jkh+mocap@cs.cmu.edu, and also would add this text
> to your acknowledgments section: "The data used in this project was obtained from
> mocap.cs.cmu.edu.  The database was created with funding from NSF EIA-0196217."

⇒ 연구·상업 모두 자유. **표기 의무는 없고 감사 표기를 권한다** — 그래서 위 문단을 여기에 옮겨 둔다.
게임이 크레딧 화면을 갖게 되면 그 문장을 그대로 넣으면 된다(회부).

## 왜 원본을 커밋하나

`poses.json` 만 남기면 **다시 만들 수가 없다.** 리타깃 규약을 고치거나 다른 클립을 쓰려면
같은 원본이 있어야 하고, "두 번 돌려 바이트가 같은가"(결정론)도 원본 없이는 못 묻는다.
두 파일 합쳐 350KB 다 — 스프라이트 시트 두 장 값이다.

## [T723] 걷기·달리기 다리 = 보행 자료(2D 시트도)

`walk`·`run` 의 **다리 넷**(`thighL`·`shinL`·`thighR`·`shinR`)은 이제 모캡이 아니라 열린 보행 자료의 평균 주기다
(`assets-src/gait/gait_norms.json` — 걷기 Fukuchi 2018 WBDS 러닝머신 T08 · 달리기 Fukuchi 2017 RBDS 4.5 m/s · CC BY 4.0 · `CREDITS.md`).
3D(`char_export_gltf.py` · T708)와 **같은 위상 맞춤** — `mocap_retarget.gait_phase`(모캡 왼 넓적다리 땅 기준 시상각 ↔ 자료 넓적다리 · 표본 = 판 × 4 ·
상관 가장 큰 φ₀ · 1/1000 격자) · 판 k = 위상 φ₀ + k/8(오른다리 + ½) · 다리 마디의 땅 기준 각 = 자료 · 옆 기울기 = 모캡 0번 판 그대로.
윗몸(엉덩이 · 허리 · 팔 · 머리)은 모캡 그대로 · `swing2`·`aim2`·`idle2` 는 한 자도 안 바뀐다. 포즈표 `source.<클립>.gait` = φ₀ · 상관 · 자료 출처.

## [T746] 시트 접지 = 3D 와 같은 접지 계획

포즈표 `source.<클립>.gait` 에 두 칸을 더 적는다 — `duty`(디딤 비율 · 걷기 0.5658 · 달리기 0.3151) · `pelvisRise`(달리기 골반 높이 곡선 · 키 몫 101점).
둘 다 `assets-src/gait/gait_norms.json`(T741) 값 **그대로**다(포즈 바이트 같음 · 새 수 0). 굽기(`char_render.py`)는 포즈표만 읽는 두 단 결정론 그대로 —
걷기·달리기·묶인 걸음(걷기 다리) 판마다 엉덩이 높이를 `mocap_retarget.contact_plan`(3D 내보내기와 **같은 함수**)으로 짓는다:
디딘 발(그 발 위상 < `duty`) 짚신 가장 낮은 점 = 선 판 땅 · 흔드는 발이 땅 밑이면 넓적다리만 들기 · 디딘 발 없는 판(달리기 공중) = `pelvisRise` × 몸 키 × `ZSQ` 로 앞뒤 디딘 판 잇기.
걸음의 흔들림(bob)은 이제 사인 포즈(`T96_SINE=1`)에만 남는다.
