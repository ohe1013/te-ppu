export type SoundCue =
  | 'move'
  | 'rotate'
  | 'land'
  | 'clear'
  | 'attack'
  | 'item'
  | 'win'
  | 'loss';

export interface AudioPort {
  unlock(): Promise<void>;
  play(cue: SoundCue): void;
  setEnabled(enabled: boolean): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  destroy(): Promise<void>;
}
