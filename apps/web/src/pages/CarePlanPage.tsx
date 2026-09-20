import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, downloadFile } from '../api';
import { useAuth } from '../auth';
import {
  blankNegotiatedCarePlan,
  type NegotiatedCarePlanForm,
} from '../templates/negotiatedCarePlan';
import { formatUsDate } from '../usDate';

type Resident = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  admitDate?: string;
  room: string | null;
};

type CarePlanRecord = {
  id: string;
  title: string;
  status: string;
  effectiveFrom: string;
  formData: NegotiatedCarePlanForm | null;
  resident?: Resident;
};

const HEADER_FIELDS: Array<{ key: keyof NegotiatedCarePlanForm['header']; label: string; wide?: boolean }> = [
  { key: 'residentName', label: 'Resident name' },
  { key: 'providerName', label: 'Provider name' },
  { key: 'providerContact', label: 'Provider contact' },
  { key: 'priorPlacement', label: 'Prior placement' },
  { key: 'carePlanDate', label: 'Care plan date' },
  { key: 'admissionDate', label: 'Admission date' },
  { key: 'dischargeDate', label: 'Discharge date' },
  { key: 'dateOfBirth', label: 'Date of birth' },
  { key: 'age', label: 'Age' },
  { key: 'ssn', label: 'SSN' },
  { key: 'primaryLanguage', label: 'Primary language' },
  { key: 'interestedParties', label: 'Interested party/parties', wide: true },
  { key: 'contactNameAddress', label: 'Name / address' },
  { key: 'contactPhone', label: 'Phone' },
  { key: 'physician', label: 'Physician', wide: true },
  { key: 'physicianPhone', label: 'Physician phone' },
  { key: 'physicianFax', label: 'Physician fax' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'pharmacyPhone', label: 'Pharmacy phone' },
  { key: 'pharmacyFax', label: 'Pharmacy fax' },
  { key: 'dentist', label: 'Dentist' },
  { key: 'dentistPhone', label: 'Dentist phone' },
  { key: 'dentistFax', label: 'Dentist fax' },
  { key: 'advanceDirective', label: 'Advance directive' },
  { key: 'advanceDirectiveType', label: 'Advance directive type' },
  { key: 'legalDocuments', label: 'Legal documents', wide: true },
  { key: 'legalDocumentsType', label: 'Legal documents type' },
  { key: 'currentMedicalStatus', label: 'Current medical status', wide: true },
  { key: 'allergies', label: 'Allergies', wide: true },
  { key: 'specialtyNeeds', label: 'Specialty needs', wide: true },
  { key: 'dementia', label: 'Dementia', wide: true },
  { key: 'mentalHealth', label: 'Mental health', wide: true },
  { key: 'developmentalDisability', label: 'Developmental disability', wide: true },
  { key: 'emergencyEvacuation', label: 'Emergency evacuation', wide: true },
  { key: 'independent', label: 'Independent', wide: true },
  { key: 'assistanceRequired', label: 'Assistance required', wide: true },
  { key: 'specialInstructions', label: 'Special instructions', wide: true },
];

