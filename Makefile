# Makefile for fis-app-backend

# ENV mode: dev or prod (default: dev)
ENV ?= dev
COMPOSE = docker-compose
PROJECT_NAME = fis-app
ENV_FILE = .env.$(ENV)

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