# Makefile for fis-app-backend

# ENV mode: dev or prod (default: dev)
ENV ?= dev
COMPOSE = docker-compose
PROJECT_NAME = fis-app
ENV_FILE = .env.$(ENV)

# GHCR Image settings
GHCR_REGISTRY=ghcr.io
GHCR_NAMESPACE=mg-teamsoft/fis-app-backend
GHCR_TAG=latest
GHCR_IMAGE=$(GHCR_REGISTRY)/$(GHCR_NAMESPACE):$(GHCR_TAG)

# Docker Compose commands
up:
	$(COMPOSE) --env-file $(ENV_FILE) -p $(PROJECT_NAME) up -d

down:
	$(COMPOSE) -p $(PROJECT_NAME) down

build:
	$(COMPOSE) --env-file $(ENV_FILE) -p $(PROJECT_NAME) build

logs:
	$(COMPOSE) -p $(PROJECT_NAME) logs -f

ps:
	$(COMPOSE) -p $(PROJECT_NAME) ps

restart:
	$(COMPOSE) -p $(PROJECT_NAME) restart

shell:
	$(COMPOSE) -p $(PROJECT_NAME) exec backend sh

mongo-shell:
	$(COMPOSE) -p $(PROJECT_NAME) exec mongo mongosh

prune:
	docker system prune -f

test:
	$(COMPOSE) -p $(PROJECT_NAME) exec backend npm test

help:
	@echo "Usage: make [target] ENV=dev|prod"
	@echo ""
	@echo "Available targets:"
	@echo "  up            - Start services in $(ENV) mode"
	@echo "  down          - Stop and remove services"
	@echo "  build         - Build containers"
	@echo "  logs          - Show logs"
	@echo "  ps            - Show container status"
	@echo "  restart       - Restart services"
	@echo "  shell         - Shell into backend container"
	@echo "  mongo-shell   - MongoDB shell"
	@echo "  test          - Run backend tests"
	@echo "  prune         - Prune unused Docker data"
	@echo "  help          - Show this help"

# Build Docker image for GHCR
ghcr-build:
	docker build -t $(GHCR_IMAGE) .

# Push Docker image to GHCR (manual)
ghcr-push: ghcr-build
	docker push $(GHCR_IMAGE)

# Login to GHCR using a Personal Access Token
ghcr-login:
	@echo "Logging in to GHCR..."
	@if [ -z "$$GHCR_PAT" ]; then \
		echo "❌ Please export GHCR_PAT=your_personal_access_token before running this"; \
		exit 1; \
	fi
	echo $$GHCR_PAT | docker login ghcr.io -u muratguven --password-stdin