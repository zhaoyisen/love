package com.lovenotes.server.compliance;

import com.lovenotes.server.auth.Actor;
import com.lovenotes.server.auth.AuthFilter;
import com.lovenotes.server.common.ApiResponse;
import com.lovenotes.server.common.RequestContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
public class DeletionRequestController {
    private final DeletionRequestService service;

    public DeletionRequestController(DeletionRequestService service) {
        this.service = service;
    }

    @PostMapping("/me/deletion-requests")
    ResponseEntity<ApiResponse<DeletionRequestService.CreatedDeletionRequest>> create(
            @RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody CreateDeletionRequest body,
            HttpServletRequest request) {
        String requestId = RequestContext.requestId(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(
                service.create(actor.userId(), body.confirmText(), body.reason(), idempotencyKey, requestId),
                requestId));
    }

    @GetMapping("/me/deletion-requests/latest")
    ApiResponse<DeletionRequestService.DeletionRequestView> latest(
            @RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
            HttpServletRequest request) {
        return ApiResponse.ok(service.latest(actor.userId()), RequestContext.requestId(request));
    }

    @GetMapping("/deletion-requests/{id}/status")
    ApiResponse<DeletionRequestService.DeletionRequestView> publicStatus(
            @PathVariable UUID id,
            @RequestParam("token") String token,
            HttpServletRequest request) {
        return ApiResponse.ok(service.publicStatus(id, token), RequestContext.requestId(request));
    }

    public record CreateDeletionRequest(@NotBlank String confirmText, @Size(max = 200) String reason) {}
}
