#!/usr/bin/env node
// Zero-dependency static build for lucadevelops.com.
//
// Source of truth:  content/blog/*.md  (front matter + Markdown)
//                   index.html, privacy/index.html (hand-written pages)
// Generates:        blog/**  (article pages, Markdown copies, index, tag pages)
//                   feed.xml, sitemap.xml, robots.txt, llms.txt, llms-full.txt,
//                   index.md, privacy/index.md, and the guides list in index.html
//
// Run: node scripts/build.mjs

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://lucadevelops.com';
const APP_STORE = 'https://apps.apple.com/app/passcollect-store-cards/id6738351871';
const AUTHOR = { name: 'Luca', url: `${SITE}/`, email: 'lugodev@icloud.com' };
const OG_IMAGE = `${SITE}/webpreview.jpg`;
const TAG_LABELS = {
  'getting-started': 'Getting started',
  'apple-watch': 'Apple Watch',
  'widgets': 'Widgets & shortcuts',
  'privacy': 'Privacy',
  'iphone-duo': 'iPhone Duo',
};
const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- helpers
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const write = (p, s) => { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), s); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tagLabel = (t) => TAG_LABELS[t] || t.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const abs = (u) => (u.startsWith('/') ? SITE + u : u);
const fmtDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const json = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');

function gitDate(path) {
  try {
    const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', path], { cwd: ROOT, encoding: 'utf8' }).trim();
    return d || TODAY;
  } catch { return TODAY; }
}

// Intrinsic size of a local .webp/.png, used for width/height attributes (avoids layout shift).
function imageSize(urlPath) {
  const file = join(ROOT, urlPath);
  if (!existsSync(file)) throw new Error(`Image not found: ${urlPath}`);
  const b = readFileSync(file);
  if (b.toString('ascii', 1, 4) === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  }
  return null;
}

// srcset from sibling files named <base>-<width>.webp
function srcset(urlPath) {
  const m = urlPath.match(/^(.*\/)([^/]+)-(\d+)\.webp$/);
  if (!m) return '';
  const [, dir, base] = m;
  const sizes = readdirSync(join(ROOT, dir))
    .map((f) => f.match(new RegExp(`^${base}-(\\d+)\\.webp$`)))
    .filter(Boolean).map((x) => +x[1]).sort((a, b) => a - b);
  return sizes.length > 1 ? sizes.map((w) => `${dir}${base}-${w}.webp ${w}w`).join(', ') : '';
}

function imgTag(src, alt, { sizes = '(max-width: 720px) 92vw, 680px', eager = false } = {}) {
  const dim = imageSize(src);
  const ss = srcset(src);
  return `<img src="${esc(src)}"${ss ? ` srcset="${ss}" sizes="${sizes}"` : ''}${dim ? ` width="${dim.w}" height="${dim.h}"` : ''} ${eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'} alt="${esc(alt)}">`;
}

// ---------------------------------------------------------------- Markdown
function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => {
    const ext = /^https?:/.test(u) && !u.startsWith(SITE);
    return `<a href="${u}"${ext ? ' rel="noopener"' : ''}>${t}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return s;
}

function renderMarkdown(src) {
  const lines = src.replace(/\r/g, '').split('\n');
  const out = [];
  const headings = [];
  let i = 0;
  const isBlockStart = (l) => /^(#{1,6} |[-*] |\d+\. |> |\||!\[)/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = line.match(/^(#{1,6}) (.*)$/))) {
      const level = Math.min(Math.max(m[1].length, 2), 4); // body headings start at h2; the page owns the h1
      const id = slugify(m[2]);
      headings.push({ level, text: m[2], id });
      out.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`);
      i++; continue;
    }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/))) {
      out.push(`<figure>${imgTag(m[2], m[1])}</figure>`);
      i++; continue;
    }
    if (line.startsWith('|') && lines[i + 1] && /^\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]));
      out.push('<table>\n<thead><tr>' + head.map((h) => `<th scope="col">${inline(h)}</th>`).join('') + '</tr></thead>\n<tbody>\n' +
        rows.map((r) => '<tr>' + r.map((c, j) => (j === 0 && head[0] === '' ? `<th scope="row">${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('') + '</tr>').join('\n') +
        '\n</tbody>\n</table>');
      continue;
    }
    if (/^([-*]|\d+\.) /.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const re = ordered ? /^\d+\. (.*)$/ : /^[-*] (.*)$/;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        let item = lines[i].match(re)[1];
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(item);
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>\n` + items.map((t) => `<li>${inline(t)}</li>`).join('\n') + `\n</${tag}>`);
      continue;
    }
    if (line.startsWith('> ')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('> ')) buf.push(lines[i++].slice(2));
      out.push(`<blockquote><p>${inline(buf.join(' '))}</p></blockquote>`);
      continue;
    }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return { html: out.join('\n'), headings };
}

