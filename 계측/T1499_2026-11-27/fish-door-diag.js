'use strict';
const path=require('path'),fs=require('fs');const A1=process.argv[1]||'';
if(!(process.env.T577_SEED&&/server[\/\\]zone\.js$/.test(A1)))return;
const OUT=process.env.FD_OUT;const R=global.__FD={n:0,u0:0,nat0:0,left0:0,got0:0,ok:0,sumLeft:0,sumTake:0,sumGot:0,sumU:0,err:null};
const SN=`
;(function(){var R=global.__FD;try{var c=_t312Deliver;_t312Deliver=function(vil,npc){var u=npc&&npc._t312U||0;var left=null;try{left=_lifeEcon().fishDemandLeft(vil.econ);}catch(e){}
var g=c.apply(this,arguments);try{if(u>0){R.n++;R.sumU+=u;if(left!==null&&!(left>0))R.left0++;else if(!(g>0))R.got0++;else{R.ok++;R.sumGot+=g;}if(left!==null&&left!==Infinity)R.sumLeft+=left;}else R.u0++;}catch(e){R.err=String(e);}return g;};}catch(e){R.err=String(e);}})();`;
const M=require('module');const _c=M.prototype._compile;M.prototype._compile=function(ct,fn){if(typeof fn==='string'&&/server[\/\\]villages\.js$/.test(fn))arguments[0]=ct+'\n'+SN;return _c.apply(this,arguments);};
process.on('exit',()=>{try{fs.writeFileSync(OUT,JSON.stringify(R));}catch(e){}});
