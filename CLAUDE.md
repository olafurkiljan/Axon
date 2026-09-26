# Axon: rules for working on this project

Axon is an AI news + quiz web app. It is hosted for free on GitHub Pages.

## About me

- I'm a beginner. Explain every step in plain language, with no jargon.
  If a technical word can't be avoided, explain what it means the first time.
- Before changing anything, tell me what you plan to do and why, in a few
  simple sentences.
- After a change, tell me exactly how to check that it works.

## Testing

- I test on an **iPhone 15 Pro** (Safari, and the app added to my Home Screen)
  and a **MacBook** (browser).
- Every change must work well on both: the phone layout (narrow screen, notch,
  home bar at the bottom) and the wide desktop layout (screens 900px and wider).
- When you're done, give me a short checklist of what to try on each device.

## Keep it free

- Everything must stay free: GitHub Pages for hosting, GitHub Actions for the
  automatic news updates.
- Don't add paid services, paid APIs, or anything that needs a credit card.
- Prefer no new libraries or tools. If one is truly needed, ask me first and
  explain why.

## Secrets

- Never put passwords, API keys, tokens or any other secrets in the code.
  Everything in this repository is public.
- If something ever needs a secret, stop and explain the safe way to do it
  (for example GitHub's "Secrets" settings) before doing anything.

## Saving and publishing changes (git)

- **Always ask me before committing.** Show me which files changed and a short
  description first, and only commit after I say yes.
- **Never push.** I push myself using GitHub Desktop.
- Remember: once I push to `main`, the website updates automatically within a
  few minutes.

## How the project is put together

- `site/index.html`: the whole app (page layout, styles and code in one file).
- `site/sw.js`: lets the app open offline. If you change the icons or the
  manifest, raise the version number in `CACHE` (e.g. `axon-v8` → `axon-v9`)
  so phones pick up the new files.
- `site/manifest.webmanifest` and `site/icons/`: name and icons used when the
  app is added to a Home Screen.
- `scripts/fetch-news.mjs`: collects AI headlines from news websites' RSS feeds
  and writes `site/news.json`. Runs on GitHub's computers, not on mine.
- `.github/workflows/news.yml`: the schedule that runs the script about every
  5 minutes and publishes the site when there's new news (and whenever I push).
- `site/news.json` is created automatically. It is not stored in the repository,
  so don't edit or commit it.
