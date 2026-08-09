import type { Texture } from 'pixi.js';

export const BATTLE_ANIMATIONS = {
  'move-dust': { frames: 4, fps: 20, loop: false, sourceSize: [64, 64], anchor: [.5, 1] },
  'rotate-spark': { frames: 5, fps: 24, loop: false, sourceSize: [64, 64], anchor: [.5, .5] },
  'land-impact': { frames: 5, fps: 24, loop: false, sourceSize: [128, 64], anchor: [.5, 1] },
  'line-clear': { frames: 6, fps: 30, loop: false, sourceSize: [640, 64], anchor: [.5, .5] },
  'attack-shot': { frames: 6, fps: 20, loop: true, sourceSize: [64, 64], anchor: [.5, .5] },
  'garbage-land': { frames: 5, fps: 24, loop: false, sourceSize: [128, 64], anchor: [.5, 1] },
  'item-acquire': { frames: 8, fps: 24, loop: false, sourceSize: [128, 128], anchor: [.5, .5] },
  'freeze-overlay': { frames: 8, fps: 12, loop: true, sourceSize: [64, 64], anchor: [0, 0] },
  'combo-pop': { frames: 6, fps: 24, loop: false, sourceSize: [256, 128], anchor: [.5, .5] },
} as const;

export type BattleAnimationGroup = keyof typeof BATTLE_ANIMATIONS;
export type BattleFrameName = `${BattleAnimationGroup}/${string}.png`;
export type BattleAtlasTextures = Readonly<Partial<Record<BattleFrameName, Texture>>>;

export const BATTLE_EFFECT_LIFETIMES = {
  'move-dust': { kind: 'animation' },
  'rotate-spark': { kind: 'animation' },
  'land-impact': { kind: 'animation' },
  'line-clear': { kind: 'animation' },
  'attack-shot': { kind: 'fixed', durationMs: 300 },
  'garbage-land': { kind: 'animation' },
  'item-acquire': { kind: 'animation' },
  'freeze-overlay': { kind: 'state', field: 'freezeTicks' },
  'combo-pop': { kind: 'animation' },
} as const;

const FRAME_NAMES: { readonly [Group in BattleAnimationGroup]: readonly BattleFrameName[] } =
  Object.fromEntries(
    Object.keys(BATTLE_ANIMATIONS).map((group) => [
      group,
      Array.from({ length: BATTLE_ANIMATIONS[group as BattleAnimationGroup].frames }, (_, index) => (
        `${group}/${String(index).padStart(2, '0')}.png`
      )),
    ]),
  ) as unknown as { readonly [Group in BattleAnimationGroup]: readonly BattleFrameName[] };

const resolvedFrames = new WeakMap<object, Map<BattleAnimationGroup, Texture[] | null>>();

export function battleAnimationFrameNames(group: BattleAnimationGroup): readonly BattleFrameName[] {
  return FRAME_NAMES[group];
}

export function battleAnimationDurationMs(group: BattleAnimationGroup): number {
  const animation = BATTLE_ANIMATIONS[group];
  return animation.frames / animation.fps * 1000;
}

export function resolveBattleAnimationFrames(
  atlas: BattleAtlasTextures | null | undefined,
  group: BattleAnimationGroup,
): Texture[] | null {
  if (atlas === null || atlas === undefined) return null;
  const cached = resolvedFrames.get(atlas);
  const resolved = cached?.get(group);
  if (resolved !== undefined) return resolved;
  const frames = battleAnimationFrameNames(group).map((name) => atlas[name]);
  const value = frames.every((frame): frame is Texture => frame !== undefined) ? frames : null;
  const groups = cached ?? new Map<BattleAnimationGroup, Texture[] | null>();
  groups.set(group, value);
  if (cached === undefined) resolvedFrames.set(atlas, groups);
  return value;
}
