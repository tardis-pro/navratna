import os
import os.path

from sentry.conf.server import *  # noqa: F401, F403
from sentry.utils.types import Bool

CONF_ROOT = os.path.dirname(__file__)
env = os.environ.get

# ── Database ─────────────────────────────────────────────────────────────────
DATABASES = {
    "default": {
        "ENGINE": "sentry.db.postgres",
        "NAME": "sentry",
        "USER": "sentry",
        "PASSWORD": "sentry_password",
        "HOST": "sentry-postgres",
        "PORT": "5432",
        "CONN_MAX_AGE": 0,
        "AUTOCOMMIT": True,
        "OPTIONS": {"connect_timeout": 10},
    }
}

SENTRY_USE_BIG_INTS = True
SENTRY_SINGLE_ORGANIZATION = Bool(env("SENTRY_SINGLE_ORGANIZATION", True))

# ── Redis ─────────────────────────────────────────────────────────────────────
SENTRY_OPTIONS.update(
    {
        "redis.clusters": {
            "default": {"hosts": {0: {"host": "sentry-redis", "port": 6379}}}
        }
    }
)

# ── Cache / Queue ─────────────────────────────────────────────────────────────
SENTRY_CACHE = "sentry.cache.redis.RedisCache"
BROKER_URL = "redis://sentry-redis:6379/0"
SENTRY_BUFFER = "sentry.buffer.redis.RedisBuffer"
SENTRY_QUOTAS = "sentry.quotas.redis.RedisQuota"
SENTRY_RATELIMITER = "sentry.ratelimits.redis.RedisRateLimiter"
SENTRY_DIGESTS = "sentry.digests.backends.redis.RedisBackend"

# ── Kafka event stream ────────────────────────────────────────────────────────
SENTRY_EVENTSTREAM = "sentry.eventstream.kafka.KafkaEventStream"
KAFKA_CLUSTERS = {
    "default": {
        "common": {"bootstrap.servers": "sentry-kafka:9092"},
    }
}

# ── Snuba (analytics backend) ─────────────────────────────────────────────────
SENTRY_SNUBA = "http://sentry-snuba-api:1218"
SENTRY_TSDB = "sentry.tsdb.redissnuba.RedisSnubaTSDB"
SENTRY_TSDB_OPTIONS = {
    "hosts": {0: {"host": "sentry-redis", "port": 6379}},
}
SENTRY_SEARCH = "sentry.search.snuba.EventsDatasetSnubaSearchBackend"
SENTRY_TAGSTORE = "sentry.tagstore.snuba.SnubaTagStorage"

# ── Web server ────────────────────────────────────────────────────────────────
SENTRY_WEB_HOST = "0.0.0.0"
SENTRY_WEB_PORT = 9000
SENTRY_WEB_OPTIONS = {}

# ── Mail (dummy for dev) ──────────────────────────────────────────────────────
SENTRY_OPTIONS["mail.backend"] = "dummy"
SENTRY_OPTIONS["mail.from"] = "root@localhost"
SENTRY_OPTIONS["mail.enable-replies"] = False

# ── Secret key (required) ─────────────────────────────────────────────────────
secret_key = env("SENTRY_SECRET_KEY")
if not secret_key:
    raise Exception("Error: SENTRY_SECRET_KEY is undefined, set -e SENTRY_SECRET_KEY")
SENTRY_OPTIONS["system.secret-key"] = secret_key
SENTRY_USE_RELAY = True

# ── Disable Sentry's self-reporting (avoids 403 noise in the Sentry UI) ──────
# The Sentry frontend tries to report its own errors to itself via port 9000,
# but ingestion requires Relay. Disabling prevents console 403 spam.
SENTRY_OPTIONS["system.internal-dsn"] = ""
