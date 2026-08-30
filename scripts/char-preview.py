#!/usr/bin/env python3
# === scripts/char-preview.py — 캐릭터 시트 육안 검사판 ===========================
#
# ★자산 정본 규약: **3패스 육안 + 실제 클라 실화면 스샷**. 이 스크립트가 그 첫 패스다.
#   시트를 레이어 순서대로 합성(몸→옷→도구)하고 확대해, 대비 배경 위에 얹어 한 장으로 만든다.
#   ★numpy 없이 — Blender 번들 파이썬에도 없고, 컨테이너 파이썬에도 의존하지 않는다.
#
# 실행: python3 scripts/char-preview.py <클립> [--tool axe|rod|none] [--scale 4] [--out 경로]

import sys, os, struct, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SHEETDIR = os.path.join(ROOT, "public", "assets", "char")


def read_png(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', path
    i, w, h, idat = 8, None, None, b''
    while i < len(d):
        ln = struct.unpack('>I', d[i:i + 4])[0]
        typ = d[i + 4:i + 8]
        dat = d[i + 8:i + 8 + ln]
        if typ == b'IHDR':
            w, h, bd, ct = struct.unpack('>IIBB', dat[:10])
            assert bd == 8 and ct == 6, f"{path}: 8bit RGBA 만 지원 (bd={bd} ct={ct})"
        elif typ == b'IDAT':
            idat += dat
        i += 8 + ln + 4
    raw = zlib.decompress(idat)
    bpp, stride = 4, w * 4
    out, prev, pos = bytearray(), bytearray(stride), 0
    for _y in range(h):
        f = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos + stride]); pos += stride
        if f:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                if f == 1: line[x] = (line[x] + a) & 255
                elif f == 2: line[x] = (line[x] + b) & 255
                elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
                else:
                    p = a + b - c
                    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                    pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                    line[x] = (line[x] + pr) & 255
        out += line
        prev = line
    return w, h, bytes(out)


def write_png(path, w, h, px):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += px[y * w * 4:(y + 1) * w * 4]
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(bytes(raw), 6))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)


def over(dst, src, n):
    """src 를 dst 위에 알파 합성(같은 크기)."""
    for i in range(0, n * 4, 4):
        sa = src[i + 3]
        if not sa:
            continue
        if sa == 255:
            dst[i:i + 4] = src[i:i + 4]
        else:
            a = sa / 255.0
            for k in range(3):
                dst[i + k] = int(src[i + k] * a + dst[i + k] * (1 - a))
            dst[i + 3] = min(255, int(sa + dst[i + 3] * (1 - a)))


def main():
    clip = sys.argv[1] if len(sys.argv) > 1 else 'walk'
    tool = 'axe'
    scale = 4
    outp = os.path.join('/tmp', f'char-preview-{clip}.png')
    for i, a in enumerate(sys.argv):
        if a == '--tool': tool = sys.argv[i + 1]
        if a == '--scale': scale = int(sys.argv[i + 1])
        if a == '--out': outp = sys.argv[i + 1]

    layers = [f'body_{clip}.png', f'clothes_hemp_{clip}.png']
    if tool != 'none':
        layers.append(f'tool_{tool}_{clip}.png')
    w = h = None
    comp = None
    for fn in layers:
        p = os.path.join(SHEETDIR, fn)
        if not os.path.exists(p):
            print("없음:", p); continue
        ww, hh, px = read_png(p)
        if comp is None:
            w, h = ww, hh
            comp = bytearray(w * h * 4)
        assert (ww, hh) == (w, h), f"{fn}: 레이어 크기 불일치 {ww}x{hh} != {w}x{h}"
        over(comp, px, w * h)

    # 체크무늬 배경 위에 얹고 확대 — 알파 경계와 실루엣을 눈으로 본다
    OW, OH = w * scale, h * scale
    out = bytearray(OW * OH * 4)
    for y in range(OH):
        for x in range(OW):
            sx, sy = x // scale, y // scale
            s = (sy * w + sx) * 4
            d = (y * OW + x) * 4
            bg = 58 if ((x // 16 + y // 16) & 1) else 78
            a = comp[s + 3] / 255.0
            out[d] = int(comp[s] * a + bg * (1 - a))
            out[d + 1] = int(comp[s + 1] * a + bg * (1 - a))
            out[d + 2] = int(comp[s + 2] * a + bg * (1 - a))
            out[d + 3] = 255
    write_png(outp, OW, OH, bytes(out))
    print(f"{outp}  {OW}x{OH}  (원본 {w}x{h} · ×{scale} · 레이어 {len(layers)})")

    # 색 검증은 눈이 아니라 숫자로 — 알파>128 픽셀 평균 RGB (자산 정본 규약)
    n = r = g = b = 0
    for i in range(0, w * h * 4, 4):
        if comp[i + 3] > 128:
            n += 1; r += comp[i]; g += comp[i + 1]; b += comp[i + 2]
    if n:
        print(f"  불투명 {n}px · 평균 RGB ({r//n},{g//n},{b//n})  "
              f"[지면 grass_angled = (64,82,47) 대조]")


main()
