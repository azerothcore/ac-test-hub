import { hostedProgress } from '../lib/hosted';
import type { HostedTask } from '../lib/hosted';

export function HostedProgress({ task, onOpen, showAction = true }: { task?: HostedTask; onOpen: () => void; showAction?: boolean }) {
  const progress = hostedProgress(task);
  return (
    <div className="hosted-progress" data-state={progress.failed ? 'failed' : (task?.build?.status ?? 'pending')}>
      {task && (
        <div role="status" aria-live="polite" aria-atomic="true">
          <p className="hosted-progress__label">
            <strong>
              {progress.label}
              {progress.percent !== undefined ? ` · ${progress.percent}%` : ''}
            </strong>
          </p>
          {!progress.failed && <progress aria-label={progress.label} max={100} value={progress.percent} />}
          {progress.detail && <p>{progress.detail}</p>}
          {task.build?.sha && (
            <small>
              Revision <code>{task.build.sha.slice(0, 12)}</code>
            </small>
          )}
          {task.error && task.error !== progress.detail && <p className="tc9-error">{task.error}</p>}
          {task.pollError && (
            <p className="tc9-error">{task.pollError} Showing the last known progress; updates will retry automatically.</p>
          )}
        </div>
      )}
      {showAction && (
        <button type="button" className="button button--primary" disabled={task?.submitting} onClick={onOpen}>
          {progress.button}
        </button>
      )}
    </div>
  );
}
