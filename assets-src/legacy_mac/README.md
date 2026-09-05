# legacy_mac — 맥 Blender 로 굽던 옛 자연물 스크립트 (원본 그대로 · 수정 금지 · 족보)

PM 이 2026-09-05 재민 맥 `~/Mini/` 에서 그대로 옮겨 넣었다(T97 회부 1: "바위 12장 굽는 코드가 저장소 밖에 있다").

| 파일 | 원본 날짜 | 무엇 |
|---|---|---|
| `rock_render.py` | 2026-07-27 | 바위 `rock`·`mossrock`·광맥 `ore`·덤불·약초 — `public/assets/nature/{rock,mossrock,ore}01~06.png` 의 출처 |
| `tree_render.py` | 2026-06-24 | 나무 v1(씬·카메라·조명 원형 — `rock_render` 가 같은 룩을 따른다) |
| `leaf.png` | 2026-06-24 | 두 스크립트가 쓰는 잎 텍스처 |

⚠**이 스크립트는 `random.randint` 를 씨앗 없이 쓴다**(덤불 잎카드) — 결정론이 아니다. 편입할 때(T101)
바위·광맥 절만 `render_common` 문법으로 옮기고 덤불·약초 절은 이미 `nature_render.py` 가 대체했으니 버린다.
광맥 6장은 `scripts/ore-outcrop.py` 가 바위에서 PIL 로 파생한다 — 바위가 다시 구워지면 광맥도 다시 파생한다.
