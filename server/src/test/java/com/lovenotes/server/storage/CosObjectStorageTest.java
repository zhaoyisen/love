package com.lovenotes.server.storage;

import org.junit.jupiter.api.Test;
import com.lovenotes.server.config.LoveNotesProperties;
import com.lovenotes.server.domain.DomainEnums;
import com.qcloud.cos.COSClient;
import com.qcloud.cos.model.GeneratePresignedUrlRequest;
import com.qcloud.cos.model.ciModel.snapshot.SnapshotRequest;
import com.qcloud.cos.model.ciModel.snapshot.CosSnapshotRequest;
import com.qcloud.cos.model.ciModel.auditing.AuditingJobsDetail;
import com.qcloud.cos.model.ciModel.auditing.VideoAuditingResponse;
import com.qcloud.cos.model.ciModel.auditing.VideoAuditingRequest;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class CosObjectStorageTest {
    @Test
    void shouldFetchRealtimeFrameAndUploadOnlyTheNewCoverWithJpegMetadata() throws Exception {
        var client=mock(COSClient.class);
        byte[] jpeg={(byte)0xff,(byte)0xd8,(byte)0xff,1};
        var frame=new java.io.ByteArrayInputStream(jpeg);
        when(client.getSnapshot(any(com.qcloud.cos.model.ciModel.snapshot.CosSnapshotRequest.class))).thenReturn(frame);
        var result=storage(client).regenerateDerivatives(DomainEnums.MediaKind.VIDEO,"original/video.mp4","revision-123");
        var request=ArgumentCaptor.forClass(com.qcloud.cos.model.ciModel.snapshot.CosSnapshotRequest.class);
        verify(client).getSnapshot(request.capture());
        assertEquals("original/video.mp4",request.getValue().getObjectKey());
        assertEquals("480",request.getValue().getWidth());assertEquals("0",request.getValue().getTime());
        var metadata=ArgumentCaptor.forClass(com.qcloud.cos.model.ObjectMetadata.class);
        var bytes=ArgumentCaptor.forClass(java.io.InputStream.class);
        verify(client).putObject(eq("bucket-123"),eq("thumbnail/video-revision-123.jpg"),bytes.capture(),metadata.capture());
        assertEquals("image/jpeg",metadata.getValue().getContentType());assertEquals(jpeg.length,metadata.getValue().getContentLength());
        org.junit.jupiter.api.Assertions.assertArrayEquals(jpeg,bytes.getValue().readAllBytes());
        assertEquals("original/video.mp4",result.displayKey());
        verify(client,never()).generateSnapshot(any(SnapshotRequest.class));verify(client,never()).deleteObjects(any());
    }

    @Test
    void shouldCloseAndRejectEmptyNonJpegOrOversizedSnapshotsWithoutUploading() {
        byte[] oversized=new byte[20*1024*1024+1];oversized[0]=(byte)0xff;oversized[1]=(byte)0xd8;oversized[2]=(byte)0xff;
        for(byte[] body:java.util.List.of(new byte[0],"<Error>not an image</Error>".getBytes(java.nio.charset.StandardCharsets.UTF_8),oversized)) {
            var client=mock(COSClient.class);var closed=new java.util.concurrent.atomic.AtomicBoolean();
            var stream=new java.io.ByteArrayInputStream(body) {@Override public void close(){closed.set(true);}};
            when(client.getSnapshot(any(CosSnapshotRequest.class))).thenReturn(stream);
            assertThrows(IllegalStateException.class,()->storage(client).regenerateDerivatives(DomainEnums.MediaKind.VIDEO,"original/video.mp4","revision-123"));
            org.junit.jupiter.api.Assertions.assertTrue(closed.get());
            verify(client,never()).putObject(anyString(),anyString(),any(java.io.InputStream.class),any(com.qcloud.cos.model.ObjectMetadata.class));
        }
    }

    @Test
    void shouldCloseSnapshotAfterReadOrUploadFailure() {
        for(boolean readFails:java.util.List.of(true,false)) {
            var client=mock(COSClient.class);var closed=new java.util.concurrent.atomic.AtomicBoolean();
            var stream=new java.io.InputStream() {
                final java.io.ByteArrayInputStream delegate=new java.io.ByteArrayInputStream(new byte[]{(byte)0xff,(byte)0xd8,(byte)0xff,1});
                @Override public int read() throws java.io.IOException {if(readFails)throw new java.io.IOException("read failed");return delegate.read();}
                @Override public void close(){closed.set(true);}
            };
            when(client.getSnapshot(any(CosSnapshotRequest.class))).thenReturn(stream);
            when(client.putObject(anyString(),anyString(),any(java.io.InputStream.class),any(com.qcloud.cos.model.ObjectMetadata.class)))
                    .thenThrow(new com.qcloud.cos.exception.CosServiceException("upload denied"));
            assertThrows(com.qcloud.cos.exception.CosClientException.class,()->storage(client).regenerateDerivatives(DomainEnums.MediaKind.VIDEO,"original/video.mp4","revision-123"));
            org.junit.jupiter.api.Assertions.assertTrue(closed.get());
            if(readFails)verify(client,never()).putObject(anyString(),anyString(),any(java.io.InputStream.class),any(com.qcloud.cos.model.ObjectMetadata.class));
        }
    }

    @Test
    @org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
    void shouldKeepParameterExplanationFromActualSdkHttpResponse(org.springframework.boot.test.system.CapturedOutput output) throws Exception {
        var requestUri=new java.util.concurrent.atomic.AtomicReference<java.net.URI>();
        var requestMethod=new java.util.concurrent.atomic.AtomicReference<String>();
        var replyWithFrame=new java.util.concurrent.atomic.AtomicBoolean();
        var uploaded=new java.util.concurrent.atomic.AtomicReference<byte[]>();
        var uploadedType=new java.util.concurrent.atomic.AtomicReference<String>();
        byte[] jpeg={(byte)0xff,(byte)0xd8,(byte)0xff,1};
        String etag=java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("MD5").digest(jpeg));
        var server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/original/video.mp4",exchange->{
            requestUri.set(exchange.getRequestURI());requestMethod.set(exchange.getRequestMethod());
            if(replyWithFrame.get()) {
                exchange.getResponseHeaders().set("Content-Type","image/jpeg");exchange.sendResponseHeaders(200,jpeg.length);
                exchange.getResponseBody().write(jpeg);exchange.close();return;
            }
            byte[] body="<Error><Code>InvalidArgument</Code><Message>invalid parameter: Width</Message><RequestId>sdk-request-123</RequestId></Error>".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/xml");
            exchange.sendResponseHeaders(400,body.length);exchange.getResponseBody().write(body);exchange.close();
        });
        server.createContext("/thumbnail/video-revision-123.jpg",exchange->{
            uploaded.set(exchange.getRequestBody().readAllBytes());uploadedType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            exchange.getResponseHeaders().set("ETag","\""+etag+"\"");exchange.sendResponseHeaders(200,-1);exchange.close();
        });
        server.start();
        var config=new com.qcloud.cos.ClientConfig(new com.qcloud.cos.region.Region("ap-chengdu"));
        config.setHttpProtocol(com.qcloud.cos.http.HttpProtocol.http);config.setMaxErrorRetry(0);
        config.setConnectionTimeout(3000);config.setSocketTimeout(3000);
        var client=new COSClient(new com.qcloud.cos.auth.BasicCOSCredentials("test-id","test-secret"),config) {
            @Override protected <X extends com.qcloud.cos.internal.CosServiceRequest> com.qcloud.cos.http.CosHttpRequest<X> createRequest(
                    String bucket,String key,X original,com.qcloud.cos.http.HttpMethodName method) {
                var request=super.createRequest(bucket,key,original,method);
                String endpoint="127.0.0.1:"+server.getAddress().getPort();
                request.setEndpoint(endpoint);request.setProtocol(com.qcloud.cos.http.HttpProtocol.http);
                request.addHeader("Host",endpoint);return request;
            }
        };
        try {
            var error=assertThrows(com.qcloud.cos.exception.CosServiceException.class,
                    ()->storage(client).regenerateDerivatives(DomainEnums.MediaKind.VIDEO,"original/video.mp4","revision-123"));
            assertEquals("InvalidArgument",error.getErrorCode());
            assertEquals("invalid parameter: Width",error.getErrorMessage());
            assertEquals("GET",requestMethod.get());assertEquals("/original/video.mp4",requestUri.get().getPath());
            String query=requestUri.get().getQuery();
            for(String parameter:java.util.List.of("ci-process=snapshot","time=0","width=480","height=0","mode=keyframe","format=jpg","rotate=auto"))
                org.junit.jupiter.api.Assertions.assertTrue(java.util.Arrays.asList(query.split("&")).contains(parameter),parameter);
            org.junit.jupiter.api.Assertions.assertTrue(output.getOut().contains("parameterMessage=invalid parameter: Width"));
            replyWithFrame.set(true);
            var result=storage(client).regenerateDerivatives(DomainEnums.MediaKind.VIDEO,"original/video.mp4","revision-123");
            assertEquals("original/video.mp4",result.displayKey());assertEquals("thumbnail/video-revision-123.jpg",result.thumbnailKey());
            org.junit.jupiter.api.Assertions.assertArrayEquals(jpeg,uploaded.get());assertEquals("image/jpeg",uploadedType.get());
        } finally {client.shutdown();server.stop(0);}
    }

    @Test
    @org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
    void shouldLogSafeProviderDetailsWhenAdminVideoCoverGenerationFails(org.springframework.boot.test.system.CapturedOutput output) {
        var client=mock(COSClient.class);
        var denied=new com.qcloud.cos.exception.CosServiceException("sensitive-provider-message");
        denied.setStatusCode(403);denied.setErrorCode("AccessDenied");denied.setRequestId("snapshot-request-123");
        when(client.getSnapshot(any(CosSnapshotRequest.class))).thenThrow(denied);
        assertEquals(denied,assertThrows(com.qcloud.cos.exception.CosServiceException.class,
                ()->storage(client).regenerateDerivatives(DomainEnums.MediaKind.VIDEO,"original/video.mp4","generation-123")));
        org.junit.jupiter.api.Assertions.assertTrue(output.getOut().contains("COS derivative regeneration failed"));
        org.junit.jupiter.api.Assertions.assertTrue(output.getOut().contains("errorCode=AccessDenied"));
        org.junit.jupiter.api.Assertions.assertTrue(output.getOut().contains("requestId=snapshot-request-123"));
        org.junit.jupiter.api.Assertions.assertFalse(output.getOut().contains("sensitive-provider-message"));
    }

    @Test
    void shouldConfirmAmbiguousHead404WithBoundedGet() throws Exception {
        var client=mock(COSClient.class);
        var head=new com.qcloud.cos.http.CosHttpResponse(null,new org.apache.http.client.methods.HttpHead("https://example.test/a"));
        head.setStatusCode(404);head.setStatusText("Not Found");head.setHeaders(new java.util.HashMap<>());
        var headError=new com.qcloud.cos.internal.CosErrorResponseHandler().handle(head);
        assertEquals("404 Not Found",headError.getErrorCode());
        when(client.getObjectMetadata(anyString(),anyString())).thenThrow(headError);
        var request=mock(com.qcloud.cos.http.CosHttpRequest.class);when(request.getHttpMethod()).thenReturn(com.qcloud.cos.http.HttpMethodName.GET);
        var get=new com.qcloud.cos.http.CosHttpResponse(request,new org.apache.http.client.methods.HttpGet("https://example.test/a"));
        get.setStatusCode(404);get.setStatusText("Not Found");get.setHeaders(new java.util.HashMap<>());
        get.setContent(new java.io.ByteArrayInputStream("<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        var getError=new com.qcloud.cos.internal.CosErrorResponseHandler().handle(get);
        when(client.getObject(any(com.qcloud.cos.model.GetObjectRequest.class))).thenThrow(getError);
        assertEquals("UPLOAD_NOT_FOUND",assertThrows(com.lovenotes.server.common.ApiException.class,()->storage(client).stat("original/a.jpg",0)).code());
        var range=ArgumentCaptor.forClass(com.qcloud.cos.model.GetObjectRequest.class);verify(client).getObject(range.capture());
        org.junit.jupiter.api.Assertions.assertArrayEquals(new long[]{0,0},range.getValue().getRange());
    }
    @Test
    void regeneratedVideoCoversUseNewPathsAndLeaveOriginalUntouched() {
        var client=mock(COSClient.class);var storage=storage(client);
        when(client.getSnapshot(any(CosSnapshotRequest.class))).thenAnswer(call->new java.io.ByteArrayInputStream(new byte[]{(byte)0xff,(byte)0xd8,(byte)0xff,1}));
        var first=storage.regenerateDerivatives(DomainEnums.MediaKind.VIDEO,"original/u/movie.mp4");
        var second=storage.regenerateDerivatives(DomainEnums.MediaKind.VIDEO,"original/u/movie.mp4");
        assertEquals("original/u/movie.mp4",first.displayKey());
        org.junit.jupiter.api.Assertions.assertNotEquals(first.thumbnailKey(),second.thumbnailKey());
        org.junit.jupiter.api.Assertions.assertNotEquals("thumbnail/u/movie.jpg",first.thumbnailKey());
        var requests=ArgumentCaptor.forClass(CosSnapshotRequest.class);verify(client,times(2)).getSnapshot(requests.capture());
        assertEquals("original/u/movie.mp4",requests.getAllValues().get(0).getObjectKey());
        verify(client).putObject(eq("bucket-123"),eq(first.thumbnailKey()),any(java.io.InputStream.class),any(com.qcloud.cos.model.ObjectMetadata.class));
        verify(client).putObject(eq("bucket-123"),eq(second.thumbnailKey()),any(java.io.InputStream.class),any(com.qcloud.cos.model.ObjectMetadata.class));
        verify(client,never()).deleteObjects(any());
    }
    @Test
    void shouldSeparateMissingObjectFromPermissionAndNetworkFailure() {
        var client=mock(COSClient.class);
        var denied=new com.qcloud.cos.exception.CosServiceException("denied");denied.setStatusCode(403);denied.setErrorCode("AccessDenied");
        when(client.getObjectMetadata(anyString(),anyString())).thenThrow(denied);
        assertEquals("PROVIDER_UNAVAILABLE",assertThrows(com.lovenotes.server.common.ApiException.class,()->storage(client).stat("original/a.jpg",0)).code());
        var missing=new com.qcloud.cos.exception.CosServiceException("missing");missing.setStatusCode(404);missing.setErrorCode("NoSuchKey");
        doThrow(missing).when(client).getObjectMetadata(anyString(),anyString());
        assertEquals("UPLOAD_NOT_FOUND",assertThrows(com.lovenotes.server.common.ApiException.class,()->storage(client).stat("original/a.jpg",0)).code());
        var bucket=new com.qcloud.cos.exception.CosServiceException("bucket");bucket.setStatusCode(404);bucket.setErrorCode("NoSuchBucket");
        doThrow(bucket).when(client).getObjectMetadata(anyString(),anyString());
        assertEquals("PROVIDER_UNAVAILABLE",assertThrows(com.lovenotes.server.common.ApiException.class,()->storage(client).stat("original/a.jpg",0)).code());
    }
    @Test
    void shouldIncludeSnapshotParametersInTheActualSdkSignature() {
        var client=new COSClient(new com.qcloud.cos.auth.BasicCOSCredentials("test-id","test-secret"),new com.qcloud.cos.ClientConfig(new com.qcloud.cos.region.Region("ap-chengdu")));
        try {
            String url=storage(client).signedVideoSnapshotUrl("original/u/video.mp4",java.time.Duration.ofMinutes(15));
            String query=java.net.URI.create(url).getQuery();
            org.junit.jupiter.api.Assertions.assertTrue(query.contains("ci-process=snapshot"));
            org.junit.jupiter.api.Assertions.assertTrue(query.contains("q-url-param-list=ci-process;format;mode;rotate;time;width"));
            org.junit.jupiter.api.Assertions.assertTrue(query.contains("q-signature="));
        } finally { client.shutdown(); }
    }

    @Test
    void shouldSignSnapshotParametersWithTheVideoObjectAndExpiry() throws Exception {
        COSClient client = mock(COSClient.class);
        when(client.generatePresignedUrl(any(GeneratePresignedUrlRequest.class))).thenReturn(java.net.URI.create("https://cos/video.mp4?signature=test").toURL());
        long before=System.currentTimeMillis();
        assertEquals("https://cos/video.mp4?signature=test",storage(client).signedVideoSnapshotUrl("original/u/video.mp4",java.time.Duration.ofMinutes(15)));
        ArgumentCaptor<GeneratePresignedUrlRequest> request=ArgumentCaptor.forClass(GeneratePresignedUrlRequest.class);
        verify(client).generatePresignedUrl(request.capture());
        assertEquals("bucket-123",request.getValue().getBucketName());
        assertEquals("original/u/video.mp4",request.getValue().getKey());
        assertEquals(java.util.Map.of("ci-process","snapshot","time","0","width","480","format","jpg","rotate","auto","mode","keyframe"),request.getValue().getRequestParameters());
        org.junit.jupiter.api.Assertions.assertTrue(request.getValue().getExpiration().getTime()>=before+900000&&request.getValue().getExpiration().getTime()<=System.currentTimeMillis()+900000);
    }

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
        when(client.getSnapshot(any(CosSnapshotRequest.class))).thenReturn(new java.io.ByteArrayInputStream(new byte[]{(byte)0xff,(byte)0xd8,(byte)0xff,1}));
        var result = storage(client).process(DomainEnums.MediaKind.VIDEO, "original/u/2026/07/video.mp4", "audit-job");
        assertEquals(ObjectStorage.ProcessingOutcome.READY, result.outcome());
        assertEquals("thumbnail/u/2026/07/video.jpg", result.thumbnailKey());
        ArgumentCaptor<CosSnapshotRequest> request = ArgumentCaptor.forClass(CosSnapshotRequest.class);
        verify(client).getSnapshot(request.capture());
        assertEquals("original/u/2026/07/video.mp4", request.getValue().getObjectKey());
        assertEquals("bucket-123", request.getValue().getBucketName());
        verify(client).putObject(eq("bucket-123"),eq(result.thumbnailKey()),any(java.io.InputStream.class),any(com.qcloud.cos.model.ObjectMetadata.class));
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
        verify(client, never()).getSnapshot(any(CosSnapshotRequest.class));
        verify(client, never()).putObject(anyString(),anyString(),any(java.io.InputStream.class),any(com.qcloud.cos.model.ObjectMetadata.class));
    }

    @Test
    void shouldKeepAuditedVideoPlayableWhenCoverGenerationNeedsRetry() {
        COSClient client = mock(COSClient.class);
        AuditingJobsDetail detail = new AuditingJobsDetail();
        detail.setState("Success"); detail.setResult("0");
        VideoAuditingResponse response = new VideoAuditingResponse(); response.setJobsDetail(detail);
        when(client.describeAuditingJob(any(VideoAuditingRequest.class))).thenReturn(response);
        when(client.getSnapshot(any(CosSnapshotRequest.class))).thenThrow(new IllegalStateException("temporary failure"));
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
