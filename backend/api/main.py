from __future__ import annotations

from fastapi import FastAPI, Query
from pydantic import BaseModel

from backend.services.job_store import JobPostingStore


class JobPostingResponse(BaseModel):
    id: int
    company: str
    title: str
    url: str
    source: str
    location: str
    first_seen: str
    last_seen: str


app = FastAPI()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/jobs/recent", response_model=list[JobPostingResponse])
def jobs_recent(
    limit: int = Query(default=50, ge=1, le=500)
) -> list[JobPostingResponse]:
    store = JobPostingStore()
    try:
        rows = store.get_recent_postings(limit=limit)
        return [JobPostingResponse(**row) for row in rows]
    finally:
        store.close()
