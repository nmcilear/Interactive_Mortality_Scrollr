/* ===== map data ===== */
// Map data. T.tr holds each animal's track as one position per day: d = days since 1 Jan 2018, x and y = projected
// (UTM) coordinates minus the origin (X0, Y0), in map units where U = 100 units per kilometre.
// Roads are delta-encoded polylines (first point absolute, then differences) to keep the file small.
const X0=T.X0,Y0=T.Y0,U=T.U,B0=Date.UTC(2018,0,1);
// Per-animal track objects for drawing: coordinates, day-of-year of each position (so all years can be overlaid on one calendar), first position index per day, territory ellipse and death event.
const AN={};
D.inds.forEach(r=>{const q=T.tr[r.id];if(!q||!q.d.length)return;const n=q.d.length,o={r,n,x:q.x,y:q.y,d:q.d,doy:new Int16Array(n),fi:new Int16Array(368).fill(-1),ell:T.ell[r.id]||null};
  for(let i=0;i<n;i++){const dt=new Date(B0+q.d[i]*864e5),doy=Math.min(365,Math.floor((Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth(),dt.getUTCDate())-Date.UTC(dt.getUTCFullYear(),0,0))/864e5));o.doy[i]=doy;if(o.fi[doy]<0)o.fi[doy]=i}
  if(r.fate!=='Survived/censored')o.death={i:n-1,doy:o.doy[n-1]};
  AN[r.id]=o});
