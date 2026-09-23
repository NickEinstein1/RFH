import type { SafetyWarning } from '../safetyTypes';

export function SafetyConfirmModal({
  warnings,
  onConfirm,
  onCancel,
  busy,
}: {
  warnings: SafetyWarning[];
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="safety-title">
      <div className="modal-panel safety-modal">
        <h2 id="safety-title">Safety check</h2>
        <p className="meta">Review these soft warnings before giving. Care is never hard-blocked.</p>
        <ul className="safety-list">
          {warnings.map((w) => (
            <li key={w.code + w.message} className={w.severity === 'critical' ? 'critical' : 'warn'}>
              <strong>{w.code}</strong> — {w.message}
            </li>
          ))}
        </ul>
        <div className="mar-actions" style={{ marginTop: '1rem' }}>
          <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Recording…' : 'Acknowledge & give'}
          </button>
        </div>
      </div>
    </div>
  );
}
