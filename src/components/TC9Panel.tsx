import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHostedBuilds } from '../useHostedBuilds';
import { canCompileAgain, taskKey } from '../lib/hosted';
import type { HostedTasks } from '../lib/hosted';
import { PlayerAccount } from './PlayerAccount';
import { HostedProgress } from './HostedProgress';
import { API_BASE, APIError, parseCharacters, request } from '../lib/tc9';
import type { Artifact, BuildInput, BuildPage, Connection, Module, Phase, Realm, Repository, ServiceStatus, TC9Config } from '../lib/tc9';
import type { PullSummary } from '../lib/types';

const CHARACTER_EXAMPLE = '[\n  {"name":"Tester","race":"human","class":"warrior","level":80,"money_gold":0}\n]';

function Progress({ label, phase }: { label: string; phase?: Phase }) {
  if (!phase) {
    return null;
  }
  return (
    <p>
      {label}: {phase.state ?? phase.status ?? 'pending'}
      {phase.progress_percent !== undefined && (
        <>
          {' '}
          <progress value={phase.progress_percent} max={100} /> {phase.progress_percent}%
        </>
      )}
      {(phase.progress_detail ?? phase.detail) && <> — {phase.progress_detail ?? phase.detail}</>}
    </p>
  );
}

function Archive({ kind, id, csrf, report }: { kind: 'builds' | 'realms'; id: string; csrf: string; report: (error: unknown) => void }) {
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [pending, setPending] = useState(false);
  const path = `v1/${kind}/${encodeURIComponent(id)}`;
  useEffect(() => {
    if (!artifact || !['queued', 'exporting', 'waiting_for_build'].includes(artifact.state)) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void request<Artifact>(`${path}/artifact`, { signal: controller.signal })
        .then(setArtifact)
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            report(error);
            setArtifact(null);
          }
        });
    }, 5000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [artifact, path, report]);
  function prepare(retry = false) {
    setPending(true);
    void request<Artifact>(`${path}/artifact`, retry ? { method: 'POST', data: {}, csrf } : {})
      .then(setArtifact)
      .catch(report)
      .finally(() => setPending(false));
  }
  return (
    <div className="tc9-archive">
      <button type="button" className="button button--quiet" disabled={pending} onClick={() => prepare(artifact?.state === 'failed')}>
        {pending
          ? 'Checking archive…'
          : artifact?.state === 'failed'
            ? 'Retry archive export'
            : `Prepare ${kind === 'builds' ? 'pinned build' : 'current realm'} download`}
      </button>
      {artifact && (
        <p role="status">
          Archive: {artifact.state} {artifact.detail}
          {artifact.sha && (
            <>
              {' '}
              · Revision <code>{artifact.sha.slice(0, 12)}</code>
            </>
          )}
          {artifact.state === 'ready' && (
            <>
              {' '}
              ·{' '}
              <a className="button" href={`${API_BASE}${path}/download`}>
                Download Linux core ZIP{artifact.artifact_size ? ` (${Math.round(artifact.artifact_size / 1048576)} MiB)` : ''}
              </a>
            </>
          )}
          {artifact.artifact_sha256 && <small className="tc9-hash">SHA256: {artifact.artifact_sha256}</small>}
        </p>
      )}
    </div>
  );
}

