'use strict';
// 기준 소스 둘만 git 객체에서 적재한다. 상대 의존성은 실제 파일 경로에서 그대로 해석한다.
const Module=require('module'),path=require('path'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'../..'),original=Module._extensions['.js'];
Module._extensions['.js']=function(m,file){
 const rel=path.relative(root,file).replaceAll(path.sep,'/');
 if(rel!=='server/villages.js' && rel!=='sim/economy-sim-v2.js')return original(m,file);
 const src=execFileSync('git',['show','863acbf1:'+rel],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
 return m._compile(src,file);
};
