import type { ServerPrefs } from '../lib/commands';
import type { PullSummary } from '../lib/types';
import { REPORT_KIND_TEXT, REPORT_RESULT_TEXT, timeAgo } from '../format';
import { ExternalLink } from './ExternalLink';
import { ReportForm } from './ReportForm';

interface Props {
  pull: PullSummary;
  repository: string;
  prefs: ServerPrefs;
  onPrefsChange: (prefs: ServerPrefs) => void;
}

/** Reports already posted on the PR, newest first, each linked to its comment. */
function PostedReports({ pull }: { pull: PullSummary }) {
  if (pull.reports === null) {
    return <p className="reports__none">The comments couldn't be read in the last update, so earlier reports aren't shown.</p>;
  }

  if (pull.reports.length === 0) {
    return <p className="reports__none">Nobody else has posted a test report yet.</p>;
  }

  const reports = [...pull.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <ul className="reports">
      {reports.map((report) => (
        <li key={report.url} className="reports__item" data-result={report.result}>
          <span className="reports__result">{REPORT_RESULT_TEXT[report.result]}</span>
          <span>
            {REPORT_KIND_TEXT[report.kind]} by <strong>{report.author}</strong> {timeAgo(report.createdAt)}.{' '}
            <ExternalLink href={report.url}>Read the report</ExternalLink>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Step 3: who already reported, and the form that writes this tester's report. */
export function ReportStep({ pull, repository, prefs, onPrefsChange }: Props) {
  return (
    <li className="step">
      <h3 className="step__title">Post your report</h3>
      <div className="reports-block">
        <p className="field__label">Already posted</p>
        <PostedReports pull={pull} />
        {pull.reports && pull.reports.length > 0 && (
          <p className="step__source">Another report on a different setup still helps the maintainers.</p>
        )}
      </div>
      <label className="field field--inline">
        <span className="field__label">Your OS</span>
        <input
          type="text"
          placeholder="Windows 11, Ubuntu 24.04…"
          value={prefs.os}
          onChange={(event) => onPrefsChange({ ...prefs, os: event.target.value })}
        />
      </label>
      <ReportForm key={pull.number} pull={pull} repository={repository} setup={prefs.setup} os={prefs.os} />
    </li>
  );
}
