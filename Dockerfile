# Explicit, testable replacement for Nixpacks auto-detection, which was
# silently building this Railway service as Node-only -- package.json and
# root requirements.txt both self-detect, but Nixpacks doesn't combine
# multiple self-detected providers without extra config (attempted in
# nixpacks.toml, which broke `npm ci` entirely and was reverted). A
# Dockerfile gives full explicit control over both runtimes and can be
# built and checked locally before ever reaching Railway.
#
# Every AnalogML/RegimeV2/Gold/bot/levelEngine/SessionResearch import that
# start.sh's bots actually need at runtime resolves from the ROOT
# requirements.txt alone (verified by parsing each live-launched script's
# imports) -- per-directory requirements.txt files are NOT installed here.
# Gold/requirements.txt's MetaTrader5 entry in particular is a Windows-only
# package with no Linux wheel; every bot that imports it already guards
# with try/except ImportError (paper-mode fallback), so it's deliberately
# never installed on this Linux container.
#
# python-is-python3 matters: Debian's python3 package does NOT create a
# bare `python` symlink. Every bot in start.sh (not just AnalogML) invokes
# plain `python`, not `python3` -- without this package the build succeeds
# but every single bot still fails with "python: command not found" at
# runtime (caught via Railway's Deploy Logs after the first attempt at
# this Dockerfile, which only installed python3/python3-pip).
FROM node:22-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

# Python deps in their own layer (root requirements.txt only -- see above).
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Node deps. playwright is an unused dependency for this service (nothing
# in server.js or any live bot launches a browser at runtime) -- skip its
# browser download, same as this repo's own dev sandbox already does.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

CMD ["bash", "start.sh"]
