package com.lovenotes.server.recap;

import com.lovenotes.server.auth.*;
import com.lovenotes.server.common.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

@RestController
public class RecapController {
    private final RecapService service;
    public RecapController(RecapService service) { this.service = service; }

    @GetMapping("/recaps/current")
    ApiResponse<RecapService.RecapView> current(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
                                                @RequestParam(required = false) Integer year,
                                                HttpServletRequest request) {
        return ApiResponse.ok(service.current(actor.userId(), yearOrCurrent(year)), RequestContext.requestId(request));
    }

    @GetMapping("/recaps/current/candidates")
    ApiResponse<RecapService.CandidatePage> candidates(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
                                                       @RequestParam(required = false) Integer year,
                                                       HttpServletRequest request) {
        return ApiResponse.ok(service.candidates(actor.userId(), yearOrCurrent(year)), RequestContext.requestId(request));
    }

    @PatchMapping("/recaps/current")
    ApiResponse<RecapService.RecapView> update(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
                                               @Valid @RequestBody UpdateRecapRequest body,
                                               HttpServletRequest request) {
        return ApiResponse.ok(service.update(actor.userId(), yearOrCurrent(body.year()), body.title(), body.selectedMomentIds()), RequestContext.requestId(request));
    }

    @PostMapping("/recaps/current/generate")
    ApiResponse<RecapService.RecapView> generate(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,
                                                 @Valid @RequestBody GenerateRecapRequest body,
                                                 HttpServletRequest request) {
        return ApiResponse.ok(service.generate(actor.userId(), yearOrCurrent(body.year())), RequestContext.requestId(request));
    }

    private int yearOrCurrent(Integer year) { return year == null ? LocalDate.now().getYear() : year; }
    public record UpdateRecapRequest(@Min(2000) Integer year, @Size(max = 30) List<UUID> selectedMomentIds, @Size(max = 30) String title) {}
    public record GenerateRecapRequest(@Min(2000) Integer year) {}
}
