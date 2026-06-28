VERSION := $(shell node -p "require('./package.json').version")
COMMIT := $(shell git rev-parse --short HEAD)
BUILD_TIME := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
DIRTY := $(shell test -n "$$(git status --porcelain 2>/dev/null)" && echo true || echo false)

LDFLAGS := -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.buildTime=$(BUILD_TIME)
BUILD_INFO_TS := extension/src/generated/buildInfo.ts

.PHONY: gen-build-info build-go build-all build-extension build package publish build-webview webview-dev webview-check fmt fmt-go fmt-ts fmt-check lint lint-go lint-ts lint-fix test test-go test-ts clean-webview release demo test-e2e-repo test-e2e test-e2e-headed test-report

## Build webview (production, minified)
build-webview: clean-webview
	npm run build

## Watch mode for development
webview-dev:
	npm run dev

## Type-check Svelte components without emitting
webview-check:
	npx svelte-check --tsconfig ./tsconfig.json

build-go:
	go build -o bin/hydragit-server ./cmd/hydragit

build-all:
	GOOS=darwin  GOARCH=amd64 go build -ldflags '$(LDFLAGS)' -o bin/hydragit-server-darwin-x64    ./cmd/hydragit
	GOOS=darwin  GOARCH=arm64 go build -ldflags '$(LDFLAGS)' -o bin/hydragit-server-darwin-arm64  ./cmd/hydragit
	GOOS=linux   GOARCH=amd64 go build -ldflags '$(LDFLAGS)' -o bin/hydragit-server-linux-x64     ./cmd/hydragit
	GOOS=linux   GOARCH=arm64 go build -ldflags '$(LDFLAGS)' -o bin/hydragit-server-linux-arm64   ./cmd/hydragit
	GOOS=windows GOARCH=amd64 go build -ldflags '$(LDFLAGS)' -o bin/hydragit-server-win32-x64.exe ./cmd/hydragit

build-extension: gen-build-info
	cd extension && npm run compile

build: build-all build-extension build-webview

package: build
	rm -f *.vsix
	vsce package

publish: build
	vsce publish

install-local: lint test package
	code --install-extension hydragit-*.vsix --force

## Release: snapshot develop's tree onto master as one commit + tag vX.Y.Z (see docs/GITFLOW.md)
release:
	bash scripts/release.sh

gen-build-info:
	mkdir -p extension/src/generated
	printf '%s\n' \
	'export const buildInfo = {' \
	'  version: "$(VERSION)",' \
	'  commit: "$(COMMIT)",' \
	'  buildTime: "$(BUILD_TIME)",' \
	'  dirty: $(DIRTY),' \
	'} as const;' \
	> $(BUILD_INFO_TS)

## Run all tests (Go + TS)
test: test-go test-ts

## Run Go tests
test-go:
	gotestsum --format testname -- -v $(shell go list ./... | grep -v 'hydragit/cmd/hydragit' | grep -v 'node_modules')

## Run TS/Svelte tests
test-ts:
	npm run test

# Format everything
fmt: fmt-go fmt-ts

# Format Go files
fmt-go:
	gofmt -w .

# Format TS/Svelte files
fmt-ts:
	npx prettier --write .

# Check formatting without writing (useful for CI)
fmt-check:
	gofmt -l . | grep . && exit 1 || true
	npx prettier --check .

## Lint everything (Go + TS/Svelte). Read-only; fails on findings.
lint: lint-go lint-ts

## Lint Go (golangci-lint — config in .golangci.yml)
lint-go:
	golangci-lint run

## Lint TS/Svelte (ESLint flat config — eslint.config.mjs)
lint-ts:
	npm run lint

## Autofix what the linters can fix automatically
lint-fix:
	golangci-lint run --fix
	npm run lint:fix

clean-webview:
	rm -f webview/*.js webview/*.css

## E2E: create fresh test git repo in /tmp
test-e2e-repo:
	bash tests/fixtures/create-test-repo.sh /tmp/hydragit-test-repo

## E2E: run Playwright tests headless (5 workers)
test-e2e: test-e2e-repo
	npx playwright test

## E2E: run Playwright tests headed (1 worker)
test-e2e-headed: test-e2e-repo
	HEADED=1 npx playwright test --headed

## E2E: open last test report in browser
test-report:
	npx playwright show-report

## DEMO: drive the panel through the README GIF flow, headed + maximized, for
## screen recording. Assumes you've already built (run `make build` once first).
## The vscode-demo project auto-builds a curated, good-looking repo (clean merges
## + one unmerged branch to rebase). HEADED=1 maximizes the window; HYDRAGIT_DEMO=1
## un-skips the spec. Slow it down with: SPEED=1 make demo  (default SPEED=0.5)
demo:
	HYDRAGIT_DEMO=1 HEADED=1 npx playwright test demo-showcase --project=vscode-demo --headed

