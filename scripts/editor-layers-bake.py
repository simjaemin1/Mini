#!/usr/bin/env python3
# === scripts/editor-layers-bake.py — 맵 에디터 보기 층(광맥 종류 · 자잘 광맥 · 개울 · 갯벌) 데이터를 굽는다 [T793 2026-10-18] ===
# 왜: 재민 10-03 "자잘광맥 때문에 글자로 빽빽해서 하나도 안 보인다" — 보기 칸에 광맥 종류별 · 자잘 광맥 · 개울 · 갯벌 줄을 단다.
#   에디터 작업(lab/map-editor-baked.json)의 광맥엔 종류 · 자잘 표가 없다 → 그 작업은 **안 건드리고**(바이트 같음 · editor-baked-check)
#   옆에 그리기 전용 층 하나를 둔다(해안 층 lab/map-editor-coast.json 과 같은 꼴 · 1px = 1셀).
# 정본만 읽는다(새 수 0 · 사본 식 0):
#   광맥  = server/hanbando-terrain.json 존 절 ores 의 mineral · minor(이름으로 짝 — 존 안에서 이름은 하나) · 종류 이름 = server/specialty.js RESOURCES.ko
#   개울  = server/streams/<존>.bin(서버가 기동 때 읽는 그 래스터 — 머리 32B + 1비트/셀 deflate · streams.decodeFile 꼴)
#   갯벌  = server/salt.js isTidalFlat 그대로: 바다가 아닌 셀 중 8방 이웃에 바다가 있는 셀 ·
#           바다 = zone.isSeaTileLocal 과 같은 정의 = 해안선 띠(chunk 정본 · t588-coast-mask.js) 이면서 강·호수(terrain.isWaterCellLocal · 셀 가운데)가 아닌 칸
# 쓰는 법: python3 scripts/editor-layers-bake.py   → lab/map-editor-layers.json  (그다음 node scripts/build-map-editor.js ~/Mini/map-editor.html)
#          python3 scripts/editor-layers-bake.py --check → 같으면 0 · 다르면 1(파일 무변)
import numpy as np, base64, io, json, os, subprocess, sys, tempfile, zlib
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
# ★[T1051 · PM 11-01 · T971 회부 1] 층 대조 = **풀어낸 화소**(폭 · 높이 · RGBA) — PNG **바이트**는 zlib · Pillow 판을 따라 갈린다(야간 상자만 5밤 빨강 ·
#   그 밤 줄 "PNG 바이트 다름 · 화소 같음(인코더 차이)"). 화소가 하나라도 다르면 여전히 **다르다**(1) · PNG 바깥 칸(셈 · 이름 · 도장)은 글자 그대로.
#   돌려주는 값: 0 = 바이트까지 같다 · 2 = 바이트만 다르고 화소 같다(인코더 차이 — `[상황]` 줄 · 통과) · 1 = 다르다(빨강).
import hashlib
def _pix(d):
    im = Image.open(io.BytesIO(base64.b64decode(d.split(',', 1)[1]))).convert('RGBA')
    a = np.array(im)
    return a, '%dx%d·%s' % (im.width, im.height, hashlib.sha256(a.tobytes()).hexdigest()[:12])
