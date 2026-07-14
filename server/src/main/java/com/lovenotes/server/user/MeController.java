package com.lovenotes.server.user;

import com.lovenotes.server.auth.Actor;
import com.lovenotes.server.auth.AuthFilter;
import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.common.ApiResponse;
import com.lovenotes.server.common.RequestContext;
import com.lovenotes.server.couple.CoupleService;
import com.lovenotes.server.domain.UserEntity;
import com.lovenotes.server.media.MediaService;
import com.lovenotes.server.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class MeController {
    private final UserRepository users;
    private final CoupleService couples;
    private final UserProfileService profiles;
    private final MediaService media;

    public MeController(UserRepository users, CoupleService couples, UserProfileService profiles, MediaService media) {
        this.users = users;
        this.couples = couples;
        this.profiles = profiles;
        this.media = media;
    }

    @GetMapping("/me")
    ApiResponse<MeResponse> me(
            @RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
            HttpServletRequest request) {
        UserEntity user = findUser(actor.userId());
        return ApiResponse.ok(response(user), RequestContext.requestId(request));
    }

    @PatchMapping("/me")
    ApiResponse<MeResponse> update(
            @RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
            @Valid @RequestBody UpdateMeRequest body,
            HttpServletRequest request) {
        UserEntity user = profiles.updateProfile(actor.userId(), body.nickname(), body.avatarAssetId());
        return ApiResponse.ok(response(user), RequestContext.requestId(request));
    }

    private UserEntity findUser(UUID userId) {
        return users.findById(userId).orElseThrow(() -> new ApiException(
                HttpStatus.UNAUTHORIZED,
                "SESSION_EXPIRED",
                "登录状态已失效，请重新登录。"));
    }

    private MeResponse response(UserEntity user) {
        var couple = couples.current(user.getId()).orElse(null);
        String avatarUrl = null;
        String avatarStatus = null;
        if (user.getAvatarMediaId() != null) {
            var avatar = media.getAuthorized(user.getId(), user.getAvatarMediaId());
            avatarUrl = media.accessUrlIfReady(user.getId(), avatar);
            avatarStatus = avatar.getStatus().name();
        }
        return new MeResponse(
                user.getId(),
                user.getNickname(),
                user.getAvatarMediaId(),
                avatarUrl,
                avatarStatus,
                couple == null ? null : couple.getId(),
                couple == null ? "UNPAIRED" : couple.getStatus().name());
    }

    public record UpdateMeRequest(
            @NotBlank(message = "昵称不能为空")
            @Size(max = 30, message = "昵称最多 30 个字符")
            @Pattern(regexp = "[^\\r\\n\\t]+", message = "昵称不能包含换行或制表符")
            String nickname,
            UUID avatarAssetId) {}

    public record MeResponse(UUID id, String nickname, UUID avatarAssetId, String avatarUrl,
                             String avatarStatus, UUID coupleId, String relationshipStatus) {}
}
