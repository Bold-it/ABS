# Moodle Onboarding Debugging Log
**Date**: June 21-22, 2026
**Issue**: Moodle Onboarding failing with `ONBOARDING_FAILED: Invalid parameter value detected`.

## 1. Initial Investigation
- The system was repeatedly failing to onboard specific students (like EVANS and PAMELA) to Moodle.
- The `invalid_parameter_exception` is a strict Moodle API error thrown when a user creation field (username, email, password) does not meet validation constraints.

## 2. Attempts & Patches
1. **Trailing Spaces**: Suspecting invisible characters from Excel copy-pastes, we added `.replace(/\s+/g, '')` to the `moodle.service.ts` to aggressively strip spaces from `username` and `email`.
2. **Password Policy**: Moodle has strict default password policies. We hardened the default generated password to `HtuStudent@2026!` and verified that the `auth` type was `oauth2`.
3. **404 Not Found**: We discovered that trailing spaces in `admissionId` were causing 404 errors during webhook events. We added `.trim()` across all endpoints in `webhook.service.ts`.

## 3. The Root Cause Discovery
After reviewing detailed audit logs, we noticed a critical difference between successful students (VANESSA) and failing students (EVANS, PAMELA):
- Vanessa's logs explicitly showed `GOOGLE_EMAIL_PROVISIONED` right before `MOODLE_ACCOUNT_CREATED`.
- Evans and Pamela **skipped** the `GOOGLE_EMAIL_PROVISIONED` step completely.

**Why it skipped:**
In `onboarding.service.ts`, the code checked `if (!student.schoolEmail)` to decide whether to provision a Google Workspace email. Because ROPAT sent the Admission payload with invalid garbage data in the email field (e.g., `"N/A"`, `"none"`, or empty spaces), the field was NOT empty. The system falsely assumed they had a valid email and passed `"N/A"` directly to Moodle. Moodle rejected the non-email string with `Invalid parameter value detected`.

## 4. The Final Solution
We updated `onboarding.service.ts` to actively validate the email string format:
```typescript
if (!student.schoolEmail || !student.schoolEmail.includes('@')) {
   // Provision a brand new Google Workspace email
}
```
If ROPAT sends invalid strings, the system will now intercept it, generate a correct `@htu.edu.gh` email, save it to the DB, and successfully create the Moodle account.
