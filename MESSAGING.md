# Redis Messaging в Supergraph

Модуль для межсервисного общения через Redis с поддержкой:
- **Pub/Sub** - событийная коммуникация
- **Distributed Cache** - кэширование с автоинвалидацией
- **Event Publishing** - автоматическая публикация событий из ViewSets

---

## Quick Start

### 1. Инициализация

```python
# services/access_control/main.py
from supergraph import create_service_app
from supergraph.messaging import init_redis

app = create_service_app("access_control")

@app.on_event("startup")
async def startup():
    await init_redis("redis://redis:6379")
```

---

## Паттерн 1: Cache-Aside (AccessControl → Events)

### Проблема
Events сервис получает события от камер и нужны настройки камеры для обработки. Делать HTTP запрос в AccessControl каждый раз - медленно.

### Решение: Кэш в Redis

#### AccessControl - публикует данные в кэш

```python
# services/access_control/views/camera.py
from supergraph import ModelViewSet
from supergraph.messaging import EventConfig

class CameraViewSet(ModelViewSet):
    model = Camera

    # Автоматически публикует события при изменениях
    events = EventConfig(
        publish={
            "create": "camera.created",
            "update": "camera.updated",
            "delete": "camera.deleted",
        },
        payload_fields=["id", "mac_address", "model", "settings"]
    )
```

#### AccessControl - синхронизирует кэш

```python
# services/access_control/services/camera_sync.py
from sqlalchemy import event
from supergraph.messaging import CacheManager

cache = CacheManager(prefix="camera")

@event.listens_for(Camera, 'after_insert')
@event.listens_for(Camera, 'after_update')
def sync_to_redis(mapper, connection, target):
    """Автоматически синхронизирует камеру в Redis"""
    import asyncio

    data = {
        "id": target.id,
        "mac_address": target.mac_address,
        "model": target.model.name if target.model else None,
        "settings": target.settings,
    }

    # Кэшируем на 1 час
    asyncio.create_task(
        cache.set(f"mac:{target.mac_address}", data, ttl=3600)
    )
```

#### Events - читает из кэша

```python
# services/events/services/camera_processor.py
from supergraph.messaging import redis_cache

class CameraProcessor:

    @redis_cache(
        key="camera:mac:{mac_address}",
        ttl=3600,
        invalidate_on=["camera.updated", "camera.deleted"]
    )
    async def get_camera_by_mac(self, mac_address: str):
        """
        Первый раз: HTTP → AccessControl → кэш в Redis
        Следующие: берет из Redis
        При событии camera.updated: автоматически инвалидируется
        """
        # Fallback to HTTP if not in cache
        return await self.http_client.get(
            f"http://access-control:8001/entity/Camera",
            params={"filters": json.dumps({"mac_address__eq": mac_address})}
        )

    async def process_event(self, raw_event):
        # Быстро получаем настройки из кэша
        camera = await self.get_camera_by_mac(raw_event.mac_address)

        # Обработка на основе модели
        if camera["model"].startswith("Hikvision"):
            return await self._process_hikvision(raw_event, camera)
```

---

## Паттерн 2: Pub/Sub (Events → Gateway WebSocket)

### Проблема
Events обработал событие камеры, нужно отправить на фронтенд в реальном времени.

### Решение: Публикация в Redis, Gateway подписан

#### Events - публикует события

```python
# services/events/services/event_processor.py
from supergraph.messaging import redis_publish

async def process_camera_event(event: CameraEvent, camera_data: dict):
    """Обработка события камеры"""

    # Бизнес-логика
    processed_event = {
        "event_type": "motion_detected",
        "camera_id": camera_data["id"],
        "mac_address": camera_data["mac_address"],
        "timestamp": event.timestamp,
        "data": event.data,
    }

    # Публикуем в Redis Pub/Sub
    await redis_publish("camera.events", processed_event)

    # Можно публиковать в несколько каналов
    if camera_data.get("complex_id"):
        await redis_publish(
            f"camera.events.complex:{camera_data['complex_id']}",
            processed_event
        )
```

#### Gateway - автоматически стримит через WebSocket