// Q&A pairs under a "Frequently asked questions" h2: each h3 is a question, following paragraphs the answer.
function extractFaq(body) {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => /^## +frequently asked questions/i.test(l));
  if (start < 0) return [];
  const faq = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    const q = lines[i].match(/^### +(.*)$/);
    if (q) faq.push({ q: q[1].trim(), a: [] });
    else if (faq.length && lines[i].trim()) faq[faq.length - 1].a.push(lines[i].trim());
  }
  const plain = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1').replace(/`/g, '');
  return faq.filter((f) => f.a.length).map((f) => ({ q: plain(f.q), a: plain(f.a.join(' ')) }));
}

// Root-relative links/images → absolute, for Markdown copies and the feed.
const absMarkdown = (md) => md.replace(/\]\((\/[^)\s]*)\)/g, (_, u) => `](${SITE}${u})`);
const absHtml = (html) => html.replace(/(href|src)="\//g, `$1="${SITE}/`).replace(/srcset="([^"]+)"/g, (_, v) => `srcset="${v.replace(/(^|, )\//g, `$1${SITE}/`)}"`);

// ---------------------------------------------------------------- posts
function parseFrontMatter(raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  for (const k of ['title', 'description', 'summary', 'date']) if (!data[k]) throw new Error(`${file}: missing "${k}"`);
  data.tags = (data.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  data.updated = data.updated || data.date;
  return { data, body: m[2].trim() };
}

const posts = readdirSync(join(ROOT, 'content/blog'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const { data, body } = parseFrontMatter(read(`content/blog/${f}`), f);
    const slug = f.replace(/\.md$/, '');
    const { html, headings } = renderMarkdown(body);
    return { ...data, slug, body, html, headings, faq: extractFaq(body), path: `/blog/${slug}/`, url: `${SITE}/blog/${slug}/` };
  })
  .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

const tags = [...new Set(posts.flatMap((p) => p.tags))].sort();

function related(post, n = 3) {
  return posts
    .filter((p) => p !== post)
    .map((p) => ({ p, score: p.tags.filter((t) => post.tags.includes(t)).length }))
    .sort((a, b) => b.score - a.score || b.p.date.localeCompare(a.p.date))
    .slice(0, n).map((x) => x.p);
}

// ---------------------------------------------------------------- shared schema + layout
const PERSON = { '@type': 'Person', '@id': `${SITE}/#person`, name: AUTHOR.name, url: AUTHOR.url, email: `mailto:${AUTHOR.email}` };
const WEBSITE = { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'PassCollect', inLanguage: 'en', publisher: { '@id': `${SITE}/#person` } };
const crumbs = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
});

