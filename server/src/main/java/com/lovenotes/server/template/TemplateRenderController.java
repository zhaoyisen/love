package com.lovenotes.server.template;

import com.lovenotes.server.auth.Actor;
import com.lovenotes.server.auth.AuthFilter;
import com.lovenotes.server.common.ApiResponse;
import com.lovenotes.server.common.RequestContext;
import com.lovenotes.server.domain.DerivedAssetEntity;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class TemplateRenderController {
    private final TemplateRenderService service;

    public TemplateRenderController(TemplateRenderService service) {
        this.service = service;
    }

    @PostMapping("/template-renders")
    ResponseEntity<ApiResponse<TemplateRenderView>> register(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
                                                               @Valid @RequestBody RegisterTemplateRenderRequest body,
                                                               HttpServletRequest request) {
        DerivedAssetEntity asset = service.register(actor.userId(), new TemplateRenderService.RegisterCommand(
                body.sourceAssetIds(), body.renderedAssetId(), body.templateId(), body.templateVersion(), body.renderConfig()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(TemplateRenderView.from(asset), RequestContext.requestId(request)));
    }

    public record RegisterTemplateRenderRequest(@NotEmpty @Size(max = 9) List<@NotNull UUID> sourceAssetIds,
                                                @NotNull UUID renderedAssetId,
                                                @NotBlank @Size(max = 60) String templateId,
                                                @Min(1) @Max(99) int templateVersion,
                                                @Size(max = 2000) String renderConfig) {}

    public record TemplateRenderView(UUID id, List<UUID> sourceAssetIds, UUID renderedAssetId, String templateId,
                                     Integer templateVersion, String status) {
        static TemplateRenderView from(DerivedAssetEntity asset) {
            return new TemplateRenderView(asset.getId(), asset.getSourceAssetIds(), asset.getRenderedMediaAssetId(),
                    asset.getTemplateId(), asset.getTemplateVersion(), asset.getStatus().name());
        }
    }
}
