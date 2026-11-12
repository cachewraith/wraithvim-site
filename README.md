# wraithvim-site

The landing page for [WraithVim](https://github.com/cachewraith/wraithvim):
install instructions, a guided "first ten minutes", a searchable key reference
and live project stats.

Plain HTML, CSS and JavaScript. No framework, no build step, no tracking,
no external requests except the public GitHub API for stats.

```text
index.html             the page
assets/css/site.css    TokyoNight styles, laid out like a Neovim session
assets/js/site.js      gutter, statusline, Vim keys, demo player, stats, key search
assets/js/keys.js      GENERATED key reference (make keys)
assets/fonts/          JetBrains Mono (SIL OFL 1.1)
scripts/gen-keys.lua   builds keys.js from WraithVim's key registry
scripts/shoot.mjs      section screenshots + JS error report via Chrome DevTools
scripts/check-links.py fails on missing anchors or assets
```

## Develop

```bash
make serve        # http://localhost:8080 (fonts need http://, not file://)
make keys         # regenerate assets/js/keys.js from ../wraithvim
make check        # JS syntax + link/asset check
make shots        # desktop and phone screenshots in .shots/
```

`make keys` reads the sibling checkout `../wraithvim` (override with
`WRAITHVIM=/path`). Run it after changing keymaps in WraithVim so the site's
key table matches the release.

## Download counter

GitHub only counts downloads of files attached to a release, not `git clone`
or its automatic source zips. WraithVim's release workflow attaches
`wraithvim.tar.gz` to every release; the site adds up the download counts of
those archives across all releases through
`https://api.github.com/repos/cachewraith/wraithvim/releases` (unauthenticated,
cached in `localStorage` for 30 minutes to stay within the 60 requests/hour
limit). Stars and the latest version come from the same API. If GitHub is
unreachable the last cached values are shown.

## What's new (release notes)

The `changelog.md` section and the "what's new" badge in the hero show the
newest GitHub releases of WraithVim, rendered from their release notes
(`assets/js/markdown.js`, a small Markdown renderer that escapes all HTML and
only allows http(s) links; tests in `scripts/test-markdown.mjs`). Nothing on
the site needs editing for a release: publish a GitHub release with notes
written for users and it appears here (visitors' browsers refresh the cached
data within 30 minutes). Releases without a subtitle in their name use the
first heading of their notes as the title.

## The page speaks Vim

`j`/`k` scroll, `gg`/`G` jump to top/bottom, `/` searches the key table, `:`
opens a command line (`:install`, `:keys`, `:help`, a line number…), and
`Space` opens a which-key style menu. All of it is optional: every section is
reachable with normal links and the mouse, and animations stop for visitors
who prefer reduced motion.

## Deploy

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on
every push to `main` (enable Pages with "GitHub Actions" as the source).

## License

MIT (see LICENSE). JetBrains Mono is under the SIL Open Font License 1.1.
