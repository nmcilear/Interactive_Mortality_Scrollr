/* ===== v4: scrollytelling scenes ===== */
// Scrollytelling framework. Each scrolling section (.scrolly) has text steps on one side and a sticky 'stage' on the other.
// Which step is active is decided from scroll position (the step whose text is closest to the middle of the screen; lower on phones, where the stage is pinned to the top).
// Each section registers a function that redraws its stage for a given step number; sections also redraw on load, font load, resize and first view.
const SCR=[];
function scrolly(id,fn){
  const sec=$(id),steps=[...sec.querySelectorAll('.step')];let cur=-1,seen=false;
  const o={sec,go(i,force){if(i===cur&&!force)return;cur=i;steps.forEach((s,k)=>s.classList.toggle('on',k===i));fn(i)},
    get cur(){return cur},
    visible(){const r=sec.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0},
    pick(){const mob=innerWidth<=860,tg=innerHeight*(mob?.8:.5);let best=0,bd=1e9;
      steps.forEach((s,k)=>{const b=s.querySelector('.box').getBoundingClientRect(),d=Math.abs((b.top+b.bottom)/2-tg);if(d<bd){bd=d;best=k}});return best},
    first(){if(!seen){seen=true;o.go(o.pick(),true)}}};
  SCR.push(o);o.go(0);return o.go;
}
let scTick=0;
function scrollSync(){scTick=0;SCR.forEach(o=>{if(o.visible()){o.first();o.go(o.pick())}})}
addEventListener('scroll',()=>{if(!scTick)scTick=requestAnimationFrame(scrollSync)},{passive:true});
function refreshAll(){SCR.forEach(o=>o.go(o.visible()?o.pick():Math.max(0,o.cur),true))}
addEventListener('load',()=>{refreshAll();scrollSync()});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{refreshAll()});
let rfT;addEventListener('resize',()=>{clearTimeout(rfT);rfT=setTimeout(refreshAll,250)});
// Ease-in-out curve for the map zoom and the histogram build-up.
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const svgIn=(el,w,h,inner,label)=>{el.innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" style="width:100%">${inner}</svg>`};
// The example animal used in the map walkthrough (a coyote shot in April 2021, tracked 634 days).
const MID='MVCOY58M';

// Scene 1: map walkthrough. The view box is tweened between the whole study area, the Okanogan site and the example animal's territory.
// Layers appear by step: roads, GPS positions, the 250 m road band (true scale), territory outline, death marker.
/* ---------- scene 1: the map ---------- */
(function(){
  const c=$('scMap'),note=$('scMapNote');let step=0,W=0,H=0,g=null,cur=null,raf=0;
  const bAll=siteBox('both'),bOk=siteBox('Okanogan');
  const A=AN[MID];let bF=[1e9,1e9,-1e9,-1e9];
  for(let i=0;i<A.n;i++){bF[0]=Math.min(bF[0],A.x[i]);bF[1]=Math.min(bF[1],A.y[i]);bF[2]=Math.max(bF[2],A.x[i]);bF[3]=Math.max(bF[3],A.y[i])}
  const m=Math.max(1.2*U,(bF[2]-bF[0])*.08);bF=[bF[0]-m,bF[1]-m,bF[2]+m,bF[3]+m];
  const siteC={};['Okanogan','Northeast'].forEach(s=>{const b=siteBox(s);siteC[s]=[(b[0]+b[2])/2,b[3]]});
  const targets=[bAll,bAll,bOk,bF,bF];
  function size(){const st=c.closest('.stagein');W=Math.max(260,Math.floor(st.clientWidth));
    H=innerWidth<=860?Math.round(Math.max(200,innerHeight*.56-60)):Math.round(Math.max(300,Math.min(innerHeight*.78,W*1.05)));g=fitCanvas(c,W,H)}
  function draw(box){
    if(!g)size();const V=mkView(W,H,box),wk=(box[2]-box[0])/U;
    g.fillStyle='#fbfcfb';g.fillRect(0,0,W,H);g.lineJoin='round';g.lineCap='round';
    if(step>=3){g.strokeStyle='rgba(15,107,99,.17)';g.lineWidth=.5*U*V.sc;strokeRoads(g,V,ROADS.minor.concat(ROADS.major),box,.8*U)}
    if(wk<90&&step>=2){g.strokeStyle='rgba(120,130,125,.45)';g.lineWidth=.6;strokeRoads(g,V,ROADS.minor,box,0)}
    g.strokeStyle='#7c8883';g.lineWidth=wk<30?1.2:1;strokeRoads(g,V,ROADS.major,box,0);
    if(step===1||step===2){const all=step===1;g.globalAlpha=all?.3:.14;
      for(const a of Object.values(AN)){if(!all&&a.r.site!=='Okanogan')continue;g.fillStyle=SPC[a.r.sp];const st=all?3:2;
        for(let i=0;i<a.n;i+=st){const p=V.P(a.x[i],a.y[i]);g.fillRect(p[0]-1,p[1]-1,2,2)}}g.globalAlpha=1}
    if(step>=3){const ac=SPC.Coyote;
      if(A.ell){const [cx,cy,ra,rb,th]=A.ell,p=V.P(cx,cy);g.strokeStyle=ac;g.lineWidth=1.8;g.setLineDash([7,5]);g.beginPath();g.ellipse(p[0],p[1],ra*V.sc,rb*V.sc,-th,0,2*Math.PI);g.stroke();g.setLineDash([])}
      g.fillStyle=ac;g.globalAlpha=.35;for(let i=0;i<A.n;i++){const p=V.P(A.x[i],A.y[i]);g.beginPath();g.arc(p[0],p[1],2.2,0,7);g.fill()}g.globalAlpha=1;
      if(step>=4){const q=V.P(A.x[A.n-1],A.y[A.n-1]);drawMark(g,'Human',q[0],q[1],8);g.font='700 13px Open Sans,Arial,sans-serif';const t=`${MID} · shot ${fdate(A.r.off)}`;const tw=g.measureText(t).width;
        const tx=q[0]+14+tw>W-6?q[0]-14-tw:q[0]+14;g.lineWidth=4;g.strokeStyle='rgba(251,252,251,.95)';g.strokeText(t,tx,q[1]+4);g.fillStyle='#1b2321';g.fillText(t,tx,q[1]+4)}}
    if(step<=1){g.font='700 13px Open Sans,Arial,sans-serif';for(const s in siteC){const p=V.P(siteC[s][0],siteC[s][1]);g.lineWidth=4;g.strokeStyle='rgba(251,252,251,.95)';g.strokeText(s,p[0]-24,p[1]-6);g.fillStyle='#1b2321';g.fillText(s,p[0]-24,p[1]-6)}}
    // scale bar
    let km=[1,2,5,10,20,50].find(k=>k*U*V.sc>=70)||50;const bl=km*U*V.sc;g.fillStyle='#303870';g.fillRect(14,H-22,bl,3);g.font='11px Open Sans,Arial,sans-serif';g.fillText(km+' km',14,H-27);
  }
  function legend(){
    const sw=(col)=>`<svg width="14" height="14" viewBox="-7 -7 14 14" style="width:14px"><circle r="4" fill="${col}"/></svg>`;
    note.innerHTML=[
     '<b>Black lines:</b> major roads. Two study sites about 150 km apart.',
     `${sw(SPC.Bobcat)} bobcat positions &nbsp; ${sw(SPC.Coyote)} coyote positions`,
     'Pale lines: all vehicle-capable roads, from highways to forest tracks.',
     `<span style="background:rgba(15,107,99,.25);padding:0 8px;margin-right:4px"></span>within 250 m of a road, to scale &nbsp; <svg width="22" height="8" style="width:22px"><line x1="0" x2="22" y1="4" y2="4" stroke="${SPC.Coyote}" stroke-width="1.8" stroke-dasharray="5 3"/></svg> approximate territory`,
     `${legShape('Human')} killed by people`][step];
  }
  function go(i){
    step=i;legend();const to=targets[i];
    if(RM||!cur){cur=to.slice();draw(cur);return}
    const from=cur.slice(),t0=performance.now(),dur=900;cancelAnimationFrame(raf);
    const f=t=>{const k=ease(Math.min(1,(t-t0)/dur));cur=from.map((v,j)=>v+(to[j]-v)*k);draw(cur);if(k<1)raf=requestAnimationFrame(f)};raf=requestAnimationFrame(f);
  }
  const sg=scrolly('sc-map',i=>{if(!cur)cur=targets[0].slice();go(i)});
  addEventListener('resize',()=>{g=null;cur=targets[step].slice();draw(cur)});
})();

// Scene 2: lifelines. Each step highlights one group of outcomes (people / large carnivores / everything else) by fading the rest, via S.hlA.
/* ---------- scene 2: life lines (highlights) ---------- */
scrolly('sc-life',i=>{S.hlA=[null,['Human'],['Large carnivore'],['Other','Unknown','Survived/censored']][i];pA()});

// Scene 3: how a rate is calculated. Eight coyotes (three killed by people) are laid end to end to show animal-years, then deaths are divided by animal-years.
// The all-animal figures in the last step are computed from the data, not typed in.
/* ---------- scene 3: rate = deaths / animal-years ---------- */
(function(){
  const co=D.inds.filter(r=>r.sp==='Coyote').sort((a,b)=>a.id<b.id?-1:1);
  const hu=co.filter(r=>r.fate==='Human').slice(0,3),ot=co.filter(r=>r.fate!=='Human'&&r.yrs>.4);
  const oth=[0,1,2,3,4].map(k=>ot[Math.floor(k*ot.length/5)]);
  const pick=[hu[0],oth[0],oth[1],hu[1],oth[2],oth[3],hu[2],oth[4]];
  const tot=sum(pick.map(r=>r.yrs)),kk=pick.filter(r=>r.fate==='Human').length;
  $('rT').textContent=tot.toFixed(1);$('rK').textContent=kk+' of 8';
  const allC=co,aY=sum(allC.map(r=>r.yrs)),aK=allC.filter(r=>r.fate==='Human').length;
  const bo=D.inds.filter(r=>r.sp==='Bobcat'),bY=sum(bo.map(r=>r.yrs)),bK=bo.filter(r=>r.fate==='Human').length;
  window.RATEFACT={aY,aK,bY,bK,tot,kk};
  const W=520,H=330,x0=96,mx=Math.max(...pick.map(r=>r.yrs));
  function f(step){
    let o='';const s1=330/mx;
    if(step===0){
      pick.forEach((r,i)=>{const y=26+i*36;o+=`<text x="${x0-8}" y="${y+14}" text-anchor="end" class="mono" style="font-size:10.5px">${r.id}</text><rect x="${x0}" y="${y}" width="${r.yrs*s1}" height="20" fill="${SPC.Coyote}" opacity=".75" rx="2"/><text x="${x0+r.yrs*s1+6}" y="${y+14}">${r.yrs.toFixed(1)} yr</text>`});
      o+=`<text x="${x0}" y="14" style="font-weight:700;fill:var(--ink)">Years each coyote was tracked</text>`;
    }else{
      let x=30;const sc=460/tot,by=96;
      o+=`<text x="30" y="40" style="font-weight:700;fill:var(--ink)">The same eight tracks, end to end</text>`;
      pick.forEach((r,i)=>{const w=r.yrs*sc;o+=`<rect x="${x}" y="${by}" width="${w}" height="40" fill="${SPC.Coyote}" opacity="${i%2?.55:.8}" stroke="#fff" stroke-width="1"/>`;
        if(step>=2&&r.fate==='Human')o+=shape('Human',x+w-9,by+20,7,false);x+=w});
      o+=`<line x1="30" x2="${x}" y1="${by+60}" y2="${by+60}" stroke="var(--ink)"/><line x1="30" x2="30" y1="${by+54}" y2="${by+66}" stroke="var(--ink)"/><line x1="${x}" x2="${x}" y1="${by+54}" y2="${by+66}" stroke="var(--ink)"/>`;
      o+=`<text x="${(30+x)/2}" y="${by+84}" text-anchor="middle" style="font-size:14px;font-weight:700;fill:var(--ink)">${tot.toFixed(1)} animal-years</text>`;
      if(step>=2)o+=`<g>${shape('Human',38,by+112,7,false)}<text x="52" y="${by+116}" style="font-size:13px;fill:var(--ink)">${kk} killed by people</text></g>`;
      if(step>=3){o+=`<text x="30" y="${by+160}" style="font-size:15px;font-weight:700;fill:var(--ink)">${kk} ÷ ${tot.toFixed(1)} = ${(kk/tot).toFixed(2)} deaths per animal-year</text><text x="30" y="${by+184}" style="font-size:12.5px">All ${allC.length} coyotes: ${aK} ÷ ${aY.toFixed(1)} = ${(aK/aY).toFixed(2)} &nbsp;·&nbsp; all ${bo.length} bobcats: ${bK} ÷ ${bY.toFixed(1)} = ${(bK/bY).toFixed(2)}</text>`}
    }
    svgIn($('scRate'),W,H,o,'Diagram showing how a death rate is calculated from tracking time');
  }
  scrolly('sc-rate',f);
})();

// Scene 4: explainer for 'road exposure'. A synthetic 10 x 7 grid of 100 m squares, a Gaussian use-probability surface (percentages sum to 100) and a road.
// Squares whose centre is within 250 m of the road count; exposure is the sum of their probability. This is a simplified illustration, not real data.
/* ---------- scene 4: what "road exposure" means ---------- */
(function(){
  const NX=10,NY=7,cs=44,ox=20,oy=14,W=480,H=410;
  const road=[[0,700],[400,700],[700,560],[1000,300]];
  const dseg=(px,py,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy)};
  const cells=[];let tp=0;
  for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){const mx=(i+.5)*100,my=(j+.5)*100,p=Math.exp(-((mx-470)**2+(my-330)**2)/(2*170*170)),d=Math.min(...[0,1,2].map(k=>dseg(mx,my,road[k],road[k+1])));cells.push({i,j,p,d});tp+=p}
  cells.forEach(c=>c.p=100*c.p/tp);
  const inb=cells.filter(c=>c.d<=250),E=sum(inb.map(c=>c.p));
  const R=rng(5),pts=[];for(let k=0;k<46;k++){const u=Math.sqrt(-2*Math.log(R()+1e-9)),a=2*Math.PI*R(),px=470+170*u*Math.cos(a),py=330+170*u*Math.sin(a);if(px>20&&px<980&&py>20&&py<680)pts.push([px,py])}
  const X=m=>ox+m*cs/100,Y=m=>oy+m*cs/100,rd=road.map(p=>`${X(p[0])},${Y(p[1])}`).join(' ');
  function f(step){
    let o=`<rect x="${ox}" y="${oy}" width="${NX*cs}" height="${NY*cs}" fill="#fbfcfb" stroke="var(--line)"/>`;
    cells.forEach(c=>{const x=ox+c.i*cs,y=oy+c.j*cs,band=c.d<=250;
      if(step>=1)o+=`<rect x="${x}" y="${y}" width="${cs}" height="${cs}" fill="#303870" opacity="${(Math.min(1,c.p/9)*.8*(step>=3&&!band?.35:1)).toFixed(3)}"/>`;
      if(step>=2&&band)o+=`<rect x="${x+1}" y="${y+1}" width="${cs-2}" height="${cs-2}" fill="rgba(15,107,99,.12)" stroke="#0f6b63" stroke-width="${step>=3?2:1.2}"/>`;
      if(step>=1&&c.p>=1.5){const v=Math.round(c.p),dk=c.p/9>.45;o+=`<text x="${x+cs/2}" y="${y+cs/2+4}" text-anchor="middle" style="font-size:11px;font-weight:${step>=3&&band?700:400};fill:${dk?'#fff':'var(--ink)'};opacity:${step>=3&&!band?.4:1}">${v}</text>`}});
    if(step>=1)for(let k=0;k<=NX;k++)o+=`<line x1="${ox+k*cs}" x2="${ox+k*cs}" y1="${oy}" y2="${oy+NY*cs}" stroke="#fff" stroke-width=".6" opacity=".5"/>`;
    o+=`<polyline points="${rd}" fill="none" stroke="#7c8883" stroke-width="3" stroke-linecap="round"/><text x="${X(60)}" y="${Y(672)}" style="font-size:11px;fill:var(--ink)">road</text>`;
    if(step<=1)pts.forEach(p=>{o+=`<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3" fill="${SPC.Coyote}" opacity="${step===0?.85:.35}" stroke="#fff" stroke-width=".6"/>`});
    o+=`<rect x="${ox}" y="${oy+NY*cs+14}" width="${cs}" height="4" fill="#303870"/><text x="${ox+cs+6}" y="${oy+NY*cs+19}">100 m</text>`;
    const cap=['Each dot is one GPS position.','Each square shows the chance (%) of the animal being there. Darker is more likely. The squares total 100%.','Squares within 250 m of the road are outlined.','Road exposure = the numbers in the outlined squares added up'+` ≈ ${E.toFixed(0)}%`][step];
    const words=cap.split(' ');let lines=[''];words.forEach(w=>{if((lines[lines.length-1]+' '+w).length>58)lines.push(w);else lines[lines.length-1]+=(lines[lines.length-1]?' ':'')+w});
    o+=lines.map((l,k)=>`<text x="${ox}" y="${oy+NY*cs+44+k*18}" style="font-size:13px;fill:var(--ink);${step===3?'font-weight:700':''}">${l}</text>`).join('');
    svgIn($('scExp'),W,H,o,'Schematic grid showing how road exposure is added up from squares near a road');
  }
  window.EXPFACT={E,n:inb.length};scrolly('sc-exp',f);
})();

