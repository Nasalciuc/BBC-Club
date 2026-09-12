#!/bin/sh
# alpine busybox crond. Each line of crontab = "<5-field schedule> <job-name>". A failed call is logged loudly.
set -eu
mkdir -p /var/spool/cron/crontabs
awk '!/^#/ && NF { print $1" "$2" "$3" "$4" "$5" /bin/sh /etc/cron/job.sh "$6 }' /etc/cron/crontab > /var/spool/cron/crontabs/root
echo "$(date -Iseconds) cron: $(wc -l < /var/spool/cron/crontabs/root) jobs, target ${API_URL}"
exec crond -f -l 6
