// Lógica do jogo, compartilhada entre navegador (modo local) e servidor (modo online)
const WW=3200,CX=1600,NIGHTS=8,DAYLEN=160;
const SL=[[-110,'bow',1],[110,'bow',1],[-220,'wall',1],[220,'wall',1],[-360,'bow',2],[360,'bow',2],[-470,'wall',2],[470,'wall',2],[-640,'wall',3],[640,'wall',3]];
const WALLHP=[0,8,16,26],WALLC=[2,4,7],BOWC=[3,5,8],CENC=[5,9];
const K=[{l:'KeyA',r:'KeyD',d:'KeyS'},{l:'ArrowLeft',r:'ArrowRight',d:'ArrowDown'}];
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
const rgb=a=>`rgb(${a[0]},${a[1]},${a[2]})`;
let G=null;
function mk(px,i){return{x:px,id:i,coins:6,inp:{l:0,r:0,d:0},face:1,mv:0,t:0,flash:0,cam:px-200,tg:null}}

function newGame(n){
  G={np:n,t:0,d0:0,day:1,ns:0,left:0,sp:0,over:null,vt:2,
    P:Array.from({length:n},(_,i)=>mk(CX-40+i*80,i)),
    cen:{lvl:1,hp:14,max:14,cd:0},
    sl:SL.map(([o,t,r])=>({x:CX+o,t,req:r,lvl:0,hp:0,ar:null,cd:0,side:Math.sign(o)})),
    pe:[{x:CX-30,tx:CX-30,job:0},{x:CX+30,tx:CX+30,job:0}],
    vg:[],gr:[],co:Array.from({length:10},(_,i)=>({x:CX-36+i*8})),fx:[],tr:mkTrees(),st:[],ch:mkChests(),tt:30};
}

function mkTrees(){const a=[];while(a.length<12){const t=rnd(160,WW-160);if(Math.abs(t-CX)>200)a.push({x:t,mark:0,v:a.length%2})}
  for(const sg of [-1,1])['wall','bow','wall'].forEach((st,i)=>a.push({x:CX+sg*(760+i*260),mark:0,v:i%2,site:st}));return a}
function mkChests(){const a=[];while(a.length<7){const t=rnd(200,WW-200);if(Math.abs(t-CX)>260&&a.every(c=>Math.abs(c.x-t)>150))a.push({x:t})}return a}
function cost(s){return s.lvl<3?(s.t==='bow'?BOWC:WALLC)[s.lvl]:0}
function build(s){s.lvl++;if(s.t==='wall')s.hp=WALLHP[s.lvl]}

function targetFor(p){
  let best=null,bd=40;
  const cand=(tx,c,fn,ic)=>{const d=Math.abs(tx-p.x);if(d<bd){bd=d;best={x:tx,cost:c,fn,ic}}};
  G.vg.forEach(v=>cand(v.x,1,()=>{G.vg.splice(G.vg.indexOf(v),1);G.pe.push({x:v.x,tx:v.x,job:0})},'per'));
  G.sl.forEach(s=>{if(G.cen.lvl<s.req||s.pend)return;const c=cost(s);if(c)cand(s.x,c,()=>{s.pend=1},s.t)});
  G.tr.forEach(t=>{if(!t.mark)cand(t.x,1,()=>{t.mark=1},'axe')});
  const idl=hx=>{let b=null,bd=1e9;G.pe.forEach(q=>{if(!q.job&&!q.b&&!q.a){const d=Math.abs(q.x-hx);if(d<bd){bd=d;b=q}}});return b};
  if(idl(CX)){
    cand(CX-64,2,()=>{const q=idl(CX-64);if(q)q.b=1},'ham');
    cand(CX+64,2,()=>{const q=idl(CX+64);if(q){q.sd=G.pe.filter(o=>o.a).length%2?1:-1;q.a=1}},'arc');
  }
  if(G.cen.lvl<3)cand(CX,CENC[G.cen.lvl-1],()=>{G.cen.lvl++;G.cen.max+=8;G.cen.hp=G.cen.max},'home');
  return best;
}

