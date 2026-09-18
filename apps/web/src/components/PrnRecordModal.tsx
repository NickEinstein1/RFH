import { useState, type FormEvent } from 'react';
import {
  BMI_CODES,
  MSE_CODES,
  RESULT_CODES,
  emptyPrnForm,
  prnPayloadFromForm,
  validatePrnForm,
  type PrnFormValues,
} from '../marBackGuides';

type Props = {
  medication: string;
  dose: string;
  defaultRoute: string;
  patientName: string;
  facilityName: string;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (fields: ReturnType<typeof prnPayloadFromForm>) => Promise<void> | void;
};

export function PrnRecordModal({
  medication,
  dose,
  defaultRoute,
  patientName,
  facilityName,
  busy,
  onCancel,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<PrnFormValues>(() => ({
    ...emptyPrnForm(),
    prnRouteSite: defaultRoute || 'PO',
  }));
  const [error, setError] = useState('');

  function set<K extends keyof PrnFormValues>(key: K, value: PrnFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = validatePrnForm(form);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    await onSubmit(prnPayloadFromForm(form));
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-panel prn-modal"
        role="dialog"
        aria-labelledby="prn-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="prn-modal-header">
          <div>
            <h2 id="prn-modal-title">PRN log — Back of MAR</h2>
            <p className="meta" style={{ margin: 0 }}>
              {facilityName} · {patientName}
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Close
          </button>
        </header>

        <div className="prn-modal-med">
          <strong>{medication}</strong>
          <span className="meta">Dose: {dose}</span>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <form className="prn-form" onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="prn-route">ROUTE / SITE *</label>
            <input
              id="prn-route"
              value={form.prnRouteSite}
              onChange={(e) => set('prnRouteSite', e.target.value)}
              placeholder="e.g. PO, TOP left arm"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="prn-reason">REASON *</label>
            <input
              id="prn-reason"
              value={form.prnReason}
              onChange={(e) => set('prnReason', e.target.value)}
              placeholder="Why was this PRN given?"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="prn-pain">Pain score (0–10)</label>
            <select
              id="prn-pain"
              value={form.prnPainScore}
              onChange={(e) => set('prnPainScore', e.target.value)}
            >
              <option value="">—</option>
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={String(i)}>
                  {i}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="prn-bmi">BMI *if applies</label>
            <select
              id="prn-bmi"
              value={form.prnBmi}
              onChange={(e) => set('prnBmi', e.target.value)}
            >
              <option value="">—</option>
              {BMI_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}) {c.label}
                </option>
              ))}
            </select>
          </div>

          {form.prnBmi === 'G' || form.prnBmi === 'H' ? (
            <div className="field">
              <label htmlFor="prn-bmi-other">BMI other (describe) *</label>
              <input
                id="prn-bmi-other"
                value={form.prnBmiOther}
                onChange={(e) => set('prnBmiOther', e.target.value)}
                required
              />
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="prn-result">RESULT / OUTCOMES *</label>
            <select
              id="prn-result"
              value={form.prnResult}
              onChange={(e) => set('prnResult', e.target.value)}
              required
            >
              <option value="">Select…</option>
              {RESULT_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} = {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="prn-mse">MSE *if applies</label>
            <select
              id="prn-mse"
              value={form.prnMse}
              onChange={(e) => set('prnMse', e.target.value)}
            >
              <option value="">—</option>
              {MSE_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}) {c.label}
                </option>
              ))}
            </select>
          </div>

          {form.prnMse === 'L' ? (
            <div className="field">
              <label htmlFor="prn-mse-other">MSE other (describe) *</label>
              <input
                id="prn-mse-other"
                value={form.prnMseOther}
                onChange={(e) => set('prnMseOther', e.target.value)}
                required
              />
            </div>
          ) : null}

          <p className="meta">
            Date, time, medication, dose, and signature are recorded from your account when you
            save.
          </p>

          <div className="mar-actions" style={{ marginTop: '0.5rem' }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Record PRN ✓'}
            </button>
            <button className="btn ghost" type="button" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
