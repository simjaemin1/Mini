'use strict';
// T1192: 몸 크기는 민물/바다 표, kcal 밀도는 T59. 낱개 묶음 무게는 몸 크기의 출처가 아니다.
const ON=typeof process==='undefined'||!process.env||process.env.T1192_FISH_SPECIES!=='0';
const Fresh=require('./freshfish'),Sea=require('./seafish');
let SEA_BODY_IDS=null;
function bodyKg(id,fallback=0){const f=Fresh.kgOf(id);if(f>0)return f;const row=Sea.TABLE?.find(r=>r.id===id);if(row?.kg?.length===2){if(!SEA_BODY_IDS){const ids=require('./fishing').FISH_ITEMS;if(!Array.isArray(ids))return fallback;SEA_BODY_IDS=new Set(ids);}if(SEA_BODY_IDS.has(id))return(row.kg[0]+row.kg[1])/2;}return fallback;}
function species(){return require('./fish-preserve').species();}
function items(){return require('./fish-preserve').items();}
function isItem(id){return ON&&!!items()[id];}
const FACTORS=new Map(); // 표준 품목 kg·T59 밀도·하루 열량은 이 프로세스에서 고정, 나이/실제 개체 kg를 캐시하지 않는다.
function factor(id){if(!FACTORS.has(id)){const K=require('./kcal');FACTORS.set(id,K.kcalOf(id)/K.DAY_KCAL);}return FACTORS.get(id);}
const SHARE_CACHE=new WeakMap();
function note(v,id,n){if(!ON||!species().includes(id)||!(n>0))return;const m=v._t1192CatchMix||(v._t1192CatchMix={});m[id]=(m[id]||0)+n;SHARE_CACHE.delete(v);}
function shares(v){const m=v?._t1192CatchMix||null,c=v&&SHARE_CACHE.get(v);if(c&&c.mix===m)return {...c.value};const o={};let sum=0;for(const id of species()){if(!(m?.[id]>0))continue;const u=m[id]*factor(id);if(u>0){o[id]=u;sum+=u;}}if(sum>0)for(const id in o)o[id]/=sum;if(v)SHARE_CACHE.set(v,{mix:m,value:o});return {...o};}
function reserve(v,id,oldDry,oldPickle,oldFactor){const it=items()[id];if(!it)return 0;const s=shares(v)[it.from]||0;if(!(s>0))return 0;const f=factor(id);return f>0?s*(it.kind==='dry'?oldDry:oldPickle)*oldFactor/f:0;}
function audit(){const Sp=require('./specialty'),W=require('./weights');return species().map(id=>{const fr=Fresh.kgOf(id),r=Sea.TABLE?.find(x=>x.id===id),old=Sp.RESOURCES[id]?.weight||W.CORE_KG[id]||fr||0;return{id,ko:require('./fish-preserve').koOf(id),parcelKg:old,bodyKg:bodyKg(id,old),source:fr?'설계/설계_민물고기.md §1 (T603 kg 미확인 · 현행 몸 크기 유지)':r?.kg?'설계/고증_바닷물고기.md T592/T602 기존 몸 앵커 · kg 미확인(low:kg, 구체 kg 출처 없음)':'미확인 · 현행 값 유지',verified:false,hasExistingSeaKgField:!fr&&!!r?.kg,tableLow:r?.low||[],tableSource:r?.src||null};});}
module.exports={ON,bodyKg,species,items,isItem,factor,note,shares,reserve,audit};
