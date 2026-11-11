# Modernization Plan — lucadevelops.com (PassCollect)

Status: **Implemented. See the summary at the end.**

## 1. What's in the repo

| Area | Finding |
|---|---|
| Framework / build | None. Hand-written static HTML, no `package.json`, no build step. |
| Hosting | GitHub Pages via `.github/workflows/static.yml`, which uploads the repo root as-is. **GitHub Pages is case-sensitive, but this Mac checkout isn't** (`core.ignorecase=true`). |
| Pages | `index.html` (PassCollect landing page) and `privacy/index.html`. `rethink/` has been deleted from the working tree but is still in git, the sitemap and `llms.txt`. |
| Styling | One inline `<style>` block per page. Custom properties already exist on `:root`, and dark mode uses `prefers-color-scheme`. |
| Rendering | Fully static. All text is in the HTML, with nothing loaded by client-side JS. |
| Articles | **There are none.** No blog, Markdown, CMS or article routes. The content is one landing page (hero, 5 features, screenshot carousel, 5-question FAQ) and a privacy policy. |
| Existing SEO | `index.html` already has a title, description, canonical, OG/Twitter tags, `MobileApplication` and `FAQPage` JSON-LD (it matches the visible FAQ). There is also a hand-written `sitemap.xml`, `robots.txt` (`Allow: /` for everyone) and `llms.txt`. |
| JS | One `mousemove` parallax on the hero image. It sets `transform` inline and ignores reduced motion. |

### Current design tokens (`index.html`)
- **Colors:** `--accent: #ff4400` (the same value is also used for `--accent-dark`, so the "gradient" text is flat). `--accent-glow: rgba(255,68,0,.15/.2)`. `theme-color: #FF7959`. The new screenshots use a softer coral (≈ `#EC6A45`) on a warm dark-brown backdrop (≈ `#4A2410 → #161616`), with a violet card (≈ `#6A4BC8`) as a secondary color.
- **Neutrals:** fg `#333` / `#f5f5f7` and secondary `#666` / `#a1a1a6`. Backgrounds are white or `#121212` at 95% opacity.
- **Fonts:** Only **Archivo** is used. Inter, Hubot Sans, Poppins and Varela Round are loaded but unused. That's a free performance win (two render-blocking font requests, one of them very large).
- **Shape:** radii are 2rem / 1.5rem / 1rem. There is a 12px glass blur, and the easing is `cubic-bezier(.4,0,.2,1)`.
- **Background:** a static `body::before` with two orange radial glows. This is the natural base for the animated mesh.

### Screenshots in `images/` (new)
`First.png`, `InstantScanning.png`, `Images.png`, `Watch.png`, `shortcuts.png` and `widgets.png`. Each is 1206×2622 and about **2.4–3.0 MB PNG**.

Problems this causes in the current tree:
1. **Broken images now.** `appicon.png` (logo in the nav and footer), `showcase.png` (hero), `HomeView.png`, `scanbarcodes.png` and `lock.png` were deleted, but `index.html` still references them.
2. **Case-only renames that git didn't record.** On disk the files are `Watch.png`, `widgets.png` and `Images.png`, but git still tracks `watch.png`, `Widgets.png` and `images.png`. If this were pushed, GitHub Pages would serve the old casing, and any HTML using the new casing would 404. These need to be fixed with `git mv -f`.
3. **Weight.** About 16 MB of screenshots would hurt Lighthouse badly. Displayed at ≤280 CSS px wide, the carousel needs about 560 px (2×) images.

## 2. What I'll change

