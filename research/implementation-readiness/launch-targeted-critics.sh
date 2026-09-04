#!/bin/sh
set -eu

root=/var/data/gm-implementation-readiness-api-20260903
base_sha=0f7d2fc64ae7258781e6c2676ca1e0ccc377f418
runtime=/var/data/runtimes/subscription-runtime/current/repo/dist/worker-codex/codex-goal-cli.js
node=/usr/local/bin/node

case "$1" in
  governance)
    topic="owner-start authority, ADR precedence, phase gates, and publication/admission boundaries" ;;
  api)
    topic="module authoring API, required/optional/many cardinality, diagnostics, and serializability" ;;
  composition)
    topic="ADR-0008/0016 self-composition, dependency records, construction witnesses, identity imports, and stage0/stage1" ;;
  oss)
    topic="OSS and industry lessons, Pure DI, replaceable adapters, framework lock-in, and overengineering" ;;
  *)
    echo "usage: $0 governance|api|composition|oss" >&2
    exit 2
    ;;
esac

for n in 1 2 3 4; do
  id="target-$1-$n"
  workspace="$root/workspaces/$id"
  jobroot="$root/jobs/$id"
  state="$root/state/$id"
  mkdir -p "$jobroot" "$state"
  if [ ! -e "$workspace/.git" ]; then
    git -C "$root/base" worktree add --detach "$workspace" "$base_sha" >/dev/null
  fi
  exclude=$(git -C "$workspace" rev-parse --git-path info/exclude)
  grep -qxF node_modules "$exclude" 2>/dev/null || printf "\nnode_modules\n" >> "$exclude"
  mkdir -p "$workspace/research/implementation-readiness/evidence"
  cp "$root/combined-workers.json" "$workspace/research/implementation-readiness/evidence/combined-workers.json"
  "$node" "$runtime" run --no-tmux --job-root "$jobroot" \
    --auth-root /var/data/codex-home/live-codex-auth \
    --workspace "$workspace" \
    --prompt "$root/targeted-critic-prompt.md" \
    --task-id "gm-targeted-$1-$n-20260903" \
    --accounts account-v,account-l \
    --format json --state-root "$state" --registry-root "$root/registry" \
    --job-id "gm-targeted-$1-$n-20260903" \
    --description "Get Modular targeted exact-SHA critic $1 $n" \
    --codex-goal-objective "Read-only red-team review of exact base $base_sha. Topic: $topic. Do not edit." \
    --output "$jobroot/gm-targeted-$1-$n-20260903.result.json" \
    --progress "$jobroot/gm-targeted-$1-$n-20260903.progress.json" \
    --codex-binary codex --model gpt-5.6-sol --effort xhigh --service-tier default \
    --execution-engine app-server-goal --timeout-ms 1800000 \
    --progress-heartbeat-ms 60000 --stale-lock-ms 900000 --max-account-cycles 3 \
    --edit-mode read-only --network-access disabled --allow-duplicate-accounts \
    </dev/null >/dev/null 2>&1 &
done
echo "launched targeted $1 critics"
