#!/usr/bin/env python3
# 마을실험실 동물 블록 → 사냥실험실로 재생성.
#   사용: python3 sim/rebuild-huntlab.py           (레포 루트 아무 데서나 — 경로는 이 파일 기준)
#         python3 sim/rebuild-huntlab.py --check   (쓰지 않고 견준다 — lab/사냥실험실.html 이 지금 블록으로 구운 것과 같으면 0, 다르면 1)
# 블록만 교체(드라이버·UI 보존). 랩 패치 9종 전부 assert(앵커가 정확히 1곳) — 앵커 깨지면 즉시 실패.
# ★[T1396 2026-11-20] 자리 옮김: 07-07 판은 레포 밖(맥 ~/Mini/마을실험실.html → ~/Mini/사냥실험실.html)을 읽고 썼다.
#   이제 원천 = lab/마을실험실.html · 출력 = lab/사냥실험실.html · 출력이 아직 없으면 껍데기(드라이버·UI) =
#   lab/원본/사냥실험실_0707.html(07-07 그대로 · 손 0). 패치 아홉의 글자는 07-07 그대로다(앵커 9/9 그대로 섰다).
#   앞잇기 하나: 지금 블록의 canWalk 가 마을실험실의 `_insideBldgV`(건물 풋프린트) 를 부른다 — 사냥실험실엔 그 함수가 없어
#   (s.V = {walls:Set} 이라 늘 부른다) ReferenceError 로 죽는다. 그 함수 글자를 마을실험실에서 앵커로 떠서 블록 앞에 붙인다
#   (사본 손질 0 · 원천이 바뀌면 다시 구울 때 같이 바뀐다 · 사냥실험실엔 집 · 회관 · 곳간이 없어 늘 false).
import io,os,sys
B=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
SRC=os.path.join(B,'lab','마을실험실.html')
L=os.path.join(B,'lab','사냥실험실.html')
SHELL=os.path.join(B,'lab','원본','사냥실험실_0707.html')
src=io.open(SRC,encoding='utf-8').read()
blk=src[src.index('// ═══ 야생 몹 생태계'):src.index('const L_CLEAR=')]
P=[("const t=MOB_PREY[(Math.random()*MOB_PREY.length)|0],D=MOB_DEF[t];","const t=_pickSp(),D=MOB_DEF[t];/*랩 패치: 복수 종 공존 — 선택 집합에서 가중 추첨*/"),
 ("const D=MOB_DEF[m.type];if(!D.pred){preyN++;preyL.push(m);}else{preds.push(m);if(D.pred===1)wolfN++;else tigN++;}",
  "const D=MOB_DEF[m.type];preyN++;/*랩: 전종 집계*/if(!D.pred)preyL.push(m);else{preds.push(m);if(D.pred===1)wolfN++;else tigN++;}"),
 ("if(m&&m.st!=='dead'&&m.st!=='hide'&&!MOB_DEF[m.type].pred){s.mobs.splice(j,1);preyN--;}   /* ★hide는 정리 금지(굴속 대기) */",
  "if(m&&m.st!=='dead'&&m.st!=='hide'){s.mobs.splice(j,1);preyN--;}/*랩: hide 정리 금지*/"),
 ("MOB_WOLF_P=0.0012, MOB_TIG_P=0.00018","MOB_WOLF_P=0, MOB_TIG_P=0   /*랩*/"),
 ("nearIn(mgrid,a.px,a.py,m=>{if(m!==a._cm)return;/*★교전=커밋 표적 전용(지나가는 놈 즉석 사격 폐지 — 표적 변경은 단일 규칙로만)*/if(m.hp<=0||m.type==='🐯')return;",
  "nearIn(mgrid,a.px,a.py,m=>{if(m!==a._cm)return;/*★교전=커밋 표적 전용*/if(m.hp<=0)return;/*랩: 호랑이 허용*/"),
 ("function _mobView(){const v=(typeof view!=='undefined')?view:{z:1,ox:0,oy:0},c=(typeof CELL!=='undefined')?CELL:1.9;   // 현재 카메라 가시 셀범위(+여백) = 몹 존재 구간(LOD)\n  return {x0:Math.max(0,Math.floor(-v.ox/v.z/c)-2),x1:Math.min(N,Math.ceil((760-v.ox)/v.z/c)+2),y0:Math.max(0,Math.floor(-v.oy/v.z/c)-2),y1:Math.min(N,Math.ceil((760-v.oy)/v.z/c)+2)};}",
  "function _mobView(){return {x0:0,x1:N,y0:0,y1:N};}   // ★랩: LOD 해제(굴 소실 px=-99는 밖 판정 유지)"),
 ("const target=Math.min(MOB_CAP,","const target=Math.min(HUNT_CAP,"),
 (";s._shots=(s._shots||0)+1;if(hit)s._hitsN=(s._hitsN||0)+1;a.action='저격';}}",
  ";s._shots=(s._shots||0)+1;if(hit)s._hitsN=(s._hitsN||0)+1;{const _K=a._hsk|0;(s._sLv=s._sLv||{})[_K]=(s._sLv[_K]||0)+1;if(hit)(s._hLv=s._hLv||{})[_K]=(s._hLv[_K]||0)+1;}a.action='저격';}}/*랩: 집계*/"),
 ("_yb*(1+HSK_F(a)*0.06);a.action='수확';a._carc=null;}}",
  "_yb*(1+HSK_F(a)*0.06);{const _K=a._hsk|0;(s._kLv=s._kLv||{})[_K]=(s._kLv[_K]||0)+1;(s._yLv=s._yLv||{})[_K]=(s._yLv[_K]||0)+_yb*(1+HSK_F(a)*0.06);}a.action='수확';a._carc=null;}}/*랩: 레벨별 수확·수율*/")]
for a,b in P:
    assert blk.count(a)==1, '앵커 깨짐(1곳 아님 · %d곳): '%blk.count(a)+a[:60]
    blk=blk.replace(a,b)
# 앞잇기 — `_insideBldgV` (마을실험실 글자 그대로)
i0=src.index('function _insideBldgV(VV,x,y)'); i1=src.index('\nfunction ',i0+1)+1
assert src.count('function _insideBldgV(VV,x,y)')==1, '앞잇기 앵커 깨짐: _insideBldgV'
pre='// ─── [T1396 앞잇기] 마을실험실 `_insideBldgV` 글자 그대로(블록 canWalk 가 부른다 · 사냥실험실엔 건물이 없어 늘 false) ───\n'+src[i0:i1]
base=L if os.path.exists(L) else SHELL
lab=io.open(base,encoding='utf-8').read()
st2=lab.index('// ═══════════ 이하'); en2=lab.index('// ═══ 사냥 실험실 상태 ═══')
hdr=lab[st2:lab.index('\n',st2)+1]
out=lab[:st2]+hdr+pre+blk+lab[en2:]
if '--check' in sys.argv:
    if not os.path.exists(L):
        print('❌ lab/사냥실험실.html 없음 — python3 sim/rebuild-huntlab.py 로 구워라'); sys.exit(1)
    if out==lab:
        print('✅ 사냥실험실 = 지금 마을실험실 블록(패치 9/9 · 앞잇기 1)'); sys.exit(0)
    print('❌ 사냥실험실이 지금 마을실험실 동물 블록과 다르다 — python3 sim/rebuild-huntlab.py 로 다시 구워라'); sys.exit(1)
io.open(L,'w',encoding='utf-8').write(out)
print('사냥실험실 재생성 완료 (패치 9/9 · 앞잇기 1) ← '+os.path.relpath(base,B))
