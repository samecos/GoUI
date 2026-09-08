import test from 'node:test';
import assert from 'node:assert/strict';
import {EngineSession} from './engine-session.js';

const snapshot=(overrides={})=>({type:'snapshot',sessionId:'session-a',generation:1,version:1,boardSize:19,board:Array(361).fill(0),moves:[],position:0,toPlay:1,captures:{black:0,white:0},settings:{komi:7.5,rules:'chinese'},analysis:{status:'idle',root:null,candidates:[]},...overrides});
class Connection {
  constructor(options) { this.options=options;this.calls=[];this.respond=async()=>snapshot(); }
  request(type,payload,options) { this.calls.push({type,payload,options});return this.respond(type,payload); }
  connect() {}
  close() { this.options.onStatus('disconnected'); }
}
function storage(initial) {
  const values=new Map(Object.entries(initial??{}));
  return {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
}

test('opening resumes the stored session and restores only the user analysis intent', async()=>{
  const seen=[];
  const session=new EngineSession({url:'ws://test',storage:storage({'yijian-session:ws://test':JSON.stringify({sessionId:'session-a',analysisIntent:true})}),Connection,onSnapshot:next=>seen.push(next)});
  await session.open();
  assert.deepEqual(session.connection.calls.map(call=>[call.type,call.payload]), [['open',{sessionId:'session-a'}],['analyze',{enabled:true,sessionId:'session-a'}]]);
  assert.equal(session.ready,true);
  assert.equal(seen.length,1);
});

test('an expired session is replaced explicitly with a notice and cleared analysis intent', async()=>{
  const notices=[];
  const session=new EngineSession({url:'ws://test',storage:storage({'yijian-session:ws://test':JSON.stringify({sessionId:'expired',analysisIntent:true})}),Connection,onNotice:text=>notices.push(text)});
  session.connection.respond=async(type,payload)=>{
    if(payload?.sessionId==='expired')throw Object.assign(new Error('expired'),{code:'SESSION_NOT_FOUND'});
    return snapshot();
  };
  await session.open();
  assert.deepEqual(session.connection.calls.map(call=>call.type),['open','open']);
  assert.equal(session.sessionId,'session-a');
  assert.equal(session.analysisIntent,false);
  assert.equal(notices.length,1);
});

test('a rejected move leaves the last accepted snapshot unchanged', async()=>{
  const session=new EngineSession({url:'ws://test',Connection});
  await session.open();
  const before=session.snapshot;
  session.connection.respond=async()=>{throw Object.assign(new Error('illegal'),{code:'ILLEGAL_MOVE'});};
  await assert.rejects(session.command('play',{color:1,index:20}),/illegal/);
  assert.equal(session.snapshot,before);
});

test('an older command response cannot replace a newer snapshot event', async()=>{
  const session=new EngineSession({url:'ws://test',Connection});
  await session.open();
  session.accept(snapshot({generation:3,version:8}));
  session.connection.respond=async()=>snapshot({generation:2,version:7});
  await session.command('seek',{position:0});
  assert.equal(session.snapshot.generation,3);
  assert.equal(session.snapshot.version,8);
});

test('late variation results cannot follow the user into a different root', async()=>{
  const session=new EngineSession({url:'ws://test',Connection});
  await session.open();
  let complete;
  session.connection.respond=()=>new Promise(resolve=>complete=resolve);
  const result=session.variation(20);
  session.accept(snapshot({generation:2,version:2}));
  complete({available:true,moves:[{color:1,index:20}],generation:1,version:1});
  assert.deepEqual(await result,{available:false,moves:[]});
});

test('disconnection retains the last snapshot and blocks further mutations', async()=>{
  const session=new EngineSession({url:'ws://test',Connection});
  await session.open();
  const before=session.snapshot;
  session.connection.options.onStatus('disconnected');
  await assert.rejects(session.command('play',{color:1,index:20}),/尚未就绪/);
  assert.equal(session.snapshot,before);
});

test('server terminal or budget completion synchronizes the analysis toggle', async()=>{
  const session=new EngineSession({url:'ws://test',Connection});
  await session.open();
  session.analysisIntent=true;
  session.accept(snapshot({version:2,analysis:{enabled:false,status:'finished',root:null,candidates:[]}}));
  assert.equal(session.analysisIntent,false);
});

test('a passive second subscriber does not restart an active server analysis or genmove', async()=>{
  const session=new EngineSession({url:'ws://test',storage:storage({'yijian-session:ws://test':JSON.stringify({sessionId:'session-a',analysisIntent:false})}),Connection});
  session.connection.respond=async()=>snapshot({analysis:{enabled:true,status:'analyzing',root:null,candidates:[]}});
  await session.open();
  assert.deepEqual(session.connection.calls.map(call=>call.type),['open']);
  assert.equal(session.analysisIntent,true);
});

test('reconnect trusts the server enabled flag without replacing its existing budget', async()=>{
  const session=new EngineSession({url:'ws://test',storage:storage({'yijian-session:ws://test':JSON.stringify({sessionId:'session-a',analysisIntent:true})}),Connection});
  session.connection.respond=async()=>snapshot({analysis:{enabled:true,status:'idle',root:null,candidates:[]}});
  await session.open();
  assert.deepEqual(session.connection.calls.map(call=>call.type),['open']);
});
