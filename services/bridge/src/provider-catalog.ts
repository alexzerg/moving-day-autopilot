export type ProviderCategory = 'electricity' | 'gas-water' | 'internet-mobile' | 'banking' | 'insurance' | 'housing' | 'medical' | 'vehicle';

export type ProviderDefinition = {
  name: string;
  category: ProviderCategory;
  domains: string[];
  aliases: string[];
};

export const providerCatalog: ProviderDefinition[] = [
  { name: 'Florida Power & Light', category: 'electricity', domains: ['fpl.com'], aliases: ['fpl', 'florida power', 'florida light'] },
  { name: 'Duke Energy', category: 'electricity', domains: ['duke-energy.com'], aliases: ['duke energy'] },
  { name: 'Tampa Electric', category: 'electricity', domains: ['tampaelectric.com', 'tecoenergy.com'], aliases: ['tampa electric', 'teco'] },
  { name: 'Orlando Utilities Commission', category: 'electricity', domains: ['ouc.com'], aliases: ['orlando utilities', 'ouc'] },
  { name: 'JEA', category: 'electricity', domains: ['jea.com'], aliases: ['jea'] },
  { name: 'Florida City Gas', category: 'gas-water', domains: ['floridacitygas.com'], aliases: ['florida city gas'] },
  { name: 'Peoples Gas', category: 'gas-water', domains: ['peoplesgas.com'], aliases: ['peoples gas'] },
  { name: 'Xfinity', category: 'internet-mobile', domains: ['xfinity.com', 'comcast.net', 'comcast.com'], aliases: ['xfinity', 'comcast'] },
  { name: 'AT&T', category: 'internet-mobile', domains: ['att.com'], aliases: ['at&t', 'att wireless', 'att internet'] },
  { name: 'Spectrum', category: 'internet-mobile', domains: ['spectrum.net', 'charter.com'], aliases: ['spectrum', 'charter communications'] },
  { name: 'Verizon', category: 'internet-mobile', domains: ['verizon.com'], aliases: ['verizon', 'fios'] },
  { name: 'T-Mobile', category: 'internet-mobile', domains: ['t-mobile.com'], aliases: ['t-mobile', 'tmobile'] },
  { name: 'Frontier', category: 'internet-mobile', domains: ['frontier.com'], aliases: ['frontier communications', 'frontier internet'] },
  { name: 'Metro by T-Mobile', category: 'internet-mobile', domains: ['metrobyt-mobile.com'], aliases: ['metro by t-mobile', 'metropcs'] },
  { name: 'Mint Mobile', category: 'internet-mobile', domains: ['mintmobile.com'], aliases: ['mint mobile'] },
  { name: 'Google Fi', category: 'internet-mobile', domains: ['fi.google.com'], aliases: ['google fi', 'google fiber'] },
  { name: 'Chase', category: 'banking', domains: ['chase.com'], aliases: ['jpmorgan chase', 'chase bank'] },
  { name: 'Bank of America', category: 'banking', domains: ['bankofamerica.com'], aliases: ['bank of america'] },
  { name: 'Wells Fargo', category: 'banking', domains: ['wellsfargo.com'], aliases: ['wells fargo'] },
  { name: 'Citibank', category: 'banking', domains: ['citi.com', 'citibank.com'], aliases: ['citibank', 'citi card'] },
  { name: 'U.S. Bank', category: 'banking', domains: ['usbank.com'], aliases: ['u.s. bank', 'us bank'] },
  { name: 'PNC Bank', category: 'banking', domains: ['pnc.com'], aliases: ['pnc bank'] },
  { name: 'Truist', category: 'banking', domains: ['truist.com'], aliases: ['truist'] },
  { name: 'Capital One', category: 'banking', domains: ['capitalone.com'], aliases: ['capital one'] },
  { name: 'TD Bank', category: 'banking', domains: ['td.com', 'tdbank.com'], aliases: ['td bank'] },
  { name: 'American Express', category: 'banking', domains: ['americanexpress.com'], aliases: ['american express', 'amex'] },
  { name: 'Discover', category: 'banking', domains: ['discover.com'], aliases: ['discover card', 'discover bank'] },
  { name: 'Navy Federal', category: 'banking', domains: ['navyfederal.org'], aliases: ['navy federal'] },
  { name: 'Ally Bank', category: 'banking', domains: ['ally.com'], aliases: ['ally bank'] },
  { name: 'GEICO', category: 'insurance', domains: ['geico.com'], aliases: ['geico'] },
  { name: 'State Farm', category: 'insurance', domains: ['statefarm.com'], aliases: ['state farm'] },
  { name: 'Progressive', category: 'insurance', domains: ['progressive.com'], aliases: ['progressive insurance'] },
  { name: 'Allstate', category: 'insurance', domains: ['allstate.com'], aliases: ['allstate'] },
  { name: 'USAA', category: 'insurance', domains: ['usaa.com'], aliases: ['usaa'] },
  { name: 'Liberty Mutual', category: 'insurance', domains: ['libertymutual.com'], aliases: ['liberty mutual'] },
  { name: 'Nationwide', category: 'insurance', domains: ['nationwide.com'], aliases: ['nationwide insurance'] },
  { name: 'Travelers', category: 'insurance', domains: ['travelers.com'], aliases: ['travelers insurance'] },
  { name: 'Citizens Property Insurance', category: 'insurance', domains: ['citizensfla.com'], aliases: ['citizens property insurance'] },
  { name: 'Florida Blue', category: 'medical', domains: ['floridablue.com'], aliases: ['florida blue', 'blue cross blue shield'] },
  { name: 'UnitedHealthcare', category: 'medical', domains: ['uhc.com', 'unitedhealthcare.com'], aliases: ['unitedhealthcare', 'united healthcare'] },
  { name: 'Aetna', category: 'medical', domains: ['aetna.com'], aliases: ['aetna'] },
  { name: 'Cigna', category: 'medical', domains: ['cigna.com'], aliases: ['cigna'] },
  { name: 'Humana', category: 'medical', domains: ['humana.com'], aliases: ['humana'] },
  { name: 'CVS Health', category: 'medical', domains: ['cvs.com', 'caremark.com'], aliases: ['cvs health', 'cvs caremark'] },
  { name: 'Walgreens', category: 'medical', domains: ['walgreens.com'], aliases: ['walgreens'] },
  { name: 'Quest Diagnostics', category: 'medical', domains: ['questdiagnostics.com'], aliases: ['quest diagnostics'] },
  { name: 'Labcorp', category: 'medical', domains: ['labcorp.com'], aliases: ['labcorp'] },
  { name: 'Rocket Mortgage', category: 'housing', domains: ['rocketmortgage.com'], aliases: ['rocket mortgage'] },
  { name: 'Mr. Cooper', category: 'housing', domains: ['mrcooper.com'], aliases: ['mr. cooper', 'mr cooper'] },
  { name: 'loanDepot', category: 'housing', domains: ['loandepot.com'], aliases: ['loandepot'] },
  { name: 'SunPass', category: 'vehicle', domains: ['sunpass.com', 'floridasturnpike.com', 'fdot.gov', 'dot.state.fl.us'], aliases: ['sunpass', 'florida turnpike', "florida's turnpike", 'toll enforcement', 'toll invoice'] },
];

