/* ===== orchestration ===== */
// Text alternative to the charts: a table of every animal's attributes, for screen readers and for checking the numbers.
function dataTable(){
  $('dtab').innerHTML=`<tr><th>ID</th><th>Species</th><th>Sex</th><th>Site</th><th>Outcome</th><th>Years tracked</th><th>% of territory within 250 m</th><th>% of GPS positions within 250 m</th></tr>`+D.inds.map(r=>`<tr><td>${r.id}</td><td>${r.sp}</td><td>${r.sex==='f'?'female':'male'}</td><td>${r.site}</td><td>${FL[r.fate]}</td><td>${r.yrs.toFixed(2)}</td><td>${r.p250!=null?r.p250.toFixed(1):'–'}</td><td>${T.fs[r.id]?T.fs[r.id][1].toFixed(1):'–'}</td></tr>`).join('');
}
// Redraws every chart from the shared state S. Called after any interaction. Also redraws the explorer copy at the end of the page (renderX in js7).
function render(){
  chips();pA();pB();pC();pD();pE();pF();pM();measureCtl('mB');measureCtl('mD');
  document.querySelectorAll('use.ico').forEach(u=>u.onclick=()=>toggleSp(u.dataset.sp));
  document.querySelectorAll('.silbtn').forEach(b=>{b.setAttribute('aria-pressed',String(S.sp===b.dataset.sp));b.onclick=()=>toggleSp(b.dataset.sp)});
  const sb=document.querySelector('.sils');if(S.sp)sb.dataset.sp=S.sp;else delete sb.dataset.sp;
  if(M.view==='close'){M.close=null;setupClose();M.close&&drawMap()}else drawMap();
  $('drop').disabled=!S.sel;
  $('hopPlay').hidden=S.unc!=='hop'||RM;
  if(typeof renderX==='function')renderX();
}
$('exp').addEventListener('input',pD);
$('drop').onchange=e=>{S.drop=e.target.checked;render()};
$('uBand').onclick=()=>{S.unc='band';$('uBand').setAttribute('aria-pressed',true);$('uHop').setAttribute('aria-pressed',false);$('hopPlay').hidden=true;pD()};
$('uHop').onclick=()=>{S.unc='hop';$('uHop').setAttribute('aria-pressed',true);$('uBand').setAttribute('aria-pressed',false);$('hopPlay').hidden=RM;pD()};
$('hopPlay').onclick=()=>{S.hopOn=!S.hopOn;$('hopPlay').textContent=S.hopOn?'⏸ Pause':'▶ Play'};
// Animates the bootstrap refits only while the chart is on screen and the user has not paused it.
let hopVis=false;new IntersectionObserver(es=>hopVis=es[0].isIntersecting,{threshold:.2}).observe($('pD1'));
setInterval(()=>{if(S.unc==='hop'&&S.hopOn&&hopVis&&!RM){HOP++;pD()}},170);
// Smooth-scroll helper (instant when reduced motion is requested).
function goSlide(id){$(id).scrollIntoView({behavior:RM?'auto':'smooth',block:'start'})}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.sel){S.sel=null;render()}});
dataTable();mapLegend();render();setView('all');
