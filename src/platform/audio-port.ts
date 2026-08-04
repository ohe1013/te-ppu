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

export interface AudioSourceRef {
  readonly url: string;
  readonly generation: number;
}

export interface AudioSourceCatalog {
  readonly sfx: Readonly<Record<SoundCue, AudioSourceRef>>;
  readonly bgm: Readonly<Record<MusicTrack, AudioSourceRef>>;
}

export interface AudioPort {
  unlock(): Promise<void>;
  play(cue: SoundCue): void;
  setMusic(track: MusicTrack | null): Promise<void>;
  setEnabled(enabled: boolean): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  destroy(): Promise<void>;
}
