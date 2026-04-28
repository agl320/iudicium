from __future__ import annotations

from fastapi import FastAPI, Query
from pydantic import BaseModel

from backend.services.job_store import JobPostingStore
from fastapi.middleware.cors import CORSMiddleware


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/jobs/recent", response_model=list[JobPostingResponse])
def jobs_recent(
    limit: int = Query(default=50, ge=1, le=100),
    query: str = Query(default="", min_length=0, max_length=120),
) -> list[JobPostingResponse]:
    store = JobPostingStore()
    try:
        rows = store.get_recent_postings(limit=limit, title_query=query)
        return [JobPostingResponse(**row) for row in rows]
    finally:
        store.close()
