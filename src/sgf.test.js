import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSGF, exportSGF} from './sgf.js';

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
