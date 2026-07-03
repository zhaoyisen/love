package com.lovenotes.server.repository;
import com.lovenotes.server.domain.ActiveCoupleMemberEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface ActiveCoupleMemberRepository extends JpaRepository<ActiveCoupleMemberEntity, UUID> { List<ActiveCoupleMemberEntity> findByCoupleId(UUID coupleId); void deleteByCoupleId(UUID coupleId); }
