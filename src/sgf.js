const escapeValue = value => String(value).replace(/\\/g, '\\\\').replace(/\]/g, '\\]');

/** A deliberately bounded SGF reader: one game, one main line, no setup stones. */
export function parseSGF(source) {
  let offset = 0;
  const whitespace = () => { while (/\s/.test(source[offset] ?? '') && offset < source.length) offset++; };
  const fail = message => { throw new Error(message); };
  whitespace();
  if (source[offset++] !== '(') fail('请导入标准 SGF 棋谱');
  const nodes = [];
  let closedGame = false;
  while (offset < source.length) {
    whitespace();
    if (source[offset] === ')') { offset++; closedGame = true; break; }
    if (source[offset] === '(') fail('当前仅支持无分支 SGF，请导出主线后导入');
    if (source[offset++] !== ';') fail('SGF 节点格式错误');
    const node = {};
    while (offset < source.length) {
      whitespace();
      if (';()'.includes(source[offset])) break;
      const match = /^[A-Z]+/.exec(source.slice(offset));
      if (!match) fail('SGF 属性格式错误');
      const key = match[0]; offset += key.length;
      if (node[key]) fail('SGF 包含重复属性');
      node[key] = [];
      whitespace();
      while (source[offset] === '[') {
        offset++;
        let value = '', closed = false;
        while (offset < source.length) {
          const character = source[offset++];
          if (character === ']') { closed = true; break; }
          if (character === '\\') {
            if (offset >= source.length) fail('SGF 属性未结束');
            const escaped = source[offset++];
            if (escaped === '\r' && source[offset] === '\n') offset++;
            else if (escaped !== '\n' && escaped !== '\r') value += escaped;
          } else value += character;
        }
        if (!closed) fail('SGF 属性未结束');
        node[key].push(value);
        whitespace();
      }
      if (!node[key].length) fail('SGF 属性缺少值');
    }
    nodes.push(node);
  }
  whitespace();
  if (!nodes.length || !closedGame) fail('SGF 棋谱未结束');
  if (offset !== source.length) fail('当前仅支持单局 SGF');
  const root = nodes[0];
  // SGF defaults Go games to 19x19 when SZ is omitted; explicit invalid sizes still fail.
  if ((root.SZ?.[0] ?? '19') !== '19') fail('当前服务仅支持 19 路棋谱');
  if (root.GM && root.GM[0] !== '1') fail('请选择围棋 SGF 棋谱');
  const rules = root.RU?.[0] ?? 'Chinese';
  if (!['Chinese', 'chinese', '中国规则'].includes(rules)) fail('当前服务仅支持中国规则棋谱');
  if (root.PL && root.PL[0] !== 'B') fail('当前不支持白方先行棋谱');
  const komi = root.KM ? Number(root.KM[0]) : 7.5;
  if (!Number.isFinite(komi) || komi < -100 || komi > 100) fail('棋谱贴目无效');
  const moves = [];
  for (const node of nodes) {
    if (node.AB || node.AW || node.AE || node.HA) fail('暂不支持包含摆子或让子的棋谱');
    if (node.B && node.W) fail('单个 SGF 节点不能包含双方落子');
    if (!node.B && !node.W) continue;
    const color = node.B ? 1 : 2;
    if (color !== (moves.length % 2 === 0 ? 1 : 2)) fail('棋谱必须从黑方开始交替落子');
    const values = node.B ?? node.W;
    if (values.length !== 1) fail('单个节点只能包含一个落点');
    const raw = values[0];
    if (raw !== '' && !/^[a-s]{2}$/.test(raw)) fail('棋谱坐标超出范围');
    moves.push({color,index:raw === '' ? null : (raw.charCodeAt(1)-97)*19 + raw.charCodeAt(0)-97});
  }
  return {boardSize:19,settings:{black:root.PB?.[0] || '玩家 1',white:root.PW?.[0] || '玩家 2',komi,rules:'Chinese'},moves};
}

export function exportSGF(moves, settings) {
  return `(;GM[1]FF[4]CA[UTF-8]SZ[19]KM[${settings.komi}]RU[${escapeValue(settings.rules)}]PB[${escapeValue(settings.black)}]PW[${escapeValue(settings.white)}]AP[Yijian]${moves.map(move => `;${move.color === 1 ? 'B' : 'W'}[${move.index === null ? '' : String.fromCharCode(97+move.index%19)+String.fromCharCode(97+Math.floor(move.index/19))}]`).join('')})`;
}
