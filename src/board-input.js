// Delegate to a stable root: live analysis may replace the pressed SVG node.
// No Touch/TouchEvent constructors or pointer-capture API are required.
export function setupBoardInput(root, {
  activate,
  tap = activate,
  getContext = () => null,
  pointerEvents = typeof globalThis.PointerEvent === 'function',
  now = () => Date.now(),
} = {}) {
  const bindings=[];
  const contacts=new Set();
  let press=null,releaseTarget=null,lastPhysical=-Infinity,lastTouch=-Infinity;
  const targetOf=event=>event.target?.closest?.('[data-index],[data-candidate]');
  const listen=(type,handler,options)=>{
    root.addEventListener(type,handler,options);
    bindings.push(()=>root.removeEventListener(type,handler,options));
  };
  const cancel=()=>{
    releaseTarget?.();releaseTarget=null;
    press=null;
  };
  const start=(event,point,id)=>{
    cancel();
    const target=targetOf(event);
    if(!target)return;
    lastPhysical=lastTouch=now();
    press={target,id,x:point.clientX,y:point.clientY,context:getContext()};
    if(pointerEvents){
      // Capture on a mounted container, never on a replaceable intersection.
      const stable=target.closest?.('#board, #tab-content');
      try { stable?.setPointerCapture?.(id); } catch { /* Optional on older browsers. */ }
    }else if(target.addEventListener){
      // Touch Events keep their original target, even after it leaves the DOM.
      const onEnd=e=>{for(const touch of Array.from(e.changedTouches))finish(e,touch,touch.identifier);};
      const onMove=e=>{for(const touch of Array.from(e.changedTouches))move(touch,touch.identifier);};
      target.addEventListener('touchend',onEnd,{passive:false});
      target.addEventListener('touchmove',onMove,{passive:true});
      target.addEventListener('touchcancel',cancel,{passive:true});
      releaseTarget=()=>{
        target.removeEventListener('touchend',onEnd);
        target.removeEventListener('touchmove',onMove);
        target.removeEventListener('touchcancel',cancel);
      };
    }
  };
  const move=(point,id)=>{
    if(press?.id!==id)return;
    if(Math.hypot(point.clientX-press.x,point.clientY-press.y)>10)cancel();
  };
  const finish=(event,point,id)=>{
    lastTouch=now();
    if(press?.id!==id)return;
    move(point,id);
    if(!press)return;
    const completed=press;
    lastPhysical=now();
    // On the Touch Events fallback this also suppresses emulated mouse events.
    if(event.cancelable)event.preventDefault();
    cancel();
    if(completed.context===getContext())tap(completed.target);
  };
  const mouseDown=event=>{
    if(event.button!==0||now()-lastTouch<800)return;
    const target=targetOf(event);
    if(target){lastPhysical=now();activate(target);}
  };
  if(pointerEvents){
    listen('pointerdown',event=>{
      if(event.pointerType==='mouse'){mouseDown(event);return;}
      contacts.add(event.pointerId);
      if(contacts.size!==1||event.isPrimary===false){cancel();return;}
      if(event.button===0)start(event,event,event.pointerId);
    });
    listen('pointermove',event=>move(event,event.pointerId));
    listen('pointerup',event=>{
      if(event.pointerType==='mouse')return;
      contacts.delete(event.pointerId);
      finish(event,event,event.pointerId);
    });
    listen('pointercancel',event=>{
      contacts.delete(event.pointerId);
      lastPhysical=lastTouch=now();
      if(press?.id===event.pointerId)cancel();
    });
  }else{
    listen('mousedown',mouseDown);
    listen('touchstart',event=>{
      lastTouch=now();
      if(event.touches.length!==1){cancel();return;}
      const touch=event.touches[0];
      start(event,touch,touch.identifier);
    },{passive:true});
    listen('touchmove',event=>{
      for(const touch of Array.from(event.changedTouches))move(touch,touch.identifier);
    },{passive:true});
    listen('touchend',event=>{
      for(const touch of Array.from(event.changedTouches))finish(event,touch,touch.identifier);
    },{passive:false});
    listen('touchcancel',()=>{lastPhysical=lastTouch=now();cancel();},{passive:true});
  }
  listen('click',event=>{
    const target=targetOf(event);
    if(!target)return;
    // Keep keyboard/assistive activation (detail=0), consume compatibility clicks.
    if(event.detail>0&&now()-Math.max(lastPhysical,lastTouch)<800){event.preventDefault();return;}
    activate(target);
  });
  listen('contextmenu',event=>{if(press&&targetOf(event)){event.preventDefault();}});
  return ()=>{cancel();bindings.forEach(remove=>remove());};
}

// A touch preview is pinned to a coordinate and a position, never to a DOM node
// or a double-click timeout. Live search can reorder/replace candidate rows.
export function createTouchPreview({activate,preview,canPreview,getKey,getContext}) {
  let selection=null;
  return {
    get selection(){return selection;},
    reset(){selection=null;},
    tap(target){
      if(!canPreview(target)){selection=null;activate(target);return;}
      const next={key:getKey(target),context:getContext()};
      if(selection?.key===next.key&&selection.context===next.context){
        selection=null;activate(target);
      }else{
        selection=next;preview(target);
      }
    },
  };
}
