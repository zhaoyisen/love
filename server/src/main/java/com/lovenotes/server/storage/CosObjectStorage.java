package com.lovenotes.server.storage;

import com.qcloud.cos.COSClient;
import com.qcloud.cos.auth.BasicCOSCredentials;
import com.qcloud.cos.http.HttpProtocol;
import com.qcloud.cos.model.DeleteObjectsRequest;
import com.qcloud.cos.model.GeneratePresignedUrlRequest;
import com.qcloud.cos.model.ObjectMetadata;
import com.qcloud.cos.model.ResponseHeaderOverrides;
import com.qcloud.cos.model.ciModel.auditing.AuditingJobsDetail;
import com.qcloud.cos.model.ciModel.auditing.ImageAuditingRequest;
import com.qcloud.cos.model.ciModel.auditing.ImageAuditingResponse;
import com.qcloud.cos.model.ciModel.auditing.VideoAuditingRequest;
import com.qcloud.cos.model.ciModel.auditing.VideoAuditingResponse;
import com.qcloud.cos.model.ciModel.auditing.TextAuditingRequest;
import com.qcloud.cos.model.ciModel.auditing.TextAuditingResponse;
import com.qcloud.cos.model.ciModel.common.ImageProcessRequest;
import com.qcloud.cos.model.ciModel.persistence.PicOperations;
import com.qcloud.cos.model.ciModel.snapshot.CosSnapshotRequest;
import com.qcloud.cos.region.Region;
import com.tencent.cloud.CosStsClient;
import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.config.LoveNotesProperties;
import com.lovenotes.server.domain.DomainEnums;
import jakarta.annotation.PreDestroy;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.*;
import java.util.*;

@Component @Profile("prod")
public class CosObjectStorage implements ObjectStorage {
    private static final Logger log = LoggerFactory.getLogger(CosObjectStorage.class);
    private static final int MAX_VIDEO_COVER_BYTES = 20 * 1024 * 1024;
    private final LoveNotesProperties properties;
    private final COSClient cos;
    @org.springframework.beans.factory.annotation.Autowired
    public CosObjectStorage(LoveNotesProperties properties){
        this(properties, createClient(properties));
    }
    CosObjectStorage(LoveNotesProperties properties, COSClient cos){
        this.properties=properties;
        this.cos=cos;
    }
    private static COSClient createClient(LoveNotesProperties properties){
        var clientConfig=new com.qcloud.cos.ClientConfig(new Region(properties.storage().region()));
        clientConfig.setHttpProtocol(HttpProtocol.https);
        return new COSClient(new BasicCOSCredentials(properties.storage().secretId(),properties.storage().secretKey()),clientConfig);
    }

