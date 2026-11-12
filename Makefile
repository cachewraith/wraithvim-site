# WraithVim website — static files, no build step.

WRAITHVIM ?= ../wraithvim
PORT ?= 8080

.PHONY: keys serve shots check snapshot

## keys: regenerate assets/js/keys.js from the WraithVim key registry
keys:
	nvim --headless --clean -l scripts/gen-keys.lua $(WRAITHVIM)

## snapshot: save WraithVim release data like the deploy does (fallback data)
snapshot:
	@mkdir -p assets/data
	gh api repos/cachewraith/wraithvim > assets/data/repo.json
	gh api "repos/cachewraith/wraithvim/releases?per_page=100" > assets/data/releases.json

## serve: preview at http://localhost:$(PORT)
serve:
	python3 -m http.server $(PORT)

## shots: section screenshots (desktop + phone) into .shots/ via Chrome DevTools
shots:
	@python3 -m http.server 8099 >/dev/null 2>&1 & pid=$$!; sleep 1; \
	node scripts/shoot.mjs --url http://127.0.0.1:8099/ ; \
	node scripts/shoot.mjs --url http://127.0.0.1:8099/ --width 390 --height 844 ; \
	kill $$pid

## check: JS syntax, Markdown renderer tests, internal anchors and assets exist
check:
	node --check assets/js/site.js
	node --check assets/js/keys.js
	node --check assets/js/markdown.js
	node --test scripts/test-markdown.mjs
	@python3 scripts/check-links.py
