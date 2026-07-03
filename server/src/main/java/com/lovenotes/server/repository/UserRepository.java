package com.lovenotes.server.repository;
import com.lovenotes.server.domain.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface UserRepository extends JpaRepository<UserEntity, UUID> { Optional<UserEntity> findByWxRefHash(String wxRefHash); }
