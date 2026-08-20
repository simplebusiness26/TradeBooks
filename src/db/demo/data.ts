import { addDays, addMonths, startOfMonth, type IsoDate } from '@/lib/dates';

/**
 * Demo data for a fictional roofing business.
 *
 * Every name, address and figure here is invented for demonstration. Nothing
 * in this file is real customer, supplier or bank data.
 */
export const DEMO_COMPANY = {
  name: 'Northgate Roofing Ltd (Demo)',
  tradingName: 'Northgate Roofing',
  addressLine1: 'Unit 4, Halton Business Park',
  city: 'Leeds',
  postcode: 'LS12 4RT',
  phone: '0113 496 0000',
  email: 'office@northgateroofing.example',
  vatNumber: 'GB123456789',
  cisUtr: '1234567890',
};

export const DEMO_USERS = [
  { email: 'owner@northgateroofing.example', name: 'Dave Whitaker', role: 'owner' as const },
  { email: 'office@northgateroofing.example', name: 'Sam Okoye', role: 'staff' as const },
  { email: 'accountant@northgateroofing.example', name: 'Priya Shah', role: 'reviewer' as const },
];

export const DEMO_CUSTOMERS = [
  {
    name: 'Halewood Property Group',
    contactName: 'Janet Hale',
    email: 'accounts@halewoodproperty.example',
    phone: '0113 496 1120',
    addressLine1: '18 Wellington Street',
    city: 'Leeds',
    postcode: 'LS1 4HW',
    paymentTermsDays: 30,
  },
  {
    name: 'Mrs A Kowalski',
    contactName: 'Anna Kowalski',
    email: 'anna.kowalski@example.com',
    phone: '07700 900112',
    addressLine1: '42 Bramham Road',
    city: 'Wetherby',
    postcode: 'LS22 6RN',
    paymentTermsDays: 14,
  },
  {
    name: 'Beckett Construction Ltd',
    contactName: 'Tom Beckett',
    email: 'purchase.ledger@beckettconstruction.example',
    phone: '0113 496 2200',
    addressLine1: 'Beckett House, Kirkstall Road',
    city: 'Leeds',
    postcode: 'LS4 2AZ',
    paymentTermsDays: 45,
  },
  {
    name: 'St Mary’s Parish Council',
    contactName: 'Reverend P Downing',
    email: 'clerk@stmarysparish.example',
    phone: '01937 900 400',
    addressLine1: 'The Parish Office, Church Lane',
    city: 'Boston Spa',
    postcode: 'LS23 6DR',
    paymentTermsDays: 30,
  },
  {
    name: 'Ferris Lettings',
    contactName: 'Kelly Ferris',
    email: 'kelly@ferrislettings.example',
    phone: '0113 496 3311',
    addressLine1: '7 Otley Road',
    city: 'Leeds',
    postcode: 'LS6 3AA',
    paymentTermsDays: 14,
  },
];

export const DEMO_SUPPLIERS = [
  {
    name: 'Travis Perkins',
    kind: 'supplier' as const,
    categoryCode: 'materials',
    vatNumber: 'GB408216160',
    email: 'leeds@travisperkins.example',
  },
  {
    name: 'SIG Roofing',
    kind: 'supplier' as const,
    categoryCode: 'materials',
    email: 'leeds.branch@sigroofing.example',
  },
  {
    name: 'Burton Roofing Merchants',
    kind: 'supplier' as const,
    categoryCode: 'materials',
  },
  {
    name: 'Northern Access Scaffolding',
    kind: 'supplier' as const,
    categoryCode: 'scaffolding',
    email: 'hire@northernaccess.example',
  },
  {
    name: 'Skip It Waste Services',
    kind: 'supplier' as const,
    categoryCode: 'waste',
  },
  {
    name: 'Shell Leeds Ring Road',
    kind: 'supplier' as const,
    categoryCode: 'fuel',
  },
  {
    name: 'Trade Direct Insurance',
    kind: 'supplier' as const,
    categoryCode: 'insurance',
  },
  {
    name: 'Vodafone Business',
    kind: 'supplier' as const,
    categoryCode: 'phone_internet',
  },
];

