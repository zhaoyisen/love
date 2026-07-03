package com.lovenotes.server;

import com.fasterxml.jackson.databind.*;
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

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ApiFlowIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired MomentTagRepository tags;
    @Autowired UploadSessionRepository uploads;
    @Autowired MediaAssetRepository assets;
    @Autowired MomentRepository moments;
    @Autowired ActiveCoupleMemberRepository members;
    @Autowired InvitationRepository invitations;
    @Autowired CoupleSpaceRepository couples;
    @Autowired UserRepository users;

    @BeforeEach
    void cleanDatabase() {
        tags.deleteAll(); uploads.deleteAll(); assets.deleteAll(); moments.deleteAll();
        members.deleteAll(); invitations.deleteAll(); couples.deleteAll(); users.deleteAll();
    }

    @Test
    void shouldRejectProtectedEndpointWithoutAccessToken() throws Exception {
        mvc.perform(get("/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("SESSION_EXPIRED"));
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
    void shouldReplayInvitationAndEnforceUnbindIsolation() throws Exception {
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
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("UPLOADED"));
        mvc.perform(get("/media-assets/{id}", assetId).header("Authorization", bearer(user.accessToken())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.kind").value("IMAGE"));
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
                        .content("{\"version\":0,\"title\":\"修改后\",\"body\":\"修改后的正文\",\"occurred_at\":\"" + Instant.now() + "\",\"visibility\":\"PRIVATE\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.version").value(1));

        mvc.perform(delete("/moments/{id}", id).param("version", "1").header("Authorization", bearer(owner.accessToken())))
                .andExpect(status().isNoContent());
        mvc.perform(get("/moments/{id}", id).header("Authorization", bearer(owner.accessToken())))
                .andExpect(status().isForbidden());
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
        mvc.perform(post("/moments").header("Authorization", bearer(user.accessToken()))
                        .header("Idempotency-Key", UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content("{broken"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    private Login login(String code) throws Exception {
        String body = mvc.perform(post("/auth/wechat/session").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + code + "\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.access_token").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        JsonNode data = mapper.readTree(body).path("data");
        return new Login(data.path("user_id").asText(), data.path("access_token").asText(), data.path("refresh_token").asText());
    }

    private String textMoment(String visibility) {
        return "{\"type\":\"TEXT\",\"title\":\"普通一天\",\"body\":\"值得记住的普通一天\",\"occurred_at\":\"" + Instant.now() + "\",\"visibility\":\"" + visibility + "\",\"mood\":\"CALM\",\"events\":[\"DAILY\"]}";
    }
    private String bearer(String token) { return "Bearer " + token; }
    private record Login(String userId, String accessToken, String refreshToken) {}
}
