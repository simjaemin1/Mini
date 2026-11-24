#!/usr/bin/env python3
# T1447 그림 실험 — 계측기(probe.json)의 그림 칸을 PNG 로 · 판마다 모음 그림
#   python3 render.py <판 폴더>... --out <그림 폴더>
import json, sys, os, math
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
FB = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
f14 = ImageFont.truetype(FONT, 14, index=1); f13 = ImageFont.truetype(FONT, 13, index=1); f16b = ImageFont.truetype(FB, 16, index=1); f12 = ImageFont.truetype(FONT, 12, index=1)
COL = {'0': (239, 233, 220), '1': (150, 160, 170), '2': (205, 190, 222), '3': (190, 214, 160), '4': (96, 160, 72), '5': (241, 194, 50), '6': (204, 0, 0), '7': (90, 170, 230), '8': (20, 90, 160)}
LEG = [('0', '빈 땅'), ('1', '막힌 땅(물 · 산)'), ('2', '남의 마을 땅'), ('3', '놓은 날 마을 땅'), ('4', '그 뒤 넓힌 칸'), ('5', '사유지'), ('6', '막힌 칸(넓히려다 못 가진 칸)'), ('7', '토벌로 풀린 빈 칸'), ('8', '풀린 뒤 마을이 가진 칸')]
CLS = {'S': '작은 마을', 'M': '중간 마을', 'L': '큰 마을'}
PLACE = {('touch', 'grow'): '영토에 붙음 · 자랄 쪽', ('gap', 'grow'): '조금 떨어짐 · 자랄 쪽', ('touch', 'away'): '영토에 붙음 · 안 자랄 쪽', ('gap', 'away'): '조금 떨어짐 · 안 자랄 쪽'}
WHY = {'d0': '놓은 날', '끝': '마지막 날', '토벌 뒤': '토벌대가 다녀간 다음 날'}

