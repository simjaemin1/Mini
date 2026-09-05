#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ink_repost — **굽지 않고** 먹선·셀 세기를 바꾼다.  [T107]

    python3 scripts/ink_repost.py -- <클립> [--ink=1] [--cel=4] [--out=자리]

★왜 [T96 이 남긴 회부]
  8bit raw 에 후처리를 다시 걸면 양자화 칸 경계가 반올림에 옮겨 가 배포 PNG 와 **바이트가 다르다**
  (T96 실측: 화소 14,255곳 · 최대 채널차 160). 그래서 세기를 한 칸 바꾸는 데 **1시간 27분**이 들었다.
  ⇒ 굽기가 후처리 **전** float 시트를 EXR(float32·ZIP·무손실)로 남기고, 여기서 그걸 읽어
    **같은 함수**(`ink_post.post_all`)를 태운다. 같은 손잡이면 배포 PNG 와 **바이트가 같아야** 한다
    — 그게 이 도구의 합격 조건이고 `test-charsheet ⑧` 이 상시 검사한다.

★같은 코드를 탄다는 게 요점이다. 굽기(`char_render.py`)도 이 모듈의 `post_all` 을 부른다.
  후처리 본문이 두 군데 있으면 '바이트 동일'은 우연이지 계약이 아니다.

★기본 손잡이는 굽기와 같은 자리에서 읽는다(`char_render.py` 의 `T96_INK`·`T96_CEL` 기본값을
  **소스에서 뽑는다** — 여기 숫자를 베끼면 둘이 조용히 어긋난다).
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import ink_post   # noqa: E402

EXRDIR = os.path.join(ROOT, "assets-src", "char_raw")
SHEETDIR = os.path.join(ROOT, "public", "assets", "char")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
PROVE = "--prove" in ARGS
PROOF_PATH = os.path.join(ROOT, "assets-src", "char_repost_proof.json")


def _defaults():
    """굽기 스크립트에서 기본 손잡이와 실루엣 규약을 **읽어 온다**(사본 금지)."""
    src = open(os.path.join(HERE, "char_render.py"), encoding="utf-8").read()
    g = lambda pat, d: (re.search(pat, src).group(1) if re.search(pat, src) else d)
    return {
        "ink": int(g(r'T96_INK",\s*"(\d+)"', "1")),
        "cel": int(g(r'T96_CEL",\s*"(\d+)"', "4")),
        "edge_a": float(g(r'EDGE_A = ([\d.]+)', "0.60")),
        "edge_k": float(g(r'EDGE_K = ([\d.]+)', "0.78")),
        "partner": g(r'PARTNER = \{"body": "([a-z_]+)"\}', "clothes_hemp"),
    }


def main():
    D = _defaults()
    proof = {"_": "ink_repost.py --prove 산물 — EXR 되굽기가 낸 PNG 의 sha256[:16]. "
                  "`test-charsheet ⑧` 이 배포 PNG 와 대조한다(같아야 한다).",
             "sheets": {}}
    clips = [a for a in ARGS if not a.startswith("--")]
    ink = int(next((a.split("=")[1] for a in ARGS if a.startswith("--ink=")), D["ink"]))
    cel = int(next((a.split("=")[1] for a in ARGS if a.startswith("--cel=")), D["cel"]))
    out = next((a.split("=")[1] for a in ARGS if a.startswith("--out=")), SHEETDIR)
    exrdir = next((a.split("=")[1] for a in ARGS if a.startswith("--exr=")), EXRDIR)
    if not os.path.isdir(exrdir):
        raise SystemExit(f"EXR 자리가 없다: {exrdir}\n  → python3 scripts/char_render.py -- --exronly 로 만든다")
    have = sorted(f[:-4] for f in os.listdir(exrdir) if f.endswith(".exr"))
    if not clips:
        clips = sorted({k.rsplit("_", 1)[1] for k in have})
    os.makedirs(out, exist_ok=True)
    print(f"[repost] EXR {len(have)}장 · 클립 {clips} · 먹선 {ink} · 셀 {cel} → {out}")
    for clip in clips:
        keys = [k for k in have if k.endswith("_" + clip)]
        if not keys:
            print(f"  [{clip}] EXR 없음 — 건너뛴다"); continue
        built, alpha, W, H = [], {}, None, None
        for k in keys:
            sheet, w, h = ink_post.load_exr(os.path.join(exrdir, k + ".exr"))
            W, H = w, h
            lname = k[: -(len(clip) + 1)]
            built.append((lname, sheet))
            alpha[lname] = [sheet[i * 4 + 3] for i in range(w * h)]
        sil = {l for l, _ in built if l == "body" or l.startswith("clothes")}
        partner = {"body": D["partner"]}
        for l in sil:
            partner.setdefault(l, "body")
        ink_post.post_all(built, W, H, silhouette=sil, partner_of=partner,
                          alpha_of=lambda n: alpha.get(n), ink_px=ink, cel_bands=cel,
                          edge_a=D["edge_a"], edge_k=D["edge_k"])
        for lname, sheet in built:
            ink_post.save_png(sheet, W, H, os.path.join(out, f"{lname}_{clip}.png"))
        print(f"  [{clip}] {len(built)}장")
        if PROVE:
            import hashlib
            for lname, _sh in built:
                q = os.path.join(out, f"{lname}_{clip}.png")
                proof["sheets"][f"{lname}_{clip}"] = hashlib.sha256(open(q, "rb").read()).hexdigest()[:16]
    if PROVE:
        proof["ink"], proof["cel"] = ink, cel
        with open(PROOF_PATH, "w") as f:
            json.dump(proof, f, indent=1, sort_keys=True)
            f.write("\n")
        print(f"[repost] 증명 기록 {len(proof['sheets'])}장 → {PROOF_PATH}")


if __name__ == "__main__":
    main()
