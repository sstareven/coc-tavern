/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CharacterCreator } from './CharacterCreator';
import { useScenarioStore } from '../../stores/useScenarioStore';
import { useCharacterPresetsStore } from '../../stores/useCharacterPresetsStore';

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => true,
  readMobile: () => true,
}));

describe('CharacterCreator mobile layout', () => {
  beforeEach(() => {
    // Reset scenario store to empty initial state — avoid undefined scenario errors
    useScenarioStore.setState({
      builtins: [],
      userScenarios: [],
      activeId: null,
      lastPicked: null,
      forkMap: {},
    });
    // Reset character presets to empty
    useCharacterPresetsStore.setState({ presets: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders all 7 step indicators on mobile', () => {
    render(<CharacterCreator onComplete={() => {}} onClose={() => {}} />);

    // All 7 step buttons display their 1-based numbers at step 0
    for (let i = 1; i <= 7; i++) {
      expect(screen.getByText(String(i)), `Step ${i} button`).toBeInTheDocument();
    }

    // Find the step container to check for clipping conditions
    const firstBtn = screen.getByText('1');
    const stepContainer = firstBtn.parentElement?.parentElement;
    expect(stepContainer, 'Step indicator container').toBeTruthy();

    // Walk up from step container to find an ancestor with overflow:hidden (the modal)
    let ancestor = stepContainer?.parentElement ?? null;
    let hasOverflowHidden = false;
    while (ancestor && ancestor !== document.body) {
      if ((ancestor as HTMLElement).style.overflow === 'hidden') {
        hasOverflowHidden = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }

    // Bug detection: on mobile the modal has overflow:hidden AND step indicators
    // use flexWrap:wrap. This causes steps 6-7 to wrap to a new row which gets
    // clipped by the modal's overflow:hidden — making them invisible.
    // Assert that if overflow:hidden exists, the step indicators must NOT wrap.
    if (hasOverflowHidden) {
      expect(stepContainer!.style.flexWrap, 'Step container must not wrap under overflow:hidden').not.toBe('wrap');
    }
  });

  it('step 0 shows a functional return button', () => {
    const onClose = vi.fn();
    render(<CharacterCreator onComplete={() => {}} onClose={onClose} />);

    // At step 0 the footer should show a "返回" button (not "上一步")
    // that is enabled and triggers onClose when clicked
    const returnBtn = screen.getByRole('button', { name: /返回/ });
    expect(returnBtn, 'Return button should not be disabled').not.toBeDisabled();

    fireEvent.click(returnBtn);
    expect(onClose, 'Clicking return should call onClose').toHaveBeenCalledTimes(1);
  });
});
