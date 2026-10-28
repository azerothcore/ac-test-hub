import type { AnchorHTMLAttributes } from 'react';

/** A link that opens in a new tab, without giving the new page a handle on this one. */
export function ExternalLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} target="_blank" rel="noreferrer noopener" />;
}
