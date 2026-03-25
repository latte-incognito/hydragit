.PHONY: build-go build-all build-ts build package publish

build-go:
	go build -o bin/hydragit-server ./cmd/hydragit

build-all:
	GOOS=darwin  GOARCH=amd64 go build -o bin/hydragit-server-darwin-x64    ./cmd/hydragit
	GOOS=darwin  GOARCH=arm64 go build -o bin/hydragit-server-darwin-arm64  ./cmd/hydragit
	GOOS=linux   GOARCH=amd64 go build -o bin/hydragit-server-linux-x64     ./cmd/hydragit
	GOOS=windows GOARCH=amd64 go build -o bin/hydragit-server-win32-x64.exe ./cmd/hydragit

build-ts:
	cd extension && npm run compile

build: build-all build-ts

package: build
	vsce package

publish: build
	vsce publish
