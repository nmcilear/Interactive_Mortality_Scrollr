/* ===== full explorer (all charts, linked) ===== */
// Redraws the explorer's charts in full-detail mode (all layers visible) by temporarily switching the container suffix to 'X' and resetting the story reveal levels.
function renderX(){
  if(!document.getElementById('pAX'))return;
  const sv=[S.stB,S.stD,S.hlA,S.unc];S.stB=6;S.stD=5;S.hlA=null;S.unc='band';SUF='X';
  try{chips();pA();pB();pC();pD();pE();pF();pM();measureCtl('mB');measureCtl('mD');$('dropX'.slice(0,-1)).disabled=!S.sel}
  catch(e){console.error(e)}finally{SUF='';[S.stB,S.stD,S.hlA,S.unc]=sv}
  document.getElementById('dropX').checked=S.drop;document.getElementById('drop').checked=S.drop;
}
document.getElementById('expX').addEventListener('input',renderX);
document.getElementById('dropX').onchange=e=>{S.drop=e.target.checked;render()};
let rxT;addEventListener('resize',()=>{clearTimeout(rxT);rxT=setTimeout(renderX,200)});
renderX();
