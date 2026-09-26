import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';

type Facility = {
  id: string;
  name: string;
  pharmacyName: string | null;
  pharmacyPhone: string | null;
  pharmacyFax: string | null;
  pharmacyNpi: string | null;
  facilityFax: string | null;
  faxEnabled: boolean;
};

type CatalogItem = {
  network: string;
  displayName: string;
  phone?: string;
  fax?: string;
  notes: string;
};

type Connection = {
  id: string;
  network: string;
  displayName: string;
  npi: string | null;
  phone: string | null;
  fax: string | null;
  isDefault: boolean;
  isActive: boolean;
};

type FaxJob = {
  id: string;
  toFaxNumber: string;
  subject: string;
  documentType: string;
  status: string;
  provider: string;
  createdAt: string;
  errorMessage?: string | null;
};

type StatusPayload = {
  faxProvider: string;
  faxLive: boolean;
  facility: Facility;
  pharmacyCatalog: CatalogItem[];
  connections: Connection[];
  recentFaxes: FaxJob[];
};

export function IntegrationsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [facilityForm, setFacilityForm] = useState<Partial<Facility>>({});
  const [faxForm, setFaxForm] = useState({
    toFaxNumber: '',
    subject: '',
    coverNote: '',
  });
  const [connectNetwork, setConnectNetwork] = useState('LINCOLN');

  async function load() {
    try {
      const status = await api<StatusPayload>('/integrations/status');
      setData(status);
      setFacilityForm(status.facility || {});
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load integrations');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function saveFacility(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/integrations/facility', {
        method: 'PATCH',
        body: JSON.stringify({
          pharmacyName: facilityForm.pharmacyName || null,
          pharmacyPhone: facilityForm.pharmacyPhone || null,
          pharmacyFax: facilityForm.pharmacyFax || null,
          pharmacyNpi: facilityForm.pharmacyNpi || null,
          facilityFax: facilityForm.facilityFax || null,
          faxEnabled: Boolean(facilityForm.faxEnabled),
        }),
      });
      setToast('Facility pharmacy / fax settings saved');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function connectFromCatalog() {
    const item = data?.pharmacyCatalog.find((c) => c.network === connectNetwork);
    if (!item) return;
    setBusy(true);
    try {
      await api('/integrations/pharmacies/connections', {
        method: 'POST',
        body: JSON.stringify({
          network: item.network,
          displayName: item.displayName,
          phone: item.phone || '',
          fax: item.fax || '',
          isDefault: !(data?.connections?.length),
          isActive: true,
        }),
      });
      setToast(`Connected ${item.displayName}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed');
    } finally {
      setBusy(false);
    }
  }

  async function removeConnection(id: string) {
    setBusy(true);
    try {
      await api(`/integrations/pharmacies/connections/${id}`, { method: 'DELETE' });
      setToast('Pharmacy connection removed');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setBusy(false);
    }
  }

  async function sendTestFax(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/integrations/fax/send', {
        method: 'POST',
        body: JSON.stringify({
          toFaxNumber: faxForm.toFaxNumber,
          subject: faxForm.subject || 'RFH Care test fax',
          documentType: 'TEST',
          coverNote: faxForm.coverNote || 'Test fax from RFH Care integrations.',
        }),
      });
      setToast('Fax queued');
      setFaxForm({ toFaxNumber: '', subject: '', coverNote: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fax failed');
    } finally {
      setBusy(false);
    }
  }

  if (!['OWNER', 'ADMIN'].includes(user?.role || '')) {
    return (
      <div>
        <h1 className="page-title">Integrations</h1>
        <p className="page-sub">Owner or admin access is required to manage fax and pharmacy connections.</p>
      </div>
    );
  }

  return (
    <div className="integrations-page">
      <h1 className="page-title">Integrations</h1>
      <p className="page-sub">
        Configure outbound fax and market pharmacy connections for {user?.tenantName || 'this home'}.
        Loving Garden and other homes are equal tenants — settings are per facility.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {toast ? <div className="toast toast-success">{toast}</div> : null}

      <section className="download-panel">
        <h2>Fax provider</h2>
        <p className="meta">
          Active provider: <strong>{data?.faxProvider || '…'}</strong>
          {data?.faxLive ? ' (live credentials detected)' : ' (dev noop — set Telnyx or Twilio env keys for live fax)'}
        </p>
        <form className="tpl-grid" onSubmit={sendTestFax}>
          <div className="field">
            <label>To fax number</label>
            <input
              value={faxForm.toFaxNumber}
              onChange={(e) => setFaxForm({ ...faxForm, toFaxNumber: e.target.value })}
              placeholder="2535550100"
              required
            />
          </div>
          <div className="field">
            <label>Subject</label>
            <input
              value={faxForm.subject}
              onChange={(e) => setFaxForm({ ...faxForm, subject: e.target.value })}
              placeholder="CBHS note / Rx cover"
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Cover note</label>
            <textarea
              value={faxForm.coverNote}
              onChange={(e) => setFaxForm({ ...faxForm, coverNote: e.target.value })}
              rows={3}
            />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            Queue fax
          </button>
        </form>
      </section>

      <section className="download-panel">
        <h2>Facility pharmacy defaults</h2>
        <p className="meta">Shown on MAR footer and used when no pharmacy connection is selected.</p>
        <form className="tpl-grid" onSubmit={saveFacility}>
          {(
            [
              ['pharmacyName', 'Pharmacy name'],
              ['pharmacyPhone', 'Pharmacy phone'],
              ['pharmacyFax', 'Pharmacy fax'],
              ['pharmacyNpi', 'Pharmacy NPI'],
              ['facilityFax', 'Facility outbound fax'],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                value={(facilityForm[key] as string) || ''}
                onChange={(e) => setFacilityForm({ ...facilityForm, [key]: e.target.value })}
              />
            </div>
          ))}
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={Boolean(facilityForm.faxEnabled)}
              onChange={(e) => setFacilityForm({ ...facilityForm, faxEnabled: e.target.checked })}
            />
            Enable fax for this facility
          </label>
          <button className="btn" type="submit" disabled={busy}>
            Save facility settings
          </button>
        </form>
      </section>

      <section className="download-panel">
        <h2>Market pharmacies</h2>
        <p className="meta">Connect Lincoln, Ready Meds, retail chains, PioneerRx/QS1, or Surescripts eRx.</p>
        <div className="download-controls">
          <select value={connectNetwork} onChange={(e) => setConnectNetwork(e.target.value)}>
            {(data?.pharmacyCatalog || []).map((c) => (
              <option key={c.network} value={c.network}>
                {c.displayName}
              </option>
            ))}
          </select>
          <button className="btn secondary" type="button" disabled={busy} onClick={() => void connectFromCatalog()}>
            Connect selected
          </button>
        </div>
        <ul className="integrations-list">
          {(data?.pharmacyCatalog || []).map((c) => (
            <li key={c.network}>
              <strong>{c.displayName}</strong>
              <span className="meta"> — {c.notes}</span>
            </li>
          ))}
        </ul>
        <h3>Connected for this home</h3>
        {!data?.connections?.length ? (
          <p className="meta">No pharmacy connections yet.</p>
        ) : (
          <ul className="integrations-list">
            {data.connections.map((c) => (
              <li key={c.id} className="integrations-connection">
                <div>
                  <strong>{c.displayName}</strong>
                  {c.isDefault ? <span className="sync-chip ok">Default</span> : null}
                  <div className="meta">
                    {c.network}
                    {c.phone ? ` · ${c.phone}` : ''}
                    {c.fax ? ` · fax ${c.fax}` : ''}
                  </div>
                </div>
                <button className="btn ghost" type="button" disabled={busy} onClick={() => void removeConnection(c.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="download-panel">
        <h2>Recent faxes</h2>
        {!data?.recentFaxes?.length ? (
          <p className="meta">No fax jobs yet.</p>
        ) : (
          <div className="tpl-table-wrap">
            <table className="tpl-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>To</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Provider</th>
                </tr>
              </thead>
              <tbody>
                {data.recentFaxes.map((j) => (
                  <tr key={j.id}>
                    <td>{new Date(j.createdAt).toLocaleString()}</td>
                    <td>{j.toFaxNumber}</td>
                    <td>{j.subject}</td>
                    <td>
                      {j.status}
                      {j.errorMessage ? <div className="meta">{j.errorMessage}</div> : null}
                    </td>
                    <td>{j.provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
