'use strict';
// (@regress 없음 — 러너 밖 · T1344 표 자 · 읽기만)
// === scripts/t1344-food.js — 식량 교역(t1344 관찰기 econ 식량 단위)을 가른다: 출발(로그 `캐러밴#N 출발`) · 그 가운데 첫째 화물이 식량 · 보낸 식량(첫째 · 둘째 화물) · 받아 온 식량 ==========
//   쓰는 법: node scripts/t1344-food.js <이름=머리> [<이름=머리> …]   (머리 = 판 JSON 에서 `.json` 을 뗀 것 · 곁 `.t1344.json`(.gz) · `.log`(.gz))
//   식량 몫 = econ `storageFoodPer`(관찰기와 같은 함수) · 둘째 화물 식량 = 관찰기 `mix` 줄(닿은 양) × 식량 몫
const fs=require('fs'),zlib=require('zlib'),path=require('path');
const V1=require(path.join(__dirname, '..', 'sim', 'economy-sim'));
const rd=(f)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){try{return JSON.parse(zlib.gunzipSync(fs.readFileSync(f+'.gz')).toString('utf8'))}catch(e2){return null}}};
const fp=(r)=>{try{const f=V1.storageFoodPer({storage:{},npcs:[],counts:{}},r);return f>0?f:0}catch(e){return 0}};
const re=/캐러밴#(\d+) 출발: (\S+)→(\S+) (\S+)×(\d+(?:\.\d+)?) /;
console.log('| 판 | 출발(로그) · 그 가운데 첫째 식량 | 보낸 식량 — 첫째 · 둘째 | 받아 온 식량 | 합 |');console.log('|---|---:|---:|---:|---:|');
for(const a of process.argv.slice(2)){const k=a.indexOf('='),n=a.slice(0,k),h=a.slice(k+1);const X=rd(h+'.t1344.json');
 let out=0,back=0;for(const t of Object.values(X.trade)){out+=t[1];back+=t[2]}let mix=0;for(const m of X.mix||[])mix+=m[6]*fp(m[5]);
 let dep=0,fdep=0;let T='';try{T=zlib.gunzipSync(fs.readFileSync(h+'.log.gz')).toString('utf8')}catch(e){try{T=fs.readFileSync(h+'.log','utf8')}catch(e2){}}
 for(const ln of T.split('\n')){const m=re.exec(ln);if(!m)continue;dep++;if(fp(m[4])>0)fdep++}
 console.log(`| ${n} | ${dep} · ${fdep} | ${(out-mix).toFixed(0)} · ${mix.toFixed(0)} | ${back.toFixed(0)} | ${(out+back).toFixed(0)} |`)}
