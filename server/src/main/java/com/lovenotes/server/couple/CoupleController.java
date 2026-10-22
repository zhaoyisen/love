package com.lovenotes.server.couple;

import com.lovenotes.server.auth.*;
import com.lovenotes.server.common.*;
import com.lovenotes.server.domain.CoupleSpaceEntity;
import com.lovenotes.server.media.MediaService;
import com.lovenotes.server.repository.UserRepository;
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
    private final UserRepository users;
    private final MediaService media;
    public CoupleController(CoupleService service,UserRepository users,MediaService media){this.service=service;this.users=users;this.media=media;}

    @PostMapping("/couple-invitations")
    ResponseEntity<ApiResponse<InvitationCreated>> create(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,@RequestHeader("Idempotency-Key") String key,HttpServletRequest request){var result=service.createInvitation(actor.userId(),key);return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(new InvitationCreated(result.invitation().getId(),result.token(),result.invitation().getExpiresAt()),RequestContext.requestId(request)));}
    @GetMapping("/couple-invitations/{token}/preview")
    ApiResponse<CoupleService.InvitationPreview> preview(@PathVariable String token,HttpServletRequest request){return ApiResponse.ok(service.preview(token),RequestContext.requestId(request));}
    @PostMapping("/couple-invitations/{token}/accept")
    ApiResponse<CoupleResponse> accept(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,@PathVariable String token,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody AcceptRequest body,HttpServletRequest request){return ApiResponse.ok(response(actor.userId(),service.accept(actor.userId(),token,body.rulesConfirmed(),key)),RequestContext.requestId(request));}
    @DeleteMapping("/couple-invitations/{id}")
    ResponseEntity<Void> revoke(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,@PathVariable UUID id){service.revoke(actor.userId(),id);return ResponseEntity.noContent().build();}
    @GetMapping("/couples/current")
    ApiResponse<CoupleResponse> current(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,HttpServletRequest request){return ApiResponse.ok(service.current(actor.userId()).map(entity->response(actor.userId(),entity)).orElse(null),RequestContext.requestId(request));}
    @PatchMapping("/couples/current")
    ApiResponse<CoupleResponse> update(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,@Valid @RequestBody UpdateCoupleRequest body,HttpServletRequest request){return ApiResponse.ok(response(actor.userId(),service.update(actor.userId(),body.version(),body.relationshipName(),body.anniversary())),RequestContext.requestId(request));}
    @PostMapping("/couples/current/unbind")
    ApiResponse<CoupleResponse> unbind(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody UnbindRequest body,HttpServletRequest request){String requestId=RequestContext.requestId(request);return ApiResponse.ok(response(actor.userId(),service.unbind(actor.userId(),body.version(),body.confirmText(),key,requestId)),requestId);}

    public record InvitationCreated(UUID invitationId,String token,Instant expiresAt){}
    public record AcceptRequest(@AssertTrue boolean rulesConfirmed){}
    public record UpdateCoupleRequest(@Min(0) int version,@NotBlank @Size(max=40) String relationshipName,LocalDate anniversary){}
    public record UnbindRequest(@Min(0) int version,@NotBlank String confirmText){}
    private CoupleResponse response(UUID actorId,CoupleSpaceEntity entity){
        UUID partnerId=entity.getMemberAId().equals(actorId)?entity.getMemberBId():entity.getMemberAId();
        var partner=users.findById(partnerId).orElse(null);
        String partnerName=partner==null?"TA":partner.getNickname();
        String partnerAvatarUrl=partner==null?null:media.profileAvatarUrlIfReady(actorId,partnerId,partner.getAvatarMediaId());
        return new CoupleResponse(entity.getId(),entity.getStatus().name(),entity.getRelationshipName(),entity.getAnniversary(),entity.getVersion(),partnerId,partnerName,partnerAvatarUrl,entity.getAlbumOrder());
    }
    public record CoupleResponse(UUID id,String status,String relationshipName,LocalDate anniversary,int version,
                                 UUID partnerId,String partnerNickname,String partnerAvatarUrl,List<UUID> albumOrder){}
}