def inset(e, s, box=300):
    # 사유지 둘레 확대 — 사유지 네모 ± max(8, 한 변) 칸
    W, H, g = s['W'], s['H'], s['g']
    xs = [c[0] for c in e['cells']]; ys = [c[1] for c in e['cells']]
    m = max(8, int(math.sqrt(e['size'])))
    ax0, ay0, ax1, ay1 = min(xs) - m - s['x0'], min(ys) - m - s['y0'], max(xs) + m - s['x0'], max(ys) + m - s['y0']
    ax0, ay0, ax1, ay1 = max(0, ax0), max(0, ay0), min(W - 1, ax1), min(H - 1, ay1)
    w, h = ax1 - ax0 + 1, ay1 - ay0 + 1
    px = max(2, min(18, box // max(w, h)))
    im = Image.new('RGB', (w * px, h * px), (255, 255, 255)); d = ImageDraw.Draw(im)
    for y in range(h):
        for x in range(w):
            ch = g[(ay0 + y) * W + ax0 + x]
            d.rectangle([x * px, y * px, x * px + px - 1, y * px + px - 1], fill=COL.get(ch, (255, 0, 255)), outline=(255, 255, 255) if px >= 6 else None)
    bx0, by0, bx1, by1 = min(xs) - s['x0'] - ax0, min(ys) - s['y0'] - ay0, max(xs) - s['x0'] - ax0 + 1, max(ys) - s['y0'] - ay0 + 1
    d.rectangle([bx0 * px - 1, by0 * px - 1, bx1 * px, by1 * px], outline=(0, 0, 0), width=2)
    return im, (ax0, ay0, ax1, ay1)

def draw_snap(tag, e, s, maxw=860, maxh=760):
    W, H = s['W'], s['H']
    px = max(1, min(10, maxw // W, maxh // H))
    ins, ib = inset(e, s)
    img_w = max(W * px + ins.width + 30, 640) + 20
    top = 70; leg_h = 44
    img = Image.new('RGB', (img_w, top + max(H * px, ins.height + 24) + leg_h + 10), (255, 255, 255))
    d = ImageDraw.Draw(img)
    g = s['g']; ox = 10
    for y in range(H):
        row = g[y * W:(y + 1) * W]
        for x, ch in enumerate(row):
            c = COL.get(ch, (255, 0, 255))
            if px == 1: img.putpixel((ox + x, top + y), c)
            else: d.rectangle([ox + x * px, top + y * px, ox + x * px + px - 1, top + y * px + px - 1], fill=c)
    # 사유지 테두리 · 마을 중심
    xs = [c[0] for c in e['cells']]; ys = [c[1] for c in e['cells']]
    bx0, by0, bx1, by1 = min(xs) - s['x0'], min(ys) - s['y0'], max(xs) - s['x0'] + 1, max(ys) - s['y0'] + 1
    d.rectangle([ox + bx0 * px - 1, top + by0 * px - 1, ox + bx1 * px, top + by1 * px], outline=(0, 0, 0), width=1)
    cx, cy = e['ccx'] - s['x0'], e['ccy'] - s['y0']
    if 0 <= cx < W and 0 <= cy < H:
        r = max(2, px)
        d.ellipse([ox + cx * px - r, top + cy * px - r, ox + cx * px + r, top + cy * px + r], fill=(0, 0, 0))
    d.rectangle([ox + ib[0] * px - 1, top + ib[1] * px - 1, ox + (ib[2] + 1) * px, top + (ib[3] + 1) * px], outline=(30, 30, 200), width=1)
    ix = ox + W * px + 20
    img.paste(ins, (ix, top)); d.rectangle([ix - 1, top - 1, ix + ins.width, top + ins.height], outline=(30, 30, 200), width=2)
    d.text((ix, top + ins.height + 4), '파란 네모 확대(사유지 둘레)', font=f12, fill=(30, 30, 200))
    L = s['line']; why = WHY.get(s['why'], '막힌 칸 ' + s['why'] + ' 에 닿은 날')
    t1 = f"{CLS[e['cls']]} {e['vname']}(놓은 날 인구 {e['pop0']}) · 사유지 {e['size']}칸({int(math.sqrt(e['size']))}×{int(math.sqrt(e['size']))} · 둘레 {e['perim']}칸) · {PLACE.get((e['mode'], e['side']), e['mode'])}"
    t2 = f"{why} — 날 {L['d']}(놓은 지 {L['d'] - e['spotDay']}날) · 막힌 칸 {L['blk']}/{e['size']}({100 * L['blk'] / e['size']:.0f}%) · 인구 {L['pop']} · 영토 {L['terr']} · 그 뒤 넓힌 칸 {L['grown']}"
    t3 = f"모자란 땅: 인구 × 32.67 − 영토 = {L['short32']} · 넓힘 목표 − 영토 = {L['shortT']} · 놓은 뒤 굶어 죽음 {L['fd']}"
    d.text((10, 4), t1, font=f16b, fill=(20, 20, 20)); d.text((10, 26), t2, font=f14, fill=(20, 20, 20)); d.text((10, 46), t3, font=f13, fill=(60, 60, 60))
    ly = top + max(H * px, ins.height + 24) + 8; lx = 10
    for k, nm in LEG:
        d.rectangle([lx, ly + 3, lx + 12, ly + 15], fill=COL[k], outline=(80, 80, 80)); d.text((lx + 16, ly), nm, font=f12, fill=(40, 40, 40))
        lx += 22 + int(d.textlength(nm, font=f12)) + 10
        if lx > img_w - 160: lx = 10; ly += 18
    return img

def main():
    args = sys.argv[1:]; out = 'out'
    if '--out' in args: i = args.index('--out'); out = args[i + 1]; args = args[:i] + args[i + 2:]
    os.makedirs(out, exist_ok=True)
    allrows = []
    for run in args:
        tag = os.path.basename(run.rstrip('/'))
        j = json.load(open(os.path.join(run, 'probe.json')))
        placed = [e for e in j['placed'] if not e.get('fail')]
        d0 = None
        for s in j['snaps']:
            if s['why'] == 'd0': d0 = s['d']; break
        for e in placed: e['spotDay'] = d0 or j['cfg']['d0']
        by = {}
        for s in j['snaps']:
            e = placed[s['i']]
            img = draw_snap(tag, e, s)
            nm = f"{tag}_{s['i']:02d}_{e['cls']}_{e['vname']}_{s['why']}.png"
            img.save(os.path.join(out, nm)); by.setdefault(s['i'], []).append((s, None, nm))
        # 모음 — 줄 = 사유지 하나 · 칸 = 순간들(놓은 날 · 25 · 50 · 75 % · 10 · 30 · 100칸 · 끝) — 작은 그림
        order = ['d0', '25%', '50%', '75%', '10칸', '30칸', '100칸', '끝']
        TW, TH = 260, 230; lab = 230
        rows = sorted(by.keys())
        M = Image.new('RGB', (lab + TW * len(order), 30 + TH * len(rows)), (255, 255, 255)); dm = ImageDraw.Draw(M)
        for c, w in enumerate(order): dm.text((lab + c * TW + 8, 6), WHY.get(w, '막힌 칸 ' + w), font=f14, fill=(0, 0, 0))
        for r, i in enumerate(rows):
            e = placed[i]
            dm.text((6, 30 + r * TH + 6), f"{CLS[e['cls']]} {e['vname']}", font=f14, fill=(0, 0, 0))
            dm.text((6, 30 + r * TH + 26), f"인구 {e['pop0']} · 사유지 {e['size']}칸", font=f12, fill=(40, 40, 40))
            dm.text((6, 30 + r * TH + 44), PLACE.get((e['mode'], e['side']), ''), font=f12, fill=(40, 40, 40))
            for s, img, nm in by[i]:
                if s['why'] not in order: continue
                c = order.index(s['why'])
                th, _ = inset(e, s, box=TH - 30); th.thumbnail((TW - 8, TH - 26))
                M.paste(th, (lab + c * TW + 4, 30 + r * TH + 4))
                dm.text((lab + c * TW + 6, 30 + r * TH + TH - 22), f"날 {s['line']['d']} · 막힘 {s['line']['blk']}", font=f12, fill=(0, 0, 0))
        M.save(os.path.join(out, f"모음_{tag}.png"))
        for i, e in enumerate(placed):
            hit = {s['why']: s['line']['d'] for s, _, _ in by.get(i, [])}
            last = j['days'][-1]['t'][i] if j['days'] else None
            allrows.append(dict(tag=tag, cls=e['cls'], vname=e['vname'], pop0=e['pop0'], size=e['size'], perim=e['perim'], mode=e['mode'], side=e['side'], d0=e['spotDay'], hit=hit, last=last))
    json.dump(allrows, open(os.path.join(out, 'hits.json'), 'w'), ensure_ascii=False, indent=1)
    print('그림', len(os.listdir(out)))

main()
