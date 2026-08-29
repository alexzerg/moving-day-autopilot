import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MoveAction, MoveState, ProviderAccount } from '@moving-day/contracts';
import { moveApi } from './api';
import './App.css';

const kindIcon: Record<string, string> = {
  electricity: '⚡', water: '◉', internet: '⌁', insurance: '◇', postal: '✉',
  employer: '▣', financial: '$', mobile: '▯', subscription: '▶', delivery: '⬡',
};

const stageLabels = ['Discover', 'Plan', 'Decide', 'Execute', 'Verify'];

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

  const refresh = useCallback(async () => setState(await moveApi.state()), []);
  useEffect(() => { refresh().catch((reason: Error) => setError(reason.message)); }, [refresh]);

  const run = useCallback(async (label: string, operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try {
      await operation();
      await refresh();
      setActivity((items) => [label, ...items].slice(0, 6));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  }, [refresh]);

  const stage = currentStage(state);
  const decision = state?.decisions[0] ?? null;
  const verified = state?.actions.filter((action) => action.status === 'verified').length ?? 0;
  const blocked = state?.actions.filter((action) => action.status === 'blocked').length ?? 0;
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
        <div className="runtime"><i /> STRANDS AGENT · 6 TOOLS</div>
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

          {state.actions.length > 0 && <article className="panel"><div className="panel-title"><div><span className="eyebrow">DEPENDENCY-AWARE PLAN</span><h2>Administrative cutover</h2></div><span>{state.actions.length} actions</span></div><div className="action-list">{state.actions.slice(0, 12).map((action) => <ActionRow key={action.id} action={action} />)}</div>{state.actions.length > 12 && <div className="more-actions">+ {state.actions.length - 12} additional verification and closeout actions</div>}</article>}
        </section>

        <aside className="side-column">
          {decision && !decision.selectedOption && <article className="panel decision-card"><span className="eyebrow">HUMAN DECISION REQUIRED</span><h2>{decision.question}</h2><p>The agent paused only the branch where cost and continuity conflict.</p>{decision.options.map((option) => <button key={option.id} disabled={busy} onClick={() => run(`Operator selected: ${option.label}`, () => moveApi.decide(decision.id, option.id))}><div><strong>{option.label}</strong><span>{option.consequence}</span></div><b>${option.monthlyCost}/mo</b></button>)}</article>}

          {state.receipt && <article className="panel receipt-card"><span className="eyebrow">MOVE COMPLETION RECEIPT</span><div className="verified-mark">✓</div><h2>Cutover verified</h2><p>{state.receipt.verifiedActions} actions verified across {state.receipt.discoveredServices} services.</p><div className="receipt-grid"><span>Service gaps <b>{state.receipt.serviceGaps}</b></span><span>Failures <b>{state.receipt.failedActions}</b></span><span>Identity tasks <b>{state.receipt.blockedActions}</b></span><span>Confirmations <b>{state.receipt.confirmations.length}</b></span></div></article>}

          <article className="panel next-card"><span className="eyebrow">AGENT CONTROL</span>{primary ? <><h2>{primary.label}</h2><p>Safe actions run automatically. Payments, identity and irreversible work stay gated.</p><button className="primary" disabled={busy} onClick={primary.run}>{busy ? 'Working…' : primary.label}</button></> : decision && !decision.selectedOption ? <><h2>Waiting for one decision</h2><p>Choose the internet trade-off above. Every other branch remains ready.</p></> : <><h2>{state.receipt ? 'Move complete' : 'Approved plan ready'}</h2><p>{state.receipt ? 'Every provider was read back and classified.' : 'The agent now has the exact token required to execute.'}</p></>}<button className="reset" disabled={busy} onClick={() => run('Demo case reset.', moveApi.reset)}>Reset demo</button></article>

          <article className="panel activity-card"><span className="eyebrow">AGENT ACTIVITY</span>{activity.map((item, index) => <div key={`${item}-${index}`}><i className={index === 0 ? 'live' : ''} /><span>{item}</span></div>)}</article>
        </aside>
      </div>
    </main>
  );
}
