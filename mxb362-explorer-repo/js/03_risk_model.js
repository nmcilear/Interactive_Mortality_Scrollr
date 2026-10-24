/* ===== D live Poisson model ===== */
// Poisson regression with a log link and an offset, fitted by iteratively reweighted least squares (IRLS):
// log(expected deaths) = b0 + b1*exposure + log(years tracked). The offset makes longer-tracked animals expected to die more often, so b0 + b1*exposure is the log yearly death rate.
// E = exposure, Tt = years tracked, y = 1 if killed by people else 0. Returns [b0, b1], or null if it fails to converge or the slope is implausibly large.
function pois(E,Tt,y){let b0=Math.log(Math.max(sum(y),.5)/sum(Tt)),b1=0;
  for(let it=0;it<60;it++){let a=0,bb=0,c=0,g0=0,g1=0;
    for(let i=0;i<E.length;i++){const eta=b0+b1*E[i],mu=Math.exp(eta)*Tt[i],z=eta+(y[i]-mu)/mu;a+=mu;bb+=mu*E[i];c+=mu*E[i]*E[i];g0+=mu*z;g1+=mu*E[i]*z}
    const det=a*c-bb*bb;if(!isFinite(det)||Math.abs(det)<1e-12)return null;
    const n0=(c*g0-bb*g1)/det,n1=(-bb*g0+a*g1)/det,d=Math.abs(n0-b0)+Math.abs(n1-b1);b0=n0;b1=n1;if(d<1e-9)break}
  return isFinite(b0)&&isFinite(b1)&&Math.abs(b1)<1.5?[b0,b1]:null}
