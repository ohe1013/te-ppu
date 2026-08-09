export interface ResumeCountdownProps {
  readonly count: number | null;
}

export function ResumeCountdown({ count }: ResumeCountdownProps) {
  if (count === null) return null;
  return (
    <div
      aria-label="게임 재개 카운트다운"
      aria-live="assertive"
      className="resume-countdown"
      role="status"
    >
      <span>{count}</span>
    </div>
  );
}
