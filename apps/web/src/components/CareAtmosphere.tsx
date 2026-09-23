/** Soft ambient layer for a calm adult-family-home care atmosphere. */
export function CareAtmosphere({ variant = 'app' }: { variant?: 'app' | 'login' }) {
  return (
    <div className={`care-atmosphere care-atmosphere--${variant}`} aria-hidden="true">
      <div className="care-atmosphere__wash" />
      <div className="care-atmosphere__orb care-atmosphere__orb--sage" />
      <div className="care-atmosphere__orb care-atmosphere__orb--mist" />
      <div className="care-atmosphere__orb care-atmosphere__orb--dawn" />
      <div className="care-atmosphere__horizon" />
      <div className="care-atmosphere__grain" />
    </div>
  );
}
