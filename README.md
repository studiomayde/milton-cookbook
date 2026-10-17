# Milton Manor

Our household home base: recipes, meal planner, shopping list and household lists (vouchers, jobs and anything else to tick off).

- The app is a single page, `index.html`, hosted on GitHub Pages.
- Recipes, the meal plan and the shopping list live in Supabase and sync between devices every few seconds.
- Everyone signs in with an email link (no password) and stays signed in on that device. Only emails on the People list can sign in; May manages the list in the app (People, at the bottom of the menu).

## One-time setup

### 1. Database (Supabase)
Open the Supabase project, go to **SQL Editor**, paste in the setup script and click **Run**.
`supabase/schema.sql` is the structure on its own. The personal setup script (shared privately, not in this repository) also sets the family key and brings across the existing recipes.

### 2. Website (GitHub Pages)
In this repository: **Settings → Pages → Build and deployment**. Set Source to **Deploy from a branch**, choose **main** and **/ (root)**, then **Save**. The site appears at `https://studiomayde.github.io/milton-cookbook/` after a minute or two.

### 3. Recipe links (optional, free)
Populate recipe reads pasted text and photos right in the browser, for free. To also read **recipe links**, add the free link reader:

1. In Supabase, open **Edge Functions**, choose **Deploy a new function → Via Editor**, name it `populate`, paste in `supabase/functions/populate/index.ts` and click **Deploy function**.

No API keys or payment needed. Most recipe websites publish their recipe in a standard format, which this reads, along with the recipe's photo.


## Sign-in setup
Run `supabase/auth.sql` once in the SQL Editor. In **Authentication → URL Configuration**, set Site URL to the site address.
Supabase's built-in email only reaches members of the Supabase team (2 emails an hour). To let anyone else on the People list sign in, connect a free email service under **Authentication → Emails → SMTP Settings** (for example Brevo or Resend).

## Changing the family key (old, no longer used)
Make a new random key, then in the SQL Editor run:

```sql
update public.cookbook_settings
set key_hash = encode(extensions.digest('NEW-KEY-HERE', 'sha256'), 'hex')
where id = 1;
```

Then share `https://studiomayde.github.io/milton-cookbook/#k=NEW-KEY-HERE`. The old link stops working straight away.
