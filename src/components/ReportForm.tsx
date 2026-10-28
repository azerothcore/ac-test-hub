import { useId } from 'react';
import { useStoredState } from '../hooks';
import { buildReport, EMPTY_REPORT, isReportReady, RESULT_LABELS, type ReportInput, type ServerSetup, type TestResult } from '../lib/draftReport';
import type { PullSummary } from '../lib/types';
import { CopyButton } from './CopyButton';
import { ExternalLink } from './ExternalLink';
import { Markdown } from './Markdown';

type Draft = Omit<ReportInput, 'setup' | 'os'>;
const EMPTY_DRAFT: Draft = (({ setup: _s, os: _o, ...rest }) => rest)(EMPTY_REPORT);

interface Props {
  pull: PullSummary;
  repository: string;
  setup: ServerSetup;
  os: string;
}

const RESULTS = Object.entries(RESULT_LABELS) as Array<[TestResult, string]>;

export function ReportForm({ pull, repository, setup, os }: Props) {
  // One draft per PR, kept in this browser so a reload doesn't lose the notes.
  const [draft, setDraft] = useStoredState<Draft>(`ac-test-hub:draft:${pull.number}`, EMPTY_DRAFT);
  const id = useId();
  const input: ReportInput = { ...draft, setup, os };
  const report = buildReport(input);
  const ready = isReportReady(input);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));

  const textField = (key: 'tested' | 'beforeAfter' | 'regressions' | 'notes', label: string, hint: string, rows = 3) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="field__hint" id={`${id}-${key}`}>
        {hint}
      </span>
      <textarea rows={rows} value={draft[key]} aria-describedby={`${id}-${key}`} onChange={(event) => set(key, event.target.value)} />
    </label>
  );

  return (
    <div className="report">
      <form className="report__form" onSubmit={(event) => event.preventDefault()}>
        <fieldset className="choice">
          <legend className="field__label">Result</legend>
          {RESULTS.map(([value, label]) => (
            <label key={value} className="choice__option">
              <input type="radio" name={`${id}-result`} value={value} checked={draft.result === value} onChange={() => set('result', value)} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        <label className="field">
          <span className="field__label">Server revision</span>
          <span className="field__hint" id={`${id}-revision`}>
            The branch and date shown by <code>server info</code>.
          </span>
          <input type="text" value={draft.revision} aria-describedby={`${id}-revision`} onChange={(event) => set('revision', event.target.value)} />
        </label>

        {textField('tested', 'What did you test?', 'The steps you followed and what you saw. Required.', 4)}
        {textField('beforeAfter', 'Before and after', 'How it behaved without the PR, and with it.')}
        {textField('regressions', 'Regression checks', 'Related cases you checked still work.')}
        {textField('notes', 'Notes', 'Anything else: errors in the logs, screenshots to attach…', 2)}

        <div className="report__actions">
          <CopyButton text={report} label="Copy the report" className="button button--primary" disabled={!ready} />
          <ExternalLink className="button button--quiet" href={pull.url}>
            Open the PR to comment
          </ExternalLink>
          <button type="button" className="button button--quiet" onClick={() => setDraft(EMPTY_DRAFT)}>
            Clear
          </button>
        </div>
        {!ready && <p className="field__hint">Describe what you tested to copy the report.</p>}
      </form>

      <section className="report__preview" aria-label="Report preview">
        <p className="field__label">Preview</p>
        <Markdown repository={repository}>{report}</Markdown>
      </section>
    </div>
  );
}