function dark(){const p=G.t%1;return p<.55?0:p<.65?(p-.55)/.1:p<.92?1:1-(p-.92)/.08}

function kill(g){
  G.gr.splice(G.gr.indexOf(g),1);
  if(Math.random()<.5)G.co.push({x:g.x});
  G.fx.push({k:'puff',x:g.x,l:.4});
}

function update(dt){
  G.t+=dt/DAYLEN;
  const pr=G.t%1,nd=Math.floor(G.t);
  // amanhecer
  if(nd>G.d0){
    G.d0=nd;G.day++;G.ns=0;
    G.gr.forEach(g=>G.fx.push({k:'puff',x:g.x,l:.4}));G.gr=[];
    G.co.push({x:CX});
    G.pe.forEach(q=>G.co.push({x:q.x+rnd(-6,6)}));
    if(G.day>NIGHTS){G.over='win';return}
  }
  // spawn de Greed
  if(pr>=.6&&!G.ns){G.ns=1;G.left=4+3*G.day}
  if(G.ns&&G.left>0){
    G.sp-=dt;
    if(G.sp<=0){
      const side=Math.random()<.5?-1:1,big=G.day>=4&&Math.random()<.2;
      G.gr.push({id:G.nid=(G.nid||0)+1,x:side<0?70:WW-70,side,hp:big?6:2,sp:big?28:38+G.day*2,dmg:big?2:1,w:big?14:8,big,cd:1,t:0,fl:0});
      G.left--;G.sp=Math.max(.7,1.6-.07*G.day);
    }
  }
  // vagabundos
  if(dark()<.3){
    G.vt-=dt;
    if(G.vt<=0){G.vt=rnd(4,8);if(G.vg.length<4){const s=Math.random()<.5?-1:1;const vx=CX+s*rnd(300,1000);G.vg.push({id:G.nid=(G.nid||0)+1,x:vx,tx:vx,w:0})}}
  }
  G.vg.forEach(v=>{v.w-=dt;if(v.w<=0){v.tx=clamp(v.x+rnd(-60,60),100,WW-100);v.w=rnd(2,5)}
    const d=v.tx-v.x;if(Math.abs(d)>1)v.x+=Math.sign(d)*Math.min(Math.abs(d),18*dt)});
  // jogadores
  G.P.forEach((p,i)=>{
    const l=p.inp.l,r=p.inp.r,dp=p.inp.d;p.inp.d=0;
    p.mv=(r?1:0)-(l?1:0);
    if(p.mv)p.face=p.mv;
    p.x=clamp(p.x+p.mv*105*dt,60,WW-60);
    p.t+=p.mv?dt:0;
    p.flash=Math.max(0,p.flash-dt);
    G.co=G.co.filter(c=>{if(Math.abs(c.x-p.x)<12){p.coins++;return false}return true});
    G.ch=G.ch.filter(c=>{if(Math.abs(c.x-p.x)<12){const n=4+Math.floor(Math.random()*4);for(let i=0;i<n;i++)G.co.push({x:c.x+rnd(-14,14)});G.fx.push({k:'pop',x:c.x,l:.3});return false}return true});
    p.tg=targetFor(p);
    if(dp&&p.tg){
      if(p.coins>=p.tg.cost){p.coins-=p.tg.cost;p.tg.fn();G.fx.push({k:'pop',x:p.tg.x,l:.3})}
      else p.flash=.5;
    }
  });
  // camponeses e arqueiros
  const nt=dark()>.5;
  const bw=G.sl.filter(s=>s.t==='wall'&&s.lvl&&s.hp>0).map(s=>s.x);
  const wl=bw.filter(v=>v<CX),wr=bw.filter(v=>v>CX);
  const zl=wl.length?Math.min(...wl)+12:CX-150,zr=wr.length?Math.max(...wr)-12:CX+150;
  const bl=G.pe.filter(q=>q.b);
  bl.forEach(q=>{if(nt||(q.work&&!(q.work.pend||q.work.mark)))q.work=null});
  if(!nt){
    G.sl.filter(s=>s.pend).concat(G.tr.filter(t=>t.mark)).forEach(w=>{
      if(bl.some(q=>q.work===w))return;
      let bq=null,bd=1e9;
      bl.forEach(q=>{if(!q.work){const d=Math.abs(q.x-w.x);if(d<bd){bd=d;bq=q}}});
      if(bq){bq.work=w;bq.wt=0}
    });
  }
  bl.forEach((q,i)=>{q.home=zl+(i+1)/(bl.length+1)*(zr-zl)});
  const cnt={'-1':0,'1':0};
  G.pe.forEach(q=>{if(q.a&&!q.job)q.k=cnt[q.sd]++});
  G.pe.forEach(q=>{
    if(q.work){
      q.tx=q.work.x;
      if(Math.abs(q.x-q.tx)<4){
        q.wt+=dt;q.hit=1;
        const w=q.work,need=w.t?3+2*w.lvl:3;
        if(q.wt>=need){
          if(w.t){w.pend=0;build(w)}
          else{G.tr.splice(G.tr.indexOf(w),1);G.st.push({x:w.x});if(w.site)G.sl.push({x:w.x,t:w.site,req:0,lvl:0,hp:0,ar:null,cd:0,side:Math.sign(w.x-CX)});for(let i=0;i<3;i++)G.co.push({x:w.x+rnd(-12,12)});G.fx.push({k:'puff',x:w.x,l:.4})}
          q.work=null;q.hit=0;
        }
      }else q.hit=0;
    }else if(q.b){q.hit=0;q.w=(q.w||0)-dt;if(q.w<=0||q.tx===undefined){q.tx=clamp(q.home+rnd(-14,14),zl,zr);q.w=rnd(2,5)}}
    else if(q.a&&!q.job){
      const ws=bw.filter(v=>(v-CX)*q.sd>0);
      const ow=ws.length?(q.sd<0?Math.min(...ws):Math.max(...ws)):CX+q.sd*100;
      q.tx=ow-q.sd*(14+(q.k%4)*9);
    }
    else if(!q.job){q.hit=0;q.w=(q.w||0)-dt;if(q.w<=0){q.tx=CX+rnd(-110,110);q.w=rnd(2,5)}}
    else q.tx=q.s.x+(q.s.ars.indexOf(q)-(q.s.lvl-1)/2)*8;
    const d=q.tx-q.x;
    q.m=Math.abs(d)>1;if(q.m){q.x+=Math.sign(d)*Math.min(Math.abs(d),45*dt);q.f=d<0}
  });
  G.sl.forEach(s=>{
    if(s.t!=='bow'||!s.lvl)return;
    s.ars=s.ars||[];
    while(s.ars.length<s.lvl){
      let q=null,qd=1e9;G.pe.forEach(o=>{if(o.a&&!o.job){const d=Math.abs(o.x-s.x);if(d<qd){qd=d;q=o}}});
      if(!q)break;q.job=1;q.s=s;s.ars.push(q);
    }
    s.ars.forEach(q=>{
      if(!(Math.abs(q.x-q.tx)<3))return;
      q.cd=(q.cd||0)-dt;
      if(q.cd>0)return;
      let t=null,bd=270;
      G.gr.forEach(g=>{const d=Math.abs(g.x-q.x);if(d<bd&&!g.fl){bd=d;t=g}});
      if(t){t.hp--;q.cd=1.1;q.f=t.x<q.x;G.fx.push({k:'arrow',x:q.x,y:22,x2:t.x,y2:4,l:.15});if(t.hp<=0)kill(t)}
    });
  });
  G.pe.forEach(q=>{
    if(!q.a||q.job)return;
    q.cd=(q.cd||0)-dt;
    if(q.cd>0)return;
    let t=null,bd=230;
    G.gr.forEach(g=>{const d=Math.abs(g.x-q.x);if(d<bd&&!g.fl){bd=d;t=g}});
    if(t){t.hp--;q.cd=1.3;q.f=t.x<q.x;G.fx.push({k:'arrow',x:q.x,y:8,x2:t.x,y2:4,l:.15});if(t.hp<=0)kill(t)}
  });
  // Greed
  [...G.gr].forEach(g=>{
    g.t+=dt;
    if(g.fl){g.x-=g.side*0+(-g.side)*0;g.x+=g.side*g.sp*1.5*dt;if(g.x<20||g.x>WW-20)G.gr.splice(G.gr.indexOf(g),1);return}
    const dir=-g.side;
    G.P.forEach(p=>{
      if(!g.fl&&p.coins>0&&Math.abs(p.x-g.x)<10){
        for(let i=0;i<p.coins;i++)G.co.push({x:p.x+rnd(-16,16)});
        p.coins=0;p.flash=.9;g.fl=1;
      }
    });
    if(g.fl)return;
    const blk=G.sl.find(s=>s.t==='wall'&&s.lvl&&s.hp>0&&s.side==g.side&&Math.abs(s.x-g.x)<g.w/2+5&&(s.x-g.x)*dir>-3);
    if(blk){
      g.cd-=dt;
      if(g.cd<=0){g.cd=1;blk.hp-=g.dmg;G.fx.push({k:'puff',x:blk.x,l:.2});if(blk.hp<=0){blk.hp=0;blk.lvl=0}}
    }else if(Math.abs(g.x-CX)<24){
      g.cd-=dt;
      if(g.cd<=0){g.cd=1.2;G.cen.hp-=g.dmg;if(G.cen.hp<=0){G.over='lose'}}
    }else g.x+=dir*g.sp*dt;
  });
  G.fx.forEach(f=>f.l-=dt);G.fx=G.fx.filter(f=>f.l>0);
}


