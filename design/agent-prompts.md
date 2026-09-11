# BBC Club — Agent Prompt Guide
Quick color reference: panel/primary = `primary` (#1E293B) · page = `surface-page` (#F8FAFC) · cards/fields = `surface-card` (#FFFFFF) with `border-default` (#E2E8F0) · text on light = `text-primary` / `text-secondary` / `text-tertiary` · text on navy = `text-on-dark` / `text-on-dark-muted` · destructive only = `status-danger`.

Example component prompts (use token refs, never inline hex):
- "Build 'Welcome back' on `entry-panel` over the blurred cabin photo: `headline` in `text-on-dark` left-aligned; two `field` inputs with `field-label` EMAIL / PASSWORD; `text-link` 'Forgot password?' right-aligned; `button-inverted` 'Sign in →'; `divider` with label NEW TO THE CLUB; `button-outlined` 'Create account'."
- "Create `proposal-card` for 'Your October in London': 16:9 empty lie-flat suite at dusk with `badge-for-you`; `title`; `body-sm` 'You flew this route in March.'; `facts-mono` ×2; `price` '$4,200' beside `price-published` '$7,850 published'; `caption` 'Valid until October 4'."
- "Design `tab-bar`: `surface-card`, `divider` on top, PROPOSALS / INBOX / PROFILE in `tab-mono`; inactive `text-secondary`, active `primary`; 6px `primary` dot on Inbox."
- "Compose the responded state of the detail screen: navy circle with a thin check, `title` 'Julia will call you shortly.', `caption` 'Your advisor has been notified.'"
- "Set Password keyboard-open: photo band 25%, content anchored top — `label-mono` YOUR KEY, `headline` 'Choose your password', `field` (password visible 'atlantic2026'), two checklist lines satisfied, `button-inverted` 'Continue →' docked above a real iOS keyboard."

Iteration rules: change one component per prompt and reference its token key; document default and pressed states only (touch product — no hover); every screen passes three checks before acceptance: serif headline, palette pure, fixture data identical across card / inbox / detail. Fixture: Alex Morgan · Julia Reed · London JFK→LHR $4,200 / $7,850 published · Paris $3,850 / $6,900 · Tokyo $4,650 / $8,400.