// Decoded OpenStreetMap vehicle-capable roads, split into major (highway/primary) and minor (everything else).
const ROADS={major:[],minor:[]};
for(const k of ['major','minor'])T.roads[k].forEach(p=>{let x=p[0],y=p[1];const a=[x-X0,y-Y0];for(let i=2;i<p.length;i+=2){x+=p[i];y+=p[i+1];a.push(x-X0,y-Y0)}ROADS[k].push(Float32Array.from(a))});
// Bounding box of all positions at a site (or both), with a small margin.
function siteBox(site){const b=[1e9,1e9,-1e9,-1e9];for(const a of Object.values(AN)){if(site!=='both'&&a.r.site!==site)continue;for(let i=0;i<a.n;i++){b[0]=Math.min(b[0],a.x[i]);b[1]=Math.min(b[1],a.y[i]);b[2]=Math.max(b[2],a.x[i]);b[3]=Math.max(b[3],a.y[i])}}const mx=(b[2]-b[0])*.04+.5*U,my=(b[3]-b[1])*.06+.5*U;return[b[0]-mx,b[1]-my,b[2]+mx,b[3]+my]}
// Fits a world-coordinate box into a pixel rectangle at a uniform scale (centred), and returns the projection function P(x,y) -> pixel.
function mkView(w,h,box){const bw=box[2]-box[0],bh=box[3]-box[1],sc=Math.min(w/bw,h/bh),ox=(w-bw*sc)/2,oy=(h-bh*sc)/2;return{sc,P:(x,y)=>[ox+(x-box[0])*sc,h-(oy+(y-box[1])*sc)]}}
// Sizes a canvas for the screen's pixel density (capped at 2x) so lines stay sharp without costing too much memory.
function fitCanvas(c,w,h){const d=Math.min(devicePixelRatio||1,2);c.width=Math.round(w*d);c.height=Math.round(h*d);c.style.height=h+'px';const g=c.getContext('2d');g.setTransform(d,0,0,d,0,0);return g}
// Draws a set of road polylines, skipping points outside the view for speed.
function strokeRoads(g,V,list,box,pad){g.beginPath();for(const a of list){let started=false;for(let i=0;i<a.length;i+=2){const x=a[i],y=a[i+1];if(x<box[0]-pad||x>box[2]+pad||y<box[1]-pad||y>box[3]+pad){started=false;continue}const p=V.P(x,y);if(!started){g.moveTo(p[0],p[1]);started=true}else g.lineTo(p[0],p[1])}}g.stroke()}
// Day-of-year to 'd Mon' label (a non-leap reference year).
const doyLabel=d=>{const dt=new Date(Date.UTC(2021,0,Math.floor(d)));return dt.getUTCDate()+' '+MON[dt.getUTCMonth()]};
// Map state: view ('all' or 'close'), playback flag and speed, day of year t, panels, density/territory toggles.
const M={view:'all',playing:false,speed:22,t:1,tc:0,site:'both',dens:false,terr:false,panels:[],close:null,last:0,visible:false,heads:[]};
/* ---- all-animals panels ---- */
// Builds the two side-by-side map panels (bobcats, coyotes) at the current size, with a cached background of roads, density and territory outlines.
function buildPanels(){
  const host=$('mapAll');host.innerHTML='';M.panels=[];
  const box=siteBox(M.site),bw=box[2]-box[0],bh=box[3]-box[1];
  const divs=['Bobcat','Coyote'].map(sp=>{const d=document.createElement('div');d.className='mp';d.innerHTML=`<div class="mh"><svg viewBox="0 0 ${sp==='Bobcat'?771:799} ${sp==='Bobcat'?477:592}" aria-hidden="true"><use href="#sil-${sp.toLowerCase()}" style="fill:${SPC[sp]}"/></svg><span>${sp==='Bobcat'?'Bobcats':'Coyotes'}</span><span class="cnt" id="cnt${sp}"></span></div><canvas aria-label="${sp} positions through the year"></canvas>`;host.appendChild(d);return d});
  ['Bobcat','Coyote'].forEach((sp,pi)=>{
    const d=divs[pi],c=d.querySelector('canvas'),w=Math.max(260,Math.floor(d.getBoundingClientRect().width)),h=Math.round(Math.max(170,Math.min(430,w*bh/bw)));
    const g=fitCanvas(c,w,h),V=mkView(w,h,box),bg=document.createElement('canvas');bg.width=c.width;bg.height=c.height;
    const bgx=bg.getContext('2d');bgx.setTransform(c.width/w,0,0,c.height/h,0,0);
    M.panels.push({sp,c,g,w,h,V,bg,box});drawBg(M.panels[M.panels.length-1],bgx);
    c.addEventListener('click',e=>{const b=c.getBoundingClientRect(),px=e.clientX-b.left,py=e.clientY-b.top;let best=null,bd=14;M.heads.forEach(hd=>{if(hd.sp!==sp)return;const dd=Math.hypot(hd.x-px,hd.y-py);if(dd<bd){bd=dd;best=hd.id}});if(best){S.sel=S.sel===best?null:best}else S.sel=null;render()});
    c.addEventListener('mousemove',e=>{const b=c.getBoundingClientRect(),px=e.clientX-b.left,py=e.clientY-b.top;let best=null,bd=10;M.heads.forEach(hd=>{if(hd.sp!==sp)return;const dd=Math.hypot(hd.x-px,hd.y-py);if(dd<bd){bd=dd;best=hd.id}});if(best){c.style.cursor='pointer';showTip(e,tipFor(byId[best]))}else{c.style.cursor='';hideTip()}});
    c.addEventListener('mouseleave',hideTip)});
  drawMap();
}
// Static background of a panel: optional use-density grid, roads (major darker), optional 95% territory ellipses.
function drawBg(P,x){
  const {V,w,h,sp,box}=P;x.fillStyle='#fbfcfb';x.fillRect(0,0,w,h);
  if(M.dens){const cell=1.8*U,cnt=new Map();let mx=0;for(const a of Object.values(AN)){if(a.r.sp!==sp)continue;if(M.site!=='both'&&a.r.site!==M.site)continue;for(let i=0;i<a.n;i++){const k=Math.floor(a.x[i]/cell)+','+Math.floor(a.y[i]/cell),v=(cnt.get(k)||0)+1;cnt.set(k,v);if(v>mx)mx=v}}
    const col=SPC[sp];x.fillStyle=col;cnt.forEach((v,k)=>{const [cx,cy]=k.split(',').map(Number),p=V.P(cx*cell,cy*cell+cell);x.globalAlpha=Math.min(.85,.08+Math.sqrt(v/mx)*.8);x.fillRect(p[0],p[1],cell*V.sc+.5,cell*V.sc+.5)});x.globalAlpha=1}
  x.lineJoin='round';x.strokeStyle='rgba(120,130,125,.30)';x.lineWidth=.5;strokeRoads(x,V,ROADS.minor,box,0);
  x.strokeStyle='#7c8883';x.lineWidth=1.1;strokeRoads(x,V,ROADS.major,box,0);
  if(M.terr){x.lineWidth=1;x.strokeStyle=SPC[sp];x.globalAlpha=.55;for(const a of Object.values(AN)){if(a.r.sp!==sp||!a.ell)continue;if(M.site!=='both'&&a.r.site!==M.site)continue;const [cx,cy,ra,rb,th]=a.ell,p=V.P(cx,cy);x.beginPath();x.ellipse(p[0],p[1],ra*V.sc,rb*V.sc,-th,0,2*Math.PI);x.stroke()}x.globalAlpha=1}
}
// Animation frame for the all-animals view: for each animal draw a fading two-week tail, the current position, and (once it has happened) its death marker with an expanding ring.
// All study years are overlaid on one calendar year, so seasonality is visible.
function drawMap(){
  if(M.view==='close'){drawClose();return}
  M.heads=[];const t=M.t;
  M.panels.forEach(P=>{
    const {g,w,h,V,sp}=P;g.clearRect(0,0,w,h);g.drawImage(P.bg,0,0,w,h);
    let hum=0,tot=0;
    for(const a of Object.values(AN)){
      if(a.r.sp!==sp)continue;if(M.site!=='both'&&a.r.site!==M.site)continue;
      const o=opac(a.r),c=SPC[sp],isSel=S.sel===a.r.id;
      if(a.r.fate==='Human'){tot++;if(a.death.doy<=t)hum++}
      // tail
      let prev=null;
      for(let k=14;k>=0;k--){const d=Math.floor(t)-k,dd=d>0?d:365+d,i=a.fi[dd];if(i<0){prev=null;continue}const p=V.P(a.x[i],a.y[i]);
        if(prev&&Math.hypot(a.x[i]-prev.wx,a.y[i]-prev.wy)<25*U){g.globalAlpha=Math.max(.04,o*(1-k/15)*.9);g.strokeStyle=c;g.lineWidth=isSel?2.4:1.2;g.beginPath();g.moveTo(prev.px,prev.py);g.lineTo(p[0],p[1]);g.stroke()}
        prev={px:p[0],py:p[1],wx:a.x[i],wy:a.y[i]}}
      const hi=a.fi[Math.min(365,Math.floor(t))];
      if(hi>=0&&prev){g.globalAlpha=o;g.fillStyle=c;g.strokeStyle=isSel?'#1b2321':'#fff';g.lineWidth=isSel?2:.8;g.beginPath();g.arc(prev.px,prev.py,isSel?5:2.8,0,7);g.fill();g.stroke();M.heads.push({id:a.r.id,sp,x:prev.px,y:prev.py})}
      // death marker + pulse
      if(a.death&&a.death.doy<=t){const i=a.death.i,p=V.P(a.x[i],a.y[i]);g.globalAlpha=Math.max(o,.25);
        const age=t-a.death.doy;if(age<16&&o>.2){g.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--f-'+FK[a.r.fate]);g.lineWidth=2;g.globalAlpha=(1-age/16)*.9;g.beginPath();g.arc(p[0],p[1],4+age*1.6,0,7);g.stroke();g.globalAlpha=Math.max(o,.25)}
        drawMark(g,a.r.fate,p[0],p[1],isSel?6:4.4);if(isSel){g.fillStyle='#1b2321';g.font='600 11px Schibsted Grotesk,sans-serif';g.fillText(a.r.id,p[0]+9,p[1]+4)}}
    }
    g.globalAlpha=1;
    $('cnt'+sp).textContent=`${hum} of ${tot} human-caused deaths so far`;
  });
  $('mclock').textContent=doyLabel(t)+' · all years overlaid';
  $('mscrub').value=Math.floor(t);$('mscrub').setAttribute('aria-valuetext',doyLabel(t));
}
function cssVar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}
// Canvas version of the outcome shapes in js1 shape().
function drawMark(g,f,x,y,r){g.fillStyle=cssVar('--f-'+FK[f]);g.strokeStyle='#fff';g.lineWidth=1.2;g.beginPath();
  if(f==='Human'){const a=r*1.4;g.moveTo(x,y-a);g.lineTo(x+a,y);g.lineTo(x,y+a);g.lineTo(x-a,y);g.closePath()}
  else if(f==='Large carnivore'){g.rect(x-r,y-r,2*r,2*r)}
  else if(f==='Other'){const a=r*1.3;g.moveTo(x,y-a);g.lineTo(x+a,y+a*.8);g.lineTo(x-a,y+a*.8);g.closePath()}
  else g.arc(x,y,r,0,7);
  g.fill();g.stroke()}
