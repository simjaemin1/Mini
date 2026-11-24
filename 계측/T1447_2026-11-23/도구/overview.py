#!/usr/bin/env python3
# T1447 그림 실험 — 한 장 모음: 줄 = 마을 · 자리(11) · 칸 = 사유지 크기(3×3 · 6×6 · 12×12) — 마지막 날 사유지 둘레 확대 + 막힌 칸이 문턱에 닿은 날
import json, os, sys, math
sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image, ImageDraw, ImageFont
import importlib.util
spec = importlib.util.spec_from_file_location('render', os.path.join(os.path.dirname(__file__), 'render.py'))
R = importlib.util.module_from_spec(spec)
_argv = sys.argv; sys.argv = ['x']   # render.py 가 main() 을 부른다 — 빈 인자로(그림 0)
try: spec.loader.exec_module(R)
except SystemExit: pass
sys.argv = _argv
S = '/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1447'
runs = [('G3', '3×3 = 9칸(집 한 채 — 첫 집터)'), ('G6P', '6×6 = 36칸(중간)'), ('G12', '12×12 = 144칸(큰 기지)')]
data = {}
for tag, _ in runs:
    j = json.load(open(os.path.join(S, 'runs', tag, 'probe.json')))
    placed = [e for e in j['placed'] if not e.get('fail')]
    last = {}
    for s in j['snaps']:
        if s['why'] == '끝': last[s['i']] = s
    first = {}
    for i, e in enumerate(placed):
        f = {}
        for r in j['days']:
            b = r['t'][i][3]
            for p in (25, 50, 75):
                if 100 * b / e['size'] >= p and f'p{p}' not in f: f[f'p{p}'] = r['d'] - j['cfg']['d0']
            for n in (10, 20, 30):
                if b >= n and f'n{n}' not in f: f[f'n{n}'] = r['d'] - j['cfg']['d0']
        first[i] = (f, j['days'][-1]['t'][i])
    data[tag] = (placed, last, first)
TW, TH = 330, 300; lab = 250; top = 60
rows = data['G3'][0]
M = Image.new('RGB', (lab + TW * 3, top + TH * len(rows) + 60), (255, 255, 255)); d = ImageDraw.Draw(M)
d.text((10, 8), 'T1447 그림 실험 — 마을 곁에 사유지를 놓고 400날(날 200 → 600 · 서버 자 1020 · 운영 시계로 현실 약 6.7일)', font=R.f16b, fill=(0, 0, 0))
d.text((10, 32), '칸마다: 마지막 날 사유지 둘레 확대(빨강 = 막힌 칸 · 진초록 = 놓은 뒤 넓힌 칸) · 아래 = 막힌 칸이 사유지의 25 · 50 · 75 % / 10 · 20 · 30칸에 닿은 날(놓은 지 며칠)', font=R.f13, fill=(40, 40, 40))
for c, (tag, nm) in enumerate(runs): d.text((lab + c * TW + 8, top - 2), nm, font=R.f14, fill=(0, 0, 0))
for r, e in enumerate(rows):
    y0 = top + 20 + r * TH
    d.text((8, y0 + 6), f"{R.CLS[e['cls']]} {e['vname']}", font=R.f16b, fill=(0, 0, 0))
    d.text((8, y0 + 30), f"놓은 날 인구 {e['pop0']} · 영토 {e['terr0']}", font=R.f12, fill=(40, 40, 40))
    d.text((8, y0 + 48), f"넓힘 목표 {e['target0']}", font=R.f12, fill=(40, 40, 40))
    d.text((8, y0 + 66), R.PLACE.get((e['mode'], e['side']), ''), font=R.f12, fill=(40, 40, 40))
    for c, (tag, nm) in enumerate(runs):
        placed, last, first = data[tag]
        i = next((k for k, x in enumerate(placed) if x['vname'] == e['vname']), None)
        if i is None or i not in last: continue
        ex = placed[i]; s = last[i]
        th, _ = R.inset(ex, s, box=TH - 90); th.thumbnail((TW - 12, TH - 90))
        M.paste(th, (lab + c * TW + 6, y0 + 4))
        f, L = first[i]
        ln1 = '막힌 칸 끝 ' + f"{L[3]}/{ex['size']}(둘레 {ex['perim']})"
        ln2 = ' · '.join(f"{k[1:]}%:{f[k]}날" for k in ('p25', 'p50', 'p75') if k in f) or '25 % 못 닿음'
        ln3 = ' · '.join(f"{k[1:]}칸:{f[k]}날" for k in ('n10', 'n20', 'n30') if k in f) or ('10칸 못 닿음' if ex['size'] > 9 else '')
        d.text((lab + c * TW + 8, y0 + TH - 82), ln1, font=R.f12, fill=(0, 0, 0))
        d.text((lab + c * TW + 8, y0 + TH - 64), ln2, font=R.f12, fill=(120, 0, 0))
        d.text((lab + c * TW + 8, y0 + TH - 46), ln3, font=R.f12, fill=(120, 0, 0))
        d.text((lab + c * TW + 8, y0 + TH - 28), f"끝 인구 {L[0]} · 모자란 땅 {L[2] - L[1]} · 굶어 죽음 {L[4]}", font=R.f12, fill=(60, 60, 60))
ly = top + 20 + len(rows) * TH + 8; lx = 10
for k, nm in R.LEG:
    d.rectangle([lx, ly + 3, lx + 12, ly + 15], fill=R.COL[k], outline=(80, 80, 80)); d.text((lx + 16, ly), nm, font=R.f12, fill=(40, 40, 40)); lx += 22 + int(d.textlength(nm, font=R.f12)) + 10
M.save(os.path.join(S, 'pix', '모음_한장.png'))
print('ok', M.size)