function RealmCard({
  realm,
  csrf,
  act,
  busy,
  report,
}: {
  realm: Realm;
  csrf: string;
  act: (path: string, method: string, question?: string) => void;
  busy: boolean;
  report: (error: unknown) => void;
}) {
  const path = `v1/realms/${encodeURIComponent(realm.id)}`;
  const stopped = realm.state === 'offline';
  return (
    <article className="tc9-card" id={`tc9-realm-${realm.id}`}>
      <h4>
        {realm.realm_name || realm.id} <span className="tag">{realm.state}</span>
      </h4>
      <p>
        {realm.repository} #{realm.pr_number} · <code>{realm.commit_sha?.slice(0, 12)}</code>
      </p>
      <Progress label="Realm" phase={realm} />
      {realm.address && (
        <p>
          Server:{' '}
          <code>
            {realm.address}
            {realm.port ? `:${realm.port}` : ''}
          </code>
          <br />
          Realmlist: <code>set realmlist {realm.address}</code>
          {realm.realmlist_id && <> · Realm ID {realm.realmlist_id}</>}
        </p>
      )}
      <PlayerAccount realm={realm} csrf={csrf} />
      <div className="tc9-actions">
        <button className="button" type="button" disabled={busy || !stopped} onClick={() => act(`${path}/start`, 'POST')}>
          Start
        </button>
        <button
          className="button"
          type="button"
          disabled={busy || realm.state !== 'running'}
          onClick={() => act(`${path}/stop`, 'POST', 'Stop this test realm?')}
        >
          Stop
        </button>
        <button
          className="button"
          type="button"
          disabled={busy || !stopped}
          onClick={() => act(`${path}/recompile`, 'POST', 'Compile the latest PR revision and update this stopped realm?')}
        >
          Recompile latest PR
        </button>
        <button
          className="button"
          type="button"
          disabled={busy || realm.state === 'deleting' || realm.state === 'deleted'}
          onClick={() => act(path, 'DELETE', 'Delete this realm and its databases? This cannot be undone.')}
        >
          Delete realm
        </button>
      </div>
      <Archive key={realm.commit_sha} kind="realms" id={realm.id} csrf={csrf} report={report} />
    </article>
  );
}

