# EatEasy Food Order System

EatEasy is a Thai food ordering system built for a single restaurant workflow. It has three main parts:

- `frontend/`: Next.js UI for order taking, dashboard, kitchen display, and login
- `backend/`: FastAPI API for authentication, menu management, analytics, and order processing
- `printapp/`: local desktop printer app for in-store printing

The current deployment model is:

- `frontend` as a static site on Azure Static Web Apps
- `backend` as a Docker image on Azure App Service
- `printapp` running locally inside the restaurant network

## Architecture

```text
Browser / Tablet
  -> Frontend (Next.js static export)
  -> Backend API (FastAPI)
  -> SQLite database

Restaurant Printer
  -> PrintApp desktop app
  -> Polls backend and prints locally
```

## Main Features

- Thai voice ordering with browser speech recognition
- Menu matching with keyword scoring and optional LLM verification
- Protected dashboard for menu management, order history, and analytics
- Protected kitchen screen for pending orders
- Static frontend + containerized backend deployment model

## Repository Structure

```text
EatEasyFoodOrder/
├── backend/
│   ├── main.py
│   ├── Dockerfile
│   ├── requirements.txt
│   └── test_cases.py
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── auth.ts
│   │   └── config.ts
│   ├── next.config.ts
│   └── package.json
├── printapp/
│   ├── app.py
│   ├── printer_core.py
│   ├── config_manager.py
│   └── README.md
├── easy_setup.sh
├── easy_run.sh
└── README.md
```

## Requirements

- Node.js 20+
- npm 10+
- Python 3.11+
- Docker Desktop or Docker Engine
- HTTPS or `localhost` for microphone usage in the browser

## Local Development

### Option 1: use the helper scripts

Setup:

```bash
./easy_setup.sh
```

Run frontend and backend together:

```bash
./easy_run.sh
```

This starts:

- backend on `http://127.0.0.1:8000`
- frontend on `https://localhost:3000`

### Option 2: run backend and frontend manually

Backend:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev:https
```

Open:

- `https://localhost:3000`
- `http://127.0.0.1:8000/docs`

## Environment Variables

### Backend

These are the main backend variables used in local and cloud environments.

| Variable | Required | Example | Notes |
|---|---|---|---|
| `DATABASE_PATH` | Yes | `orders.sqlite` or `/home/data/orders.sqlite` | SQLite file path |
| `ADMIN_USERNAME` | Yes | `admin` | single admin login |
| `ADMIN_PASSWORD` | Yes | `change-me` | single admin login |
| `JWT_SECRET` | Yes | `replace-with-random-secret` | JWT signing secret |
| `ALLOWED_ORIGINS` | Yes | `https://your-app.azurestaticapps.net` | comma-separated CORS origins |
| `PRINTER_ENABLED` | No | `false` | keep `false` when using `printapp/` |
| `WEBSITES_PORT` | Azure only | `8000` | required for App Service custom container |
| `WEBSITES_ENABLE_APP_SERVICE_STORAGE` | Azure only | `true` | enables persistent `/home` storage |

Example local backend `.env`:

```env
DATABASE_PATH=orders.sqlite
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
JWT_SECRET=dev-secret
ALLOWED_ORIGINS=http://localhost:3000,https://localhost:3000
PRINTER_ENABLED=false
```

### Frontend

| Variable | Required | Example | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Production build | `https://your-backend.azurewebsites.net` | backend base URL |

In local development the frontend can still use Next.js rewrites to proxy `/api/*` to the local backend.

## Docker: Build and Test the Backend

The backend Dockerfile lives in `backend/Dockerfile`.

### Build for local testing

```bash
docker build -t eateasy-backend:latest ./backend
```

### Run locally with Docker

```bash
docker run --rm -p 8000:8000 \
  -e DATABASE_PATH=/tmp/orders.sqlite \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=admin123 \
  -e JWT_SECRET=dev-secret \
  -e ALLOWED_ORIGINS=http://localhost:3000,https://localhost:3000 \
  -e PRINTER_ENABLED=false \
  eateasy-backend:latest
```

Health check:

```bash
curl http://127.0.0.1:8000
```

Login:

