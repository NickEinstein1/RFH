import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

const HERO_SRC = '/images/rfh-login-care-hero.jpg';

type AuthFrameProps = {
  visualLine: string;
  children: ReactNode;
};

/** Shared layout for sign-in, sign-up, and password reset. */
export function AuthFrame({ visualLine, children }: AuthFrameProps) {
  return (
    <div className="auth-shell">
      <aside className="auth-shell__visual" aria-hidden="true">
        <img
          className="auth-shell__photo"
          src={HERO_SRC}
          alt=""
          width={1600}
          height={900}
          decoding="async"
          fetchPriority="high"
        />
        <div className="auth-shell__veil" />
        <div className="auth-shell__caption">
          <Link to="/" className="auth-shell__brand">
            RFH Care
          </Link>
          <p className="auth-shell__line">{visualLine}</p>
        </div>
      </aside>
      <main className="auth-shell__panel">{children}</main>
    </div>
  );
}

export function PasswordHint() {
  return (
    <p className="field-hint">
      Use 12+ characters with upper, lower, number, and symbol.
    </p>
  );
}
