import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { formatInFacilityTz } from '../time';
import { formatUsDate } from '../usDate';

type PortalCard = {
  relationship: string;
  resident: {
    id: string;
    firstName: string;
    lastName: string;
    room: string | null;
    photoUrl: string | null;
    allergies: string[];
  };
  medsGivenToday: Array<{
    id: string;
    drugName: string;
    dose: string;
    route: string;
    administeredAt: string;
  }>;
  notes: Array<{
    id: string;
    noteType: string;
    body: string;
    occurredAt: string;
    author: { firstName: string; lastName: string; role: string };
  }>;
  incidents: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    category: string;
    occurredAt: string;
  }>;
};

type Portal = {
  facilityName: string;
  timezone: string;
  today: string;
  cards: PortalCard[];
};

export function FamilyPortalPage({ timezone }: { timezone: string }) {
  const { user } = useAuth();
  const [portal, setPortal] = useState<Portal | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [residentId, setResidentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  async function load() {
    setError('');
    try {
      const data = await api<Portal>('/family/portal');
      setPortal(data);
      if (!residentId && data.cards[0]) setResidentId(data.cards[0].resident.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load family portal');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!residentId || !message.trim()) return;
    setBusy(true);
    setError('');
    setToast('');
    try {
      await api('/family/messages', {
        method: 'POST',
        body: JSON.stringify({ residentId, body: message.trim() }),
      });
      setMessage('');
      setToast('Message sent to the care team.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="family-portal page-enter">
      <header className="home-hero">
        <p className="home-eyebrow">{user?.tenantName || portal?.facilityName}</p>
        <h1 className="page-title">Family portal</h1>
        <p className="page-sub">
          Today’s medications given, care notes, and a direct message to the nurse — for your linked
          residents only.
          {portal?.today ? ` · ${formatUsDate(portal.today)}` : ''}
        </p>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {toast ? <div className="toast toast-success">{toast}</div> : null}

      {!portal ? <p className="empty">Loading…</p> : null}
      {portal && portal.cards.length === 0 ? (
        <p className="empty">No residents are linked to this family account yet. Ask the facility staff.</p>
      ) : null}

      {portal?.cards.map((card) => (
        <section key={card.resident.id} className="family-card">
          <div className="family-card-head">
            {card.resident.photoUrl ? (
              <img
                className="family-photo"
                src={card.resident.photoUrl}
                alt={`${card.resident.firstName} ${card.resident.lastName}`}
              />
            ) : (
              <div className="family-photo family-photo-placeholder">
                {card.resident.firstName[0]}
                {card.resident.lastName[0]}
              </div>
            )}
            <div>
              <h2>
                {card.resident.lastName}, {card.resident.firstName}
              </h2>
              <div className="meta">
                {card.relationship}
                {card.resident.room ? ` · Rm ${card.resident.room}` : ''}
              </div>
              <div className="meta">
                Allergies:{' '}
                {card.resident.allergies.length
                  ? card.resident.allergies.join(', ')
                  : 'None listed'}
              </div>
              <Link className="btn secondary" to={`/residents/${card.resident.id}`}>
                Open chart
              </Link>
            </div>
          </div>

          <h3>Medications given today</h3>
          <div className="stack">
            {card.medsGivenToday.length === 0 ? (
              <p className="empty">No doses recorded as given yet today.</p>
            ) : (
              card.medsGivenToday.map((m) => (
                <div key={m.id} className="home-row" style={{ cursor: 'default' }}>
                  <div>
                    <strong>
                      {m.drugName} {m.dose}
                    </strong>
                    <div className="meta">
                      {m.route} · {formatInFacilityTz(m.administeredAt, timezone, { timeStyle: 'short' })}
                    </div>
                  </div>
                  <span className="badge ok">Given</span>
                </div>
              ))
            )}
          </div>

          <h3>Care team messages</h3>
          <div className="stack">
            {card.notes.length === 0 ? <p className="empty">No notes yet.</p> : null}
            {card.notes.map((n) => (
              <div key={n.id} className="note-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="meta">
                  {n.noteType} · {n.author.firstName} {n.author.lastName} ·{' '}
                  {formatInFacilityTz(n.occurredAt, timezone)}
                </div>
                <p style={{ margin: '0.35rem 0 0', whiteSpace: 'pre-wrap' }}>
                  {n.body.length > 320 ? `${n.body.slice(0, 320)}…` : n.body}
                </p>
              </div>
            ))}
          </div>

          <h3>Recent reports</h3>
          <div className="stack">
            {card.incidents.length === 0 ? <p className="empty">No reports.</p> : null}
            {card.incidents.map((i) => (
              <div key={i.id} className="home-row" style={{ cursor: 'default' }}>
                <div>
                  <strong>{i.title}</strong>
                  <div className="meta">
                    {i.category} · {i.severity} · {formatInFacilityTz(i.occurredAt, timezone)}
                  </div>
                </div>
                <span className={`badge ${i.status === 'CLOSED' ? 'ok' : 'warn'}`}>{i.status}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      {portal && portal.cards.length > 0 ? (
        <form className="family-message-panel" onSubmit={sendMessage}>
          <h2>Message the nurse</h2>
          <p className="meta">Your note is saved to the resident chart as a care-team communication.</p>
          <div className="field">
            <label>Resident</label>
            <select value={residentId} onChange={(e) => setResidentId(e.target.value)}>
              {portal.cards.map((c) => (
                <option key={c.resident.id} value={c.resident.id}>
                  {c.resident.lastName}, {c.resident.firstName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Message</label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask a question or share an update for the care team…"
              required
            />
          </div>
          <button className="btn" type="submit" disabled={busy || !message.trim()}>
            {busy ? 'Sending…' : 'Send message'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
