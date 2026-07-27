// =============================================================================
// server/wildlife.js — §4-4 마지막 조각: 마을실험실 '동물 AI 블록' 이식 (캐논 §4-4 "환산 계수 1, 그대로 복사")
//
// 구조(3부):
//   [A] 어댑터 심볼 — 블록이 참조하는 랩 전역(상수·TR·inG/idx/N·lifeGM·setPath)을 본체 등가물로 정의.
//       랩 상수 값은 마을실험실.html 원본과 동일(주석의 랩 라인 참조). 여기 값을 바꾸면 블록 거동이 랩과 갈라짐.
//   [B] 원본 블록 — 마을실험실.html의 '// ═══ 야생 몹 생태계' ~ 'const L_CLEAR=' 직전을 rebuild-huntlab.py와
//       동일한 앵커로 텍스트 추출해 그대로 삽입(무수정 — 원본 갱신 시 sim/rebuild-huntlab.py처럼 재추출).
//   [C] 본체 브리지 — zone.js와의 접합: 활성 청크 bbox=뷰(LOD), players/NPC→agents 프록시, 랩몹↔본체 mobs
//       (shadow) 동기, 피해 양방향(hurtNPC→damagePlayer / tryAttack·화살→onMobHit), 사망→spawnCorpse.
//
// ★시간 스케일(캐논 §1): 랩 1유닛 = 시계 1분 = 실전 1초. 본체 30Hz → updateMobs(s, 1/30)/틱 = 1유닛/초.
//   물리 상수(m/유닛)가 그대로 m/초가 됨 = 환산 계수 1. 예: 사슴 질주 spd5×2.6=13m/s=416px/s.
//   좌표: 랩 1셀=1m ↔ 본체 32px=1셀. 랩(셀) ↔ 본체(px) 변환은 ×32 한 곳(shadow 동기)뿐.
//
// ENABLE_WILDLIFE=0 → init/tick/onMobHit 전부 no-op (ENABLE_VILLAGES 패턴). 기본 켜짐.
// 1차 범위 밖(인계): NPC 사냥꾼의 실제 사냥(블록 내 job==='hunter'&&state==='work' 경로는 잠재 — 프록시가
//   state 'idle'이라 미발동), 핏자국(s._blood) 렌더, 🐗 밭 습격(s.crop 빈 Map — 본체 farmland 연결 시 활성),
//   도축·econ 연결(사냥 산출은 econ 추상이 담당), 도적 접점.
// =============================================================================
'use strict';

// ═══ [A] 어댑터 — 랩 전역 심볼 (값은 마을실험실.html 원본과 동일) ═══
const L_WALK = 2, L_MINDAY = 1440;                    // 랩 4254: 걷기 2m/유닛 · 하루 1440분
const L_DAWN = 0.25, L_DUSK = 0.833;                  // 랩 4256: 낮 06~20시 (f 0~1)
const NPC_MAXHP = 100, NPC_REST_IN = 60, NPC_DMG_BOAR = 30, NPC_DMG_WOLF = 25, NPC_DMG_TIGER = 65, NPC_MELEE_HP = 75; // 랩 4255 — 본체 PLAYER_MAX_HP=100과 1:1 스케일
const L_GAMEMAX = 100;                                // 랩 4358: 셀 서식한계 K (스폰 target 분모)
const L_QMIN = 0.25;                                  // 랩 4248: 작물 품질 하한 (🐗 습격 — 1차는 s.crop 빈 Map이라 미도달)
const setPath = () => {};                             // 랩 NPC 귀가 경로 — 본체 프록시엔 무의미(피해 반영은 [C]의 damagePlayer 브리지가 담당)
let lifeGM = 0;                                       // 게임분 — tick()이 본체 월드시계(worldPhase)에서 환산 주입(밤 경계 정렬 피스와이즈)
let NX = 0, NY = 0, N = 0;                            // 존 셀 그리드(px/32). N=max(NX,NY) — 블록은 도주 목표점 클램프에만 사용
const inG = (x, y) => x >= 0 && y >= 0 && x < NX && y < NY;
const idx = (x, y) => y * NX + x;
// TR: 지형 인터페이스 — 블록 사용면: TR.terrain.isBlocked(셀) / TR.rock[idx] / TR.forest[idx].
//   본체 terrain(물+바위 isTerrainBlockedLocal, 바위 isRockCellLocal, 숲 getForestMultiplier>1.5)을
//   셀 단위 Uint8Array(0/1) 격자로 노출 — 활성 청크 스캔이 eager 채움(플레인 인덱싱 = LoS 샘플링 고속).
const TR = { rock: null, forest: null, terrain: { isBlocked: () => true } };

// ═══ [B] 원본 블록 — 마을실험실.html '// ═══ 야생 몹 생태계' ~ 'const L_CLEAR=' 직전 (텍스트 추출, 무수정) ═══
// ═══ 야생 몹 생태계(in-view 엔티티, LOD) — gameRich 밀도서 spawn. ★필드가 진실: 실제 gameRich 고갈은 lifeDayAll(L_HUNT)만(사냥꾼·늑대 포식은 연출 — 이중집계 X). 뷰 밖=몹 없음(필드만). ═══
// 설계(싸고 똑똑하게): ①종 스탯+성격(MOB_DEF; brave=호전성, 개체별 tmp 편차) ②무리=스폰 gid 단위 집계 O(n)(동종 전수 스캔 O(n²) 대체)+먹이 웨이포인트 순회(무리가 함께 '이동')
//   ③위협 통합 인지(NPC·포식자 — 나중에 플레이어는 act 배열에 push만 하면 전 종이 반응) ④패닉 전파(무리원 도주→떼 스탬피드) ⑤도주=숲 엄폐각 선택+부상·탈진 감속(추격사냥 성립)
//   ⑥포식: 늑대 팩(굶주림 주기→잠행→요격 추격→사체 공유·평소 빈둥) + 🐯희귀 단독(사람 3+ 몰이만 회피) ⑦🐗밤 밭 습격(작물 품질 소폭 실피해, 야간 상한)
//   ⑧NPC 개별 hp(hurtNPC): 맹수 피해→hp<60 요양(노동 손실)·치사 가능(reapDead=진짜 인구감소) ⑨위험이 가격이 됨: 부상·사망→econ._huntRisk EMA→엔진 hunter 한계가치 할인(직업선택 기회비용) — 위험한 숲은 사냥꾼이 줄고, 호환 나면 마을이 한동안 사냥 기피
const MOB_DEF={   // hp·atk·spd(m/게임분)·flee/alert(도주·경계 반경 m)·brave(0겁쟁이~1호전)·grp(스폰 무리)·pred(0초식·1중형·2최상위)·r(표시 크기)
  // ★스케일: 1셀=1m. 반경은 실제 야생 도주거리(사슴 50~100m 등)의 ~1/4 압축 — 완전 실측이면 맵(400m)·마을~숲 거리상 전 개체 영구 도주. 종간 서열은 보존(토끼<사슴 겁, 멧돼지 최대담, 늑대 탐지≫활). 신체 접촉·분리(1~2m)는 실척 그대로.
  '🦌':{hp:3, atk:0, spd:5, flee:50, alert:110,brave:0,   grp:[3,7], pred:0, col:'#cd9b63', r:1,    slp:[0.92,0.17]},   // ★1셀=1m 실축: 도주 개시 ~50m·경계 ~110m(실측 흰꼬리사슴 경계권). 한밤(22~04시) 숲 취침
  '🐇':{hp:1, atk:0, spd:5.5, flee:8,  alert:20, brave:0,   grp:[2,4], pred:0, col:'#d8d0c0', r:0.62, slp:[0.95,0.21], zig:1},   // 실축: 은신(crypsis) 의존 — 8m까지 웅크리고 버티다 발밑에서 튐(실제 토끼)
  '🐗':{hp:6, atk:2, spd:4.2, flee:12, alert:45, brave:0.7, grp:[1,3], pred:0, col:'#5a4636', r:1.12, slp:[0.42,0.67], raid:1},  // 실축: 12m까지 버팀→돌진 반격(저돌). 야행성: 낮잠 10~16시, 밤 밭 습격
  '🐺':{hp:4, atk:2, spd:5.5,flee:25, alert:120,brave:0.5, grp:[3,5], pred:1, col:'#8a92a0', r:0.95, slp:[0.46,0.71]},          // 실축: 먹잇감 탐지 ~120m(후각), 사람은 25m서 회피. 팩 요격·사체 공유
  '🐯':{hp:14,atk:5, spd:5.5,flee:8,  alert:120,brave:1,   grp:[1,1], pred:2, col:'#d98f3a', r:1.45, slp:[0.4,0.71]}};          // 실축: 최상위 단독 야행성, 탐지 ~120m. 사람 3+ 몰이만 회피
const MOB_CAP=50, MOB_DENS=0.02, MOB_SEP_R=1.3, MOB_SEP_F=0.45, MOB_COH=0.9, MOB_ALI=0.6, MOB_WPT=0.7, MOB_TURN=0.25;   // 분리·응집·정렬·무리 웨이포인트 조향 가중치
// ★밀도 고증: 한국 산림 대형 포유류 ~10~20마리/km²(고라니·멧돼지 합산 수준) → 이 맵은 거리 4× 압축(면적 16×)이라 '보이는 재미' 보정 포함 셀당 ~0.01(숲 100칸에 1마리꼴)이 상한선.
//   DENS 0.02 = vg(서식지 풍부도 합)/100 × 0.02 → 마을 권역 ~20-30마리, 줌인 화면 5~15마리. 이전(DENS 1.2·CAP 70)은 셀당 0.35 — 압축 감안해도 ~30배 과밀이었음.
const MOB_WILD_R=250, MOB_WILD_RICH=60, MOB_AV0=100, MOB_AV1=225;   // ★서식 밴드 60~180→100~250(§3b 거리 압축 확정값)·미개척 숲 기본 풍부도·인가 회피 램프(AV0 100m 안≈0 → 225m+ 자유, 램프 비율은 구 60→160과 동일 83%) — 취락 주변 야생 공백(고증) + 사냥터는 숲 가장자리 너머
const MOB_CATCH_R=2, MOB_HUNT_R=22, MOB_SNEAK_IN=55, MOB_STILL=3, MOB_ARROW_V=50, MOB_PREY=['🦌','🦌','🦌','🐗','🐇','🐇'];   // 사냥꾼: 근접타 2m(창·방심 급소×3)+활 22m(방심 사격 창 성립). ARROW_V=화살 실속도 m/게임분(실전 60×에서 화면 50m/s — 20m 비행 0.4초, 피해는 착탄 시). PREY=초식 스폰 가중치
const MOB_WOLF_P=0.0012, MOB_TIG_P=0.00018;   // 포식자 출현율/게임분(부재 시) — 늑대팩 ~1.2일, 호랑이 ~7일 간격(이벤트성)
function _mobView(){const v=(typeof view!=='undefined')?view:{z:1,ox:0,oy:0},c=(typeof CELL!=='undefined')?CELL:1.9;   // 현재 카메라 가시 셀범위(+여백) = 몹 존재 구간(LOD)
  return {x0:Math.max(0,Math.floor(-v.ox/v.z/c)-2),x1:Math.min(N,Math.ceil((760-v.ox)/v.z/c)+2),y0:Math.max(0,Math.floor(-v.oy/v.z/c)-2),y1:Math.min(N,Math.ceil((760-v.oy)/v.z/c)+2)};}
function reapDead(s){if(!s._anyDead)return;s._anyDead=0;   // ★사망 처리: agent 제거 + econ.npcs 하나 제거(진짜 인구감소 — 리싱크 부활 방지). 인구 0 마을은 lifeDayAll이 소멸시킴.
  for(let i=s.agents.length-1;i>=0;i--){const a=s.agents[i];if(!a._dead)continue;s.agents.splice(i,1);
    if(s.econ&&s.econ.npcs&&s.econ.npcs.length){let k=-1;for(let j=0;j<s.econ.npcs.length;j++)if(s.econ.npcs[j].currentJob===a.job){k=j;break;}if(k<0)k=(Math.random()*s.econ.npcs.length)|0;s.econ.npcs.splice(k,1);}   // 같은 직업 우선 제거(직업분포 유지)
    s._deaths=(s._deaths||0)+1;}
  if(s.econ)s.pop=s.econ.npcs.length;}
const HSK_W=a=>{const n=a._esk||a;return Math.min(10,n.skills?(n.skills.archery||0):(a._hsk||0));};   /* ★활 숙련(사격): 명중·시위. 마을=연결된 econ NPC(_esk), 랩=_hsk */
const HSK_F=a=>{const n=a._esk||a;return Math.min(10,n.skills?(n.skills.hunting||0):(a._hsk||0));};   /* ★사냥 숙련(야외기술): 잠행·추적·도살·수율 */
const goCharge=(m2,t2)=>{if(!m2||m2.hp<=0||m2.st==='dead')return;m2.tgt=t2;m2.pause=0;/*★돌진도 pause 소거*/if(t2&&t2.job!==undefined){t2._dvM=m2;t2._dvS=0;}
  if(m2.type==='🐗'){m2.st='huff';m2.hf=2.4;}else{m2.st='charge';m2.chg=28;}};   /* ★돌진 진입 공통: 🐗=발구르기 텔레그래프 1.2분(읽고 피할 기회), 그 외 즉발. 표적 사냥꾼에겐 회피 신호(_dvM) */
const losRk=(x1,y1,x2,y2)=>{if(!TR.rock)return false;const d9=Math.hypot(x2-x1,y2-y1),n9=Math.ceil(d9);for(let i9=1;i9<n9;i9++){const t9=i9/n9,xx=Math.floor(x1+(x2-x1)*t9),yy=Math.floor(y1+(y2-y1)*t9);if(inG(xx,yy)&&TR.rock[idx(xx,yy)])return true;}return false;};   /* ★시야(LoS): 바위=차단. 셀 샘플링 — 60m 캡 통과 쌍에만 호출(만 명 벤치 +0.3ms 이내) */
const losFT=(x1,y1,x2,y2)=>{if(!TR.forest)return 0;const d9=Math.hypot(x2-x1,y2-y1),n9=Math.ceil(d9/2);let f9=0;for(let i9=1;i9<n9;i9++){const t9=i9/n9,xx=Math.floor(x1+(x2-x1)*t9),yy=Math.floor(y1+(y2-y1)*t9);if(inG(xx,yy)&&TR.forest[idx(xx,yy)])f9++;}return f9*2;};   /* ★숲 시야 감쇠용: 시선이 통과하는 숲 미터(나무 개별 콜라이더 대신 밀도 통계 — 1m 셀에서 AI 결과는 '숲 몇 m 통과'만이 결정. 본체는 per-tree 유지, §9 하단) */
function nextBlood(s,a,tgt){if(a._bkT!==tgt){a._bkT=tgt;a._bk=0;}if(!s._blood||!s._blood.length)return null;   // ★핏자국 추적: 내 표적의 핏방울 중 아직 안 밟은 가장 오래된 것 — 사슴이 지난 경로를 그대로 밟아감(전지적 직진 금지)
  for(;;){let bt=null,bk=1e18;for(const b of s._blood){if(b.o!==tgt||b.k<=(a._bk||0))continue;if(b.k<bk){bk=b.k;bt=b;}}
    if(!bt)return null;if(Math.hypot(bt.x-a.px,bt.y-a.py)<2+HSK_F(a)*0.15){a._bk=bt.k;continue;}return bt;}}   /* ★추적 숙련: 핏방울 포착 반경 레벨0 2m→레벨10 3.5m — 능숙한 추적자는 자국을 덜 놓치고 빠르게 잇는다 */
