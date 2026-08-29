# Backend Setup

This document describes how to connect the Next.js dashboard to the YOLOv8 API server running on the remote GPU workstation.

## 1. Start the API Server in the Container
Run this command on your remote workstation to start the FastAPI server:

```bash
docker exec -it circuitdoctor-dev python /workspace/data/yolo/scripts/api_server.py
```
The server will start on port `8000`.

## 2. Port Forwarding
To allow your local Next.js dashboard to communicate with the remote API, set up an SSH tunnel from your local machine:

```bash
ssh -L 8000:localhost:8000 <user>@<workstation-ip>
```

## 3. Environment Variable
Ensure your local Next.js `dashboard/.env.local` contains the following:

```env
PYTHON_API_URL=http://localhost:8000
```
*(This is the default used if omitted.)*