export function CarePlanPage() {
  const { id: residentId, planId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = ['OWNER', 'ADMIN', 'NURSE'].includes(user?.role || '');
  const [resident, setResident] = useState<Resident | null>(null);
  const [plans, setPlans] = useState<CarePlanRecord[]>([]);
  const [form, setForm] = useState<NegotiatedCarePlanForm | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(planId || null);
  const [title, setTitle] = useState('Negotiated Care Plan');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'list' | 'edit'>(
    planId || params.get('new') === '1' ? 'edit' : 'list',
  );

  const loadList = useCallback(async () => {
    if (!residentId) return;
    setError('');
    try {
      const [r, p] = await Promise.all([
        api<Resident>(`/residents/${residentId}`),
        api<CarePlanRecord[]>(`/care/plans?residentId=${residentId}`),
      ]);
      setResident(r);
      setPlans(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load care plans');
    }
  }, [residentId]);

  const loadPlan = useCallback(async (id: string) => {
    setError('');
    setBusy(true);
    try {
      const p = await api<CarePlanRecord>(`/care/plans/${id}`);
      setActivePlanId(p.id);
      setTitle(p.title);
      setForm(
        (p.formData as NegotiatedCarePlanForm) ||
          blankNegotiatedCarePlan({
            residentName: p.resident
              ? `${p.resident.lastName}, ${p.resident.firstName}`
              : '',
            providerName: user?.tenantName,
          }),
      );
      setMode('edit');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plan');
    } finally {
      setBusy(false);
    }
  }, [user?.tenantName]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (planId) void loadPlan(planId);
  }, [planId, loadPlan]);

  useEffect(() => {
    if (params.get('new') === '1' && resident && !form && mode === 'edit' && !planId) {
      setForm(
        blankNegotiatedCarePlan({
          residentName: `${resident.lastName}, ${resident.firstName}`,
          providerName: user?.tenantName,
          dateOfBirth: resident.dateOfBirth?.slice(0, 10),
          admissionDate: resident.admitDate?.slice(0, 10),
        }),
      );
      setTitle(`Negotiated Care Plan — ${resident.lastName}, ${resident.firstName}`);
    }
  }, [params, resident, form, mode, planId, user?.tenantName]);

  function startNew() {
    if (!resident) return;
    setActivePlanId(null);
    setForm(
      blankNegotiatedCarePlan({
        residentName: `${resident.lastName}, ${resident.firstName}`,
        providerName: user?.tenantName,
        dateOfBirth: resident.dateOfBirth?.slice(0, 10),
        admissionDate: resident.admitDate?.slice(0, 10),
      }),
    );
    setTitle(`Negotiated Care Plan — ${resident.lastName}, ${resident.firstName}`);
    setMode('edit');
    navigate(`/residents/${residentId}/care-plan?new=1`);
  }

  async function save() {
    if (!residentId || !form) return;
    setBusy(true);
    setError('');
    try {
      if (activePlanId) {
        await api(`/care/plans/${activePlanId}`, {
          method: 'PATCH',
          body: JSON.stringify({ title, formData: form }),
        });
      } else {
        const created = await api<CarePlanRecord>('/care/plans', {
          method: 'POST',
          body: JSON.stringify({
            residentId,
            title,
            effectiveFrom: new Date().toISOString().slice(0, 10),
            formData: form,
            goals: form.header.specialInstructions || undefined,
          }),
        });
        setActivePlanId(created.id);
        navigate(`/residents/${residentId}/care-plan/${created.id}`, { replace: true });
      }
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function removePlan(id: string) {
    if (!confirm('Delete this care plan?')) return;
    setBusy(true);
    try {
      await api(`/care/plans/${id}`, { method: 'DELETE' });
      if (activePlanId === id) {
        setMode('list');
        setForm(null);
        setActivePlanId(null);
        navigate(`/residents/${residentId}/care-plan`);
      }
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  function setHeader<K extends keyof NegotiatedCarePlanForm['header']>(
    key: K,
    value: NegotiatedCarePlanForm['header'][K],
  ) {
    setForm((f) => (f ? { ...f, header: { ...f.header, [key]: value } } : f));
  }

  if (mode === 'list') {
    return (
      <div className="tpl-page">
        <Link to={`/residents/${residentId}`} className="meta">
          ← Resident
        </Link>
        <h1 className="page-title">Negotiated Care Plans</h1>
        <p className="page-sub">
          {user?.tenantName}
          {resident ? ` · ${resident.lastName}, ${resident.firstName}` : ''}
        </p>
        {error ? <div className="error">{error}</div> : null}
        {canWrite ? (
          <button className="btn" type="button" onClick={startNew} style={{ marginBottom: '1rem' }}>
            Create negotiated care plan
          </button>
        ) : null}
        <div className="stack">
          {plans.length === 0 ? <p className="empty">No care plans yet.</p> : null}
          {plans.map((p) => (
            <div key={p.id} className="note-row" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <strong>{p.title}</strong>
                <div className="meta">
                  {p.status} · Effective {formatUsDate(String(p.effectiveFrom))}
                </div>
              </div>
              <div className="resident-row-actions">
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    navigate(`/residents/${residentId}/care-plan/${p.id}`);
                    void loadPlan(p.id);
                  }}
                >
                  {canWrite ? 'Edit' : 'View'}
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    void downloadFile(`/downloads/care-plan/${p.id}`, 'CarePlan.pdf').catch((e) =>
                      setError(e instanceof Error ? e.message : 'Download failed'),
                    );
                  }}
                >
                  PDF
                </button>
                {canWrite ? (
                  <button className="btn danger" type="button" onClick={() => void removePlan(p.id)}>
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!form) return <p className="empty">Loading care plan…</p>;

  return (
    <div className="tpl-page">
      <button
        type="button"
        className="btn ghost"
        onClick={() => {
          setMode('list');
          setForm(null);
          navigate(`/residents/${residentId}/care-plan`);
        }}
      >
        ← All care plans
      </button>

      <header className="tpl-doc-header">
        <div>
          <div className="mar-title">{form.documentTitle}</div>
          <div className="meta">{user?.tenantName}</div>
        </div>
        {canWrite ? (
          <button className="btn" type="button" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : activePlanId ? 'Update plan' : 'Create plan'}
          </button>
        ) : null}
        {activePlanId ? (
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              void downloadFile(`/downloads/care-plan/${activePlanId}`, 'CarePlan.pdf').catch((e) =>
                setError(e instanceof Error ? e.message : 'Download failed'),
              );
            }}
          >
            Download PDF
          </button>
        ) : null}
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div className="field">
        <label>Document title</label>
        <input
          value={title}
          disabled={!canWrite}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Suicide safety note</label>
        <textarea
          value={form.suicideSafetyNote}
          disabled={!canWrite}
          onChange={(e) => setForm({ ...form, suicideSafetyNote: e.target.value })}
          rows={3}
        />
      </div>

      <section className="tpl-section">
        <h2>Resident / provider header</h2>
        <div className="tpl-grid">
          {HEADER_FIELDS.map((f) => (
            <div key={f.key} className={`field${f.wide ? ' wide' : ''}`}>
              <label>{f.label}</label>
              {f.wide ? (
                <textarea
                  value={form.header[f.key]}
                  disabled={!canWrite}
                  onChange={(e) => setHeader(f.key, e.target.value)}
                  rows={3}
                />
              ) : (
                <input
                  value={form.header[f.key]}
                  disabled={!canWrite}
                  onChange={(e) => setHeader(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {form.sections.map((sec, si) => (
        <section key={sec.id} className="tpl-section">
          <h2>
            Care and services — {sec.title}
          </h2>
          <div className="tpl-table-wrap">
            <table className="tpl-table">
              <thead>
                <tr>
                  <th>Care and services</th>
                  <th>Resident strength / needs</th>
                  <th>What staff does when and how</th>
                </tr>
              </thead>
              <tbody>
                {sec.rows.map((row, ri) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        value={row.service}
                        disabled={!canWrite}
                        onChange={(e) => {
                          const sections = [...form.sections];
                          sections[si] = {
                            ...sec,
                            rows: sec.rows.map((r, i) =>
                              i === ri ? { ...r, service: e.target.value } : r,
                            ),
                          };
                          setForm({ ...form, sections });
                        }}
                      />
                    </td>
                    <td>
                      <textarea
                        value={row.strengthsNeeds}
                        disabled={!canWrite}
                        rows={2}
                        onChange={(e) => {
                          const sections = [...form.sections];
                          sections[si] = {
                            ...sec,
                            rows: sec.rows.map((r, i) =>
                              i === ri ? { ...r, strengthsNeeds: e.target.value } : r,
                            ),
                          };
                          setForm({ ...form, sections });
                        }}
                      />
                    </td>
                    <td>
                      <textarea
                        value={row.staffDoes}
                        disabled={!canWrite}
                        rows={2}
                        onChange={(e) => {
                          const sections = [...form.sections];
                          sections[si] = {
                            ...sec,
                            rows: sec.rows.map((r, i) =>
                              i === ri ? { ...r, staffDoes: e.target.value } : r,
                            ),
                          };
                          setForm({ ...form, sections });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="tpl-section">
        <h2>Dates & signatures</h2>
        <div className="tpl-grid">
          <div className="field">
            <label>Admission date</label>
            <input
              value={form.signatureMeta.admissionDate}
              disabled={!canWrite}
              onChange={(e) =>
                setForm({
                  ...form,
                  signatureMeta: { ...form.signatureMeta, admissionDate: e.target.value },
                })
              }
            />
          </div>
          <div className="field">
            <label>Negotiated care plan date</label>
            <input
              value={form.signatureMeta.negotiatedCarePlanDate}
              disabled={!canWrite}
              onChange={(e) =>
                setForm({
                  ...form,
                  signatureMeta: {
                    ...form.signatureMeta,
                    negotiatedCarePlanDate: e.target.value,
                  },
                })
              }
            />
          </div>
          <div className="field">
            <label>Assessment date</label>
            <input
              value={form.signatureMeta.assessmentDate}
              disabled={!canWrite}
              onChange={(e) =>
                setForm({
                  ...form,
                  signatureMeta: { ...form.signatureMeta, assessmentDate: e.target.value },
                })
              }
            />
          </div>
        </div>
        <div className="tpl-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="tpl-table">
            <thead>
              <tr>
                <th>Name / title / role</th>
                <th>Name</th>
                <th>Signature date</th>
                <th>Review date</th>
              </tr>
            </thead>
            <tbody>
              {form.signatures.map((sig, i) => (
                <tr key={sig.role}>
                  <td>{sig.role}</td>
                  <td>
                    <input
                      value={sig.name}
                      disabled={!canWrite}
                      onChange={(e) => {
                        const signatures = form.signatures.map((s, idx) =>
                          idx === i ? { ...s, name: e.target.value } : s,
                        );
                        setForm({ ...form, signatures });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      value={sig.signedAt}
                      disabled={!canWrite}
                      onChange={(e) => {
                        const signatures = form.signatures.map((s, idx) =>
                          idx === i ? { ...s, signedAt: e.target.value } : s,
                        );
                        setForm({ ...form, signatures });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      value={sig.reviewDate}
                      disabled={!canWrite}
                      onChange={(e) => {
                        const signatures = form.signatures.map((s, idx) =>
                          idx === i ? { ...s, reviewDate: e.target.value } : s,
                        );
                        setForm({ ...form, signatures });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canWrite ? (
        <div className="mar-actions" style={{ marginTop: '1rem' }}>
          <button className="btn" type="button" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : activePlanId ? 'Update plan' : 'Create plan'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
