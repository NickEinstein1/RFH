import { CbhsReportPanel } from '../components/CbhsReportPanel';

export function IncidentsPage({ timezone }: { timezone: string }) {
  return (
    <CbhsReportPanel
      timezone={timezone}
      heading="Notes & incident reports"
      subheading="CBHS behavior form · Notes and Incidents share this screen and the Incident database"
    />
  );
}
