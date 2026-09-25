import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

const HERO_SRC = '/images/rfh-login-care-hero.jpg';

export function LandingPage() {
  const { user } = useAuth();
  if (user) return <Navigate to="/today" replace />;

  return (
    <div className="landing">
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
        <nav className="landing-top-actions">
          <Link className="btn ghost landing-link" to="/login">
            Sign in
          </Link>
          <Link className="btn landing-cta" to="/signup">
            Sign up
          </Link>
        </nav>
      </header>

      <main className="landing-main">
        <p className="landing-brand-hero">RFH Care</p>
        <h1 className="landing-title">Presence for every med pass</h1>
        <p className="landing-copy">
          Calm eMAR, negotiated care plans, and family trust — built for adult family homes.
        </p>
        <div className="landing-actions">
          <Link className="btn landing-cta landing-cta-lg" to="/signup">
            Create your home
          </Link>
          <Link className="btn secondary landing-cta-lg" to="/login">
            Sign in
          </Link>
        </div>
      </main>

      <section className="landing-strip" aria-label="What RFH Care supports">
        <div className="landing-strip-item">
          <strong>Med pass</strong>
          <span>Due boards, MAR, and offline-ready charting</span>
        </div>
        <div className="landing-strip-item">
          <strong>Care plans</strong>
          <span>Negotiated plans that match survey forms</span>
        </div>
        <div className="landing-strip-item">
          <strong>Family trust</strong>
          <span>Min-necessary portal for loved ones</span>
        </div>
      </section>
    </div>
  );
}