```python
# gateway/main.py
from supergraph import Gateway

# Gateway автоматически подписывается на camera.events
# через Subscription из сервисов
gateway = Gateway(
    services={
        "access_control": "http://access-control:8001",
        "events": "http://events:8002",
    },
    redis_url="redis://redis:6379"
)
```

#### Events - определяет WebSocket endpoint

```python
# services/events/views/camera_events.py
from supergraph import Subscription

class CameraEventsSubscription(Subscription):
    entity = "CameraEvents"
    channels = ["camera.events"]

    filters = {
        "camera_id": ["eq", "in"],
        "complex_id": ["eq", "in"],
    }
```

**Gateway автоматически:**
1. Обнаруживает CameraEventsSubscription через `/__schema`
2. Подписывается на `camera.events` в Redis
3. Клиенты подключаются к `ws://gateway:8000/subscribe`
4. События автоматически стримятся клиентам

---

## Паттерн 3: Service-to-Service Notifications

### Проблема
Несколько сервисов должны реагировать на изменения в AccessControl.

### Решение: Pub/Sub с подписчиками

#### AccessControl - публикует через EventConfig

```python
# services/access_control/views/camera.py
from supergraph import ModelViewSet
from supergraph.messaging import EventConfig

class CameraViewSet(ModelViewSet):
    model = Camera

    events = EventConfig(
        publish={
            "update": "camera.settings.updated",
            "delete": "camera.deleted",
        }
    )
```

#### Events - подписывается и инвалидирует кэш

```python
# services/events/main.py
from supergraph.messaging import RedisSubscriber

subscriber = RedisSubscriber()

@subscriber.on("camera.settings.updated")
async def on_camera_updated(data: dict):
    """Инвалидировать кэш при обновлении камеры"""
    mac = data.get("mac_address")
    if mac:
        from supergraph.messaging import CacheManager
        cache = CacheManager()
        await cache.invalidate(f"camera:mac:{mac}")
        print(f"✅ Camera {mac} cache invalidated")

@app.on_event("startup")
async def startup():
    await subscriber.start()
```

#### Notifications - подписывается и отправляет уведомления

```python
# services/notifications/main.py
from supergraph.messaging import redis_subscribe, get_global_subscriber

@redis_subscribe("camera.settings.updated")
async def notify_admins(data: dict):
    """Уведомить админов об изменении настроек камеры"""
    await send_notification(
        f"Camera {data['mac_address']} settings updated"
    )

@app.on_event("startup")
async def startup():
    subscriber = get_global_subscriber()
    await subscriber.start()
```

---

## API Reference

### Cache Decorator

```python
from supergraph.messaging import redis_cache

@redis_cache(
    key="entity:field:{field_value}",  # Key pattern с плейсхолдерами
    ttl=3600,                           # Time to live (секунды)
    invalidate_on=["entity.updated"]    # Автоинвалидация по событиям
)
async def expensive_operation(field_value: str):
    return await fetch_from_db(field_value)
```

### Manual Cache

```python
from supergraph.messaging import CacheManager

cache = CacheManager(prefix="myservice")

# Set
await cache.set("key", {"data": "value"}, ttl=3600)

# Get
data = await cache.get("key")

# Invalidate
await cache.invalidate("key")

# Invalidate pattern
await cache.invalidate_pattern("user:*")
```

### Publish

```python
from supergraph.messaging import redis_publish

await redis_publish("channel.name", {
    "id": 123,
    "field": "value"
})
```

### Subscribe

```python
from supergraph.messaging import RedisSubscriber

subscriber = RedisSubscriber()

@subscriber.on("channel.name")
async def handler(data: dict):
    print(f"Received: {data}")

# Start listener
await subscriber.start()
```

### EventConfig в ViewSets

