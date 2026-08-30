import type { MoveAction, MoveState, ProviderAccount, RouteDistance } from '@moving-day/contracts';
import { Document, Link, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { MoveReportSelection } from './packet';
import { providerActionGuide } from './provider-actions';

type ReportProps = {
  state: MoveState;
  selection: MoveReportSelection | null;
  route: RouteDistance | null;
  manuallyCompletedProviderIds: string[];
};

const colors = {
  navy: '#123C43', teal: '#159A7D', coral: '#E97855', cream: '#F5F2EA', white: '#FFFFFF', ink: '#17353C', muted: '#687D81', line: '#D7E1DE', paleTeal: '#E8F6F1', paleGold: '#FFF3DE', paleBlue: '#EAF3F8',
};

const styles = StyleSheet.create({
  page: { backgroundColor: colors.cream, color: colors.ink, fontFamily: 'Helvetica', fontSize: 10, paddingTop: 38, paddingHorizontal: 42, paddingBottom: 52 },
  cover: { backgroundColor: colors.navy, borderRadius: 16, padding: 30, marginBottom: 20 },
  eyebrowLight: { color: '#9DD8CB', fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  title: { color: colors.white, fontSize: 27, fontFamily: 'Helvetica-Bold', lineHeight: 1.05, marginBottom: 9 },
  subtitle: { color: '#D5E7E3', fontSize: 11, lineHeight: 1.5, maxWidth: 440 },
  chipRow: { flexDirection: 'row', marginTop: 17 },
  chip: { color: '#D5E7E3', borderColor: '#3B686D', borderWidth: 1, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 8, fontSize: 8, marginRight: 6 },
  section: { marginBottom: 19 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  eyebrow: { color: colors.teal, fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 },
  heading: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: colors.ink },
  sectionMeta: { color: colors.muted, fontSize: 8 },
  routeCard: { backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: 13, padding: 16 },
  addressLabel: { color: colors.muted, fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1.1, marginBottom: 3 },
  address: { fontSize: 12, fontFamily: 'Helvetica-Bold', lineHeight: 1.35 },
  routePill: { alignSelf: 'flex-start', backgroundColor: colors.paleTeal, color: colors.teal, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 8, fontFamily: 'Helvetica-Bold', fontSize: 9, marginVertical: 9 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', marginRight: -8 },
  metric: { width: '31.6%', minHeight: 76, backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: 11, padding: 12, marginRight: 8, marginBottom: 8 },
  metricAccent: { backgroundColor: colors.navy, borderColor: colors.navy },
  metricLabel: { color: colors.muted, fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 0.8, textTransform: 'uppercase' },
  metricLabelLight: { color: '#9DD8CB' },
  metricValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginTop: 7, marginBottom: 3 },
  metricValueLight: { color: colors.white },
  metricNote: { color: colors.muted, fontSize: 8, lineHeight: 1.35 },
  metricNoteLight: { color: '#D5E7E3' },
  decision: { backgroundColor: colors.paleGold, borderLeftColor: '#E6A143', borderLeftWidth: 4, borderRadius: 10, padding: 13, marginBottom: 8 },
  decisionLabel: { color: '#906022', fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 4 },
  decisionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 12, marginBottom: 3 },
  decisionText: { color: '#6F6250', fontSize: 9, lineHeight: 1.4 },
  provider: { backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 15, marginBottom: 10 },
  providerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 9 },
  providerKind: { color: colors.muted, fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1 },
  providerName: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  badge: { backgroundColor: colors.paleTeal, color: colors.teal, borderRadius: 9, paddingVertical: 4, paddingHorizontal: 7, fontSize: 7, fontFamily: 'Helvetica-Bold' },
  badgeGuided: { backgroundColor: colors.paleGold, color: '#906022' },
  providerAction: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  providerChannel: { color: colors.muted, fontSize: 8, marginBottom: 7 },
  steps: { marginBottom: 8 },
  step: { flexDirection: 'row', marginBottom: 3 },
  stepNumber: { width: 15, color: colors.teal, fontFamily: 'Helvetica-Bold', fontSize: 8 },
  stepText: { flex: 1, color: '#4F6367', fontSize: 8.5, lineHeight: 1.35 },
  link: { color: colors.teal, fontSize: 8, textDecoration: 'none', borderTopColor: '#E4EBE8', borderTopWidth: 1, paddingTop: 7 },
  completedProvider: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.paleTeal, borderRadius: 9, padding: 10, marginBottom: 6 },
  completedProviderName: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  completedProviderStatus: { color: colors.teal, fontFamily: 'Helvetica-Bold', fontSize: 8 },
  action: { flexDirection: 'row', backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  actionDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.teal, color: colors.white, textAlign: 'center', paddingTop: 5, fontSize: 8, fontFamily: 'Helvetica-Bold', marginRight: 10 },
  actionDotPending: { backgroundColor: colors.coral },
  actionBody: { flex: 1 },
  actionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, marginBottom: 3 },
  actionDetail: { color: colors.muted, fontSize: 8, lineHeight: 1.35 },
  actionDate: { color: '#4F6367', fontSize: 8, fontFamily: 'Helvetica-Bold', marginLeft: 8 },
  receipt: { backgroundColor: colors.navy, borderRadius: 13, padding: 18, marginBottom: 16 },
  receiptTitle: { color: colors.white, fontFamily: 'Helvetica-Bold', fontSize: 17, marginBottom: 12 },
  receiptRow: { flexDirection: 'row' },
  receiptItem: { flex: 1, backgroundColor: '#204F56', borderRadius: 8, padding: 10, marginRight: 6 },
  receiptValue: { color: colors.white, fontFamily: 'Helvetica-Bold', fontSize: 18 },
  receiptLabel: { color: '#B7D6D0', fontSize: 7, marginTop: 2 },
  infoBox: { backgroundColor: colors.paleBlue, borderRadius: 10, padding: 13, marginBottom: 14 },
  infoTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginBottom: 4 },
  infoText: { color: '#52686E', fontSize: 8.5, lineHeight: 1.45 },
  footer: { position: 'absolute', left: 42, right: 42, bottom: 20, borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 7, flexDirection: 'row', justifyContent: 'space-between', color: colors.muted, fontSize: 7 },
});

