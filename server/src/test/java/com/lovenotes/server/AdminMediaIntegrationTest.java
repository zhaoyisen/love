package com.lovenotes.server;

import com.fasterxml.jackson.databind.*;
import com.lovenotes.server.auth.SessionService;
import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.domain.*;
import com.lovenotes.server.repository.*;
import com.lovenotes.server.storage.ObjectStorage;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.*;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"spring.datasource.url=jdbc:h2:mem:media_admin;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE", "love-notes.admin.worker-enabled=false"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminMediaIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired MomentRepository moments;
    @Autowired MediaAssetRepository assets;
    @Autowired CoupleSpaceRepository couples;
    @Autowired ActiveCoupleMemberRepository members;
    @Autowired SessionService sessions;
    @Autowired com.lovenotes.server.admin.AdminMediaTasks taskWorker;
    @Autowired AppMessageRepository messages;
    @Autowired AnnualRecapRepository recaps;
    @Autowired AnnualRecapMomentRepository recapMoments;
    @Autowired com.lovenotes.server.media.MediaCleanupService mediaCleanup;
    @Autowired jakarta.persistence.EntityManager db;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    @org.springframework.boot.test.web.server.LocalServerPort int port;
    @MockitoBean ObjectStorage storage;

    UserEntity owner, partner;
    UUID couple;
    MomentEntity shared, personal;
    MediaAssetEntity photo;

    @BeforeEach void setup() {
        owner=users.save(new UserEntity(UUID.randomUUID().toString(),null,"管理测试"+UUID.randomUUID().toString().substring(0,6)));
        partner=users.save(new UserEntity(UUID.randomUUID().toString(),null,"伴侣"));
        couple=couples.save(new CoupleSpaceEntity(owner.getId(),partner.getId(),"我们")).getId();
        members.save(new ActiveCoupleMemberEntity(owner.getId(),couple));members.save(new ActiveCoupleMemberEntity(partner.getId(),couple));
        shared=moments.save(new MomentEntity(owner.getId(),couple,DomainEnums.MomentType.IMAGE,"海边", "正文",Instant.now(),DomainEnums.Visibility.SHARED,DomainEnums.MomentStatus.PUBLISHED));
        personal=moments.save(new MomentEntity(owner.getId(),null,DomainEnums.MomentType.TEXT,"私密", "正文",Instant.now(),DomainEnums.Visibility.PRIVATE,DomainEnums.MomentStatus.PUBLISHED));
        photo=new MediaAssetEntity(owner.getId(),DomainEnums.MediaKind.IMAGE,"original/"+UUID.randomUUID()+".jpg",null,"image/jpeg",123);
        photo.markReady("display/old.webp","thumbnail/old.webp");photo.attach(shared.getId());photo=assets.save(photo);
        when(storage.stat(anyString(),anyLong())).thenReturn(new ObjectStorage.ObjectInfo(123,"etag","image/jpeg"));
        when(storage.signedGetUrl(anyString(),any(),any())).thenAnswer(call->"https://example.test/"+call.getArgument(0));
    }

    @Test void adminSessionRequiredAndCsrfProtected() throws Exception {
        mvc.perform(get("/internal/admin/accounts")).andExpect(status().isUnauthorized());
        mvc.perform(get("/internal/admin/accounts").header("Authorization","Bearer "+sessions.issue(owner).accessToken())).andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/admin/session").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"test-internal-token\",\"operator\":\"测试\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/internal/admin/session").header("X-Admin-Request","1").header("Origin","https://evil.test").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"test-internal-token\",\"operator\":\"测试\"}")).andExpect(status().isForbidden());
        var admin=login();
        mvc.perform(get("/internal/admin/accounts").session(admin).param("q",owner.getNickname())).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].id").value(owner.getId().toString()));
        mvc.perform(get("/admin/index.html")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(delete("/internal/admin/session").session(admin).header("X-Admin-Request","1")).andExpect(status().isOk());
        mvc.perform(get("/internal/admin/accounts").session(admin)).andExpect(status().isUnauthorized());
    }

    @Test void hiddenForBothUsersAndRestoredWithoutChangingVisibility() throws Exception {
        var admin=login();String before=version(owner);
        visibility(admin,shared,true,200);
        for(var user:List.of(owner,partner)) {
            String token=sessions.issue(user).accessToken();
            mvc.perform(get("/moments/{id}",shared.getId()).header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
            mvc.perform(get("/media-assets/{id}/access-url",photo.getId()).header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
            mvc.perform(get("/couples/current/album").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());
            mvc.perform(get("/timeline").header("Authorization","Bearer "+token).param("from",Instant.now().minusSeconds(86400).toString()).param("to",Instant.now().plusSeconds(60).toString())).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[?(@.id == '"+shared.getId()+"')]").isEmpty());
        }
        assertNotEquals(before,version(owner));
        mvc.perform(get("/internal/admin/records/{id}",shared.getId()).session(admin).param("account_id",owner.getId().toString())).andExpect(status().isOk()).andExpect(jsonPath("$.data.hidden").value(true));
        var hidden=moments.findById(shared.getId()).orElseThrow();visibility(admin,hidden,false,200);
        assertEquals(DomainEnums.Visibility.SHARED,moments.findById(shared.getId()).orElseThrow().getVisibility());
        mvc.perform(get("/moments/{id}",shared.getId()).header("Authorization","Bearer "+sessions.issue(partner).accessToken())).andExpect(status().isOk());
        visibility(admin,personal,true,200);visibility(admin,moments.findById(personal.getId()).orElseThrow(),false,200);
        assertEquals(DomainEnums.Visibility.PRIVATE,moments.findById(personal.getId()).orElseThrow().getVisibility());
        mvc.perform(get("/moments/{id}",personal.getId()).header("Authorization","Bearer "+sessions.issue(partner).accessToken())).andExpect(status().isForbidden());
        verify(storage,never()).deleteObjects(any());
    }

    @Test void rejectsCrossAccountAndStaleBatchWithoutPartialWrites() throws Exception {
        var admin=login();
        mvc.perform(get("/internal/admin/records/{id}",shared.getId()).session(admin).param("account_id",partner.getId().toString())).andExpect(status().isNotFound());
        String body=json.writeValueAsString(Map.of("account_id",partner.getId(),"hidden",true,"records",List.of(Map.of("id",shared.getId(),"version",shared.getVersion()))));
        mvc.perform(post("/internal/admin/records/visibility").session(admin).header("X-Admin-Request","1").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isNotFound());
        visibility(admin,shared,true,200);
        body=json.writeValueAsString(Map.of("account_id",owner.getId(),"hidden",false,"records",List.of(Map.of("id",personal.getId(),"version",personal.getVersion()),Map.of("id",shared.getId(),"version",shared.getVersion()))));
        mvc.perform(post("/internal/admin/records/visibility").session(admin).header("X-Admin-Request","1").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());
        assertEquals(DomainEnums.Visibility.PRIVATE,moments.findById(personal.getId()).orElseThrow().getVisibility());
    }

    @Test void checksMissingCoverAndPersistsScopedTaskResults() throws Exception {
        var admin=login();
        when(storage.stat(eq("thumbnail/old.webp"),anyLong())).thenThrow(new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"UPLOAD_NOT_FOUND","不存在"));
        JsonNode job=createTask(admin,"CHECK",List.of(shared.getId()));
        runTask(admin,job);
        mvc.perform(get("/internal/admin/records/{id}",shared.getId()).session(admin).param("account_id",owner.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.media[0].source").value("AVAILABLE")).andExpect(jsonPath("$.data.media[0].thumbnail").value("MISSING"));
        mvc.perform(get("/internal/admin/records").session(admin).param("account_id",owner.getId().toString()).param("issue","COVER_MISSING"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.total").value(1));
        mvc.perform(get("/internal/admin/tasks/{id}",job.get("id").asText()).session(admin).param("account_id",partner.getId().toString())).andExpect(status().isNotFound());
        mvc.perform(get("/internal/admin/tasks/{id}",job.get("id").asText()).session(login()).param("account_id",owner.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.completed").value(1)).andExpect(jsonPath("$.data.items[0].status").value("SUCCEEDED"));
    }

    @Test void providerFailureIsNotClassifiedAsLostData() throws Exception {
        var admin=login();
        when(storage.stat(eq(photo.getStorageKey()),anyLong())).thenThrow(new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PROVIDER_UNAVAILABLE","权限或网络异常"));
        runTask(admin,createTask(admin,"CHECK",List.of(shared.getId())));
        mvc.perform(get("/internal/admin/records/{id}",shared.getId()).session(admin).param("account_id",owner.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.issue").value("CHECK_FAILED")).andExpect(jsonPath("$.data.media[0].source").value("ERROR"));
    }

    @Test void healthyCoversAndMissingSourcesAreNeverRebuilt() throws Exception {
        var admin=login();runTask(admin,createTask(admin,"REBUILD",List.of(shared.getId())));
        verify(storage,never()).createDerivatives(any(),anyString());
        verify(storage,never()).regenerateDerivatives(any(),anyString(),anyString());
        when(storage.stat(eq(photo.getStorageKey()),anyLong())).thenThrow(new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"UPLOAD_NOT_FOUND","不存在"));
        runTask(admin,createTask(admin,"REBUILD",List.of(shared.getId())));
        verify(storage,never()).createDerivatives(any(),anyString());
        verify(storage,never()).regenerateDerivatives(any(),anyString(),anyString());
        assertEquals("thumbnail/old.webp",assets.findById(photo.getId()).orElseThrow().getThumbnailStorageKey());
    }

    @Test void taskCannotCrossAccountsOrReuseRequestIdForDifferentSelection() throws Exception {
        var admin=login();
        UUID id=UUID.randomUUID();
        String body=json.writeValueAsString(Map.of("id",id,"account_id",owner.getId(),"action","CHECK","moment_ids",List.of(shared.getId())));
        for(int i=0;i<2;i++)mvc.perform(post("/internal/admin/tasks").session(admin).header("X-Admin-Request","1").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(id.toString()));
        body=json.writeValueAsString(Map.of("id",id,"account_id",owner.getId(),"action","REBUILD","moment_ids",List.of(shared.getId())));
        mvc.perform(post("/internal/admin/tasks").session(admin).header("X-Admin-Request","1").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isConflict());
        body=json.writeValueAsString(Map.of("id",UUID.randomUUID(),"account_id",partner.getId(),"action","CHECK","moment_ids",List.of(shared.getId())));
        mvc.perform(post("/internal/admin/tasks").session(admin).header("X-Admin-Request","1").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isNotFound());
    }

    @Test void missingCoverIsRebuiltOnceWithoutChangingOriginalOrVisibility() throws Exception {
        var admin=login();String before=version(owner),source=photo.getStorageKey();
        when(storage.stat(eq("thumbnail/old.webp"),anyLong())).thenThrow(new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"UPLOAD_NOT_FOUND","不存在"));
        when(storage.regenerateDerivatives(eq(DomainEnums.MediaKind.IMAGE),eq(source),anyString())).thenReturn(new ObjectStorage.Derivatives("display/fresh.webp","thumbnail/fresh.webp"));
        var task=createTask(admin,"REBUILD",List.of(shared.getId()));runTask(admin,task);runTask(admin,task);
        var result=assets.findById(photo.getId()).orElseThrow();
        assertEquals(source,result.getStorageKey());assertEquals("thumbnail/fresh.webp",result.getThumbnailStorageKey());
        assertTrue(result.objectKeys().contains("display/old.webp"),"Old derivative must remain tracked for privacy deletion");
        assertEquals(DomainEnums.MediaStatus.READY,result.getStatus());assertNotEquals(before,version(owner));
        verify(storage,times(1)).regenerateDerivatives(eq(DomainEnums.MediaKind.IMAGE),eq(source),anyString());verify(storage,never()).deleteObjects(any());
        mvc.perform(get("/internal/admin/records/{id}",shared.getId()).session(admin).param("account_id",owner.getId().toString())).andExpect(status().isOk()).andExpect(jsonPath("$.data.issue").value("NORMAL"));
    }

    @Test void partialFailedGenerationRemainsTrackedThroughTrashPurge() throws Exception {
        var admin=login();when(storage.stat(eq("thumbnail/old.webp"),anyLong())).thenThrow(new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"UPLOAD_NOT_FOUND","不存在"));
        when(storage.regenerateDerivatives(any(),anyString(),anyString())).thenThrow(new IllegalStateException("provider failed after writing a partial display"));
        var task=createTask(admin,"REBUILD",List.of(shared.getId()));
        var detail=json.readTree(mvc.perform(get("/internal/admin/tasks/{id}",task.get("id").asText()).session(admin).param("account_id",owner.getId().toString())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
        String stem=photo.getStorageKey().substring("original/".length(),photo.getStorageKey().lastIndexOf('.'))+"-"+detail.at("/items/0/id").asText();
        runTask(admin,task);
        assertTrue(assets.findById(photo.getId()).orElseThrow().objectKeys().contains("display/"+stem+".webp"),"Partial generated objects must be tracked even if generation fails");
        shared.trash();moments.saveAndFlush(shared);
        new org.springframework.transaction.support.TransactionTemplate(transactions).executeWithoutResult(tx->db.createQuery("update MomentEntity m set m.deletedAt=:before where m.id=:id").setParameter("before",Instant.now().minusSeconds(40L*86400)).setParameter("id",shared.getId()).executeUpdate());
        mediaCleanup.runBatch();
        var keys=org.mockito.ArgumentCaptor.forClass(java.util.Collection.class);verify(storage).deleteObjects(keys.capture());
        assertTrue(keys.getValue().containsAll(List.of(photo.getStorageKey(),"display/old.webp","thumbnail/old.webp","display/"+stem+".webp","thumbnail/"+stem+".webp")));
    }

    @Test
    @org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
    void missingGeneratedCoverReportsVerificationStageWithoutUpdatingMedia(org.springframework.boot.test.system.CapturedOutput output) throws Exception {
        var admin=login();
        when(storage.stat(eq("thumbnail/old.webp"),anyLong())).thenThrow(new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"UPLOAD_NOT_FOUND","不存在"));
        when(storage.regenerateDerivatives(any(),anyString(),anyString())).thenReturn(new ObjectStorage.Derivatives("display/fresh.webp","thumbnail/fresh.webp"));
        when(storage.stat(eq("thumbnail/fresh.webp"),anyLong())).thenThrow(new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"UPLOAD_NOT_FOUND","不存在"));
        var task=createTask(admin,"REBUILD",List.of(shared.getId()));runTask(admin,task);
        mvc.perform(get("/internal/admin/tasks/{id}",task.get("id").asText()).session(admin).param("account_id",owner.getId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].status").value("FAILED"))
                .andExpect(jsonPath("$.data.items[0].message").value("封面生成后的文件验证失败，请查看服务日志后重试。"));
        assertEquals("thumbnail/old.webp",assets.findById(photo.getId()).orElseThrow().getThumbnailStorageKey());
        assertTrue(output.getOut().contains("asset="+photo.getId()));
        assertTrue(output.getOut().contains("stage=VERIFY"));
        assertTrue(output.getOut().contains("thumbnailState=MISSING"));
    }

    @Test void deletionOrSafetyStateChangedAfterQueueCannotBeResurrected() throws Exception {
        var admin=login();var task=createTask(admin,"REBUILD",List.of(shared.getId()));
        photo.markDeleted();assets.saveAndFlush(photo);runTask(admin,task);
        verify(storage,never()).regenerateDerivatives(any(),anyString(),anyString());assertEquals(DomainEnums.MediaStatus.DELETED,assets.findById(photo.getId()).orElseThrow().getStatus());
        mvc.perform(get("/internal/admin/tasks/{id}",task.get("id").asText()).session(admin).param("account_id",owner.getId().toString())).andExpect(status().isOk()).andExpect(jsonPath("$.data.skipped").value(1));
        photo.markBlocked();assets.saveAndFlush(photo);runTask(admin,createTask(admin,"REBUILD",List.of(shared.getId())));
        verify(storage,never()).regenerateDerivatives(any(),anyString(),anyString());
    }

    @Test void hiddenContentIsRemovedFromRecapsMessagesAndCursorHistory() throws Exception {
        var admin=login();int year=java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")).getYear();
        var recap=recaps.save(new AnnualRecapEntity(couple,year));recapMoments.save(new AnnualRecapMomentEntity(recap.getId(),shared.getId(),0));
        var message=messages.save(new AppMessageEntity(partner.getId(),owner.getId(),couple,shared.getId(),DomainEnums.MessageType.MOMENT,"新时刻","不应泄露的摘要"));
        // The first page is newer than the hidden record; the second page exercises native cursor SQL.
        var newest=moments.save(new MomentEntity(owner.getId(),couple,DomainEnums.MomentType.TEXT,"最新", "正文",Instant.now().plusSeconds(1),DomainEnums.Visibility.SHARED,DomainEnums.MomentStatus.PUBLISHED));
        String token="Bearer "+sessions.issue(partner).accessToken();
        String from=Instant.now().minusSeconds(86400).toString(),to=Instant.now().plusSeconds(60).toString();
        String cursor=json.readTree(mvc.perform(get("/timeline").header("Authorization",token).param("from",from).param("to",to).param("limit","1")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).at("/data/next_cursor").asText();
        visibility(admin,shared,true,200);
        mvc.perform(get("/timeline").header("Authorization",token).param("from",from).param("to",to).param("limit","1").param("cursor",cursor)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items").isEmpty());
        mvc.perform(get("/messages").header("Authorization",token)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items").isEmpty()).andExpect(jsonPath("$.data.unread_count").value(0));
        mvc.perform(post("/messages/{id}/read",message.getId()).header("Authorization",token)).andExpect(status().isNotFound());
        mvc.perform(get("/recaps/current").param("year",String.valueOf(year)).header("Authorization",token)).andExpect(status().isOk()).andExpect(jsonPath("$.data.selected_moments").isEmpty());
        visibility(admin,moments.findById(shared.getId()).orElseThrow(),false,200);
        mvc.perform(get("/messages").header("Authorization",token)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].id").value(message.getId().toString()));
        mvc.perform(get("/recaps/current").param("year",String.valueOf(year)).header("Authorization",token)).andExpect(status().isOk()).andExpect(jsonPath("$.data.selected_moments[0].id").value(shared.getId().toString()));
    }

    @Test
    @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="ADMIN_BROWSER_TESTS",matches="1")
    void browserExercisesTheRealAdminEndpoints() throws Exception {
        var process=new ProcessBuilder("node", "../scripts/test-admin-browser.cjs","http://127.0.0.1:"+port+"/api/v1",owner.getId().toString(),shared.getId().toString())
                .redirectErrorStream(true).redirectOutput(new java.io.File("../tmp/admin-browser.log")).start();
        boolean finished=process.waitFor(180,java.util.concurrent.TimeUnit.SECONDS);
        if(!finished)process.destroyForcibly();
        assertTrue(finished,"Browser timed out; see tmp/admin-browser.log");
        assertEquals(0,process.exitValue(),java.nio.file.Files.readString(java.nio.file.Path.of("../tmp/admin-browser.log")));
    }

    private JsonNode createTask(MockHttpSession admin,String action,List<UUID> ids) throws Exception {
        return json.readTree(mvc.perform(post("/internal/admin/tasks").session(admin).header("X-Admin-Request","1").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("id",UUID.randomUUID(),"account_id",owner.getId(),"action",action,"moment_ids",ids))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
    }
    private void runTask(MockHttpSession admin,JsonNode job) throws Exception {
        JsonNode detail=json.readTree(mvc.perform(get("/internal/admin/tasks/{id}",job.get("id").asText()).session(admin).param("account_id",owner.getId().toString())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
        for(var item:detail.get("items"))taskWorker.processItem(UUID.fromString(item.get("id").asText()));
    }

    private MockHttpSession login() throws Exception {
        return (MockHttpSession)mvc.perform(post("/internal/admin/session").header("X-Admin-Request","1").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"test-internal-token\",\"operator\":\"测试运维\"}")).andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    private void visibility(MockHttpSession session,MomentEntity moment,boolean hidden,int expected) throws Exception {
        mvc.perform(post("/internal/admin/records/visibility").session(session).header("X-Admin-Request","1").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("account_id",owner.getId(),"hidden",hidden,"records",List.of(Map.of("id",moment.getId(),"version",moment.getVersion())))))).andExpect(status().is(expected));
    }
    private String version(UserEntity user) throws Exception {
        return json.readTree(mvc.perform(get("/sync/version").header("Authorization","Bearer "+sessions.issue(user).accessToken())).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).at("/data/version").asText();
    }
}