function updateMobs(s,step){
  if(!s.gameRich||!s.forestCells||!s.agents)return; if(!s.mobs)s.mobs=[]; if(!s._wp)s._wp=new Map();
  const vr=_mobView(),inV=(x,y)=>x>=vr.x0&&x<vr.x1&&y>=vr.y0&&y<vr.y1,dt=Math.min(8,step||1);
  const f=(typeof lifeGM!=='undefined')?(lifeGM%L_MINDAY)/L_MINDAY:0.5,night=f<L_DAWN||f>=L_DUSK; if(!night)s._raidQ=0;   // 밤 판정(🐗 밭 습격 시간대) · 주간엔 야간 피해 상한 리셋
  s.mobs=s.mobs.filter(m=>{const ok=m.st==='hide'||((m.hp>0||(m.st==='dead'&&(m.rot-=dt)>0))&&inV(m.px,m.py));if(!ok)m.rot=-1;return ok;});   /* ★굴속(hide·px=-99)은 뷰밖 정리 예외 — 개체수 집계 유지로 리스폰 억제(굴 셔틀 봉인) */   // despawn: 뷰밖·소멸(사체는 썩을 때까지 잔존. 제거 시 rot=-1 → 늘어진 참조 안전)
  const hall0=s.V&&(s.V.hall||s.V.center);
  if(!s._wild){const me=s.center||(s.V&&s.V.center),cs=(typeof VILS!=='undefined'&&VILS.length)?VILS.map(v3=>v3.center).filter(Boolean):[];   // ★몹 서식지 = 사냥터 밴드(huntCells)와 동일 실체(마을 안 하드 제외) — 개체만 보로노이(최근접 마을 권역)로 이웃과 중복 방지(gameRich 장부 겹침은 공유 사냥터로 허용)
    const src=(s.huntCells&&s.huntCells.length)?s.huntCells:s.forestCells;
    s._wild=src.filter(c=>{if(!me)return true;const d2=(c.cx-me.cx)*(c.cx-me.cx)+(c.cy-me.cy)*(c.cy-me.cy);
      for(const c3 of cs){if(!c3||(c3.cx===me.cx&&c3.cy===me.cy))continue;if((c.cx-c3.cx)*(c.cx-c3.cx)+(c.cy-c3.cy)*(c.cy-c3.cy)<d2)return false;}return true;});
    if(!s._wild.length)s._wild=src.slice();}   // 폴백(전부 이웃 권역이면 그냥 사용)
  const _vfs=vr.x0+'|'+vr.x1+'|'+vr.y0+'|'+vr.y1+'|'+s.day+'|'+s.gameRich.size;   // ★뷰내 서식지 캐시: 뷰·날짜·벌채 변화 때만 재구축(매 프레임 O(숲셀) 스캔 제거)
  if(s._vfSig!==_vfs){s._vfSig=_vfs;let v2=0;const vf=[];for(const c of s._wild){if(!inV(c.cx,c.cy)||!TR.forest[idx(c.cx,c.cy)])continue;c.r=s.gameRich.get(c.cx+','+c.cy)||MOB_WILD_RICH;v2+=c.r;vf.push(c);}s._vf=vf;s._vfVg=v2;}   // 벌채 셀 제외. 노동권=실측 gameRich(남획 반영), 그 밖 야생=기본 풍부도
  const visForest=s._vf,vg=s._vfVg;
  const dfOf=(x,y,ty)=>{const d=hall0?Math.hypot(x-hall0.cx,y-hall0.cy):999,f0=Math.max(0,Math.min(1,(d-MOB_AV0)/(MOB_AV1-MOB_AV0)));return ty==='🐗'?(1-Math.abs(f0-0.25)*0.8):f0;};   // ★인가 회피 계수: 사람 소리·발자국·개 — 영토 안≈0, 85m+ 자유. 멧돼지는 뒷산 선호(피크 f0=0.25≈51m, 경계선 0.8·깊은 숲 0.4): 경작지 주변 서식밀도가 높은 상리공생종(고증)이되 무리 궤도가 40m 선을 넘나들지 않게 피크를 살짝 바깥으로
  const target=Math.min(MOB_CAP,Math.max(visForest.length>0?5:0,Math.round(vg/L_GAMEMAX*MOB_DENS)));   // ★초식 마릿수 = 총 개체수 비례(밀도) + 서식지 있으면 최소 5(항상 보이게)
  const W=s.V&&s.V.walls,hall=s.V&&(s.V.hall||s.V.center);   // 건물벽 Set + 마을 중심(포식자 회피 기준)
  const canWalk=(x,y)=>inG(x,y)&&!(typeof TR!=='undefined'&&TR.terrain&&TR.terrain.isBlocked(x,y))&&!(W&&W.has(x+','+y));   // ★물(다리 제외)·바위 + 건물벽 통과 불가 — NPC 경로와 동일 판정(TR.terrain.isBlocked). 구 TR.isBlocked 오참조로 강을 헤엄치던 버그 수정
  const kill=t=>{s._kAll=(s._kAll||0)+1;t.hp=0;t.st='dead';t.rot=52+Math.random()*36;t.tgt=null;t.raidK=null;};/*랩단독 계측*/   // 사체화 — 늑대 먹이·서서히 소멸
  const hurtNPC=(a,dmg,tag)=>{if(!a||a.state==='trading'||!a.home)return;if(a.hp===undefined)a.hp=NPC_MAXHP;a.hp-=dmg*(1-0.35*Math.min(1,a._arm||0));a.action=tag;/*★가죽 갑옷=부상 경감(장비율×35%): 갑옷 재고→사냥꾼 보호→부상↓→huntRisk 학습이 자동으로 사냥 기회비용을 낮춤 — 가죽 수요의 자기 강화 순환(§9)*/   // ★NPC 피해: hp<=0 사망(인구손실), hp<60 요양 귀가. 교역 중 면제(짐 보호)
    if(a.job==='hunter')s._hEvD=(s._hEvD||0)+2;   // ★위험 학습(→직업선택 기회비용): 사냥꾼 부상=이틀치 손실 가중
    if(a.hp<=0){a.hp=0;a._dead=1;s._anyDead=1;s._hDeadN=(s._hDeadN||0)+(a.job==='hunter'?1:0);
      if(a.job==='hunter'&&s.econ)s.econ._huntRisk=Math.min(0.6,(s.econ._huntRisk===undefined?0.08:s.econ._huntRisk)+0.18);}   // 호환 사망 충격: 마을의 위험 인식 즉시 점프(EMA가 서서히 잊음)
    else{a.target=null;if(a.hp<NPC_REST_IN){a.rest=1;a.state='toHome';setPath(a,a.home.cx,a.home.cy);}s._inj=(s._inj||0)+1;}};
  let preyN=0,wolfN=0,tigN=0; const preds=[],preyL=[],carc=[];
  for(const m of s.mobs){if(m.st==='dead'){carc.push(m);continue;}const D=MOB_DEF[m.type];if(!D.pred){preyN++;preyL.push(m);}else{preds.push(m);if(D.pred===1)wolfN++;else tigN++;}}
  s._gid=s._gid||1;
  const spawnGrp=(type,n,cell)=>{const gid=s._gid++,D=MOB_DEF[type];let sp=0;   // ★무리 스폰(같은 gid) — tmp=개체 성격 편차(겁 많은/대담한 개체), flk=팩 측면 오프셋
    for(let g=0;g<n;g++){const px=cell.cx+0.5+(Math.random()-0.5)*8,py=cell.cy+0.5+(Math.random()-0.5)*8;
      if(canWalk(Math.floor(px),Math.floor(py))){s.mobs.push({px,py,type,gid,hp:D.hp,tmp:0.72+Math.random()*0.56,stam:1,hun:Math.random()*0.4,ang:Math.random()*6.283,pause:0,cd:0,fcd:0,cvo:0,cvt:0,flk:(g%3-1)*0.55,st:D.pred?'prowl':'graze'});sp++;}}
    return sp;};
  let _sg=0;
  while(preyN<target&&visForest.length&&_sg++<80){const t=MOB_PREY[(Math.random()*MOB_PREY.length)|0],D=MOB_DEF[t];
    let c=null,bs=-1;for(let t2=0;t2<6;t2++){const cc=visForest[(Math.random()*visForest.length)|0];if(!cc)break;   // ★스폰 셀 = 표본 6 중 풍부도×인가회피 가중 최고 — 마을 근처(영토+완충)엔 거의 안 생기고 먼 숲에 골고루(멧돼지는 예외적으로 근접 허용)
      const sc=(cc.r||MOB_WILD_RICH)*(0.06+0.94*dfOf(cc.cx,cc.cy,t))*(0.5+Math.random());if(sc>bs){bs=sc;c=cc;}}
    if(!c)break;preyN+=spawnGrp(t,D.grp[0]+((Math.random()*(D.grp[1]-D.grp[0]+1))|0),c);}
  if(preyN>target+4)for(let k=0,i=(Math.random()*s.mobs.length)|0;k<s.mobs.length&&preyN>target+4;k++){const j=(i+k)%s.mobs.length,m=s.mobs[j];if(m&&m.st!=='dead'&&m.st!=='hide'&&!MOB_DEF[m.type].pred){s.mobs.splice(j,1);preyN--;}   /* ★hide는 정리 금지(굴속 대기) */}   // 초과분 이탈(초식만)
  if(visForest.length&&preyN>=10){const far=()=>{let bc=null,bd2=-1;for(let t2=0;t2<10;t2++){const c=visForest[(Math.random()*visForest.length)|0];const d=hall?Math.hypot(c.cx-hall.cx,c.cy-hall.cy):999;if(d>70)return c;if(d>bd2){bd2=d;bc=c;}}return bc;};   // ★포식자 스폰: 마을서 45m+ 숲(없으면 표본 중 최원거리 — 작은 숲에서도 출현 보장)
    if(!wolfN&&Math.random()<MOB_WOLF_P*dt){const c=far();if(c)spawnGrp('🐺',3+((Math.random()*3)|0),c);}
    if(!tigN&&preyN>=14&&Math.random()<MOB_TIG_P*dt){const c=far();if(c)spawnGrp('🐯',1,c);}}
  if(!s.mobs.length)return;   // 몹 0(뷰 밖 마을 등) → 그리드 구축 생략
  s._raidCd=(s._raidCd||0)-dt;   // 🐗 밭 전수스캔 스로틀 타이머(마을당)
  const BK=64,gkey=(x,y)=>((x/BK)|0)*4096+((y/BK)|0);   // ★공간 해시(버킷 64m): 3×3 조회가 반경 ≥64m 보장 — 사람 소음 인지 상한 60m(숲 차폐, 실축) 커버. 수천~만 NPC에도 몹당 비용 일정
  const agrid=new Map();for(const a of s.agents){if(a.state==='home')continue;const k=gkey(a.px,a.py),l=agrid.get(k);l?l.push(a):agrid.set(k,[a]);}   // 활동 NPC=위협원. ★플레이어를 붙일 땐 여기(agrid)에 같이 넣으면 전 종이 즉시 반응(범용 위협 인터페이스)
  const nearIn=(grid,x,y,cb)=>{const bx=(x/BK)|0,by=(y/BK)|0;for(let ix=bx-1;ix<=bx+1;ix++)for(let iy=by-1;iy<=by+1;iy++){const l=grid.get(ix*4096+iy);if(l)for(const o of l)cb(o);}};
  const G=new Map();   // ★무리 집계(gid 단위, 한 패스 O(n)): 중심·평균방향·패닉 수 — 이전 동종 전수 스캔 O(n²) 대체
  for(const m of s.mobs){if(m.st==='dead')continue;let g=G.get(m.gid);if(!g){g={n:0,cx:0,cy:0,ax:0,ay:0,pn:0,px:0,py:0,pred:MOB_DEF[m.type].pred,ty:m.type};G.set(m.gid,g);}
    g.n++;g.cx+=m.px;g.cy+=m.py;g.ax+=Math.cos(m.ang);g.ay+=Math.sin(m.ang);
    if(m.st==='flee'||m.st==='charge'||m.fcd>0){g.pn++;g.px+=Math.cos(m.ang);g.py+=Math.sin(m.ang);}}   // 패닉 멤버 수+평균 도주방향(스탬피드 전파용)
  for(const[gid,g]of G){g.cx/=g.n;g.cy/=g.n;   // ★무리 웨이포인트: 먹이 많은 숲 셀을 골라 무리 단위로 회유(제자리 배회 대신 '이동하는 떼') — 포식자는 마을서 먼 곳 가산
    let wp=s._wp.get(gid);
    if(!wp||(wp.t-=dt)<=0||(Math.abs(wp.x-g.cx)+Math.abs(wp.y-g.cy))<5){let best=null,bs=-1e9;
      for(let t2=0;t2<8;t2++){const c=visForest[(Math.random()*visForest.length)|0];if(!c)break;const d=Math.hypot(c.cx-g.cx,c.cy-g.cy);if(d>60||d<10)continue;   // 이주 구간 10~60m(실축 일일 이동의 일부)
        let sc=(c.r||MOB_WILD_RICH)*(g.pred?1:(0.25+0.75*dfOf(c.cx,c.cy,g.ty)))-d*0.15;if(g.pred&&hall)sc+=Math.min(80,Math.hypot(c.cx-hall.cx,c.cy-hall.cy))*0.3;   // ★초식 웨이포인트도 인가 회피 — 무리가 마을 쪽으로 회유해 오지 않음(먹이가 아무리 좋아도 감가)
        if(sc>bs){bs=sc;best=c;}}
      wp={x:best?best.cx:g.cx,y:best?best.cy:g.cy,t:60+Math.random()*90};s._wp.set(gid,wp);}   // 한자리 오래 머묾(잦은 이주 방지)
    g.wp=wp;}
  if(s._wp.size>G.size+24)for(const k of s._wp.keys())if(!G.has(k))s._wp.delete(k);   // 사라진 무리 웨이포인트 청소
  for(const m of s.mobs){ if(m.st==='dead')continue;
    if(m.st==='hide'){if((m._hid-=dt)<=0){m.st='alert';m.fcd=0;m.px=m._den.x;m.py=m._den.y;m.pause=6;}continue;}   // ★🐇 굴속: 개체수 집계엔 포함(리스폰 억제=진짜 '기회 상실'), 25~50분 뒤 굴에서 재등장
    const D=MOB_DEF[m.type],g=G.get(m.gid)||{n:1,cx:m.px,cy:m.py,ax:0,ay:0,pn:0,px:0,py:0},wnd=(0.55+0.45*(m.hp/D.hp))*(1-(m.bld||0));   // wnd=부상 감속 × ★출혈 피로(1-bld): 화살 박힌 채 달릴수록 점점 느려짐(이동 거리 비례 누적, 최대 절반) → 핏자국 추적·지구력 사냥이 성립
    m.cd-=dt;m.fcd-=dt;m.cvt-=dt;m._mv=0;
    const move=(vx,vy)=>{const k=Math.min(1,dt*(1.3/(D.r||1)));/*유닛 통일: dt 계수 ÷2*/   // ★유한 가속(Reynolds steering): 원하는 스텝을 향해 '기울어져 감' — 급출발·급정지·순간 반전(무한 가속) 제거. 몸집(r) 클수록 관성↑
      m._vx=(m._vx||0)+(vx-(m._vx||0))*k;m._vy=(m._vy||0)+(vy-(m._vy||0))*k;
      const nx=m.px+m._vx,ny=m.py+m._vy;
      if(canWalk(Math.floor(nx),Math.floor(ny))){m.px=nx;m.py=ny;m._mv=1;
        const dd2=Math.hypot(m._vx,m._vy);m._spd=dd2/Math.max(0.05,dt);m._gp=(m._gp||0)+m._spd*dt*1.9;   // 실속도·보행 위상(렌더의 바운스·기울임·몸늘임에 사용)
        if(Math.abs(m._vx)>0.02)m._fc=m._vx>0?1:-1;   // 바라보는 방향(좌우) — 데드밴드로 파닥임 방지
        if(m.hp<D.hp){m.bld=Math.min(0.5,(m.bld||0)+dd2*0.00125);   // ★출혈: 부상 상태 이동 거리만큼 피로 누적(서 있으면 악화 정지 — 응혈)
          if((m._bdd=(m._bdd||0)+dd2)>2.2){m._bdd=0;(s._blood=s._blood||[]).push({x:m.px,y:m.py,t:90,o:m,k:(s._bq=(s._bq||0)+1)});if(s._blood.length>400)s._blood.shift();}}   // ★핏자국: ~1.4m마다 핏방울(45분)
        return true;}return false;};
    const slpW=D.slp?(D.slp[0]<D.slp[1]?(f>=D.slp[0]&&f<D.slp[1]):(f>=D.slp[0]||f<D.slp[1])):false;   // 종별 취침 시간대(사슴·토끼=한밤, 멧돼지·늑대·호랑이=낮잠) ※지각 앞 호이스트(절대 근접 감지가 참조)
    let thr=null,thrA=null,td2=1e18;   // ── 위협 인지(가중 거리: 포식자는 더 무섭게 느낌) — 초식: NPC+포식자 / 늑대: NPC+호랑이 / 호랑이: 사람을 덜 겁냄
    const seen=(o,w,isA)=>{const dx=m.px-o.px,dy=m.py-o.py,d2=(dx*dx+dy*dy)*w*w;if(d2<td2){td2=d2;thr=o;thrA=isA?o:null;}};   // 제곱거리 비교(후보당 sqrt 없음 — 밀집 버킷에서도 쌈)
    {const wA=D.pred===2?1.6:1;nearIn(agrid,m.px,m.py,a=>{const ddx=a.px-m.px,ddy=a.py-m.py,_r2=ddx*ddx+ddy*ddy;if(_r2>3600)return;   // ★사람 소음 인지 상한 60m
      if(losRk(a.px,a.py,m.px,m.py))return;   /* ★바위 너머는 못 봄·못 들음(협곡·산 차폐) */
      if(_r2<(slpW?6.25*m.tmp*m.tmp:36)){seen(a,0.2,true);return;}/*랩단독 ★취침 기상 반경=개체 성격(1.75~3m): 예민한 놈(tmp>1.04)은 창 리치(2.6) 밖에서 깨서 스니크 킬 실패 — 자는 놈 찌르기가 무조건 성공(최적 전략화)하지 않게*//*랩단독 ★취침도 발밑 2.5m에선 깬다(종전 완전면제 → 밤 창 학살이 주력화: 킬 198/209가 근접. 스니크 킬은 드문 보상으로)*/   // ★절대 근접 감지 6m: 발소리·지면 진동은 은신 무관(crypsis는 시각 은폐일 뿐) — 잠행 2m 근접타 '토끼 양식장' 봉인. 취침 중 예외=밤 급소 사냥 유지
      seen(a,wA*(a.job==='hunter'?(a.sneak?5.5+HSK_F(a)*0.35:((a._sp2||0)>3?0.8:(a._hold?2:1.2))):1),true);});}   /*랩단독 ★소음=실속도 기준: 달리기(>6/u)만 시끄러움(0.8) — 종전 라벨(추적) 기준은 조깅·자국 밟기까지 전부 시끄러워 부상 링(97m)을 재발동시켰음*/   /* ★조준 정지 자세(_hold)=평보보다 조용(2.0) — 서서 기다리는 사수 곁에서 사슴이 다시 진정할 수 있게(잠행 5.5보단 노출) */   /* ★달리기=소음: 추적·회수 질주는 평보(1.2)보다 잘 들킴(0.8) — 옆 사슴 무리가 흩어짐 */   // ★잠행 은신=숙련 5.5+0.35/레벨: 레벨0 은신5.5(사슴 실효 탐지 ~20m=standoff 턱걸이 — 초보는 자주 들킴) · 레벨5 7.25(기존 튜닝) · 레벨10 9(~12m 무영접근) vs 평보 1.2배(66~117m서 들킴)
    if(!D.pred){for(const p of preds){const stk=p.st==='stalk',hnt=p.st==='chase'||p.st==='charge';seen(p,(MOB_DEF[p.type].pred===2?0.6:0.8)*(stk?3.2:(hnt?0.6:1.7)),false);}}   // ★포식자 위협=상태 의존(실축): 포복(stalk)=3.2배 은신 → 110m 경계에도 ~20m까지 접근(실제 늑대 사냥법) / 노출 추격=멀리서 감지 / 배회·취침=거리두기 공존
    else if(D.pred===1){for(const p of preds)if(MOB_DEF[p.type].pred===2)seen(p,0.6,false);}
    const td=thr?Math.sqrt(td2):1e9;   // 최종 1회만 sqrt
    const fl=D.flee*m.tmp*(m.hp<D.hp?1.3:1),al=D.alert*m.tmp;   // 개체 성격(tmp)·부상(아드레날린=더 예민) 반영 반경
    let sx=0,sy=0,scn=0;   // 분리(전종·근접) — 겹침 방지
    for(const o of s.mobs){if(o===m||o.st==='dead')continue;const dx=m.px-o.px,dy=m.py-o.py,d2=dx*dx+dy*dy;
      if(d2<MOB_SEP_R*MOB_SEP_R&&d2>1e-4){const d=Math.sqrt(d2),ov=1-d/MOB_SEP_R;sx+=dx/d*ov;sy+=dy/d*ov;scn++;}}   // ★겹침 깊이 비례(경계선 근처 미는 힘→0) — 무리 내 프레임 진동 제거
    if(m.st==='huff'){const t=m.tgt;if(!t||(t.hp!==undefined&&t.hp<=0)){m.st='alert';m.tgt=null;}
      else{m.ang=Math.atan2(t.py-m.py,t.px-m.px);if((m.hf-=dt)<=0){m.st='charge';m.chg=28;}}}   // ★🐗 발구르기: 제자리 조준 — 직후 직선 돌진(이 순간이 회피 타이밍)
    else if(m.st==='charge'){const t=m.tgt;m.chg-=dt;   // ══ 공통: 돌진(🐗 반격·🐺 역습 — 대상이 NPC든 몹이든 동일 처리) ══
      if(!t||(t.hp!==undefined&&t.hp<=0)||m.chg<=0){m.st='flee';m.fcd=12;m.tgt=null;}
      else{const dx=t.px-m.px,dy=t.py-m.py,d=Math.hypot(dx,dy)||1;
        {const ta=Math.atan2(dy,dx);let da=ta-m.ang;while(da>Math.PI)da-=6.283;while(da<-Math.PI)da+=6.283;const tr=(m.type==='🐗'?0.25:m.type==='🐯'?0.55:1.3)*dt;m.ang+=Math.max(-tr,Math.min(tr,da));}   // ★돌진 비유도: 🐗 조향 제한(직선 저돌 — 옆으로 비켜서기가 실제로 통함)·🐯 중간·🐺 민첩
        const sp=D.spd*1.7*dt,px0=m.px,py0=m.py;move(dx/d*sp,dy/d*sp)||move(-dy/d*sp*0.7,dx/d*sp*0.7);
        const ex=m.px-px0,ey=m.py-py0,el=ex*ex+ey*ey,tt=el>0?Math.max(0,Math.min(1,((t.px-px0)*ex+(t.py-py0)*ey)/el)):0,qx=px0+ex*tt-t.px,qy=py0+ey*tt-t.py;
        if(qx*qx+qy*qy<1.3225){   /*★돌진 히트=이동 선분-표적 거리(1.15m): 종전 '이동 전 거리' 판정은 프레임당 7m 돌진이 표적을 건너뛰는 터널링(돌진 58회 피격 1 실측)*/if(t.job!==undefined)hurtNPC(t,m.type==='🐯'?NPC_DMG_TIGER:m.type==='🐗'?NPC_DMG_BOAR:NPC_DMG_WOLF,m.type+'습격');else{t.hp-=D.atk;t.fcd=16;if(t.hp<=0)kill(t);}   // 들이받기(리치 ~1m): NPC=HP피해(치사 가능) / 몹=피해+강제 도주
          m.st='flee';m.fcd=16;m.cd=(m.hp<D.hp&&m.type==='🐗')?16:(m.hp<D.hp&&m.type==='🐯')?12:50;m.tgt=null;m.ang+=Math.PI;}
        else if(d>2.2&&m.chg<12&&Math.abs(((Math.atan2(dy,dx)-m.ang+9.42)%6.283)-3.14)>1.2){m.st='flee';m.fcd=4;m.tgt=null;}}}   // ★빗나감: 표적이 측면으로 빠지면 지나쳐 감(회피 성공) · ★부상 🐗/🐯는 재돌진 쿨 8/6분(포기 안 함)   // 치고 빠지기(재돌진 쿨다운)
    else if(!D.pred){   // ══ 초식 ══
      const panic=g.pn>0&&g.n>1;   // ★패닉 전파: 무리원이 튀면 위협을 직접 못 봐도 동요
      if(m.st==='sleep'&&slpW&&!(m.fcd>0||panic||(thr&&td<al*0.1))){m.stam=Math.min(1,m.stam+0.03*dt);}   // 😴 숙면: 둔감(경계의 1/10 — 실축 al 110이면 포복 늑대 기준 ~4m까지 접근 허용, 잠든 놈은 급습에 취약). 무리 패닉엔 즉시 기상
      else if(thr&&td<fl&&D.brave>0&&m.cd<=0&&Math.random()<D.brave*m.tmp*(m.hp<D.hp?1.5:1)*0.175*dt){goCharge(m,thr);m.cd=60;}   // 🐗 호전 판정(다치면 더 사나움) — ★dt 보정(이전: 프레임당 무보정 재판정=근접 시 돌진 사실상 확정+프레임률 의존 버그). 지속 대치 ~수분당 1회꼴, 겁쟁이 개체(tmp↓)는 그냥 튐
      else if((thr&&td<fl)||(m.fcd>0&&(m.fT===undefined||m.fT>0))||(panic&&thr&&td<al*1.5)||(m.st==='flee'&&(m.fT||0)>0)){/*★도주 래치: 래더=매 프레임 조건 재평가라 링 밖으로 뛰는 순간 유지 조건이 사라져 15초 버스트가 실측 2초였음 — 일단 뛰면 fT가 다 탈 때까지(조기 종료는 4301 내부 규칙만)*/if(m.st!=='flee'&&m.fcd<=0){(s._fW=s._fW||{});const _c=(thr&&td<fl)?((thr.sneak?'ring잠행':'ring'))+((td<2?'/근접':'')):'panic';s._fW[_c]=(s._fW[_c]||0)+1;}m.st='flee';
        if(m._fst!==1){m._fst=1;m.pause=0;/*★도주 진입=멈춤 잔값 소거: '풀뜯기 pause'가 flee에 살아남아 pause>0=취약·방심 게이트를 전부 오염(도주 호랑이에 커밋 들러붙던 진짜 뿌리)*/m.spr=(m.hp<D.hp?5:10)+Math.random()*(m.hp<D.hp?4:8);m.fT=15;   /*★도주 재설계: 발동 순간 '사냥꾼 반대 방향 × 15초 주행거리' 지점을 난수(각 ±0.35rad·거리 ±20%) 섞어 확정*/
          const aw=thr?Math.atan2(m.py-thr.py,m.px-thr.px):m.ang,fa=aw+(Math.random()-0.5)*0.7,fd=D.spd*2.0*m.fT*(0.8+Math.random()*0.4);
          m.fgx=Math.max(2,Math.min(N-2,m.px+Math.cos(fa)*fd));m.fgy=Math.max(2,Math.min(N-2,m.py+Math.sin(fa)*fd));}
        let ax=Math.atan2((m.fgy!==undefined?m.fgy:m.py)-m.py,(m.fgx!==undefined?m.fgx:m.px)-m.px)+(Math.random()-0.5)*0.12;   /*★고정 목표점 직진(+미세 흔들림) — 도달 못 해도 15초(fT)에 정지, 장애물은 프로브가 우회. U자 원인(매 프레임 위협 반대 재계산+무리 평균) 제거*/
        if(m.cvt<=0){m.cvt=3;let fb=null,fo=null;for(const o of[0,0.6,-0.6,1.1,-1.1,1.6,-1.6]){const tx=(m.px+Math.cos(ax+o)*7)|0,ty=(m.py+Math.sin(ax+o)*7)|0;
            if(!inG(tx,ty)||(TR.terrain&&TR.terrain.isBlocked(tx,ty)))continue;   // ★물·바위 방향은 도주 후보에서 제외 — 강둑에 끼여 몸 비비다 화살받이 되던 버그 수정
            if(fb===null)fb=o;if(TR.forest&&TR.forest[idx(tx,ty)]){fo=o;break;}}
          m.cvo=(fo!==null)?fo:(fb!==null)?fb:2.4;}   // 숲 방향 > 아무 열린 방향 > 전방위 막힘(곶·반도)이면 크게 꺾어 되돌아 나옴
        if(D.zig&&m._den){const _dd=Math.hypot(m._den.x-m.px,m._den.y-m.py);   // ★🐇 도주=굴로 질주(방향 고정): 도달하면 굴속으로 사라짐(뷰 정리가 제거 — '놓침' 발생)
          if(_dd<1.5){m.px=-99;m.py=-99;m.st='hide';m._hid=50+Math.random()*50;continue;}ax=Math.atan2(m._den.y-m.py,m._den.x-m.px);}
        ax+=m.cvo; if(D.zig)ax+=Math.sin(m.ph=(m.ph||0)+dt*1.3)*0.7;   // 🐇 갈지자(굴 방향 위에 얹힘)
        {let _da=ax-m.ang;while(_da>Math.PI)_da-=6.283;while(_da<-Math.PI)_da+=6.283;m.ang+=Math.max(-1.2*dt,Math.min(1.2*dt,_da));}   /*랩단독 ★도주 회전 제한(2.4rad/유닛): 사수 3인이 수렴하면 '가장 가까운 위협'이 바뀔 때마다 도주각이 90~180° 순간 반전하던 와리가리 — 이제 호를 그리며 돎*/
        const spr=(m.spr=(m.spr||0)-dt)>0;m.stam=Math.max(0,m.stam-(spr?0.05:0.0225)*dt);   // 질주는 체력을 배로 태움
        const sp=D.spd*(spr?2.6:1.4)*wnd*(m.stam>0.2?1:0.55)*dt;   // 질주 ~5.5m/분 → 속보 ~2.9 → 부상·출혈·탈진 겹치면 결국 따라잡힘(지구력 사냥)
        move(Math.cos(ax)*sp,Math.sin(ax)*sp)||move(-Math.sin(ax)*sp,Math.cos(ax)*sp)||move(Math.sin(ax)*sp,-Math.cos(ax)*sp)||(m.ang+=2.5);
        if((m.fT=(m.fT===undefined?15:m.fT)-dt)<=0){if(thr&&td<fl*2){m._fst=0;}else{m.st='alert';m._fst=0;}}else if((!thr||td>al*(m.hp<D.hp?0.25:1.6))&&m.fcd<=0&&m.fT<11){m.st='alert';m._fst=0;}}/*★버스트 연장: 소진 시 위협이 코앞(fl×2)이면 정지 대신 새 버스트(목표점 재계산) — '위협 무관 강제 정지'는 22m서 멈추는 사냥꾼 기준이라 코싱 늑대 상대 100% 피살(사용자 프로브 실측). 지구력전 종점은 스태미나(질주 소진→감속)가 맡는다*//*★최소 4초 주행: 위협 미지각(잠행 사수) 즉시 탈출→재진입마다 새 목표점=1~2초 와리가리(실측 800회/4일)이던 것 — 버스트는 약속*/   /*★최대 15초만 달림 — 소진 시 위협 여부 무관 강제 정지(경계로): '60m 안 사수 존재=영구 도주'였던 만성 flee 차단. 링 재침입 시에만 새 버스트*/   /*랩단독 ★부상 개체 조기 정지(bed down): 출혈로 오래 못 뛰어 추격자 ~30m 앞에서도 멈춰 서서 버팀(실제 부상 사슴) → 활 마무리 창 생성. 건강체는 1.6배(150m) 이탈 후 정지*/
      else if((thr&&td<(slpW?al*(m.tmp>1.1?0.45:0.25):al)*(m.st==='alert'?1.15:1))||panic||((m._alH||0)>lifeGM)){m.st='alert';m._fst=0;if(thr){m._thx=thr.px;m._thy=thr.py;m._thT=lifeGM+60;m._alH=lifeGM+4;}/*★경계 히스테리시스: 탈출 반경 ×1.15 + 마지막 지각 후 4초 유지 — 링 경계 graze↔alert 프레임 플리커 제거*/m.stam=Math.min(1,m.stam+0.01*dt);/*★경계 기억: 위협 위치 60초 저장*/   // 👀 경계 = 얼어붙어 주시(freeze)가 기본 — 가끔만 뭉침·슬금 후퇴. ★밤 보초 모델: 예민한 개체(tmp>1.1, ~1/3)만 넓게 망보고 무던한 개체는 포식자가 꽤 붙어야 경계 → 늑대가 근처를 어슬렁거려도 무리 대부분은 잠(보초 몇이 서서 감시 — 실제 반추동물 vigilance 분담). 위험 감지는 보초→패닉 전파가 담당
        if((m.alT=(m.alT||0)+dt)>50&&thr){m.alT=0;m.fcd=16;(s._fW=s._fW||{}).timeout=(s._fW.timeout||0)+1;}/*랩단독 계측*/   // ★대치 타임아웃: 위협이 25분째 버티고 서 있으면 자리를 뜸(무한 '얼음 동상' 교착 방지 — 실제 사슴도 결국 트로팅으로 이탈)
        if(thr){const dx=m.px-thr.px,dy=m.py-thr.py,dd=Math.hypot(dx,dy)||1;m.ang=Math.atan2(-dy,-dx);
          if(Math.random()<0.06*dt)move(dx/dd*D.spd*0.5*dt,dy/dd*D.spd*0.5*dt);}
        if(g.n>1&&Math.random()<0.075*dt){const cx=g.cx-m.px,cy=g.cy-m.py,cl=Math.hypot(cx,cy)||1;if(cl>1.8)move(cx/cl*D.spd*0.35*dt,cy/cl*D.spd*0.35*dt);}}
      else{m.stam=Math.min(1,m.stam+0.015*dt);m.alT=0;m._fst=0;if(D.zig&&!m._den)m._den={x:m.px,y:m.py};   // ★🐇 굴 기억(첫 평시 위치)
        if(m.hp<D.hp&&m.pause<=0&&Math.random()<0.15*dt)m.pause=10+Math.random()*14;   /*랩단독 ★부상 개체=자주 멈춰 섬(출혈 허약·응혈은 서 있을 때만) — 저격 창이 자연히 열림*/
        // 🌿 평시(풀뜯기·무리 이동·😴 취침·🐗 밤 습격)
        if(!slpW&&D.raid&&night&&!m.raidK&&(s._raidQ||0)<2&&m.cd<=0&&Math.random()<0.01*dt){   // 🐗 밤: 반경 90m 내 경작지 목표(마을당 야간 총피해 상한) — 숲가 멧돼지가 밭까지 원정(실제 수 km의 압축)
          if(s._raidCd>0)m.cd=6;   // crop 전수스캔은 마을당 ~4게임분 1회로 제한(수만 셀 경작지에도 싸게)
          else{s._raidCd=4;let bk=null,bd=90;
            for(const[k2,e]of s.crop){const d=Math.abs(e.cx-m.px)+Math.abs(e.cy-m.py);if(d<bd){bd=d;bk=k2;m.rx=e.cx;m.ry=e.cy;if(d<25)break;}}   // 충분히 가까우면 조기 종료
            if(bk)m.raidK=bk;else m.cd=60;}}
        if(m.raidK&&(!night||!s.crop.has(m.raidK)||(s._raidQ||0)>=2))m.raidK=null;   // 새벽·다 먹음·상한 도달 → 복귀
        if((slpW||m.hp<D.hp)&&!m.raidK&&!((m._alH||0)+4>lifeGM)){const fx=Math.floor(m.px),fy=Math.floor(m.py);   // 😴 취침 시간 ★부상=시간 무관 눕기(bed down 고증: 부상 멧돼지는 덤불에 눕는다 — 창밖 취침이라 al 감쇠 없이 경계 유지) ★경계 종료 8초 내 재취침 금지(alert↔sleep 플리커만 차단 — 기억 60초 가드는 순찰 사냥꾼이 계속 갱신해 늑대 낮잠 절멸→방심 창 소멸시켰음) — 무리가 웨이포인트 주변에 모여 자니 '잠자리'가 생김
          if(TR.forest&&TR.forest[idx(fx,fy)]&&(!hall0||Math.hypot(m.px-hall0.cx,m.py-hall0.cy)>=MOB_AV0))m.st='sleep';   // ★잠자리는 반드시 마을 완충(40m) 밖 — 밤 습격 왔던 멧돼지도 날 밝으면 돌아가서 잠(마을 숲에 눌러앉기 방지)
          else{m.st='graze';const wx=(g.wp?g.wp.x:m.px+Math.cos(m.ang))-m.px,wy=(g.wp?g.wp.y:m.py+Math.sin(m.ang))-m.py,wl=Math.hypot(wx,wy)||1;m.ang=Math.atan2(wy,wx);const sp=D.spd*0.5*dt;if(!move(Math.cos(m.ang)*sp,Math.sin(m.ang)*sp))m.ang+=1.5;}}   // 숲 밖이면 은신처로 걸어가 눕기
        else if(m.raidK){const dx=m.rx+0.5-m.px,dy=m.ry+0.5-m.py,d=Math.hypot(dx,dy);
          if(d>1.1){m.st='graze';m.ang=Math.atan2(dy,dx);const sp=D.spd*0.8*dt;if(!move(Math.cos(m.ang)*sp,Math.sin(m.ang)*sp))m.ang+=1.5;}
          else{m.st='raid';if((m.eat=(m.eat||0)-dt)<=0){m.eat=5;const e=s.crop.get(m.raidK);   // 우적우적: 작물 품질 잠식(가벼운 실피해)
            if(e&&e.q>L_QMIN){e.q=Math.max(L_QMIN,e.q-0.05);s._raidQ=(s._raidQ||0)+0.05;s._raidN=(s._raidN||0)+1;}else m.raidK=null;}}}
        else{m.st='graze';   // ★뜯기-걷기 듀티사이클: 대부분 서서 뜯고(3~12분) 가끔 짧게 걸음(1.5~4.5분) → 차분한 정지-이동 리듬. 웨이포인트 멀면 계속 걸어 이주
          if(m.pause>0)m.pause-=dt;   // 서서 뜯는 중(대부분의 시간)
          else if((m.wkt=(m.wkt||0)-dt)>0){let dx=0,dy=0;   // 이동 버스트
            if(m.hp>=D.hp&&g.n>1){const cx=g.cx-m.px,cy=g.cy-m.py,cl=Math.hypot(cx,cy)||1,ah=Math.hypot(g.ax,g.ay)||1;dx+=cx/cl*MOB_COH+g.ax/ah*MOB_ALI;dy+=cy/cl*MOB_COH+g.ay/ah*MOB_ALI;}   // 응집+정렬 — ★부상 개체는 제외(무리 견인이 버스트마다 방향을 새로 뽑아 와리가리 유발)
            if(m.hp>=D.hp&&g.wp){const wx=g.wp.x-m.px,wy=g.wp.y-m.py,wl=Math.hypot(wx,wy)||1;if(wl>2.5){dx+=wx/wl*MOB_WPT;dy+=wy/wl*MOB_WPT;}}   // 무리 목적지 회유도 건강체만
            if(dx||dy){let da=Math.atan2(dy,dx)-m.ang;while(da>Math.PI)da-=6.283;while(da<-Math.PI)da+=6.283;m.ang+=da*Math.min(1,MOB_TURN*0.45*dt);}   // ★평시 조향 절반: 목적지로 '대충' 향하며 헤맴 허용(도주의 직진과 대비)
            m.ang+=(Math.random()-0.5)*(m.hp<D.hp?0.05:0.25)*dt;if((m._thT||0)>lifeGM){const ta2=Math.atan2(m._thy-m.py,m._thx-m.px);let dth=m.ang-ta2;while(dth>Math.PI)dth-=6.283;while(dth<-Math.PI)dth+=6.283;if(Math.abs(dth)<1.0)m.ang=ta2+Math.PI+(Math.random()-0.5)*0.6;}/*★경계 기억(60초): 위협을 봤던 방향으로 배회하지 않음 — '사수 쪽으로 걸어오는 컨베이어' 차단*/if(!canWalk(Math.floor(m.px+Math.cos(m.ang)*3),Math.floor(m.py+Math.sin(m.ang)*3)))m.ang+=1.2;/*★3셀 전방 프로브: 물가·바위 닿기 전에 미리 꺾음(강 몸비비기 방지)*/const sp=D.spd*(m.wsp||0.35)*wnd*dt;   /*랩단독 ★부상=흔들림 1/5: 한 방향으로 절뚝 직진(멈췄다 재개해도 같은 방향)*/   // ★느긋한 어슬렁: 걸음마다 다른 속도·큰 각도 흔들림 — 기계적 직선 제거
            if(!move(Math.cos(m.ang)*sp,Math.sin(m.ang)*sp)){m.ang+=2+Math.random();if((m.blk=(m.blk||0)+1)>2){m.blk=0;const wpp=s._wp.get(m.gid);if(wpp)wpp.t=0;}}else m.blk=0;}   // ★강둑 등에 연속으로 막히면 무리 목적지 재선정(물가 밀치기 루프 방지)
          else{const wl2=g.wp?Math.abs(g.wp.x-m.px)+Math.abs(g.wp.y-m.py):0;
            if(wl2>15||Math.random()<0.22){m.wkt=1.6+Math.random()*6.4;m.wsp=0.22+Math.random()*0.28;m.ang+=(Math.random()-0.5)*(wl2>15?0.35:1.8);}else m.pause=8+Math.random()*20;}}}}   // 다음 모드: 이주=직진 유지, 뜯기 배회=버스트마다 방향 크게 틈(±0.9rad — 어슬렁 지그재그). 걷다 서다 리듬
    else{   // ══ 포식자 ══
      m.hun=Math.min(1,m.hun+(m.st==='sleep'?0.0008:0.002)*dt);const hungry=m.hun>0.55;   // 굶주림 주기(하루 ~2사냥): 배부르면 사냥 안 함(늘 학살 방지). 잘 땐 대사 저하 → 낮잠 유지, 박명·밤 사냥 집중
      if(D.pred===2&&m.st!=='flee'){let nn=0;nearIn(agrid,m.px,m.py,a=>{const ddx=a.px-m.px,ddy=a.py-m.py;if(ddx*ddx+ddy*ddy<625)nn++;});if(nn>=3){m.st='flee';m.fcd=20;}}   // 🐯 사람 3+가 25m 내 몰이 → 회피(실축)
      if(m.st==='sleep'&&slpW&&!(m.fcd>0||(thr&&td<fl*1.5))){m.stam=Math.min(1,m.stam+0.03*dt);}   // 😴 낮잠: 위협이 바짝 붙어야 깸
      else if(m.st==='feed'){const c=m.tgt;   // 사체 포식(팩 공유·머묾)
        if(!c||c.rot<=0){m.st='prowl';m.tgt=null;}
        else if(thrA&&td<10){let pk=0;for(const p3 of preds)if(p3.gid===m.gid&&p3.hp>0)pk++;
          if((D.pred===1&&pk>=2||D.pred===2)&&m.cd<=0){goCharge(m,thrA);m.cd=D.pred===2?80:40;}else if(D.pred===1&&pk<2){m.st='prowl';m.tgt=null;}}   // ★사체 방어: 🐺 팩(2+)·🐯는 제 먹이에 온 사냥꾼에게 돌진 — 단독 늑대만 양보(사체 회수=늑대 팩과의 담력 싸움)
        else{const dx=c.px-m.px,dy=c.py-m.py,d=Math.hypot(dx,dy);
          if(d>1){m.ang=Math.atan2(dy,dx);move(dx/d*D.spd*0.5*dt,dy/d*D.spd*0.5*dt);}
          else{m.hun=Math.max(0,m.hun-0.03*dt);c.rot-=dt*0.75;if(m.hun<=0.1){m.st='rest';m.pause=20+Math.random()*30;m.tgt=null;}}}}   // 포식 후 늘어짐. ★먹는 만큼 사체 소모(rot 가속) — 사냥꾼과 도살 경쟁
      else if(m.st==='flee'||m.fcd>0||(thr&&td<fl)){m.st='flee';   // 사냥꾼 공격·호랑이 → 이탈
        const ax=(thr&&td<al)?Math.atan2(m.py-thr.py,m.px-thr.px):m.ang;m.ang=ax;
        const sp=D.spd*1.4*wnd*dt;move(Math.cos(ax)*sp,Math.sin(ax)*sp)||move(-Math.sin(ax)*sp,Math.cos(ax)*sp)||(m.ang+=2.5);
        if(m.fcd<=0&&(!thr||td>al))m.st='prowl';}
      else if(m.st==='chase'){const t=m.tgt;const isTig=D.pred===2;m.stam-=(isTig?0.11:0.0175)*dt;   // ★추격 성향 분리(고증): 늑대=지구력 코싱(느린 소진, 수 km), 호랑이=매복(폭발 후 급소진 — 스토킹 사거리 추격서 ~40% 성공, 놓치면 곧 포기). 실측 튜닝: 0.11=12%(과너프)·0.06=87%(과함)·0.09≈40%
        if(!t||t.hp<=0||t.st==='dead'){if(t&&t.st==='dead'&&t.rot>0)m.st='feed';else{m.st='rest';m.pause=24;m.tgt=null;}}
        else if(m.stam<=0){m.st='rest';m.pause=28+Math.random()*20;m.tgt=null;}   // 소진 → 포기(호랑이는 ~4초 만에 여기 도달=폭발 실패 시 즉시 단념 / 늑대는 오래 버팀)
        else{const dx=t.px-m.px,dy=t.py-m.py,d=Math.hypot(dx,dy)||1,lead=Math.min(8,d*0.45)*(t.st==='flee'?1:0.3);
          const gx=t.px+Math.cos(t.ang)*lead-m.px,gy=t.py+Math.sin(t.ang)*lead-m.py;   // ★요격: 도주 방향 앞지점 조준(꼬리물기 X)
          m.ang=Math.atan2(gy,gx)+(d>2.5?m.flk*0.4:0);   // 팩 측면 분산(포위 인상)
          const sp=D.spd*(m.stam>0.5?(isTig?3.2:2.75):1.7)*wnd*dt;if(!move(Math.cos(m.ang)*sp,Math.sin(m.ang)*sp))if(!move(dx/d*sp,dy/d*sp))m.ang+=1.2;   // ★호랑이 폭발 러시 3.2×(17.6m/s — 늑대 15.1보다 빠르나 4초면 소진: 16m서 3초 만에 덮치거나 놓치면 끝) vs 늑대 2.75×(지구력)
          if(d<1.1&&m.cd<=0){m.cd=2.8;t.hp-=D.atk;t.fcd=12;   // 물기(도약 리치 ~1m) — 물린 놈은 필사 도주
            if(t.hp<=0){kill(t);m.st='feed';for(const p2 of preds)if(p2!==m&&p2.gid===m.gid&&Math.abs(p2.px-m.px)+Math.abs(p2.py-m.py)<30){p2.st='feed';p2.tgt=t;}}}   // 팩 전원 사체로(나눠먹기)
          else if(d>(isTig?24:60)){m.st='rest';m.pause=16;m.tgt=null;}}}   // ★호랑이=28m 벌어지면 포기(24m는 첫 juke에 바로 포기=과너프), 늑대=60m(지구력 코싱)
      else if(m.st==='stalk'){const t=m.tgt;   // 잠행 접근(초식의 경계 반경이 자연스럽게 긴장을 만듦)
        if(!t||(t.hp!==undefined&&t.hp<=0)||t.st==='dead'||t._dead){m.st='prowl';m.tgt=null;}
        else if(t.job!==undefined){const dx=t.px-m.px,dy=t.py-m.py,d=Math.hypot(dx,dy)||1;   // ★호환: 사람 표적=잠행 후 도약 돌진(물기 경로 아님 — hurtNPC로 치사)
          if((hall0&&Math.hypot(t.px-hall0.cx,t.py-hall0.cy)<70)||!night){m.st='prowl';m.tgt=null;}   // 표적이 마을로 들어가거나·날 밝으면 포기(밤 한정)
          else if(d<14&&m.cd<=0){goCharge(m,t);}   // 도약권(~14m) → 돌진 발동
          else{m.ang=Math.atan2(dy,dx);const sp=D.spd*0.5*dt;if(!move(Math.cos(m.ang)*sp,Math.sin(m.ang)*sp))m.ang+=1;}}
        else{const dx=t.px-m.px,dy=t.py-m.py,d=Math.hypot(dx,dy)||1;m.ang=Math.atan2(dy,dx);
          if(t.st==='flee'||d<22){m.st='chase';m.stam=1;}   // 들킴·러시권(~22m) → 전력 추격(실축)
          else{const sp=D.spd*0.5*dt;if(!move(Math.cos(m.ang)*sp,Math.sin(m.ang)*sp))m.ang+=1;}}}
      else if(m.st==='rest'){m.stam=Math.min(1,m.stam+0.025*dt);if((m.pause-=dt)<=0)m.st='prowl';}
      else{m.st='prowl';m.stam=Math.min(1,m.stam+0.02*dt);
        if((slpW||m.hp<D.hp)&&m.hun<0.95&&!((m._alH||0)+4>lifeGM)){const fx=Math.floor(m.px),fy=Math.floor(m.py);   // 😴 낮잠 ★부상=시간 무관 눕기(부상 맹수가 눕는 순간이 '방심 시 재교전' 마무리 창과 맞물림) ★경계 종료 8초 내 금지
          if(TR.forest&&TR.forest[idx(fx,fy)]&&(!hall0||Math.hypot(m.px-hall0.cx,m.py-hall0.cy)>=MOB_AV0))m.st='sleep';   // 잠자리도 마을 완충 밖
          else{const wx=(g.wp?g.wp.x:m.px+Math.cos(m.ang))-m.px,wy=(g.wp?g.wp.y:m.py+Math.sin(m.ang))-m.py,wl=Math.hypot(wx,wy)||1;m.ang=Math.atan2(wy,wx);const sp=D.spd*0.5*dt;if(!move(Math.cos(m.ang)*sp,Math.sin(m.ang)*sp))m.ang+=1.5;}}
        else{if(hungry){let bt=null,bs=1e9;   // 사냥 개시: 사체 우선(스캐빈저) → 초식(부상 개체 가중 우선=약자 선별)
          for(const c of carc)if(c.rot>6){const d2=(c.px-m.px)*(c.px-m.px)+(c.py-m.py)*(c.py-m.py);if(d2<bs&&d2<al*al){bs=d2;bt=c;}}
          if(bt){m.st='feed';m.tgt=bt;}
          else{for(const p2 of preyL){if(p2.hp<=0)continue;if(D.pred===1&&p2.type==='🐗')continue;   // 늑대는 성체 멧돼지 기피(위험 대비 수지 안 맞음)
              const d2=((p2.px-m.px)*(p2.px-m.px)+(p2.py-m.py)*(p2.py-m.py))*(p2.hp<MOB_DEF[p2.type].hp?0.35:1);
              if(d2<bs&&d2<al*al){bs=d2;bt=p2;}}
            if(D.pred===2&&night&&hall0){nearIn(agrid,m.px,m.py,a=>{if(a._dead||a.state==='trading')return;const d2=(a.px-m.px)*(a.px-m.px)+(a.py-m.py)*(a.py-m.py);if(d2>=al*al)return;if(Math.hypot(a.px-hall0.cx,a.py-hall0.cy)<80)return;let near=0;nearIn(agrid,a.px,a.py,o=>{if(o!==a&&!o._dead&&((o.px-a.px)*(o.px-a.px)+(o.py-a.py)*(o.py-a.py))<2500)near++;});if(near>=1)return;const sc=d2*3;if(sc<bs){bs=sc;bt=a;}});}   /*★제한적 호환(착호 고증): 배고픈 호랑이가 밤에·마을완충(80m) 밖·반경50m 고립된 사람을 먹잇감으로. 위험 페널티 ×3 → 사슴 있으면 사슴 우선, 정말 외딴 사람만. 3명+ 몰이엔 회피(4335). ★hall0 필수 — 마을 없는 사냥랩엔 호환 없음(정주지 고유 현상)*/
            if(bt){m.st='stalk';m.tgt=bt;}}}
        if(m.st==='prowl'){   // 배회 듀티사이클: 대부분 늘어져 쉬고(4~14분) 가끔 이동 버스트(2~5분) — 실제 포식자처럼 빈둥. 웨이포인트 멀면 계속 이동
          if(m.pause>0)m.pause-=dt;
          else if((m.wkt=(m.wkt||0)-dt)>0){let dx=0,dy=0;
            if(g.n>1){const cx=g.cx-m.px,cy=g.cy-m.py,cl=Math.hypot(cx,cy)||1,ah=Math.hypot(g.ax,g.ay)||1;dx+=cx/cl*0.8+g.ax/ah*0.5;dy+=cy/cl*0.8+g.ay/ah*0.5;}
            if(g.wp){const wx=g.wp.x-m.px,wy=g.wp.y-m.py,wl=Math.hypot(wx,wy)||1;if(wl>2.5){dx+=wx/wl*0.8;dy+=wy/wl*0.8;}}
            if(dx||dy){let da=Math.atan2(dy,dx)-m.ang;while(da>Math.PI)da-=6.283;while(da<-Math.PI)da+=6.283;m.ang+=da*Math.min(1,MOB_TURN*dt);}
            m.ang+=(Math.random()-0.5)*0.2*dt;const sp=D.spd*0.45*dt;
            if(!move(Math.cos(m.ang)*sp,Math.sin(m.ang)*sp)){m.ang+=2+Math.random();if((m.blk=(m.blk||0)+1)>2){m.blk=0;const wpp=s._wp.get(m.gid);if(wpp)wpp.t=0;}}else m.blk=0;}   // 강둑 막힘 → 목적지 재선정
          else{const wl2=g.wp?Math.abs(g.wp.x-m.px)+Math.abs(g.wp.y-m.py):0;
            if(wl2>15||Math.random()<0.3)m.wkt=4+Math.random()*6;else m.pause=10+Math.random()*24;}
          if(D.pred===2&&hungry&&thrA&&td<6&&m.cd<=0){hurtNPC(thrA,NPC_DMG_TIGER,'🐯습격');m.cd=180;m.st='flee';m.fcd=24;}}}}}   // 🐯 극히 드문 낙오자 습격(긴 쿨다운) 후 숲으로 이탈
    if(scn)move(sx/scn*MOB_SEP_F*dt,sy/scn*MOB_SEP_F*dt);   // 분리 밀어냄(모든 상태) — 유한가속 필터를 거치므로 무리 내 진동 없음
    if(!m._mv&&((m._vx||0)||(m._vy||0))){const dk=Math.max(0,1-dt*1.4);m._vx*=dk;m._vy*=dk;   // ★관성 감속(follow-through): 서던 참이면 미끄러지듯 잦아들며 멈춤 — 뚝 멈춤 제거
      if(Math.abs(m._vx)+Math.abs(m._vy)>0.02){const nx2=m.px+m._vx,ny2=m.py+m._vy;if(canWalk(Math.floor(nx2),Math.floor(ny2))){m.px=nx2;m.py=ny2;}}
      m._spd=Math.hypot(m._vx,m._vy)/Math.max(0.05,dt);m._gp=(m._gp||0)+m._spd*dt*1.9;}
    else if(!m._mv)m._spd=0;
  }
  const mgrid=new Map();for(const m of s.mobs){if(m.hp<=0)continue;const k=gkey(m.px,m.py),l=mgrid.get(k);l?l.push(m):mgrid.set(k,[m]);}   // 몹 그리드(사냥꾼 근접 조회용 — 사냥꾼 수백 명이어도 일정)
  for(const a of s.agents){if(a.job!=='hunter'||a.state!=='work')continue;   // ── 사냥꾼 전투(연출) — 실제 gameRich 고갈은 lifeDayAll(L_HUNT)이 별도 담당(이중집계 X)
    if(a._carc){if(a._carc.st!=='dead'||a._carc.rot<=0){if((a._carc._bp||0)<6+MOB_DEF[a._carc.type].hp*6&&a._carc.st==='dead')s._lostK=(s._lostK||0)+1;a._carc=null;}   // ★사체 소멸(부패·늑대가 먹음) → 사냥감 손실
      else{const rdc=Math.hypot(a._carc.px-a.px,a._carc.py-a.py);
        if(rdc<1.6){a._carc._bp=(a._carc._bp||0)+dt*(1+HSK_F(a)*0.03);a.action='도살';   // ★도살 시간=3+사체크기(hp)×3분: 토끼 6·사슴 12·멧돼지 21·호랑이 45. 숙련 ×1.03/레벨 — 주 보상은 수율
          if(a._carc._bp>=6+MOB_DEF[a._carc.type].hp*6){a._carc.rot=-0.01;s._mobKills=(s._mobKills||0)+1;if(a._carc.type==='🐯'&&s.econ&&s.econ.storage)s.econ.storage.herb=(s.econ.storage.herb||0)+12;/*★호골(§9 2차): 호랑이 도축=약재 12 등가(사체크기 14의 위신·약효 프리미엄) → econ 곳간. 사냥랩(econ 없음)은 무시*/if(s.econ&&s.econ.storage){if(a._carc.type==='🦌'||a._carc.type==='🐗')s.econ.storage.bone=(s.econ.storage.bone||0)+1;else if(a._carc.type==='🐯')s.econ.storage.tigerhide=(s.econ.storage.tigerhide||0)+1;}/*★§9 3차: 대물 도축 뼈+1(활대 심 — 무기장 활 티어 투입재) · 호피+1(최고가 위신재 — 교역·위신). "호랑이는 고기가 아니라 명예와 돈"(§8). 사냥랩(econ 없음)은 무시*/const _yb=MOB_DEF[a._carc.type]?MOB_DEF[a._carc.type].hp:1;s._mobYield=(s._mobYield||0)+_yb*(1+HSK_F(a)*0.06);a.action='수확';a._carc=null;}}   /* ★도축 수율=사냥 숙련 주 보상: 사체크기(hp)×(1+0.06/레벨), 레벨10=1.6× — 숙련 도축은 덜 찢고 더 건짐 */
        continue;}}   // 사체 있으면 사냥 중단(이동은 far-AI/드라이버가 사체로 향함)
    a._acd=(a._acd||0)-dt;let best=null,bd=MOB_HUNT_R;
    {const mvd=Math.hypot(a.px-(a._lx===undefined?a.px:a._lx),a.py-(a._ly===undefined?a.py:a._ly));a._lx=a.px;a._ly=a.py;   // ★사수 자신의 정지 판정(이동 시 조준 리셋)
     a._aimT=mvd<0.05?(a._aimT||0)+dt:0;a._sp2=mvd/Math.max(0.05,dt);}a._hold=0;   /*랩단독 ★사수 실속도(소음 판정용)*/
    if(a._dvM){const cm=a._dvM;
      if(cm.hp<=0||cm.st==='dead'||((cm.st!=='charge'&&cm.st!=='huff')||cm.tgt!==a)){a._dvM=null;a._dvS=0;a._dvT=0;}
      else if(cm.st==='charge'){const dx6=cm.px-a.px,dy6=cm.py-a.py,d6=Math.hypot(dx6,dy6)||1;
        if(!a._dvT)a._dvT=lifeGM+(1.2-HSK_F(a)*0.09);   /*★회피 반응 지연=발놀림 숙련: Lv1 1.1초·Lv9 0.4초 — 지연 동안 얼음(완벽 타이밍 100% 회피의 형해화 수정: 돌진 43회 피격 0 실측)*/
        if(d6<14&&lifeGM>=a._dvT){if(!a._dvS)a._dvS=Math.random()<0.5?1:-1;const vsp=(1.25+HSK_F(a)*0.125)*dt,nx6=a.px-dy6/d6*a._dvS*vsp,ny6=a.py+dx6/d6*a._dvS*vsp;
          if(!(TR.terrain&&TR.terrain.isBlocked(Math.floor(nx6),Math.floor(ny6)))){a.px=nx6;a.py=ny6;}a.action='회피';a._hold=1;continue;}}}
    if(a._bkOff){if(lifeGM>=a._bkOff)a._bkOff=0;else{const bt2=(a._bm2&&a._bm2.hp>0&&a._bm2.st!=='dead')?a._bm2:((a._tgt&&a._tgt.hp>0)?a._tgt:null);
      if(bt2){const dxo=a.px-bt2.px,dyo=a.py-bt2.py,do2=Math.hypot(dxo,dyo)||1;
        if(do2<42){const bsp=L_WALK*0.6*dt,nxo=a.px+dxo/do2*bsp,nyo=a.py+dyo/do2*bsp;if(!(TR.terrain&&TR.terrain.isBlocked(Math.floor(nxo),Math.floor(nyo)))){a.px=nxo;a.py=nyo;}a.action='물러남';a._hold=1;continue;}
        else{a._bkOff=0;a._bm2=null;}}
      else{a._bkOff=0;a._bm2=null;}}}   /*랩단독 ★손절 후퇴 지속: 교전존과 무관하게 42m까지 기어서 이탈(사슴 시야 밖) → 진정 후 재스토킹*/   // ★돌진 읽고 옆으로 몸 던지기(발놀림=사냥 숙련) — 🐗 직선 저돌엔 통하고 🐺 민첩 돌진엔 어려움
    if(a._tgt&&(a._tgt.hp<=0||a._tgt.st==='dead'||(lifeGM-(a._tgtG||0))>240)){a._tgt=null;a._lbx=undefined;}   // ★표적 고정 해제(잡음/2시간 포기) + 흔적 리셋
    if(a._tgt){const rr=Math.hypot(a._tgt.px-a.px,a._tgt.py-a.py);if(rr<MOB_HUNT_R*2.5)best=a._tgt;else if(!(a._tgt.hp<MOB_DEF[a._tgt.type].hp&&rr<130))a._tgt=null;}   // ★한 놈 전담: 교전 참조는 55m — 단 부상 표적은 130m(포착 한계)까지 전담 유지(피 냄새). 종전 55m 하드컷이 핏자국 추적 분기를 사문화시켰음(도주 한 번=50m+)
    if(!best&&!(a._tgt&&a._tgt.hp>0&&a._tgt.st!=='dead'))nearIn(mgrid,a.px,a.py,m=>{if(m!==a._cm)return;/*★교전=커밋 표적 전용(지나가는 놈 즉석 사격 폐지 — 표적 변경은 단일 규칙로만)*/if(m.hp<=0||m.type==='🐯')return;const rr=Math.hypot(m.px-a.px,m.py-a.py);   // (고정 표적 없을 때만) 신규 표적 점수: 핏자국 ×0.55 · 방심 ×0.6 · 도주 ×2.6 후순위 · 동료 전담 ×3 회피(분산)
      const calm2=m.st==='graze'||m.st==='raid'||m.st==='prowl'||m.st==='sleep'||m.st==='feed'||m.pause>0,cl=(m._hcl&&m._hcl!==a&&!m._hcl._dead&&(lifeGM-(m._hclG||0))<20)?3:1;
      const d=rr*((m.hp<MOB_DEF[m.type].hp&&rr<MOB_HUNT_R*1.8)?0.55:1)*(calm2?0.6:((m.st==='flee'||m.fcd>0)?2.6:1))*cl;if(d<bd){bd=d;best=m;}});
    if(!best){a._eng=0;a._stH=0;if(a.action==='조준'||a.action==='저격'||a.action==='대치'||a.action==='재장전'||a.action==='접근'||a.action==='추적')a.action='수색';continue;}   /*랩단독 ★표적 상실 대기 라벨='수색'(비이동) — '접근' 라벨이 재틱 대기를 교착 지표에 오탐시키던 것*/   /*랩단독 ★라벨 스틱 수정: 표적이 빠졌는데 조준 라벨이 far-AI 재틱(최대 20유닛)까지 눌어붙던 것*/
    best._hcl=a;best._hclG=lifeGM;   // 표적 전담 등록(10분 유효 — 동료 분산용)
    const rd=Math.hypot(best.px-a.px,best.py-a.py),BD=MOB_DEF[best.type],calm=(best.st==='graze'||best.st==='raid'||best.st==='prowl'||best.st==='sleep'||best.st==='feed'||best.pause>0)&&!(best.fcd>0);/*★feed=방심(먹는 데 정신 팔림 — 사체 미끼 매복 저격의 근거)*/   // 잠든 놈=최고의 잠행 표적. ★도주 직후 숨 고르기(fcd 잔여+pause)는 방심 아님 — 고개 들고 사수 주시(경계): string jump 유효·정지 문턱 1.5
    if(rd<(best.st==='sleep'?2.6:MOB_CATCH_R)&&a._acd<=0&&(a.hp===undefined||a.hp>=NPC_MELEE_HP)){a._acd=3.2;best.hp-=calm?3:1;best.fcd=12;a.action='사냥';   /*랩단독 ★잠든 표적 리치 2.6m: 기상 반경(2.5)이 창 리치(2.0)보다 길어 '깨우기만 하고 못 찌르던' 역전 수정 — 깨는 순간 이미 창이 닿는다*/   // 근접타: 방심한 상대=급소(×3). ★다친 사냥꾼(hp<75)은 근접 안 붙고 활만 — 재부상 나선 차단(나감/안 나감 미시 균형)
      if(best.hp<=0){s._kM=(s._kM||0)+1;kill(best);best.rot=60+BD.hp*8;/*★부패=크기 비례(대물 도축 45분 확보)*/best._hk=a;a._carc=best;a._tgt=null;a.action='명중';}   // ★즉시 포획 아님: 사체(40분 유지)를 걸어가 도살해야 수확 — 그 전에 늑대가 먹거나 썩으면 손실
      else{a._tgt=best;a._tgtG=lifeGM;a._lbx=best.px;a._lby=best.py;   // ★생존 → 표적 고정(끝까지 전담)
        if(BD.brave>0&&Math.random()<BD.brave*best.tmp*0.45)goCharge(best,a);}}   // ★부상 멧돼지·늑대의 반격 — 무장한 사냥꾼 상대론 위축(×0.45 ≈ 최종 ~28%)
    else if(best.st!=='sleep'&&rd<MOB_HUNT_R*(a._eng?1.18:1)){a._eng=1;   // ★교전 존(진입 22m·이탈 26m 히스테리시스): 절차 ①표적 멈춤 확인 ②사수 정지 ③시위 충전 ④발사. (잠든 표적은 근접 급소로)
      const stTh=calm?0.8:0.6,_sRaw=(best._spd||0)<(a._stH?stTh+0.5:stTh);a._stH=_sRaw?1:0;   /*랩단독 ★정지 판정 3차 교정: 종전 히스테리시스(+2)가 '유지' 구멍 — 조준 진입 후 사슴이 5.5(화면 2.75m/s)로 걸어 나가도 조준·발사 유지됐음. 이제 방심 1.6/해제 2.6·경계 1.2/2.2 — 보이는 보행=즉시 조준 해제*/
      a._bStil=_sRaw?(a._bStil||0)+dt:Math.max(0,(a._bStil||0)-dt*2);const stl=_sRaw&&a._bStil>=5;a._hold=stl?1:0;/*랩단독 ★정지 확인 5유닛(사용자 지정) — 잔걸음은 완전 리셋 대신 2배속 감쇠(연속 5초를 영영 못 채우는 교착 방지). 발사 순간 정지(_sRaw)는 불변*/   /*랩단독 ★완전 정지 '확인': 표적이 2유닛 연속 멈춰 있는 걸 보고 나서야 조준 개시(멈추는 척에 활 안 듦)*/   // ★정지 문턱: 방심=3.5(멈춰 뜯는 중 + 잔걸음까지 — 화면 ~1.75m/s. 종전 6은 어슬렁 보행(3m/s)에도 조준하는 시각 부조화) vs 도주·경계=1.5(완전 정지). 1.5 전면 적용은 가감속 노이즈로 '조준 70% 마비' 전력 — 히스테리시스 +2
      if(!stl){a._alW=0;a.action=((a._sp2||0)<((a.action==='주시')?0.6:0.18))?'주시':(a.sneak?'잠행':'추적');}/*★주시 라벨 히스테리시스: 잠행 가다서다가 0.25 문턱을 스치며 잠행↔주시 진동(78회/4일)*/   /*랩단독 ★존 안 표적 대기: 사수가 실제로 서서 기다리면 '주시'(정지 확인 카운트 중) — 걷는 중엔 잠행/추적. 5초 확인 도입으로 늘어난 정당 대기가 교착 지표에 오탐되던 것 정리*/
      else if(!(calm||best.hp<BD.hp)&&(a._alW=(a._alW||0)+dt)>8){a._bkOff=lifeGM+28;a._bm2=best;a._alW=0;}   /*랩단독 ★눈싸움 손절 → 지속 후퇴 상태 발령(아래 블록이 42m까지 완주 — 종전엔 26m 존 경계 이탈 순간 리셋돼 조준↔물러남 진동)*/
      else if(BD.atk>0&&(()=>{let al2=0,na=null,nd=1e9;const R7=a._mzOK?18:12;/*★몰이 히스테리시스: 성립 12/해제 18(동일 문턱=사격↔집결 진동)*/for(const o of s.agents){if(o===a||o._dead||o.job!=='hunter')continue;const d7=Math.abs(o.px-a.px)+Math.abs(o.py-a.py);if(d7<R7)al2++;if(d7<nd){nd=d7;na=o;}}
        if(al2>=1)a._mzT=lifeGM+10;if(al2>=1||((a._mzT||0)>lifeGM)){a._mzOK=1;return false;}a._mzOK=0;/*★몰이 시간 래치 10초: 수렴-발산 루프 차단, 단독 고립은 짧게*/   // 몰이 성립 → 사격 절차로
        a.action='집결';a._hold=0;if(na){const dx7=na.px-a.px,dy7=na.py-a.py,d8=Math.hypot(dx7,dy7)||1,mv7=Math.min(d8,L_WALK*1.25*dt);
          const nx7=a.px+dx7/d8*mv7,ny7=a.py+dy7/d8*mv7;if(!(TR.terrain&&TR.terrain.isBlocked(Math.floor(nx7),Math.floor(ny7)))){a.px=nx7;a.py=ny7;}}return true;})()){}   // ★위험 종 사격은 동료 1+ 대동 — 부족하면 가장 가까운 동료에게 걸어가 합류(라벨만 붙이고 서 있던 교착 수정)
      else if(!(calm||best.hp<BD.hp)||losRk(a.px,a.py,best.px,best.py)){if(a.action!=='저격')a.action='대치';}   /*★사선 미확보(바위)도 대치 — 8초 손절·후퇴가 자동으로 각을 바꿔줌*/   /*랩단독 ★경계 표적 진정 대기=대치(최대 8유닛 후 손절 후퇴) — 조준 라벨과 분리*/
      else if(!(a._acd<=0&&a._aimT>=4.0-HSK_W(a)*0.14)){if(a.action!=='저격')a.action=a._acd>0?'재장전':'조준';}   /*랩단독 ★재장전(6유닛)·조준(시위 1.4~1.9유닛) 분리 — '조준 10초' 착시 제거*/
      else{a._alW=0;a._acd=12;if(BD.pred===2){a._bkOff=lifeGM+20;a._bm2=best;}/*★호랑이=쏘고 즉시 물러나기(치고 빠지기): 커밋 고착 후 18m 소모전 지속 노출→돌진 사망 3/3일(H15 위반) — 발사마다 후퇴 발령, 다시 누우면 재접근*/const sk=HSK_W(a),pc=Math.max(0.3,0.80+sk*0.015-rd*0.009);   // ★숙련 반영 명중률(정지 표적·조준 완료): 20m 레벨0 62%→레벨5 69%→레벨10 77%, 10m 71~86% — 궁술은 수련. 어려운 건 여전히 접근
        const _sz=Math.min(1,Math.pow(BD.r,1.7));   // ★표적 크기 보정 r^1.7: 사슴 1·토끼 0.44·늑대 0.92 — 활로 토끼가 어려운 건 물리(그래서 실제론 덫이 정도)
        const ph=Math.min(0.95,_sz*(calm?pc:pc*(best.hp<BD.hp?0.45:0.25))*(best.hp<BD.hp?1.3:1)),hit=Math.random()<ph;   // 경계 표적=string jump ×0.25(활 유효사거리가 짧은 실제 이유), ★부상 표적은 회피 둔화 ×0.45 — 출혈 피로로 몸을 못 던짐. 부상 보정 ×1.3, 명중 선판정+착탄 재검(비유도)
      const T=Math.max(0.1,rd/MOB_ARROW_V)/*랩단독 ★최소비행 0.5→0.1유닛: 옛 클램프가 50m 이내 전 사격을 1초(실전)로 고정 — 실효 20m/s로 명목(50m/s)의 40%였음. 이제 20m=0.4초 진짜 50m/s*/,bs2=Math.hypot(best._vx||0,best._vy||0);   // 비행시간 + ★리드 = 실측 속도(관성 필터 뒤 실제 이동 벡터) × 비행시간 — 질주·속보·출혈 감속이 자동 반영(상태 추정 리드는 질주 도입 후 계속 빗나갔음)
      const axp=best.px+(bs2>1e-3?best._vx/bs2:0)*(best._spd||0)*T*0.9,ayp=best.py+(bs2>1e-3?best._vy/bs2:0)*(best._spd||0)*T*0.9;
      const aer=(best._spd||0)*T*0.55;   // ★조준 오차 ∝ 표적 속도×비행시간: 방심(정지)=정확, 질주자=리드가 크게 흔들려 자주 빗겨감 — 실측 리드의 저격수화 방지
      const ix=hit?axp+(Math.random()-0.5)*aer:axp+(Math.random()-0.5)*(4+aer),iy=hit?ayp+(Math.random()-0.5)*aer:ayp+(Math.random()-0.5)*(4+aer);
      let cc=false;if(hit&&BD.brave>0){let grp=0;if(BD.pred)for(const o of s.agents)if(!o._dead&&o.job==='hunter'&&Math.abs(o.px-a.px)+Math.abs(o.py-a.py)<10)grp++;   // ★몰이: 사수 곁 3인+이면 맹수가 돌진 못 함(협동사냥의 가치)
        cc=Math.random()<BD.brave*best.tmp*(BD.pred?(grp>=3?0.08:(BD.pred===2&&best.hp<BD.hp?0.75:(BD.pred===1?0.5:0.35))):(rd<8?0.3:0));}   /* ★부상 🐯=역습 75%(사냥감이 아니라 재앙 — 몰이 3인만이 억제) · 🐺 0.5 */   // ★반격 선판정: 초식=근거리 피격 시만, 맹수=원거리 화살에도 사수에게 돌진
      (s._fx=s._fx||[]).push({x1:a.px,y1:a.py,x2:ix,y2:iy,T:T,t:T,h:hit,tg:best,dmg:(calm?2:1)*(s.econ&&s.econ._bowQ||1)/*★활 티어(§9 3차): 데미지=장비(제작 품질) 몫(§6) — 마을 활 품질 ×1.0~1.25(발수 보존: 사슴2·멧돼지3 유지, 호랑이만 7→6발). 랩(econ 없음)=1*/,cc:cc,a:a});s._shots=(s._shots||0)+1;if(hit)s._hitsN=(s._hitsN||0)+1;a.action='저격';}}
    else{a._eng=0;a._stH=0;a._alW=0;a.action=a.sneak?'잠행':(best.st==='flee'?'추적':'접근');}}   // ★추적(달리기 2×)=진짜 도주(flee) 전용. ★경계(fcd 잔여)는 도주가 아님 — 접근/잠행 유지(경계 사슴에 달려들면 스스로 도주 트리거: 55m 개시 후 관측된 무한 추격 루프의 주범)
  if(s._fx&&s._fx.length){for(const q of s._fx){q.t-=dt;   // ★화살 비행 → 착탄 처리(피해·반격·놀람은 화살이 닿는 순간)
    if(q.t>0&&!q.done){const pr2=1-q.t/(q.T||1),ax2=q.x1+(q.x2-q.x1)*pr2,ay2=q.y1+(q.y2-q.y1)*pr2;   // ★휙— 스침 감지: 비행 중 화살 2.5m 안의 동물(표적이든 옆의 무리원이든)은 45%로 놀라 튐(빗맞아도 조용하지 않음)
      if(pr2>0.15)for(const m2 of s.mobs){if(m2.hp<=0||m2.st==='flee'||m2.fcd>0)continue;const ddx=m2.px-ax2,ddy=m2.py-ay2,_zg=MOB_DEF[m2.type].zig,_w2=ddx*ddx+ddy*ddy;if(_w2>(_zg?16:6.25))continue;
        if(!q._wz)q._wz=new Set();if(q._wz.has(m2))continue;q._wz.add(m2);if(Math.random()<(_zg?(_w2<4?0.9:0.55):(_w2<1.44?0.45:0.18))){m2.fcd=12;(s._fW=s._fW||{}).whizz=(s._fW.whizz||0)+1;}}/*계측*/}   // 개체당 1발 1회 판정 — 귓전(1.2m) 45%·근처 통과 18%(살깃 소리는 늘 알아채진 못함). 질주는 도주 진입이 자동 발동
    if(q.t<=0&&!q.done){q.done=1;const tg=q.tg;
      if(TR.rock){const dq=Math.hypot(q.x2-q.x1,q.y2-q.y1),nq=Math.ceil(dq);for(let iq=1;iq<nq;iq++){const tq=iq/nq,xx=Math.floor(q.x1+(q.x2-q.x1)*tq),yy=Math.floor(q.y1+(q.y2-q.y1)*tq);if(inG(xx,yy)&&TR.rock[idx(xx,yy)]){q.x2=q.x1+(q.x2-q.x1)*tq;q.y2=q.y1+(q.y2-q.y1)*tq;q.h=false;break;}}}   /*★화살 바위 차단: 벽에 박힘*/
      {const dq2=Math.hypot(q.x2-q.x1,q.y2-q.y1),nq2=Math.max(2,Math.ceil(dq2/1.2));let icp=null,icT=1;   /*★몸통 콜라이더: 비행 선분의 첫 몸이 가로챔 — 겹친 사슴은 가까운 놈이 맞고, 빗나간 화살도 몸엔 박힘*/
        for(let iq=1;iq<=nq2&&!icp;iq++){const tq=iq/nq2,ax9=q.x1+(q.x2-q.x1)*tq,ay9=q.y1+(q.y2-q.y1)*tq;
          for(const m9 of s.mobs){if(m9.hp<=0||m9.st==='dead'||m9.st==='hide')continue;const r9=MOB_DEF[m9.type].r*1.3;
            if(Math.abs(m9.px-ax9)<r9&&Math.abs(m9.py-ay9)<r9){icp=m9;icT=tq;break;}}}
        if(icp&&icp!==q.tg){q.x2=q.x1+(q.x2-q.x1)*icT;q.y2=q.y1+(q.y2-q.y1)*icT;q.tg=icp;q.h=true;q.dmg=(((icp.st==='graze'||icp.st==='raid'||icp.st==='prowl'||icp.st==='sleep'||icp.pause>0)&&!(icp.fcd>0))?2:1)*(s.econ&&s.econ._bowQ||1)/*★활 티어(§9 3차) — 가로챈 몸에도 같은 활*/;q.cc=false;}}
      for(const m3 of s.mobs){if(m3.hp<=0||m3.st==='flee'||m3.fcd>0||(q.h&&m3===tg))continue;const dx3=m3.px-q.x2,dy3=m3.py-q.y2,_z3=MOB_DEF[m3.type].zig,_w3=dx3*dx3+dy3*dy3;if(_w3>(_z3?16:6.25))continue;
        if(Math.random()<(_z3?(_w3<4?0.9:0.55):(_w3<1.44?0.45:0.18))){m3.fcd=12;(s._fW=s._fW||{}).impact=(s._fW.impact||0)+1;}}   // ★착탄 소음(계측): 화살이 땅에 박히는 소리에 주변 놀람 — 20m 단거리는 1프레임 착탄이라 비행 스침 체크가 못 돌던 구멍. 🐇=4m·55~90%(한 발 실패=무리째 굴로)
      if(q.h&&tg&&tg.hp>0&&tg.st!=='dead'&&Math.abs(tg.px-q.x2)+Math.abs(tg.py-q.y2)<1.6*MOB_DEF[tg.type].r){/*★착탄 유효반경=몸통 크기(사슴 1.6 유지·토끼 1.0)*/tg.hp-=q.dmg;tg.fcd=20;   // ★유도탄 금지: 화살은 조준점(리드 예측)에 떨어질 뿐 — 표적이 비행 중 벗어났으면 회피(방심·직선 이동은 리드가 맞아 명중, 갈지자·급변침은 빠져나감)
        if(tg.hp<=0){s._kA=(s._kA||0)+1;kill(tg);tg.rot=60+MOB_DEF[tg.type].hp*8;if(q.a&&!q.a._dead){tg._hk=q.a;q.a._carc=tg;q.a.action='명중';q.a._tgt=null;}}   // ★사체 클레임 — 도살하러 가야 함
        else{if(q.a&&!q.a._dead&&!(q.a._tgt&&q.a._tgt!==tg&&q.a._tgt.hp>0&&q.a._tgt.st!=='dead')){q.a._tgt=tg;q.a._tgtG=lifeGM;q.a._lbx=tg.px;q.a._lby=tg.py;}/*랩단독 ★기존 전담이 살아있으면 lock 덮어쓰기 금지(이놈저놈 찔끔 봉인). 부상 대기 제거 — 즉시 자국 추적(72m 포복 수정으로 재도주 트리거 해소됨)*/   // ★피 냄새: 부상 입힌 사수는 이 개체를 끝까지 전담(마무리 책임)
          if(q.cc){goCharge(tg,q.a);if(tg.type==='🐺')for(const o2 of s.mobs){if(o2===tg||o2.type!=='🐺'||o2.hp<=0||o2.st==='dead'||o2.gid!==tg.gid)continue;if(Math.abs(o2.px-tg.px)+Math.abs(o2.py-tg.py)<25){goCharge(o2,q.a);break;}}}}}   /* ★🐺 협공: 팩원 1마리 동시 돌진(양방향 포위 — 혼자 늑대 팩 건드리면 감당 못 함) */
      else if(tg&&tg.hp>0&&tg.st!=='dead'&&Math.abs(tg.px-q.x2)+Math.abs(tg.py-q.y2)<5){if(q.h)s._dodgeN=(s._dodgeN||0)+1;if(Math.random()<0.5){tg.fcd=14;(s._fW=s._fW||{}).nearMiss=(s._fW.nearMiss||0)+1;}}}}   // 회피/빗나감 — 곁에 박힌 화살 소리에 놀라 멀리 이탈(50%)
    s._fx=s._fx.filter(q=>q.t>-0.6);}   // 착탄 후 0.6분 잔상(빗나간 화살이 땅에 박혀 있음)
  if(s._blood&&s._blood.length){for(const b of s._blood)b.t-=dt;s._blood=s._blood.filter(b=>b.t>0);}   // 핏자국 증발(45분)
  reapDead(s);   // ★사망자 정리(agent 제거 + 인구 감소)
}

