'use strict';
const fs=require('fs');
if(/server[\\/]zone\.js$/.test(process.argv[1]||'')&&process.env.T577_OUT)process.on('exit',code=>fs.writeFileSync(process.env.T577_OUT+'.t1255-exit.json',JSON.stringify({pid:process.pid,code})));
if(/server-baseline-check\.js$/.test(process.argv[1]||'')&&process.env.T1255_GROUP_EXIT)process.on('exit',code=>fs.writeFileSync(process.env.T1255_GROUP_EXIT,JSON.stringify({pid:process.pid,code})));
