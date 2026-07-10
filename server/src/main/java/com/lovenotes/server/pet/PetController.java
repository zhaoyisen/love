package com.lovenotes.server.pet;

import com.lovenotes.server.auth.*;
import com.lovenotes.server.common.*;
import com.lovenotes.server.domain.DomainEnums;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.*;

@RestController
public class PetController {
    private final PetService service;
    public PetController(PetService service) { this.service = service; }

    @GetMapping("/pet/current")
    ApiResponse<PetService.PetView> current(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
                                            HttpServletRequest request) {
        return ApiResponse.ok(service.current(actor.userId()), RequestContext.requestId(request));
    }

    @PostMapping("/pet/current/actions")
    ApiResponse<PetService.PetActionResult> act(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
                                                @RequestHeader("Idempotency-Key") String key,
                                                @Valid @RequestBody PetActionRequest body,
                                                HttpServletRequest request) {
        return ApiResponse.ok(service.act(actor.userId(), body.action(), key), RequestContext.requestId(request));
    }

    public record PetActionRequest(@NotNull DomainEnums.PetAction action) {}
}