// =============================================================================
// ═══ [C] 본체 브리지 — 여기부터는 블록이 아니라 이식 어댑터(zone.js 접합부) ═══
// =============================================================================
const ENABLED = process.env.ENABLE_WILDLIFE !== '0';   // 기본 켜짐. '0'만 완전 no-op (ENABLE_VILLAGES 패턴)

// 랩 종 → 본체 animals.js 카탈로그 id (클라 렌더·사체 drops가 카탈로그 기반이라 본체 파이프 그대로 탐).
// hp 스케일: 랩 hp ×10 ≈ 카탈로그 hp (사슴 3→30, 토끼 1→10, 멧돼지 6→60, 늑대 4→40, 호랑이 14→140≈130).
const MAIN_TYPE = { '🦌': 'deer', '🐇': 'arctic_hare', '🐗': 'wild_boar', '🐺': 'wolf', '🐯': 'tiger' };
const HP_SCALE = 10;

const H = {};                       // zone.js 주입(호스트)
let _ready = false;
const S = { mobs: [], agents: [], gameRich: new Map(), crop: new Map(), forestCells: [], day: 0, V: null };
let _viewRect = { x0: 0, x1: 0, y0: 0, y1: 0 };
let _rockM = null, _forM = null;    // 셀 lazy 메모(0=미계산 1=아님 2=맞음)
const _chunkForest = new Map();     // chunkKey → [{cx,cy}...] (지형 정적 — 청크 단위 캐시)
let _activeSig = '', _setVer = 0, _dayI = 0;
const _proxies = new Map();         // pid → agent 프록시 (지속 객체 — 몹 m.tgt 참조가 tick을 넘어 살아있어야 함)
const _shadows = new Map();         // mid → 본체 mobs 브리지(shadow)
const _gidSeen = new Set();         // 무리 스폰 로그 1회용
let _nextWid = 1, _tickAgents = []; // _tickAgents: 이번 틱 프록시 스냅샷(reapDead splice와 무관하게 피해 정산)
let _warProxyPool = null;           // §4-4 P3: 실체 전쟁 병사 위협 프록시 풀(warThreats 주입 — GC 최소, index 재사용)
const _stats = { ms: 0, peak: 0, ticks: 0, spawned: 0, deaths: 0, hits: 0, charges: 0, flees: 0, maxSpd: {} };
let _lastStatLog = 0;

