import unittest
from unittest.mock import MagicMock, AsyncMock, patch
import json
import os
import sys
import jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

os.environ["JWT_SECRET"] = "test-jwt-secret-at-least-32-chars-long"
os.environ["LIVEKIT_API_KEY"] = "test-livekit-key"
os.environ["LIVEKIT_API_SECRET"] = "test-livekit-secret-32-chars-long"
os.environ["INTERNAL_API_TOKEN"] = "test-internal-token-32-chars-long"
os.environ["APP_DATABASE_URL"] = "postgresql://user:pass@localhost:5432/nexus"
os.environ["TELEMETRY_DATABASE_URL"] = "postgresql://user:pass@localhost:5432/nexus"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.main import app
from app.utils.auth import verify_token
import app.routers.analytics as analytics_module

class MockAsyncContextManager:
    def __init__(self, conn):
        self.conn = conn
    async def __aenter__(self):
        return self.conn
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

class MockPool:
    def __init__(self, conn):
        self.conn = conn
    def acquire(self):
        return MockAsyncContextManager(self.conn)

class TestP0Authorization(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.client = TestClient(app, raise_server_exceptions=False)
        self.jwt_secret = os.environ["JWT_SECRET"]
        self.internal_token = os.environ["INTERNAL_API_TOKEN"]

    def create_token(self, user_id: str, typ: str = "access") -> str:
        return jwt.encode(
            {"userId": user_id, "typ": typ},
            self.jwt_secret,
            algorithm="HS256"
        )

    def test_refresh_type_token_rejected_by_auth_py(self):
        """3. Refresh-type token rejected by auth.py with 401."""
        refresh_token = self.create_token("user-1", typ="refresh")
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=refresh_token)

        with self.assertRaises(HTTPException) as ctx:
            verify_token(creds)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertIn("access token required", ctx.exception.detail)

        # Also verify via HTTP request
        resp = self.client.get(
            "/api/analytics/meeting/m-1",
            headers={"Authorization": f"Bearer {refresh_token}"}
        )
        self.assertEqual(resp.status_code, 401)
        self.assertIn("access token required", resp.json().get("detail", ""))

    def test_ai_summarize_rejects_missing_or_wrong_internal_token(self):
        """2. /api/ai/summarize rejects missing or wrong X-Internal-Token with 401."""
        # Missing header -> 401
        resp_missing = self.client.post("/api/ai/summarize/meeting-123")
        self.assertEqual(resp_missing.status_code, 401)
        self.assertIn("invalid or missing internal token", resp_missing.json().get("detail", ""))

        # Wrong header -> 401
        resp_wrong = self.client.post(
            "/api/ai/summarize/meeting-123",
            headers={"X-Internal-Token": "wrong-secret-token"}
        )
        self.assertEqual(resp_wrong.status_code, 401)
        self.assertIn("invalid or missing internal token", resp_wrong.json().get("detail", ""))

        # Correct header -> 200
        with patch("app.routers.ai.generate_summary_task", new_callable=AsyncMock):
            resp_correct = self.client.post(
                "/api/ai/summarize/meeting-123",
                headers={"X-Internal-Token": self.internal_token}
            )
            self.assertEqual(resp_correct.status_code, 200)
            self.assertEqual(resp_correct.json().get("meeting_id"), "meeting-123")

    async def test_analytics_authorization_member_non_member_and_host(self):
        """1. Non-member 403, member 200, non-host gets no per-participant data on analytics."""
        meeting_id = "test-meeting-uuid"
        host_id = "host-user-1"
        member_id = "member-user-2"
        stranger_id = "stranger-user-3"

        host_token = self.create_token(host_id, "access")
        member_token = self.create_token(member_id, "access")
        stranger_token = self.create_token(stranger_id, "access")

        mock_app_conn = AsyncMock()
        mock_app_pool = MockPool(mock_app_conn)

        mock_ts_conn = AsyncMock()
        mock_ts_pool = MockPool(mock_ts_conn)

        # Meeting record in app DB
        async def mock_fetchrow(query, *args):
            if 'FROM "Meeting"' in query:
                return {"id": meeting_id, "roomCode": "ROOMTEST", "hostId": host_id}
            if 'FROM "Participant"' in query:
                uid = args[1]
                if uid == member_id:
                    return {"id": "part-uuid-2"}
                return None
            return None

        mock_app_conn.fetchrow.side_effect = mock_fetchrow

        # TimescaleDB metrics
        mock_ts_conn.fetch.side_effect = [
            [{"bucket": "2026-11-22T10:00:00Z", "avg_score": 85.0}], # timeline
            [{"segment": "2026-11-22T10:00:00Z", "avg_score": 70.0}], # low_segments
            [{"participant_id": "member-user-2", "avg_score": 85.0}], # per-participant (host only)
        ]

        with patch("app.routers.analytics.get_app_pool", return_value=mock_app_pool), \
             patch("app.routers.analytics.get_pool", return_value=mock_ts_pool):

            # Non-member gets 403
            resp_stranger = self.client.get(
                f"/api/analytics/meeting/{meeting_id}",
                headers={"Authorization": f"Bearer {stranger_token}"}
            )
            self.assertEqual(resp_stranger.status_code, 403)
            self.assertIn("Not authorized", resp_stranger.json().get("detail", ""))

            # Member gets 200, but NO per-participant data
            mock_ts_conn.fetch.side_effect = [
                [{"bucket": "2026-11-22T10:00:00Z", "avg_score": 85.0}],
                [{"segment": "2026-11-22T10:00:00Z", "avg_score": 70.0}],
            ]
            resp_member = self.client.get(
                f"/api/analytics/meeting/{meeting_id}",
                headers={"Authorization": f"Bearer {member_token}"}
            )
            self.assertEqual(resp_member.status_code, 200)
            data_member = resp_member.json()
            self.assertIn("timeline", data_member)
            self.assertIn("low_engagement_segments", data_member)
            self.assertNotIn("participants", data_member)

            # Host gets 200 WITH per-participant data
            mock_ts_conn.fetch.side_effect = [
                [{"bucket": "2026-11-22T10:00:00Z", "avg_score": 85.0}],
                [{"segment": "2026-11-22T10:00:00Z", "avg_score": 70.0}],
                [{"participant_id": "member-user-2", "avg_score": 85.0}],
            ]
            resp_host = self.client.get(
                f"/api/analytics/meeting/{meeting_id}",
                headers={"Authorization": f"Bearer {host_token}"}
            )
            self.assertEqual(resp_host.status_code, 200)
            data_host = resp_host.json()
            self.assertIn("timeline", data_host)
            self.assertIn("participants", data_host)
            self.assertEqual(len(data_host["participants"]), 1)
            self.assertEqual(data_host["participants"][0]["participant_id"], "member-user-2")

if __name__ == "__main__":
    unittest.main()
