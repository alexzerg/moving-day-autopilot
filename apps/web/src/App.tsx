import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { floridaJurisdictionPack } from '@moving-day/contracts';
import type { MoveAction, MoveState, ProviderAccount, RouteDistance } from '@moving-day/contracts';
import { AGENT_RESPONSE_EVENT, moveApi, readLatestCloudState } from './api';
import { parseBillFiles } from './bill-files';
import { downloadMoveReport } from './packet';
import type { MoveReportSelection } from './packet';
import { providerActionGuide } from './provider-actions';
import PhysicalPlanner from './PhysicalPlanner';
import './App.css';

const kindIcon: Record<string, string> = {
  electricity: '⚡', water: '◉', internet: '⌁', insurance: '◇', postal: '✉',
  employer: '▣', financial: '$', mobile: '▯', subscription: '▶', delivery: '⬡',
};

const stageLabels = ['Discover', 'Plan', 'Decide', 'Execute', 'Verify'];
const cloudMode = import.meta.env.VITE_AGENT_MODE === 'cloud';
const routeReadyKey = 'moving-day-route-ready';
const routeDistanceKey = 'moving-day-route-distance';
const physicalProfileKey = 'moving-day-physical-profile';
const realCompletionKey = 'moving-day-real-provider-completions';

function defaultMoveDate() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function savedRealCompletions() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(realCompletionKey) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function addressLine(address: MoveState['moveCase']['oldAddress']) {
  return `${address.line1}, ${address.city}, ${address.region} ${address.postalCode}`;
}

