# The Milton Cookbook

Our family recipe book, meal planner and shopping list.

- The app is a single page, `index.html`, hosted on GitHub Pages.
- Recipes, the meal plan and the shopping list live in Supabase and sync between devices every few seconds.
- Nobody signs in. The cookbook opens from the family link, which carries a private key after `#k=`. The key is never stored in this repository; only its fingerprint is kept in the database.

## One-time setup

### 1. Database (Supabase)
Open the Supabase project, go to **SQL Editor**, paste in the setup script and click **Run**.
`supabase/schema.sql` is the structure on its own. The personal setup script (shared privately, not in this repository) also sets the family key and brings across the existing recipes.

### 2. Website (GitHub Pages)
In this repository: **Settings → Pages → Build and deployment**. Set Source to **Deploy from a branch**, choose **main** and **/ (root)**, then **Save**. The site appears at `https://studiomayde.github.io/milton-cookbook/` after a minute or two.

### 3. Populate recipe (optional)
Reads a recipe from a link, pasted text or a photo and fills in the Add a recipe form.

1. In Supabase, open **Edge Functions** and deploy a new function named `populate`, pasting in `supabase/functions/populate/index.ts`.
2. Under **Edge Functions → Secrets**, add `ANTHROPIC_API_KEY` with an API key from console.anthropic.com. It's paid per use, typically a cent or two per recipe.

Without this step everything else works; the Populate recipe button just says it isn't switched on yet.

## Changing the family key
Make a new random key, then in the SQL Editor run:

```sql
update public.cookbook_settings
set key_hash = encode(extensions.digest('NEW-KEY-HERE', 'sha256'), 'hex')
where id = 1;
```

Then share `https://studiomayde.github.io/milton-cookbook/#k=NEW-KEY-HERE`. The old link stops working straight away.
