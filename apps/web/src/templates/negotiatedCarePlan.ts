/**
 * Blank Negotiated Care Plan template matching
 * Raysheal M. Ellis_Negotiated_Care_Plan.docx structure.
 */

export type CareServiceRow = {
  id: string;
  service: string;
  strengthsNeeds: string;
  staffDoes: string;
};

export type CareServiceSection = {
  id: string;
  title: string;
  rows: CareServiceRow[];
};

export type CarePlanSignature = {
  role: string;
  name: string;
  signedAt: string;
  reviewDate: string;
};

export type NegotiatedCarePlanForm = {
  documentTitle: string;
  suicideSafetyNote: string;
  assessmentSourceNote: string;
  header: {
    residentName: string;
    providerName: string;
    providerContact: string;
    priorPlacement: string;
    carePlanDate: string;
    admissionDate: string;
    dischargeDate: string;
    dateOfBirth: string;
    age: string;
    ssn: string;
    primaryLanguage: string;
    interestedParties: string;
    contactNameAddress: string;
    contactPhone: string;
    physician: string;
    physicianPhone: string;
    physicianFax: string;
    pharmacy: string;
    pharmacyPhone: string;
    pharmacyFax: string;
    dentist: string;
    dentistPhone: string;
    dentistFax: string;
    advanceDirective: string;
    advanceDirectiveType: string;
    legalDocuments: string;
    legalDocumentsType: string;
    currentMedicalStatus: string;
    allergies: string;
    specialtyNeeds: string;
    dementia: string;
    mentalHealth: string;
    developmentalDisability: string;
    emergencyEvacuation: string;
    independent: string;
    assistanceRequired: string;
    specialInstructions: string;
  };
  sections: CareServiceSection[];
  signatureMeta: {
    admissionDate: string;
    negotiatedCarePlanDate: string;
    assessmentDate: string;
  };
  signatures: CarePlanSignature[];
};

function section(title: string, services: string[]): CareServiceSection {
  return {
    id: `s_${Math.random().toString(36).slice(2, 10)}`,
    title,
    rows: services.map((s) => ({
      id: `r_${Math.random().toString(36).slice(2, 10)}`,
      service: s,
      strengthsNeeds: '',
      staffDoes: '',
    })),
  };
}

