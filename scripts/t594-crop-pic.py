#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T594 산그림 · 제품 무변)
# === scripts/t594-crop-pic.py — "작물 그림이 철에 맞나" 한 장 (끔 | 켬) ===========================================
#   행 = 고증 표 16종 · 열 = 3월 … 2월(그달 15일) · 칸 = 그날 밭 그림(클라 `cropSprite(stage, crop)` 그 스프라이트).
#   밭 = 게임 첫 파종 묶음의 첫날에 심은 한 칸(T583 대조와 같은 관례 — 마을이 그 달 첫 빈 칸부터 심는다).
#   단계 = 서버 `zone.js _farmStageOf` 의 사영(0 갈은흙 · 1 어린싹 · 2 자람 · 3 익음 = 활동일 ÷ 성장일 셋으로) —
#     값은 정본 `crops.grownDays`·`growDaysOf`·`readyDay` 를 **자식 node 로 불러** 얻는다(끔/켬 = 손잡이 env 만 다르다).
#   익은 달 = 금빛 테두리 + 날짜 · 그 뒤는 거둔 밭(빈 칸) · 바탕 띠 = 농사로 실제 창(연두 = 파종 · 금 = 수확).
#   쓰는 법: python3 scripts/t594-crop-pic.py [out.png]   (기본 산그림/T594_작물철.png)
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '산그림', 'T594_작물철.png')
SPR = os.path.join(ROOT, 'public', 'assets', 'crops')

JS = r'''
const path=require('path');const R=(p)=>require(path.join(process.argv[1],p));
const C=R('server/crops'),CC=R('server/crop-cal'),Cal=R('server/calendar');
const stageAt=(id,p,d)=>{const need=Math.max(1,C.growDaysOf(id)),got=C.grownDays(id,p,d);return got>=need?3:Math.min(2,Math.floor(got/need*3));};
const out=[];
for(const id of CC.ids()){
  const c=C.get(id),m0=C.sowMonthsOf(id)[0],p=Cal.dayOf(m0>=3?1:2,m0,1),r=C.readyDay(id,p);
  const cells=[];
  const t0=Cal.dateOf(p),base=Cal.dayOf(t0.year,t0.month,1);   // 열 = 심은 달부터 한 해 안의 그 달(월동은 이듬해 봄이 오른쪽이 아니라 같은 3~9월 칸에 온다)
  for(let k=0;k<12;k++){const mo=((k+2)%12)+1,y=Cal.dayOf(t0.year,mo,15)>=base?t0.year:t0.year+1;const d=Cal.dayOf(y,mo,15),a=Cal.dayOf(y,mo,1),b=Cal.dayOf(mo===12?y+1:y,mo===12?1:mo+1,1);
    if(r!=null&&r>=a&&r<b)cells.push({k:'ripe',dom:Cal.dateOf(r).dom});else if(d<p||(r!=null&&d>=r))cells.push({k:'none'});else cells.push({k:'st',s:stageAt(id,p,d)});}
  const sp=CC.spanOf(CC.rowOf(id));
  out.push({id,ko:c.ko,group:c.group,g:C.growDaysOf(id),cat:c.growDays,p:Cal.dateOf(p),r:r==null?null:Cal.dateOf(r),cells,
    sow:[Cal.dateOf(sp.s0),Cal.dateOf(sp.s1)],harv:[Cal.dateOf(sp.h0),Cal.dateOf(sp.h1)],w:C.isWinterCrop(id)});
}
process.stdout.write('@@'+JSON.stringify(out));
'''

def data(on):
    env = dict(os.environ)
    env.pop('T594_CROP_CAL', None)
    if not on: env['T594_CROP_CAL'] = '0'          # ★[T634] 기본 켬 — 끔 판은 `0` 을 건다(없음 = 켬)
    o = subprocess.run(['node', '-e', JS, ROOT], env=env, capture_output=True, text=True, check=True).stdout
    return json.loads(o[o.rindex('@@') + 2:])

OFF, ON = data(False), data(True)
SLUG = {'곡물': 'grain', '콩류': 'bean', '채소': 'veg', '양념': 'spice', '박과': 'gourd', '특용': 'special', '유료': 'oil', '구황': 'tuber'}
ANCH = json.load(open(os.path.join(SPR, 'crops_anchors.json')))
_cache = {}
def sprite(cid, group, st):
    ser = cid if f'{cid}_{st}' in ANCH else SLUG.get(group, 'grain')     # 클라 cropSprite: 종별 판이 있으면 종, 없으면 군
    key = f'{ser}_{st}'
    if key not in _cache: _cache[key] = Image.open(os.path.join(SPR, key + '.png')).convert('RGBA')
    return _cache[key]

FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
if not os.path.exists(FONT): FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'
f12, f14, f18, f24 = (ImageFont.truetype(FONT, s) for s in (12, 14, 18, 24))
CW, CH, LW, TOP, GAP = 64, 58, 150, 118, 36
MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]
PW = LW + CW * 12
W, H = PW * 2 + GAP + 40, TOP + CH * len(OFF) + 90
img = Image.new('RGB', (W, H), (21, 24, 29))
dr = ImageDraw.Draw(img)
dr.text((20, 14), 'T594 작물 철 — 밭 그림(단계 스프라이트)이 달에 맞나 · 게임 첫 파종 묶음 첫날에 심은 한 칸', font=f24, fill=(224, 198, 116))
dr.text((20, 48), '바탕 띠 = 농사로 실제 창(연두 파종 · 금 수확) · 금 테두리 = 그 달에 익음(날짜) · 칸 = 그달 15일 그림 · 빈 칸 = 아직 안 심음/거둠', font=f14, fill=(170, 180, 194))

def mon_in(mo, a, b):   # 달 mo 가 [a, b] (dateOf) 범위와 겹치나 — 해를 넘는 창(10월→6월)도
    am, bm = a['month'], b['month']
    seq = []; m = am
    while True:
        seq.append(m)
        if m == bm: break
        m = m % 12 + 1
        if len(seq) > 12: break
    return mo in seq

for pi, (title, rows) in enumerate((('끔 T594_CROP_CAL=0(카탈로그 성장일)', OFF), ('켬 = 기본(T634 · 고증 성장일)', ON))):
    x0 = 20 + pi * (PW + GAP)
    dr.text((x0, 74), title, font=f18, fill=(140, 200, 240) if pi else (230, 224, 200))
    for k, mo in enumerate(MONTHS):
        dr.text((x0 + LW + k * CW + CW // 2 - 12, TOP - 18), f'{mo}월', font=f12, fill=(154, 164, 178))
    for i, r in enumerate(rows):
        y = TOP + i * CH
        dr.rectangle([x0, y, x0 + PW, y + CH - 2], fill=(26, 32, 40) if i % 2 == 0 else (22, 27, 34))
        for k, mo in enumerate(MONTHS):
            cx = x0 + LW + k * CW
            if mon_in(mo, r['sow'][0], r['sow'][1]): dr.rectangle([cx + 1, y + 1, cx + CW - 1, y + 7], fill=(92, 140, 70))
            if mon_in(mo, r['harv'][0], r['harv'][1]): dr.rectangle([cx + 1, y + CH - 9, cx + CW - 1, y + CH - 3], fill=(196, 160, 60))
            c = r['cells'][k]
            if c['k'] == 'none': continue
            st = 3 if c['k'] == 'ripe' else c['s']
            sp = sprite(r['id'], r['group'], st)
            s = min((CW - 6) / sp.width, (CH - 16) / sp.height)
            im = sp.resize((max(1, int(sp.width * s)), max(1, int(sp.height * s))), Image.LANCZOS)
            img.paste(im, (cx + (CW - im.width) // 2, y + 8 + (CH - 16 - im.height) // 2), im)
            if c['k'] == 'ripe':
                dr.rectangle([cx + 2, y + 9, cx + CW - 2, y + CH - 11], outline=(240, 200, 80), width=2)
                dr.text((cx + 4, y + 9), f"{mo}/{c['dom']}", font=f12, fill=(255, 226, 140))
        lab = f"{r['ko']}{' (월동)' if r['w'] else ''}"
        dr.text((x0 + 6, y + 6), lab, font=f14, fill=(220, 226, 234))
        p, rr = r['p'], r['r']
        dr.text((x0 + 6, y + 28), f"{r['g']}일 · {p['month']}/{p['dom']}→{rr['month']}/{rr['dom']}" if rr else f"{r['g']}일", font=f12, fill=(150, 160, 172))
dr.text((20, H - 60), '월동(보리·밀·마늘)은 서버 T99 춘화 — 가을은 뿌리내림, 익음 시계는 겨울이 끝난 3월 1일부터(갈은흙 그림이 겨울 내내 이어진다) · 성장일 = 활동일.', font=f12, fill=(150, 160, 172))
dr.text((20, H - 40), '켬 잔차 = 게임 파종창이 실제보다 이른 몫(조 4월 ↔ 실제 6월 · 콩 5월 ↔ 5월 하순~6월 · 들깨 5월 ↔ 6월 중순) — 파종창은 재민 xlsx 값이라 안 바꿨다(보고 §회부).', font=f12, fill=(150, 160, 172))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT)
print('saved', OUT, img.size)
