import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { LoadedImageRef } from '../../assets';
import { closeWithTimeout } from '../../platform/close-with-timeout';
import { AssetIcon } from './AssetIcon';
import { ModalOverlay } from './ModalOverlay';

export interface AppExitConfirmationProps {
  readonly description: string;
  readonly icon?: LoadedImageRef;
  readonly onCancel: () => void;
  readonly onConfirm: () => Promise<void>;
  readonly open: boolean;
}

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function AppExitConfirmation({
  description,
  icon,
  onCancel,
  onConfirm,
  open,
}: AppExitConfirmationProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmPendingRef = useRef(false);
  const closeSucceededRef = useRef(false);
  const [confirmPending, setConfirmPending] = useState(false);
  const [closeSucceeded, setCloseSucceeded] = useState(false);
  const [closeFailed, setCloseFailed] = useState(false);

  useEffect(() => {
    if (open) return;
    confirmPendingRef.current = false;
    closeSucceededRef.current = false;
    setConfirmPending(false);
    setCloseSucceeded(false);
    setCloseFailed(false);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => previouslyFocused?.focus();
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (
      event.key === 'Escape'
      && !confirmPendingRef.current
      && !closeSucceededRef.current
    ) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
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

  async function confirm(): Promise<void> {
    if (confirmPendingRef.current || closeSucceededRef.current) return;
    confirmPendingRef.current = true;
    setConfirmPending(true);
    setCloseFailed(false);
    try {
      await closeWithTimeout(onConfirm);
      closeSucceededRef.current = true;
      setCloseSucceeded(true);
    } catch {
      setCloseFailed(true);
    } finally {
      confirmPendingRef.current = false;
      setConfirmPending(false);
    }
  }

  return (
    <ModalOverlay className="modal-overlay--exit">
      <div
        aria-describedby="app-exit-confirmation-description"
        aria-labelledby="app-exit-confirmation-title"
        aria-modal="true"
        className="modal-overlay__surface exit-confirmation app-exit-confirmation"
        data-close-state={
          closeSucceeded || confirmPending ? 'closing' : closeFailed ? 'failed' : 'idle'
        }
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id="app-exit-confirmation-title">게임을 종료할까요?</h2>
        <p id="app-exit-confirmation-description">{description}</p>
        {closeFailed ? (
          <p aria-live="polite" className="exit-confirmation__error" role="status">
            게임을 종료하지 못했습니다. 다시 시도해 주세요.
          </p>
        ) : null}
        {closeSucceeded ? (
          <p aria-live="polite" role="status">게임을 종료하는 중입니다.</p>
        ) : null}
        <div className="exit-confirmation__actions">
          <button
            disabled={confirmPending || closeSucceeded}
            onClick={onCancel}
            type="button"
          >
            계속하기
          </button>
          <button
            disabled={confirmPending || closeSucceeded}
            onClick={() => void confirm()}
            type="button"
          >
            <AssetIcon className="asset-icon" fallback="↩" image={icon} />
            게임 종료 확인
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