// ★어댑터 주입점: 랩 카메라 뷰 → 본체 '활성 청크 bbox'(셀). 블록 텍스트 무수정 — 함수 선언 바인딩 재할당.
//   (랩 원본 _mobView도 전역 view/CELL을 typeof 가드로 읽는 주입 설계 — 본체에선 이 재바인딩이 그 주입.)
_mobView = function () { return _viewRect; };

// 마을 셀 좌표 목록(시뮬+레거시 — 서식 밴드 필터 기준). 지형·마을은 부팅 후 정적 → 1회 구축.
let _vilCells = null;
function _villageCells() {
  if (_vilCells) return _vilCells;
  _vilCells = [];
  const sim = (H.simVillages && H.simVillages()) || null;
  if (sim) for (const v of sim) _vilCells.push({ cx: v.cx, cy: v.cy });
  if (H.legacyVillages) for (const v of H.legacyVillages) _vilCells.push({ cx: v.x / 32, cy: v.y / 32 });
  return _vilCells;
}

// 활성 청크 스캔(1회 캐시): 숲 셀 목록 + rock/forest 격자 eager 채움(0/1 — TR가 플레인 배열로 조회).
//   ★서식 밴드: 랩과 동일 실체 — 블록의 s.huntCells 주입점에 '전 마을 100m(MOB_AV0) 완충 밖 숲'을 공급.
//   (뷰가 마을을 품으면 근처 숲이 전부 완충 안 → 서식지 0 = 취락 주변 야생 공백(고증). dfOf 소프트 회피는
//   앵커 마을만 알지만 이 필터는 전 마을 하드 컷 — 랩 '마을 안 하드 제외 huntCells'의 본체 등가물.)
//   ★비용: 지형 판정 ~12-16ms/청크(1024셀) — 한 틱에 다 하면 히치. 행 슬라이스 큐로 틱당 ≤4ms 상환,
//   청크 하나 끝날 때마다 서식지 재합성(스폰이 점진 개시 — 텔레포트 후 풀 뷰 ~2-3초).
let _scanQ = [];   // [{key,cx,cy,row,band[]}] — 뒤에서 꺼냄
function _enqueueScans(keys) {
  _scanQ.length = 0;
  for (const k of keys) if (!_chunkForest.has(k)) { const p = k.split('_'); _scanQ.push({ key: k, cx: +p[0], cy: +p[1], row: 0, band: [] }); }
}
function _stepScans() {
  if (!_scanQ.length) return false;
  const t0 = Date.now(), cc = H.chunkManager.chunkSize / 32, vils = _villageCells(), AV2 = MOB_AV0 * MOB_AV0;
  let done = false;
  while (_scanQ.length && Date.now() - t0 < 4) {
    const j = _scanQ[_scanQ.length - 1], y = j.cy * cc + j.row;
    if (y < NY) for (let x = j.cx * cc, xe = Math.min(NX, j.cx * cc + cc); x < xe; x++) {
      const i = y * NX + x, px = x * 32 + 16, py = y * 32 + 16;
      _rockM[i] = H.isRockTileLocal(px, py) ? 1 : 0;
      const f = H.terrainMod.getForestMultiplier(H.ZONE_ID, px, py) > 1.5;
      _forM[i] = f ? 1 : 0;
      if (!f) continue;
      let inBuf = false;
      for (const v of vils) { const dx = x - v.cx, dy = y - v.cy; if (dx * dx + dy * dy < AV2) { inBuf = true; break; } }
      if (!inBuf) j.band.push({ cx: x, cy: y });
    }
    if (++j.row >= cc) {
      if (_chunkForest.size > 4096) _chunkForest.clear();   // 메모리 봉인(장기 운행 시 존 전체 캐시 방지)
      _chunkForest.set(j.key, { band: j.band });
      _scanQ.pop(); done = true;   // 청크 완성 — 서식지 재합성 신호
    }
  }
  return done;
}

