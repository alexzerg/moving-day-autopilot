import { useCallback, useEffect, useMemo, useState } from 'react';
import { floridaJurisdictionPack } from '@moving-day/contracts';
import type { MoveAction, MoveState, ProviderAccount } from '@moving-day/contracts';
import { AGENT_RESPONSE_EVENT, moveApi, readLatestCloudState } from './api';
import { downloadMovePacket } from './packet';
import './App.css';

const kindIcon: Record<string, string> = {
  electricity: '⚡', water: '◉', internet: '⌁', insurance: '◇', postal: '✉',
  employer: '▣', financial: '$', mobile: '▯', subscription: '▶', delivery: '⬡',
};

const stageLabels = ['Discover', 'Plan', 'Decide', 'Execute', 'Verify'];
const cloudMode = import.meta.env.VITE_AGENT_MODE === 'cloud';

function addressLine(address: MoveState['moveCase']['oldAddress']) {
  return `${address.line1}, ${address.city}, ${address.region} ${address.postalCode}`;
}

function currentStage(state: MoveState | null) {
  if (!state || state.accounts.length === 0) return 0;
  if (state.actions.length === 0) return 1;
  if (!state.decisions.every((decision) => decision.selectedOption)) return 2;
  if (!state.actions.some((action) => action.status === 'executed' || action.status === 'verified')) return 3;
  if (!state.receipt) return 4;
  return 5;
}

function AccountCard({ account }: { account: ProviderAccount }) {
  return (
    <article className="service-card">
      <div className={`service-icon ${account.kind}`}>{kindIcon[account.kind]}</div>
      <div><strong>{account.provider}</strong><span>{account.kind.replace('-', ' ')}</span></div>
      <span className={`state-pill ${account.state}`}>{account.state.replace('-', ' ')}</span>
    </article>
  );
}

