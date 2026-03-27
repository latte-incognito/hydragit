VERSION := $(shell node -p "require('./package.json').version")
COMMIT := $(shell git rev-parse --short HEAD)
BUILD_TIME := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
DIRTY := $(shell test -n "$$(git status --porcelain 2>/dev/null)" && echo true || echo false)

LDFLAGS := -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.buildTime=$(BUILD_TIME)
BUILD_INFO_TS := extension/src/generated/buildInfo.ts

.PHONY: gen-build-info build-go build-all build-extension build package publish build-webview webview-dev webview-check

## Build webview (production, minified)
build-webview:
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
	GOOS=windows GOARCH=amd64 go build -ldflags '$(LDFLAGS)' -o bin/hydragit-server-win32-x64.exe ./cmd/hydragit

build-extension: gen-build-info
	cd extension && npm run compile

build: build-all build-extension build-webview

package: build
	rm -f *.vsix
	vsce package

publish: build
	vsce publish

install-local: package
	code --install-extension hydragit-*.vsix --force

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