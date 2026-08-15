import { type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ModalOverlayProps {
  readonly ariaLabel?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly onDismiss?: () => void;
  readonly role?: 'status';
  readonly testId?: string;
}

export function ModalOverlay({
  ariaLabel,
  children,
  className,
  onDismiss,
  role,
  testId,
}: ModalOverlayProps) {
  function handlePointerDown(event: MouseEvent<HTMLDivElement>): void {
    if (onDismiss !== undefined && event.target === event.currentTarget) onDismiss();
  }

  const overlay = (
    <div
      aria-label={ariaLabel}
      aria-live={role === 'status' ? 'assertive' : undefined}
      className={`modal-overlay${className === undefined ? '' : ` ${className}`}`}
      data-testid={testId}
      onMouseDown={handlePointerDown}
      role={role}
    >
      {children}
    </div>
  );

  if (typeof document === 'undefined') return overlay;
  const host = document.querySelector<HTMLElement>('[data-modal-root]');
  return host === null ? overlay : createPortal(overlay, host);
}
