export type SoundCue =
  | 'move'
  | 'rotate'
  | 'land'
  | 'clear'
  | 'attack'
  | 'item'
  | 'win'
  | 'loss';

export type MusicTrack =
  | 'tower'
  | 'early-floors'
  | 'late-floors'
  | 'demon-king'
  | 'ending';

export interface AudioPort {
  unlock(): Promise<void>;
  play(cue: SoundCue): void;
  setEnabled(enabled: boolean): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  destroy(): Promise<void>;
}
