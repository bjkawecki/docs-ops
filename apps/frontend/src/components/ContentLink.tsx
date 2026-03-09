import type { ComponentPropsWithoutRef } from 'react';
import { Link } from 'react-router-dom';

const CONTENT_LINK_CLASS = 'app-content-link';

/**
 * Shared link for card content and "Recently viewed" lists. Styling (primary color, underline)
 * is defined in links.css via .app-content-link so all such links look the same.
 */
export function ContentLink({
  className,
  style,
  to,
  children,
  ...rest
}: ComponentPropsWithoutRef<typeof Link>) {
  const combinedClassName = [CONTENT_LINK_CLASS, className].filter(Boolean).join(' ') || undefined;
  return (
    <Link to={to} className={combinedClassName} style={style} {...rest}>
      {children}
    </Link>
  );
}
