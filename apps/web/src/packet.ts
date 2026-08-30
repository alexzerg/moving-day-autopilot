import type { MoveState } from '@moving-day/contracts';

function csv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function nextDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function icsDate(value: string) {
  return value.replaceAll('-', '');
}

function buildCalendar(state: MoveState) {
  const events = state.actions.map((action) => [
    'BEGIN:VEVENT',
    `UID:${action.id}@moving-day-autopilot`,
    `DTSTART;VALUE=DATE:${icsDate(action.scheduledFor)}`,
    `DTEND;VALUE=DATE:${icsDate(nextDate(action.scheduledFor))}`,
    `SUMMARY:${action.label.replaceAll(',', '\\,')}`,
    `DESCRIPTION:Risk: ${action.risk} | Status: ${action.status}`,
    'END:VEVENT',
  ].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moving-Day Autopilot//EN', ...events, 'END:VCALENDAR', ''].join('\r\n');
}

function buildConfirmationsCsv(state: MoveState) {
  const header = ['Action ID', 'Provider', 'Scheduled Date', 'Status', 'Risk', 'Confirmation'];
  const rows = state.actions.map((action) => {
    const account = state.accounts.find((item) => item.id === action.accountId);
    return [action.id, account?.provider ?? action.accountId, action.scheduledFor, action.status, action.risk, action.confirmation ?? ''];
  });
  return [header, ...rows].map((row) => row.map(csv).join(',')).join('\n');
}

function buildHouseholdTasks(state: MoveState) {
  const human = state.actions.filter((action) => action.risk === 'identity');
  return [
    '# Household identity tasks',
    '',
    ...human.flatMap((action) => [
      `## ${action.label}`,
      `- Scheduled: ${action.scheduledFor}`,
      `- Status: ${action.status}`,
      `- Evidence: ${action.confirmation ?? 'Not provided'}`,
      '',
    ]),
  ].join('\n');
}

function buildProviderDraft(state: MoveState, accountId: string) {
  const account = state.accounts.find((item) => item.id === accountId)!;
  const actions = state.actions.filter((action) => action.accountId === accountId);
  return [
    `Subject: Moving address update — ${account.accountReference}`,
    '',
    `Provider: ${account.provider}`,
    `Account: ${account.accountReference}`,
    `Old address: ${state.moveCase.oldAddress.line1}, ${state.moveCase.oldAddress.city}, ${state.moveCase.oldAddress.region} ${state.moveCase.oldAddress.postalCode}`,
    `New address: ${state.moveCase.newAddress.line1}, ${state.moveCase.newAddress.city}, ${state.moveCase.newAddress.region} ${state.moveCase.newAddress.postalCode}`,
    `Move date: ${state.moveCase.moveDate}`,
    '',
    'Requested actions:',
    ...actions.map((action) => `- ${action.label} on ${action.scheduledFor}`),
    '',
    'Please confirm the scheduled changes and provide a confirmation reference.',
  ].join('\n');
}

async function buildPdf(state: MoveState) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  let y = 54;
  const line = (text: string, size = 10, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 516) as string[];
    if (y + lines.length * (size + 4) > 735) { doc.addPage(); y = 54; }
    doc.text(lines, margin, y);
    y += lines.length * (size + 4);
  };

  line('Moving-Day Autopilot — Move Packet', 20, true);
  line(`Case ${state.moveCase.id} · Move date ${state.moveCase.moveDate}`, 10);
  y += 8;
  line('Route', 13, true);
  line(`${state.moveCase.oldAddress.line1}, ${state.moveCase.oldAddress.city}, ${state.moveCase.oldAddress.region} ${state.moveCase.oldAddress.postalCode}`);
  line(`→ ${state.moveCase.newAddress.line1}, ${state.moveCase.newAddress.city}, ${state.moveCase.newAddress.region} ${state.moveCase.newAddress.postalCode}`);
  y += 8;
  line('Execution summary', 13, true);
  line(`${state.accounts.length} services · ${state.actions.length} actions · ${state.receipt?.verifiedActions ?? 0} verified · ${state.receipt?.blockedActions ?? 0} remaining · ${state.receipt?.serviceGaps ?? 0} service gaps`);
  y += 8;
  line('Physical move estimate', 13, true);
  line(`${state.moveEstimate.expectedVolumeCuFt} cu ft expected · P90 ${state.moveEstimate.p90VolumeCuFt} cu ft · ${state.moveEstimate.estimatedWeightLb.low.toLocaleString()}–${state.moveEstimate.estimatedWeightLb.high.toLocaleString()} lb`);
  line(`${state.moveEstimate.trucks.map((truck) => `${truck.provider} ${truck.vehicle} (${truck.bufferPct}% buffer)`).join(' · ')}`);
  line(`${state.moveEstimate.laborHours.crewSize} movers · ${state.moveEstimate.laborHours.loading}h loading · ${state.moveEstimate.laborHours.unloading}h unloading`);
  y += 8;
  line('Provider schedule', 13, true);
  for (const action of state.actions) {
    const provider = state.accounts.find((item) => item.id === action.accountId)?.provider ?? action.accountId;
    line(`${action.scheduledFor}  ${provider} — ${action.label} [${action.status}]`, 9);
  }
  return doc.output('arraybuffer');
}

export async function createMovePacket(state: MoveState) {
  if (!state.receipt) throw new Error('A verified execution receipt is required before export');
  const [{ default: JSZip }, pdf] = await Promise.all([import('jszip'), buildPdf(state)]);
  const zip = new JSZip();
  zip.file('move-packet.pdf', pdf);
  zip.file('appointments.ics', buildCalendar(state));
  zip.file('provider-confirmations.csv', buildConfirmationsCsv(state));
  zip.file('household-tasks.md', buildHouseholdTasks(state));
  zip.file('execution-receipt.json', JSON.stringify(state.receipt, null, 2));
  const drafts = zip.folder('provider-email-drafts')!;
  for (const account of state.accounts) drafts.file(`${account.id}.txt`, buildProviderDraft(state, account.id));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function downloadMovePacket(state: MoveState) {
  const blob = await createMovePacket(state);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${state.moveCase.id}-move-packet.zip`;
  link.click();
  URL.revokeObjectURL(url);
}
