import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

const HERO_SRC = '/images/rfh-login-care-hero.jpg';

export function LandingPage() {
  const { user } = useAuth();
  if (user) return <Navigate to="/today" replace />;

  return (
    <div className="landing">
      {/* —— First viewport: brand + one promise + CTAs + full-bleed hero —— */}
      <section className="landing-viewport">
        <div className="landing-hero" aria-hidden="true">
          <img
            className="landing-hero__photo"
            src={HERO_SRC}
            alt=""
            width={1280}
            height={720}
            decoding="async"
            fetchPriority="high"
          />
          <div className="landing-hero__veil" />
          <div className="landing-hero__grain" />
        </div>

        <header className="landing-top">
          <div className="landing-brand">RFH Care</div>
          <nav className="landing-top-actions" aria-label="Account">
            <Link className="btn ghost landing-link" to="/login">
              Sign in
            </Link>
            <Link className="btn landing-cta" to="/signup">
              Start free
            </Link>
          </nav>
        </header>

        <main className="landing-main">
          <p className="landing-brand-hero">RFH Care</p>
          <h1 className="landing-title">Adult family home charting, built for trust</h1>
          <p className="landing-copy">
            eMAR, care plans, and family access in one secure workspace for your home.
          </p>
          <div className="landing-actions">
            <Link className="btn landing-cta landing-cta-lg" to="/signup">
              Create your home
            </Link>
            <Link className="btn secondary landing-cta-lg landing-cta-quiet" to="/login">
              Sign in with email
            </Link>
          </div>
        </main>
      </section>

      {/* —— Security: one job —— */}
      <section className="landing-section landing-security" aria-labelledby="security-heading">
        <h2 id="security-heading">Security is the operating model</h2>
        <p className="landing-section-lede">
          Every home is isolated. Access is role-based. Sensitive fields and sessions are protected by
          design—not bolted on later.
        </p>
        <ul className="landing-security-list">
          <li>
            <strong>Tenant isolation</strong>
            <span>Postgres row-level security scoped to your facility</span>
          </li>
          <li>
            <strong>PHI field encryption</strong>
            <span>Selected clinical fields encrypted at the application layer</span>
          </li>
          <li>
            <strong>Hardened sign-in</strong>
            <span>Email-bound accounts, lockout after failed attempts, idle session timeout</span>
          </li>
          <li>
            <strong>Audit trail</strong>
            <span>Immutable logs for chart access, med pass, and administrative actions</span>
          </li>
        </ul>
      </section>

      {/* —— Product: one job —— */}
      <section className="landing-section landing-product" aria-labelledby="product-heading">
        <h2 id="product-heading">What your team uses every day</h2>
        <p className="landing-section-lede">
          One product for the floor, the nurse, and the family—without duplicating the same promise in
          three places.
        </p>
        <div className="landing-product-grid">
          <div>
            <strong>Med pass &amp; MAR</strong>
            <p>Due boards, monthly MAR, offline-ready recording, and pharmacy fax hooks.</p>
          </div>
          <div>
            <strong>Care &amp; notes</strong>
            <p>Negotiated care plans and CBHS behavior notes that export like survey forms.</p>
          </div>
          <div>
            <strong>Family portal</strong>
            <p>Minimum-necessary visibility for loved ones—never full clinical dump by default.</p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>RFH Care</span>
        <nav>
          <Link to="/login">Sign in</Link>
          <Link to="/signup">Create account</Link>
        </nav>
      </footer>
    </div>
  );
}
