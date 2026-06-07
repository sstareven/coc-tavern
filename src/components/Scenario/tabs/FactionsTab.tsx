// 势力 tab — EntryListPane category='势力'
import type { ScenarioDoc } from '../../../types/scenario';
import { EntryListPane } from './EntryListPane';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
  onToast?: (msg: string) => void;
}

export function FactionsTab({ scn, onChange, onToast }: Props) {
  return <EntryListPane category="势力" scn={scn} onChange={onChange} onToast={onToast} />;
}
