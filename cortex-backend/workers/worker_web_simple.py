import os
import sys
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Response, status

ROOT_DIR = Path(__file__).resolve().parent.parent

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

worker: subprocess.Popen | None = None
worker_script_path = str(Path(__file__).resolve().parent / "ingestion_worker_simple.py")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global worker

    if worker is None or worker.poll() is not None:
        print(f"[worker_web_simple] Spawning lightweight worker: {worker_script_path}")
        worker = subprocess.Popen([
            sys.executable,
            worker_script_path,
        ])
        print(f"[worker_web_simple] Worker started with PID: {worker.pid}")

    try:
        yield
    finally:
        if worker and worker.poll() is None:
            print(f"[worker_web_simple] Terminating worker (PID: {worker.pid})...")
            worker.terminate()
            try:
                worker.wait(timeout=10)
                print("[worker_web_simple] Worker process terminated cleanly.")
            except subprocess.TimeoutExpired:
                print("[worker_web_simple] Worker did not stop in time; sending SIGKILL...")
                worker.kill()
                worker.wait()
                print("[worker_web_simple] Worker process killed.")


app = FastAPI(
    title="Cortex Lightweight Ingestion Worker Web",
    lifespan=lifespan
)


@app.get("/healthz")
def healthz(response: Response):
    """
    Health check endpoint for Render Web Service deployment.
    Reports the real-time execution status of the child worker process.
    """
    is_running = worker is not None and worker.poll() is None
    exit_code = worker.poll() if worker is not None else None

    if not is_running:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "unhealthy",
            "worker_running": False,
            "worker_pid": worker.pid if worker else None,
            "exit_code": exit_code,
            "detail": "Worker child process is stopped or has crashed.",
        }

    return {
        "status": "ok",
        "worker_running": True,
        "worker_pid": worker.pid,
        "worker_script": "ingestion_worker_simple.py",
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "workers.worker_web_simple:app",
        host="0.0.0.0",
        port=port,
        reload=False
    )