```bash
curl -X POST http://127.0.0.1:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

## Docker: Tag and Push to Docker Hub

If you already built a local image:

```bash
docker tag eateasy-backend:latest your-dockerhub-user/eateasy-backend:latest
docker login
docker push your-dockerhub-user/eateasy-backend:latest
```

Or build directly with the final tag:

```bash
docker build -t your-dockerhub-user/eateasy-backend:latest ./backend
docker login
docker push your-dockerhub-user/eateasy-backend:latest
```

## Docker: Build `linux/amd64` for Azure App Service

Azure App Service Linux custom containers should use `linux/amd64`.

Create and use a buildx builder:

```bash
docker buildx create --use --name amd64-builder 2>/dev/null || docker buildx use amd64-builder
docker buildx inspect --bootstrap
```

Build and push:

```bash
docker buildx build \
  --platform linux/amd64 \
  -t your-dockerhub-user/eateasy-backend:latest \
  --push \
  ./backend
```

Build with multiple tags:

```bash
docker buildx build \
  --platform linux/amd64 \
  -t your-dockerhub-user/eateasy-backend:latest \
  -t your-dockerhub-user/eateasy-backend:v1 \
  --push \
  ./backend
```

Check platforms:

```bash
docker buildx imagetools inspect your-dockerhub-user/eateasy-backend:latest
```

## Azure Deployment

### Backend on Azure App Service

Use Azure App Service for Linux with a custom container.

App Service container image:

```text
your-dockerhub-user/eateasy-backend:latest
```

If the Docker Hub repository is private, add the registry credentials in App Service as well.

Minimum app settings:

```text
WEBSITES_PORT=8000
WEBSITES_ENABLE_APP_SERVICE_STORAGE=true
DATABASE_PATH=/home/data/orders.sqlite
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
JWT_SECRET=...
ALLOWED_ORIGINS=https://your-app.azurestaticapps.net
PRINTER_ENABLED=false
```

Important notes:

- if you use SQLite, keep the backend at a single instance
- store the SQLite file under `/home/...` or a mounted Azure Files path
- do not store SQLite in `/app/...` because container-layer data is not reliable across redeploys

### Backend persistence options

Simple option:

```text
WEBSITES_ENABLE_APP_SERVICE_STORAGE=true
DATABASE_PATH=/home/data/orders.sqlite
```

Alternative option with Azure Files mount:

```text
DATABASE_PATH=/mounts/data/orders.sqlite
```

### Frontend on Azure Static Web Apps

The frontend is configured for static export.

Build output:

```text
frontend/out
```

Production build command:

```bash
cd frontend
NEXT_PUBLIC_API_URL=https://your-backend.azurewebsites.net npm run build
```

If you deploy manually, upload the `frontend/out` directory.

If you use Azure Static Web Apps from the portal, configure the app location as `frontend` and the output location as `out`.

If you use Azure Static Web Apps with GitHub integration, make sure the build gets:

```text
NEXT_PUBLIC_API_URL=https://your-backend.azurewebsites.net
```

After the Static Web App is created, add its domain to backend CORS:

```text
ALLOWED_ORIGINS=https://your-app.azurestaticapps.net
```

### PrintApp Deployment

`printapp/` is intended to run on a local machine inside the restaurant.

Recommended setup:

- deploy backend to Azure
- keep `PRINTER_ENABLED=false` on the backend
- run the printer app locally so it can reach the network printer or local print queue

## Authentication Model

This project currently uses a single-admin model:

- credentials come from backend environment variables
- protected views: `/`, `/dashboard`, `/kitchen`
- frontend stores JWT in local storage
- backend enforces bearer token auth on protected endpoints

## Notes About SQLite

SQLite is fine for this project if:

- you run a single backend instance
- write volume stays relatively low
- the database file is kept in persistent storage

If you later need multi-instance scaling or heavier concurrent writes, move to a server database.

## Useful Commands

Frontend build:

```bash
cd frontend
npm run build
```

Backend syntax check:

```bash
cd backend
python -m py_compile main.py
```

Backend test script:

```bash
cd backend
python test_cases.py
```

List Docker images:

```bash
docker images
```

Stop a running container:

```bash
docker ps
docker stop <container_name>
```

Remove a container:

```bash
docker rm -f <container_name>
```

## Related Documents

- `TECHSTACK.md`: extra architecture and implementation notes
- `INSTALL_MANUAL_TH.md`: Thai installation notes
- `printapp/README.md`: printer app usage

## License

MIT
