.PHONY: install build test coverage fmt check local
install:
	npm ci --ignore-scripts
	npm ci --prefix contracts --ignore-scripts
build:
	cd contracts && forge build
test:
	cd contracts && forge test
coverage:
	cd contracts && forge coverage
fmt:
	cd contracts && forge fmt --check
check: build test fmt
	npm run typecheck
	npm run test:backend
	npm run build:web
	npm audit --audit-level=high
	npm audit --prefix contracts --audit-level=high
local:
	./scripts/start-local.sh
