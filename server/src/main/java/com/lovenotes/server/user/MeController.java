package com.lovenotes.server.user;
import com.lovenotes.server.auth.*;
import com.lovenotes.server.common.*;
import com.lovenotes.server.couple.CoupleService;
import com.lovenotes.server.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController
public class MeController {
    private final UserRepository users;private final CoupleService couples;
    public MeController(UserRepository users,CoupleService couples){this.users=users;this.couples=couples;}
    @GetMapping("/me") ApiResponse<MeResponse> me(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor,HttpServletRequest request){var user=users.findById(actor.userId()).orElseThrow(()->new ApiException(HttpStatus.UNAUTHORIZED,"SESSION_EXPIRED","登录状态已失效，请重新登录。"));var couple=couples.current(actor.userId()).orElse(null);return ApiResponse.ok(new MeResponse(user.getId(),user.getNickname(),couple==null?null:couple.getId(),couple==null?"UNPAIRED":couple.getStatus().name()),RequestContext.requestId(request));}
    public record MeResponse(UUID id,String nickname,UUID coupleId,String relationshipStatus){}
}
