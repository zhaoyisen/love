package com.lovenotes.server.admin;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class AdminPage {
    @GetMapping("/admin")
    String redirect() {return "redirect:/admin/";}
    @GetMapping("/admin/")
    String index() {return "forward:/admin/index.html";}
}
