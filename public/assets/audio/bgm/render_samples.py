"""
render_samples.py — 실음원 폴더를 써서 곡을 다시 렌더링한다.

    python3 sampler.py scan samples/        # 먼저 색인
    python3 render_samples.py samples/      # 12곡 전부
    python3 render_samples.py samples/ village_day_ari

음원이 없는 악기는 자동으로 합성음이 쓰인다.
"""
import sys
import os
import json
import numpy as np
import gugak as G
import sampler as S


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "samples"
    names = sys.argv[2:]
    bank = S.Bank(root)
    import compose as C
    import arirang as A
    used = S.install(bank, [C, A])
    print("악기별 소리 출처")
    for k, v in used.items():
        mark = "●" if v == "샘플" else "○"
        print(f"  {mark} {k:14s} {v}")
    allt = {**C.TRACKS, **A.ARI_TRACKS}
    names = names or list(allt)
    outdir = "out_samples"
    os.makedirs(outdir, exist_ok=True)
    meta = {}
    for nm in names:
        spec = allt[nm]
        y = spec["fn"](spec)
        G.write_wav(os.path.join(outdir, nm + ".wav"), y)
        rms = float(np.sqrt(np.mean(y ** 2)))
        meta[nm] = dict(seconds=round(y.shape[1] / G.SR, 2),
                        rms_db=round(float(20 * np.log10(rms + 1e-9)), 2),
                        peak_db=round(float(20 * np.log10(np.max(np.abs(y)) + 1e-9)), 2))
        print(f"  {nm:20s} {meta[nm]['seconds']:7.2f}s  rms {meta[nm]['rms_db']:6.2f}dB  "
              f"peak {meta[nm]['peak_db']:6.2f}dB")
    json.dump({"source": used, "tracks": meta},
              open(os.path.join(outdir, "meta.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
