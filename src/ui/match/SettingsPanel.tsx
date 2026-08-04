import { useState } from 'react';
import type { ProgressState } from '../../progression/index';
import type { LoadedImageRef } from '../../assets';
import { AssetIcon } from './AssetIcon';

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
        <section aria-label="게임 설정" className="settings-panel">
          <h2>게임 설정</h2>
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
      ) : null}
    </div>
  );
}