// Cache of fitted models, keyed by species, measure, threshold and dropped animal, so sliders and hover do not refit.
const MCACHE={};
// Exposure values (0-100%) at which the fitted curve and band are evaluated.
const GRID=Array.from({length:101},(_,i)=>i);
// Fits the risk model for one species and a 1,000-draw animal-level bootstrap: resample animals with replacement, refit, and keep each curve.
// The shaded band at each exposure is the 5th-95th percentile of those curves (a 90% band). Draws with no deaths are skipped.
// rr = rate ratio per +10 percentage points of exposure (exp(10*b1)) with its bootstrap interval. If the selected animal's species matches and S.drop is set, that animal is left out (influence check).
// Also reproduced stand-alone in risk_curve_model.py.
function model(sp){
  const dropId=S.drop&&S.sel&&byId[S.sel]&&byId[S.sel].sp===sp?S.sel:null;
  const key=[sp,S.measure,S.thr,dropId].join('|');if(MCACHE[key])return MCACHE[key];
  const rows=D.inds.filter(r=>r.sp===sp&&expo(r)!=null&&r.id!==dropId);
  const E=rows.map(expo),Tt=rows.map(r=>r.yrs),y=rows.map(r=>r.fate==='Human'?1:0);
  const b=pois(E,Tt,y);if(!b)return{ok:false,rows,events:sum(y)};
  const xmin=Math.min(...E),xmax=Math.max(...E),fit=GRID.map(g=>Math.exp(b[0]+b[1]*g));
  const R=rng(1000+(sp==='Bobcat'?1:2)*17+Math.round(S.thr)),draws=[],rrs=[];
  for(let k=0;k<1000;k++){const ix=rows.map(()=>(R()*rows.length)|0),yy=ix.map(i=>y[i]);if(sum(yy)===0)continue;const bb=pois(ix.map(i=>E[i]),ix.map(i=>Tt[i]),yy);if(bb){draws.push(GRID.map(g=>Math.exp(bb[0]+bb[1]*g)));rrs.push(Math.exp(bb[1]*10))}}
  const lo=[],hi=[];GRID.forEach((g,i)=>{const col=draws.map(d=>d[i]).sort((a,c)=>a-c);lo.push(pct(col,5));hi.push(pct(col,95))});
  rrs.sort((a,c)=>a-c);
  return MCACHE[key]={ok:true,b,xmin,xmax,fit,lo,hi,draws,n:rows.length,events:sum(y),rr:Math.exp(b[1]*10),rrlo:pct(rrs,5),rrhi:pct(rrs,95),dropId};
}
// Index of the bootstrap draw shown in 'hypothetical outcome plot' mode (the animated spaghetti of refits).
let HOP=0;
// Chart D: risk curve. Ticks along the bottom = animals by exposure; diamonds = animals killed by people. Line = fitted yearly chance of being killed by people.
// Shaded band = bootstrap 90% band; in 'hop' mode each frame instead shows one refit, so the spread is seen as motion.
// The curve is only drawn over the range of exposure actually observed (grey zones are extrapolation). S.stD reveals layers for the scrolling story: 1 ticks, 2 line, 3 band/refits, 5 full.
function pD(){
  const LV=S.stD,e=+$('exp').value;S.exp=e;const ro=[],rr=[];
  ['Bobcat','Coyote'].forEach((sp,k)=>{
    const m=model(sp),W=480,H=320,L=44,R=12,T0=30,B=46,x=v=>L+v/100*(W-L-R);
    let out=`<g style="opacity:${spOp(sp)*spot(sp==='Coyote')}">`+spHead(sp,L,14,`<text x="${L+96}" y="14">${m.events} human-caused deaths in ${m.n||m.rows.length} animals</text>`);
    if(!m.ok){$('pD'+(k+1)).innerHTML=svg(W,H,out+`<text x="${L}" y="60">The model could not be fitted for this selection.</text></g>`,`${sp} model`);return}
    const ymax=Math.min(3,Math.max(.6,Math.ceil(Math.max(...m.hi.filter((_,i)=>i>=Math.floor(m.xmin)&&i<=Math.ceil(m.xmax)))/.3)*.3)),y=v=>T0+(1-Math.min(v,ymax)/ymax)*(H-T0-B);
    const ticks=[0,1,2,3].map(i=>+(ymax*i/3).toFixed(2));
    ticks.forEach(v=>out+=`<line class="gl" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end" class="mono">${v.toFixed(1)}</text>`);
    [0,20,40,60,80,100].forEach(v=>out+=`<text x="${x(v)}" y="${H-B+14}" text-anchor="middle" class="mono">${v}</text>`);
    out+=`<text x="${(L+W-R)/2}" y="${H-B+31}" text-anchor="middle">${expoLab()}</text><text transform="translate(11 ${(T0+H-B)/2}) rotate(-90)" text-anchor="middle">Deaths by people per animal-year</text>`;
    out+=`<rect x="${L}" y="${T0}" width="${Math.max(0,x(m.xmin)-L)}" height="${H-T0-B}" fill="var(--grid)" opacity=".8"/><rect x="${x(m.xmax)}" y="${T0}" width="${Math.max(0,W-R-x(m.xmax))}" height="${H-T0-B}" fill="var(--grid)" opacity=".8"/><text x="${(x(m.xmin)+x(m.xmax))/2}" y="${T0+11}" text-anchor="middle" style="font-size:10px">observed range</text>`;
    const i0=Math.max(0,Math.floor(m.xmin)),i1=Math.min(100,Math.ceil(m.xmax)),idx=[];for(let i=i0;i<=i1;i++)idx.push(i);
    const line=a=>idx.map(i=>`${x(i)},${y(a[i])}`).join(' ');
    if(LV>=3&&S.unc==='band'){out+=`<polygon points="${idx.map(i=>`${x(i)},${y(m.hi[i])}`).concat(idx.slice().reverse().map(i=>`${x(i)},${y(m.lo[i])}`)).join(' ')}" fill="var(--accent)" opacity=".2"/>`}
    else if(LV>=3){const n=m.draws.length,cur=HOP%n,tail=RM?40:14;
      if(RM){for(let j=0;j<tail;j++){const d=m.draws[(j*37)%n];out+=`<polyline points="${line(d)}" fill="none" stroke="var(--accent)" stroke-width="1" opacity=".16"/>`}}
      else for(let j=tail;j>=0;j--){const d=m.draws[((cur-j)%n+n)%n];out+=`<polyline points="${line(d)}" fill="none" stroke="var(--accent)" stroke-width="${j?1:2}" opacity="${j?(.28*(1-j/(tail+1))).toFixed(3):.85}"/>`}}
    if(LV>=2)out+=`<polyline points="${line(m.fit)}" fill="none" stroke="var(--ink)" stroke-width="2.4"/>`;
    if(LV>=5)out+=`<text x="${L+8}" y="${T0+26}" style="fill:var(--ink);font-size:11.5px;font-weight:650">${m.rrlo<=1&&m.rrhi>=1?'A flat line (no effect) fits inside the band':'A flat line (no effect) lies outside the band'}</text>`;
    D.inds.filter(r=>r.sp===sp&&expo(r)!=null).forEach(r=>{const hu=r.fate==='Human',sel=S.sel===r.id,px=x(expo(r));
      out+=`<g data-id="${r.id}" class="hit" style="opacity:${opac(r)}">${hu?shape('Human',px,H-B-9,3.6,sel):`<line x1="${px}" x2="${px}" y1="${H-B-9}" y2="${H-B}" stroke="var(--ink3)" stroke-width="${sel?3:1.5}"/>`}<rect x="${px-4}" y="${H-B-18}" width="8" height="18" fill="transparent"/></g>`});
    if(LV<5){ro.push('')}else if(e>=m.xmin&&e<=m.xmax){const f=m.fit[e];out+=`<line x1="${x(e)}" x2="${x(e)}" y1="${T0}" y2="${H-B}" stroke="var(--ink)" stroke-dasharray="3 3"/><circle cx="${x(e)}" cy="${y(f)}" r="5" fill="var(--ink)" stroke="var(--panel)" stroke-width="2"/>`;ro.push(`${sp} ${f.toFixed(2)}/yr (90% band ${m.lo[e].toFixed(2)}–${m.hi[e].toFixed(2)})`)}
    else{out+=`<line x1="${x(e)}" x2="${x(e)}" y1="${T0}" y2="${H-B}" stroke="var(--warn)" stroke-dasharray="3 3"/><text x="${Math.min(x(e)+6,W-120)}" y="${T0+26}" style="fill:var(--warn)">outside observed range</text>`;ro.push(`${sp}: no animals at ${e}`)}
    out+='</g>';
    $('pD'+(k+1)).innerHTML=svg(W,H,out,`${sp}: death rate against road exposure`);wire($('pD'+(k+1)),false);
    rr.push(`${sp}: rate ratio ${m.rr.toFixed(2)} per +10 points`+(S.measure==='ud'&&!m.dropId?` (95% interval ${D.curves[sp].rr_lo.toFixed(2)}–${D.curves[sp].rr_hi.toFixed(2)} in the analysis script)`:` (90% bootstrap ${m.rrlo.toFixed(2)}–${m.rrhi.toFixed(2)})`)+(m.dropId?`, without ${m.dropId}`:''));
  });
  $('expro').textContent=`${e} → ${ro.join(' · ')}`;
  $('rrro').textContent='Live refit in this page. '+rr.join('  ·  ');
}
/* measure control (used in B and D) */
// Dropdown to switch the exposure definition (used by charts B and D); changing it clears any brush and redraws everything.
function measureCtl(id){
  $(id).innerHTML=`<label class="lab" for="${id}s">Exposure measure</label><select id="${id}s"><option value="ud">Territory-based, 250 m (main analysis)</option>${THR.map(t=>`<option value="fix${t}">GPS positions within ${t} m (quick check)</option>`).join('')}</select>`;
  const s=$(id).querySelector('select');s.value=S.measure==='ud'?'ud':'fix'+S.thr;
  s.onchange=()=>{if(s.value==='ud')S.measure='ud';else{S.measure='fix';S.thr=+s.value.slice(3)}S.brush=null;render()};
}
