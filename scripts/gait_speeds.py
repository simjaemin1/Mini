#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gait_speeds — 속도마다 보폭 · 분당 걸음 수 · 디딤 비율을 **열린 보행 자료에서** 잰다.  [T723 ②]

    python3 scripts/gait_speeds.py --src=<원본 폴더>        # → assets-src/gait/gait_speeds.json

★왜 (T723 ② 발 미끄러짐)
  시트·3D 걸음은 판 주기가 고정(걷기 8판 ÷ 10 fps = 0.8 s · 달리기 8판 ÷ 14 fps = 0.571 s)이고 몸은 게임 속도(2.0 · 5.0 m/s)로 간다.
  둘이 안 맞으면 디딘 발이 땅 위에서 미끄러진다. 맞추는 길은 둘 — ⓐ 주기(재생 속도)만 바꾼다 = 걸음 수만 · ⓑ 보폭만 바꾼다.
  사람은 빨라질 때 둘을 **어떤 몫으로** 나누나 — 그 몫을 자료에서 잰다(이 파일). 굽기는 이 표를 안 읽는다(재는 표 · 보고 T723).

★원본(저장소 밖 · 공개 · CC BY 4.0) — `gait_norms.py` 와 같은 두 자료 · 같은 지은이 셋(Fukuchi · Fukuchi · Duarte)
  걷기 = WBDS(Fukuchi 2018 · PeerJ 6:e4640 · 자료 doi:10.6084/m9.figshare.5722711) 러닝머신 T01~T08(편한 속도의 40 ~ 145 %) · 젊은 무리 24명
         `WBDSinfo.csv`(속도 `GaitSpeed(m/s)` · 키 `Height` cm) · `WBDS##walkT##grf.txt`(힘판 둘 = 벨트 둘 · 발마다 하나) · `WBDS##walkT##mkr.txt`(시각 열 = 표본 수)
  달리기 = RBDS(Fukuchi 2017 · PeerJ 5:e3298 · 자료 doi:10.6084/m9.figshare.4543435) 러닝머신 2.5 · 3.5 · 4.5 m/s · 28명
         `RBDSinfo.txt`(키 `Height` cm) · `RBDS###runT##forces.txt`(힘판 하나 = 두 발) · `RBDS###runT##markers.txt`(시각 열 = 표본 수)
  원본 폴더 꼴: <src>/wbds/WBDSinfo.csv · <src>/wbds_grf/ · <src>/wbds_mkr/ · <src>/rbds_info/RBDSinfo_0.txt · <src>/rbds_f/ · <src>/rbds_m/ · <src>/rbds/(4.5 m/s 표지)

★재는 법(새 수 0 — 자도 문턱도 `gait_norms.py` 그대로)
  ⓐ 표본 = 표지 (판 수 − 1) ÷ 시각 폭 · 힘판 = 그 두 배(두 파일 길이가 같은 초인지 맞대 본다 — T723 이 고친 그 식)
  ⓑ 닿음 = 수직 반력 20 N 문턱(RBDS 논문 사건 규약) · 끊김 0.033 s 미만은 잇고 0.05 s 미만 닿음은 버린다(`gait_norms._runs`) · 파일 끝에 걸린 닿음은 뺀다
  ⓒ 한 주기(같은 발이 다시 닿기까지) — 걷기 = 힘판마다 닿음 시작 간격 · 달리기 = 한 힘판의 닿음 시작 i → i+2 간격 · **가운데값**(발 헛디딤·벨트 넘음에 안 흔들린다)
     디딤 = 닿음 길이 가운데값 · 디딤 비율 = 디딤 ÷ 주기
  ⓓ 보폭(한 주기 · m) = 속도 × 주기 · 분당 걸음 = 120 ÷ 주기 · 키로 무차원: 보폭/키 · v/√(g·키)
  ⓔ 몫 β = d ln 보폭 / d ln 속도(사람마다 조건 전부의 로그 최소제곱 기울기 → 무리 평균) — 걸음 수 몫 = 1 − β
