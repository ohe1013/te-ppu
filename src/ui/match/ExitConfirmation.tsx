import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

export interface ExitConfirmationProps {
  readonly open: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => Promise<void>;
}

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function ExitConfirmation({
  onCancel,
  onConfirm,
  open,
}: ExitConfirmationProps) {
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
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
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
      await onConfirm();
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
    <div className="exit-confirmation__backdrop">
      <div
        aria-labelledby="exit-confirmation-title"
        aria-modal="true"
        className="exit-confirmation"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id="exit-confirmation-title">게임을 나갈까요?</h2>
        <p>현재 대전은 저장되지 않습니다.</p>
        {closeFailed ? (
          <p aria-live="polite" className="exit-confirmation__error" role="status">
            게임을 닫지 못했습니다. 다시 시도해 주세요.
          </p>
        ) : null}
        {closeSucceeded ? (
          <p aria-live="polite" role="status">게임을 닫는 중입니다.</p>
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
            게임 나가기 확인
          </button>
        </div>
      </div>
    </div>
  );
}
