
import os
import sys
import subprocess
from contextlib import asynccontextmanager

from fastapi import FastAPI

worker = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global worker

    worker = subprocess.Popen([
        sys.executable,
        "workers/ingestion_worker.py",
    ])

    try:
        yield
    finally:
        if worker and worker.poll() is None:
            worker.terminate()
            try:
                worker.wait(timeout=10)
            except subprocess.TimeoutExpired:
                worker.kill()
                worker.wait()


app = FastAPI(lifespan=lifespan)


@app.get("/healthz")
def healthz():
    running = worker is not None and worker.poll() is None

    return {
        "status": "ok" if running else "worker_stopped",
        "worker_running": running,
    }
