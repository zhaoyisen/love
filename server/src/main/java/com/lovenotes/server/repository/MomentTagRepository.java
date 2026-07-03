package com.lovenotes.server.repository;
import com.lovenotes.server.domain.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface MomentTagRepository extends JpaRepository<MomentTagEntity, MomentTagId> { List<MomentTagEntity> findByIdMomentId(UUID momentId); void deleteByIdMomentId(UUID momentId); }
