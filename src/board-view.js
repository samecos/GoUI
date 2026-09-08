import {emptyBoard, play} from './go.js';

export function candidatePercentage(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 10;
}

/** Keep the engine's ranking, with 3–30 suggestions when enough are available. */
export function visibleCandidates(candidates, percentage) {
  const count = Math.max(3, Math.min(30, Math.ceil(candidates.length * candidatePercentage(percentage) / 100)));
  return candidates.slice(0, count);
}

export function candidateLabel(index) {
  return index < 26 ? String.fromCharCode(65 + index) : 'A' + String.fromCharCode(65 + index - 26);
}

export function maximumCandidateVisits(candidates) {
  return candidates.reduce((maximum, candidate) => Number.isFinite(candidate.visits) ? Math.max(maximum, candidate.visits) : maximum, 0);
}

/** Use a shared zero-to-maximum scale so small visit differences stay small. */
export function candidateVisitColors(visits, maximum) {
  const weight = Number.isFinite(visits) && Number.isFinite(maximum) && maximum > 0
    ? Math.max(0, Math.min(1, visits / maximum)) : 0;
  const light = [210, 228, 196], dark = [32, 85, 57];
  const rgb = light.map((channel, index) => Math.round(channel + (dark[index] - channel) * weight));
  const linear = rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return {fill: `rgb(${rgb.join(',')})`, text: luminance > 0.179 ? '#000' : '#fff'};
}

/** Replay only an already accepted server history for display and SGF export. */
export function replayFrames(moves) {
  const frames = [{board:emptyBoard(), captures:[0,0], next:1}];
  for (const move of moves) {
    const previous = frames.at(-1);
    const result = move.index === null
      ? {board:[...previous.board], captures:0}
      : play(previous.board, move.index, move.color);
    if (result.error) throw new Error('服务端棋谱无法重放');
    const captures = [...previous.captures];
    captures[move.color-1] += result.captures;
    frames.push({board:result.board, captures, next:3-move.color});
  }
  return frames;
}

/** Build a visual preview, accepting pass and clearing stones captured along the PV. */
export function previewVariation(board, toPlay, moves, candidate) {
  if (!Array.isArray(moves)) throw new Error('变化数据格式错误');
  let current = [...board];
  let color = toPlay;
  const stones = new Map();
  moves.forEach((move, index) => {
    if (move.color !== color || (index === 0 && move.index !== candidate) || (move.index !== null && (!Number.isInteger(move.index) || move.index < 0 || move.index > 360))) throw new Error('变化数据格式错误');
    const result = move.index === null ? {board:current} : play(current, move.index, color);
    if (result.error) throw new Error('变化中包含无法显示的落点');
    current = result.board;
    for (const [point, stone] of stones) if (current[point] !== stone.color) stones.delete(point);
    if (move.index !== null) stones.set(move.index, {...move, number:index+1});
    color = 3-color;
  });
  return {board:current, stones:[...stones.values()]};
}
