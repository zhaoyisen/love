package com.lovenotes.server.auth;
public interface WechatIdentityProvider { Identity exchange(String code); record Identity(String subject, String nickname) {} }
