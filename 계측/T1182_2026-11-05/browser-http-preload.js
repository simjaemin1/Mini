const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{
 if(req.url==='/favicon.ico'){res.writeHead(204);return res.end();}
 const f=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!f.startsWith(root+'/')){res.writeHead(403);return res.end();}
 fs.readFile(f,(err,b)=>{if(err){res.writeHead(404);return res.end();}const ext=path.extname(f);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png'})[ext]||'application/octet-stream');res.end(b);});
});
const ready=new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));server.unref();
const L=require(root+'/scripts/fixture-lab-clock'),orig=L.gotoLab;
L.gotoLab=async(page,url)=>{await ready;return orig(page,url.startsWith('file://'+root+'/')?'http://127.0.0.1:'+server.address().port+'/'+url.slice(('file://'+root+'/').length):url);};