"""
import csv
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gait_norms as GN  # noqa: E402  — 자·문턱·읽기는 그쪽 하나(사본 0)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "assets-src", "gait", "gait_speeds.json")
WALK_CONDS = ["T0%d" % i for i in range(1, 9)]
RUN_CONDS = ["25", "35", "45"]


def times(p):
    """표지 파일의 시각 열만(첫 열) — 표본 셈."""
    L = open(p, encoding="utf-8").read().strip().split("\n")[1:]
    return np.array([float(l.split("\t", 1)[0]) for l in L])


def rates(pm, nF):
    tm = times(pm)
    hz = (len(tm) - 1) / float(tm[-1] - tm[0])
    ff = 2.0 * hz
    if abs(nF / ff - len(tm) / hz) > 0.05:
        raise SystemExit(f"[speeds] ★힘·표지 길이가 안 맞다: {pm}")
    return hz, ff


def contacts(fy, ff):
    on = fy > GN.STANCE_N
    st = GN._runs(on, minlen=int(round(0.05 * ff)), gap=int(round(0.033 * ff)))
    return [(a, b) for a, b in st if a > 0 and b < len(fy)]


def walk(src, files):
    info = list(csv.DictReader(open(os.path.join(src, "wbds", "WBDSinfo.csv"), encoding="utf-8-sig")))
    files["wbds/WBDSinfo.csv"] = GN.sha16(os.path.join(src, "wbds", "WBDSinfo.csv"))
    young = sorted({int(r["Subject"]) for r in info if r["AgeGroup"] == "Young"})
    per = {}
    for sid in young:
        for c in WALK_CONDS:
            base = f"WBDS{sid:02d}walk{c}"
            pg, pm = os.path.join(src, "wbds_grf", base + "grf.txt"), os.path.join(src, "wbds_mkr", base + "mkr.txt")
            for p in (pg, pm):
                if not os.path.exists(p):
                    raise SystemExit(f"[speeds] ★걷기 원본이 없다: {p}")
                files[os.path.basename(os.path.dirname(p)) + "/" + os.path.basename(p)] = GN.sha16(p)
            cf, F = GN.tab(pg)
            hz, ff = rates(pm, len(F))
            row = next(r for r in info if r["FileName"] == base + "mkr.txt")
            v, H = float(row["GaitSpeed(m/s)"]), float(row["Height"]) / 100.0
            Ts, Ss = [], []
            for k in ("Fy1", "Fy2"):
                st = contacts(F[:, cf[k]], ff)
                if len(st) < 2:
                    raise SystemExit(f"[speeds] ★{base} {k} 닿음이 모자란다({len(st)})")
                Ts.append(float(np.median(np.diff([a for a, _b in st]))) / ff)
                Ss.append(float(np.median([b - a for a, b in st])) / ff)
            T, S = float(np.mean(Ts)), float(np.mean(Ss))
            per.setdefault(sid, {})[c] = {"v": v, "H": H, "T": T, "stance": S}
    return per


def run(src, files):
    rows = open(os.path.join(src, "rbds_info", "RBDSinfo_0.txt"), encoding="utf-8").read().strip().split("\n")
    files["rbds_info/RBDSinfo_0.txt"] = GN.sha16(os.path.join(src, "rbds_info", "RBDSinfo_0.txt"))
    h = rows[0].split("\t")
    height = {}
    for l in rows[1:]:
        x = l.split("\t")
        height[int(x[h.index("Subject")])] = float(x[h.index("Height")]) / 100.0
    per = {}
    for sid in range(1, 29):
        for c in RUN_CONDS:
            base = f"RBDS{sid:03d}runT{c}"
            pf = os.path.join(src, "rbds_f", base + "forces.txt")
            pm = os.path.join(src, "rbds" if c == "45" else "rbds_m", base + "markers.txt")
            for p in (pf, pm):
                if not os.path.exists(p):
                    raise SystemExit(f"[speeds] ★달리기 원본이 없다: {p}")
                files[os.path.basename(os.path.dirname(p)) + "/" + os.path.basename(p)] = GN.sha16(p)
            cf, F = GN.tab(pf)
            hz, ff = rates(pm, len(F))
            st = contacts(F[:, cf["Fy"]], ff)
            a = [s for s, _e in st]
            if len(a) < 3:
                raise SystemExit(f"[speeds] ★{base} 닿음이 모자란다({len(a)})")
            T = float(np.median([a[i + 2] - a[i] for i in range(len(a) - 2)])) / ff
            S = float(np.median([e - s for s, e in st])) / ff
            per.setdefault(sid, {})[c] = {"v": float(c) / 10.0, "H": height[sid], "T": T, "stance": S}
    return per


def summarize(per, conds):
    R = lambda x: round(float(x), 4)
    out = {}
    for c in conds:
        P = [per[s][c] for s in sorted(per) if c in per[s]]
        v = np.array([p["v"] for p in P]); T = np.array([p["T"] for p in P]); S = np.array([p["stance"] for p in P]); H = np.array([p["H"] for p in P])
        SL = v * T
        cad = 120.0 / T
        out[c] = {"n": len(P), "speed": R(v.mean()), "speedRange": [R(v.min()), R(v.max())], "strideSec": R(T.mean()), "stanceSec": R(S.mean()),
                  "duty": R((S / T).mean()), "cadence": R(cad.mean()), "cadenceRange": [R(cad.min()), R(cad.max())],
                  "strideM": R(SL.mean()), "strideRange": [R(SL.min()), R(SL.max())], "heightM": R(H.mean()),
                  "strideH": R((SL / H).mean()), "strideHRange": [R((SL / H).min()), R((SL / H).max())],
                  "vhatH": R((v / np.sqrt(GN.G * H)).mean()), "vhatHRange": [R((v / np.sqrt(GN.G * H)).min()), R((v / np.sqrt(GN.G * H)).max())]}
    # 몫 β — 사람마다 ln 보폭 ~ ln 속도 기울기(최소제곱) → 평균 · 표준편차
    betas = []
    for s in sorted(per):
        cs = [c for c in conds if c in per[s]]
        lv = np.log([per[s][c]["v"] for c in cs]); ls = np.log([per[s][c]["v"] * per[s][c]["T"] for c in cs])
        betas.append(float(np.polyfit(lv, ls, 1)[0]))
    # 무차원 묶음 맞춤 — ln(보폭/키) = a + β ln(v/√(gH)) · 사람·조건 전부(맞춘 범위 밖은 늘린 값이다 — 쓰는 쪽이 밝힌다)
    allv = [(per[s][c]["v"] / math.sqrt(GN.G * per[s][c]["H"]), per[s][c]["v"] * per[s][c]["T"] / per[s][c]["H"]) for s in per for c in conds if c in per[s]]
    b, a = np.polyfit(np.log([x for x, _y in allv]), np.log([y for _x, y in allv]), 1)
    pair = {}
    for c0, c1 in zip(conds[:-1], conds[1:]):
        pair[f"{c0}-{c1}"] = R(math.log(out[c1]["strideM"] / out[c0]["strideM"]) / math.log(out[c1]["speed"] / out[c0]["speed"]))
    return out, {"betaMean": R(np.mean(betas)), "betaSD": R(np.std(betas, ddof=1)), "n": len(betas), "betaPairs": pair,
                 "fitH": {"a": R(a), "beta": R(b), "vhatH": [R(min(x for x, _y in allv)), R(max(x for x, _y in allv))], "points": len(allv)}}


def main():
    args = sys.argv[1:]
    src = next((a.split("=", 1)[1] for a in args if a.startswith("--src=")), None)
    if not src:
        raise SystemExit("쓰는 법: python3 scripts/gait_speeds.py --src=<원본 폴더>")
    files = {}
    pw, pr = walk(src, files), run(src, files)
    sw, bw = summarize(pw, WALK_CONDS)
    sr, br = summarize(pr, RUN_CONDS)
    doc = {"_": "gait_speeds.py 산물 — 손편집 금지. 원본은 저장소 밖(공개 · CC BY 4.0 · 아래 doi) · 규약은 그 스크립트 머리. 굽기는 이 표를 안 읽는다(재는 표).",
           "units": "속도 m/s · 주기·디딤 s · 보폭 = 한 주기(같은 발 → 같은 발) m · 분당 걸음 = 120/주기 · 보폭/키 · v/√(g·키) · β = d ln 보폭 / d ln 속도",
           "sources": {"walk": {"cite": "Fukuchi CA, Fukuchi RK, Duarte M (2018) PeerJ 6:e4640", "doi": "10.7717/peerj.4640", "data": "10.6084/m9.figshare.5722711", "license": "CC BY 4.0"},
                       "run": {"cite": "Fukuchi RK, Fukuchi CA, Duarte M (2017) PeerJ 5:e3298", "doi": "10.7717/peerj.3298", "data": "10.6084/m9.figshare.4543435", "license": "CC BY 4.0"}},
           "walk": {"conds": sw, "share": bw}, "run": {"conds": sr, "share": br}, "files": dict(sorted(files.items()))}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    for k, s, b in (("walk", sw, bw), ("run", sr, br)):
        for c, d in s.items():
            print(f"[speeds] {k} {c}: {d['n']}명 · v {d['speed']} · 주기 {d['strideSec']} s · 분당 {d['cadence']} · 보폭 {d['strideM']} m · 보폭/키 {d['strideH']} · 디딤 {d['duty']}")
        print(f"[speeds] {k} β = {b['betaMean']} ± {b['betaSD']}({b['n']}명) · 쌍 {b['betaPairs']} · 무차원 맞춤 {b['fitH']}")
    print(f"[speeds] 저장: {os.path.relpath(OUT, ROOT)} · 원본 {len(files)}개")


if __name__ == "__main__":
    main()
