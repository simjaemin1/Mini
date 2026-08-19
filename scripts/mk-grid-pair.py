#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""같은 자리 3배 확대 짝을 만든다 — 판정용 그림.  [타 세션 지시 3]
   사용: python3 scripts/mk-grid-pair.py <출력디렉터리> [BOX=x0,y0,x1,y1]
"""
import os, sys, glob
from PIL import Image, ImageDraw, ImageFont

SRC = os.environ.get('SRC', '/tmp/mtab')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/산그림'
BOX = tuple(int(v) for v in os.environ.get('BOX', '250,400,650,700').split(','))
Z = int(os.environ.get('ZOOM', '3'))
os.makedirs(OUT, exist_ok=True)


def kfont(sz):
    for p in glob.glob('/usr/share/fonts/opentype/noto/NotoSansCJK*.ttc'):
        for i in range(6):
            try:
                f = ImageFont.truetype(p, sz, index=i)
                if 'KR' in f.getname()[0]:
                    return f
            except Exception:
                pass
    return ImageFont.load_default()


def strip(items, title):
    zs = []
    for f, label in items:
        im = Image.open(os.path.join(SRC, f + '.png'))
        zs.append((im.crop(BOX).resize(((BOX[2] - BOX[0]) * Z, (BOX[3] - BOX[1]) * Z), Image.NEAREST), label))
    W, H = zs[0][0].size
    cv = Image.new('RGB', (W * len(zs) + 16 * (len(zs) - 1), H + 76), (16, 16, 18))
    d = ImageDraw.Draw(cv)
    fb, fs = kfont(26), kfont(17)
    d.text((6, 6), title, fill=(240, 240, 240), font=fb)
    for i, (z, label) in enumerate(zs):
        x = i * (W + 16)
        cv.paste(z, (x, 70))
        d.text((x + 4, 42), label, fill=(225, 225, 225), font=fs)
    return cv


if __name__ == '__main__':
    t = '같은 자리 %d배 확대 — 화면 %s' % (Z, BOX)
    strip([('A_현행_캔버스', 'A  현행 — 캔버스 폴리곤 (조각 이음새가 밝은 철망으로 남는다)'),
           ('B_새판_webgl', 'B  새판 — WebGL 높이장 메쉬 (이음새 없음)')], t) \
        .save(os.path.join(OUT, '산_격자_3배확대_짝.png'))
    have = [f for f in ('C_gsub3', 'D_gsub14') if os.path.exists(os.path.join(SRC, f + '.png'))]
    if have:
        strip([('B_새판_webgl', 'B  세분 6 (채택)')] +
              [(f, 'C  세분 3' if f == 'C_gsub3' else 'D  세분 14') for f in have],
              '대조군 — 세분 수를 바꿔도 남은 결은 안 변한다 (조각 탓이 아니라는 반례)') \
            .save(os.path.join(OUT, '산_대조_세분수.png'))
    for f in ('A_현행_캔버스', 'B_새판_webgl'):
        Image.open(os.path.join(SRC, f + '.png')).save(os.path.join(OUT, '산_전체_%s.png' % f))
    print('저장:', sorted(os.listdir(OUT)))
