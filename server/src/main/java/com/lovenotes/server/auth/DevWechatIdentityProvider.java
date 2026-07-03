package com.lovenotes.server.auth;
import com.lovenotes.server.common.ApiException;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
@Component @Profile({"dev","test"})
public class DevWechatIdentityProvider implements WechatIdentityProvider {
    public Identity exchange(String code) {
        if (code == null || code.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "登录 code 不能为空。");
        String suffix = code.length() <= 6 ? code : code.substring(code.length() - 6);
        return new Identity("dev:" + code, "用户" + suffix);
    }
}
