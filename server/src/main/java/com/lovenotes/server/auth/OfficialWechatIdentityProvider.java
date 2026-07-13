package com.lovenotes.server.auth;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.config.LoveNotesProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component @Profile("prod")
public class OfficialWechatIdentityProvider implements WechatIdentityProvider {
    private static final Logger log = LoggerFactory.getLogger(OfficialWechatIdentityProvider.class);

    private final LoveNotesProperties properties;
    private final RestClient client;
    private final ObjectMapper mapper;

    public OfficialWechatIdentityProvider(
            LoveNotesProperties properties,
            RestClient.Builder clientBuilder,
            ObjectMapper mapper
    ) {
        this.properties = properties;
        this.client = clientBuilder.build();
        this.mapper = mapper;
    }

    public Identity exchange(String code) {
        SessionResponse response;
        try {
            String body = client.get().uri(properties.wechat().sessionUrl(), builder -> builder
                    .queryParam("appid", properties.wechat().appId()).queryParam("secret", properties.wechat().appSecret())
                    .queryParam("js_code", code).queryParam("grant_type", "authorization_code").build()).retrieve().body(String.class);
            response = mapper.readValue(body, SessionResponse.class);
        } catch (Exception exception) {
            log.warn("WeChat jscode2session failed: exceptionType={}, causeType={}",
                    exception.getClass().getSimpleName(), rootCauseType(exception));
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PROVIDER_UNAVAILABLE", "微信登录服务暂时不可用，请稍后重试。");
        }

        if (response.openid() == null || response.errcode() != null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "WECHAT_CODE_INVALID", "微信登录凭证已失效，请重试。");
        }
        return new Identity("wechat-mini:" + response.openid(), "微信用户");
    }

    private static String rootCauseType(Exception exception) {
        Throwable cause = exception;
        while (cause.getCause() != null && cause.getCause() != cause) cause = cause.getCause();
        return cause.getClass().getSimpleName();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record SessionResponse(
            String openid,
            String unionid,
            Integer errcode,
            @JsonProperty("errmsg") String errorMessage
    ) {}
}
