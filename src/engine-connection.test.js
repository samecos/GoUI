import test from 'node:test';
import assert from 'node:assert/strict';
import {EngineConnection, acceptsSnapshot} from './engine-connection.js';

class Socket {
  static instances = [];
  constructor() { this.readyState = 0; this.sent = []; this.listeners = {}; Socket.instances.push(this); }
  addEventListener(name, callback) { (this.listeners[name] ??= []).push(callback); }
  emit(name, data) { for (const callback of this.listeners[name] ?? []) callback(data); }
  open() { this.readyState = 1; this.emit('open'); }
  send(text) { this.sent.push(JSON.parse(text)); }
  reply(id, data) { this.emit('message', {data: JSON.stringify({id, type:'response', ok:true, data})}); }
  close() { this.readyState = 3; this.emit('close'); }
}
function setup(options = {}) {
  const connection = new EngineConnection({url:'ws://test', WebSocketImpl:Socket, ...options});
  connection.connect();
  const socket = Socket.instances.at(-1);
  socket.open();
  return {connection, socket};
}

test('responses are matched by request id when delivered out of order', async () => {
  const {connection, socket} = setup();
  const first = connection.request('move', {index:3});
  const second = connection.request('snapshot');
  socket.reply(socket.sent[1].id, {position:2});
  socket.reply(socket.sent[0].id, {position:1});
  assert.deepEqual(await first, {position:1});
  assert.deepEqual(await second, {position:2});
  connection.close();
});

test('aborting a variation cancels its request and late responses are ignored', async () => {
  const {connection, socket} = setup();
  const controller = new AbortController();
  const result = connection.request('variation', {candidate:3}, {signal:controller.signal});
  const id = socket.sent[0].id;
  controller.abort();
  await assert.rejects(result, {name:'AbortError'});
  assert.equal(socket.sent[1].type, 'cancel');
  assert.equal(socket.sent[1].requestId, id);
  socket.reply(id, {moves:[]});
  assert.equal(connection.pending.size, 0);
  connection.close();
});

test('disconnect rejects in-flight mutations; reconnect never replays them', async () => {
  const {connection, socket} = setup({reconnectDelay:1});
  const result = connection.request('move', {index:3});
  socket.close();
  await assert.rejects(result, /连接已中断/);
  await new Promise(resolve => setTimeout(resolve, 5));
  const replacement = Socket.instances.at(-1);
  assert.notEqual(socket, replacement);
  replacement.open();
  assert.deepEqual(replacement.sent, []);
  connection.close();
});

test('request timeout releases the request and sends cancellation', async () => {
  const {connection, socket} = setup();
  await assert.rejects(connection.request('variation', {}, {timeout:1}), /请求超时/);
  assert.equal(connection.pending.size, 0);
  assert.equal(socket.sent[1].type, 'cancel');
  connection.close();
});

test('cancellation still rejects locally when the socket closes during the cancel send', async () => {
  const {connection, socket} = setup();
  const controller = new AbortController();
  const result = connection.request('genmove', {}, {signal:controller.signal});
  socket.send = () => { throw new Error('socket closed'); };
  controller.abort();
  await assert.rejects(result, {name:'AbortError'});
  assert.equal(connection.pending.size, 0);
  connection.close();
});

test('snapshot gate rejects wrong sessions and stale generation/version', () => {
  const current = {sessionId:'a',generation:4,version:8};
  assert.equal(acceptsSnapshot(current, {...current,sessionId:'b',version:9}, 'a'), false);
  assert.equal(acceptsSnapshot(current, {...current,generation:3,version:99}, 'a'), false);
  assert.equal(acceptsSnapshot(current, {...current,version:8}, 'a'), false);
  assert.equal(acceptsSnapshot(current, {...current,version:9}, 'a'), true);
  assert.equal(acceptsSnapshot(current, {...current,generation:5,version:1}, 'a'), false);
  assert.equal(acceptsSnapshot(current, {...current,generation:5,version:9}, 'a'), true);
});
