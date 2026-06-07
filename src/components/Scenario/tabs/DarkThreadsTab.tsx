// 暗线 tab — EntryListPane category='暗线'
import type { ScenarioDoc } from '../../../types/scenario';
import { EntryListPane } from './EntryListPane';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
  onToast?: (msg: string) => void;
}

export function DarkThreadsTab({ scn, onChange, onToast }: Props) {
  return <EntryListPane category="暗线" scn={scn} onChange={onChange} onToast={onToast} />;
}
