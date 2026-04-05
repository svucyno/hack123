import { Controller, Get } from "@nestjs/common";

@Controller()
export class RootController {
  @Get("health")
  getHealth() {
    return {
      status: "ok",
      service: "smart-farmer-api",
    };
  }
}
