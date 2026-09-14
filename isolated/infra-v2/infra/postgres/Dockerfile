# Postgres with pgBackRest INSIDE the container: archive_command runs here, so the binary must be here.
FROM postgres:16
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends pgbackrest ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/log/pgbackrest /var/spool/pgbackrest /var/lib/pgbackrest \
 && chown -R postgres:postgres /var/log/pgbackrest /var/spool/pgbackrest /var/lib/pgbackrest
# All repo/pg options come from PGBACKREST_* env vars (pgbackrest reads them natively). No config-file interpolation.
COPY pgbackrest.conf /etc/pgbackrest/pgbackrest.conf
RUN chown postgres:postgres /etc/pgbackrest/pgbackrest.conf && chmod 640 /etc/pgbackrest/pgbackrest.conf
