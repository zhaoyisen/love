package com.lovenotes.server.media;

import com.lovenotes.server.common.*;
import com.lovenotes.server.config.LoveNotesProperties;
import com.lovenotes.server.domain.*;
import com.lovenotes.server.repository.*;
import com.lovenotes.server.storage.ObjectStorage;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class MediaService {
    private static final Set<String> IMAGE_TYPES=Set.of("image/jpeg","image/png","image/webp");
    private static final Set<String> VIDEO_TYPES=Set.of("video/mp4","video/quicktime");
    private final MediaAssetRepository assets;private final UploadSessionRepository sessions;private final ObjectStorage storage;private final LoveNotesProperties properties;
    public MediaService(MediaAssetRepository assets,UploadSessionRepository sessions,ObjectStorage storage,LoveNotesProperties properties){this.assets=assets;this.sessions=sessions;this.storage=storage;this.properties=properties;}

    @Transactional
    public CreatedUpload create(UUID actorId,String mimeType,long size,String sha256){
        DomainEnums.MediaKind kind=kind(mimeType);long max=kind==DomainEnums.MediaKind.IMAGE?properties.media().imageMaxBytes():properties.media().videoMaxBytes();
        if(size<=0||size>max)throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR","媒体文件大小不符合要求。",Map.of("max_bytes",max));
        if(sha256!=null&&!sha256.matches("[a-fA-F0-9]{64}"))throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR","sha256 格式不正确。");
        String month=DateTimeFormatter.ofPattern("yyyy/MM").withZone(ZoneOffset.UTC).format(Instant.now());
        String key="original/"+actorId+"/"+month+"/"+UuidV7.next()+extension(mimeType);
        MediaAssetEntity asset=assets.save(new MediaAssetEntity(actorId,kind,key,sha256,mimeType,size));
        Duration ttl=Duration.ofSeconds(properties.media().uploadCredentialTtlSeconds());
        UploadSessionEntity session=sessions.save(new UploadSessionEntity(asset.getId(),actorId,Instant.now().plus(ttl)));
        return new CreatedUpload(session,asset,storage.issueUploadCredential(key,ttl));
    }

    @Transactional
    public MediaAssetEntity complete(UUID actorId,UUID sessionId,String etag){
        UploadSessionEntity session=sessions.findById(sessionId).orElseThrow(()->notFound());
        if(!session.getUserId().equals(actorId))throw forbidden();
        if(session.getStatus()==DomainEnums.UploadStatus.COMPLETED)return assets.findById(session.getAssetId()).orElseThrow();
        if(session.getExpiresAt().isBefore(Instant.now()))throw new ApiException(HttpStatus.CONFLICT,"UPLOAD_SESSION_EXPIRED","上传会话已过期，请重新选择媒体。");
        MediaAssetEntity asset=assets.findById(session.getAssetId()).orElseThrow();
        ObjectStorage.ObjectInfo info=storage.stat(asset.getStorageKey(),asset.getSizeBytes());
        if(info.size()!=asset.getSizeBytes())throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"UPLOAD_SIZE_MISMATCH","上传文件大小与申请时不一致。");
        asset.complete(info.etag()!=null?info.etag():etag);session.complete();return asset;
    }

    @Transactional(readOnly=true)
    public MediaAssetEntity getAuthorized(UUID actorId,UUID assetId){MediaAssetEntity asset=assets.findById(assetId).orElseThrow(()->notFound());if(!asset.getUploaderId().equals(actorId))throw forbidden();return asset;}
    private DomainEnums.MediaKind kind(String mime){if(IMAGE_TYPES.contains(mime))return DomainEnums.MediaKind.IMAGE;if(VIDEO_TYPES.contains(mime))return DomainEnums.MediaKind.VIDEO;throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR","不支持这种媒体格式。");}
    private String extension(String mime){return switch(mime){case"image/jpeg"->".jpg";case"image/png"->".png";case"image/webp"->".webp";case"video/quicktime"->".mov";default->".mp4";};}
    private ApiException forbidden(){return new ApiException(HttpStatus.FORBIDDEN,"RESOURCE_FORBIDDEN","内容不存在或当前不可访问。");}
    private ApiException notFound(){return new ApiException(HttpStatus.NOT_FOUND,"RESOURCE_NOT_FOUND","内容不存在或当前不可访问。");}
    public record CreatedUpload(UploadSessionEntity session,MediaAssetEntity asset,ObjectStorage.UploadCredential credential){}
}
