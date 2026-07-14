package com.lovenotes.server.user;

import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.domain.UserEntity;
import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.repository.MediaAssetRepository;
import com.lovenotes.server.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class UserProfileService {
    private final UserRepository users;
    private final MediaAssetRepository assets;

    public UserProfileService(UserRepository users, MediaAssetRepository assets) {
        this.users = users;
        this.assets = assets;
    }

    @Transactional
    public UserEntity updateProfile(UUID userId, String nickname, UUID avatarMediaId) {
        UserEntity user = users.findById(userId)
                .orElseThrow(() -> new ApiException(
                        HttpStatus.UNAUTHORIZED,
                        "SESSION_EXPIRED",
                        "登录状态已失效，请重新登录。"));
        user.setNickname(nickname.trim());
        if (avatarMediaId != null && !avatarMediaId.equals(user.getAvatarMediaId())) {
            var avatar = assets.findById(avatarMediaId).orElseThrow(() -> new ApiException(
                    HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "所选头像不存在或已经失效。"));
            if (!avatar.getUploaderId().equals(userId)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "RESOURCE_FORBIDDEN", "不能使用其他用户上传的头像。");
            }
            if (avatar.getKind() != DomainEnums.MediaKind.IMAGE) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "头像必须是图片。");
            }
            if (avatar.getStatus() != DomainEnums.MediaStatus.READY
                    && avatar.getStatus() != DomainEnums.MediaStatus.PROCESSING) {
                throw new ApiException(HttpStatus.CONFLICT, "MEDIA_NOT_READY", "头像尚未上传完成，请重新选择。 ");
            }
            if (user.getAvatarMediaId() != null) {
                assets.findById(user.getAvatarMediaId()).ifPresent(previous -> previous.markProfileAvatar(false));
            }
            avatar.markProfileAvatar(true);
            user.setAvatarMediaId(avatarMediaId);
        }
        return users.save(user);
    }
}
