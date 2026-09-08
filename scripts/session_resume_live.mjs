// Run against the isolated Rust fixture in review_regressions.rs, never the
// user's active 8090 session. Both clients use the production frontend adapter.
import assert from 'node:assert/strict';
import {EngineSession} from '../src/engine-session.js';

const url=process.argv[2];
assert.ok(url?.startsWith('ws://127.0.0.1:'), 'an isolated loopback fixture URL is required');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(session) {
  session.connect();
  const deadline=Date.now()+3000;
  while(!session.ready&&Date.now()<deadline)await sleep(10);
  assert.equal(session.ready,true,'session did not open');
}
const primary=new EngineSession({url});
let observer;
try {
  await ready(primary);
  const controller=new AbortController();
  let settled=false;
  const generation=primary.command('genmove',{maxTimeMs:10000},{signal:controller.signal}).then(
    result=>{settled=true;return {result};},
    error=>{settled=true;return {error};}
  );
  await sleep(100);
  assert.equal(settled,false,'fixture genmove should await inference');
  const before=primary.snapshot.generation;
  const data=JSON.stringify({sessionId:primary.sessionId,analysisIntent:false});
  observer=new EngineSession({url,storage:{getItem:()=>data,setItem:()=>{}}});
  const issued=[];
  const original=observer.connection.request.bind(observer.connection);
  observer.connection.request=(type,...args)=>{issued.push(type);return original(type,...args);};
  await ready(observer);
  await sleep(150);
  assert.deepEqual(issued,['open'],'passive attachment must not issue analyze');
  assert.equal(settled,false,'second subscriber cancelled the primary genmove');
  assert.equal(primary.snapshot.generation,before,'second subscriber replaced the active analysis generation');
  assert.equal(primary.snapshot.position,0);
  controller.abort();
  assert.equal((await generation).error?.name,'AbortError');
  await sleep(50);
  process.stdout.write(JSON.stringify({ok:true,sessionId:primary.sessionId,observerRequests:issued,genmoveSurvivedPassiveAttach:true})+'\n');
} finally {
  observer?.close();
  primary.close();
}