function milesFromMiami(latitude: number, longitude: number) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const miamiLatitude = toRadians(25.7617);
  const targetLatitude = toRadians(latitude);
  const deltaLatitude = targetLatitude - miamiLatitude;
  const deltaLongitude = toRadians(longitude + 80.1918);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(miamiLatitude) * Math.cos(targetLatitude) * Math.sin(deltaLongitude / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function currentStage(state: MoveState | null) {
  if (!state || state.accounts.length === 0) return 0;
  if (state.actions.length === 0) return 1;
  if (!state.decisions.every((decision) => decision.selectedOption)) return 2;
  if (!state.actions.some((action) => action.status === 'executed' || action.status === 'verified')) return 3;
  if (!state.receipt) return 4;
  return 5;
}

function AccountCard({ account, newAddress, moveDate, guidedMode, manuallyCompleted, onToggleCompleted }: { account: ProviderAccount; newAddress: MoveState['moveCase']['newAddress']; moveDate: string; guidedMode: boolean; manuallyCompleted: boolean; onToggleCompleted: () => void }) {
  const guide = providerActionGuide(account);
  return (
    <article className="service-card actionable">
      <div className="service-card-head">
        <div className={`service-icon ${account.kind}`}>{kindIcon[account.kind]}</div>
        <div><strong>{account.provider}</strong><span>{account.kind.replace('-', ' ')}</span></div>
        <span className={`state-pill ${account.state}`}>{account.state.replace('-', ' ')}</span>
      </div>
      <div className="provider-action-guide">
        <div><span>{guide.verified ? 'VERIFIED OFFICIAL PATH' : 'GUIDED HANDOFF'}</span><strong>{guide.title}</strong><small>{guide.channel}</small></div>
        <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        <small>Use: {addressLine(newAddress)} · target date {moveDate}</small>
        {guide.url ? <a href={guide.url} target="_blank" rel="noreferrer">Open official action ↗</a> : <b>Official deep link not verified — open the provider app or account website.</b>}
        {guidedMode && <button className={`manual-completion ${manuallyCompleted ? 'completed' : ''}`} onClick={onToggleCompleted} type="button">{manuallyCompleted ? 'Completed — undo' : 'Mark as completed'}</button>}
      </div>
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
  const [activity, setActivity] = useState<string[]>(['Enter the real move route to calculate road distance and cost.']);
  const [agentResponse, setAgentResponse] = useState('The cloud agent response will appear here after each operation.');
  const [addressesReady, setAddressesReady] = useState(false);
  const [routeDistance, setRouteDistance] = useState<RouteDistance | null>(null);
  const [reportSelection, setReportSelection] = useState<MoveReportSelection | null>(null);
  const [evidenceMode, setEvidenceMode] = useState<'sandbox' | 'real' | null>(null);
  const [realCompletedProviderIds, setRealCompletedProviderIds] = useState<string[]>([]);
  const [providersConfirmed, setProvidersConfirmed] = useState(false);
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);
  const [moveDraft, setMoveDraft] = useState({ moveDate: defaultMoveDate(), oldAddress: '', newAddress: '' });
  const [gmail, setGmail] = useState<{ configured: boolean; connected: boolean; email: string | null }>({ configured: false, connected: false, email: null });

  const refresh = useCallback(async () => setState(await moveApi.state()), []);
  useEffect(() => {
    const bootstrap = async () => {
      const oauthStatus = new URLSearchParams(window.location.search).get('gmail');
      const oauthReturn = Boolean(oauthStatus);
      let nextState: MoveState;
      if (oauthReturn) {
        nextState = await moveApi.state();
        const ready = window.sessionStorage.getItem(routeReadyKey) === '1';
        setAddressesReady(ready);
        const savedRoute = window.sessionStorage.getItem(routeDistanceKey);
        setRouteDistance(savedRoute ? JSON.parse(savedRoute) as RouteDistance : null);
        setRealCompletedProviderIds(savedRealCompletions());
        if (ready) {
          setMoveDraft({
            moveDate: nextState.moveCase.moveDate,
            oldAddress: addressLine(nextState.moveCase.oldAddress),
            newAddress: addressLine(nextState.moveCase.newAddress),
          });
        }
      } else {
        window.sessionStorage.removeItem(routeReadyKey);
        window.sessionStorage.removeItem(routeDistanceKey);
        window.sessionStorage.removeItem(physicalProfileKey);
        window.sessionStorage.removeItem(realCompletionKey);
        setRealCompletedProviderIds([]);
        setAddressesReady(false);
        setRouteDistance(null);
        nextState = await moveApi.reset();
        await moveApi.gmailDisconnect();
      }
      setGmail(await moveApi.gmailStatus());
      setProvidersConfirmed(nextState.actions.length > 0);
      setState(nextState);
      if (window.location.search) window.history.replaceState({}, '', window.location.pathname);
    };
    bootstrap().catch((reason: Error) => setError(reason.message));
  }, []);
  useEffect(() => {
    const onResponse = (event: Event) => setAgentResponse((event as CustomEvent<string>).detail);
    window.addEventListener(AGENT_RESPONSE_EVENT, onResponse);
    return () => window.removeEventListener(AGENT_RESPONSE_EVENT, onResponse);
  }, []);
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

  const configureMove = () => {
    setAddressesReady(false);
    setRouteDistance(null);
    return run('Addresses verified and road routing attempted.', async () => {
      const [origin, destination] = await Promise.all([
        moveApi.resolveAddress(moveDraft.oldAddress),
        moveApi.resolveAddress(moveDraft.newAddress),
      ]);
      if (origin.address.region !== 'FL' || destination.address.region !== 'FL') throw new Error('Both addresses must be in Florida.');
      if (milesFromMiami(origin.latitude, origin.longitude) > 200 || milesFromMiami(destination.latitude, destination.longitude) > 200) {
        throw new Error('Both addresses must be within 200 miles of Miami.');
      }
      await moveApi.configure({ moveDate: moveDraft.moveDate, oldAddress: origin.address, newAddress: destination.address });
      setAddressesReady(true);
      window.sessionStorage.setItem(routeReadyKey, '1');
      try {
        const route = await moveApi.routeDistance({ origin, destination });
        setRouteDistance(route);
        window.sessionStorage.setItem(routeDistanceKey, JSON.stringify(route));
      } catch (reason) {
        window.sessionStorage.removeItem(routeDistanceKey);
        setError(`Addresses are saved, but driving distance is temporarily unavailable: ${reason instanceof Error ? reason.message : 'routing provider error'}`);
      }
    });
  };

  const resetMove = () => {
    window.sessionStorage.removeItem(routeReadyKey);
    window.sessionStorage.removeItem(routeDistanceKey);
    window.sessionStorage.removeItem(physicalProfileKey);
    window.sessionStorage.removeItem(realCompletionKey);
    setRealCompletedProviderIds([]);
    setAddressesReady(false);
    setRouteDistance(null);
    setReportSelection(null);
    setEvidenceMode(null);
    setProvidersConfirmed(false);
    setSelectedProviderIds([]);
    setMoveDraft({ moveDate: defaultMoveDate(), oldAddress: '', newAddress: '' });
    setGmail((current) => ({ ...current, connected: false, email: null }));
    return run('Move and Gmail session reset. Enter a new route.', async () => {
      await moveApi.gmailDisconnect();
      await moveApi.reset();
    });
  };

  const scanGmail = async () => {
    setEvidenceMode('real');
    setRealCompletedProviderIds([]);
    window.sessionStorage.removeItem(realCompletionKey);
    setProvidersConfirmed(false);
    setSelectedProviderIds([]);
    await run('Agent scanned recent bills and staged provider candidates for review.', moveApi.gmailScan);
  };

  const connectGmail = () => {
    const popup = window.open('/api/auth/google/start?mode=popup', 'moving-day-gmail-oauth', 'popup=yes,width=560,height=720,resizable=yes,scrollbars=yes');
    if (!popup) {
      window.location.href = '/api/auth/google/start';
      return;
    }
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'moving-day-gmail-oauth') return;
      window.removeEventListener('message', onMessage);
      popup.close();
      const status = await moveApi.gmailStatus();
      setGmail(status);
      if (!status.connected) setError(event.data?.status === 'forbidden' ? 'This Google account is not authorized.' : 'Gmail connection failed.');
    };
    window.addEventListener('message', onMessage);
    const closedCheck = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(closedCheck);
      window.removeEventListener('message', onMessage);
    }, 500);
  };

  const disconnectGmail = async () => {
    await moveApi.gmailDisconnect();
    setGmail({ ...gmail, connected: false, email: null });
    setActivity((items) => ['Gmail disconnected. Stored OAuth cookie removed.', ...items].slice(0, 6));
  };

  const useSandboxInbox = async () => {
    if (!state) return;
    setEvidenceMode('sandbox');
    setRealCompletedProviderIds([]);
    window.sessionStorage.removeItem(realCompletionKey);
    setProvidersConfirmed(false);
    setSelectedProviderIds([]);
    const response = await fetch('/sandbox-inbox.txt');
    const text = (await response.text()).replaceAll('100 Harbor Lane, Hollywood, FL 33020', addressLine(state.moveCase.oldAddress));
    await run('Agent scanned the sandbox inbox and staged provider candidates for review.', () => moveApi.ingestEvidence([{ name: 'sandbox-inbox.txt', text }]));
  };

  const uploadBills = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setEvidenceMode('real');
    setRealCompletedProviderIds([]);
    window.sessionStorage.removeItem(realCompletionKey);
    setProvidersConfirmed(false);
    setSelectedProviderIds([]);
    await run(`Agent parsed ${files.length} uploaded bill file${files.length === 1 ? '' : 's'} and staged provider candidates.`, async () => moveApi.ingestEvidence(await parseBillFiles(files)));
  };

  const confirmProviders = () => run('Human confirmed the provider accounts used by the move plan.', async () => {
    const confirmedAccounts = state?.accounts.filter((account) => selectedProviderIds.includes(account.id)) ?? [];
    const result = await moveApi.confirmProviders(confirmedAccounts);
    setProvidersConfirmed(true);
    return result;
  });

  const toggleRealCompletion = (accountId: string) => {
    setRealCompletedProviderIds((current) => {
      const next = current.includes(accountId) ? current.filter((id) => id !== accountId) : [...current, accountId];
      window.sessionStorage.setItem(realCompletionKey, JSON.stringify(next));
      return next;
    });
  };

  const exportReport = async () => {
    if (!state || (!state.receipt && state.actions.length === 0)) return;
    setBusy(true); setError(null);
    try {
      await downloadMoveReport(state, reportSelection, routeDistance, realCompletedProviderIds);
      setActivity((items) => ['Move execution report downloaded as a phone-friendly PDF.', ...items].slice(0, 6));
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
  const moveDate = state && routeDistance ? new Date(`${state.moveCase.moveDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const primary = useMemo(() => {
    if (!state || state.accounts.length === 0 || !providersConfirmed) return null;
    if (state.actions.length === 0) return evidenceMode === 'sandbox'
      ? { label: 'Run AI Autopilot', run: () => run('Nova inspected move state and selected the next Strands tools.', moveApi.autopilot) }
      : { label: 'Build AI action plan', run: () => run('Nova built a guided plan for the confirmed real accounts.', moveApi.plan) };
    if (decision && !decision.selectedOption) return null;
    if (evidenceMode === 'real') return null;
    if (!state.actions.some((action) => action.status === 'executed' || action.status === 'verified')) return { label: 'Resume AI Autopilot', run: () => run('Nova resumed the approved branches and verified provider state.', moveApi.autopilot) };
    if (!state.receipt) return { label: 'Verify provider state', run: () => run('Agent verified provider state and issued the completion receipt.', moveApi.verify) };
    return null;
  }, [state, decision, evidenceMode, providersConfirmed, run]);

  if (!state) return <main className="loading"><div className="loading-agent"><span>AMAZON BEDROCK AGENTCORE</span><h1>Starting a fresh move workspace</h1><p>The Strands agent is creating an isolated session and loading 11 move tools. Previous move and Gmail session data are not reused.</p><div className="agent-pulse"><i /><b>Amazon Nova is preparing the agent loop</b></div></div></main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="mark">↗</div><div><strong>Moving-Day Autopilot</strong><span>Jurisdiction-aware household cutover</span></div></div>
        <div className="runtime"><i /> {cloudMode ? 'STRANDS · AMAZON NOVA · AGENTCORE RUNTIME · 11 TOOLS' : 'LOCAL STRANDS AGENT · 11 TOOLS'}</div>
      </header>

      <section className="hero">
        <div><span className="eyebrow">MOVE CASE · {state.moveCase.id}</span><h1>Move the household.<br />Not the administrative burden.</h1><p>The agent discovers every address-linked service, plans the cutover, executes safe work, and interrupts only when a person must decide.</p></div>
        <div className="date-card"><span>MOVE DATE</span><strong>{moveDate}</strong><small>United States · Florida pack</small></div>
      </section>

      <section className="route-card">
        <div className="address"><span>FROM</span><strong title={routeDistance?.originMatch}>{routeDistance ? addressLine(state.moveCase.oldAddress) : 'Enter origin address'}</strong></div>
        <div className="route-line"><i /><b>{routeDistance ? `${routeDistance.distanceMiles} mi · ${routeDistance.durationMinutes} min` : 'Route pending'}</b><small>{routeDistance ? routeDistance.source.replace('-', ' + ') : 'Driving distance'}</small><i /></div>
        <div className="address right"><span>TO</span><strong title={routeDistance?.destinationMatch}>{routeDistance ? addressLine(state.moveCase.newAddress) : 'Enter destination address'}</strong></div>
      </section>

      {state.accounts.length === 0 && <section className="move-setup">
        <div><span className="eyebrow">YOUR REAL MOVE ROUTE</span><h2>Enter two real Florida street addresses</h2><p>A street such as “1931 Arthur St” is enough inside the supported area. The server searches nearby Florida addresses and resolves city, ZIP and coordinates before calculating driving miles.</p></div>
        <div className="setup-fields address-fields">
          <label>Move date<input type="date" value={moveDraft.moveDate} onChange={(event) => setMoveDraft({ ...moveDraft, moveDate: event.target.value })} /></label>
          <label>Moving from<input autoComplete="section-origin street-address" placeholder="1931 Arthur St" value={moveDraft.oldAddress} onChange={(event) => setMoveDraft({ ...moveDraft, oldAddress: event.target.value })} /></label>
          <label>Moving to<input autoComplete="section-destination street-address" placeholder="Street address or full address" value={moveDraft.newAddress} onChange={(event) => setMoveDraft({ ...moveDraft, newAddress: event.target.value })} /></label>
          <button disabled={busy || moveDraft.oldAddress.trim().length < 5 || moveDraft.newAddress.trim().length < 5} onClick={configureMove}>Verify addresses & calculate route</button>
          <small>City, state and ZIP are resolved automatically using U.S. Census data for full addresses and a bounded OpenStreetMap search for short street input. Coverage is limited to Florida within 200 miles of Miami.</small>
        </div>
      </section>}

      {routeDistance && <PhysicalPlanner profile={state.physicalProfile} moveCase={state.moveCase} route={routeDistance} busy={busy} onApply={(profile) => run('Agent recalculated volume, truck and labor requirements.', () => moveApi.estimatePhysical(profile))} onSelectionChange={setReportSelection} />}

      <section className="inbox-connect">
        <div><span className="eyebrow">AUTOMATIC PROVIDER DISCOVERY</span><h2>{state.accounts.length > 0 ? 'Refresh provider evidence' : 'Connect once. Let the agent find the services.'}</h2><p>{state.accounts.length > 0 ? 'Rescan the connected inbox at any time. Fresh evidence replaces the previous provider list without requiring a page refresh.' : 'Owner mode scans recent household bills through read-only Gmail OAuth. Account references are masked before entering move state.'}</p></div>
        <div className="inbox-actions">
          <div className={`gmail-status ${gmail.connected ? 'connected' : ''}`}><span>{gmail.connected ? 'Connected Gmail' : gmail.configured ? 'Gmail ready' : 'Gmail setup pending'}</span><strong>{gmail.email ?? (gmail.connected ? 'Connected account' : 'Read-only access')}</strong></div>
          {!gmail.connected && <button className="gmail-button" disabled={!gmail.configured} onClick={connectGmail}>Connect Gmail</button>}
          {gmail.connected && <button className="gmail-button" disabled={busy || !addressesReady} onClick={scanGmail}>{addressesReady ? (state.accounts.length > 0 ? 'Rescan connected inbox' : 'Scan connected inbox') : 'Verify addresses before scan'}</button>}
          {gmail.connected && <button className="disconnect-button" disabled={busy} onClick={disconnectGmail}>Disconnect</button>}
          <button className="sandbox-button" disabled={busy || !addressesReady} onClick={useSandboxInbox}>{addressesReady ? 'Use sandbox inbox' : 'Verify addresses before inbox scan'}</button>
          <label className={`upload-button ${busy || !addressesReady ? 'disabled' : ''}`}>Upload bills<input accept=".pdf,.txt,.eml,.html,.htm,application/pdf,text/plain,message/rfc822,text/html" disabled={busy || !addressesReady} multiple type="file" onChange={uploadBills} /></label>
        </div>
      </section>

      <section className="stages">
        {stageLabels.map((label, index) => <div key={label} className={index < stage ? 'done' : index === stage ? 'active' : ''}><span>{index < stage ? '✓' : index + 1}</span><b>{label}</b></div>)}
      </section>

      <section className="metrics">
        <article><span>Services discovered</span><strong>{state.accounts.length}</strong><small>from Gmail or sandbox inbox</small></article>
        <article><span>Planned actions</span><strong>{state.actions.length}</strong><small>{automatic} automatic</small></article>
        <article><span>Human decisions</span><strong>{state.decisions.filter((item) => !item.selectedOption).length}</strong><small>only bounded trade-offs</small></article>
        <article><span>Verified / blocked</span><strong>{verified} / {blocked}</strong><small>{state.receipt ? `${state.receipt.serviceGaps} service gaps` : 'verification pending'}</small></article>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <div className="workspace">
        <section className="main-column">
          {providersConfirmed && evidenceMode && <div className={`execution-mode ${evidenceMode}`}><strong>{evidenceMode === 'sandbox' ? 'Sandbox execution mode' : 'Real account guided mode'}</strong><span>{evidenceMode === 'sandbox' ? 'Strands tools execute deterministic provider adapters and verify state.' : `AI discovers, prioritizes, and guides. ${realCompletedProviderIds.length}/${state.accounts.length} address changes manually confirmed; external accounts change only through the official provider flow.`}</span></div>}
          <article className="panel">
            <div className="panel-title"><div><span className="eyebrow">{providersConfirmed ? 'CONFIRMED ACCOUNTS' : 'PROVIDER REVIEW'}</span><h2>{providersConfirmed ? 'Address-linked services' : 'Confirm providers for this move'}</h2></div><span>{state.accounts.length || 'Not scanned yet'}</span></div>
            {state.accounts.length === 0 ? <div className="empty"><div className="scan-icon">⌕</div><strong>No inbox has been scanned yet.</strong><span>Connect Gmail or use the sandbox inbox to discover address-linked services.</span></div> : !providersConfirmed && state.actions.length === 0 ? <div className="provider-review">
              <p>These candidates came from recent bills and statements. Check only accounts that should receive the new address.</p>
              <div className="provider-review-actions"><button onClick={() => setSelectedProviderIds(state.accounts.map((account) => account.id))}>Select all</button><button onClick={() => setSelectedProviderIds([])}>Clear</button></div>
              <div className="provider-checklist">{state.accounts.map((account) => {
                const relationshipCandidate = account.monthlyCost === 0 && account.accountReference.endsWith('SHIP');
                return <label key={account.id}><input type="checkbox" checked={selectedProviderIds.includes(account.id)} onChange={() => setSelectedProviderIds((current) => current.includes(account.id) ? current.filter((id) => id !== account.id) : [...current, account.id])} /><div><strong>{account.provider}</strong><span>{relationshipCandidate ? `${account.kind.replace('-', ' ')} · provider relationship detected · address requires confirmation` : `${account.kind.replace('-', ' ')} · ${account.accountReference} · ${account.monthlyCost}/mo`}</span></div><b>Confirm provider</b></label>;
              })}</div>
              <button className="confirm-providers" disabled={busy || selectedProviderIds.length === 0} onClick={confirmProviders}>Confirm {selectedProviderIds.length} selected provider{selectedProviderIds.length === 1 ? '' : 's'}</button>
            </div> : <div className="service-grid">{state.accounts.map((account) => <AccountCard key={account.id} account={account} newAddress={state.moveCase.newAddress} moveDate={state.moveCase.moveDate} guidedMode={evidenceMode === 'real'} manuallyCompleted={realCompletedProviderIds.includes(account.id)} onToggleCompleted={() => toggleRealCompletion(account.id)} />)}</div>}
          </article>

          <article className="panel jurisdiction-card">
            <div className="panel-title"><div><span className="eyebrow">SOURCE-AWARE JURISDICTION PACK</span><h2>United States · Florida</h2></div><span>v{floridaJurisdictionPack.version}</span></div>
            <div className="jurisdiction-rules">{floridaJurisdictionPack.rules.map((rule) => <a key={rule.id} href={rule.sourceUrl} target="_blank" rel="noreferrer"><div><strong>{rule.title}</strong><span>{rule.classification} · checked {rule.checkedAt}</span></div><b>{rule.humanIdentityRequired ? 'Human ID' : 'Agent-ready'} ↗</b></a>)}</div>
          </article>

          {state.actions.length > 0 && <article className="panel"><div className="panel-title"><div><span className="eyebrow">DEPENDENCY-AWARE PLAN</span><h2>Administrative cutover</h2></div><span>{state.actions.length} actions</span></div><div className="action-list">{state.actions.slice(0, 12).map((action) => <ActionRow key={action.id} action={action} />)}</div>{state.actions.length > 12 && <div className="more-actions">+ {state.actions.length - 12} additional verification and closeout actions</div>}</article>}
        </section>

        <aside className="side-column">
          {decision && !decision.selectedOption && <article className="panel decision-card"><span className="eyebrow">HUMAN DECISION REQUIRED</span><h2>{decision.question}</h2><p>{evidenceMode === 'sandbox' ? 'Nova paused the branch where cost and continuity conflict. Your choice becomes a bounded approval token, then the agent resumes sandbox execution.' : 'Nova needs this choice to finalize the guided sequence. Real provider accounts remain unchanged until you complete their official action flows.'}</p>{decision.options.map((option) => <button key={option.id} disabled={busy} onClick={() => evidenceMode === 'sandbox' ? run(`Human chose ${option.label}; Nova resumed safe branches.`, () => moveApi.continueAutopilot(decision.id, option.id)) : run(`Human chose ${option.label}; guided action plan updated.`, () => moveApi.decide(decision.id, option.id))}><div><strong>{option.label}</strong><span>{option.consequence}</span></div><b>${option.monthlyCost}/mo</b></button>)}</article>}

          {evidenceMode === 'sandbox' && state.receipt && identityTasks.length > 0 && <article className="panel identity-card"><span className="eyebrow">HOUSEHOLD HANDOFF</span><h2>Finish the identity-only steps</h2><p>The agent prepared these updates but cannot impersonate the household. Confirm each only after completing the provider identity check.</p>{identityTasks.map((action) => <button key={action.id} disabled={busy} onClick={() => run(`Household completed: ${action.label}`, () => moveApi.completeIdentity(action.id))}><div><strong>{action.label}</strong><span>{action.confirmation ?? 'Prepared and waiting for identity verification.'}</span></div><b>Confirm done</b></button>)}</article>}

          {evidenceMode === 'sandbox' && state.receipt && <article className="panel receipt-card"><span className="eyebrow">MOVE EXECUTION RECEIPT</span><div className="verified-mark">✓</div><h2>{state.receipt.blockedActions === 0 ? 'Move complete' : 'Agent work verified'}</h2><p>{state.receipt.blockedActions === 0 ? `All ${state.receipt.verifiedActions} actions are verified. No household work remains.` : `${state.receipt.verifiedActions} actions verified; ${state.receipt.blockedActions} identity tasks remain with the household.`}</p><div className="receipt-grid"><span>Service gaps <b>{state.receipt.serviceGaps}</b></span><span>Failures <b>{state.receipt.failedActions}</b></span><span>Identity tasks <b>{state.receipt.blockedActions}</b></span><span>Confirmations <b>{state.receipt.confirmations.length}</b></span></div></article>}

          {(state.receipt || (evidenceMode === 'real' && state.actions.length > 0 && (!decision || decision.selectedOption))) && <article className="panel packet-card"><span className="eyebrow">{evidenceMode === 'real' ? 'MOVE ACTION PLAN' : 'MOVE EXECUTION REPORT'}</span><h2>{evidenceMode === 'real' ? 'Download your address-change guide' : 'Download the final PDF'}</h2><p>{evidenceMode === 'real' ? 'A phone-friendly plan with every confirmed account, official action path, recommended order, route, truck, labor and cost. No provider is represented as already changed.' : 'A phone-friendly report with the selected truck and mover source, modeled cost, recorded decisions, completed provider work and the remaining household checklist.'}</p><div className="packet-files"><span>Route and mileage</span><span>Selected moving plan</span><span>Provider action links</span><span>{evidenceMode === 'real' ? 'Recommended sequence' : 'Completion evidence'}</span></div><button disabled={busy} onClick={exportReport}>{evidenceMode === 'real' ? `Download current plan PDF · ${Math.max(0, state.accounts.length - realCompletedProviderIds.length)} remaining` : 'Download move report .pdf'}</button></article>}

          <article className="panel next-card"><span className="eyebrow">AGENT CONTROL</span>{primary ? <><h2>{primary.label}</h2><p>Give Nova the outcome, not a tool name. The Strands agent inspects state, selects tools, executes safe branches and verifies results.</p><button className="primary" disabled={busy} onClick={primary.run}>{busy ? 'Agent reasoning and calling tools…' : primary.label}</button></> : state.accounts.length === 0 ? <><h2>Connect an inbox</h2><p>Use read-only Gmail discovery or the sandbox inbox. The agent will find providers before planning anything.</p></> : !providersConfirmed ? <><h2>Confirm providers</h2><p>Review the bill and statement candidates in the main panel. Only checked accounts enter the move plan.</p></> : decision && !decision.selectedOption ? <><h2>Waiting for one decision</h2><p>Choose the internet trade-off above. Every other branch remains ready.</p></> : evidenceMode === 'real' && state.actions.length > 0 ? <><h2>Guided action plan ready</h2><p>No real provider has been marked complete. Use each official action link, perform the change yourself, and retain the provider confirmation.</p></> : <><h2>{state.receipt?.blockedActions === 0 ? 'Move complete' : state.receipt ? 'Household handoff ready' : 'Approved plan ready'}</h2><p>{state.receipt?.blockedActions === 0 ? 'Every planned action is verified and no household work remains.' : state.receipt ? `${state.receipt.blockedActions} identity tasks are prepared above; complete them to close the move.` : 'The agent now has the exact token required to execute.'}</p></>}<button className="reset" disabled={busy} onClick={resetMove}>Reset move</button></article>

          <details className="panel technical-details"><summary>AI technical details</summary><div className="technical-stack">Strands Agent · Amazon Nova · Bedrock AgentCore · 11 tools</div>{cloudMode && <><span className="eyebrow">LATEST AGENT STATUS</span><p>{agentResponse.slice(0, 600)}{agentResponse.length > 600 ? '…' : ''}</p></>}<span className="eyebrow">RECENT OPERATIONS</span>{activity.slice(0, 3).map((item, index) => <div className="technical-event" key={`${item}-${index}`}><i className={index === 0 ? 'live' : ''} /><span>{item}</span></div>)}</details>
        </aside>
      </div>
    </main>
  );
}
