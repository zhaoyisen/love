package com.lovenotes.server.storage;
import com.lovenotes.server.config.LoveNotesProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import java.time.*;
@Component @Profile({"dev","test"})
public class LocalObjectStorage implements ObjectStorage {
    private final LoveNotesProperties properties;
    public LocalObjectStorage(LoveNotesProperties properties){this.properties=properties;}
    public UploadCredential issueUploadCredential(String key,Duration ttl){Instant expiry=Instant.now().plus(ttl);return new UploadCredential("LOCAL",properties.storage().bucket(),properties.storage().region(),key,null,expiry);}
    public ObjectInfo stat(String key,long expectedSize){return new ObjectInfo(expectedSize,"local-etag",null);}
    public String signedGetUrl(String key,Duration ttl){return "local://"+key;}
}
