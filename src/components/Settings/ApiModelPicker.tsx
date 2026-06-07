// src/components/Settings/ApiModelPicker.tsx —— 三套调用站点(主/MVU/补写)选 profile+模型的薄封装
// 设计:把 SearchableModelSelect 跟 useApiProfilesStore 的 channel-specific selector 黏合,
// SettingsPanel 三处直接 <ApiModelPicker channel="main" /> 一行接入,无需手动 wire 选择 state。

import { useApiProfilesStore } from '../../stores/useApiProfilesStore';
import { collectAllProfileModels } from '../../api/api-models-engine';
import { SearchableModelSelect } from './SearchableModelSelect';

interface Props {
  channel: 'main' | 'mvu' | 'rewrite';
}

export function ApiModelPicker({ channel }: Props) {
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
    <SearchableModelSelect
      items={items}
      selectedProfileId={selectedProfileId}
      selectedModel={selectedModel}
      onSelect={(profileId, modelName) => setSelected(profileId, modelName)}
    />
  );
}
