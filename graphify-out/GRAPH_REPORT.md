# Graph Report - love_records  (2026-10-12)

## Corpus Check
- 255 files · ~77,594 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 60 file(s) not represented in the graph (top: .wxss 29, .wxml 25, (none) 4)

## Summary
- 2270 nodes · 6254 edges · 108 communities (68 shown, 40 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 790 edges (avg confidence: 0.85)
- Token cost: unavailable; the agent tool does not expose actual token usage. JSON zeros are placeholders, not measured zero cost.

## Community Hubs (Navigation)
- COS Client SDK
- Annual Recap Data
- Database Schema Migrations
- Client API Orchestration
- Content Feedback Workflow
- API Integration Tests
- Account Deletion Processing
- Production Deployment Operations
- Request Validation Context
- Authentication Session Rotation
- Profiles and Background Workers
- Local State Persistence
- Moment Details and Rendering
- Shared Interaction Pages
- Moment and Growth Entities
- Client Login Media Types
- Product and Architecture Requirements
- Media Upload Access
- UUID and Entity Foundations
- Template and Asset Cleanup
- Audit and Membership Coordination
- Client Release Validation
- Media Processing State
- Moment HTTP Endpoints
- Invitation Lifecycle Rules
- Template Render Asset Data
- Client Template Canvas
- Couple Lifecycle Permissions
- Request IDs and Rate Limits
- Design and Animation Guidance
- Hashing and API Errors
- Recap Poster Canvas
- Moment Access Controls
- Moment Draft Composer
- Timeline Calendar Views
- Message and Pet Endpoints
- Session Token Stores
- Couple HTTP Endpoints
- Preferences and Audit Wiring
- Mini Program Routes
- Moment Status and Visibility
- User Notification Preferences
- API Exception Handling
- Internal Compliance Operations
- Moment Reactions
- In App Messages
- Pet Growth Ledger
- Pet Activity Logs
- Pet Adoption Service
- WeChat Provider Tests
- COS Failure Diagnostics
- Timeline Cursor Pagination
- Idempotent Business Writes
- Upload Session Lifecycle
- Pet Growth State
- COS Media Derivatives
- Couple Profile Page
- Pet Log Retention
- Pet Adoption Proposals
- Object Storage Contract
- UUID Generation Tests
- Client Package Configuration
- Media Status Cleanup
- Comment Notification Retraction
- Audit Log Entity
- Profile Settings Page
- Client Account Deletion
- Moment Comment Data
- Server Property Configuration
- Account Deletion Endpoints
- Annual Recap Endpoints
- Compliance Database Schema
- Official WeChat Login
- Moment Editing Page
- Derived Asset Deletion
- OpenAPI Contract Setup
- Login Refresh Endpoints
- Message Notification Types
- Media Retention Cleanup
- TypeScript Compiler Configuration
- Rate Limit Tests
- Message Read Receipts
- Client Lifecycle Monitoring
- Recap Landing Page
- User Profile Endpoints
- COS Upload Credential Scope
- Server Application Bootstrap
- Daily Pet Actions
- Client Media Diagnostics
- Notification Preference Endpoints
- Template Registration Endpoints
- Shared Server Defaults
- Custom Tab Navigation
- Privacy Agreement Page
- COS SDK License
- Local Development Profile
- Isolated Test Profile
- Server Maven Descriptor

## God Nodes (most connected - your core abstractions)
1. `ApiFlowIntegrationTest` - 65 edges
2. `MediaAssetEntity` - 64 edges
3. `userError()` - 61 edges
4. `MomentEntity` - 61 edges
5. `ApiResponse` - 60 edges
6. `redirectExpiredSession()` - 55 edges
7. `MomentService` - 54 edges
8. `Actor` - 53 edges
9. `ApiException` - 52 edges
10. `LoveNotesProperties` - 44 edges

## Surprising Connections (you probably didn't know these)
- `Mock Or Remote Operating Mode` --references--> `API_CONFIG`  [EXTRACTED]
  docs/零基础运行部署上线指南.md → miniprogram/core/api-config.ts
- `Local Run And Trial Testing Guide` --references--> `mockApi`  [EXTRACTED]
  docs/零基础运行部署上线指南.md → miniprogram/core/mock-api.ts
- `Local Run And Trial Testing Guide` --references--> `LoveNotesStore`  [EXTRACTED]
  docs/零基础运行部署上线指南.md → miniprogram/core/store.ts
- `COS Media Service Integration` --references--> `mediaService`  [EXTRACTED]
  docs/腾讯云COS私有对象存储接入指南.md → miniprogram/services/media-service.ts
- `Deletion Processing And Anonymization` --references--> `AccountDeletionProcessingWorker`  [EXTRACTED]
  docs/备份删除策略与恢复防回退.md → server/src/main/java/com/lovenotes/server/compliance/AccountDeletionProcessingWorker.java

## Import Cycles
- None detected.

## Communities (108 total, 40 thin omitted)

### Community 0 - "COS Client SDK"
Cohesion: 0.09
Nodes (60): a(), A(), b(), n(), o(), d(), I(), j() (+52 more)

### Community 1 - "Annual Recap Data"
Cohesion: 0.05
Nodes (19): AnnualRecapEntity, AnnualRecapMomentEntity, RecapStatus, DRAFT, READY, TagType, EVENT, MOOD (+11 more)

### Community 2 - "Database Schema Migrations"
Cohesion: 0.06
Nodes (46): derived_asset, idx_derived_owner_status, idx_derived_source, uk_derived_rendered_media_asset, idx_app_message_source, notification_preference, app_message_source, idx_app_message_aggregate (+38 more)

### Community 3 - "Client API Orchestration"
Cohesion: 0.07
Nodes (43): Mock Or Remote Operating Mode, API_CONFIG, envVersion, MiniProgramEnvironment, applyRecapPayload(), emptyPet(), eventLabels, isContentBlocked() (+35 more)

### Community 4 - "Content Feedback Workflow"
Cohesion: 0.08
Nodes (18): FeedbackController, FeedbackRequest, FeedbackService, FeedbackView, InternalFeedbackView, ContentFeedbackEntity, FeedbackCategory, CONTENT_ISSUE (+10 more)

### Community 6 - "Account Deletion Processing"
Cohesion: 0.06
Nodes (11): ProcessedAccount, ProcessingResult, DeletionRequestEntity, DeletionRequestStatus, CANCELED, COMPLETED, FAILED, PENDING (+3 more)

### Community 7 - "Production Deployment Operations"
Cohesion: 0.06
Nodes (44): External MySQL Redis And COS, Hardened API Container, Production Compose Configuration, Backup Deletion Restore Policy, CI Security Gates Backlog, Deletion Processing And Anonymization, Device Routed Channel Notifications, Feature Gaps And Priorities (+36 more)

### Community 8 - "Request Validation Context"
Cohesion: 0.13
Nodes (3): AuthFilter, RequestContext, DomainEnums

### Community 9 - "Authentication Session Rotation"
Cohesion: 0.08
Nodes (14): AuthService, LoginResult, RefreshSubject, SessionService, Tokens, Identity, WechatIdentityProvider, UserStatus (+6 more)

### Community 10 - "Profiles and Background Workers"
Cohesion: 0.10
Nodes (10): DevWechatIdentityProvider, AccountDeletionProcessingWorker, Entry, InMemoryIdempotencyStore, RedisIdempotencyStore, MediaCleanupWorker, MediaProcessingWorker, PetLogCleanupWorker (+2 more)

### Community 11 - "Local State Persistence"
Cohesion: 0.10
Nodes (7): createId(), initialState(), LoveNotesStore, nowIso(), AppState, Draft, Moment

### Community 12 - "Moment Details and Rendering"
Cohesion: 0.07
Nodes (14): item(), decorateMoment(), splitDate(), visibleLabel(), onLoad(), confirmTrash(), onShow(), react() (+6 more)

### Community 13 - "Shared Interaction Pages"
Cohesion: 0.11
Nodes (28): publish(), confirm(), create(), onLoad(), loadMore(), onShow(), open(), readAll() (+20 more)

### Community 15 - "Client Login Media Types"
Cohesion: 0.07
Nodes (21): mockApi, store, CommentItem, MediaItem, MediaType, MessageItem, ViewType, Visibility (+13 more)

### Community 16 - "Product and Architecture Requirements"
Cohesion: 0.09
Nodes (25): Deferred Personal Export SAFE07, Planned Light Tasks PET08, Product Requirements PDF v1.0, Proposed North Star Metric, Pending Design Decisions TBD01 TBD15, Proposed Deployment Topology, Technical Design PDF v1.1, Planned Feature Roadmap P1 P2 (+17 more)

### Community 17 - "Media Upload Access"
Cohesion: 0.12
Nodes (9): AccessUrlResponse, AssetResponse, CompleteUploadRequest, CreateUploadRequest, MediaController, ObjectStorageCredential, UploadResponse, CreatedUpload (+1 more)

### Community 19 - "Template and Asset Cleanup"
Cohesion: 0.16
Nodes (10): COS Media Service Integration, AccountDeletionProcessingService, DerivedAssetCleanupService, MediaCleanupService, MediaProcessingService, DerivedAssetRepository, MediaAssetRepository, MomentRepository (+2 more)

### Community 20 - "Audit and Membership Coordination"
Cohesion: 0.12
Nodes (11): AuditService, DeletionRequestService, CoupleService, ActiveCoupleMemberEntity, IdempotencyStore, MarkAllReadResult, MessageService, ActiveCoupleMemberRepository (+3 more)

### Community 21 - "Client Release Validation"
Cohesion: 0.07
Nodes (27): allPages, app, failures, fs, miniRoot, path, projectRoot, read() (+19 more)

### Community 23 - "Moment HTTP Endpoints"
Cohesion: 0.13
Nodes (8): Actor, ApiResponse, Meta, CommentRequest, CreateMomentRequest, MomentController, ReactionRequest, UpdateMomentRequest

### Community 24 - "Invitation Lifecycle Rules"
Cohesion: 0.09
Nodes (8): CreatedInvitation, InvitationPreview, InvitationStatus, ACCEPTED, ACTIVE, EXPIRED, REVOKED, InvitationEntity

### Community 26 - "Client Template Canvas"
Cohesion: 0.12
Nodes (27): cropChange(), cycleSticker(), layoutLabel(), onLoad(), onReady(), renderPreview(), reset(), saveOptions() (+19 more)

### Community 27 - "Couple Lifecycle Permissions"
Cohesion: 0.12
Nodes (5): CoupleSpaceEntity, CoupleStatus, ENDED, FROZEN, PAIRED

### Community 28 - "Request IDs and Rate Limits"
Cohesion: 0.13
Nodes (6): RequestIdFilter, Counter, RateLimitFilter, Rule, RateLimitStore, Result

### Community 29 - "Design and Animation Guidance"
Cohesion: 0.09
Nodes (21): GSAP Core Guide, GSAP Tween Methods, GSAP Framework Guide, GSAP Performance Guide, Flip Layout Transition, GSAP Plugin Guide, GSAP Plugin Registration, SplitText Accessible Text Animation (+13 more)

### Community 32 - "Recap Poster Canvas"
Cohesion: 0.17
Nodes (22): buildPoster(), canvasDraw(), canvasToTempFilePath(), drawCover(), drawFooter(), drawLines(), drawMomentCard(), ensureAlbumPermission() (+14 more)

### Community 33 - "Moment Access Controls"
Cohesion: 0.19
Nodes (7): CommentView, MediaSelection, MediaView, MomentService, MomentView, ReactionView, TemplateView

### Community 34 - "Moment Draft Composer"
Cohesion: 0.14
Nodes (21): beautify(), bodyInput(), chooseMedia(), dateChange(), dateValue(), IMAGE_MIME, next(), onLoad() (+13 more)

### Community 35 - "Timeline Calendar Views"
Cohesion: 0.17
Nodes (19): buildCalendar(), buildMonths(), buildWeek(), compose(), customEndChange(), customStartChange(), dateValue(), emptyAction() (+11 more)

### Community 36 - "Message and Pet Endpoints"
Cohesion: 0.16
Nodes (5): MessageController, PetActionRequest, PetAdoptionRequest, PetController, PetRenameRequest

### Community 37 - "Session Token Stores"
Cohesion: 0.20
Nodes (5): Entry, InMemorySessionTokenStore, RedisSessionTokenStore, SessionTokenStore, StoredSession

### Community 38 - "Couple HTTP Endpoints"
Cohesion: 0.20
Nodes (6): AcceptRequest, CoupleController, CoupleResponse, InvitationCreated, UnbindRequest, UpdateCoupleRequest

### Community 40 - "Preferences and Audit Wiring"
Cohesion: 0.13
Nodes (4): NotificationPreferenceService, AuditLogRepository, NotificationPreferenceRepository, UploadSessionRepository

### Community 41 - "Mini Program Routes"
Cohesion: 0.10
Nodes (19): lazyCodeLoading, pages, sitemapLocation, style, subpackages, tabBar, backgroundColor, color (+11 more)

### Community 42 - "Moment Status and Visibility"
Cohesion: 0.10
Nodes (14): MomentStatus, DRAFT, PARTIAL_FAILED, PUBLISHED, PURGED, TRASHED, UPLOADING, MomentType (+6 more)

### Community 44 - "API Exception Handling"
Cohesion: 0.28
Nodes (3): ApiErrorResponse, ErrorBody, GlobalExceptionHandler

### Community 45 - "Internal Compliance Operations"
Cohesion: 0.19
Nodes (4): InternalComplianceController, StorageAuditCheck, UpdateFeedbackRequest, InternalOperationGuard

### Community 48 - "Pet Growth Ledger"
Cohesion: 0.14
Nodes (5): PetGrowthSource, BOTH_ACTIVE, MOMENT_CREATED, PARTNER_REACTION, PetGrowthLedgerEntity

### Community 50 - "Pet Adoption Service"
Cohesion: 0.22
Nodes (6): PetActionResult, PetAdoptionView, PetLogView, PetService, PetView, PetStateRepository

### Community 52 - "COS Failure Diagnostics"
Cohesion: 0.21
Nodes (3): CosProviderFailure, Diagnostic, CosProviderFailureTest

### Community 53 - "Timeline Cursor Pagination"
Cohesion: 0.21
Nodes (3): TimelinePage, Cursor, TimelineCursorCodec

### Community 55 - "Upload Session Lifecycle"
Cohesion: 0.15
Nodes (5): UploadStatus, COMPLETED, CREATED, EXPIRED, UploadSessionEntity

### Community 57 - "COS Media Derivatives"
Cohesion: 0.17
Nodes (5): MediaKind, IMAGE, VIDEO, CosObjectStorage, ProcessingResult

### Community 58 - "Couple Profile Page"
Cohesion: 0.16
Nodes (5): daysSince(), onShow(), render(), retry(), saveProfile()

### Community 59 - "Pet Log Retention"
Cohesion: 0.20
Nodes (4): CleanupResult, PetLogRetentionService, PetActionLogRepository, PetGrowthLedgerRepository

### Community 61 - "Object Storage Contract"
Cohesion: 0.12
Nodes (7): LocalObjectStorage, ObjectInfo, ProcessingOutcome, BLOCKED, FAILED, PENDING, READY

### Community 63 - "Client Package Configuration"
Cohesion: 0.13
Nodes (14): dependencies, cos-wx-sdk-v5, devDependencies, typescript, name, private, scripts, typecheck (+6 more)

### Community 64 - "Media Status Cleanup"
Cohesion: 0.13
Nodes (8): MediaStatus, BLOCKED, CREATED, DELETED, FAILED, PROCESSING, READY, UPLOADED

### Community 67 - "Profile Settings Page"
Cohesion: 0.19
Nodes (4): onShow(), render(), retry(), toggle()

### Community 68 - "Client Account Deletion"
Cohesion: 0.18
Nodes (7): createDeletionRequest(), onLoad(), refresh(), refreshStatus(), appService, Mini Program Remote Services Guide, Stable Development Test Identities

### Community 70 - "Server Property Configuration"
Cohesion: 0.39
Nodes (8): Invitation, LoveNotesProperties, Media, Operations, Session, Storage, Timeline, Wechat

### Community 71 - "Account Deletion Endpoints"
Cohesion: 0.24
Nodes (4): CreateDeletionRequest, DeletionRequestController, CreatedDeletionRequest, DeletionRequestView

### Community 72 - "Annual Recap Endpoints"
Cohesion: 0.27
Nodes (3): GenerateRecapRequest, RecapController, UpdateRecapRequest

### Community 73 - "Compliance Database Schema"
Cohesion: 0.29
Nodes (11): audit_log, content_feedback, deletion_request, idx_audit_action_time, idx_audit_actor_time, idx_audit_resource, idx_deletion_requester_time, idx_deletion_status_time (+3 more)

### Community 75 - "Moment Editing Page"
Cohesion: 0.20
Nodes (4): dateValue(), eventValues, moods, onLoad()

### Community 76 - "Derived Asset Deletion"
Cohesion: 0.20
Nodes (5): DerivedAssetStatus, DELETED, FAILED, PENDING, READY

### Community 78 - "Login Refresh Endpoints"
Cohesion: 0.31
Nodes (4): AuthController, LoginRequest, LoginResponse, RefreshRequest

### Community 79 - "Message Notification Types"
Cohesion: 0.20
Nodes (8): MessageType, COMMENT, MOMENT, PET, REACTION, SYSTEM, MessagePage, MessageView

### Community 81 - "TypeScript Compiler Configuration"
Cohesion: 0.20
Nodes (9): compilerOptions, module, noEmit, noImplicitAny, skipLibCheck, strict, target, typeRoots (+1 more)

### Community 84 - "Client Lifecycle Monitoring"
Cohesion: 0.43
Nodes (6): configureUpdates(), onError(), onLaunch(), onUnhandledRejection(), reportClientIssue(), safeText()

### Community 85 - "Recap Landing Page"
Cohesion: 0.36
Nodes (5): create(), onShow(), openCover(), preview(), render()

### Community 87 - "User Profile Endpoints"
Cohesion: 0.50
Nodes (3): MeController, MeResponse, UpdateMeRequest

### Community 88 - "COS Upload Credential Scope"
Cohesion: 0.32
Nodes (3): Credentials, UploadCredential, CosObjectStorageTest

### Community 91 - "Daily Pet Actions"
Cohesion: 0.43
Nodes (3): PetAction, FEED, PLAY

### Community 93 - "Client Media Diagnostics"
Cohesion: 0.60
Nodes (3): Acknowledged, CosUploadFailure, MediaDiagnosticController

### Community 94 - "Notification Preference Endpoints"
Cohesion: 0.53
Nodes (3): NotificationPreferenceController, PreferenceView, UpdatePreferenceRequest

### Community 95 - "Template Registration Endpoints"
Cohesion: 0.60
Nodes (3): RegisterTemplateRenderRequest, TemplateRenderController, TemplateRenderView

### Community 96 - "Shared Server Defaults"
Cohesion: 0.50
Nodes (4): Media Size Duration And Retention Limits, Server Pet Growth Rules, Session And Invitation TTLs, Shared Spring Configuration

## Ambiguous Edges - Review These
- `P0 Production And Device Acceptance` → `Historical Server Documentation Drift`  [AMBIGUOUS]
  server/README.md · relation: conceptually_related_to
- `Deletion Processing And Anonymization` → `Historical Server Documentation Drift`  [AMBIGUOUS]
  server/README.md · relation: conceptually_related_to
- `Pending Design Decisions TBD01 TBD15` → `Deferred Personal Export SAFE07`  [AMBIGUOUS]
  doc/恋爱笔记_多端产品_技术详细设计说明书_v1.1.pdf · relation: conceptually_related_to

## Knowledge Gaps
- **112 isolated node(s):** `typescript`, `cos-wx-sdk-v5`, `com.lovenotes:love-notes-server`, `ACTIVE`, `DISABLED` (+107 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 563 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `COS Media Service Integration` connect `Template and Asset Cleanup` to `Media Upload Access`, `COS Media Derivatives`, `Production Deployment Operations`, `Client Login Media Types`?**
  _High betweenness centrality (0.313) - this node is a cross-community bridge._
- **What connects `typescript`, `cos-wx-sdk-v5`, `com.lovenotes:love-notes-server` to the rest of the system?**
  _112 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `COS Client SDK` be split into smaller, more focused modules?**
  _Cohesion score 0.0918918918918919 - nodes in this community are weakly interconnected._
- **Why does `mediaService` connect `Client Login Media Types` to `Client API Orchestration`, `Client Template Canvas`, `Template and Asset Cleanup`?**
  _High betweenness centrality (0.291) - this node is a cross-community bridge._
- **Should `Annual Recap Data` be split into smaller, more focused modules?**
  _Cohesion score 0.05146242132543503 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `P0 Production And Device Acceptance` and `Historical Server Documentation Drift`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Deletion Processing And Anonymization` and `Historical Server Documentation Drift`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
## Build Notes

- Semantic statements describe their cited documents; requirements and roadmap items are not proof of implementation.
- Skipped by the scanner's sensitive-file naming rule: `miniprogram/styles/tokens.wxss`. No source files were renamed.
- `.env`, private local configuration, dependency caches, and build outputs remain outside the detected corpus under normal ignore rules.
- `miniprogram/types/wx.d.ts` and `server/pom.xml` produced no AST symbols. The RAR archive is unsupported.
- The SQL grammar was loaded from `tmp/graphify-extra`; PDF/DOCX libraries were reused from the desktop Python 3.12 bundle.
- `graphify-out/` was written into the Git working tree. It is not ignored here, so it appears in `git status`; ignore it or commit only outputs the team should share.
- Graph health warning: 601 raw edges have endpoints without extracted definitions; 16 self-loops; 305 raw edges share an undirected endpoint pair and are collapsed by the graph representation.

```text
[graphify] MultiDiGraph edge-collapse diagnostic
input: <in-memory>
input_stage: provided JSON (normal graph.json is post-build)
effective_directed: <direct-call>
nodes: 2160
unverified_code_nodes: 0
raw_edges: 6574
valid_candidate_edges: 5967
missing_endpoint_edges: 0
dangling_endpoint_edges: 601
external_reference_edges: 6
self_loop_edges: 16
exact_duplicate_edges: 0
directed_unique_endpoint_pairs: 5685
directed_same_endpoint_collapsed_edges: 282
undirected_unique_endpoint_pairs: 5662
undirected_same_endpoint_collapsed_edges: 305
same_endpoint_group_count: 274
relation_variant_groups: 96
source_file_variant_groups: 0
source_location_variant_groups: 38
context_variant_groups: 142
post_build_graph_type: Graph
post_build_edges: 6254
producer_suppression_sites: 12
producer_suppression_examples:
  - L1764 seen_ids arity=unknown
  - L2328 seen_ids arity=unknown
  - L2330 seen_doc_refs arity=unknown
  - L2808 seen_ids arity=unknown
  - L2955 seen_ids arity=unknown
  - L3807 seen_keys arity=unknown
  - L3980 seen_keys arity=unknown
  - L6385 seen_ids arity=unknown
examples:
  - miniprogram_vendor_cos_wx_sdk_v5_min -> miniprogram_vendor_cos_wx_sdk_v5_min_i edges=3 relations=['calls', 'contains', 'indirect_call'] locations=['L1'] contexts=['', 'argument', 'call']
  - miniprogram_vendor_cos_wx_sdk_v5_min_i_b -> miniprogram_vendor_cos_wx_sdk_v5_min_i_b_a edges=3 relations=['calls', 'contains', 'indirect_call'] locations=['L1'] contexts=['', 'argument', 'call']
  - miniprogram_vendor_cos_wx_sdk_v5_min_i -> miniprogram_vendor_cos_wx_sdk_v5_min_i_o edges=3 relations=['calls', 'contains', 'indirect_call'] locations=['L1'] contexts=['', 'argument', 'call']
  - server_src_main_java_com_lovenotes_server_auth_inmemorysessiontokenstore_inmemorysessiontokenstore -> server_src_main_java_com_lovenotes_server_auth_inmemorysessiontokenstore_entry edges=3 relations=['contains', 'references'] locations=['L13', 'L14', 'L25'] contexts=['', 'generic_arg']
  - server_src_main_java_com_lovenotes_server_domain_appmessageentity_appmessageentity -> server_src_main_java_com_lovenotes_server_domain_appmessageentity_appmessageentity_appmessageentity edges=3 relations=['method'] locations=['L50', 'L52', 'L57'] contexts=['']
note: normal graph.json is post-build; raw producer loss must be measured earlier.
```

## Query Context Benchmark

Detected corpus: 77594 words. Estimated full-corpus context: 103458 tokens; estimated average sample-query context: 24389 tokens; estimated reduction: 4.2x. This is a context-size estimate, not measured agent usage or billing. The CLI default used a node-count proxy; this result instead uses the actual detect() word count.
