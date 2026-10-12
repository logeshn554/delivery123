# Merchant application review and activation

The `reviewMerchantEligibility` callable approves or rejects a restaurant/grocery application only when the application, business catalog and applicant are linked by server-owned IDs. The operations review panel creates a closed draft from an existing submitted application with `createMerchantBusiness` and its `applicationId`; this binds the catalog owner to that applicant. Existing drafts created without an application remain closed and cannot pass the review. The panel displays the published policy and eligible evidence, and requires the reviewer to select every configured evidence category.

Approval requires an independent active operations reviewer, an actual published policy, the applicant's current Firebase phone provider, the current application revision, and each configured document category with a recent clean scan, independent verified document review, active retention and required unexpired validity. Decisions are revision checked and replay bound in application and catalog event history. Review sets `onboardingStatus: approved` while keeping `acceptingOrders: false`; a separate trusted role-provisioning step is required and checks the approval marker again.

## Owner configuration required before approval

Authorized owners must establish the real jurisdiction and business requirements, publish a stable HTTPS policy, and configure `platform_config/merchant_eligibility` through protected Admin SDK infrastructure with:

```json
{
  "enabled": true,
  "version": 1,
  "policyUrl": "https://<owner-published-policy>",
  "requiredKinds": {
    "restaurant": ["<owner-selected evidence kinds>"],
    "grocery": ["<owner-selected evidence kinds>"]
  },
  "expiryRequiredKinds": ["<owner-selected expiring evidence kinds>"]
}
```

The placeholders are intentionally not deployable values. Use only supported evidence categories from the private intake contract and owner-approved legal/commercial requirements. Advance `version` whenever the reviewed policy changes. Do not make a policy approval by using fixture data, empty requirements, or sample evidence.

This implementation does not verify bank account ownership, tax standing, licenses with issuers, insurance coverage, signed agreements, operating permits, food safety compliance, staff permissions, or automated expiry/suspension. Those require approved business rules and provider integrations. The callable and emulator fixtures do not establish staging acceptance, a live merchant, legal compliance or production readiness. Catalog activation and settlement acceptance remain blocked until those requirements and live operator controls are completed.