// 서식지 재합성: 활성 청크의 캐시된 밴드 셀 합집합 → 블록의 huntCells 우선 경로(src=huntCells)로 주입.
//   forestCells도 같은 밴드: huntCells가 비면 블록 폴백(src=forestCells)이 완충 안 숲으로 되돌아가
//   마을 옆 스폰이 부활하는 구멍을 막는다(밴드 0 = 스폰 0 = 취락 야생 공백).
function _rebuildHabitat(keys) {
  const fc = [];
  for (const k of keys) { const e = _chunkForest.get(k); if (e) for (const c of e.band) fc.push(c); }
  S.huntCells = fc;
  S.forestCells = fc;
  S._wild = null; _setVer++;   // 서식지 재계산 트리거(블록 if(!s._wild) 경로) + _vfs 서명 무효화
}

// 마을 완충(MOB_AV0/AV1) 기준점: 뷰 중심 최근접 마을(시뮬 마을 → 없으면 레거시 마을) — 랩은 단일 마을 설계라
//   hall 하나만 받음. 다마을 존에선 '뷰에 가장 가까운 마을'로 근사(뷰=플레이어 주변이므로 체감상 정확). §인계.
function _updateVillageAnchor() {
  const vcx = (_viewRect.x0 + _viewRect.x1) / 2, vcy = (_viewRect.y0 + _viewRect.y1) / 2;
  let best = null, bd = Infinity;
  const sim = (H.simVillages && H.simVillages()) || null;
  if (sim) for (const v of sim) { const d = (v.cx - vcx) * (v.cx - vcx) + (v.cy - vcy) * (v.cy - vcy); if (d < bd) { bd = d; best = { cx: v.cx, cy: v.cy }; } }
  if (H.legacyVillages) for (const v of H.legacyVillages) { const cx = v.x / 32, cy = v.y / 32, d = (cx - vcx) * (cx - vcx) + (cy - vcy) * (cy - vcy); if (d < bd) { bd = d; best = { cx, cy }; } }
  if (best) { if (!S.V) S.V = { hall: { cx: 0, cy: 0 } }; S.V.hall.cx = best.cx; S.V.hall.cy = best.cy; }
  else S.V = null;   // 마을 0 → 완충 없음(자유 서식)
}

