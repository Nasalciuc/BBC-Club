#!/bin/sh
# POST /v1/internal/run/<job> with the internal secret; print outcome for docker logs.
name="$1"
out=$(wget -q -O- --header="X-Internal-Secret: ${INTERNAL_API_SECRET}" --post-data='' "${API_URL}/v1/internal/run/${name}" 2>&1) \
  && echo "$(date -Iseconds) job=${name} ok ${out}" \
  || echo "$(date -Iseconds) job=${name} FAIL ${out}"
