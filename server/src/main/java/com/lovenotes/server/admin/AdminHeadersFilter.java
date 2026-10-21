package com.lovenotes.server.admin;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE+5)
public class AdminHeadersFilter extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        String path=request.getRequestURI().substring(request.getContextPath().length());
        if(path.equals("/admin")||path.startsWith("/admin/")||path.startsWith("/internal/admin/")) {
            response.setHeader("Cache-Control","no-store");response.setHeader("Referrer-Policy","no-referrer");
            response.setHeader("X-Content-Type-Options","nosniff");response.setHeader("X-Frame-Options","DENY");
            response.setHeader("X-Robots-Tag","noindex, nofollow");
            response.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; media-src 'self' https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
        }
        chain.doFilter(request,response);
    }
}
