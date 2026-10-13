package com.lovenotes.server.storage;

import org.junit.jupiter.api.Test;
import com.lovenotes.server.config.LoveNotesProperties;
import com.lovenotes.server.domain.DomainEnums;
import com.qcloud.cos.COSClient;
import com.qcloud.cos.model.ciModel.snapshot.SnapshotRequest;
import com.qcloud.cos.model.ciModel.auditing.AuditingJobsDetail;
import com.qcloud.cos.model.ciModel.auditing.VideoAuditingResponse;
import com.qcloud.cos.model.ciModel.auditing.VideoAuditingRequest;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class CosObjectStorageTest {
    private CosObjectStorage storage(COSClient client) {
        LoveNotesProperties properties = mock(LoveNotesProperties.class);
        when(properties.storage()).thenReturn(new LoveNotesProperties.Storage("cos", "bucket-123", "ap-chengdu", "", ""));
        return new CosObjectStorage(properties, client);
    }

    @Test
    void shouldStoreSmallRotatedVideoCoverInThePrivateBucketAfterAuditing() {
        COSClient client = mock(COSClient.class);
        AuditingJobsDetail detail = new AuditingJobsDetail();
        detail.setState("Success"); detail.setResult("0"); detail.setJobId("audit-job");
        VideoAuditingResponse response = new VideoAuditingResponse(); response.setJobsDetail(detail);
        when(client.describeAuditingJob(any(VideoAuditingRequest.class))).thenReturn(response);
        var result = storage(client).process(DomainEnums.MediaKind.VIDEO, "original/u/2026/07/video.mp4", "audit-job");
        assertEquals(ObjectStorage.ProcessingOutcome.READY, result.outcome());
        assertEquals("thumbnail/u/2026/07/video.jpg", result.thumbnailKey());
        ArgumentCaptor<SnapshotRequest> request = ArgumentCaptor.forClass(SnapshotRequest.class);
        verify(client).generateSnapshot(request.capture());
        assertEquals("original/u/2026/07/video.mp4", request.getValue().getInput().getObject());
        assertEquals("bucket-123", request.getValue().getOutput().getBucket());
        assertEquals("ap-chengdu", request.getValue().getOutput().getRegion());
        assertEquals(result.thumbnailKey(), request.getValue().getOutput().getObject());
        assertEquals("480", request.getValue().getWidth());
        assertEquals("0", request.getValue().getTime());
        assertEquals("auto", request.getValue().getRotate());
    }

    @Test
    void shouldNeverGenerateCoversForBlockedVideo() {
        COSClient client = mock(COSClient.class);
        AuditingJobsDetail detail = new AuditingJobsDetail();
        detail.setState("Success"); detail.setResult("1");
        VideoAuditingResponse response = new VideoAuditingResponse(); response.setJobsDetail(detail);
        when(client.describeAuditingJob(any(VideoAuditingRequest.class))).thenReturn(response);
        var result = storage(client).process(DomainEnums.MediaKind.VIDEO, "original/video.mp4", "audit-job");
        assertEquals(ObjectStorage.ProcessingOutcome.BLOCKED, result.outcome());
        verify(client, never()).generateSnapshot(any(SnapshotRequest.class));
    }

    @Test
    void shouldKeepAuditedVideoPlayableWhenCoverGenerationNeedsRetry() {
        COSClient client = mock(COSClient.class);
        AuditingJobsDetail detail = new AuditingJobsDetail();
        detail.setState("Success"); detail.setResult("0");
        VideoAuditingResponse response = new VideoAuditingResponse(); response.setJobsDetail(detail);
        when(client.describeAuditingJob(any(VideoAuditingRequest.class))).thenReturn(response);
        when(client.generateSnapshot(any(SnapshotRequest.class))).thenThrow(new IllegalStateException("temporary failure"));
        var result = storage(client).process(DomainEnums.MediaKind.VIDEO, "original/video.mp4", "audit-job");
        assertEquals(ObjectStorage.ProcessingOutcome.READY, result.outcome());
        assertEquals("original/video.mp4", result.displayKey());
        assertEquals(null, result.thumbnailKey());
    }
    @Test
    void shouldLimitTemporaryUploadCredentialToGeneratedMonthlyDirectory() {
        String key="original/user-123/2026/07/object-456.jpg";

        assertEquals("original/user-123/2026/07/*",CosObjectStorage.uploadScope(key));
    }

    @Test
    void shouldRejectStorageKeyWithoutDirectory() {
        assertThrows(IllegalArgumentException.class,()->CosObjectStorage.uploadScope("object.jpg"));
    }
}
