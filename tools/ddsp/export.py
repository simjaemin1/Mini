#!/usr/bin/env python3
"""학습 산출 → 백엔드 B 가 읽는 꼴 [T353] · `python3 tools/ddsp/export.py <inst> <ckpt>`

`models/<inst>/` 에 `model.pt` 와 `meta.json`(sr · f0 단위 · 학습 조각 수 · 커밋)을 놓는다.
`phrase.render_curve` 는 이 폴더가 **있으면** B 를 쓴다.
"""
import json, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))


def main(inst, ckpt):
    out = os.path.join(ROOT, "models", inst)
    os.makedirs(out, exist_ok=True)
    shutil.copy(ckpt, os.path.join(out, "model.pt"))
    try:
        commit = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"],
                                         cwd=ROOT, text=True).strip()
    except Exception:
        commit = "?"
    prep = os.path.join(ROOT, "prepared", inst, "_prep.json")
    kept = json.load(open(prep))["kept"] if os.path.exists(prep) else None
    json.dump(dict(inst=inst, sr=16000, f0="hz", loud="0..1",
                   chunks=kept, commit=commit,
                   note="phrase.render_curve 백엔드 B 가 읽는다. 값은 학습에서 나왔고 지어낸 칸 0."),
              open(os.path.join(out, "meta.json"), "w"), ensure_ascii=False, indent=1)
    print(f"{out} — model.pt · meta.json (조각 {kept})")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
