import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard,play} from './go.js';
test('occupied intersections are rejected without changing the board',()=>{const b=emptyBoard();b[0]=1;assert.ok(play(b,0,2).error);assert.equal(b[0],1)});
test('surrounded stones are captured',()=>{const b=emptyBoard();b[20]=2;b[1]=b[19]=b[21]=1;const r=play(b,39,1);assert.equal(r.captures,1);assert.equal(r.board[20],0);assert.equal(b[20],2)});
test('suicide is rejected',()=>{const b=emptyBoard();b[1]=b[19]=2;assert.ok(play(b,0,1).error)});
test('immediate ko recapture is rejected',()=>{const b=emptyBoard();b[20]=2;b[1]=b[19]=b[39]=1;b[2]=b[22]=b[40]=2;const r=play(b,21,1);assert.equal(r.captures,1);assert.ok(play(r.board,20,2,b).error)});
