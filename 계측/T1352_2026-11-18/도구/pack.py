#!/usr/bin/env python3
# T1352 계측 폴더 꾸리기 — 판 요약(작은 JSON) · 꾸민 판 다시 읽을 거리(gz) · e2e 출력 · 띠땅 · 지키기
import json, os, sys, shutil, gzip, re
D = '/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1352'
OUT = sys.argv[1]
R = f'{D}/runs'
os.makedirs(f'{OUT}/판', exist_ok=True); os.makedirs(f'{OUT}/e2e', exist_ok=True); os.makedirs(f'{OUT}/띠땅', exist_ok=True); os.makedirs(f'{OUT}/지키기', exist_ok=True); os.makedirs(f'{OUT}/도구', exist_ok=True)
st = json.load(open(f'{D}/chain_status.json'))
tags = [d['tag'] for d in st['done'] if not d.get('e2eRc') and not d['tag'].startswith('E')]
SEL = re.compile(r'\[T1324\]|\[T1352\]|⚠|TypeError|ReferenceError|Cannot read|econ 틱 실패')
for t in tags:
    for f in [f'news_{t}.json', f'mig_{t}.json', f'meta_{t}.json', f'an1292_{t}.json', f'final_{t}.json', f'run_{t}.txt', f'status_{t}.json']:
        p = f'{R}/{f}'
        if os.path.exists(p): shutil.copy(p, f'{OUT}/판/{f}')
    if t.startswith('S'):   # 꾸민 판 — 분석이 읽는 것(존 로그 [T1324] · [T1352] 줄 · 날 줄)을 gz 로
        for z in ['hanbando', 'nippon']:
            lp = f'{R}/z_{t}_{z}.log'
            if os.path.exists(lp):
                with open(lp, encoding='utf-8', errors='replace') as fi, gzip.open(f'{OUT}/판/z_{t}_{z}.log.sel.gz', 'wt', encoding='utf-8') as fo:
                    for l in fi:
                        if SEL.search(l): fo.write(l)
            rp = f'{R}/rows_{t}_{z}.jsonl'
            if os.path.exists(rp):
                with open(rp, 'rb') as fi, gzip.open(f'{OUT}/판/rows_{t}_{z}.jsonl.gz', 'wb') as fo: fo.write(fi.read())
for f in sorted(os.listdir(f'{D}/e2e')):
    if re.match(r'^(E0|EH)_\d\d\.txt$', f): shutil.copy(f'{D}/e2e/{f}', f'{OUT}/e2e/{f}')
shutil.copy(f'{D}/e2e/sig.py', f'{OUT}/e2e/sig.py')
if os.path.exists(f'{D}/tables/econ_md5.txt'): shutil.copy(f'{D}/tables/econ_md5.txt', f'{OUT}/e2e/econ_md5.txt')
if os.path.exists(f'{D}/tables/e2e_full.txt'): shutil.copy(f'{D}/tables/e2e_full.txt', f'{OUT}/e2e/표_전체.txt')
for f in ['band.json', 'band_on.txt', 'band_on_terrain.txt', 'band_on_rule5.txt']:
    if os.path.exists(f'{D}/band/{f}'): shutil.copy(f'{D}/band/{f}', f'{OUT}/띠땅/{f}')
for f in ['chain.js', 'agg.py', 'age_combined.py', 'e2e_table.py', 'e2e_econ_md5.sh', 'final_tables.sh', 'pack.py']:
    shutil.copy(f'{D}/{f}', f'{OUT}/도구/{f}')
for f in ['natural', 'staged', 'age', 'age_combined', 'herd_example', 'herd_bundle', 'e2e']:
    if os.path.exists(f'{D}/tables/{f}.md'): shutil.copy(f'{D}/tables/{f}.md', f'{OUT}/판/표_{f}.md' if f != 'e2e' else f'{OUT}/e2e/표.md')
print('판', len(tags), '·', sorted(os.listdir(f'{OUT}/e2e')).__len__(), 'e2e 파일')
