import test from 'node:test';
import assert from 'node:assert/strict';
import {SgfReview} from './sgf-review.js';
import {parseSGF} from './sgf.js';

const imported=()=>parseSGF('(;KM[6.5];B[dd];W[pp];B[];W[dp])');
const makeReview=()=>new SgfReview({key:'test'});

test('trial moves do not replace the imported line, and rewinding reveals its next move',()=>{
  const review=makeReview(),sgf=imported();
  review.load('session',sgf);
  const trial=[sgf.moves[0],{color:2,index:180}];
  assert.equal(review.matches(trial,2),false);
  assert.equal(review.next(trial,2),undefined);
  assert.equal(review.needsRestore(trial),true);
  assert.deepEqual(review.next(trial,1),sgf.moves[1]);
  assert.deepEqual(review.line(trial),sgf.moves);
  const payload=review.positionPayload();
  assert.equal(payload.komi,6.5);
  payload.moves.pop();
  assert.equal(review.line(trial).length,4);
});

test('following the record recognizes passes and its end, but a truncated matching prefix needs restoring',()=>{
  const review=makeReview(),sgf=imported();
  review.load('session',sgf);
  assert.equal(review.needsRestore(sgf.moves),false);
  assert.deepEqual(review.next(sgf.moves,2),{color:1,index:null});
  assert.equal(review.next(sgf.moves,4),undefined);
  assert.equal(review.needsRestore(sgf.moves.slice(0,2)),true);
  assert.equal(review.matches([...sgf.moves,{color:1,index:0}],5),false);
  assert.equal(review.needsRestore(sgf.moves.map(move=>({...move,color:3-move.color}))),true);
});

test('refresh preserves the imported line during a trial, while a replacement session clears it',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const review=new SgfReview({storage,key:'review'}),sgf=imported();
  review.load('session',sgf);
  const restored=new SgfReview({storage,key:'review'});
  restored.acceptSession('session');
  assert.deepEqual(restored.line([]),sgf.moves);
  restored.acceptSession('new-session');
  assert.equal(restored.record,null);
  assert.equal(new SgfReview({storage,key:'review'}).record,null);
});

test('clearing a review returns ordinary games to their server history',()=>{
  const review=makeReview(),sgf=imported();
  review.load('session',sgf);
  review.clear();
  assert.equal(review.line(sgf.moves),sgf.moves);
  assert.deepEqual(review.next(sgf.moves,0),sgf.moves[0]);
  assert.equal(review.needsRestore(sgf.moves),false);
});
