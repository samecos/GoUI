/** Request/response transport. Session ownership stays independent of the socket. */
export class EngineConnection {
  constructor({url, WebSocketImpl = globalThis.WebSocket, onStatus = () => {}, onOpen = () => {}, onMessage = () => {}, reconnectDelay = 1000, requestTimeout = 15000} = {}) {
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.onStatus = onStatus;
    this.onOpen = onOpen;
    this.onMessage = onMessage;
    this.reconnectDelay = reconnectDelay;
    this.requestTimeout = requestTimeout;
    this.pending = new Map();
    this.sequence = 0;
    this.socket = null;
    this.stopped = true;
    this.retry = null;
  }

  connect() {
    if (this.socket && this.socket.readyState <= 1) return;
    this.stopped = false;
    clearTimeout(this.retry);
    this.onStatus('connecting');
    let socket;
    try { socket = new this.WebSocketImpl(this.url); }
    catch (error) { this.onStatus('disconnected', error); this.reconnect(); return; }
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (socket !== this.socket || this.stopped) return;
      this.onStatus('connected');
      this.onOpen();
    });
    socket.addEventListener('message', event => {
      if (socket !== this.socket || this.stopped) return;
      let message;
      try { message = JSON.parse(event.data); }
      catch { this.onStatus('protocol-error', new Error('服务返回了无效 JSON')); return; }
      if (message?.type === 'response') {
        const pending = this.pending.get(String(message.id));
        if (!pending) return;
        this.finish(String(message.id));
        if (message.ok) pending.resolve(message.data);
        else {
          const error = new Error(message.error?.message ?? message.error ?? '请求失败');
          error.code = message.error?.code;
          pending.reject(error);
        }
      } else this.onMessage(message);
    });
    socket.addEventListener('error', () => {
      // The close event owns cleanup and reconnect. No mutation is ever replayed.
      if (socket === this.socket) this.onStatus('connection-error');
    });
    socket.addEventListener('close', () => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.rejectPending(new Error('连接已中断，请重连后确认棋局状态'));
      this.onStatus('disconnected');
      this.reconnect();
    });
  }

  reconnect() {
    if (!this.stopped) this.retry = setTimeout(() => this.connect(), this.reconnectDelay);
  }

  request(type, payload = {}, {signal, timeout = this.requestTimeout} = {}) {
    if (signal?.aborted) return Promise.reject(abortError());
    if (this.socket?.readyState !== 1) return Promise.reject(new Error('尚未连接到围棋服务'));
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const abort = () => {
        if (!this.pending.has(id)) return;
        this.finish(id);
        this.cancel(id);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.finish(id);
        this.cancel(id);
        reject(new Error('请求超时，请确认服务状态'));
      }, timeout);
      this.pending.set(id, {resolve, reject, timer, signal, abort});
      signal?.addEventListener('abort', abort, {once: true});
      try { this.socket.send(JSON.stringify({...payload, id, type})); }
      catch (error) { this.finish(id); reject(error); }
    });
  }

  cancel(requestId) {
    if (this.socket?.readyState === 1) {
      try { this.socket.send(JSON.stringify({id: String(++this.sequence), type: 'cancel', requestId})); }
      catch { /* Local cancellation still completes if the connection closes during send. */ }
    }
  }

  finish(id) {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.signal?.removeEventListener('abort', pending.abort);
    this.pending.delete(id);
  }

  rejectPending(error) {
    for (const [id, pending] of this.pending) {
      this.finish(id);
      pending.reject(error);
    }
  }

  close() {
    this.stopped = true;
    clearTimeout(this.retry);
    const socket = this.socket;
    this.socket = null;
    this.rejectPending(new Error('连接已关闭'));
    socket?.close();
    this.onStatus('disconnected');
  }
}

function abortError() {
  const error = new Error('请求已取消');
  error.name = 'AbortError';
  return error;
}

/** Reject delayed analysis and responses from an older session/root/version. */
export function acceptsSnapshot(current, next, sessionId) {
  if (!next || next.sessionId !== sessionId || !Number.isInteger(next.generation) || !Number.isInteger(next.version)) return false;
  if (!current || current.sessionId !== sessionId) return true;
  return next.generation >= current.generation && next.version > current.version;
}
