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
