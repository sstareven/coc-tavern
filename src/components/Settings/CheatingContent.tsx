// 领受赐福设置 tab — 仅一个开关 + help。复用 Settings/_shared 公共组件。
import { useSettingsStore } from '../../stores/useSettingsStore';
import { CategoryBar, HelpIcon, Toggle, labelStyle, rowStyle } from './_shared';

export function CheatingContent() {
  const enabled = useSettingsStore((s) => s.cheatingEnabled);
  const toggleCheating = useSettingsStore((s) => s.toggleCheating);

  return (
    <div>
      <CategoryBar label="赐福开关" first />
      <div style={rowStyle}>
        <span style={labelStyle}>
          领受深渊的祝福
          <HelpIcon text="开启后，在掷骰时浮现「赐福刻印」结果选项，可跳过随机掷骰直接锁定判定档位。" />
        </span>
        <Toggle on={enabled} onChange={toggleCheating} onLabel="已领受" offLabel="未领受" />
      </div>
    </div>
  );
}
