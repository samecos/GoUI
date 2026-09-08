import test from 'node:test';
import assert from 'node:assert/strict';
import {replayFrames, previewVariation, visibleCandidates, candidateLabel} from './board-view.js';
import {emptyBoard} from './go.js';

test('server history replay includes pass without changing the source moves', () => {
  const moves = [{color:1,index:20},{color:2,index:null}];
  const frames = replayFrames(moves);
  assert.equal(frames.length, 3);
  assert.deepEqual(frames[1].board, frames[2].board);
  assert.equal(frames[2].next, 1);
  assert.equal(moves.length, 2);
});

test('variation previews accept pass and remove captured stones without mutating the board', () => {
  const board = emptyBoard();
  board[20]=2; board[1]=board[19]=board[21]=1;
  const result = previewVariation(board, 1, [{index:39,color:1},{index:null,color:2}], 39);
  assert.equal(result.board[20], 0);
  assert.equal(board[20], 2);
  assert.deepEqual(result.stones, [{index:39,color:1,number:1}]);
});

test('a returned variation must start at its requested candidate', () => {
  assert.throws(() => previewVariation(emptyBoard(), 1, [{index:4,color:1}], 3), /格式/);
});

test('candidate proportions preserve ranking and respect available results and display limits', () => {
  const candidates = Array.from({length:100}, (_, index) => ({index}));
  assert.deepEqual(visibleCandidates(candidates, 0), candidates.slice(0, 3));
  assert.deepEqual(visibleCandidates(candidates, 12), candidates.slice(0, 12));
  assert.deepEqual(visibleCandidates(candidates, 100), candidates.slice(0, 30));
  assert.equal(visibleCandidates(candidates.slice(0, 31), 50).length, 16);
  assert.equal(visibleCandidates(candidates, undefined).length, 10);
  for (const count of [0, 1, 2]) {
    assert.deepEqual(visibleCandidates(candidates.slice(0, count), 0), candidates.slice(0, count));
  }
  assert.equal(candidates.length, 100);
  assert.deepEqual([0, 25, 26, 29].map(candidateLabel), ['A', 'Z', 'AA', 'AD']);
});
