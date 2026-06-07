// 地点 tab — EntryListPane category='地点'
import type { ScenarioDoc } from '../../../types/scenario';
import { EntryListPane } from './EntryListPane';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
  onToast?: (msg: string) => void;
}

export function LocationsTab({ scn, onChange, onToast }: Props) {
  return <EntryListPane category="地点" scn={scn} onChange={onChange} onToast={onToast} />;
}
