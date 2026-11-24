# KALASAG-AI Deployment Gates

**November 25, 2026 · Release `1395b08`.** Both web apps are deployed and ready for a capstone walkthrough using the development backend. The owner approved public access to the two production sign-in pages. Preview deployments retain Vercel protection.

| Gate | Disposition |
| --- | --- |
| Web hosting and CI | Complete. Both Vercel deployments finished and all three release CI jobs passed. [Release evidence](KALASAGAI_WEB_RELEASE_REPORT.md) |
| Development Auth | The Resident site URL, hosted callback paths, Personnel invitation origin, and Gmail SMTP settings were verified. The staff creation fix is applied. [Configuration](KALASAGAI_DEPLOYMENT_GUIDE.md#development-auth) |
| Capstone rehearsal | Inbox delivery, recipient password setup and first sign-in, a fresh Gemini result, and audible playback on the presentation device remain open for live rehearsal. The existing test report supports a read-only demonstration. |
| Operational production cutover | Separate owner approval, data mapping, verified backup and restore, RLS review, security-advisor follow-up, and a rollback plan are outstanding. The legacy schema requires a data-preserving compatibility migration. [Production gate](KALASAGAI_DEPLOYMENT_GUIDE.md#4-production-gate) |

## Earlier staging record

On November 24, the initial Vercel setup had a protected Personnel deployment and a blocked Resident project-creation screen. The subsequent release completed both deployments. The [archived staging assessment](KALASAGAI_WEB_RELEASE_REPORT.md#archived-staging-assessment-of-november-24-2026) preserves the original blocker details.
