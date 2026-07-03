package com.lovenotes.server.repository;
import com.lovenotes.server.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.*;
public interface InvitationRepository extends JpaRepository<InvitationEntity, UUID> {
    Optional<InvitationEntity> findFirstByInviterIdAndStatusOrderByCreatedAtDesc(UUID inviterId, DomainEnums.InvitationStatus status);
    Optional<InvitationEntity> findByTokenHash(String tokenHash);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select i from InvitationEntity i where i.tokenHash=:hash") Optional<InvitationEntity> findByTokenHashLocked(@Param("hash") String hash);
}
