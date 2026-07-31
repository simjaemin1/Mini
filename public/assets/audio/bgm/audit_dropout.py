"""지속악기 음이 **요청한 길이를 못 채우고 도중에 꺼지는지** 본다.
무음으로 덧대는 자리는 소리가 뚝 끊긴 것으로 들린다 — 하나도 없어야 한다."""
import numpy as np, sampler as S, gugak as G, compose as C, render_score as R
bad = []
_o = S.Bank.note
def spy(self, inst, midi, dur, amp=1.0, **k):
    y = _o(self, inst, midi, dur, amp, **k)
    if y is not None and inst in S.SUSTAINING and len(y):
        m = np.abs(y.mean(1) if y.ndim > 1 else y)
        ev = G.onepole_lp(m, 40.0); mx = ev.max()
        if mx > 1e-9:
            kk = int(dur * G.SR)
            if kk > 8 and len(ev) >= kk:
                # 요청 길이 안에서 -45dB 아래로 떨어져 다시 안 올라오는가
                a0 = int(0.09 * G.SR)          # 페이드인 구간은 건너뛴다
                low = ev[a0:kk] < mx * 10 ** (-45 / 20)
                if low.any():
                    t = (a0 + int(np.argmax(low))) / G.SR
                    if t < dur * 0.9:
                        bad.append((inst, round(dur, 2), round(t, 3)))
    return y
S.Bank.note = spy
if __name__ == "__main__":
    bank = S.Bank(["samples_gaya","samples_daegeum","samples_piri","samples_danso",
                   "samples_geomungo","samples_janggu"])
    S.install(bank, [C, R]); R.build()
    S.Bank.note = _o
    print(f"길이를 못 채우고 도중에 꺼진 음: {len(bad)}개")
    for b in bad[:10]:
        print(f"  {b[0]} 요청 {b[1]}초인데 {b[2]}초에 꺼짐")
