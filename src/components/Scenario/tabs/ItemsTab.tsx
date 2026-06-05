// 物品线索 tab — EntryListPane category='物品线索'
import type { ScenarioDoc } from '../../../types/scenario';
import { EntryListPane } from './EntryListPane';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
  onToast?: (msg: string) => void;
}

export function ItemsTab({ scn, onChange, onToast }: Props) {
  return <EntryListPane category="物品线索" scn={scn} onChange={onChange} onToast={onToast} />;
}