def compare(cur, txt):
    if cur == txt: return 0, ['[editor-layers] 정본과 같다']
    try:
        A = json.loads(cur) if cur else {}; B = json.loads(txt)
    except Exception as e:
        return 1, ['[editor-layers] **정본과 다르다** — 층 파일을 못 읽는다(%r)' % (e,)]
    enc, bad = [], []
    def walk(a, b, path):
        if isinstance(b, dict) and isinstance(a, dict):
            for k in sorted(set(a) | set(b)): walk(a.get(k), b.get(k), path + [str(k)])
        elif a != b:
            if isinstance(b, str) and isinstance(a, str) and b.startswith('data:image/png') and a.startswith('data:image/png'):
                (pa, ha), (pb, hb) = _pix(a), _pix(b)
                same = pa.shape == pb.shape and np.array_equal(pa, pb)
                (enc if same else bad).append('[editor-layers] 다른 자리: %s — PNG 바이트 다름 · 화소 %s (%dB ↔ %dB · %s ↔ %s)' % ('.'.join(path), '같음(인코더 차이)' if same else '**다름**', len(a), len(b), ha, hb))
            else:
                bad.append('[editor-layers] 다른 자리: %s — 값 다름' % '.'.join(path))
    try:
        walk(A, B, [])
    except Exception as e:
        return 1, ['[editor-layers] **정본과 다르다** — 다른 자리 못 찾음: %r' % (e,)]
    import PIL
    ver = 'PIL %s · zlib %s' % (PIL.__version__, zlib.ZLIB_RUNTIME_VERSION)
    if bad:
        return 1, ['[editor-layers] **정본과 다르다** — python3 scripts/editor-layers-bake.py → node scripts/build-map-editor.js ~/Mini/map-editor.html'] + bad + enc
    return 2, ['[editor-layers] 정본과 같다(화소) · [상황] 인코더 차이(화소 같음) — PNG %d 자리 바이트만 다르다 · %s' % (len(enc), ver)] + enc
if '--selftest' in sys.argv:   # 자명 통과 금지 — 정본 층 파일로 미끼 둘을 만들어 견준다(굽기 0 · 1초)
    cur = open('lab/map-editor-layers.json', encoding='utf8').read()
    J = json.loads(cur)
    z = sorted(J['streams'])[0]
    a, _ = _pix(J['streams'][z]['png'])
    def enc_png(arr, level):
        b = io.BytesIO(); Image.fromarray(arr, 'RGBA').save(b, 'PNG', compress_level=level)
        return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
    E = json.loads(cur); E['streams'][z]['png'] = enc_png(a, 1)          # ⓐ 화소 같음 · 바이트만 다름(다른 압축)
    a2 = a.copy(); y, x = np.argwhere(a2[..., 3] > 0)[0]; a2[y, x, 3] = 0   # ⓑ 화소 한 칸(개울 셀 하나를 비움)
    P = json.loads(cur); P['streams'][z]['png'] = enc_png(a2, 1)
    V = json.loads(cur); V['streams'][z]['cells'] += 1                  # ⓒ 셈 한 칸
    for nm, obj in (('encoder', E), ('pixel', P), ('value', V)):
        code, lines = compare(cur, json.dumps(obj, ensure_ascii=False, separators=(',', ':')))
        print('[selftest] %s → %d · %s' % (nm, code, lines[0]))
        for l in lines[1:2]: print('[selftest]   ' + l)
    sys.exit(0)

ZS = ['hanbando', 'nippon', 'jungwon_n']   # 해안 층 · 개울 래스터가 있는 존(같은 셋)
VAR = os.environ.get('T588_COAST') or 'b'
zc = json.loads(subprocess.check_output(['node', '-e', "const Z=require('./server/zone-config').ZONES;const o={};for(const k of %s){const z=Z[k];o[k]=[Math.ceil(z.zoneWidth/32),Math.ceil(z.zoneHeight/32)]}process.stdout.write(JSON.stringify(o))" % json.dumps(ZS)]))

def png(m, rgb):
    im = Image.fromarray(m.astype(np.uint8), 'P')
    im.putpalette([0, 0, 0] + list(rgb) + [0] * 762)
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True, transparency=0)
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode(), len(b.getvalue())

T = json.load(open('server/hanbando-terrain.json', encoding='utf8'))
out = {'stamp': 'T793 · 2026-10-18 · 해안 %s' % VAR,
       'note': '그리기 전용(작업 · 굽기 무접촉) — 광맥 종류·자잘 = 지형 json ores · 개울 = server/streams/*.bin · 갯벌 = salt.isTidalFlat(바다 = 해안 띠 − 강·호수) · 1px = 1셀',
       'ores': {}, 'streams': {}, 'tidal': {}}