### Phase 0.5: Fix content and assets (prerequisite, own commit)
- Rebuild the carousel from the 6 new screenshots in order: First → InstantScanning → Images → Watch → shortcuts → widgets. Give each one descriptive alt text (e.g. "PassCollect card list showing saved loyalty cards with barcodes", "Scanning a card's barcode with the iPhone camera to add it instantly").
- Fix the filename casing in git and switch to consistent lowercase-kebab names (`first.png`, `instant-scanning.png`, …).
- Generate optimized copies at 560 px and 840 px wide in WebP (with a PNG/JPEG fallback) and use `srcset` + `width`/`height` + `loading="lazy"` (everything except the first slide). The originals stay in the repo.
- Hero: use the new `images/hero.png` (2853×2007, a dark-mode iPhone showing the card list), resized to 1200 and 1800 px wide. It's the LCP image, so it gets `fetchpriority="high"` and no lazy loading.
- Logo: use the restored `images/appicon.png` (1024², 1.4 MB). Ship a 128 px copy for the nav and footer.
- **New "Made for iPhone Duo" section** built around `images/duo.png`, which shows the same card list folded (narrow, 2 columns) and unfolded (wide, 3 columns). The copy will only describe what the image shows: the layout adapts to the folded and unfolded screens, with pinned cards and the side toolbar. I won't claim any other specs. It also gets a matching feature card, FAQ entry and article.
- Remove `rethink` from git, `sitemap.xml` and `llms.txt`.
- Drop the 4 unused font families.

### Phase 1: Animated gradients
- Add a token layer on `:root`: `--grad-1` coral `#ff4400`, `--grad-2` soft coral `#FF7959`, `--grad-3` warm amber, `--grad-4` violet `#6A4BC8` (low opacity, taken from the screenshots), `--grad-bg` (white or warm near-black `#161210`). Light and dark get separate values, all derived from the existing colors.
- Register `--mesh-angle` (`<angle>`), `--mesh-a`/`--mesh-b` (`<color>`) and `--mesh-x`/`--mesh-y` (`<percentage>`) with `@property`.
- Replace the static `body::before` with a fixed mesh layer of 3–4 blurred radial blobs. Each blob is its own pseudo-element or `div`, drifting with `transform` and changing `opacity` on 24s/32s/40s `ease-in-out alternate` loops. The registered properties slowly shift the hue and angle. Opacity stays low, so it reads as ambience rather than motion.
- The current static gradient remains the default. Animation is added only inside `@media (prefers-reduced-motion: no-preference)`.
- Pause the animation with `animation-play-state: paused` when the hero leaves the viewport (IntersectionObserver, about 10 lines of JS) and when the tab is hidden.
- Accents: an animated conic gradient border (mask-composite trick) on the App Store CTA only. Gradient text on the hero `<h1>` only, with a real second stop (`#ff4400 → #d63a00`), so the text stays above 3:1 (AA for large text) on light and dark backgrounds. The section `<h2>`s go back to a solid color.
- Wrap the parallax JS in a `matchMedia('(prefers-reduced-motion: no-preference)')` check and throttle it with `requestAnimationFrame`.

### Phase 2: Progressive blur
- Add one reusable `.progressive-blur` utility: a container with 6 absolutely positioned layers (blur 0.5 → 1 → 2 → 4 → 8 → 16 px), each with a `mask-image` band. It is configured with `--pb-direction` (to top or to bottom), `--pb-height` and `--pb-strength` (multiplier), and uses `-webkit-` prefixes. An `@supports not (backdrop-filter: blur(1px))` rule falls back to a semi-transparent `--grad-bg` gradient.
- **Sticky header:** a blur strip under the floating glass nav, so content dissolves as it scrolls up behind it.
- **Carousel edges:** a soft left/right fade-blur on the screenshot strip. This replaces the current dark `::after` overlay on each slide.
- Test at a 390×844 viewport with CPU throttling, and drop to 4 layers on narrow screens if scrolling janks.

