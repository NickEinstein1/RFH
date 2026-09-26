import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

const HERO_SRC = '/images/rfh-login-care-hero.jpg';

export function LandingPage() {
  const { user } = useAuth();
  if (user) return <Navigate to="/today" replace />;

  return (
    <div className="landing">
      <section className="landing-hero-stage">
        <div className="landing-hero-media" aria-hidden="true">
          <img
            className="landing-hero-media__photo"
            src={HERO_SRC}
            alt=""
            width={1600}
            height={900}
            decoding="async"
            fetchPriority="high"
          />
          <div className="landing-hero-media__veil" />
        </div>

        <header className="landing-nav">
          <span className="landing-nav__mark" aria-hidden="true">
            RFH Care
          </span>
          <nav className="landing-nav__actions" aria-label="Account">
            <Link className="landing-nav__link" to="/login">
              Sign in
            </Link>
            <Link className="landing-nav__cta" to="/signup">
              Create account
            </Link>
          </nav>
        </header>

        <div className="landing-hero-copy">
          <p className="landing-hero-copy__brand">RFH Care</p>
          <h1 className="landing-hero-copy__title">Presence for every med pass</h1>
          <p className="landing-hero-copy__lede">
            Calm eMAR and care charting for adult family homes—secured to your facility email.
          </p>
          <div className="landing-hero-copy__actions">
            <Link className="landing-btn landing-btn--primary" to="/signup">
              Create your home
            </Link>
            <Link className="landing-btn landing-btn--ghost" to="/login">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-band landing-band--security" aria-labelledby="security-heading">
        <div className="landing-band__inner">
          <h2 id="security-heading">Built around security</h2>
          <p className="landing-band__lede">
            Each home stays isolated. Roles limit access. Sessions time out. Sensitive chart fields
            are encrypted.
          </p>
          <ul className="landing-security-grid">
            <li>
              <strong>Facility isolation</strong>
              <span>Row-level security keeps another home’s charts out of reach.</span>
            </li>
            <li>
              <strong>Email-bound sign-in</strong>
              <span>Your email opens the right facility—no picking homes at login.</span>
            </li>
            <li>
              <strong>Session controls</strong>
              <span>Idle timeout, lockout after failed attempts, hashed passwords.</span>
            </li>
            <li>
              <strong>Audit trail</strong>
              <span>Immutable records for access, med pass, and administrative changes.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="landing-band" aria-labelledby="work-heading">
        <div className="landing-band__inner">
          <h2 id="work-heading">Day-to-day work</h2>
          <p className="landing-band__lede">
            Med pass, care plans, and family visibility in one place.
          </p>
          <div className="landing-work">
            <div>
              <strong>Med pass &amp; MAR</strong>
              <p>Due boards, monthly MAR, and offline-ready recording.</p>
            </div>
            <div>
              <strong>Care &amp; notes</strong>
              <p>Negotiated care plans and CBHS notes ready for export.</p>
            </div>
            <div>
              <strong>Family portal</strong>
              <p>Minimum-necessary updates for loved ones.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-foot">
        <span>RFH Care</span>
        <nav aria-label="Footer">
          <Link to="/login">Sign in</Link>
          <Link to="/signup">Create account</Link>
        </nav>
      </footer>
    </div>
  );
}
