// 秘密与解锁 tab — EntryListPane category='秘密与解锁'
import type { ScenarioDoc } from '../../../types/scenario';
import { EntryListPane } from './EntryListPane';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
  onToast?: (msg: string) => void;
}

export function SecretsTab({ scn, onChange, onToast }: Props) {
  return <EntryListPane category="秘密与解锁" scn={scn} onChange={onChange} onToast={onToast} />;
}