// ── 본체 mobs 브리지(shadow) ──
// ═══ [C] ★사냥꾼 두뇌 — 전쟁실험실 7998~8037 이식(생활 층 100% 마감) ═══
//   블록(287행~)은 a._bm(표적)·a.sneak·a._carc를 '소비'하는 실행층(조준·사격·근접·도살·회피) — 원문 무수정 원칙.
//   여기는 그걸 '정하는' 두뇌: 사냥 우선순위 = 회수(내 사체) > 부상 lock 추적(핏자국) > 커밋 표적 > 신규 스캔
//   (경제화 스코어: (거리+30)×상태×위험÷수율) > 사냥터 밀도 셀 수색. 잠행 판정·프레임 가드(몰림 감지·갈아타기·
//   잠행 히스테리시스)까지 랩 동형. 이동은 본체 소유(좌표 단일 작성자): moveTo 대신 목표 셀 기록(_hgx/_hgy) →
//   tick()이 본체 npc.targetX/Y로 역전달(경로 스무딩·벽·물은 zone.js 이동층 담당). 치환: life→s · dGM→dt ·
//   a._fgl(econ 식량 잉여 가중)=0 폴백(식 유지 — 미연결 시 무효과).
function _hunterBrain(a, s, dt) {
  const bMoveTo = (a2, cx, cy) => { a2._hgx = cx; a2._hgy = cy; a2._hgo = 1; return true; };   // 목표 기록(성공은 본체 경로층이 판정 — stuck·재경로 흡수)
  // ── 프레임 가드(랩 8030~8037 — dwell 무관 매 프레임) ──
  if (a._bm) {
    const b2 = a._bm, ded = b2.hp <= 0 || b2.st === 'dead', fle = b2.st === 'flee';
    if (b2.st === 'flee' || b2.fcd > 0) { if ((a._cpt = (a._cpt || 0) - dt) <= 0) { a._crn = (a._cpx !== undefined && Math.hypot(b2.px - a._cpx, b2.py - a._cpy) < 6 && Math.hypot(b2.px - a.px, b2.py - a.py) < 30) ? 1 : 0; a._cpx = b2.px; a._cpy = b2.py; a._cpt = 4; } } else { a._crn = 0; a._cpx = undefined; }   /*★몰림 감지*/
    if (!ded && b2 !== a._tgt && (b2.st === 'flee' || b2.fcd > 0) && Math.hypot(b2.px - a.px, b2.py - a.py) > 60) {   /*★부상 lock(핏자국)은 예외 — 무조건 끝까지*/ /*★유일한 갈아타기: 표적이 도주로 60m+ 벌어짐 → 근처(55m) 방심 사슴 체크*/
      let sw = null, sd = 1e9;
      for (const m2 of s.mobs) {
        if (m2 === b2 || m2.hp <= 0 || m2.st === 'dead' || m2.st === 'hide' || MOB_DEF[m2.type].pred) continue;
        if (!((m2.st === 'graze' || m2.st === 'prowl' || m2.st === 'sleep' || m2.pause > 0) && !(m2.fcd > 0))) continue;
        const r2 = Math.hypot(m2.px - a.px, m2.py - a.py); if (r2 < 55) { const s2 = (r2 + 30) / Math.pow(MOB_DEF[m2.type].hp, 0.7); if (s2 < sd) { sd = s2; sw = m2; } }
      }
      if (sw) { a._cm = sw; a._bm = sw; a.dwell = 0; }
    }
    const _sn2 = (b2.hp < MOB_DEF[b2.type].hp) ? 72 : Math.min(MOB_SNEAK_IN, MOB_DEF[b2.type].alert * 1.2);
    const d2b = ded ? 1e9 : Math.hypot(b2.px - a.px, b2.py - a.py), want = !ded && !fle && d2b < _sn2 + (a.sneak ? 8 : 0);
    if (want !== a.sneak) { a.sneak = want; a.dwell = Math.min(a.dwell || 0, 0.5); }   // ★프레임 잠행 가드: 낡은 플래그로 기어가거나 도주 링까지 걸어 들어가는 것 방지 — 전환 즉시 재계획
  }
  // ── 재조준(랩 7998~8022 — 사냥 우선순위: 회수 > 전담 추적 > 신규 표적 > 밀도 셀 수색) ──
  if ((a.dwell = (a.dwell || 0) - dt) > 0) return;
  if (a._carc && a._carc.st === 'dead' && a._carc.rot > 0) { a.sneak = false; a._bm = null; bMoveTo(a, Math.round(a._carc.px), Math.round(a._carc.py)); a.action = '회수'; a.dwell = 8; return; }   // ★내 사냥감 사체로 직행(도살·수확은 전투 루프. 부패·늑대와 시간 싸움)
  let best = null, bm = null;
  if (s.mobs && s.mobs.length) {
    let bd = 1e9;   // ★원거리 발견(포착 130m)
    if (a._tgt && a._tgt.hp > 0 && a._tgt.st !== 'dead' && Math.hypot(a._tgt.px - a.px, a._tgt.py - a.py) < (a._tgt.hp < MOB_DEF[a._tgt.type].hp ? 130 : MOB_HUNT_R * 2.5)) bm = (MOB_DEF[a._tgt.type].pred && !((a._tgt.st === 'sleep' || a._tgt.st === 'feed' || a._tgt.st === 'rest' || a._tgt.pause > 0) && !(a._tgt.fcd > 0))) ? bm : a._tgt;   // ★부상 lock: 초식=끝까지 · 맹수=방심일 때만 재교전
    if (!bm && a._cm && a._cm.hp > 0 && a._cm.st !== 'dead' && a._cm.st !== 'hide' && lifeGM - (a._cmG || 0) < 60 && (!MOB_DEF[a._cm.type].pred || a._cm.st === 'sleep' || a._cm.st === 'feed' || a._cm.st === 'rest' || a._cm.pause > 0)) bm = a._cm; else if (!bm) a._cm = null;   /*★무부상 커밋 손절 60초 — 죽거나 잃기 전엔 자동 재평가 없음*/
    if (!bm) {
      for (const mo of s.mobs) {
        if (mo.hp <= 0 || mo.type === '🐯' || mo.st === 'hide') continue; if (losRk(a.px, a.py, mo.px, mo.py)) continue; /*★포착=시야 확보만*/ const MD3 = MOB_DEF[mo.type];
        const rr = Math.hypot(mo.px - a.px, mo.py - a.py);
        const calm3 = mo.st === 'graze' || mo.st === 'raid' || mo.st === 'prowl' || mo.st === 'sleep' || mo.st === 'feed' || mo.pause > 0;
        if (MOB_DEF[mo.type].pred && !(mo.st === 'sleep' || mo.st === 'feed' || mo.st === 'rest' || (mo.pause > 0 && mo.st !== 'stalk' && mo.st !== 'chase'))) continue;   /*★맹수 커밋=진짜 취약 상태만(사체 미끼·취침 기회 사냥)*/
        const cl3 = (mo._hcl && mo._hcl !== a && !mo._hcl._dead && (lifeGM - (mo._hclG || 0)) < 20) ? (MD3.atk > 0 ? 0.5 : 3) : 1;   // ★위험 종=동료 표적에 수렴(협동), 초식=분산
        const wnd3 = mo.hp < MD3.hp && rr < MOB_HUNT_R * 1.8;
        if (rr > (wnd3 ? MOB_HUNT_R * 1.8 : (calm3 ? 216 : ((mo.st === 'flee' || mo.fcd > 0) ? 50 : 130)) * Math.pow(0.85, losFT(a.px, a.py, mo.px, mo.py) / 4))) continue;   /*★반경 게이트=지각 한계 × 숲 감쇠(4m당 0.85)*/
        const d = (rr + 30) * (wnd3 ? 0.55 : 1) * (calm3 ? 0.6 : ((mo.st === 'flee' || mo.fcd > 0) ? 2.6 : 1)) * cl3 * (1 + MD3.atk * 0.8) / (Math.pow(MD3.hp, 0.7) * (MD3.atk ? 1 : (1 - 0.5 * (a._fgl || 0))));   /*★표적 경제화: 가까운 토끼보다 60m 사슴, 사슴 멀면 멧돼지가 창발*/
        if (d < bd) { bd = d; bm = mo; }
      }
      if (bm) { if (a._cm !== bm) a._cmG = lifeGM; a._cm = bm; }
    }
    if (bm) {
      bm._hcl = a; bm._hclG = lifeGM; a._onTrail = false; const dx = a.px - bm.px, dy = a.py - bm.py, dd = Math.hypot(dx, dy) || 1;
      if (bm === a._tgt && bm.hp < MOB_DEF[bm.type].hp && dd > 26) {   /*★추종 26m — 부상 표적 60m 밖=눈에서 사라짐 → 핏방울을 순서대로 밟아 추적*/
        const bb = nextBlood(s, a, bm);
        if (bb) { best = { cx: Math.round(bb.x), cy: Math.round(bb.y) }; a._onTrail = true; a._lbx = bb.x; a._lby = bb.y; }
        else if (a._lbx !== undefined && Math.hypot(a._lbx - a.px, a._lby - a.py) > 3) { best = { cx: Math.round(a._lbx), cy: Math.round(a._lby) }; a._onTrail = true; }   // 다음 방울이 없으면 마지막 자국 지점까지
        else { a._tgt = null; a._lbx = undefined; bm = null; }   /*★자국 끊김=진짜 놓침 — 실위치 직행(ESP) 금지, 수색 전환*/
      }
      if (bm && !best) {
        const fin = MOB_DEF[bm.type].atk === 0 && ((bm === a._tgt && bm.hp < MOB_DEF[bm.type].hp && bm.st === 'flee') || (a._crn && (bm.st === 'flee' || bm.fcd > 0)));   /*★마무리 돌입=초식 전용(부상 도주·몰림)*/
        const so = (bm.st === 'sleep' || fin) ? 0 : (dd < MOB_HUNT_R * 0.6 ? MOB_HUNT_R * 0.92 : Math.min(dd, MOB_HUNT_R * 0.92));
        best = { cx: Math.round(bm.px + dx / dd * so), cy: Math.round(bm.py + dy / dd * so) };   // 20m 잠복 간격, 잠든 표적만 바짝(급소)
      }
    }
  }
  a._bm = bm || null; const _snR = (bm && bm.hp < MOB_DEF[bm.type].hp) ? 72 : (bm ? Math.min(MOB_SNEAK_IN, MOB_DEF[bm.type].alert * 1.2) : MOB_SNEAK_IN);   /*★부상 표적=72m부터 포복(도주 링 밖)*/
  a.sneak = !!(bm && Math.hypot(bm.px - a.px, bm.py - a.py) < _snR && bm.st !== 'flee');   /*★잠행 개시=종별 min(55, 경계×1.2)*/
  if (!best) { const m = s.gameRich, src = (s.huntCells && s.huntCells.length) ? s.huntCells : s.forestCells; for (let t2 = 0; t2 < 8; t2++) { const c = src[(Math.random() * src.length) | 0]; if (!c) break; if (Math.hypot(c.cx - a.work.cx, c.cy - a.work.cy) <= 9 && m && (m.get(c.cx + ',' + c.cy) || 0) > 8) { best = c; break; } } }   // 몹 없으면 사냥터 밴드의 밀도 셀(작업 앵커 ±9)
  if (best && bMoveTo(a, best.cx, best.cy)) a.action = bm ? ((bm.st === 'flee' || a._onTrail) ? '추적' : (a.sneak ? '잠행' : '접근')) : '수색'; else a.action = '사냥';   /*★추적=flee·핏자국 전용*/
  a.dwell = 16 + Math.random() * 28;   // 추격 시 더 자주 재조준(몹 따라감)
}

