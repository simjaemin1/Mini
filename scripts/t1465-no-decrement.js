'use strict';
// DIAGNOSTIC ONLY. Same single-site mutant as resident decrement bait.
// Separates finite-stock feedback from canonical selected-cell composition/value.
const fs=require('fs'),path=require('path'),assert=require('assert'),Module=require('module'),load=Module._extensions['.js'];
const file=path.join(__dirname,'../sim/ore-stock.js'),from='s: stock - got',to='s: stock';
Module._extensions['.js']=function(m,f){if(f!==file)return load(m,f);const src=fs.readFileSync(f,'utf8');assert.strictEqual(src.split(from).length-1,1);console.error('T1465 diagnostic no-decrement mutant: changed sites 1');m._compile(src.replace(from,to),f);};