### Phase 3: Discoverability (adapted, since there are no articles)
Applies to the pages that exist now:
- **Semantics:** the nav becomes a real `<nav>`. Features become a list (`<ul>`). The FAQ becomes `<section>` + `<details>`/`<h3>` or stays as headings, and stays visible. Each page keeps one `<h1>`. The privacy page gets a visible "Last updated" `<time datetime>`.
- **JSON-LD:** add sitewide `WebSite` + `Person` (Luca, with a URL). Keep `MobileApplication` and add `screenshot` from the new images. Keep `FAQPage` (it has a real Q&A). Add `BreadcrumbList` and `WebPage` to the privacy page, plus Twitter tags and an OG image.
- **Blog (decided: I write the articles).**
  - Source files: `content/blog/<slug>.md` with front matter (`title`, `description`, `summary`, `date`, `updated`, `tags`, `image`, `imageAlt`, optional `faq`).
  - Build: one **zero-dependency Node script**, `scripts/build.mjs`, with a small built-in Markdown renderer for headings, lists, tables, links, images, emphasis and code. It generates:
    - `blog/<slug>/index.html`: static HTML with `<article>`, a TL;DR, visible author and dates, `BlogPosting` + `BreadcrumbList` JSON-LD (plus `FAQPage` only if the post has a Q&A section), OG/Twitter tags, a canonical URL and 2–3 related posts by shared tags
    - `blog/<slug>/index.md`: a clean Markdown copy, linked with `<link rel="alternate" type="text/markdown">`
    - `blog/index.html`: the index, with summaries
    - `blog/tags/<tag>/index.html`
    - `feed.xml`: Atom, with full content
    - `sitemap.xml`, with `<lastmod>`
    - `llms.txt` and `llms-full.txt`
    - `index.md` and `privacy/index.md`, Markdown mirrors of the existing pages
  - Deploy: the generated output is committed, so the site works even without CI. The GitHub workflow also runs `node scripts/build.mjs` before uploading, so the deployed output is always current.
  - Authorship: author is `Person` "Luca" with URL `https://lucadevelops.com/`. Publisher is the same Person. Dates are 2026-11-11.
  - **Articles I'll write.** Strictly factual: they only use what the site and screenshots already state. No invented features, pricing or numbers.
    1. *How do you store loyalty cards on iPhone without creating an account?* (no login, iCloud sync)
    2. *How to add a loyalty card by scanning its barcode* (camera scan or photo, editing the card name, number, barcode type, logo and color, as shown in `InstantScanning.png`)
    3. *How to show your loyalty cards on Apple Watch*
    4. *One-tap access: Lock Screen shortcuts and Home Screen widgets for your cards*
    5. *Using PassCollect on iPhone Duo: folded and unfolded layouts*
    6. *Where is my card data stored? PassCollect's privacy model explained* (links to the privacy policy)
  - Tags: `getting-started`, `apple-watch`, `widgets`, `privacy`, `iphone-duo`. The homepage gets a "Guides" section that links to the blog.
- **`robots.txt` (decided):** allow all crawlers, including AI crawlers, and reference the sitemap. Generated by the build script.

## 3. Files involved
`index.html`, `privacy/index.html`, `images/*` (renamed and optimized variants), `sitemap.xml`, `robots.txt`, `llms.txt`, new `llms-full.txt`, new `*.md` page mirrors, new `scripts/build-discovery.mjs`, `.github/workflows/static.yml`, and `rethink/` (removed from git).

## 4. Risks
- **Case-sensitivity:** the biggest live risk. A wrong image name works locally and 404s in production. I'll check every `src` against `git ls-files`.
- **Pushing to `main` deploys.** I'll commit locally per phase but won't push without your OK.
- **`backdrop-filter` cost:** the page already stacks many `.glass` elements with 12px blurs. Adding progressive-blur layers on top could jank on older iPhones, so the layer count stays tunable.
- **WCAG:** `#ff4400` on white is about 3.4:1, which passes for large text only. It must not be used for body-size text on light backgrounds.
- **Image conversion tooling:** macOS `sips` can resize but may not write WebP on this OS version. If `cwebp` isn't available, I'll ship resized JPEG/PNG. No npm dependencies.
- **Lighthouse:** I'll record before and after scores with `npx lighthouse` if it can run here. Otherwise I'll ask you to run PageSpeed Insights.

## 5. Decisions
- Articles: I write 6 factual guides (listed above).
- `robots.txt`: allow all, including AI crawlers.
- Hero: `images/hero.png`. Logo: `images/appicon.png`. New iPhone Duo section: `images/duo.png`.
- Carousel: `First`, `InstantScanning`, `Images`, `Watch`, `shortcuts`, `widgets`.
- `rethink/`: removed everywhere.
- Brand feel (decided): **minimal**. The warm coral and glassmorphism look is dropped in favor of neutral surfaces (`#fafaf9` / `#0a0a0a`), hairline borders, Archivo only, and the app-icon orange used as a single sparse accent. The gradient mesh is a faint neutral wash with a hint of orange and violet.

