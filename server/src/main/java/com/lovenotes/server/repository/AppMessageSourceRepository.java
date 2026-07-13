package com.lovenotes.server.repository;
import com.lovenotes.server.domain.AppMessageSourceEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface AppMessageSourceRepository extends JpaRepository<AppMessageSourceEntity,UUID>{
 List<AppMessageSourceEntity> findBySourceId(UUID sourceId); boolean existsByMessageId(UUID messageId); void deleteByMessageIdAndSourceId(UUID messageId,UUID sourceId);
}
