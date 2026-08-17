import type { ItemType, PieceKind, PublicSideView, SideId } from '../../core/index';
import type { LoadedImageRef } from '../../assets';
import type { CSSProperties } from 'react';
import { AssetImage } from './AssetImage';
import {
  createCharacterPlateModel,
  type CharacterPlateCharacter,
} from './character-plate';
import type { AttackFeedbackPresentation } from './attack-feedback';
import { PiecePreview } from './piece-preview';
import type { PortraitPresentation } from './portrait-state';

export interface BattleHudProps {
  readonly character: CharacterPlateCharacter;
  readonly feedback?: AttackFeedbackPresentation | null;
  readonly model: PublicSideView;
  readonly portrait?: PortraitPresentation;
  readonly side: SideId;
  readonly tiles?: Partial<Record<PieceKind, LoadedImageRef>>;
  readonly items?: Partial<Record<ItemType, LoadedImageRef>>;
}

const ITEM_LABELS: Readonly<Record<ItemType, string>> = {
  'row-clear': '행 제거',
  freeze: '빙결',
  'queue-swap': '교체',
};

type BattleHudFeedbackStyle = CSSProperties & {
  readonly '--battle-hud-feedback-offset-x': string;
  readonly '--battle-hud-feedback-outline-opacity': string;
};

function roundedFrameValue(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function feedbackStyleFor(
  feedback: AttackFeedbackPresentation | null,
  side: SideId,
): BattleHudFeedbackStyle | undefined {
  if (feedback === null) return undefined;

  const progress = Math.min(1, Math.max(0, feedback.phaseProgress));
  const isSourceLaunch = feedback.phase === 'launch' && feedback.source === side;
  const isTargetImpact = feedback.phase === 'impact' && feedback.target === side;
  let offsetX = 0;

  if (!feedback.reducedMotion && isSourceLaunch) {
    const direction = side === 'player' ? 1 : -1;
    offsetX = Math.min(feedback.displacementPx, 2) * progress * direction;
  } else if (!feedback.reducedMotion && isTargetImpact) {
    const direction = side === 'player' ? -1 : 1;
    const dampedFrame = Math.sin(progress * Math.PI * 2) * (1 - progress);
    offsetX = feedback.displacementPx * dampedFrame * direction;
  }

  const outlineOpacity = isTargetImpact ? Math.sin(progress * Math.PI) : 0;
  return {
    '--battle-hud-feedback-offset-x': `${roundedFrameValue(offsetX)}px`,
    '--battle-hud-feedback-outline-opacity': `${roundedFrameValue(outlineOpacity)}`,
  };
}

export function BattleHud({
  character,
  feedback = null,
  items,
  model,
  portrait,
  side,
  tiles,
}: BattleHudProps) {
  const presentation = portrait ?? {
    alt: `${character.name} 기본 표정`,
    state: 'idle' as const,
  };
  const plate = createCharacterPlateModel(character, side, presentation, model);
  const attackRole = feedback === null
    ? undefined
    : feedback.source === side ? 'source' : 'target';
  const feedbackStyle = feedbackStyleFor(feedback, side);
  return (
    <section
      aria-label={`${character.name} 대전 상태`}
      className="battle-hud"
      data-attack-phase={feedback?.phase}
      data-attack-role={attackRole}
      data-character-id={plate.characterId}
      data-danger={plate.danger ? 'true' : 'false'}
      data-impact-intensity={feedback?.intensity}
      data-reduced-motion={feedback?.reducedMotion ? 'true' : 'false'}
      data-side={side}
      role="region"
      style={feedbackStyle}
    >
      {feedback?.source === side && feedback.comboLabel !== null ? (
        <output className="battle-hud__combo-pop" key={feedback.id}>
          {feedback.comboLabel}!
        </output>
      ) : null}
      <header className="battle-hud__header">
        <span
          className="battle-hud__portrait battle-hud__portrait--plate"
          data-portrait-state={presentation.state}
        >
          <AssetImage alt={`${character.name} 기본 표정`} url={presentation.url} />
        </span>
        <div className="battle-hud__character-copy">
          <h2>{plate.name}</h2>
          <p>{plate.title}</p>
        </div>
        <span className="battle-hud__danger" data-testid={`${side}-top-out`}>
          {plate.danger ? '위험' : '준비'}
        </span>
      </header>

      <div className="battle-hud__next-heading">다음 블록</div>
      <ol
        aria-label={`${plate.name} 다음 블록`}
        className="battle-hud__next"
        data-testid={`${side}-next`}
      >
        {model.next.slice(0, 2).map((piece, index) => (
          <li
            data-item={piece.marker?.item ?? 'none'}
            data-kind={piece.kind}
            key={`${piece.kind}-${index}`}
          >
            <PiecePreview image={tiles?.[piece.kind]} kind={piece.kind} />
          </li>
        ))}
      </ol>

      <div aria-label={`${plate.name} 아이템`} className="battle-hud__item-ribbon">
        {(Object.keys(ITEM_LABELS) as ItemType[]).map((item) => {
          const count = item === 'row-clear'
            ? model.inventory.rowClear
            : item === 'freeze' ? model.inventory.freeze : model.inventory.queueSwap;
          return (
            <span
              className="battle-hud__item-slot"
              data-item={item}
              data-item-state={count > 0 ? 'ready' : 'empty'}
              key={item}
            >
              <AssetImage
                alt={`${ITEM_LABELS[item]} 아이템`}
                className="battle-hud__item-image"
                url={items?.[item]?.url}
              />
              <span className="battle-hud__item-label">{ITEM_LABELS[item]}</span>
            </span>
          );
        })}
      </div>

      <dl aria-hidden="true" className="battle-hud__stats">
        <div><dt>Combo</dt><dd data-testid={`${side}-combo`}>{model.combo}</dd></div>
        <div><dt>Incoming</dt><dd data-testid={`${side}-incoming`}>{model.incoming}</dd></div>
        <div><dt>Row</dt><dd data-testid={`${side}-row-clear`}>{model.inventory.rowClear}</dd></div>
        <div><dt>Freeze</dt><dd data-testid={`${side}-freeze`}>{model.inventory.freeze}</dd></div>
        <div><dt>Swap</dt><dd data-testid={`${side}-queue-swap`}>{model.inventory.queueSwap}</dd></div>
        <div><dt>Frozen</dt><dd data-testid={`${side}-freeze-ticks`}>{model.freezeTicks}</dd></div>
        <div><dt>Phase</dt><dd data-testid={`${side}-phase`}>{model.phase}</dd></div>
      </dl>
    </section>
  );
}