function ActionRow({ action }: { action: MoveAction }) {
  return (
    <div className="action-row">
      <span className={`action-dot ${action.status}`} />
      <div><strong>{action.label}</strong><span>{action.scheduledFor} · {action.kind.replace('-', ' ')}</span></div>
      <span className={`risk ${action.risk}`}>{action.risk}</span>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<MoveState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>(['Demo case ready. Ask the agent to discover address-linked services.']);
  const [agentResponse, setAgentResponse] = useState('The cloud agent response will appear here after each operation.');
  const [draftReady, setDraftReady] = useState(false);
  const [moveDraft, setMoveDraft] = useState({
    moveDate: '', oldLine1: '', oldCity: '', oldPostal: '', newLine1: '', newCity: '', newPostal: '',
  });
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceText, setEvidenceText] = useState('');

  const refresh = useCallback(async () => setState(await moveApi.state()), []);
  useEffect(() => { refresh().catch((reason: Error) => setError(reason.message)); }, [refresh]);
  useEffect(() => {
    const onResponse = (event: Event) => setAgentResponse((event as CustomEvent<string>).detail);
    window.addEventListener(AGENT_RESPONSE_EVENT, onResponse);
    return () => window.removeEventListener(AGENT_RESPONSE_EVENT, onResponse);
  }, []);
  useEffect(() => {
    if (!state || draftReady) return;
    setMoveDraft({
      moveDate: state.moveCase.moveDate,
      oldLine1: state.moveCase.oldAddress.line1,
      oldCity: state.moveCase.oldAddress.city,
      oldPostal: state.moveCase.oldAddress.postalCode,
      newLine1: state.moveCase.newAddress.line1,
      newCity: state.moveCase.newAddress.city,
      newPostal: state.moveCase.newAddress.postalCode,
    });
    setDraftReady(true);
  }, [state, draftReady]);

  const run = useCallback(async (label: string, operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try {
      await operation();
      const cloudState = readLatestCloudState();
      if (cloudMode && cloudState) setState(cloudState);
      else await refresh();
      setActivity((items) => [label, ...items].slice(0, 6));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  }, [refresh]);

  const configureMove = () => run('Move details configured.', () => moveApi.configure({
    moveDate: moveDraft.moveDate,
    oldAddress: { line1: moveDraft.oldLine1, city: moveDraft.oldCity, region: 'FL', postalCode: moveDraft.oldPostal, country: 'US' },
    newAddress: { line1: moveDraft.newLine1, city: moveDraft.newCity, region: 'FL', postalCode: moveDraft.newPostal, country: 'US' },
  }));

  const importEvidence = async () => {
    const documents = await Promise.all(evidenceFiles.map(async (file) => ({ name: file.name, text: (await file.text()).slice(0, 9000) })));
    if (evidenceText.trim()) documents.push({ name: 'pasted-move-inbox.txt', text: evidenceText.trim().slice(0, 9000) });
    if (documents.length === 0) {
      setError('Upload at least one text/email file or paste service evidence.');
      return;
    }
    await run(`Agent extracted services from ${documents.length} evidence source${documents.length === 1 ? '' : 's'}.`, () => moveApi.ingestEvidence(documents));
  };

  const loadSampleEvidence = async () => {
    const response = await fetch('/sample-move-inbox.txt');
    setEvidenceText(await response.text());
    setActivity((items) => ['Sample move inbox loaded. Review it, then ask the agent to analyze evidence.', ...items].slice(0, 6));
  };

  const exportPacket = async () => {
    if (!state?.receipt) return;
    setBusy(true); setError(null);
    try {
      await downloadMovePacket(state);
      setActivity((items) => ['Move Packet downloaded: PDF, calendar, confirmations, drafts, tasks and receipt.', ...items].slice(0, 6));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  };

  const stage = currentStage(state);
  const decision = state?.decisions[0] ?? null;
  const verified = state?.actions.filter((action) => action.status === 'verified').length ?? 0;
  const blocked = state?.actions.filter((action) => action.status === 'blocked').length ?? 0;
  const identityTasks = state?.actions.filter((action) => action.risk === 'identity' && action.status === 'blocked') ?? [];
  const automatic = state?.actions.filter((action) => action.risk === 'automatic').length ?? 0;
  const moveDate = state ? new Date(`${state.moveCase.moveDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const primary = useMemo(() => {
    if (!state || state.accounts.length === 0) return { label: 'Discover household services', run: () => run('Agent discovered 11 address-linked services.', moveApi.discover) };
    if (state.actions.length === 0) return { label: 'Build dependency-safe plan', run: () => run('Agent built the Florida move cutover plan.', moveApi.plan) };
    if (decision && !decision.selectedOption) return null;
    if (!state.actions.some((action) => action.status === 'executed' || action.status === 'verified')) return { label: 'Execute approved actions', run: () => run('Agent executed every approved provider action.', () => moveApi.execute(decision?.approvalToken ?? null)) };
    if (!state.receipt) return { label: 'Verify provider state', run: () => run('Agent verified provider state and issued the completion receipt.', moveApi.verify) };
    return null;
  }, [state, decision, run]);

  if (!state) return <main className="loading">Connecting to the Strands agent service…</main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="mark">↗</div><div><strong>Moving-Day Autopilot</strong><span>Jurisdiction-aware household cutover</span></div></div>
        <div className="runtime"><i /> {cloudMode ? 'AWS AGENTCORE · STRANDS · 10 TOOLS' : 'LOCAL STRANDS AGENT · 10 TOOLS'}</div>
      </header>

      <section className="hero">
        <div><span className="eyebrow">MOVE CASE · {state.moveCase.id}</span><h1>Move the household.<br />Not the administrative burden.</h1><p>The agent discovers every address-linked service, plans the cutover, executes safe work, and interrupts only when a person must decide.</p></div>
        <div className="date-card"><span>MOVE DATE</span><strong>{moveDate}</strong><small>United States · Florida pack</small></div>
      </section>

      <section className="route-card">
        <div className="address"><span>FROM</span><strong>{addressLine(state.moveCase.oldAddress)}</strong></div>
        <div className="route-line"><i /><b>35 mi</b><i /></div>
        <div className="address right"><span>TO</span><strong>{addressLine(state.moveCase.newAddress)}</strong></div>
      </section>

      {state.accounts.length === 0 && <section className="move-setup">
        <div><span className="eyebrow">YOUR MOVE DETAILS</span><h2>Configure the cutover before discovery</h2><p>The public demo supports Florida-to-Florida moves. Change the synthetic values to see the plan recalculate around your date and route.</p></div>
        <div className="setup-fields">
          <label>Move date<input type="date" value={moveDraft.moveDate} onChange={(event) => setMoveDraft({ ...moveDraft, moveDate: event.target.value })} /></label>
          <label>Old street<input value={moveDraft.oldLine1} onChange={(event) => setMoveDraft({ ...moveDraft, oldLine1: event.target.value })} /></label>
          <label>Old city<input value={moveDraft.oldCity} onChange={(event) => setMoveDraft({ ...moveDraft, oldCity: event.target.value })} /></label>
          <label>Old ZIP<input value={moveDraft.oldPostal} onChange={(event) => setMoveDraft({ ...moveDraft, oldPostal: event.target.value })} /></label>
          <label>New street<input value={moveDraft.newLine1} onChange={(event) => setMoveDraft({ ...moveDraft, newLine1: event.target.value })} /></label>
          <label>New city<input value={moveDraft.newCity} onChange={(event) => setMoveDraft({ ...moveDraft, newCity: event.target.value })} /></label>
          <label>New ZIP<input value={moveDraft.newPostal} onChange={(event) => setMoveDraft({ ...moveDraft, newPostal: event.target.value })} /></label>
          <button disabled={busy || !moveDraft.moveDate || !moveDraft.oldLine1 || !moveDraft.newLine1} onClick={configureMove}>Apply move details</button>
        </div>
      </section>}

      {state.accounts.length === 0 && <section className="evidence-import">
        <div><span className="eyebrow">BRING YOUR OWN MOVE INBOX</span><h2>Let the agent discover your providers</h2><p>Upload text-based bills or emails. Account references are masked before they enter move state.</p><button className="sample-button" onClick={loadSampleEvidence}>Load sample inbox</button></div>
        <div className="evidence-inputs"><label>Files<input type="file" multiple accept=".txt,.eml,.csv,.json,text/plain,message/rfc822,text/csv,application/json" onChange={(event) => setEvidenceFiles(Array.from(event.target.files ?? []))} /></label><label>Or paste bill/email text<textarea rows={5} value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} placeholder="Provider: ...\nService: electricity\nAccount: ...\nMonthly Cost: ..." /></label><button disabled={busy || (evidenceFiles.length === 0 && !evidenceText.trim())} onClick={importEvidence}>Analyze bills and emails</button></div>
      </section>}

      <section className="stages">
        {stageLabels.map((label, index) => <div key={label} className={index < stage ? 'done' : index === stage ? 'active' : ''}><span>{index < stage ? '✓' : index + 1}</span><b>{label}</b></div>)}
      </section>

      <section className="metrics">
        <article><span>Services discovered</span><strong>{state.accounts.length}</strong><small>from demo inbox + registry</small></article>
        <article><span>Planned actions</span><strong>{state.actions.length}</strong><small>{automatic} automatic</small></article>
        <article><span>Human decisions</span><strong>{state.decisions.filter((item) => !item.selectedOption).length}</strong><small>only bounded trade-offs</small></article>
        <article><span>Verified / blocked</span><strong>{verified} / {blocked}</strong><small>{state.receipt ? `${state.receipt.serviceGaps} service gaps` : 'verification pending'}</small></article>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <div className="workspace">
        <section className="main-column">
          <article className="panel">
            <div className="panel-title"><div><span className="eyebrow">DISCOVERED ACCOUNTS</span><h2>Address-linked services</h2></div><span>{state.accounts.length || 'Not scanned yet'}</span></div>
            {state.accounts.length ? <div className="service-grid">{state.accounts.map((account) => <AccountCard key={account.id} account={account} />)}</div> : <div className="empty"><div className="scan-icon">⌕</div><strong>The agent has not inspected the household yet.</strong><span>Discovery uses a deterministic inbox and account-registry fixture.</span></div>}
          </article>

          <article className="panel jurisdiction-card">
            <div className="panel-title"><div><span className="eyebrow">SOURCE-AWARE JURISDICTION PACK</span><h2>United States · Florida</h2></div><span>v{floridaJurisdictionPack.version}</span></div>
            <div className="jurisdiction-rules">{floridaJurisdictionPack.rules.map((rule) => <a key={rule.id} href={rule.sourceUrl} target="_blank" rel="noreferrer"><div><strong>{rule.title}</strong><span>{rule.classification} · checked {rule.checkedAt}</span></div><b>{rule.humanIdentityRequired ? 'Human ID' : 'Agent-ready'} ↗</b></a>)}</div>
          </article>

          {state.actions.length > 0 && <article className="panel"><div className="panel-title"><div><span className="eyebrow">DEPENDENCY-AWARE PLAN</span><h2>Administrative cutover</h2></div><span>{state.actions.length} actions</span></div><div className="action-list">{state.actions.slice(0, 12).map((action) => <ActionRow key={action.id} action={action} />)}</div>{state.actions.length > 12 && <div className="more-actions">+ {state.actions.length - 12} additional verification and closeout actions</div>}</article>}
        </section>

        <aside className="side-column">
          {decision && !decision.selectedOption && <article className="panel decision-card"><span className="eyebrow">HUMAN DECISION REQUIRED</span><h2>{decision.question}</h2><p>The agent paused only the branch where cost and continuity conflict.</p>{decision.options.map((option) => <button key={option.id} disabled={busy} onClick={() => run(`Operator selected: ${option.label}`, () => moveApi.decide(decision.id, option.id))}><div><strong>{option.label}</strong><span>{option.consequence}</span></div><b>${option.monthlyCost}/mo</b></button>)}</article>}

          {state.receipt && identityTasks.length > 0 && <article className="panel identity-card"><span className="eyebrow">HOUSEHOLD HANDOFF</span><h2>Finish the identity-only steps</h2><p>The agent prepared these updates but cannot impersonate the household. Confirm each only after completing the provider identity check.</p>{identityTasks.map((action) => <button key={action.id} disabled={busy} onClick={() => run(`Household completed: ${action.label}`, () => moveApi.completeIdentity(action.id))}><div><strong>{action.label}</strong><span>{action.confirmation ?? 'Prepared and waiting for identity verification.'}</span></div><b>Confirm done</b></button>)}</article>}

          {state.receipt && <article className="panel receipt-card"><span className="eyebrow">MOVE EXECUTION RECEIPT</span><div className="verified-mark">✓</div><h2>{state.receipt.blockedActions === 0 ? 'Move complete' : 'Agent work verified'}</h2><p>{state.receipt.blockedActions === 0 ? `All ${state.receipt.verifiedActions} actions are verified. No household work remains.` : `${state.receipt.verifiedActions} actions verified; ${state.receipt.blockedActions} identity tasks remain with the household.`}</p><div className="receipt-grid"><span>Service gaps <b>{state.receipt.serviceGaps}</b></span><span>Failures <b>{state.receipt.failedActions}</b></span><span>Identity tasks <b>{state.receipt.blockedActions}</b></span><span>Confirmations <b>{state.receipt.confirmations.length}</b></span></div></article>}

          {state.receipt && <article className="panel packet-card"><span className="eyebrow">TANGIBLE MOVE OUTPUT</span><h2>Download the Move Packet</h2><p>Everything the household needs after the agent finishes.</p><div className="packet-files"><span>PDF plan</span><span>Calendar .ics</span><span>Confirmations .csv</span><span>11 email drafts</span><span>Household tasks</span><span>JSON receipt</span></div><button disabled={busy} onClick={exportPacket}>Download Move Packet .zip</button></article>}

          <article className="panel next-card"><span className="eyebrow">AGENT CONTROL</span>{primary ? <><h2>{primary.label}</h2><p>Safe actions run automatically. Payments, identity and irreversible work stay gated.</p><button className="primary" disabled={busy} onClick={primary.run}>{busy ? 'Working…' : primary.label}</button></> : decision && !decision.selectedOption ? <><h2>Waiting for one decision</h2><p>Choose the internet trade-off above. Every other branch remains ready.</p></> : <><h2>{state.receipt?.blockedActions === 0 ? 'Move complete' : state.receipt ? 'Household handoff ready' : 'Approved plan ready'}</h2><p>{state.receipt?.blockedActions === 0 ? 'Every planned action is verified and no household work remains.' : state.receipt ? `${state.receipt.blockedActions} identity tasks are prepared above; complete them to close the move.` : 'The agent now has the exact token required to execute.'}</p></>}<button className="reset" disabled={busy} onClick={() => run('Demo case reset.', moveApi.reset)}>Reset demo</button></article>

          {cloudMode && <article className="panel transcript-card"><span className="eyebrow">LIVE AGENTCORE RESPONSE</span><p>{agentResponse}</p></article>}
          <article className="panel activity-card"><span className="eyebrow">AGENT ACTIVITY</span>{activity.map((item, index) => <div key={`${item}-${index}`}><i className={index === 0 ? 'live' : ''} /><span>{item}</span></div>)}</article>
        </aside>
      </div>
    </main>
  );
}
