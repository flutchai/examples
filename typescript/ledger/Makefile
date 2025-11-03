.PHONY: help start stop restart logs test test-callbacks clean build dev setup

# Default target
help:
	@echo "Ledger Graph Service - Test Environment"
	@echo ""
	@echo "Available commands:"
	@echo "  make setup          - Install dependencies and prepare environment"
	@echo "  make start          - Start all services (Redis, MongoDB, Ledger)"
	@echo "  make stop           - Stop all services"
	@echo "  make restart        - Restart all services"
	@echo "  make logs           - Show service logs"
	@echo "  make test           - Run basic tests"
	@echo "  make test-callbacks - Test callback system"
	@echo "  make clean          - Remove containers and volumes"
	@echo "  make build          - Build the ledger service"
	@echo "  make dev            - Start in development mode"

# Setup environment
setup:
	@echo "Setting up test environment..."
	@cp .env.test .env 2>/dev/null || true
	@yarn install
	@mkdir -p scripts
	@echo "Setup complete!"

# Start services
start:
	@echo "Starting services..."
	@docker-compose up -d redis mongodb
	@echo "Waiting for services to be healthy..."
	@sleep 5
	@echo "Starting ledger service..."
	@yarn dev &
	@echo "All services started!"

# Start with docker-compose
start-docker:
	@echo "Starting all services with docker-compose..."
	@docker-compose up -d
	@echo "Services started! Check logs with 'make logs'"

# Stop services
stop:
	@echo "Stopping services..."
	@docker-compose down
	@pkill -f "yarn dev" 2>/dev/null || true
	@echo "Services stopped!"

# Restart services
restart: stop start

# View logs
logs:
	@docker-compose logs -f

# View specific service logs
logs-redis:
	@docker-compose logs -f redis

logs-mongo:
	@docker-compose logs -f mongodb

logs-ledger:
	@docker-compose logs -f ledger-service

# Run basic tests
test:
	@echo "Running basic tests..."
	@./scripts/test-basic.sh

# Test callback system
test-callbacks:
	@echo "Testing callback system..."
	@./scripts/test-callbacks.sh

# Clean everything
clean:
	@echo "Cleaning up..."
	@docker-compose down -v
	@rm -rf dist/
	@echo "Cleanup complete!"

# Build service
build:
	@echo "Building ledger service..."
	@yarn build
	@echo "Build complete!"

# Development mode
dev:
	@echo "Starting in development mode..."
	@docker-compose up -d redis mongodb
	@sleep 3
	@yarn dev

# Check service health
health:
	@echo "Checking service health..."
	@curl -s http://localhost:3003/health | jq '.' || echo "Service not responding"

# Test ledger processing
test-ledger:
	@echo "Testing ledger processing..."
	@curl -X POST http://localhost:3003/process-ledger \
		-H "Content-Type: application/json" \
		-d '{ \
			"threadId": "test-$$(date +%s)", \
			"userId": "user-123", \
			"agentId": "agent-456", \
			"ledgerData": { \
				"userId": "user-123", \
				"amount": 150.75, \
				"description": "Test transaction" \
			} \
		}' | jq '.'

# Test callback creation and execution
test-callback-flow:
	@echo "Testing complete callback flow..."
	@./scripts/test-callback-flow.sh

# Monitor Redis
monitor-redis:
	@docker exec -it ledger-redis redis-cli MONITOR

# Connect to MongoDB
mongo-shell:
	@docker exec -it ledger-mongodb mongosh -u admin -p password --authenticationDatabase admin ledger-test

# Connect to Redis CLI
redis-cli:
	@docker exec -it ledger-redis redis-cli