    public UploadCredential issueUploadCredential(String key,Duration ttl){
        TreeMap<String,Object> config=new TreeMap<>();
        config.put("secretId",properties.storage().secretId());config.put("secretKey",properties.storage().secretKey());
        config.put("durationSeconds",Math.toIntExact(ttl.toSeconds()));config.put("bucket",properties.storage().bucket());config.put("region",properties.storage().region());
        String scope=uploadScope(key);
        // uploadFile may use multipart/resume APIs in addition to PutObject. Authorize only
        // the uploader's generated monthly directory so every SDK request addresses a
        // resource covered by the temporary policy, without exposing other users' objects.
        config.put("allowPrefixes",new String[]{scope});
        config.put("allowActions",new String[]{
                "name/cos:PutObject",
                "name/cos:InitiateMultipartUpload",
                "name/cos:ListMultipartUploads",
                "name/cos:UploadPart",
                "name/cos:ListParts",
                "name/cos:CompleteMultipartUpload",
                "name/cos:AbortMultipartUpload"
        });
        try{
            var response=CosStsClient.getCredential(config);
            var temporary=response.credentials;
            long startTime=response.startTime;long expiredTime=response.expiredTime;
            var credentials=new Credentials(temporary.tmpSecretId,temporary.tmpSecretKey,temporary.sessionToken,startTime,expiredTime);
            log.info("COS upload credential issued: bucket={}, region={}, key={}, scope={}, startTime={}, expiredTime={}, ttlSeconds={}, stsRequestId={}",
                    properties.storage().bucket(),properties.storage().region(),key,scope,startTime,expiredTime,ttl.toSeconds(),response.requestId);
            return new UploadCredential("COS",properties.storage().bucket(),properties.storage().region(),key,credentials,Instant.ofEpochSecond(expiredTime));
        }catch(Exception exception){
            log.error("COS STS credential issuance failed: bucket={}, region={}, key={}, scope={}, exceptionType={}",
                    properties.storage().bucket(),properties.storage().region(),key,scope,exception.getClass().getSimpleName());
            log.debug("COS STS credential issuance exception",exception);
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PROVIDER_UNAVAILABLE","对象存储临时凭证暂时不可用，请稍后重试。");
        }
    }
    static String uploadScope(String key){
        int separator=key==null?-1:key.lastIndexOf('/');
        if(separator<0)throw new IllegalArgumentException("storage key must contain a directory");
        return key.substring(0,separator+1)+"*";
    }
    public ObjectInfo stat(String key,long expectedSize){
        try{ObjectMetadata metadata=cos.getObjectMetadata(properties.storage().bucket(),key);return new ObjectInfo(metadata.getContentLength(),metadata.getETag(),metadata.getContentType());}
        catch(Exception exception){
            var diagnostic=CosProviderFailure.inspect(exception);
            if(Integer.valueOf(404).equals(diagnostic.status())&&!"NoSuchKey".equalsIgnoreCase(diagnostic.errorCode())&&!"NoSuchBucket".equalsIgnoreCase(diagnostic.errorCode())) {
                // COS SDK HEAD errors omit XML codes; a one-byte GET distinguishes a missing key from a bad bucket.
                try(var ignored=cos.getObject(new com.qcloud.cos.model.GetObjectRequest(properties.storage().bucket(),key).withRange(0,0))) {
                    diagnostic=new CosProviderFailure.Diagnostic("OBJECT_CHANGED",null,null,null,"HeadGetMismatch");
                } catch(Exception confirmed) {exception=confirmed;diagnostic=CosProviderFailure.inspect(confirmed);}
            }
            if(Integer.valueOf(404).equals(diagnostic.status())&&"NoSuchKey".equalsIgnoreCase(diagnostic.errorCode()))
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"UPLOAD_NOT_FOUND","没有找到媒体文件。");
            logProviderFailure("object check",null,key,null,exception);
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PROVIDER_UNAVAILABLE","存储权限或网络异常，请稍后重试。");
        }
    }
    public String signedGetUrl(String key,Duration ttl,String contentType){
        Date expiry=Date.from(Instant.now().plus(ttl));
        var request=new GeneratePresignedUrlRequest(properties.storage().bucket(),key);
        request.setExpiration(expiry);
        if(contentType!=null&&!contentType.isBlank()){
            request.setResponseHeaders(new ResponseHeaderOverrides()
                    .withContentType(contentType)
                    .withContentDisposition("inline"));
        }
        return cos.generatePresignedUrl(request).toString();
    }
    public boolean requiresProcessing(){return true;}
    public String signedVideoSnapshotUrl(String key,Duration ttl){
        var request=new GeneratePresignedUrlRequest(properties.storage().bucket(),key);
        request.setExpiration(Date.from(Instant.now().plus(ttl)));
        request.addRequestParameter("ci-process","snapshot");
        request.addRequestParameter("time","0");
        request.addRequestParameter("width","480");
        request.addRequestParameter("format","jpg");
        request.addRequestParameter("rotate","auto");
        request.addRequestParameter("mode","keyframe");
        return cos.generatePresignedUrl(request).toString();
    }
    public ProcessingResult process(DomainEnums.MediaKind kind,String key,String jobId){
        try{
            if(kind==DomainEnums.MediaKind.IMAGE){
                ImageAuditingRequest request=new ImageAuditingRequest();
                request.setBucketName(properties.storage().bucket());request.setObjectKey(key);request.setLargeImageDetect("1");
                ImageAuditingResponse response=cos.imageAuditing(request);
                if(!"0".equals(response.getResult()))return new ProcessingResult(ProcessingOutcome.BLOCKED,response.getJobId(),null,null);
                try{
                    Derivatives derivatives=createDerivatives(kind,key);
                    return new ProcessingResult(ProcessingOutcome.READY,response.getJobId(),derivatives.displayKey(),derivatives.thumbnailKey());
                }catch(Exception derivativeFailure){
                    // Derivatives are an optimization, not a moderation boundary. Once the
                    // original image passed auditing, publish it instead of retrying forever.
                    logProviderFailure("image derivative",kind,key,response.getJobId(),derivativeFailure);
                    return new ProcessingResult(ProcessingOutcome.READY,response.getJobId(),null,null);
                }
            }
            VideoAuditingRequest request=new VideoAuditingRequest();request.setBucketName(properties.storage().bucket());
            VideoAuditingResponse response;
            if(jobId==null||jobId.isBlank()){
                request.getInput().setObject(key);request.getConf().setDetectContent("1");
                response=cos.createVideoAuditingJob(request);
            }else{
                request.setJobId(jobId);response=cos.describeAuditingJob(request);
            }
            AuditingJobsDetail detail=response.getJobsDetail();
            if(detail==null)return new ProcessingResult(ProcessingOutcome.PENDING,jobId,null,null);
            String currentJob=detail.getJobId()==null?jobId:detail.getJobId();
            if("Success".equalsIgnoreCase(detail.getState())){
                if(!"0".equals(detail.getResult()))return new ProcessingResult(ProcessingOutcome.BLOCKED,currentJob,null,null);
                try{
                    Derivatives derivatives=createDerivatives(kind,key);
                    return new ProcessingResult(ProcessingOutcome.READY,currentJob,derivatives.displayKey(),derivatives.thumbnailKey());
                }catch(Exception derivativeFailure){
                    // 已审核的视频可以发布；后台补图任务独立重试，避免再次审核和重复通知。
                    logProviderFailure("video thumbnail",kind,key,currentJob,derivativeFailure);
                    return new ProcessingResult(ProcessingOutcome.READY,currentJob,key,null);
                }
            }
            if("Failed".equalsIgnoreCase(detail.getState()))return new ProcessingResult(ProcessingOutcome.FAILED,currentJob,null,null);
            return new ProcessingResult(ProcessingOutcome.PENDING,currentJob,null,null);
        }catch(Exception exception){
            logProviderFailure("media audit",kind,key,jobId,exception);
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PROVIDER_UNAVAILABLE","媒体安全处理服务暂时不可用，请稍后重试。");
        }
    }
    private void logProviderFailure(String operation,DomainEnums.MediaKind kind,String key,String jobId,Exception exception){
        CosProviderFailure.Diagnostic diagnostic=CosProviderFailure.inspect(exception);
        log.error("COS {} failed: kind={}, key={}, jobId={}, category={}, status={}, errorCode={}, requestId={}, exceptionType={}, bucket={}, region={}, parameterMessage={}",
                operation,kind,key,jobId,diagnostic.category(),diagnostic.status(),diagnostic.errorCode(),diagnostic.requestId(),
                diagnostic.exceptionType(),properties.storage().bucket(),properties.storage().region(),
                CosProviderFailure.parameterMessage(exception,properties.storage().secretId(),properties.storage().secretKey()));
        log.debug("COS "+operation+" exception",exception);
    }
    public Derivatives createDerivatives(DomainEnums.MediaKind kind,String sourceKey){
        return derivatives(kind,sourceKey,"");
    }
    @Override public Derivatives regenerateDerivatives(DomainEnums.MediaKind kind,String sourceKey,String generation){
        try {
            return derivatives(kind,sourceKey,generation);
        } catch(RuntimeException exception) {
            CosProviderFailure.Diagnostic diagnostic=CosProviderFailure.inspect(exception);
            log.error("COS derivative regeneration failed: kind={}, generation={}, category={}, status={}, errorCode={}, requestId={}, exceptionType={}, parameterMessage={}",
                    kind,generation,diagnostic.category(),diagnostic.status(),diagnostic.errorCode(),diagnostic.requestId(),diagnostic.exceptionType(),
                    CosProviderFailure.parameterMessage(exception,properties.storage().secretId(),properties.storage().secretKey()));
            throw exception;
        }
    }
    private Derivatives derivatives(DomainEnums.MediaKind kind,String sourceKey,String revision){
        Derivatives keys=ObjectStorage.derivativeKeys(kind,sourceKey,revision);
        if(kind==DomainEnums.MediaKind.VIDEO){
            String thumbnailKey=keys.thumbnailKey();
            CosSnapshotRequest request=new CosSnapshotRequest();
            request.setBucketName(properties.storage().bucket());
            request.setObjectKey(sourceKey);
            request.setTime("0");request.setWidth("480");request.setHeight("0");
            request.setFormat("jpg");request.setMode("keyframe");request.setRotate("auto");
            // The realtime endpoint works for buckets where POST /snapshot rejects the same frame parameters.
            try(var snapshot=cos.getSnapshot(request)) {
                byte[] jpeg=snapshot.readNBytes(MAX_VIDEO_COVER_BYTES+1);
                if(jpeg.length<3||jpeg.length>MAX_VIDEO_COVER_BYTES||(jpeg[0]&255)!=255||(jpeg[1]&255)!=216||(jpeg[2]&255)!=255)
                    throw new IllegalStateException("Video snapshot is not a bounded JPEG image");
                var metadata=new ObjectMetadata();metadata.setContentType("image/jpeg");metadata.setContentLength(jpeg.length);
                cos.putObject(properties.storage().bucket(),thumbnailKey,new java.io.ByteArrayInputStream(jpeg),metadata);
            } catch(java.io.IOException exception) {
                throw new com.qcloud.cos.exception.CosClientException("Unable to read video snapshot",exception);
            }
            return new Derivatives(sourceKey,thumbnailKey);
        }
        String displayKey=keys.displayKey();String thumbnailKey=keys.thumbnailKey();
        PicOperations operations=new PicOperations();operations.setIsPicInfo(0);
        // COS resolves fileid relative to the source directory unless it starts with '/'.
        PicOperations.Rule display=new PicOperations.Rule();display.setBucket(properties.storage().bucket());display.setFileId("/"+displayKey);display.setRule("imageMogr2/thumbnail/2000x2000>/strip/format/webp");
        PicOperations.Rule thumbnail=new PicOperations.Rule();thumbnail.setBucket(properties.storage().bucket());thumbnail.setFileId("/"+thumbnailKey);thumbnail.setRule("imageMogr2/thumbnail/480x480>/strip/format/webp");
        operations.setRules(List.of(display,thumbnail));
        ImageProcessRequest request=new ImageProcessRequest(properties.storage().bucket(),sourceKey);request.setPicOperations(operations);cos.processImage(request);
        return new Derivatives(displayKey,thumbnailKey);
    }
    public ProcessingOutcome auditText(String text){
        try{
            TextAuditingRequest request=new TextAuditingRequest();request.setBucketName(properties.storage().bucket());
            request.getInput().setContent(Base64.getEncoder().encodeToString(text.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            TextAuditingResponse response=cos.createAuditingTextJobs(request);
            AuditingJobsDetail detail=response.getJobsDetail();
            if(detail==null||detail.getResult()==null)return ProcessingOutcome.FAILED;
            return "0".equals(detail.getResult())?ProcessingOutcome.READY:ProcessingOutcome.BLOCKED;
        }catch(Exception exception){
            CosProviderFailure.Diagnostic diagnostic=CosProviderFailure.inspect(exception);
            log.error("COS text audit failed: category={}, status={}, errorCode={}, requestId={}, exceptionType={}, bucket={}, region={}",
                    diagnostic.category(),diagnostic.status(),diagnostic.errorCode(),diagnostic.requestId(),diagnostic.exceptionType(),
                    properties.storage().bucket(),properties.storage().region());
            log.debug("COS text audit exception",exception);
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PROVIDER_UNAVAILABLE","文本安全检测服务暂时不可用，请稍后重试。");
        }
    }
    public void deleteObjects(Collection<String> storageKeys){
        List<String> keys=storageKeys.stream().filter(Objects::nonNull).filter(key->!key.isBlank()).distinct().toList();
        if(keys.isEmpty())return;
        try{cos.deleteObjects(new DeleteObjectsRequest(properties.storage().bucket()).withKeys(keys.toArray(String[]::new)));}
        catch(Exception exception){throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PROVIDER_UNAVAILABLE","对象存储清理暂时不可用，稍后将自动重试。");}
    }
    @PreDestroy public void close(){cos.shutdown();}
}
