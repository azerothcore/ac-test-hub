import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from './components/ExternalLink';
import { PullDetail } from './components/PullDetail';
import { PullList } from './components/PullList';
import { QueueFilters } from './components/QueueFilters';
import { timeAgo } from './format';
import { useHashSelection, useSnapshot, useStoredState } from './hooks';
import type { ServerPrefs } from './lib/commands';
import { WIKI } from './lib/config';
import { DEFAULT_FILTERS, domainOptions, filterPulls, reportCount, sortPulls, wantsTesters, type QueueFilters as Filters, type SortKey } from './lib/queue';
import type { Snapshot } from './lib/types';

const DEFAULT_PREFS: ServerPrefs = { setup: 'docker', fork: false, os: '' };

/** The width from which the queue and the detail sit side by side (styles.css). */
const WIDE_SCREEN = '(min-width: 960px)';

function Summary({ snapshot }: { snapshot: Snapshot }) {
  const wanted = snapshot.pulls.filter(wantsTesters);
  const labelled = wanted.filter((p) => p.status === 'waiting').length;
  const unreported = wanted.filter((p) => reportCount(p) === 0).length;
  return (
    <p className="masthead__lede">
      {wanted.length} open pull requests are asking for testers
      {labelled > 0 && ` (${labelled} labelled “Waiting to be Tested”)`}, and {unreported} of them have no report yet. Pick one,
      run it on your server, post what you saw.
    </p>
  );
}

function Hub({ snapshot, sample }: { snapshot: Snapshot; sample: boolean }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sort, setSort] = useStoredState<{ key: SortKey }>('ac-test-hub:sort', { key: 'priority' });
  const [prefs, setPrefs] = useStoredState<ServerPrefs>('ac-test-hub:prefs', DEFAULT_PREFS);
  const [selected, select] = useHashSelection();
  const detailRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => sortPulls(filterPulls(snapshot.pulls, filters), sort.key), [snapshot, filters, sort.key]);
  // Counts follow the other filters, so each choice says how many PRs it would show.
  const domains = useMemo(
    () => domainOptions(filterPulls(snapshot.pulls, { ...filters, domain: '' }), filters.domain),
    [snapshot, filters],
  );
  const current = snapshot.pulls.find((p) => p.number === selected) ?? null;

  // On wide screens, open the first PR so the page never starts empty.
  useEffect(() => {
    if (selected === null && visible.length > 0 && window.matchMedia(WIDE_SCREEN).matches) {
      history.replaceState(null, '', `#${visible[0].number}`);
      select(visible[0].number);
    }
  }, [selected, visible, select]);

  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [selected]);

  return (
    <div className="hub" data-has-selection={current ? 'true' : 'false'}>
      <header className="masthead">
        <div className="masthead__title">
          <h1>Test Hub</h1>
          <p className="masthead__for">for AzerothCore pull requests</p>
        </div>
        <Summary snapshot={snapshot} />
        <p className="masthead__meta">
          {sample ? (
            <strong className="sample-flag">Made-up sample data</strong>
          ) : (
            <>
              Updated <time dateTime={snapshot.generatedAt}>{timeAgo(snapshot.generatedAt)}</time>
            </>
          )}
          <span aria-hidden="true"> / </span>
          <ExternalLink href={WIKI.howToTestPr}>How to test a PR</ExternalLink>
        </p>
      </header>

      <aside className="queue" aria-label="Pull requests">
        <QueueFilters
          filters={filters}
          sort={sort.key}
          onFiltersChange={setFilters}
          onSortChange={(key) => setSort({ key })}
          shown={visible.length}
          total={snapshot.pulls.length}
          domains={domains}
        />
        <PullList pulls={visible} selected={selected} onSelect={select} onReset={() => setFilters(DEFAULT_FILTERS)} />
      </aside>

      <main className="detail-pane" ref={detailRef}>
        {current ? (
          <PullDetail pull={current} repository={snapshot.repository} prefs={prefs} onPrefsChange={setPrefs} onBack={() => select(null)} />
        ) : selected !== null ? (
          <div className="empty">
            <p>#{selected} isn't an open pull request any more, or isn't in this snapshot.</p>
            <ExternalLink className="button button--quiet" href={`https://github.com/${snapshot.repository}/pull/${selected}`}>
              Look it up on GitHub
            </ExternalLink>
          </div>
        ) : (
          <div className="empty">
            <p>Pick a pull request to see how to test it.</p>
          </div>
        )}
      </main>

      <footer className="colophon">
        Data from the GitHub API, refreshed every 30 minutes.
      </footer>
    </div>
  );
}

export function App() {
  const result = useSnapshot();

  if (result.state === 'loading') {
    return <p className="status-screen">Loading pull requests…</p>;
  }

  if (result.state === 'error') {
    return <p className="status-screen">Couldn't load the pull requests: {result.message}</p>;
  }

  return <Hub snapshot={result.snapshot} sample={result.sample} />;
}
