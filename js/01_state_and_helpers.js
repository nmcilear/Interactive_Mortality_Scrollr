/* ===== constants and state ===== */
// Species colours: Okabe-Ito amber (bobcat) and blue (coyote), chosen to be colour-blind safe.
// SPLAT maps a species to the Latin name used as the key in the monthly-distance table DM.
const SPC={Bobcat:'#E69F00',Coyote:'#0072B2'};
const SPLAT={Bobcat:'Lynx rufus',Coyote:'Canis latrans'};
// Outcome categories. Each entry is [value in the data, short key used for CSS variables / FK lookup, plain-language label].
// Order matters: it is the order of the legend, the filter chips and the lifeline sort.
const FATES=[['Human','human','Killed by people'],['Large carnivore','carn','Killed by a large carnivore'],['Other','other','Other cause'],['Unknown','unk','Unknown cause'],['Survived/censored','surv','Survived, or collar lost']];
const FK=Object.fromEntries(FATES.map(f=>[f[0],f[1]])),FL=Object.fromEntries(FATES.map(f=>[f[0],f[2]]));
// Road-distance thresholds (m) for the 'quick check' exposure measure that uses GPS positions rather than the territory model.
const THR=[100,250,500,1000];
// Respect the visitor's reduced-motion setting: animation, auto-play and smooth scrolling are switched off when true.
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
// Shared interaction state. Every chart reads from S, so a click in one chart updates all of them (linked views).
// on = outcome categories currently shown, sel = selected animal ID, sp = highlighted species, brush = [lo,hi] exposure range dragged on chart B,
// measure/thr = exposure definition ('ud' = territory-based, 250 m; 'fix' = GPS positions within thr metres), drop = refit risk model without the selected animal,
// unc = risk-curve uncertainty display ('band' or 'hop'), exp = exposure value read off the risk curve.
// stA/hlA, stB, stD are the reveal levels of the scrolling story (see js6): hlA = outcomes highlighted in the lifelines, stB = chart B layers (1-6), stD = chart D layers (1-5).
const S={on:new Set(FATES.map(f=>f[0])),sel:null,sp:null,site:'Okanogan',brush:null,spot:false,stA:0,hlA:null,stB:6,stD:5,measure:'ud',thr:250,drop:false,unc:'band',hopOn:!RM,mo:'p250',exp:50};
// Container-ID suffix. The same chart functions draw both the scrolling story (ids such as 'pB') and the full explorer at the end (ids such as 'pBX').
// Setting SUF='X' makes $() look up the explorer copies, so no chart code is duplicated.
let SUF='';const $=id=>document.getElementById(id+SUF);
// Lookup of an animal's record by its ID.
const byId=Object.fromEntries(D.inds.map(r=>[r.id,r]));
const tip=$('tip');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const sum=a=>a.reduce((x,y)=>x+y,0);
// Small seeded pseudo-random generator (linear congruential). Seeding makes every jitter, bootstrap and shuffle reproducible, so the page shows the same numbers on every load.
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
// Median of an array.
function median(a){const b=[...a].sort((x,y)=>x-y),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2}
// Percentile (0-100) of an already sorted array, with linear interpolation.
function pct(sorted,p){const k=(sorted.length-1)*p/100,f=Math.floor(k),c=Math.ceil(k);return sorted[f]+(sorted[c]-sorted[f])*(k-f)}
// Percentile bootstrap interval for a median: resample the values with replacement B times, take each median, return the 2.5th and 97.5th percentiles.
// Used for the intervals on chart B and for the bootstrap explainer (js6), which uses the same seed so the two agree.
function bootCI(a,seed,B=2000){if(a.length<2)return null;const r=rng(seed),m=[];for(let k=0;k<B;k++){const s=[];for(let i=0;i<a.length;i++)s.push(a[(r()*a.length)|0]);m.push(median(s))}m.sort((x,y)=>x-y);return[pct(m,2.5),pct(m,97.5)]}
const thrIdx=()=>THR.indexOf(S.thr);
// Road exposure of one animal under the current measure.
// 'ud': % of the animal's estimated territory (autocorrelated kernel density home range, from ctmm in R) lying within 250 m of a road, weighted by the probability of use (r.p250).
// Otherwise: % of the animal's GPS positions within thr metres of a road (T.fs, precomputed).
function expo(r){return S.measure==='ud'?r.p250:(T.fs[r.id]?T.fs[r.id][thrIdx()]:null)}
const expoLab=()=>S.measure==='ud'?'% of territory within 250 m of a road':`% of GPS positions within ${S.thr} m of a road`;
// Opacity multiplier for species highlighting: the non-selected species is faded.
const spOp=sp=>S.sp&&S.sp!==sp?.15:1;
// Legacy spotlight hook (S.spot is false, so this returns 1).
const spot=c=>S.spot&&!c?.45:1;
const toggleSp=sp=>{S.sp=S.sp===sp?null:sp;render()};
// Format an ISO date as 'Mon YYYY'.
function fdate(s){if(!s)return'';const d=new Date(s+'T00:00:00Z');return MON[d.getUTCMonth()]+' '+d.getUTCFullYear()}
/* ---------- plain-language sentences ---------- */
// Plain-language sentence describing how an animal's tracking ended; used in tooltips, the animal card and screen-reader labels.
function outcomeSentence(r){
  const d=r.off?' in '+fdate(r.off):'';
  switch(r.fate){
    case 'Human':return `Killed by people${r.sub?' ('+r.sub.toLowerCase()+')':''}${d}.`;
    case 'Large carnivore':return `Killed by a large carnivore${d}.`;
    case 'Other':return `Died of another cause${d}.`;
    case 'Unknown':return `Died, cause unknown${d}.`;
    default:return 'Survived to the end of tracking, or the collar was lost.';}
}
function who(r){return `${r.sex==='f'?'female':'male'} ${r.sp.toLowerCase()}`}
function expSentence(r){const u=r.p250,f=T.fs[r.id];let t='';if(u!=null)t+=`${u.toFixed(0)}% of its territory lay within 250 m of a road`;if(f)t+=(t?'; ':'')+`${f[1].toFixed(0)}% of its GPS positions did`;return t?t+'.':''}
function tipFor(r){return `<b>${r.id}</b>: a ${who(r)} at ${r.site}, tracked for ${r.yrs.toFixed(1)} years. ${outcomeSentence(r)}<br>${expSentence(r)}`}
// Positions the shared tooltip next to the pointer and keeps it inside the window.
function showTip(e,html){tip.innerHTML=html;tip.style.display='block';const w=tip.offsetWidth;let x=e.clientX+14;if(x+w>innerWidth-8)x=e.clientX-w-14;tip.style.left=Math.max(8,x)+'px';tip.style.top=Math.min(e.clientY+14,innerHeight-tip.offsetHeight-8)+'px'}
function hideTip(){tip.style.display='none'}
/* ---------- glossary ---------- */
// Glossary of technical terms. Dotted-underlined words in the text (class 'g') show these definitions on hover or focus and in the glossary at the foot of the page.
const GL={
 range:['Territory (home range)','The area an animal uses day to day, estimated as a probability surface from its GPS positions with a model that allows for positions being correlated in time.'],
 edge:['Road edge','Land within 250 m of a vehicle-capable road (highway, local road or forest road) in OpenStreetMap.'],
 boot:['Bootstrap','Re-running the calculation many times on animals drawn at random, with replacement, from the sample. The spread of results shows how much the answer depends on which animals happened to be collared.'],
 ay:['Animal-year','One animal tracked for one year. Ten animals tracked for six months each make five animal-years. Rates divide deaths by animal-years so long and short tracks compare fairly.'],
 pois:['Poisson model','A standard model for counts of events (here, deaths) that happen at some rate over time.'],
 offset:['Offset','A term that adjusts a count for how long each animal was at risk, so that longer-tracked animals are expected to have more deaths.'],
 ci:['Interval','The range in which the true value plausibly lies given the data. Wide means unsure.'],
 perm:['Shuffle (permutation) test','Randomly reassigning species labels many times to see how big a difference chance alone produces.'],
};
$('gloss').innerHTML=Object.values(GL).map(g=>`<dt>${g[0]}</dt><dd>${g[1]}</dd>`).join('')+`<dt>Utilisation distribution</dt><dd>The probability surface of where an animal spends time; the territory is drawn from it.</dd><dt>HDOP</dt><dd>A GPS quality score. Positions with HDOP above 10 were removed.</dd>`;
document.addEventListener('mouseover',e=>{const g=e.target.closest&&e.target.closest('.g');if(g&&GL[g.dataset.g])showTip(e,`<b>${GL[g.dataset.g][0]}</b><br>${GL[g.dataset.g][1]}`)});
document.addEventListener('mouseout',e=>{if(e.target.closest&&e.target.closest('.g'))hideTip()});
document.querySelectorAll('.g').forEach(g=>{g.tabIndex=0;g.setAttribute('role','note');g.setAttribute('aria-label',(GL[g.dataset.g]||[''])[0]+': '+(GL[g.dataset.g]||['',''])[1]);});
/* ---------- shapes (outcome shown by shape as well as colour) ---------- */
// Draws an outcome marker. Outcome is encoded by shape as well as colour (diamond = killed by people, square = large carnivore, triangle = other,
// hollow circle = unknown, small circle = survived) so the chart still works for colour-blind readers and in greyscale print.
function shape(f,x,y,r,sel,extra=''){
  const c=`var(--f-${FK[f]})`,st=sel?'var(--ink)':'var(--panel)',sw=sel?2:1;
  if(f==='Human'){const a=r*1.4;return `<path d="M${x} ${y-a}L${x+a} ${y}L${x} ${y+a}L${x-a} ${y}Z" fill="${c}" stroke="${st}" stroke-width="${sw}" ${extra}/>`}
  if(f==='Large carnivore'){const a=r*1.05;return `<rect x="${x-a}" y="${y-a}" width="${2*a}" height="${2*a}" fill="${c}" stroke="${st}" stroke-width="${sw}" ${extra}/>`}
  if(f==='Other'){const a=r*1.3;return `<path d="M${x} ${y-a}L${x+a} ${y+a*.8}L${x-a} ${y+a*.8}Z" fill="${c}" stroke="${st}" stroke-width="${sw}" ${extra}/>`}
  if(f==='Unknown')return `<circle cx="${x}" cy="${y}" r="${r}" fill="var(--panel)" stroke="${c}" stroke-width="1.8" ${extra}/>`;
  return `<circle cx="${x}" cy="${y}" r="${r*.85}" fill="${c}" stroke="${st}" stroke-width="${sw}" ${extra}/>`;
}
const legShape=f=>`<svg width="14" height="14" viewBox="-7 -7 14 14" style="width:14px;display:inline-block;overflow:visible">${shape(f,0,0,4.2,false)}</svg>`;
const ICO=(sp,x,y)=>{const b=sp==='Bobcat';return `<use href="#${b?'sil-bobcat':'sil-coyote'}" x="${x}" y="${y}" width="${b?22:19}" height="14" class="ico" data-sp="${sp}" style="fill:${SPC[sp]};cursor:pointer;opacity:${spOp(sp)==1?1:.4}"/>`};
const spHead=(sp,x,y,extra='')=>ICO(sp,x,y-12)+`<text x="${x+28}" y="${y}" style="font-weight:650;fill:var(--ink);font-size:13px">${sp==='Bobcat'?'Bobcats':'Coyotes'}</text>${extra}`;
/* ---------- opacity logic (selection, filters, brush, species) ---------- */
function inBrush(r){if(!S.brush)return true;const v=expo(r);return v!=null&&v>=S.brush[0]&&v<=S.brush[1]}
function active(r){return S.on.has(r.fate)}
// Single place that decides how visible an animal is. Order of precedence: hidden outcome (filter chips) -> other species (species highlight) ->
// outside the brushed exposure range -> not the selected animal. All charts call this so they stay consistent.
function opac(r,focal){if(!active(r))return .1;if(S.sp&&r.sp!==S.sp)return .08;if(!inBrush(r))return .08;if(S.sel&&S.sel!==r.id)return .35;return focal===undefined?1:spot(focal)}
function svg(vw,vh,inner,label){return `<svg viewBox="0 0 ${vw} ${vh}" role="img" aria-label="${esc(label)}">${inner}</svg>`}
// Attaches hover, click and keyboard handlers to every element carrying data-id (one per animal). Clicking toggles the selection and re-renders all charts.
function wire(root,focusable){
  root.querySelectorAll('[data-id]').forEach(n=>{
    const r=byId[n.dataset.id];
    n.addEventListener('mousemove',e=>showTip(e,tipFor(r)));n.addEventListener('mouseleave',hideTip);
    n.addEventListener('click',()=>{S.sel=S.sel===r.id?null:r.id;render()});
    if(focusable){n.setAttribute('tabindex','0');n.setAttribute('role','button');n.setAttribute('aria-label',`${r.id}, ${who(r)}. ${outcomeSentence(r)} Press Enter to follow this animal.`);
      n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();S.sel=S.sel===r.id?null:r.id;render();setTimeout(()=>{const el=document.querySelector(`#pA [data-id="${r.id}"]`);el&&el.focus()},0)}});
      n.addEventListener('focus',()=>{const b=n.getBoundingClientRect();showTip({clientX:b.left+b.width/2,clientY:b.top},tipFor(r))});n.addEventListener('blur',hideTip)}
  });
}
