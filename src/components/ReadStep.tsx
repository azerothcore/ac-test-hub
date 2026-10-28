import { Fragment } from 'react';
import { issueUrl } from '../lib/config';
import { hasTestSteps } from '../lib/queue';
import type { PullSummary } from '../lib/types';
import { ExternalLink } from './ExternalLink';
import { Markdown } from './Markdown';

interface Props {
  pull: PullSummary;
  repository: string;
}

/** Step 1: what the author asks testers to check. */
export function ReadStep({ pull, repository }: Props) {
  const { testing } = pull;

  return (
    <li className="step">
      <h3 className="step__title">Read what to test</h3>
      {testing.instructions && (
        <>
          <Markdown repository={repository}>{testing.instructions}</Markdown>
          <p className="step__source">From the “{testing.instructionsHeading}” section of the PR.</p>
        </>
      )}
      {testing.reproStepsInIssue && (
        <p>
          The author says the reproduction steps of the linked issue apply
          {pull.issues.length > 0 ? ': ' : '.'}
          {pull.issues.map((n, index) => (
            <Fragment key={n}>
              {index > 0 && ', '}
              <ExternalLink href={issueUrl(repository, n)}>#{n}</ExternalLink>
            </Fragment>
          ))}
          {pull.issues.length > 0 && '.'}
        </p>
      )}
      {!hasTestSteps(pull) && (
        <p>
          The author gave no test steps. You can ask for them in a comment, or read the{' '}
          <ExternalLink href={`${pull.url}/files`}>changed files</ExternalLink> and decide what to test: just say
          what you tested in your report.
        </p>
      )}
      {testing.authorTests && (
        <details className="disclosure" open={!testing.instructions}>
          <summary>What the author tested</summary>
          <Markdown repository={repository}>{testing.authorTests}</Markdown>
        </details>
      )}
      {pull.kind === 'build' && (
        <p className="step__reminder">Code changes can break more than what they fix: also check that related cases still work.</p>
      )}
    </li>
  );
}
