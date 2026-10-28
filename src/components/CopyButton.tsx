import { useEffect, useState } from 'react';

/** How long the button says "Copied" (or "Copy failed") before showing its label again. */
const FEEDBACK_MS = 1800;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API refused (insecure context, permissions): fall back on a hidden textarea.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

interface Props {
  text: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function CopyButton({ text, label = 'Copy', className = 'button button--quiet', disabled }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') {
      return;
    }

    const timer = window.setTimeout(() => setState('idle'), FEEDBACK_MS);

    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    const copied = await copyText(text);

    setState(copied ? 'copied' : 'failed');
  };

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={() => {
        void copy();
      }}
    >
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}</span>
    </button>
  );
}