for z, zd in T.items():
    if not isinstance(zd, dict) or not zd.get('ores'): continue
    o = {}
    for r in zd['ores']:
        o[r['name']] = [r.get('mineral') or '', 1 if r.get('minor') else 0]
    out['ores'][z] = o
mins = sorted({v[0] for o in out['ores'].values() for v in o.values() if v[0]})
out['mineralKo'] = json.loads(subprocess.check_output(['node', '-e', "const R=require('./server/specialty').RESOURCES;const o={};for(const k of %s)o[k]=(R[k]&&R[k].ko)||k;process.stdout.write(JSON.stringify(o))" % json.dumps(mins)]))   # 이름 = specialty.js RESOURCES.ko(새 말 0)
tmp = tempfile.mkdtemp(prefix='elb-')
for z in ZS:
    nx, ny = zc[z]
    # 개울 — 서버 래스터 그대로
    buf = open('server/streams/%s.bin' % z, 'rb').read()
    assert buf[:4] == b'STRM', z
    bnx, bny = int.from_bytes(buf[8:12], 'little'), int.from_bytes(buf[12:16], 'little')
    bits = np.frombuffer(zlib.decompress(buf[32:]), dtype=np.uint8)
    st = np.unpackbits(bits, bitorder='little')[:bnx * bny].reshape(bny, bnx) > 0
    d, nb = png(st, (120, 200, 240))
    out['streams'][z] = {'nx': bnx, 'ny': bny, 'cells': int(st.sum()), 'png': d}
    # 갯벌 — 바다 = 띠 − 강·호수(셀 가운데) · 그 이웃 8방의 뭍
    band = os.path.join(tmp, z + '.u8'); sea = os.path.join(tmp, z + '.sea.u8')
    subprocess.check_call(['node', 'scripts/t588-coast-mask.js', z, band], env=dict(os.environ, T588_COAST=VAR), stdout=subprocess.DEVNULL)
    subprocess.check_call(['node', '-e', """
process.env.ENABLE_VILLAGES='0';
const fs=require('fs'),T=require('./server/terrain');const [z,nx,ny,src,dst]=process.argv.slice(1);const NX=+nx,NY=+ny;
const m=fs.readFileSync(src);const o=Buffer.alloc(NX*NY);
for(let i=0;i<NX*NY;i++) if(m[i]){const x=i%NX,y=(i/NX)|0; if(!T.isWaterCellLocal(z,x*32+16,y*32+16)) o[i]=1;}
fs.writeFileSync(dst,o);""", z, str(nx), str(ny), band, sea], stdout=subprocess.DEVNULL)
    S = np.fromfile(sea, dtype=np.uint8).reshape(ny, nx) > 0
    P = np.pad(S, 1)
    adj = np.zeros_like(S)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx or dy: adj |= P[1 + dy:1 + dy + ny, 1 + dx:1 + dx + nx]
    tf = adj & ~S
    d2, nb2 = png(tf, (176, 150, 96))
    out['tidal'][z] = {'nx': nx, 'ny': ny, 'cells': int(tf.sum()), 'sea': int(S.sum()), 'png': d2}
    print(z, '개울 셀', int(st.sum()), '· png', nb, 'B · 갯벌 셀', int(tf.sum()), '(바다', int(S.sum()), ') · png', nb2, 'B')
txt = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
if '--check' in sys.argv:   # 낡음 자 — 정본(지형 json · 개울 래스터 · 해안)이 바뀌었는데 층을 안 다시 구웠나
    cur = open('lab/map-editor-layers.json', encoding='utf8').read() if os.path.exists('lab/map-editor-layers.json') else ''
    code, lines = compare(cur, txt)
    for l in lines: print(l)
    sys.exit(0 if code in (0, 2) else 1)
open('lab/map-editor-layers.json', 'w', encoding='utf8').write(txt)
print('→ lab/map-editor-layers.json', os.path.getsize('lab/map-editor-layers.json'), 'B')
