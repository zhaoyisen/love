package com.lovenotes.server.message;

import com.lovenotes.server.auth.*;
import com.lovenotes.server.common.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
public class MessageController {
    private final MessageService service;
    public MessageController(MessageService service) { this.service = service; }

    @GetMapping("/messages")
    ApiResponse<MessageService.MessagePage> list(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
                                                 @RequestParam(defaultValue = "50") int limit,
                                                 HttpServletRequest request) {
        return ApiResponse.ok(service.list(actor.userId(), limit), RequestContext.requestId(request));
    }

    @PostMapping("/messages/{id}/read")
    ApiResponse<MessageService.MessageView> markRead(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
                                                     @PathVariable UUID id,
                                                     HttpServletRequest request) {
        return ApiResponse.ok(service.markRead(actor.userId(), id), RequestContext.requestId(request));
    }

    @PostMapping("/messages/read-all")
    ApiResponse<MessageService.MarkAllReadResult> markAllRead(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
                                                              HttpServletRequest request) {
        return ApiResponse.ok(new MessageService.MarkAllReadResult(service.markAllRead(actor.userId())), RequestContext.requestId(request));
    }
}
