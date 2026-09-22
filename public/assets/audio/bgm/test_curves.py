#!/usr/bin/env python3
"""
프레이즈 곡선 계약 [T353] — `python3 public/assets/audio/bgm/test_curves.py`

⚠**13곡 해시 게이트는 여기서 못 잰다** — 굽기가 `samples_*/_index.json`(국악원 녹음)을 요구하는데
그 폴더는 레포 밖이고 이 자리에 없다(보고 §0-ⓐ). 대신 **끔이면 새 코드가 아예 안 불린다**는 것을
정적으로 못 박는다(ⓑ) — 그게 "끔 = 지금 경로 그대로"의 더 강한 증명이다.
"""
import os, re, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gugak as G, phrase as P

fail = 0
def ok(c, m, note=""):
    global fail
    print(("  ✓ " if c else "  ✗ ") + m + (f"  {note}" if note else ""))
    if not c: fail += 1

print("=== 프레이즈 곡선 계약 (T353) ===")

# ⓐ 사본 0 — phrase.py 의 악기 표가 gugak.py 의 기본값과 같은가
print("\nⓐ 악기 값은 `gugak.py` 가 정본이다 — 표가 갈라지면 문다")
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gugak.py")).read()
for inst in P.SUSTAINED:
    body = src.split(f"def {inst}(")[1].split("return")[0]
    got = dict(re.findall(r"(\w+)=([-\d.]+)", body.split("p = dict(")[1].split(")")[0]))
    mine = P.inst_defaults(inst)
    bad = [k for k, v in got.items() if abs(float(v) - float(mine.get(k, 1e9))) > 1e-9]
    ok(not bad, f"{inst}: `gugak.py` 기본값 {len(got)}칸이 `phrase.py` 표와 같다",
       " ".join(f"{k}:{got[k]}≠{mine.get(k)}" for k in bad) or f"{sorted(got)}")

# ⓑ 손잡이 — 기본 끔이고, 끔이면 굽는 세 파일이 phrase 를 안 부른다(정적)
print("\nⓑ 손잡이 `BGM_CURVES` — 기본 끔 · 끔이면 **새 코드가 아예 안 불린다**")
ok(os.environ.get("BGM_CURVES", "") == "" and not P.curves_on(), "기본값이 끔이다", "BGM_CURVES 미설정")
for f in ("compose.py", "arirang.py", "gugak.py"):
    t = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), f)).read()
    imp = re.findall(r"^\\s*(?:from|import)\\s+phrase\\b", t, re.M)
    ok(not imp, f"`{f}` 가 `phrase` 를 **import 도 안 한다**(끔=지금 경로 그대로의 증명)")

# ⓒ 곡선이 음 경계에서 안 끊긴다 — 옛 경로와 수로 견준다
print("\nⓒ ★음 경계 — 옛 경로는 0 으로 떨어지고 새 경로는 안 떨어진다")
notes = [(0.0, 0.9, 392.0, 26, 0), (0.9, 0.6, 440.0, 14, 0), (1.5, 1.2, 523.25, 30, -22)]
f0, loud, meta = P.phrase_curve(notes, "daegeum")
ok(len(f0) > 0 and meta["glides"] == len(notes) - 1,
   f"악구 하나로 이었다 — 음 {meta['notes']} · 글라이드 {meta['glides']} · {meta['glide_ms']}ms(어택에서 유도)", "")
bounds = [int(n[0] * G.SR) for n in notes[1:]]
lo_new = [float(loud[b - 32:b + 32].min()) for b in bounds]
ok(all(v > 0.5 for v in lo_new), "새 경로: 음 경계에서 음량이 0 으로 안 떨어진다",
   " ".join(f"{v:.3f}" for v in lo_new))
old = [G.daegeum(n[2], n[1], seed=1) for n in notes]
lo_old = [float(np.abs(old[i][-64:]).max()) for i in range(len(old) - 1)]
ok(all(v < 0.02 for v in lo_old), "옛 경로: 음마다 끝이 0 으로 떨어진다(그래서 끊긴다)",
   " ".join(f"{v:.4f}" for v in lo_old))
# 피치도 이어지는가 — 경계 앞뒤 32샘플에서 점프가 없다
jump = [abs(float(f0[b]) - float(f0[b - 1])) for b in bounds]
ok(all(j < 5.0 for j in jump), "새 경로: 경계에서 f0 이 **점프하지 않는다**(글라이드)",
   " ".join(f"{j:.2f}Hz" for j in jump))

# ⓓ 자명 통과 금지 — 글라이드를 0 으로 만들면 ⓒ 가 문다
print("\nⓓ 자명 통과 금지 — 글라이드가 없으면 얼마나 튀는지 **수로** 보인다")
# ★상수를 0 으로 두는 식으로 흉내내지 않는다(1차 판이 그랬다가 0.68Hz 가 나와 문턱 아래였다).
#   글라이드 없는 **계단 f0** 를 이 자리에서 직접 만들어 견준다 — 그게 진짜 반사실이다.
step = np.zeros(len(f0), np.float32)
for (t0_, ln, fz, *_r) in notes:
    step[int(t0_ * G.SR):int((t0_ + ln) * G.SR)] = fz
j_step = [abs(float(step[b]) - float(step[b - 1])) for b in bounds]
j_new = [abs(float(f0[b]) - float(f0[b - 1])) for b in bounds]
ok(all(j > 10.0 for j in j_step) and all(j < 1.0 for j in j_new),
   "계단 f0 은 경계에서 크게 튀고(>10Hz) 곡선 f0 은 안 튄다(<1Hz)",
   "계단 " + " ".join(f"{j:.1f}Hz" for j in j_step) + " ↔ 곡선 " + " ".join(f"{j:.2f}Hz" for j in j_new))

# ⓔ 어댑터 — 백엔드가 무엇이 울었는지 말한다
print("\nⓔ 어댑터 — 조용히 A 로 안 떨어진다")
y, who = P.render_curve("daegeum", f0, loud, seed=1)
ok(len(y) == len(f0) and who.startswith("A("), f"백엔드를 이름으로 돌려준다", who)
try:
    P.render_curve("daegeum", f0, loud, seed=1, backend="B"); bad = True
except RuntimeError as e:
    bad = False
ok(not bad, "모델 없이 백엔드 B 를 시키면 **조용히 A 로 안 가고 죽는다**")

print(f"\n결과: {'FAIL(%d)' % fail if fail else 'PASS'}")
sys.exit(1 if fail else 0)
