'use strict';
const fs=require('fs'),Module=require('module');
const original=Module.prototype._compile;
Module.prototype._compile=function(content,filename){
 if(filename.endsWith('/server/villages.js')) content=fs.readFileSync('/tmp/t1496-base-villages.js','utf8');
 return original.call(this,content,filename);
};
