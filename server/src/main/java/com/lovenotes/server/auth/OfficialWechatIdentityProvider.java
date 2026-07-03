package com.lovenotes.server.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.config.LoveNotesProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component @Profile("prod")
public class OfficialWechatIdentityProvider implements WechatIdentityProvider {
    private final LoveNotesProperties properties;
    private final RestClient client = RestClient.create();
    public OfficialWechatIdentityProvider(LoveNotesProperties properties) { this.properties = properties; }
    public Identity exchange(String code) {
        SessionResponse response;
        try {
            response = client.get().uri(properties.wechat().sessionUrl(), builder -> builder
                    .queryParam("appid", properties.wechat().appId()).queryParam("secret", properties.wechat().appSecret())
                    .queryParam("js_code", code).queryParam("grant_type", "authorization_code").build()).retrieve().body(SessionResponse.class);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PROVIDER_UNAVAILABLE", "微信登录服务暂时不可用，请稍后重试。");
        }
        if (response == null || response.openid == null || response.errcode != null) throw new ApiException(HttpStatus.UNAUTHORIZED, "WECHAT_CODE_INVALID", "微信登录凭证已失效，请重试。");
        return new Identity("wechat-mini:" + response.openid, "微信用户");
    }
    private static class SessionResponse {
        public String openid;
        public String unionid;
        public Integer errcode;
        @JsonProperty("errmsg") public String errorMessage;
    }
}
