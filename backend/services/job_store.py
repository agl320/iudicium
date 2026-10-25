from __future__ import annotations

import hashlib
import os
import re
from typing import Callable

import psycopg2
import psycopg2.extras
from psycopg2 import pool

from backend.models import JobPosting


class JobPostingStore:
    _connection_pool: pool.SimpleConnectionPool | None = None

    def __init__(self, database_url: str | None = None) -> None:
        if database_url is None:
            database_url = os.getenv("DATABASE_SESSION_POOLER_URL")
            if not database_url:
                raise ValueError(
                    "DATABASE_SESSION_POOLER_URL not set in environment or passed as argument"
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
                    CREATE INDEX IF NOT EXISTS idx_job_postings_first_seen
                    ON job_postings(first_seen DESC)
                """)

                # Track key from companies.toml (e.g. "tech_intern", "hr").
                # NULL = not classified yet, '' = matched no track.
                cursor.execute("""
                    ALTER TABLE job_postings
                    ADD COLUMN IF NOT EXISTS category TEXT
                """)
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_job_postings_category_first_seen
                    ON job_postings(category, first_seen DESC)
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

    @staticmethod
    def _unique_postings(postings: list[JobPosting]) -> list[JobPosting]:
        seen_hashes: set[str] = set()
        unique_postings: list[JobPosting] = []

        for posting in postings:
            entry_hash = JobPostingStore.build_entry_hash(
                company=posting.company,
                title=posting.title,
                url=posting.url,
            )
            if entry_hash in seen_hashes:
                continue

            seen_hashes.add(entry_hash)
            unique_postings.append(posting)

        return unique_postings

    def upsert_postings(self, postings: list[JobPosting]) -> list[JobPosting]:
        unique_postings = self._unique_postings(postings)
        if not unique_postings:
            return []

        rows = [
            (
                self.build_entry_hash(
                    company=posting.company,
                    title=posting.title,
                    url=posting.url,
                ),
                posting.company,
                posting.company_url,
                posting.title,
                posting.url,
                posting.source,
                posting.location,
                posting.category,
            )
            for posting in unique_postings
        ]

        conn = self.__class__._get_conn()
        try:
            with conn.cursor() as cursor:
                inserted_rows = psycopg2.extras.execute_values(
                    cursor,
                    """
                    WITH incoming (
                        entry_hash,
                        company,
                        company_url,
                        title,
                        url,
                        source,
                        location,
                        category
                    ) AS (
                        VALUES %s
                    ),
                    inserted AS (
                        INSERT INTO job_postings (
                            entry_hash,
                            company,
                            company_url,
                            title,
                            url,
                            source,
                            location,
                            category,
                            first_seen,
                            last_seen
                        )
                        SELECT
                            entry_hash,
                            company,
                            company_url,
                            title,
                            url,
                            source,
                            location,
                            category,
                            to_char(
                                timezone('UTC', CURRENT_TIMESTAMP),
                                'YYYY-MM-DD"T"HH24:MI:SS.MS"+00:00"'
                            ),
                            to_char(
                                timezone('UTC', CURRENT_TIMESTAMP),
                                'YYYY-MM-DD"T"HH24:MI:SS.MS"+00:00"'
                            )
                        FROM incoming
                        ON CONFLICT(entry_hash) DO NOTHING
                        RETURNING
                            entry_hash,
                            company,
                            company_url,
                            title,
                            url,
                            source,
                            location,
                            category,
                            first_seen,
                            last_seen
                    ),
                    refreshed AS (
                        UPDATE job_postings AS job
                        SET
                            company = incoming.company,
                            company_url = incoming.company_url,
                            title = incoming.title,
                            url = incoming.url,
                            source = incoming.source,
                            location = incoming.location,
                            category = incoming.category,
                            last_seen = to_char(
                                timezone('UTC', CURRENT_TIMESTAMP),
                                'YYYY-MM-DD"T"HH24:MI:SS.MS"+00:00"'
                            )
                        FROM incoming
                        WHERE job.entry_hash = incoming.entry_hash
                        RETURNING job.entry_hash
                    )
                    SELECT
                        entry_hash,
                        company,
                        company_url,
                        title,
                        url,
                        source,
                        location,
                        category,
                        first_seen,
                        last_seen
                    FROM inserted
                    ORDER BY first_seen DESC
                    """,
                    rows,
                    template="(%s, %s, %s, %s, %s, %s, %s, %s)",
                    page_size=len(rows),
                    fetch=True,
                )
                conn.commit()

                return [
                    JobPosting(
                        source=row[5],
                        title=row[3],
                        company=row[1],
                        company_url=row[2] or "",
                        location=row[6],
                        url=row[4],
                        category=row[7] or "",
                    )
                    for row in inserted_rows
                ]
        finally:
            self.__class__._put_conn(conn)

    def get_recent_postings(
        self,
        limit: int = 50,
        title_query: str | None = None,
        category: str | None = None,
    ) -> list[dict[str, str | int]]:
        capped_limit = max(1, min(limit, 500))
        normalized_query = (title_query or "").strip()
        query_tokens = self._tokenize_query(normalized_query)

        conditions = ["LOWER(title) LIKE %s" for _ in query_tokens]
        query_params: list[str | int] = [f"%{token}%" for token in query_tokens]
        if category:
            conditions.append("category = %s")
            query_params.append(category)
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        conn = self.__class__._get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
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
                        COALESCE(category, '') AS category,
                        first_seen,
                        last_seen
                    FROM job_postings
                    {where_clause}
                    ORDER BY first_seen DESC
                    LIMIT %s
                    """,
                    (*query_params, capped_limit),
                )
                return [dict(row) for row in cursor.fetchall()]
        finally:
            self.__class__._put_conn(conn)

    def backfill_categories(
        self, classify_title: Callable[[str], str], rules_fingerprint: str
    ) -> int:
        """Classifies unclassified rows, or every row when the track rules
        changed since the last run (so old categories don't go stale)."""
        conn = self.__class__._get_conn()
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS iudicium_meta (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )
                """)
                cursor.execute(
                    "SELECT value FROM iudicium_meta WHERE key = 'tracks_fingerprint'"
                )
                row = cursor.fetchone()
                rules_changed = row is None or row[0] != rules_fingerprint

                if rules_changed:
                    cursor.execute("SELECT id, title, category FROM job_postings")
                else:
                    cursor.execute(
                        "SELECT id, title, category FROM job_postings WHERE category IS NULL"
                    )
                updates = []
                for row_id, title, current in cursor.fetchall():
                    category = classify_title(title)
                    if category != current:
                        updates.append((category, row_id))
                if updates:
                    psycopg2.extras.execute_batch(
                        cursor,
                        "UPDATE job_postings SET category = %s WHERE id = %s",
                        updates,
                        page_size=500,
                    )
                cursor.execute(
                    """
                    INSERT INTO iudicium_meta (key, value)
                    VALUES ('tracks_fingerprint', %s)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                    """,
                    (rules_fingerprint,),
                )
                conn.commit()
                return len(updates)
        finally:
            self.__class__._put_conn(conn)

    def get_known_categories(self, company: str) -> set[str]:
        """Categories this company already has stored postings for."""
        conn = self.__class__._get_conn()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT DISTINCT category FROM job_postings
                    WHERE company = %s AND category IS NOT NULL AND category <> ''
                    """,
                    (company,),
                )
                return {row[0] for row in cursor.fetchall()}
        finally:
            self.__class__._put_conn(conn)

    def find_reposts(self, postings: list[JobPosting]) -> set[str]:
        """Entry hashes of postings whose company/title/location was already
        stored under a different hash (e.g. the job URL format changed)."""
        if not postings:
            return set()

        rows = [
            (
                self.build_entry_hash(
                    company=posting.company, title=posting.title, url=posting.url
                ),
                posting.company,
                posting.title.strip().lower(),
                posting.location,
            )
            for posting in postings
        ]
        conn = self.__class__._get_conn()
        try:
            with conn.cursor() as cursor:
                matches = psycopg2.extras.execute_values(
                    cursor,
                    """
                    SELECT DISTINCT incoming.entry_hash
                    FROM (VALUES %s) AS incoming (entry_hash, company, title, location)
                    JOIN job_postings AS job
                      ON job.company = incoming.company
                     AND LOWER(TRIM(job.title)) = incoming.title
                     AND job.location = incoming.location
                     AND job.entry_hash <> incoming.entry_hash
                    """,
                    rows,
                    page_size=len(rows),
                    fetch=True,
                )
                return {row[0] for row in matches}
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
