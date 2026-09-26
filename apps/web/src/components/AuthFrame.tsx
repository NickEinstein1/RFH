import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

const HERO_SRC = '/images/rfh-login-care-hero.jpg';

type AuthFrameProps = {
  /** Short line under the brand on the visual pane */
  visualLine: string;
  children: ReactNode;
};

/**
 * Single visual system for sign-in, sign-up, and password reset.
 * Brand on the hero; forms stay quiet and single-purpose.
 */
export function AuthFrame({ visualLine, children }: AuthFrameProps) {
  return (
    <div className="auth-frame">
      <aside className="auth-frame-visual" aria-hidden="true">
        <img
          className="auth-frame-photo"
          src={HERO_SRC}
          alt=""
          width={1280}
          height={720}
          decoding="async"
          fetchPriority="high"
        />
        <div className="auth-frame-veil" />
        <div className="auth-frame-copy">
          <Link to="/" className="auth-frame-brand">
            RFH Care
          </Link>
          <p className="auth-frame-line">{visualLine}</p>
        </div>
      </aside>
      <div className="auth-frame-panel">{children}</div>
    </div>
  );
}

export function PasswordHint() {
  return (
    <p className="field-hint">
      12+ characters with upper, lower, number, and symbol. Stored hashed; never emailed in plain text.
    </p>
  );
}