// Scene 5: chart B revealed layer by layer (S.stB = step + 1; see pB in js2 for what each level shows).
/* ---------- scene 5: exposure chart, revealed in steps ---------- */
scrolly('sc-b',i=>{S.stB=i+1;pB()});

// Scene 6: bootstrap explainer for the intervals on chart B. Uses the 14 real coyote exposures and the same seed and number of resamples (2,000) as chart B,
// so the interval shown here matches the chart. Step 1 cycles through the first few resamples; step 2 builds the histogram of all medians; step 3 marks the middle 95%.
/* ---------- scene 6: how the vertical lines are made (bootstrap) ---------- */
(function(){
  const vals=D.inds.filter(r=>r.sp==='Coyote'&&r.fate==='Human'&&r.p250!=null).map(r=>r.p250),n=vals.length;
  const R=rng(26),meds=[],draws=[];
  for(let b=0;b<2000;b++){const s=[],ix=[];for(let i=0;i<n;i++){const k=(R()*n)|0;ix.push(k);s.push(vals[k])}meds.push(median(s));if(b<8)draws.push(ix)}
  const srt=[...meds].sort((a,b)=>a-b),lo=pct(srt,2.5),hi=pct(srt,97.5),m0=median(vals);
  const W=520,H=470,L=34,Rr=20,x=v=>L+v/100*(W-L-Rr);
  const bins=Array.from({length:50},()=>0);
  let step=0,k=0,ri=0,raf=0,timer=0;
  function strip(y,idx,lab){let o=`<text x="${L}" y="${y-74}" style="font-weight:700;fill:var(--ink);font-size:12px">${lab}</text><line x1="${L}" x2="${W-Rr}" y1="${y+8}" y2="${y+8}" stroke="var(--line)"/>`;
    const cnt={};idx.forEach(j=>cnt[j]=(cnt[j]||0)+1);const seen={};
    idx.forEach(j=>{seen[j]=(seen[j]||0)+1;o+=`<circle cx="${x(vals[j])}" cy="${y-(seen[j]-1)*8}" r="3.6" fill="${SPC.Coyote}" opacity="${cnt[j]>1?.95:.5}" stroke="#fff" stroke-width=".8"/>`});
    const m=median(idx.map(j=>vals[j])),right=m>70;
    return o+`<line x1="${x(m)}" x2="${x(m)}" y1="${y-58}" y2="${y+14}" stroke="#b8336a" stroke-width="2"/><text x="${x(m)+(right?-6:6)}" y="${y-50}" text-anchor="${right?'end':'start'}" style="fill:#b8336a;font-weight:700">median ${m.toFixed(0)}%</text>`}
  function draw(){
    const orig=vals.map((_,j)=>j);let o='',axY;
    o+=strip(100,orig,'The 14 coyotes killed by people');axY=132;
    if(step===1){o+=strip(250,draws[ri%draws.length],`Random draw ${ri%draws.length+1}: 14 picks, repeats allowed`);axY=282}
    if(step>=2){
      const top=235,bot=390,bh=bot-top;const mxb=Math.max(1,...bins);
      o+=`<text x="${L}" y="${top-22}" style="font-weight:700;fill:var(--ink);font-size:12px">The median from each of ${k.toLocaleString()} random draws</text>`;
      if(step>=3)o+=`<rect x="${x(lo)}" y="${top}" width="${x(hi)-x(lo)}" height="${bh}" fill="rgba(184,51,106,.14)"/>`;
      bins.forEach((c,b)=>{if(c)o+=`<rect x="${x(b*2)+1}" y="${bot-c/mxb*bh}" width="${x(2)-x(0)-1.5}" height="${c/mxb*bh}" fill="${SPC.Coyote}" opacity=".8"/>`});
      o+=`<line x1="${L}" x2="${W-Rr}" y1="${bot}" y2="${bot}" stroke="var(--ink3)"/>`;
      if(step>=3)o+=`<line x1="${x(lo)}" x2="${x(lo)}" y1="${top}" y2="${bot}" stroke="#b8336a" stroke-dasharray="4 3"/><line x1="${x(hi)}" x2="${x(hi)}" y1="${top}" y2="${bot}" stroke="#b8336a" stroke-dasharray="4 3"/><text x="${(x(lo)+x(hi))/2}" y="${bot+38}" text-anchor="middle" style="font-weight:700;fill:#b8336a;font-size:13px">middle 95%: ${lo.toFixed(0)}% to ${hi.toFixed(0)}%</text>`;
      axY=bot;
    }
    [0,25,50,75,100].forEach(v=>{o+=`<text x="${x(v)}" y="${axY+16}" text-anchor="middle" class="mono">${v}%</text>`});
    o+=`<text x="${(L+W-Rr)/2}" y="${H-6}" text-anchor="middle" style="font-size:11px">% of territory within 250 m of a road</text>`;
    svgIn($('scBoot'),W,H,o,'Diagram of the bootstrap: resampling 14 coyote exposures and collecting the medians');
  }
  function fill(to){cancelAnimationFrame(raf);const from=k;if(RM||to<=from){bins.fill(0);for(let b=0;b<to;b++)bins[Math.min(49,Math.floor(meds[b]/2))]++;k=to;draw();return}
    const t0=performance.now(),dur=1600;const f=t=>{const kk=Math.round(to*ease(Math.min(1,(t-t0)/dur)));while(k<kk){bins[Math.min(49,Math.floor(meds[k]/2))]++;k++}draw();if(k<to)raf=requestAnimationFrame(f)};raf=requestAnimationFrame(f)}
  scrolly('sc-boot',i=>{step=i;clearInterval(timer);if(i===1&&!RM)timer=setInterval(()=>{ri++;draw()},1100);
    if(i>=2)fill(2000);else{k=0;bins.fill(0);draw()}});
  window.BOOTFACT={lo,hi,m0};
})();

