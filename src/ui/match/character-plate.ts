import type { CharacterId } from '../../assets';
import type { PublicSideView, SideId } from '../../core';
import type { PortraitPresentation } from './portrait-state';

export interface CharacterPlateCharacter {
  readonly id: CharacterId;
  readonly name: string;
  readonly title: string;
}

export interface CharacterPlateModel {
  readonly side: SideId;
  readonly characterId: CharacterId;
  readonly name: string;
  readonly title: string;
  readonly portrait: PortraitPresentation;
  readonly danger: boolean;
}

export function createCharacterPlateModel(
  character: CharacterPlateCharacter,
  side: SideId,
  portrait: PortraitPresentation,
  model: PublicSideView,
): CharacterPlateModel {
  return {
    side,
    characterId: character.id,
    name: character.name,
    title: character.title,
    portrait,
    danger: model.incoming > 0 || model.topOut,
  };
}
