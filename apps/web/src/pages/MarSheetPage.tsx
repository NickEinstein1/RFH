import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../api';
import { useAuth } from '../auth';
import { PrnRecordModal } from '../components/PrnRecordModal';
import { SafetyConfirmModal } from '../components/SafetyConfirmModal';
import { BMI_CODES, MSE_CODES, PAIN_SCALE, RESULT_CODES, prnPayloadFromForm } from '../marBackGuides';
import { safetyWarningsFromError, type SafetyWarning } from '../safetyTypes';
import { formatUsDate } from '../usDate';

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

type PrnEntry = {
  id: string;
  date: string;
  time: string;
  medication: string;
  dose: string;
  routeSite: string;
  reason: string;
  bmi: string;
  bmiOther: string;
  result: string;
  mse: string;
  mseOther: string;
  painScore: number | null;
  initials: string;
  signature: string;
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
  backPage: {
    title: string;
    prnEntries: PrnEntry[];
    staffSignatureKey: { initials: string; signature: string }[];
  };
};

type ResidentOption = {
  id: string;
  firstName: string;
  lastName: string;
  room: string | null;
};

type SelectedCell = {
  orderId: string;
  time: string;
  cell: MarCell;
  drugName: string;
  dose: string;
  route: string;
  isPrn: boolean;
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
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [prnPending, setPrnPending] = useState<SelectedCell | null>(null);
  const [safety, setSafety] = useState<{
    warnings: SafetyWarning[];
    body: Record<string, unknown>;
    safetyChallengeToken?: string;
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

  async function postAdmin(
    target: SelectedCell,
    outcome: 'GIVEN' | 'REFUSED' | 'MISSED',
    prn?: ReturnType<typeof prnPayloadFromForm>,
  ) {
    const key = `${target.orderId}-${target.cell.day}-${target.time}-${outcome}`;
    setBusyKey(key);
    setError('');
    const body = {
      orderId: target.orderId,
      scheduledAt: target.cell.scheduledAt,
      outcome,
      administeredAt: outcome === 'GIVEN' ? new Date().toISOString() : undefined,
      clientEventId: crypto.randomUUID(),
      notes:
        outcome === 'REFUSED'
          ? 'Rejected / not given'
          : outcome === 'MISSED'
            ? 'Not given at all'
            : undefined,
      ...prn,
    };
    try {
      await api('/emar/administrations', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSelected(null);
      setPrnPending(null);
      setSafety(null);
      await load();
    } catch (e) {
      const warnings = safetyWarningsFromError(e);
      if (warnings && outcome === 'GIVEN') {
        setSafety({
          warnings: warnings.warnings,
          body,
          safetyChallengeToken: warnings.safetyChallengeToken,
        });
        return;
      }
      setError(e instanceof Error ? e.message : 'Failed to update MAR cell');
    } finally {
      setBusyKey(null);
    }
  }

  function mark(outcome: 'GIVEN' | 'REFUSED' | 'MISSED') {
    if (!selected) return;
    if (outcome === 'GIVEN' && selected.isPrn) {
      setPrnPending(selected);
      return;
    }
    void postAdmin(selected, outcome);
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

  const blankRows = Math.max(0, 8 - (sheet?.backPage.prnEntries.length ?? 0));

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
        {id ? (
          <button
            className="btn"
            type="button"
            onClick={() => {
              void downloadFile(
                `/downloads/mar?residentId=${encodeURIComponent(id)}&month=${encodeURIComponent(month)}`,
                `MAR_${month}.pdf`,
              ).catch((e) => setError(e instanceof Error ? e.message : 'Download failed'));
            }}
          >
            Download PDF
          </button>
        ) : null}
      </div>

      {error ? <div className="error">{error}</div> : null}

      {sheet ? (
        <>
          <div className="mar-sheet mar-front-page">
            <header className="mar-header">
              <div>
                <div className="mar-title">Medication Administration Record</div>
                <div className="mar-resident-name">{displayPatient}</div>
                <div className="mar-resident">
                  DOB: {formatUsDate(sheet.resident.dateOfBirth)}
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
              <span className="mar-mark blank">-</span> Not given at all · PRN doses open the back-of-MAR
              form
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
                                {row.order.isPrn ? <span className="mar-prn-tag"> PRN</span> : null}
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
                              <div className="meta">Start: {formatUsDate(row.order.startDate)}</div>
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
                                    dose: row.order.dose,
                                    route: row.order.route,
                                    isPrn: row.order.isPrn,
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
                    {selected.isPrn ? ' · PRN' : ''}
                  </strong>
                  <div className="meta">{selected.drugName}</div>
                </div>
                <div className="mar-actions">
                  <button
                    className="btn"
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => mark('GIVEN')}
                  >
                    Record ✓
                  </button>
                  <button
                    className="btn danger"
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => mark('REFUSED')}
                  >
                    Reject X
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => mark('MISSED')}
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
                Tap a day cell, then Record (✓), Reject (X), or mark not given at all (-). PRN Record
                opens the back-of-MAR form.
              </p>
            )}
          </div>

          <div className="mar-sheet mar-back-page">
            <header className="mar-header">
              <div>
                <div className="mar-title">{sheet.backPage.title}</div>
                <div className="mar-resident-name">{displayPatient}</div>
                <div className="mar-resident">
                  {monthLabel(month)} · Patient No: {sheet.resident.mrn || '—'}
                </div>
              </div>
              <div className="mar-facility">
                <div className="meta">Facility</div>
                <strong className="mar-facility-name">{displayFacility}</strong>
                <div className="meta">End page of MAR</div>
              </div>
            </header>

            <div className="mar-back-guides">
              <section>
                <h3>Hazardous Drug Guide</h3>
                <p className="meta">(H) indicates medication is HAZARDOUS</p>
                <ul className="mar-guide-list">
                  <li>
                    <span className="hz-universal">Universal (GREEN)</span> — normal precautions
                  </li>
                  <li>
                    <span className="hz-low">Low (YELLOW)</span> — gloves + engineering controls
                  </li>
                  <li>
                    <span className="hz-mod">Moderate (ORANGE)</span> — gloves, gown, eye/face
                    protection
                  </li>
                  <li>
                    <span className="hz-high">High (RED)</span> — double gloves, gown, eye/face
                    protection
                  </li>
                </ul>
              </section>
              <section>
                <h3>PAIN Scale</h3>
                <ul className="mar-guide-list">
                  {PAIN_SCALE.map((p) => (
                    <li key={p.score}>
                      <strong>{p.score}</strong> {p.label}
                    </li>
                  ))}
                </ul>
                <p className="meta">
                  Emergency 911 · Poison Control (800) 222-1222 · Lincoln Pharmacy 253.473.1155
                </p>
              </section>
              <section>
                <h3>BMI / Result / MSE codes</h3>
                <div className="mar-code-cols">
                  <div>
                    <strong>BMI</strong>
                    {BMI_CODES.map((c) => (
                      <div key={c.code} className="meta">
                        {c.code}) {c.label}
                      </div>
                    ))}
                  </div>
                  <div>
                    <strong>Result</strong>
                    {RESULT_CODES.map((c) => (
                      <div key={c.code} className="meta">
                        {c.code} = {c.label}
                      </div>
                    ))}
                  </div>
                  <div>
                    <strong>MSE</strong>
                    {MSE_CODES.map((c) => (
                      <div key={c.code} className="meta">
                        {c.code}) {c.label}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <div className="mar-scroll">
              <table className="mar-table mar-prn-table">
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>TIME</th>
                    <th>MEDICATION</th>
                    <th>DOSE</th>
                    <th>ROUTE/SITE</th>
                    <th>REASON</th>
                    <th>BMI</th>
                    <th>RESULT</th>
                    <th>MSE</th>
                    <th>Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.backPage.prnEntries.map((e) => (
                    <tr key={e.id}>
                      <td>{formatUsDate(e.date)}</td>
                      <td>{e.time}</td>
                      <td>{e.medication}</td>
                      <td>{e.dose}</td>
                      <td>{e.routeSite}</td>
                      <td>
                        {e.reason}
                        {e.painScore != null ? ` · pain ${e.painScore}` : ''}
                      </td>
                      <td>
                        {e.bmi}
                        {e.bmiOther ? ` (${e.bmiOther})` : ''}
                      </td>
                      <td>{e.result}</td>
                      <td>
                        {e.mse}
                        {e.mseOther ? ` (${e.mseOther})` : ''}
                      </td>
                      <td>
                        {e.signature || e.initials}
                      </td>
                    </tr>
                  ))}
                  {Array.from({ length: blankRows }).map((_, i) => (
                    <tr key={`blank-${i}`} className="mar-prn-blank">
                      {Array.from({ length: 10 }).map((__, j) => (
                        <td key={j}>&nbsp;</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mar-staff-key">
              <h3>Staff signature key</h3>
              <table className="mar-table mar-staff-table">
                <thead>
                  <tr>
                    <th>INITIALS</th>
                    <th>STAFF SIGNATURE</th>
                    <th>INITIALS</th>
                    <th>STAFF SIGNATURE</th>
                  </tr>
                </thead>
                <tbody>
                  {chunkPairs(sheet.backPage.staffSignatureKey).map((pair, i) => (
                    <tr key={i}>
                      <td>{pair[0]?.initials || ''}</td>
                      <td>{pair[0]?.signature || ''}</td>
                      <td>{pair[1]?.initials || ''}</td>
                      <td>{pair[1]?.signature || ''}</td>
                    </tr>
                  ))}
                  {sheet.backPage.staffSignatureKey.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="meta">
                        Initials appear here after PRN doses are recorded.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {prnPending ? (
        <PrnRecordModal
          medication={prnPending.drugName}
          dose={prnPending.dose}
          defaultRoute={prnPending.route}
          patientName={displayPatient}
          facilityName={displayFacility}
          busy={busyKey !== null}
          onCancel={() => setPrnPending(null)}
          onSubmit={(fields) => postAdmin(prnPending, 'GIVEN', fields)}
        />
      ) : null}

      {safety ? (
        <SafetyConfirmModal
          warnings={safety.warnings}
          busy={busyKey !== null}
          onCancel={() => setSafety(null)}
          onConfirm={() => {
            void (async () => {
              setBusyKey('safety-ack');
              try {
                await api('/emar/administrations', {
                  method: 'POST',
                  body: JSON.stringify({
                    ...safety.body,
                    safetyChallengeToken: safety.safetyChallengeToken,
                  }),
                });
                setSafety(null);
                setSelected(null);
                setPrnPending(null);
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed after acknowledge');
              } finally {
                setBusyKey(null);
              }
            })();
          }}
        />
      ) : null}
    </div>
  );
}

function chunkPairs<T>(items: T[]): [T | undefined, T | undefined][] {
  const out: [T | undefined, T | undefined][] = [];
  for (let i = 0; i < items.length; i += 2) {
    out.push([items[i], items[i + 1]]);
  }
  if (!out.length) out.push([undefined, undefined]);
  return out;
}
