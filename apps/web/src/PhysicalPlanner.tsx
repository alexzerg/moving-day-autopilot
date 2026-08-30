import { useEffect, useState } from 'react';
import { householdBoxBaseline } from '@moving-day/contracts';
import type { HouseholdProfile, MoveEstimate, PhysicalMoveProfile } from '@moving-day/contracts';
import './PhysicalPlanner.css';

const households: Array<{ id: HouseholdProfile; label: string; adults: number; children: number }> = [
  { id: 'one-adult', label: 'One adult', adults: 1, children: 0 },
  { id: 'two-adults', label: 'Two adults', adults: 2, children: 0 },
  { id: 'two-adults-one-child', label: 'Two adults + child', adults: 2, children: 1 },
  { id: 'two-adults-two-children', label: 'Two adults + 2 children', adults: 2, children: 2 },
  { id: 'two-adults-three-children', label: 'Two adults + 3 children', adults: 2, children: 3 },
];

const inventoryItems: Array<{ key: keyof PhysicalMoveProfile['inventory']; label: string; icon: string; max: number }> = [
  { key: 'sofas', label: 'Sofas', icon: '▰', max: 6 },
  { key: 'beds', label: 'Beds', icon: '▱', max: 8 },
  { key: 'dressers', label: 'Dressers', icon: '▦', max: 10 },
  { key: 'tables', label: 'Tables', icon: '▭', max: 8 },
  { key: 'desks', label: 'Desks', icon: '⌑', max: 8 },
  { key: 'appliances', label: 'Appliances', icon: '▣', max: 10 },
  { key: 'boxes', label: 'Boxes', icon: '◇', max: 120 },
];

function HouseholdFigures({ adults, kids }: { adults: number; kids: number }) {
  return <div className="household-figures">{Array.from({ length: adults }, (_, index) => <span className="person adult" key={`a${index}`}><i /><b /></span>)}{Array.from({ length: kids }, (_, index) => <span className="person child" key={`c${index}`}><i /><b /></span>)}</div>;
}

export default function PhysicalPlanner({ profile, estimate, busy, onApply }: {
  profile: PhysicalMoveProfile;
  estimate: MoveEstimate;
  busy: boolean;
  onApply: (profile: PhysicalMoveProfile) => void;
}) {
  const [draft, setDraft] = useState(profile);
  useEffect(() => setDraft(profile), [profile]);

  const selectHousehold = (household: HouseholdProfile) => {
    setDraft((current) => ({
      ...current,
      household,
      inventory: { ...current.inventory, boxes: householdBoxBaseline[household] },
    }));
  };

  return <section className="physical-planner">
    <div className="physical-heading"><div><span>PHYSICAL MOVE PROFILE</span><h2>Who and what are we moving?</h2><p>Household size seeds the box estimate. Furniture and access conditions determine the truck and labor range.</p></div><button disabled={busy} onClick={() => onApply(draft)}>{busy ? 'Calculating…' : 'Calculate move requirements'}</button></div>

    <div className="household-options">{households.map((option) => <button key={option.id} className={draft.household === option.id ? 'selected' : ''} onClick={() => selectHousehold(option.id)}><HouseholdFigures adults={option.adults} kids={option.children} /><strong>{option.label}</strong><span>{householdBoxBaseline[option.id]} box baseline</span></button>)}</div>

    <div className="profile-controls">
      <label>Bedrooms<select value={draft.bedrooms} onChange={(event) => setDraft({ ...draft, bedrooms: Number(event.target.value) })}>{[0,1,2,3,4,5,6].map((value) => <option key={value} value={value}>{value === 0 ? 'Studio' : `${value} bedroom${value === 1 ? '' : 's'}`}</option>)}</select></label>
      <label>Origin access<select value={draft.originAccess} onChange={(event) => setDraft({ ...draft, originAccess: event.target.value as PhysicalMoveProfile['originAccess'] })}><option value="ground">Ground floor</option><option value="elevator">Elevator</option><option value="stairs">Stairs</option></select></label>
      <label>Destination access<select value={draft.destinationAccess} onChange={(event) => setDraft({ ...draft, destinationAccess: event.target.value as PhysicalMoveProfile['destinationAccess'] })}><option value="ground">Ground floor</option><option value="elevator">Elevator</option><option value="stairs">Stairs</option></select></label>
      <label>Crew<select value={draft.crewSize} onChange={(event) => setDraft({ ...draft, crewSize: Number(event.target.value) })}>{[2,3,4].map((value) => <option key={value} value={value}>{value} movers</option>)}</select></label>
    </div>

    <div className="inventory-grid">{inventoryItems.map((item) => <label key={item.key}><span className="item-icon">{item.icon}</span><strong>{item.label}</strong><select value={draft.inventory[item.key]} onChange={(event) => setDraft({ ...draft, inventory: { ...draft.inventory, [item.key]: Number(event.target.value) } })}>{Array.from({ length: item.max + 1 }, (_, value) => <option key={value} value={value}>{value}</option>)}</select></label>)}</div>

    <div className="estimate-strip">
      <div><span>EXPECTED VOLUME</span><strong>{estimate.expectedVolumeCuFt} cu ft</strong><small>P90 {estimate.p90VolumeCuFt} cu ft</small></div>
      <div><span>WEIGHT RANGE</span><strong>{estimate.estimatedWeightLb.low.toLocaleString()}–{estimate.estimatedWeightLb.high.toLocaleString()} lb</strong><small>{estimate.boxCount} boxes</small></div>
      <div><span>LABOR</span><strong>{estimate.laborHours.total} hours</strong><small>{estimate.laborHours.crewSize} movers · load + unload</small></div>
      {estimate.trucks.map((truck) => <div className={truck.capacityRisk ? 'risk' : ''} key={truck.provider}><span>{truck.provider.toUpperCase()}</span><strong>{truck.vehicle}</strong><small>{truck.capacityCuFt} cu ft · {truck.bufferPct}% buffer</small></div>)}
    </div>
  </section>;
}
