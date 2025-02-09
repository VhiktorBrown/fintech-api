import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { BvnDto, NinDto, PersonalInfoDto, RegisterDto, TransactionPinDto } from "./dto";
import { SignInDto } from "./dto/sign-in.dto";
import { JwtGuard } from "./guard";
import { GetUser } from "./decorator";

@Controller('auth')
export class AuthController {
     constructor(private authService: AuthService){}

     @Post('login')
     async login(@Body() dto: SignInDto){
        return this.authService.login(dto);
     }

     @Post('register')
     async register(@Body() dto: RegisterDto){
        return this.authService.register(dto);
     }

     @UseGuards(JwtGuard)
     @Post('save-personal-info')
     async savePersonalInfo(
      @GetUser('id') userId: number,
      @Body() dto: PersonalInfoDto){
      return this.authService.setPersonalInfo(
         userId,
         dto);
     }

     @UseGuards(JwtGuard)
     @Post('validate-bvn')
     async enterBvn(
      @GetUser('id') userId: number,
      @Body() dto: BvnDto){
      return this.authService.setBvn(
         userId,
         dto);
     }

     @UseGuards(JwtGuard)
     @Post('validate-nin')
     async enterNin(
      @GetUser('id') userId: number,
      @Body() dto: NinDto){
      return this.authService.setNin(
         userId,
         dto);
     }
     
     @UseGuards(JwtGuard)
     @Post('set-transaction-pin')
     async saveTransactionPin(
      @GetUser('id') userId: number,
      @Body() dto: TransactionPinDto){
      return this.authService.setTransactionPin(
         userId,
         dto);
     }
}