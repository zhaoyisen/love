package com.lovenotes.server.repository;
import com.lovenotes.server.domain.UploadSessionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
public interface UploadSessionRepository extends JpaRepository<UploadSessionEntity, UUID> {}
