import { Fragment, useState } from 'react';
import { testSteps, type ServerPrefs } from '../lib/commands';
import { DATABASES, WIKI } from '../lib/config';
import type { PullSummary } from '../lib/types';
import type { HostedTask } from '../lib/hosted';
import { HostedProgress } from './HostedProgress';
import { CopyButton } from './CopyButton';
import { ExternalLink } from './ExternalLink';

interface Props {
  pull: PullSummary;
  prefs: ServerPrefs;
  onPrefsChange: (prefs: ServerPrefs) => void;
  onProvision: () => void;
  hostedTask?: HostedTask;
}

const SETUPS = [
  ['docker', 'Docker'],
  ['traditional', 'Compiled from sources'],
] as const;

/** Renders `code` spans in short notes. */
function InlineText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(`[^`]+`)/)
        .map((part, index) =>
          part.startsWith('`') && part.endsWith('`') ? (
            <code key={index}>{part.slice(1, -1)}</code>
          ) : (
            <Fragment key={index}>{part}</Fragment>
          ),
        )}
    </>
  );
}

/** Step 2: the wiki's commands for this PR and this tester's setup. */
export function RunStep({ pull, prefs, onPrefsChange, onProvision, hostedTask }: Props) {
  const [option, setOption] = useState<'local' | 'hosted'>(hostedTask ? 'hosted' : 'local');
  const steps = testSteps(pull, prefs);
  const sqlOnly = pull.kind === 'sql-only';

  return (
    <li className="step">
      <h3 className="step__title">Run it on your server OR use a hosted test realm</h3>
      <fieldset className="segmented run-options">
        <legend className="field__label">Where to run this PR</legend>
        <label className="segmented__option">
          <input type="radio" name="run-option" value="local" checked={option === 'local'} onChange={() => setOption('local')} />
          <span>Run it on your server</span>
        </label>
        <span className="run-options__or" aria-hidden="true">
          OR
        </span>
        <label className="segmented__option">
          <input type="radio" name="run-option" value="hosted" checked={option === 'hosted'} onChange={() => setOption('hosted')} />
          <span>Use a hosted test realm</span>
        </label>
      </fieldset>
      {(option === 'hosted' || hostedTask) && (
        <div className="hosted-option">
          {option === 'hosted' && <p>Compile this PR and create a test realm. You can close the dialog and follow its progress here.</p>}
          <HostedProgress task={hostedTask} onOpen={onProvision} />
        </div>
      )}
      {option === 'local' && (
        <div className="local-option">
          <div className="server-prefs">
            <fieldset className="segmented">
              <legend className="field__label">Your setup</legend>
              {SETUPS.map(([value, label]) => (
                <label key={value} className="segmented__option">
                  <input
                    type="radio"
                    name="setup"
                    value={value}
                    checked={prefs.setup === value}
                    onChange={() => onPrefsChange({ ...prefs, setup: value })}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            {!sqlOnly && (
              <label className="toggle">
                <input type="checkbox" checked={prefs.fork} onChange={(event) => onPrefsChange({ ...prefs, fork: event.target.checked })} />
                <span>My clone is a fork (use the upstream remote)</span>
              </label>
            )}
          </div>

          {pull.sqlFiles.length > 0 && (
            <ul className="sql-files">
              {pull.sqlFiles.map((file) => (
                <li key={file.path}>
                  <ExternalLink href={file.rawUrl}>{file.path.split('/').pop()}</ExternalLink>
                  <span className="sql-files__db">{file.database ? DATABASES[file.database] : 'database unknown'}</span>
                </li>
              ))}
            </ul>
          )}

          <ol className="commands">
            {steps.map((step) => (
              <li key={step.title} className="commands__step">
                <p className="commands__title">{step.title}</p>
                {step.commands && step.commands.length > 0 && (
                  <div className="code">
                    <pre>
                      <code>{step.commands.join('\n')}</code>
                    </pre>
                    <CopyButton text={step.commands.join('\n')} />
                  </div>
                )}
                {step.note && (
                  <p className="commands__note">
                    <InlineText text={step.note} />
                  </p>
                )}
              </li>
            ))}
          </ol>
          <p className="step__source">
            Steps from the wiki:{' '}
            <ExternalLink href={sqlOnly ? WIKI.howToTestDbOnly : WIKI.howToTestPr}>
              {sqlOnly ? 'How to test DB only changes' : 'How to test a PR'}
            </ExternalLink>
            .
          </p>
        </div>
      )}
    </li>
  );
}
