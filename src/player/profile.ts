import { PLAYER_CHARACTER_IDS, type PlayerCharacterId } from './catalog';

export const PLAYER_INITIALS_PATTERN = /^[A-Z]{3}$/;

export interface PlayerProfile {
  readonly initials: string;
  readonly characterId: PlayerCharacterId;
}

export function isPlayerCharacterId(value: unknown): value is PlayerCharacterId {
  return typeof value === 'string'
    && PLAYER_CHARACTER_IDS.includes(value as PlayerCharacterId);
}

export function isPlayerProfile(value: unknown): value is PlayerProfile {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === 2
    && 'initials' in value
    && typeof value.initials === 'string'
    && PLAYER_INITIALS_PATTERN.test(value.initials)
    && 'characterId' in value
    && isPlayerCharacterId(value.characterId);
}
