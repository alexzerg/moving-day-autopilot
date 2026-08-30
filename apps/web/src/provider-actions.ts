import type { ProviderAccount } from '@moving-day/contracts';

export type ProviderActionGuide = {
  title: string;
  url: string | null;
  channel: string;
  steps: string[];
  verified: boolean;
};

type ProviderRule = {
  pattern: RegExp;
  title: string;
  url: string;
  channel: string;
  steps: string[];
  verified?: boolean;
};

const transferSteps = ['Sign in to the provider account', 'Choose move, transfer, start or stop service', 'Enter the new address and move date', 'Review availability and submit after human confirmation'];
const profileSteps = ['Sign in to the official account', 'Open Profile, Personal details or Contact information', 'Replace the mailing or residential address', 'Save and retain the confirmation'];
const insuranceSteps = ['Sign in to the policy account', 'Open policy or contact details', 'Update mailing, residence or garaging address', 'Review any premium change before submitting'];

const rules: ProviderRule[] = [
  { pattern: /florida power|\bfpl\b/i, title: 'Move or transfer electric service', url: 'https://www.fpl.com/account/moving/existing-customer.html', channel: 'FPL online moving service', steps: transferSteps, verified: true },
  { pattern: /duke energy/i, title: 'Start, stop or move electric service', url: 'https://www.duke-energy.com/home/start-stop-move', channel: 'Duke Energy online service', steps: transferSteps },
  { pattern: /tampa electric|\bteco\b/i, title: 'Start, stop or transfer service', url: 'https://www.tampaelectric.com/residential/start-stop-or-transfer-service/', channel: 'Tampa Electric online service', steps: transferSteps },
  { pattern: /orlando utilities|\bouc\b/i, title: 'Move utility service', url: 'https://www.ouc.com/customer-support/start-stop-move-service', channel: 'OUC customer service', steps: transferSteps },
  { pattern: /\bjea\b/i, title: 'Start, stop or move utility service', url: 'https://www.jea.com/Start_Stop_Move/', channel: 'JEA online service', steps: transferSteps },
  { pattern: /xfinity|comcast/i, title: 'Transfer internet service', url: 'https://www.xfinity.com/learn/moving', channel: 'Xfinity moving flow', steps: ['Sign in with the Xfinity ID', 'Select Look up your new address', 'Choose services and installation date', 'Review equipment and submit'], verified: true },
  { pattern: /at&t|\batt\b/i, title: 'Move internet or wireless service', url: 'https://www.att.com/moving/', channel: 'AT&T moving flow', steps: transferSteps },
  { pattern: /spectrum|charter/i, title: 'Transfer Spectrum service', url: 'https://www.spectrum.com/moving', channel: 'Spectrum moving flow', steps: transferSteps },
  { pattern: /verizon|fios/i, title: 'Move Verizon service', url: 'https://www.verizon.com/home/moving/', channel: 'Verizon moving flow', steps: transferSteps },
  { pattern: /t-mobile|tmobile|metropcs|metro by/i, title: 'Update account and E911 address', url: 'https://www.t-mobile.com/account/profile', channel: 'T-Mobile account profile', steps: profileSteps },
  { pattern: /frontier/i, title: 'Transfer Frontier service', url: 'https://frontier.com/resources/movers', channel: 'Frontier moving flow', steps: transferSteps },
  { pattern: /chase|jpmorgan/i, title: 'Update mailing address', url: 'https://www.chase.com/personal/credit-cards/update-account', channel: 'Chase Profile & settings', steps: profileSteps, verified: true },
  { pattern: /bank of america/i, title: 'Update contact information', url: 'https://www.bankofamerica.com/online-banking/sign-in/', channel: 'Bank of America Online Banking', steps: profileSteps },
  { pattern: /wells fargo/i, title: 'Update contact information', url: 'https://connect.secure.wellsfargo.com/auth/login/present', channel: 'Wells Fargo Online', steps: profileSteps },
  { pattern: /citibank|\bciti\b/i, title: 'Update mailing address', url: 'https://online.citi.com/US/login.do', channel: 'Citi Online', steps: profileSteps },
  { pattern: /capital one/i, title: 'Update contact information', url: 'https://verified.capitalone.com/auth/signin', channel: 'Capital One account', steps: profileSteps },
  { pattern: /truist/i, title: 'Update contact information', url: 'https://dias.bank.truist.com/auth/login', channel: 'Truist Online Banking', steps: profileSteps },
  { pattern: /american express|amex/i, title: 'Update billing address', url: 'https://www.americanexpress.com/en-us/account/login/', channel: 'American Express account', steps: profileSteps },
  { pattern: /discover/i, title: 'Update billing address', url: 'https://portal.discover.com/customersvcs/universalLogin/ac_main', channel: 'Discover account', steps: profileSteps },
  { pattern: /geico/i, title: 'Update policy address', url: 'https://www.geico.com/account/', channel: 'GEICO My Account', steps: insuranceSteps, verified: true },
  { pattern: /state farm/i, title: 'Update policy address', url: 'https://account.statefarm.com/', channel: 'State Farm account', steps: insuranceSteps },
  { pattern: /progressive/i, title: 'Update policy address', url: 'https://account.apps.progressive.com/access/login', channel: 'Progressive account', steps: insuranceSteps },
  { pattern: /allstate/i, title: 'Update policy address', url: 'https://myaccount.allstate.com/', channel: 'Allstate My Account', steps: insuranceSteps },
  { pattern: /usaa/i, title: 'Update policy and profile address', url: 'https://www.usaa.com/my/logon', channel: 'USAA account', steps: insuranceSteps },
  { pattern: /liberty mutual/i, title: 'Update policy address', url: 'https://login.libertymutual.com/', channel: 'Liberty Mutual account', steps: insuranceSteps },
  { pattern: /florida blue/i, title: 'Update member contact address', url: 'https://www.floridablue.com/members', channel: 'Florida Blue member account', steps: profileSteps },
  { pattern: /unitedhealth|\buhc\b/i, title: 'Update member contact address', url: 'https://www.myuhc.com/', channel: 'UnitedHealthcare member account', steps: profileSteps },
  { pattern: /aetna/i, title: 'Update member contact address', url: 'https://www.aetna.com/AccountManagerV3/v/login', channel: 'Aetna member account', steps: profileSteps },
  { pattern: /cigna/i, title: 'Update member contact address', url: 'https://my.cigna.com/', channel: 'myCigna', steps: profileSteps },
  { pattern: /rocket mortgage/i, title: 'Update mortgage contact address', url: 'https://www.rocketmortgage.com/sign-in', channel: 'Rocket Mortgage account', steps: profileSteps },
  { pattern: /sunpass/i, title: 'Update vehicle and mailing address', url: 'https://www.sunpass.com/vector/account/home/accountLogin.do', channel: 'SunPass account', steps: profileSteps },
];

export function providerActionGuide(account: ProviderAccount): ProviderActionGuide {
  const rule = rules.find((candidate) => candidate.pattern.test(account.provider));
  if (rule) return { title: rule.title, url: rule.url, channel: rule.channel, steps: rule.steps, verified: Boolean(rule.verified) };
  const title = account.kind === 'financial' ? 'Update mailing address'
    : account.kind === 'insurance' ? 'Update policy address'
      : account.kind === 'internet' || account.kind === 'electricity' || account.kind === 'water' ? 'Transfer or update service'
        : 'Update account address';
  return {
    title,
    url: null,
    channel: 'Provider website or mobile app',
    steps: account.kind === 'insurance' ? insuranceSteps : account.kind === 'financial' ? profileSteps : transferSteps,
    verified: false,
  };
}
