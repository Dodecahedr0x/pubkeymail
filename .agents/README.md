# Agent Guide

Load only what the task needs:

1. Always read [`context/project.md`](context/project.md) and
   [`memory/project.md`](memory/project.md).
2. For planned work, read/update [`memory/progress.md`](memory/progress.md).
3. Read only the relevant spec and skill; never load every file by default.
4. Do not read `memory/archive/` unless historical detail is necessary.

Update the matching file when code makes it stale: current facts in `context/`,
durable constraints in `memory/project.md`, active work in `memory/progress.md`,
contracts in `specs/`, and repeatable procedures in `skills/`. Never store
secrets, transient output, or speculation here.
