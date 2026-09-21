import test from 'node:test';
import assert from 'node:assert/strict';
import {setupBoardInput,createTouchPreview} from './board-input.js';
import {createVariationHover} from './variation-api.js';

function eventBus() {
  const handlers=new Map();
  return {
    addEventListener(type,fn){const set=handlers.get(type)??new Set();set.add(fn);handlers.set(type,set);},
    removeEventListener(type,fn){handlers.get(type)?.delete(fn);},
    emit(type,values={}){
      const event={button:0,detail:1,clientX:40,clientY:80,cancelable:true,preventDefault(){this.defaultPrevented=true;},...values};
      for(const fn of [...(handlers.get(type)??[])])fn(event);
      return event;
    },
  };
}
function fixture(pointerEvents=true,options={}) {
  const root=eventBus(),point=eventBus(),moves=[];
  point.dataset={index:'60'};
  point.closest=selector=>selector.includes('data-index')?point:null;
  const dispose=setupBoardInput(root,{pointerEvents,activate:target=>moves.push(target.dataset.index),...options});
  const emit=(type,values={})=>root.emit(type,{target:point,pointerType:'touch',pointerId:1,isPrimary:true,...values});
  return {root,point,moves,emit,dispose};
}
const touch=(id=1,x=40,y=80)=>({identifier:id,clientX:x,clientY:y});

test('a touch pointer places on release without requiring click, once only',()=>{
  const f=fixture();
  f.emit('pointerdown');assert.deepEqual(f.moves,[]);
  f.emit('pointerup');f.emit('click');
  assert.deepEqual(f.moves,['60']);f.dispose();
});
test('mouse remains responsive on press and its later click does not double-play',()=>{
  const f=fixture();
  f.emit('pointerdown',{pointerType:'mouse'});
  assert.deepEqual(f.moves,['60']);
  f.emit('click',{pointerType:'mouse'});
  assert.deepEqual(f.moves,['60']);f.dispose();
});
test('Touch Events fallback works without PointerEvent or Touch constructors and ignores ghost mouse events',()=>{
  const f=fixture(false);
  f.emit('touchstart',{touches:[touch()]});
  f.emit('touchend',{changedTouches:[touch()]});
  f.emit('mousedown');f.emit('click');
  assert.deepEqual(f.moves,['60']);f.dispose();
});
test('a detached touch target still releases the original point after board redraw',()=>{
  const f=fixture(false);
  f.emit('touchstart',{touches:[touch()]});
  // The original target no longer bubbles to document after a render.
  f.point.emit('touchend',{changedTouches:[touch()],target:f.point});
  f.emit('click');
  assert.deepEqual(f.moves,['60']);f.dispose();
});
test('scrolling, browser cancellation, and two-finger gestures never place stones',()=>{
  for(const pointerEvents of [true,false]){
    const f=fixture(pointerEvents);
    if(pointerEvents){
      f.emit('pointerdown');f.emit('pointermove',{clientY:110});f.emit('pointerup',{clientY:110});f.emit('click');
      f.emit('pointerdown');f.emit('pointercancel');f.emit('pointerup');
      f.emit('pointerdown');f.emit('pointerdown',{pointerId:2,isPrimary:false});f.emit('pointerup',{pointerId:2});f.emit('pointerup');
    }else{
      f.emit('touchstart',{touches:[touch()]});f.emit('touchmove',{changedTouches:[touch(1,40,110)]});f.emit('touchend',{changedTouches:[touch(1,40,110)]});f.emit('click');
      f.emit('touchstart',{touches:[touch()]});f.emit('touchcancel');f.emit('touchend',{changedTouches:[touch()]});
      f.emit('touchstart',{touches:[touch()]});f.emit('touchstart',{touches:[touch(),touch(2)]});f.emit('touchend',{changedTouches:[touch(),touch(2)]});
    }
    assert.deepEqual(f.moves,[]);f.dispose();
  }
});
test('a changed position between touch down and release rejects the stale gesture',()=>{
  let generation=1;
  const f=fixture(true,{getContext:()=>generation});
  f.emit('pointerdown');generation++;f.emit('pointerup');
  assert.deepEqual(f.moves,[]);f.dispose();
});
test('keyboard click remains available immediately after pointer activation',()=>{
  const f=fixture();
  f.emit('pointerdown');f.emit('pointerup');
  f.emit('click',{detail:0});
  assert.deepEqual(f.moves,['60','60']);f.dispose();
});

