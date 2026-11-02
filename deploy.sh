#!/usr/bin/env bash
# Deploys the page to Firebase Hosting: site wmn-claude-code in project wmn-runbooks (https://wmn-claude-code.web.app,
# custom domain https://cc.threadedstack.com). The same steps as wmn's scripts/deploy-runbooks.ts:
#   1. build once with the host's header file (firebase.json), aimed at this site only, never the project's default site;
#   2. stamp the build with wmn-claude-code-version.json (this repo's commit);
#   3. copy the live site to the "previous" channel, deploy, and check the site serves the new version;
#   4. on a failed deploy or check, put "previous" back live.
# Needs the logged-in firebase CLI, wmn (or WMN_BIN) and python3.
#   ./deploy.sh [site dir]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${1:-$here/../wmn-claude-code-site}"
project=wmn-runbooks
site=wmn-claude-code
url="https://$site.web.app"
version="$(git -C "$here" rev-parse HEAD)"
[ -z "$(git -C "$here" status --porcelain)" ] || { echo "deploy.sh: commit your changes first (the site is stamped with the commit)" >&2; exit 1; }

"$here/build.sh" "$out" --host firebase --base /
python3 - "$out/firebase.json" "$site" <<'PYEOF'
import json, sys
p, site = sys.argv[1], sys.argv[2]
j = json.load(open(p))
h = j["hosting"]
for c in (h if isinstance(h, list) else [h]):
    c["site"] = site
json.dump(j, open(p, "w"), indent=2)
PYEOF
printf '{"version":"%s"}\n' "$version" > "$out/wmn-claude-code-version.json"

rollback() {
  echo "deploy.sh: $1; restoring the previous deploy" >&2
  [ "$had_live" = 1 ] && firebase hosting:clone "$site:previous" "$site:live" --project "$project"
  exit 1
}
had_live=0
if firebase hosting:clone "$site:live" "$site:previous" --project "$project"; then had_live=1; fi
(cd "$out" && firebase deploy --only "hosting:$site" --project "$project") || rollback "the deploy failed"
for i in $(seq 1 12); do
  seen="$(curl -fsS -H 'Cache-Control: no-cache' "$url/wmn-claude-code-version.json?t=$(date +%s)" 2>/dev/null || true)"
  case "$seen" in *"$version"*) echo "live: $url serves $version"; exit 0;; esac
  sleep 5
done
rollback "$url does not serve version $version (it answers: ${seen:-nothing})"
