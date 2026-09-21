from typing import Dict, Set
from fastapi import WebSocket


class DiscussionConnectionManager:
    def __init__(self):
        # Maps discussion_id -> Set[WebSocket]
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, discussion_id: int, websocket: WebSocket):
        await websocket.accept()
        if discussion_id not in self.active_connections:
            self.active_connections[discussion_id] = set()
        self.active_connections[discussion_id].add(websocket)

    def disconnect(self, discussion_id: int, websocket: WebSocket):
        if discussion_id in self.active_connections:
            self.active_connections[discussion_id].discard(websocket)
            if not self.active_connections[discussion_id]:
                del self.active_connections[discussion_id]

    async def broadcast(self, discussion_id: int, message: dict):
        if discussion_id not in self.active_connections:
            return

        dead_sockets = set()
        for connection in list(self.active_connections[discussion_id]):
            try:
                await connection.send_json(message)
            except Exception:
                dead_sockets.add(connection)

        for dead in dead_sockets:
            self.disconnect(discussion_id, dead)


manager = DiscussionConnectionManager()
