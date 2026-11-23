#!/usr/bin/env node
'use strict';
// A rigorous no-exhaustion bound for completed short runs whose records predate
// the daily witness: even assigning ALL extraction of EVERY rights-holder to a
// vein cannot empty it if this conservative chunk upper bound is too small.
const fs=require('fs'),path=require('path'),S=require('../server/specialty'),W=require('../server/weights');
const root=process.argv[2]||'계측/T1465_2026-11-23',D=JSON.parse(fs.readFileSync(path.join(root,'광맥-진단.json'))),results=[],lowTail=[];
for(const dir of fs.readdirSync(path.join(root,'runs'))){const base=path.join(root,'runs',dir);if(!fs.existsSync(path.join(base,'done')))continue;const r=JSON.parse(fs.readFileSync(path.join(base,'stock.json'))),draw={};
 for(const[name,v]of Object.entries(r.final.perVillage)){draw[name]=Object.entries(v.minedKg).reduce((n,[id,kg])=>n+kg/W.kgOf(id)*W.kgOf('ore')/S.mineChunkKg(0),0);}
 const owners=new Map();for(const v of D.villages)for(const c of v.cells){const k=c.cx+','+c.cy;if(!owners.has(k))owners.set(k,new Set());owners.get(k).add(v.name);}
 let max=0,worst=null;for(const[key,names]of owners){const sum=[...names].reduce((n,name)=>n+(draw[name]||0),0);if(sum>max){max=sum;worst={key,owners:[...names]};}}
 lowTail.push({run:dir,days:r.final.day,maximumPossibleChunksExtractedFromAnyOneCell:max,worstCell:worst,neverBelowTenPercentProven:max<S.ORE_K*(1-.1),proof:'Sum ALL actual raw outputs of EVERY village with access to a cell, divided by minimum canonical chunk mass; allocate all of it to that cell and ignore refill. If total < 90% of ORE_K, no cell could have entered the changed below10% empirical bins at any prior day.'});
 const rows=D.veins.filter(v=>v.cells>0).map(v=>{const upper=Object.keys(v.villages).reduce((n,name)=>n+(draw[name]||0),0),needed=v.cells*(S.ORE_K-1);return {vein:v.name,cells:v.cells,maxChunksAllRightsHoldersCouldHaveExtracted:upper,chunksNecessaryToEmptyEveryCellIgnoringRefill:needed,provablyNeverFullyDepleted:upper<needed};});
 results.push({run:dir,days:r.final.day,proof:'Actual produced ore units × canonical generic ore kg / minimum canonical chunk kg upper-bounds chunk extraction. Sum ALL products of ALL villages with rights to the vein, not an invented allocation. Ignoring refill only strengthens depletion. If below cells×(ORE_K−1), complete depletion at ANY prior day is impossible.',unknown:rows.filter(r=>!r.provablyNeverFullyDepleted).map(r=>r.vein),rows});}
fs.writeFileSync(path.join(root,'단기-전체광맥-고갈상한.json'),JSON.stringify(results));console.log(results.map(r=>({run:r.run,provable:r.rows.length-r.unknown.length,unknown:r.unknown})));
fs.writeFileSync(path.join(root,'단기-저재고진입-보수상한.json'),JSON.stringify(lowTail,null,2)+'\n');
