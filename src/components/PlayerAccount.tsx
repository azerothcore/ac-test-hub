import { useEffect, useRef, useState } from 'react';
import { APIError, request } from '../lib/tc9';
import type { GameAccount, Realm } from '../lib/tc9';
import { CopyButton } from './CopyButton';

export function PlayerAccount({ realm, csrf }: { realm: Realm; csrf: string }) {
  const [account, setAccount] = useState<GameAccount | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const busy = useRef(false);
  const path = `v1/realms/${encodeURIComponent(realm.id)}/account`;
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await request<GameAccount>(path, { signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }
        setAccount(current);
        setError('');
        if (current.state === 'pending') {
          timer = setTimeout(() => {
            void poll();
          }, 3000);
        }
      } catch (failure) {
        if (controller.signal.aborted || (failure instanceof APIError && failure.status === 404)) {
          return;
        }
        setError(failure instanceof Error ? failure.message : 'Game account could not be loaded.');
        timer = setTimeout(
          () => {
            void poll();
          },
          Math.max(15000, failure instanceof APIError ? failure.retryAfter * 1000 : 0),
        );
      }
    };
    void poll();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [path, pending]);
  useEffect(() => {
    if (!retryAt) {
      return;
    }
    const timer = setTimeout(() => setRetryAt(0), Math.max(0, retryAt - Date.now()));
    return () => clearTimeout(timer);
  }, [retryAt]);
  function create() {
    if (busy.current || Date.now() < retryAt) {
      return;
    }
    busy.current = true;
    setPending(true);
    setError('');
    void request<GameAccount>(path, { method: 'POST', data: {}, csrf })
      .then(setAccount)
      .catch((failure: unknown) => {
        setError(
          failure instanceof Error ? failure.message : 'Account creation could not be confirmed. Retry safely to recover the same account.',
        );
        const delay = failure instanceof APIError ? failure.retryAfter * 1000 : 0;
        if (delay) {
          setRetryAt(Date.now() + delay);
        }
      })
      .finally(() => {
        busy.current = false;
        setPending(false);
      });
  }
  return (
    <section className="player-account" aria-label="Your game account">
      <h5>Your game account for this PR realm</h5>
      <p>Each visitor gets a separate account. This browser recovers yours automatically; no Test Hub sign-in is required.</p>
      {error && (
        <p role="alert" className="tc9-error">
          {error}
        </p>
      )}
      {account?.state === 'ready' ? (
        <dl className="player-account__details">
          <dt>Account</dt>
          <dd>
            <code>{account.username}</code>
            <CopyButton label="Copy account" text={account.username ?? ''} />
          </dd>
          <dt>Password</dt>
          <dd>
            <code>{show ? account.password : '••••••••••'}</code>
            <button type="button" className="button button--quiet" onClick={() => setShow(!show)}>
              {show ? 'Hide password' : 'Show password'}
            </button>
            <CopyButton label="Copy password" text={account.password ?? ''} />
          </dd>
        </dl>
      ) : (
        <>
          {account?.state === 'pending' && (
            <p role="status">Creating your account and test characters… You can close this dialog and come back.</p>
          )}
          {account?.state === 'failed' && <p className="tc9-error">{account.error}</p>}
          <button
            type="button"
            className="button"
            disabled={pending || account?.state === 'pending' || realm.state !== 'running' || retryAt > 0}
            onClick={create}
          >
            {pending || account?.state === 'pending'
              ? 'Creating your game account…'
              : retryAt > 0
                ? 'Retry shortly…'
                : account?.state === 'failed'
                  ? 'Retry my game account'
                  : 'Get my game account'}
          </button>
          {realm.state !== 'running' && <p>Start the realm to create your game account.</p>}
        </>
      )}
    </section>
  );
}
