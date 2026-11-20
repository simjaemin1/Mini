#!/usr/bin/env python3
# 마을실험실(원본) 동물 블록 → 사냥실험실로 재생성. 사용: python3 sim/rebuild-huntlab.py (레포 루트 상위 Mini/에서 동작)
# 블록만 교체(드라이버·UI 보존). 랩 패치 9종 전부 assert — 앵커 깨지면 즉시 실패.
import io,os
B=os.path.join(os.path.dirname(__file__),'..','..')
src=io.open(os.path.join(B,'마을실험실.html'),encoding='utf-8').read()
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
    assert a in blk, '앵커 깨짐: '+a[:60]
    blk=blk.replace(a,b)
L=os.path.join(B,'사냥실험실.html')
lab=io.open(L,encoding='utf-8').read()
st2=lab.index('// ═══════════ 이하'); en2=lab.index('// ═══ 사냥 실험실 상태 ═══')
hdr=lab[st2:lab.index('\n',st2)+1]
io.open(L,'w',encoding='utf-8').write(lab[:st2]+hdr+blk+lab[en2:])
print('사냥실험실 재생성 완료 (패치 9/9)')
