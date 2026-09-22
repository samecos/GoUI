const reasons = {
  'configured search memory budget reached': '搜索内存预算已达上限，落子或切换局面后可继续分析',
  'configured search node budget reached': '搜索图节点数已达上限，落子或切换局面后可继续分析',
  'configured search depth budget reached': '搜索深度已达上限，已有结果仍可查看',
  'configured search graph or depth budget reached': '搜索节点、内存或深度已达上限，已有结果仍可查看',
  'search graph capacity reached; change position or increase the graph budget to continue': '搜索容量已达上限，落子或切换局面后可继续分析'
};
export function capacityReason(analysis) {
  return reasons[analysis?.reason] ?? analysis?.reason;
}
export function rootReuseDescription(change) {
  if (!change?.reuse_reason) return '';
  if (change.reuse_reason === 'reused') return `已继承 ${(change.retained_visits ?? 0).toLocaleString('zh-CN')} 次访问 · ${(change.retained_nodes ?? 0).toLocaleString('zh-CN')} 个节点`;
  return {
    pda_reference_changed: 'PDA 随行棋方切换，本局面重新计算；固定黑／白方可继承搜索。',
    pda_changed: 'PDA 评估条件改变，本局面重新计算。',
    position_context_changed: '局面条件改变，本局面重新计算。',
    position_not_searched: '该局面未在保留的搜索图中，本局面重新计算。',
    memory_budget: '搜索内存预算不足，已裁剪旧分支。',
  }[change.reuse_reason] ?? '';
}
export function capacityUsage(analysis) {
  const max = analysis?.limits?.maxMemoryBytes;
  const used = analysis?.memoryBytes;
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(used)) return '';
  const gib = value => (value / 2 ** 30).toFixed(2);
  const nodes = Number.isFinite(analysis.graphNodes) ? ` · 图节点 ${analysis.graphNodes.toLocaleString('zh-CN')}` : '';
  return `搜索内存预算 ${gib(used)} / ${gib(max)} GiB${nodes}`;
}
