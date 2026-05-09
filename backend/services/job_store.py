from __future__ import annotations

import hashlib
import os
import re
from datetime import UTC, datetime

import psycopg2
import psycopg2.extras
from psycopg2 import pool

from backend.models import JobPosting


class JobPostingStore:
    _connection_pool: pool.SimpleConnectionPool | None = None

    def __init__(self, database_url: str | None = None) -> None:
        if database_url is None:
            database_url = os.getenv("DATABASE_SESSION_POOLER_URL") or os.getenv(
                "DATABASE_URL"
            )
            if not database_url:
                raise ValueError(
                    "DATABASE_SESSION_POOLER_URL or DATABASE_URL not set in environment or passed as argument"
                )
        self.database_url = database_url
        # create pool if needed
        self.__class__._ensure_pool(self.database_url)
        self._create_schema()

    @classmethod
    def _ensure_pool(cls, database_url: str) -> None:
        if cls._connection_pool is None:
            cls._connection_pool = pool.SimpleConnectionPool(1, 20, database_url)

    @classmethod
    def _get_conn(cls):
        if cls._connection_pool is None:
            raise RuntimeError("Connection pool has not been initialized")
        return cls._connection_pool.getconn()

    @classmethod
    def _put_conn(cls, conn) -> None:
        if cls._connection_pool is None:
            return
        cls._connection_pool.putconn(conn)

    def _create_schema(self) -> None:
        conn = self.__class__._get_conn()
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS job_postings (
                        id SERIAL PRIMARY KEY,
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

                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_job_postings_last_seen
                    ON job_postings(last_seen DESC)
                """)
                conn.commit()
        finally:
            self.__class__._put_conn(conn)

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
        conn = self.__class__._get_conn()
        try:
            with conn.cursor() as cursor:
                for posting in postings:
                    entry_hash = self.build_entry_hash(
                        company=posting.company,
                        title=posting.title,
                        url=posting.url,
                    )

                    cursor.execute(
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
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT(entry_hash) DO UPDATE SET
                            source = EXCLUDED.source,
                            location = EXCLUDED.location,
                            last_seen = EXCLUDED.last_seen
                        """,
                        (
                            entry_hash,
                            posting.company,
                            posting.company_url,
                            posting.title,
                            posting.url,
                            posting.source,
                            posting.location,
                            now,
                            now,
                        ),
                    )
                conn.commit()
        finally:
            self.__class__._put_conn(conn)

    def get_recent_postings(
        self,
        limit: int = 50,
        title_query: str | None = None,
    ) -> list[dict[str, str | int]]:
        capped_limit = max(1, min(limit, 500))
        normalized_query = (title_query or "").strip()
        query_tokens = self._tokenize_query(normalized_query)

        conn = self.__class__._get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                if query_tokens:
                    where_clause = " AND ".join(
                        ["LOWER(title) LIKE %s" for _ in query_tokens]
                    )
                    query_params = tuple(f"%{token}%" for token in query_tokens)
                    cursor.execute(
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
                        LIMIT %s
                        """,
                        query_params + (capped_limit,),
                    )
                else:
                    cursor.execute(
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
                        LIMIT %s
                        """,
                        (capped_limit,),
                    )
                return [dict(row) for row in cursor.fetchall()]
        finally:
            self.__class__._put_conn(conn)

    def get_last_updated_at(self) -> str | None:
        conn = self.__class__._get_conn()
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT MAX(last_seen) FROM job_postings")
                row = cursor.fetchone()
                if not row or row[0] is None:
                    return None
                return str(row[0])
        finally:
            self.__class__._put_conn(conn)

    def close(self) -> None:
        if self.__class__._connection_pool is not None:
            try:
                self.__class__._connection_pool.closeall()
            finally:
                self.__class__._connection_pool = None
