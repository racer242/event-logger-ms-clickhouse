# Инструкция по развёртыванию на gif.murafon.srv08.ru

## Быстрый старт (автоматически)

```bash
# Запустить скрипт развёртывания
./deploy.sh
```

## Ручное развёртывание

### 1. Сборка Docker-образа локально

```bash
docker build -t event-logger:latest .
```

### 2. Копирование файлов на сервер

```bash
# Сохранить образ в tar-файл
docker save -o event-logger.tar event-logger:latest

# Копировать на сервер
scp event-logger.tar root@gif.murafon.srv08.ru:/opt/event-logger/
scp docker-compose.yml root@gif.murafon.srv08.ru:/opt/event-logger/
scp .env root@gif.murafon.srv08.ru:/opt/event-logger/
```

### 3. Развёртывание на сервере

```bash
# Подключение к серверу
ssh root@gif.murafon.srv08.ru

# Переход в директорию
cd /opt/event-logger

# Загрузка Docker-образа
docker load -i event-logger.tar

# Запуск контейнера
docker compose up -d

# Проверка статуса
docker compose ps

# Просмотр логов
docker compose logs -f
```

## Проверка работы

```bash
# Проверка здоровья
curl http://gif.murafon.srv08.ru:3000/health

# Swagger документация
# Откройте в браузере: http://gif.murafon.srv08.ru:3000/api/docs
```

## Управление контейнером

```bash
# Остановка
docker compose stop

# Запуск
docker compose start

# Перезапуск
docker compose restart

# Просмотр логов
docker compose logs -f

# Удаление контейнера
docker compose down
```

## Обновление приложения

```bash
# На локальной машине
./deploy.sh

# Или вручную на сервере
ssh root@gif.murafon.srv08.ru
cd /opt/event-logger
docker compose pull
docker compose up -d
```

## Переменные окружения (.env)

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `CLICKHOUSE_HOST` | - | Хост ClickHouse |
| `CLICKHOUSE_PORT` | `8123` | Порт ClickHouse |
| `CLICKHOUSE_USER` | `default` | Пользователь ClickHouse |
| `CLICKHOUSE_PASSWORD` | - | Пароль ClickHouse |
| `CLICKHOUSE_DATABASE` | `event_logger` | База данных |
| `CLICKHOUSE_ASYNC_INSERT` | `0` | Асинхронная вставка (0/1) |
| `CLICKHOUSE_WAIT_FOR_ASYNC_INSERT` | `0` | Ожидание вставки (0/1) |
| `API_KEYS` | - | API ключи (через запятую) |
| `PORT` | `3000` | Порт приложения |

## Мониторинг

```bash
# Статус контейнера
docker compose ps

# Использование ресурсов
docker stats event-logger-api

# Логи в реальном времени
docker compose logs -f event-logger

# Последние 100 строк логов
docker compose logs --tail=100
```

## Troubleshooting

### Контейнер не запускается

```bash
# Проверка логов
docker compose logs event-logger

# Проверка подключения к ClickHouse
docker compose exec event-logger ping -c 3 $CLICKHOUSE_HOST
```

### Ошибки подключения к БД

```bash
# Проверка доступности ClickHouse
docker compose exec event-logger wget -q -O- http://$CLICKHOUSE_HOST:$CLICKHOUSE_PORT/ping
```

### Пересоздание контейнера

```bash
docker compose down
docker compose up -d
```
