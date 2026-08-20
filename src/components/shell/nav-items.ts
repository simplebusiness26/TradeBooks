export type NavItem = {
  href: string;
  label: string;
  /** Plain-English description shown in the full menu. */
  description: string;
  icon: string;
  primary: boolean;
  /** Only shown to users who can review/administer. */
  reviewerOnly?: boolean;
};

/**
 * The five primary items are the ones a working roofer needs on a phone.
 * Everything else lives behind "More" so the bottom bar stays uncluttered.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: '/home', label: 'Home', description: 'Where the business stands today', icon: 'home', primary: true },
  { href: '/money-in', label: 'Money in', description: 'Invoices and who owes you', icon: 'in', primary: true },
  { href: '/money-out', label: 'Money out', description: 'Spending, bills and categories', icon: 'out', primary: true },
  { href: '/receipts', label: 'Receipts', description: 'Photos and documents', icon: 'receipt', primary: true },
  { href: '/ask', label: 'Ask me', description: 'Quick questions to keep things straight', icon: 'ask', primary: true },
  { href: '/jobs', label: 'Jobs', description: 'What each job actually made', icon: 'job', primary: false },
  { href: '/subcontractors', label: 'Subcontractors', description: 'CIS records and monthly returns', icon: 'people', primary: false },
  { href: '/vat', label: 'VAT', description: 'Your VAT position and period checklist', icon: 'vat', primary: false },
  { href: '/customers', label: 'Customers', description: 'Contact details and balances', icon: 'people', primary: false },
  { href: '/suppliers', label: 'Suppliers', description: 'Merchants and subcontractors', icon: 'people', primary: false },
  { href: '/review', label: 'Bookkeeper view', description: 'Audit trail, rules, exports and period close', icon: 'review', primary: false },
  { href: '/settings', label: 'Settings', description: 'Business details, people and connections', icon: 'settings', primary: false },
];
