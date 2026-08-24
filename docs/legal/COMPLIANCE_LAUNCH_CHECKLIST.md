# TradeBooks UK Compliance Launch Gate

**Status: NOT YET CLEARED FOR PRODUCTION OPEN-BANKING LAUNCH**

This is an engineering/compliance gate, not a declaration that TradeBooks is legally compliant.

## Blocking items — must be resolved before production customers
- [ ] Confirm the legal operator/entity name, postal address, support email and privacy email and replace all placeholders in legal documents.
- [ ] Confirm the FCA/Open Banking regulatory model **in writing** with TrueLayer/appropriate adviser. Do not assume using an API removes regulatory obligations. If TradeBooks itself provides account information to users, determine whether it must be authorised/registered, be a registered agent of an authorised provider, or operate under another permitted model.
- [ ] Confirm the production TrueLayer contract/product supports the chosen regulatory model and required explicit account-access consent.
- [ ] Do not collect bank passwords/PINs. Bank authentication must remain with the bank/authorised flow.
- [ ] Build a complete data map: every personal-data category, purpose, lawful basis, source, recipient, storage location and retention period.
- [ ] Decide and document whether TradeBooks is controller or processor for each processing activity. Do not use one blanket classification.
- [ ] Complete the subprocessor/vendor register and Article 28 DPAs where required.
- [ ] Document restricted international transfers and safeguards where applicable.
- [ ] Complete retention/deletion schedule, including accounting/legal retention versus user-request deletion.
- [ ] Provide privacy information at collection and immediately before/around bank-data connection using clear just-in-time wording.
- [ ] Implement user data access/export, correction route, account closure/deletion request and bank disconnect/revocation route.
- [ ] Establish a process for data-subject requests and identity verification.
- [ ] Establish security incident/personal-data breach procedure and responsibility/notification assessment.
- [ ] Perform a DPIA screening; complete a DPIA before launch if processing is likely to result in high risk.
- [ ] Determine whether an ICO data protection fee/registration obligation applies to the legal operator and complete it if required.
- [ ] Inventory cookies/local storage. Keep optional analytics/advertising disabled until compliant consent controls exist.
- [ ] Add visible Privacy, Terms and Cookie links in product UI before public launch.
- [ ] Ensure AI/automatic categorisation is described as assistive; provide human review/correction and do not market outputs as guaranteed tax/accounting advice.
- [ ] Review consumer-vs-business customer model, pricing/cancellation/refund wording, liability terms and governing law with a qualified UK professional before charging customers.
- [ ] Verify tax/VAT/accounting-record features and claims with a qualified accountant before marketing them as compliant filing/tax advice.

## Recommended operational records
- [ ] Record of processing activities/data map.
- [ ] Lawful-basis assessment and legitimate-interests assessment where relied upon.
- [ ] Consent/authorisation audit trail for Open Banking access.
- [ ] Subprocessor register and vendor security reviews.
- [ ] Retention schedule and deletion runbook.
- [ ] Incident response/breach log.
- [ ] Data-subject request log.
- [ ] Access-control review and production admin-access log.
- [ ] Release checklist that fails if legal placeholders remain.

## Product copy rules
1. Never say TradeBooks is a bank, accountant, tax adviser, FCA-authorised provider or "fully compliant" unless that statement has been verified and remains current.
2. Clearly identify the authorised Open Banking provider and explain the user's bank connection/consent journey.
3. Do not bundle Open Banking explicit consent into acceptance of general Terms.
4. Give users meaningful correction/review controls for automatically generated bookkeeping classifications.
5. Keep legal/privacy links easy to find and use plain language.

## Final external checks
Before a live UK launch involving real bank data or paying customers, obtain targeted review of (a) the FCA/PSR account-information-services model and TrueLayer contractual arrangement, (b) UK GDPR/data-processing roles and documents, and (c) customer Terms/liability/tax claims. This is a high-leverage review: the app can be technically complete while the regulatory model is still wrong.
