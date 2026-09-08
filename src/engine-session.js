import {EngineConnection, acceptsSnapshot} from './engine-connection.js';

export class EngineSession {
  constructor({url, storage, Connection = EngineConnection, onSnapshot = () => {}, onStatus = () => {}, onNotice = () => {}}) {
    this.storage = storage;
    this.storageKey = `yijian-session:${url}`;
    this.sessionId = this.readStored()?.sessionId ?? null;
    this.analysisIntent = this.readStored()?.analysisIntent ?? false;
    this.snapshot = null;
    this.ready = false;
    this.onSnapshot = onSnapshot;
    this.onStatus = onStatus;
    this.onNotice = onNotice;
    this.connection = new Connection({url, onOpen:() => this.open(), onMessage:message => {
      if (message?.type === 'snapshot') this.accept(message);
    }, onStatus:status => {
      if (status !== 'connected') this.ready = false;
      this.onStatus(status);
    }});
  }

  readStored() {
    try { return JSON.parse(this.storage?.getItem(this.storageKey) ?? 'null'); }
    catch { return null; }
  }

  save() {
    try { this.storage?.setItem(this.storageKey, JSON.stringify({sessionId:this.sessionId, analysisIntent:this.analysisIntent})); }
    catch { /* The connection remains usable when browser storage is unavailable. */ }
  }

  connect() { this.connection.connect(); }

  async open() {
    this.onStatus('restoring');
    try {
      let snapshot;
      try { snapshot = await this.connection.request('open', this.sessionId ? {sessionId:this.sessionId} : {}); }
      catch (error) {
        if (error.code !== 'SESSION_NOT_FOUND') throw error;
        this.sessionId = null;
        this.analysisIntent = false;
        this.save();
        this.onNotice('原会话已过期，已建立新棋局；可导入保存的 SGF');
        snapshot = await this.connection.request('open');
      }
      this.sessionId = snapshot.sessionId;
      this.ready = true;
      this.save();
      this.accept(snapshot);
      this.onStatus('ready');
      // The current protocol preserves enabled across disconnects and resumes
      // through Attach. Reissuing analyze would replace another subscriber's
      // genmove or reset its search budget merely by opening this page.
      if (typeof snapshot.analysis?.enabled !== 'boolean' && this.analysisIntent) {
        await this.command('analyze', {enabled:true});
      }
    } catch (error) {
      this.ready = false;
      this.onStatus('session-error');
      this.onNotice(error.message);
    }
  }

  accept(snapshot) {
    if (!snapshot || snapshot.sessionId !== this.sessionId) return false;
    if (!acceptsSnapshot(this.snapshot, snapshot, this.sessionId)) return false;
    if (snapshot.boardSize !== 19 || !Array.isArray(snapshot.board) || snapshot.board.length !== 361 || !Array.isArray(snapshot.moves)) {
      this.onNotice('服务快照格式不符合 19 路棋局协议');
      return false;
    }
    this.snapshot = snapshot;
    if (typeof snapshot.analysis?.enabled === 'boolean') {
      this.analysisIntent = snapshot.analysis.enabled;
      this.save();
    }
    this.onSnapshot(snapshot);
    return true;
  }

  async command(type, payload = {}, options = {}) {
    if (!this.ready) throw new Error('服务尚未就绪，请等待连接恢复');
    const data = await this.connection.request(type, {...payload,sessionId:this.sessionId}, options);
    if (type === 'analyze') {
      this.analysisIntent = payload.enabled;
      this.save();
    }
    if (data?.board) this.accept(data);
    return data;
  }

  async variation(index, {signal} = {}) {
    const generation = this.snapshot?.generation;
    const sessionId = this.sessionId;
    const result = await this.command('variation', {index,generation}, {signal});
    if (sessionId !== this.sessionId || generation !== this.snapshot?.generation || result.generation !== generation) return {available:false,moves:[]};
    return result;
  }

  close() { this.ready = false; this.connection.close(); }
}
