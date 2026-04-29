from __future__ import annotations

import hashlib
import re
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from backend.models import JobPosting


class JobPostingStore:
    def __init__(self, db_path: str | Path = "data/iudicium.db") -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.db_path)
        self._create_schema()

    def _create_schema(self) -> None:
        self.connection.execute("""
            CREATE TABLE IF NOT EXISTS job_postings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_hash TEXT NOT NULL UNIQUE,
                company TEXT NOT NULL,
                company_url TEXT,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                source TEXT NOT NULL,
                location TEXT NOT NULL,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL
            )
            """)

        # Add company_url column if it doesn't exist (for existing databases)
        cursor = self.connection.execute("PRAGMA table_info(job_postings)")
        columns = {row[1] for row in cursor.fetchall()}
        if "company_url" not in columns:
            self.connection.execute(
                "ALTER TABLE job_postings ADD COLUMN company_url TEXT"
            )

        self.connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_job_postings_last_seen
            ON job_postings(last_seen DESC)
            """)
        self.connection.commit()

    # Required since providers don't provide consistent ID
    @staticmethod
    def build_entry_hash(*, company: str, title: str, url: str) -> str:
        normalized = (
            f"{company.strip().lower()}|{title.strip().lower()}|{url.strip().lower()}"
        )
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    @staticmethod
    def _tokenize_query(query: str) -> list[str]:
        # Keep alphanumeric chunks so punctuation and extra spaces do not block matches.
        return [token for token in re.split(r"\W+", query.lower().strip()) if token]

    def upsert_postings(self, postings: list[JobPosting]) -> tuple[int, int]:
        now = datetime.now(UTC).isoformat()

        for posting in postings:
            entry_hash = self.build_entry_hash(
                company=posting.company,
                title=posting.title,
                url=posting.url,
            )

            params = {
                "entry_hash": entry_hash,
                "company": posting.company,
                "company_url": posting.company_url,
                "title": posting.title,
                "url": posting.url,
                "source": posting.source,
                "location": posting.location,
                "first_seen": now,
                "last_seen": now,
            }

            self.connection.execute(
                """
            INSERT INTO job_postings (
                entry_hash,
                company,
                company_url,
                title,
                url,
                source,
                location,
                first_seen,
                last_seen
            )
            VALUES (
                :entry_hash,
                :company,
                :company_url,
                :title,
                :url,
                :source,
                :location,
                :first_seen,
                :last_seen
            )
            ON CONFLICT(entry_hash) DO UPDATE SET
                source = excluded.source,
                location = excluded.location,
                last_seen = excluded.last_seen
            """,
                params,
            )

        self.connection.commit()

    def get_recent_postings(
        self,
        limit: int = 50,
        title_query: str | None = None,
    ) -> list[dict[str, str | int]]:
        capped_limit = max(1, min(limit, 500))
        normalized_query = (title_query or "").strip()
        query_tokens = self._tokenize_query(normalized_query)

        if query_tokens:
            where_clause = " AND ".join(["LOWER(title) LIKE ?" for _ in query_tokens])
            query_params: tuple[str | int, ...] = tuple(
                f"%{token}%" for token in query_tokens
            ) + (capped_limit,)
            cursor = self.connection.execute(
                f"""
                SELECT
                    id,
                    company,
                    company_url,
                    title,
                    url,
                    source,
                    location,
                    first_seen,
                    last_seen
                FROM job_postings
                WHERE {where_clause}
                ORDER BY last_seen DESC
                LIMIT ?
                """,
                query_params,
            )
        else:
            cursor = self.connection.execute(
                """
                SELECT
                    id,
                    company,
                    company_url,
                    title,
                    url,
                    source,
                    location,
                    first_seen,
                    last_seen
                FROM job_postings
                ORDER BY last_seen DESC
                LIMIT ?
                """,
                (capped_limit,),
            )

        columns = [description[0] for description in cursor.description or ()]
        rows = cursor.fetchall()
        return [dict(zip(columns, row, strict=False)) for row in rows]

    def close(self) -> None:
        self.connection.close()
