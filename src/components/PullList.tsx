import { hasTestSteps, wantsTesters } from '../lib/queue';
import type { PullSummary } from '../lib/types';
import { areaText, KIND_HINT, KIND_TEXT, reportsSummary, STATUS_TEXT, timeAgo } from '../format';

interface Props {
  pulls: PullSummary[];
  selected: number | null;
  onSelect: (number: number) => void;
  onReset: () => void;
}

export function PullList({ pulls, selected, onSelect, onReset }: Props) {
  if (pulls.length === 0) {
    return (
      <div className="empty">
        <p>No pull request matches these filters.</p>
        <button type="button" className="button button--quiet" onClick={onReset}>
          Clear the filters
        </button>
      </div>
    );
  }

  return (
    <ol className="pull-list">
      {pulls.map((pull) => {
        const reports = reportsSummary(pull.reports);
        const area = areaText(pull.area);

        return (
          <li key={pull.number}>
            <a
              href={`#${pull.number}`}
              className="pull-row"
              data-status={pull.status}
              aria-current={pull.number === selected ? 'true' : undefined}
              onClick={(event) => {
                event.preventDefault();
                onSelect(pull.number);
              }}
            >
              <span className="pull-row__number">#{pull.number}</span>
              <span className="pull-row__title">{pull.title}</span>
              <span className="pull-row__meta">
                <span className="tag" data-kind={pull.kind} title={KIND_HINT[pull.kind]}>
                  {KIND_TEXT[pull.kind]}
                </span>
                {pull.status !== 'open' && (
                  <span className="tag" data-status={pull.status}>
                    {STATUS_TEXT[pull.status]}
                  </span>
                )}
                {pull.status === 'open' && wantsTesters(pull) && <span className="tag" data-wanted>Asking for testers</span>}
                {reports && (
                  <span className="tag" data-reports={reports.problem ? 'problem' : 'ok'}>
                    {reports.problem ? `${reports.text}, problem found` : reports.text}
                  </span>
                )}
                {!hasTestSteps(pull) && <span className="tag" data-missing>No test steps</span>}
                <span className="pull-row__byline">
                  {area && <span className="pull-row__area">{area}</span>}
                  {pull.author.login}, {timeAgo(pull.createdAt)}
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}
