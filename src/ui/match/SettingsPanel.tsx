import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { ProgressState } from '../../progression/index';
import type { LoadedImageRef } from '../../assets';
import { AssetIcon } from './AssetIcon';
import { ModalOverlay } from './ModalOverlay';

export interface SettingsPanelProps {
  readonly settings: ProgressState['settings'];
  readonly saveFailed: boolean;
  readonly onSettingsChange: (
    settings: Partial<ProgressState['settings']>,
  ) => Promise<boolean>;
  readonly onRetrySave: () => Promise<boolean>;
  readonly onSoundEnabled?: (enabled: boolean) => void;
  readonly icons?: {
    readonly settings?: LoadedImageRef;
    readonly soundOn?: LoadedImageRef;
    readonly soundOff?: LoadedImageRef;
    readonly hapticsOn?: LoadedImageRef;
    readonly hapticsOff?: LoadedImageRef;
  };
}

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const SETTINGS_TITLE_ID = 'settings-panel-title';

export function SettingsPanel({
  onRetrySave,
  onSettingsChange,
  onSoundEnabled,
  icons,
  saveFailed,
  settings,
}: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localFailure, setLocalFailure] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => previouslyFocused?.focus();
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape' && !saving) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []),
    ];
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function update(next: Partial<ProgressState['settings']>): Promise<void> {
    setSaving(true);
    setLocalFailure(false);
    try {
      setLocalFailure(!await onSettingsChange(next));
    } catch {
      setLocalFailure(true);
    } finally {
      setSaving(false);
    }
  }

  async function retrySave(): Promise<void> {
    setSaving(true);
    try {
      setLocalFailure(!await onRetrySave());
    } catch {
      setLocalFailure(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-control">
      <button
        aria-expanded={open}
        className="match-header__button"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <AssetIcon className="asset-icon" fallback="⚙" image={icons?.settings} />
        설정
      </button>
      {open ? (
        <ModalOverlay onDismiss={() => setOpen(false)} testId="settings-overlay">
          <section
            aria-labelledby={SETTINGS_TITLE_ID}
            aria-modal="true"
            className="modal-overlay__surface settings-panel"
            onKeyDown={handleKeyDown}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="settings-panel__header">
              <h2 id={SETTINGS_TITLE_ID}>게임 설정</h2>
              <button
                aria-label="설정 닫기"
                className="settings-panel__close"
                disabled={saving}
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <label>
              <input
                checked={settings.soundEnabled}
                disabled={saving}
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;
                  onSoundEnabled?.(enabled);
                  void update({ soundEnabled: enabled });
                }}
                type="checkbox"
              />
              <AssetIcon
                className="asset-icon"
                fallback={settings.soundEnabled ? '🔊' : '🔇'}
                image={settings.soundEnabled ? icons?.soundOn : icons?.soundOff}
              />
              효과음
            </label>
            <label>
              <input
                checked={settings.hapticsEnabled}
                disabled={saving}
                onChange={(event) => void update({
                  hapticsEnabled: event.currentTarget.checked,
                })}
                type="checkbox"
              />
              <AssetIcon
                className="asset-icon"
                fallback={settings.hapticsEnabled ? '◉' : '○'}
                image={settings.hapticsEnabled ? icons?.hapticsOn : icons?.hapticsOff}
              />
              진동
            </label>
            {saving ? <p aria-live="polite" role="status">설정 저장 중</p> : null}
            {saveFailed || localFailure ? (
              <div className="settings-panel__save-error">
                <p aria-live="polite" role="status">설정은 적용됐지만 저장하지 못했습니다.</p>
                <button
                  disabled={saving}
                  onClick={() => void retrySave()}
                  type="button"
                >
                  설정 저장 다시 시도
                </button>
              </div>
            ) : null}
          </section>
        </ModalOverlay>
      ) : null}
    </div>
  );
}
