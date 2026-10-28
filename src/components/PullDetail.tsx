import type { ServerPrefs } from '../lib/commands';
import { wantsTesters } from '../lib/queue';
import type { PullSummary } from '../lib/types';
import { areaText, KIND_HINT, KIND_TEXT, STATUS_TEXT, timeAgo } from '../format';
import { shortTopic } from '../lib/domain';
import { ExternalLink } from './ExternalLink';
import { ReadStep } from './ReadStep';
import { ReportStep } from './ReportStep';
import { RunStep } from './RunStep';

interface Props {
  pull: PullSummary;
  repository: string;
  prefs: ServerPrefs;
  onPrefsChange: (prefs: ServerPrefs) => void;
  onBack: () => void;
}

/** One pull request: what it is, then the three steps to test it. */
export function PullDetail({ pull, repository, prefs, onPrefsChange, onBack }: Props) {
  const { testing } = pull;
  const area = areaText(pull.area);

  return (
    <article className="detail" aria-labelledby="detail-title">
      <button type="button" className="detail__back button button--quiet" onClick={onBack}>
        All pull requests
      </button>

      <header className="detail__header">
        <p className="detail__number">#{pull.number}</p>
        <h2 id="detail-title" className="detail__title">
          {pull.title}
        </h2>
        <p className="detail__byline">
          Opened by <ExternalLink href={`https://github.com/${pull.author.login}`}>{pull.author.login}</ExternalLink>{' '}
          {timeAgo(pull.createdAt)}, updated {timeAgo(pull.updatedAt)}.{' '}
          {pull.comments === 0 ? 'No comments yet.' : `${pull.comments} comment${pull.comments > 1 ? 's' : ''}.`}
        </p>
        <div className="detail__tags">
          <span className="tag" data-kind={pull.kind}>
            {KIND_TEXT[pull.kind]}
          </span>
          {pull.status !== 'open' && (
            <span className="tag" data-status={pull.status}>
              {STATUS_TEXT[pull.status]}
            </span>
          )}
          {wantsTesters(pull) && pull.status !== 'waiting' && <span className="tag" data-wanted>Asking for testers</span>}
          {testing.testedByAuthor && <span className="tag">Tested by the author</span>}
          {testing.testedByOthers && <span className="tag">Tested by others</span>}
        </div>
        <p className="detail__kind">
          {KIND_HINT[pull.kind]}
          {pull.kindSource === 'labels' && ' (Guessed from the labels: the changed files could not be read.)'}
        </p>
        {(area || pull.topics.length > 0) && (
          <dl className="detail__facts">
            {area && (
              <>
                <dt>Code area</dt>
                <dd>{area}</dd>
              </>
            )}
            {pull.topics.length > 0 && (
              <>
                <dt>Linked issue</dt>
                <dd>{pull.topics.map(shortTopic).join(', ')}</dd>
              </>
            )}
          </dl>
        )}
        <ExternalLink className="button button--primary" href={pull.url}>
          Open on GitHub
        </ExternalLink>
      </header>

      {pull.status === 'conflicts' && (
        <p className="notice">This PR has merge conflicts: it can't be tested until the author fixes them.</p>
      )}
      {pull.status === 'wip' && <p className="notice">This PR is still a work in progress: the author may change it before testing.</p>}

      <ol className="steps">
        <ReadStep pull={pull} repository={repository} />
        <RunStep pull={pull} prefs={prefs} onPrefsChange={onPrefsChange} />
        <ReportStep pull={pull} repository={repository} prefs={prefs} onPrefsChange={onPrefsChange} />
      </ol>
    </article>
  );
}