## 6. Commits (local only, nothing pushed)
1. `Fix assets: new screenshots, hero, iPhone Duo section, remove rethink`
2. `Phase 1: animated gradient mesh with design tokens`
3. `Phase 2: progressive blur utility`
4. `Phase 3: blog, structured data and generated discovery files`

---
# Implementation summary (2026-11-11)

Status: **implemented in four local commits. Nothing has been pushed.** Pushing to `main` deploys the site.

| Commit | What |
|---|---|
| `Minimal redesign: new screenshots, hero, iPhone Duo section; remove rethink` | Assets, shared stylesheet, minimal look, iPhone Duo section, privacy restyle |
| `Phase 1: animated gradient mesh, CTA ring and hero gradient text` | Gradient tokens, `@property` animation, reduced-motion gating, off-screen pause |
| `Phase 2: reusable progressive blur` | `.pblur` utility on the header and screenshot strip |
| `Phase 3: guides, structured data and generated discovery files` | 6 guides, `scripts/build.mjs`, JSON-LD, feed, sitemap, llms.txt, Markdown copies, CI build |

## Lighthouse (local, `lighthouse@12.2.1`)

| Page | Mode | Perf | A11y | Best practices | SEO | LCP |
|---|---|---|---|---|---|---|
| Home, before | mobile | 42 | 100 | 100 | 100 | 45.3 s |
| Home, after | mobile | **93** | 100 | 100 | 100 | 2.8 s |
| Home, before | desktop | 75 | 100 | 100 | 100 | 7.5 s |
| Home, after | desktop | **99** | 100 | 100 | 100 | 0.7 s |
| Article, after | mobile / desktop | 95 / 100 | 100 | 100 | 100 | 2.4 s / 0.7 s |

The main win is image weight: about 16 MB of PNG screenshots became about 400 KB of WebP, with `srcset` and lazy loading. Dropping four unused font families also helped.

## What was verified
- **Rendering:** no console errors, failed requests or horizontal overflow at 390 px and 1280 px, in light and dark mode (Chrome, via Puppeteer).
- **Reduced motion:** with `prefers-reduced-motion: reduce`, no animations run. With `no-preference`, the hero animation pauses when off-screen.
- **Scroll performance:** about 60 fps when scrolling a 390 px viewport at 4× CPU throttle, with and without the blur layers. Headless Chrome doesn't fully reproduce a phone GPU, so check on a real iPhone.
- **Contrast:** body text is at least 6.1:1 and accent text at least 4.96:1 (light) / 8.5:1 (dark). The decorative `--accent` (2.99:1) is never used for text.
- **JSON-LD:** every page's JSON-LD parses. Types per page:
  - Home: `WebSite`, `Person`, `MobileApplication`, `FAQPage`
  - Privacy: `WebPage`, `BreadcrumbList`
  - Articles: `BlogPosting`, `BreadcrumbList`, plus `FAQPage` on the 4 guides with a Q&A section
  - Index and tag pages: `CollectionPage`
- **Feed and sitemap:** `feed.xml` and `sitemap.xml` pass `xmllint`.
- **Page structure:** every page has one `<h1>`, no skipped heading levels, alt text on every image, a canonical URL and a Markdown alternate. All internal links resolve.
- **Not tested here:** Safari and Firefox (no automation available on this machine). See the follow-ups.

## Content edits (complete list)
The homepage and privacy policy wording was kept. Everything below is new or changed:
- **Homepage, new text:**
  - Hero eyebrow "For iPhone, iPhone Duo & Apple Watch" and the hero note "Free · No account needed"
  - Section eyebrows (Features, iPhone Duo, Screenshots, Guides, FAQ)
  - A 6th feature card, "iPhone Duo"
  - The "Made for iPhone Duo" section: intro, caption and three points
  - A new FAQ entry, "Does PassCollect support iPhone Duo?" (also added to the FAQPage JSON-LD)
  - Six screenshot captions
  - The "Get more out of PassCollect" guides section heading and intro
