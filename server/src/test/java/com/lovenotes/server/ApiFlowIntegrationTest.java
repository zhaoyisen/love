package com.lovenotes.server;

import com.fasterxml.jackson.databind.*;
import com.lovenotes.server.compliance.AccountDeletionProcessingService;
import com.lovenotes.server.domain.DerivedAssetEntity;
import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.domain.MediaAssetEntity;
import com.lovenotes.server.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;
import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ApiFlowIntegrationTest {
    private static final String INTERNAL_TOKEN = "test-internal-token";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired MomentTagRepository tags;
    @Autowired UploadSessionRepository uploads;
    @Autowired MediaAssetRepository assets;
    @Autowired MomentReactionRepository reactions;
    @Autowired MomentCommentRepository comments;
    @Autowired AppMessageRepository appMessages;
    @Autowired AppMessageSourceRepository appMessageSources;
    @Autowired PetActionLogRepository petActionLogs;
    @Autowired PetGrowthLedgerRepository petGrowthLedger;
    @Autowired PetStateRepository petStates;
    @Autowired PetAdoptionProposalRepository petAdoptionProposals;
    @Autowired AnnualRecapMomentRepository annualRecapMoments;
    @Autowired AnnualRecapRepository annualRecaps;
    @Autowired ContentFeedbackRepository contentFeedback;
    @Autowired DeletionRequestRepository deletionRequests;
    @Autowired DerivedAssetRepository derivedAssets;
    @Autowired NotificationPreferenceRepository notificationPreferences;
    @Autowired AuditLogRepository auditLogs;
    @Autowired AccountDeletionProcessingService accountDeletionProcessor;
    @Autowired com.lovenotes.server.media.MediaCleanupService mediaCleanup;
    @Autowired MomentRepository moments;
    @Autowired ActiveCoupleMemberRepository members;
    @Autowired InvitationRepository invitations;
    @Autowired CoupleSpaceRepository couples;
    @Autowired UserRepository users;
    @Autowired jakarta.persistence.EntityManagerFactory entityManagers;

    @BeforeEach
    void cleanDatabase() {
        var existingUsers = users.findAll();
        existingUsers.forEach(user -> user.setAvatarMediaId(null));
        users.saveAllAndFlush(existingUsers);
        auditLogs.deleteAll(); contentFeedback.deleteAll(); deletionRequests.deleteAll(); derivedAssets.deleteAll(); notificationPreferences.deleteAll();
        appMessageSources.deleteAll(); appMessages.deleteAll(); petGrowthLedger.deleteAll(); petActionLogs.deleteAll(); petStates.deleteAll(); petAdoptionProposals.deleteAll(); annualRecapMoments.deleteAll(); annualRecaps.deleteAll(); comments.deleteAll(); reactions.deleteAll(); tags.deleteAll(); uploads.deleteAll(); assets.deleteAll(); moments.deleteAll();
        members.deleteAll(); invitations.deleteAll(); couples.deleteAll(); users.deleteAll();
    }

    @Test
    void shouldRejectProtectedEndpointWithoutAccessToken() throws Exception {
        mvc.perform(get("/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("SESSION_EXPIRED"));
    }

    @Test
    void shouldProtectAndRunTheManualTextAuditCheck() throws Exception {
        mvc.perform(post("/internal/storage/text-audit-check"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("INTERNAL_OPERATION_FORBIDDEN"));

        mvc.perform(post("/internal/storage/text-audit-check")
                        .header("X-Internal-Operation-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("READY"));
    }

    @Test
    void shouldUpdateProfileAndRejectInvalidNickname() throws Exception {
        Login user = login("profile-user");

        mvc.perform(patch("/me").header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"  小满的新名字  \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.nickname").value("小满的新名字"));

        mvc.perform(get("/me").header("Authorization", bearer(user.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.nickname").value("小满的新名字"));

        Assertions.assertEquals("小满的新名字", users.findById(UUID.fromString(user.userId())).orElseThrow().getNickname());

        mvc.perform(patch("/me").header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));

        mvc.perform(patch("/me").header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"1234567890123456789012345678901\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void shouldUploadAndPersistWechatProfileAvatar() throws Exception {
        Login user = login("profile-avatar-user");
        String avatarAssetId = uploadImage(user, "wechat-avatar.jpg");

        mvc.perform(patch("/me").header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"小满\",\"avatar_asset_id\":\"" + avatarAssetId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.nickname").value("小满"))
                .andExpect(jsonPath("$.data.avatar_asset_id").value(avatarAssetId))
                .andExpect(jsonPath("$.data.avatar_status").value("READY"))
                .andExpect(jsonPath("$.data.avatar_url", startsWith("local://")));

        mvc.perform(get("/me").header("Authorization", bearer(user.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.avatar_asset_id").value(avatarAssetId))
                .andExpect(jsonPath("$.data.avatar_url", startsWith("local://")));

        var userEntity = users.findById(UUID.fromString(user.userId())).orElseThrow();
        Assertions.assertEquals(UUID.fromString(avatarAssetId), userEntity.getAvatarMediaId());
        Assertions.assertTrue(assets.findById(UUID.fromString(avatarAssetId)).orElseThrow().isProfileAvatar());
    }

    @Test
    void shouldPersistNotificationPreferencesForTheCurrentAccount() throws Exception {
        Login user = login("preference-user");

        mvc.perform(get("/me/notification-preferences").header("Authorization", bearer(user.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.moment_notice").value(true))
                .andExpect(jsonPath("$.data.reaction_notice").value(true))
                .andExpect(jsonPath("$.data.pet_notice").value(true))
                .andExpect(jsonPath("$.data.recap_notice").value(true))
                .andExpect(jsonPath("$.data.default_visibility").value("PRIVATE"));

        mvc.perform(patch("/me/notification-preferences").header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"moment_notice\":false,\"reaction_notice\":true,\"pet_notice\":false,\"recap_notice\":false,\"default_visibility\":\"SHARED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.moment_notice").value(false))
                .andExpect(jsonPath("$.data.reaction_notice").value(true))
                .andExpect(jsonPath("$.data.pet_notice").value(false))
                .andExpect(jsonPath("$.data.recap_notice").value(false))
                .andExpect(jsonPath("$.data.default_visibility").value("SHARED"));

        mvc.perform(get("/me/notification-preferences").header("Authorization", bearer(user.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.moment_notice").value(false))
                .andExpect(jsonPath("$.data.default_visibility").value("SHARED"));
        Assertions.assertEquals(1, notificationPreferences.count());
        Assertions.assertEquals(1, auditLogs.countByAction("NOTIFICATION_PREFERENCE_UPDATE"));
    }

    @Test
    void shouldExposePartnerNicknameAndAuthorizedProfileAvatar() throws Exception {
        Login alpha = login("partner-profile-alpha");
        Login beta = login("partner-profile-beta");
        String avatarAssetId = uploadImage(alpha, "partner-avatar.jpg");
        mvc.perform(patch("/me").header("Authorization", bearer(alpha.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"小满\",\"avatar_asset_id\":\"" + avatarAssetId + "\"}"))
                .andExpect(status().isOk());
        pair(alpha, beta);

        mvc.perform(get("/couples/current").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.partner_id").value(alpha.userId()))
                .andExpect(jsonPath("$.data.partner_nickname").value("小满"))
                .andExpect(jsonPath("$.data.partner_avatar_url", startsWith("local://")));
    }

    @Test
    void shouldRejectSharedMomentWhenUserIsNotPaired() throws Exception {
        Login user = login("solo-user");
        mvc.perform(post("/moments").header("Authorization", bearer(user.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(textMoment("SHARED")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("VISIBILITY_NOT_ALLOWED"));
    }

    @Test
    void shouldCreateContentFeedbackAndAuditOnlyForAccessibleResource() throws Exception {
        Login alpha = login("feedback-alpha");
        Login beta = login("feedback-beta");
        Login stranger = login("feedback-stranger");
        pair(alpha, beta);

        String shared = mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(textMoment("SHARED")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String sharedMomentId = mapper.readTree(shared).at("/data/id").asText();
        String privateMoment = mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(textMoment("PRIVATE")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String privateMomentId = mapper.readTree(privateMoment).at("/data/id").asText();

        mvc.perform(post("/feedback").header("Authorization", bearer(stranger.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"resource_type\":\"MOMENT\",\"resource_id\":\"" + privateMomentId + "\",\"category\":\"PRIVACY_CONCERN\",\"description\":\"这条私密记录不应该被我反馈\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("RESOURCE_FORBIDDEN"));

        mvc.perform(post("/feedback").header("Authorization", bearer(beta.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"resource_type\":\"MOMENT\",\"resource_id\":\"" + sharedMomentId + "\",\"category\":\"RIGHTS_COMPLAINT\",\"description\":\"这条共同记录涉及我的权益反馈\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("OPEN"))
                .andExpect(jsonPath("$.data.category").value("RIGHTS_COMPLAINT"))
                .andExpect(jsonPath("$.data.resource_id").value(sharedMomentId));

        mvc.perform(get("/feedback/my").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].resource_id").value(sharedMomentId));
        Assertions.assertEquals(1, contentFeedback.count());
        Assertions.assertEquals(1, auditLogs.countByAction("CONTENT_FEEDBACK_CREATE"));

        mvc.perform(get("/internal/feedback"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("INTERNAL_OPERATION_FORBIDDEN"));
        mvc.perform(get("/internal/feedback").header("X-Internal-Operation-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].status").value("OPEN"))
                .andExpect(jsonPath("$.data[0].reporter_id").value(beta.userId()));
        UUID feedbackId = contentFeedback.findByReporterIdOrderByCreatedAtDesc(UUID.fromString(beta.userId()), org.springframework.data.domain.PageRequest.of(0, 1))
                .getFirst().getId();
        mvc.perform(patch("/internal/feedback/{id}", feedbackId)
                        .header("X-Internal-Operation-Token", INTERNAL_TOKEN)
                        .header("X-Internal-Operator", "ops-a")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"IN_REVIEW\",\"note\":\"已进入处理\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("IN_REVIEW"));
        mvc.perform(patch("/internal/feedback/{id}", feedbackId)
                        .header("X-Internal-Operation-Token", INTERNAL_TOKEN)
                        .header("X-Internal-Operator", "ops-a")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"RESOLVED\",\"note\":\"已完成处理\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("RESOLVED"));
        Assertions.assertEquals(2, auditLogs.countByAction("CONTENT_FEEDBACK_STATUS_CHANGE"));
        Assertions.assertEquals(DomainEnums.FeedbackStatus.RESOLVED, contentFeedback.findById(feedbackId).orElseThrow().getStatus());
        mvc.perform(get("/messages").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].type").value("SYSTEM"))
                .andExpect(jsonPath("$.data.items[0].title").value("反馈处理状态已更新"));
    }

    @Test
    void shouldCreateModerationAppealWithoutExistingResource() throws Exception {
        Login user = login("appeal-user");

        mvc.perform(post("/feedback").header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"resource_type\":\"OTHER\",\"category\":\"MODERATION_APPEAL\",\"description\":\"内容安全拦截后申请人工复核\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.resource_type").value("OTHER"))
                .andExpect(jsonPath("$.data.category").value("MODERATION_APPEAL"))
                .andExpect(jsonPath("$.data.status").value("OPEN"));
        Assertions.assertEquals(1, contentFeedback.count());
        Assertions.assertEquals(1, auditLogs.countByAction("CONTENT_FEEDBACK_CREATE"));
    }

    @Test
    void shouldCreateAccountDeletionRequestFreezeCoupleInvalidateSessionsAndExposeProgress() throws Exception {
        Login alpha = login("delete-alpha");
        Login beta = login("delete-beta");
        pair(alpha, beta);
        String upload = mvc.perform(post("/upload-sessions").header("Authorization", bearer(alpha.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"file_name\":\"delete.jpg\",\"mime_type\":\"image/jpeg\",\"size\":1024}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String uploadSessionId = mapper.readTree(upload).at("/data/upload_session_id").asText();
        String assetId = mapper.readTree(upload).at("/data/asset_id").asText();
        mvc.perform(post("/upload-sessions/{id}/complete", uploadSessionId).header("Authorization", bearer(alpha.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"etag\":\"delete-test\"}"))
                .andExpect(status().isOk());
        String privateMoment = mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(imageMoment(assetId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String privateMomentId = mapper.readTree(privateMoment).at("/data/id").asText();
        var derivedAsset = derivedAssets.save(new DerivedAssetEntity(UUID.fromString(alpha.userId()), "MOMENT",
                UUID.fromString(privateMomentId), "derived/account-delete-card.png"));
        String betaShared = mvc.perform(post("/moments").header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(textMoment("SHARED")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String betaSharedId = mapper.readTree(betaShared).at("/data/id").asText();
        mvc.perform(put("/moments/{id}/reaction", betaSharedId).header("Authorization", bearer(alpha.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\":\"懂你\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/moments/{id}/comments", betaSharedId).header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"delete me\"}"))
                .andExpect(status().isCreated());

        mvc.perform(post("/me/deletion-requests").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"confirm_text\":\"错误文案\",\"reason\":\"误触测试\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("CONFIRM_TEXT_MISMATCH"));

        String created = mvc.perform(post("/me/deletion-requests").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"confirm_text\":\"确认注销\",\"reason\":\"不再使用\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.request.status").value("PENDING"))
                .andExpect(jsonPath("$.data.request.reason").value("不再使用"))
                .andExpect(jsonPath("$.data.status_token").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        JsonNode data = mapper.readTree(created).path("data");
        String requestId = data.path("request").path("id").asText();
        String statusToken = data.path("status_token").asText();

        Assertions.assertEquals(DomainEnums.UserStatus.DELETING,
                users.findById(UUID.fromString(alpha.userId())).orElseThrow().getStatus());
        Assertions.assertFalse(members.existsById(UUID.fromString(alpha.userId())));
        Assertions.assertFalse(members.existsById(UUID.fromString(beta.userId())));
        Assertions.assertEquals(1, deletionRequests.count());
        Assertions.assertEquals(1, auditLogs.countByAction("ACCOUNT_DELETION_REQUEST"));
        Assertions.assertEquals(1, auditLogs.countByAction("COUPLE_FREEZE_ACCOUNT_DELETION"));

        mvc.perform(get("/me").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("SESSION_EXPIRED"));
        mvc.perform(post("/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refresh_token\":\"" + alpha.refreshToken() + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("SESSION_EXPIRED"));
        mvc.perform(get("/couples/current").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist());
        mvc.perform(get("/messages").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].type").value("SYSTEM"));

        mvc.perform(get("/deletion-requests/{id}/status", requestId).param("token", statusToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(requestId))
                .andExpect(jsonPath("$.data.status").value("PENDING"));
        mvc.perform(get("/deletion-requests/{id}/status", requestId).param("token", "bad-token"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("DELETION_STATUS_FORBIDDEN"));

        var failedRequest = deletionRequests.findById(UUID.fromString(requestId)).orElseThrow();
        failedRequest.markFailed("COS_DELETE_TIMEOUT");
        deletionRequests.save(failedRequest);
        mvc.perform(get("/deletion-requests/{id}/status", requestId).param("token", statusToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("FAILED"))
                .andExpect(jsonPath("$.data.failure_reason").value("COS_DELETE_TIMEOUT"));
        mvc.perform(post("/internal/deletion-requests/{id}/retry", requestId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("INTERNAL_OPERATION_FORBIDDEN"));
        mvc.perform(post("/internal/deletion-requests/{id}/retry", requestId)
                        .header("X-Internal-Operation-Token", INTERNAL_TOKEN)
                        .header("X-Internal-Operator", "ops-a"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING"));
        Assertions.assertEquals(1, auditLogs.countByAction("ACCOUNT_DELETION_RETRY"));

        mvc.perform(post("/internal/deletion-requests/process"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("INTERNAL_OPERATION_FORBIDDEN"));
        mvc.perform(post("/internal/deletion-requests/process").header("X-Internal-Operation-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.processed").value(1))
                .andExpect(jsonPath("$.data.completed").value(1))
                .andExpect(jsonPath("$.data.failed").value(0))
                .andExpect(jsonPath("$.data.trashed_moments").value(1))
                .andExpect(jsonPath("$.data.deleted_media_assets").value(1))
                .andExpect(jsonPath("$.data.deleted_comments").value(1))
                .andExpect(jsonPath("$.data.deleted_reactions").value(1))
                .andExpect(jsonPath("$.data.deleted_derived_assets").value(1));

        mvc.perform(get("/deletion-requests/{id}/status", requestId).param("token", statusToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.completed_at").isNotEmpty())
                .andExpect(jsonPath("$.data.processed_moments").value(1))
                .andExpect(jsonPath("$.data.processed_media_assets").value(1))
                .andExpect(jsonPath("$.data.processed_comments").value(1))
                .andExpect(jsonPath("$.data.processed_reactions").value(1))
                .andExpect(jsonPath("$.data.processed_derived_assets").value(1));
        Assertions.assertEquals(DomainEnums.UserStatus.DISABLED,
                users.findById(UUID.fromString(alpha.userId())).orElseThrow().getStatus());
        var deletedMoment = moments.findById(UUID.fromString(privateMomentId)).orElseThrow();
        Assertions.assertEquals(DomainEnums.MomentStatus.TRASHED, deletedMoment.getStatus());
        Assertions.assertEquals(DomainEnums.Visibility.PRIVATE, deletedMoment.getVisibility());
        Assertions.assertNull(deletedMoment.getCoupleId());
        Assertions.assertEquals("该记录已随账号注销删除", deletedMoment.getBody());
        Assertions.assertEquals(DomainEnums.MediaStatus.DELETED, assets.findById(UUID.fromString(assetId)).orElseThrow().getStatus());
        Assertions.assertEquals(DomainEnums.DerivedAssetStatus.DELETED, derivedAssets.findById(derivedAsset.getId()).orElseThrow().getStatus());
        Assertions.assertTrue(comments.findByAuthorIdOrderByCreatedAtAsc(UUID.fromString(alpha.userId())).isEmpty());
        Assertions.assertTrue(reactions.findByActorIdOrderByUpdatedAtAsc(UUID.fromString(alpha.userId())).isEmpty());
        Assertions.assertEquals(1, auditLogs.countByAction("ACCOUNT_DELETION_COMPLETED"));

        Login relogin = login("delete-alpha");
        Assertions.assertNotEquals(alpha.userId(), relogin.userId());
    }

    @Test
    void shouldReplayInvitationAndAllowRePairingWithoutRestoringOldSpace() throws Exception {
        Login alpha = login("alpha");
        Login beta = login("beta");
        String idempotencyKey = UUID.randomUUID().toString();

        String first = mvc.perform(post("/couple-invitations").header("Authorization", bearer(alpha.accessToken())).header("Idempotency-Key", idempotencyKey))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String token = mapper.readTree(first).at("/data/token").asText();
        String replay = mvc.perform(post("/couple-invitations").header("Authorization", bearer(alpha.accessToken())).header("Idempotency-Key", idempotencyKey))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Assertions.assertEquals(token, mapper.readTree(replay).at("/data/token").asText());

        mvc.perform(get("/couple-invitations/{token}/preview", token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.inviter_nickname").value(containsString("alpha")));
        mvc.perform(post("/couple-invitations/{token}/accept", token).header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rules_confirmed\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PAIRED"));

        mvc.perform(get("/me").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.relationship_status").value("PAIRED"));
        mvc.perform(patch("/couples/current").header("Authorization", bearer(beta.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":0,\"relationship_name\":\"测试空间\",\"anniversary\":\"2026-05-20\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.relationship_name").value("测试空间"));

        String created = mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(textMoment("SHARED")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.status").value("PUBLISHED"))
                .andReturn().getResponse().getContentAsString();
        String momentId = mapper.readTree(created).at("/data/id").asText();

        mvc.perform(get("/moments/{id}", momentId).header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.body").value("值得记住的普通一天"));
        mvc.perform(get("/timeline").header("Authorization", bearer(beta.accessToken()))
                        .param("from", "2026-01-01T00:00:00Z").param("to", "2027-01-01T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].id").value(momentId));

        String current = mvc.perform(get("/couples/current").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        int version = mapper.readTree(current).at("/data/version").asInt();
        mvc.perform(post("/couples/current/unbind").header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"version\":" + version + ",\"confirm_text\":\"确认解绑\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("FROZEN"));

        mvc.perform(get("/moments/{id}", momentId).header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("RESOURCE_FORBIDDEN"));
        mvc.perform(get("/moments/{id}", momentId).header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk());

        for (Login user : new Login[]{alpha, beta}) {
            mvc.perform(get("/couples/current").header("Authorization", bearer(user.accessToken())))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data").doesNotExist());
            mvc.perform(get("/me").header("Authorization", bearer(user.accessToken())))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.relationship_status").value("UNPAIRED"));
        }
        String renewed = mvc.perform(post("/couple-invitations").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String renewedToken = mapper.readTree(renewed).at("/data/token").asText();
        Assertions.assertNotEquals(token, renewedToken);
        mvc.perform(post("/couple-invitations/{token}/accept", token).header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rules_confirmed\":true}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("INVITATION_NOT_ACTIVE"));
        String rePaired = mvc.perform(post("/couple-invitations/{token}/accept", renewedToken)
                        .header("Authorization", bearer(beta.accessToken())).header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rules_confirmed\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PAIRED"))
                .andReturn().getResponse().getContentAsString();
        String oldCoupleId = mapper.readTree(current).at("/data/id").asText();
        String newCoupleId = mapper.readTree(rePaired).at("/data/id").asText();
        Assertions.assertNotEquals(oldCoupleId, newCoupleId);
        Assertions.assertEquals(DomainEnums.CoupleStatus.FROZEN, couples.findById(UUID.fromString(oldCoupleId)).orElseThrow().getStatus());
        for (Login user : new Login[]{alpha, beta}) {
            mvc.perform(get("/couples/current").header("Authorization", bearer(user.accessToken())))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(newCoupleId));
        }
        mvc.perform(get("/moments/{id}", momentId).header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isForbidden());
        mvc.perform(get("/moments/{id}", momentId).header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk());
    }

    @Test
    void shouldSupportRealReactionsAndCommentsOnSharedMoment() throws Exception {
        Login alpha = login("interaction-alpha");
        Login beta = login("interaction-beta");
        String invitation = mvc.perform(post("/couple-invitations").header("Authorization", bearer(alpha.accessToken())).header("Idempotency-Key", UUID.randomUUID()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String token = mapper.readTree(invitation).at("/data/token").asText();
        mvc.perform(post("/couple-invitations/{token}/accept", token).header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rules_confirmed\":true}"))
                .andExpect(status().isOk());

        String created = mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(textMoment("SHARED")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String momentId = mapper.readTree(created).at("/data/id").asText();

        mvc.perform(put("/moments/{id}/reaction", momentId).header("Authorization", bearer(beta.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\":\"抱抱\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.my_reaction.value").value("抱抱"))
                .andExpect(jsonPath("$.data.reactions", hasSize(1)));
        mvc.perform(put("/moments/{id}/reaction", momentId).header("Authorization", bearer(beta.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\":\"懂你\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.my_reaction.value").value("懂你"))
                .andExpect(jsonPath("$.data.reactions", hasSize(1)));

        String commentKey = UUID.randomUUID().toString();
        String comment = mvc.perform(post("/moments/{id}/comments", momentId).header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", commentKey)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"我也记得这天。\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.comments", hasSize(1)))
                .andExpect(jsonPath("$.data.comments[0].author_id").value(beta.userId()))
                .andExpect(jsonPath("$.data.comments[0].body").value("我也记得这天。"))
                .andReturn().getResponse().getContentAsString();
        String commentId = mapper.readTree(comment).at("/data/comments/0/id").asText();
        mvc.perform(post("/moments/{id}/comments", momentId).header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", commentKey)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"我也记得这天。\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.comments", hasSize(1)));

        mvc.perform(get("/moments/{id}", momentId).header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.my_reaction").doesNotExist())
                .andExpect(jsonPath("$.data.reactions[0].value").value("懂你"))
                .andExpect(jsonPath("$.data.comments[0].author_id").value(beta.userId()));

        mvc.perform(delete("/moments/{id}/comments/{commentId}", momentId, commentId)
                        .header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("RESOURCE_FORBIDDEN"));
        mvc.perform(delete("/moments/{id}/comments/{commentId}", momentId, commentId)
                        .header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.comments", hasSize(0)));
        Assertions.assertTrue(comments.findByMomentIdOrderByCreatedAtAsc(UUID.fromString(momentId)).isEmpty());
        Assertions.assertEquals(1, auditLogs.countByAction("MOMENT_COMMENT_DELETE"));
        mvc.perform(get("/messages").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items", hasSize(1)))
                .andExpect(jsonPath("$.data.items[0].type").value("REACTION"))
                .andExpect(jsonPath("$.data.items[0].aggregate_count").value(2));

        String privateMoment = mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(textMoment("PRIVATE")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String privateMomentId = mapper.readTree(privateMoment).at("/data/id").asText();
        mvc.perform(post("/moments/{id}/comments", privateMomentId).header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"这条不能互动\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("INTERACTION_NOT_ALLOWED"));

        String current = mvc.perform(get("/couples/current").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        int version = mapper.readTree(current).at("/data/version").asInt();
        mvc.perform(post("/couples/current/unbind").header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"version\":" + version + ",\"confirm_text\":\"确认解绑\"}"))
                .andExpect(status().isOk());
        mvc.perform(put("/moments/{id}/reaction", momentId).header("Authorization", bearer(beta.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\":\"心动\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("INTERACTION_NOT_ALLOWED"));
    }

    @Test
    void shouldCreateAndReadInAppMessagesForSharedInteractions() throws Exception {
        Login alpha = login("message-alpha");
        Login beta = login("message-beta");
        String invitation = mvc.perform(post("/couple-invitations").header("Authorization", bearer(alpha.accessToken())).header("Idempotency-Key", UUID.randomUUID()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String token = mapper.readTree(invitation).at("/data/token").asText();
        mvc.perform(post("/couple-invitations/{token}/accept", token).header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rules_confirmed\":true}"))
                .andExpect(status().isOk());

        String created = mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content(textMoment("SHARED")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String momentId = mapper.readTree(created).at("/data/id").asText();

        String betaMessages = mvc.perform(get("/messages").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unread_count").value(1))
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.has_more").value(false))
                .andExpect(jsonPath("$.data.items[0].type").value("MOMENT"))
                .andExpect(jsonPath("$.data.items[0].moment_id").value(momentId))
                .andExpect(jsonPath("$.data.items[0].read_at").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String betaMessageId = mapper.readTree(betaMessages).at("/data/items/0/id").asText();
        mvc.perform(post("/messages/{id}/read", betaMessageId).header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("MESSAGE_NOT_FOUND"));
        mvc.perform(post("/messages/{id}/read", betaMessageId).header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.read_at").isNotEmpty());
        mvc.perform(get("/messages").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unread_count").value(0));

        mvc.perform(put("/moments/{id}/reaction", momentId).header("Authorization", bearer(beta.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\":\"抱抱\"}"))
                .andExpect(status().isOk());
        String commentKey = UUID.randomUUID().toString();
        mvc.perform(post("/moments/{id}/comments", momentId).header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", commentKey)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"这一段我也很喜欢。\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/moments/{id}/comments", momentId).header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", commentKey)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"这一段我也很喜欢。\"}"))
                .andExpect(status().isCreated());

        mvc.perform(get("/messages").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unread_count").value(2))
                .andExpect(jsonPath("$.data.items", hasSize(2)))
                .andExpect(jsonPath("$.data.items[0].type").value("COMMENT"))
                .andExpect(jsonPath("$.data.items[1].type").value("REACTION"));
        mvc.perform(post("/messages/read-all").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.read_count").value(2));
        mvc.perform(get("/messages").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.unread_count").value(0));
    }

    @Test
    void shouldSupportRealPetStateDailyActionsAndUnbindIsolation() throws Exception {
        Login solo = login("pet-solo");
        mvc.perform(get("/pet/current").header("Authorization", bearer(solo.accessToken())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("COUPLE_NOT_FOUND"));

        Login alpha = login("pet-alpha");
        Login beta = login("pet-beta");
        String invitation = mvc.perform(post("/couple-invitations").header("Authorization", bearer(alpha.accessToken())).header("Idempotency-Key", UUID.randomUUID()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String token = mapper.readTree(invitation).at("/data/token").asText();
        mvc.perform(post("/couple-invitations/{token}/accept", token).header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rules_confirmed\":true}"))
                .andExpect(status().isOk());

        mvc.perform(get("/pet/current").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.adoption_state").value("NOT_STARTED"));

        mvc.perform(post("/pet/adoption-proposals").header("Authorization", bearer(alpha.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"云朵猫\",\"name\":\"团子\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.adoption_state").value("PENDING_CONFIRMATION"))
                .andExpect(jsonPath("$.data.adoption.name").value("团子"))
                .andExpect(jsonPath("$.data.adoption.proposed_by_me").value(true));
        mvc.perform(post("/pet/adoption-proposals/confirm").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("ADOPTION_SELF_CONFIRM_NOT_ALLOWED"));
        mvc.perform(post("/pet/adoption-proposals/confirm").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.adoption_state").value("ADOPTED"))
                .andExpect(jsonPath("$.data.name").value("团子"))
                .andExpect(jsonPath("$.data.kind").value("云朵猫"))
                .andExpect(jsonPath("$.data.level").value(1))
                .andExpect(jsonPath("$.data.growth").value(0))
                .andExpect(jsonPath("$.data.fed_today").value(false))
                .andExpect(jsonPath("$.data.played_today").value(false));

        String feedKey = UUID.randomUUID().toString();
        mvc.perform(post("/pet/current/actions").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", feedKey)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"FEED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.changed").value(true))
                .andExpect(jsonPath("$.data.growth_delta").value(8))
                .andExpect(jsonPath("$.data.pet.growth").value(8))
                .andExpect(jsonPath("$.data.pet.fed_today").value(true))
                .andExpect(jsonPath("$.data.pet.logs[0].mine").value(true));
        mvc.perform(post("/pet/current/actions").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"FEED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.changed").value(false))
                .andExpect(jsonPath("$.data.pet.growth").value(8));
        mvc.perform(post("/pet/current/actions").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"PLAY\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.changed").value(true))
                .andExpect(jsonPath("$.data.pet.growth").value(16))
                .andExpect(jsonPath("$.data.pet.played_today").value(true));

        mvc.perform(get("/pet/current").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.growth").value(16))
                .andExpect(jsonPath("$.data.fed_today").value(false))
                .andExpect(jsonPath("$.data.played_today").value(false))
                .andExpect(jsonPath("$.data.logs[0].mine").value(false));
        mvc.perform(get("/messages").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].type").value("PET"));

        String current = mvc.perform(get("/couples/current").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        int version = mapper.readTree(current).at("/data/version").asInt();
        mvc.perform(post("/couples/current/unbind").header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"version\":" + version + ",\"confirm_text\":\"确认解绑\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/pet/current").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("COUPLE_NOT_FOUND"));
    }

    @Test
    void shouldRewardRelationshipGrowthCapItAndReverseMomentRewards() throws Exception {
        Login alpha = login("pet-growth-alpha");
        Login beta = login("pet-growth-beta");
        String invitation = mvc.perform(post("/couple-invitations").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String token = mapper.readTree(invitation).at("/data/token").asText();
        mvc.perform(post("/couple-invitations/{token}/accept", token).header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rules_confirmed\":true}"))
                .andExpect(status().isOk());
        mvc.perform(post("/pet/adoption-proposals").header("Authorization", bearer(alpha.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"云朵猫\",\"name\":\"团子\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/pet/adoption-proposals/confirm").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk());

        String first = mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(validSharedTextMoment()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String firstId = mapper.readTree(first).at("/data/id").asText();
        mvc.perform(put("/moments/{id}/reaction", firstId).header("Authorization", bearer(beta.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\":\"心动\"}"))
                .andExpect(status().isOk());

        String second = mvc.perform(post("/moments").header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(validSharedTextMoment()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String secondId = mapper.readTree(second).at("/data/id").asText();
        mvc.perform(put("/moments/{id}/reaction", secondId).header("Authorization", bearer(alpha.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"value\":\"抱抱\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/pet/current").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.growth").value(20))
                .andExpect(jsonPath("$.data.relationship_growth_today").value(20))
                .andExpect(jsonPath("$.data.relationship_daily_cap").value(20))
                .andExpect(jsonPath("$.data.max_level").value(10))
                .andExpect(jsonPath("$.data.next_unlock_level").value(2));

        mvc.perform(delete("/moments/{id}", firstId).param("version", "0")
                        .header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isNoContent());
        mvc.perform(get("/pet/current").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.growth").value(10))
                .andExpect(jsonPath("$.data.relationship_growth_today").value(10));
        mvc.perform(post("/moments/{id}/restore", firstId).header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk());
        mvc.perform(get("/pet/current").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.growth").value(20))
                .andExpect(jsonPath("$.data.relationship_growth_today").value(20));
    }

    @Test
    void shouldSupportRealAnnualRecapDraftGenerationAndIsolation() throws Exception {
        Login solo = login("recap-solo");
        mvc.perform(get("/recaps/current").header("Authorization", bearer(solo.accessToken())).param("year", "2026"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("COUPLE_NOT_FOUND"));

        Login alpha = login("recap-alpha");
        Login beta = login("recap-beta");
        String invitation = mvc.perform(post("/couple-invitations").header("Authorization", bearer(alpha.accessToken())).header("Idempotency-Key", UUID.randomUUID()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String token = mapper.readTree(invitation).at("/data/token").asText();
        mvc.perform(post("/couple-invitations/{token}/accept", token).header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rules_confirmed\":true}"))
                .andExpect(status().isOk());

        String calm = mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(recapMoment("SHARED", "CALM", "DAILY", "一起散步")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String calmId = mapper.readTree(calm).at("/data/id").asText();
        String sensitive = mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(recapMoment("SHARED", "ANGRY", "CONFLICT", "争执后和好")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String sensitiveId = mapper.readTree(sensitive).at("/data/id").asText();
        String privateMoment = mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(recapMoment("PRIVATE", "CALM", "DAILY", "只给自己")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String privateId = mapper.readTree(privateMoment).at("/data/id").asText();

        mvc.perform(get("/recaps/current/candidates").header("Authorization", bearer(beta.accessToken())).param("year", "2026"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items", hasSize(1)))
                .andExpect(jsonPath("$.data.items[0].id").value(calmId))
                .andExpect(jsonPath("$.data.excluded_count").value(1));

        mvc.perform(patch("/recaps/current").header("Authorization", bearer(beta.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"year\":2026,\"title\":\"我们的 2026\",\"selected_moment_ids\":[\"" + sensitiveId + "\"]}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("RECAP_MOMENT_NOT_ALLOWED"));
        mvc.perform(patch("/recaps/current").header("Authorization", bearer(beta.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"year\":2026,\"title\":\"我们的 2026\",\"selected_moment_ids\":[\"" + privateId + "\"]}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("RECAP_MOMENT_NOT_ALLOWED"));

        mvc.perform(patch("/recaps/current").header("Authorization", bearer(beta.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"year\":2026,\"title\":\"我们的 2026\",\"selected_moment_ids\":[\"" + calmId + "\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.selected_moment_ids[0]").value(calmId))
                .andExpect(jsonPath("$.data.selected_moments[0].id").value(calmId));

        mvc.perform(post("/recaps/current/generate").header("Authorization", bearer(beta.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"year\":2026}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("READY"))
                .andExpect(jsonPath("$.data.generated_at").isNotEmpty());
        Assertions.assertEquals(1, auditLogs.countByAction("RECAP_UPDATE"));
        Assertions.assertEquals(1, auditLogs.countByAction("RECAP_GENERATE"));

        mvc.perform(get("/recaps/current").header("Authorization", bearer(alpha.accessToken())).param("year", "2026"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("READY"))
                .andExpect(jsonPath("$.data.selected_moments[0].id").value(calmId));

        String current = mvc.perform(get("/couples/current").header("Authorization", bearer(beta.accessToken())))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        int version = mapper.readTree(current).at("/data/version").asInt();
        mvc.perform(post("/couples/current/unbind").header("Authorization", bearer(beta.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"version\":" + version + ",\"confirm_text\":\"确认解绑\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/recaps/current").header("Authorization", bearer(alpha.accessToken())).param("year", "2026"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("COUPLE_NOT_FOUND"));
    }

    @Test
    void shouldCreateAndCompleteLocalUploadSession() throws Exception {
        Login user = login("media-user");
        String created = mvc.perform(post("/upload-sessions").header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"file_name\":\"memory.jpg\",\"mime_type\":\"image/jpeg\",\"size\":1024}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.provider").value("LOCAL"))
                .andReturn().getResponse().getContentAsString();
        String sessionId = mapper.readTree(created).at("/data/upload_session_id").asText();
        String assetId = mapper.readTree(created).at("/data/asset_id").asText();
        mvc.perform(post("/upload-sessions/{id}/complete", sessionId).header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"etag\":\"test\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("READY"));
        mvc.perform(get("/media-assets/{id}", assetId).header("Authorization", bearer(user.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.kind").value("IMAGE"))
                .andExpect(jsonPath("$.data.access_url", startsWith("local://")));

        String moment = mvc.perform(post("/moments").header("Authorization", bearer(user.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(imageMoment(assetId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.data.media[0].id").value(assetId))
                .andExpect(jsonPath("$.data.media[0].access_url", startsWith("local://")))
                .andReturn().getResponse().getContentAsString();

        String momentId = mapper.readTree(moment).at("/data/id").asText();
        mvc.perform(get("/moments/{id}", momentId).header("Authorization", bearer(user.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.media[0].status").value("READY"));
    }

    @Test
    void shouldRegisterTemplateRenderAndPreferRenderedImageWhenPublishingMoment() throws Exception {
        Login owner = login("template-owner");
        Login stranger = login("template-stranger");
        String sourceAssetId = uploadImage(owner, "source.jpg");
        String renderedAssetId = uploadImage(owner, "template-output.jpg");

        mvc.perform(post("/template-renders").header("Authorization", bearer(stranger.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"source_asset_ids\":[\"" + sourceAssetId + "\"],\"rendered_asset_id\":\"" + renderedAssetId
                                + "\",\"template_id\":\"cream-film\",\"template_version\":1,\"render_config\":\"{\\\"showDate\\\":true}\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("RESOURCE_FORBIDDEN"));

        mvc.perform(post("/template-renders").header("Authorization", bearer(owner.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"source_asset_ids\":[\"" + sourceAssetId + "\"],\"rendered_asset_id\":\"" + renderedAssetId
                                + "\",\"template_id\":\"cream-film\",\"template_version\":1,\"render_config\":\"{\\\"showDate\\\":true,\\\"sticker\\\":\\\"flower\\\"}\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.template_id").value("cream-film"))
                .andExpect(jsonPath("$.data.template_version").value(1))
                .andExpect(jsonPath("$.data.source_asset_ids[0]").value(sourceAssetId))
                .andExpect(jsonPath("$.data.rendered_asset_id").value(renderedAssetId));

        String moment = mvc.perform(post("/moments").header("Authorization", bearer(owner.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(imageMoment(sourceAssetId, renderedAssetId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.data.media", hasSize(1)))
                .andExpect(jsonPath("$.data.media[0].id").value(renderedAssetId))
                .andExpect(jsonPath("$.data.template.template_id").value("cream-film"))
                .andReturn().getResponse().getContentAsString();

        String momentId = mapper.readTree(moment).at("/data/id").asText();
        var render = derivedAssets.findByRenderedMediaAssetId(UUID.fromString(renderedAssetId)).orElseThrow();
        Assertions.assertEquals(UUID.fromString(owner.userId()), render.getOwnerId());
        Assertions.assertEquals(UUID.fromString(sourceAssetId), render.getSourceAssetIds().getFirst());
        Assertions.assertEquals("cream-film", render.getTemplateId());
        Assertions.assertEquals(1, render.getTemplateVersion());
        Assertions.assertEquals(1, auditLogs.countByAction("TEMPLATE_RENDER_REGISTER"));

        mvc.perform(get("/moments/{id}", momentId).header("Authorization", bearer(owner.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.media", hasSize(1)))
                .andExpect(jsonPath("$.data.media[0].id").value(renderedAssetId));
    }

    @Test
    void shouldPageTimelineWithoutDuplicates() throws Exception {
        Login user = login("timeline-page-user");
        for (int index = 0; index < 3; index++) {
            mvc.perform(post("/moments").header("Authorization", bearer(user.accessToken()))
                            .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                            .content(textMomentAt("PRIVATE", Instant.parse("2026-06-0" + (index + 1) + "T12:00:00Z"))))
                    .andExpect(status().isCreated());
        }

        String first = mvc.perform(get("/timeline").header("Authorization", bearer(user.accessToken()))
                        .param("from", "2026-06-01T00:00:00Z")
                        .param("to", "2026-07-01T00:00:00Z")
                        .param("limit", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items", hasSize(2)))
                .andExpect(jsonPath("$.data.has_more").value(true))
                .andExpect(jsonPath("$.data.next_cursor").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        JsonNode firstData = mapper.readTree(first).path("data");
        String cursor = firstData.path("next_cursor").asText();
        String second = mvc.perform(get("/timeline").header("Authorization", bearer(user.accessToken()))
                        .param("from", "2026-06-01T00:00:00Z")
                        .param("to", "2026-07-01T00:00:00Z")
                        .param("limit", "2")
                        .param("cursor", cursor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items", hasSize(1)))
                .andExpect(jsonPath("$.data.has_more").value(false))
                .andReturn().getResponse().getContentAsString();

        String lastFirstPageId = firstData.path("items").get(1).path("id").asText();
        String firstSecondPageId = mapper.readTree(second).at("/data/items/0/id").asText();
        Assertions.assertNotEquals(lastFirstPageId, firstSecondPageId);
    }

    @Test
    void shouldRotateRefreshTokenAndRejectItsReuse() throws Exception {
        Login login = login("refresh-user");
        String refreshed = mvc.perform(post("/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refresh_token\":\"" + login.refreshToken() + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.refresh_token").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        Assertions.assertNotEquals(login.refreshToken(), mapper.readTree(refreshed).at("/data/refresh_token").asText());

        mvc.perform(post("/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refresh_token\":\"" + login.refreshToken() + "\"}"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("SESSION_EXPIRED"));
    }

    @Test
    void shouldReplayMomentProtectPrivateContentAndSupportRecycleBin() throws Exception {
        Login owner = login("moment-owner");
        Login stranger = login("moment-stranger");
        String key = UUID.randomUUID().toString();
        String first = mvc.perform(post("/moments").header("Authorization", bearer(owner.accessToken()))
                        .header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(textMoment("PRIVATE")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String second = mvc.perform(post("/moments").header("Authorization", bearer(owner.accessToken()))
                        .header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(textMoment("PRIVATE")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = mapper.readTree(first).at("/data/id").asText();
        Assertions.assertEquals(id, mapper.readTree(second).at("/data/id").asText());

        mvc.perform(get("/moments/{id}", id).header("Authorization", bearer(stranger.accessToken())))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/moments/{id}", id).header("Authorization", bearer(owner.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":99,\"body\":\"修改\",\"occurred_at\":\"" + Instant.now() + "\",\"visibility\":\"PRIVATE\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("VERSION_CONFLICT"));

        mvc.perform(patch("/moments/{id}", id).header("Authorization", bearer(owner.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":0,\"title\":\"修改后\",\"body\":\"修改后的正文\",\"occurred_at\":\"" + Instant.now() + "\",\"visibility\":\"PRIVATE\",\"mood\":\"HEARTBEAT\",\"events\":[\"TRAVEL\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(1))
                .andExpect(jsonPath("$.data.mood").value("HEARTBEAT"))
                .andExpect(jsonPath("$.data.events[0]").value("TRAVEL"));

        mvc.perform(delete("/moments/{id}", id).param("version", "1").header("Authorization", bearer(owner.accessToken())))
                .andExpect(status().isNoContent());
        mvc.perform(get("/moments/{id}", id).header("Authorization", bearer(owner.accessToken())))
                .andExpect(status().isForbidden());
        mvc.perform(get("/moments/trash").header("Authorization", bearer(owner.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(id));
        mvc.perform(post("/moments/{id}/restore", id).header("Authorization", bearer(owner.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.visibility").value("PRIVATE"));
    }

    @Test
    void shouldReturnValidationErrorsForMalformedJsonAndUnsupportedMedia() throws Exception {
        Login user = login("validation-user");
        mvc.perform(post("/upload-sessions").header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"file_name\":\"document.pdf\",\"mime_type\":\"application/pdf\",\"size\":1024}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(post("/upload-sessions").header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"file_name\":\"missing-duration.mp4\",\"mime_type\":\"video/mp4\",\"size\":1024}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
        mvc.perform(post("/upload-sessions").header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"file_name\":\"too-long.mp4\",\"mime_type\":\"video/mp4\",\"size\":1024,\"duration_seconds\":61}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.details.max_duration_seconds").value(60));
        mvc.perform(post("/upload-sessions").header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"file_name\":\"short.mp4\",\"mime_type\":\"video/mp4\",\"size\":1024,\"duration_seconds\":30}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/moments").header("Authorization", bearer(user.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content("{broken"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void shouldAllowOnlyUploaderToRetryFailedMediaProcessing() throws Exception {
        Login owner = login("retry-media-owner");
        Login stranger = login("retry-media-stranger");
        MediaAssetEntity asset = new MediaAssetEntity(UUID.fromString(owner.userId()), DomainEnums.MediaKind.VIDEO,
                "original/retry-" + UUID.randomUUID() + ".mp4", null, "video/mp4", 1024, 30);
        asset.markFailed();
        assets.saveAndFlush(asset);

        mvc.perform(post("/media-assets/{id}/retry-processing", asset.getId()).header("Authorization", bearer(stranger.accessToken())))
                .andExpect(status().isForbidden());
        mvc.perform(post("/media-assets/{id}/retry-processing", asset.getId()).header("Authorization", bearer(owner.accessToken())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PROCESSING"))
                .andExpect(jsonPath("$.data.duration_seconds").value(30));
        mvc.perform(post("/media-assets/{id}/retry-processing", asset.getId()).header("Authorization", bearer(owner.accessToken())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("MEDIA_NOT_RETRYABLE"));
    }

    @Test
    void shouldReturnMissingVideoCoverThroughTimelineAndDetailWithoutLeakingAccess() throws Exception {
        Login owner=login("video-cover-owner"),partner=login("video-cover-partner"),stranger=login("video-cover-stranger");
        pair(owner,partner);
        MediaAssetEntity asset=new MediaAssetEntity(UUID.fromString(owner.userId()),DomainEnums.MediaKind.VIDEO,"original/fallback.mp4",null,"video/mp4",1024,30);
        asset.markReady("original/fallback.mp4",null);assets.saveAndFlush(asset);
        String created=mvc.perform(post("/moments").header("Authorization",bearer(owner.accessToken())).header("Idempotency-Key",UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"VIDEO\",\"body\":\"视频封面\",\"occurred_at\":\"2026-06-20T12:00:00Z\",\"visibility\":\"SHARED\",\"asset_ids\":[\""+asset.getId()+"\"]}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String momentId=mapper.readTree(created).at("/data/id").asText();
        for(Login viewer:new Login[]{owner,partner}) {
            mvc.perform(get("/moments/{id}",momentId).header("Authorization",bearer(viewer.accessToken())))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.media[0].thumbnail_url").value("local://thumbnail/fallback.jpg"));
            mvc.perform(get("/timeline").header("Authorization",bearer(viewer.accessToken())).param("from","2026-01-01T00:00:00Z").param("to","2026-12-31T23:59:59Z"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].media[0].thumbnail_url").value("local://thumbnail/fallback.jpg"));
        }
        mvc.perform(get("/moments/{id}",momentId).header("Authorization",bearer(stranger.accessToken()))).andExpect(status().isForbidden());
    }

    @Test
    void shouldAcceptAuthenticatedCosUploadFailureDiagnostic() throws Exception {
        Login user=login("cos-diagnostic-user");
        String created=mvc.perform(post("/upload-sessions").header("Authorization",bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"file_name\":\"photo.jpg\",\"mime_type\":\"image/jpeg\",\"size\":1024}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String uploadSessionId=mapper.readTree(created).at("/data/upload_session_id").asText();

        mvc.perform(post("/media-diagnostics/cos-upload-failures").header("Authorization",bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"upload_session_id\":\""+uploadSessionId+"\",\"status_code\":403,\"provider_code\":\"AccessDenied\",\"provider_message\":\"Access Denied.\",\"provider_request_id\":\"request-123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accepted").value(true));
    }

    @Test
    void shouldKeepAlbumInsideCurrentCoupleAndExcludeUnavailablePhotos() throws Exception {
        Login alpha = login("album-alpha");
        Login beta = login("album-beta");
        Login gamma = login("album-gamma");
        Login stranger = login("album-stranger");
        mvc.perform(get("/couples/current/album")).andExpect(status().isUnauthorized());
        mvc.perform(get("/couples/current/album").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(0)));
        pair(alpha, beta);
        String oldAsset = uploadImage(alpha, "old-album.jpg");
        mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(imageMoment(oldAsset).replace("PRIVATE", "SHARED")))
                .andExpect(status().isCreated());
        String current = mvc.perform(get("/couples/current").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        int version = mapper.readTree(current).at("/data/version").asInt();
        mvc.perform(post("/couples/current/unbind").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":" + version + ",\"confirm_text\":\"确认解绑\"}"))
                .andExpect(status().isOk());
        pair(alpha, gamma);
        mvc.perform(get("/couples/current/album").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(0)));
        String privateAsset = uploadImage(alpha, "private-album.jpg");
        mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(imageMoment(privateAsset))).andExpect(status().isCreated());
        mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(textMoment("SHARED"))).andExpect(status().isCreated());
        for (int index = 0; index < 7; index++) {
            Login author = index % 2 == 0 ? alpha : gamma;
            String asset = uploadImage(author, "album-" + index + ".jpg");
            mvc.perform(post("/moments").header("Authorization", bearer(author.accessToken()))
                            .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                            .content(imageMoment(asset).replace("PRIVATE", "SHARED")))
                    .andExpect(status().isCreated());
        }
        String album = mvc.perform(get("/couples/current/album").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(6)))
                .andExpect(jsonPath("$.data[*].visibility", everyItem(is("SHARED"))))
                .andExpect(jsonPath("$.data[*].type", everyItem(is("IMAGE"))))
                .andReturn().getResponse().getContentAsString();
        String newestAsset = mapper.readTree(album).at("/data/0/media/0/id").asText();
        MediaAssetEntity failed = assets.findById(UUID.fromString(newestAsset)).orElseThrow();
        failed.markFailed(); assets.saveAndFlush(failed);
        mvc.perform(get("/couples/current/album").header("Authorization", bearer(gamma.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(6)))
                .andExpect(jsonPath("$.data[*].media[0].id", not(hasItem(newestAsset))))
                .andExpect(jsonPath("$.data[*].media[0].id", not(hasItem(privateAsset))))
                .andExpect(jsonPath("$.data[*].media[0].id", not(hasItem(oldAsset))));
        mvc.perform(get("/couples/current/album").header("Authorization", bearer(stranger.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(0)));
        String sourceAsset = uploadImage(alpha, "album-source.jpg");
        String renderedAsset = uploadImage(alpha, "album-template.jpg");
        mvc.perform(post("/template-renders").header("Authorization", bearer(alpha.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"source_asset_ids\":[\"" + sourceAsset + "\"],\"rendered_asset_id\":\"" + renderedAsset
                                + "\",\"template_id\":\"cream-film\",\"template_version\":1,\"render_config\":\"{}\"}"))
                .andExpect(status().isCreated());
        String templateMoment = mvc.perform(post("/moments").header("Authorization", bearer(alpha.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(imageMoment(sourceAsset, renderedAsset).replace("PRIVATE", "SHARED")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.media[0].id").value(renderedAsset))
                .andReturn().getResponse().getContentAsString();
        mvc.perform(get("/couples/current/album").header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].media[0].id").value(sourceAsset))
                .andExpect(jsonPath("$.data[*].media[*].id", not(hasItem(renderedAsset))));
        mvc.perform(get("/moments/{id}", mapper.readTree(templateMoment).at("/data/id").asText())
                        .header("Authorization", bearer(alpha.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.media[0].id").value(renderedAsset));
    }

    private Login login(String code) throws Exception {
        String body = mvc.perform(post("/auth/wechat/session").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.access_token").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        JsonNode data = mapper.readTree(body).path("data");
        return new Login(data.path("user_id").asText(), data.path("access_token").asText(), data.path("refresh_token").asText());
    }

    private void pair(Login inviter, Login acceptor) throws Exception {
        String invitation = mvc.perform(post("/couple-invitations").header("Authorization", bearer(inviter.accessToken())).header("Idempotency-Key", UUID.randomUUID()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String token = mapper.readTree(invitation).at("/data/token").asText();
        mvc.perform(post("/couple-invitations/{token}/accept", token).header("Authorization", bearer(acceptor.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rules_confirmed\":true}"))
                .andExpect(status().isOk());
    }

    private String textMoment(String visibility) {
        return textMomentAt(visibility, Instant.now());
    }
    private String validSharedTextMoment() {
        return "{\"type\":\"TEXT\",\"title\":\"普通一天\",\"body\":\"今天一起散步吃饭看晚霞，这是一段值得我们认真收藏的共同记忆。\",\"occurred_at\":\""
                + Instant.now() + "\",\"visibility\":\"SHARED\",\"mood\":\"CALM\",\"events\":[\"DAILY\"]}";
    }
    private String textMomentAt(String visibility, Instant occurredAt) {
        return "{\"type\":\"TEXT\",\"title\":\"普通一天\",\"body\":\"值得记住的普通一天\",\"occurred_at\":\"" + occurredAt + "\",\"visibility\":\"" + visibility + "\",\"mood\":\"CALM\",\"events\":[\"DAILY\"]}";
    }
    private String imageMoment(String assetId) {
        return "{\"type\":\"IMAGE\",\"title\":\"一张照片\",\"body\":\"真实媒体记录\",\"occurred_at\":\"" + Instant.now() + "\",\"visibility\":\"PRIVATE\",\"mood\":\"CALM\",\"events\":[\"DAILY\"],\"asset_ids\":[\"" + assetId + "\"]}";
    }
    private String imageMoment(String sourceAssetId, String renderedAssetId) {
        return "{\"type\":\"IMAGE\",\"title\":\"一张模板照片\",\"body\":\"真实模板媒体记录\",\"occurred_at\":\"" + Instant.now() + "\",\"visibility\":\"PRIVATE\",\"mood\":\"CALM\",\"events\":[\"DAILY\"],\"asset_ids\":[\"" + sourceAssetId + "\",\"" + renderedAssetId + "\"]}";
    }
    @Test
    void shouldWaitForInFlightAlbumBackfillAndDeleteItsFinalDerivatives() throws Exception {
        Login owner = login("album-backfill-delete-owner"), partner = login("album-backfill-delete-partner");
        pair(owner, partner);
        UUID ownerId=UUID.fromString(owner.userId()), coupleId=members.findById(ownerId).orElseThrow().getCoupleId();
        UUID assetId=UUID.fromString(uploadImage(owner,"backfill-delete.jpg"));
        var photo=assets.findById(assetId).orElseThrow();photo.attachToAlbum(coupleId);photo.markReady(null,null);assets.saveAndFlush(photo);
        var storage=org.mockito.Mockito.mock(com.lovenotes.server.storage.ObjectStorage.class);
        var entered=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);
        org.mockito.Mockito.when(storage.createDerivatives(DomainEnums.MediaKind.IMAGE,photo.getStorageKey())).thenAnswer(call->{
            entered.countDown();Assertions.assertTrue(release.await(5,java.util.concurrent.TimeUnit.SECONDS));
            return new com.lovenotes.server.storage.ObjectStorage.Derivatives("display/final.webp","thumbnail/final.webp");
        });
        var processing=new com.lovenotes.server.media.MediaProcessingService(assets,null,null,storage,null,null);
        var deleting=new com.lovenotes.server.media.MediaService(assets,null,null,null,storage,null);
        var transactions=new org.springframework.transaction.support.TransactionTemplate(new org.springframework.orm.jpa.JpaTransactionManager(entityManagers));
        try(var workers=java.util.concurrent.Executors.newFixedThreadPool(2)){
            var backfill=workers.submit(()->transactions.executeWithoutResult(tx->processing.backfillThumbnail(assetId)));
            Assertions.assertTrue(entered.await(5,java.util.concurrent.TimeUnit.SECONDS));
            var deleteStarted=new java.util.concurrent.CountDownLatch(1);
            var deletion=workers.submit(()->{deleteStarted.countDown();transactions.executeWithoutResult(tx->deleting.deleteAlbumPhoto(ownerId,coupleId,assetId));});
            try {
                Assertions.assertTrue(deleteStarted.await(5,java.util.concurrent.TimeUnit.SECONDS));
                Assertions.assertThrows(java.util.concurrent.TimeoutException.class,()->deletion.get(200,java.util.concurrent.TimeUnit.MILLISECONDS));
            } finally { release.countDown(); }
            backfill.get(5,java.util.concurrent.TimeUnit.SECONDS);deletion.get(5,java.util.concurrent.TimeUnit.SECONDS);
        }
        Assertions.assertEquals(DomainEnums.MediaStatus.DELETED,assets.findById(assetId).orElseThrow().getStatus());
        org.mockito.Mockito.verify(storage).deleteObjects(List.of(photo.getStorageKey(),"display/final.webp","thumbnail/final.webp"));
    }

    @Test
    void shouldDeleteOnlyOwnStandaloneAlbumPhotosFromTheCurrentSharedSpace() throws Exception {
        Login owner = login("album-delete-owner"), partner = login("album-delete-partner"), stranger = login("album-delete-stranger");
        pair(owner, partner);
        String asset = uploadImage(owner, "delete-album.jpg");
        String coupleId = members.findById(UUID.fromString(owner.userId())).orElseThrow().getCoupleId().toString();
        mvc.perform(post("/couples/current/album-photos").header("Authorization", bearer(owner.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"couple_id\":\"" + coupleId + "\",\"asset_ids\":[\"" + asset + "\"]}"))
                .andExpect(status().isOk());
        for (Login viewer : List.of(owner, partner)) {
            mvc.perform(get("/couples/current/album-photos").header("Authorization", bearer(viewer.accessToken())))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].id").value(asset));
        }
        for (Login denied : List.of(partner, stranger)) {
            mvc.perform(delete("/couples/current/album-photos/{id}", asset).param("couple_id", coupleId)
                            .header("Authorization", bearer(denied.accessToken())))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(delete("/couples/current/album-photos/{id}", asset).param("couple_id", UUID.randomUUID().toString())
                        .header("Authorization", bearer(owner.accessToken())))
                .andExpect(status().isConflict());
        String unattached = uploadImage(owner, "not-an-album.jpg");
        mvc.perform(delete("/couples/current/album-photos/{id}", unattached).param("couple_id", coupleId)
                        .header("Authorization", bearer(owner.accessToken())))
                .andExpect(status().isNotFound());
        for (int repeat = 0; repeat < 2; repeat++) {
            mvc.perform(delete("/couples/current/album-photos/{id}", asset).param("couple_id", coupleId)
                            .header("Authorization", bearer(owner.accessToken())))
                    .andExpect(status().isOk());
        }
        Assertions.assertEquals(DomainEnums.MediaStatus.DELETED, assets.findById(UUID.fromString(asset)).orElseThrow().getStatus());
        for (Login viewer : List.of(owner, partner)) {
            mvc.perform(get("/couples/current/album-photos").header("Authorization", bearer(viewer.accessToken())))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(0)));
        }
        mvc.perform(get("/media-assets/{id}/access-url", asset).header("Authorization", bearer(partner.accessToken())))
                .andExpect(status().isForbidden());
        Assertions.assertEquals(DomainEnums.MediaStatus.READY, assets.findById(UUID.fromString(unattached)).orElseThrow().getStatus());
    }

    @Test
    void shouldKeepUploadedAlbumPhotosSeparateFromMomentsAndRevokePartnerAccess() throws Exception {
        Login owner = login("direct-album-owner");
        Login partner = login("direct-album-partner");
        Login stranger = login("direct-album-stranger");
        pair(owner, partner);
        String asset = uploadImage(owner, "album-only.jpg");
        String originalUrl="local://"+assets.findById(UUID.fromString(asset)).orElseThrow().getStorageKey();
        String coupleId = members.findById(UUID.fromString(owner.userId())).orElseThrow().getCoupleId().toString();
        String body = "{\"couple_id\":\"" + coupleId + "\",\"asset_ids\":[\"" + asset + "\"]}";
        for (int repeat = 0; repeat < 2; repeat++) {
            mvc.perform(post("/couples/current/album-photos").header("Authorization", bearer(owner.accessToken()))
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].original_url").value(originalUrl));
        }
        Assertions.assertEquals(0, moments.count(), "Album upload must not publish a timeline moment");
        var savedPhoto = assets.findById(UUID.fromString(asset)).orElseThrow();
        org.springframework.test.util.ReflectionTestUtils.setField(savedPhoto, "createdAt", Instant.now().minusSeconds(172800));
        assets.saveAndFlush(savedPhoto);
        mediaCleanup.runBatch();
        Assertions.assertEquals(DomainEnums.MediaStatus.READY, assets.findById(savedPhoto.getId()).orElseThrow().getStatus(),
                "Album photos must not be deleted as expired orphan uploads");
        mvc.perform(get("/couples/current/album-photos").header("Authorization", bearer(partner.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id").value(asset))
                .andExpect(jsonPath("$.data[0].original_url").value(originalUrl))
                .andExpect(jsonPath("$.data[0].access_url", startsWith("local://")));
        mvc.perform(get("/media-assets/{id}/access-url", asset).header("Authorization", bearer(partner.accessToken())))
                .andExpect(status().isOk());
        mvc.perform(get("/media-assets/{id}/access-url", asset).header("Authorization", bearer(stranger.accessToken())))
                .andExpect(status().isForbidden());
        mvc.perform(post("/couples/current/album-photos").header("Authorization", bearer(partner.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        mvc.perform(post("/moments").header("Authorization", bearer(owner.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(imageMoment(asset))).andExpect(status().isBadRequest());
        mvc.perform(patch("/me").header("Authorization", bearer(owner.accessToken())).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"我\",\"avatar_asset_id\":\"" + asset + "\"}"))
                .andExpect(status().isBadRequest());
        int version = couples.findById(UUID.fromString(coupleId)).orElseThrow().getVersion();
        mvc.perform(post("/couples/current/unbind").header("Authorization", bearer(owner.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":" + version + ",\"confirm_text\":\"确认解绑\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/media-assets/{id}/access-url", asset).header("Authorization", bearer(partner.accessToken())))
                .andExpect(status().isForbidden());
        mvc.perform(get("/couples/current/album-photos").header("Authorization",bearer(partner.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data",hasSize(0)));
        mvc.perform(get("/media-assets/{id}/access-url", asset).header("Authorization", bearer(owner.accessToken())))
                .andExpect(status().isOk());
    }

    @Test
    void shouldHideUnreadyAlbumPhotosFromPartnerAndRejectInvalidAttachments() throws Exception {
        Login owner = login("pending-album-owner");
        Login partner = login("pending-album-partner");
        Login solo = login("pending-album-solo");
        mvc.perform(post("/couples/current/album-photos").header("Authorization", bearer(solo.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"asset_ids\":[]}"))
                .andExpect(status().isBadRequest());
        pair(owner, partner);
        String assetId = uploadImage(owner, "pending.jpg");
        String coupleId = members.findById(UUID.fromString(owner.userId())).orElseThrow().getCoupleId().toString();
        var asset = assets.findById(UUID.fromString(assetId)).orElseThrow();
        asset.retryProcessing(); assets.saveAndFlush(asset);
        mvc.perform(post("/couples/current/album-photos").header("Authorization", bearer(owner.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"couple_id\":\"" + coupleId + "\",\"asset_ids\":[\"" + assetId + "\"]}"))
                .andExpect(status().isOk());
        mvc.perform(get("/couples/current/album-photos").header("Authorization", bearer(partner.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data", hasSize(0)));
        mvc.perform(get("/media-assets/{id}/access-url", assetId).header("Authorization", bearer(partner.accessToken())))
                .andExpect(status().isForbidden());
        String avatar = uploadImage(owner, "already-avatar.jpg");
        mvc.perform(patch("/me").header("Authorization", bearer(owner.accessToken())).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"我\",\"avatar_asset_id\":\"" + avatar + "\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/couples/current/album-photos").header("Authorization", bearer(owner.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"couple_id\":\"" + coupleId + "\",\"asset_ids\":[\"" + avatar + "\"]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void shouldPreserveAlbumAttachmentWhenMediaProcessingCommitsConcurrently() throws Exception {
        Login owner = login("concurrent-album-owner"), partner = login("concurrent-album-partner");
        pair(owner, partner);
        UUID coupleId = members.findById(UUID.fromString(owner.userId())).orElseThrow().getCoupleId();
        for (boolean workerCommitsFirst : new boolean[]{false, true}) {
            UUID id = UUID.fromString(uploadImage(owner, "concurrent-" + workerCommitsFirst + ".jpg"));
            var initial = assets.findById(id).orElseThrow(); initial.retryProcessing(); assets.saveAndFlush(initial);
            try (var worker = entityManagers.createEntityManager(); var attachment = entityManagers.createEntityManager()) {
                worker.getTransaction().begin(); attachment.getTransaction().begin();
                var processing = worker.find(MediaAssetEntity.class, id);
                var attaching = attachment.find(MediaAssetEntity.class, id);
                processing.markReady("display.jpg", "thumb.jpg"); attaching.attachToAlbum(coupleId);
                if (workerCommitsFirst) { worker.getTransaction().commit(); attachment.getTransaction().commit(); }
                else { attachment.getTransaction().commit(); worker.getTransaction().commit(); }
            }
            var result = assets.findById(id).orElseThrow();
            Assertions.assertEquals(coupleId, result.getAlbumCoupleId(), "Processing must preserve the independently committed album association");
            Assertions.assertEquals(DomainEnums.MediaStatus.READY, result.getStatus(), "Attachment must preserve the independently committed ready status");
        }
    }

    @Test
    void shouldCleanRejectedAlbumUploadsAfterTheRetentionWindow() throws Exception {
        Login owner = login("rejected-album-owner"), partner = login("rejected-album-partner");pair(owner, partner);
        UUID coupleId = members.findById(UUID.fromString(owner.userId())).orElseThrow().getCoupleId();
        for (boolean blocked : new boolean[]{true, false}) {
            var asset = assets.findById(UUID.fromString(uploadImage(owner, "rejected-" + blocked + ".jpg"))).orElseThrow();
            asset.attachToAlbum(coupleId);if (blocked) asset.markBlocked();else asset.markFailed();
            org.springframework.test.util.ReflectionTestUtils.setField(asset, "createdAt", Instant.now().minusSeconds(172800));
            assets.saveAndFlush(asset);mediaCleanup.runBatch();
            Assertions.assertEquals(DomainEnums.MediaStatus.DELETED, assets.findById(asset.getId()).orElseThrow().getStatus());
        }
    }

    private String uploadImage(Login user, String fileName) throws Exception {
        String created = mvc.perform(post("/upload-sessions").header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"file_name\":\"" + fileName + "\",\"mime_type\":\"image/jpeg\",\"size\":1024}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String sessionId = mapper.readTree(created).at("/data/upload_session_id").asText();
        String assetId = mapper.readTree(created).at("/data/asset_id").asText();
        mvc.perform(post("/upload-sessions/{id}/complete", sessionId).header("Authorization", bearer(user.accessToken()))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"etag\":\"test\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("READY"));
        return assetId;
    }
    private String recapMoment(String visibility, String mood, String event, String title) {
        return "{\"type\":\"TEXT\",\"title\":\"" + title + "\",\"body\":\"适合放进年度回顾的一天\",\"occurred_at\":\"2026-06-20T12:00:00Z\",\"visibility\":\"" + visibility + "\",\"mood\":\"" + mood + "\",\"events\":[\"" + event + "\"]}";
    }
    private String bearer(String token) { return "Bearer " + token; }
    private record Login(String userId, String accessToken, String refreshToken) {}
}