function addressLine(address: MoveState['moveCase']['oldAddress']) {
  return `${address.line1}, ${address.city}, ${address.region} ${address.postalCode}`;
}

function cleanTruck(value: string) {
  return value.replace(/′/g, ' ft');
}

function Footer() {
  return <View style={styles.footer} fixed><Text>Moving-Day Autopilot</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} /></View>;
}

function Metric({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return <View style={[styles.metric, accent ? styles.metricAccent : {}]} wrap={false}><Text style={[styles.metricLabel, accent ? styles.metricLabelLight : {}]}>{label}</Text><Text style={[styles.metricValue, accent ? styles.metricValueLight : {}]}>{value}</Text><Text style={[styles.metricNote, accent ? styles.metricNoteLight : {}]}>{note}</Text></View>;
}

function ProviderCard({ account, manuallyCompleted }: { account: ProviderAccount; manuallyCompleted: Set<string> }) {
  const guide = providerActionGuide(account);
  const completed = manuallyCompleted.has(account.id);
  return <View style={styles.provider} wrap={false}>
    <View style={styles.providerTop}><View><Text style={styles.providerKind}>{account.kind.replace('-', ' ')}</Text><Text style={styles.providerName}>{account.provider}</Text></View><Text style={[styles.badge, !completed && !guide.verified ? styles.badgeGuided : {}]}>{completed ? 'USER CONFIRMED' : guide.verified ? 'OFFICIAL PATH' : 'GUIDED HANDOFF'}</Text></View>
    <Text style={styles.providerAction}>{guide.title}</Text><Text style={styles.providerChannel}>{guide.channel}</Text>
    <View style={styles.steps}>{guide.steps.slice(0, 4).map((step, index) => <View style={styles.step} key={step}><Text style={styles.stepNumber}>{index + 1}.</Text><Text style={styles.stepText}>{step}</Text></View>)}</View>
    {guide.url ? <Link src={guide.url} style={styles.link}>{guide.url}</Link> : <Text style={styles.link}>Open the provider website or mobile app</Text>}
  </View>;
}

function ActionCard({ action, accounts, manuallyCompleted }: { action: MoveAction; accounts: ProviderAccount[]; manuallyCompleted: Set<string> }) {
  const account = accounts.find((candidate) => candidate.id === action.accountId);
  const manual = manuallyCompleted.has(action.accountId);
  const complete = action.status === 'verified' || action.status === 'executed' || manual;
  return <View style={styles.action} wrap={false}><Text style={[styles.actionDot, complete ? {} : styles.actionDotPending]}>{complete ? 'OK' : '!'}</Text><View style={styles.actionBody}><Text style={styles.actionTitle}>{account?.provider ?? action.accountId}: {action.label}</Text><Text style={styles.actionDetail}>{manual ? 'Completed manually on the official provider channel.' : complete ? 'Execution evidence recorded.' : action.risk === 'identity' ? 'Complete this step after provider identity verification.' : 'Recommended provider action; no external change has been claimed.'}</Text></View><Text style={styles.actionDate}>{action.scheduledFor}</Text></View>;
}

export function MoveReportDocument({ state, selection, route, manuallyCompletedProviderIds }: ReportProps): ReactElement<DocumentProps> {
  const receipt = state.receipt;
  const verifiedMode = Boolean(receipt);
  const manuallyCompleted = new Set(manuallyCompletedProviderIds);
  const remainingProviders = verifiedMode ? state.accounts : state.accounts.filter((account) => !manuallyCompleted.has(account.id));
  const completedProviders = verifiedMode ? [] : state.accounts.filter((account) => manuallyCompleted.has(account.id));
  const manualActionCount = state.actions.filter((action) => manuallyCompleted.has(action.accountId)).length;
  const remainingActions = state.actions.filter((action) => action.status !== 'verified' && action.status !== 'executed' && !manuallyCompleted.has(action.accountId));
  const decisions = state.decisions.filter((decision) => decision.selectedOption);
  return <Document title={verifiedMode ? 'Move execution report' : 'Move action plan'} author="Moving-Day Autopilot" subject="Personalized move provider action plan">
    <Page size="LETTER" style={styles.page}>
      <View style={styles.cover}><Text style={styles.eyebrowLight}>{verifiedMode ? 'VERIFIED MOVE EVIDENCE' : 'GUIDED ADDRESS-CHANGE PLAN'}</Text><Text style={styles.title}>Moving-Day Autopilot</Text><Text style={styles.subtitle}>{verifiedMode ? 'A clear record of the selected moving plan, completed work, provider handoffs, and remaining household tasks.' : 'A personalized guide to confirmed accounts, official provider actions, moving logistics, and the steps the household must complete.'}</Text><View style={styles.chipRow}><Text style={styles.chip}>Move {state.moveCase.moveDate}</Text><Text style={styles.chip}>{state.accounts.length} providers</Text><Text style={styles.chip}>{state.actions.length} planned actions</Text></View></View>
      <View style={styles.section}><View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>ROUTE</Text><Text style={styles.heading}>Where the move happens</Text></View><Text style={styles.sectionMeta}>{route ? `${route.distanceMiles} driving miles` : 'Distance pending'}</Text></View><View style={styles.routeCard}><Text style={styles.addressLabel}>MOVING FROM</Text><Text style={styles.address}>{addressLine(state.moveCase.oldAddress)}</Text><Text style={styles.routePill}>{route ? `${route.distanceMiles} mi / ${route.durationMinutes} min driving` : 'Route pending'}</Text><Text style={styles.addressLabel}>MOVING TO</Text><Text style={styles.address}>{addressLine(state.moveCase.newAddress)}</Text></View></View>
      <View style={styles.section}><View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>MOVING PLAN</Text><Text style={styles.heading}>Logistics and modeled cost</Text></View><Text style={styles.sectionMeta}>Planning range, not a live quote</Text></View><View style={styles.metrics}><Metric accent label="TOTAL MOVE COST" value={selection ? `$${selection.totalCostLow.toLocaleString()} - $${selection.totalCostHigh.toLocaleString()}` : 'Not selected'} note="Truck, road, fuel, equipment, taxes, and labor" /><Metric label="TRUCK" value={selection ? `${selection.truckProvider} ${cleanTruck(selection.truckVehicle)}` : cleanTruck(state.moveEstimate.trucks[0]?.vehicle ?? 'Pending')} note={selection?.rentalMode === 'round-trip' ? 'Return to pickup location' : 'Drop off near destination'} /><Metric label="LABOR" value={selection?.laborSource ?? `${state.moveEstimate.laborHours.crewSize} movers`} note={`${state.moveEstimate.laborHours.total} estimated crew hours`} /><Metric label="VOLUME" value={`${state.moveEstimate.expectedVolumeCuFt} cu ft`} note={`P90 ${state.moveEstimate.p90VolumeCuFt} cu ft / ${state.moveEstimate.boxCount} boxes`} /><Metric label="WEIGHT" value={`${state.moveEstimate.estimatedWeightLb.low.toLocaleString()} - ${state.moveEstimate.estimatedWeightLb.high.toLocaleString()} lb`} note="Planning estimate, not certified weight" /><Metric label="ROAD PLAN" value={selection ? `${selection.drivenMiles} driven mi` : route ? `${route.distanceMiles} route mi` : 'Pending'} note={selection ? `${selection.fuelGallons} estimated gallons` : 'Fuel estimate not selected'} /></View></View>
      {decisions.length > 0 && <View style={styles.section}><View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>DECISIONS</Text><Text style={styles.heading}>Choices included in the plan</Text></View></View>{decisions.map((decision) => { const option = decision.options.find((candidate) => candidate.id === decision.selectedOption); return <View style={styles.decision} key={decision.id}><Text style={styles.decisionLabel}>HUMAN DECISION</Text><Text style={styles.decisionTitle}>{option?.label ?? decision.selectedOption}</Text><Text style={styles.decisionText}>{option?.consequence ?? decision.question}</Text></View>; })}</View>}
      <Footer />
    </Page>

    <Page size="LETTER" style={styles.page} wrap>
      <View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>ADDRESS CHANGES</Text><Text style={styles.heading}>{verifiedMode ? 'Provider handoffs' : 'Still to change'}</Text></View><Text style={styles.sectionMeta}>{remainingProviders.length} remaining / {completedProviders.length} confirmed</Text></View>
      <View style={styles.infoBox}><Text style={styles.infoTitle}>How to use this page</Text><Text style={styles.infoText}>Open the official provider channel, complete the address change yourself, then mark that provider completed in the application. Completed providers move out of this action list.</Text></View>
      {remainingProviders.length > 0 ? remainingProviders.map((account) => <ProviderCard account={account} key={account.id} manuallyCompleted={manuallyCompleted} />) : <View style={styles.infoBox}><Text style={styles.infoTitle}>All confirmed</Text><Text style={styles.infoText}>Every provider in this plan has been marked completed by the household.</Text></View>}
      {completedProviders.length > 0 && <View style={styles.section}><View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>USER CONFIRMED</Text><Text style={styles.heading}>Completed address changes</Text></View></View>{completedProviders.map((account) => <View style={styles.completedProvider} key={account.id}><Text style={styles.completedProviderName}>{account.provider}</Text><Text style={styles.completedProviderStatus}>COMPLETED</Text></View>)}</View>}
      <Footer />
    </Page>

    <Page size="LETTER" style={styles.page} wrap><View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>{verifiedMode ? 'EXECUTION TIMELINE' : 'RECOMMENDED SEQUENCE'}</Text><Text style={styles.heading}>{verifiedMode ? 'Completed and remaining work' : 'What to do, in order'}</Text></View><Text style={styles.sectionMeta}>{state.actions.length} actions</Text></View>{state.actions.map((action) => <ActionCard accounts={state.accounts} action={action} key={action.id} manuallyCompleted={manuallyCompleted} />)}<Footer /></Page>

    <Page size="LETTER" style={styles.page}>
      <View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>{verifiedMode ? 'FINAL VERIFICATION' : 'PROGRESS'}</Text><Text style={styles.heading}>{verifiedMode ? 'Execution receipt' : 'Your move action plan is ready'}</Text></View><Text style={styles.sectionMeta}>{receipt?.generatedAt.slice(0, 10) ?? state.moveCase.moveDate}</Text></View>
      <View style={styles.receipt}><Text style={styles.receiptTitle}>{receipt ? receipt.blockedActions === 0 && receipt.failedActions === 0 ? 'Move plan verified' : 'Household handoff ready' : 'Complete the official provider actions'}</Text><View style={styles.receiptRow}><View style={styles.receiptItem}><Text style={styles.receiptValue}>{receipt?.verifiedActions ?? manualActionCount}</Text><Text style={styles.receiptLabel}>{verifiedMode ? 'Verified actions' : 'User-confirmed actions'}</Text></View><View style={styles.receiptItem}><Text style={styles.receiptValue}>{receipt?.blockedActions ?? Math.max(0, state.actions.length - manualActionCount)}</Text><Text style={styles.receiptLabel}>Remaining actions</Text></View><View style={styles.receiptItem}><Text style={styles.receiptValue}>{receipt?.failedActions ?? 0}</Text><Text style={styles.receiptLabel}>Failed</Text></View><View style={[styles.receiptItem, { marginRight: 0 }]}><Text style={styles.receiptValue}>{receipt?.serviceGaps ?? 0}</Text><Text style={styles.receiptLabel}>Service gaps</Text></View></View></View>
      <View style={styles.section}><View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>HOUSEHOLD CHECKLIST</Text><Text style={styles.heading}>{remainingActions.length > 0 ? 'Still to complete' : 'Move-day safeguards'}</Text></View></View>{remainingActions.length > 0 ? remainingActions.map((action) => <ActionCard accounts={state.accounts} action={action} key={action.id} manuallyCompleted={manuallyCompleted} />) : ['Keep this PDF available offline', 'Confirm truck pickup and destination drop-off', 'Recheck utilities and internet 24 hours before moving', 'Keep provider confirmations until the first new-address bill arrives'].map((item) => <View style={styles.action} key={item}><Text style={styles.actionDot}>OK</Text><View style={styles.actionBody}><Text style={styles.actionTitle}>{item}</Text><Text style={styles.actionDetail}>Recommended move-day safeguard.</Text></View></View>)}</View>
      <View style={styles.infoBox}><Text style={styles.infoTitle}>{verifiedMode ? 'Privacy and evidence' : 'Important limitation'}</Text><Text style={styles.infoText}>{verifiedMode ? 'This report omits raw account numbers, OAuth data, email contents, and internal confirmation identifiers.' : 'This document is a personalized recommendation and progress tracker. Only providers explicitly marked by the household are shown as user confirmed. No external account change is represented as agent verified.'}</Text></View>
      <Footer />
    </Page>
  </Document>;
}
