// src/components/Settings/ApiModelPicker.tsx —— 三套调用站点(主/MVU/补写)选 profile+模型的薄封装
// 设计:把 SearchableModelSelect 跟 useApiProfilesStore 的 channel-specific selector 黏合,
// 包左右标签布局(label 在左、picker 在右),与 SettingsPanel 其他 rowStyle 行视觉统一。
// v1.14.1:profiles 空时右侧改纯文案提示,不再显示空 picker 按钮。

import { useApiProfilesStore } from '../../stores/useApiProfilesStore';
import { collectAllProfileModels } from '../../api/api-models-engine';
import { SearchableModelSelect } from './SearchableModelSelect';
import { rowStyle, labelStyle } from './_shared';

interface Props {
  channel: 'main' | 'mvu' | 'rewrite';
  /** 左侧标签文案,默认「模型使用」。 */
  label?: string;
}

export function ApiModelPicker({ channel, label = '模型使用' }: Props) {
  const profiles = useApiProfilesStore((s) => s.apiProfiles);

  // 三套 channel 分别订阅自己的 selectedXxxApiProfileId/Model
  const selectedProfileId = useApiProfilesStore((s) =>
    channel === 'main' ? s.selectedMainApiProfileId
      : channel === 'mvu' ? s.selectedMvuApiProfileId
      : s.selectedRewriteApiProfileId,
  );
  const selectedModel = useApiProfilesStore((s) =>
    channel === 'main' ? s.selectedMainModel
      : channel === 'mvu' ? s.selectedMvuModel
      : s.selectedRewriteModel,
  );

  const setSelectedMain = useApiProfilesStore((s) => s.setSelectedMain);
  const setSelectedMvu = useApiProfilesStore((s) => s.setSelectedMvu);
  const setSelectedRewrite = useApiProfilesStore((s) => s.setSelectedRewrite);

  const setSelected = channel === 'main' ? setSelectedMain
    : channel === 'mvu' ? setSelectedMvu
    : setSelectedRewrite;

  const items = collectAllProfileModels(profiles);

  return (
    <div style={rowStyle}>
      <span style={{ ...labelStyle, minWidth: 96 }}>{label}</span>
      {profiles.length === 0 ? (
        <span style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 'calc(10px * var(--system-ratio, 1))',
          color: 'var(--ink-faded)',
          letterSpacing: 1,
        }}>请先在「添加 API」处加入配置</span>
      ) : (
        <SearchableModelSelect
          items={items}
          selectedProfileId={selectedProfileId}
          selectedModel={selectedModel}
          onSelect={(profileId, modelName) => setSelected(profileId, modelName)}
        />
      )}
    </div>
  );
}