const PB = '<i></i><i></i><i></i><i></i><i></i><i></i>';
function layout({ title, description, path, ogType = 'website', graph, markdownPath, extraHead = '', main, current }) {
  const url = SITE + path;
  const navLink = (href, label, cls = '') => `<li${cls ? ` class="${cls}"` : ''}><a href="${href}"${current === href ? ' aria-current="page"' : ''}>${label}</a></li>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="author" content="${AUTHOR.name}">
  <link rel="canonical" href="${url}">
${markdownPath ? `  <link rel="alternate" type="text/markdown" href="${markdownPath}" title="Markdown version">\n` : ''}  <link rel="alternate" type="application/atom+xml" href="/feed.xml" title="PassCollect Guides">

  <meta property="og:type" content="${ogType}">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="PassCollect">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="PassCollect app showcase on iPhone and Apple Watch">
${extraHead}  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${OG_IMAGE}">

  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta name="theme-color" content="#fafaf9" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400..700&display=swap">
  <link rel="stylesheet" href="/assets/css/site.css">

  <script type="application/ld+json">
${json({ '@context': 'https://schema.org', '@graph': [WEBSITE, PERSON, ...graph] })}
  </script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>

  <header class="site-header">
    <div class="pblur pblur-header" aria-hidden="true">${PB}</div>
    <div class="wrap">
      <a class="brand" href="/" aria-label="PassCollect home">
        <img src="/images/appicon-64.png" alt="" width="28" height="28">
        PassCollect
      </a>
      <nav class="site-nav" aria-label="Main">
        <ul>
          ${navLink('/#features', 'Features', 'hide-sm')}
          ${navLink('/blog/', 'Guides')}
          ${navLink('/#faq', 'FAQ', 'hide-sm')}
          <li><a class="nav-cta" href="${APP_STORE}">Download</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <main id="main" class="page">
${main}
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <a class="brand" href="/">
        <img src="/images/appicon-64.png" alt="" width="28" height="28" loading="lazy">
        PassCollect
      </a>
      <ul>
        <li><a href="/blog/">Guides</a></li>
        <li><a href="/privacy/">Privacy Policy</a></li>
        <li><a href="mailto:${AUTHOR.email}">Contact Us</a></li>
        <li><a href="/feed.xml">Feed</a></li>
      </ul>
      <small>© 2025 PassCollect. All rights reserved.</small>
    </div>
  </footer>
</body>
</html>
`;
}

const postListItem = (p, h = 'h2') => `      <li>
        <a class="post-link" href="${p.path}">
          <${h}>${esc(p.title)}</${h}>
          <time datetime="${p.date}">${fmtDate(p.date)}</time>
          <p class="post-summary">${esc(p.description)}</p>
        </a>
      </li>`;

const tagLinks = (list) => `<ul class="tag-list">${list.map((t) => `<li><a href="/blog/tags/${t}/" rel="tag">${esc(tagLabel(t))}</a></li>`).join('')}</ul>`;

// ---------------------------------------------------------------- article pages
rmSync(join(ROOT, 'blog'), { recursive: true, force: true });

function postMarkdown(p) {
  return `# ${p.title}

> ${p.summary}

- Author: [${AUTHOR.name}](${AUTHOR.url})
- Published: ${p.date}
- Updated: ${p.updated}
- Tags: ${p.tags.map(tagLabel).join(', ')}
- Canonical: ${p.url}

${absMarkdown(p.body)}
`;
}

