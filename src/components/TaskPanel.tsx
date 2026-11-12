'use client';
import { useEffect } from 'react';
import { TaskView } from './TaskView';

/**
 * The task sliding over whatever you were looking at, Nifty-style:
 * a strip of the board stays visible on the left so you keep your place —
 * wide enough on a big screen to read the column you came from.
 */
export function TaskPanel({ id, onClose }: { id: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // let a menu, a lightbox or a dialog take Escape first
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60]">
      <button className="absolute inset-0 w-full cursor-default bg-scrim/45" onClick={onClose} aria-label="Close task" tabIndex={-1} />
      <div
        role="dialog"
        aria-label="Task"
        className="absolute inset-y-0 right-0 left-0 flex flex-col overflow-hidden border-l border-line bg-surface shadow-pop md:left-[140px] lg:left-[380px] xl:left-[520px] lg:rounded-l-2xl"
      >
        <TaskView id={id} onClose={onClose} />
      </div>
    </div>
  );
}
