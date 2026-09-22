export const defaultSearchSettings = Object.freeze({
  playoutDoublingAdvantage: 0,
  playoutDoublingAdvantagePla: 'root',
  wideRootNoise: 0,
});

// Root-relative PDA changes NN inputs whenever the side to play changes. A new
// enable action should pin the current color so played subtrees stay reusable.
// Preserve an already-enabled explicit root mode instead of silently changing it.
export function defaultPdaPlayer(search, toPlay) {
  const s = search ?? defaultSearchSettings;
  return s.playoutDoublingAdvantage === 0 && s.playoutDoublingAdvantagePla === 'root'
    ? (toPlay === 2 ? 'white' : 'black') : s.playoutDoublingAdvantagePla;
}

export function pdaReuseHint(enabled, player) {
  if (!enabled) return 'PDA 关闭；落子后可继承已搜索的分支。';
  if (player === 'root') return '随行棋方会在黑白换方时反转 PDA，导致逐手重算。需要继承搜索，请选择固定黑方或固定白方。';
  return `固定${player === 'white' ? '白' : '黑'}方：落子后保持 PDA 参照方，可继承已搜索的分支。`;
}

export function searchSettingsPayload({pdaEnabled, pda, player, wideEnabled, wide}) {
  const number = (value, min, max, name) => {
    if (String(value).trim() === '') throw new Error(`${name}不能为空`);
    const result = Number(value);
    if (!Number.isFinite(result) || result < min || result > max) throw new Error(`${name}须在 ${min} 到 ${max} 之间`);
    return result;
  };
  if (!['root', 'black', 'white'].includes(player)) throw new Error('请选择 PDA 参照方');
  return {
    playoutDoublingAdvantage: pdaEnabled ? number(pda, -3, 3, 'PDA 数值') : 0,
    playoutDoublingAdvantagePla: player,
    wideRootNoise: wideEnabled ? number(wide, 0, 5, '宽根强度') : 0,
  };
}

export function searchSettingsSummary(search) {
  if (!search) return '服务暂不支持调参';
  const player = {root:'随行棋方 · 换方重算', black:'固定黑方', white:'固定白方'}[search.playoutDoublingAdvantagePla];
  return `${search.playoutDoublingAdvantage ? `PDA ${search.playoutDoublingAdvantage} · ${player}` : 'PDA 关'} / ${search.wideRootNoise ? `宽根 ${search.wideRootNoise}` : '宽根关'}`;
}

export function searchSettingsKey(search) {
  const s = search ?? defaultSearchSettings;
  return JSON.stringify([s.playoutDoublingAdvantage, s.playoutDoublingAdvantagePla, s.wideRootNoise]);
}
