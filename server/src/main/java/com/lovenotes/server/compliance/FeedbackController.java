package com.lovenotes.server.compliance;

import com.lovenotes.server.auth.Actor;
import com.lovenotes.server.auth.AuthFilter;
import com.lovenotes.server.common.ApiResponse;
import com.lovenotes.server.common.RequestContext;
import com.lovenotes.server.domain.DomainEnums;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/feedback")
public class FeedbackController {
    private final FeedbackService service;

    public FeedbackController(FeedbackService service) {
        this.service = service;
    }

    @PostMapping
    ResponseEntity<ApiResponse<FeedbackService.FeedbackView>> create(
            @RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
            @Valid @RequestBody FeedbackRequest body,
            HttpServletRequest request) {
        String requestId = RequestContext.requestId(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(
                service.create(actor.userId(), body.resourceType(), body.resourceId(),
                        body.category(), body.description(), requestId),
                requestId));
    }

    @GetMapping("/my")
    ApiResponse<List<FeedbackService.FeedbackView>> mine(
            @RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
            @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit,
            HttpServletRequest request) {
        return ApiResponse.ok(service.mine(actor.userId(), limit), RequestContext.requestId(request));
    }

    public record FeedbackRequest(
            @Size(max = 40) String resourceType,
            UUID resourceId,
            DomainEnums.FeedbackCategory category,
            @Size(max = 500) String description) {}
}
