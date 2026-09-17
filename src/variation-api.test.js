import test from 'node:test';
import assert from 'node:assert/strict';
import {createVariationHover} from './variation-api.js';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('hover waits 300ms and only requests the latest candidate',async()=>{
  const calls=[];
  const hover=createVariationHover({request:async payload=>{calls.push(payload);return {}},onResult:()=>{}});
  hover.schedule('A');await sleep(150);hover.schedule('B');await sleep(180);
  assert.deepEqual(calls,[]);await sleep(150);assert.deepEqual(calls,['B']);hover.cancel();
});
test('leaving before debounce prevents a request',async()=>{
  let calls=0;const hover=createVariationHover({request:async()=>{calls++},onResult:()=>{}});
  hover.schedule({});hover.cancel();await sleep(330);assert.equal(calls,0);
});
test('cancellation aborts active requests and ignores stale responses',async()=>{
  const results=[];let resolveOld,signal;
  const hover=createVariationHover({delay:0,request:(_,{signal:s})=>{signal=s;return new Promise(resolve=>resolveOld=resolve)},onResult:r=>results.push(r)});
  hover.schedule('A');await sleep(10);hover.cancel();assert.equal(signal.aborted,true);
  resolveOld('stale');await sleep(0);assert.deepEqual(results,[]);
});

test('stationary hover refreshes serially, then cancellation discards late replies and stops polling',async()=>{
  const calls=[],results=[],pending=[];
  const hover=createVariationHover({delay:0,refreshInterval:20,
    request:(_,{signal})=>new Promise(resolve=>calls.push({signal,resolve})),
    onPending:state=>pending.push(state.refreshing),onResult:result=>results.push(result)});
  try{
    hover.schedule('A');await sleep(60);
    assert.equal(calls.length,1,'slow responses must not overlap');
    calls[0].resolve('first');await sleep(60);
    assert.equal(calls.length,2);
    assert.deepEqual(pending,[false,true]);
    assert.deepEqual(results,['first']);
    hover.cancel();assert.equal(calls[1].signal.aborted,true);
    calls[1].resolve('late');await sleep(60);
    assert.deepEqual(results,['first']);assert.equal(calls.length,2);
  }finally{hover.cancel();}
});

test('a failed refresh retries and leaving cancels the scheduled retry',async()=>{
  let calls=0;const errors=[];
  const hover=createVariationHover({delay:0,refreshInterval:20,
    request:async()=>{calls++;throw new Error('temporary');},
    onResult:()=>{},onError:error=>errors.push(error.message)});
  try{
    hover.schedule('A');await sleep(80);
    assert.ok(calls>=2);assert.equal(errors.length,calls);
    hover.cancel();const stopped=calls;await sleep(60);assert.equal(calls,stopped);
  }finally{hover.cancel();}
});
