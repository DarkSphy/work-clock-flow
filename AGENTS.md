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
- Keep each company's shared-device clock at `/p/$companyId` PIN-only, without creating a Supabase employee session. PIN lookup and single-use confirmation tickets run server-side; email/password is only for the personal dashboard at `/funcionario`. Never expose PIN hashes or bypass database uniqueness and attempt limits.
- Each employee has a seven-day schedule (Sunday index 0), with start/end/break and an employment start date. Monthly estimates exclude future days, today and incomplete shifts from settled balances. Use America/Sao_Paulo for business dates.
