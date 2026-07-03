package com.lovenotes.server.couple;

import com.lovenotes.server.auth.*;
import com.lovenotes.server.common.*;
import com.lovenotes.server.domain.CoupleSpaceEntity;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.time.*;
import java.util.*;

@RestController
public class CoupleController {
    private final CoupleService service;
    public CoupleController(CoupleService service){this.service=service;}

    @PostMapping("/couple-invitations")
    ResponseEntity<ApiResponse<InvitationCreated>> create(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,@RequestHeader("Idempotency-Key") String key,HttpServletRequest request){var result=service.createInvitation(actor.userId(),key);return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(new InvitationCreated(result.invitation().getId(),result.token(),result.invitation().getExpiresAt()),RequestContext.requestId(request)));}
    @GetMapping("/couple-invitations/{token}/preview")
    ApiResponse<CoupleService.InvitationPreview> preview(@PathVariable String token,HttpServletRequest request){return ApiResponse.ok(service.preview(token),RequestContext.requestId(request));}
    @PostMapping("/couple-invitations/{token}/accept")
    ApiResponse<CoupleResponse> accept(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,@PathVariable String token,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody AcceptRequest body,HttpServletRequest request){return ApiResponse.ok(CoupleResponse.from(service.accept(actor.userId(),token,body.rulesConfirmed(),key)),RequestContext.requestId(request));}
    @DeleteMapping("/couple-invitations/{id}")
    ResponseEntity<Void> revoke(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,@PathVariable UUID id){service.revoke(actor.userId(),id);return ResponseEntity.noContent().build();}
    @GetMapping("/couples/current")
    ApiResponse<CoupleResponse> current(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,HttpServletRequest request){return ApiResponse.ok(service.current(actor.userId()).map(CoupleResponse::from).orElse(null),RequestContext.requestId(request));}
    @PatchMapping("/couples/current")
    ApiResponse<CoupleResponse> update(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,@Valid @RequestBody UpdateCoupleRequest body,HttpServletRequest request){return ApiResponse.ok(CoupleResponse.from(service.update(actor.userId(),body.version(),body.relationshipName(),body.anniversary())),RequestContext.requestId(request));}
    @PostMapping("/couples/current/unbind")
    ApiResponse<CoupleResponse> unbind(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody UnbindRequest body,HttpServletRequest request){return ApiResponse.ok(CoupleResponse.from(service.unbind(actor.userId(),body.version(),body.confirmText(),key)),RequestContext.requestId(request));}

    public record InvitationCreated(UUID invitationId,String token,Instant expiresAt){}
    public record AcceptRequest(@AssertTrue boolean rulesConfirmed){}
    public record UpdateCoupleRequest(@Min(0) int version,@NotBlank @Size(max=40) String relationshipName,LocalDate anniversary){}
    public record UnbindRequest(@Min(0) int version,@NotBlank String confirmText){}
    public record CoupleResponse(UUID id,String status,String relationshipName,LocalDate anniversary,int version){static CoupleResponse from(CoupleSpaceEntity entity){return new CoupleResponse(entity.getId(),entity.getStatus().name(),entity.getRelationshipName(),entity.getAnniversary(),entity.getVersion());}}
}
