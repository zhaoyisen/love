package com.lovenotes.server.admin;

import com.lovenotes.server.common.*;
import com.lovenotes.server.admin.AdminRecords.RecordVersion;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/internal/admin")
public class AdminController {
    private final AdminSession sessions;
    private final AdminRecords records;
    private final AdminMediaTasks tasks;
    public AdminController(AdminSession sessions,AdminRecords records,AdminMediaTasks tasks) {this.sessions=sessions;this.records=records;this.tasks=tasks;}
    @PostMapping("/session")
    ApiResponse<?> login(@Valid @RequestBody Login body,HttpServletRequest request) {return ok(Map.of("operator",sessions.login(request,body.token().trim(),body.operator().trim())),request);}
    @GetMapping("/session")
    ApiResponse<?> session(HttpServletRequest request) {return ok(Map.of("operator",sessions.require(request)),request);}
    @DeleteMapping("/session")
    ApiResponse<?> logout(HttpServletRequest request) {sessions.logout(request);return ok(Map.of("logged_out",true),request);}
    @GetMapping("/accounts")
    ApiResponse<?> accounts(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,HttpServletRequest request) {
        sessions.require(request);if(q.length()>100)throw AdminRecords.invalid("搜索内容过长。");return ok(records.accounts(q,page,size),request);
    }
    @GetMapping("/records")
    ApiResponse<?> records(@RequestParam("account_id") UUID account,@RequestParam(defaultValue="ALL") String type,@RequestParam(defaultValue="ALL") String issue,@RequestParam(defaultValue="ALL") String hidden,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,HttpServletRequest request) {
        sessions.require(request);return ok(records.list(account,type,issue,hidden,page,size),request);
    }
    @GetMapping("/records/{id}")
    ApiResponse<?> record(@PathVariable UUID id,@RequestParam("account_id") UUID account,HttpServletRequest request) {sessions.require(request);return ok(records.detail(account,id),request);}
    @PostMapping("/records/visibility")
    ApiResponse<?> visibility(@Valid @RequestBody Visibility body,HttpServletRequest request) {
        String operator=sessions.require(request);return ok(records.visibility(body.accountId(),body.records(),body.hidden(),operator,RequestContext.requestId(request)),request);
    }
    @PostMapping("/tasks")
    ApiResponse<?> createTask(@Valid @RequestBody Task body,HttpServletRequest request) {
        String operator=sessions.require(request);return ok(tasks.create(body.id(),body.accountId(),body.action(),body.momentIds(),operator,RequestContext.requestId(request)),request);
    }
    @GetMapping("/tasks")
    ApiResponse<?> tasks(@RequestParam("account_id") UUID account,@RequestParam(defaultValue="0") int page,HttpServletRequest request) {sessions.require(request);return ok(tasks.list(account,page),request);}
    @GetMapping("/tasks/{id}")
    ApiResponse<?> task(@PathVariable UUID id,@RequestParam("account_id") UUID account,HttpServletRequest request) {sessions.require(request);return ok(tasks.detail(account,id),request);}
    private ApiResponse<?> ok(Object value,HttpServletRequest request) {return ApiResponse.ok(value,RequestContext.requestId(request));}
    public record Login(@NotBlank @Size(max=512) String token,@NotBlank @Size(max=60) String operator) {}
    public record Visibility(@NotNull UUID accountId,@NotNull Boolean hidden,@NotEmpty @Size(max=500) List<@NotNull @Valid RecordVersion> records) {}
    public record Task(@NotNull UUID id,@NotNull UUID accountId,@NotBlank String action,@NotNull @Size(max=500) List<@NotNull UUID> momentIds) {}
}
