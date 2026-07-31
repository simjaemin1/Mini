"""
check_use.py — 곡을 렌더하면서 '가야금 음이 실제로 어떤 녹음에서 왔는지' 세어본다.

렌더 결과만 들으면 샘플이 진짜 쓰였는지, 몇 개나 합성음으로 새어나갔는지 알 수 없다.
그래서 Bank.note 를 감싸 호출을 전부 기록한다.
"""
import sys
import collections
import numpy as np

import gugak as G
import sampler as S

ROOT = sys.argv[1] if len(sys.argv) > 1 else "samples_gaya"
NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
nm = lambda m: f"{NOTE[int(round(m)) % 12]}{int(round(m)) // 12 - 1}"

bank = S.Bank(ROOT)
log = []
orig_note = S.Bank.note
orig_pick = S.Bank._pick


def note(self, inst, midi, dur, amp=1.0, **kw):
    y = orig_note(self, inst, midi, dur, amp, **kw)
    log.append(dict(inst=inst, midi=midi, dur=dur, amp=amp,
                    want=kw.get("art"), ok=y is not None))
    return y


def pick(self, inst, midi, rr=0, dur=None, amp=1.0, art=None):
    got = orig_pick(self, inst, midi, rr, dur, amp, art)
    if got and log:
        log[-1] = log[-1]
    if got:
        log.append(dict(_pick=True, inst=inst, midi=midi, want=art,
                        got=got[2].get("art"), dyn=got[2].get("dyn"),
                        src=got[2].get("src"), smidi=got[0]))
    return got


S.Bank.note = note
S.Bank._pick = pick

import compose as C
import arirang as A
used = S.install(bank, [C, A])

allt = {**C.TRACKS, **A.ARI_TRACKS}
names = sys.argv[2:] or list(allt)
rows = []
for name in names:
    log.clear()
    spec = allt[name]
    y = spec["fn"](spec)
    picks = [e for e in log if e.get("_pick")]
    calls = [e for e in log if not e.get("_pick")]
    gaya = [e for e in calls if e["inst"] == "gayageum"]
    fail = [e for e in gaya if not e["ok"]]
    arts = collections.Counter(p["got"] for p in picks if p["inst"] == "gayageum")
    dyns = collections.Counter(p["dyn"] for p in picks if p["inst"] == "gayageum")
    srcs = len({p["src"] for p in picks if p["inst"] == "gayageum"})
    shift = [abs(p["midi"] - p["smidi"]) for p in picks
             if p["inst"] == "gayageum" and p["midi"] is not None]
    ms = [e["midi"] for e in gaya if e["midi"] is not None]
    rows.append((name, len(gaya), len(fail), arts, dyns, srcs,
                 (min(ms), max(ms)) if ms else None,
                 (float(np.mean(shift)), float(np.max(shift))) if shift else (0, 0)))

print(f"{'곡':20s} {'가야금음':>6s} {'합성대체':>6s} {'음역':>11s} "
      f"{'음정이동 평균/최대':>16s}  주법 분포")
print("-" * 118)
tot_fail = 0
for name, n, nf, arts, dyns, srcs, rng, sh in rows:
    tot_fail += nf
    r = f"{nm(rng[0])}~{nm(rng[1])}" if rng else "-"
    a = " ".join(f"{S.ART_NAME_KO.get(k, k)}{v}" for k, v in arts.most_common())
    print(f"{name:20s} {n:6d} {nf:6d} {r:>11s} {sh[0]:7.2f}/{sh[1]:5.2f}반음  {a}")
print("-" * 118)
print(f"합성음으로 새어나간 가야금 음: {tot_fail}개")