- **Homepage, removed:** the emoji icons on the feature cards (replaced by 01–06) and the old App Store badge alt text "App Store icon" (the link keeps its `aria-label`).
- **Homepage, alt text:** all image alt text was rewritten to be descriptive. For example, "PassCollect App Hero Image" became a description of the screenshot.
- **Navigation and footer:** the nav now reads Features / iPhone Duo / Guides / FAQ / Download. The footer adds Guides and Feed links.
- **Privacy page:** no wording changes. The effective date is now wrapped in `<time>`.
- **llms.txt:** ReThink removed and an iPhone Duo fact added. The file is now generated.
- **Guides:** six new articles in `content/blog/`, written only from what the site and screenshots show.

### Please check these facts
These come from reading the screenshots, not from the existing site text:
- The PassCollect control can also be added to **Control Center** (`shortcuts.png` appears to show this).
- The exact Lock Screen and Home Screen setup steps (these are standard iOS flows).
- Installing the watch app via the Watch app's **Available Apps** list.
- On iPhone Duo: the side toolbar (Settings, Layout, Sort, Add, Search) and **pinned cards** at the top.
- "iPhone Duo" is used exactly as you named it.
- "Free" comes from the existing JSON-LD (`price: 0`) and `llms.txt`.

## How to add a new article
1. Create `content/blog/<url-slug>.md`. The filename becomes `/blog/<url-slug>/`, so keep it stable.
   ```markdown
   ---
   title: A question or clear statement (becomes the <h1> and headline)
   description: One sentence, ≤160 characters, for meta description and lists.
   summary: 1–3 sentence TL;DR shown at the top of the article.
   date: 2026-12-01
   updated: 2026-12-01
   tags: getting-started, privacy
   image: /images/first-800.webp
   imageAlt: Describe what the image shows
   ---

   ## First section heading
   Body in Markdown: ## / ### headings, lists, | tables |, [links](/blog/...), ![alt](/images/x-800.webp)

   ## Frequently asked questions   ← optional; each ### question becomes FAQPage JSON-LD
   ### A question?
   The answer.
   ```
2. Images: add `name-400.webp` and `name-800.webp` (for example `cwebp -q 82 -resize 800 0 in.png -o images/name-800.webp`). The build adds `srcset` and width/height automatically.
3. Run `node scripts/build.mjs` and commit. CI also runs the build before deploying.
4. The build gives the article its HTML page, Markdown copy, JSON-LD, tag pages, related links, a homepage listing, and entries in the feed, sitemap, `llms.txt` and `llms-full.txt`. When you edit an article, bump `updated` so the visible date, `dateModified`, the feed and the sitemap `<lastmod>` change.
5. New tag? Add a display label to `TAG_LABELS` in `scripts/build.mjs`. Otherwise the slug is title-cased.

Don't edit generated files by hand. These are overwritten on every build:
- `blog/**`
- `feed.xml`, `sitemap.xml`, `robots.txt`
- `llms.txt`, `llms-full.txt`
- `index.md`, `privacy/index.md`
- the list between `<!-- guides:start -->` and `<!-- guides:end -->` in `index.html`

## Recommended follow-ups
1. **Test in real Safari (macOS and iOS) and Firefox:** the mesh, the CTA ring and the blur. Everything has fallbacks, but they haven't been seen in those browsers.
2. **Push when happy.** After deploying, run Google's Rich Results Test and validator.schema.org on the homepage and one guide, and submit `sitemap.xml` in Search Console.
3. **Per-article OG images** (1200×630 JPEG). All pages currently share `webpreview.jpg`.
4. **An About page for Luca.** It would give the `Person` schema a better `url` than the homepage, and could add `sameAs` links.
5. **Self-host Archivo** (or use the system font). It's the main remaining blocker for mobile LCP.
6. **`images/original/` (18 MB) is deployed** even though no page references it. Exclude it from the Pages upload, or move it out of the repo.
7. ~~Copyright year~~: updated to © 2026.