export const DEMO_SUBCONTRACTORS = [
  {
    name: 'M Doyle Roofing Services',
    contactName: 'Michael Doyle',
    utr: '4536271890',
    cisStatus: 'net_20' as const,
    cisVerificationNumber: 'V1234567890',
    email: 'mick@doyleroofing.example',
  },
  {
    name: 'K & S Leadwork',
    contactName: 'Karl Simmons',
    utr: '9081726354',
    cisStatus: 'net_20' as const,
    cisVerificationNumber: 'V1234567891',
  },
  {
    name: 'J Patel Labour',
    contactName: 'Jay Patel',
    utr: null,
    cisStatus: 'unknown' as const,
    cisVerificationNumber: null,
  },
];

export type DemoJob = {
  reference: string;
  name: string;
  customerName: string;
  status: 'quoted' | 'active' | 'completed' | 'invoiced' | 'closed';
  siteAddressLine1: string;
  siteCity: string;
  sitePostcode: string;
  description: string;
  quotedRevencePence?: number;
  quotedRevenuePence: number;
  estimatedCostPence: number;
  monthsAgo: number;
};

export const DEMO_JOBS: DemoJob[] = [
  {
    reference: 'J-1041',
    name: 'Full re-roof — Bramham Road',
    customerName: 'Mrs A Kowalski',
    status: 'invoiced',
    siteAddressLine1: '42 Bramham Road',
    siteCity: 'Wetherby',
    sitePostcode: 'LS22 6RN',
    description: 'Strip and re-roof, new felt and battens, reclaimed pantiles, new leadwork to chimney.',
    quotedRevenuePence: 1_285_000,
    estimatedCostPence: 720_000,
    monthsAgo: 3,
  },
  {
    reference: 'J-1042',
    name: 'Flat roof replacement — Wellington Street',
    customerName: 'Halewood Property Group',
    status: 'invoiced',
    siteAddressLine1: '18 Wellington Street',
    siteCity: 'Leeds',
    sitePostcode: 'LS1 4HW',
    description: 'Single-ply membrane to rear flat roof, 210m², including insulation upgrade.',
    quotedRevenuePence: 2_450_000,
    estimatedCostPence: 1_560_000,
    monthsAgo: 2,
  },
  {
    reference: 'J-1043',
    name: 'Church hall slate repairs',
    customerName: 'St Mary’s Parish Council',
    status: 'completed',
    siteAddressLine1: 'The Parish Hall, Church Lane',
    siteCity: 'Boston Spa',
    sitePostcode: 'LS23 6DR',
    description: 'Replace slipped and broken slates, re-point ridge, renew valley.',
    quotedRevenuePence: 486_000,
    estimatedCostPence: 262_000,
    monthsAgo: 1,
  },
  {
    reference: 'J-1044',
    name: 'New build gutter and fascia — Kirkstall',
    customerName: 'Beckett Construction Ltd',
    status: 'active',
    siteAddressLine1: 'Plots 1–6, Kirkstall Road',
    siteCity: 'Leeds',
    sitePostcode: 'LS4 2AZ',
    description: 'Fascia, soffit and guttering to six new-build units. CIS subcontract work.',
    quotedRevenuePence: 1_740_000,
    estimatedCostPence: 1_120_000,
    monthsAgo: 1,
  },
  {
    reference: 'J-1045',
    name: 'Emergency leak — Otley Road flats',
    customerName: 'Ferris Lettings',
    status: 'active',
    siteAddressLine1: '7 Otley Road',
    siteCity: 'Leeds',
    sitePostcode: 'LS6 3AA',
    description: 'Trace and repair leak to second floor flat, temporary cover then permanent repair.',
    quotedRevenuePence: 148_000,
    estimatedCostPence: 72_000,
    monthsAgo: 0,
  },
  {
    reference: 'J-1046',
    name: 'Quote — Barn conversion roof, Collingham',
    customerName: 'Halewood Property Group',
    status: 'quoted',
    siteAddressLine1: 'Manor Farm, Linton Road',
    siteCity: 'Collingham',
    sitePostcode: 'LS22 5BS',
    description: 'Full roof to barn conversion including rooflights. Quote issued, awaiting decision.',
    quotedRevenuePence: 3_120_000,
    estimatedCostPence: 1_980_000,
    monthsAgo: 0,
  },
];

/** Anchors the demo to the current date so it always looks like live data. */
export function demoDates(today: IsoDate) {
  const thisMonthStart = startOfMonth(today);
  return {
    today,
    thisMonthStart,
    monthStart: (monthsAgo: number): IsoDate => startOfMonth(addMonths(today, -monthsAgo)),
    daysAgo: (days: number): IsoDate => addDays(today, -days),
  };
}
