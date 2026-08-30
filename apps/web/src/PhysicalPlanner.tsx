import { useEffect, useState } from 'react';
import { calculateMoveEstimate, householdBoxBaseline, PhysicalMoveProfileSchema } from '@moving-day/contracts';
import type { HouseholdProfile, MoveState, PhysicalMoveProfile, RouteDistance, TruckRecommendation } from '@moving-day/contracts';
import type { MoveReportSelection } from './packet';
import './PhysicalPlanner.css';

const quoteUrls: Record<TruckRecommendation['provider'], string> = {
  'U-Haul': 'https://www.uhaul.com/Truck-Rentals/',
  Penske: 'https://www.pensketruckrental.com/quote/',
};
const physicalProfileKey = 'moving-day-physical-profile';

function savedPhysicalProfile(fallback: PhysicalMoveProfile) {
  try {
    const saved = window.sessionStorage.getItem(physicalProfileKey);
    const parsed = saved ? PhysicalMoveProfileSchema.safeParse(JSON.parse(saved)) : null;
    return parsed?.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

type LaborSource = {
  id: string;
  name: string;
  tier: 'Reviewed marketplace' | 'Independent marketplace' | 'Community listings';
  hourlyLow: number;
  hourlyHigh: number;
  perPerson: boolean;
  url: (city: string, region: string) => string;
};

const laborSources: LaborSource[] = [
  { id: 'moving-help', name: 'U-Haul Moving Help', tier: 'Reviewed marketplace', hourlyLow: 90, hourlyHigh: 150, perPerson: false, url: () => 'https://www.uhaul.com/MovingHelp/' },
  { id: 'hire-a-helper', name: 'HireAHelper', tier: 'Reviewed marketplace', hourlyLow: 100, hourlyHigh: 180, perPerson: false, url: () => 'https://www.hireahelper.com/' },
  { id: 'taskrabbit', name: 'Taskrabbit', tier: 'Independent marketplace', hourlyLow: 40, hourlyHigh: 80, perPerson: true, url: () => 'https://www.taskrabbit.com/services/moving' },
  { id: 'offerup', name: 'OfferUp', tier: 'Community listings', hourlyLow: 25, hourlyHigh: 55, perPerson: true, url: (city, region) => `https://offerup.com/search?q=${encodeURIComponent(`moving help ${city} ${region}`)}` },
  { id: 'craigslist', name: 'Craigslist', tier: 'Community listings', hourlyLow: 25, hourlyHigh: 50, perPerson: true, url: (city) => `https://miami.craigslist.org/search/lbs?query=${encodeURIComponent(`moving help ${city}`)}` },
];

const households: Array<{ id: HouseholdProfile; label: string; adults: number; children: number }> = [
  { id: 'one-adult', label: 'One adult', adults: 1, children: 0 },
  { id: 'two-adults', label: 'Two adults', adults: 2, children: 0 },
  { id: 'two-adults-one-child', label: 'Two adults + child', adults: 2, children: 1 },
  { id: 'two-adults-two-children', label: 'Two adults + 2 children', adults: 2, children: 2 },
  { id: 'two-adults-three-children', label: 'Two adults + 3 children', adults: 2, children: 3 },
];

const householdDefaults: Record<HouseholdProfile, Pick<PhysicalMoveProfile, 'bedrooms' | 'inventory'>> = {
  'one-adult': { bedrooms: 1, inventory: { sofas: 1, beds: 1, dressers: 1, tables: 1, desks: 1, appliances: 2, boxes: 18 } },
  'two-adults': { bedrooms: 1, inventory: { sofas: 1, beds: 1, dressers: 2, tables: 1, desks: 2, appliances: 3, boxes: 28 } },
  'two-adults-one-child': { bedrooms: 2, inventory: { sofas: 2, beds: 2, dressers: 3, tables: 2, desks: 2, appliances: 4, boxes: 42 } },
  'two-adults-two-children': { bedrooms: 3, inventory: { sofas: 2, beds: 3, dressers: 4, tables: 2, desks: 3, appliances: 5, boxes: 52 } },
  'two-adults-three-children': { bedrooms: 4, inventory: { sofas: 3, beds: 4, dressers: 5, tables: 3, desks: 3, appliances: 6, boxes: 62 } },
};

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

export default function PhysicalPlanner({ profile, moveCase, route, busy, onApply, onSelectionChange }: {
  profile: PhysicalMoveProfile;
  moveCase: MoveState['moveCase'];
  route: RouteDistance;
  busy: boolean;
  onApply: (profile: PhysicalMoveProfile) => void;
  onSelectionChange: (selection: MoveReportSelection) => void;
}) {
  const [draft, setDraft] = useState(() => savedPhysicalProfile(profile));
  const [selectedProvider, setSelectedProvider] = useState<TruckRecommendation['provider']>('U-Haul');
  const [selectedLaborId, setSelectedLaborId] = useState('moving-help');
  const [rentalMode, setRentalMode] = useState<'one-way' | 'round-trip'>('one-way');
  const [fuelPrice, setFuelPrice] = useState(3.4);
  const liveEstimate = calculateMoveEstimate(draft);
  const routeMiles = route.distanceMiles;
  const selectedTruck = liveEstimate.trucks.find((truck) => truck.provider === selectedProvider) ?? liveEstimate.trucks[0];
  const selectedLabor = laborSources.find((source) => source.id === selectedLaborId) ?? laborSources[0];
  const rentalDays = routeMiles <= 150 ? 1 : Math.ceil(routeMiles / 450) + 1;
  const deadheadMiles = rentalMode === 'round-trip' ? 20 : 15;
  const drivenMiles = Math.round((rentalMode === 'round-trip' ? routeMiles * 2 : routeMiles) + deadheadMiles);
  const mpg = selectedTruck.capacityCuFt <= 450 ? 14 : selectedTruck.capacityCuFt <= 850 ? 11 : selectedTruck.capacityCuFt <= 1250 ? 9 : 8;
  const fuelGallons = Math.ceil(drivenMiles / mpg);
  const fuelLow = Math.round(fuelGallons * fuelPrice);
  const fuelHigh = Math.round(fuelGallons * fuelPrice * 1.2);
  const dailyBase = selectedTruck.provider === 'U-Haul'
    ? selectedTruck.capacityCuFt <= 450 ? 20 : selectedTruck.capacityCuFt <= 800 ? 30 : selectedTruck.capacityCuFt <= 1200 ? 40 : 50
    : selectedTruck.capacityCuFt <= 450 ? 55 : selectedTruck.capacityCuFt <= 850 ? 75 : selectedTruck.capacityCuFt <= 1250 ? 95 : 125;
  const truckBaseLow = Math.round(dailyBase * rentalDays + (rentalMode === 'one-way' ? routeMiles * 0.55 : 0));
  const truckBaseHigh = Math.round(dailyBase * 2.2 * rentalDays + (rentalMode === 'one-way' ? routeMiles * 1.4 : 0));
  const mileageLow = rentalMode === 'round-trip' ? Math.round(drivenMiles * 0.79) : 0;
  const mileageHigh = rentalMode === 'round-trip' ? Math.round(drivenMiles * 1.39) : Math.round(routeMiles * 0.35);
  const protectionLow = 70;
  const protectionHigh = 220;
  const roadSubtotalLow = truckBaseLow + mileageLow + fuelLow + protectionLow;
  const roadSubtotalHigh = truckBaseHigh + mileageHigh + fuelHigh + protectionHigh;
  const taxesLow = Math.round(roadSubtotalLow * 0.08);
  const taxesHigh = Math.round(roadSubtotalHigh * 0.18);
  const truckCostLow = roadSubtotalLow + taxesLow;
  const truckCostHigh = roadSubtotalHigh + taxesHigh;
  const laborCrewMultiplier = selectedLabor.perPerson ? liveEstimate.laborHours.crewSize : 1;
  const laborCostLow = Math.round(liveEstimate.laborHours.total * selectedLabor.hourlyLow * laborCrewMultiplier);
  const laborCostHigh = Math.round(liveEstimate.laborHours.total * selectedLabor.hourlyHigh * laborCrewMultiplier);
  const totalCostLow = truckCostLow + laborCostLow;
  const totalCostHigh = truckCostHigh + laborCostHigh;

  useEffect(() => setDraft(savedPhysicalProfile(profile)), [profile]);
  useEffect(() => window.sessionStorage.setItem(physicalProfileKey, JSON.stringify(draft)), [draft]);
  useEffect(() => onSelectionChange({
    truckProvider: selectedTruck.provider,
    truckVehicle: selectedTruck.vehicle,
    laborSource: selectedLabor.name,
    rentalMode,
    drivenMiles,
    fuelGallons,
    truckCostLow,
    truckCostHigh,
    totalCostLow,
    totalCostHigh,
  }), [onSelectionChange, selectedTruck.provider, selectedTruck.vehicle, selectedLabor.name, rentalMode, drivenMiles, fuelGallons, truckCostLow, truckCostHigh, totalCostLow, totalCostHigh]);

  const selectHousehold = (household: HouseholdProfile) => {
    const defaults = householdDefaults[household];
    setDraft((current) => ({
      ...current,
      household,
      bedrooms: defaults.bedrooms,
      inventory: { ...defaults.inventory },
    }));
  };

  return <section className="physical-planner">
    <div className="physical-heading"><div><span>PHYSICAL MOVE PROFILE</span><h2>Who and what are we moving?</h2><p>Household size seeds the box liveEstimate. Furniture and access conditions determine the truck and labor range.</p></div><button disabled={busy} onClick={() => onApply(draft)}>{busy ? 'Calculating…' : 'Calculate move requirements'}</button></div>

    <div className="household-options">{households.map((option) => <button key={option.id} className={draft.household === option.id ? 'selected' : ''} onClick={() => selectHousehold(option.id)}><HouseholdFigures adults={option.adults} kids={option.children} /><strong>{option.label}</strong><span>{householdBoxBaseline[option.id]} box baseline</span></button>)}</div>

    <div className="profile-controls">
      <label>Bedrooms<select value={draft.bedrooms} onChange={(event) => setDraft({ ...draft, bedrooms: Number(event.target.value) })}>{[0,1,2,3,4,5,6].map((value) => <option key={value} value={value}>{value === 0 ? 'Studio' : `${value} bedroom${value === 1 ? '' : 's'}`}</option>)}</select></label>
      <label>Origin access<select value={draft.originAccess} onChange={(event) => setDraft({ ...draft, originAccess: event.target.value as PhysicalMoveProfile['originAccess'] })}><option value="ground">Ground floor</option><option value="elevator">Elevator</option><option value="stairs">Stairs</option></select></label>
      <label>Destination access<select value={draft.destinationAccess} onChange={(event) => setDraft({ ...draft, destinationAccess: event.target.value as PhysicalMoveProfile['destinationAccess'] })}><option value="ground">Ground floor</option><option value="elevator">Elevator</option><option value="stairs">Stairs</option></select></label>
      <label>Crew<select value={draft.crewSize} onChange={(event) => setDraft({ ...draft, crewSize: Number(event.target.value) })}>{[2,3,4].map((value) => <option key={value} value={value}>{value} movers</option>)}</select></label>
      <label>Road route<div className="route-value"><strong>{route.distanceMiles} mi</strong><small>{route.durationMinutes} min · {route.source.replace('-', ' + ')}</small></div></label>
    </div>

    <div className="inventory-grid">{inventoryItems.map((item) => <label key={item.key}><span className="item-icon">{item.icon}</span><strong>{item.label}</strong><select value={draft.inventory[item.key]} onChange={(event) => setDraft({ ...draft, inventory: { ...draft.inventory, [item.key]: Number(event.target.value) } })}>{Array.from({ length: item.max + 1 }, (_, value) => <option key={value} value={value}>{value}</option>)}</select></label>)}</div>

    <div className="estimate-strip">
      <div><span>EXPECTED VOLUME</span><strong>{liveEstimate.expectedVolumeCuFt} cu ft</strong><small>P90 {liveEstimate.p90VolumeCuFt} cu ft</small></div>
      <div><span>WEIGHT RANGE</span><strong>{liveEstimate.estimatedWeightLb.low.toLocaleString()}–{liveEstimate.estimatedWeightLb.high.toLocaleString()} lb</strong><small>{liveEstimate.boxCount} boxes</small></div>
      <div><span>LABOR</span><strong>{liveEstimate.laborHours.total} hours</strong><small>{liveEstimate.laborHours.crewSize} movers · load + unload</small></div>
    </div>

    <div className="truck-planner">
      <div className="truck-planner-heading"><div><span>TRUCK SELECTION</span><h3>Choose a provider-sized truck</h3></div><small>Calculated from inventory · prices and availability are live on the provider site</small></div>
      <div className="truck-options">{liveEstimate.trucks.map((truck) => <button
        aria-pressed={selectedProvider === truck.provider}
        className={`${selectedProvider === truck.provider ? 'selected' : ''} ${truck.capacityRisk ? 'risk' : ''}`}
        key={truck.provider}
        onClick={() => setSelectedProvider(truck.provider)}
        type="button"
      >
        <span>{truck.provider.toUpperCase()}</span>
        <strong>{truck.vehicle}</strong>
        <small>{truck.capacityCuFt.toLocaleString()} cu ft · {truck.bufferPct}% buffer</small>
        <b>{truck.capacityRisk ? 'Capacity risk' : 'Fits calculated load'}</b>
      </button>)}</div>
      <div className={`quote-handoff ${selectedTruck.capacityRisk ? 'risk' : ''}`}>
        <div><span>SELECTED CALCULATED OPTION</span><strong>{selectedTruck.provider} · {selectedTruck.vehicle}</strong><small>{moveCase.oldAddress.city}, {moveCase.oldAddress.region} {moveCase.oldAddress.postalCode} → {moveCase.newAddress.city}, {moveCase.newAddress.region} {moveCase.newAddress.postalCode} · {moveCase.moveDate}</small></div>
        <a href={quoteUrls[selectedTruck.provider]} target="_blank" rel="noreferrer">Check official live price & availability ↗</a>
      </div>
      <p className="quote-disclaimer">The size recommendation is calculated here. The rental price, pickup location, taxes, mileage, insurance and final availability come directly from {selectedTruck.provider}; no synthetic quote is shown.</p>
    </div>

    <div className="move-cost-planner">
      <div className="cost-controls">
        <label>Rental plan<select value={rentalMode} onChange={(event) => setRentalMode(event.target.value as 'one-way' | 'round-trip')}><option value="one-way">One-way drop-off</option><option value="round-trip">Return to pickup</option></select></label>
        <label>Fuel price / gal<input min="2" max="8" step="0.05" type="number" value={fuelPrice} onChange={(event) => setFuelPrice(Math.max(2, Math.min(8, Number(event.target.value) || 3.4)))} /></label>
        <div><span>RENTAL DAYS</span><strong>{rentalDays}</strong><small>route + loading window</small></div>
        <div><span>TRUCK RETURN</span><strong>{rentalMode === 'one-way' ? 'Near destination' : 'Pickup location'}</strong><small>{drivenMiles} total driven mi incl. {deadheadMiles} pickup/drop-off mi</small></div>
      </div>
      <div className="cost-hero"><div><span>MODELED TOTAL MOVE COST</span><strong>${totalCostLow.toLocaleString()}–${totalCostHigh.toLocaleString()}</strong><small>{selectedTruck.provider} {selectedTruck.vehicle} + {selectedLabor.name} · {routeMiles} route miles</small></div><b>PLANNING RANGE</b></div>
      <div className="cost-breakdown detailed">
        <div><span>BASE RENTAL</span><strong>${truckBaseLow.toLocaleString()}–${truckBaseHigh.toLocaleString()}</strong><small>{rentalDays} day{rentalDays === 1 ? '' : 's'} · {rentalMode}</small></div>
        <div><span>MILEAGE / OVERAGE</span><strong>${mileageLow.toLocaleString()}–${mileageHigh.toLocaleString()}</strong><small>{drivenMiles} driven miles</small></div>
        <div><span>FUEL</span><strong>${fuelLow.toLocaleString()}–${fuelHigh.toLocaleString()}</strong><small>{fuelGallons} gal · {mpg} MPG · ${fuelPrice.toFixed(2)}/gal</small></div>
        <div><span>PROTECTION + EQUIPMENT</span><strong>${protectionLow}–${protectionHigh}</strong><small>coverage, dolly, pads and supplies</small></div>
        <div><span>TAXES + FEES</span><strong>${taxesLow.toLocaleString()}–${taxesHigh.toLocaleString()}</strong><small>modeled 8–18%</small></div>
        <div><span>TRUCK + ROAD TOTAL</span><strong>${truckCostLow.toLocaleString()}–${truckCostHigh.toLocaleString()}</strong><small>before labor</small></div>
        <div><span>LABOR</span><strong>${laborCostLow.toLocaleString()}–${laborCostHigh.toLocaleString()}</strong><small>{liveEstimate.laborHours.total} crew hours · {selectedLabor.perPerson ? `${liveEstimate.laborHours.crewSize} people` : 'crew rate'}</small></div>
      </div>
      <div className="labor-heading"><div><span>LABOR DISCOVERY</span><h3>Compare where to find movers</h3></div><small>Green means a real search/contact path is available, not that a worker is booked.</small></div>
      <div className="labor-options">{laborSources.map((source) => {
        const multiplier = source.perPerson ? liveEstimate.laborHours.crewSize : 1;
        const low = Math.round(liveEstimate.laborHours.total * source.hourlyLow * multiplier);
        const high = Math.round(liveEstimate.laborHours.total * source.hourlyHigh * multiplier);
        return <button aria-pressed={selectedLaborId === source.id} className={selectedLaborId === source.id ? 'selected' : ''} key={source.id} onClick={() => setSelectedLaborId(source.id)} type="button">
          <span>{source.tier.toUpperCase()}</span><strong>{source.name}</strong><small>Modeled labor ${low.toLocaleString()}–${high.toLocaleString()}</small><b>● SEARCH READY</b>
        </button>;
      })}</div>
      <div className="labor-handoff"><div><span>SELECTED SOURCE</span><strong>{selectedLabor.name}</strong><small>{selectedLabor.tier}{selectedLabor.tier === 'Community listings' ? ' · verify identity, insurance and references before hiring' : ' · compare reviews, minimum hours and cancellation terms'}</small></div><a href={selectedLabor.url(moveCase.oldAddress.city, moveCase.oldAddress.region)} target="_blank" rel="noreferrer">Search {selectedLabor.name} ↗</a></div>
      <p className="cost-disclaimer">These totals are modeled planning ranges, not live offers. Provider sites determine the final truck rate; labor sites determine worker availability and final pricing. Community listings carry higher verification and payment risk.</p>
    </div>
  </section>;
}
