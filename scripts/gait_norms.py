#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gait_norms — 열린 보행 자료(걷기 · 달리기)의 다리 관절각을 **보행 주기 한 바퀴 표**로 굳힌다.  [T708 ②]

    python3 scripts/gait_norms.py --src=<원본 폴더>        # → assets-src/gait/gait_norms.json

★왜 (재민 10-11 "사람 모델이 이상한가" → 10-12 판정 T708 ②)
  지금 걷기 = CMU 07_01 · 달리기 = CMU 09_01 모캡 리타깃이다. 다리 각을 재 보니 걷기 엉덩이(골반 축 대비) −34° ~ +35° · 짐 받는 무릎 29° ·
  달리기 무릎 115° · 발목 −54° — 보폭 넓은 런지 · 위에서 본 달리기가 공. ⇒ 다리(엉덩이 · 무릎 · 발목)를 **열린 생체역학 자료의 평균 주기**로 다시 짓는다.
  윗몸(척추 · 팔 · 머리)은 모캡 그대로(같은 자료 · 위상만 맞춘다 — 내보내기 `char_export_gltf.py`).

★원본(저장소 밖 · 공개 · CC BY 4.0) — 두 자료 다 같은 지은이 셋(Fukuchi · Fukuchi · Duarte) · 같은 각 규약(Cardan Z-X-Y · Z = 굽힘 · 굽힘/발등굽힘 +)
  걷기 = Fukuchi CA, Fukuchi RK, Duarte M (2018) A public dataset of overground and treadmill walking kinematics and kinetics in healthy
         individuals. PeerJ 6:e4640. doi:10.7717/peerj.4640 · 자료 doi:10.6084/m9.figshare.5722711 (`WBDSascii.zip` 안 `WBDS##walkT08ang.txt` · `WBDSinfo.csv`)
  달리기 = Fukuchi RK, Fukuchi CA, Duarte M (2017) A public dataset of running biomechanics and the effects of running speed on lower extremity
         kinematics and kinetics. PeerJ 5:e3298. doi:10.7717/peerj.3298 · 자료 doi:10.6084/m9.figshare.4543435
         (`RBDS###processed.txt` · `RBDS###runT45markers.txt` · `RBDS###runT45forces.txt`)
  원본 폴더 꼴: <src>/wbds/{WBDSinfo.csv, WBDS##walkT08ang.txt} · <src>/rbds/{RBDS###processed.txt, RBDS###runT45markers.txt, RBDS###runT45forces.txt}
               · [T741] <src>/wbds_grf/WBDS##walkT08grf.txt · <src>/wbds_mkr/WBDS##walkT08mkr.txt(시각 열 = 표본 셈) · <src>/rbds_info/RBDSinfo_0.txt(키)

★무엇을 고르나(새 수 0 — 고르는 자도 자료·게임 상수에서)
  ⓐ 조건 = 게임 속도에 **무차원 속도(v/√(gL) — 걷기 자료가 속도를 정한 그 자)**가 가장 가까운 조건:
     걷기 = 러닝머신 T08(편한 속도의 145 % · 가장 빠른 조건) · 달리기 = 4.5 m/s(가장 빠른 조건). 게임 = 걷기 `MOVE_SPEED` 64 px/s = 2.0 m/s ·
     달리기 × `SPRINT_MULT` 2.5 = 5.0 m/s — 둘 다 자료의 가장 빠른 조건보다 빠르다(그래서 가장 빠른 조건).
  ⓑ 사람 = 걷기 젊은 무리(`AgeGroup` Young — 게임 몸 = MPFB 기본 나이) · 달리기 원 28명(세 속도가 다 있는 판).
  ⓒ 각 = 시상면(굽힘)만 — 엉덩이 · 무릎 · 발목 Z. 다리 마디의 **땅 기준 각**(앞으로 + · 수직 0)으로 바꾼다:
        넓적다리 = 엉덩이 굽힘 − 골반 앞기울기 · 정강이 = 넓적다리 − 무릎 굽힘 · 발 = 정강이 + 발목 발등굽힘(0 = 발바닥 평평)
     골반 앞기울기: 걷기 = 자료의 `PelvisAngleZ`(같은 주기) · 달리기 = 처리 파일에 골반이 없어 **표지 원자료로 잰다** —
        앞위엉덩뼈가시(ASIS) 가운데 → 뒤위엉덩뼈가시(PSIS) 가운데의 시상면 기울기(처리 파일 골반 틀과 같은 표지) · 주기 = 수직 반력 20 N 문턱
        (논문의 사건 규약) · 어느 발 = 닿는 순간 앞에 있는 발뒤꿈치 표지 · 한 주기 0.5~1.0 s 밖·표지 빈칸 10 % 넘는 주기는 버린다.
  ⓓ 평균 = 사람마다 왼·오른(제 발 닿음 = 0 %) 둘 다 → 사람 평균 → 무리 평균(101점 · 0 % = 발 닿음).
  ⓔ [T741] **디딤 비율**(`duty` — 3D 접지가 디딘 발을 고르는 구간) = 같은 조건 · 같은 사람의 힘판: 닿음 = 수직 반력 20 N 문턱(파일 끝에 걸린 닿음은 뺀다) ·
     걷기 = 힘판 둘(벨트 둘 = 발마다)마다 닿음 시작 간격 · 닿음 길이 가운데값 → 사람마다 디딤 ÷ 주기 → 평균 · 달리기 = 힘판 하나의 닿음 시작 i → i+2 간격.
     **달리기 골반 높이 곡선**(`pelvisRise` — 3D 달리기 공중 구간의 엉덩이 높이) = ASIS·PSIS 넷 가운데 높이를 골반 기울기와 같은 주기로 101점 →
     주기 평균을 빼고 그 사람 키로 나눈다(무차원 — 굽기가 몸 키를 곱한다) → 사람 평균 → 무리 평균.
결과는 커밋 · 굽기는 읽기만(`mocap_retarget.py` → `poses.json` 과 같은 두 단 결정론).
"""
import csv
import hashlib
import json
import math
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "assets-src", "gait", "gait_norms.json")
ROUND = 4
G = 9.81                                    # 무차원 속도의 g(표준 중력)
STANCE_N = 20.0                             # 논문(RBDS) 사건 규약 — 수직 반력 20 N 문턱
WALK_COND, RUN_COND = "T08", "45"


def sha16(p):
    return hashlib.sha1(open(p, "rb").read()).hexdigest()[:16]


def tab(p):
    L = open(p, encoding="utf-8").read().strip().split("\n")
    h = L[0].split("\t")
    A = np.array([[float(x) if x not in ("", "NaN", "nan") else np.nan for x in l.split("\t")] for l in L[1:]])
    return {k: i for i, k in enumerate(h)}, A


def walk(src, files):
    d = os.path.join(src, "wbds")
    info = list(csv.DictReader(open(os.path.join(d, "WBDSinfo.csv"), encoding="utf-8-sig")))
    files["wbds/WBDSinfo.csv"] = sha16(os.path.join(d, "WBDSinfo.csv"))
    young = sorted({int(r["Subject"]) for r in info if r["AgeGroup"] == "Young"})
    per, speeds, used, empty, duty = [], [], [], [], []
    for sid in young:
        fn = f"WBDS{sid:02d}walk{WALK_COND}ang.txt"
        p = os.path.join(d, fn)
        if not os.path.exists(p):
            raise SystemExit(f"[gait] ★걷기 원본이 없다: {p}")
        files["wbds/" + fn] = sha16(p)
        c, A = tab(p)
        sides = []
        for s in "RL":
            hip, knee, ank, pel = (A[:, c[f"{s}{j}AngleZ"]] for j in ("Hip", "Knee", "Ankle", "Pelvis"))
            sides.append(np.stack([hip, knee, ank, pel]))
        S = np.mean(sides, axis=0)
        if not np.isfinite(S).all():                                   # 그 판의 처리 값이 비었다(원자료 그대로 — 예: 08 번 T08 은 전부 NaN) — 뺀다
            empty.append(sid)
            continue
        per.append(S)
        used.append(sid)
        row = next(r for r in info if r["FileName"] == f"WBDS{sid:02d}walk{WALK_COND}mkr.txt")
        speeds.append((float(row["GaitSpeed(m/s)"]), float(row["LegLength"])))
        # ★[T741] 디딤 비율 — 같은 판의 힘판 둘(발마다)
        pg, pm = (os.path.join(src, sub, f"WBDS{sid:02d}walk{WALK_COND}{x}.txt") for sub, x in (("wbds_grf", "grf"), ("wbds_mkr", "mkr")))
        for q in (pg, pm):
            if not os.path.exists(q):
                raise SystemExit(f"[gait] ★걷기 힘판·표지 원본이 없다: {q}")
            files[os.path.basename(os.path.dirname(q)) + "/" + os.path.basename(q)] = sha16(q)
        cf, F = tab(pg)
        _hz, ff = rates(pm, len(F))
        Ts, Ss = [], []
        for k in ("Fy1", "Fy2"):
            st = contacts(F[:, cf[k]], ff)
            if len(st) < 2:
                raise SystemExit(f"[gait] ★WBDS{sid:02d} {k} 닿음이 모자란다({len(st)})")
            Ts.append(float(np.median(np.diff([a for a, _b in st]))) / ff)
            Ss.append(float(np.median([b - a for a, b in st])) / ff)
        duty.append(float(np.mean(Ss)) / float(np.mean(Ts)))
    if len(used) < 20:
        raise SystemExit(f"[gait] ★걷기 사람이 모자란다: {len(used)}")
    M = np.mean(per, axis=0)
    hip, knee, ank, pel = M
    v = [a for a, b in speeds]
    vh = [a / math.sqrt(G * b) for a, b in speeds]
    return {"cond": WALK_COND, "subjects": used, "emptyFiles": empty, "n": len(used), "speed": round(float(np.mean(v)), 4),
            "vhat": round(float(np.mean(vh)), 4), "duty": round(float(np.mean(duty)), ROUND), "hip": hip, "knee": knee, "ankle": ank, "pelvisTilt": pel}


def _runs(on, minlen, gap):
    runs, i, n = [], 0, len(on)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]:
                j += 1
            runs.append([i, j])
            i = j
        else:
            i += 1
    out = []
    for r in runs:
        if out and r[0] - out[-1][1] < gap:
            out[-1][1] = r[1]
        else:
            out.append(r)
    return [r for r in out if r[1] - r[0] >= minlen]


def times(p):
    """표지 파일의 시각 열만(첫 열) — 표본 셈.  [T723 `gait_speeds.py` 에서 옮김 · T741 — 두 표가 같은 자]"""
    L = open(p, encoding="utf-8").read().strip().split("\n")[1:]
    return np.array([float(l.split("\t", 1)[0]) for l in L])


def rates(pm, nF):
    """표지 표본 = (판 수 − 1) ÷ 시각 폭(시각 열은 1/1000 초 반올림) · 힘판 = 그 두 배 — 두 파일 길이가 같은 초인지 맞대 본다."""
    tm = times(pm)
    hz = (len(tm) - 1) / float(tm[-1] - tm[0])
    ff = 2.0 * hz
    if abs(nF / ff - len(tm) / hz) > 0.05:
        raise SystemExit(f"[gait] ★힘·표지 길이가 안 맞다: {pm}")
    return hz, ff


def contacts(fy, ff):
    """닿음 = 수직 반력 20 N 문턱 · 끊김 0.033 s 미만은 잇고 0.05 s 미만 닿음은 버린다 · 파일 끝에 걸린 닿음은 뺀다."""
    on = fy > STANCE_N
    st = _runs(on, minlen=int(round(0.05 * ff)), gap=int(round(0.033 * ff)))
    return [(a, b) for a, b in st if a > 0 and b < len(fy)]


def run(src, files):
    d = os.path.join(src, "rbds")
    subs = sorted(int(m.group(1)) for m in (re.match(r"RBDS0(\d\d)processed\.txt$", f) for f in os.listdir(d)) if m and 1 <= int(m.group(1)) <= 28)
    if len(subs) != 28:
        raise SystemExit(f"[gait] ★달리기 원본 28명이 아니다: {len(subs)}")
    per, cyc, kept, duty, rise = [], [], {}, [], []
    pinfo = os.path.join(src, "rbds_info", "RBDSinfo_0.txt")
    if not os.path.exists(pinfo):
        raise SystemExit(f"[gait] ★달리기 사람 표가 없다: {pinfo}")
    files["rbds_info/RBDSinfo_0.txt"] = sha16(pinfo)
    rows = open(pinfo, encoding="utf-8").read().strip().split("\n")
    hd = rows[0].split("\t")
    height = {int(x.split("\t")[hd.index("Subject")]): float(x.split("\t")[hd.index("Height")]) * 10.0 for x in rows[1:]}   # cm → mm(표지 단위)
    for sid in subs:
        pm, pf, pp = (os.path.join(d, f"RBDS{sid:03d}{x}") for x in (f"runT{RUN_COND}markers.txt", f"runT{RUN_COND}forces.txt", "processed.txt"))
        for p in (pm, pf, pp):
            files["rbds/" + os.path.basename(p)] = sha16(p)
        cm, Mk = tab(pm)
        cf, F = tab(pf)
        cp, P = tab(pp)
        tm = Mk[:, cm["Time"]]
        # ★[T723] 표지 표본 = (판 수 − 1) ÷ 시간 폭 — 시각 열은 1/1000 초로 반올림돼 있어(0.007 · 0.006 · 0.007 …) 이웃 차의 가운데값은
        #   0.007 이다(= 142.9 Hz · 실제 150 Hz). T708 은 가운데값을 써서 힘 시각이 5 % 늘어 표지와 어긋났다(30 초 끝에서 1.5 초) ⇒ 골반 기울기 창이 밀렸다.
        hz = (len(tm) - 1) / float(tm[-1] - tm[0])
        ff = 2.0 * hz                                                  # 힘판 표본 = 표지의 두 배(원자료 열 수 · 30 s)
        if abs(len(F) / ff - len(Mk) / hz) > 0.05:
            raise SystemExit(f"[gait] ★RBDS{sid:03d} 힘·표지 길이가 안 맞다")
        tf = (F[:, cf["Time"]] - 1) / ff
        mk = lambda n: Mk[:, [cm[n + "X"], cm[n + "Y"], cm[n + "Z"]]]
        A_ = (mk("R.ASIS") + mk("L.ASIS")) / 2
        P_ = (mk("R.PSIS") + mk("L.PSIS")) / 2
        tilt = np.degrees(np.arctan2(P_[:, 1] - A_[:, 1], A_[:, 0] - P_[:, 0]))    # 앞기울기 +(ASIS 가 PSIS 보다 낮다) · 실험실 X 앞 · Y 위
        ok = np.isfinite(tilt)
        tilt_f = np.interp(tm, tm[ok], tilt[ok])
        pz = (A_[:, 1] + P_[:, 1]) / 2.0                                    # ★[T741] 골반 가운데 높이(ASIS·PSIS 넷 · 같은 빈칸 규칙)
        pz_f = np.interp(tm, tm[ok], pz[ok])
        # ★[T741] 디딤 비율 — 한 힘판(두 발)의 닿음 시작 i → i+2 = 한 주기 · 닿음 길이 가운데값
        sc = contacts(F[:, cf["Fy"]], ff)
        a0 = [x for x, _y in sc]
        if len(a0) < 3:
            raise SystemExit(f"[gait] ★RBDS{sid:03d} 닿음이 모자란다({len(a0)})")
        duty.append((float(np.median([y - x for x, y in sc])) / ff) / (float(np.median([a0[i + 2] - a0[i] for i in range(len(a0) - 2)])) / ff))
        st = _runs(F[:, cf["Fy"]] > STANCE_N, minlen=int(round(0.05 * ff)), gap=int(round(0.033 * ff)))
        hR, hL = mk("R.Heel.Bottom"), mk("L.Heel.Bottom")
        ev = {"R": [], "L": []}
        for a, _b in st:
            k = int(np.clip(np.searchsorted(tm, tf[a]), 0, len(tm) - 1))
            if np.isfinite(hR[k, 0]) and np.isfinite(hL[k, 0]):
                ev["R" if hR[k, 0] > hL[k, 0] else "L"].append(tf[a])
        sides, rs = [], []
        for s in "RL":
            e = ev[s]
            strides = []
            for t0, t1 in zip(e[:-1], e[1:]):
                if not (0.5 < t1 - t0 < 1.0):
                    continue
                seg = (tm >= t0) & (tm <= t1)
                if ok[seg].mean() < 0.9:
                    continue
                strides.append(np.interp(np.linspace(t0, t1, 101), tm, tilt_f))
                h = np.interp(np.linspace(t0, t1, 101), tm, pz_f)
                rs.append((h - h.mean()) / height[sid])
                cyc.append(t1 - t0)
            if len(strides) < 10:
                raise SystemExit(f"[gait] ★RBDS{sid:03d}{s} 주기가 모자란다({len(strides)})")
            kept[f"{sid}{s}"] = len(strides)
            hip, knee, ank = (P[:, cp[f"{s}{j}AngZ{RUN_COND}"]] for j in ("hip", "knee", "ankle"))
            sides.append(np.stack([hip, knee, ank, np.mean(strides, axis=0)]))
        per.append(np.mean(sides, axis=0))
        rise.append(np.mean(rs, axis=0))
    M = np.mean(per, axis=0)
    hip, knee, ank, pel = M
    return {"cond": RUN_COND, "subjects": subs, "n": len(subs), "speed": float(RUN_COND) / 10.0,
            "cycleSec": round(float(np.median(cyc)), 4), "strides": int(sum(kept.values())), "duty": round(float(np.mean(duty)), ROUND),
            "pelvisRise": [round(float(x), 5) for x in np.mean(rise, axis=0)],
            "hip": hip, "knee": knee, "ankle": ank, "pelvisTilt": pel}


def seg(d):
    """관절각 → 다리 마디 땅 기준 시상각(앞으로 + · 수직 0 · 발 = 바닥 평평 0)."""
    thigh = d["hip"] - d["pelvisTilt"]
    shank = thigh - d["knee"]
    foot = shank + d["ankle"]
    return thigh, shank, foot


def main():
    args = sys.argv[1:]
    src = next((a.split("=", 1)[1] for a in args if a.startswith("--src=")), None)
    if not src:
        raise SystemExit("쓰는 법: python3 scripts/gait_norms.py --src=<원본 폴더(wbds/ · rbds/)>")
    files = {}
    doc = {"_": "gait_norms.py 산물 — 손편집 금지. 원본은 저장소 밖(공개 · CC BY 4.0 · 아래 doi) · 규약은 그 스크립트 머리.",
           "units": "도(°) · 101점 = 보행 주기 0~100 %(0 = 그 발 닿음) · 마디 각 = 땅 기준 시상각(앞으로 + · 넓적다리·정강이 0 = 수직 · 발 0 = 바닥 평평)",
           "sources": {
               "walk": {"cite": "Fukuchi CA, Fukuchi RK, Duarte M (2018) A public dataset of overground and treadmill walking kinematics and kinetics in healthy individuals. PeerJ 6:e4640",
                        "doi": "10.7717/peerj.4640", "data": "10.6084/m9.figshare.5722711", "license": "CC BY 4.0"},
               "run": {"cite": "Fukuchi RK, Fukuchi CA, Duarte M (2017) A public dataset of running biomechanics and the effects of running speed on lower extremity kinematics and kinetics. PeerJ 5:e3298",
                       "doi": "10.7717/peerj.3298", "data": "10.6084/m9.figshare.4543435", "license": "CC BY 4.0"}},
           "rule": {"angles": "Cardan Z-X-Y · Z = 굽힘(엉덩이·무릎 굽힘 + · 발목 발등굽힘 +)", "thigh": "엉덩이 굽힘 − 골반 앞기울기", "shank": "넓적다리 − 무릎 굽힘",
                    "foot": "정강이 + 발목", "runPelvis": "표지 ASIS 가운데 → PSIS 가운데 시상 기울기(앞기울기 +) · 수직 반력 20 N 문턱 사건 · 닿는 발 = 앞에 있는 발뒤꿈치",
                    "choose": "게임 속도와 무차원 속도가 가장 가까운 조건 — 걷기 T08 · 달리기 4.5 m/s(둘 다 자료의 가장 빠른 조건)",
                    "duty": "[T741] 디딤 비율 = 같은 판 힘판 · 수직 반력 20 N 문턱 · 파일 끝 닿음 뺌 · 걷기 힘판마다(발마다) 닿음 시작 간격·길이 가운데값 · 달리기 한 힘판 닿음 시작 i → i+2 · 사람마다 디딤 ÷ 주기 → 평균",
                    "pelvisRise": "[T741] 달리기 골반 가운데(ASIS·PSIS 넷) 높이 − 주기 평균 ÷ 그 사람 키(무차원) · 골반 기울기와 같은 주기 · 사람 평균 → 무리 평균(101점 · 0 % = 제 발 닿음)"}}
    for name, fn in (("walk", walk), ("run", run)):
        d = fn(src, files)
        th, sh, ft = seg(d)
        r = lambda a: [round(float(x), ROUND) for x in a]
        doc[name] = {k: v for k, v in d.items() if k not in ("hip", "knee", "ankle", "pelvisTilt")}
        doc[name].update({"hip": r(d["hip"]), "knee": r(d["knee"]), "ankle": r(d["ankle"]), "pelvisTilt": r(d["pelvisTilt"]),
                          "thigh": r(th), "shank": r(sh), "foot": r(ft),
                          "range": {"thigh": [round(float(th.min()), 2), round(float(th.max()), 2)], "knee": [round(float(d["knee"].min()), 2), round(float(d["knee"].max()), 2)],
                                    "ankle": [round(float(d["ankle"].min()), 2), round(float(d["ankle"].max()), 2)], "hip": [round(float(d["hip"].min()), 2), round(float(d["hip"].max()), 2)]}})
        print(f"[gait] {name}: 조건 {d['cond']} · {d['n']}명 · 넓적다리 {doc[name]['range']['thigh']} · 무릎 {doc[name]['range']['knee']} · 발목 {doc[name]['range']['ankle']}")
    doc["files"] = dict(sorted(files.items()))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    print(f"[gait] 저장: {os.path.relpath(OUT, ROOT)} · 원본 {len(files)}개")


if __name__ == "__main__":
    main()
