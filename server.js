const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');
const Game=require('./game.js');
const PORT=process.env.PORT||3000,MAX=6;
const files={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/game.js':['game.js','text/javascript']};
const srv=http.createServer((req,res)=>{
  const f=files[req.url.split('?')[0]];
  if(!f){res.writeHead(404);return res.end()}
  res.writeHead(200,{'Content-Type':f[1]+'; charset=utf-8'});
  fs.createReadStream(path.join(__dirname,f[0])).pipe(res);
});
const wss=new WebSocketServer({server:srv});
Game.newGame(0);
const rep=(k,v)=>typeof v==='number'?Math.round(v*10)/10:v;
wss.on('connection',ws=>{
  if(Game.getG().P.length>=MAX){ws.close();return}
  const p=Game.addPlayer();ws.pid=p.id;sn=0;if(ws._socket)ws._socket.setNoDelay(true);
  ws.send(JSON.stringify({me:p.id}));
  ws.on('message',d=>{
    try{
      const m=JSON.parse(d),q=Game.getG().P.find(o=>o.id===ws.pid);
      if(q){q.inp.l=m.l?1:0;q.inp.r=m.r?1:0;if(m.d)q.inp.d=1}
    }catch(e){}
  });
  ws.on('close',()=>{const G=Game.getG();G.P=G.P.filter(o=>o.id!==ws.pid)});
});
const TICK=+process.env.TICK_HZ||60,SEND=+process.env.SEND_HZ||60,STEP=1/TICK,EVERY=Math.max(1,Math.round(TICK/SEND));
let prev=performance.now(),acc=0,tk=0,sn=0,overAt=0;
setInterval(()=>{
  const now=performance.now();
  acc=Math.min(acc+(now-prev)/1000,.25);prev=now;
  while(acc>=STEP){
    acc-=STEP;
    const G=Game.getG();
    if(!G.P.length)continue;
    if(G.over){
      if(!overAt)overAt=now;
      if(now-overAt>10000){overAt=0;sn=0;Game.newGame(0);wss.clients.forEach(c=>{if(c.pid!==undefined)Game.addPlayer(c.pid)})}
    }else Game.update(STEP);
    if(++tk%EVERY===0){
      const msg=JSON.stringify({s:Game.snap(sn++%4===0)},rep);
      wss.clients.forEach(c=>{if(c.readyState===1)c.send(msg)});
    }
  }
},4);
srv.listen(PORT,()=>console.log('Servidor na porta '+PORT));
