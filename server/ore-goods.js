'use strict';
// T1188: 지도에 이미 있는 광물의 생광석. 철 정광 iron_ore와 구분한다.
const {POOL}=require('./hanbando-minerals');
const ON=typeof process==='undefined'||!process.env||process.env.T1188_ORE_SPLIT!=='0';
const minerals=Object.keys(POOL),ids=minerals.map(k=>'ore_'+k);
const inverse=Object.fromEntries(minerals.map((k,i)=>[ids[i],k]));
function idOf(k){return minerals.includes(k)?'ore_'+k:null;}
function configure(catalog,pools){for(const k of new Set(Object.values(pools||{}).flat()))if(catalog[k]&&!minerals.includes(k)){minerals.push(k);const id='ore_'+k;ids.push(id);inverse[id]=k;}}
function mineralOf(k){return inverse[k]||null;}
function shares(mix=POOL){const out={};let n=0;for(const k of minerals)if(Number.isFinite(mix?.[k])&&mix[k]>0){out[k]=mix[k];n+=mix[k];}if(n>0)for(const k in out)out[k]/=n;return out;}
function split(n,mix=POOL){const s=shares(mix),ks=Object.keys(s),out={};let left=n;if(!(n>0)||!Number.isFinite(n))return out;ks.forEach((k,i)=>{const q=i===ks.length-1?left:n*s[k];out[idOf(k)]=q;left-=q;});return out;}
function total(store){let n=0;for(const k of ids)n+=Math.max(0,store?.[k]||0);return n;}
function heldMix(store){const m={};for(const k of ids)if(store?.[k]>0)m[mineralOf(k)]=store[k];return shares(m);}
function add(store,n,mix){const q=split(n,mix);for(const k in q)store[k]=(store[k]||0)+q[k];return Object.values(q).reduce((a,b)=>a+b,0);}
function take(store,n){const have=total(store),use=Math.min(Math.max(0,n||0),have),out={};if(!(use>0))return out;let left=use;const ks=ids.filter(k=>store[k]>0);ks.forEach((k,i)=>{const q=i===ks.length-1?Math.min(store[k],left):Math.min(store[k],use*store[k]/have);store[k]-=q;out[k]=q;left-=q;});return out;}
function descriptors(catalog){const out={};for(const m of minerals){const ko=catalog[m]?.ko||(m==='jade_raw'?catalog.jade?.ko:m)||m;const id=idOf(m);out[id]={ko:m==='jade_raw'?ko:m==='obsidian'?ko+' 원석':ko+' 광석',econGroup:'ore',category:'mineral',get weight(){return require('./weights').kgOf(id);}};}return out;}
module.exports={ON,configure,minerals,ids,idOf,mineralOf,isOre:k=>!!mineralOf(k),shares,split,total,heldMix,add,take,descriptors,POOL};