export function TC9Panel({
  repository,
  pull,
  open,
  onOpenChange,
  onHostedChange,
}: {
  repository: string;
  pull: PullSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHostedChange: (tasks: HostedTasks) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [config, setConfig] = useState<TC9Config | null>(null);
  const [connection, setConnection] = useState<Connection>({ connected: false });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [builds, setBuilds] = useState<BuildPage>({ builds: [], total: 0, limit: 20, offset: 0 });
  const [realms, setRealms] = useState<Realm[]>([]);
  const [offset, setOffset] = useState(0);
  const [server, setServer] = useState('auto');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [moduleFilter, setModuleFilter] = useState('');
  const [characters, setCharacters] = useState('[]');
  const actionPending = useRef(false);
  const selectedKey = pull ? taskKey(repository, pull.number) : null;
  const { tracker, tasks } = useHostedBuilds(connection.connected, selectedKey);
  const selectedTask = selectedKey ? tasks[selectedKey] : undefined;
  const submissionPending = !!selectedTask?.submitting;
  const [now, setNow] = useState(() => Date.now());
  const retryIn = Math.max(0, Math.ceil(((selectedTask?.retryAt ?? 0) - now) / 1000));
  useEffect(() => {
    onHostedChange(tasks);
  }, [tasks, onHostedChange]);
  useEffect(() => {
    if (!selectedTask?.retryAt) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [selectedTask?.retryAt]);
  const retryUntil = useRef(0);
  const csrf = connection.csrf ?? '';
  const reset = useCallback(() => {
    setConnection({ connected: false });
    setStatus(null);
    setBuilds({ builds: [], total: 0, limit: 20, offset: 0 });
    setRealms([]);
    setModules([]);
    setRepositories([]);
    setOffset(0);
  }, []);
  const report = useCallback(
    (failure: unknown) => {
      if (failure instanceof APIError) {
        if (failure.status === 401) {
          reset();
        }
        retryUntil.current = Date.now() + Math.max(15000, failure.retryAfter * 1000);
      }
      setError(failure instanceof Error ? failure.message : 'The provisioning service could not be reached.');
    },
    [reset],
  );
  useEffect(() => {
    const controller = new AbortController();
    void request<TC9Config>('config', { signal: controller.signal })
      .then((value) => {
        setConfig(value);
        return request<Connection>('connection', { signal: controller.signal });
      })
      .then(setConnection)
      .catch(() => {
        /* Static-only installations keep the local testing flow. */
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
    }
    if (!open && element.open) {
      element.close();
    }
  }, [open, config]);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const [service, page, ownedRealms] = await Promise.all([
        request<ServiceStatus>('v1/status', { signal }),
        request<BuildPage>(`v1/builds?limit=20&offset=${offset}`, { signal }),
        request<Realm[]>('v1/realms', { signal }),
      ]);
      setStatus(service);
      setBuilds(page);
      setRealms(ownedRealms);
      for (const build of page.builds) {
        tracker.accept(build);
      }
    },
    [offset, tracker],
  );
  useEffect(() => {
    if (!connection.connected || !open) {
      return;
    }
    const controller = new AbortController();
    void Promise.all([
      request<Repository[]>('v1/repositories', { signal: controller.signal }),
      request<Module[]>('v1/modules', { signal: controller.signal }),
    ])
      .then(([repos, mods]) => {
        setRepositories(repos);
        setModules(mods);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          report(failure);
        }
      });
    return () => controller.abort();
  }, [connection.connected, open, report]);
  useEffect(() => {
    if (!connection.connected || !open) {
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (controller.signal.aborted) {
        return;
      }
      try {
        if (Date.now() >= retryUntil.current) {
          await refresh(controller.signal);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          report(failure);
        }
      }
      if (!controller.signal.aborted) {
        timer = setTimeout(() => {
          void poll();
        }, 5000);
      }
    };
    void poll();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [connection.connected, open, refresh, report]);

  function connect() {
    if (actionPending.current) {
      return;
    }
    actionPending.current = true;
    setBusy(true);
    setError('');
    void request<Connection>('connection')
      .then((value) => {
        retryUntil.current = 0;
        setConnection(value);
        setMessage('Test Hub connection refreshed.');
      })
      .catch(report)
      .finally(() => {
        actionPending.current = false;
        setBusy(false);
      });
  }
  function act(path: string, method: string, question?: string) {
    if (actionPending.current || submissionPending || (question && !window.confirm(question))) {
      return;
    }
    actionPending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    void request(path, { method, csrf, data: method === 'POST' ? {} : undefined })
      .then(() => {
        setMessage('Request accepted. Progress will refresh automatically.');
        return refresh();
      })
      .catch(report)
      .finally(() => {
        actionPending.current = false;
        setBusy(false);
      });
  }
  function compile() {
    if (!pull || actionPending.current || submissionPending || retryIn > 0) {
      return;
    }
    const again = canCompileAgain(selectedTask);
    if (selectedTask?.id && !again) {
      return;
    }
    let input: BuildInput;
    try {
      input = selectedTask?.intent?.input ?? {
        repository,
        pr_number: pull.number,
        build_server: server,
        modules: [...selectedModules].sort(),
        characters: parseCharacters(characters),
      };
    } catch (failure) {
      report(failure);
      return;
    }
    setError('');
    setMessage('');
    void tracker
      .submit(input, csrf, again)
      .then(() => {
        // Refresh failures do not turn an already accepted submission into a failed one.
        if (tracker.snapshot()[taskKey(input.repository, input.pr_number)]?.id) {
          setOffset(0);
          void refresh().catch(report);
        }
      })
      .catch(report);
  }
  if (!config) {
    return open
      ? createPortal(
          <dialog
            className="tc9-dialog"
            ref={dialog}
            onCancel={() => onOpenChange(false)}
            onClose={() => onOpenChange(false)}
            aria-labelledby="tc9-unavailable"
          >
            <h2 id="tc9-unavailable">Provisioning unavailable</h2>
            <p>The optional TC9 gateway could not be reached. You can still use the local server instructions below.</p>
            <button type="button" className="button" onClick={() => onOpenChange(false)}>
              Close
            </button>
          </dialog>,
          document.body,
        )
      : null;
  }
  const eligible = !!pull && repositories.some((repo) => repo.id === repository);
  return (
    <div className="tc9-launcher">
      <button type="button" className="button" onClick={() => onOpenChange(true)}>
        Test Hub builds & realms
        {pull ? ` · PR #${pull.number}` : ''}
      </button>
      {createPortal(
        <dialog
          className="tc9-dialog"
          ref={dialog}
          onCancel={() => onOpenChange(false)}
          onClose={() => onOpenChange(false)}
          aria-labelledby="tc9-title"
        >
          <div className="tc9-dialog__heading">
            <h2 id="tc9-title">Compile & provision a test realm</h2>
            <button type="button" className="button" onClick={() => onOpenChange(false)}>
              Close
            </button>
          </div>
          <p>
            Provisioning service:{' '}
            <a href={config.upstream} target="_blank" rel="noreferrer">
              {config.upstream}
            </a>
          </p>
          {error && (
            <p className="notice tc9-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          {!open ? null : !connection.connected ? (
            <section className="tc9-card">
              <h3>Test Hub connection unavailable</h3>
              <p>
                The site uses a shared provisioning account. No personal login or API token is needed. Retry the connection, or contact the
                site operator if the problem continues.
              </p>
              <button type="button" className="button" disabled={busy} onClick={connect}>
                Retry connection
              </button>
            </section>
          ) : (
            <>
              <div className="tc9-actions">
                <strong>Shared Test Hub account</strong>
                <button
                  type="button"
                  className="button button--quiet"
                  disabled={busy}
                  onClick={() => {
                    retryUntil.current = 0;
                    void refresh().catch(report);
                  }}
                >
                  Refresh
                </button>
              </div>
              <p>All Test Hub visitors use this provisioning account and share the builds and realms below.</p>
              <p role="status">
                {status
                  ? `${status.available ? 'Service available' : 'Service unavailable'} · ${status.queued_operations} queued · ${status.running_realms}/${status.max_running_realms} realms running`
                  : 'Loading service capacity…'}
                {status?.maintenance_message && ` · ${status.maintenance_message}`}
              </p>
              <section className="tc9-card" aria-labelledby="tc9-build-title">
                <h3 id="tc9-build-title">{pull ? `Compile PR #${pull.number}` : 'Select a pull request to compile'}</h3>
                {pull && (
                  <>
                    <p>
                      {pull.title}
                      <br />
                      <small>{repository} · The service pins the current PR head at submission.</small>
                    </p>
                    {!eligible && (
                      <p className="notice">
                        This repository is unavailable for compilation with this account, or repository choices are still loading.
                      </p>
                    )}
                    {selectedTask && (
                      <HostedProgress
                        task={selectedTask}
                        showAction={!selectedTask.intent && !canCompileAgain(selectedTask)}
                        onOpen={() =>
                          document
                            .getElementById(
                              selectedTask.build?.realm ? `tc9-realm-${selectedTask.build.realm.id}` : `tc9-build-${selectedTask.id}`,
                            )
                            ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }
                      />
                    )}
                    {(!selectedTask?.id || canCompileAgain(selectedTask)) && (
                      <form
                        className="tc9-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          compile();
                        }}
                      >
                        {selectedTask?.intent && (
                          <p className="notice">
                            The original request is preserved: server {selectedTask.intent.input.build_server}, modules{' '}
                            {selectedTask.intent.input.modules.join(', ') || 'none'}, {selectedTask.intent.input.characters?.length ?? 0}{' '}
                            test characters. Retrying checks or resumes this exact compilation.
                          </p>
                        )}
                        <fieldset
                          className="tc9-build-options"
                          hidden={!!selectedTask?.intent}
                          disabled={submissionPending || !!selectedTask?.intent}
                        >
                          <label>
                            Compilation server
                            <select value={server} onChange={(event) => setServer(event.target.value)}>
                              <option value="auto">Automatic</option>
                              {status?.build_servers.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <details>
                            <summary>Optional modules ({selectedModules.length}/5)</summary>
                            <label>
                              Find a module
                              <input type="search" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} />
                            </label>
                            <fieldset className="tc9-modules">
                              <legend>Approved modules</legend>
                              {modules
                                .filter((mod) => `${mod.name} ${mod.description}`.toLowerCase().includes(moduleFilter.toLowerCase()))
                                .map((mod) => (
                                  <label key={mod.name}>
                                    <input
                                      type="checkbox"
                                      checked={selectedModules.includes(mod.name)}
                                      disabled={!selectedModules.includes(mod.name) && selectedModules.length >= 5}
                                      onChange={(event) =>
                                        setSelectedModules(
                                          event.target.checked
                                            ? [...selectedModules, mod.name]
                                            : selectedModules.filter((name) => name !== mod.name),
                                        )
                                      }
                                    />
                                    <span>
                                      <strong>{mod.name}</strong>
                                      <small>{mod.description}</small>
                                    </span>
                                  </label>
                                ))}
                            </fieldset>
                          </details>
                          <details>
                            <summary>Optional test characters, items & quests</summary>
                            <p>
                              Up to three characters. Leave [] for none. Valid race/class combinations, level 1–80, gold 0–10000. Items use{' '}
                              {`{"id":6948,"count":1}`}; quest fields are active_quests and completed_quests (arrays of IDs, 25 combined).
                            </p>
                            <button type="button" className="button button--quiet" onClick={() => setCharacters(CHARACTER_EXAMPLE)}>
                              Use level 80 tester example
                            </button>
                            <label>
                              Character configuration (JSON)
                              <textarea
                                rows={7}
                                spellCheck={false}
                                value={characters}
                                onChange={(event) => setCharacters(event.target.value)}
                              />
                            </label>
                          </details>
                        </fieldset>
                        <button
                          type="submit"
                          className="button button--primary"
                          disabled={busy || submissionPending || retryIn > 0 || !eligible || !status?.available || !status.builds_available}
                        >
                          {submissionPending
                            ? 'Submitting…'
                            : retryIn > 0
                              ? `Retry in ${retryIn}s`
                              : selectedTask?.intent
                                ? 'Retry same submission'
                                : canCompileAgain(selectedTask)
                                  ? 'Compile again'
                                  : 'Compile & create realm'}
                        </button>
                      </form>
                    )}
                  </>
                )}
              </section>
              <section aria-labelledby="tc9-builds">
                <h3 id="tc9-builds">Test Hub builds ({builds.total})</h3>
                {builds.builds.length === 0 && <p>No builds on this page.</p>}
                {builds.builds.map((build) => (
                  <article key={build.id} id={`tc9-build-${build.id}`} className="tc9-card">
                    <h4>
                      {build.repository} #{build.pr_number} <span className="tag">{build.status}</span>
                    </h4>
                    <p>
                      <code>{build.id}</code> · Revision <code>{build.sha?.slice(0, 12) || 'pending'}</code>
                      <br />
                      Modules: {build.modules?.join(', ') || 'none'} · {new Date(build.created_at).toLocaleString()}
                    </p>
                    <Progress label="Compilation" phase={build.build} />
                    <Progress label="Database" phase={build.database} />
                    <Progress label="Realm" phase={build.realm ?? undefined} />
                    {build.error && <p className="tc9-error">{build.error}</p>}
                    {build.status === 'queued' && build.queue_expires_at && (
                      <p>Queue expires: {new Date(build.queue_expires_at).toLocaleString()}</p>
                    )}
                    {!['completed', 'deleted', 'failed', 'expired'].includes(build.status) && (
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          act(
                            `v1/builds/${encodeURIComponent(build.id)}`,
                            'DELETE',
                            'Cancel this build and clean up its related realm resources?',
                          )
                        }
                      >
                        Cancel build
                      </button>
                    )}
                    <Archive kind="builds" id={build.id} csrf={csrf} report={report} />
                  </article>
                ))}
                <div className="tc9-actions">
                  <button type="button" className="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>
                    Previous builds
                  </button>
                  <span>Page {Math.floor(offset / 20) + 1}</span>
                  <button type="button" className="button" disabled={offset + 20 >= builds.total} onClick={() => setOffset(offset + 20)}>
                    Next builds
                  </button>
                </div>
              </section>
              <section aria-labelledby="tc9-realms">
                <h3 id="tc9-realms">Test Hub realms ({realms.length})</h3>
                {realms.length === 0 && <p>No shared realms yet. Submit a PR build above to create one.</p>}
                {realms.map((realm) => (
                  <RealmCard key={realm.id} realm={realm} csrf={csrf} act={act} busy={busy || submissionPending} report={report} />
                ))}
              </section>
            </>
          )}
        </dialog>,
        document.body,
      )}
    </div>
  );
}
