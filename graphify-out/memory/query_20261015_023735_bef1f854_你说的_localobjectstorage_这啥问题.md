---
type: "query"
date: "2026-10-15T02:37:35.219106+00:00"
question: "你说的 LocalObjectStorage 这啥问题？"
contributor: "graphify"
outcome: "useful"
source_nodes: ["LocalObjectStorage", "LocalObjectStorage.java", "CosObjectStorage"]
---

# Q: 你说的 LocalObjectStorage 这啥问题？

## Answer

Expanded via graph vocabulary [local, storage]. Current LocalObjectStorage.java:L8 is restricted to dev/test profiles. Its stat method fabricates expected size/etag, signedGetUrl returns local:// paths, createDerivatives only constructs names without creating files, auditText always returns READY and deleteObjects is a no-op. This is an intentional development/testing stub, not real filesystem-backed storage and not the mini-program persistent cover cache. The limitation is that it cannot be enabled as a production self-hosted storage solution without real file IO, authorization and processing. Current docker-compose.yml:L16 activates prod, and CosObjectStorage is profiled prod, so under the checked source deployment configuration production uses COS rather than this stub. No live server startup parameters inspected and no code edits required for this explanation.

## Outcome

- Signal: useful

## Source Nodes

- LocalObjectStorage
- LocalObjectStorage.java
- CosObjectStorage