# HIPAA / security ops checklist (AFH EHR)

1. Terminate TLS 1.2+ at the reverse proxy; never expose the Nest port publicly without TLS.
2. Rotate `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `PHI_FIELD_KEY` per environment; store only in secrets manager / env.
3. Configure SMTP (`SMTP_HOST` … `SMTP_FROM`) for invites, password reset, and high-severity alert digests. Keep BAA with the mail vendor.
4. Application logs must not include PHI (narratives, form blobs, PDF bodies). Download endpoints audit metadata only.
5. Session: access tokens ~10m with refresh rotation; web idle logout ~15m + absolute max.
6. Failed login lockout (5 attempts / 15m) + rate limit on `/auth/login`.
7. Password policy: 12+ chars with upper, lower, digit, symbol on create/reset/change.
8. MFA is out of scope for this release; plan for Phase 2+ if required by your Covered Entity policies.