function analysisFixture(pointerEvents=true) {
  let context='session:1:0:analysis',time=0,analysis=true;
  const previews=[],plays=[];
  const controller=createTouchPreview({
    activate:target=>plays.push(Number(target.dataset.index??target.dataset.candidate)),
    preview:target=>previews.push(Number(target.dataset.index??target.dataset.candidate)),
    canPreview:()=>analysis,
    getKey:target=>target.dataset.index??target.dataset.candidate,
    getContext:()=>context,
  });
  const f=fixture(pointerEvents,{tap:controller.tap,getContext:()=>context,now:()=>time});
  const tap=(target=f.point)=>{
    if(pointerEvents){f.emit('pointerdown',{target});f.emit('pointerup',{target});}
    else{f.emit('touchstart',{target,touches:[touch()]});f.emit('touchend',{target,changedTouches:[touch()]});}
    f.emit('click',{target});
  };
  return {...f,controller,previews,plays,tap,
    advance:ms=>{time+=ms;},
    changePosition:()=>{context='session:2:1:analysis';},
    setPlayMode:()=>{analysis=false;context='session:1:0:play';},
  };
}

test('analysis touch pins the first preview after release; a later tap on that coordinate plays once',()=>{
  for(const pointerEvents of [true,false]){
    const f=analysisFixture(pointerEvents);
    f.tap();assert.deepEqual(f.previews,[60]);assert.deepEqual(f.plays,[]);
    assert.equal(f.controller.selection.key,'60');
    f.advance(60_000); // Reading the variation is not constrained by a double-tap timer.
    f.tap();assert.deepEqual(f.plays,[60]);assert.equal(f.controller.selection,null);
    assert.deepEqual(f.moves,[],'compatibility clicks must never bypass touch confirmation');
    f.dispose();
  }
});

test('changing the selected point previews it; board and replaced candidate rows share confirmation',()=>{
  const f=analysisFixture();
  f.tap();
  const row={dataset:{candidate:'72'},closest(){return this;}};
  f.tap(row);assert.deepEqual(f.previews,[60,72]);assert.deepEqual(f.plays,[]);
  // The server reranks candidates and the row is recreated while the user reads.
  const replacement={dataset:{index:'72'},closest(){return this;}};
  f.tap(replacement);assert.deepEqual(f.plays,[72]);f.dispose();
});

test('exiting preview or changing position requires a fresh first tap',()=>{
  const f=analysisFixture();
  f.tap();f.controller.reset();f.tap();
  assert.deepEqual(f.previews,[60,60]);assert.deepEqual(f.plays,[]);
  f.changePosition();f.tap();
  assert.deepEqual(f.previews,[60,60,60]);assert.deepEqual(f.plays,[]);
  f.tap();assert.deepEqual(f.plays,[60]);f.dispose();
});

test('scrolling a second touch does not confirm the pinned point',()=>{
  const f=analysisFixture();f.tap();
  f.emit('pointerdown');f.emit('pointermove',{clientY:110});f.emit('pointerup',{clientY:110});f.emit('click');
  assert.deepEqual(f.plays,[]);assert.equal(f.controller.selection.key,'60');
  f.tap();assert.deepEqual(f.plays,[60]);f.dispose();
});

test('free play keeps one-tap moves; mouse input never enters touch preview',()=>{
  const f=analysisFixture();
  f.emit('pointerdown',{pointerType:'mouse'});f.emit('click',{pointerType:'mouse'});
  assert.deepEqual(f.moves,['60']);assert.deepEqual(f.previews,[]);
  f.setPlayMode();f.tap();assert.deepEqual(f.plays,[60]);assert.deepEqual(f.previews,[]);f.dispose();
});

test('pass can be previewed and confirmed with a null coordinate',()=>{
  let plays=0,previews=0;
  const controller=createTouchPreview({getKey:()=>null,getContext:()=>1,canPreview:()=>true,
    activate:()=>plays++,preview:()=>previews++});
  controller.tap({});assert.equal(previews,1);assert.equal(plays,0);
  controller.tap({});assert.equal(plays,1);assert.equal(controller.selection,null);
});

test('a pending touch variation survives release, switches without stale results, and cancels on confirmation',async()=>{
  const requests=[],shown=[],plays=[];
  const hover=createVariationHover({
    request:(payload,{signal})=>new Promise(resolve=>requests.push({payload,signal,resolve})),
    onResult:result=>shown.push(result),
  });
  const controller=createTouchPreview({getKey:target=>target.dataset.index,getContext:()=>1,canPreview:()=>true,
    preview:target=>hover.schedule(target.dataset.index,{immediate:true}),
    activate:target=>{hover.cancel();plays.push(target.dataset.index);},
  });
  const f=fixture(true,{tap:controller.tap});
  try{
    f.emit('pointerdown');f.emit('pointerup');f.emit('click');
    assert.equal(requests.length,1);assert.equal(requests[0].signal.aborted,false);assert.deepEqual(plays,[]);
    const other={dataset:{index:'72'},closest(){return this;}};
    f.emit('pointerdown',{target:other});f.emit('pointerup',{target:other});
    assert.equal(requests[0].signal.aborted,true);
    requests[0].resolve('old variation');requests[1].resolve('new variation');
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(shown,['new variation']);assert.equal(controller.selection.key,'72');
    f.emit('pointerdown',{target:other});f.emit('pointerup',{target:other});f.emit('click',{target:other});
    assert.deepEqual(plays,['72']);assert.deepEqual(f.moves,[]);
  }finally{f.dispose();hover.cancel();}
});
