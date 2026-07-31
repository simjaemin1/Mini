'use strict';
// === scripts/proto-alloy.js — 삼원 합금(Cu·Sn·Pb) 물성 모델 시안 검증 ===
// 설계_삼원합금과_광종밀도.md 의 수식을 그대로 돌려 실제 유물 조성과 대조한다.
// 실행: node scripts/proto-alloy.js
// Cu-Sn-Pb 삼원 합금 물성 모델 시안 — 자유도는 2다(Cu = 1−s−b)
// 근거: Sn 15wt%까지 경도 체계적 상승, 그 이상은 δ상(Cu31Sn8) 취성이 제한(Xometry·PatSnap)
//       경도 60~180 HB · 인장 350~850 MPa · Pb 는 가공성·주조성↑ 강도↓(불용 입자)
const H=(s)=>1+1.60*Math.min(s,0.15)/0.15;                       // 경도 1.0 → 2.6 (Sn 15%에서 포화)
const T=(s)=>s<=0.10?1:1/(1+Math.pow((s-0.10)/0.075,2));          // 인성 — δ상 나오며 급락
const L=(b)=>1-0.80*b;                                            // 납은 강도를 깎는다(불용 입자)
const C=(b)=>1+1.20*b/0.15;                                       // 주조성 — 융점↓ 유동성↑
const G=(s)=>Math.min(1,s/0.35);                                  // 광택·백색(거울)
const weapon=(s,b)=>H(s)*T(s)*L(b);
const mirror=(s,b)=>G(s)*C(b);
const vessel=(s,b)=>C(b)*(0.5+0.5*G(s));                          // 의기·방울 — 복잡한 주조가 관건
function best(f,label){
  let bs=-1,bx=null;
  for(let s=0;s<=0.45;s+=0.005)for(let b=0;b<=0.20;b+=0.005){
    if(s+b>0.55)continue; const v=f(s,b); if(v>bs){bs=v;bx={s,b};}}
  console.log('  '+label.padEnd(12)+'최적 Sn '+(bx.s*100).toFixed(0)+'% · Pb '+(bx.b*100).toFixed(0)+'% · Cu '+((1-bx.s-bx.b)*100).toFixed(0)+'%   (점수 '+bs.toFixed(2)+')');
  return bx;
}
console.log('=== 모델이 고르는 최적 배합 vs 실제 유물 ===');
best(weapon,'무기(검)');   console.log('    실제 세형동검  Sn 13.6~18.7% · Pb 6.9~15.7%');
best(mirror,'거울');       console.log('    실제 다뉴세문경 Sn 34.3%');
best(vessel,'의기·방울');  console.log('    실제 동령       Sn 17~19% · Pb 12~13%');
console.log('\n=== 무기 성능 곡선 (Pb 10% 고정) ===');
console.log('  Sn%   경도   인성   성능');
for(const s of [0,0.05,0.08,0.10,0.12,0.15,0.19,0.25,0.34]){
  console.log('  '+String((s*100).toFixed(0)).padStart(3)+'   '+H(s).toFixed(2)+'   '+T(s).toFixed(2)+'   '+weapon(s,0.10).toFixed(2)
    +(s===0?'   ← 순동':'')+(Math.abs(s-0.15)<1e-9?'   ← 세형동검 구간':'')+(Math.abs(s-0.34)<1e-9?'   ← 거울 배합(검엔 최악)':''));
}
console.log('\n=== 지금 코드의 배합을 이 모델로 평가 ===');
const now=0.12/0.42, prop=0.07/0.42;   // 총 금속 0.42 중 주석 비중
console.log('  지금 2.5:1 → Sn '+(now*100).toFixed(0)+'%  무기 성능 '+weapon(now,0).toFixed(2)+' (거울 배합에 가깝다)');
console.log('  제안 5:1   → Sn '+(prop*100).toFixed(0)+'%  무기 성능 '+weapon(prop,0).toFixed(2));
console.log('  순동       → Sn 0%   무기 성능 '+weapon(0,0).toFixed(2)+'  (MAT_GRADE 0.70 과 비 '+(weapon(0,0)/weapon(prop,0)).toFixed(2)+')');