for (const p of posts) {
  const rel = related(p);
  const graph = [
    {
      '@type': 'BlogPosting',
      '@id': `${p.url}#article`,
      mainEntityOfPage: { '@type': 'WebPage', '@id': p.url },
      headline: p.title,
      description: p.description,
      abstract: p.summary,
      image: p.image ? [abs(p.image)] : [OG_IMAGE],
      datePublished: p.date,
      dateModified: p.updated,
      author: { '@id': `${SITE}/#person`, '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url },
      publisher: { '@id': `${SITE}/#person`, '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url },
      isPartOf: { '@id': `${SITE}/#website` },
      inLanguage: 'en',
      articleSection: 'Guides',
      keywords: p.tags.map(tagLabel).join(', '),
      url: p.url,
    },
    crumbs([['Home', `${SITE}/`], ['Guides', `${SITE}/blog/`], [p.title, p.url]]),
  ];
  if (p.faq.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${p.url}#faq`,
      mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }

  const main = `    <article class="wrap">
      <div class="prose">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          <ol>
            <li><a href="/">Home</a></li>
            <li><a href="/blog/">Guides</a></li>
            <li><span aria-current="page">${esc(p.title)}</span></li>
          </ol>
        </nav>
        <header class="article-header">
          <h1>${esc(p.title)}</h1>
          <p class="tldr"><strong>Summary:</strong> ${esc(p.summary)}</p>
          <p class="byline">
            <span>By <a href="${AUTHOR.url}" rel="author">${AUTHOR.name}</a></span>
            <span>Published <time datetime="${p.date}">${fmtDate(p.date)}</time></span>
            <span>Updated <time datetime="${p.updated}">${fmtDate(p.updated)}</time></span>
          </p>
        </header>
${p.image ? `        <figure>${imgTag(p.image, p.imageAlt || '', { eager: true })}</figure>\n` : ''}${p.html.replace(/^/gm, '        ')}
      </div>
      <footer class="article-footer">
        <h2>Topics</h2>
        ${tagLinks(p.tags)}
        <h2>Related guides</h2>
        <ul class="post-list">
${rel.map((r) => postListItem(r, 'h3')).join('\n')}
        </ul>
        <div class="cta-card">
          <p><strong>Get PassCollect</strong>Free on the App Store for iPhone and Apple Watch. No account needed.</p>
          <a class="store-badge" href="${APP_STORE}" aria-label="Download PassCollect on the App Store"><img src="/appstore.svg" alt="" width="156" height="52" loading="lazy"></a>
        </div>
      </footer>
    </article>`;

  const extraHead = `  <meta property="article:published_time" content="${p.date}">
  <meta property="article:modified_time" content="${p.updated}">
  <meta property="article:author" content="${AUTHOR.url}">
${p.tags.map((t) => `  <meta property="article:tag" content="${esc(tagLabel(t))}">`).join('\n')}
`;

  write(`blog/${p.slug}/index.html`, layout({
    title: `${p.title} | PassCollect`, description: p.description, path: p.path, ogType: 'article',
    graph, markdownPath: `${p.path}index.md`, extraHead, main, current: '/blog/',
  }));
  write(`blog/${p.slug}/index.md`, postMarkdown(p));
}

// ---------------------------------------------------------------- blog index + tag pages
const listPage = ({ title, h1, intro, path, list, crumbList, current }) => layout({
  title, description: intro, path, current,
  markdownPath: `${path}index.md`,
  graph: [
    {
      '@type': 'CollectionPage', '@id': `${SITE}${path}#page`, url: SITE + path, name: h1, description: intro,
      isPartOf: { '@id': `${SITE}/#website` },
      mainEntity: { '@type': 'ItemList', itemListElement: list.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: p.url, name: p.title })) },
    },
    crumbs(crumbList),
  ],
  main: `    <div class="wrap">
      <div class="prose">
        <nav class="breadcrumbs" aria-label="Breadcrumb">
          <ol>
${crumbList.map(([n, u], i) => (i === crumbList.length - 1 ? `            <li><span aria-current="page">${esc(n)}</span></li>` : `            <li><a href="${u.replace(SITE, '')}">${esc(n)}</a></li>`)).join('\n')}
          </ol>
        </nav>
        <header class="article-header">
          <h1>${esc(h1)}</h1>
          <p class="tldr">${esc(intro)}</p>
        </header>
        <h2 class="eyebrow">Topics</h2>
        ${tagLinks(tags)}
        <ul class="post-list">
${list.map((p) => postListItem(p)).join('\n')}
        </ul>
      </div>
    </div>`,
});

const listMarkdown = (h1, intro, list, url) => `# ${h1}

> ${intro}

Canonical: ${url}

${list.map((p) => `- [${p.title}](${p.url}index.md): ${p.description}`).join('\n')}
`;

const BLOG_INTRO = 'Step-by-step guides to PassCollect: storing loyalty cards without an account, scanning barcodes, Apple Watch, widgets, iPhone Duo and privacy.';
write('blog/index.html', listPage({
  title: 'PassCollect Guides | Loyalty cards on iPhone and Apple Watch', h1: 'Guides', intro: BLOG_INTRO,
  path: '/blog/', list: posts, crumbList: [['Home', `${SITE}/`], ['Guides', `${SITE}/blog/`]], current: '/blog/',
}));
write('blog/index.md', listMarkdown('PassCollect Guides', BLOG_INTRO, posts, `${SITE}/blog/`));

