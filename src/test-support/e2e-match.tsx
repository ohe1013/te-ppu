import { useCallback, useEffect, useMemo } from 'react';
import type { MatchRouteViewProps } from '../app/AppRoot';
import {
  useMatchLoop,
  type MatchLoopView,
  type UseMatchLoopOptions,
} from '../app/use-match-loop';
import { BOARD_WIDTH, type PublicMatchView } from '../core/index';
import {
  MatchScreen,
  type MatchLoopHook,
} from '../ui/screens/MatchScreen';
import type { E2EDriverController } from './e2e-driver';

const FIXTURE_ROW = 19;

function withRowSelectionFixture(view: PublicMatchView): PublicMatchView {
  const board = [...view.sides.player.board];
  board[FIXTURE_ROW * BOARD_WIDTH] = { kind: 'I' };
  return {
    ...view,
    sides: {
      ...view.sides,
      player: {
        ...view.sides.player,
        board,
        inventory: {
          ...view.sides.player.inventory,
          rowClear: 1,
        },
      },
    },
  };
}

function createE2EMatchLoopHook(
  controller: E2EDriverController,
): MatchLoopHook {
  return function useE2EMatchLoop(
    options: UseMatchLoopOptions,
  ): MatchLoopView {
    const loop = useMatchLoop({
      ...options,
      config: { ...options.config, countdownTicks: 0 },
    });
    const dispatch = useCallback<MatchLoopView['dispatch']>((command) => {
      controller.recordCommand(command);
      loop.dispatch(command);
    }, [loop.dispatch]);
    const view = useMemo(
      () => withRowSelectionFixture(loop.view),
      [loop.view],
    );
    return { ...loop, dispatch, view };
  };
}

export function createE2EMatchRenderer(
  controller: E2EDriverController,
): (props: MatchRouteViewProps) => React.ReactNode {
  const useMatchLoopImpl = createE2EMatchLoopHook(controller);

  return (props) => (
    <E2EMatchRoute
      {...props}
      controller={controller}
      useMatchLoopImpl={useMatchLoopImpl}
    />
  );
}

interface E2EMatchRouteProps extends MatchRouteViewProps {
  readonly controller: E2EDriverController;
  readonly useMatchLoopImpl: MatchLoopHook;
}

function E2EMatchRoute({
  controller,
  useMatchLoopImpl,
  ...props
}: E2EMatchRouteProps) {
  useEffect(
    () => controller.bindFinish(props.onFinished, {
      floor: props.floor,
      encounterIndex: props.encounterIndex,
      wins: props.wins,
    }),
    [controller, props.encounterIndex, props.floor, props.onFinished, props.wins],
  );
  return <MatchScreen {...props} useMatchLoopImpl={useMatchLoopImpl} />;
}
