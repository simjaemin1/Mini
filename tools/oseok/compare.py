# tools/oseok/compare.py — 판 글자 세 길을 시안과 화소로 견준다(T1071 ②)
#
#   들어오는 것: scripts/t1071-oseok-compare.js 가 찍은 <브라우저>-<길>.png(1440×1080 · DPR 1)
#   견줄 것 둘:
#     ⓐ 시안   `설계/시안/오석/마을_dash.jpg` — 재민이 고른 그림 그대로(돌 무늬가 다른 무작위라 바닥 차이가 섞인다)
#     ⓑ 같은 돌 기준 — 시안 식(mono.render) 그대로 굽되 돌 · 바닥만 브라우저와 **같은 타일**(public/ui/oseok/*@2x.png)로.
#        돌 차이가 빠지므로 남는 차이 = 판 글자 · 선 · 막대 그리는 길의 차이다.
#   재는 것: 자리마다 평균 |Δ|(0~255) — 상자 전체 · 글자 자리(시안 판 마스크 2px 넓힘)
#            18px 읽힘 — 18px 한 줄 상자의 글자 밝은 쪽(98 백분위) − 돌(가운데값)
#   사진: 자리마다 [시안 | 같은 돌 기준 | 길들] 을 3배로 늘려 한 장(눈 대조).
# 실행: python3 tools/oseok/compare.py /tmp/t1071 chromium [webkit]
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as nd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
import mono  # noqa: E402
mono.LEVEL = 0.26
import tabs  # noqa: E402

UI = os.path.join(ROOT, 'public', 'ui', 'oseok')
SIAN = os.path.join(ROOT, '설계', '시안', '오석', '마을_dash.jpg')
WAYS = ['canvas', 'svg', 'css']
# 견줄 자리(x0, y0, x1, y1) — 시안 dash 좌표
CROPS = {
    '제목 66 명조': (36, 26, 236, 104),
    '가입 안내 40 명조 · 23 고딕': (36, 186, 620, 320),
    '숫자 칸 58 명조': (20, 424, 360, 612),
    '겨울 준비 막대': (732, 424, 1068, 612),
    '부탁 줄 25 · 18 고딕 · 버튼': (36, 712, 890, 800),
    '소식 17 · 20 고딕': (930, 734, 1416, 900),
    '머리 탭 · 계량기': (470, 24, 1410, 100),
}
CROP18 = (40, 758, 300, 782)   # '겨울 땔감이 모자랍니다'(18px) 한 줄

def tile(path, H, W):
    t = np.asarray(Image.open(path).convert('L'), np.float32) / 255
    ry, rx = -(-H // t.shape[0]), -(-W // t.shape[1])
    return np.tile(t, (ry, rx))[:H, :W]

def ref_same_stone(out):
    p = mono.Plate(1440, 1080); tabs.dash(p)
    H, W = p.H, p.W
    plate = tile(os.path.join(UI, 'plate@2x.png'), H, W)
    ground = tile(os.path.join(UI, 'ground@2x.png'), H, W)
    real = mono.granite
    mono.granite = lambda h, w, kind='gray', seed=1, level=None: plate[:h, :w]
    try: mono.render(p, out, 'black', full=False, ground=ground, bevel=7)
    finally: mono.granite = real
    E = np.asarray(p.eng.resize((1440, 1080), Image.BOX), np.float32) / 255
    return E

def L(path):
    return np.asarray(Image.open(path).convert('L'), np.float32)

def main(d, browsers):
    refp = os.path.join(d, 'ref-same-stone.png')
    E = ref_same_stone(refp)
    M = nd.binary_dilation(E > 0.05, iterations=2)
    Image.fromarray((M * 255).astype(np.uint8)).save(os.path.join(d, 'mask.png'))
    sian, same = L(SIAN), L(refp)
    res = {'floor': {}, 'browsers': {}}
    def stats(img, ref, box):
        x0, y0, x1, y1 = box
        a, b, m = img[y0:y1, x0:x1], ref[y0:y1, x0:x1], M[y0:y1, x0:x1]
        dd = np.abs(a - b)
        return round(float(dd.mean()), 2), round(float(dd[m].mean()), 2) if m.any() else None
    for name, box in CROPS.items():
        res['floor'][name] = {'같은돌기준_vs_시안': stats(same, sian, box)}
    def legib(img):
        # 18px 한 줄 상자에서 글자 밝은 쪽(98 백분위) − 돌(가운데값) — 시안 마스크에 기대지 않는다(엔진마다 글자 폭이 조금 달라서)
        x0, y0, x1, y1 = CROP18; a = img[y0:y1, x0:x1]
        return round(float(np.percentile(a, 98) - np.median(a)), 1)
    res['legib18'] = {'시안': legib(sian), '같은돌기준': legib(same)}
    for br in browsers:
        R = {}
        for w in WAYS:
            p = os.path.join(d, f'{br}-{w}.png')
            if not os.path.exists(p): continue
            img = L(p)
            R[w] = {'crops': {n: {'vs_시안': stats(img, sian, b), 'vs_같은돌': stats(img, same, b)} for n, b in CROPS.items()},
                    'all_vs_시안': stats(img, sian, (0, 0, 1440, 1080)), 'all_vs_같은돌': stats(img, same, (0, 0, 1440, 1080)),
                    'legib18': legib(img)}
        res['browsers'][br] = R
    res['floor']['전체'] = {'같은돌기준_vs_시안': stats(same, sian, (0, 0, 1440, 1080))}
    # 사진 — 자리마다 세로로 [시안 · 같은 돌 · 길…](브라우저 첫째) · 3배
    fnt = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc', 22, index=1)
    for br in browsers:
        for name, (x0, y0, x1, y1) in list(CROPS.items()) + [('18px 한 줄', CROP18)]:
            k = 3 if (x1 - x0) < 500 else 2
            if (x1 - x0) < 400 and (y1 - y0) < 40: k = 4
            rows = [('시안', SIAN), ('같은 돌 기준(시안 식)', refp)] + [(f'{br} · {w}', os.path.join(d, f'{br}-{w}.png')) for w in WAYS if os.path.exists(os.path.join(d, f'{br}-{w}.png'))]
            cw, ch = (x1 - x0) * k, (y1 - y0) * k
            sheet = Image.new('RGB', (cw, (ch + 34) * len(rows)), (20, 20, 20)); dr = ImageDraw.Draw(sheet)
            for i, (lab, p) in enumerate(rows):
                im = Image.open(p).convert('RGB').crop((x0, y0, x1, y1)).resize((cw, ch), Image.NEAREST)
                sheet.paste(im, (0, i * (ch + 34) + 34)); dr.text((8, i * (ch + 34) + 4), lab, font=fnt, fill=(255, 200, 80))
            safe = name.replace(' ', '_').replace('·', '').replace('/', '')
            sheet.save(os.path.join(d, f'sheet-{br}-{safe}.png'))
    json.dump(res, open(os.path.join(d, 'compare.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(res, ensure_ascii=False, indent=1))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:] or ['chromium'])
