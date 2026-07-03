package com.lovenotes.server.storage;

import com.qcloud.cos.COSClient;
import com.qcloud.cos.auth.BasicCOSCredentials;
import com.qcloud.cos.model.ObjectMetadata;
import com.qcloud.cos.region.Region;
import com.tencent.cloud.CosStsClient;
import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.config.LoveNotesProperties;
import jakarta.annotation.PreDestroy;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.json.JSONObject;

import java.time.*;
import java.util.*;

@Component @Profile("prod")
public class CosObjectStorage implements ObjectStorage {
    private final LoveNotesProperties properties;
    private final COSClient cos;
    public CosObjectStorage(LoveNotesProperties properties){this.properties=properties;this.cos=new COSClient(new BasicCOSCredentials(properties.storage().secretId(),properties.storage().secretKey()),new com.qcloud.cos.ClientConfig(new Region(properties.storage().region())));}

    public UploadCredential issueUploadCredential(String key,Duration ttl){
        TreeMap<String,Object> config=new TreeMap<>();
        config.put("secretId",properties.storage().secretId());config.put("secretKey",properties.storage().secretKey());
        config.put("durationSeconds",Math.toIntExact(ttl.toSeconds()));config.put("bucket",properties.storage().bucket());config.put("region",properties.storage().region());
        config.put("allowPrefixes",new String[]{key});config.put("allowActions",new String[]{"name/cos:PutObject"});
        try{
            JSONObject response=CosStsClient.getCredential(config);
            JSONObject temporary=response.getJSONObject("credentials");
            long startTime=response.getLong("startTime");long expiredTime=response.getLong("expiredTime");
            var credentials=new Credentials(temporary.getString("tmpSecretId"),temporary.getString("tmpSecretKey"),temporary.getString("sessionToken"),startTime,expiredTime);
            return new UploadCredential("COS",properties.storage().bucket(),properties.storage().region(),key,credentials,Instant.ofEpochSecond(expiredTime));
        }catch(Exception exception){throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PROVIDER_UNAVAILABLE","对象存储临时凭证暂时不可用，请稍后重试。");}
    }
    public ObjectInfo stat(String key,long expectedSize){try{ObjectMetadata metadata=cos.getObjectMetadata(properties.storage().bucket(),key);return new ObjectInfo(metadata.getContentLength(),metadata.getETag(),metadata.getContentType());}catch(Exception exception){throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"UPLOAD_NOT_FOUND","没有找到已上传的媒体，请重试上传。");}}
    public String signedGetUrl(String key,Duration ttl){Date expiry=Date.from(Instant.now().plus(ttl));return cos.generatePresignedUrl(properties.storage().bucket(),key,expiry).toString();}
    @PreDestroy public void close(){cos.shutdown();}
}