```python
from supergraph import ModelViewSet
from supergraph.messaging import EventConfig

class MyViewSet(ModelViewSet):
    model = MyModel

    events = EventConfig(
        publish={
            "create": "my_entity.created",
            "update": "my_entity.updated",
            "delete": "my_entity.deleted",
        },
        payload_fields=["id", "field1", "field2"]
    )
```

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                           GATEWAY                                │
│                                                                   │
│  WebSocket /subscribe  ←──────┐                                  │
│                                │                                  │
└────────────────────────────────┼──────────────────────────────────┘
                                 │
                                 │ Redis Pub/Sub
                                 │
                        ┌────────▼──────────┐
                        │   Redis :6379     │
                        │                   │
                        │  Channels:        │
                        │  - camera.events  │
                        │  - camera.updated │
                        │                   │
                        │  Cache:           │
                        │  - camera:mac:*   │
                        └────────┬──────────┘
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
     ┌────────────▼──────────┐    ┌────────────▼──────────┐
     │  AccessControl :8001   │    │   Events :8002        │
     │                        │    │                       │
     │  - Публикует кэш       │    │  - Читает из кэша     │
     │  - Публикует события   │    │  - Обрабатывает       │
     │                        │    │  - Публикует события  │
     └────────────────────────┘    └───────────────────────┘
```

---

## Best Practices

### 1. Именование каналов

```python
# Хорошо - понятная иерархия
"camera.created"
"camera.updated"
"camera.settings.updated"
"camera.events.complex:123"

# Плохо - непонятно
"cam_upd"
"update"
```

### 2. TTL для кэша

```python
# Настройки камеры (редко меняются) - 1 час
@redis_cache(key="camera:mac:{mac}", ttl=3600)

# Список активных пользователей (часто меняется) - 5 минут
@redis_cache(key="users:active", ttl=300)

# Статические данные (никогда не меняются) - 1 день
@redis_cache(key="camera:models", ttl=86400)
```

### 3. Обработка ошибок

```python
@redis_cache(key="camera:mac:{mac}", ttl=3600)
async def get_camera_by_mac(mac: str):
    try:
        # Основная логика
        return await fetch_from_db(mac)
    except Exception as e:
        logger.error(f"Failed to fetch camera: {e}")
        # Вернуть дефолтное значение или re-raise
        return None
```

### 4. Мониторинг

```python
from supergraph.messaging import get_redis_client

client = get_redis_client()

# Проверить подключение
info = await client.redis.info()
print(f"Connected clients: {info['connected_clients']}")

# Получить статистику pub/sub
pubsub_channels = await client.redis.pubsub_channels()
print(f"Active channels: {len(pubsub_channels)}")
```

---

## Migration Guide

### Из старого бекенда в новый

**Было:**
```python
# pobut_pro/backend/apps/access_control
from app.services.camera_cache import cache_camera_by_mac

def sync_camera_to_cache(db_session, camera_id):
    camera = db_session.query(Camera).get(camera_id)
    data = build_camera_cache_data(camera, camera.model, camera.model.ftp_adapter)
    cache_camera_by_mac(camera.mac_address, data)
```

**Стало:**
```python
# backend_new/services/access_control
from supergraph.messaging import CacheManager

cache = CacheManager(prefix="camera")

async def sync_camera_to_cache(camera: Camera):
    await cache.set(
        f"mac:{camera.mac_address}",
        {
            "id": camera.id,
            "mac_address": camera.mac_address,
            "model": camera.model.name if camera.model else None,
        },
        ttl=3600
    )
```

**Или еще проще - через EventConfig:**
```python
from supergraph import ModelViewSet
from supergraph.messaging import EventConfig

class CameraViewSet(ModelViewSet):
    model = Camera
    events = EventConfig(
        publish={"update": "camera.updated"}
    )
```

Все! Автоматически публикуется при изменении.

---

## Troubleshooting

### Redis не подключается

```python
# Проверить переменную окружения
import os
print(os.getenv("REDIS_URL"))

# Проверить подключение
from supergraph.messaging import get_redis_client
client = get_redis_client("redis://redis:6379")
await client.connect()
```

### События не доходят

```python
# Проверить подписчиков
from supergraph.messaging import get_redis_client
client = get_redis_client()
await client.publish("test.channel", "test message")  # Should return count of subscribers

# Проверить, что subscriber.start() вызван
subscriber = get_global_subscriber()
await subscriber.start()
```

### Кэш не инвалидируется

```python
# Убедиться что subscriber запущен
# Убедиться что имена каналов совпадают в invalidate_on и publish

# Проверить вручную
from supergraph.messaging import CacheManager
cache = CacheManager()
await cache.invalidate("camera:mac:AA:BB:CC:DD:EE:FF")
```