export function blankNegotiatedCarePlan(opts?: {
  residentName?: string;
  providerName?: string;
  dateOfBirth?: string;
  admissionDate?: string;
}): NegotiatedCarePlanForm {
  return {
    documentTitle: 'NEGOTIATED CARE PLAN',
    suicideSafetyNote:
      'If client shows suicidal warning signs, contact a mental health professional or the National Suicide Prevention Lifeline (988). If verbalizing a suicide plan, call 911 or assist client to the nearest emergency room.',
    assessmentSourceNote: '',
    header: {
      residentName: opts?.residentName || '',
      providerName: opts?.providerName || '',
      providerContact: '',
      priorPlacement: '',
      carePlanDate: '',
      admissionDate: opts?.admissionDate || '',
      dischargeDate: '',
      dateOfBirth: opts?.dateOfBirth || '',
      age: '',
      ssn: '',
      primaryLanguage: 'English',
      interestedParties: '',
      contactNameAddress: '',
      contactPhone: '',
      physician: '',
      physicianPhone: '',
      physicianFax: '',
      pharmacy: '',
      pharmacyPhone: '',
      pharmacyFax: '',
      dentist: '',
      dentistPhone: '',
      dentistFax: '',
      advanceDirective: '',
      advanceDirectiveType: '',
      legalDocuments: '',
      legalDocumentsType: '',
      currentMedicalStatus: '',
      allergies: '',
      specialtyNeeds: '',
      dementia: '',
      mentalHealth: '',
      developmentalDisability: '',
      emergencyEvacuation: '',
      independent: '',
      assistanceRequired: '',
      specialInstructions: '',
    },
    sections: [
      section('Communication / Sensory', [
        'Hearing Problems Describe/Aid',
        'Visual Problems Describe/Aid',
        'Telephone Use',
        'Language',
      ]),
      section('Medication Management', [
        'SELF ADMINISTRATION — CHECK ALL THAT APPLY (Oral, Sprays, Topical, Injections, Eye Drops, Allergy Kits, Ointments, Keep Own Meds, Inhalers)',
        'SELF MEDICATION WITH ASSISTANCE — CHECK ALL THAT APPLY',
        'ADMINISTRATION — REQUIRES NURSE DELEGATION — CHECK ALL THAT APPLY',
        'INJECTIONS: By who? (Surrogate, Family, Licensed professional)',
        'MEDICATION PLANS WHEN RESIDENT NOT IN HOME',
      ]),
      section('Health Monitoring', [
        'Health or issues to monitor',
        'Oxygen use',
        'Pain',
        'Weight Loss/Gain',
        'Programs resident attends',
        'Nursing Consultations',
        'Nursing Treatments',
        'RN Delegation: Tasks / Consent',
        'Physical Enablers',
      ]),
      section('Behavioral / Cognitive / Mental Health', [
        'Sleep Disturbance / Sundowning / Agitated at night',
        'Short Term Memory Impairment',
        'Long Term Memory Impairment',
        'Impulsive/Forgetful / Limited Attention Span / Impaired Judgment',
        'Manic Symptoms',
        'Resistive to Care',
        'Anxiety',
        'Suicidal Ideation',
        'Assaultive',
        'Easily Irritable / Agitated',
        'Uses foul language / Verbally Abusive / Yelling/Screaming',
        'Wandering',
        'Hallucinations',
        'Delusions',
        'Pharmacological Medications (Seizure / Psychoactive)',
        'Universal Precautions',
      ]),
      section('Mobility / Transfers / Falls', [
        'MOBILITY',
        'EQUIPMENT',
        'PREFERENCES/CHOICES',
        'BED MOBILITY / TRANSFER',
        'Skin Care due to inability to position self',
        'Equipment / Supplies',
        'Risk for Falls',
        'Preferences',
        'Enablers',
        'Safety Assessment',
        'Nighttime Care Needs',
      ]),
      section('Eating / Nutrition', [
        'EATING',
        'Special Diet/Supplements',
        'Eating Habits',
        'Food Allergies',
        'Preferences / Behavior',
        'Equipment',
      ]),
      section('Toileting / Continence', [
        'TOILETING/CONTINENCE ISSUES',
        'Bladder Incontinence',
        'Bowel Incontinence',
        'Skin care due to bowel/bladder incontinence',
        'Equipment',
        'Preferences',
      ]),
      section('Dressing', ['DRESSING', 'Equipment', 'Preferences']),
      section('Personal Hygiene', [
        'PERSONAL HYGIENE',
        'Oral Hygiene: Assistance When and how often',
        'Preferences',
      ]),
      section('Bathing', [
        'BATHING',
        'How often',
        'When',
        'Equipment',
        'Preferences',
      ]),
      section('Body Care', [
        'BODY CARE — Foot Care, Skin Care, Nail Care, Range of Motion, Dressing Changes',
        'Foot Care',
        'Skin Care How often',
        'Skin Problems Describe',
        'Dressing Changes Nurse Delegated?',
        'Preferences',
      ]),
      section('Managing Finances', [
        'MANAGING FINANCES',
        'Who manages finances',
        'Financial Records',
        'Preferences',
      ]),
      section('Shopping', [
        'SHOPPING',
        'Special Transportation Needs',
        'How often',
        'Preferences',
      ]),
      section('Transportation', [
        'TRANSPORTATION',
        'Special Transportation Needs',
        'Equipment',
        'How often',
        'Preferences: Transportation',
      ]),
      section('Psychosocial / Activities / Community', [
        'Interests / Activities / Religious Activities',
        'Social / Cultural / Traditions',
        'Preference / Goals',
        'Family / Friends / Relationships',
        'Employment Support',
        "Clubs / Groups / Day Health",
        'Special Arrangements',
        'Participation Issues',
        'Smoking',
        'Substance Use',
        'Alcohol',
        'Case Management',
        'Others: Lockable doors',
      ]),
    ],
    signatureMeta: {
      admissionDate: opts?.admissionDate || '',
      negotiatedCarePlanDate: '',
      assessmentDate: '',
    },
    signatures: [
      { role: 'PROVIDER', name: opts?.providerName || '', signedAt: '', reviewDate: '' },
      { role: 'RESIDENT', name: opts?.residentName || '', signedAt: '', reviewDate: '' },
      { role: 'REPRESENTATIVE', name: '', signedAt: '', reviewDate: '' },
      { role: 'SURROGATE DECISION MAKER', name: '', signedAt: '', reviewDate: '' },
      { role: 'CASE MANAGER', name: '', signedAt: '', reviewDate: '' },
      { role: 'SOCIAL WORKER', name: '', signedAt: '', reviewDate: '' },
      { role: 'OTHER HEALTH PROFESSIONAL', name: '', signedAt: '', reviewDate: '' },
    ],
  };
}