for (const t of tags) {
  const list = posts.filter((p) => p.tags.includes(t));
  const intro = `PassCollect guides about ${tagLabel(t).toLowerCase()}.`;
  const path = `/blog/tags/${t}/`;
  write(`blog/tags/${t}/index.html`, listPage({
    title: `${tagLabel(t)} guides | PassCollect`, h1: `${tagLabel(t)} guides`, intro, path, list, current: '/blog/',
    crumbList: [['Home', `${SITE}/`], ['Guides', `${SITE}/blog/`], [tagLabel(t), SITE + path]],
  }));
  write(`blog/tags/${t}/index.md`, listMarkdown(`${tagLabel(t)} guides`, intro, list, SITE + path));
}

// ---------------------------------------------------------------- homepage guides list
{
  let home = read('index.html');
  const start = '<!-- guides:start -->', end = '<!-- guides:end -->';
  if (!home.includes(start)) throw new Error('index.html is missing the <!-- guides:start --> marker');
  const list = `${start}
        <ul class="post-list">
${posts.slice(0, 6).map((p) => postListItem(p, 'h3').replace(/^/gm, '  ')).join('\n')}
        </ul>
        ${end}`;
  home = home.replace(new RegExp(`${start}[\\s\\S]*?${end}`), list);
  write('index.html', home);
}

// ---------------------------------------------------------------- Markdown copies of hand-written pages
function htmlToMarkdown(html, { title, url }) {
  let s = (html.match(/<main[^>]*>([\s\S]*?)<\/main>/) || [, html])[1];
  s = s.replace(/<div[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/div>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<span class="feature-num">[\s\S]*?<\/span>/g, '')
    .replace(/<p class="eyebrow">[\s\S]*?<\/p>/g, '')
    .replace(/<li>\s*<a class="post-link" href="([^"]+)">\s*<h\d>([\s\S]*?)<\/h\d>[\s\S]*?<p class="post-summary">([\s\S]*?)<\/p>\s*<\/a>\s*<\/li>/g,
      (_, u, t, d) => `\n- [${t.trim()}](${abs(u)}): ${d.trim()}\n`)
    .replace(/<time[^>]*>([\s\S]*?)<\/time>/g, '$1')
    .replace(/<li>(?!\s*<(h\d|span|div|figure|a class="post-link"))/g, '\n- ')
    .replace(/<img\b([^>]*)>/g, (_, a) => {
      const alt = (a.match(/alt="([^"]*)"/) || [])[1] || '';
      const src = (a.match(/src="([^"]*)"/) || [])[1] || '';
      return alt ? `\n![${alt}](${abs(src)})\n` : '';
    })
    .replace(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/g, (_, l, t) => `\n\n${'#'.repeat(+l)} ${t.trim()}\n\n`)
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, u, t) => {
      const text = t.replace(/<[^>]+>/g, '').trim();
      return text ? `[${text}](${abs(u)})` : '';
    })
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, '**$2**')
    .replace(/<figcaption>([\s\S]*?)<\/figcaption>/g, '\n*$1*\n')
    .replace(/<\/(p|div|li|ul|ol|figure|section|article|header)>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&larr;/g, '←').replace(/&rarr;/g, '→').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  s = s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!s.startsWith('# ')) s = `# ${title}\n\n${s}`;
  return `${s.replace(/^(# .*)$/m, `$1\n\nCanonical: ${url}`)}\n`;
}

const homeHtml = read('index.html');
const homeMd = htmlToMarkdown(homeHtml, { title: 'PassCollect', url: `${SITE}/` });
const privacyMd = htmlToMarkdown(read('privacy/index.html'), { title: 'PassCollect Privacy Policy', url: `${SITE}/privacy/` });
write('index.md', homeMd);
write('privacy/index.md', privacyMd);

