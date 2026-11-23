# 표_싸움*.md · 표_혼자.md · 표_상성.md → 팔마다 한 줄(표_팔_요약.md)
import collections,re
def rows(fn):
    for l in open(fn,encoding='utf-8'):
        if l.startswith('| ') and not l.startswith('| 팔'): yield [x.strip() for x in l.strip().strip('|').split('|')]
num=lambda s:int(s.split()[0])
T=collections.OrderedDict()
for fn in ['표_싸움.md','표_싸움_조합.md','표_싸움_조합2.md']:
    for c in rows(fn): T.setdefault(c[0],{})[c[1]]=c
solo=collections.defaultdict(dict)
for c in rows('표_혼자.md'):
    if c[1]=='석검 하나': solo[c[0]][float(c[2])]=(int(c[3]),int(c[4]),[int(x) for x in c[7].split('·')])
txt=open('표_상성.md',encoding='utf-8').read(); M={}
for b in re.split(r'\n### 팔 ',txt):
    if '—' not in b: continue
    n=b.split(' — ')[0].replace('### 팔 ','').strip()
    M[n]={r.split('|')[1].strip():[int(x) for x in r.strip().strip('|').split('|')[1:]] for r in b.splitlines() if r.startswith('| ') and not r.startswith('| A')}
K=list(M['끔'].keys())
dom=lambda m:{(x,y):(m[x][j]+100-m[y][i])/2 for i,x in enumerate(K) for j,y in enumerate(K) if i<j}
o=dom(M['끔'])
STD=['민병 1 ↔ 석검 1','민병 5 ↔ 석검 5','민병 20 ↔ 석검 20','창 20 ↔ 창 20','창 20 ↔ 석검 20','창 30 + 궁 10 + 정예 3 ↔ 창 20 + 석검 15 + 궁 10','창 40 ↔ 창 20','창 2(원형) ↔ 석검 3']
C3=['민병 20 ↔ 석검 20','창 20 ↔ 창 20','창 40 ↔ 창 20','창 30 + 궁 10 + 정예 3 ↔ 창 20 + 석검 15 + 궁 10']
NAME={'nocommit,instant,breaknow':'후보 가','nodesp,nocommit,instant,breaknow':'후보 나','self,nodesp,wound,nocommit,instant,breaknow':'후보 다','self,nodesp,wound,nocommit,instant,breaknow,nochase':'후보 라','self,nodesp,nocommit,instant,breaknow':'후보 마','self':'㉮','nodesp':'㉯','wound':'㉰','nochase':'㉱','nocommit':'㉲ⓐ','instant':'㉲ⓑ','breaknow':'㉲ⓒ','norally':'㉲ⓓ'}
rg=lambda v:f"{min(v)} ~ {max(v)}"
print('| 팔 | 이름 | 진 편 죽음 %(여덟 꼴) | 그중 쫓겨 죽음 % | 진 편 살아 달아남 % | 이긴 편 죽음 % | 가운데 초 | ⓐ 행복 0.3 창 30↔20 A 죽음 | ⓑ 행복 1 창 18↔22 A 죽음 | ⓒ 큰 싸움 넷 진 편 살아 달아남 최소 | 혼자↔석검 도적 행복 0.9 죽음 · 1 | 혼자 행복 0.55 붙기 전 달아남 | 상성 뒤집힘 | 과녁 ⓐⓑⓒ · 1↔1 대등 |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for a,S in T.items():
    if not all(k in S for k in STD+['ⓑ 창 18 ↔ 창 22 · A 행복 1']): continue
    ld=[num(S[k][3]) for k in STD]; ch=[num(S[k][4]) for k in STD]; sv=[num(S[k][5]) for k in STD]; wd=[num(S[k][6]) for k in STD]; md=[float(S[k][8]) for k in STD]
    A_=num(S['ⓐ 창 30 ↔ 창 20 · A 행복 0.3'][10].split('·')[0]); B_=num(S['ⓑ 창 18 ↔ 창 22 · A 행복 1'][10].split('·')[0]); C_=min(num(S[k][5]) for k in C3)
    so=solo.get(a); s09=f"{so[0.9][0]} · {so[1.0][0]}" if so else '—'; s55=f"{so[0.55][2][1]}/200" if so else '—'
    fl='—'
    if a in M:
        d=dom(M[a]); f=[f"{x}↔{y}({o[(x,y)]:.0f}→{d[(x,y)]:.0f})" for (x,y) in o if (o[(x,y)]-50)*(d[(x,y)]-50)<0]; fl=f"{len(f)}"+(' '+' '.join(f) if f else '')
    ok=A_<=5 and 20<=B_<=70 and C_>=30
    print(f"| {a} | {NAME.get(a,'')} | {rg(ld)} | {rg(ch)} | {rg(sv)} | {rg(wd)} | {rg(md)} | {A_} | {B_} | {C_} | {s09} | {s55} | {fl} | {'○' if ok else '✗'} · {'○' if 'self' in a else '✗'} |")
