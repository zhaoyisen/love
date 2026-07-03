package com.lovenotes.server.couple;

import com.lovenotes.server.common.*;
import com.lovenotes.server.config.LoveNotesProperties;
import com.lovenotes.server.domain.*;
import com.lovenotes.server.idempotency.IdempotencyStore;
import com.lovenotes.server.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.*;
import java.util.*;

@Service
public class CoupleService {
    private final UserRepository users; private final InvitationRepository invitations; private final CoupleSpaceRepository couples;
    private final ActiveCoupleMemberRepository members; private final LoveNotesProperties properties; private final IdempotencyStore idempotency;
    private final SecureRandom random=new SecureRandom();
    public CoupleService(UserRepository users,InvitationRepository invitations,CoupleSpaceRepository couples,ActiveCoupleMemberRepository members,LoveNotesProperties properties,IdempotencyStore idempotency){this.users=users;this.invitations=invitations;this.couples=couples;this.members=members;this.properties=properties;this.idempotency=idempotency;}

    @Transactional
    public CreatedInvitation createInvitation(UUID actorId,String idempotencyKey){
        ensureUnpaired(actorId);
        String key=Hashing.sha256(actorId+":invite:"+idempotencyKey);
        Optional<String> existing=idempotency.get(key);
        if(existing.isPresent()){
            String[] replay=existing.get().split("\\|",2);
            InvitationEntity invitation=invitations.findById(UUID.fromString(replay[0])).orElseThrow();
            return new CreatedInvitation(invitation,replay[1]);
        }
        invitations.findFirstByInviterIdAndStatusOrderByCreatedAtDesc(actorId,DomainEnums.InvitationStatus.ACTIVE).ifPresent(InvitationEntity::revoke);
        byte[] bytes=new byte[32];random.nextBytes(bytes);String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        InvitationEntity invitation=invitations.save(new InvitationEntity(actorId,Hashing.sha256(token),Instant.now().plus(properties.invitation().ttl())));
        idempotency.putIfAbsent(key,invitation.getId()+"|"+token,properties.invitation().ttl());
        return new CreatedInvitation(invitation,token);
    }

    @Transactional
    public InvitationPreview preview(String token){
        InvitationEntity invitation=activeInvitation(token,false);
        UserEntity inviter=users.findById(invitation.getInviterId()).orElseThrow();
        return new InvitationPreview(invitation.getId(),inviter.getNickname(),invitation.getExpiresAt());
    }

    @Transactional
    public CoupleSpaceEntity accept(UUID actorId,String token,boolean rulesConfirmed,String idempotencyKey){
        if(!rulesConfirmed) throw new ApiException(HttpStatus.BAD_REQUEST,"RULES_NOT_CONFIRMED","请先确认共享与解绑规则。");
        String replayKey=Hashing.sha256(actorId+":accept:"+Hashing.sha256(token)+":"+idempotencyKey);
        Optional<String> replay=idempotency.get(replayKey);
        if(replay.isPresent())return couples.findById(UUID.fromString(replay.get())).orElseThrow(()->notFound());
        InvitationEntity invitation=activeInvitation(token,true);
        if(invitation.getInviterId().equals(actorId)) throw new ApiException(HttpStatus.BAD_REQUEST,"SELF_INVITATION_NOT_ALLOWED","不能接受自己发出的邀请。");
        ensureUnpaired(invitation.getInviterId());ensureUnpaired(actorId);
        String inviterName=users.findById(invitation.getInviterId()).map(UserEntity::getNickname).orElse("我们");
        String acceptorName=users.findById(actorId).map(UserEntity::getNickname).orElse("我们");
        CoupleSpaceEntity couple=couples.save(new CoupleSpaceEntity(invitation.getInviterId(),actorId,inviterName+"与"+acceptorName));
        members.save(new ActiveCoupleMemberEntity(invitation.getInviterId(),couple.getId()));members.save(new ActiveCoupleMemberEntity(actorId,couple.getId()));members.flush();
        invitation.accept(actorId);idempotency.putIfAbsent(replayKey,couple.getId().toString(),Duration.ofHours(48));return couple;
    }

