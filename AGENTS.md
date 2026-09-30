<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Create a company through the authenticated `companies` insert; its database trigger attaches the owner profile and admin role, because the former onboarding RPC is no longer available.
- Keep each company's shared-device clock at `/p/$companyId` PIN plus a mandatory camera photo, without creating a Supabase employee session. PIN lookup and single-use confirmation tickets run server-side; email/password is only for the personal dashboard at `/funcionario`. Never expose PIN hashes or bypass database uniqueness and attempt limits.
- Each employee has a seven-day schedule (Sunday index 0), with start/end/break and an employment start date. Monthly estimates exclude future days, today and incomplete shifts from settled balances. Use America/Sao_Paulo for business dates.
- Company reports at `/relatorios` must derive the tenant from the authenticated admin, paginate all records, and fail rather than export partial data. CSV exports are UTF-8 BOM/semicolon and neutralize spreadsheet formulas. Printed sheets preserve original marks and distinguish estimates from payroll calculations. No new migration is required for reports.
- Verify report calculations with `node --experimental-strip-types --test tests/*.test.ts`. The isolated visual fixture runs with `pnpm exec vite --config tests/preview.vite.config.ts`; open `/report-preview.html` and verify A4 printing with a full 31-day month.
- Use the shared `Brand` and `BrandLoading` components for the Simbi identity. The user-supplied transparent artwork in `public/brand/simbi-original.png` is the source for both symbol and lettering; CSS masks adapt its color and layout. Do not replace it with a typed S or generic font. `/brand-preview.html` in the isolated fixture displays light, dark and loading variants.
- Camera photos use the private `clock-photos` Storage bucket. Only server code uploads after a valid ticket, and SQL confirmation requires the object before atomically linking a time entry. Replays return the same receipt. Do not overwrite/delete an uploaded file after ambiguous confirmation; a punch may already have committed. Admin reads must derive the company from verified auth and use RLS before issuing 120-second signed URLs. No public image links, browser Storage writes, photo exports or automatic recognition. Apply `20260930150000_clock_photos.sql` after the older PIN migration; do not reapply older function definitions over the photo requirement.
