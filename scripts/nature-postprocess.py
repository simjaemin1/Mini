#!/usr/bin/env python3
# nature-postprocess.py — nature_render.py 산출물을 게임 자산으로 배치 [배치 21]
#   ① 알파 bbox 크롭(샘플 노이즈 꼬리는 알파 문턱으로 자른다)
#   ② 나무 → public/assets/trees/treeNN.png (★로더 무변 — 기존 파일명·바닥앵커 규약 그대로)
#   ③ 소품 → public/assets/nature/*.png
#   ④ public/assets/nature/nature_anchors.json — 크롭 뒤 좌표계의 {w,h,ox,oy,ppu}
#      (ox,oy = 지면 원점의 픽셀 위치. 산 스프라이트 mountain_anchors.json 과 같은 규약.
#       물가 술은 개수가 많고 자리가 정밀해야 해서 bbox 바닥 근사가 아니라 이 앵커를 쓴다.)
#
# 실행: python3 scripts/nature-postprocess.py
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "nature_renders")
TREES = os.path.join(ROOT, "public", "assets", "trees")
NATURE = os.path.join(ROOT, "public", "assets", "nature")
ALPHA_MIN = 10          # 이보다 옅은 픽셀은 없는 것으로 — Cycles 샘플 꼬리가 bbox 를 부풀린다

# ★★[T129 2026-09-05] **손잡이 둘을 달았다 — 둘 다 실측이 시켰다.**
#   ⓐ `--only k1,k2` : 준 키만 배치한다. 안 그러면 이 스크립트가 **50장을 전부 다시 저장**하는데,
#     `scripts/nature_renders/` 의 옛 산출물이 지금 코드가 굽는 것과 다르면(실측: `tree09` 이
#     평균 |Δ| 0.45/255 · 다른 화소 29.3% — 눈엔 같고 가장자리 잡음이다) **안 건드릴 자산이
#     조용히 갈린다**. 새 자산을 더하는 카드는 새 키만 배치해야 한다.
#   ⓑ 앵커를 **덮어쓰지 않고 합친다** : 종전은 `out` 을 새로 만들어 통째로 썼다. 그런데
#     `ore-outcrop.py` 가 광맥 6키를 이 파일에 **합쳐 넣는다**(그 스크립트 §앵커 절).
#     ⇒ 이 스크립트를 혼자 돌리면 **광맥 6키가 소리 없이 사라졌다**(T129 §0 에서 실측 —
#     56키 → 50키 · 값이 바뀐 키는 0). 클라가 광맥 자리를 모르게 되는 길이었다.
ONLY = None
for _a in sys.argv[1:]:
    if _a.startswith("--only="):
        ONLY = set(k for k in _a[len("--only="):].split(",") if k)
    elif _a == "--only":
        pass
raw = json.load(open(os.path.join(SRC, "nature_raw_anchors.json"), encoding="utf-8"))
_ap_out = os.path.join(NATURE, "nature_anchors.json")
out = {}
if os.path.exists(_ap_out):                     # ⓑ 있던 앵커를 먼저 싣는다(광맥 6키가 여기 산다)
    try: out = json.load(open(_ap_out, encoding="utf-8"))
    except Exception: out = {}
n_tree = n_prop = 0
for key, a in sorted(raw.items()):
    if ONLY and key not in ONLY:
        continue
    p = os.path.join(SRC, key + ".png")
    if not os.path.exists(p):
        print("  ! 없음:", key); continue
    im = Image.open(p).convert("RGBA")
    al = im.getchannel("A").point(lambda v: 255 if v >= ALPHA_MIN else 0)
    bb = al.getbbox()
    if bb is None:
        print("  ! 빈 이미지:", key); continue
    im2 = im.crop(bb)
    ox = a["ox"] - bb[0]
    oy = a["oy"] - bb[1]
    if a.get("kind") == "tree":
        dst = os.path.join(TREES, key + ".png"); n_tree += 1
    else:
        dst = os.path.join(NATURE, key + ".png"); n_prop += 1
    im2.save(dst)
    out[key] = {"w": im2.width, "h": im2.height, "ox": round(ox, 2), "oy": round(oy, 2),
                "ppu": a["ppu"], "kind": a.get("kind", "prop")}
    # 게임 픽셀 환산(1m=32px) — 규격 검사용 부가 정보
    gpx = 45.254833995939045 / a["ppu"]
    out[key]["gh"] = round(im2.height * gpx, 1)     # 화면 높이(게임px)
    out[key]["gw"] = round(im2.width * gpx, 1)
    out[key]["m"] = round(im2.height * gpx / 32.0, 2)   # 실측 높이(m) — 1셀=1m 규약 검증용
    print(f"  {key:11s} {im.size} -> {im2.size}  anchor=({ox:.1f},{oy:.1f})  화면 {out[key]['gw']:.0f}x{out[key]['gh']:.0f}px = {out[key]['m']:.2f}m")

json.dump(out, open(os.path.join(NATURE, "nature_anchors.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1, sort_keys=True)
print(f"[nat-post] 나무 {n_tree} · 소품 {n_prop} → nature_anchors.json {len(out)}키"
      + (f"  (--only {len(ONLY)}키)" if ONLY else ""))
