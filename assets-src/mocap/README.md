# 모캡 원본 — CMU Graphics Lab Motion Capture Database (BVH 변환본)  [T96]

이 폴더는 **데이터 자산**이다. 코드가 아니라 원본이고, 여기서 `scripts/mocap_retarget.py` 가
`poses.json`(8프레임 포즈표)을 뽑는다. 굽기(`char_render.py`)는 그 표를 **읽기만** 한다.

## 파일

| 파일 | 출처 클립 | 무엇 |
|---|---|---|
| `cmu_07_01_walk.bvh` | CMU **07_01** — Subject #7 "walk" | 걷기. 317프레임 · 120fps · 한 보폭 주기 131프레임(1.092초) |
| `cmu_09_01_run.bvh` | CMU **09_01** — Subject #9 "run" | 달리기. 149프레임 · 120fps · 주기 90프레임(0.750초) |
| `poses.json` | ↑ 둘에서 생성 | `mocap_retarget.py` 산물. **손편집 금지** — 원본이 정본이다. |

클립 번호·설명은 배포본의 `cmu-mocap-index-text.txt`(Subject #7 = walk · Subject #9 = run)에서 왔다.

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
