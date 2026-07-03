package com.lovenotes.server.repository;
import com.lovenotes.server.domain.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.*;
public interface MomentRepository extends JpaRepository<MomentEntity, UUID> {
    @Query("select m from MomentEntity m where m.status=com.lovenotes.server.domain.DomainEnums$MomentStatus.PUBLISHED and m.occurredAt between :from and :to and (m.authorId=:actor or (m.coupleId=:couple and m.visibility=com.lovenotes.server.domain.DomainEnums$Visibility.SHARED)) order by m.occurredAt desc, m.createdAt desc, m.id desc")
    List<MomentEntity> timeline(@Param("actor") UUID actor, @Param("couple") UUID couple, @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);
    @Query("select m from MomentEntity m where m.status=com.lovenotes.server.domain.DomainEnums$MomentStatus.PUBLISHED and m.occurredAt between :from and :to and m.authorId=:actor order by m.occurredAt desc, m.createdAt desc, m.id desc")
    List<MomentEntity> personalTimeline(@Param("actor") UUID actor, @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);
}
