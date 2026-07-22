// ═══════════════════════════════════════════════════════════════════════════
// battle-core.js — 전투실험실.html 전투 시뮬 코어를 복사 추출(0리스크: 전투실험실은 무수정).
//   DOM·렌더·컨트롤 제외한 순수 계산만. window.BattleCore(브라우저) / module.exports(Node) 겸용 노출.
//   전쟁실험실이 이 파일을 <!-- BATTLE-CORE --> 마커 사이에 인라인해서 씀(sim/inline-battle.js).
//   ★ 로직·상수·이름은 전투실험실과 동일. deploy()→buildArmies(spec)만 DOM 읽기를 데이터 주입으로 치환.
//     spawn()에 선택적 quality 인자 추가(미지정=배수 1.0 → 전투실험실과 완전 동일 동작).
// ═══════════════════════════════════════════════════════════════════════════
;(function(root){
'use strict';

const WORLD_W=130, WORLD_H=130;          // 전장 130×130 m (전투실험실과 동일)

// ═══════════ 병종 정의 (전투실험실 UNITS 복사) ═══════════
const UNITS={
  spear   : {name:'창방패', hp:120, atk:24, reach:1.8,  spd:1.5, chg:2.2, cd:1.0, shield:0.55, shHP:60, shBrk:8,  ranged:0,  mAtk:24, col:'#5a8ad0', r:0.42, role:'front'},
  pike    : {name:'장창',   hp:110, atk:30, reach:2.5,  spd:1.4, chg:2.0, cd:1.1, shield:0,    shHP:0,  shBrk:16, ranged:0,  mAtk:30, col:'#57a8a8', r:0.42, role:'front', standoff:1},
  greataxe: {name:'양손도끼',hp:115, atk:40, reach:1.6, spd:1.5, chg:2.1, cd:1.0, shield:0,    shHP:0,  shBrk:58, ranged:0,  mAtk:40, col:'#b5563a', r:0.44, role:'front'},
  dagger  : {name:'석검',   hp:84,  atk:40, reach:1.35, spd:1.9, chg:3.9, cd:0.7, shield:0,    shHP:0,  shBrk:6,  ranged:0,  mAtk:40, col:'#9a9488', r:0.36, role:'front'},
  archer  : {name:'궁수',   hp:58,  atk:44, reach:1.2,  spd:1.9, chg:1.9, cd:8.0, shield:0,    shHP:0,  shBrk:4,  ranged:40, arrowV:52, mAtk:10, col:'#5fbf6a', r:0.36, role:'back'},
  slinger : {name:'투석병', hp:46,  atk:22, reach:1.2,  spd:2.0, chg:1.9, cd:4.2, shield:0,    shHP:0,  shBrk:3,  ranged:52, arrowV:42, spread:1.9, ammo:'stones', mAtk:8, col:'#c9a24b', r:0.34, role:'back'},   // ★[밸런스] 돌 직사(곡사X)·활보다 사거리↑(40→52 명확한 standoff)·재장전 5.0→4.2·명중 2.2→1.9(궁수 하위호환 탈피, 견제역). 여전히 근접 약·방패 못 부숨
  champion: {name:'청동전사',hp:175, atk:46, reach:1.5, spd:1.8, chg:3.0, cd:0.65,shield:0.35, shHP:80, shBrk:20, ranged:0,  mAtk:46, col:'#c8862e', r:0.5, role:'front', champ:1},
  militia : {name:'농기구민병',hp:68, atk:22, reach:1.4, spd:1.6, chg:2.0, cd:1.0, shield:0,    shHP:0,  shBrk:5,  ranged:0,  mAtk:22, col:'#8a7a5a', r:0.38, role:'front'},   // ★[밸런스] 조악한 징집병(농기구): hp60→68·공격18→22(머릿수로 의미 — 무의미 전멸 회피). 방패X·사기 낮아 쉽게 궤주·파손 잦음
};
const SIDE_COL={A:'#7ab0ff', B:'#ff8a7a'};
const ARROWS_PER=20;   // 궁수당 화살(부대 원정 보급)
const STONES_PER=15;   // 투석병당 돌(부대 원정 보급) — 소진 시 백병/후퇴
const BREAK_P={dagger:0.05, spear:0.018, pike:0.025, greataxe:0.012, champion:0.004, archer:0, slinger:0, militia:0.06};   // 무기 파손 확률(타격당). 민병=농기구라 높음, 투석병=투사만
// ═══════════ 사기(개별) 상수 ═══════════
const MRL0={champion:1.0, spear:0.85, pike:0.80, greataxe:0.80, dagger:0.72, archer:0.70, slinger:0.68, militia:0.62};   // ★[밸런스] 민병=징집병이라 낮음(쉽게 궤주). 0.55→0.62: 즉시 사기붕괴로 머릿수 못살린 채 전멸하던 것 완화(여전히 최저·궤주 잦음)
const M_BREAK=0.45, M_RALLY=0.62;
const M_RATE=1.4;
const M_KODDS=0.45, M_KCONTAG=0.22, M_KCHAMP=0.20, M_KRELCAS=1.0, M_KABS=0.5;
const M_KCOMMIT=0.38, M_KWOUND=0.30, M_KDESP=0.55, COMMIT_D=6;
const M_BREAKRATE=2.5;
const SUP_ARROW=0.05, SUP_DEATH=0.05, SUP_R=3.0;
const FORM_SPD={line:1, wall:0.85, open:1.15, column:1.25, circle:0};   // 대형별 이동속도
const FORM_KO={line:'선형', wall:'방패벽', open:'산개', circle:'원형', column:'종대'};

// ═══════════ 상태 → 컨텍스트 객체(ctx) ═══════════
// ★ 다중 인스턴스화: 전역 싱글톤이던 상태를 ctx 객체로 묶음. 각 함수가 ctx를 첫 인자로 받아 ctx.* 참조.
//   전역 API는 단일 _defaultCtx에 위임(전투실험실·기존 전쟁실험실 경로 100% 보존).
//   _grid·_cen 도 반드시 ctx 소속 — 두 전투가 동시 구동 시 서로 밟으면 안 됨.
//   rng: 인스턴스 RNG 훅(기본 Math.random). 본체 코드는 Math.random()→ctx.rng() 관례.
//   origin/heading: 맵 배치용(기본 0 — 이번 단계 배치 로직 불변, 훅만 마련).
function createContext(){
  return {
    units:[], arrows:[], corpses:[],
    sides:{A:{start:0,dead:0,rout:false}, B:{start:0,dead:0,rout:false}},
    tick:0, result:null,
    trees:[], buildings:[], terrain:'plain',
    playerMode:false, keys:{}, commander:null, cmdHeading:0,
    _grid:new Map(),
    _cen:{A:{x:0,y:0,n:0,march:2.2},B:{x:0,y:0,n:0,march:2.2}},
    rng:Math.random,          // 인스턴스 RNG 훅(하네스가 시드 주입 시 교체)
    origin:{cx:0,cy:0}, heading:0,   // 맵 배치용(기본 0)
  };
}

// ═══════════ 지형 — genForest / concealed / treeBlocks (전투실험실 복사) ═══════════
function genForest(ctx,mode){ ctx.trees=[]; ctx.buildings=[]; ctx.terrain=mode;
  if(mode==='village'){
    const cx=WORLD_W/2, cy=WORLD_H/2; ctx.buildings.push({x:cx,y:cy,w:8,h:8}); const placed=[[cx,cy]];
    let tr=0; while(ctx.buildings.length<22 && tr++<900){ const a=ctx.rng()*6.283, r=13+ctx.rng()*40, hx=cx+Math.cos(a)*r, hy=cy+Math.sin(a)*r;
      if(hx<10||hx>WORLD_W-10||hy<10||hy>WORLD_H-10)continue; let ok=true;
      for(const p of placed)if(Math.hypot(hx-p[0],hy-p[1])<12){ok=false;break;} if(!ok)continue;
      const vert=ctx.rng()<0.5; ctx.buildings.push({x:hx,y:hy,w:vert?4:6,h:vert?6:4}); placed.push([hx,hy]); }
    return; }
  if(mode!=='forest'&&mode!=='edge')return;
  const g=8.5, x0= mode==='edge'?WORLD_W*0.42:6, x1=WORLD_W-6;
  for(let x=x0;x<x1;x+=g)for(let y=6;y<WORLD_H-6;y+=g){ if(ctx.rng()<0.72){
    const tx=x+(ctx.rng()-0.5)*g*0.85, ty=y+(ctx.rng()-0.5)*g*0.85;
    if(tx>3&&tx<WORLD_W-3&&ty>3&&ty<WORLD_H-3)ctx.trees.push({x:tx,y:ty,r:0.75+ctx.rng()*0.65});}}
}
function concealed(ctx,u){ for(const t of ctx.trees){const dx=u.x-t.x,dy=u.y-t.y;if(dx*dx+dy*dy<(t.r+1.4)*(t.r+1.4))return true;}
  for(const b of ctx.buildings){if(Math.abs(u.x-b.x)<b.w/2+1.8&&Math.abs(u.y-b.y)<b.h/2+1.8)return true;} return false; }
function treeBlocks(ctx,x1,y1,x2,y2){ if(!ctx.trees.length&&!ctx.buildings.length)return false;
  for(const t of ctx.trees){ const dx=x2-x1,dy=y2-y1,L2=dx*dx+dy*dy; if(L2<1e-6)continue;
    let s=((t.x-x1)*dx+(t.y-y1)*dy)/L2; if(s<0.06||s>1)continue;
    const px=x1+dx*s,py=y1+dy*s, pd=Math.hypot(t.x-px,t.y-py); if(pd<t.r+1.6)return true; }
  if(ctx.buildings.length){ const dx=x2-x1,dy=y2-y1,d=Math.hypot(dx,dy),n=Math.ceil(d/1.5);
    for(let i=1;i<n;i++){const s=i/n,px=x1+dx*s,py=y1+dy*s; for(const b of ctx.buildings)if(Math.abs(px-b.x)<b.w/2&&Math.abs(py-b.y)<b.h/2)return true;} }
  return false; }

// ═══════════ spawn (전투실험실 복사 + 선택적 quality 인자) ═══════════
// ★ quality 미지정 → 배수 1.0 = 전투실험실과 완전 동일(atk 손 안 댐, RNG 소비 순서 동일).
//   quality 지정 → u.atk *= (0.85 + 0.3×(weapQ−0.5)) 최소침습(전쟁실험실 마을 무기품질 반영용).
//   weapQ 기본 0.5(=배수 1.0). spawn 시그니처 끝에 추가라 기존 호출(4~5인자)은 그대로.
function spawn(ctx,side,type,x,y,form,quality){const D=UNITS[type];
  const u={id:ctx.units.length,side,type,x,y,hp:D.hp,maxHp:D.hp, shp:D.shHP||0, shMax:D.shHP||0, tgt:null, st:'adv', cd:ctx.rng()*D.cd, face:side==='A'?0:Math.PI, _rt:0, mrl:MRL0[type]||0.8, routing:false, form:form||'line'};
  if(quality){ const weapQ=(quality.weapQ!=null?quality.weapQ:0.5); u.atk=D.atk*(0.85+0.3*(weapQ-0.5)); }   // 미지정이면 u.atk 미설정 → hurt/stepBattle이 D.atk 사용(동일). 지정 시만 개체 atk 배수
  ctx.units.push(u);}

// ═══════════ buildArmies(spec) — 전투실험실 deploy()의 배치 로직 복사, DOM 읽기만 spec 주입 ═══════════
// spec = { A:{champion,greataxe,spear,pike,dagger,archer, form}, B:{...}, terrain:'plain', playerCmd:false,
//          quality:{ A:{weapQ}, B:{weapQ} } }   // quality 생략 시 전투실험실과 완전 동일
// ★ 초기 위치 주입(선택): spec.A.units / spec.B.units = [{type, x, y, face?, cmd?}] (로컬좌표 0~130)이 있으면
//   그 진영은 표준 라인 배치 대신 각 유닛을 그 위치로 spawn(행군/포진 대형 위치 승계 → 스냅 0). count(champion 등)는 무시.
//   위치 미주입(units 없음) 진영은 기존 표준 배치 100% 동일 → 전투실험실·골든마스터 비트동일. 화살/돌/지휘관/슬롯/품질은 표준과 동일하게 세팅.
function buildArmies(ctx,spec){
  spec=spec||{};
  ctx.units=[]; ctx.arrows=[]; ctx.corpses=[]; ctx.tick=0; ctx.result=null;
  const _t=(spec.terrain!=null)?spec.terrain:'plain';
  genForest(ctx,_t);   // ★ 전투실험실은 지형변경 시만 재생성하나, 데이터주입형은 매 호출 지정 지형으로 생성(하네스 결정론). 평지=nop.
  ctx.sides={A:{start:0,dead:0,rout:false}, B:{start:0,dead:0,rout:false}};
  ctx.playerMode=!!spec.playerCmd;
  const sideSpec=s=>spec[s]||{};
  const rd=(side,sfx)=>{const v=sideSpec(side)[BC_KEY[sfx]]; return +(v||0);};   // rd('a_champ') → spec.A.champion 치환
  const gf=side=>{const f=sideSpec(side).form; return f||'line';};
  const qOf=side=>spec.quality?spec.quality[side]:null;   // 품질 배수(선택)
  const cyc=WORLD_H/2;
  const place=(side)=>{
    const dir = side==='A' ? 1 : -1;
    const form = gf(side); ctx.sides[side].form=form;
    const frontX = side==='A' ? 40 : WORLD_W-40;
    const backX  = side==='A' ? 22 : WORLD_W-22;
    const front=[], back=[];
    const add=(sfx,key,arr)=>{const n=rd(side,sfx);for(let i=0;i<n;i++)arr.push(key);};
    add('champ','champion',front); add('axe','greataxe',front); add('spear','spear',front); add('pike','pike',front); add('dagger','dagger',front); add('militia','militia',front);
    add('archer','archer',back); add('slinger','slinger',back);
    const q=qOf(side);   // 이 진영 품질(spawn에 전달)
    if(ctx.terrain==='village'){
      const all=[...front,...back]; const xLo=side==='A'?16:WORLD_W*0.40, xHi=side==='A'?WORLD_W*0.60:WORLD_W-16;
      for(const type of all){ let x,y,tr=0;
        do{ x=xLo+ctx.rng()*(xHi-xLo); y=12+ctx.rng()*(WORLD_H-24); tr++; }
        while(tr<50 && ctx.buildings.some(b=>Math.abs(x-b.x)<b.w/2+1.6&&Math.abs(y-b.y)<b.h/2+1.6));
        spawn(ctx,side,type,x,y,'open',q); }
      return;
    }
    if(form==='circle'){
      const outer=[],inner=[];
      for(const u of front)(u==='dagger'?inner:outer).push(u);
      for(const u of back)inner.push(u);
      const cx=frontX-dir*12, cy=cyc, oR=Math.max(4, outer.length*0.42);
      for(let i=0;i<outer.length;i++){const a=i/Math.max(1,outer.length)*6.283; spawn(ctx,side,outer[i],cx+Math.cos(a)*oR,cy+Math.sin(a)*oR,form,q);}
      for(let i=0;i<inner.length;i++){const a=i/Math.max(1,inner.length)*6.283+0.4, rr=Math.max(1.2,(oR-3)*(inner.length>8?(0.55+0.45*(i%2)):0.62)); spawn(ctx,side,inner[i],cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,form,q);}
      return;
    }
    let sp,per,dep;
    if(form==='wall'){sp=2.4;per=16;dep=2.4;}
    else if(form==='open'){sp=8;per=8;dep=7;}
    else if(form==='column'){sp=2.8;per=5;dep=2.8;}
    else {sp=4.5;per=10;dep=3;}
    const lay=(arr,x0,s2,base,d2,zz)=>{const n=arr.length;if(!n)return;
      const p2=form==='column'?base:Math.min(Math.max(base,Math.floor(WORLD_H*0.9/s2)),Math.max(base,Math.ceil(n/2)));
      for(let i=0;i<n;i++){const c=(i/p2)|0, r=i%p2, colN=Math.min(p2,n-c*p2);
        const zig=(form==='open'||zz)?(c%2)*s2*0.55:0;
        spawn(ctx,side,arr[i], x0 - dir*c*d2, cyc+(r-(colN-1)/2)*s2+zig, form,q);}};
    if(form==='open'||form==='column'){
      lay(front,frontX,sp,per,dep); lay(back,backX, form==='open'?8:4.5, 12, 3);
    } else {
      const fl=[],sl=[],fk=[];
      for(const u of front){ if(u==='spear'||u==='champion')fl.push(u); else if(u==='dagger')fk.push(u); else sl.push(u); }
      if(!fl.length){fl.push(...sl);sl.length=0;}
      if(!fl.length){fl.push(...fk);fk.length=0;}
      lay(fl,frontX,sp,per,dep);
      if(sl.length)lay(sl,frontX-dir*(dep+2),sp,per,dep);
      {const aw=back.length, pr=Math.max(1,Math.floor(WORLD_H*0.84/5.0));
        for(let i=0;i<aw;i++){const c=(i/pr)|0,r=i%pr,rn=Math.min(pr,aw-c*pr); spawn(ctx,side,back[i], backX-dir*c*5, cyc+(r-(rn-1)/2)*5.0+(c%2)*2.5, form,q);}}
      if(fk.length){const half=Math.ceil(fk.length/2),fy=WORLD_H*0.30;
        for(let i=0;i<fk.length;i++){const top=i<half,idx=top?i:i-half,cnt=top?half:fk.length-half;
          spawn(ctx,side,fk[i], frontX-dir*3, (top?cyc-fy:cyc+fy)+(idx-(cnt-1)/2)*2.6, form,q);}}
    }
  };
  // ═══ 초기 위치 주입(선택) — spec.A/B.units=[{type,x,y,face?,cmd?}] 있으면 표준 라인 배치 대신 그 위치로 spawn ═══
  // ★[행군→전투 연속] 전쟁실험실이 행군/포진 대형의 개별 병사 로컬좌표를 넘기면, 표준 재배치(측방 스냅) 없이
  //   병사가 서 있던 그 자리에서 전투 유닛이 됨. 위치 미주입(count-only spec)이면 아래 place()가 표준 배치(전투실험실·골든마스터 100% 동일).
  //   ★결정론: 주입 경로는 RNG 무소비(위치 확정). 표준 place() 경로는 손대지 않음 → 시드-오프셋 불변(골든마스터 비트동일).
  const placeInjected=(side,list)=>{
    const form=gf(side); ctx.sides[side].form=form; const q=qOf(side);
    const CL=(v)=>v<0.5?0.5:(v>WORLD_W-0.5?WORLD_W-0.5:v);   // 로컬 WORLD(0~130) 범위 클램프(가장자리)
    let cmdU=null;
    for(const it of list){ if(!it||!UNITS[it.type])continue;
      const x=CL(+it.x), y=CL(+it.y);
      spawn(ctx,side,it.type,x,y,form,q);
      const u=ctx.units[ctx.units.length-1];
      if(it.face!=null)u.face=+it.face;   // 지정 시 향(미지정=spawn 기본: A→+x, B→π=적 방향, origin/θ 정합)
      if(it.agent)u.agent=it.agent;   // ★[S1 미러] injected unit의 agent 참조를 유닛에 그대로 부착(순수 데이터 — step 로직·RNG 무영향). 전쟁실험실 _lbSyncAgents가 매 프레임 u→agent 단방향 미러. 표준 place() 경로는 it 없음 → 무영향(골든마스터 비트동일).
      if(it.cmd)cmdU=u;
    }
    if(!cmdU){ const arr=ctx.units.filter(u=>u.side===side); if(arr.length)cmdU=arr.reduce((a,b)=>(side==='A'?b.x>a.x:b.x<a.x)?b:a,arr[0]); }   // cmd 미지정 → 최전방(A=최대x, B=최소x=적에 가장 가까운 열)
    if(cmdU)cmdU._injCmd=true;   // 표식(플레이어 지휘블록이 이 지휘관을 우선 채택)
  };
  const _uA=sideSpec('A').units, _uB=sideSpec('B').units;
  if(Array.isArray(_uA)&&_uA.length) placeInjected('A',_uA); else place('A');
  if(Array.isArray(_uB)&&_uB.length) placeInjected('B',_uB); else place('B');
  ctx.sides.A.start=ctx.units.filter(u=>u.side==='A').length;
  ctx.sides.B.start=ctx.units.filter(u=>u.side==='B').length;
  ctx.sides.A.arrows=ctx.units.filter(u=>u.side==='A'&&u.type==='archer').length*ARROWS_PER;
  ctx.sides.B.arrows=ctx.units.filter(u=>u.side==='B'&&u.type==='archer').length*ARROWS_PER;
  ctx.sides.A.stones=ctx.units.filter(u=>u.side==='A'&&u.type==='slinger').length*STONES_PER;   // ★부대 돌 재고=투석병수×보급(소진 시 백병/후퇴)
  ctx.sides.B.stones=ctx.units.filter(u=>u.side==='B'&&u.type==='slinger').length*STONES_PER;
  ctx.sides.A.hadChamp=ctx.units.some(u=>u.side==='A'&&u.type==='champion');
  ctx.sides.B.hadChamp=ctx.units.some(u=>u.side==='B'&&u.type==='champion');
  if(ctx.playerMode){ const As=ctx.units.filter(u=>u.side==='A'); if(As.length){
    // ★주입 경로: placeInjected가 표식한 지휘관(_injCmd) 우선. 표준 경로(_injCmd 없음)는 기존대로 최전방(최대x) — 골든마스터 불변.
    const inj=As.find(u=>u._injCmd);
    ctx.commander=inj||As.reduce((a,b)=>b.x>a.x?b:a,As[0]); ctx.commander.cmd=true; ctx.cmdHeading=0;
    for(const u of As){u.slx=u.x-ctx.commander.x; u.sly=u.y-ctx.commander.y;}
  }}
  return { A:ctx.sides.A.start, B:ctx.sides.B.start };
}
// deploy()의 rd(side.toLowerCase()+'_'+sfx) 접미사 → spec 키 매핑 (champ→champion 등)
const BC_KEY={champ:'champion', axe:'greataxe', spear:'spear', pike:'pike', dagger:'dagger', archer:'archer', slinger:'slinger', militia:'militia'};

// ═══════════ 헬퍼 (전투실험실 복사) ═══════════
// ★ dist2/gkey/frontal 은 상태 무참조 순수 함수 → 전역 유지(ctx 불필요, 바이트 동일).
//   _grid·_cen 은 ctx 소속(동시 구동 시 격리). buildGrid/nearestEnemy/screened/frontBlocked/hurt 는 ctx 인자화.
function dist2(a,b){const dx=a.x-b.x,dy=a.y-b.y;return dx*dx+dy*dy;}
const BK=2.5;
const SEP_CORE=0.5;   // ★[몸=단단한 하한 0.5m — 고증(성인 어깨폭)] 랩 정본 NPC_BODY와 수동 동기(battle-core는 독립 파일). 1.0m는 몸이 아니라 전투 간격(행동) — 압착 시 몸까지 압축, 그 밑은 불가
function gkey(x,y){return ((Math.floor(x/BK)+256)*8192)+(Math.floor(y/BK)+256);}
function buildGrid(ctx){ctx._grid.clear(); let ax=0,ay=0,an=0,bxx=0,byy=0,bn=0,aM=1e9,bM=1e9;
  for(const u of ctx.units){if(u.hp<=0)continue; const k=gkey(u.x,u.y); const c=ctx._grid.get(k); if(c)c.push(u); else ctx._grid.set(k,[u]);
    const mn=(u.type==='spear'||u.type==='pike'||u.type==='greataxe'||u.type==='champion');
    if(u.side==='A'){ax+=u.x;ay+=u.y;an++; if(mn&&UNITS[u.type].spd<aM)aM=UNITS[u.type].spd;}else{bxx+=u.x;byy+=u.y;bn++; if(mn&&UNITS[u.type].spd<bM)bM=UNITS[u.type].spd;}}
  ctx._cen.A.x=an?ax/an:0;ctx._cen.A.y=an?ay/an:0;ctx._cen.A.n=an;ctx._cen.A.march=aM<1e9?aM:2.2; ctx._cen.B.x=bn?bxx/bn:0;ctx._cen.B.y=bn?byy/bn:0;ctx._cen.B.n=bn;ctx._cen.B.march=bM<1e9?bM:2.2;}
function nearestEnemy(ctx,u,maxR,los){const bx=Math.floor(u.x/BK),by=Math.floor(u.y/BK); let best=null,bd=1e18;
  for(let r=0;r<=(maxR||80);r++){
    for(let ix=bx-r;ix<=bx+r;ix++)for(let iy=by-r;iy<=by+r;iy++){
      if(r>0&&ix>bx-r&&ix<bx+r&&iy>by-r&&iy<by+r)continue;
      const c=ctx._grid.get(((ix+256)*8192)+(iy+256)); if(!c)continue;
      for(const e of c){if(e.side===u.side||e.hp<=0)continue; const dx=u.x-e.x,dy=u.y-e.y,d=dx*dx+dy*dy; if(d<bd&&!(los&&ctx.trees.length&&treeBlocks(ctx,u.x,u.y,e.x,e.y))){bd=d;best=e;}}}
    if(best){const rm=r*BK; if(bd<=rm*rm)break;}
  }
  return best?{e:best,d:Math.sqrt(bd)}:null;}
function frontal(target,fromX,fromY){
  const aTo=Math.atan2(fromY-target.y,fromX-target.x); let da=aTo-target.face;
  while(da>Math.PI)da-=6.283; while(da<-Math.PI)da+=6.283; return Math.abs(da)<(target.form==='wall'?2.0:1.22);}
function screened(ctx,u,tx,ty){
  const dx=tx-u.x,dy=ty-u.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
  const pts=[[u.x,u.y],[u.x+ux*4,u.y+uy*4]];
  for(const p of pts){const bx=Math.floor(p[0]/BK),by=Math.floor(p[1]/BK);
    for(let ix=bx-1;ix<=bx+1;ix++)for(let iy=by-1;iy<=by+1;iy++){const c=ctx._grid.get(((ix+256)*8192)+(iy+256));if(!c)continue;
      for(const o of c){if(o===u||o.side!==u.side||o.hp<=0)continue; const ox=o.x-u.x,oy=o.y-u.y,t=ox*ux+oy*uy;
        if(t<0.6||t>Math.min(d,7))continue; if(Math.abs(ox*uy-oy*ux)<0.85)return true;}}}
  return false;}
function frontBlocked(ctx,u,e){const bx=Math.floor(e.x/BK),by=Math.floor(e.y/BK);
  for(let ix=bx-1;ix<=bx+1;ix++)for(let iy=by-1;iy<=by+1;iy++){const c=ctx._grid.get(((ix+256)*8192)+(iy+256));if(!c)continue;
    for(const o of c){if(o===u||o.side!==u.side||o.hp<=0)continue; const dx=o.x-e.x,dy=o.y-e.y; if(dx*dx+dy*dy<2.3*2.3&&frontal(e,o.x,o.y))return true;}}
  return false;}
function hurt(ctx,target,dmg,fromX,fromY,kind,shBrk){
  const D=UNITS[target.type];
  dmg*=(0.75+ctx.rng()*0.5);
  const front=target.form==='circle'?true:frontal(target,fromX,fromY);
  if(!front && kind!=='arrow'){ const col=target.form==='column'; dmg*=col?1.75:1.4; target.mrl=Math.max(0,(target.mrl||1)-(col?0.11:0.07)); }
  if(D.shield>0 && (target.shp||0)>0 && front){
    const wall=target.form==='wall';
    const wArc=wall||target.form==='circle';
    if(kind==='arrow'){ target.shp-=wArc?0.15:0.5;
      if(ctx.rng()<(wArc?0.99:0.95))dmg=0; else dmg*=0.5;
    } else { dmg*=(1-D.shield)*(wall?0.88:1); target.shp-=(shBrk||8); }
    if(target.shp<0)target.shp=0;
  }
  target.hp-=dmg;
  if(target.hp<=0 && !target._dead){target._dead=1; ctx.corpses.push({x:target.x,y:target.y,side:target.side,rot:1}); ctx.sides[target.side].dead++;
    const bx=Math.floor(target.x/BK),by=Math.floor(target.y/BK);
    for(let ix=bx-1;ix<=bx+1;ix++)for(let iy=by-1;iy<=by+1;iy++){const c=ctx._grid.get(((ix+256)*8192)+(iy+256));if(!c)continue;for(const o of c){if(o.side===target.side&&o.hp>0)o.mrl=Math.max(0,(o.mrl||1)-SUP_DEATH);}}
  }
}

// ═══════════ 시뮬 (전투실험실 stepBattle 복사) ═══════════
function stepBattle(ctx,dt){
  ctx.tick+=dt;
  buildGrid(ctx);
  updateMorale(ctx,dt);
  const order=ctx.units.slice(); for(let i=order.length-1;i>0;i--){const j=(ctx.rng()*(i+1))|0;const t=order[i];order[i]=order[j];order[j]=t;}
  for(const u of order){
    if(u.hp<=0)continue;
    const D=UNITS[u.type]; u.cd-=dt;
    const uAtk=u.atk!=null?u.atk:D.atk, uMAtk=u.atk!=null?(D.mAtk*(u.atk/D.atk)):D.mAtk;   // ★품질 배수: u.atk 설정 시 근접·백병에 반영. 미설정(전투실험실)이면 D.atk/D.mAtk 그대로.
    // ── 지휘 모드: 지휘관 WASD 직접 조작 ──
    if(ctx.playerMode && u.cmd){ let mx=0,my=0; if(ctx.keys.w)my-=1; if(ctx.keys.s)my+=1; if(ctx.keys.a)mx-=1; if(ctx.keys.d)mx+=1;
      const m=Math.hypot(mx,my);
      if(m>0){mx/=m;my/=m; u.x+=mx*D.spd*dt; u.y+=my*D.spd*dt; u.face=Math.atan2(my,mx); ctx.cmdHeading=u.face;}
      const ce=(nearestEnemy(ctx,u,Math.ceil((D.ranged>0?D.ranged+2:13)/BK)+1,true)||{}).e;
      if(ce){const cd=Math.sqrt(dist2(u,ce)); if(m===0)u.face=Math.atan2(ce.y-u.y,ce.x-u.x);
        if(D.ranged>0){ if(cd<=D.ranged&&u.cd<=0){const los=ctx.trees.length?!treeBlocks(ctx,u.x,u.y,ce.x,ce.y):true; if(los){u.st='shoot';u.cd=D.cd;shoot(ctx,u,ce);}} }
        else if(cd<=D.reach&&u.cd<=0){u.cd=D.cd;u.st='melee';hurt(ctx,ce,uAtk,u.x,u.y,'melee',D.shBrk);} }
      sep(ctx,u,dt); continue; }
    // ── 궤주(개별) ──
    if(u.routing){u.st='rout'; const gx=u.side==='A'?-40:WORLD_W+40; const dx=gx-u.x,dy=0, dd=Math.hypot(dx,dy)||1; u.face=Math.atan2(dy,dx);
      u.x+=dx/dd*D.spd*1.25*dt; sep(ctx,u,dt); continue;}
    const engR=D.ranged>0?D.ranged+2:13;
    const mf=u.mrl>=0.5?1:Math.max(0.35,(u.mrl-0.15)/0.35);
    const fSpd=FORM_SPD[u.form]||1;
    const isMain=(u.type==='spear'||u.type==='pike'||u.type==='greataxe'||u.type==='champion');
    const mSpd=isMain?ctx._cen[u.side].march:D.spd;
    u._detCd=(u._detCd||0)-dt;
    const tgtOk = u.tgt && u.tgt.hp>0 && dist2(u,u.tgt)<25*25 && !(ctx.trees.length&&treeBlocks(ctx,u.x,u.y,u.tgt.x,u.tgt.y));
    let e;
    if(tgtOk && u._detCd>0) e=u.tgt;
    else { u._detCd=0.35+ctx.rng()*0.12; e=(nearestEnemy(ctx,u,Math.ceil(engR/BK)+1,true)||{}).e; }
    if(!e){
      if(ctx.playerMode && u.side==='A' && ctx.commander && ctx.commander.hp>0){
        const cs=Math.cos(ctx.cmdHeading),sn=Math.sin(ctx.cmdHeading);
        const tx=ctx.commander.x + u.slx*cs - u.sly*sn, ty=ctx.commander.y + u.slx*sn + u.sly*cs;
        const dx=tx-u.x,dy=ty-u.y,dd=Math.hypot(dx,dy);
        if(dd>0.25){const st=Math.min(D.spd*dt,dd); u.x+=dx/dd*st; u.y+=dy/dd*st;} u.face=ctx.cmdHeading; sep(ctx,u,dt); continue;
      }
      u.st='adv'; const c=ctx._cen[u.side==='A'?'B':'A'];
      if(c.n){const s=c.x>u.x?1:-1; u.face=s>0?0:Math.PI; u.x+=s*mSpd*fSpd*dt; sep(ctx,u,dt);} continue; }
    u.tgt=e; const d=Math.sqrt(dist2(u,e));
    if(u.form==='wall'){const c=ctx._cen[u.side==='A'?'B':'A']; u.face=c.n?Math.atan2(c.y-u.y,c.x-u.x):Math.atan2(e.y-u.y,e.x-u.x);}
    else u.face=Math.atan2(e.y-u.y,e.x-u.x);
    // ── 궁수·투석병(원거리) ──
    if(D.ranged>0){
      const ak=D.ammo||'arrows';   // 탄약 재고 키: 궁수=arrows, 투석병=stones
      const ammo=ctx.sides[u.side][ak]>0;
      if(d<3.5){
        u.st='melee'; const bd=Math.hypot(e.x-u.x,e.y-u.y)||1;
        u.x+=(u.x-e.x)/bd*D.spd*0.5*fSpd*dt; u.y+=(u.y-e.y)/bd*D.spd*0.5*fSpd*dt;
        if(d<D.reach && u.cd<=0){u.cd=D.cd; if(ctx.rng()<mf)hurt(ctx,e,uMAtk,u.x,u.y,'melee',D.shBrk);} sep(ctx,u,dt); continue;
      }
      if(ammo){
        if(d<=D.ranged){
          if(u.cd<=0){ const los=ctx.trees.length?!treeBlocks(ctx,u.x,u.y,e.x,e.y):true;
            if(los){u.st='shoot'; u.cd=D.cd; if(ctx.rng()<mf){shoot(ctx,u,e); ctx.sides[u.side][ak]--;}} else {u.st='block'; u.cd=1;} }
        } else { u.st='adv'; const dd=d||1,ms=D.spd*(0.55+0.45*mf)*fSpd; u.x+=(e.x-u.x)/dd*ms*dt; u.y+=(e.y-u.y)/dd*ms*dt; }
      } else {
        if(d<15){ u.st='melee'; const dd=d||1,ms=(D.chg||D.spd)*(0.55+0.45*mf)*fSpd; if(d>D.reach){u.x+=(e.x-u.x)/dd*ms*dt; u.y+=(e.y-u.y)/dd*ms*dt;} else if(u.cd<=0){u.cd=D.cd; if(ctx.rng()<mf)hurt(ctx,e,uMAtk,u.x,u.y,'melee',D.shBrk);} }
        else { u.st='adv'; const gx=u.side==='A'?-40:WORLD_W+40,dd=Math.abs(gx-u.x)||1; u.x+=(gx-u.x)/dd*D.spd*fSpd*dt; }
      }
      sep(ctx,u,dt); continue;
    }
    // ── 근접 ──
    if(d>D.reach){ u.st='adv'; let gx=e.x,gy=e.y;
      if(u.form!=='wall'&&u.form!=='circle'&&UNITS[e.type].ranged===0&&e.form!=='wall'&&e.form!=='circle'&&frontBlocked(ctx,u,e)){
        const efx=Math.cos(e.face),efy=Math.sin(e.face),rx=u.x-e.x,ry=u.y-e.y,sd=(rx*(-efy)+ry*efx)>0?1:-1;
        gx=e.x+(-efy*sd)*2.4-efx*0.9; gy=e.y+(efx*sd)*2.4-efy*0.9;
      }
      const asp=(D.chg||D.spd)*((u.type==='greataxe'&&(UNITS[e.type].shield>0||e.form==='wall'))?1.25:1);
      const dd=Math.hypot(gx-u.x,gy-u.y)||1,ms=asp*(0.55+0.45*mf)*fSpd; u.x+=(gx-u.x)/dd*ms*dt; u.y+=(gy-u.y)/dd*ms*dt; }
    else { u.st='melee'; if(u.cd<=0){u.cd=D.cd; const amb=(concealed(ctx,u)&&!concealed(ctx,e))?1.5:1; const atk=u.broken?uMAtk*0.5:uAtk*amb; if(ctx.rng()<mf)hurt(ctx,e,atk,u.x,u.y,'melee',u.broken?4:D.shBrk); if(!u.broken&&ctx.rng()<(BREAK_P[u.type]||0))u.broken=true;}
      if(D.standoff){const eR=UNITS[e.type].reach; if(eR<D.reach-0.3 && d<eR+0.5){const dd=d||1,sb=(D.chg||D.spd)*0.85; u.x-=(e.x-u.x)/dd*sb*fSpd*dt; u.y-=(e.y-u.y)/dd*sb*fSpd*dt;}}
    }
    sep(ctx,u,dt);
  }
  // ── 화살 ──
  for(let i=ctx.arrows.length-1;i>=0;i--){const ar=ctx.arrows[i]; ar.px=ar.x; ar.py=ar.y; const mx=ar.vx*dt,my=ar.vy*dt; ar.x+=mx; ar.y+=my; ar.trav+=Math.hypot(mx,my); let done=false;
    if((ctx.trees.length||ctx.buildings.length)&&treeBlocks(ctx,ar.px,ar.py,ar.x,ar.y))done=true;
    if(!done){const dx=ar.x-ar.px,dy=ar.y-ar.py,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L; const bx=Math.floor(ar.x/BK),by=Math.floor(ar.y/BK); let hu=null,hd=1e9;
      for(let ix=bx-1;ix<=bx+1;ix++)for(let iy=by-1;iy<=by+1;iy++){const c=ctx._grid.get(((ix+256)*8192)+(iy+256));if(!c)continue;
        for(const o of c){if(o.hp<=0||o===ar.sh)continue; const ox=o.x-ar.px,oy=o.y-ar.py,t=ox*ux+oy*uy; if(t<-0.25||t>L+0.35)continue; const perp=Math.abs(ox*uy-oy*ux); const rr=UNITS[o.type].r+0.22; if(perp<rr&&t<hd&&(o.side!==ar.side||ar.trav>6.0)){hd=t;hu=o;}}}
      if(hu){ if(hu.side!==ar.side){ hurt(ctx,hu,ar.dmg,hu.x,hu.y,'arrow',0);
          const hbx=Math.floor(hu.x/BK),hby=Math.floor(hu.y/BK);
          for(let ix=hbx-1;ix<=hbx+1;ix++)for(let iy=hby-1;iy<=hby+1;iy++){const c=ctx._grid.get(((ix+256)*8192)+(iy+256));if(!c)continue;for(const en of c){if(en.side!==ar.side&&en.hp>0){const ex=en.x-hu.x,ey=en.y-hu.y;if(ex*ex+ey*ey<SUP_R*SUP_R)en.mrl=Math.max(0,(en.mrl||1)-SUP_ARROW);}}}
        } done=true; }
    }
    if(done||ar.trav>=ar.range)ctx.arrows.splice(i,1);
  }
  // ── 종료 판정 ──
  const la=ctx.units.filter(u=>u.side==='A'&&u.hp>0).length, lb=ctx.units.filter(u=>u.side==='B'&&u.hp>0).length;
  const fa=ctx.units.filter(u=>u.side==='A'&&u.hp>0&&!u.routing).length, fb=ctx.units.filter(u=>u.side==='B'&&u.hp>0&&!u.routing).length;
  if(!ctx.result){
    if(fa===0&&fb>0)ctx.result={win:'B'};
    else if(fb===0&&fa>0)ctx.result={win:'A'};
    else if(fa===0&&fb===0)ctx.result={win:la>lb?'A':lb>la?'B':'무'};
    else if(ctx.tick>120)ctx.result={win:la>lb?'A':lb>la?'B':'무'};
  }
  // 시체 페이드
  for(const c of ctx.corpses)c.rot=Math.max(0,c.rot-dt*0.03);
}
function shoot(ctx,u,e){const D=UNITS[u.type]; const dist=Math.hypot(e.x-u.x,e.y-u.y);
  const ft=dist/D.arrowV; const lx=e.x+(e._vx||0)*ft, ly=e.y+(e._vy||0)*ft;
  const scatter=(0.015+dist*0.0022)*(D.spread||1);   // 투석병 spread>1=명중 낮음(궁수는 spread 없음→동일)
  const ang=Math.atan2(ly-u.y,lx-u.x)+(ctx.rng()-0.5)*2*scatter;
  const aDmg=u.atk!=null?u.atk:D.atk;   // ★궁수 품질: u.atk 설정 시 화살 피해 반영, 미설정이면 D.atk(전투실험실 동일)
  ctx.arrows.push({x:u.x,y:u.y,px:u.x,py:u.y,vx:Math.cos(ang)*D.arrowV,vy:Math.sin(ang)*D.arrowV,dmg:aDmg,side:u.side,range:D.ranged*1.5,trav:0,sh:u});}
function sep(ctx,u,dt){let sx=0,sy=0,n=0,hxx=0,hyy=0,hn=0; const bx=Math.floor(u.x/BK),by=Math.floor(u.y/BK);
  for(let ix=bx-1;ix<=bx+1;ix++)for(let iy=by-1;iy<=by+1;iy++){const c=ctx._grid.get(((ix+256)*8192)+(iy+256)); if(!c)continue;
    for(const o of c){if(o===u||o.hp<=0)continue; const dx=u.x-o.x,dy=u.y-o.y,d2=dx*dx+dy*dy; if(d2<1.0*1.0&&d2>1e-4){const d=Math.sqrt(d2);sx+=dx/d;sy+=dy/d;n++;
      if(d<SEP_CORE){hxx+=dx/d*(SEP_CORE-d)*0.5;hyy+=dy/d*(SEP_CORE-d)*0.5;hn++;}}}}   // ★[몸 하한] 지름 0.5m 침범 위치보정 누적(1.0m 소프트 간격과 별개 층)
  if(n){u.x+=sx/n*1.0*dt; u.y+=sy/n*1.0*dt;}
  if(hn){const hl=Math.hypot(hxx,hyy); if(hl>1e-9){const hk=Math.min(1,Math.max(1.0*dt,0.08)/hl); u.x+=hxx*hk; u.y+=hyy*hk;}}   // 몸 겹침 해소 — dt 무관 최소 0.08m/스텝(압착에도 관통 불가), 나무·건물 클램프가 뒤에서 지형 보정
  if(ctx.trees.length)for(const t of ctx.trees){const dx=u.x-t.x,dy=u.y-t.y,d2=dx*dx+dy*dy,rr=t.r+0.5; if(d2<rr*rr&&d2>1e-4){const d=Math.sqrt(d2);u.x=t.x+dx/d*rr;u.y=t.y+dy/d*rr;}}
  if(ctx.buildings.length)for(const b of ctx.buildings){const dx=u.x-b.x,dy=u.y-b.y,hx=b.w/2+0.45,hy=b.h/2+0.45; if(Math.abs(dx)<hx&&Math.abs(dy)<hy){const ox=hx-Math.abs(dx),oy=hy-Math.abs(dy);
    const gx=(u.tgt&&u.tgt.hp>0)?u.tgt.x:u.x, gy=(u.tgt&&u.tgt.hp>0)?u.tgt.y:u.y;
    if(ox<oy){u.x=b.x+(dx<0?-hx:hx); u.y+=Math.sign(gy-u.y||1)*Math.min(2.6*dt,hy+0.2);}
    else {u.y=b.y+(dy<0?-hy:hy); u.x+=Math.sign(gx-u.x||1)*Math.min(2.6*dt,hx+0.2);}}}}
function updateMorale(ctx,dt){
  for(const u of ctx.units)u._rPrev=u.routing;
  const relA=ctx.sides.A.start?ctx.sides.A.dead/ctx.sides.A.start:0, relB=ctx.sides.B.start?ctx.sides.B.dead/ctx.sides.B.start:0;
  const ord=ctx.units.slice(); for(let i=ord.length-1;i>0;i--){const j=(ctx.rng()*(i+1))|0;const t=ord[i];ord[i]=ord[j];ord[j]=t;}
  for(const u of ord){if(u.hp<=0)continue;
    const bx=Math.floor(u.x/BK),by=Math.floor(u.y/BK); let fN=0,eN=0,rN=0,champ=0,dMin2=1e9;
    for(let ix=bx-1;ix<=bx+1;ix++)for(let iy=by-1;iy<=by+1;iy++){const c=ctx._grid.get(((ix+256)*8192)+(iy+256));if(!c)continue;
      for(const o of c){if(o===u||o.hp<=0)continue; if(o.side===u.side){fN++; if(o._rPrev)rN++; if(o.type==='champion')champ=1;} else {eN++; const dx=u.x-o.x,dy=u.y-o.y,dd=dx*dx+dy*dy; if(dd<dMin2)dMin2=dd;}}}
    const myRel=u.side==='A'?relA:relB, enRel=u.side==='A'?relB:relA;
    const commit=u.st==='melee'?1:(dMin2<COMMIT_D*COMMIT_D?1-Math.sqrt(dMin2)/COMMIT_D:0);
    const wound=1-u.hp/u.maxHp;
    let tgt=(MRL0[u.type]||0.8)+M_KODDS*(fN-eN)/(fN+eN+1)-M_KCONTAG*rN+M_KCHAMP*champ+M_KRELCAS*(enRel-myRel)-M_KABS*myRel
      +M_KCOMMIT*commit-M_KWOUND*wound*(1-commit)+M_KDESP*wound*commit
      +(u.form==='wall'?0.30:u.form==='circle'?0.15:u.form==='open'?-0.08:0) - (u.broken?0.18:0);
    if(tgt<0)tgt=0;else if(tgt>1)tgt=1;
    u.mrl+=(tgt-u.mrl)*Math.min(1,M_RATE*dt);
    if(u.mrl<0)u.mrl=0;else if(u.mrl>1)u.mrl=1;
    if(!u.routing){ if(u.mrl<M_BREAK && ctx.rng()<(M_BREAK-u.mrl)*M_BREAKRATE*dt)u.routing=true; }
    else if(u.mrl>M_RALLY && eN===0)u.routing=false;
  }
}
// ★유닛 속도 추적(궁수 리드사격용) — 전투실험실 루프의 trackVel
function trackVel(ctx,dt){for(const u of ctx.units){if(u.hp<=0)continue;u._vx=((u.x-(u._px||u.x))/dt)||0;u._vy=((u.y-(u._py||u.y))/dt)||0;u._px=u.x;u._py=u.y;}}

// ═══════════ 인스턴스 편의 핸들 ═══════════
// _makeHandle(ctx) = 인스턴스 편의객체. step(dt)=trackVel+stepBattle 한 틱. getter/setter는 ctx에 위임.
function _makeHandle(ctx){
  return {
    ctx,
    step(dt){ trackVel(ctx,dt); stepBattle(ctx,dt); },
    // getter
    get units(){return ctx.units;}, get arrows(){return ctx.arrows;}, get corpses(){return ctx.corpses;},
    get sides(){return ctx.sides;}, get trees(){return ctx.trees;}, get buildings(){return ctx.buildings;},
    get result(){return ctx.result;}, get tick(){return ctx.tick;},
    get commander(){return ctx.commander;}, get cmdHeading(){return ctx.cmdHeading;},
    get terrain(){return ctx.terrain;}, get playerMode(){return ctx.playerMode;}, get keys(){return ctx.keys;},
    // setter(ctx에)
    setKeys(k){ctx.keys=k||{};}, setCmdHeading(h){ctx.cmdHeading=h;}, setPlayerMode(v){ctx.playerMode=!!v;},
    // ★[제3자 참전 삽입 구조 — 사용자 지시 "중립 난입·원군을 언제든지 꽂을 수 있게"] addUnits(side, list, quality?):
    //   진행 중 전투에 유닛 증원. list=[{type,x,y,face?,agent?,cmd?}] 로컬좌표(0~130). 반환=투입 수.
    //   start·화살/돌 보급·챔프 플래그 동기(사상비·궤주 분모 정합). 결판 후(result)면 0. additive —
    //   이 API를 안 부르는 기존 전투는 비트 동일(골든마스터 무영향). '적대 인식'은 측 선택으로 표현:
    //   중립이 A를 공격하면 B측으로 투입(그 역도 동일) — 3진영 FFA는 battle-core 구조 확장(별도 설계).
    addUnits(side, list, quality){
      if((side!=='A'&&side!=='B')||!Array.isArray(list)||!list.length||ctx.result)return 0;
      const CL=v=>v<0.5?0.5:(v>WORLD_W-0.5?WORLD_W-0.5:v);
      const form=(ctx.sides[side]&&ctx.sides[side].form)||'line';
      let n=0;
      for(const it of list){ if(!it||!UNITS[it.type])continue;
        spawn(ctx,side,it.type,CL(+it.x),CL(+it.y),form,quality||null);
        const u=ctx.units[ctx.units.length-1];
        if(it.face!=null)u.face=+it.face;
        if(it.agent)u.agent=it.agent;
        if(it.cmd)u.cmd=true;
        ctx.sides[side].start++;
        if(it.type==='archer')ctx.sides[side].arrows=(ctx.sides[side].arrows||0)+ARROWS_PER;
        if(it.type==='slinger')ctx.sides[side].stones=(ctx.sides[side].stones||0)+STONES_PER;
        if(it.type==='champion')ctx.sides[side].hadChamp=true;
        n++;
      }
      return n;
    },
  };
}
// createBattle(spec,opts) — 독립 인스턴스 생성. opts.rng/origin/heading 적용 → buildArmies → 핸들.
//   ★ 맵 위 여러 전투 동시 구동의 토대: 각 호출이 독립 ctx(units/grid/cen/rng 전부 격리).
function createBattle(spec,opts){
  opts=opts||{};
  const ctx=createContext();
  if(opts.rng) ctx.rng=opts.rng;
  if(opts.origin){ ctx.origin.cx=opts.origin.cx||0; ctx.origin.cy=opts.origin.cy||0; }
  if(opts.heading!=null) ctx.heading=opts.heading;
  buildArmies(ctx,spec);
  return _makeHandle(ctx);
}

// ═══════════ 노출 (economy-engine이 window.EconEngine 노출하는 것과 동형) ═══════════
// ★ 전역 싱글톤 경로 = 단일 _defaultCtx 위임(전투실험실·기존 전쟁실험실 100% 보존).
//   기존 전역 API(buildArmies/stepBattle/…) 시그니처는 불변(ctx 없이) — 내부에서 _defaultCtx 주입.
//   인스턴스 경로는 createBattle/_makeHandle 또는 _-접두 raw(ctx 인자) 함수를 씀.
const _defaultCtx=createContext();
// ★ 전역 경로는 '살아있는' Math.random 을 매 호출 참조해야 함(전투실험실·전쟁실험실 하네스가
//   Math.random 을 재바인딩[시드 주입]하며, 레거시는 매 draw마다 Math.random() 직접 호출).
//   createContext의 rng:Math.random 은 생성 시점 참조를 캡처 → 재바인딩을 못 따라감(골든마스터 시드-오프셋 불일치).
//   _defaultCtx만 live indirection 으로 교체(인스턴스 ctx는 opts.rng 명시 캡처 유지 = 격리).
_defaultCtx.rng=()=>Math.random();
const BattleCore={
  // 상수
  UNITS, ARROWS_PER, STONES_PER, BREAK_P, MRL0, SIDE_COL, BK,
  M_BREAK, M_RALLY, M_RATE, M_KODDS, M_KCONTAG, M_KCHAMP, M_KRELCAS, M_KABS,
  M_KCOMMIT, M_KWOUND, M_KDESP, COMMIT_D, M_BREAKRATE,
  SUP_ARROW, SUP_DEATH, SUP_R, FORM_SPD, FORM_KO, WORLD_W, WORLD_H,
  // ── 다중 인스턴스 API ──
  createContext, createBattle,
  get _defaultCtx(){return _defaultCtx;},
  // raw(ctx 인자) 함수 — 인스턴스 직접 구동/디버깅용
  _buildArmies:buildArmies, _stepBattle:stepBattle, _trackVel:trackVel, _updateMorale:updateMorale,
  _hurt:hurt, _shoot:shoot, _buildGrid:buildGrid, _nearestEnemy:nearestEnemy, _sep:sep,
  _spawn:spawn, _genForest:genForest, _concealed:concealed, _treeBlocks:treeBlocks,
  _screened:screened, _frontBlocked:frontBlocked, _makeHandle,
  // ── 전역 API: 단일 _defaultCtx 위임(시그니처 불변) ──
  // 지형
  genForest(mode){return genForest(_defaultCtx,mode);},
  concealed(u){return concealed(_defaultCtx,u);},
  treeBlocks(x1,y1,x2,y2){return treeBlocks(_defaultCtx,x1,y1,x2,y2);},
  // 시뮬
  spawn(side,type,x,y,form,quality){return spawn(_defaultCtx,side,type,x,y,form,quality);},
  stepBattle(dt){return stepBattle(_defaultCtx,dt);},
  updateMorale(dt){return updateMorale(_defaultCtx,dt);},
  hurt(target,dmg,fromX,fromY,kind,shBrk){return hurt(_defaultCtx,target,dmg,fromX,fromY,kind,shBrk);},
  shoot(u,e){return shoot(_defaultCtx,u,e);},
  buildGrid(){return buildGrid(_defaultCtx);},
  nearestEnemy(u,maxR,los){return nearestEnemy(_defaultCtx,u,maxR,los);},
  frontal, dist2, gkey,   // 상태 무참조 순수 함수(ctx 불필요)
  screened(u,tx,ty){return screened(_defaultCtx,u,tx,ty);},
  frontBlocked(u,e){return frontBlocked(_defaultCtx,u,e);},
  trackVel(dt){return trackVel(_defaultCtx,dt);},
  sep(u,dt){return sep(_defaultCtx,u,dt);},
  // 핵심 인터페이스
  buildArmies(spec){return buildArmies(_defaultCtx,spec);},
  // 상태 컨테이너 접근 (_defaultCtx 위임)
  get units(){return _defaultCtx.units;}, get arrows(){return _defaultCtx.arrows;}, get corpses(){return _defaultCtx.corpses;},
  get sides(){return _defaultCtx.sides;}, get trees(){return _defaultCtx.trees;}, get buildings(){return _defaultCtx.buildings;},
  get _grid(){return _defaultCtx._grid;}, get _cen(){return _defaultCtx._cen;}, get tick(){return _defaultCtx.tick;},
  get result(){return _defaultCtx.result;}, get commander(){return _defaultCtx.commander;}, get cmdHeading(){return _defaultCtx.cmdHeading;},
  get keys(){return _defaultCtx.keys;}, get playerMode(){return _defaultCtx.playerMode;}, get terrain(){return _defaultCtx.terrain;},
  // 지휘 입력(전쟁실험실이 씀) — _defaultCtx에
  setKeys(k){_defaultCtx.keys=k||{};}, setPlayerMode(v){_defaultCtx.playerMode=!!v;}, setCmdHeading(h){_defaultCtx.cmdHeading=h;},
};
root.BattleCore=BattleCore;
if(typeof module!=='undefined'&&module.exports)module.exports=BattleCore;

})(typeof window!=='undefined'?window:globalThis);
