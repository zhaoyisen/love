package com.lovenotes.server.auth;

import com.lovenotes.server.common.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/auth")
public class AuthController {
    private final AuthService service;
    public AuthController(AuthService service){this.service=service;}

    @PostMapping("/wechat/session")
    ResponseEntity<ApiResponse<LoginResponse>> login(@Valid @RequestBody LoginRequest body,HttpServletRequest request){
        var result=service.login(body.code());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(LoginResponse.from(result),RequestContext.requestId(request)));
    }
    @PostMapping("/refresh")
    ApiResponse<LoginResponse> refresh(@Valid @RequestBody RefreshRequest body,HttpServletRequest request){return ApiResponse.ok(LoginResponse.from(service.refresh(body.refreshToken())),RequestContext.requestId(request));}

    public record LoginRequest(@NotBlank String code){}
    public record RefreshRequest(@NotBlank String refreshToken){}
    public record LoginResponse(UUID userId,String nickname,String accessToken,String refreshToken,long expiresIn){
        static LoginResponse from(AuthService.LoginResult result){return new LoginResponse(result.user().getId(),result.user().getNickname(),result.tokens().accessToken(),result.tokens().refreshToken(),result.tokens().expiresIn());}
    }
}