const excludedSubscriptions = /netflix|spotify|hulu|disney\+|youtube premium|apple tv|apple music|amazon prime|openai|chatgpt|xai|grok|anthropic|claude|dropbox|notion|github|microsoft 365|adobe|canva|taskrabbit|offerup|craigslist|hireahelper|moving help|movinghelp|penske|u-?haul|mover|moving company/;
const billSignals = /bill|statement|invoice|amount due|payment due|due date|autopay|auto pay|payment received|payment confirmation|account ending|account number|billing period|policy|premium|claim|explanation of benefits|medical balance|mortgage|escrow|utility usage|service address/;
const relationshipSignals = /my account|your account|service notice|service update|outage|energy usage|usage alert|meter|payment|autopay|policy|claim|member portal|mortgage|escrow|card ending|checking|savings|wireless|internet service|electric service|water service|welcome to/;
const advertisingSignals = /special offer|weekly offers|exclusive offers|upgrade now|limited time|save \d+%|refer a friend|new customer|shop now|exclusive deal|promotion/;

export function catalogDomainGroups(size = 12) {
  const domains = [...new Set(providerCatalog.flatMap((provider) => provider.domains))];
  const groups: string[][] = [];
  for (let index = 0; index < domains.length; index += size) groups.push(domains.slice(index, index + size));
  return groups;
}

export function matchCatalogProvider(from: string, subject: string, body: string) {
  const evidence = `${from} ${subject} ${body}`.toLowerCase();
  return providerCatalog.find((provider) => provider.domains.some((domain) => evidence.includes(`@${domain}`) || evidence.includes(domain)) || provider.aliases.some((alias) => evidence.includes(alias))) ?? null;
}

export function classifyMoveRelevantMessage(from: string, subject: string, body: string) {
  const evidence = `${from} ${subject} ${body}`.toLowerCase();
  if (excludedSubscriptions.test(evidence)) return { accepted: false, provider: null, reason: 'portable subscription' };
  const provider = matchCatalogProvider(from, subject, body);
  const hasBillingSignal = billSignals.test(evidence);
  const transactionalSubject = /bill|statement|invoice|amount due|payment|autopay|policy|premium|claim|account|mortgage/i.test(subject);
  const likelyAdvertisement = advertisingSignals.test(subject.toLowerCase()) && !transactionalSubject;
  if (likelyAdvertisement) return { accepted: false, provider, reason: 'advertising' };
  if (provider && hasBillingSignal) return { accepted: true, provider, reason: 'catalog provider with billing evidence' };
  if (provider && relationshipSignals.test(evidence)) return { accepted: true, provider, reason: 'catalog provider with account-relationship evidence' };
  if (provider) return { accepted: true, provider, reason: 'catalog provider domain relationship' };
  if (hasBillingSignal) return { accepted: true, provider: null, reason: 'unknown provider with billing evidence' };
  return { accepted: false, provider, reason: 'no account or billing evidence' };
}