function _makeShadow(lm) {
  const mt = MAIN_TYPE[lm.type] || 'deer';
  const sh = {
    mid: 'w' + (_nextWid++), dbId: null, isWild: true, type: mt,
    x: lm.px * 32, y: lm.py * 32, z: 0, floor: 0, homeX: lm.px * 32, homeY: lm.py * 32,
    packId: 'wild' + lm.gid, vx: 0, vy: 0,
    hp: Math.max(1, Math.round(lm.hp * HP_SCALE)), maxHp: Math.round((MOB_DEF[lm.type] || { hp: 1 }).hp * HP_SCALE),
    aggroTarget: null, lastAttackAt: 0, wanderUntil: 0, tameProgress: 0, tameOwner: null, tameOwnerName: null,
    dirty: false, _wildRef: lm,
  };
  H.mobs.set(sh.mid, sh); H.chunkManager.insertMob(sh);
  _shadows.set(sh.mid, sh); lm._shadow = sh; lm._lsh = sh.hp;
  _stats.spawned++;
  return sh;
}
function _dropShadow(lm, keepInMobs) {
  const sh = lm._shadow; if (!sh) return; lm._shadow = null;
  _shadows.delete(sh.mid);
  if (!keepInMobs && H.mobs.has(sh.mid)) {
    H.mobs.delete(sh.mid); H.chunkManager.removeMob(sh);
    H.broadcast({ type: 'mob_removed', mid: sh.mid });
  }
}
// kill() 미러 — 랩 kill은 updateMobs 클로저 내부라 외부 호출 불가. 동일 5필드 + rot(랩 kill과 동일 분포).
//   corpsed: 본체 경로(tryAttack/화살)가 이미 spawnCorpse 하므로 사체 중복 생성 방지 플래그.
function _extKill(lm) {
  lm.hp = 0; lm.st = 'dead'; lm.rot = 52 + Math.random() * 36; lm.tgt = null; lm.raidK = null;
  lm._corpsed = 1; _stats.deaths++;
  _dropShadow(lm, true);   // 본체 mobs 제거·broadcast는 본체 사망 경로가 수행(중복 제거 방지) — 링크만 해제
}

// 본체 전투 경로(근접 tryAttack·화살 stepArrows)가 wild 몹을 때렸을 때 — hp는 본체가 이미 차감(sh.hp).
function onMobHit(sh, dmgMain, attacker) {
  if (!ENABLED || !_ready) return;
  const lm = sh && sh._wildRef; if (!lm || lm.st === 'dead') return;
  lm.hp = sh.hp / HP_SCALE; lm._lsh = sh.hp;      // 본체 hp → 랩 hp 동기(브리지 단일 진실)
  if (lm.hp <= 0) { _extKill(lm); return; }
  lm.fcd = 20; lm.pause = 0;                      // 피격 놀람(랩 화살 착탄 fcd=20 등가)
  const D = MOB_DEF[lm.type];
  if (attacker && D && D.brave > 0) {             // 랩 근접 반격 규칙 미러(멧돼지·늑대·호랑이 ×0.45)
    const pr = _proxies.get(attacker.pid);
    if (pr && pr.hp > 0 && Math.random() < D.brave * (lm.tmp || 1) * 0.45) { goCharge(lm, pr); _stats.charges++; }
  }
}

function init(host) {
  if (!ENABLED) { console.log(`[${host.ZONE_ID}] 🐾 wildlife: ENABLE_WILDLIFE=0 — 비활성(no-op)`); return; }
  Object.assign(H, host);
  NX = Math.ceil(host.ZONE.zoneWidth / 32); NY = Math.ceil(host.ZONE.zoneHeight / 32); N = Math.max(NX, NY);
  _rockM = new Uint8Array(NX * NY); _forM = new Uint8Array(NX * NY);   // ~NX×NY bytes ×2 (한반도 8.9M셀 ≈ 17.8MB)
  TR.terrain.isBlocked = (x, y) => H.isTerrainBlockedLocal(x * 32 + 16, y * 32 + 16);   // 물+바위 — NPC 이동과 동일 판정
  // rock/forest는 플레인 Uint8Array(0/1) 직접 인덱싱 — 활성 청크 스캔(_scanChunk)이 eager 채움.
  //   미활성 영역은 0(=없음)으로 읽힘: LoS·숲 판정이 완화되는 fail-open — 몹은 뷰(활성 bbox) 안에만 존재해 영향 미미.
  TR.rock = _rockM;
  TR.forest = _forM;
  _ready = true;
  console.log(`[${host.ZONE_ID}] 🐾 wildlife ON — 동물 AI 블록(마을실험실 §4-4) 이식: 5종(🦌🐇🐗🐺🐯), 그리드 ${NX}×${NY}셀, dt=1/${host.TICK_HZ}유닛(1유닛=1초=1게임분)`);
}

