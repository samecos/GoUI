import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSearchSettings, defaultPdaPlayer, pdaReuseHint, searchSettingsPayload, searchSettingsSummary, searchSettingsKey} from './search-settings.js';

test('new PDA enables pin the current color and explicit active modes survive reopening',()=>{
  assert.equal(defaultPdaPlayer(defaultSearchSettings,1),'black');
  assert.equal(defaultPdaPlayer(defaultSearchSettings,2),'white');
  assert.equal(defaultPdaPlayer({...defaultSearchSettings,playoutDoublingAdvantage:0.5},1),'root');
  assert.equal(defaultPdaPlayer({...defaultSearchSettings,playoutDoublingAdvantagePla:'black'},2),'black');
  assert.match(pdaReuseHint(true,'root'),/逐手重算/);
  assert.match(pdaReuseHint(true,'black'),/固定黑方.*继承/);
  assert.match(pdaReuseHint(true,'white'),/固定白方.*继承/);
  assert.match(pdaReuseHint(false,'root'),/PDA 关闭/);
});

test('enabled options send actual signed numeric settings, disabled options send zero',()=>{
  assert.deepEqual(searchSettingsPayload({pdaEnabled:true,pda:'-1.25',player:'white',wideEnabled:true,wide:'0.04'}),{playoutDoublingAdvantage:-1.25,playoutDoublingAdvantagePla:'white',wideRootNoise:0.04});
  assert.deepEqual(searchSettingsPayload({pdaEnabled:false,pda:'bad',player:'root',wideEnabled:false,wide:''}),defaultSearchSettings);
});

test('invalid input cannot turn enabled search parameters silently into zero',()=>{
  const valid={pdaEnabled:true,pda:1,player:'black',wideEnabled:true,wide:0.04};
  for(const pda of ['', ' ', 'NaN', Infinity, -3.1, 3.1]) assert.throws(()=>searchSettingsPayload({...valid,pda}));
  for(const wide of ['', NaN, Infinity, -0.01, 5.01]) assert.throws(()=>searchSettingsPayload({...valid,wide}));
  assert.throws(()=>searchSettingsPayload({...valid,player:'invalid'}));
  assert.equal(searchSettingsPayload({...valid,pda:-3,wide:5}).wideRootNoise,5);
});

test('summary and chart identity include active strength and fixed side',()=>{
  assert.match(searchSettingsSummary(defaultSearchSettings),/PDA 关.*宽根关/);
  const search={...defaultSearchSettings,playoutDoublingAdvantage:1,playoutDoublingAdvantagePla:'black',wideRootNoise:0.04};
  assert.match(searchSettingsSummary(search),/PDA 1.*黑方.*宽根 0.04/);
  assert.notEqual(searchSettingsKey(search),searchSettingsKey({...search,playoutDoublingAdvantagePla:'white'}));
  assert.notEqual(searchSettingsKey(search),searchSettingsKey({...search,wideRootNoise:0.1}));
  assert.equal(searchSettingsKey(undefined),searchSettingsKey(defaultSearchSettings));
});
