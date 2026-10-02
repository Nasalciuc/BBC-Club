#!/bin/sh
# Idempotent topic bootstrap for the private broker. A second run is a no-op.
set -eu
BOOT="${KAFKA_BOOTSTRAP:-kafka:9092}"
if [ -x /opt/kafka/bin/kafka-topics.sh ]; then
  BIN=/opt/kafka/bin/kafka-topics.sh
else
  BIN=kafka-topics.sh
fi

i=0
until "$BIN" --bootstrap-server "$BOOT" --list >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 30 ]; then
    echo "broker not ready at $BOOT" >&2
    exit 1
  fi
  sleep 2
done

create() {
  name="$1"
  parts="$2"
  retention="$3"
  "$BIN" --bootstrap-server "$BOOT" --create --if-not-exists \
    --topic "$name" \
    --partitions "$parts" \
    --replication-factor 1 \
    --config "retention.ms=$retention"
}

# 7 days on the domain and search topics; 30 days on the dead-letter topic.
create bbc.domain-events.v1 6 604800000
create bbc.domain-events.dlq.v1 1 2592000000
create bbc.search.v1 3 604800000
