import { ModalOverlay } from './ModalOverlay';

export interface ResumeCountdownProps {
  readonly count: number | null;
}

export function ResumeCountdown({ count }: ResumeCountdownProps) {
  if (count === null) return null;
  return (
    <ModalOverlay
      ariaLabel="게임 재개 카운트다운"
      role="status"
      testId="resume-countdown-overlay"
    >
      <div className="modal-overlay__surface resume-countdown">
        <span>{count}</span>
      </div>
    </ModalOverlay>
  );
}