function addPlayer(id){
  if(id===undefined){const u=new Set(G.P.map(p=>p.id));id=0;while(u.has(id))id++}
  const p=mk(CX+rnd(-40,40),id);G.P.push(p);return p;
}
function snap(full){
  const si=o=>G.sl.indexOf(o),ti=o=>G.tr.indexOf(o);
  const d={t:G.t,day:G.day,over:G.over,cen:G.cen,
    P:G.P.map(p=>({x:p.x,id:p.id,coins:p.coins,face:p.face,mv:p.mv,t:p.t,flash:p.flash,tg:p.tg?{x:p.tg.x,cost:p.tg.cost,ic:p.tg.ic}:null})),
    pe:G.pe.map(q=>({x:q.x,tx:q.tx,f:q.f,m:q.m,a:q.a,b:q.b,job:q.job,hit:q.hit,wt:q.wt,wk:!q.work?null:q.work.t?'s'+si(q.work):'t'+ti(q.work)})),
    vg:G.vg.map(v=>({id:v.id,x:v.x,tx:v.tx})),
    gr:G.gr.map(g=>({id:g.id,x:g.x,fl:g.fl,big:g.big,t:g.t})),
    co:G.co,fx:G.fx};
  if(full){
    d.sl=G.sl.map(s=>({x:s.x,t:s.t,req:s.req,lvl:s.lvl,hp:s.hp,pend:s.pend}));
    d.tr=G.tr;d.st=G.st;d.ch=G.ch;
  }
  return d;
}
function carry(a,b,k){
  const m=new Map((b||[]).map((e,i)=>[k(e,i),e]));
  a.forEach((e,i)=>{e.sx=e.x;const p=m.get(k(e,i));if(p&&p.x!==undefined)e.x=p.x});
}
function applySnap(d){
  const o=G;
  if(!d.sl){if(!o||!o.sl)return;d.sl=o.sl;d.tr=o.tr;d.st=o.st;d.ch=o.ch}
  d.np=1;d.t0=d.t;d.at=performance.now();
  carry(d.P,o&&o.P,e=>e.id);carry(d.pe,o&&o.pe,(e,i)=>i);carry(d.vg,o&&o.vg,e=>e.id);carry(d.gr,o&&o.gr,e=>e.id);
  G=d;
  G.pe.forEach(q=>{q.work=!q.wk?null:q.wk[0]==='s'?G.sl[+q.wk.slice(1)]:G.tr[+q.wk.slice(1)]});
}
if(typeof module!=='undefined')module.exports={newGame,update,snap,addPlayer,getG:()=>G};
