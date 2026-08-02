import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { GameCommand } from '../../core/index';
import type { InputResetBus } from './input-reset-bus';
import { JoystickController } from './joystick-controller';
import './controls.css';

const ORIGIN = { x: 0, y: 0 };

export interface JoystickProps {
  readonly onCommand: (command: GameCommand) => void;
  readonly resetBus: InputResetBus;
}

export function Joystick({ onCommand, resetBus }: JoystickProps) {
  const commandRef = useRef(onCommand);
  commandRef.current = onCommand;
  const controlRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const controllerRef = useRef<JoystickController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new JoystickController((command) => commandRef.current(command));
  }
  const controller = controllerRef.current;
  const [knob, setKnob] = useState(ORIGIN);

  const resetAll = useCallback(() => {
    const pointerId = pointerIdRef.current;
    pointerIdRef.current = null;
    const control = controlRef.current;
    if (pointerId !== null && control?.hasPointerCapture(pointerId)) {
      control.releasePointerCapture(pointerId);
    }
    controller.release();
    setKnob(ORIGIN);
  }, [controller]);

  useEffect(() => {
    const unregister = resetBus.register(resetAll);
    window.addEventListener('blur', resetAll);
    document.addEventListener('visibilitychange', resetAll);
    return () => {
      unregister();
      window.removeEventListener('blur', resetAll);
      document.removeEventListener('visibilitychange', resetAll);
      resetAll();
    };
  }, [resetAll, resetBus]);

  const updateFromPointer = useCallback((control: HTMLDivElement, clientX: number, clientY: number) => {
    const rect = control.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    controller.update(dx, dy, radius);

    const distance = Math.hypot(dx, dy);
    const maximum = radius * 0.55;
    const scale = distance > maximum && distance > 0 ? maximum / distance : 1;
    setKnob({ x: dx * scale, y: dy * scale });
  }, [controller]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || pointerIdRef.current !== null) return;
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event.currentTarget, event.clientX, event.clientY);
  }, [updateFromPointer]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    updateFromPointer(event.currentTarget, event.clientX, event.clientY);
  }, [updateFromPointer]);

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    resetAll();
  }, [resetAll]);

  const knobStyle: CSSProperties = {
    transform: `translate3d(${knob.x}px, ${knob.y}px, 0)`,
  };

  return (
    <div
      ref={controlRef}
      aria-label="이동 조이스틱"
      className="joystick-control"
      role="group"
      onLostPointerCapture={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
    >
      <span aria-hidden="true" className="joystick-control__ring" />
      <span
        aria-hidden="true"
        className="joystick-control__knob"
        data-testid="joystick-knob"
        style={knobStyle}
      />
    </div>
  );
}
