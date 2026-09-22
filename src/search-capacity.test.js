import test from 'node:test';
import assert from 'node:assert/strict';
import {capacityReason, capacityUsage, rootReuseDescription} from './search-capacity.js';

test('budget display distinguishes charged storage and graph nodes from visits', () => {
  const usage = capacityUsage({memoryBytes: 16 * 2 ** 30, graphNodes: 883000, limits: {maxMemoryBytes: 32 * 2 ** 30}});
  assert.equal(usage, '搜索内存预算 16.00 / 32.00 GiB · 图节点 883,000');
  assert.match(capacityReason({reason: 'configured search memory budget reached'}), /内存预算/);
  assert.match(capacityReason({reason: 'configured search node budget reached'}), /节点数/);
  assert.match(capacityReason({reason: 'configured search depth budget reached'}), /深度/);
});
test('older servers without budget metadata remain supported', () => {
  assert.equal(capacityUsage({memoryBytes: 1024}), '');
  assert.equal(capacityUsage(null), '');
  assert.equal(capacityReason({reason: 'unknown reason'}), 'unknown reason');
});
test('root changes report retained visits or the actual invalidation reason', () => {
  assert.equal(rootReuseDescription(null), '');
  assert.equal(rootReuseDescription({old_nodes:10,retained_nodes:5}), '');
  assert.equal(rootReuseDescription({reuse_reason:'reused',retained_visits:158,retained_nodes:100}), '已继承 158 次访问 · 100 个节点');
  assert.match(rootReuseDescription({reuse_reason:'pda_reference_changed'}), /PDA 随行棋方切换/);
  assert.match(rootReuseDescription({reuse_reason:'pda_changed'}), /评估条件改变/);
});
