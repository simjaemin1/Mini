// T1260 대조 — 켬 판에서 개간 120일 문 하나만 메모리에서 `storage.food` 로 되돌린다(제품 파일 무변)
'use strict';
const Module=require('module'),compile=Module.prototype._compile;
const FROM="if (_lifeEcon().t1260FoodOf(e) > e.npcs.length * 120) return false;", TO="if (((e.storage && e.storage.food) || 0) > e.npcs.length * 120) return false;";
let hit=0;
Module.prototype._compile=function(src,file){if(file.endsWith('/server/villages.js')){if(src.split(FROM).length!==2)throw Error('anchor');src=src.replace(FROM,TO);hit++;}return compile.call(this,src,file);};
process.on('exit',()=>{if(!hit)console.error('T1260 revert-clear: 닿지 않음');});
