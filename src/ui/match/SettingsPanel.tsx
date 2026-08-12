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
  readonly onSfxPreview: () => void;
  readonly onSoundEnabled?: (enabled: boolean) => void;
  readonly onVolumePreview: (
    settings: Pick<ProgressState['settings'], 'bgmVolume' | 'sfxVolume'>,
  ) => void;
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
const BGM_VOLUME_ID = 'settings-bgm-volume';
const SFX_VOLUME_ID = 'settings-sfx-volume';

type VolumeSetting = 'bgmVolume' | 'sfxVolume';

export function SettingsPanel({
  onRetrySave,
  onSettingsChange,
  onSfxPreview,
  onSoundEnabled,
  onVolumePreview,
  icons,
  saveFailed,
  settings,
}: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localFailure, setLocalFailure] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(settings.bgmVolume);
  const [sfxVolume, setSfxVolume] = useState(settings.sfxVolume);
  const dialogRef = useRef<HTMLElement>(null);
  const bgmVolumeRef = useRef(settings.bgmVolume);
  const sfxVolumeRef = useRef(settings.sfxVolume);
  const committedBgmRef = useRef(settings.bgmVolume);
  const committedSfxRef = useRef(settings.sfxVolume);
  const activeDragRef = useRef<VolumeSetting | null>(null);
  const pendingSavesRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (activeDragRef.current === 'bgmVolume') return;
    setBgmVolume(settings.bgmVolume);
    bgmVolumeRef.current = settings.bgmVolume;
    committedBgmRef.current = settings.bgmVolume;
  }, [settings.bgmVolume]);

  useEffect(() => {
    if (activeDragRef.current === 'sfxVolume') return;
    setSfxVolume(settings.sfxVolume);
    sfxVolumeRef.current = settings.sfxVolume;
    committedSfxRef.current = settings.sfxVolume;
  }, [settings.sfxVolume]);

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
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSettings();
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

  function enqueueSave(operation: () => Promise<boolean>): void {
    pendingSavesRef.current += 1;
    setSaving(true);
    setLocalFailure(false);
    const next = saveQueueRef.current.then(async () => {
      try {
        setLocalFailure(!await operation());
      } catch {
        setLocalFailure(true);
      } finally {
        pendingSavesRef.current -= 1;
        if (pendingSavesRef.current === 0) setSaving(false);
      }
    });
    saveQueueRef.current = next;
  }

  function update(next: Partial<ProgressState['settings']>): void {
    enqueueSave(() => onSettingsChange(next));
  }

  function retrySave(): void {
    enqueueSave(onRetrySave);
  }

  function finalizeVolume(setting: VolumeSetting): void {
    const value = setting === 'bgmVolume' ? bgmVolumeRef.current : sfxVolumeRef.current;
    const committed = setting === 'bgmVolume' ? committedBgmRef : committedSfxRef;
    if (value === committed.current) return;
    committed.current = value;
    if (setting === 'sfxVolume' && settings.soundEnabled) onSfxPreview();
    update({ [setting]: value });
  }

  function finishVolumeInteraction(setting: VolumeSetting): void {
    if (activeDragRef.current === setting) activeDragRef.current = null;
    finalizeVolume(setting);
  }

  function closeSettings(): void {
    activeDragRef.current = null;
    finalizeVolume('bgmVolume');
    finalizeVolume('sfxVolume');
    setOpen(false);
  }

  function changeVolume(setting: VolumeSetting, value: number): void {
    if (!settings.soundEnabled) return;
    if (setting === 'bgmVolume') {
      bgmVolumeRef.current = value;
      setBgmVolume(value);
    } else {
      sfxVolumeRef.current = value;
      setSfxVolume(value);
    }
    onVolumePreview({
      bgmVolume: bgmVolumeRef.current,
      sfxVolume: sfxVolumeRef.current,
    });
  }

  return (
    <div className="settings-control">
      <button
        aria-expanded={open}
        className="match-header__button"
        onClick={() => {
          if (open) closeSettings();
          else setOpen(true);
        }}
        type="button"
      >
        <AssetIcon className="asset-icon" fallback="⚙" image={icons?.settings} />
        설정
      </button>
      {open ? (
        <ModalOverlay onDismiss={closeSettings} testId="settings-overlay">
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
                onClick={closeSettings}
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
                  update({ soundEnabled: enabled });
                }}
                type="checkbox"
              />
              <AssetIcon
                className="asset-icon"
                fallback={settings.soundEnabled ? '🔊' : '🔇'}
                image={settings.soundEnabled ? icons?.soundOn : icons?.soundOff}
              />
              전체 소리
            </label>
            <div className="settings-panel__volume">
              <label htmlFor={BGM_VOLUME_ID}>BGM 음량</label>
              <output htmlFor={BGM_VOLUME_ID}>{bgmVolume}%</output>
              <input
                aria-label="BGM 음량"
                className="settings-panel__range"
                disabled={!settings.soundEnabled}
                id={BGM_VOLUME_ID}
                max={100}
                min={0}
                onBlur={() => finishVolumeInteraction('bgmVolume')}
                onChange={(event) => changeVolume(
                  'bgmVolume',
                  Number(event.currentTarget.value),
                )}
                onKeyUp={() => finishVolumeInteraction('bgmVolume')}
                onPointerDown={() => {
                  activeDragRef.current = 'bgmVolume';
                }}
                onPointerUp={() => finishVolumeInteraction('bgmVolume')}
                step={10}
                type="range"
                value={bgmVolume}
              />
            </div>
            <div className="settings-panel__volume">
              <label htmlFor={SFX_VOLUME_ID}>효과음 음량</label>
              <output htmlFor={SFX_VOLUME_ID}>{sfxVolume}%</output>
              <input
                aria-label="효과음 음량"
                className="settings-panel__range"
                disabled={!settings.soundEnabled}
                id={SFX_VOLUME_ID}
                max={100}
                min={0}
                onBlur={() => finishVolumeInteraction('sfxVolume')}
                onChange={(event) => changeVolume(
                  'sfxVolume',
                  Number(event.currentTarget.value),
                )}
                onKeyUp={() => finishVolumeInteraction('sfxVolume')}
                onPointerDown={() => {
                  activeDragRef.current = 'sfxVolume';
                }}
                onPointerUp={() => finishVolumeInteraction('sfxVolume')}
                step={10}
                type="range"
                value={sfxVolume}
              />
            </div>
            <label>
              <input
                checked={settings.hapticsEnabled}
                disabled={saving}
                onChange={(event) => update({
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
                  onClick={retrySave}
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