// Scene 7: risk curve revealed in steps (ticks, line, band, refits, full). Step 3 switches the uncertainty display to animated refits.
/* ---------- scene 7: risk curve ---------- */
scrolly('sc-d',i=>{S.stD=[1,2,3,3,5][i];S.unc=i===3?'hop':'band';$('uBand').setAttribute('aria-pressed',i!==3);$('uHop').setAttribute('aria-pressed',i===3);$('hopPlay').hidden=!(i===3)||RM;pD()});

// Scene 8: overlap explainer. Two territories are drawn as discs; for equal circular Gaussians separated by distance d the Bhattacharyya coefficient is
// exp(-d^2 / (8*s^2)), which gives the 0.02 / 0.56 / 1.00 examples. The last two steps show the real heatmap and permutation test.
/* ---------- scene 8: overlap ---------- */
(function(){
  const W=480,H=250,cy=110,s=44,x1=130,dist=[240,95,0];
  const bc=d=>Math.exp(-((d/s)**2)/8);
  let built=false;
  function build(){
    const ring=(cx,col,id)=>`<g id="${id}" style="transition:transform ${RM?0:.8}s ease;mix-blend-mode:multiply"><circle cx="${cx}" cy="${cy}" r="${2*s}" fill="${col}" opacity=".16"/><circle cx="${cx}" cy="${cy}" r="${s}" fill="${col}" opacity=".38"/></g>`;
    $('scOv').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Two territories drawn as overlapping discs" style="width:100%">${ring(x1,SPC.Bobcat,'ovA')}${ring(x1,SPC.Coyote,'ovB')}<text id="ovLb" x="${x1}" y="26" text-anchor="middle" style="font-weight:700;fill:${SPC.Bobcat}">Bobcat</text><text id="ovLab" x="${x1+dist[0]}" y="26" text-anchor="middle" style="font-weight:700;fill:${SPC.Coyote}">Coyote</text><text id="ovScore" x="${W/2}" y="${H-30}" text-anchor="middle" style="font-size:30px;font-weight:700;fill:var(--ink)"></text><text x="${W/2}" y="${H-8}" text-anchor="middle" style="font-size:12px">overlap score, from 0 (none) to 1 (identical)</text></svg>`;built=true}
  const f=i=>{
    const real=i>=3;$('scOv').hidden=real;$('ovReal').hidden=!real;
    if(real){$('pC').style.opacity=i===3?1:.35;$('pC2').style.opacity=i===3?.15:1;return}
    if(!built)build();
    const d=dist[i];$('ovB').style.transform=`translateX(${d}px)`;const sh=d<60?36:0;$('ovLab').setAttribute('x',x1+d+sh);$('ovLb').setAttribute('x',x1-sh);$('ovScore').textContent=bc(d).toFixed(2);
  };
  $('ovB')||0;scrolly('sc-ov',f);
})();
