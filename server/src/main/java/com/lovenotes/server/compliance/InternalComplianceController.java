package com.lovenotes.server.compliance;

import com.lovenotes.server.common.ApiResponse;
import com.lovenotes.server.common.RequestContext;
import com.lovenotes.server.domain.DomainEnums;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/internal")
public class InternalComplianceController {
    private final InternalOperationGuard guard;
    private final FeedbackService feedback;
    private final AccountDeletionProcessingService accountDeletion;

    public InternalComplianceController(InternalOperationGuard guard, FeedbackService feedback,
                                        AccountDeletionProcessingService accountDeletion) {
        this.guard = guard;
        this.feedback = feedback;
        this.accountDeletion = accountDeletion;
    }

    @GetMapping("/feedback")
    ApiResponse<List<FeedbackService.InternalFeedbackView>> listFeedback(
            @RequestHeader(value = InternalOperationGuard.HEADER, required = false) String token,
            @RequestParam(required = false) DomainEnums.FeedbackStatus status,
            @RequestParam(defaultValue = "50") @Min(1) @Max(100) int limit,
            HttpServletRequest request) {
        guard.requireAuthorized(token);
        return ApiResponse.ok(feedback.listForInternal(status, limit), RequestContext.requestId(request));
    }

    @PatchMapping("/feedback/{id}")
    ApiResponse<FeedbackService.InternalFeedbackView> updateFeedback(
            @RequestHeader(value = InternalOperationGuard.HEADER, required = false) String token,
            @RequestHeader(value = "X-Internal-Operator", required = false) String operator,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateFeedbackRequest body,
            HttpServletRequest request) {
        guard.requireAuthorized(token);
        return ApiResponse.ok(feedback.updateStatus(id, body.status(), body.note(), operator, RequestContext.requestId(request)),
                RequestContext.requestId(request));
    }

    @PostMapping("/deletion-requests/process")
    ApiResponse<AccountDeletionProcessingService.ProcessingResult> processDeletionRequests(
            @RequestHeader(value = InternalOperationGuard.HEADER, required = false) String token,
            HttpServletRequest request) {
        guard.requireAuthorized(token);
        return ApiResponse.ok(accountDeletion.runBatch(), RequestContext.requestId(request));
    }

    @PostMapping("/deletion-requests/{id}/retry")
    ApiResponse<DeletionRequestService.DeletionRequestView> retryDeletionRequest(
            @RequestHeader(value = InternalOperationGuard.HEADER, required = false) String token,
            @RequestHeader(value = "X-Internal-Operator", required = false) String operator,
            @PathVariable UUID id,
            HttpServletRequest request) {
        guard.requireAuthorized(token);
        return ApiResponse.ok(DeletionRequestService.DeletionRequestView.from(
                accountDeletion.retryFailed(id, operator, RequestContext.requestId(request))),
                RequestContext.requestId(request));
    }

    public record UpdateFeedbackRequest(DomainEnums.FeedbackStatus status, @Size(max = 240) String note) {}
}
