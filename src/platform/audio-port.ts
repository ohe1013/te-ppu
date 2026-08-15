export type SoundCue =
  | 'move'
  | 'rotate'
  | 'land'
  | 'clear'
  | 'attack'
  | 'item'
  | 'win'
  | 'loss';

export type CueIntensity = 0 | 1 | 2 | 3;

export interface SoundPlaybackOptions {
  readonly intensity?: CueIntensity;
  readonly duckMusic?: boolean;
}

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

export interface AudioVolumes {
  readonly bgm: number;
  readonly sfx: number;
}

export interface AudioPort {
  unlock(): Promise<void>;
  play(cue: SoundCue, options?: SoundPlaybackOptions): void;
  setMusic(track: MusicTrack | null): Promise<void>;
  setVolumes(volumes: AudioVolumes): void;
  setEnabled(enabled: boolean): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  destroy(): Promise<void>;
}
