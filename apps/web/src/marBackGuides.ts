/** Codes and guides from Back of MAR.pdf */
export const BMI_CODES = [
  { code: 'A', label: 'offer/assist to restroom' },
  { code: 'B', label: 'offer food/fluid' },
  { code: 'C', label: 'redirection' },
  { code: 'D', label: 'positive reinforcement' },
  { code: 'E', label: 'offer music/activity' },
  { code: 'F', label: 'medication offered' },
  { code: 'G', label: 'other', requiresText: true },
  { code: 'H', label: 'other', requiresText: true },
] as const;

export const RESULT_CODES = [
  { code: 'N', label: 'not observed' },
  { code: 'E', label: 'effective' },
  { code: 'I', label: 'ineffective' },
  { code: 'M', label: 'medication intervention' },
] as const;

export const MSE_CODES = [
  { code: 'A', label: 'sedation/drowsiness' },
  { code: 'B', label: 'dizziness' },
  { code: 'C', label: 'constipation' },
  { code: 'D', label: 'weight gain/edema' },
  { code: 'E', label: 'seizures' },
  { code: 'F', label: 'urinary retention' },
  { code: 'G', label: 'tardive dyskinesia' },
  { code: 'H', label: 'cognitive behavior impairment' },
  { code: 'I', label: 'orthostatic hypotension' },
  { code: 'J', label: 'unsteady on feet/fall' },
  { code: 'K', label: 'high blood sugar' },
  { code: 'L', label: 'other', requiresText: true },
  { code: 'N/A', label: 'not applicable' },
] as const;

export const PAIN_SCALE = [
  { score: '0', label: 'No Pain' },
  { score: '1–2', label: 'Mild Pain' },
  { score: '3–4', label: 'Uncomfortable' },
  { score: '5–6', label: 'Distressing' },
  { score: '7–8', label: 'Intense' },
  { score: '9–10', label: 'Excruciating' },
] as const;

export type PrnFormValues = {
  prnRouteSite: string;
  prnReason: string;
  prnBmi: string;
  prnBmiOther: string;
  prnResult: string;
  prnMse: string;
  prnMseOther: string;
  prnPainScore: string;
};

export const emptyPrnForm = (): PrnFormValues => ({
  prnRouteSite: '',
  prnReason: '',
  prnBmi: '',
  prnBmiOther: '',
  prnResult: '',
  prnMse: '',
  prnMseOther: '',
  prnPainScore: '',
});

export function prnPayloadFromForm(form: PrnFormValues) {
  const pain =
    form.prnPainScore === '' ? undefined : Number(form.prnPainScore);
  return {
    prnRouteSite: form.prnRouteSite.trim(),
    prnReason: form.prnReason.trim(),
    prnBmi: form.prnBmi || undefined,
    prnBmiOther: form.prnBmiOther.trim() || undefined,
    prnResult: form.prnResult,
    prnMse: form.prnMse || undefined,
    prnMseOther: form.prnMseOther.trim() || undefined,
    prnPainScore: Number.isFinite(pain) ? pain : undefined,
  };
}

export function validatePrnForm(form: PrnFormValues): string | null {
  if (!form.prnRouteSite.trim()) return 'ROUTE/SITE is required';
  if (!form.prnReason.trim()) return 'REASON is required';
  if (!form.prnResult) return 'RESULT/OUTCOMES is required';
  if ((form.prnBmi === 'G' || form.prnBmi === 'H') && !form.prnBmiOther.trim()) {
    return 'Describe BMI “other” when G or H is selected';
  }
  if (form.prnMse === 'L' && !form.prnMseOther.trim()) {
    return 'Describe MSE “other” when L is selected';
  }
  return null;
}
