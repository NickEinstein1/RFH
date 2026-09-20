/**
 * Blank CBHS Incident / Behavior Report template matching
 * Ray_filled_Incidence_Report.docx structure.
 */

export type BehaviorLogEntry = {
  id: string;
  date: string;
  timeInterval: string;
  behaviorObserved: string;
  interventionApplied: string;
};

export type CbhsIncidentForm = {
  documentTitle: string;
  client: {
    fullLegalName: string;
    dateOfBirth: string;
    providerOneId: string;
    facilityName: string;
    facilityAddress: string;
    tierLevel: string;
    monthYearServices: string;
    caregiverInitials: string;
  };
  entries: BehaviorLogEntry[];
};

const DEFAULT_INTERVALS = [
  '6 AM – 8 AM (Morning Walk)',
  '9 AM – 10 AM',
  '11 AM – 12 PM',
  '1 PM – 2 PM',
  '3 PM – 4 PM',
  '5 PM – 6 PM',
];

function rid() {
  return `e_${Math.random().toString(36).slice(2, 10)}`;
}

export function blankCbhsIncidentForm(opts?: {
  fullLegalName?: string;
  dateOfBirth?: string;
  facilityName?: string;
  monthYearServices?: string;
  caregiverInitials?: string;
}): CbhsIncidentForm {
  const today = new Date().toISOString().slice(0, 10);
  return {
    documentTitle: 'Community Behavioral Health Supports (CBHS) — Note / Incident Report',
    client: {
      fullLegalName: opts?.fullLegalName || '',
      dateOfBirth: opts?.dateOfBirth || '',
      providerOneId: '',
      facilityName: opts?.facilityName || '',
      facilityAddress: '',
      tierLevel: '',
      monthYearServices: opts?.monthYearServices || '',
      caregiverInitials: opts?.caregiverInitials || '',
    },
    entries: DEFAULT_INTERVALS.map((timeInterval) => ({
      id: rid(),
      date: today,
      timeInterval,
      behaviorObserved: '',
      interventionApplied: '',
    })),
  };
}

export function addBehaviorDay(form: CbhsIncidentForm, date: string): CbhsIncidentForm {
  const entries = [
    ...form.entries,
    ...DEFAULT_INTERVALS.map((timeInterval) => ({
      id: rid(),
      date,
      timeInterval,
      behaviorObserved: '',
      interventionApplied: '',
    })),
  ];
  return { ...form, entries };
}

export const CBHS_TIME_INTERVALS = DEFAULT_INTERVALS;
