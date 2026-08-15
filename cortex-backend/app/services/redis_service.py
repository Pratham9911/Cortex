import json

from app.core.redis import redis_client


class RedisService:

    @staticmethod
    def get(key: str):
        return redis_client.get(key)

    @staticmethod
    def set(key: str, value, ttl: int | None = None):
        if ttl:
            redis_client.setex(key, ttl, value)
        else:
            redis_client.set(key, value)

    @staticmethod
    def delete(key: str):
        redis_client.delete(key)

    @staticmethod
    def exists(key: str):
        return redis_client.exists(key) == 1

    @staticmethod
    def get_json(key: str):
        value = redis_client.get(key)

        if value is None:
            return None

        return json.loads(value)

    @staticmethod
    def set_json(key: str, value, ttl: int | None = None):
        serialized = json.dumps(
                         value,
                         default=str
                     )

        if ttl:
            redis_client.setex(key, ttl, serialized)
        else:
            redis_client.set(key, serialized)