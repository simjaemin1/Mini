#!/usr/bin/env node
'use strict';
// T1398: 같은 상자에서 만든 지정 베이스 지문과 변경후 끈 판의 원본 지문을 비교.
// 정본 기준선은 건드리지 않는다. sideCondense는 서버 기준선 자의 함수를 그대로 읽어 쓴다.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [base, actualDir] = process.argv.slice(2);
if (!base || !actualDir) throw Error('베이스 지문 JSON, 변경후 sbc 폴더 필요');
const R = p => JSON.parse(fs.readFileSync(p,'utf8'));
const H = (s,n) => crypto.createHash('sha1').update(s).digest('hex').slice(0,n);
const source = fs.readFileSync(path.join(__dirname,'server-baseline-check.js'),'utf8');
const body = source.match(/function sideCondense\(S\) \{[\s\S]*?\n\}/);
if (!body) throw Error('기준선 자의 sideCondense를 찾지 못함');
const condense = new Function('H', 'return (' + body[0] + ');')(H);
const b = R(base).byseed['1020'];
const p = path.join(actualDir,'sbc-1020.json');
const econ = R(p+'.sbc.json'), side = condense(R(p+'.t740.json')), run = R(p);
function compare(name,a,z) {
  const same = JSON.stringify(a) === JSON.stringify(z);
  let first = null;
  if (!same && Array.isArray(a) && Array.isArray(z)) { const i = a.findIndex((r,i) => JSON.stringify(r)!==JSON.stringify(z[i])); first = { index:i,base:a[i],actual:z[i] }; }
  return { name, same, expectedRows:Array.isArray(a)?a.length:null, actualRows:Array.isArray(z)?z.length:null, first };
}
const rows = [compare('economic-days',b.days,econ.days),compare('side-keys',b.side.keys,side.keys),compare('side-days',b.side.days,side.days),compare('eight',b.eight,run.eight)];
const out = { baseHead:R(base).head, actualDir, rows, pass:rows.every(r=>r.same) };
console.log(JSON.stringify(out,null,2));
process.exitCode=out.pass?0:1;