function tick(now) {
  if (!ENABLED || !_ready) return;
  const t0 = Date.now();
  // 1) 시계: 본체 월드시계 → lifeGM(게임분). 낮(p<0.7)→랩 06~20시, 밤→랩 20~06시 피스와이즈(밤 경계 정렬,
  //    단조·연속). lifeGM 절대시각 타이머(경계기억 등)는 본체 하루 10분 압축만큼 짧아짐 — dt 물리(속도)는 불변.
  {
    const DL = H.WORLD.dayLengthMs, DR = H.WORLD.dayPhaseRatio;
    const el = now - (H.WORLD.worldEpoch || 0);
    _dayI = Math.floor(el / DL);
    const p = (el % DL) / DL;
    const f = p < DR ? (L_DAWN + (p / DR) * (L_DUSK - L_DAWN)) : (L_DUSK + ((p - DR) / (1 - DR)) * (1 - L_DUSK + L_DAWN));
    lifeGM = (_dayI + f) * L_MINDAY;
  }
  // 2) 활성 청크 → 뷰 bbox(셀)·서식지·마을 기준점 (활성 셋이 바뀔 때만 재구축)
  const keys = H.getActiveChunkKeys();
  if (!keys.size) return;
  let hs = 0, hx = 0;
  for (const k of keys) { let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0; hs = (hs + h) | 0; hx ^= h; }
  const sig = keys.size + '|' + hs + '|' + hx;
  if (sig !== _activeSig) {
    _activeSig = sig; _setVer++;
    const cc = H.chunkManager.chunkSize / 32;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of keys) {
      const p = k.split('_'), cx = +p[0], cy = +p[1];
      if (cx * cc < x0) x0 = cx * cc; if (cy * cc < y0) y0 = cy * cc;
      if ((cx + 1) * cc > x1) x1 = (cx + 1) * cc; if ((cy + 1) * cc > y1) y1 = (cy + 1) * cc;
    }
    _viewRect = { x0: Math.max(0, x0), x1: Math.min(NX, x1), y0: Math.max(0, y0), y1: Math.min(NY, y1) };
    _enqueueScans(keys);     // 미스캔 청크 → 슬라이스 큐(틱당 ≤4ms)
    _rebuildHabitat(keys);   // 이미 캐시된 청크 분으로 즉시 재합성(미완성분은 완성 시 재합성)
    _updateVillageAnchor();
  }
  if (_stepScans()) _rebuildHabitat(keys);   // 청크 완성분 반영 — 스폰 점진 개시
  S.day = _dayI * 100000 + _setVer;   // _vfs 서명 재료(뷰·날짜 변화 시 서식 캐시 갱신)
  // 3) 사람(플레이어)+활성 NPC → agents 프록시. job:'hunter'(지각 가중 — 랩 소음 모델), state:'idle'(사냥 AI 미발동).
  S.agents.length = 0; _tickAgents.length = 0;
  for (const p of H.players.values()) {
    if (p.hp <= 0 || p.isDown || p.handingOff) continue;
    if (p.simWar) continue;   // §4-4 P3: 출정(징발) 병사 — 위협 등록은 아래 warThreats() 단일 채널(_buildWarThreats 서버판)이 전담(이중 등록 방지). 피해 정산도 여기서 제외(전투는 battle-core 소유).
    if (!H.isPositionActive(p.x, p.y)) continue;
    let pr = _proxies.get(p.pid);
    if (!pr) { pr = { job: 'hunter', state: 'idle', home: { cx: 0, cy: 0 }, _arm: 0 }; _proxies.set(p.pid, pr); }
    pr.px = p.x / 32; pr.py = p.y / 32;
    pr.home.cx = pr.px | 0; pr.home.cy = pr.py | 0;
    pr.hp = p.hp; pr._hp0 = p.hp; pr._real = p; pr._dead = 0; pr.action = '';
    // ★[사냥꾼 완전체 — 생활 층 100% 마감] 마을 사냥꾼 일과 중(villages.js npcLifeTick이 p._huntOn 마킹)이면
    //   랩 'work' 승격 — 블록의 사냥꾼 전투(조준·사격·근접·도살·손절 후퇴·돌진 회피 — 287행)와 _hunterBrain
    //   (표적 선정·잠행·핏자국 — 아래 [C])이 그대로 발동. 프록시는 pid 지속 객체라 dwell·_bm·_tgt·sneak·_carc
    //   등 사냥 상태가 틱을 넘어 보존된다. 그 외(플레이어·타 직업)=종전 'idle'(지각 위협원 전용 — 랩 소음 모델).
    if (p.isNpc && p.simJob === 'hunter' && p._huntOn) {
      pr.state = 'work';
      if (p._huntWk) { if (!pr.work) pr.work = { cx: 0, cy: 0 }; pr.work.cx = p._huntWk.cx; pr.work.cy = p._huntWk.cy; }
      if (!pr.work) pr.work = { cx: pr.px | 0, cy: pr.py | 0 };
      // ★[HSK↔econ] villages._lifeHunterEconLink가 일일로 심어둔 econ NPC 살아있는 참조를 프록시로 전달.
      //   HSK_W(활 숙련→명중률·시위 시간)·HSK_F(사냥 숙련→잠행·추적·도살 수율)가 _esk.skills를 그대로 읽는다
      //   (종전엔 _esk 미설정 → a._hsk 폴백 0, 즉 전 사냥꾼 레벨0 고정). _arm=가죽 갑옷 부상 경감, _fgl=식량 잉여 가중.
      pr._esk = p._esk || null;
      pr._fgl = p._fgl || 0;
      pr._arm = p._arm || 0;
    } else { pr.state = 'idle'; if (p._huntSpd) p._huntSpd = 0; }
    pr._sp2 = Math.hypot(p.vx || 0, p.vy || 0) / 32;   // 실속도 m/s — 본체 걷기 6.9m/s는 랩 '달리기' 소음대(>3)로 지각됨(정지=조용)
    S.agents.push(pr); _tickAgents.push(pr);
  }
  // §4-4 P3: 실체 전쟁 병사(행군·전투·귀환) pid 위치를 야생 위협원으로 주입 — 전쟁실험실 _buildWarThreats → agrid 병합 패턴.
  //   deps 확장(H.warThreats)만 — updateMobs 몹 로직 무수정. 공간 전용 프록시(job='soldier'=지각 가중 1·평범한 위협). 피해 미정산(_real 없음 → 전투는 battle-core 소유).
  if (typeof H.warThreats === 'function') {
    let wt = null; try { wt = H.warThreats(); } catch (e) { }
    if (wt && wt.length) {
      if (!_warProxyPool) _warProxyPool = [];
      for (let i = 0; i < wt.length; i++) {
        const t = wt[i]; if (!t) continue;
        let pr = _warProxyPool[i]; if (!pr) { pr = { job: 'soldier', state: 'idle', home: { cx: 0, cy: 0 }, _arm: 0, _real: null }; _warProxyPool[i] = pr; }
        pr.px = t.x / 32; pr.py = t.y / 32; pr.state = 'idle'; pr.hp = 1; pr._dead = 0; pr._sp2 = 0;
        S.agents.push(pr);   // ★agrid(updateMobs 117행) 위협원 — 전 종이 즉시 반응(토끼 flee 등)
      }
    }
  }
  if (_proxies.size > S.agents.length * 2 + 64) {   // 떠난 플레이어 프록시 청소(몹 tgt 안전: hp=0 → 블록이 표적 해제)
    const live = new Set(); for (const pr of S.agents) live.add(pr);
    for (const [pid, pr] of _proxies) if (!live.has(pr)) { pr.hp = 0; pr._dead = 1; pr._real = null; _proxies.delete(pid); }
  }
  // 4) 외부 피해 폴링 보정(onMobHit 미경유 경로 방어 — 예: 미래의 새 피해원)
  for (const [, sh] of _shadows) {
    const lm = sh._wildRef; if (!lm || lm.st === 'dead') continue;
    if (sh.hp < (lm._lsh ?? sh.hp)) {
      lm.hp = sh.hp / HP_SCALE; lm._lsh = sh.hp; lm.fcd = 20;
      if (lm.hp <= 0) { _extKill(lm); if (H.mobs.has(sh.mid)) { H.mobs.delete(sh.mid); H.chunkManager.removeMob(sh); H.broadcast({ type: 'mob_removed', mid: sh.mid }); } }
    }
  }
  // 4b) ★사냥꾼 두뇌(표적·잠행·핏자국 — [C] _hunterBrain) + 본체 역전달: 블록 구동 전에 a._bm을 정해야
  //     실행층(조준·사격·근접·도살)이 이번 틱에 소비한다. 이동 목표(_hgx/_hgy 셀)는 본체 npc.targetX/Y로 —
  //     경로(직선 우선→A*→스무딩)·벽·물·stuck은 zone.js 이동층 소유(좌표 단일 작성자 유지).
  //     속도 배속 _huntSpd: 잠행 0.5×·추적/회수 2×(도주 표적·부패와 시간 싸움)·평시 속보 1.25×·정지(_hold)≈0 — 랩 moveNPC 동형.
  for (const pr of S.agents) {
    if (pr.state !== 'work' || !pr._real) continue;
    try { _hunterBrain(pr, S, 1 / H.TICK_HZ); } catch (e) { if (!S._hbErr) { S._hbErr = 1; console.error('[wildlife] 사냥꾼 두뇌 오류:', e.message); } }
    const rp = pr._real;
    if (pr._hgo) { rp.behavior = 'wander'; rp.targetX = pr._hgx * 32 + 16; rp.targetY = pr._hgy * 32 + 16; rp.gatherTarget = null; pr._hgo = 0; }
    rp._huntSpd = pr._hold ? 0.02 : (pr.sneak ? 0.5 : ((pr.action === '추적' || pr.action === '회수') ? 2 : 1.25));
    if (pr.action && rp._lifeAct !== pr.action) { rp._lifeAct = pr.action; rp._lifeActAt = Date.now(); }   // ★[액션 라벨 가시화] 잠행·추적·조준·도살 등 실행층 라벨 → 본체(zone AOI가 클라 전송)
  }
  // 5) ★블록 구동 — dt = 1/TICK_HZ 유닛/틱 (30Hz × 1/30 = 1유닛/초 = 환산 계수 1)
  updateMobs(S, 1 / H.TICK_HZ);
  // 5b) ★화살 이펙트 브로드캐스트 — 실행층이 이번 틱에 만든 사격(S._fx 신규 항목)만 1회 발신.
  //   랩 좌표(m) → 존 로컬 px(×32). 비행시간 T는 실초 단위(dt 환산 계수 1) → ms로 전달해
  //   클라가 서버와 같은 속도로 보간한다(유도탄 금지 원칙 유지 — 화살은 조준점까지 직선).
  //   빈도는 활성 마을 사냥꾼 사격 수준이라 브로드캐스트 부담 낮음. 피해·명중 판정은 여기서 안 함(시각 전용).
  if (S._fx && S._fx.length && typeof H.broadcast === 'function') {
    for (const q of S._fx) {
      if (q._fxSent) continue;
      q._fxSent = 1;
      H.broadcast({
        type: 'arrow_fx',
        x0: q.x1 * 32, y0: q.y1 * 32,
        x1: q.x2 * 32, y1: q.y2 * 32,
        ms: Math.max(80, Math.min(1500, Math.round((q.T || 0.4) * 1000))),
      });
      _stats.arrowFx = (_stats.arrowFx || 0) + 1;
    }
  }
  // 6) 랩몹 → shadow 동기 (+신규 스폰 로그·상태 전이 계측·사망/hide/디스폰 처리)
  const liveSet = new Set();
  for (const lm of S.mobs) {
    if (lm.st === 'dead') {
      if (!lm._corpsed) {   // 랩 내부 사인(포식·돌진 반격 등) — 본체 사체 생성(도살 가능·💀 렌더)
        lm._corpsed = 1; _stats.deaths++;
        _dropShadow(lm);
        try { H.spawnCorpse({ type: MAIN_TYPE[lm.type] || 'deer', x: lm.px * 32, y: lm.py * 32 }, null); } catch (e) {}
      }
      continue;   // 사체는 랩에만 잔존(늑대 feed) — rot 소진 시 랩 필터가 정리
    }
    if (lm.st === 'hide') { if (lm._shadow) _dropShadow(lm); lm._sx = lm._sy = undefined; liveSet.add(lm); continue; }   // 🐇 굴속 — 본체에선 사라짐(재등장 시 속도 측정 리셋)
    const sh = lm._shadow || _makeShadow(lm);
    sh.x = lm.px * 32; sh.y = lm.py * 32;
    // 실측 속도 = 틱간 변위 × TICK_HZ (m/s). ※랩 내부 m._spd는 dt를 max(0.05,dt)로 나누는 '표시용 지표'라
    //   dt=1/30에선 ×0.667 저평가(실제 이동량은 정확) — 브리지·속도 검증은 변위 실측을 쓴다.
    const dxp = lm.px - (lm._sx !== undefined ? lm._sx : lm.px), dyp = lm.py - (lm._sy !== undefined ? lm._sy : lm.py);
    lm._sx = lm.px; lm._sy = lm.py;
    const rl = Math.hypot(dxp, dyp), rSpd = rl * H.TICK_HZ;
    sh.vx = rl > 1e-9 ? (dxp / rl) * rSpd * 32 : 0; sh.vy = rl > 1e-9 ? (dyp / rl) * rSpd * 32 : 0;   // px/s(클라 facing)
    sh.hp = Math.max(1, Math.round(lm.hp * HP_SCALE)); lm._lsh = sh.hp;
    H.chunkManager.updateMobChunk(sh);
    liveSet.add(lm);
    // 계측: 상태 전이(도주·돌진) + 종별 최고 실측 속도(검증: 🦌 질주 ≈13m/s=416px/s). <60 가드=텔레포트성 잡값 배제
    if (rSpd > (_stats.maxSpd[lm.type] || 0) && rSpd < 60) _stats.maxSpd[lm.type] = rSpd;
    if (lm.st !== lm._pst) {
      if (lm.st === 'flee') _stats.flees++;
      if (lm.st === 'charge' || lm.st === 'huff') { _stats.charges++; if (process.env.WILDLIFE_DEBUG) console.log(`[wl] ${lm.type} ${lm._pst || '?'}→${lm.st} @(${lm.px | 0},${lm.py | 0})`); }
      lm._pst = lm.st;
    }
    if (!_gidSeen.has(lm.gid)) {   // 무리 스폰 로그(gid당 1회)
      _gidSeen.add(lm.gid); if (_gidSeen.size > 800) _gidSeen.clear();
      let n = 0; for (const o of S.mobs) if (o.gid === lm.gid) n++;
      const hd = S.V ? Math.round(Math.hypot(lm.px - S.V.hall.cx, lm.py - S.V.hall.cy)) : -1;
      console.log(`[${H.ZONE_ID}] 🐾 spawn ${lm.type}×${n} gid=${lm.gid} @(${lm.px | 0},${lm.py | 0})셀${hd >= 0 ? ` 마을거리 ${hd}m` : ''}`);
    }
  }
  for (const [mid, sh] of _shadows) {   // 랩에서 디스폰(뷰 밖·정리)된 shadow 제거
    if (liveSet.has(sh._wildRef)) continue;
    _shadows.delete(mid);
    if (sh._wildRef) sh._wildRef._shadow = null;
    if (H.mobs.has(mid)) { H.mobs.delete(mid); H.chunkManager.removeMob(sh); H.broadcast({ type: 'mob_removed', mid }); }
  }
  // 7) 프록시 피해 정산 → 본체 damagePlayer (NPC 요양·사망·플레이어 다운은 본체 규칙이 처리)
  for (const pr of _tickAgents) {
    const d = pr._hp0 - pr.hp;
    if (d > 0.01 && pr._real) { _stats.hits++; try { H.damagePlayer(pr._real, Math.round(d), 'wild:' + (pr.action || '습격')); } catch (e) {} }
  }
  // 계측·페이스 로그(15초)
  const ms = Date.now() - t0;
  _stats.ticks++; _stats.ms += ms; if (ms > _stats.peak) _stats.peak = ms;
  if (now - _lastStatLog > 15000) {
    _lastStatLog = now;
    const cnt = {}; let nAll = 0; for (const lm of S.mobs) { if (lm.st === 'dead') continue; cnt[lm.type] = (cnt[lm.type] || 0) + 1; nAll++; }
    const sp = Object.entries(_stats.maxSpd).map(([t, v]) => `${t}${v.toFixed(1)}`).join(' ');
    console.log(`[${H.ZONE_ID}] 🐾 mobs=${nAll}(${Object.entries(cnt).map(([t, n]) => t + n).join(' ')}) flee=${_stats.flees} chg=${_stats.charges} kill=${_stats.deaths} hit사람=${_stats.hits} tick avg=${(_stats.ms / Math.max(1, _stats.ticks)).toFixed(2)}ms peak=${_stats.peak}ms maxSpd[m/s]=${sp}`);
    _stats.ms = 0; _stats.ticks = 0; _stats.peak = 0;
  }
}

module.exports = { init, tick, onMobHit, get enabled() { return ENABLED; }, _debug: { S, stats: _stats, get lifeGM() { return lifeGM; } } };
