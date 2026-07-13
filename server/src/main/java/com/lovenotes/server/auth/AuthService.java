package com.lovenotes.server.auth;

import com.lovenotes.server.common.*;
import com.lovenotes.server.domain.*;
import com.lovenotes.server.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final WechatIdentityProvider identities;
    private final UserRepository users;
    private final SessionService sessions;
    public AuthService(WechatIdentityProvider identities, UserRepository users, SessionService sessions) { this.identities=identities; this.users=users; this.sessions=sessions; }

    @Transactional
    public LoginResult login(String code) {
        var identity=identities.exchange(code);
        String hash=Hashing.sha256(identity.subject());
        UserEntity user=users.findByWxRefHash(hash).orElseGet(()->users.save(new UserEntity(hash,null,identity.nickname())));
        if(user.getStatus()!= DomainEnums.UserStatus.ACTIVE) throw new ApiException(HttpStatus.FORBIDDEN,"USER_DISABLED","当前账号不可用。");
        return new LoginResult(user,sessions.issue(user));
    }

    @Transactional(readOnly=true)
    public LoginResult refresh(String refreshToken) {
        var subject=sessions.resolveRefresh(refreshToken);
        if(subject==null) throw new ApiException(HttpStatus.UNAUTHORIZED,"SESSION_EXPIRED","登录状态已失效，请重新登录。");
        UserEntity user=users.findById(subject.userId()).orElseThrow(()->new ApiException(HttpStatus.UNAUTHORIZED,"SESSION_EXPIRED","登录状态已失效，请重新登录。"));
        if(user.getStatus()!= DomainEnums.UserStatus.ACTIVE) throw new ApiException(HttpStatus.UNAUTHORIZED,"SESSION_EXPIRED","登录状态已失效，请重新登录。");
        var tokens=sessions.rotate(refreshToken,user);
        if(tokens==null) throw new ApiException(HttpStatus.UNAUTHORIZED,"SESSION_EXPIRED","登录状态已失效，请重新登录。");
        return new LoginResult(user,tokens);
    }
    public record LoginResult(UserEntity user, SessionService.Tokens tokens) {}
}
