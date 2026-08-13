import {
  useEffect,
  useRef,
  type KeyboardEvent,
} from 'react';
import type { LoadedImageRef } from '../../assets';
import { AssetIcon } from './AssetIcon';
import { ModalOverlay } from './ModalOverlay';

export interface BattleAbandonConfirmationProps {
  readonly icon?: LoadedImageRef;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
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

export function BattleAbandonConfirmation({
  icon,
  onCancel,
  onConfirm,
  open,
}: BattleAbandonConfirmationProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (open) return;
    confirmedRef.current = false;
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
    if (event.key === 'Escape') {
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

  function confirm(): void {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    onConfirm();
  }

  return (
    <ModalOverlay className="modal-overlay--exit">
      <div
        aria-describedby="battle-abandon-confirmation-description"
        aria-labelledby="battle-abandon-confirmation-title"
        aria-modal="true"
        className="modal-overlay__surface exit-confirmation battle-abandon-confirmation"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id="battle-abandon-confirmation-title">현재 전투를 포기할까요?</h2>
        <p>타워로 돌아갑니다.</p>
        <p id="battle-abandon-confirmation-description">
          이번 상대와 싸우며 얻은 점수와 전투 진행은 사라집니다.
        </p>
        <div className="exit-confirmation__actions">
          <button onClick={onCancel} type="button">
            계속하기
          </button>
          <button
            aria-label="타워로 나가기 확인"
            onClick={confirm}
            type="button"
          >
            <AssetIcon className="asset-icon" fallback="↩" image={icon} />
            타워로 나가기
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
