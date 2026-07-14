package com.lovenotes.server.storage;
import com.lovenotes.server.config.LoveNotesProperties;
import com.lovenotes.server.domain.DomainEnums;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import java.time.*;
import java.util.Collection;
@Component @Profile({"dev","test"})
public class LocalObjectStorage implements ObjectStorage {
    private final LoveNotesProperties properties;
    public LocalObjectStorage(LoveNotesProperties properties){this.properties=properties;}
    public UploadCredential issueUploadCredential(String key,Duration ttl){Instant expiry=Instant.now().plus(ttl);return new UploadCredential("LOCAL",properties.storage().bucket(),properties.storage().region(),key,null,expiry);}
    public ObjectInfo stat(String key,long expectedSize){return new ObjectInfo(expectedSize,"local-etag",null);}
    public String signedGetUrl(String key,Duration ttl,String contentType){return "local://"+key;}
    public boolean requiresProcessing(){return false;}
    public ProcessingResult process(DomainEnums.MediaKind kind,String key,String jobId){
        if(kind==DomainEnums.MediaKind.IMAGE){
            String suffix=key.startsWith("original/")?key.substring("original/".length()):key;
            int extension=suffix.lastIndexOf('.');
            String stem=extension<0?suffix:suffix.substring(0,extension);
            return new ProcessingResult(ProcessingOutcome.READY,null,"display/"+stem+".webp","thumbnail/"+stem+".webp");
        }
        return new ProcessingResult(ProcessingOutcome.READY,null,key,null);
    }
    public ProcessingOutcome auditText(String text){return ProcessingOutcome.READY;}
    public void deleteObjects(Collection<String> storageKeys){}
}
