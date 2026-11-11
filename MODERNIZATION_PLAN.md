# Modernization Plan — lucadevelops.com (PassCollect)

Status: **Phase 0 done. Waiting for approval before implementing.**

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
*(Change summary, how-to-add-content and follow-ups will be appended here after implementation.)*
