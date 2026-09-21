// Resizing only affects presentation; the board and engine session stay mounted.
export function setupWorkspaceResize(workspace, divider, storage) {
  const defaultWidth=352;
  let preferred=defaultWidth;
  try {
    const saved=Number(storage?.getItem('yijian-analysis-width'));
    if(Number.isFinite(saved)&&saved>=300)preferred=saved;
  } catch { /* Storage is optional. */ }
  const limits=()=>({min:300,max:Math.max(300,Math.min(520,workspace.clientWidth-440))});
  const apply=width=>{
    const {min,max}=limits();
    const value=Math.round(Math.max(min,Math.min(max,width)));
    workspace.style.setProperty('--analysis-width',value+'px');
    divider.setAttribute('aria-valuemin',min);
    divider.setAttribute('aria-valuemax',max);
    divider.setAttribute('aria-valuenow',value);
    divider.setAttribute('aria-valuetext','分析栏宽度 '+value+' 像素');
    return value;
  };
  const save=width=>{
    preferred=apply(width);
    try { storage?.setItem('yijian-analysis-width',String(preferred)); } catch { /* Storage is optional. */ }
  };
  let drag=null;
  divider.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();
    drag={x:event.clientX,width:Number(divider.getAttribute('aria-valuenow'))};
    divider.setPointerCapture?.(event.pointerId);
    divider.focus();
    workspace.classList.add('resizing');
  });
  divider.addEventListener('pointermove',event=>{if(drag)apply(drag.width+drag.x-event.clientX);});
  const finish=()=>{
    if(!drag)return;
    drag=null;workspace.classList.remove('resizing');
    save(Number(divider.getAttribute('aria-valuenow')));
  };
  divider.addEventListener('pointerup',finish);
  divider.addEventListener('pointercancel',finish);
  divider.addEventListener('lostpointercapture',finish);
  divider.addEventListener('dblclick',()=>save(defaultWidth));
  divider.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const current=Number(divider.getAttribute('aria-valuenow'));
    save(event.key==='Home'?defaultWidth:current+(event.key==='ArrowLeft'?16:-16));
  });
  const resize=()=>apply(preferred);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  observer?.observe(workspace);
  window.addEventListener('resize',resize);
  apply(preferred);
  return ()=>{observer?.disconnect();window.removeEventListener('resize',resize);};
}

export function fitBoardSize(width,height,paddingX=0,paddingY=0) {
  return Math.max(0,Math.floor(Math.min(width-paddingX,height-paddingY)));
}

// Measure the actual remaining space, without depending on CSS container units.
export function setupBoardSizing(stage,board,compactLayout) {
  let frame;
  const resize=()=>{
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      if(compactLayout.matches){board.style.width='';return;}
      const style=getComputedStyle(stage);
      const paddingX=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);
      const paddingY=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom);
      board.style.width=fitBoardSize(stage.clientWidth,stage.clientHeight,paddingX,paddingY)+'px';
    });
  };
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  observer?.observe(stage);
  window.addEventListener('resize',resize);
  resize();
  return ()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',resize);};
}
