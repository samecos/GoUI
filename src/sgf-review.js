/** Keep the imported main line while the engine explores a temporary continuation. */
export class SgfReview {
  constructor({storage, key}) {
    this.storage=storage;
    this.key=key;
    this.record=null;
    try {
      const saved=JSON.parse(storage?.getItem(key)??'null');
      if(saved&&typeof saved.sessionId==='string'&&Number.isFinite(saved.komi)&&Array.isArray(saved.moves)&&saved.moves.every((move,index)=>move?.color===index%2+1&&(move.index===null||Number.isInteger(move.index)&&move.index>=0&&move.index<361)))this.record=saved;
    } catch { /* Storage is optional. */ }
  }

  save() {
    try { this.storage?.setItem(this.key,JSON.stringify(this.record)); } catch { /* Keep the in-memory record. */ }
  }

  load(sessionId, imported) {
    this.record={sessionId,komi:imported.settings.komi,moves:imported.moves.map(move=>({...move}))};
    this.save();
  }

  clear() { this.record=null;this.save(); }

  acceptSession(sessionId) {
    if(this.record&&this.record.sessionId!==sessionId)this.clear();
  }

  line(moves) { return this.record?.moves??moves; }

  matches(moves, position) {
    if(!this.record)return true;
    return position<=moves.length&&position<=this.record.moves.length&&this.record.moves.slice(0,position).every((move,index)=>move.index===moves[index].index&&move.color===moves[index].color);
  }

  next(moves, position) { return this.matches(moves,position)?this.line(moves)[position]:undefined; }

  needsRestore(moves) {
    return Boolean(this.record&&(moves.length!==this.record.moves.length||!this.matches(moves,moves.length)));
  }

  positionPayload() {
    return {boardSize:19,moves:this.record.moves.map(move=>({...move})),komi:this.record.komi,rules:'chinese'};
  }
}
