import type { BootState } from '../../app/use-boot';

export interface BootScreenProps {
  readonly state: BootState;
}

export function BootScreen({ state }: BootScreenProps) {
  return (
    <section className="screen-shell" data-testid="boot-screen" aria-busy={state.status === 'loading'}>
      <p className="eyebrow">탑 블록 대전</p>
      {state.status === 'loading' && <p role="status">게임을 준비하고 있습니다…</p>}
      {state.status === 'ready' && <p role="status">탑을 불러왔습니다…</p>}
      {state.status === 'blocked' && (
        <div role="alert">
          <h1>게임을 시작할 수 없습니다</h1>
          <p>{state.message}</p>
        </div>
      )}
      {state.status === 'retryable-error' && (
        <div role="alert">
          <h1>연결을 확인해 주세요</h1>
          <p>{state.message}</p>
          <button type="button" onClick={state.retry}>다시 시도</button>
        </div>
      )}
    </section>
  );
}