// ---------------------------------------------------------------- feed.xml (Atom, full content)
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const feedUpdated = posts.reduce((m, p) => (p.updated > m ? p.updated : m), '1970-01-01');
write('feed.xml', `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
  <title>PassCollect Guides</title>
  <subtitle>${xmlEsc(BLOG_INTRO)}</subtitle>
  <link href="${SITE}/feed.xml" rel="self" type="application/atom+xml"/>
  <link href="${SITE}/blog/" rel="alternate" type="text/html"/>
  <id>${SITE}/blog/</id>
  <updated>${feedUpdated}T00:00:00Z</updated>
  <author><name>${AUTHOR.name}</name><uri>${AUTHOR.url}</uri></author>
  <icon>${SITE}/images/appicon-192.png</icon>
${posts.map((p) => `  <entry>
    <title>${xmlEsc(p.title)}</title>
    <link href="${p.url}" rel="alternate" type="text/html"/>
    <link href="${p.url}index.md" rel="alternate" type="text/markdown"/>
    <id>${p.url}</id>
    <published>${p.date}T00:00:00Z</published>
    <updated>${p.updated}T00:00:00Z</updated>
    <author><name>${AUTHOR.name}</name><uri>${AUTHOR.url}</uri></author>
${p.tags.map((t) => `    <category term="${t}" label="${xmlEsc(tagLabel(t))}"/>`).join('\n')}
    <summary>${xmlEsc(p.summary)}</summary>
    <content type="html">${xmlEsc(absHtml(`<p><strong>Summary:</strong> ${esc(p.summary)}</p>\n${p.image ? `<figure>${imgTag(p.image, p.imageAlt || '')}</figure>\n` : ''}${p.html}`))}</content>
  </entry>`).join('\n')}
</feed>
`);

// ---------------------------------------------------------------- sitemap.xml
const urls = [
  { loc: `${SITE}/`, lastmod: gitDate('index.html') },
  { loc: `${SITE}/blog/`, lastmod: feedUpdated },
  ...posts.map((p) => ({ loc: p.url, lastmod: p.updated })),
  ...tags.map((t) => ({ loc: `${SITE}/blog/tags/${t}/`, lastmod: posts.filter((p) => p.tags.includes(t)).reduce((m, p) => (p.updated > m ? p.updated : m), '1970-01-01') })),
  { loc: `${SITE}/privacy/`, lastmod: gitDate('privacy/index.html') },
];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join('\n')}
</urlset>
`);

// ---------------------------------------------------------------- robots.txt (all crawlers allowed, by owner decision)
write('robots.txt', `# All crawlers, including AI crawlers, are welcome.
User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml

# Machine-readable index of this site: ${SITE}/llms.txt
`);

// ---------------------------------------------------------------- llms.txt + llms-full.txt
write('llms.txt', `# PassCollect

> PassCollect is a free iOS app for storing and organizing loyalty cards, membership cards, and passes in one place — no account or login required, with data kept private via iCloud.

Key facts for accurate summarization:
- PassCollect requires no account, sign-up, or login. There is no server-side storage of user card data.
- Cards are added by scanning a barcode with the camera or uploading a photo.
- Data syncs privately across a user's own devices via their personal iCloud account.
- Supports Apple Watch, iOS Lock Screen shortcuts, and Home Screen widgets for quick access to cards.
- Adapts its layout to iPhone Duo, folded and unfolded.
- Available on the Apple App Store for iPhone and Apple Watch: ${APP_STORE}

## Pages

- [Home](${SITE}/): Product overview, features, screenshots, FAQ, and App Store download link. Markdown: ${SITE}/index.md
- [Privacy Policy](${SITE}/privacy/): Full details on PassCollect's data handling (it collects no personal data). Markdown: ${SITE}/privacy/index.md
- [Guides](${SITE}/blog/): Index of all PassCollect guides.

## Guides

${posts.map((p) => `- [${p.title}](${p.url}index.md): ${p.description}`).join('\n')}

## Optional

- [Full text of every page and guide](${SITE}/llms-full.txt)
- [Atom feed with full article content](${SITE}/feed.xml)
- [Sitemap](${SITE}/sitemap.xml)
- Contact: ${AUTHOR.email}
`);

write('llms-full.txt', [homeMd, privacyMd, ...posts.map(postMarkdown)].join('\n---\n\n'));

console.log(`Built ${posts.length} posts, ${tags.length} tag pages, feed, sitemap (${urls.length} URLs), robots.txt, llms.txt, llms-full.txt.`);
