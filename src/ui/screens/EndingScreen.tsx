export interface EndingScreenProps {
  readonly onReturnToTower: () => void;
}

export function EndingScreen({ onReturnToTower }: EndingScreenProps) {
  return (
    <section className="screen-shell" data-testid="ending-screen">
      <p className="eyebrow">타워 정복</p>
      <h1>모든 층을 클리어했습니다</h1>
      <p>세 번의 대전을 완주했습니다. 언제든 다시 도전할 수 있습니다.</p>
      <button type="button" onClick={onReturnToTower}>타워로 돌아가기</button>
    </section>
  );
}
