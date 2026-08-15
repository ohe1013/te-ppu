export type SideId = 'player' | 'opponent';
export type PieceKind = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
export type Rotation = 0 | 1 | 2 | 3;
export type ItemType = 'row-clear' | 'freeze' | 'queue-swap';
export type SidePhase = 'countdown' | 'active' | 'lock' | 'clear-and-attack' | 'offset' | 'garbage-drop' | 'top-out' | 'game-over';
export type MatchStatus = 'countdown' | 'playing' | 'player-won' | 'opponent-won' | 'draw';

export const BOARD_WIDTH = 10;
export const HIDDEN_ROWS = 4;
export const VISIBLE_ROWS = 20;
export const BOARD_ROWS = 24;
export const GRAVITY_TICKS = 48;
export const SOFT_DROP_TICKS = 3;
export const LOCK_DELAY_TICKS = 30;
export const MAX_LOCK_RESETS = 15;
export const FREEZE_TICKS = 180;

export type ItemMarker = { readonly item: ItemType; readonly minoIndex: number };
export type Cell = { readonly kind: PieceKind; readonly marker?: ItemType; readonly garbage?: true };
export type Board = { readonly cells: readonly (Cell | null)[] };
export type PieceToken = { readonly serial: number; readonly kind: PieceKind; readonly marker: ItemMarker | null };
export type ActivePiece = { readonly token: PieceToken; readonly x: number; readonly y: number; readonly rotation: Rotation };
export type PositionedCell = Cell & { readonly x: number; readonly y: number };
export type Inventory = { readonly rowClear: number; readonly freeze: number; readonly queueSwap: number };
export type AppearedItems = Readonly<Record<ItemType, boolean>>;

export type SideState = {
  readonly board: Board;
  readonly active: ActivePiece | null;
  readonly next: readonly [PieceToken, PieceToken];
  readonly nextSerial: number;
  readonly appeared: AppearedItems;
  readonly inventory: Inventory;
  readonly combo: number;
  readonly incoming: number;
  readonly garbageDrawIndex: number;
  readonly freezeTicks: number;
  readonly phase: SidePhase;
  readonly topOut: boolean;
  readonly gravityTicks: number;
  readonly softDropActive: boolean;
  readonly softDropTicks: number;
  readonly lockTicks: number;
  readonly lockResets: number;
};

export type MatchConfig = { readonly matchSeed: number; readonly countdownTicks?: number };
export type MatchState = {
  readonly tick: number;
  readonly matchSeed: number;
  readonly countdownTicks: number;
  readonly status: MatchStatus;
  readonly sides: Readonly<Record<SideId, SideState>>;
};

export type GameCommand =
  | { readonly type: 'move'; readonly dx: -1 | 1 }
  | { readonly type: 'rotate-clockwise' }
  | { readonly type: 'soft-drop'; readonly active: boolean }
  | { readonly type: 'hard-drop' }
  | { readonly type: 'use-row-clear'; readonly row: number }
  | { readonly type: 'use-freeze' }
  | { readonly type: 'use-queue-swap' };
export type TimedCommand = { readonly tick: number; readonly side: SideId; readonly command: GameCommand };

export type GameEvent = {
  readonly type: 'piece-locked' | 'lines-cleared' | 'attack-sent' | 'garbage-landed' | 'item-acquired' | 'item-used' | 'freeze-applied' | 'top-out' | 'match-ended';
  readonly side: SideId;
  readonly amount?: number;
  readonly item?: ItemType;
  readonly row?: number;
  readonly rows?: readonly number[];
  readonly column?: number;
  readonly landingRow?: number;
};
export type MatchStep = { readonly state: MatchState; readonly events: readonly GameEvent[] };

export type PublicPieceToken = { readonly kind: PieceKind; readonly marker: ItemMarker | null };
export type PublicActivePiece = { readonly token: PublicPieceToken; readonly x: number; readonly y: number; readonly rotation: Rotation };
export type PublicSideView = {
  readonly board: readonly (Cell | null)[];
  readonly active: PublicActivePiece | null;
  readonly ghostY: number | null;
  readonly next: readonly [PublicPieceToken, PublicPieceToken];
  readonly combo: number;
  readonly incoming: number;
  readonly inventory: Inventory;
  readonly freezeTicks: number;
  readonly phase: SidePhase;
  readonly topOut: boolean;
};
export type PublicMatchView = { readonly tick: number; readonly status: MatchStatus; readonly sides: Readonly<Record<SideId, PublicSideView>> };
export type AiOpponentView = Omit<PublicSideView, 'next' | 'ghostY'>;
export type AiObservation = { readonly tick: number; readonly status: MatchStatus; readonly self: PublicSideView; readonly opponent: AiOpponentView };
