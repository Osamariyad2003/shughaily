"""Database service wrapping psycopg2 connections."""

import psycopg2
import psycopg2.extras
from config import Config


class DatabaseService:
    """Thin wrapper around psycopg2 for the Shughaily database."""

    def __init__(self, dsn: str | None = None):
        self._dsn = dsn or Config.DATABASE_URL

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    def get_connection(self):
        """Return a new psycopg2 connection (caller must close it)."""
        return psycopg2.connect(self._dsn)

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------

    def execute_query(self, query: str, params: tuple | None = None) -> None:
        """Execute a write query (INSERT / UPDATE / DELETE)."""
        conn = self.get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(query, params)
            conn.commit()
        finally:
            conn.close()

    def fetch_one(self, query: str, params: tuple | None = None) -> dict | None:
        """Return a single row as a dict, or None."""
        conn = self.get_connection()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query, params)
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            conn.close()

    def fetch_all(self, query: str, params: tuple | None = None) -> list[dict]:
        """Return all matching rows as a list of dicts."""
        conn = self.get_connection()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(query, params)
                return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()
