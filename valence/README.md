# Valence pre-launch site

A simple one-page PHP/MySQL pre-launch site for `valence.love`.

## Assets to add

Place these files in the `assets` folder:

- `valence-logo.png` — transparent PNG, ideally **2400 px wide**, proportional height, tightly cropped.
- `facebook.png` — transparent square PNG, **512 × 512 px**.
- `x.png` — transparent square PNG, **512 × 512 px**.
- `instagram.png` — transparent square PNG, **512 × 512 px**.

The site displays the social icons at about 26 px, so the 512 px source files will remain crisp on high-density screens.

## Match the background to the logo

The current placeholder background is `#6f3fc8`.

Once the final logo is ready, sample its purple and replace this line near the top of `assets/style.css`:

```css
--purple: #6f3fc8;
```

You can also adjust `--purple-deep` if needed.

## Database setup

1. Create a MySQL database in Fasthosts.
2. Run `schema.sql` in that database.
3. Copy `config.example.php` to `config.php`.
4. Enter the database host, database name, username and password supplied by Fasthosts.
5. Upload the site files to the web root for `valence.love`.
6. Ensure the domain has HTTPS/SSL enabled before public launch.

`config.php` contains a database password. Do not publish it in a public GitHub repository.

## Registration behaviour

The form collects:

- first name
- email address
- age (18+ only)
- outward postcode only
- university/college
- optional marketing consent

It does **not** store IP addresses, full postcodes, date of birth or other unnecessary personal data.

The database has a unique constraint on email addresses, so repeated registrations do not create duplicate rows.

Marketing consent is optional and unticked by default. When selected, the database records both a consent timestamp and the version of the consent wording.

## Social links

The placeholder links are set near the bottom of `index.php`.

Current placeholders:

- `https://www.facebook.com/valence.love`
- `https://x.com/valence.love`
- `https://www.instagram.com/valence.love`

Replace them with the final profile URLs when the accounts are ready. Note that X usernames have their own handle-format rules, so the final X URL may differ from the other two.

## Before public launch

- Replace the logo and social images.
- Match the background colour precisely to the logo.
- Add the final social profile URLs.
- Confirm the privacy notice accurately identifies the legal data controller/operator.
- Check whether any hosting/provider details need to be named in the privacy notice.
- Test form submissions, duplicate emails and under-18 rejection.
- Confirm HTTPS is active.
- Back up the database.

## Later additions

Good next-stage additions would be:

- password-protected registration dashboard
- CSV export
- unsubscribe flow for marketing emails
- double opt-in if desired
- transactional confirmation emails
- proper email platform integration
- analytics with an appropriate consent mechanism if/when introduced
