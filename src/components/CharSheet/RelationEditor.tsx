import type { ScenarioDoc } from '../../types/scenario';
import type { ScenarioRelation } from '../../types/scenario';

export interface RelationEditorProps {
  scenarioDoc: ScenarioDoc;
  currentCharId: string;
  relations: ScenarioRelation[];
  presentAtStart: string[];
  lockedNpcsDisabled?: boolean;
  onChange: (relations: ScenarioRelation[], presentAtStart: string[]) => void;
}

export function RelationEditor(_props: RelationEditorProps) {
  return null;
}
