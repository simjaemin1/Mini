'use strict';
// @regress
// 마을별 자정이 어긋나도 관측 마을의 날짜까지 시계가 전진해야 한다.
const vm=require('vm'), assert=require('assert/strict'), LC=require('./fixture-lab-clock');
function make(){
 const c={Math:Object.create(Math),performance:{},VILS:[{day:0},{day:0}],lifeOn:true};c.window=c;
 vm.createContext(c);vm.runInContext(LC.init('1'),c);
 vm.runInContext(`function lifeLoop(){const n=window.__frame();VILS[0].day=Math.floor(n/2);VILS[1].day=Math.floor(n/3);requestAnimationFrame(lifeLoop)};requestAnimationFrame(lifeLoop);`,c);
 return c;
}
const first=make(),second=make();
assert.equal(first.__untilDay(3),6);
assert.equal(second.__untilDay(3,1),9);
assert.equal(second.VILS[1].day,3);
assert.equal(second.VILS[0].day,4);
console.log('PASS 4 / FAIL 0');
