"""
to_midi.py — 손으로 쓴 악보를 MIDI 로. 음악성만 따로 들어볼 수 있게.

국악기는 MIDI 에 없으므로 가장 가까운 GM 악기로 대신한다.
소리가 아니라 **가락과 장단**을 들으시라고 만드는 파일이다.
    대금 → Flute(73)   단소 → Piccolo(72)   피리 → Oboe(68)
    가야금 → Koto(107) 거문고 → Shamisen(106)
    장구 → 10번 채널 타악 (덩·쿵=Low Tom, 덕·더=High Wood Block, 기덕=Side Stick, 굴림=Cabasa)
"""
import struct
import score_village_day as S
import compose as C

PYEONGJO = [0, 2, 5, 7, 9]
TPQ = 480                     # 4분음표당 틱


def deg_midi(root, deg):
    o, i = divmod(int(deg), 5)
    return root + 12 * o + PYEONGJO[i]


def vlq(n):
    out = bytearray([n & 0x7F])
    n >>= 7
    while n:
        out.insert(0, (n & 0x7F) | 0x80)
        n >>= 7
    return bytes(out)


def track(events, name=b""):
    """events: [(tick, status, d1, d2)] — 절대 틱."""
    data = bytearray()
    if name:
        data += vlq(0) + b"\xff\x03" + vlq(len(name)) + name
    last = 0
    for t, st, d1, d2 in sorted(events, key=lambda e: (e[0], e[1] & 0xF0)):
        # 프로그램 체인지(0xC0)·채널 애프터터치(0xD0)는 데이터 바이트가 **하나**다.
        body = bytes([st, d1]) if (st & 0xF0) in (0xC0, 0xD0) else bytes([st, d1, d2])
        data += vlq(t - last) + body
        last = t
    data += vlq(0) + b"\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(data)) + bytes(data)


def meta_track(bpm, num, den, name):
    d = bytearray()
    d += vlq(0) + b"\xff\x03" + vlq(len(name)) + name
    us = int(60_000_000 / bpm)
    d += vlq(0) + b"\xff\x51\x03" + us.to_bytes(3, "big")
    import math
    d += vlq(0) + b"\xff\x58\x04" + bytes([num, int(math.log2(den)), 24, 8])
    d += vlq(0) + b"\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(d)) + bytes(d)


def notes_to_events(notes, ch, prog, vel=90):
    ev = [(0, 0xC0 | ch, prog, 0)]
    for tick, dur, midi, v in notes:
        ev.append((tick, 0x90 | ch, int(midi), int(v)))
        ev.append((tick + max(10, dur - 8), 0x80 | ch, int(midi), 0))
    return ev


# 소박 = 8분음표 한 개로 본다(굿거리 12소박 = 12/8 한 마디)
SOB_TICKS = TPQ // 2


def build():
    bpm = 60.0 / (S.SOBAK * 3)      # 한 대박(3소박)이 점4분음표
    bpm = 60.0 / S.SOBAK / 2        # 8분음표 기준 BPM → 4분음표 BPM
    tracks = [meta_track(bpm, 12, 8, b"village_day (gutgeori, G pyeongjo)")]

    def bar_tick(b):
        return b * S.NCY_S * SOB_TICKS

    # ── 대금 (주선율)
    mel = []
    for b, bar in enumerate(S.MELODY):
        for s, d, g in bar:
            mel.append((bar_tick(b) + int(s * SOB_TICKS), int(d * SOB_TICKS),
                        deg_midi(67, g), 96))
    tracks.append(track(notes_to_events(mel, 0, 73), b"daegeum (Flute)"))

    # ── 단소 (응답)
    dan = []
    for b, ns in S.DANSO.items():
        for s, d, g in ns:
            dan.append((bar_tick(b) + int(s * SOB_TICKS), int(d * SOB_TICKS),
                        deg_midi(79, g), 78))
    tracks.append(track(notes_to_events(dan, 1, 72), b"danso (Piccolo)"))

    # ── 피리
    pir = []
    for b, ns in S.PIRI_BARS.items():
        for s, d, g in ns:
            pir.append((bar_tick(b) + int(s * SOB_TICKS), int(d * SOB_TICKS),
                        deg_midi(67, g), 66))
    tracks.append(track(notes_to_events(pir, 2, 68), b"piri (Oboe)"))

    # ── 가야금
    gay = []
    for b in range(S.NBAR):
        for s, d, g in S.GAYA[S.GAYA_PLAN[b]]:
            gay.append((bar_tick(b) + int(s * SOB_TICKS), int(d * SOB_TICKS),
                        deg_midi(55, g), 72))
    tracks.append(track(notes_to_events(gay, 3, 107), b"gayageum (Koto)"))

    # ── 거문고
    geo = []
    for b in range(S.NBAR):
        if not S.GEO_ON[b]:
            continue
        for s, d, g in S.GEO:
            geo.append((bar_tick(b) + int(s * SOB_TICKS), int(d * SOB_TICKS),
                        deg_midi(43, g), 70))
    tracks.append(track(notes_to_events(geo, 4, 106), b"geomungo (Shamisen)"))

    # ── 장구 (10번 채널)
    HIT = {"G": 45, "g": 41, "c": 76, "d": 77, "i": 37, "r": 69}
    drm = []
    _, pat = C.JANGDAN["gutgeori"]
    for b in range(S.NBAR):
        g = S.DRUM[b]
        if g <= 0:
            continue
        for pos, kind, v in pat:
            drm.append((bar_tick(b) + int(pos * SOB_TICKS), SOB_TICKS,
                        HIT[kind], max(1, min(127, int(127 * v * g)))))
    ev = []
    for tick, dur, n, v in drm:
        ev.append((tick, 0x99, n, v))
        ev.append((tick + dur - 8, 0x89, n, 0))
    tracks.append(track(ev, b"janggu"))

    hdr = b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), TPQ)
    return hdr + b"".join(tracks)


if __name__ == "__main__":
    open("마을낮.mid", "wb").write(build())
    n = sum(len(b) for b in S.MELODY)
    print(f"마을낮.mid  {S.NBAR}장단 · {S.NBAR*S.NCY_S*S.SOBAK:.0f}초 · 주선율 {n}음")
