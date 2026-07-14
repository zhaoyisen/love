package com.lovenotes.server.media;

import com.lovenotes.server.auth.Actor;
import com.lovenotes.server.auth.AuthFilter;
import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.common.ApiResponse;
import com.lovenotes.server.common.RequestContext;
import com.lovenotes.server.config.LoveNotesProperties;
import com.lovenotes.server.repository.MediaAssetRepository;
import com.lovenotes.server.repository.UploadSessionRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class MediaDiagnosticController {
    private static final Logger log= LoggerFactory.getLogger(MediaDiagnosticController.class);
    private final UploadSessionRepository sessions;
    private final MediaAssetRepository assets;
    private final LoveNotesProperties properties;

    public MediaDiagnosticController(UploadSessionRepository sessions,MediaAssetRepository assets,LoveNotesProperties properties){
        this.sessions=sessions;this.assets=assets;this.properties=properties;
    }

    @PostMapping("/media-diagnostics/cos-upload-failures")
    @Transactional(readOnly=true)
    ApiResponse<Acknowledged> report(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
                                     @Valid @RequestBody CosUploadFailure body,
                                     HttpServletRequest request){
        var session=sessions.findById(body.uploadSessionId()).orElseThrow(MediaDiagnosticController::notFound);
        if(!session.getUserId().equals(actor.userId()))throw notFound();
        var asset=assets.findById(session.getAssetId()).orElseThrow(MediaDiagnosticController::notFound);
        log.warn("COS client upload failed: apiRequestId={}, userId={}, uploadSessionId={}, assetId={}, bucket={}, region={}, key={}, statusCode={}, providerCode={}, providerRequestId={}, providerMessage={}",
                RequestContext.requestId(request),actor.userId(),session.getId(),asset.getId(),properties.storage().bucket(),properties.storage().region(),asset.getStorageKey(),
                body.statusCode(),safe(body.providerCode()),safe(body.providerRequestId()),safe(body.providerMessage()));
        return ApiResponse.ok(new Acknowledged(true),RequestContext.requestId(request));
    }

    private static String safe(String value){return value==null?null:value.replace('\r',' ').replace('\n',' ');}
    private static ApiException notFound(){return new ApiException(HttpStatus.NOT_FOUND,"RESOURCE_NOT_FOUND","内容不存在或当前不可访问。");}

    public record CosUploadFailure(
            @NotNull UUID uploadSessionId,
            @Min(0) @Max(599) Integer statusCode,
            @Size(max=100) String providerCode,
            @Size(max=500) String providerMessage,
            @Size(max=200) String providerRequestId
    ){}
    public record Acknowledged(boolean accepted){}
}
