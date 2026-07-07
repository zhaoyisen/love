package com.lovenotes.server.user;

import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.domain.UserEntity;
import com.lovenotes.server.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class UserProfileService {
    private final UserRepository users;

    public UserProfileService(UserRepository users) {
        this.users = users;
    }

    @Transactional
    public UserEntity updateNickname(UUID userId, String nickname) {
        UserEntity user = users.findById(userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.UNAUTHORIZED,
                        "SESSION_EXPIRED",
                        "登录状态已失效，请重新登录。"));
        user.setNickname(nickname.trim());
        return users.save(user);
    }
}
