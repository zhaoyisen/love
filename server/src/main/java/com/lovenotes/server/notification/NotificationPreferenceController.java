package com.lovenotes.server.notification;

import com.lovenotes.server.auth.Actor;
import com.lovenotes.server.auth.AuthFilter;
import com.lovenotes.server.common.ApiResponse;
import com.lovenotes.server.common.RequestContext;
import com.lovenotes.server.domain.NotificationPreferenceEntity;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class NotificationPreferenceController {
    private final NotificationPreferenceService service;

    public NotificationPreferenceController(NotificationPreferenceService service) { this.service = service; }

    @GetMapping("/me/notification-preferences")
    ApiResponse<PreferenceView> current(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor, HttpServletRequest request) {
        return ApiResponse.ok(PreferenceView.from(service.current(actor.userId())), RequestContext.requestId(request));
    }

    @PatchMapping("/me/notification-preferences")
    ApiResponse<PreferenceView> update(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
                                       @Valid @RequestBody UpdatePreferenceRequest body, HttpServletRequest request) {
        return ApiResponse.ok(PreferenceView.from(service.update(actor.userId(), body.momentNotice(), body.reactionNotice(),
                body.petNotice(), body.recapNotice())), RequestContext.requestId(request));
    }

    public record UpdatePreferenceRequest(@NotNull Boolean momentNotice, @NotNull Boolean reactionNotice,
                                          @NotNull Boolean petNotice, @NotNull Boolean recapNotice) {}
    public record PreferenceView(boolean momentNotice, boolean reactionNotice, boolean petNotice, boolean recapNotice) {
        static PreferenceView from(NotificationPreferenceEntity value) {
            return new PreferenceView(value.isMomentNotice(), value.isReactionNotice(), value.isPetNotice(), value.isRecapNotice());
        }
    }
}