/* ---- close-up ---- */
// Prepares the close-up of the selected animal: all roads with a 250 m band drawn to true scale (line width = 500 m), the animal's positions, its territory outline and a 1 km scale bar.
// The static layers are drawn once to an off-screen canvas.
function setupClose(){
  const a=S.sel&&AN[S.sel];const wrap=$('mapClose'),c=$('cClose');
  if(!a){M.close=null;const w=Math.max(300,wrap.clientWidth),g=fitCanvas(c,w,160);g.fillStyle='#fbfcfb';g.fillRect(0,0,w,160);g.fillStyle='#4d5854';g.font='13px Schibsted Grotesk,sans-serif';g.fillText('Select an animal (click any dot in any view) to see its close-up.',16,80);$('closeNote').innerHTML='';return}
  const w=Math.max(300,wrap.clientWidth||wrap.getBoundingClientRect().width||600);
  let b=[1e9,1e9,-1e9,-1e9];for(let i=0;i<a.n;i++){b[0]=Math.min(b[0],a.x[i]);b[1]=Math.min(b[1],a.y[i]);b[2]=Math.max(b[2],a.x[i]);b[3]=Math.max(b[3],a.y[i])}
  const m=Math.max(1.2*U,(b[2]-b[0])*.06);b=[b[0]-m,b[1]-m,b[2]+m,b[3]+m];
  const h=Math.round(Math.max(260,Math.min(520,w*(b[3]-b[1])/(b[2]-b[0]))));
  const g=fitCanvas(c,w,h),V=mkView(w,h,b),bg=document.createElement('canvas');bg.width=c.width;bg.height=c.height;const x=bg.getContext('2d');x.setTransform(c.width/w,0,0,c.height/h,0,0);
  x.fillStyle='#fbfcfb';x.fillRect(0,0,w,h);
  const allR=ROADS.minor.concat(ROADS.major);
  x.lineCap='round';x.lineJoin='round';x.strokeStyle='rgba(15,107,99,.17)';x.lineWidth=0.5*U*V.sc;strokeRoads(x,V,allR,b,.8*U);   // 250 m either side = 500 m wide
  x.strokeStyle='#7c8883';x.lineWidth=1;strokeRoads(x,V,allR,b,.8*U);
  if(a.ell){const [cx,cy,ra,rb,th]=a.ell,p=V.P(cx,cy);x.strokeStyle=SPC[a.r.sp];x.lineWidth=1.6;x.setLineDash([6,4]);x.beginPath();x.ellipse(p[0],p[1],ra*V.sc,rb*V.sc,-th,0,2*Math.PI);x.stroke();x.setLineDash([])}
  x.fillStyle=SPC[a.r.sp];x.globalAlpha=.22;for(let i=0;i<a.n;i++){const p=V.P(a.x[i],a.y[i]);x.beginPath();x.arc(p[0],p[1],2.2,0,7);x.fill()}x.globalAlpha=1;
  // scale bar 1 km
  x.fillStyle='#303870';x.fillRect(16,h-24,U*V.sc,3);x.font='11px Schibsted Grotesk,sans-serif';x.fillText('1 km',16,h-30);
  M.close={a,g,w,h,V,bg};
  const r=a.r,f=T.fs[r.id];
  $('closeNote').innerHTML=`<span>One position per day, joined by straight lines.</span><span><svg width="22" height="10" style="width:22px"><rect width="22" height="10" fill="rgba(15,107,99,.25)"/></svg>within 250 m of a road (true scale)</span><span><svg width="22" height="6" style="width:22px"><line x1="0" x2="22" y1="3" y2="3" stroke="#7c8883" stroke-width="1.5"/></svg>road</span><span><svg width="22" height="8" style="width:22px"><line x1="0" x2="22" y1="4" y2="4" stroke="${SPC[r.sp]}" stroke-width="1.6" stroke-dasharray="5 3"/></svg>approximate territory outline</span><span><b>${r.id}</b>: ${r.p250!=null?r.p250.toFixed(0)+'% of territory':'no range estimate'} and ${f?f[1].toFixed(0):'?'}% of daily positions within 250 m of a road. ${outcomeSentence(r)}</span>`;
  const sc=$('mscrub');sc.min=0;sc.max=a.n-1;
}
// Animation frame for the close-up: a 30-day fading trail and the current position; shows the outcome label at the end of the track.
function drawClose(){
  const C=M.close;if(!C){setupClose();return}
  const {a,g,w,h,V,bg}=C;g.clearRect(0,0,w,h);g.drawImage(bg,0,0,w,h);
  const i=Math.min(a.n-1,Math.floor(M.tc)),c=SPC[a.r.sp];
  g.lineCap='round';
  for(let k=Math.max(1,i-30);k<=i;k++){const p0=V.P(a.x[k-1],a.y[k-1]),p1=V.P(a.x[k],a.y[k]);g.globalAlpha=Math.max(.08,1-(i-k)/30);g.strokeStyle=c;g.lineWidth=2.2;g.beginPath();g.moveTo(p0[0],p0[1]);g.lineTo(p1[0],p1[1]);g.stroke()}
  g.globalAlpha=1;const p=V.P(a.x[i],a.y[i]);g.fillStyle=c;g.strokeStyle='#1b2321';g.lineWidth=2;g.beginPath();g.arc(p[0],p[1],6,0,7);g.fill();g.stroke();
  if(a.death&&i>=a.n-1){const q=V.P(a.x[a.n-1],a.y[a.n-1]);drawMark(g,a.r.fate,q[0],q[1],8);g.fillStyle='#1b2321';g.font='600 12px Schibsted Grotesk,sans-serif';g.fillText(FL[a.r.fate],q[0]+12,q[1]+4)}
  const dt=new Date(B0+a.d[i]*864e5);$('mclock').textContent=dt.getUTCDate()+' '+MON[dt.getUTCMonth()]+' '+dt.getUTCFullYear();
  $('mscrub').value=i;$('mscrub').setAttribute('aria-valuetext',$('mclock').textContent);
}
/* ---- controls ---- */
// Switches between the all-animals and close-up views.
function setView(v){
  M.view=v;$('vAll').setAttribute('aria-pressed',v==='all');$('vClose').setAttribute('aria-pressed',v==='close');
  $('mapAll').hidden=v!=='all';$('mapClose').hidden=v!=='close';
  const sc=$('mscrub');$('mmonths').style.visibility=v==='all'?'':'hidden';$('sband').style.display=v==='all'?'':'none';
  if(v==='all'){sc.min=1;sc.max=365;buildPanels()}else{M.tc=0;M.close=null;setupClose();M.close&&drawClose()}
  mapLegend();
}
function mapLegend(){
  $('mleg').innerHTML=(M.view==='all'?`<span><svg width="14" height="14" viewBox="-7 -7 14 14" style="width:14px"><circle r="4" fill="${SPC.Bobcat}"/></svg>bobcat</span><span><svg width="14" height="14" viewBox="-7 -7 14 14" style="width:14px"><circle r="4" fill="${SPC.Coyote}"/></svg>coyote</span>`:'')+FATES.slice(0,4).map(f=>`<span>${legShape(f[0])}${f[2]}</span>`).join('')+`<span>ring = a death happening now</span>`;
}
// requestAnimationFrame loop that advances the map clock according to the chosen speed.
function playTick(ts){
  if(!M.playing){M.last=0;return}
  if(M.last){const dt=(ts-M.last)/1000;if(M.view==='all'){M.t+=dt*M.speed;if(M.t>=366)M.t=1}else{const a=M.close&&M.close.a;if(a){M.tc+=dt*M.speed*1.6;if(M.tc>=a.n+25)M.tc=0}}drawMap()}
  M.last=ts;requestAnimationFrame(playTick);
}
function setPlay(on){M.playing=on;$('mplay').textContent=on?'⏸ Pause':'▶ Play';$('mplay').setAttribute('aria-pressed',on);if(on){M.last=0;requestAnimationFrame(playTick)}}
$('mplay').onclick=()=>setPlay(!M.playing);
$('mspeed').onchange=e=>M.speed=+e.target.value;
$('mscrub').addEventListener('input',e=>{setPlay(false);if(M.view==='all')M.t=+e.target.value;else M.tc=+e.target.value;drawMap()});
$('msite').onchange=e=>{M.site=e.target.value;if(M.view==='all')buildPanels()};
$('mdens').onchange=e=>{M.dens=e.target.checked;if(M.view==='all')buildPanels()};
$('mterr').onchange=e=>{M.terr=e.target.checked;if(M.view==='all')buildPanels()};
$('vAll').onclick=()=>setView('all');$('vClose').onclick=()=>setView('close');
$('mmonths').innerHTML=MON.map(m=>`<span>${m[0]}</span>`).join('');
let rzT;addEventListener('resize',()=>{clearTimeout(rzT);rzT=setTimeout(()=>{pA();if(M.view==='all')buildPanels();else{M.close=null;setupClose();drawMap()}},180)});
// pause when the map is off-screen
new IntersectionObserver(es=>{M.visible=es[0].isIntersecting;if(!M.visible&&M.playing)setPlay(false);else if(M.visible&&!M.userPaused&&!RM&&!M.started){M.started=true;setPlay(true)}},{threshold:.35}).observe($('mapAll').closest('.card'));
$('mplay').addEventListener('click',()=>{M.userPaused=!M.playing});
