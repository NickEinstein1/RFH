import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

type MarCell = {
  day: number;
  scheduledAt: string;
  mark: '✓' | 'X' | '-';
  outcome: string | null;
  administrationId: string | null;
  initials: string | null;
};

type MarRow = {
  order: {
    id: string;
    drugName: string;
    dose: string;
    route: string;
    frequency: string;
    instructions: string | null;
    brand: string | null;
    rxNumber: string | null;
    imprint: string | null;
    categoryLabel: string | null;
    prescriber: string | null;
    highAlert: boolean;
    isPrn: boolean;
    startDate: string;
  };
  timeRows: { time: string; cells: MarCell[] }[];
};

type MarSheet = {
  facilityName: string;
  month: string;
  dayNumbers: number[];
  legend: { given: string; notGiven: string; blankOrMissed: string; note: string };
  resident: {
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    mrn: string | null;
    allergies: string[];
    room: string | null;
  };
  rows: MarRow[];
};

type ResidentOption = {
  id: string;
  firstName: string;
  lastName: string;
  room: string | null;
};

function currentMonthYm() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function patientLabel(r: { lastName: string; firstName: string }) {
  return `${r.lastName}, ${r.firstName}`;
}

export function MarSheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const facilityName = user?.tenantName || '';
  const [params, setParams] = useSearchParams();
  const month = params.get('month') || currentMonthYm();
  const [sheet, setSheet] = useState<MarSheet | null>(null);
  const [residents, setResidents] = useState<ResidentOption[]>([]);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    orderId: string;
    time: string;
    cell: MarCell;
    drugName: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    try {
      const [data, census] = await Promise.all([
        api<MarSheet>(`/emar/mar-sheet?residentId=${id}&month=${encodeURIComponent(month)}`),
        api<ResidentOption[]>('/residents'),
      ]);
      setSheet(data);
      setResidents(census);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load MAR');
    }
  }, [id, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const todayDay = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (ym !== month) return null;
    return now.getDate();
  }, [month]);

  const displayFacility = facilityName || sheet?.facilityName || 'Facility';
  const displayPatient = sheet
    ? patientLabel(sheet.resident)
    : residents.find((r) => r.id === id)
      ? patientLabel(residents.find((r) => r.id === id)!)
      : 'Patient';

  async function mark(outcome: 'GIVEN' | 'REFUSED' | 'MISSED') {
    if (!selected) return;
    const key = `${selected.orderId}-${selected.cell.day}-${selected.time}-${outcome}`;
    setBusyKey(key);
    setError('');
    try {
      await api('/emar/administrations', {
        method: 'POST',
        body: JSON.stringify({
          orderId: selected.orderId,
          scheduledAt: selected.cell.scheduledAt,
          outcome,
          administeredAt: outcome === 'GIVEN' ? new Date().toISOString() : undefined,
          clientEventId: crypto.randomUUID(),
          notes:
            outcome === 'REFUSED'
              ? 'Rejected / not given'
              : outcome === 'MISSED'
                ? 'Not given at all'
                : undefined,
        }),
      });
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update MAR cell');
    } finally {
      setBusyKey(null);
    }
  }

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    setParams({ month: next });
  }

  function onPatientChange(residentId: string) {
    if (!residentId || residentId === id) return;
    navigate(`/residents/${residentId}/mar?month=${encodeURIComponent(month)}`);
  }

  if (!sheet && !error) return <p className="empty">Loading MAR…</p>;

  return (
    <div className="mar-page">
      <Link to={id ? `/residents/${id}` : '/'} className="meta">
        ← Resident
      </Link>

      <div className="mar-account-bar">
        <div>
          <div className="meta">Logged-in facility</div>
          <strong className="mar-account-facility">{displayFacility}</strong>
        </div>
        <div className="mar-patient-picker">
          <label htmlFor="mar-patient" className="meta">
            Patient
          </label>
          <select
            id="mar-patient"
            value={id || ''}
            onChange={(e) => onPatientChange(e.target.value)}
          >
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {patientLabel(r)}
                {r.room ? ` · Rm ${r.room}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mar-toolbar">
        <button className="btn secondary" type="button" onClick={() => shiftMonth(-1)}>
          ← Prev
        </button>
        <h1 className="page-title" style={{ margin: 0 }}>
          {monthLabel(month)}
        </h1>
        <button className="btn secondary" type="button" onClick={() => shiftMonth(1)}>
          Next →
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {sheet ? (
        <div className="mar-sheet">
          <header className="mar-header">
            <div>
              <div className="mar-title">Medication Administration Record</div>
              <div className="mar-resident-name">{displayPatient}</div>
              <div className="mar-resident">
                DOB: {sheet.resident.dateOfBirth}
                {' · '}Patient No: {sheet.resident.mrn || '—'}
                {sheet.resident.room ? ` · Room ${sheet.resident.room}` : ''}
              </div>
              <div className="mar-meta">
                Allergies:{' '}
                {sheet.resident.allergies.length
                  ? sheet.resident.allergies.join(', ')
                  : 'No Known Allergies'}
              </div>
            </div>
            <div className="mar-facility">
              <div className="meta">Facility</div>
              <strong className="mar-facility-name">{displayFacility}</strong>
              <div className="meta">DO NOT REMOVE IF ATTACHED TO MED PACK</div>
            </div>
          </header>

          <div className="mar-legend">
            Key: <span className="mar-mark given">✓</span> Given (Record) ·{' '}
            <span className="mar-mark refused">X</span> Not given (Reject) ·{' '}
            <span className="mar-mark blank">-</span> Not given at all · Initials = person administering
          </div>

          {sheet.rows.length === 0 ? (
            <p className="empty">No active medication orders for this patient this month.</p>
          ) : (
            <div className="mar-scroll">
              <table className="mar-table">
                <thead>
                  <tr>
                    <th className="mar-med-col">Medication / directions</th>
                    <th className="mar-qty-col">QTY</th>
                    <th className="mar-time-col">Time</th>
                    {sheet.dayNumbers.map((d) => (
                      <th key={d} className={d === todayDay ? 'mar-today' : undefined}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.map((row) =>
                    row.timeRows.map((tr, idx) => (
                      <tr key={`${row.order.id}-${tr.time}-${idx}`}>
                        {idx === 0 ? (
                          <td className="mar-med-col" rowSpan={row.timeRows.length}>
                            <div className="mar-drug">
                              {row.order.highAlert ? <span className="mar-h">(H) </span> : null}
                              {row.order.drugName}
                            </div>
                            {row.order.brand ? (
                              <div className="meta">Brand: {row.order.brand}</div>
                            ) : null}
                            {row.order.categoryLabel ? (
                              <div className="mar-cat">*** {row.order.categoryLabel} ***</div>
                            ) : null}
                            <div className="meta">{row.order.frequency}</div>
                            {row.order.rxNumber ? (
                              <div className="meta">
                                Rx: {row.order.rxNumber}
                                {row.order.prescriber ? ` · MD: ${row.order.prescriber}` : ''}
                              </div>
                            ) : null}
                            {row.order.imprint ? (
                              <div className="meta">{row.order.imprint}</div>
                            ) : null}
                            <div className="meta">Start: {row.order.startDate}</div>
                          </td>
                        ) : null}
                        {idx === 0 ? (
                          <td className="mar-qty-col" rowSpan={row.timeRows.length}>
                            {row.order.dose}
                          </td>
                        ) : null}
                        <td className="mar-time-col">{tr.time}</td>
                        {tr.cells.map((cell) => (
                          <td key={cell.day} className="mar-cell-td">
                            <button
                              type="button"
                              className={`mar-cell mark-${cell.mark === '✓' ? 'given' : cell.mark === 'X' ? 'refused' : 'blank'}${
                                cell.day === todayDay ? ' today' : ''
                              }`}
                              onClick={() =>
                                setSelected({
                                  orderId: row.order.id,
                                  time: tr.time,
                                  cell,
                                  drugName: row.order.drugName,
                                })
                              }
                              title={`Day ${cell.day} · ${tr.time}`}
                            >
                              {cell.mark}
                              {cell.initials && cell.mark === '✓' ? (
                                <span className="mar-initials">{cell.initials}</span>
                              ) : null}
                            </button>
                          </td>
                        ))}
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}

          {selected ? (
            <div className="mar-action-bar">
              <div>
                <strong>
                  {displayPatient} · Day {selected.cell.day} · {selected.time}
                </strong>
                <div className="meta">{selected.drugName}</div>
              </div>
              <div className="mar-actions">
                <button
                  className="btn"
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => void mark('GIVEN')}
                >
                  Record ✓
                </button>
                <button
                  className="btn danger"
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => void mark('REFUSED')}
                >
                  Reject X
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => void mark('MISSED')}
                >
                  Clear / not given -
                </button>
                <button className="btn ghost" type="button" onClick={() => setSelected(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="meta" style={{ marginTop: '1rem' }}>
              Tap a day cell, then Record (✓), Reject (X), or mark not given at all (-).
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
