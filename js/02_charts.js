/* ===== filter chips, animal card ===== */
// Outcome filter chips plus the floating 'animal card' that describes the selected animal or species.
function chips(){
  $('chips').innerHTML=FATES.map(f=>`<button class="chip" aria-pressed="${S.on.has(f[0])}" data-f="${f[0]}">${legShape(f[0])}${f[2]}</button>`).join('');
  $('chips').querySelectorAll('button').forEach(b=>b.onclick=()=>{const k=b.dataset.f;S.on.has(k)?S.on.delete(k):S.on.add(k);if(S.on.size===0)FATES.forEach(f=>S.on.add(f[0]));render()});
  const s=S.sel&&byId[S.sel],card=document.getElementById('animalcard');
  if(s){card.classList.add('on');card.innerHTML=`<span><b>${s.id}</b> is a ${who(s)} at ${s.site}, tracked for ${s.yrs.toFixed(1)} years. ${outcomeSentence(s)} ${expSentence(s)}</span><span style="white-space:nowrap"><button class="btn" id="closeup">Close-up on the map</button> <button class="btn" id="clr">Clear</button></span>`;
    document.getElementById('clr').onclick=()=>{S.sel=null;render()};document.getElementById('closeup').onclick=()=>{goSlide('c2');setView('close')}}
  else if(S.sp){card.classList.add('on');card.innerHTML=`<span><b>All ${S.sp.toLowerCase()}s</b> are highlighted.</span><button class="btn" id="clrsp">Clear</button>`;document.getElementById('clrsp').onclick=()=>{S.sp=null;render()}}
  else{card.classList.remove('on');card.innerHTML=''}
}
/* ===== A lifelines ===== */
// Chart A: lifelines. One horizontal line per animal, length = years tracked, marker at the end shows how tracking ended.
// Rows are sorted by outcome then by length. In narrow windows the two species are stacked instead of side by side.
// S.hlA (set by the scrolling story) fades every outcome except the ones being talked about.
// Narrow screens (< 640 px) switch to a simplified layout with shorter labels.
function pA(){
  const narrow=($('pA').clientWidth||1000)<640;
  const W=narrow?520:1040,colW=narrow?400:420,gap=100,left=14,top=30,rowH=narrow?9.5:10.5;
  const ord={Human:0,'Large carnivore':1,Other:2,Unknown:3,'Survived/censored':4};
  let out='',totH=0,maxRows=0;
  ['Bobcat','Coyote'].forEach((sp,ci)=>{
    const rows=D.inds.filter(r=>r.sp===sp).sort((a,b)=>ord[a.fate]-ord[b.fate]||b.yrs-a.yrs);
    maxRows=Math.max(maxRows,rows.length);
    const x0=left+(narrow?0:ci*(colW+gap)),yo=narrow?ci*(rows.length*rowH+78):0,sx=v=>x0+v/4*colW;
    out+=`<g transform="translate(0 ${yo})">`+spHead(sp,x0,12,`<text x="${x0+96}" y="12">${rows.length} animals</text>`);
    [0,1,2,3,4].forEach(t=>{out+=`<line class="gl" x1="${sx(t)}" x2="${sx(t)}" y1="${top-4}" y2="${top+rows.length*rowH}"/><text x="${sx(t)}" y="${top+rows.length*rowH+14}" text-anchor="middle" class="mono">${t}</text>`});
    out+=`<text x="${x0+colW/2}" y="${top+rows.length*rowH+30}" text-anchor="middle">Years tracked</text>`;
    rows.forEach((r,i)=>{const y=top+i*rowH+rowH/2,c=`var(--f-${FK[r.fate]})`,ex=sx(Math.min(r.yrs,4)),sel=S.sel===r.id,o=opac(r)*(S.hlA&&!S.hlA.includes(r.fate)?.15:1);
      out+=`<g data-id="${r.id}" class="hit" style="opacity:${o}"><rect x="${x0}" y="${y-rowH/2}" width="${colW}" height="${rowH}" fill="transparent"/>
        <line x1="${x0}" x2="${ex}" y1="${y}" y2="${y}" stroke="${c}" stroke-width="${sel?3:1.6}"/>
        ${r.fate==='Survived/censored'?`<line x1="${ex}" x2="${ex}" y1="${y-3.5}" y2="${y+3.5}" stroke="var(--ink2)" stroke-width="1.4"/>`:shape(r.fate,ex,y,sel?4.2:2.9,sel)}
        ${sel?`<text x="${ex+10}" y="${y+3.5}" style="fill:var(--ink);font-weight:600">${r.id}</text>`:''}</g>`});
    const nh=rows.filter(r=>r.fate==='Human').length,bx=x0+colW+8;
    out+=`<g style="opacity:${S.spot?1:1}"><line x1="${bx}" x2="${bx}" y1="${top}" y2="${top+nh*rowH-2}" stroke="var(--f-human)" stroke-width="2"/><text x="${bx+7}" y="${top+nh*rowH/2+4}" style="fill:var(--f-human);font-weight:600;font-size:12px">${nh} killed</text><text x="${bx+7}" y="${top+nh*rowH/2+17}" style="fill:var(--f-human);font-weight:600;font-size:12px">by people</text></g>`;
    out+='</g>';
    totH=narrow?yo+top+rows.length*rowH+40:top+maxRows*rowH+40;
  });
  $('pA').innerHTML=svg(W,totH,out,'Lifeline per animal, with an end mark for how its track ended');
  wire($('pA'),true);
  $('legA').innerHTML=FATES.map(f=>`<span>${f[0]==='Survived/censored'?'<svg width="9" height="12" viewBox="0 0 9 12" style="width:9px"><line x1="4.5" x2="4.5" y1="1" y2="11" stroke="var(--ink2)" stroke-width="1.4"/></svg>':legShape(f[0])}${f[2]}</span>`).join('');
}
/* ===== B exposure by outcome ===== */
// Chart B: road exposure by outcome. One dot per animal, grouped into 'by people', 'other death' and 'survived', for each species.
// The horizontal jitter inside a group is seeded from the animal's ID so dots do not move between redraws.
// Group medians are the black dashes; the vertical lines are bootstrap 95% intervals on the median (bootCI).
// The headline '+18 points' / '+7 points' text and its intervals for the main measure are precomputed from the difference in group medians with a bootstrap in the R/Python analysis;
// for the quick-check measures the difference is recomputed live and shown without an interval.
// S.stB reveals layers one at a time for the scrolling story: 1 neutral dots, 2 outcome shapes, 3 emphasise coyotes killed by people, 4 medians, 5 intervals, 6 everything.
// Dragging on the plot area sets S.brush, which filters every other chart.
function pB(){
  const W=500,H=366,L=44,R=28,T0=54,B=44,pw=(W-L-R)/2-10;
  const groups=[['By people',r=>r.fate==='Human'],['Other death',r=>!['Human','Survived/censored'].includes(r.fate)],['Survived',r=>r.fate==='Survived/censored']];
  const LV=S.stB;let out='';const sy=v=>T0+(1-v/100)*(H-T0-B);
  [0,25,50,75,100].forEach(v=>out+=`<line class="gl" x1="${L}" x2="${W-R}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${L-6}" y="${sy(v)+4}" text-anchor="end" class="mono">${v}</text>`);
  out+=`<text transform="translate(11 ${(T0+H-B)/2}) rotate(-90)" text-anchor="middle">${expoLab()}</text>`;
  const dyn=[];
  ['Bobcat','Coyote'].forEach((sp,pi)=>{
    const x0=L+pi*(pw+20)+10,gw=pw/3,pfocal=(sp==='Coyote');
    const pOp=(LV>=3&&LV<6&&!pfocal)?.2:1;
    out+=`<g style="opacity:${spOp(sp)*spot(pfocal)*pOp}">`+spHead(sp,x0,14);
    const med={};
    if(LV>=(pfocal?4:6)){const hv=D.inds.filter(r=>r.sp===sp&&expo(r)!=null&&r.fate==='Human').map(expo),ov=D.inds.filter(r=>r.sp===sp&&expo(r)!=null&&r.fate!=='Human').map(expo),dm=median(hv)-median(ov),sg=dm>=0?'+':'−';
     const t1=S.measure==='ud'?(sp==='Coyote'?'+18 points when killed by people':'+7 points: no clear gap'):`${sg}${Math.abs(dm).toFixed(0)} points when killed by people`,t2=S.measure==='ud'?(sp==='Coyote'?'95% interval +3 to +26':'95% interval −11 to +28'):'live medians, no interval';
     out+=`<text x="${x0}" y="31" style="fill:var(--ink);font-size:11.5px;font-weight:700">${t1}</text><text x="${x0}" y="44" style="font-size:10px">${t2}</text>`}
    groups.forEach((g,gi)=>{
      const rows=D.inds.filter(r=>r.sp===sp&&expo(r)!=null&&g[1](r)).sort((a,b)=>expo(a)-expo(b)),cx=x0+gi*gw+gw/2;
      const vals=rows.map(expo);
      rows.forEach(r=>{const r0=rng(r.id.split('').reduce((a,c)=>a*31+c.charCodeAt(0),7));const jx=(r0()-.5)*gw*.5,sel=S.sel===r.id,px=cx-gw*.12+jx,py=sy(expo(r));
        const dim=(LV===3&&!(r.sp==='Coyote'&&r.fate==='Human'))?.18:1;
        out+=`<g data-id="${r.id}" class="hit" style="opacity:${opac(r)*dim}">${LV<2?`<circle cx="${px}" cy="${py}" r="${sel?5.4:3.6}" fill="var(--ink3)" stroke="var(--panel)"/>`:shape(r.fate,px,py,sel?5.4:3.6,sel)}${r.unrel?`<circle cx="${px}" cy="${py}" r="8" fill="none" stroke="var(--ink2)" stroke-width="1"/>`:''}</g>`});
      if(vals.length&&LV>=(pfocal?4:6)){const m=median(vals),ci=LV>=(pfocal?5:6)?bootCI(vals,17+gi+pi*9):null;med[gi]=m;
        out+=`<line x1="${cx+gw*.22}" x2="${cx+gw*.38}" y1="${sy(m)}" y2="${sy(m)}" stroke="var(--ink)" stroke-width="2.6"/>`;
        if(ci)out+=`<line x1="${cx+gw*.30}" x2="${cx+gw*.30}" y1="${sy(ci[0])}" y2="${sy(ci[1])}" stroke="var(--ink)" stroke-width="1.6"/><line x1="${cx+gw*.27}" x2="${cx+gw*.33}" y1="${sy(ci[0])}" y2="${sy(ci[0])}" stroke="var(--ink)" stroke-width="1.2"/><line x1="${cx+gw*.27}" x2="${cx+gw*.33}" y1="${sy(ci[1])}" y2="${sy(ci[1])}" stroke="var(--ink)" stroke-width="1.2"/>`;
        out+=`<text x="${cx+gw*.42}" y="${sy(m)+4}" class="mono" style="fill:var(--ink);font-size:10px">${m.toFixed(0)}</text>`}
      out+=`<text x="${cx}" y="${H-24}" text-anchor="middle" style="font-size:10px">${g[0]}</text><text x="${cx}" y="${H-11}" text-anchor="middle" class="mono" style="font-size:10px;fill:var(--ink3)">n=${vals.length}</text>`;
    });
    out+='</g>';dyn.push(`${sp}s: median ${med[0]!=null?med[0].toFixed(0):'–'}% when killed by people, ${(()=>{const o=D.inds.filter(r=>r.sp===sp&&expo(r)!=null&&r.fate!=='Human').map(expo);return o.length?median(o).toFixed(0):'–'})()}% for all others`);
  });
  out+=`<rect id="brushcatch" x="${L}" y="${T0}" width="${W-L-R}" height="${H-T0-B}" fill="transparent" style="cursor:ns-resize"/>`;
  out+=`<g id="brushov" pointer-events="none"><rect id="bo1" x="${L}" y="${S.brush?sy(S.brush[1]):0}" width="${W-L-R}" height="${S.brush?sy(S.brush[0])-sy(S.brush[1]):0}" fill="var(--accent)" opacity=".1"/><line id="bo2" x1="${L}" x2="${W-R}" y1="${S.brush?sy(S.brush[1]):0}" y2="${S.brush?sy(S.brush[1]):0}" stroke="var(--accent)" ${S.brush?'':'visibility="hidden"'}/><line id="bo3" x1="${L}" x2="${W-R}" y1="${S.brush?sy(S.brush[0]):0}" y2="${S.brush?sy(S.brush[0]):0}" stroke="var(--accent)" ${S.brush?'':'visibility="hidden"'}/></g>`;
  $('pB').innerHTML=svg(W,H,out,'Road exposure by outcome, one dot per animal, with medians and intervals');
  const root=$('pB'),sv=root.querySelector('svg');wire(root,false);
  // dots are drawn before the catch layer, so route clicks on dots through elementFromPoint
  const yval=e=>{const b=sv.getBoundingClientRect(),k=b.width/W;return Math.max(0,Math.min(100,(1-((e.clientY-b.top)/k-T0)/(H-T0-B))*100))};
  let drag=null;const catcher=root.querySelector('#brushcatch');

// Pointer-drag brush. setPointerCapture keeps the drag alive if the cursor leaves the chart,
// and `moved` separates a click (select one threshold) from a drag (set a range).

  catcher.addEventListener('pointerdown',e=>{catcher.setPointerCapture(e.pointerId);drag={y0:yval(e),cy:e.clientY,moved:false}});
  catcher.addEventListener('pointermove',e=>{
    if(drag){if(Math.abs(e.clientY-drag.cy)>4)drag.moved=true;if(drag.moved){const y1=yval(e);S.brush=[Math.min(drag.y0,y1),Math.max(drag.y0,y1)];refreshB(root,sy)}}
    else{catcher.style.pointerEvents='none';const el=document.elementFromPoint(e.clientX,e.clientY);catcher.style.pointerEvents='';const g=el&&el.closest&&el.closest('[data-id]');if(g)showTip(e,tipFor(byId[g.dataset.id]));else hideTip()}});
  catcher.addEventListener('pointerup',e=>{
    if(drag&&!drag.moved){catcher.style.pointerEvents='none';const el=document.elementFromPoint(e.clientX,e.clientY);catcher.style.pointerEvents='';const g=el&&el.closest&&el.closest('[data-id]');
      if(g){S.sel=S.sel===g.dataset.id?null:g.dataset.id}else if(S.brush)S.brush=null;render()}
    else if(drag)render();
    drag=null});
  catcher.addEventListener('mouseleave',hideTip);
  { const n=D.inds.filter(r=>opac(r)>.2).length; $('bdyn').innerHTML=S.brush?`Selected ${S.brush[0].toFixed(0)}–${S.brush[1].toFixed(0)}% · ${n} animals <button class="btn" id="bclr" style="padding:1px 8px">Clear selection</button>`:''; if(S.brush)$('bdyn').querySelector('#bclr').onclick=()=>{S.brush=null;render()} }
  $('legB').innerHTML=FATES.map(f=>`<span>${f[0]==='Survived/censored'?legShape(f[0]):legShape(f[0])}${f[2]}</span>`).join('')+`<span><svg width="16" height="16" viewBox="-8 -8 16 16" style="width:16px"><circle r="7.5" fill="none" stroke="var(--ink2)"/></svg>range estimated from little data</span>`;
}
// Updates only the brush overlay and dot opacity while dragging, so the chart is not rebuilt mid-drag (rebuilding would cancel the drag).
function refreshB(root,sy){
  const b=S.brush;if(!b)return;
  root.querySelector('#bo1').setAttribute('y',sy(b[1]));root.querySelector('#bo1').setAttribute('height',sy(b[0])-sy(b[1]));
  [['#bo2',1],['#bo3',0]].forEach(([id,k])=>{const l=root.querySelector(id);l.setAttribute('y1',sy(b[k]));l.setAttribute('y2',sy(b[k]));l.removeAttribute('visibility')});
  root.querySelectorAll('[data-id]').forEach(n=>n.style.opacity=opac(byId[n.dataset.id]));
  chips();pA();pD();if(M.view==='all')drawMap();
  { const n=D.inds.filter(r=>opac(r)>.2).length; $('bdyn').innerHTML=`Selected ${b[0].toFixed(0)}–${b[1].toFixed(0)}% · ${n} animals`; }
}
/* ===== E rates ===== */
// Chart E: death rates by cause (deaths per animal-year) with 95% intervals. Rates and intervals come from the precomputed D.rates table (exact Poisson intervals, deaths divided by animal-years at risk).
function pE(){
  const W=500,H=320,L=44,R=14,T0=40,B=50,ymax=.9,y=v=>T0+(1-v/ymax)*(H-T0-B);let out='';
  [0,.3,.6,.9].forEach(v=>out+=`<line class="gl" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end" class="mono">${v.toFixed(1)}</text>`);
  out+=`<text transform="translate(11 ${(T0+H-B)/2}) rotate(-90)" text-anchor="middle">Deaths per animal-year</text>`;
  [['Bobcat',0],['Coyote',1]].forEach(([sp,i])=>{const cx=L+70+i*210;out+=`<g style="opacity:${spOp(sp)}">`;
    [['human','Human','Human-caused','Human',-36],['carn','Large carnivore','Carnivore-caused','Large carnivore',36]].forEach(([k,fate,lab,fkey,off])=>{const r=D.rates[sp+'_'+k],x=cx+off,c=`var(--f-${k})`;
      out+=`<g style="opacity:${k==='human'?1:(S.spot?.65:1)}"><line x1="${x}" x2="${x}" y1="${y(r.lo)}" y2="${y(r.hi)}" stroke="${c}" stroke-width="2.4"/><line x1="${x-5}" x2="${x+5}" y1="${y(r.lo)}" y2="${y(r.lo)}" stroke="${c}" stroke-width="2"/><line x1="${x-5}" x2="${x+5}" y1="${y(r.hi)}" y2="${y(r.hi)}" stroke="${c}" stroke-width="2"/>${shape(fkey,x,y(r.r),6,false)}
      <text x="${x+12}" y="${y(r.r)-2}" class="mono" style="fill:var(--ink);font-size:11px">${r.r.toFixed(2)}</text><text x="${x+12}" y="${y(r.r)+11}" style="font-size:10px">${r.n} deaths</text>
      <text x="${x}" y="${H-B+14}" text-anchor="middle" style="font-size:10px">${lab==='Human-caused'?'People':'Carnivores'}</text></g>`});
    {const h=D.rates[sp+'_human'],c=D.rates[sp+'_carn'];out+=`<text x="${cx}" y="13" text-anchor="middle" style="fill:var(--ink);font-size:12px;font-weight:650">People ≈ ${(h.r/c.r).toFixed(1)}× carnivores</text><text x="${cx}" y="25" text-anchor="middle" style="font-size:10px">${h.lo<=c.hi?'intervals overlap':'intervals do not overlap'}</text>`}
    out+=ICO(sp,cx-40,H-26)+`<text x="${cx+12}" y="${H-14}" text-anchor="middle" style="font-weight:650;fill:var(--ink)">${sp}s</text><text x="${cx+64}" y="${H-14}" class="mono" style="font-size:10px">${D.rates[sp+'_human'].T} animal-yr</text></g>`});
  $('pE').innerHTML=svg(W,H,out,'Death rates by cause, with 95% intervals');
}
/* ===== F season ===== */
// Chart F: human-caused deaths by calendar month, with the regulated hunting/trapping season shaded
function pF(){
  const W=500,H=320,L=34,R=8,T0=30,B=22;let out='';const M='JFMAMJJASOND';
  [['Bobcat',0],['Coyote',1]].forEach(([sp,k])=>{
    const top=T0+k*(H-T0-B)/2+k*14,h=(H-T0-B)/2-34,ymax=7,y=v=>top+h-v/ymax*h,bw=(W-L-R)/12;
    out+=`<g style="opacity:${spOp(sp)*spot(sp==='Bobcat')}">`+spHead(sp,L,top-12);
    [[0,2.5],[8,12]].forEach(([a,b])=>out+=`<rect x="${L+a*bw}" y="${top}" width="${(b-a)*bw}" height="${h}" fill="var(--accent-soft)" opacity=".85"/>`);
    out+=`<text x="${W-R}" y="${top-4}" text-anchor="end" style="font-size:10px;fill:var(--accent)">shaded = regulated season</text>`;
    [0,3,6].forEach(v=>out+=`<line class="gl" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-5}" y="${y(v)+4}" text-anchor="end" class="mono">${v}</text>`);
    {const mo=D.monthly[sp],tot=sum(mo),win=[10,11,0,1].reduce((s,i)=>s+mo[i],0),mx=Math.max(...mo);
     const msg=sp==='Bobcat'?(win===tot?`All ${tot} deaths: Nov to Feb`:`${win} of ${tot} deaths: Nov to Feb`):`Spread across the year`;
     out+=`<text x="${L+6*bw}" y="${top+h*.42}" text-anchor="middle" style="fill:var(--ink);font-size:12px;font-weight:650">${msg}</text>`}
    D.monthly[sp].forEach((v,m)=>{const cx=L+m*bw+bw/2;out+=`${v?`<rect x="${L+m*bw+bw*.15}" y="${y(v)}" width="${bw*.7}" height="${top+h-y(v)}" fill="var(--f-human)" rx="2"/><text x="${cx}" y="${y(v)-4}" text-anchor="middle" class="mono" style="fill:var(--ink)">${v}</text>`:''}<text x="${cx}" y="${top+h+13}" text-anchor="middle" style="font-size:10px">${M[m]}</text>`});
    out+='</g>';
  });
  $('pF').innerHTML=svg(W,H,out,'Human-caused deaths by calendar month, bobcats and coyotes');
}
/* ===== M months ===== */
// Chart M: seasonal pattern of proximity to roads, pooled over animals, from one GPS position per animal per day (table DM).
// Two views: the share of positions within 250 m, or the typical distance to the nearest road (shaded bands = middle 50% and middle 80% of positions).
function pM(){
  $('moTabs').innerHTML=[['p250','Share of positions within 250 m'],['dist','Typical distance to nearest road']].map(([k,l])=>`<button class="tab" role="tab" aria-selected="${S.mo===k}" data-k="${k}">${l}</button>`).join('');
  $('moTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.mo=b.dataset.k;pM()});
  ['Bobcat','Coyote'].forEach((sp,k)=>{
    const W=480,H=300,L=46,R=10,T0=30,B=30,bw=(W-L-R)/12,key=SPLAT[sp],P=DM[key],c=SPC[sp];
    const ymax=S.mo==='p250'?100:1500,y=v=>T0+(1-Math.min(v,ymax)/ymax)*(H-T0-B),xm=m=>L+(m+.5)*bw;
    let out=`<g style="opacity:${spOp(sp)}">`+spHead(sp,L,14);
    [[0,2.5],[8,12]].forEach(([a,b])=>out+=`<rect x="${L+a*bw}" y="${T0}" width="${(b-a)*bw}" height="${H-T0-B}" fill="var(--accent-soft)" opacity=".7"/>`);
    (S.mo==='p250'?[0,25,50,75,100]:[0,500,1000,1500]).forEach(v=>out+=`<line class="gl" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end" class="mono">${v}${S.mo==='dist'&&v===1500?'+':''}</text>`);
    out+=`<text transform="translate(11 ${(T0+H-B)/2}) rotate(-90)" text-anchor="middle">${S.mo==='p250'?'% of positions within 250 m':'Metres to nearest road'}</text>`;
    MON.forEach((m,i)=>out+=`<text x="${xm(i)}" y="${H-B+14}" text-anchor="middle" style="font-size:10px">${m[0]}</text>`);
    if(S.mo==='p250'){const v=DM[key+'_p250'];out+=`<polyline points="${v.map((q,i)=>`${xm(i)},${y(q)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.6"/>`+v.map((q,i)=>`<circle cx="${xm(i)}" cy="${y(q)}" r="3.4" fill="${c}" stroke="var(--panel)" stroke-width="1"><title>${MON[i]}: ${q}%</title></circle>`).join('')}
    else{const band=(a,b,op)=>`<polygon points="${P.map((q,i)=>`${xm(i)},${y(q[b])}`).concat(P.map((q,i)=>[xm(i),y(q[a])]).reverse().map(p=>p.join(','))).join(' ')}" fill="${c}" opacity="${op}"/>`;
      out+=band(0,4,.16)+band(1,3,.34)+`<polyline points="${P.map((q,i)=>`${xm(i)},${y(q[2])}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.6"/>`}
    {const arr=S.mo==='p250'?DM[key+'_p250']:P.map(q=>q[2]),hi=arr.indexOf(Math.max(...arr)),lo=arr.indexOf(Math.min(...arr)),f=v=>S.mo==='p250'?v.toFixed(0)+'%':v+' m';
     const lab=S.mo==='p250'?['Highest','Lowest']:['Farthest','Closest'];
     [[hi,lab[0],-1],[lo,lab[1],1]].forEach(([i,t,d])=>{const yy=y(arr[i]);out+=`<circle cx="${xm(i)}" cy="${yy}" r="5" fill="none" stroke="var(--ink)" stroke-width="1.4"/><text x="${xm(i)}" y="${yy+(d<0?-10:19)}" text-anchor="middle" style="fill:var(--ink);font-size:11px;font-weight:650">${t}: ${MON[i]} ${f(arr[i])}</text>`})}
    out+='</g>';
    $('pM'+(k+1)).innerHTML=svg(W,H,out,`${sp}: closeness to roads by month`);
  });
}
/* ===== C overlap ===== */
// Pairs of animals with a defined territory overlap (pairs tracked together for at least 90 days).
const PAIRS=D.pairs.filter(p=>p[2]!=null);
// Species-label permutation test, run in the browser. Statistic = mean overlap of bobcat-coyote pairs minus mean overlap of same-species pairs.
// Null distribution: shuffle the species labels 2,000 times, shuffling within each site so site differences are not mistaken for species differences.
// Reports the observed difference, the 2.5-97.5% range of the shuffles and a two-sided p-value (with the +1 correction).
// Test statistic: mean Bhattacharyya overlap of pairs whose members have DIFFERENT fates (c),
// minus the mean for pairs with the SAME fate (s). p[2] is the overlap of pair p. A negative value
// means animals that died differently overlap less than animals that died alike.
const PERM=(()=>{const sp={},site={};D.inds.forEach(r=>{sp[r.id]=r.sp;site[r.id]=r.site});
  const diff=m=>{let c=0,nc=0,s=0,ns=0;PAIRS.forEach(p=>{if(m[p[0]]!==m[p[1]]){c+=p[2];nc++}else{s+=p[2];ns++}});return c/nc-s/ns};
  const obs=diff(sp),ids=Object.keys(sp),R=rng(3),null_=[];
  for(let k=0;k<2000;k++){const m={...sp};['Okanogan','Northeast'].forEach(st=>{const g=ids.filter(i=>site[i]===st),v=g.map(i=>sp[i]);for(let i=v.length-1;i>0;i--){const j=(R()*(i+1))|0;[v[i],v[j]]=[v[j],v[i]]}g.forEach((i,q)=>m[i]=v[q])});null_.push(diff(m))}
  const s=[...null_].sort((a,b)=>a-b);return{obs,lo:pct(s,2.5),hi:pct(s,97.5),p:(null_.filter(v=>Math.abs(v)>=Math.abs(obs)).length+1)/(null_.length+1)}})();
// Chart C: pairwise territory overlap heatmap for one site. Each cell is the Bhattacharyya-style overlap (0 = no shared ground, 1 = identical)
// between two animals' territory probability surfaces, precomputed in Python (home_range_overlap.py).
function pC(){
  $('tabs').innerHTML=['Okanogan','Northeast'].map(s=>`<button class="tab" role="tab" aria-selected="${S.site===s}" data-s="${s}">${s==='Okanogan'?'Okanogan (Methow Valley)':'Northeast'}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{S.site=b.dataset.s;render()});
  const ids=D.inds.filter(r=>r.site===S.site).sort((a,b)=>a.sp.localeCompare(b.sp)||a.id.localeCompare(b.id));
  const n=ids.length,cs=Math.min(13,Math.floor(430/n)),L=64,T0=44,W=L+n*cs+8,H=T0+n*cs+8;
  const pm={};PAIRS.forEach(p=>{pm[p[0]+'|'+p[1]]=p[2];pm[p[1]+'|'+p[0]]=p[2]});

// Heatmap fill: v (0 to 1) mixes the light and dark heat colours in the browser (CSS color-mix).
// The 8% floor keeps the lowest non-zero cells visible against the page background.
  const col=v=>`color-mix(in srgb, var(--heat1) ${Math.round(8+v*92)}%, var(--heat0))`;
  let out='';const nb=ids.filter(r=>r.sp==='Bobcat').length;
  out+=ICO("Bobcat",L,0)+`<text x="${L+28}" y="12" style="font-weight:600;fill:var(--ink)">Bobcats</text>`+ICO("Coyote",L+nb*cs+4,0)+`<text x="${L+nb*cs+32}" y="12" style="font-weight:600;fill:var(--ink)">Coyotes</text>`;
  ids.forEach((a,i)=>{
    ids.forEach((b,j)=>{
      const x=L+j*cs,y=T0+i*cs;let v=pm[a.id+'|'+b.id],fill;
      if(i===j)fill='var(--line)';else if(v==null)fill='var(--noconc)';else fill=col(v);
      const hl=S.sel&&(S.sel===a.id||S.sel===b.id),cross=a.sp!==b.sp;
      out+=`<rect x="${x+.5}" y="${y+.5}" width="${cs-1}" height="${cs-1}" fill="${fill}" data-a="${a.id}" data-b="${b.id}" data-v="${v==null?'':v}" style="opacity:${(S.sel?(hl?1:.35):1)*(S.sp&&a.sp!==S.sp&&b.sp!==S.sp?.15:1)}" rx="1.5"/>`});
    out+=`<text x="${L-4}" y="${T0+i*cs+cs*.72}" text-anchor="end" class="mono" style="font-size:${cs>11?9:7.5}px;${S.sel===a.id?'fill:var(--ink);font-weight:700':a.unrel?'fill:var(--ink3);text-decoration:line-through':''}">${a.id}</text>`;
  });
  out+=`<line class="axis" x1="${L+nb*cs}" x2="${L+nb*cs}" y1="${T0-6}" y2="${T0+n*cs}"/><line class="axis" x1="${L-4}" x2="${L+n*cs}" y1="${T0+nb*cs}" y2="${T0+nb*cs}"/>`;
  $('pC').innerHTML=svg(W,H,out,'Pairwise home-range overlap matrix')+`<div class="legend"><span><svg width="90" height="10" style="display:inline;width:90px"><defs><linearGradient id="gr"><stop offset="0" stop-color="var(--heat0)"/><stop offset="1" stop-color="var(--heat1)"/></linearGradient></defs><rect width="90" height="10" fill="url(#gr)"/></svg>none → identical</span><span><svg width="10" height="10" style="width:10px"><rect width="10" height="10" fill="var(--noconc)"/></svg>not collared together 90 days</span><span class="mono" style="font-size:11px">struck-through ID = range from little data</span></div>`;
  $('pC').querySelectorAll('rect[data-a]').forEach(r=>{
    r.addEventListener('mousemove',e=>{const a=byId[r.dataset.a],b=byId[r.dataset.b];if(a===b){showTip(e,`<b>${a.id}</b>`);return}const v=r.dataset.v;showTip(e,`<b>${a.id}</b> and <b>${b.id}</b> (${a.sp===b.sp?'same species':'bobcat and coyote'}).<br>${v===''?'Not collared together for 90 days, or one range is poorly estimated.':'Overlap '+(+v).toFixed(2)+' on a 0 to 1 scale.'}`)});
    r.addEventListener('mouseleave',hideTip);
    r.addEventListener('click',()=>{const id=r.dataset.a;S.sel=S.sel===id?null:id;render()});
  });
  pC2();
}
// Chart C2: every pair's overlap as a strip plot for same-species and bobcat x coyote pairs, then the observed difference against the permutation range from PERM.
function pC2(){
  const W=460,H=330,L=120,R=14,xmax=Math.max(...PAIRS.map(p=>p[2]),.5),x=v=>L+v/xmax*(W-L-R);
  const gps=[['Same species',p=>byId[p[0]].sp===byId[p[1]].sp],['Bobcat × coyote',p=>byId[p[0]].sp!==byId[p[1]].sp]];
  let out=`<text x="${L}" y="14" style="font-weight:650;fill:var(--ink)">Overlap of each pair (0 to 1)</text>`;
  [0,.2,.4,.6].filter(v=>v<=xmax+.05).forEach(v=>out+=`<line class="gl" x1="${x(v)}" x2="${x(v)}" y1="26" y2="170"/><text x="${x(v)}" y="184" text-anchor="middle" class="mono">${v}</text>`);
  gps.forEach(([lab,f],gi)=>{const cy=62+gi*68,ps=PAIRS.filter(f);
    out+=`<text x="${L-10}" y="${cy+4}" text-anchor="end" style="fill:var(--ink)">${lab}</text><text x="${L-10}" y="${cy+17}" text-anchor="end" class="mono" style="font-size:10px">${ps.length} pairs</text>`;
    ps.forEach((p,i)=>{const r0=rng(i*7919+gi*131+3);const rel=(!S.sel||p[0]===S.sel||p[1]===S.sel);
      out+=`<circle cx="${x(p[2])}" cy="${cy+(r0()-.5)*38}" r="${S.sel&&rel?3.4:2.1}" fill="${gi?'var(--accent)':'var(--ink3)'}" opacity="${S.sel?(rel?.95:.1):.32}"/>`});
    const m=sum(ps.map(p=>p[2]))/ps.length;out+=`<line x1="${x(m)}" x2="${x(m)}" y1="${cy-22}" y2="${cy+22}" stroke="var(--ink)" stroke-width="3"/><text x="${x(m)+6}" y="${cy-24}" class="mono" style="fill:var(--ink);font-size:10.5px">mean ${m.toFixed(3)}</text>`});
  // difference vs shuffle band
  const dx=v=>L+(v+.06)/.12*(W-L-R),y0=262;
  out+=`<text x="${L}" y="212" style="font-weight:650;fill:var(--ink)">Difference between groups, against chance</text>`;
  out+=`<rect x="${dx(PERM.lo)}" y="${y0-16}" width="${dx(PERM.hi)-dx(PERM.lo)}" height="32" fill="var(--grid)" stroke="var(--line)"/><text x="${(dx(PERM.lo)+dx(PERM.hi))/2}" y="${y0-22}" text-anchor="middle" style="font-size:10px">range from random shuffles</text>`;
  [-.05,0,.05].forEach(v=>out+=`<line x1="${dx(v)}" x2="${dx(v)}" y1="${y0+16}" y2="${y0+20}" stroke="var(--ink3)"/><text x="${dx(v)}" y="${y0+32}" text-anchor="middle" class="mono">${v>0?'+':''}${v}</text>`);
  out+=`<line x1="${dx(0)}" x2="${dx(0)}" y1="${y0-16}" y2="${y0+16}" stroke="var(--ink3)" stroke-dasharray="2 2"/><circle cx="${dx(PERM.obs)}" cy="${y0}" r="6" fill="var(--accent)" stroke="var(--panel)" stroke-width="2"/><text x="${L}" y="${y0+50}" class="mono" style="fill:var(--ink)">observed ${PERM.obs>=0?'+':''}${PERM.obs.toFixed(3)} · shuffle test p ≈ ${PERM.p.toFixed(2)}</text>`;
  $('pC2').innerHTML=svg(W,H+10,out,'Overlap of each pair by group and the difference against random shuffles');
}