    @Transactional
    public void revoke(UUID actorId,UUID invitationId){InvitationEntity invitation=invitations.findById(invitationId).orElseThrow(()->notFound());if(!invitation.getInviterId().equals(actorId))throw forbidden();if(invitation.getStatus()==DomainEnums.InvitationStatus.ACTIVE)invitation.revoke();}

    @Transactional(readOnly=true)
    public Optional<CoupleSpaceEntity> current(UUID actorId){return members.findById(actorId).flatMap(m->couples.findById(m.getCoupleId()));}

    @Transactional
    public CoupleSpaceEntity update(UUID actorId,int version,String name,LocalDate anniversary){CoupleSpaceEntity couple=requireCurrentLocked(actorId);if(couple.getVersion()!=version)throw versionConflict(couple.getVersion());couple.update(name,anniversary);return couple;}

    @Transactional
    public CoupleSpaceEntity unbind(UUID actorId,int version,String confirmText,String idempotencyKey){if(!"确认解绑".equals(confirmText))throw new ApiException(HttpStatus.BAD_REQUEST,"CONFIRM_TEXT_MISMATCH","请输入“确认解绑”。");String key=Hashing.sha256(actorId+":unbind:"+idempotencyKey);Optional<String> replay=idempotency.get(key);if(replay.isPresent())return couples.findById(UUID.fromString(replay.get())).orElseThrow(()->notFound());CoupleSpaceEntity couple=requireCurrentLocked(actorId);if(couple.getVersion()!=version)throw versionConflict(couple.getVersion());couple.freeze();members.deleteByCoupleId(couple.getId());idempotency.putIfAbsent(key,couple.getId().toString(),Duration.ofHours(48));return couple;}

    private InvitationEntity activeInvitation(String token,boolean lock){InvitationEntity invitation=(lock?invitations.findByTokenHashLocked(Hashing.sha256(token)):invitations.findByTokenHash(Hashing.sha256(token))).orElseThrow(()->new ApiException(HttpStatus.CONFLICT,"INVITATION_NOT_ACTIVE","这份邀请已失效，请重新邀请。"));if(invitation.getStatus()!=DomainEnums.InvitationStatus.ACTIVE)throw new ApiException(HttpStatus.CONFLICT,"INVITATION_NOT_ACTIVE","这份邀请已失效，请重新邀请。");if(invitation.getExpiresAt().isBefore(Instant.now())){invitation.expire();throw new ApiException(HttpStatus.CONFLICT,"INVITATION_NOT_ACTIVE","这份邀请已过期，请重新邀请。");}return invitation;}
    private void ensureUnpaired(UUID userId){if(members.existsById(userId))throw new ApiException(HttpStatus.CONFLICT,"COUPLE_ALREADY_ACTIVE","当前账号已有有效情侣空间。");}
    private CoupleSpaceEntity requireCurrentLocked(UUID actorId){UUID coupleId=members.findById(actorId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"COUPLE_NOT_FOUND","当前没有有效情侣空间。")).getCoupleId();return couples.findLocked(coupleId).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"COUPLE_NOT_FOUND","当前没有有效情侣空间。"));}
    private ApiException versionConflict(int current){return new ApiException(HttpStatus.CONFLICT,"VERSION_CONFLICT","内容已在另一台设备更新，请刷新后重试。",Map.of("current_version",current));}
    private ApiException forbidden(){return new ApiException(HttpStatus.FORBIDDEN,"RESOURCE_FORBIDDEN","内容不存在或当前不可访问。");}
    private ApiException notFound(){return new ApiException(HttpStatus.NOT_FOUND,"RESOURCE_NOT_FOUND","内容不存在或当前不可访问。");}
    public record CreatedInvitation(InvitationEntity invitation,String token){}
    public record InvitationPreview(UUID invitationId,String inviterNickname,Instant expiresAt){}
}
