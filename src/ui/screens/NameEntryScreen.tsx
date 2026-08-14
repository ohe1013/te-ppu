import { useState, type KeyboardEvent } from 'react';
import type { LoadedImageRef } from '../../assets';
import { ArcadeDirectionPad } from '../arcade/ArcadeDirectionPad';
import {
  NAME_KEY_ROWS,
  moveNameKey,
  type ArcadeDirection,
  type NameKey,
} from '../arcade/grid-navigation';
import { ScreenBackdrop } from './ScreenBackdrop';

export interface NameEntryScreenProps {
  readonly initialValue: string;
  readonly onComplete: (initials: string) => void;
  readonly onBack: () => void;
  readonly backdrop?: LoadedImageRef;
}

function normalizeInitials(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

export function NameEntryScreen({
  backdrop,
  initialValue,
  onBack,
  onComplete,
}: NameEntryScreenProps) {
  const [draft, setDraft] = useState(() => normalizeInitials(initialValue));
  const [focusedKey, setFocusedKey] = useState<NameKey>('A');

  const activateKey = (key: NameKey) => {
    if (key === 'DEL') {
      setDraft((value) => value.slice(0, -1));
      return;
    }
    setDraft((value) => value.length < 3 ? `${value}${key}` : value);
  };

  const completeDraft = () => {
    if (draft.length === 3) onComplete(draft);
  };

  const moveFocus = (direction: ArcadeDirection) => {
    setFocusedKey((key) => moveNameKey(key, direction));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const directions: Partial<Record<string, ArcadeDirection>> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    const direction = directions[event.key];
    if (direction !== undefined) {
      event.preventDefault();
      moveFocus(direction);
      return;
    }
    if (event.key === 'Enter') {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      activateKey(focusedKey);
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      setDraft((value) => value.slice(0, -1));
    }
  };

  return (
    <section
      autoFocus
      className="screen-shell onboarding-screen name-entry-screen"
      data-focused-key={focusedKey}
      data-testid="name-entry-screen"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <ScreenBackdrop image={backdrop} />
      <button className="secondary-button name-entry-screen__back" onClick={onBack} type="button">
        BACK
      </button>
      <header className="onboarding-screen__header">
        <p className="eyebrow">PLAYER REGISTRATION</p>
        <h1>이니셜 입력</h1>
        <p>영문 대문자 세 글자를 선택하세요.</p>
      </header>
      <output aria-label="입력한 이니셜" className="name-entry-screen__draft" role="status">
        {draft.padEnd(3, '_')}
      </output>
      <div aria-label="이니셜 키보드" className="name-keyboard" role="group">
        {NAME_KEY_ROWS.map((row, rowIndex) => (
          <div
            aria-label={`${rowIndex + 1}번째 키보드 줄`}
            className="name-keyboard__row"
            key={`name-key-row-${rowIndex}`}
            role="group"
          >
            {row.map(({ columnEnd, columnStart, key }) => (
              <button
                aria-pressed={focusedKey === key}
                className="name-keyboard__key"
                key={key}
                onClick={() => {
                  setFocusedKey(key);
                  activateKey(key);
                }}
                style={{ gridColumn: `${columnStart + 1} / ${columnEnd + 2}` }}
                type="button"
              >
                {key}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="onboarding-controls name-entry-screen__controls">
        <ArcadeDirectionPad onDirection={moveFocus} />
        <div aria-label="이니셜 동작" className="name-entry-screen__actions" role="group">
          <button
            className="name-entry-screen__select"
            onClick={() => activateKey(focusedKey)}
            type="button"
          >
            선택
          </button>
          <button
            className="name-entry-screen__end"
            disabled={draft.length !== 3}
            onClick={completeDraft}
            type="button"
          >
            END
          </button>
        </div>
      </div>
    </section>
  );
}
