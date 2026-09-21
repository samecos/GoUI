import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSGF, exportSGF} from './sgf.js';
import {replayFrames} from './board-view.js';

test('SGF round trip preserves players, komi, Chinese rules, coordinates and pass', () => {
  const moves = [{color:1,index:0},{color:2,index:null},{color:1,index:360}];
  const settings = {black:'甲 ] \\ 乙',white:'白方',komi:6.5,rules:'Chinese'};
  assert.deepEqual(parseSGF(exportSGF(moves, settings)), {boardSize:19,moves,settings});
});

test('unsupported rules, branches, setup and turn order are rejected before mutation', () => {
  for (const source of ['(;SZ[19]RU[Japanese];B[aa])','(;SZ[19];B[aa](;W[bb]))','(;SZ[19]AB[aa];B[bb])','(;SZ[19];W[aa])','(;SZ[19];B[tt])','(;SZ[19];B[aa]','(;SZ[19])(;SZ[19])']) {
    assert.throws(() => parseSGF(source), Error, source);
  }
});

test('property-like text inside comments is not interpreted as setup or a variation', () => {
  const result = parseSGF('(;SZ[19]C[AB[aa\\] (;B[bb\\])];B[cc];W[])');
  assert.deepEqual(result.moves, [{color:1,index:40},{color:2,index:null}]);
});

test('an empty 19-line game can be imported', () => {
  assert.deepEqual(parseSGF('(;SZ[19])').moves, []);
});

test('omitted board size defaults to 19 for Go, including omitted game type', () => {
  for (const gameType of ['', 'GM[1]']) {
    for (const moves of ['', ';B[aa];W[ss];B[]']) {
      assert.deepEqual(parseSGF(`(;${gameType}${moves})`), parseSGF(`(;${gameType}SZ[19]${moves})`));
    }
  }
});

test('default board size does not allow unsupported sizes, game types or coordinates', () => {
  for (const size of ['9', '13', '20', '19:13', '', 'invalid']) {
    assert.throws(() => parseSGF(`(;SZ[${size}];B[aa])`), /当前服务仅支持 19 路棋谱/);
  }
  assert.throws(() => parseSGF('(;GM[2];B[aa])'), /请选择围棋 SGF 棋谱/);
  assert.throws(() => parseSGF('(;B[ta])'), /棋谱坐标超出范围/);
});

for (const [filename, count, first, last] of [
  ['Game_011.sgf', 187, {color:1,index:300}, {color:1,index:213}],
  ['Game_001.sgf', 294, {color:1,index:60}, {color:2,index:171}],
]) {
  test(`${filename} imports and replays the full game without an explicit SZ property`, () => {
    const source = readFileSync(new URL(`./fixtures/sgf/${filename}`, import.meta.url), 'utf8');
    const imported = parseSGF(source);
    assert.equal(imported.boardSize, 19);
    assert.equal(imported.moves.length, count);
    assert.deepEqual(imported.moves[0], first);
    assert.deepEqual(imported.moves.at(-1), last);
    assert.deepEqual(imported.settings, {black:'AlphaGo Master',white:'AlphaGo Zero',komi:7.5,rules:'Chinese'});
    assert.equal(replayFrames(imported.moves).length, count + 1);
    assert.deepEqual(parseSGF(exportSGF(imported.moves, imported.settings)), imported);
  });
}
