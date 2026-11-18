import re,sys,json,hashlib
# 판 글자 서명 — 벽시계 수(기동 · 다시 뜸 · 걸음표 wall)만 지우고 나머지 글자 그대로
def sig(path):
    L=open(path,encoding='utf-8').read().split('\n')
    keep=[]; red=[]; tot=None
    for l in L:
        if re.match(r'^\s*(✓|✗)',l) or l.strip().startswith('· [표') or l.strip().startswith('· [ⓖ 진단') or l.strip().startswith('· [ⓗ'):
            s=l
            s=re.sub(r'\d+(\.\d+)?ms(?=\s*$)','#ms',s)
            s=re.sub(r'(기동|다시 뜸\(같은 DB\)|닛폰|한반도)\s+\d+(\.\d+)?s','\\1 #s',s)
            s=re.sub(r'\b\d+(\.\d+)?s\(made\)|\b\d+(\.\d+)?s\(wait\)|\b\d+(\.\d+)?s\(hit\)','#geo',s)
            s=re.sub(r'(made|wait|hit)\)','#)',s)
            s=re.sub(r'기동 뒤 \d+s','기동 뒤 #s',s)
            s=re.sub(r'\d+(\.\d+)?s\(기다림 [\d.]+s\)','#lazy',s)
            s=re.sub(r'central 기동\s+\d+ms','central 기동 #',s)
            s=re.sub(r'기동\(마을 시딩 포함\)\s+\d+(\.\d+)?s','기동(마을 시딩 포함) #s',s)   # 존 기동 벽시계
            s=re.sub(r'null 표본 한반도 \d+ · 닛폰 \d+','null 표본 #',s)   # 하네스 표본 요청 실패 수(벽시계 · 판정 밖 — 건너뛰고 다시 읽는다)
            keep.append(s.strip())
            if l.strip().startswith('✗'): red.append(re.match(r'\s*✗\s+(\S+)',l).group(1))
        m=re.search(r'=== (\d+)건 중 PASS (\d+) · FAIL (\d+) ===',l)
        if m: tot=(int(m.group(1)),int(m.group(2)),int(m.group(3)))
    h=hashlib.sha1('\n'.join(keep).encode()).hexdigest()[:12]
    v=[k for k in keep if k.startswith('✓') or k.startswith('✗')]
    vh=hashlib.sha1('\n'.join(v).encode()).hexdigest()[:12]
    pat=[(k[0]+' '+k.split()[1]) for k in v]   # 판정 꼴 — 줄 이름 + ✓/✗ 만(값 뺌)
    ph=hashlib.sha1('\n'.join(pat).encode()).hexdigest()[:12]
    return {'file':path,'tot':tot,'red':red,'sig':h,'vsig':vh,'psig':ph,'lines':len(keep),'vlines':len(v)}
out=[sig(p) for p in sys.argv[1:]]
print(json.dumps(out,ensure_ascii=False,indent=0))
